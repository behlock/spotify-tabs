import type { Route } from './routes.ts';

type PageTitle = { element: Element; text: string; entityUri: string | null };
export function readPageTitle(): PageTitle | null {
  const main = document.querySelector('main');
  const element = main?.querySelector('[data-testid="adaptiveEntityTitle"], h1');
  const text = element?.textContent?.trim();
  if (!element || !text) return null;
  return {
    element,
    text,
    entityUri: element.closest('[data-test-uri]')?.getAttribute('data-test-uri') || null,
  };
}

export function titleBelongsToRoute(title: PageTitle, route: Route): boolean | null {
  const entity = route.pathname.match(
    /^\/(artist|album|playlist|track|show|episode)\/([a-zA-Z0-9]{22})\/?$/,
  );
  if (!entity || !title.entityUri) return null;
  return title.entityUri === `spotify:${entity[1]}:${entity[2]}`;
}
