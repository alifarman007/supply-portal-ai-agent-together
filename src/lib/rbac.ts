"use client";

import type { SupplierRole } from "@/store/auth";
import { useAuth } from "@/store/auth";

export interface Permission { key: string; label: string; }

export const PERMISSIONS: Permission[] = [
  { key: "view_dashboard", label: "View dashboard" },
  { key: "view_tenders", label: "View tenders & bid status" },
  { key: "submit_bids", label: "Submit & manage bids" },
  { key: "view_purchase_orders", label: "View purchase orders" },
  { key: "acknowledge_po", label: "Acknowledge POs" },
  { key: "manage_invoices", label: "Create & submit invoices" },
  { key: "view_payments", label: "View payment history" },
  { key: "manage_deliveries", label: "Create delivery challans" },
  { key: "view_documents", label: "View compliance documents" },
  { key: "upload_documents", label: "Upload documents" },
  { key: "view_reports", label: "View reports" },
  { key: "manage_profile", label: "Edit company profile" },
];

const ALL = PERMISSIONS.map((p) => p.key);

export const ROLE_PERMS: Record<SupplierRole, string[]> = {
  supplier_admin: ALL,
  finance_officer: ["view_dashboard","view_tenders","view_purchase_orders","manage_invoices","view_payments","view_documents","view_reports"],
  logistics_officer: ["view_dashboard","view_tenders","view_purchase_orders","manage_deliveries","view_documents"],
  viewer: ["view_dashboard","view_tenders","view_purchase_orders","view_payments","view_documents","view_reports"],
};

export const SUPPLIER_ROLES: SupplierRole[] = ["supplier_admin","finance_officer","logistics_officer","viewer"];

export const ROLE_CHIP: Record<SupplierRole, string> = {
  supplier_admin: "text-brand-red bg-[color-mix(in_oklab,var(--brand-red)_16%,transparent)] dark:text-brand-cream dark:bg-[color-mix(in_oklab,var(--brand-cream)_16%,transparent)]",
  finance_officer: "text-ok bg-[color-mix(in_oklab,var(--ok)_16%,transparent)]",
  logistics_officer: "text-info bg-[color-mix(in_oklab,var(--info)_16%,transparent)]",
  viewer: "text-muted-foreground bg-[color-mix(in_oklab,var(--muted-foreground)_14%,transparent)]",
};

export const ROLE_LABELS: Record<SupplierRole, string> = {
  supplier_admin: "Admin",
  finance_officer: "Finance Officer",
  logistics_officer: "Logistics Officer",
  viewer: "Viewer",
};

export function hasPermission(role: SupplierRole, key: string): boolean {
  return ROLE_PERMS[role].includes(key);
}

/** Gate UI actions against the acting role set via the user-menu role switcher. */
export function usePermission(key: string): boolean {
  const activeRole = useAuth((s) => s.activeRole);
  return hasPermission(activeRole, key);
}
