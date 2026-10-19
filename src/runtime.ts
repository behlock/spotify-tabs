import { MAX_TABS, STORAGE_KEY } from './constants.ts';
import { activeTab, readState, TabManager, type ChangeReason } from './model.ts';
import type { Router } from './router.ts';
import { HOME_ROUTE, routeFrom, routeKey } from './routes.ts';
import { createTabBar } from './tab-bar.ts';
import { readPageTitle, titleBelongsToRoute } from './title.ts';
import { createScrollRestorer } from './scroll.ts';

export interface TabRuntime {
  readonly status: 'ready';
  dispose(): void;
}

export function mountTabs(router: Router, host: HTMLElement): TabRuntime {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {}

  let titleBaseline = readPageTitle();
  let awaitingTitle = false;
  let restoreTabFocus = false;
  let titleTimer: ReturnType<typeof setTimeout> | undefined;
  const scroll = createScrollRestorer(host, () => {
    if (restoreTabFocus) bar.focusActive();
  });
  const bar = createTabBar(host, {
    select: switchTab,
    close: closeTab,
    create: addTab,
    move: (id, before) => manager.move(id, before),
  });
  const manager = new TabManager(
    router,
    readState(raw, routeFrom(router.location) || HOME_ROUTE),
    changed,
  );

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(manager.state));
      bar.setStorageWarning(false);
    } catch {
      bar.setStorageWarning(true);
    }
  }
  function changed(reason: ChangeReason) {
    if (reason === 'navigation') {
      scroll.cancel();
      beforeNavigation();
    }
    persist();
    bar.render(manager.state);
  }
  function captureScroll() {
    if (scroll.pending) return;
    activeTab(manager.state).scrollY = scroll.position;
    persist();
  }
  function beforeNavigation() {
    restoreTabFocus =
      document.activeElement instanceof HTMLElement && document.activeElement.matches('.st-select');
    titleBaseline = readPageTitle();
    awaitingTitle = true;
  }
  function transition(action: () => void, saveScroll = true) {
    if (saveScroll) captureScroll();
    const previousRoute = routeKey(routeFrom(router.location) || HOME_ROUTE);
    beforeNavigation();
    scroll.prepare();
    try {
      action();
      const tab = activeTab(manager.state);
      const sameRoute = routeKey(tab.route) === previousRoute;
      if (sameRoute) awaitingTitle = false;
      scroll.restore(tab.route, tab.scrollY, sameRoute);
    } catch (error) {
      scroll.cancel();
      throw error;
    }
  }
  function switchTab(id: string) {
    if (id === manager.state.activeTabId) return;
    transition(() => manager.switchTo(id));
  }
  function addTab() {
    if (manager.state.tabs.length < MAX_TABS) transition(() => manager.add());
  }
  function closeTab(id: string) {
    if (id === manager.state.activeTabId) transition(() => manager.close(id));
    else manager.close(id);
  }
  function updateTitle() {
    const title = readPageTitle();
    const current = routeFrom(router.location);
    if (!title || !current) return;
    const belongs = titleBelongsToRoute(title, current);
    if (belongs === false) return;
    if (
      awaitingTitle &&
      belongs !== true &&
      titleBaseline &&
      title.element === titleBaseline.element &&
      title.text === titleBaseline.text
    )
      return;
    awaitingTitle = false;
    const tab = activeTab(manager.state);
    if (routeKey(tab.route) !== routeKey(current) || tab.title === title.text) return;
    tab.title = title.text.slice(0, 120);
    changed('tabs');
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Tab') restoreTabFocus = false;
    if (event.altKey || event.ctrlKey || event.isComposing) return;
    if (!event.metaKey) {
      if (event.shiftKey) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.matches('.st-select') &&
        ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const { tabs, activeTabId } = manager.state;
        const index = tabs.findIndex((tab) => tab.id === activeTabId);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        switchTab(tabs[next].id);
        bar.focusActive();
      }
      return;
    }
    const key = event.key.toLowerCase();
    const close = event.shiftKey && key === 'x';
    if (!close && (event.shiftKey || (key !== 't' && !/^[1-9]$/.test(key)))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    if (close) closeTab(manager.state.activeTabId);
    else if (key === 't') addTab();
    else {
      const tab = manager.state.tabs[Number(key) - 1];
      if (tab) switchTab(tab.id);
    }
  }
  function cancelRestore(event: Event) {
    if (event.target instanceof Node && !bar.element.contains(event.target)) scroll.cancel();
  }

  const observer = new MutationObserver((records) => {
    if (records.every((record) => bar.element.contains(record.target))) return;
    scroll.refresh();
    clearTimeout(titleTimer);
    titleTimer = setTimeout(updateTitle, 120);
  });
  observer.observe(host, { childList: true, subtree: true, characterData: true });
  host.addEventListener('wheel', cancelRestore, { passive: true });
  host.addEventListener('touchstart', cancelRestore, { passive: true });
  host.addEventListener('pointerdown', cancelRestore, { passive: true });
  window.addEventListener('keydown', keydown, true);
  window.addEventListener('pagehide', captureScroll);

  bar.render(manager.state);
  if (
    routeKey(activeTab(manager.state).route) !== routeKey(routeFrom(router.location) || HOME_ROUTE)
  ) {
    transition(() => manager.switchTo(manager.state.activeTabId), false);
  } else {
    updateTitle();
    scroll.prepare();
    const tab = activeTab(manager.state);
    scroll.restore(tab.route, tab.scrollY, true);
  }
  persist();

  return {
    status: 'ready',
    dispose() {
      captureScroll();
      clearTimeout(titleTimer);
      scroll.cancel();
      manager.unsubscribe();
      observer.disconnect();
      host.removeEventListener('wheel', cancelRestore);
      host.removeEventListener('touchstart', cancelRestore);
      host.removeEventListener('pointerdown', cancelRestore);
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('pagehide', captureScroll);
      bar.dispose();
      delete window.__spotifyTabs;
    },
  };
}
