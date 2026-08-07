namespace Fennec.Core;

public static class Sessionizer
{
    public static IReadOnlyList<SessionGroup> Group(
        IEnumerable<MatchState> source,
        TimeSpan idleThreshold)
    {
        if (idleThreshold <= TimeSpan.Zero)
            throw new ArgumentOutOfRangeException(nameof(idleThreshold));

        var matches = source.OrderBy(match => match.StartedAt).ToArray();
        if (matches.Length == 0) return [];

        var sessions = new List<SessionGroup>();
        var current = new List<MatchState> { matches[0] };
        for (var index = 1; index < matches.Length; index++)
        {
            var prior = current[^1];
            var priorEnd = prior.EndedAt ?? prior.LastEventAt;
            if (matches[index].StartedAt - priorEnd >= idleThreshold)
            {
                sessions.Add(Create(current));
                current = [];
            }
            current.Add(matches[index]);
        }
        sessions.Add(Create(current));
        return sessions;
    }

    private static SessionGroup Create(IReadOnlyList<MatchState> matches)
    {
        var start = matches[0].StartedAt;
        var end = matches[^1].EndedAt ?? matches[^1].LastEventAt;
        return new SessionGroup($"{start.UtcTicks:x}-{matches[0].Id}", start, end, matches.ToArray());
    }
}
