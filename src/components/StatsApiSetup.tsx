export function StatsApiSetup() {
  return (
    <ol
      aria-label="Stats API setup steps"
      className="text-main mt-3 grid gap-2 text-sm"
    >
      <li className="border-ui flex gap-3 rounded-lg border px-3 py-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-xs font-extrabold text-cyan-300">
          1
        </span>
        <div className="min-w-0 space-y-1">
          <strong className="block">
            Open the Rocket League installation folder.
          </strong>
          <p>
            <strong>Steam:</strong> Library &rarr; right-click Rocket League
            &rarr; Manage &rarr; Browse local files.
          </p>
          <p>
            <strong>Epic:</strong> Library &rarr; Rocket League&rsquo;s
            three-dot menu &rarr; Manage &rarr; select the folder icon next to
            Uninstall.
          </p>
        </div>
      </li>
      <li className="border-ui flex gap-3 rounded-lg border px-3 py-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-xs font-extrabold text-cyan-300">
          2
        </span>
        <div className="min-w-0">
          <strong className="block">
            Open <code>TAGame\Config\TAStatsAPI.ini</code>.
          </strong>
          <p className="mt-1">
            If it is not present, open{' '}
            <code>TAGame\Config\DefaultStatsAPI.ini</code> instead.
          </p>
        </div>
      </li>
      <li className="border-ui flex gap-3 rounded-lg border px-3 py-2.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-xs font-extrabold text-cyan-300">
          3
        </span>
        <strong className="min-w-0">
          Change <code>PacketSendRate</code> to <code>2</code>, save the file,
          and restart Rocket League.
        </strong>
      </li>
    </ol>
  );
}
