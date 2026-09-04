export type SupplierRole = "supplier_admin" | "finance_officer" | "logistics_officer" | "viewer";

export type POStatus = "draft" | "issued" | "acknowledged" | "partially_fulfilled" | "fulfilled" | "cancelled";
export type InvoiceStatus = "draft" | "submitted" | "under_review" | "approved" | "paid" | "rejected";
export type DeliveryStatus = "scheduled" | "in_transit" | "delivered" | "grn_confirmed";
export type DocumentType = "trade_license" | "tin_certificate" | "vat_registration" | "bank_solvency" | "iso_certification";
export type DocumentStatus = "valid" | "expiring_soon" | "expired" | "pending_verification";
export type TenderStatus = "published" | "evaluation" | "negotiation" | "awarded" | "closed" | "cancelled";
export type BidStatus = "draft" | "submitted" | "under_evaluation" | "clarification_requested" | "shortlisted" | "awarded" | "not_awarded" | "rejected";
export type NotificationType =
  | "po_issued" | "invoice_approved" | "invoice_rejected" | "payment_received"
  | "document_expiring" | "po_acknowledged" | "grn_confirmed"
  | "tender_published" | "bid_clarification_requested" | "bid_shortlisted" | "bid_awarded" | "bid_not_awarded";

export interface POLineItem {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  /** Filled from the product catalogue — see `enrichPOItems` in the mock db. */
  itemName?: string;
  itemCode?: string;
  specification?: string;
  /** Present when the source (e.g. the iDempiere API) supplies real per-line tax; otherwise derive from `totalPrice` via src/lib/format/tax.ts. */
  vdsAmount?: number;
  tdsAmount?: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  issuedDate: string;
  requiredDeliveryDate: string;
  buyerDepartment: string;
  buyerContactName: string;
  buyerContactEmail: string;
  items: POLineItem[];
  /** Item count for list views. Falls back to `items.length` when absent. */
  itemCount?: number;
  subtotal: number;
  vatAmount: number;
  grandTotal: number;
  /** Present when the source supplies real tax/settlement figures; otherwise derive from `subtotal`/related invoices. */
  vdsAmount?: number;
  tdsAmount?: number;
  billedAmount?: number;
  paidAmount?: number;
  dueAmount?: number;
  status: POStatus;
  termsAndConditions: string;
  deliveryAddress: string;
  acknowledgedAt?: string;
  notes?: string;
}

export interface InvoiceLineItem {
  id: string;
  poLineItemId: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface InvoiceTimelineEvent {
  status: string;
  timestamp: string;
  actor?: string;
  note?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  poId: string;
  poNumber: string;
  invoiceDate: string;
  dueDate: string;
  submittedAt?: string;
  items: InvoiceLineItem[];
  subtotal: number;
  vatAmount: number;
  aitAmount: number;
  tdsAmount: number;
  totalAmount: number;
  status: InvoiceStatus;
  rejectionReason?: string;
  approvedBy?: string;
  approvedAt?: string;
  paidAt?: string;
  paymentRef?: string;
  timeline: InvoiceTimelineEvent[];
}

export interface Payment {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  poNumber: string;
  paymentDate: string;
  grossAmount: number;
  vatDeductedAtSource: number;
  aitDeduction: number;
  tdsDeduction: number;
  netAmountPaid: number;
  bankTransferRef: string;
  bankName: string;
  accountNumber: string;
  status: "paid" | "processing" | "failed";
}

export interface ChallanItem {
  id: string;
  poLineItemId: string;
  description: string;
  unit: string;
  quantity: number;
}

export interface DeliveryChallan {
  id: string;
  challanNumber: string;
  poId: string;
  poNumber: string;
  items: ChallanItem[];
  scheduledDeliveryDate: string;
  deliveryAddress: string;
  vehicleNumber?: string;
  driverName?: string;
  receivedBy?: string;
  grnNumber?: string;
  status: DeliveryStatus;
  createdAt: string;
  deliveredAt?: string;
  grnConfirmedAt?: string;
}

export interface ComplianceDocument {
  id: string;
  type: DocumentType;
  displayName: string;
  documentNumber: string;
  issuingAuthority: string;
  issuedDate: string;
  expiryDate: string;
  status: DocumentStatus;
  uploadedAt: string;
  verifiedAt?: string;
  fileSize: string;
}

export interface TenderLineItem {
  id: string;
  description: string;
  specification: string;
  unit: string;
  quantity: number;
  /** Buyer's indicative rate. Bidders quote their own price against it. */
  estimatedUnitPrice: number;
  /** Whether VAT is deducted at source on this line, per the NBR schedule. */
  vdsApplicable: boolean;
  /** Whether tax is deducted at source on this line. */
  tdsApplicable: boolean;
}

export interface TenderClarification {
  id: string;
  question: string;
  askedBy: string;
  askedAt: string;
  response?: string;
  respondedBy?: string;
  respondedAt?: string;
}

export interface Tender {
  id: string;
  tenderNumber: string;
  title: string;
  category: string;
  description: string;
  buyerDepartment: string;
  buyerContactName: string;
  buyerContactEmail: string;
  publishedDate: string;
  submissionDeadline: string;
  bidOpeningDate: string;
  estimatedValue: number;
  items: TenderLineItem[];
  eligibilityCriteria: string[];
  termsAndConditions: string[];
  requiredDocuments: DocumentType[];
  status: TenderStatus;
  clarifications: TenderClarification[];
  awardedSupplierName?: string;
  awardedAt?: string;
  cancelReason?: string;
}

export interface BidLineItem {
  id: string;
  tenderLineItemId: string;
  description: string;
  unit: string;
  quantity: number;
  specificationOffered: string;
  unitPrice: number;
  totalPrice: number;
}

export interface BidClarification {
  id: string;
  question: string;
  askedBy: string;
  askedAt: string;
  response?: string;
  respondedAt?: string;
}

export interface BidTimelineEvent {
  status: string;
  timestamp: string;
  actor?: string;
  note?: string;
}

export interface Bid {
  id: string;
  bidNumber: string;
  tenderId: string;
  tenderNumber: string;
  tenderTitle: string;
  supplierId: string;
  submittedAt: string;
  technicalNotes: string;
  items: BidLineItem[];
  subtotal: number;
  vatAmount: number;
  totalBidAmount: number;
  bidValidityDays: number;
  status: BidStatus;
  technicalScore?: number;
  financialScore?: number;
  evaluationRemarks?: string;
  clarifications: BidClarification[];
  timeline: BidTimelineEvent[];
}

export interface SupplierNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  link?: string;
}

export interface BankAccount {
  id: string;
  bankName: string;
  bankBranch: string;
  accountNumber: string;
  routingNumber: string;
  accountHolderName: string;
  isPrimary: boolean;
}

export interface SupplierProfile {
  id: string;
  companyName: string;
  companyNameBn: string;
  tinNumber: string;
  binNumber: string;
  tradeLicenseNo: string;
  incorporationType: string;
  registeredAddress: string;
  phone: string;
  email: string;
  website?: string;
  bankName: string;
  bankBranch: string;
  accountNumber: string;
  routingNumber: string;
  accountHolderName: string;
  bankAccounts: BankAccount[];
  primaryContactName: string;
  primaryContactPhone: string;
  primaryContactEmail: string;
}

export interface SupplierKpiSummary {
  activePOs: number;
  pendingInvoices: number;
  totalReceivedYTD: number;
  totalReceivedMTD: number;
  totalReceivedLastMonth: number;
  overdueInvoices: number;
  monthlyPaymentTrend: { month: string; paid: number; lastYear: number }[];
  invoiceStatusBreakdown: { status: InvoiceStatus; label: string; count: number; color: string }[];
  deliveryPerformance: { month: string; onTime: number; late: number }[];
  recentActivity: { id: string; type: string; description: string; timestamp: string; link?: string }[];
  /** Open bids awaiting a buyer decision. */
  openBids: number;
  /** Total still owed to the supplier across unpaid invoices. */
  duePaymentAmount: number;
  /** Headline growth figure shown on the transactions card. */
  growthPct: number;
  /** Order vs delivery counts per month, for the Performance chart. */
  monthlyOrderDelivery: { month: string; order: number; delivery: number }[];
  /** Day-by-day ordered/delivered counts for the Delivery Statistics chart. */
  dailyDeliveryStats: { day: string; ordered: number; delivered: number }[];
  deliveriesThisMonth: number;
  deliveryChangePct: number;
  /** Trailing 7-day series behind each of the three summary tiles. */
  weeklyBreakdown: { day: number; orders: number; deliveries: number; payments: number }[];
  monthTotals: { orders: number; deliveries: number; payments: number };
}

export interface POFilters { status?: POStatus | "all"; search?: string; from?: string; to?: string; }
export interface InvoiceFilters { status?: InvoiceStatus | "all"; search?: string; from?: string; to?: string; }
export interface PaymentFilters { from?: string; to?: string; }
export interface ChallanFilters { status?: DeliveryStatus | "all"; search?: string; }
export interface TenderFilters { status?: TenderStatus | "all"; search?: string; }
export interface BidFilters { status?: BidStatus | "all"; search?: string; }
