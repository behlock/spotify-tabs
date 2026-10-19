import { execFileSync, spawnSync } from 'node:child_process';
import { PORT } from './config.mjs';

export function verifyListener() {
  if (process.platform !== 'darwin') throw new Error('The desktop launcher supports macOS only.');
  let output;
  try {
    output = execFileSync('/usr/sbin/lsof', ['-nP', `-iTCP:${PORT}`, '-sTCP:LISTEN', '-Fpcn'], {
      encoding: 'utf8',
    });
  } catch (error) {
    if (error.status === 1 && !error.stdout) return false;
    throw error;
  }
  const names = output
    .split('\n')
    .filter((line) => line.startsWith('n'))
    .map((line) => line.slice(1));
  const pid = output.match(/^p(\d+)$/m)?.[1];
  if (!pid || names.length !== 1 || names[0] !== `127.0.0.1:${PORT}`) {
    throw new Error('Refusing debugger: listener is not exclusively on IPv4 loopback.');
  }
  const owner = execFileSync('/bin/ps', ['-p', pid, '-o', 'uid='], { encoding: 'utf8' }).trim();
  const command = execFileSync('/bin/ps', ['-p', pid, '-o', 'comm='], { encoding: 'utf8' }).trim();
  if (
    owner !== String(process.getuid()) ||
    !command.endsWith('/Spotify.app/Contents/MacOS/Spotify')
  ) {
    throw new Error('Refusing debugger: port is not owned by your Spotify application.');
  }
  return true;
}

export function launchSpotify() {
  if (verifyListener()) return;
  if (spawnSync('/usr/bin/pgrep', ['-x', 'Spotify']).status === 0) {
    throw new Error(
      'Spotify is running without the debugger. Quit Spotify, then run npm start again.',
    );
  }
  const opened = spawnSync('/usr/bin/open', [
    '-a',
    'Spotify',
    '--args',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${PORT}`,
  ]);
  if (opened.error) throw opened.error;
  if (opened.status !== 0) throw new Error('Could not launch Spotify.');
}
