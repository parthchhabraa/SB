/**
 * Stands in for next/navigation in the design preview.
 *
 * The current path is set by the screen switcher so that navigation state,
 * such as which tab reads as current, renders exactly as it does in the app.
 */
let currentPath = "/subjects";
const listeners = new Set<() => void>();

export function setPreviewPath(path: string) {
  currentPath = path;
  for (const fn of listeners) fn();
}

export function usePathname() {
  // Read directly rather than through state: the switcher re-renders the tree
  // whenever it changes the path, so there is nothing to subscribe to.
  return currentPath;
}

export function useRouter() {
  return {
    push: () => undefined,
    replace: () => undefined,
    refresh: () => undefined,
    back: () => undefined,
    forward: () => undefined,
    prefetch: () => undefined,
  };
}

export function useSearchParams() {
  return new URLSearchParams();
}

export function redirect() {
  return undefined;
}

export { listeners as previewPathListeners };
