"use client";
import { create } from "zustand";
export type Theme = "light" | "dark";
function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  try { localStorage.setItem("kazifarms-theme", theme); } catch {}
}
interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
  hydrate: () => void;
}
export const useTheme = create<ThemeState>((set, get) => ({
  theme: "light",
  setTheme: (t) => { applyTheme(t); set({ theme: t }); },
  toggle: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    applyTheme(next); set({ theme: next });
  },
  hydrate: () => {
    if (typeof document === "undefined") return;
    const attr = document.documentElement.getAttribute("data-theme");
    set({ theme: attr === "dark" ? "dark" : "light" });
  },
}));
