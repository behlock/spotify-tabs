import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const BUNDLE_PATH = fileURLToPath(new URL('../../dist/spotify-tabs.js', import.meta.url));
export const RUNTIME_DIR = fileURLToPath(new URL('../../.runtime/', import.meta.url));
export const SESSION_PATH = fileURLToPath(new URL('../../.runtime/session.json', import.meta.url));
export const PORT = 19343;
