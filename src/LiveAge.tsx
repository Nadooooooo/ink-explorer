import { useSyncExternalStore } from "react";

// A single clock for all visible timestamps. No per-row timers or parent rerenders.
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
const formatters = new Map<string,Intl.RelativeTimeFormat>();
const dates = new Map<string,Intl.DateTimeFormat>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) timer = setInterval(() => { now = Date.now(); for (const notify of listeners) notify(); }, 1000);
  return () => { listeners.delete(listener); if (!listeners.size) { clearInterval(timer); timer = undefined; } };
}
export function LiveAge({ timestamp }: { timestamp?: string }) {
  const time = useSyncExternalStore(subscribe, () => now);
  const date = timestamp ? new Date(timestamp) : null;
  if (!date || !Number.isFinite(+date)) return <>—</>;
  const seconds = Math.max(0, Math.floor((time - +date) / 1000));
  const unit = seconds < 60 ? "second" : seconds < 3600 ? "minute" : seconds < 86400 ? "hour" : "day";
  const value = Math.floor(seconds / ({second:1, minute:60, hour:3600, day:86400}[unit]));
  const locale=document.documentElement.lang;
  if(!formatters.has(locale))formatters.set(locale,new Intl.RelativeTimeFormat(locale,{numeric:"always",style:"short"}));
  if(!dates.has(locale))dates.set(locale,new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"medium"}));
  return <time dateTime={date.toISOString()} title={dates.get(locale)!.format(date)}>{formatters.get(locale)!.format(-value, unit)}</time>;
}
