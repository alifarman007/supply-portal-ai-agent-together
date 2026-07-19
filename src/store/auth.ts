"use client";
import { create } from "zustand";

export type SupplierRole = "supplier_admin" | "finance_officer" | "logistics_officer" | "viewer";

export interface SupplierUser {
  id: string;
  name: string;
  email: string;
  role: SupplierRole;
  supplierId: string;
  initials: string;
  companyName: string;
}

const DEMO_USER: SupplierUser = {
  id: "sup-u-001",
  name: "Ahsan Kabir",
  email: "ahsan.kabir@dhakapackaging.com.bd",
  role: "supplier_admin",
  supplierId: "SP-2024-001",
  initials: "AK",
  companyName: "Dhaka Packaging Industries Ltd.",
};

interface AuthState {
  user: SupplierUser | null;
  isAuthed: boolean;
  activeRole: SupplierRole;
  login: (u?: SupplierUser) => void;
  logout: () => void;
  setActiveRole: (r: SupplierRole) => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: DEMO_USER,
  isAuthed: true,
  activeRole: DEMO_USER.role,
  login: (u = DEMO_USER) => set({ user: u, isAuthed: true, activeRole: u.role }),
  logout: () => set({ user: null, isAuthed: false }),
  setActiveRole: (r) => set({ activeRole: r }),
}));
