import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const viteConfig = readFileSync('vite.config.ts', 'utf8');
const companionSource = readFileSync('src-tauri/src/lib.rs', 'utf8');
const companionMainSource = readFileSync('src-tauri/src/main.rs', 'utf8');
const companionStoreSource = readFileSync('src-tauri/src/store.rs', 'utf8');

function readPngHeader(path: string) {
  const icon = readFileSync(path);
  expect(icon.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  return {
    width: icon.readUInt32BE(16),
    height: icon.readUInt32BE(20),
    colorType: icon[25],
  };
}

function manifestIconPath(size: number) {
  const match = viteConfig.match(
    new RegExp(
      `src: '([^']+)',\\s+sizes: '${size}x${size}',\\s+type: 'image/png',\\s+purpose: 'any'`,
    ),
  );
  if (!match) throw new Error(`missing ${size}px PWA icon`);
  const webPath = match[1];
  if (!webPath) throw new Error(`missing ${size}px PWA icon path`);
  return webPath;
}

function expectContentAddressedIcon(size: number) {
  const webPath = manifestIconPath(size);
  const filePath = `public${webPath}`;
  const digest = createHash('sha256')
    .update(readFileSync(filePath))
    .digest('hex')
    .slice(0, 12);

  expect(webPath).toBe(`/icons/icon-${size}-${digest}.png`);
  expect(readPngHeader(filePath)).toEqual({
    width: size,
    height: size,
    colorType: 6,
  });
  return webPath.slice('/icons/'.length);
}

describe('PWA identity', () => {
  it('uses only Fennec for both manifest names', () => {
    expect(viteConfig).toMatch(/^\s+name: 'Fennec',$/m);
    expect(viteConfig).toMatch(/^\s+short_name: 'Fennec',$/m);
    expect(viteConfig).not.toMatch(/name: 'Fennec[^']/);
  });

  it('reuses an existing installed window for companion-opened links', () => {
    expect(viteConfig).toContain(
      "launch_handler: { client_mode: 'navigate-existing' }",
    );
  });

  it('advertises content-addressed transparent icons for installation', () => {
    expect(viteConfig).not.toContain('icon-maskable');
    expect(viteConfig.match(/purpose: 'any'/g)).toHaveLength(2);

    const icons = [
      expectContentAddressedIcon(192),
      expectContentAddressedIcon(512),
    ].sort();
    expect(readdirSync('public/icons').sort()).toEqual(icons);
  });

  it('uses a dedicated transparent favicon-mark icon for the companion tray', () => {
    expect(companionSource).toContain(
      'tauri::include_image!("icons/tray-icon.png")',
    );
    expect(readPngHeader('src-tauri/icons/tray-icon.png')).toEqual({
      width: 64,
      height: 64,
      colorType: 6,
    });
  });

  it('runs installed Windows companion processes without console windows', () => {
    expect(companionMainSource).toContain(
      'all(not(debug_assertions), target_os = "windows")',
    );
    expect(companionMainSource).toContain('windows_subsystem = "windows"');
    expect(companionSource).toContain(
      'const CREATE_NO_WINDOW: u32 = 0x0800_0000;',
    );
    expect(companionSource).toContain(
      'command.creation_flags(CREATE_NO_WINDOW);',
    );
    expect(companionSource).toContain(
      'hidden_windows_command("powershell.exe")',
    );
    expect(companionSource).toContain('hidden_windows_command("cmd")');
    expect(companionStoreSource).toContain(
      'crate::hidden_windows_command("powershell.exe")',
    );
    expect(companionStoreSource).toContain(
      'crate::hidden_windows_command("cmd")',
    );
  });
});
