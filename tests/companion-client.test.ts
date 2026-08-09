import {
  companionDownloadUrl,
  companionOpenUrl,
} from '../src/companion/client';

describe('companion pairing launch URL', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns to an allowlisted local development setup', () => {
    vi.stubGlobal('location', { origin: 'http://localhost:5174' });

    expect(companionOpenUrl()).toBe(
      'fennec://open?return_to=http%3A%2F%2Flocalhost%3A5174%2Fsetup',
    );
  });

  it('falls back to production for an unknown browser origin', () => {
    vi.stubGlobal('location', { origin: 'https://preview.example' });

    expect(companionOpenUrl()).toBe(
      'fennec://open?return_to=https%3A%2F%2Fapp.fennec.gg%2Fsetup',
    );
  });

  it('uses the stable latest-release Windows installer asset', () => {
    expect(companionDownloadUrl).toBe(
      'https://github.com/ryanf9802/Fennec/releases/latest/download/Fennec-Companion-Windows-x64-setup.exe',
    );
  });
});
