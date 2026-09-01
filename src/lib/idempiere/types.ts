/**
 * Raw shapes returned by the iDempiere Supplier Purchase Order API, as
 * documented in docs/SupplierPortal.pdf. These are intentionally left
 * close to the wire format (decimals as numbers, iDempiere doc statuses,
 * free-text order statuses) — src/lib/idempiere/mappers.ts converts them
 * into the frontend's `PurchaseOrder` shape.
 */

export interface RawTokenResponse {
  userId: number;
  language: string;
  menuTreeId: number;
  token: string;
  refresh_token: string;
}

export interface RawPOListItem {
  poId: number;
  poNumber: string;
  description: string;
  issueDate: string;
  expectedDeliveryDate: string;
  orderStatus: string;
  costCenter: string;
  contactName: string;
  contactEmail: string;
  deliveryAddress: string;
  termsAndConditions: string;
  itemNumber: number;
  netPayable: number;
  grandTotal: number;
  vdsAmount: number;
  tdsAmount: number;
  billDetails: string;
  billSubmittedAmount: number;
  paymentDueAmount: number;
  paidAmount: number;
  binNumber: string;
  currencySymbol: string;
  currencyISOCode: string;
}

export interface RawPOListResponse {
  supplierName: string;
  supplierCode: string;
  totalRecords: number;
  purchaseOrders: RawPOListItem[];
  status: string;
}

export interface RawPOLineItem {
  line: number;
  productId: number;
  itemCode: string;
  itemName: string;
  description: string;
  unit: string;
  quantity: number;
  quantityDelivered: number;
  quantityInvoiced: number;
  unitPrice: number;
  total: number;
  vatRate: string;
  vdsAmount: number | null;
  vdsIncluding: boolean;
  vdsExcluding: boolean;
  vdsExempted: boolean;
  tdsAmount: number;
  tdsIncluding: boolean;
  tdsExcluding: boolean;
  tdsExempted: boolean;
  supplementaryDuty: number;
  supplementaryDutyAmount: number;
}

export interface RawPODetailResponse {
  poId: number;
  poNumber: string;
  description: string;
  docStatus: string;
  orderStatus: string;
  costCenter: string;
  contactName: string;
  contactEmail: string;
  deliveryAddress: string;
  termsAndConditions: string;
  issueDate: string;
  expectedDeliveryDate: string;
  itemNumber: number;
  totalLines: number;
  orderedQty: number;
  deliveredQty: number;
  netPayable: number;
  grandTotal: number;
  vdsAmount: number;
  tdsAmount: number;
  billDetails: string;
  billSubmittedAmount: number;
  paymentDueAmount: number;
  paidAmount: number;
  binNumber: string;
  currencyISOCode: string;
  linesData: RawPOLineItem[];
}
