import {
  inspectStatsApiConfig,
  patchStatsApiConfig,
} from '../src/platform/statsApiConfig';

describe('Stats API browser setup', () => {
  it('patches required values while preserving unrelated sections and comments', () => {
    const input = [
      '[Other]',
      'Keep=1',
      '[TAGame.MatchStatsExporter_TA]',
      '; preserve this note',
      'PacketSendRate=0',
    ].join('\r\n');
    const output = patchStatsApiConfig(input);
    expect(inspectStatsApiConfig('TAStatsAPI.ini', output).configured).toBe(
      true,
    );
    expect(output).toContain('Keep=1');
    expect(output).toContain('; preserve this note');
    expect(output).toContain('Port=49123');
    expect(output).toContain('WebPort=49124');
    expect(output).toContain('\r\n');
  });

  it('adds the exporter section when it is absent', () => {
    const output = patchStatsApiConfig('[Other]\nKeep=1');
    expect(output).toContain('[TAGame.MatchStatsExporter_TA]');
    expect(
      inspectStatsApiConfig('DefaultStatsAPI.ini', output).configured,
    ).toBe(true);
  });

  it('preserves a UTF-8 BOM without creating a duplicate exporter section', () => {
    const output = patchStatsApiConfig(
      '\uFEFF[TAGame.MatchStatsExporter_TA]\nPacketSendRate=0',
    );
    expect(output.match(/\[TAGame\.MatchStatsExporter_TA\]/g)).toHaveLength(1);
    expect(inspectStatsApiConfig('TAStatsAPI.ini', output).configured).toBe(
      true,
    );
  });
});
