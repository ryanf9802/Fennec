import { FileCog, Save } from 'lucide-react';
import { useState } from 'react';
import {
  inspectStatsApiConfig,
  patchStatsApiConfig,
  type StatsApiConfigStatus,
} from '../platform/statsApiConfig';

interface WritableFileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(value: string): Promise<void>;
    close(): Promise<void>;
  }>;
}

export function BrowserStatsApiSetup({
  onConfigured,
}: {
  onConfigured?(configured: boolean): void;
}) {
  const [handle, setHandle] = useState<WritableFileHandle>();
  const [status, setStatus] = useState<StatsApiConfigStatus>();
  const [message, setMessage] = useState<string>();
  const choose = async () => {
    const picker = (
      window as Window & {
        showOpenFilePicker?: (options: object) => Promise<WritableFileHandle[]>;
      }
    ).showOpenFilePicker;
    if (!picker) {
      setMessage(
        'This browser cannot edit the file directly. Use the manual values below.',
      );
      return;
    }
    try {
      const [next] = await picker({
        multiple: false,
        types: [
          {
            description: 'Rocket League Stats API config',
            accept: { 'text/plain': ['.ini'] },
          },
        ],
      });
      if (!next) return;
      const file = await next.getFile();
      if (!['TAStatsAPI.ini', 'DefaultStatsAPI.ini'].includes(file.name)) {
        setMessage(
          'Choose TAStatsAPI.ini or DefaultStatsAPI.ini from TAGame\\Config.',
        );
        return;
      }
      const inspected = inspectStatsApiConfig(file.name, await file.text());
      setHandle(next);
      setStatus(inspected);
      onConfigured?.(inspected.configured);
      setMessage(
        inspected.configured
          ? 'Stats API configuration verified.'
          : 'This file still needs the required values.',
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };
  const save = async () => {
    if (!handle || !status) return;
    try {
      const next = patchStatsApiConfig(status.text);
      const writer = await handle.createWritable();
      await writer.write(next);
      await writer.close();
      const checked = inspectStatsApiConfig(handle.name, next);
      setStatus(checked);
      onConfigured?.(checked.configured);
      setMessage(
        'Stats API configuration saved and verified. Restart Rocket League.',
      );
    } catch (error) {
      setMessage(
        `Could not write the protected file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap gap-3">
        <button className="button-secondary" onClick={() => void choose()}>
          <FileCog className="size-4" /> Choose Stats API file
        </button>
        {status && !status.configured && (
          <button className="button-primary" onClick={() => void save()}>
            <Save className="size-4" /> Apply required values
          </button>
        )}
      </div>
      {message && <p className="text-muted text-sm">{message}</p>}
      <pre className="surface-strong overflow-x-auto rounded-xl p-4 text-xs">{`[TAGame.MatchStatsExporter_TA]\nPacketSendRate=2\nPort=49123\nWebPort=49124`}</pre>
    </div>
  );
}
