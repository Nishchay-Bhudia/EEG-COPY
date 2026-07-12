using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json.Serialization;
using NeuroYogic.Api.Contracts;
using NeuroYogic.Api.Infrastructure;
using NeuroYogic.Api.Services;
using NeuroYogic.Infrastructure.Services;

namespace NeuroYogic.Api.Controllers;

/// <summary>AI Baba — conversational insight over a session's epochs. Port of the
/// eeg-ui /ai routes; the analysis LLM is Groq (see <see cref="GroqChatService"/>).</summary>
[ApiController]
[Route("ai")]
[Authorize]
public sealed class AiController : ControllerBase
{
    private readonly IChatService _chat;
    private readonly ISessionService _sessions;

    public AiController(IChatService chat, ISessionService sessions)
    {
        _chat = chat;
        _sessions = sessions;
    }

    [HttpGet("health")]
    [Authorize(Policy = "RequireAdmin")]
    public IActionResult Health() => Ok(new { groqConfigured = _chat.Configured });

    [HttpGet("sessions")]
    public async Task<IActionResult> Sessions(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var sessions = await _sessions.ListForUserAsync(userId.Value, 100, ct);
        return Ok(sessions.Select(HubSessionDto.From));
    }

    [HttpPost("start")]
    public async Task<IActionResult> Start([FromBody] AiStartRequest req, CancellationToken ct)
    {
        if (!_chat.Configured) return StatusCode(503, new { error = "AI Baba is not configured — set Groq:ApiKey." });
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var session = await _sessions.GetAsync(req.SessionId, userId.Value, includeRecords: false, ct);
        if (session is null) return NotFound(new { error = "Session not found" });
        var epochs = await _sessions.GetEpochsAsync(req.SessionId, userId.Value, ct) ?? Array.Empty<Domain.Entities.AnalysisRecord>();

        var context = AiPrompts.BuildContext(session, epochs);
        var messages = new List<ChatMessage>
        {
            new("system", AiPrompts.SystemPrompt),
            new("user", $"{context}\n\nGreet me and give a one-paragraph summary of this session."),
        };
        var summary = await _chat.CompleteAsync(messages, 0.7, 450, ct);
        return Ok(new { summary });
    }

    [HttpPost("chat")]
    public async Task<IActionResult> Chat([FromBody] AiChatRequest req, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var message = (req.Message ?? string.Empty).Trim();
        if (message.Length == 0) return BadRequest(new { error = "Message cannot be empty" });
        if (message.Length > 600) return BadRequest(new { error = "Message too long (max 600 chars)" });

        // Fast off-topic path — canned reply, no LLM (works even without a key).
        if (!AiPrompts.IsEegRelated(message))
            return Ok(new { reply = AiPrompts.OffTopicReply });

        if (!_chat.Configured) return StatusCode(503, new { error = "AI Baba is not configured — set Groq:ApiKey." });

        var session = await _sessions.GetAsync(req.SessionId, userId.Value, includeRecords: false, ct);
        if (session is null) return NotFound(new { error = "Session not found" });
        var epochs = await _sessions.GetEpochsAsync(req.SessionId, userId.Value, ct) ?? Array.Empty<Domain.Entities.AnalysisRecord>();

        var messages = new List<ChatMessage>
        {
            new("system", $"{AiPrompts.SystemPrompt}\n\n{AiPrompts.BuildContext(session, epochs)}"),
        };
        // Sanitised history — last 20 turns, capped length.
        foreach (var h in (req.History ?? new List<AiHistoryItem>()).TakeLast(20))
        {
            if (string.IsNullOrEmpty(h.Content)) continue;
            var role = h.Role == "user" ? "user" : "assistant";
            messages.Add(new ChatMessage(role, h.Content.Length > 800 ? h.Content[..800] : h.Content));
        }
        messages.Add(new ChatMessage("user", message));

        var reply = await _chat.CompleteAsync(messages, 0.7, 450, ct);
        return Ok(new { reply });
    }
}

public sealed class AiStartRequest
{
    [JsonPropertyName("session_id")] public Guid SessionId { get; set; }
}

public sealed class AiHistoryItem
{
    [JsonPropertyName("role")] public string? Role { get; set; }
    [JsonPropertyName("content")] public string? Content { get; set; }
}

public sealed class AiChatRequest
{
    [JsonPropertyName("session_id")] public Guid SessionId { get; set; }
    [JsonPropertyName("message")] public string? Message { get; set; }
    [JsonPropertyName("history")] public List<AiHistoryItem>? History { get; set; }
}
