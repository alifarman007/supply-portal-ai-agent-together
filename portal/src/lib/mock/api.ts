import {
  purchaseOrders, invoices, payments, challans, documents,
  notifications, supplierProfile, buildKpiSummary, tenders, bids, NOW,
} from "./db";
import type {
  PurchaseOrder, Invoice, Payment, DeliveryChallan,
  ComplianceDocument, SupplierNotification, SupplierProfile,
  SupplierKpiSummary, POFilters, InvoiceFilters, PaymentFilters,
  ChallanFilters, POStatus, InvoiceStatus, InvoiceLineItem, ChallanItem,
  Tender, Bid, TenderFilters, BidFilters, BidLineItem, TenderClarification,
} from "./types";
import { calcVAT, calcAIT } from "@/lib/format/tax";

const delay = () => new Promise((r) => setTimeout(r, 250 + Math.random() * 350));

export async function getKpiSummary(): Promise<SupplierKpiSummary> {
  await delay();
  return buildKpiSummary();
}

export async function listPurchaseOrders(filters: POFilters = {}): Promise<PurchaseOrder[]> {
  await delay();
  let list = [...purchaseOrders];
  if (filters.status && filters.status !== "all") list = list.filter((p) => p.status === filters.status);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter((p) => p.poNumber.toLowerCase().includes(q) || p.buyerDepartment.toLowerCase().includes(q));
  }
  return list.sort((a, b) => new Date(b.issuedDate).getTime() - new Date(a.issuedDate).getTime());
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined> {
  await delay();
  return purchaseOrders.find((p) => p.id === id);
}

export async function acknowledgePO(id: string): Promise<PurchaseOrder> {
  await delay();
  const po = purchaseOrders.find((p) => p.id === id);
  if (!po) throw new Error("PO not found");
  po.status = "acknowledged";
  po.acknowledgedAt = NOW.toISOString();
  return po;
}

export async function listInvoices(filters: InvoiceFilters = {}): Promise<Invoice[]> {
  await delay();
  let list = [...invoices];
  if (filters.status && filters.status !== "all") list = list.filter((i) => i.status === filters.status);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter((i) => i.invoiceNumber.toLowerCase().includes(q) || i.poNumber.toLowerCase().includes(q));
  }
  return list.sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime());
}

export async function getInvoice(id: string): Promise<Invoice | undefined> {
  await delay();
  return invoices.find((i) => i.id === id);
}

export async function listPayments(filters: PaymentFilters = {}): Promise<Payment[]> {
  await delay();
  return [...payments].sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
}

export async function listChallans(filters: ChallanFilters = {}): Promise<DeliveryChallan[]> {
  await delay();
  let list = [...challans];
  if (filters.status && filters.status !== "all") list = list.filter((c) => c.status === filters.status);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter((c) => c.challanNumber.toLowerCase().includes(q) || c.poNumber.toLowerCase().includes(q));
  }
  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getChallan(id: string): Promise<DeliveryChallan | undefined> {
  await delay();
  return challans.find((c) => c.id === id);
}

export async function listDocuments(): Promise<ComplianceDocument[]> {
  await delay();
  return [...documents];
}

export async function listNotifications(): Promise<SupplierNotification[]> {
  await delay();
  return [...notifications].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function markNotificationRead(id: string): Promise<void> {
  await delay();
  const n = notifications.find((n) => n.id === id);
  if (n) n.read = true;
}

export async function getSupplierProfile(): Promise<SupplierProfile> {
  await delay();
  return supplierProfile;
}

export async function getAcknowledgedPOs(): Promise<PurchaseOrder[]> {
  await delay();
  return purchaseOrders.filter((p) => ["acknowledged", "partially_fulfilled"].includes(p.status));
}

export async function markAllNotificationsRead(): Promise<void> {
  await delay();
  notifications.forEach((n) => { n.read = true; });
}

export async function updateProfile(data: Partial<SupplierProfile>): Promise<SupplierProfile> {
  await delay();
  Object.assign(supplierProfile, data);
  return { ...supplierProfile };
}

export interface CreateInvoiceInput {
  poId: string;
  poNumber: string;
  items: Omit<InvoiceLineItem, "id" | "poLineItemId" | "totalPrice">[];
  remarks?: string;
}

export async function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  await delay();
  const lineItems: InvoiceLineItem[] = input.items.map((item, idx) => ({
    id: `invi-${Date.now()}-${idx}`,
    poLineItemId: `${input.poId}-${idx}`,
    description: item.description,
    unit: item.unit,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.quantity * item.unitPrice,
  }));
  const subtotal = lineItems.reduce((s, i) => s + i.totalPrice, 0);
  const vatAmount = calcVAT(subtotal);
  const aitAmount = calcAIT(subtotal);
  const totalAmount = subtotal + vatAmount - aitAmount;
  const now = NOW.toISOString();
  const dueDate = new Date(NOW);
  dueDate.setDate(dueDate.getDate() + 30);

  const invoice: Invoice = {
    id: `inv-${Date.now()}`,
    invoiceNumber: `INV-2026-${String(invoices.length + 1).padStart(4, "0")}`,
    supplierId: supplierProfile.id,
    poId: input.poId,
    poNumber: input.poNumber,
    invoiceDate: now,
    dueDate: dueDate.toISOString(),
    submittedAt: now,
    items: lineItems,
    subtotal,
    vatAmount,
    aitAmount,
    tdsAmount: 0,
    totalAmount,
    status: "submitted",
    timeline: [
      {
        status: "submitted",
        timestamp: now,
        actor: supplierProfile.primaryContactName,
        note: input.remarks || "Invoice submitted via supplier portal",
      },
    ],
  };
  invoices.unshift(invoice);
  return invoice;
}

export async function listTenders(filters: TenderFilters = {}): Promise<Tender[]> {
  await delay();
  let list = [...tenders];
  if (filters.status && filters.status !== "all") list = list.filter((t) => t.status === filters.status);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter((t) => t.tenderNumber.toLowerCase().includes(q) || t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
  }
  return list.sort((a, b) => new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime());
}

export async function getTender(id: string): Promise<Tender | undefined> {
  await delay();
  return tenders.find((t) => t.id === id);
}

export async function getBidForTender(tenderId: string): Promise<Bid | null> {
  await delay();
  return bids.find((b) => b.tenderId === tenderId) ?? null;
}

export interface AskTenderQuestionInput {
  tenderId: string;
  question: string;
}

export async function askTenderQuestion(input: AskTenderQuestionInput): Promise<Tender> {
  await delay();
  const tender = tenders.find((t) => t.id === input.tenderId);
  if (!tender) throw new Error("Tender not found");
  const clarification: TenderClarification = {
    id: `tc-${Date.now()}`,
    question: input.question,
    askedBy: supplierProfile.primaryContactName,
    askedAt: NOW.toISOString(),
  };
  tender.clarifications.push(clarification);
  return tender;
}

export async function listBids(filters: BidFilters = {}): Promise<Bid[]> {
  await delay();
  let list = [...bids];
  if (filters.status && filters.status !== "all") list = list.filter((b) => b.status === filters.status);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter((b) => b.bidNumber.toLowerCase().includes(q) || b.tenderNumber.toLowerCase().includes(q) || b.tenderTitle.toLowerCase().includes(q));
  }
  return list.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
}

export async function getBid(id: string): Promise<Bid | undefined> {
  await delay();
  return bids.find((b) => b.id === id);
}

export interface SubmitBidInput {
  tenderId: string;
  tenderNumber: string;
  tenderTitle: string;
  technicalNotes: string;
  bidValidityDays: number;
  items: Omit<BidLineItem, "id" | "totalPrice">[];
}

export async function submitBid(input: SubmitBidInput): Promise<Bid> {
  await delay();
  const items: BidLineItem[] = input.items.map((item, idx) => ({
    id: `bli-${Date.now()}-${idx}`,
    tenderLineItemId: item.tenderLineItemId,
    description: item.description,
    unit: item.unit,
    quantity: item.quantity,
    specificationOffered: item.specificationOffered,
    unitPrice: item.unitPrice,
    totalPrice: item.quantity * item.unitPrice,
  }));
  const subtotal = items.reduce((s, i) => s + i.totalPrice, 0);
  const vatAmount = calcVAT(subtotal);
  const totalBidAmount = subtotal + vatAmount;
  const now = NOW.toISOString();

  const bid: Bid = {
    id: `bid-${Date.now()}`,
    bidNumber: `BID-2026-${String(bids.length + 1).padStart(4, "0")}`,
    tenderId: input.tenderId,
    tenderNumber: input.tenderNumber,
    tenderTitle: input.tenderTitle,
    supplierId: supplierProfile.id,
    submittedAt: now,
    technicalNotes: input.technicalNotes,
    items,
    subtotal,
    vatAmount,
    totalBidAmount,
    bidValidityDays: input.bidValidityDays,
    status: "submitted",
    clarifications: [],
    timeline: [
      { status: "submitted", timestamp: now, actor: supplierProfile.primaryContactName, note: "Bid submitted via supplier portal" },
    ],
  };
  bids.unshift(bid);
  return bid;
}

export interface RespondToBidClarificationInput {
  bidId: string;
  clarificationId: string;
  response: string;
}

export async function respondToBidClarification(input: RespondToBidClarificationInput): Promise<Bid> {
  await delay();
  const bid = bids.find((b) => b.id === input.bidId);
  if (!bid) throw new Error("Bid not found");
  const clarification = bid.clarifications.find((c) => c.id === input.clarificationId);
  if (!clarification) throw new Error("Clarification not found");
  const now = NOW.toISOString();
  clarification.response = input.response;
  clarification.respondedAt = now;
  bid.status = "under_evaluation";
  bid.timeline.push({
    status: "under_evaluation",
    timestamp: now,
    actor: supplierProfile.primaryContactName,
    note: "Clarification response submitted — bid returned to evaluation.",
  });
  return bid;
}

export interface CreateChallanInput {
  poId: string;
  poNumber: string;
  deliveryAddress: string;
  scheduledDeliveryDate: string;
  vehicleNumber?: string;
  driverName?: string;
  items: Omit<ChallanItem, "id" | "poLineItemId">[];
}

export async function createChallan(input: CreateChallanInput): Promise<DeliveryChallan> {
  await delay();
  const items: ChallanItem[] = input.items.map((item, idx) => ({
    id: `chi-${Date.now()}-${idx}`,
    poLineItemId: `${input.poId}-${idx}`,
    description: item.description,
    unit: item.unit,
    quantity: item.quantity,
  }));

  const challan: DeliveryChallan = {
    id: `chal-${Date.now()}`,
    challanNumber: `DC-2026-${String(challans.length + 1).padStart(4, "0")}`,
    poId: input.poId,
    poNumber: input.poNumber,
    items,
    scheduledDeliveryDate: input.scheduledDeliveryDate,
    deliveryAddress: input.deliveryAddress,
    vehicleNumber: input.vehicleNumber,
    driverName: input.driverName,
    status: "scheduled",
    createdAt: NOW.toISOString(),
  };
  challans.unshift(challan);
  return challan;
}
