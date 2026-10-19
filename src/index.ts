import { SPOTIFY_ORIGIN } from './constants.ts';
import { findRouter } from './router.ts';
import { mountTabs } from './runtime.ts';

if (location.origin === SPOTIFY_ORIGIN && !window.__spotifyTabs) {
  let attempts = 0;
  const bootstrap = setInterval(() => {
    const router = findRouter();
    const host = document.querySelector<HTMLElement>('#main-view');
    if (router && host) {
      clearInterval(bootstrap);
      window.__spotifyTabs = mountTabs(router, host);
    } else if (++attempts >= 120) {
      clearInterval(bootstrap);
      if (window.__spotifyTabs?.status === 'waiting-for-router')
        window.__spotifyTabs.status = 'unsupported';
      console.warn('[Spotify Tabs] No compatible router or main view.');
    }
  }, 250);

  window.__spotifyTabs = {
    status: 'waiting-for-router',
    dispose() {
      clearInterval(bootstrap);
      delete window.__spotifyTabs;
    },
  };
}
