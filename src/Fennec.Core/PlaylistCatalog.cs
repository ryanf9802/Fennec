namespace Fennec.Core;

public static class PlaylistCatalog
{
    private static readonly IReadOnlyDictionary<int, (string Name, PlaylistCategory Category)> Entries =
        new Dictionary<int, (string, PlaylistCategory)>
        {
            [1] = ("Duel", PlaylistCategory.Casual),
            [2] = ("Doubles", PlaylistCategory.Casual),
            [3] = ("Standard", PlaylistCategory.Casual),
            [4] = ("Chaos", PlaylistCategory.Casual),
            [6] = ("Private", PlaylistCategory.Private),
            [11] = ("Ranked Duel", PlaylistCategory.Ranked),
            [12] = ("Ranked Doubles", PlaylistCategory.Ranked),
            [13] = ("Ranked Standard", PlaylistCategory.Ranked),
            [27] = ("Hoops", PlaylistCategory.Casual),
            [28] = ("Rumble", PlaylistCategory.Casual),
            [29] = ("Dropshot", PlaylistCategory.Casual),
            [30] = ("Snow Day", PlaylistCategory.Casual),
            [34] = ("Tournament", PlaylistCategory.Ranked)
        };

    public static (string Name, PlaylistCategory Category) Resolve(int id) =>
        Entries.TryGetValue(id, out var entry)
            ? entry
            : ($"Playlist {id}", PlaylistCategory.Unknown);
}
