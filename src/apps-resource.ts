type AppsReader = (path: string, signal?: AbortSignal) => Promise<unknown>;
type AppsPreload = { url: string; controller: AbortController; promise: Promise<unknown> };
let preload: AppsPreload | undefined;
export const APPS_LIST_ENDPOINT = "/dapps?view=list";
export const appsEndpoint = (id?: string) => id ? "/dapps" : APPS_LIST_ENDPOINT;

/** Hand the initial read to the mounted page once; revisits and retries read again. */
export function preloadApps(scope: string, read: AppsReader, endpoint = "/dapps") {
  const url = scope + endpoint;
  if (preload?.url === url) return;
  cancelAppsPreload();
  const controller = new AbortController();
  const promise = read(endpoint, controller.signal);
  // The route module may still be loading when an API error arrives.
  void promise.catch(() => {});
  preload = { url, controller, promise };
}

export function cancelAppsPreload() {
  const previous = preload;
  preload = undefined;
  previous?.controller.abort();
}

export async function readApps(scope: string, read: AppsReader, signal?: AbortSignal, endpoint = "/dapps"): Promise<unknown> {
  signal?.throwIfAborted();
  const pending = preload;
  if (!pending || pending.url !== scope + endpoint) {
    cancelAppsPreload();
    return read(endpoint, signal);
  }
  preload = undefined;
  const cancel = () => pending.controller.abort(signal?.reason);
  signal?.addEventListener("abort", cancel, { once: true });
  return pending.promise.then(value => {
    signal?.throwIfAborted();
    return value;
  }).finally(() => signal?.removeEventListener("abort", cancel));
}
