export function StatsApiSetup() {
  return <ol className="mt-5 grid gap-3 text-sm">
    <li className="surface-strong rounded-xl p-4"><strong>1. Open your Rocket League installation directory.</strong></li>
    <li className="surface-strong rounded-xl p-4"><strong>2. Open <code>TAGame\Config\TAStatsAPI.ini</code>.</strong></li>
    <li className="surface-strong rounded-xl p-4"><strong>3. Change <code>PacketSendRate</code> to <code>2</code>, save the file, and restart Rocket League.</strong></li>
  </ol>;
}
