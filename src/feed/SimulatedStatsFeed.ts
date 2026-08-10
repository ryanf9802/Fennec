import type { StatsEnvelope } from '../domain/types';
import type { StatsFeedAdapter, StatsFeedHandlers } from './StatsFeedAdapter';

export class SimulatedStatsFeed implements StatsFeedAdapter {
  private timers: number[] = [];
  private stopped = true;

  start(handlers: StatsFeedHandlers): void {
    this.stop();
    this.stopped = false;
    handlers.onState('connecting');
    const guid = `demo-${Date.now()}`;
    const update = (
      timeSeconds: number,
      blue: number,
      orange: number,
    ): StatsEnvelope => ({
      event: 'UpdateState',
      data: {
        MatchGuid: guid,
        Players: [
          {
            Name: 'You',
            PrimaryId: 'Steam|demo-you|0',
            Shortcut: 1,
            TeamNum: 0,
            Score: 420 + blue * 100,
            Goals: blue,
            Assists: 1,
            Saves: 2,
            Shots: blue + 3,
            Touches: 38,
            CarTouches: 11,
            Demos: 1,
            Loadout: ['Body_Fennec', 'Wheel_SoccerBall'],
          },
          {
            Name: 'Luna',
            PrimaryId: 'Epic|demo-luna|0',
            Shortcut: 2,
            TeamNum: 0,
            Score: 335,
            Goals: 1,
            Assists: blue,
            Saves: 1,
            Shots: 3,
            Touches: 29,
            CarTouches: 8,
            Demos: 0,
          },
          {
            Name: 'Drift',
            PrimaryId: 'Steam|demo-drift|0',
            Shortcut: 3,
            TeamNum: 1,
            Score: 310,
            Goals: orange,
            Assists: 0,
            Saves: 3,
            Shots: 4,
            Touches: 35,
            CarTouches: 10,
            Demos: 1,
          },
          {
            Name: 'Orbit',
            PrimaryId: 'Epic|demo-orbit|0',
            Shortcut: 4,
            TeamNum: 1,
            Score: 240,
            Goals: 0,
            Assists: orange,
            Saves: 1,
            Shots: 2,
            Touches: 22,
            CarTouches: 7,
            Demos: 0,
          },
        ],
        Game: {
          Teams: [
            {
              Name: 'Blue',
              TeamNum: 0,
              Score: blue,
              ColorPrimary: '42d9ff',
              ColorSecondary: '2563eb',
            },
            {
              Name: 'Orange',
              TeamNum: 1,
              Score: orange,
              ColorPrimary: 'ff8a3d',
              ColorSecondary: 'c2410c',
            },
          ],
          PlaylistId: 11,
          TimeSeconds: timeSeconds,
          bOvertime: false,
          bReplay: false,
          Arena: 'DFH Stadium',
          Ball: { Speed: 9.1 + blue * 0.7, TeamNum: blue > orange ? 0 : 1 },
        },
      },
    });
    const emit = (delay: number, envelope: StatsEnvelope) =>
      this.timers.push(
        window.setTimeout(async () => {
          if (this.stopped) return;
          await handlers.onEnvelope(envelope);
        }, delay),
      );
    this.timers.push(
      window.setTimeout(() => {
        handlers.onStatsApiVerified?.();
        handlers.onState('waiting');
      }, 250),
    );
    emit(500, { event: 'MatchCreated', data: { MatchGuid: guid } });
    emit(650, { event: 'RoundStarted', data: { MatchGuid: guid } });
    emit(700, update(300, 1, 1));
    emit(750, update(238, 1, 1));
    emit(1_350, {
      event: 'BallHit',
      data: {
        MatchGuid: guid,
        Players: [{ Name: 'You', Shortcut: 1, TeamNum: 0 }],
        Ball: {
          PreHitSpeed: 62,
          PostHitSpeed: 118,
          Location: { X: -1450, Y: -820, Z: 180 },
        },
      },
    });
    emit(1_900, {
      event: 'BallHit',
      data: {
        MatchGuid: guid,
        Players: [{ Name: 'Luna', Shortcut: 2, TeamNum: 0 }],
        Ball: {
          PreHitSpeed: 83,
          PostHitSpeed: 104,
          Location: { X: 620, Y: 1750, Z: 510 },
        },
      },
    });
    emit(2_100, {
      event: 'BallHit',
      data: {
        MatchGuid: guid,
        Players: [
          { Name: 'Luna', Shortcut: 2, TeamNum: 0 },
          { Name: 'Drift', Shortcut: 3, TeamNum: 1 },
        ],
        Ball: {
          PreHitSpeed: 104,
          PostHitSpeed: 93,
          Location: { X: 700, Y: 1820, Z: 480 },
        },
      },
    });
    emit(2_500, {
      event: 'GoalScored',
      data: {
        MatchGuid: guid,
        Scorer: { Name: 'You', Shortcut: 1, TeamNum: 0 },
        Assister: { Name: 'Luna', Shortcut: 2, TeamNum: 0 },
        GoalSpeed: 105.4,
        ImpactLocation: { X: 320, Y: 5000, Z: 240 },
      },
    });
    emit(2_650, { event: 'RoundStarted', data: { MatchGuid: guid } });
    emit(2_800, update(181, 2, 1));
    emit(5_000, {
      event: 'StatfeedEvent',
      data: {
        MatchGuid: guid,
        Type: 'Demolish',
        MainTarget: { Name: 'You' },
        SecondaryTarget: { Name: 'Drift' },
      },
    });
    emit(5_300, update(116, 2, 1));
    emit(6_100, {
      event: 'CrossbarHit',
      data: {
        MatchGuid: guid,
        BallLocation: { X: -720, Y: -4960, Z: 610 },
        BallSpeed: 9.7,
        ImpactForce: 122,
        BallLastTouch: {
          Player: { Name: 'Drift', Shortcut: 3, TeamNum: 1 },
          Speed: 9.7,
        },
      },
    });
    emit(8_000, {
      event: 'GoalScored',
      data: { MatchGuid: guid, Scorer: { Name: 'Drift' }, GoalSpeed: 92.7 },
    });
    emit(8_250, update(52, 2, 2));
  }

  stop(): void {
    this.stopped = true;
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers = [];
  }
}
