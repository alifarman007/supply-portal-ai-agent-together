import {
  LayoutDashboard,
  Gavel,
  FileSignature,
  ShoppingCart,
  ReceiptText,
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
      { href: "/app/purchase-orders", icon: ShoppingCart, label: "nav_purchase_orders", permission: "view_purchase_orders" },
      { href: "/app/bills", icon: ReceiptText, label: "nav_bill_submission", permission: "view_purchase_orders" },
    ],
  },
  {
    label: "grp_finance",
    items: [
      // Invoices are hidden for now — Bill Submission is the way in. The routes
      // still exist and are linked from Order Information and Reports, so
      // restoring this line is all that's needed to bring the section back.
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
