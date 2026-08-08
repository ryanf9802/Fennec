import { describe, expect, it } from 'vitest';
import { connectionPresentation } from '../src/domain/connectionPresentation';

describe('connection presentation', () => {
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
