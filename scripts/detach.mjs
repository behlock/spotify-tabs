import { setTimeout as delay } from 'node:timers/promises';
import { STORAGE_KEY } from '../src/constants.ts';
import { connect } from './lib/cdp.mjs';
import { isProcessAlive, readSession, removeSession } from './lib/session.mjs';

const clear = process.argv.includes('--clear');
const client = await connect();
try {
  const session = await readSession();
  // Reload registrations belong to the original CDP session. Its launcher must remove them.
  await client.evaluate(
    (clear, key) => {
      window.__spotifyTabsDetachRequested = true;
      window.__spotifyTabs?.dispose();
      if (clear) localStorage.removeItem(key);
    },
    clear,
    STORAGE_KEY,
  );
  if (session) {
    for (let attempt = 0; isProcessAlive(session.pid); attempt++) {
      if (attempt === 50)
        throw new Error(
          'Tabs removed, but the launcher is still stopping. Stop it before starting another instance.',
        );
      await delay(100);
    }
    await removeSession(session.pid);
  }
  await client.evaluate(() => {
    delete window.__spotifyTabsDetachRequested;
  });
  console.log('Tabs removed. Quit Spotify to close its local debugging port.');
} finally {
  client.close();
}
