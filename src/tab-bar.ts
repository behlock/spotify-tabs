import { MAX_TABS } from './constants.ts';
import type { State } from './model.ts';
import { routeKey } from './routes.ts';
import styles from './tabs.css';

type Actions = {
  select(id: string): void;
  close(id: string): void;
  create(): void;
  move(id: string, beforeId: string | null): void;
};

export function createTabBar(host: HTMLElement, actions: Actions) {
  const originalLayout = host.style.cssText;
  const bar = document.createElement('div');
  bar.id = 'spotify-tabs';
  bar.setAttribute('aria-label', 'Spotify page tabs');

  const list = document.createElement('div');
  list.className = 'st-list';
  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-label', 'Open Spotify pages');

  const plus = button('st-plus', '+', 'New tab');
  plus.title = 'New tab (⌘T)';
  plus.onclick = actions.create;
  bar.append(list);

  const style = document.createElement('style');
  style.id = 'spotify-tabs-style';
  style.textContent = styles;
  host.style.display = 'flex';
  host.style.flexDirection = 'column';
  host.prepend(bar);
  document.head.append(style);

  let fingerprint = '';
  let drag: { id: string; pointerId: number; x: number; y: number; started: boolean } | null = null;
  let dropBeforeId: string | null = null;
  let overList = false;
  let ignoreClickUntil = 0;

  function clearDrag() {
    drag = null;
    overList = false;
    dropBeforeId = null;
    list.querySelectorAll<HTMLElement>('.st-tab').forEach((item) => {
      delete item.dataset.drop;
      delete item.dataset.dragging;
    });
    delete plus.dataset.drop;
  }

  list.addEventListener('pointerdown', (event) => {
    ignoreClickUntil = 0;
    if (
      event.button !== 0 ||
      !event.isPrimary ||
      !(event.target instanceof Element) ||
      event.target.closest('.st-close')
    )
      return;
    const item = event.target.closest<HTMLElement>('.st-tab');
    if (item?.dataset.id)
      drag = {
        id: item.dataset.id,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        started: false,
      };
  });
  list.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.started) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
      drag.started = true;
      if (event.isTrusted) list.setPointerCapture(event.pointerId);
      list
        .querySelector<HTMLElement>(`[data-id="${drag.id}"]`)
        ?.setAttribute('data-dragging', 'true');
    }
    event.preventDefault();
    const bounds = list.getBoundingClientRect();
    overList =
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom;
    const items = [...list.querySelectorAll<HTMLElement>('.st-tab')];
    list.querySelectorAll<HTMLElement>('[data-drop]').forEach((item) => delete item.dataset.drop);
    if (!overList) return;
    const before = items.find((item) => {
      const rect = item.getBoundingClientRect();
      return event.clientX < rect.left + rect.width / 2;
    });
    dropBeforeId = before?.dataset.id || null;
    (before || plus).dataset.drop = 'before';
    if (event.clientX < bounds.left + 24) list.scrollLeft -= 12;
    else if (event.clientX > bounds.right - 24) list.scrollLeft += 12;
  });
  list.addEventListener('pointerup', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const { id, started } = drag;
    const beforeId = dropBeforeId;
    const shouldMove = started && overList;
    if (started) ignoreClickUntil = performance.now() + 500;
    clearDrag();
    if (list.hasPointerCapture(event.pointerId)) list.releasePointerCapture(event.pointerId);
    if (shouldMove) actions.move(id, beforeId);
  });
  list.addEventListener('pointercancel', clearDrag);
  list.addEventListener('lostpointercapture', clearDrag);
  list.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') clearDrag();
  });
  list.addEventListener(
    'click',
    (event) => {
      if (event.detail > 0 && performance.now() < ignoreClickUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );

  return {
    element: bar,
    render(state: State) {
      const next = JSON.stringify([
        state.activeTabId,
        state.tabs.map((tab) => [tab.id, tab.title, tab.route]),
      ]);
      if (next === fingerprint) return;
      fingerprint = next;
      clearDrag();
      const focusId =
        document.activeElement instanceof HTMLElement
          ? document.activeElement.dataset.stId
          : undefined;
      const plusFocused = document.activeElement === plus;
      const fragment = document.createDocumentFragment();
      state.tabs.forEach((tab, index) => {
        const selected = tab.id === state.activeTabId;
        const item = document.createElement('div');
        item.className = 'st-tab';
        item.dataset.id = tab.id;
        item.dataset.active = String(selected);

        const select = button('st-select', tab.title, tab.title);
        select.dataset.stId = tab.id;
        select.setAttribute('role', 'tab');
        select.setAttribute('aria-selected', String(selected));
        select.tabIndex = selected ? 0 : -1;
        select.title = `${tab.title}\n${routeKey(tab.route)}${index < 9 ? ` (⌘${index + 1})` : ''}`;
        select.onclick = () => actions.select(tab.id);
        const close = button('st-close', '×', `Close ${tab.title}`);
        close.title = 'Close tab';
        close.onclick = () => actions.close(tab.id);
        item.append(select, close);
        fragment.append(item);
      });
      fragment.append(plus);
      list.replaceChildren(fragment);
      plus.disabled = state.tabs.length >= MAX_TABS;
      if (focusId)
        list
          .querySelector<HTMLElement>(`[data-st-id="${focusId}"]`)
          ?.focus({ preventScroll: true });
      else if (plusFocused) plus.focus({ preventScroll: true });
    },
    focusActive() {
      list.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    },
    setStorageWarning(warning: boolean) {
      bar.title = warning
        ? 'Tab persistence unavailable: Spotify storage is full or disabled.'
        : '';
    },
    dispose() {
      bar.remove();
      style.remove();
      host.style.cssText = originalLayout;
    },
  };
}

function button(className: string, text: string, label: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = text;
  element.setAttribute('aria-label', label);
  return element;
}
