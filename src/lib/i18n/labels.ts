"use client";
import { useLang } from "@/store/lang";

export const LABELS = {
  grp_overview: { en: "Overview", bn: "সারসংক্ষেপ" },
  grp_sourcing: { en: "Sourcing", bn: "উৎস সংগ্রহ" },
  grp_procurement: { en: "Procurement", bn: "ক্রয়" },
  grp_finance: { en: "Finance", bn: "অর্থ" },
  grp_operations: { en: "Operations", bn: "পরিচালনা" },
  grp_compliance: { en: "Compliance", bn: "সম্মতি" },
  grp_account: { en: "Account", bn: "অ্যাকাউন্ট" },

  nav_dashboard: { en: "Dashboard", bn: "ড্যাশবোর্ড" },
  nav_tenders: { en: "Tenders / RFQs", bn: "টেন্ডার / আরএফকিউ" },
  nav_bids: { en: "My Bids", bn: "আমার দরপত্র" },
  nav_purchase_orders: { en: "Order Information", bn: "অর্ডার তথ্য" },
  nav_invoices: { en: "Invoices", bn: "চালান" },
  nav_payments: { en: "Payments", bn: "পেমেন্ট" },
  nav_bill_submission: { en: "Bill Submission", bn: "বিল জমা" },
  nav_documents: { en: "Documents", bn: "দলিল" },
  nav_reports: { en: "Reports", bn: "রিপোর্ট" },
  nav_notifications: { en: "Notifications", bn: "নোটিফিকেশন" },
  nav_profile: { en: "Company Profile", bn: "কোম্পানি প্রোফাইল" },

  brand_descriptor: { en: "Supplier Portal", bn: "সরবরাহকারী পোর্টাল" },
  search: { en: "Search orders, invoices…", bn: "অনুসন্ধান করুন…" },
  profile: { en: "Profile", bn: "প্রোফাইল" },
  settings: { en: "Settings", bn: "সেটিংস" },
  logout: { en: "Sign out", bn: "সাইন আউট" },
  acting_as: { en: "Acting as", bn: "ভূমিকা" },
  language: { en: "Language", bn: "ভাষা" },

  greeting: { en: "Welcome back", bn: "স্বাগতম" },
  dash_subtitle: { en: "Here's your supplier activity at a glance.", bn: "এক নজরে আপনার সরবরাহকারী কার্যক্রম।" },

  success: { en: "Success", bn: "সফল" },
  pending: { en: "Pending", bn: "পেন্ডিং" },
  failed: { en: "Failed", bn: "ব্যর্থ" },
  view_all: { en: "View all", bn: "সব দেখুন" },
  unread: { en: "unread", bn: "অপঠিত" },
  all_caught_up: { en: "You're all caught up", bn: "সব দেখা হয়ে গেছে" },
  view_all_notifications: { en: "View all notifications", bn: "সব নোটিফিকেশন দেখুন" },
  this_month: { en: "This month", bn: "এই মাস" },
  last_month: { en: "Last month", bn: "গত মাস" },
  today: { en: "Today", bn: "আজ" },
  coming_soon: { en: "Coming soon", bn: "শীঘ্রই আসছে" },
} as const;

export type LabelKey = keyof typeof LABELS;

export function useLabels() {
  const lang = useLang((s) => s.lang);
  const t = (key: LabelKey): string => LABELS[key]?.[lang] ?? key;
  return { t, lang };
}
