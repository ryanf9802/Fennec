export function PlayerName({ name, teamNumber, you = false }: { name: string; teamNumber?: number; you?: boolean }) {
  const teamName = teamNumber === 0 ? 'Blue team' : teamNumber === 1 ? 'Orange team' : 'Team unknown';
  return <span className="inline-flex min-w-0 items-center gap-2">
    <span aria-label={teamName} title={teamName} className={`inline-block size-2.5 shrink-0 rounded-full ${teamNumber === 0 ? 'bg-fennec-cyan' : teamNumber === 1 ? 'bg-fennec-orange' : 'bg-slate-400'}`} />
    <strong className="truncate">{name}</strong>
    {you && <span className="text-fennec-cyan text-[0.62rem] font-black tracking-wider">YOU</span>}
  </span>;
}
