# Kazi Farms Supplier Portal — Frontend API Contract

**Audience:** iDempiere backend team
**Purpose:** For every screen in the supplier portal, this document lists the API endpoints that screen calls, and the exact JSON fields the frontend expects back (or sends up).

The frontend is already built and running against a mock data layer
(`src/lib/mock/api.ts` + `src/lib/mock/types.ts`). Every field listed here is a field the
UI actually renders today — nothing is speculative. If a field is not in this doc, the
frontend does not use it and you do not need to expose it.

**Status of this document:** it is a *frontend requirements* spec, not an agreed contract.
The endpoint paths are proposals — rename them freely. The **field names and value shapes
are what matter**, because they are hard-wired into the React components. If you must
rename a field, tell us and we will map it.

---

## 0. Live demo — open the screen while you read the spec

> ### 🔗 **https://kfg-supplier-portal.vercel.app/**

Every section in §4 has a **▶ Open screen** link. Click it to see exactly what the JSON on
that page renders into. The fastest way to understand a field is to find it on screen.

**Sign in** (credentials are pre-filled on the login form — just click through):

| | |
|---|---|
| Email | `ahsan.kabir@dhakapackaging.com.bd` |
| Password | `Demo@2026!` |
| OTP code | `135790` |

**Important:** this deployment runs entirely on **mock data generated in the browser**
(`src/lib/mock/db.ts`). There is no backend behind it — that is what you are building.
Consequences:

- Nothing persists. Submit a bill, refresh, and it is gone.
- Record IDs in the URLs (`po-008`, `tnd-001`) are mock IDs. Yours will be iDempiere IDs.
- The ~600 ms delay before data appears is a deliberate `setTimeout` simulating network
  latency, so you can see the loading skeletons. It is not slowness.

**To see the RBAC rules in §5 in action:** click the avatar at the top-right → **Switch
role**. Pick `Finance Officer` or `Viewer` and watch sidebar items and action buttons
disappear. That is the permission matrix rendered live.

---

## 1. Conventions

### 1.1 Base URL & versioning

```
https://<host>/api/v1/supplier
```

All endpoints in this document are relative to that base.

### 1.2 Authentication

- Session is established by `POST /auth/login` → `POST /auth/verify-otp`.
- After that, every request carries `Authorization: Bearer <accessToken>`.
- The supplier identity is derived **server-side from the token**. The frontend never
  sends `supplierId` as a filter — the backend must scope every list to the calling
  supplier's `C_BPartner`. This is a hard security requirement.

### 1.3 Response envelope

Single resource and list endpoints return the payload directly (no `{data: ...}` wrapper),
because the frontend's React Query layer consumes it as-is:

```jsonc
// GET /purchase-orders/po-001
{ "id": "po-001", "poNumber": "PO-2026-0001", ... }
```

Lists return a bare JSON array:

```jsonc
// GET /purchase-orders
[ { "id": "po-001", ... }, { "id": "po-002", ... } ]
```

> If you prefer a paginated envelope (`{ "items": [], "total": 0, "page": 1 }`), that is
> fine — tell us and we will adapt the fetch layer. But **pick one and apply it everywhere.**
> Current volumes (tens–hundreds of rows per supplier) do not require pagination.

### 1.4 Error format

```jsonc
{
  "error": {
    "code": "PO_NOT_FOUND",           // stable machine code, used for branching
    "message": "Purchase order not found",  // shown in a toast, must be user-safe English
    "fields": {                        // optional, for 422 form validation
      "amount": "Bill amount cannot exceed the order value"
    }
  }
}
```

HTTP codes: `400` bad request · `401` expired/invalid token · `403` permission denied ·
`404` not found · `409` state conflict (e.g. acknowledging an already-acknowledged PO) ·
`422` validation · `500` server error.

### 1.5 Data type rules — please read, these cause the most bugs

| Concern | Rule |
|---|---|
| **Money** | Send as a **JSON number in BDT**, not a string, not paisa. `1250000` means ৳12,50,000. Round to whole taka on the server — the UI does not render decimals. |
| **Dates / timestamps** | Always **ISO 8601 UTC with timezone**: `"2026-08-14T09:30:00.000Z"`. Never `"14/08/2026"`, never a bare date without time for timestamp fields. Date-only fields (issue date, expiry date) may be sent as ISO datetime at midnight — the frontend formats them. |
| **IDs** | Send as **strings**, even if iDempiere's `*_ID` is numeric. `"id": "1000042"` not `"id": 1000042`. Mixed types break React keys and URL routing. |
| **Enums** | Lowercase `snake_case` strings from the fixed lists in §2. Do **not** send iDempiere's single-character reference values (`"CO"`, `"DR"`, `"IP"`) — map them server-side. Do not send display labels; the frontend owns translation to English/Bangla. |
| **Nulls** | Omit optional fields or send `null`. Do not send `""` or `"N/A"` — the UI uses presence to decide whether to render a row. |
| **Booleans** | Real `true`/`false`, not `"Y"`/`"N"`. |
| **Arrays** | Never `null`. An empty list is `[]`. |

### 1.6 Field naming

`camelCase` throughout. The frontend consumes these directly as TypeScript object
properties.

---

## 2. Shared enums

These are closed sets. Any value outside them will render as a blank/grey pill.

```jsonc
"POStatus":       "draft" | "issued" | "acknowledged" | "partially_fulfilled" | "fulfilled" | "cancelled"
"InvoiceStatus":  "draft" | "submitted" | "under_review" | "approved" | "paid" | "rejected"
"PaymentStatus":  "paid" | "processing" | "failed"
"DeliveryStatus": "scheduled" | "in_transit" | "delivered" | "grn_confirmed"
"DocumentType":   "trade_license" | "tin_certificate" | "vat_registration" | "bank_solvency" | "iso_certification"
"DocumentStatus": "valid" | "expiring_soon" | "expired" | "pending_verification"
"TenderStatus":   "published" | "evaluation" | "negotiation" | "awarded" | "closed" | "cancelled"
"BidStatus":      "draft" | "submitted" | "under_evaluation" | "clarification_requested" | "shortlisted" | "awarded" | "not_awarded" | "rejected"
"SupplierRole":   "supplier_admin" | "finance_officer" | "logistics_officer" | "viewer"
"NotificationType": "po_issued" | "po_acknowledged" | "grn_confirmed"
                  | "invoice_approved" | "invoice_rejected" | "payment_received"
                  | "document_expiring"
                  | "tender_published" | "bid_clarification_requested"
                  | "bid_shortlisted" | "bid_awarded" | "bid_not_awarded"
```

**Note on PO status:** the supplier-facing UI relabels these — `acknowledged` displays as
"Waiting for Delivery", `partially_fulfilled` as "Partially Delivered", `fulfilled` as
"Delivered". Send the raw enum; the frontend does the relabelling.

---

## 3. Screen → endpoint map (quick reference)

Every screen name links to the live demo. Detail screens use a representative record —
noted where the choice matters (e.g. a PO in `issued` status is the only one that shows the
Acknowledge button).

| # | Screen (click to open) | Endpoints called |
|---|---|---|
| 0 | [Login](https://kfg-supplier-portal.vercel.app/login) | `POST /auth/login`, `POST /auth/verify-otp`, `POST /auth/resend-otp` |
| 1 | [Dashboard](https://kfg-supplier-portal.vercel.app/app) | `GET /dashboard/kpi`, `GET /purchase-orders`, `GET /invoices`, `GET /tenders?status=published` |
| 2 | [Tenders list](https://kfg-supplier-portal.vercel.app/app/tenders) | `GET /tenders`, `GET /bids` |
| 3 | [Tender detail](https://kfg-supplier-portal.vercel.app/app/tenders/tnd-002) | `GET /tenders/{id}`, `GET /tenders/{id}/bid`, `GET /documents`, `POST /tenders/{id}/clarifications` |
| 4 | [Submit bid](https://kfg-supplier-portal.vercel.app/app/tenders/tnd-001/bid) | `GET /tenders/{id}`, `GET /tenders/{id}/bid`, `POST /bids` |
| 5 | [Bids list](https://kfg-supplier-portal.vercel.app/app/bids) | `GET /bids` |
| 6 | [Bid detail](https://kfg-supplier-portal.vercel.app/app/bids/bid-002) | `GET /bids/{id}`, `POST /bids/{id}/clarifications/{cid}/response` |
| 7 | [Order Information (PO list)](https://kfg-supplier-portal.vercel.app/app/purchase-orders) | `GET /purchase-orders`, `GET /invoices` |
| 8 | [Order detail](https://kfg-supplier-portal.vercel.app/app/purchase-orders/po-008) | `GET /purchase-orders/{id}`, `GET /invoices`, `GET /payments`, `GET /profile`, `POST /purchase-orders/{id}/acknowledge` |
| 9 | [Bill Submission list](https://kfg-supplier-portal.vercel.app/app/bills) | `GET /purchase-orders`, `GET /invoices` |
| 10 | [Submit Bill form](https://kfg-supplier-portal.vercel.app/app/bills/po-008) | `GET /purchase-orders/{id}`, `POST /invoices` |
| 11 | [Payment History](https://kfg-supplier-portal.vercel.app/app/payments) | `GET /payments`, `GET /invoices`, `GET /purchase-orders` |
| 12 | [Invoices list](https://kfg-supplier-portal.vercel.app/app/invoices) *(hidden from nav)* | `GET /invoices` |
| 13 | [Invoice detail](https://kfg-supplier-portal.vercel.app/app/invoices/inv-001) | `GET /invoices/{id}` |
| 14 | [New invoice](https://kfg-supplier-portal.vercel.app/app/invoices/new) *(hidden from nav)* | `GET /purchase-orders/acknowledged`, `POST /invoices` |
| 15 | [Compliance Documents](https://kfg-supplier-portal.vercel.app/app/documents) | `GET /documents`, `POST /documents` *(upload — not yet wired)* |
| 16 | [Reports](https://kfg-supplier-portal.vercel.app/app/reports) | `GET /invoices`, `GET /purchase-orders`, `GET /challans`, `GET /dashboard/kpi` |
| 17 | [Notifications](https://kfg-supplier-portal.vercel.app/app/notifications) | `GET /notifications`, `POST /notifications/{id}/read`, `POST /notifications/read-all` |
| 18 | [Company Profile](https://kfg-supplier-portal.vercel.app/app/profile) | `GET /profile`, `PATCH /profile` |
| — | App shell (every screen) | `GET /me`, `GET /notifications` (bell badge) |

**Demo records worth knowing**, if you want to explore states other than the linked ones:

| Entity | IDs | Notable states |
|---|---|---|
| Purchase orders | `po-001` … `po-014` | `po-008`–`po-012`, `po-014` = **issued** (Acknowledge button visible) · `po-005`–`po-007` = acknowledged · `po-003`, `po-004` = partially delivered · `po-001`, `po-002` = delivered · `po-013` = cancelled |
| Tenders | `tnd-001` … `tnd-008` | `tnd-001`, `tnd-007` = **published, no bid yet** (bid form is open) · `tnd-002` = published, already bid · `tnd-003` = negotiation · `tnd-004`, `tnd-005` = awarded · `tnd-008` = cancelled |
| Bids | `bid-001` … `bid-004` | `bid-002` = **clarification_requested** (response box visible) · `bid-001` = under evaluation · `bid-003` = awarded · `bid-004` = not awarded |
| Invoices | `inv-001` … `inv-011` | `inv-001`–`inv-005` = paid (full timeline) |
| Documents | `doc-001` … `doc-006` | Includes expired and expiring-soon docs that trigger the banners |

---

## 4. Screen-by-screen contracts

---

### 0. Login — `/login`

▶ **Open screen:** [Login screen](https://kfg-supplier-portal.vercel.app/login)

Two-step: credentials → OTP.

#### `POST /auth/login`

**Request**
```jsonc
{
  "email": "ahsan.kabir@dhakapackaging.com.bd",
  "password": "••••••••"
}
```

**Response 200**
```jsonc
{
  "otpRequired": true,
  "otpToken": "opaque-challenge-token",   // echoed back on verify
  "otpDestination": "+880 1•••• ••23",    // already masked BY THE BACKEND
  "resendAfterSeconds": 30
}
```

#### `POST /auth/verify-otp`

**Request**
```jsonc
{ "otpToken": "opaque-challenge-token", "code": "135790" }
```

**Response 200**
```jsonc
{
  "accessToken": "jwt...",
  "refreshToken": "jwt...",
  "expiresIn": 3600,
  "user": {
    "id": "sup-u-001",
    "name": "Ahsan Kabir",
    "email": "ahsan.kabir@dhakapackaging.com.bd",
    "role": "supplier_admin",
    "supplierId": "SP-2024-001",
    "companyName": "Dhaka Packaging Industries Ltd.",
    "initials": "AK"                       // optional; frontend derives if absent
  }
}
```

**Response 401** on a wrong code:
```jsonc
{ "error": { "code": "OTP_INVALID", "message": "Incorrect code.",
             "attemptsRemaining": 2, "locked": false } }
```

The UI locks the form after 3 failed attempts. `attemptsRemaining` and `locked` must come
from the server — the current client-side counter is demo-only.

#### `POST /auth/resend-otp` → `{ "otpToken": "...", "resendAfterSeconds": 30 }`

#### `GET /me`
Returns the same `user` object as above. Called on app boot to restore the session.

---

### 1. Dashboard — `/app`

▶ **Open screen:** [Dashboard](https://kfg-supplier-portal.vercel.app/app)

The single heaviest screen. It renders four KPI tiles, three charts, and three "latest"
lists.

#### `GET /dashboard/kpi`

Everything here is **pre-aggregated server-side**. Do not expect the frontend to compute it.

**Response 200**
```jsonc
{
  "activePOs": 12,
  "pendingInvoices": 5,
  "openBids": 3,
  "overdueInvoices": 2,

  "totalReceivedYTD": 48250000,
  "totalReceivedMTD": 6120000,
  "totalReceivedLastMonth": 5480000,
  "duePaymentAmount": 9340000,     // sum of totalAmount for invoices in
                                   // submitted | under_review | approved
  "growthPct": 12.4,               // headline % on the Transactions card

  "deliveriesThisMonth": 34,
  "deliveryChangePct": 8.2,        // vs last month; may be negative

  // Payment trend chart — 12 entries, oldest first
  "monthlyPaymentTrend": [
    { "month": "Sep", "paid": 4200000, "lastYear": 3800000 }
  ],

  // Donut chart. `label` and `color` are presentation — send them, or tell us
  // and we will hard-code them on the frontend instead.
  "invoiceStatusBreakdown": [
    { "status": "paid", "label": "Paid", "count": 18, "color": "#22c55e" }
  ],

  // On-time vs late deliveries per month. Also feeds the Reports on-time rate.
  "deliveryPerformance": [
    { "month": "Sep", "onTime": 11, "late": 2 }
  ],

  // Performance chart: orders raised vs deliveries completed, per month
  "monthlyOrderDelivery": [
    { "month": "Sep", "order": 14, "delivery": 12 }
  ],

  // Delivery Statistics chart: day-by-day for the selected month
  "dailyDeliveryStats": [
    { "day": "01", "ordered": 3, "delivered": 2 }
  ],

  // Trailing 7 days behind the three summary tiles
  "weeklyBreakdown": [
    { "day": 1, "orders": 4, "deliveries": 3, "payments": 2 }
  ],
  "monthTotals": { "orders": 42, "deliveries": 38, "payments": 21 },

  "recentActivity": [
    {
      "id": "act-001",
      "type": "po_issued",
      "description": "PO-2026-0014 issued by Feed Mill Division",
      "timestamp": "2026-08-14T09:30:00.000Z",
      "link": "/app/purchase-orders/po-014"   // optional, frontend route
    }
  ]
}
```

**Open questions for you:**
- The dashboard has year/month dropdowns for the Performance and Delivery Statistics
  charts. Right now they filter client-side. If you'd rather filter server-side, add
  `?year=2026&month=08` query params to this endpoint and we'll wire them up.
- `link` in `recentActivity` is a **frontend route path**. If that's awkward, send
  `{ "entityType": "purchase_order", "entityId": "po-014" }` instead and we'll build the
  path.

The dashboard also calls `GET /purchase-orders`, `GET /invoices`, and
`GET /tenders?status=published` to show the five most recent of each. Those use the
standard list contracts below.

---

### 2. Tenders list — `/app/tenders`

▶ **Open screen:** [Tenders list](https://kfg-supplier-portal.vercel.app/app/tenders)

#### `GET /tenders?status={TenderStatus|all}&search={string}`

`search` matches tender number, title, or category. Sorted by `publishedDate` descending.

**Response 200** — array of tender objects. The list view uses only these fields, but the
same shape as the detail is fine:

```jsonc
[{
  "id": "tnd-001",
  "tenderNumber": "TND-2026-0007",
  "title": "Supply of Corrugated Packaging Cartons",
  "category": "Packaging",
  "buyerDepartment": "Feed Mill Division",
  "publishedDate": "2026-07-20T00:00:00.000Z",
  "submissionDeadline": "2026-08-30T17:00:00.000Z",
  "estimatedValue": 8500000,
  "status": "published"
}]
```

This screen also calls `GET /bids` to show whether the supplier has already bid on each
tender (matched on `bid.tenderId`).

---

### 3. Tender detail — `/app/tenders/{id}`

▶ **Open screen:** [Tender detail (tnd-002 — published, bid already placed)](https://kfg-supplier-portal.vercel.app/app/tenders/tnd-002)

#### `GET /tenders/{id}`

**Response 200**
```jsonc
{
  "id": "tnd-001",
  "tenderNumber": "TND-2026-0007",
  "title": "Supply of Corrugated Packaging Cartons",
  "category": "Packaging",
  "description": "Full scope narrative, plain text.",
  "buyerDepartment": "Feed Mill Division",
  "buyerContactName": "Nusrat Jahan",
  "buyerContactEmail": "nusrat.jahan@kazifarms.com",
  "publishedDate": "2026-07-20T00:00:00.000Z",
  "submissionDeadline": "2026-08-30T17:00:00.000Z",
  "bidOpeningDate": "2026-09-02T11:00:00.000Z",
  "estimatedValue": 8500000,

  "items": [{
    "id": "tli-001",
    "description": "5-ply corrugated carton, 40x30x25 cm",
    "specification": "180 GSM kraft liner, printed 2-colour",
    "unit": "pcs",
    "quantity": 50000,
    "estimatedUnitPrice": 34,      // buyer's indicative rate
    "vdsApplicable": true,         // VAT deducted at source on this line
    "tdsApplicable": true
  }],

  "eligibilityCriteria": [
    "Minimum 3 years of packaging supply experience",
    "Valid BSTI certification"
  ],
  "termsAndConditions": [
    "Delivery within 45 days of PO issue"
  ],
  "requiredDocuments": ["trade_license", "vat_registration", "iso_certification"],

  "status": "published",

  "clarifications": [{
    "id": "tc-001",
    "question": "Is single-colour printing acceptable?",
    "askedBy": "Ahsan Kabir",
    "askedAt": "2026-07-25T10:12:00.000Z",
    "response": "Yes, single colour is acceptable.",   // optional
    "respondedBy": "Nusrat Jahan",                     // optional
    "respondedAt": "2026-07-26T09:00:00.000Z"          // optional
  }],

  "awardedSupplierName": "Dhaka Packaging Industries Ltd.",  // only when status=awarded
  "awardedAt": "2026-09-10T00:00:00.000Z",                   // only when status=awarded
  "cancelReason": "Requirement withdrawn"                     // only when status=cancelled
}
```

`eligibilityCriteria` and `termsAndConditions` are **arrays of strings**, one bullet per
element — not one blob with newlines.

The screen cross-references `GET /documents` against `requiredDocuments` to show the
supplier which compliance docs they are missing before bidding.

#### `GET /tenders/{id}/bid`

Returns this supplier's bid on this tender, or `null` (HTTP 200 with body `null`, not 404)
if they have not bid. Same shape as the Bid object in §6.

#### `POST /tenders/{id}/clarifications`

**Request**
```jsonc
{ "question": "Is single-colour printing acceptable?" }
```
**Response 200** — the full updated Tender object (with the new clarification appended).
`askedBy` and `askedAt` are set server-side from the token.

---

### 4. Submit bid — `/app/tenders/{id}/bid`

▶ **Open screen:** [Bid form (tnd-001 — published, no bid yet)](https://kfg-supplier-portal.vercel.app/app/tenders/tnd-001/bid)

Loads the tender (§3) to build the line-item form, checks `GET /tenders/{id}/bid` to block
duplicate submission, then:

#### `POST /bids`

**Request**
```jsonc
{
  "tenderId": "tnd-001",
  "technicalNotes": "We propose 200 GSM liner as an upgrade at no extra cost.",
  "bidValidityDays": 90,
  "items": [{
    "tenderLineItemId": "tli-001",
    "specificationOffered": "5-ply, 200 GSM kraft liner, 2-colour",
    "unitPrice": 32
  }]
}
```

> The frontend currently also sends `description`, `unit`, and `quantity` on each item,
> copied from the tender line. **The backend should ignore those and read them from the
> tender line itself** — the supplier cannot change them, so trusting the client is wrong.
> We will strip them once you confirm.

**Money must be computed server-side.** Do not trust client totals. The rule:
```
lineTotal    = quantity × unitPrice
subtotal     = Σ lineTotal
vatAmount    = round(subtotal × 0.15)
totalBidAmount = subtotal + vatAmount
```

**Response 201** — the created Bid object (§6), with `bidNumber`, `status: "submitted"`,
and an initial `timeline` entry.

**Validation the backend must enforce** (the UI checks these too, but they are not
authoritative): deadline not passed; tender `status === "published"`; no existing bid;
every tender line quoted; `unitPrice > 0`; `bidValidityDays` between 30 and 180.

---

### 5. Bids list — `/app/bids`

▶ **Open screen:** [Bids list](https://kfg-supplier-portal.vercel.app/app/bids)

#### `GET /bids?status={BidStatus|all}&search={string}`

`search` matches bid number, tender number, or tender title. Sorted by `submittedAt`
descending. Array of Bid objects — the list uses `bidNumber`, `tenderNumber`,
`tenderTitle`, `submittedAt`, `totalBidAmount`, `status`.

---

### 6. Bid detail — `/app/bids/{id}`

▶ **Open screen:** [Bid detail (bid-002 — clarification requested)](https://kfg-supplier-portal.vercel.app/app/bids/bid-002)

#### `GET /bids/{id}`

```jsonc
{
  "id": "bid-001",
  "bidNumber": "BID-2026-0003",
  "tenderId": "tnd-001",
  "tenderNumber": "TND-2026-0007",     // denormalised — saves a second call
  "tenderTitle": "Supply of Corrugated Packaging Cartons",
  "supplierId": "SP-2024-001",
  "submittedAt": "2026-08-05T14:20:00.000Z",
  "technicalNotes": "…",

  "items": [{
    "id": "bli-001",
    "tenderLineItemId": "tli-001",
    "description": "5-ply corrugated carton, 40x30x25 cm",
    "unit": "pcs",
    "quantity": 50000,
    "specificationOffered": "200 GSM kraft liner, 2-colour",
    "unitPrice": 32,
    "totalPrice": 1600000
  }],

  "subtotal": 1600000,
  "vatAmount": 240000,
  "totalBidAmount": 1840000,
  "bidValidityDays": 90,

  "status": "under_evaluation",
  "technicalScore": 82,                // optional, 0–100, only after evaluation
  "financialScore": 91,                // optional, 0–100
  "evaluationRemarks": "Strong technical response.",  // optional

  "clarifications": [{
    "id": "bc-001",
    "question": "Please confirm your delivery lead time.",
    "askedBy": "Nusrat Jahan",
    "askedAt": "2026-08-10T09:00:00.000Z",
    "response": "30 days from PO.",     // optional — null until supplier answers
    "respondedAt": "2026-08-11T08:15:00.000Z"
  }],

  "timeline": [{
    "status": "submitted",
    "timestamp": "2026-08-05T14:20:00.000Z",
    "actor": "Ahsan Kabir",             // optional
    "note": "Bid submitted via supplier portal"   // optional
  }]
}
```

`timeline` is rendered as a vertical audit trail. Order it **oldest first**.

#### `POST /bids/{id}/clarifications/{clarificationId}/response`

**Request** `{ "response": "30 days from PO issue." }`

**Response 200** — full updated Bid. Side effects the backend owns: set
`clarification.response` + `respondedAt`, move `bid.status` back to `"under_evaluation"`,
and append a timeline entry.

---

### 7. Order Information (PO list) — `/app/purchase-orders`

▶ **Open screen:** [Order Information](https://kfg-supplier-portal.vercel.app/app/purchase-orders)

This is the supplier's main working screen.

#### `GET /purchase-orders?status={POStatus|all}&search={string}&from={ISO}&to={ISO}`

`search` matches PO number or buyer department. Sorted by `issuedDate` descending.

**Columns rendered:** PO Number · Issue Date · Item Count · **VDS Amount** · **TDS Amount** ·
Total · Expected Delivery Date · Status.

```jsonc
[{
  "id": "po-001",
  "poNumber": "PO-2026-0014",
  "issuedDate": "2026-08-01T00:00:00.000Z",
  "requiredDeliveryDate": "2026-09-15T00:00:00.000Z",
  "buyerDepartment": "Feed Mill Division",
  "subtotal": 1600000,
  "vatAmount": 240000,
  "grandTotal": 1840000,
  "status": "acknowledged",
  "items": [ /* needed only for the item count — see note */ ]
}]
```

> ⚠️ **Two things the frontend computes today that should move to the backend:**
>
> 1. **VDS / TDS amounts.** Currently `vds = round(subtotal × 0.075)` and
>    `tds = round(subtotal × 0.03)`, hard-coded in `src/lib/format/tax.ts`. Real NBR rates
>    vary by item category and by whether the line is `vdsApplicable`. **Please return
>    `vdsAmount` and `tdsAmount` as fields on the PO** so the rates live in the ERP where
>    they belong.
> 2. **Item count.** The list only needs `items.length`. Sending the full `items` array on
>    a list endpoint is wasteful — **add `itemCount: 12`** and we will drop `items` from
>    the list response.
>
> The list also calls `GET /invoices` purely to compute billed/paid/due per PO. That is a
> full second dataset fetched to derive three numbers. **Ideally the PO carries
> `billedAmount`, `paidAmount`, and `dueAmount`** and we drop the second call entirely.

---

### 8. Order detail — `/app/purchase-orders/{id}`

▶ **Open screen:** [Order detail (po-008 — issued, Acknowledge button visible)](https://kfg-supplier-portal.vercel.app/app/purchase-orders/po-008)

#### `GET /purchase-orders/{id}`

```jsonc
{
  "id": "po-001",
  "poNumber": "PO-2026-0014",
  "issuedDate": "2026-08-01T00:00:00.000Z",
  "requiredDeliveryDate": "2026-09-15T00:00:00.000Z",

  "buyerDepartment": "Feed Mill Division",
  "buyerContactName": "Nusrat Jahan",
  "buyerContactEmail": "nusrat.jahan@kazifarms.com",

  "items": [{
    "id": "poli-001",
    "itemCode": "PKG-CTN-403025",     // optional, from product catalogue
    "itemName": "Corrugated Carton 40x30x25",  // optional
    "specification": "5-ply, 180 GSM",         // optional
    "description": "5-ply corrugated carton, 40x30x25 cm",
    "unit": "pcs",
    "quantity": 50000,
    "unitPrice": 32,
    "totalPrice": 1600000
  }],

  "subtotal": 1600000,
  "vatAmount": 240000,
  "grandTotal": 1840000,

  "status": "acknowledged",
  "acknowledgedAt": "2026-08-02T06:40:00.000Z",   // optional

  "deliveryAddress": "Kazi Farms Feed Mill, Gazipur",
  "termsAndConditions": "Line one\nLine two\nLine three",   // newline-separated
  "notes": "Deliver in two consignments."          // optional
}
```

Note the asymmetry: PO `termsAndConditions` is a **newline-separated string** (split on
`\n` by the UI), while Tender `termsAndConditions` is an **array of strings**. That is an
existing inconsistency in the frontend — if you would rather send arrays for both, say so
and we will normalise.

This screen additionally pulls `GET /invoices`, `GET /payments`, and `GET /profile` to
build a "Bills against this order" table (bill number, amount, paid amount, unpaid/
partially_paid/paid). **A dedicated `GET /purchase-orders/{id}/bills` would replace all
three calls** — worth considering.

#### `POST /purchase-orders/{id}/acknowledge`

**Request** — empty body.
**Response 200** — the full updated PO with `status: "acknowledged"` and `acknowledgedAt`
set. Returns `409` if the PO is not in `issued` status.

Requires the `acknowledge_po` permission (§6 of the RBAC table below).

---

### 9. Bill Submission list — `/app/bills`

▶ **Open screen:** [Bill Submission](https://kfg-supplier-portal.vercel.app/app/bills)

Lists POs the supplier can bill against. Built from `GET /purchase-orders` + `GET /invoices`.

Frontend logic today: exclude POs with status `draft` or `cancelled`; a PO is "Pending Bill = Yes"
if no invoice exists against it with status in `submitted | under_review | approved | paid`.

> **Better:** give us `GET /purchase-orders/billable` returning POs with a
> `pendingBillAmount` field. That removes the client-side join and the whole-invoice-list
> download.

---

### 10. Submit Bill form — `/app/bills/{poId}`

▶ **Open screen:** [Submit Bill (po-008)](https://kfg-supplier-portal.vercel.app/app/bills/po-008)

The supplier enters **one amount** (the VAT-inclusive order value being billed) plus a VAT
challan confirmation and a file attachment.

#### `POST /invoices`

**Request** (multipart if an attachment is present, otherwise JSON):
```jsonc
{
  "poId": "po-001",
  "amount": 1840000,                  // VAT-INCLUSIVE amount being billed
  "vatChallanSubmitted": true,        // "Mushak 6.3 confirmed as submitted"
  "remarks": "Partial billing for first consignment.",
  "attachment": "<file: PDF or JPG>"  // optional
}
```

**Backend computes** (the UI previews these, but the server is authoritative):
```
subtotal   = round(amount / 1.15)
vatAmount  = round(subtotal × 0.15)
aitAmount  = round(subtotal × 0.03)
totalAmount = subtotal + vatAmount − aitAmount     // "net payable to you"
dueDate     = submission date + 30 days
```

**Validation:** `amount > 0`; `amount ≤ po.grandTotal` (minus what is already billed);
PO status is billable; caller has `manage_invoices`.

**Response 201** — the created Invoice object (§13), with `invoiceNumber` assigned and
`status: "submitted"`.

> `vatChallanSubmitted` and the attachment need **first-class fields on the invoice**.
> Today the mock crams the challan flag into a `timeline[0].note` string and the Payment
> History screen greps that note text to render a checkbox — that is a hack we want to
> delete. Please add:
> ```jsonc
> "vatChallanSubmitted": true,
> "vatChallanNumber": "MUSHAK-6.3-2026-0912",   // if you capture it
> "attachmentUrl": "https://.../bill-0912.pdf",
> "attachmentName": "bill-0912.pdf"
> ```

---

### 11. Payment History — `/app/payments`

▶ **Open screen:** [Payment History](https://kfg-supplier-portal.vercel.app/app/payments)

Shows three summary tiles (Total Gross · Total Deductions · Net Received) and a table of
billed POs.

#### `GET /payments?from={ISO}&to={ISO}`

Sorted by `paymentDate` descending.

```jsonc
[{
  "id": "pay-001",
  "invoiceId": "inv-001",
  "invoiceNumber": "INV-2026-0009",
  "poNumber": "PO-2026-0014",
  "paymentDate": "2026-08-18T00:00:00.000Z",

  "grossAmount": 1600000,          // = invoice subtotal (taxable value)
  "vatDeductedAtSource": 120000,
  "aitDeduction": 48000,
  "tdsDeduction": 48000,
  "netAmountPaid": 1384000,

  "bankTransferRef": "BEFTN-20260818-99123",
  "bankName": "BRAC Bank Ltd.",
  "accountNumber": "••••4471",     // MASK SERVER-SIDE — do not send the full number
  "status": "paid"
}]
```

Summary tiles: `totalGross = Σ grossAmount`, `totalDeductions = Σ (vat + ait + tds)`,
`netReceived = Σ netAmountPaid`. Happy to keep summing client-side, or take a
`GET /payments/summary` — your call.

The table rows are POs, built by joining payments → invoices → POs client-side. Same note
as §9: a single purpose-built endpoint would be cleaner.

---

### 12–14. Invoices — `/app/invoices`, `/app/invoices/{id}`, `/app/invoices/new`

▶ **Open screen:** [Invoices list](https://kfg-supplier-portal.vercel.app/app/invoices)  ·  [Invoice detail (inv-001)](https://kfg-supplier-portal.vercel.app/app/invoices/inv-001)  ·  [New invoice form](https://kfg-supplier-portal.vercel.app/app/invoices/new)

These routes exist and work, but **are currently hidden from the sidebar** — Bill
Submission (§9/§10) is the supported path. They are linked from Order detail and Reports,
so the endpoints are still needed.

#### `GET /invoices?status={InvoiceStatus|all}&search={string}&from={ISO}&to={ISO}`

`search` matches invoice number or PO number. Sorted by `invoiceDate` descending.

#### `GET /invoices/{id}`

```jsonc
{
  "id": "inv-001",
  "invoiceNumber": "INV-2026-0009",
  "supplierId": "SP-2024-001",
  "poId": "po-001",
  "poNumber": "PO-2026-0014",

  "invoiceDate": "2026-08-12T00:00:00.000Z",
  "dueDate": "2026-09-11T00:00:00.000Z",
  "submittedAt": "2026-08-12T11:05:00.000Z",   // optional

  "items": [{
    "id": "invi-001",
    "poLineItemId": "poli-001",
    "description": "5-ply corrugated carton",
    "unit": "pcs",
    "quantity": 50000,
    "unitPrice": 32,
    "totalPrice": 1600000
  }],

  "subtotal": 1600000,
  "vatAmount": 240000,
  "aitAmount": 48000,
  "tdsAmount": 0,
  "totalAmount": 1792000,

  "status": "approved",
  "rejectionReason": "Quantity mismatch against GRN",  // only when status=rejected
  "approvedBy": "Tanvir Ahmed",                        // optional
  "approvedAt": "2026-08-20T07:30:00.000Z",            // optional
  "paidAt": "2026-08-25T00:00:00.000Z",                // optional
  "paymentRef": "BEFTN-20260825-77431",                // optional

  "timeline": [{
    "status": "submitted",
    "timestamp": "2026-08-12T11:05:00.000Z",
    "actor": "Ahsan Kabir",
    "note": "Invoice submitted via supplier portal"
  }]
}
```

#### `GET /purchase-orders/acknowledged`

Used by the "new invoice" form to populate the PO dropdown. Returns POs with status
`acknowledged` or `partially_fulfilled` — full PO objects (the form needs `items` to
prefill line quantities and prices).

---

### 15. Compliance Documents — `/app/documents`

▶ **Open screen:** [Compliance Documents](https://kfg-supplier-portal.vercel.app/app/documents)

#### `GET /documents`

```jsonc
[{
  "id": "doc-001",
  "type": "trade_license",
  "displayName": "Trade License 2026",
  "documentNumber": "TRAD/DHK/2019/44120",
  "issuingAuthority": "Dhaka North City Corporation",
  "issuedDate": "2026-01-05T00:00:00.000Z",
  "expiryDate": "2026-12-31T00:00:00.000Z",
  "status": "expiring_soon",
  "uploadedAt": "2026-01-10T00:00:00.000Z",
  "verifiedAt": "2026-01-12T00:00:00.000Z",   // optional
  "fileSize": "1.2 MB",                        // pre-formatted string
  "fileUrl": "https://.../trade-license.pdf"   // NEEDED — download button is a stub today
}]
```

`status` must be **computed server-side** from `expiryDate` (the "expiring soon" window is
a business rule, not a UI rule). The screen shows a red banner for `expired` and an amber
one for `expiring_soon`.

#### `POST /documents` *(multipart — upload button is a stub today, wire when ready)*

```
type: "trade_license"
documentNumber: "TRAD/DHK/2019/44120"
issuingAuthority: "Dhaka North City Corporation"
issuedDate: "2026-01-05"
expiryDate: "2026-12-31"
file: <binary>
```
Response 201 — the created document object. Requires `upload_documents`.

---

### 16. Reports — `/app/reports`

▶ **Open screen:** [Reports](https://kfg-supplier-portal.vercel.app/app/reports)

Three tabs, all built client-side today from `GET /invoices`, `GET /purchase-orders`,
`GET /challans`, and `GET /dashboard/kpi`. **Prime candidates for server-side reports** —
the logic below is the spec if you want to move it into iDempiere.

| Tab | Rows | Derivation |
|---|---|---|
| **Receivables Ageing** | One per invoice with status `submitted \| under_review \| approved` | `displayStatus = "overdue"` if `dueDate < today`, else the invoice status |
| **VAT & Tax Summary** | One per calendar month | Group billed invoices by `invoiceDate` month → `invoiced = Σ totalAmount`, `vatCollected = Σ vatAmount`, `aitDeducted = Σ aitAmount`, `net = vatCollected − aitDeducted` |
| **Order Fulfilment** | One per PO | `itemsOrdered = items.length`; `itemsDelivered` = lines where delivered qty ≥ ordered qty (only challans with status `delivered` or `grn_confirmed` count); `fulfilmentPct = round(deliveredQty / orderedQty × 100)`; status = `cancelled` → `fulfilled` (100%) → `in_transit` (open challan) → `partial` → `pending`, in that precedence order |

Header stats: on-time rate = `Σ onTime / (Σ onTime + Σ late)` from `deliveryPerformance`;
average fulfilment %; total outstanding receivables.

Suggested replacements: `GET /reports/receivables`, `GET /reports/vat-summary?year=2026`,
`GET /reports/fulfilment`. All support CSV export from the UI, so a `?format=csv` variant
would be welcome.

#### `GET /challans?status={DeliveryStatus|all}&search={string}`

Needed by Reports (and by the delivery flow when we enable it):

```jsonc
[{
  "id": "chal-001",
  "challanNumber": "DC-2026-0021",
  "poId": "po-001",
  "poNumber": "PO-2026-0014",
  "items": [{
    "id": "chi-001",
    "poLineItemId": "poli-001",
    "description": "5-ply corrugated carton",
    "unit": "pcs",
    "quantity": 25000
  }],
  "scheduledDeliveryDate": "2026-08-20T00:00:00.000Z",
  "deliveryAddress": "Kazi Farms Feed Mill, Gazipur",
  "vehicleNumber": "DHAKA METRO-TA 11-4471",   // optional
  "driverName": "Md. Rafiq",                    // optional
  "receivedBy": "Store Officer, Gazipur",       // optional
  "grnNumber": "GRN-2026-0188",                 // optional
  "status": "grn_confirmed",
  "createdAt": "2026-08-16T00:00:00.000Z",
  "deliveredAt": "2026-08-20T10:00:00.000Z",    // optional
  "grnConfirmedAt": "2026-08-21T09:00:00.000Z"  // optional
}]
```

`POST /challans` also exists in the frontend layer (fields: `poId`, `deliveryAddress`,
`scheduledDeliveryDate`, `vehicleNumber?`, `driverName?`, `items[{poLineItemId, quantity}]`)
but there is **no UI screen for it yet** — implement when we build the delivery screen.

---

### 17. Notifications — `/app/notifications` (+ the topbar bell on every screen)

▶ **Open screen:** [Notifications](https://kfg-supplier-portal.vercel.app/app/notifications)

#### `GET /notifications`

Sorted by `timestamp` descending.

```jsonc
[{
  "id": "ntf-001",
  "type": "po_issued",
  "title": "New purchase order issued",
  "body": "PO-2026-0014 for ৳18,40,000 has been issued by Feed Mill Division.",
  "timestamp": "2026-08-14T09:30:00.000Z",
  "read": false,
  "link": "/app/purchase-orders/po-001"   // optional frontend route
}]
```

`title` and `body` are **rendered as-is** — the backend owns the wording. Same note as
the dashboard: if frontend route paths are awkward, send `entityType` + `entityId`.

#### `POST /notifications/{id}/read` → `204`
#### `POST /notifications/read-all` → `204`

The bell badge counts `read === false`. A lightweight
`GET /notifications/unread-count → { "count": 4 }` would let us poll cheaply instead of
refetching the whole list.

---

### 18. Company Profile — `/app/profile`

▶ **Open screen:** [Company Profile](https://kfg-supplier-portal.vercel.app/app/profile)

#### `GET /profile`

```jsonc
{
  "id": "SP-2024-001",
  "companyName": "Dhaka Packaging Industries Ltd.",
  "companyNameBn": "ঢাকা প্যাকেজিং ইন্ডাস্ট্রিজ লিমিটেড",
  "tinNumber": "412398765432",
  "binNumber": "004471029-0201",
  "tradeLicenseNo": "TRAD/DHK/2019/44120",
  "incorporationType": "Private Limited Company",
  "registeredAddress": "House 42, Road 11, Banani, Dhaka 1213",

  "phone": "+880 2 9885544",
  "email": "info@dhakapackaging.com.bd",
  "website": "https://dhakapackaging.com.bd",     // optional

  "primaryContactName": "Ahsan Kabir",
  "primaryContactPhone": "+880 1711 223344",
  "primaryContactEmail": "ahsan.kabir@dhakapackaging.com.bd",

  "bankAccounts": [{
    "id": "bank-001",
    "bankName": "BRAC Bank Ltd.",
    "bankBranch": "Gulshan Branch",
    "accountNumber": "1501204471029",
    "routingNumber": "060261726",
    "accountHolderName": "Dhaka Packaging Industries Ltd.",
    "isPrimary": true
  }]
}
```

The top-level `bankName` / `bankBranch` / `accountNumber` / `routingNumber` /
`accountHolderName` fields also exist in the current type as legacy duplicates of the
primary account. **Do not implement them** — we are removing them; send `bankAccounts` only.

#### `PATCH /profile`

**Only these six fields are editable from the portal.** Everything else (company name, TIN,
BIN, trade license, address, bank accounts) is ERP master data and must be rejected.

```jsonc
{
  "primaryContactName": "Ahsan Kabir",
  "primaryContactPhone": "+880 1711 223344",
  "primaryContactEmail": "ahsan.kabir@dhakapackaging.com.bd",
  "phone": "+880 2 9885544",
  "email": "info@dhakapackaging.com.bd",
  "website": "https://dhakapackaging.com.bd"
}
```
Response 200 — the full updated profile. Requires `manage_profile`.

---

## 5. RBAC — permissions the backend must enforce

The frontend hides UI by permission, but that is cosmetic. **Every endpoint must
re-check server-side.**

| Permission | Guards | supplier_admin | finance_officer | logistics_officer | viewer |
|---|---|:-:|:-:|:-:|:-:|
| `view_dashboard` | `GET /dashboard/kpi` | ✅ | ✅ | ✅ | ✅ |
| `view_tenders` | `GET /tenders`, `GET /bids` | ✅ | ✅ | ✅ | ✅ |
| `submit_bids` | `POST /bids`, clarification response | ✅ | — | — | — |
| `view_purchase_orders` | `GET /purchase-orders` | ✅ | ✅ | ✅ | ✅ |
| `acknowledge_po` | `POST /purchase-orders/{id}/acknowledge` | ✅ | — | — | — |
| `manage_invoices` | `POST /invoices` | ✅ | ✅ | — | — |
| `view_payments` | `GET /payments` | ✅ | ✅ | — | ✅ |
| `manage_deliveries` | `POST /challans` | ✅ | — | ✅ | — |
| `view_documents` | `GET /documents` | ✅ | ✅ | ✅ | ✅ |
| `upload_documents` | `POST /documents` | ✅ | — | — | — |
| `view_reports` | `GET /reports/*` | ✅ | ✅ | — | ✅ |
| `manage_profile` | `PATCH /profile` | ✅ | — | — | — |

Notifications and profile *viewing* are open to all authenticated roles.

Source of truth: `src/lib/rbac.ts`.

---

## 6. Business rules currently hard-coded in the frontend

These live in `src/lib/format/tax.ts` and should ideally be owned by the ERP:

| Rate | Value | Applied to | Used on |
|---|---|---|---|
| VAT | 15% | invoice/bid subtotal | Bill submission, bid submission |
| AIT | 3% | invoice subtotal (deducted) | Bill submission, invoice totals |
| VDS | 7.5% | PO subtotal (taxable value) | Order list, order detail |
| TDS | 3% | PO subtotal (taxable value) | Order list, order detail |
| Payment terms | 30 days from bill submission | — | Bill submission due date |

Rounding is `Math.round` to whole taka at each step. If iDempiere rounds differently, the
UI totals will drift from ERP totals — **please confirm the rounding convention.**

Note that VDS and TDS are assessed on the **subtotal**, not the VAT-inclusive grand total.
Deriving them from the grand total would tax the VAT.

---

## 7. Summary of asks

Ranked by how much they simplify the frontend:

1. **Add `billedAmount` / `paidAmount` / `dueAmount` to the PO object.** Removes a
   full-invoice-list download on three separate screens (§7, §9, §11).
2. **Add `vdsAmount` / `tdsAmount` to the PO object.** Moves tax rates out of frontend
   constants.
3. **Add `itemCount` to the PO list response** and let us drop `items` from it.
4. **Make `vatChallanSubmitted` and the bill attachment first-class invoice fields.**
   Kills a string-matching hack in Payment History (§10).
5. **Add `fileUrl` to compliance documents** so the download button works.
6. **Server-side report endpoints** for the three Reports tabs (§16).
7. **Confirm:** pagination style, list envelope, rounding convention, and whether
   `link` fields should be frontend routes or `entityType` + `entityId`.

---

## 8. Reference — where these shapes live in the frontend

| Concern | File |
|---|---|
| All TypeScript interfaces | `src/lib/mock/types.ts` |
| Current mock API surface (function-per-endpoint) | `src/lib/mock/api.ts` |
| React Query hooks — one per endpoint | `src/lib/query/hooks.ts` |
| Permissions & role matrix | `src/lib/rbac.ts` |
| Tax rates & formulas | `src/lib/format/tax.ts` |
| Sidebar routes | `src/components/shell/nav-items.ts` |
| Screens | `src/app/app/**/page.tsx` |

`src/lib/mock/types.ts` is the authoritative field list. When in doubt, read it — it is
~320 lines and fully commented. Swapping to real APIs means replacing the bodies in
`src/lib/mock/api.ts` with `fetch` calls; nothing else in the app needs to change.
