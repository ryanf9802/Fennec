import { readFileSync } from 'node:fs';

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

  it('advertises transparent favicon-mark icons for installation', () => {
    expect(viteConfig).toContain("src: '/icons/icon-192.png'");
    expect(viteConfig).toContain("src: '/icons/icon-512.png'");
    expect(viteConfig).not.toContain('icon-maskable');
    expect(viteConfig.match(/purpose: 'any'/g)).toHaveLength(2);

    expect(readPngHeader('public/icons/icon-192.png')).toEqual({
      width: 192,
      height: 192,
      colorType: 6,
    });
    expect(readPngHeader('public/icons/icon-512.png')).toEqual({
      width: 512,
      height: 512,
      colorType: 6,
    });
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
