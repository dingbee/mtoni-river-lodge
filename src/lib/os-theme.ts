import { useCallback, useSyncExternalStore } from "react";

/**
 * Mtoni OS adaptive theme manager.
 *
 * Centralised, dependency-free. The resolved theme is applied as
 * `data-os-theme="light|dark"` on <html>, and ONLY while the OS shell is
 * mounted — the public website never receives the attribute.
 */
export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "mtoni-os.theme";

let preference: ThemePreference = "system";
let hydrated = false;
const listeners = new Set<() => void>();

function readStored(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

function emit() {
  listeners.forEach((l) => l());
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === "system") return systemPrefersDark() ? "dark" : "light";
  return pref;
}

export function getThemePreference(): ThemePreference {
  if (!hydrated && typeof window !== "undefined") {
    preference = readStored();
    hydrated = true;
  }
  return preference;
}

export function setThemePreference(next: ThemePreference) {
  preference = next;
  hydrated = true;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  let mql: MediaQueryList | undefined;
  if (typeof window !== "undefined" && window.matchMedia) {
    mql = window.matchMedia("(prefers-color-scheme: dark)");
    mql.addEventListener("change", listener);
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) {
      preference = readStored();
      listener();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    mql?.removeEventListener("change", listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

/** Applies (or clears) the OS theme attribute on the document root. */
export function applyOsTheme(theme: ResolvedTheme | null) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (theme) el.setAttribute("data-os-theme", theme);
  else el.removeAttribute("data-os-theme");
}

/**
 * Reads the current preference + resolved theme. `setTheme` persists.
 * SSR-safe: server snapshot is always "system"/"light".
 */
export function useOsTheme() {
  const preferenceValue = useSyncExternalStore(
    subscribe,
    () => getThemePreference(),
    () => "system" as ThemePreference,
  );
  const resolved = useSyncExternalStore(
    subscribe,
    () => resolveTheme(getThemePreference()),
    () => "light" as ResolvedTheme,
  );
  const setTheme = useCallback((next: ThemePreference) => setThemePreference(next), []);
  return { preference: preferenceValue, resolved, setTheme };
}
