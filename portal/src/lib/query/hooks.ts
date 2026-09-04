"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/mock/api";
import * as poApi from "@/lib/idempiere/api";
import type { POFilters, InvoiceFilters, PaymentFilters, ChallanFilters, TenderFilters, BidFilters } from "@/lib/mock/types";

export const qk = {
  kpi: ["kpi"] as const,
  purchaseOrders: (f: POFilters) => ["purchase-orders", f] as const,
  purchaseOrder: (id: string) => ["purchase-order", id] as const,
  acknowledgedPOs: ["acknowledged-pos"] as const,
  invoices: (f: InvoiceFilters) => ["invoices", f] as const,
  invoice: (id: string) => ["invoice", id] as const,
  payments: (f: PaymentFilters) => ["payments", f] as const,
  challans: (f: ChallanFilters) => ["challans", f] as const,
  documents: ["documents"] as const,
  notifications: ["notifications"] as const,
  profile: ["profile"] as const,
  tenders: (f: TenderFilters) => ["tenders", f] as const,
  tender: (id: string) => ["tender", id] as const,
  bidForTender: (tenderId: string) => ["bid-for-tender", tenderId] as const,
  bids: (f: BidFilters) => ["bids", f] as const,
  bid: (id: string) => ["bid", id] as const,
};

export function useKpiSummary() {
  return useQuery({ queryKey: qk.kpi, queryFn: api.getKpiSummary });
}

export function usePurchaseOrders(filters: POFilters = {}) {
  return useQuery({ queryKey: qk.purchaseOrders(filters), queryFn: () => poApi.listPurchaseOrders(filters) });
}

export function usePurchaseOrder(id: string) {
  return useQuery({ queryKey: qk.purchaseOrder(id), queryFn: () => poApi.getPurchaseOrder(id), enabled: !!id });
}

export function useAcknowledgedPOs() {
  return useQuery({ queryKey: qk.acknowledgedPOs, queryFn: api.getAcknowledgedPOs });
}

export function useAcknowledgePO() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.acknowledgePO(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: qk.purchaseOrder(id) });
      qc.invalidateQueries({ queryKey: qk.kpi });
    },
  });
}

export function useInvoices(filters: InvoiceFilters = {}) {
  return useQuery({ queryKey: qk.invoices(filters), queryFn: () => api.listInvoices(filters) });
}

export function useInvoice(id: string) {
  return useQuery({ queryKey: qk.invoice(id), queryFn: () => api.getInvoice(id), enabled: !!id });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createInvoice,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: qk.kpi });
    },
  });
}

export function usePayments(filters: PaymentFilters = {}) {
  return useQuery({ queryKey: qk.payments(filters), queryFn: () => api.listPayments(filters) });
}

export function useChallans(filters: ChallanFilters = {}) {
  return useQuery({ queryKey: qk.challans(filters), queryFn: () => api.listChallans(filters) });
}

export function useCreateChallan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createChallan,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challans"] });
      qc.invalidateQueries({ queryKey: qk.kpi });
    },
  });
}

export function useTenders(filters: TenderFilters = {}) {
  return useQuery({ queryKey: qk.tenders(filters), queryFn: () => api.listTenders(filters) });
}

export function useTender(id: string) {
  return useQuery({ queryKey: qk.tender(id), queryFn: () => api.getTender(id), enabled: !!id });
}

export function useBidForTender(tenderId: string) {
  return useQuery({ queryKey: qk.bidForTender(tenderId), queryFn: () => api.getBidForTender(tenderId), enabled: !!tenderId });
}

export function useAskTenderQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.askTenderQuestion,
    onSuccess: (tender) => {
      qc.invalidateQueries({ queryKey: qk.tender(tender.id) });
    },
  });
}

export function useBids(filters: BidFilters = {}) {
  return useQuery({ queryKey: qk.bids(filters), queryFn: () => api.listBids(filters) });
}

export function useBid(id: string) {
  return useQuery({ queryKey: qk.bid(id), queryFn: () => api.getBid(id), enabled: !!id });
}

export function useSubmitBid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.submitBid,
    onSuccess: (bid) => {
      qc.invalidateQueries({ queryKey: ["bids"] });
      qc.invalidateQueries({ queryKey: qk.bidForTender(bid.tenderId) });
      qc.invalidateQueries({ queryKey: qk.kpi });
    },
  });
}

export function useRespondToBidClarification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.respondToBidClarification,
    onSuccess: (bid) => {
      qc.invalidateQueries({ queryKey: qk.bid(bid.id) });
      qc.invalidateQueries({ queryKey: ["bids"] });
    },
  });
}

export function useDocuments() {
  return useQuery({ queryKey: qk.documents, queryFn: api.listDocuments });
}

export function useNotifications() {
  return useQuery({ queryKey: qk.notifications, queryFn: api.listNotifications });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });
}

export function useSupplierProfile() {
  return useQuery({ queryKey: qk.profile, queryFn: api.getSupplierProfile });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.updateProfile,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.profile }),
  });
}
