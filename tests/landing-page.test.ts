import { readFileSync } from 'node:fs';

const source = readFileSync('landing/index.html', 'utf8');

function landingDocument() {
  return new DOMParser().parseFromString(source, 'text/html');
}

describe('Fennec landing page', () => {
  it('leads visitors to the app, demo, and public source', () => {
    const page = landingDocument();
    const links = Array.from(page.querySelectorAll('a'));
    const linksTo = (href: string) =>
      links.filter((link) => link.getAttribute('href') === href);

    expect(page.querySelector('h1')?.textContent).toContain(
      'Your Rocket League games, remembered.',
    );
    expect(linksTo('https://app.fennec.gg/').length).toBeGreaterThanOrEqual(3);
    expect(linksTo('https://app.fennec.gg/?demo=1')).toHaveLength(1);
    expect(
      linksTo('https://github.com/ryanf9802/Fennec').length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('makes its license, local-first model, and attribution explicit', () => {
    const page = landingDocument();
    const text = (page.body.textContent ?? '').replace(/\s+/g, ' ');

    expect(page.querySelectorAll('main, header, nav, footer')).toHaveLength(4);
    expect(text).toContain('MIT License');
    expect(text).toContain('Your data lives on your machine.');
    expect(text).toContain('not endorsed by Psyonix or Epic Games');
    expect(
      page.querySelector('a[href$="/blob/main/TRADEMARKS.md"]'),
    ).not.toBeNull();
  });
});
