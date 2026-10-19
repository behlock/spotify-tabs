import { PORT } from './config.mjs';
import { SPOTIFY_ORIGIN } from '../../src/constants.ts';
import { verifyListener } from './spotify.mjs';
export async function connect() {
  if (!verifyListener())
    throw new Error('Spotify debugger is not running. Start it with npm start.');
  const targets = await (
    await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(1500) })
  ).json();
  const target =
    Array.isArray(targets) &&
    targets.find((target) => {
      try {
        return target.type === 'page' && new URL(target.url).origin === SPOTIFY_ORIGIN;
      } catch {
        return false;
      }
    });
  if (!target) throw new Error('Spotify desktop renderer not found');
  const url = new URL(target.webSocketDebuggerUrl);
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || Number(url.port) !== PORT)
    throw new Error('Refusing non-local debugger');
  const socket = new WebSocket(url);
  const pending = new Map();
  let id = 0;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const job = pending.get(message.id);
    if (!job) return;
    clearTimeout(job.timer);
    pending.delete(message.id);
    message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const job of pending.values()) {
      clearTimeout(job.timer);
      job.reject(new Error('Spotify connection closed'));
    }
    pending.clear();
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('Debugger connection timed out'));
    }, 5000);
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        reject(new Error('Debugger connection failed'));
      },
      { once: true },
    );
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      if (socket.readyState !== WebSocket.OPEN) {
        reject(new Error('Spotify connection closed'));
        return;
      }
      const requestId = ++id;
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`${method} timed out`));
      }, 10000);
      pending.set(requestId, { resolve, reject, timer });
      try {
        socket.send(JSON.stringify({ id: requestId, method, params }));
      } catch (error) {
        clearTimeout(timer);
        pending.delete(requestId);
        reject(error);
      }
    });
  return {
    send,
    close: () => socket.close(),
    async evaluate(code, ...args) {
      const expression =
        typeof code === 'function'
          ? `(${code.toString()})(${args.map((value) => JSON.stringify(value)).join(',')})`
          : code;
      const result = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails)
        throw new Error(
          result.exceptionDetails.exception?.description || result.exceptionDetails.text,
        );
      return result.result.value;
    },
  };
}
