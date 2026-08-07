namespace Fennec.Core;

public static class EncounterCalculator
{
    public static IReadOnlyList<EncounterSummary> Calculate(
        IEnumerable<MatchState> matches,
        string profilePrimaryId)
    {
        var accumulators = new Dictionary<string, Accumulator>(StringComparer.Ordinal);
        foreach (var match in matches.OrderBy(item => item.StartedAt))
        {
            var profile = match.Participants.FirstOrDefault(player => player.PrimaryId == profilePrimaryId);
            if (profile is null) continue;
            var profileWon = match.Lifecycle == MatchLifecycle.Completed &&
                match.WinnerTeamNumber == profile.TeamNumber;

            foreach (var player in match.Participants)
            {
                if (string.IsNullOrWhiteSpace(player.PrimaryId) || player.PrimaryId == profilePrimaryId) continue;
                if (!accumulators.TryGetValue(player.PrimaryId, out var accumulator))
                {
                    accumulator = new Accumulator(player.PrimaryId, player.Name, match.StartedAt);
                    accumulators.Add(player.PrimaryId, accumulator);
                }
                accumulator.Name = player.Name;
                accumulator.LastSeen = match.StartedAt;
                if (player.TeamNumber == profile.TeamNumber)
                {
                    accumulator.GamesTogether++;
                    if (match.Lifecycle == MatchLifecycle.Completed)
                    {
                        if (profileWon) accumulator.WinsTogether++;
                        else accumulator.LossesTogether++;
                    }
                }
                else
                {
                    accumulator.GamesOpposed++;
                    if (match.Lifecycle == MatchLifecycle.Completed)
                    {
                        if (profileWon) accumulator.WinsAgainst++;
                        else accumulator.LossesAgainst++;
                    }
                }
            }
        }

        return accumulators.Values
            .OrderByDescending(item => item.LastSeen)
            .Select(item => new EncounterSummary(
                item.Id, item.Name, item.GamesTogether, item.WinsTogether,
                item.LossesTogether, item.GamesOpposed, item.WinsAgainst,
                item.LossesAgainst, item.FirstSeen, item.LastSeen))
            .ToArray();
    }

    private sealed class Accumulator(string id, string name, DateTimeOffset firstSeen)
    {
        public string Id { get; } = id;
        public string Name { get; set; } = name;
        public DateTimeOffset FirstSeen { get; } = firstSeen;
        public DateTimeOffset LastSeen { get; set; } = firstSeen;
        public int GamesTogether { get; set; }
        public int WinsTogether { get; set; }
        public int LossesTogether { get; set; }
        public int GamesOpposed { get; set; }
        public int WinsAgainst { get; set; }
        public int LossesAgainst { get; set; }
    }
}
