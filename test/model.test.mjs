import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TabManager, activeTab, freshState, readState } from '../src/model.ts';
import { routeFrom } from '../src/routes.ts';
import { MAX_TABS } from '../src/constants.ts';
const album = (id) => ({ pathname: '/album/' + id.repeat(22), search: '', hash: '' });
const A = album('a'),
  B = album('b'),
  C = album('c');
function fixture() {
  let listener;
  const router = {
    location: A,
    entries: [A],
    replace(route) {
      this.location = route;
      listener?.(route);
    },
    push(route) {
      this.location = route;
      this.entries.push(route);
      listener?.(route);
    },
    listen(fn) {
      listener = fn;
      return () => {
        listener = undefined;
      };
    },
  };
  const manager = new TabManager(router, freshState(A), () => {});
  return { router, manager, emit: (route) => listener(route) };
}
test('switching with synchronous native events preserves inactive routes and does not push history entries', () => {
  const { router, manager } = fixture();
  const first = manager.state.activeTabId;
  const second = manager.add(B);
  for (let i = 0; i < 20; i++) {
    manager.switchTo(first);
    manager.switchTo(second);
  }
  assert.deepEqual(
    manager.state.tabs.map((t) => t.route),
    [A, B],
  );
  assert.equal(router.entries.length, 1);
  router.push(C);
  assert.deepEqual(
    manager.state.tabs.map((t) => t.route),
    [A, C],
  );
});
test('closing active/inactive/last tabs leaves a valid active tab', () => {
  const { manager } = fixture();
  const first = manager.state.activeTabId;
  const second = manager.add(B);
  manager.add(C);
  manager.close(second);
  assert.equal(manager.state.tabs.length, 2);
  manager.close(manager.state.activeTabId);
  assert.equal(manager.state.activeTabId, first);
  manager.close(first);
  assert.equal(manager.state.tabs.length, 1);
  assert.equal(activeTab(manager.state).route.pathname, '/');
});
test('stale queued navigation event cannot overwrite the new active tab', () => {
  const { manager, emit } = fixture();
  manager.add(B);
  emit(A);
  assert.deepEqual(activeTab(manager.state).route, B);
});
test('failed switch rolls active ownership back and a failed add removes the new tab', () => {
  const { manager, router } = fixture();
  const first = manager.state.activeTabId;
  const second = manager.add(B);
  router.replace = () => {
    throw new Error('blocked');
  };
  assert.throws(() => manager.switchTo(first), /blocked/);
  assert.equal(manager.state.activeTabId, second);
  assert.throws(() => manager.add(C), /blocked/);
  assert.equal(manager.state.tabs.length, 2);
  assert.throws(() => manager.close(second), /blocked/);
  assert.equal(manager.state.activeTabId, second);
  assert.equal(manager.state.tabs.length, 2);
});
test('storage validates schema, duplicate IDs, active ID, titles, scroll and route data', () => {
  const raw = JSON.stringify({
    version: 1,
    activeTabId: 'missing',
    tabs: [
      {
        id: 'one',
        title: 'A',
        route: { ...A, state: { token: 'secret' }, search: '?q=test&access_token=secret' },
        scrollY: -2,
      },
      { id: 'one', title: 'duplicate', route: B },
      { id: 'bad', route: { pathname: 'https://evil.example' } },
    ],
  });
  const state = readState(raw, C);
  assert.equal(state.tabs.length, 1);
  assert.equal(state.activeTabId, 'one');
  assert.deepEqual(activeTab(state).route, { ...A, search: '?q=test' });
  assert.equal(activeTab(state).scrollY, 0);
  assert.ok(!JSON.stringify(state).includes('secret'));
  for (const corrupt of ['{', 'null', '{}', JSON.stringify({ version: 2, tabs: [] })]) {
    assert.deepEqual(activeTab(readState(corrupt, C)).route, C);
  }
});
test('search routing preserves q, hash and safe path; external/auth routes are rejected', () => {
  assert.deepEqual(
    routeFrom({
      pathname: '/search/jazz',
      search: '?q=jazz&type=album&code=private',
      hash: '#results',
      state: {},
    }),
    { pathname: '/search/jazz', search: '?q=jazz&type=album', hash: '#results' },
  );
  for (const pathname of [
    '//evil.example',
    '/login',
    '/callback',
    '/album/../login',
    '/album/a',
    '/search\\evil',
  ])
    assert.equal(routeFrom({ pathname }), null);
});
test('tab count is bounded', () => {
  const { manager } = fixture();
  for (let i = 1; i < MAX_TABS; i++) assert.ok(manager.add(B));
  assert.equal(manager.add(C), null);
  assert.equal(manager.state.tabs.length, MAX_TABS);
});

test('reordering left, right and to the end preserves active page, scroll and saved order', () => {
  const { manager, router } = fixture();
  const first = manager.state.activeTabId;
  const second = manager.add(B);
  const third = manager.add(C);
  activeTab(manager.state).scrollY = 400;
  const original = structuredClone(manager.state);
  router.replace = () => {
    throw new Error('Reordering must not navigate');
  };
  const order = () => manager.state.tabs.map((tab) => tab.id);
  manager.move(third, first);
  assert.deepEqual(order(), [third, first, second]);
  manager.move(third, second);
  assert.deepEqual(order(), [first, third, second]);
  manager.move(first, null);
  assert.deepEqual(order(), [third, second, first]);
  assert.equal(manager.state.activeTabId, third);
  for (const tab of manager.state.tabs)
    assert.deepEqual(
      tab,
      original.tabs.find((item) => item.id === tab.id),
    );
  assert.deepEqual(readState(JSON.stringify(manager.state), A), manager.state);
  const snapshot = structuredClone(manager.state);
  for (const [id, before] of [
    [first, null],
    [third, third],
    ['missing', first],
    [first, 'missing'],
  ])
    manager.move(id, before);
  assert.deepEqual(manager.state, snapshot);
});
