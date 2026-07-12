namespace NeuroYogic.Domain.Entities;

/// <summary>
/// Registry of who is streaming live right now — one row per user (a user has at
/// most one live sitting). Port of the eeg-ui `live_streams` table; lets an
/// instructor discover which of their linked students is currently live.
/// </summary>
public sealed class LiveStream
{
    public Guid UserId { get; set; }        // primary key — the streaming user
    public Guid SessionId { get; set; }
    public DateTimeOffset StartedAt { get; set; }
}
