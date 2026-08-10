import { readFileSync } from 'node:fs';

const source = readFileSync('landing/index.html', 'utf8');

function landingDocument() {
  return new DOMParser().parseFromString(source, 'text/html');
}

describe('Fennec landing page', () => {
  it('leads visitors to the app and public source without exposing demos', () => {
    const page = landingDocument();
    const links = Array.from(page.querySelectorAll('a'));
    const linksTo = (href: string) =>
      links.filter((link) => link.getAttribute('href') === href);

    expect(page.querySelector('h1')?.textContent).toContain(
      'Your Rocket League games, remembered.',
    );
    expect(linksTo('https://app.fennec.gg/').length).toBeGreaterThanOrEqual(3);
    expect(links.some((link) => link.href.includes('demo'))).toBe(false);
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

  it('prioritizes explainable analytics beyond the standard scoreboard', () => {
    const page = landingDocument();
    const cards = Array.from(page.querySelectorAll('.feature-card'));
    const text = cards.map((card) => card.textContent?.replace(/\s+/g, ' '));

    expect(cards.map((card) => card.querySelector('h3')?.textContent)).toEqual([
      'Passes',
      '50s',
      '3D touch map',
    ]);
    expect(text[0]).toContain('next identifiable single-player touch');
    expect(text[1]).toContain('within 250 milliseconds');
    expect(text[2]).toContain(
      'Map every touch, 50, save, and goal in a rotatable 3D arena',
    );
  });

  it('pairs every featured analytic with a decorative schematic', () => {
    const page = landingDocument();
    const diagrams = Array.from(
      page.querySelectorAll<SVGElement>('.feature-card .feature-visual'),
    );

    expect(diagrams.map((diagram) => diagram.dataset.featureVisual)).toEqual([
      'pass',
      'fifty',
      'touch-map',
    ]);
    for (const diagram of diagrams) {
      expect(diagram.getAttribute('aria-hidden')).toBe('true');
      expect(diagram.getAttribute('focusable')).toBe('false');
      expect(
        diagram.querySelectorAll('path, circle, rect').length,
      ).toBeGreaterThan(3);
    }
  });
});
