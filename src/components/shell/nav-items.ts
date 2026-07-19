import {
  LayoutDashboard,
  Gavel,
  FileSignature,
  ClipboardList,
  Truck,
  FileText,
  Banknote,
  FolderOpen,
  FileBarChart2,
  Bell,
  Building2,
  type LucideIcon,
} from "lucide-react";
import type { LabelKey } from "@/lib/i18n/labels";

export interface NavItem {
  href: string;
  icon: LucideIcon;
  label: LabelKey;
  /** RBAC permission key required to see this item. Omit if always visible. */
  permission?: string;
}

export interface NavGroup {
  label: LabelKey;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "grp_overview",
    items: [
      { href: "/app", icon: LayoutDashboard, label: "nav_dashboard", permission: "view_dashboard" },
      { href: "/app/reports", icon: FileBarChart2, label: "nav_reports", permission: "view_reports" },
    ],
  },
  {
    label: "grp_sourcing",
    items: [
      { href: "/app/tenders", icon: Gavel, label: "nav_tenders", permission: "view_tenders" },
      { href: "/app/bids", icon: FileSignature, label: "nav_bids", permission: "view_tenders" },
    ],
  },
  {
    label: "grp_procurement",
    items: [
      { href: "/app/purchase-orders", icon: ClipboardList, label: "nav_purchase_orders", permission: "view_purchase_orders" },
      { href: "/app/deliveries", icon: Truck, label: "nav_deliveries", permission: "view_purchase_orders" },
    ],
  },
  {
    label: "grp_finance",
    items: [
      { href: "/app/invoices", icon: FileText, label: "nav_invoices", permission: "manage_invoices" },
      { href: "/app/payments", icon: Banknote, label: "nav_payments", permission: "view_payments" },
    ],
  },
  {
    label: "grp_compliance",
    items: [
      { href: "/app/documents", icon: FolderOpen, label: "nav_documents", permission: "view_documents" },
    ],
  },
  {
    label: "grp_account",
    items: [
      { href: "/app/notifications", icon: Bell, label: "nav_notifications" },
      { href: "/app/profile", icon: Building2, label: "nav_profile" },
    ],
  },
];
