import { test } from 'node:test';
import assert from 'node:assert/strict';
import { titleBelongsToRoute } from '../src/title.ts';
const route = (pathname) => ({ pathname, search: '', hash: '' });
const title = (uri) => ({ element: {}, text: 'Eric Prydz', entityUri: uri });
test('artist titles are accepted only for the matching entity page', () => {
  const artist = '5sm0jQ1mq0dusiLtDJ2b4R';
  assert.equal(
    titleBelongsToRoute(title('spotify:artist:' + artist), route('/artist/' + artist)),
    true,
  );
  assert.equal(
    titleBelongsToRoute(title('spotify:artist:' + artist), route('/artist/4tZwfgrHOc3mvqYlEYSvVi')),
    false,
  );
  assert.equal(
    titleBelongsToRoute(title('spotify:artist:' + artist), route('/album/' + artist)),
    false,
  );
});
test('pages without an entity marker keep the heading-change freshness check', () => {
  assert.equal(titleBelongsToRoute(title(null), route('/artist/5sm0jQ1mq0dusiLtDJ2b4R')), null);
  assert.equal(titleBelongsToRoute(title(null), route('/search/jazz')), null);
});
