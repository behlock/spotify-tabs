import { asRecord } from './guards.ts';
import type { Route } from './routes.ts';

export interface Router {
  location: Route;
  replace(route: Route): void;
  listen(callback: (event: Route | { location: Route }) => void): () => void;
}

function compatible(value: unknown): value is Router {
  const history = asRecord(value);
  return (
    !!history &&
    typeof asRecord(history.location)?.pathname === 'string' &&
    ['replace', 'listen'].every((key) => typeof history[key] === 'function')
  );
}

export function findRouter(): Router | null {
  const spicetify = asRecord(asRecord(window.Spicetify)?.Platform)?.History;
  if (compatible(spicetify)) return spicetify;

  const main = document.querySelector('main');
  if (!main) return null;
  const key = Object.keys(main).find((key) => key.startsWith('__reactFiber$'));
  let fiber = asRecord(key ? Reflect.get(main, key) : null);
  for (let depth = 0; fiber && depth < 300; depth++, fiber = asRecord(fiber.return)) {
    const props = asRecord(fiber.memoizedProps);
    for (const history of [props?.history, props?.navigator, asRecord(props?.value)?.navigator]) {
      if (compatible(history)) return history;
    }
  }
  return null;
}
