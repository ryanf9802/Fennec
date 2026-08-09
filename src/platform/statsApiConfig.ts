export interface StatsApiConfigStatus {
  filename: string;
  configured: boolean;
  text: string;
}

const section = '[TAGame.MatchStatsExporter_TA]';
const required = { PacketSendRate: '2', Port: '49123', WebPort: '49124' };

export function inspectStatsApiConfig(
  filename: string,
  text: string,
): StatsApiConfigStatus {
  const values = new Map<string, string>();
  let active = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^\uFEFF/, '');
    if (line.startsWith('[')) active = line === section;
    else if (active && !line.startsWith(';')) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) values.set(match[1]!.trim(), match[2]!.trim());
    }
  }
  return {
    filename,
    text,
    configured: Object.entries(required).every(
      ([key, value]) => values.get(key) === value,
    ),
  };
}

export function patchStatsApiConfig(text: string): string {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  let start = lines.findIndex(
    (line) => line.trim().replace(/^\uFEFF/, '') === section,
  );
  if (start < 0) {
    if (lines.at(-1)?.trim()) lines.push('');
    start = lines.push(section) - 1;
  }
  let end = lines.findIndex(
    (line, index) => index > start && line.trim().startsWith('['),
  );
  if (end < 0) end = lines.length;
  for (const [key, value] of Object.entries(required)) {
    const index = lines.findIndex(
      (line, lineIndex) =>
        lineIndex > start &&
        lineIndex < end &&
        line.trim().toLowerCase().startsWith(`${key.toLowerCase()}=`),
    );
    if (index >= 0) lines[index] = `${key}=${value}`;
    else {
      lines.splice(end, 0, `${key}=${value}`);
      end += 1;
    }
  }
  return lines.join(newline);
}
