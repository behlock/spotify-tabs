import { asRecord } from './guards.ts';

export type Route = { pathname: string; search: string; hash: string };
export const HOME_ROUTE: Route = { pathname: '/', search: '', hash: '' };

const CONTENT_PATH =
  /^\/(?:$|(?:album|artist|playlist|track|show|episode)\/[a-zA-Z0-9]{22}\/?$|(?:search|collection|genre|section|concerts)(?:\/[^?#\\]*)?$)/;
const QUERY_KEYS = new Set(['q', 'query', 'type', 'filter', 'offset', 'limit']);

/** Keep navigation data only: never persist OAuth parameters or history.state. */
export function routeFrom(value: unknown): Route | null {
  const route = asRecord(value);
  if (
    !route ||
    typeof route.pathname !== 'string' ||
    route.pathname.length > 2048 ||
    !CONTENT_PATH.test(route.pathname)
  )
    return null;

  const search = new URLSearchParams();
  if (typeof route.search === 'string' && route.search.length <= 4096) {
    for (const [key, value] of new URLSearchParams(route.search)) {
      if (QUERY_KEYS.has(key)) search.append(key, value.slice(0, 1024));
    }
  }
  const hash =
    typeof route.hash === 'string' && /^#[\w-]{1,100}$/.test(route.hash) ? route.hash : '';
  return { pathname: route.pathname, search: search.size ? `?${search}` : '', hash };
}

export function routeKey(route: Route): string {
  return route.pathname + route.search + route.hash;
}

export function fallbackTitle(route: Route): string {
  const [kind, name] = route.pathname.split('/').filter(Boolean);
  if (!kind) return 'Home';
  if (kind === 'search') {
    let term = name || new URLSearchParams(route.search).get('q') || '';
    try {
      term = decodeURIComponent(term);
    } catch {}
    return term ? `Search: ${term}`.slice(0, 100) : 'Search';
  }
  return `${kind[0].toUpperCase()}${kind.slice(1)}${name ? ` · ${name.slice(0, 6)}` : ''}`;
}
