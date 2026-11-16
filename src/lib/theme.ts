"use client";
import { useSyncExternalStore } from "react";

export type ThemePref = "escuro" | "claro" | "sistema";
const KEY = "altum:theme";
const listeners = new Set<() => void>();

export function readPref(): ThemePref {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return v === "claro" || v === "sistema" ? v : "escuro";
  } catch {
    return "escuro";
  }
}

function resolveLight(pref: ThemePref): boolean {
  return pref === "claro" || (pref === "sistema" && window.matchMedia("(prefers-color-scheme: light)").matches);
}

export function applyTheme(pref: ThemePref) {
  if (resolveLight(pref)) document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
  try {
    localStorage.setItem(KEY, JSON.stringify(pref));
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  const onSystem = () => {
    if (readPref() === "sistema") applyTheme("sistema");
  };
  mq.addEventListener("change", onSystem);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", onSystem);
  };
}

/** Preferência escolhida (escuro, claro ou sistema). */
export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, readPref, () => "escuro" as ThemePref);
}

/** Tema efetivamente aplicado agora. */
export function useIsLight(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.getAttribute("data-theme") === "light",
    () => false,
  );
}
