namespace NeuroYogic.Domain.Analysis;

/// <summary>
/// One signed Western-neuromarker witness folded under the Chitta Bhūmi label.
/// <see cref="Agrees"/> is true (corroborates the bhūmi), false (registers tension
/// with it), or null (neutral / orthogonal to it).
/// </summary>
public sealed record CorroborationAxis(string Axis, string Reading, bool? Agrees, string Note);

/// <summary>
/// Western neuromarkers folded UNDER the bhūmi as <em>signed</em> corroboration:
/// each axis either backs the śāstric label or registers tension with it, so a
/// disagreement (e.g. tāmasic dullness masquerading as sāttvic stillness) surfaces
/// rather than being hidden. <see cref="Indeterminate"/> softens the bhūmi only when
/// its key discriminating axis dissents and the classifier margin is thin — a
/// confident śāstric win is never overruled by a lone marker.
/// </summary>
public sealed record Corroboration(
    IReadOnlyList<CorroborationAxis> Axes,
    string Concord,
    bool Indeterminate,
    string Caveat);
