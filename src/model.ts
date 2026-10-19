import { MAX_TABS } from './constants.ts';
import { asRecord } from './guards.ts';
import { fallbackTitle, HOME_ROUTE, routeFrom, routeKey, type Route } from './routes.ts';
import type { Router } from './router.ts';

export type Tab = { id: string; title: string; route: Route; scrollY: number };
export type State = { version: 1; activeTabId: string; tabs: Tab[] };
export type ChangeReason = 'navigation' | 'tabs';

function newTab(route: Route = HOME_ROUTE): Tab {
  return { id: crypto.randomUUID(), title: fallbackTitle(route), route: { ...route }, scrollY: 0 };
}

export function freshState(route: Route): State {
  const tab = newTab(route);
  return { version: 1, activeTabId: tab.id, tabs: [tab] };
}

export function readState(raw: string | null, current: Route): State {
  try {
    if (!raw || raw.length > 150_000) return freshState(current);
    const saved = asRecord(JSON.parse(raw));
    if (saved?.version !== 1 || !Array.isArray(saved.tabs)) return freshState(current);

    const seen = new Set<string>();
    const tabs: Tab[] = [];
    for (const value of saved.tabs.slice(0, MAX_TABS)) {
      const item = asRecord(value);
      const route = routeFrom(item?.route);
      if (
        !item ||
        !route ||
        typeof item.id !== 'string' ||
        !/^[\w-]{1,80}$/.test(item.id) ||
        seen.has(item.id)
      )
        continue;
      seen.add(item.id);
      tabs.push({
        id: item.id,
        title:
          typeof item.title === 'string' && item.title.trim()
            ? item.title.slice(0, 120)
            : fallbackTitle(route),
        route,
        scrollY:
          typeof item.scrollY === 'number' && Number.isFinite(item.scrollY)
            ? Math.max(0, Math.min(item.scrollY, 1_000_000))
            : 0,
      });
    }
    if (tabs.length) {
      return {
        version: 1,
        activeTabId: tabs.some((tab) => tab.id === saved.activeTabId)
          ? (saved.activeTabId as string)
          : tabs[0].id,
        tabs,
      };
    }
  } catch {}
  return freshState(current);
}

export function activeTab(state: State): Tab {
  const tab = state.tabs.find((tab) => tab.id === state.activeTabId);
  if (!tab) throw new Error('Tab state has no active tab');
  return tab;
}

export class TabManager {
  state: State;
  readonly unsubscribe: () => void;
  private readonly router: Router;
  private readonly changed: (reason: ChangeReason) => void;

  constructor(router: Router, state: State, changed: (reason: ChangeReason) => void) {
    this.router = router;
    this.state = state;
    this.changed = changed;
    this.unsubscribe = router.listen((event) => {
      const route = routeFrom('location' in event ? event.location : event);
      // A queued callback must not overwrite the destination of a later switch.
      if (!route || routeKey(route) !== routeKey(routeFrom(router.location) || HOME_ROUTE)) return;
      const tab = activeTab(this.state);
      if (routeKey(route) === routeKey(tab.route)) return;
      tab.route = route;
      tab.title = fallbackTitle(route);
      tab.scrollY = 0;
      changed('navigation');
    });
  }

  switchTo(id: string): void {
    if (!this.state.tabs.some((tab) => tab.id === id)) return;
    this.navigate({ ...this.state, activeTabId: id });
  }

  add(route: Route = HOME_ROUTE): string | null {
    if (this.state.tabs.length >= MAX_TABS) return null;
    const tab = newTab(route);
    this.navigate({ ...this.state, activeTabId: tab.id, tabs: [...this.state.tabs, tab] });
    return tab.id;
  }

  close(id: string): void {
    const index = this.state.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    const tabs = this.state.tabs.filter((tab) => tab.id !== id);
    if (id !== this.state.activeTabId) {
      this.state = { ...this.state, tabs };
      this.changed('tabs');
      return;
    }
    const next = tabs.length
      ? { ...this.state, tabs, activeTabId: tabs[Math.min(index, tabs.length - 1)].id }
      : freshState(HOME_ROUTE);
    this.navigate(next);
  }

  move(id: string, beforeId: string | null): void {
    if (id === beforeId) return;
    const tab = this.state.tabs.find((tab) => tab.id === id);
    if (!tab || (beforeId !== null && !this.state.tabs.some((tab) => tab.id === beforeId))) return;
    const tabs = this.state.tabs.filter((tab) => tab.id !== id);
    const index = beforeId === null ? tabs.length : tabs.findIndex((tab) => tab.id === beforeId);
    tabs.splice(index, 0, tab);
    if (tabs.every((tab, index) => tab.id === this.state.tabs[index].id)) return;
    this.state = { ...this.state, tabs };
    this.changed('tabs');
  }

  private navigate(next: State): void {
    const previous = this.state;
    // History listeners can run synchronously inside replace().
    this.state = next;
    try {
      this.router.replace({ ...activeTab(next).route });
    } catch (error) {
      this.state = previous;
      throw error;
    }
    this.changed('tabs');
  }
}
