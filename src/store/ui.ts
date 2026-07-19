"use client";
import { create } from "zustand";

interface UiState {
  mobileNavOpen: boolean;
  setMobileNav: (open: boolean) => void;
}

export const useUi = create<UiState>((set) => ({
  mobileNavOpen: false,
  setMobileNav: (open) => set({ mobileNavOpen: open }),
}));
