namespace NeuroYogic.Domain.Entities;

/// <summary>
/// An admin-managed contemplative-practice type (e.g. Dhyāna, Japa) offered in
/// the session "practice" picker. Global vocabulary — not per-instructor.
/// </summary>
public sealed class ActivityType
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public bool Archived { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
