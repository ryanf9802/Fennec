import { isLoopbackHostname } from './platform/origin';

if (isLoopbackHostname(location.hostname)) {
  const localAppUrl = new URL('/', location.origin).href;
  for (const link of document.querySelectorAll<HTMLAnchorElement>(
    '[data-fennec-app-link]',
  )) {
    link.href = localAppUrl;
  }
}
