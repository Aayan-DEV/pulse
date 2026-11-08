// Tiny in-memory TTL cache shared by the live fetchers (per server process).
type Entry = { at: number; value: unknown; pending?: Promise<unknown> };
const store = new Map<string, Entry>();

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs && !hit.pending) return hit.value as T;
  if (hit?.pending) return hit.pending as Promise<T>;
  const pending = fn();
  store.set(key, { at: hit?.at ?? 0, value: hit?.value, pending });
  try {
    const value = await pending;
    store.set(key, { at: Date.now(), value });
    return value;
  } catch (e) {
    // keep the last good value, drop the pending marker, rethrow so the caller logs the error
    if (hit && hit.value !== undefined) store.set(key, { at: hit.at, value: hit.value });
    else store.delete(key);
    throw e;
  }
}

export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${new URL(url).host}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export const USER_AGENT = "pulse-demo/0.1 github.com/panlytics";
