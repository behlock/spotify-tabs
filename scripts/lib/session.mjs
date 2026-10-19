import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { RUNTIME_DIR, SESSION_PATH } from './config.mjs';

export async function readSession() {
  try {
    const session = JSON.parse(await readFile(SESSION_PATH, 'utf8'));
    return Number.isInteger(session?.pid) && session.pid > 0 ? { pid: session.pid } : null;
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

export function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

export async function writeSession() {
  await mkdir(RUNTIME_DIR, { recursive: true, mode: 0o700 });
  await writeFile(SESSION_PATH, JSON.stringify({ pid: process.pid }) + '\n', { mode: 0o600 });
}

export async function removeSession(pid) {
  if ((await readSession())?.pid === pid) await unlink(SESSION_PATH);
}
