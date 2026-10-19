import { SPOTIFY_ORIGIN } from '../src/constants.ts';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { connect } from './lib/cdp.mjs';
import { BUNDLE_PATH, PORT } from './lib/config.mjs';
import { isProcessAlive, readSession, removeSession, writeSession } from './lib/session.mjs';
import { launchSpotify } from './lib/spotify.mjs';

let client;
let scriptId;
let stopping = false;
let ownsSession = false;

async function cleanup() {
  if (stopping) return;
  stopping = true;
  if (client) {
    try {
      if (scriptId)
        await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptId });
    } catch {}
    try {
      await client.evaluate(
        'window.__spotifyTabs?.dispose(); delete window.__spotifyTabsDetachRequested',
      );
    } catch {}
    client.close();
  }
  if (ownsSession) await removeSession(process.pid);
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await cleanup();
    process.exit(0);
  });

try {
  const source = await readFile(BUNDLE_PATH, 'utf8').catch(() => {
    throw new Error('Run npm run build first.');
  });
  const previous = await readSession();
  if (previous && isProcessAlive(previous.pid))
    throw new Error('Spotify Tabs is already running. Run npm run detach first.');
  launchSpotify();
  for (let attempt = 0; attempt < 60; attempt++) {
    if (stopping) break;
    try {
      client = await connect();
      break;
    } catch {}
    await delay(500);
  }
  if (!client) throw new Error('Could not connect to the Spotify desktop renderer.');
  await client.evaluate(
    'window.__spotifyTabs?.dispose(); delete window.__spotifyTabsDetachRequested',
  );
  await client.send('Page.enable');
  const registration = await client.send('Page.addScriptToEvaluateOnNewDocument', { source });
  scriptId = registration.identifier;
  await writeSession();
  ownsSession = true;
  await client.evaluate(source);
  console.log(
    'Spotify Tabs attached on 127.0.0.1:' +
      PORT +
      '. Keep this launcher running. Ctrl+C removes the tabs.',
  );
  console.log('The local debugger has no authentication. Quit Spotify to close it. See README.md.');
  let ready = false;
  let failures = 0;
  while (!stopping) {
    await delay(1000);
    try {
      const live = await client.evaluate(
        '({origin:location.origin,status:window.__spotifyTabs?.status,attached:!!document.getElementById("spotify-tabs")?.isConnected,detach:!!window.__spotifyTabsDetachRequested})',
      );
      if (live.detach) break;
      const status = live.status;
      failures = 0;
      if (status === 'unsupported') {
        console.error('Spotify router/main view is unsupported by this build.');
        process.exitCode = 1;
        break;
      }
      if (!ready && status === 'ready') {
        ready = true;
        console.log('Tab bar ready. Use +, ×, ⌘T, or ⌘1…9.');
      }
      if (status === 'ready' && !live.attached) {
        await client.evaluate('window.__spotifyTabs?.dispose()');
        await client.evaluate(source);
      }
      if (!status && live.origin === SPOTIFY_ORIGIN) await client.evaluate(source);
    } catch {
      if (++failures >= 3) break;
    }
  }
  await cleanup();
} catch (error) {
  console.error(error.message);
  await cleanup();
  process.exitCode = 1;
}
