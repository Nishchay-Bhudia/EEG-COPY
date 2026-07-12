using Microsoft.AspNetCore.Mvc;

namespace NeuroYogic.Api.Controllers;

[ApiController]
[Route("/")]
public sealed class StatusController : ControllerBase
{
    /// <summary>Health check. The classifier is rule-based, so it is always ready.</summary>
    [HttpGet("status")]
    public IActionResult Status() => Ok(new
    {
        status = "ok",
        model_ready = true,
        board = "web-bluetooth",
        version = "3.0-dotnet",
        classifier = "rule-based (paper-derived thresholds)",
        message = "Ready.",
    });
}
