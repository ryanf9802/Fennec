import { describe, expect, it } from 'vitest';
import {
  connectionPresentation,
  isStatsApiConnected,
} from '../src/domain/connectionPresentation';

describe('connection presentation', () => {
  it('treats idle and active Stats API sockets as connected', () => {
    expect(isStatsApiConnected('waiting')).toBe(true);
    expect(isStatsApiConnected('live')).toBe(true);
    expect(isStatsApiConnected('connecting')).toBe(false);
    expect(isStatsApiConnected('unavailable')).toBe(false);
    expect(isStatsApiConnected('stopped')).toBe(false);
  });

  it('presents an idle Stats API socket as a successful connection', () => {
    expect(connectionPresentation('waiting')).toEqual({
      label: 'Connected',
      indicatorClass: 'bg-emerald-400',
      pulse: false,
    });
  });

  it('keeps active gameplay visually distinct from an idle connection', () => {
    expect(connectionPresentation('live')).toEqual({
      label: 'Live',
      indicatorClass: 'bg-fennec-cyan',
      pulse: true,
    });
  });

  it('does not misdiagnose denied browser access as an offline game', () => {
    expect(connectionPresentation('unavailable')).toEqual({
      label: 'Stats API unavailable',
      indicatorClass: 'bg-fennec-orange',
      pulse: false,
    });
  });
});
