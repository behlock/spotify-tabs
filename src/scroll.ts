import type { Route } from './routes.ts';
import { readPageTitle, titleBelongsToRoute } from './title.ts';

export function createScrollRestorer(host: HTMLElement) {
  let pending = false;
  let target: { route: Route; y: number; sameRoute: boolean } | null = null;
  let baseline = readPageTitle();
  let baselineContent = host.querySelector('main')?.firstElementChild;
  let contentChanged = false;
  let stableFrames = 0;
  let frame: number | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const viewport = () => host.querySelector<HTMLElement>('[data-overlayscrollbars-viewport]');

  function cancel() {
    pending = false;
    target = null;
    stableFrames = 0;
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    clearTimeout(timeout);
    delete host.dataset.stRestoring;
  }

  function apply(): boolean {
    if (!pending || !target) return false;
    const element = viewport();
    if (!element || element.scrollHeight - element.clientHeight + 1 < target.y) return false;
    const title = readPageTitle();
    const belongs = title ? titleBelongsToRoute(title, target.route) : null;
    if (!target.sameRoute) {
      if (belongs === false) return false;
      const newTitle =
        title && (title.element !== baseline?.element || title.text !== baseline?.text);
      const newContent = host.querySelector('main')?.firstElementChild !== baselineContent;
      if (belongs !== true && !newTitle && !newContent && !(target.y === 0 && contentChanged))
        return false;
    }
    element.scrollTop = target.y;
    return Math.abs(element.scrollTop - target.y) <= 2;
  }

  function settle() {
    frame = undefined;
    if (!pending) return;
    if (!apply()) {
      stableFrames = 0;
      return;
    }
    if (++stableFrames >= 2) cancel();
    else frame = requestAnimationFrame(settle);
  }

  return {
    get position() {
      return viewport()?.scrollTop || 0;
    },
    get pending() {
      return pending;
    },
    prepare() {
      cancel();
      baseline = readPageTitle();
      baselineContent = host.querySelector('main')?.firstElementChild;
      contentChanged = false;
      pending = true;
      host.dataset.stRestoring = 'true';
      timeout = setTimeout(() => {
        const element = viewport();
        if (element && target) element.scrollTop = target.y;
        cancel();
      }, 6000);
    },
    restore(route: Route, y: number, sameRoute: boolean) {
      target = { route, y, sameRoute };
      if (frame === undefined) frame = requestAnimationFrame(settle);
    },
    refresh() {
      if (!pending) return;
      contentChanged = true;
      apply();
      if (frame === undefined) frame = requestAnimationFrame(settle);
    },
    cancel,
  };
}
