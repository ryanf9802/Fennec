import { observedBallSpeed, playerTouchAnalytics } from '../domain/analytics';
import type { MatchState } from '../domain/types';
import { BallTouchMap } from './BallTouchMap';

function speed(value?: number): string {
  return value === undefined ? '—' : `${Math.round(value)} uu/s`;
}

export function MatchAnalytics({ match, profileId }: { match: MatchState; profileId?: string }) {
  const player = match.participants.find((value) => value.primaryId === profileId);
  const touches = playerTouchAnalytics(match, profileId);
  const ballSpeed = observedBallSpeed(match);
  const lastTouchSamples = match.capture?.lastTouchSamplesByTeam ?? {};
  const totalControl = Object.values(lastTouchSamples).reduce((sum, value) => sum + value, 0);
  const ownControl = player ? lastTouchSamples[String(player.teamNumber)] ?? 0 : 0;
  const cards = [
    ['Your ball hits', profileId ? touches.touches : '—'],
    ['Team touch share', touches.touchShare === undefined ? '—' : `${Math.round(touches.touchShare * 100)}%`],
    ['Average hit speed', speed(touches.averagePostHitSpeed)],
    ['Fastest hit', speed(touches.maximumPostHitSpeed)],
    ['Average speed gain', touches.averageSpeedChange === undefined ? '—' : `${touches.averageSpeedChange >= 0 ? '+' : ''}${Math.round(touches.averageSpeedChange)} uu/s`],
    ['Observed ball speed', speed(ballSpeed.average)],
    ['Maximum ball speed', speed(ballSpeed.maximum)],
    ['Last-touch control', !player || !totalControl ? '—' : `${Math.round(ownControl * 100 / totalControl)}%`],
  ];
  return <section className="space-y-4">
    <div><div className="eyebrow">Normal-play telemetry</div><h2 className="mt-1 text-xl font-extrabold">Ball analytics</h2></div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="surface-flat rounded-xl p-3"><div className="text-muted text-[0.68rem] font-black uppercase tracking-wider">{label}</div><div className="mt-1 text-lg font-extrabold">{value}</div></div>)}</div>
    {!match.capture && <p className="text-muted text-xs">Snapshot-derived speed and control analytics were not recorded for this legacy match.</p>}
    <div><div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h3 className="font-extrabold">Ball touch map</h3><p className="text-muted mt-0.5 text-xs">Locations come from exact ball-hit, goal, and crossbar events.</p></div><span className="eyebrow">{match.arena || match.playlistName}</span></div><BallTouchMap match={match} profileId={profileId} /></div>
  </section>;
}
