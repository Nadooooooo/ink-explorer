type LoadReason = "initial" | "resume" | "poll";
type PageResourceOptions<T> = {
  load: (signal: AbortSignal) => Promise<T>;
  onStart: (reason: LoadReason) => void;
  onValue: (value: T) => void;
  onError: (error: unknown) => void;
  onSuspend?: () => void;
  interval?: number;
  once?: boolean;
  expiresAt?: (value: T) => number;
};

/** Own a page-bound request, including suspension, cancellation and late replies. */
export function observePageResource<T>(options: PageResourceOptions<T>): () => void {
  let disposed = false, suspended = false, offline = navigator.onLine === false;
  let generation = 0, hasValue = false, lastStarted = -Infinity;
  let request: AbortController | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const clearExpiry = () => { clearTimeout(expiry); expiry = undefined; };
  const clearTimer = () => { clearTimeout(timer); timer = undefined; };
  const cancel = () => { generation++; request?.abort(); request = undefined; clearTimer(); clearExpiry(); };
  const active = () => !disposed && !suspended && !document.hidden && !offline && navigator.onLine !== false;
  const load = async (reason: LoadReason, force = false) => {
    if (!active() || request || options.once && hasValue) return;
    // visibilitychange, pageshow and focus commonly arrive together.
    if (!force && performance.now() - lastStarted < 1000) return;
    clearTimer(); lastStarted = performance.now();
    const current = ++generation, controller = new AbortController(); request = controller;
    const currentRequest = () => !disposed && current === generation && !controller.signal.aborted;
    options.onStart(reason === "poll" && !hasValue ? "resume" : reason);
    try {
      const value = await options.load(controller.signal);
      if (currentRequest()) {
        const expiresAt = options.expiresAt?.(value);
        if (expiresAt !== undefined && (!Number.isFinite(expiresAt) || expiresAt <= Date.now())) throw new Error("Data source unavailable");
        clearExpiry();
        hasValue = true; options.onValue(value);
        if (expiresAt !== undefined) {
          // Expire even while a later poll is waiting for its response.
          expiry = setTimeout(() => {
            expiry = undefined;
            if (!active()) return;
            hasValue = false;
            options.onError(new Error("Data source unavailable"));
          }, expiresAt - Date.now());
        }
      }
    } catch (error) {
      if (currentRequest()) { clearExpiry(); hasValue = false; options.onError(error); }
    } finally {
      if (current === generation) {
        request = undefined;
        if (active() && options.interval && !(options.once && hasValue)) {
          timer = setTimeout(() => void load("poll", true), options.interval);
        }
      }
    }
  };
  const suspend = () => {
    if (suspended) return;
    suspended = true; cancel(); options.onSuspend?.();
  };
  const resume = () => {
    if (disposed || document.hidden || offline || navigator.onLine === false) return;
    const force = suspended;
    suspended = false;
    void load("resume", force);
  };
  const visibility = () => document.hidden ? suspend() : resume();
  const goOffline = () => {
    offline = true; suspend();
    if (!(options.once && hasValue)) options.onError(new Error("apiConnectionFailed"));
  };
  const goOnline = () => { offline = false; resume(); };
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", suspend);
  window.addEventListener("pageshow", resume);
  window.addEventListener("focus", resume);
  window.addEventListener("offline", goOffline);
  window.addEventListener("online", goOnline);
  if (offline) goOffline(); else if (document.hidden) suspend(); else void load("initial", true);
  return () => {
    disposed = true; cancel();
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("pagehide", suspend);
    window.removeEventListener("pageshow", resume);
    window.removeEventListener("focus", resume);
    window.removeEventListener("offline", goOffline);
    window.removeEventListener("online", goOnline);
  };
}
