"use client";
import { create } from "zustand";
export type Lang = "en" | "bn";
function applyLang(lang: Lang) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("lang", lang);
  try { localStorage.setItem("kazifarms-lang", lang); } catch {}
}
interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
  hydrate: () => void;
}
export const useLang = create<LangState>((set, get) => ({
  lang: "en",
  setLang: (l) => { applyLang(l); set({ lang: l }); },
  toggle: () => {
    const next: Lang = get().lang === "en" ? "bn" : "en";
    applyLang(next); set({ lang: next });
  },
  hydrate: () => {
    if (typeof document === "undefined") return;
    const attr = document.documentElement.getAttribute("lang");
    set({ lang: attr === "bn" ? "bn" : "en" });
  },
}));
