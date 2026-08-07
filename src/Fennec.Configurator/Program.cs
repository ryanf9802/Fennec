using Fennec.Core;

return Run(args);

static int Run(string[] args)
{
    try
    {
        var options = Parse(args);
        StatsApiIniEditor.Update(options.File, options.PacketRate, options.WebPort);
        return 0;
    }
    catch (Exception exception)
    {
        Console.Error.WriteLine(exception.Message);
        return 1;
    }
}

static Options Parse(IReadOnlyList<string> args)
{
    string? file = null; var rate = 2; var port = 49124;
    for (var index = 0; index < args.Count; index++)
    {
        if (index + 1 >= args.Count) throw new ArgumentException($"Missing value for {args[index]}.");
        var option = args[index]; var value = args[++index];
        switch (option)
        {
            case "--file": file = value; break;
            case "--packet-rate": rate = int.Parse(value, System.Globalization.CultureInfo.InvariantCulture); break;
            case "--web-port": port = int.Parse(value, System.Globalization.CultureInfo.InvariantCulture); break;
            default: throw new ArgumentException($"Unknown option {option}.");
        }
    }
    if (string.IsNullOrWhiteSpace(file)) throw new ArgumentException("--file is required.");
    return new Options(file, rate, port);
}

internal sealed record Options(string File, int PacketRate, int WebPort);
