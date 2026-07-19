# Sysnova Supplier Portal — Frontend Implementation Plan

## Context

Sysnova ERP (Bangladesh-based) needs a dedicated **Supplier Portal** so vendors can view purchase orders, submit invoices, track payments, manage delivery challans, and maintain compliance documents — all within a single branded web app. The frontend is needed for a demo today, so it uses dummy data throughout. FastAPI + ERP integration comes in a later phase.

The UI must exactly replicate the design system from `/home/shariar-karim/dev/projects/upay-corporate-billing-portal/` — same glass morphism, same Tailwind CSS 4 token system, same shadcn/ui component library, same Framer Motion animations, same sidebar + topbar shell.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router), TypeScript |
| Styling | Tailwind CSS 4 + shadcn/ui (radix-nova) |
| Animations | Framer Motion |
| State | Zustand (auth, theme, lang, ui) |
| Data fetching | TanStack React Query v5 |
| Forms | React Hook Form + Zod |
| Tables | TanStack Table v8 |
| Charts | Recharts |
| Icons | Lucide React |
| Toasts | Sonner |
| Dates | date-fns |

---

## Implementation Sequence

### Step 1 — Scaffold & Dependency Install

```bash
cd /home/shariar-karim/dev/projects/supplier-portal
npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*" --no-git
```

Then install all dependencies matching the reference portal exactly:

```bash
npm install \
  @hookform/resolvers@^5.4.0 \
  @tanstack/react-query@^5.101.0 \
  @tanstack/react-table@^8.21.3 \
  class-variance-authority@^0.7.1 \
  clsx@^2.1.1 \
  date-fns@^4.4.0 \
  framer-motion@^12.40.0 \
  lucide-react@^1.17.0 \
  next-themes@^0.4.6 \
  radix-ui@^1.5.0 \
  react-hook-form@^7.78.0 \
  recharts@^3.8.1 \
  shadcn@^4.10.0 \
  sonner@^2.0.7 \
  tailwind-merge@^3.6.0 \
  tw-animate-css@^1.4.0 \
  zod@^4.4.3 \
  zustand@^5.0.14

npm install --save-dev @tailwindcss/postcss@^4
```

Initialize shadcn **matching the reference exactly** — `components.json` must use:
```jsonc
{
  "style": "radix-nova",           // NOT new-york
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",                  // empty — Tailwind 4 is CSS-first, NO tailwind.config.ts
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": { "components": "@/components", "utils": "@/lib/utils",
               "ui": "@/components/ui", "lib": "@/lib", "hooks": "@/hooks" },
  "menuColor": "default",
  "menuAccent": "subtle"
}
```
```bash
npx shadcn@latest init   # choose radix-nova style, neutral base color, CSS variables: yes
```
> Note: `radix-ui` is installed as a **single** package (`^1.5.0`), not individual `@radix-ui/*` packages. Do not create a `tailwind.config.ts` — all theming lives in `globals.css` via `@theme inline`.

Add all needed shadcn components:
```bash
npx shadcn@latest add button input label card avatar badge table select tabs \
  scroll-area separator alert checkbox radio-group switch textarea progress \
  dialog dropdown-menu popover sheet tooltip skeleton sonner
```

---

### Step 2 — Design System (globals.css)

**File:** `src/app/globals.css`

Copy the complete CSS from the reference portal (`upay-corporate-billing-portal/src/app/globals.css`) verbatim. This includes:
- `@import "tailwindcss"`, `tw-animate-css`, `shadcn/tailwind.css`
- `@custom-variant dark` wired to `[data-theme="dark"]`
- `@theme inline` block with all CSS variable mappings
- Brand constants (`:root` — `--brand-blue: #0054a6`, `--brand-yellow: #ffd602`, ok/warn/danger/info)
- `[data-theme="light"]` and `[data-theme="dark"]` blocks
- `.glass` and `.glass-raised` component classes
- Body background gradient + grain overlay

The only change: update `localStorage` key from `"upay-theme"` / `"upay-lang"` to `"sysnova-theme"` / `"sysnova-lang"` in the no-flash script.

---

### Step 3 — Root Layout

**File:** `src/app/layout.tsx`

Mirror the reference layout exactly:
- Import `Plus_Jakarta_Sans` and `Hind_Siliguri` from `next/font/google`
- Inject no-flash inline script (reads `sysnova-theme` / `sysnova-lang` from localStorage, sets `data-theme` and `lang` on `<html>`)
- Wrap with `<Providers>` (React Query + Tooltip provider)
- `<Toaster position="top-right" richColors closeButton />`
- Metadata: `title: "Sysnova Supplier Portal"`

**File:** `src/app/providers.tsx`
- `QueryClientProvider` + `TooltipProvider`

---

### Step 4 — Zustand Stores

**Files in `src/store/`:**

**`auth.ts`** — Supplier session
```ts
interface SupplierUser {
  id: string; name: string; email: string;
  role: "admin" | "finance" | "logistics" | "viewer";
  supplierId: string; initials: string; companyName: string;
}
const DEMO_USER: SupplierUser = {
  id: "sup-001", name: "Rafiqul Islam",
  email: "rafiqul@dhakapackaging.com", role: "admin",
  supplierId: "SP-2024-001", initials: "RI",
  companyName: "Dhaka Packaging Industries Ltd."
}
// state: user, isAuthed, activeRole, login(), logout(), setActiveRole()
// Pre-seeded as logged in for demo
```

**`theme.ts`** — Light/dark toggle. Default `"dark"` (matches SSR `<html data-theme="dark">` to avoid hydration mismatch). `applyTheme()` sets `data-theme` attr + persists to `localStorage("sysnova-theme")`. Includes a **`hydrate()`** method that reconciles the store to the value the no-flash script already applied (called from `providers.tsx` in a `useEffect` after mount). Copy this pattern verbatim from the reference `store/theme.ts`.

**`lang.ts`** — EN/BN toggle, same `hydrate()` pattern, persists to `localStorage("sysnova-lang")`, sets `lang` attr on `<html>`.

**`ui.ts`** — `sidebarCollapsed: false`, `mobileNavOpen: false`, `toggleSidebar()`, `setMobileNav()`

> **Note:** `next-themes` is installed (matching the reference's deps) but **not used** — theming is driven entirely by the Zustand store + `data-theme` attribute + the no-flash inline script. Do not introduce `next-themes` ThemeProvider.

**`rbac.ts`** (in `src/lib/`) — Mirror the reference's `lib/rbac.ts`: a `PERMISSIONS` list, a `ROLE_PERMS: Record<Role, string[]>` map, `ROLES` array, and a `ROLE_CHIP` map (tailwind classes using `color-mix(...)` for tinted role badges). Supplier roles → permissions:
```ts
admin:     ALL
finance:   view_dashboard, manage_invoices, view_payments, view_reports, view_documents
logistics: view_dashboard, view_purchase_orders, manage_deliveries, view_documents
viewer:    view_dashboard, view_reports
```
Used by `UserMenu` (role chip) and to conditionally show action buttons.

---

### Step 5 — Mock Data Layer

**Files in `src/lib/mock/`:**

**`types.ts`** — TypeScript types for all domain entities:
```ts
type POStatus = "draft" | "issued" | "acknowledged" | "partially_fulfilled" | "fulfilled" | "cancelled"
type InvoiceStatus = "draft" | "submitted" | "under_review" | "approved" | "paid" | "rejected"
type DeliveryStatus = "scheduled" | "in_transit" | "delivered" | "grn_confirmed"
type DocumentType = "trade_license" | "tin_certificate" | "bin_vat" | "bank_solvency" | "iso_cert"
type DocumentStatus = "verified" | "pending" | "expired" | "expiring_soon"
type Role = "admin" | "finance" | "logistics" | "viewer"

interface PurchaseOrder { id, poNumber, issueDate, deliveryDueDate, buyerDept, items[], totalAmount, vatAmount, status, terms, notes }
interface POLineItem { id, description, unit, quantity, unitPrice, totalPrice }
interface Invoice { id, invoiceNumber, poId, poNumber, issueDate, dueDate, items[], subtotal, vatAmount, aitAmount, totalAmount, status, remarks, submittedAt, approvedAt, paidAt }
interface Payment { id, invoiceId, invoiceNumber, paymentDate, grossAmount, vatDeducted, aitDeducted, tdsDeducted, netPaid, bankRef, bankName, accountNumber, remittanceRef }
interface DeliveryChallan { id, challanNumber, poId, poNumber, issueDate, deliveryDate, items[], status, driverName, vehicleNumber, receivedBy, grnNumber }
interface ComplianceDocument { id, type, title, fileUrl, uploadedAt, expiryDate, status, verifiedBy }
interface Notification { id, type, title, message, createdAt, read, link }
interface SupplierProfile { id, companyName, tinNumber, binNumber, tradeLicenseNo, incorporationType, registeredAddress, contactPerson, email, phone, bankName, branchName, accountNumber, routingNumber, authorizedSignatories[] }
```

**`supplier-data.ts`** (equivalent of the reference's `bengali-data.ts`) — realistic Bangladesh data pools used by the seed generator:
- `SUPPLIER` constant (company identity), `BUYER_DEPARTMENTS`, `DELIVERY_ADDRESSES` (Dhaka/Narayanganj/Savar areas), `PRODUCT_DESCRIPTIONS` (e.g. "Corrugated Carton Box (30×20×15 cm)", "BOPP Laminated Woven Bag", "Stretch Wrap Film"), `BANKS` (Dutch-Bangla, BRAC, EBL, IBBL), `PERSON_NAMES` (Bengali names)
- `mulberry32(seed)` deterministic PRNG (copy from reference) so seed data + screenshots are reproducible

**`db.ts`** — In-memory Bangladesh-realistic data, generated deterministically from a fixed `NOW = new Date("2026-06-30T10:00:00+06:00")`:

Supplier: **Dhaka Packaging Industries Ltd.** (TIN: 123456789012, BIN: 000012345-0301, Trade License: DNCC/2024/TL/089234)

20 Purchase Orders across buyer departments: Procurement, Operations, IT, HR, Marketing — from companies like "Sysnova Industries Ltd." Values in BDT (৳50,000 – ৳25,00,000)

25 Invoices with lifecycle stages. Mix of paid (older), under review, approved, submitted, one rejected.

15 Payments over 6 months (Jan–Jun 2026). Deductions: 15% VAT at source (partial), 3% AIT.

12 Delivery Challans linked to POs.

Documents: 5 types, 2 verified, 1 pending, 1 expired, 1 expiring soon.

Dashboard KPIs:
- Active POs: 8
- Pending Invoices: 5
- Total Received YTD: ৳1,24,75,000
- Overdue Invoices: 2
- Monthly trend data (6 months)
- Invoice status donut breakdown
- Delivery performance bars

**`api.ts`** — Async mock functions returning promises (same interface for later FastAPI swap):
```ts
getKpiSummary(), getPurchaseOrders(filters?), getPurchaseOrder(id), 
getInvoices(filters?), getInvoice(id), createInvoice(data), 
getPayments(filters?), getDeliveries(filters?), getDocuments(),
getNotifications(), markNotificationRead(id),
getProfile(), updateProfile(data)
```

---

### Step 6 — Shell Components

Mirror the reference shell exactly. Files in `src/components/shell/`:

**`nav-items.ts`** — Supplier portal nav groups:
```ts
[
  { label: "Overview", items: [
    { href: "/app", icon: LayoutDashboard, label: "Dashboard" },
    { href: "/app/reports", icon: FileBarChart2, label: "Reports" },
  ]},
  { label: "Procurement", items: [
    { href: "/app/purchase-orders", icon: ClipboardList, label: "Purchase Orders" },
    { href: "/app/deliveries", icon: Truck, label: "Deliveries" },
  ]},
  { label: "Finance", items: [
    { href: "/app/invoices", icon: FileText, label: "Invoices" },
    { href: "/app/payments", icon: Banknote, label: "Payments" },
  ]},
  { label: "Compliance", items: [
    { href: "/app/documents", icon: FolderOpen, label: "Documents" },
  ]},
  { label: "Account", items: [
    { href: "/app/notifications", icon: Bell, label: "Notifications" },
    { href: "/app/profile", icon: Building2, label: "Company Profile" },
  ]},
]
```

**`AppShell.tsx`** — Identical structure to reference: `<Sidebar />` + `<div id="app-root">` + `<TopBar />` + `<main>`

**`Sidebar.tsx`** — Copy exactly from reference. Logo changes to "Sysnova" wordmark.

**`SidebarNav.tsx`** — Copy exactly; uses `nav-items.ts` above.

**`TopBar.tsx`** — Adapted: remove `WalletPill` and `BranchSwitcher`; keep search, `LangToggle`, `ThemeToggle`, notification bell, `UserMenu`.

**`Logo.tsx`** — "IP" monogram in brand blue + "Supplier Portal" text

**`UserMenu.tsx`** — Dropdown: company name, role, role switcher, logout

**`LangToggle.tsx`**, **`ThemeToggle.tsx`**, **`NotificationBell.tsx`**, **`MobileNav.tsx`** — Copy from reference, adapt localStorage keys.

---

### Step 7 — Common Components

**Files in `src/components/common/`:**

- **`PageHeader.tsx`** — Copy exactly from reference
- **`Widget.tsx`** — Copy exactly from reference
- **`StatusPill.tsx`** — Colored badge (uses `ok`/`warn`/`danger`/`info` CSS vars):
  ```ts
  const statusConfig = {
    // PO statuses
    issued: { label: "Issued", color: "info" },
    acknowledged: { label: "Acknowledged", color: "ok" },
    partially_fulfilled: { label: "Partial", color: "warn" },
    fulfilled: { label: "Fulfilled", color: "ok" },
    cancelled: { label: "Cancelled", color: "danger" },
    // Invoice statuses
    submitted: { label: "Submitted", color: "info" },
    under_review: { label: "Under Review", color: "warn" },
    approved: { label: "Approved", color: "ok" },
    paid: { label: "Paid", color: "ok" },
    rejected: { label: "Rejected", color: "danger" },
    // Delivery
    scheduled: { label: "Scheduled", color: "info" },
    in_transit: { label: "In Transit", color: "warn" },
    delivered: { label: "Delivered", color: "ok" },
    grn_confirmed: { label: "GRN Confirmed", color: "ok" },
  }
  ```

---

### Step 8 — Format Utilities

**`src/lib/format/money.ts`** — BDT formatting with ৳ symbol, South Asian comma system (e.g., ৳1,24,75,000):
```ts
export function formatBDT(amount: number, opts?: { lang?: string }): string
// Uses Intl.NumberFormat("en-IN") for comma placement, prepends ৳
```

**`src/lib/format/date.ts`** — Date formatting helpers using date-fns

**`src/lib/format/tax.ts`** — Pure Bangladesh tax helpers reused by the invoice form and seed data:
```ts
export const VAT_RATE = 0.15;   // standard NBR VAT
export const AIT_RATE = 0.03;   // advance income tax
export const calcVAT = (subtotal: number) => subtotal * VAT_RATE;
export const calcAIT = (subtotal: number) => subtotal * AIT_RATE;
export const calcNetPayable = (subtotal: number) =>
  subtotal + calcVAT(subtotal) - calcAIT(subtotal);
```

**`src/lib/utils.ts`** — `cn()` helper (clsx + tailwind-merge)

**`src/lib/i18n/labels.ts`** — EN/BN bilingual labels for nav, common UI strings

---

### Step 9 — React Query Layer

**`src/lib/query/client.ts`** — `QueryClient` with default staleTime 30s

**`src/lib/query/hooks.ts`** — Custom hooks:
```ts
useKpiSummary(), usePurchaseOrders(filters), usePurchaseOrder(id),
useInvoices(filters), useInvoice(id), useCreateInvoice(),
usePayments(filters), useDeliveries(filters), useDocuments(),
useNotifications(), useMarkNotificationRead(), useProfile()
```

---

### Step 10 — Login Page

**File:** `src/app/login/page.tsx`

Two-step flow matching reference exactly:
1. **Step 1 — Credentials:** Email + password (prefilled: `rafiqul@dhakapackaging.com` / `demo1234`)
2. **Step 2 — OTP:** 6-digit code (expected: `135790`)

Animated background: 3 gradient blobs with Framer Motion continuous animation (brand blue + yellow blobs on `#060d1a`)

Split layout:
- Left panel: Sysnova brand side — "Supplier Portal" heading, tagline in EN/BN, 3 feature bullet points
- Right panel: Form with glass card, step transitions via AnimatePresence

Demo credentials visible in a subtle hint box.

---

### Step 11 — Dashboard Page

**File:** `src/app/app/page.tsx`

Staggered Framer Motion grid (same pattern as reference).

KPI Tiles (4):
1. **Active Purchase Orders** — count with sparkline of monthly PO trend
2. **Pending Invoices** — count with status mini-bar (submitted/under review/overdue)
3. **Total Received (YTD)** — BDT amount with delta vs last year
4. **Overdue Invoices** — count with red warning state

Charts:
- **Payment Trend** (xl:col-span-8) — Area chart: Monthly payments received over 6 months (BDT), this year vs last year
- **Invoice Status Mix** (xl:col-span-4) — Donut: paid/approved/under review/submitted/rejected
- **PO Fulfillment** (xl:col-span-4) — Bar chart: fulfilled vs pending by month
- **Recent POs** (xl:col-span-4) — List of 5 latest POs with status pills
- **Recent Invoices** (xl:col-span-4) — List of 5 latest invoices with amounts

---

### Step 12 — Purchase Orders

**`src/app/app/purchase-orders/page.tsx`** — List page:
- `PageHeader` with "Purchase Orders" + "Acknowledge" action button
- Filter bar: status dropdown, date range, search by PO number
- TanStack Table: PO Number, Issue Date, Buyer Dept, Items Count, Total Amount (BDT), Delivery Due, Status pill, Actions
- Row click → detail page

**`src/app/app/purchase-orders/[id]/page.tsx`** — Detail page:
- PageHeader: PO number + status pill + "Acknowledge PO" button (if status = issued)
- Two columns: PO metadata (left glass card) + line items table (right)
- Terms & conditions section
- Delivery schedule
- Action history timeline

---

### Step 13 — Invoices

**`src/app/app/invoices/page.tsx`** — List page:
- Filter bar: status, date range, PO number search
- TanStack Table: Invoice #, PO Ref, Issue Date, Due Date, Total (BDT), VAT, Status, Actions
- "Create Invoice" button → `/app/invoices/new`

**`src/app/app/invoices/new/page.tsx`** — Create invoice form:
- Step 1: Select PO (dropdown of acknowledged POs)
- Step 2: Add line items (auto-populated from PO, editable quantities)
- VAT calculation: 15% auto-computed on subtotal
- AIT field: 3% (editable)
- Grand total display
- Submit button → creates draft then submits

**`src/app/app/invoices/[id]/page.tsx`** — Detail page:
- Invoice metadata + line items table
- VAT/AIT breakdown box
- Approval timeline (submitted → under review → approved → paid)
- Status pill + action buttons (Download PDF - stub)

---

### Step 14 — Payments

**`src/app/app/payments/page.tsx`**:
- PageHeader: "Payment History" + Export button (stub)
- Summary bar: Total Received, Total Deductions, Net Paid
- TanStack Table: Date, Invoice Ref, Gross Amount, VAT Deducted, AIT Deducted, Net Paid, Bank Ref, Status
- All amounts in BDT with `tnum` class
- Filter: date range, amount range

---

### Step 15 — Deliveries

**`src/app/app/deliveries/page.tsx`**:
- Filter: status, date, PO number
- TanStack Table: Challan #, PO Ref, Issue Date, Delivery Date, Items Count, Status pill, GRN #
- "Create Challan" button

**`src/app/app/deliveries/new/page.tsx`**:
- Select PO dropdown
- Auto-populate items from PO
- Driver name, vehicle number fields
- Delivery date picker
- Submit creates challan

---

### Step 16 — Documents

**`src/app/app/documents/page.tsx`**:
- Alert bar for expired/expiring documents (danger/warn)
- Grid of document cards (6 cards):
  - Document type icon, title, upload date, expiry date
  - Status pill: Verified / Pending / Expired / Expiring Soon
  - "Upload New" button (stub, no file system)
  - "Download" button (stub)

---

### Step 17 — Reports

**`src/app/app/reports/page.tsx`**:
- Tabs: Outstanding Receivables | Payment History | VAT Summary | PO Fulfillment
- Each tab: filter controls + table/chart
- Export to CSV button (stub)

---

### Step 18 — Notifications

**`src/app/app/notifications/page.tsx`**:
- List of notifications, grouped by date
- Types: PO issued (blue), Invoice approved (green), Payment received (green), Invoice rejected (red), Document expiring (amber)
- Mark as read on click
- "Mark all read" button

---

### Step 19 — Company Profile

**`src/app/app/profile/page.tsx`**:
- Three glass sections:
  1. **Company Info**: Name, TIN, BIN, Trade License, Incorporation type, Registered address
  2. **Bank Details**: Bank name, Branch, Account #, Routing #
  3. **Contacts**: Primary contact, email, phone, authorized signatories
- Edit mode toggle (form becomes editable, Save/Cancel buttons appear)

---

## File Structure Summary

```
supplier-portal/src/
├── app/
│   ├── layout.tsx                    # Root layout (fonts, no-flash script, Providers)
│   ├── globals.css                   # Design system (copied + adapted from reference)
│   ├── providers.tsx                 # QueryClient + TooltipProvider
│   ├── login/page.tsx               # 2-step login
│   └── app/
│       ├── layout.tsx               # AppShell wrapper + auth guard
│       ├── page.tsx                 # Dashboard
│       ├── purchase-orders/
│       │   ├── page.tsx
│       │   └── [id]/page.tsx
│       ├── invoices/
│       │   ├── page.tsx
│       │   ├── new/page.tsx
│       │   └── [id]/page.tsx
│       ├── payments/page.tsx
│       ├── deliveries/
│       │   ├── page.tsx
│       │   └── new/page.tsx
│       ├── documents/page.tsx
│       ├── reports/page.tsx
│       ├── notifications/page.tsx
│       └── profile/page.tsx
├── components/
│   ├── shell/
│   │   ├── AppShell.tsx
│   │   ├── Sidebar.tsx
│   │   ├── SidebarNav.tsx
│   │   ├── TopBar.tsx
│   │   ├── Logo.tsx
│   │   ├── UserMenu.tsx
│   │   ├── LangToggle.tsx
│   │   ├── ThemeToggle.tsx
│   │   ├── NotificationBell.tsx
│   │   ├── MobileNav.tsx
│   │   └── nav-items.ts
│   ├── ui/                          # All shadcn primitives
│   ├── common/
│   │   ├── PageHeader.tsx
│   │   ├── Widget.tsx
│   │   └── StatusPill.tsx
│   └── charts/
│       ├── KpiTile.tsx
│       ├── TrendArea.tsx
│       ├── DonutChart.tsx
│       ├── BarChart.tsx
│       └── Sparkline.tsx
├── lib/
│   ├── utils.ts
│   ├── mock/
│   │   ├── types.ts
│   │   ├── db.ts
│   │   └── api.ts
│   ├── query/
│   │   ├── client.ts
│   │   └── hooks.ts
│   ├── format/
│   │   ├── money.ts
│   │   └── date.ts
│   └── i18n/labels.ts
└── store/
    ├── auth.ts
    ├── theme.ts
    ├── lang.ts
    └── ui.ts
```

---

## Bangladesh Business Logic Details

### VAT / Tax Rules
- Standard VAT: **15%** on invoice subtotal (applied on most goods/services)
- AIT (Advance Income Tax): **3–5%** on service payments
- TDS (Tax Deducted at Source): Applied per NBR schedule
- Invoice must show TIN of both buyer and supplier
- BIN (Business Identification Number) = VAT registration number

### Supplier Portal Workflow
```
PO Issued → Supplier Acknowledges → Delivery Challan Created → Goods Delivered
→ Buyer GRN Confirmed → Invoice Submitted (with challan ref) → Under Review
→ Finance Approves → Payment Processed → Remittance Advice Sent
```

### Currency Format
- BDT symbol: **৳** (Unicode U+09F3)
- South Asian grouping: 1,00,000 (lakh) not 100,000
- Implementation: `Intl.NumberFormat("en-IN")` then replace ₹ with ৳

---

## FastAPI Migration Path (Later Phase)

The mock layer is the **only** swap point. When the backend is ready, replace each function body in `src/lib/mock/api.ts` with a `fetch()` (or axios) call to the FastAPI endpoint, keeping the same signatures and return types. Every React Query hook, component, and page stays untouched. Recommended: move `api.ts` behind an `NEXT_PUBLIC_API_BASE_URL` env flag so the demo can toggle between mock and live.

---

## Build Order & Effort (single focused day, ~6–7 hrs)

Build in this order so the app is demo-able as early as possible:
1. Scaffold + design system + shell (globals.css, layout, stores, AppShell/Sidebar/TopBar) — **~1.5 hr**
2. Mock data layer (types, supplier-data, db, api, query hooks) — **~0.75 hr**
3. Login page — **~0.5 hr**
4. Dashboard (highest demo value) — **~0.75 hr**
5. Purchase Orders (list + detail) — **~0.75 hr**
6. Invoices (list + create form + detail) — **~1 hr**
7. Payments — **~0.5 hr**
8. Deliveries, Documents, Reports, Notifications, Profile — **~1 hr**
9. Polish: loading skeletons, empty states, auth guard, responsive checks — **~0.5 hr**

---

## Verification

After implementation, verify the demo end-to-end:
1. `npm run dev` starts on localhost:3000
2. Login page loads with animated background → credentials step → OTP step → redirects to `/app`
3. Dashboard renders 4 KPI tiles, area chart, donut chart, bar chart, recent POs/invoices lists
4. Sidebar collapses/expands smoothly; all nav links route to correct pages
5. Purchase Orders page: table with filters, row click → detail with line items
6. Invoices: list + "Create Invoice" → PO selection → line items → VAT calculation → submit
7. Payments: table with BDT amounts and deductions
8. Documents: grid with status pills, expired document alert
9. Theme toggle (dark ↔ light) persists on refresh
10. Language toggle (EN ↔ BN) switches labels
11. Responsive on mobile: hamburger menu, sidebar hides
