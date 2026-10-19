import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createScrollRestorer } from '../src/scroll.ts';

const route = (id) => ({ pathname: '/album/' + id.repeat(22), search: '', hash: '' });
function fixture(t) {
  const frames = new Map();
  let nextFrame = 0;
  let heading;
  const main = { firstElementChild: {}, querySelector: () => heading };
  const viewport = { scrollTop: 0, scrollHeight: 2000, clientHeight: 500 };
  const host = {
    dataset: {},
    querySelector: (selector) => (selector === 'main' ? main : viewport),
  };
  const globals = {
    document: { querySelector: () => main },
    requestAnimationFrame: (callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  const previous = new Map(
    Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const restorer = createScrollRestorer(host);
  t.after(() => {
    restorer.cancel();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return {
    restorer,
    viewport,
    host,
    show(id) {
      heading = {
        textContent: id,
        closest: () => ({ getAttribute: () => 'spotify:album:' + id.repeat(22) }),
      };
      main.firstElementChild = {};
    },
    frame() {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}

test('destination stays hidden until its content can hold the saved offset, then restores before reveal', (t) => {
  const { restorer, viewport, host, show, frame } = fixture(t);
  show('a');
  restorer.prepare();
  restorer.restore(route('b'), 900, false);
  frame();
  assert.equal(host.dataset.stRestoring, 'true');
  assert.equal(viewport.scrollTop, 0, 'must not scroll outgoing entity content');
  viewport.scrollHeight = 600;
  show('b');
  restorer.refresh();
  frame();
  assert.equal(restorer.pending, true);
  viewport.scrollHeight = 2000;
  restorer.refresh();
  assert.equal(viewport.scrollTop, 900, 'mutation callback restores before the next paint');
  frame();
  assert.equal(host.dataset.stRestoring, 'true');
  viewport.scrollTop = 0; // Spotify can reset scroll during its own layout work.
  frame();
  assert.equal(viewport.scrollTop, 900);
  assert.equal(host.dataset.stRestoring, undefined);
  assert.equal(restorer.pending, false);
});

test('same-route tabs restore independently and interaction can cancel a pending restore', (t) => {
  const { restorer, viewport, host, show, frame } = fixture(t);
  show('a');
  restorer.prepare();
  restorer.restore(route('a'), 450, true);
  frame();
  frame();
  assert.equal(viewport.scrollTop, 450);
  assert.equal(restorer.pending, false);
  restorer.prepare();
  restorer.restore(route('b'), 900, false);
  restorer.cancel();
  show('b');
  restorer.refresh();
  frame();
  assert.equal(viewport.scrollTop, 450);
  assert.equal(host.dataset.stRestoring, undefined);
});

test('a rapid second switch replaces the pending destination', (t) => {
  const { restorer, viewport, show, frame } = fixture(t);
  show('a');
  restorer.prepare();
  restorer.restore(route('b'), 800, false);
  restorer.prepare();
  restorer.restore(route('c'), 300, false);
  show('b');
  restorer.refresh();
  frame();
  assert.equal(viewport.scrollTop, 0);
  show('c');
  restorer.refresh();
  frame();
  frame();
  assert.equal(viewport.scrollTop, 300);
  assert.equal(restorer.pending, false);
});
