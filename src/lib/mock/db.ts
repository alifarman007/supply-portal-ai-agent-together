import type {
  PurchaseOrder, Invoice, Payment, DeliveryChallan,
  ComplianceDocument, SupplierNotification, SupplierProfile, SupplierKpiSummary,
  Tender, Bid,
} from "./types";
import {
  BUYER_DEPARTMENTS, BUYER_CONTACTS, DELIVERY_ADDRESSES, PRODUCTS, TERMS,
  BANKS, mulberry32, pick,
} from "./supplier-data";

export const NOW = new Date("2026-06-30T10:00:00+06:00");
const rng = mulberry32(42);

function daysAgo(n: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function daysFromNow(n: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

// --- Purchase Orders ---
export const purchaseOrders: PurchaseOrder[] = [
  // fulfilled
  {
    id: "po-001", poNumber: "PO-2026-0001",
    issuedDate: daysAgo(180), requiredDeliveryDate: daysAgo(165),
    buyerDepartment: "Procurement & Supply Chain",
    buyerContactName: "Md. Habibur Rahman", buyerContactEmail: "habibur.rahman@kazifarms.com",
    items: [
      { id: "poi-001-1", description: "Corrugated Carton Box (30×20×15 cm)", unit: "pcs", quantity: 5000, unitPrice: 45, totalPrice: 225000 },
      { id: "poi-001-2", description: "Stretch Wrap Film (500mm × 300m roll)", unit: "roll", quantity: 100, unitPrice: 680, totalPrice: 68000 },
    ],
    subtotal: 293000, vatAmount: 43950, grandTotal: 336950,
    status: "fulfilled", termsAndConditions: TERMS,
    deliveryAddress: "Warehouse Block B, Narayanganj-1400",
    acknowledgedAt: daysAgo(178),
  },
  {
    id: "po-002", poNumber: "PO-2026-0008",
    issuedDate: daysAgo(150), requiredDeliveryDate: daysAgo(135),
    buyerDepartment: "Operations",
    buyerContactName: "Fatema Begum", buyerContactEmail: "fatema.begum@kazifarms.com",
    items: [
      { id: "poi-002-1", description: "BOPP Laminated Woven Bag (50 kg capacity)", unit: "pcs", quantity: 2000, unitPrice: 120, totalPrice: 240000 },
      { id: "poi-002-2", description: "Kraft Paper Bag (Multi-wall, 5-ply)", unit: "pcs", quantity: 3000, unitPrice: 85, totalPrice: 255000 },
    ],
    subtotal: 495000, vatAmount: 74250, grandTotal: 569250,
    status: "fulfilled", termsAndConditions: TERMS,
    deliveryAddress: "Factory Gate 3, Tejgaon I/A, Dhaka-1208",
    acknowledgedAt: daysAgo(148),
  },
  // partially_fulfilled
  {
    id: "po-003", poNumber: "PO-2026-0015",
    issuedDate: daysAgo(120), requiredDeliveryDate: daysAgo(100),
    buyerDepartment: "Facilities Management",
    buyerContactName: "Shafiqul Islam", buyerContactEmail: "shafiqul.islam@kazifarms.com",
    items: [
      { id: "poi-003-1", description: "Bubble Wrap Roll (1.2m × 50m)", unit: "roll", quantity: 200, unitPrice: 950, totalPrice: 190000 },
      { id: "poi-003-2", description: "Foam Corner Protector Set", unit: "set", quantity: 1000, unitPrice: 60, totalPrice: 60000 },
    ],
    subtotal: 250000, vatAmount: 37500, grandTotal: 287500,
    status: "partially_fulfilled", termsAndConditions: TERMS,
    deliveryAddress: "Head Office Store Room, Motijheel C/A, Dhaka-1000",
    acknowledgedAt: daysAgo(118),
  },
  {
    id: "po-004", poNumber: "PO-2026-0019",
    issuedDate: daysAgo(100), requiredDeliveryDate: daysAgo(85),
    buyerDepartment: "Information Technology",
    buyerContactName: "Nusrat Jahan", buyerContactEmail: "nusrat.jahan@kazifarms.com",
    items: [
      { id: "poi-004-1", description: "Thermal Transfer Label (100×150 mm)", unit: "ream", quantity: 500, unitPrice: 350, totalPrice: 175000 },
      { id: "poi-004-2", description: "Cello Tape (48mm × 65m, 6-pack)", unit: "box", quantity: 200, unitPrice: 420, totalPrice: 84000 },
    ],
    subtotal: 259000, vatAmount: 38850, grandTotal: 297850,
    status: "partially_fulfilled", termsAndConditions: TERMS,
    deliveryAddress: "BGMEA Complex, Kawran Bazar, Dhaka-1215",
    acknowledgedAt: daysAgo(98),
  },
  // acknowledged
  {
    id: "po-005", poNumber: "PO-2026-0025",
    issuedDate: daysAgo(60), requiredDeliveryDate: daysAgo(45),
    buyerDepartment: "Finance & Accounts",
    buyerContactName: "Kamrul Hasan", buyerContactEmail: "kamrul.hasan@kazifarms.com",
    items: [
      { id: "poi-005-1", description: "Corrugated Carton Box (30×20×15 cm)", unit: "pcs", quantity: 8000, unitPrice: 45, totalPrice: 360000 },
    ],
    subtotal: 360000, vatAmount: 54000, grandTotal: 414000,
    status: "acknowledged", termsAndConditions: TERMS,
    deliveryAddress: "Distribution Hub, Savar EPZ, Savar-1340",
    acknowledgedAt: daysAgo(58),
  },
  {
    id: "po-006", poNumber: "PO-2026-0031",
    issuedDate: daysAgo(45), requiredDeliveryDate: daysAgo(30),
    buyerDepartment: "Operations",
    buyerContactName: "Fatema Begum", buyerContactEmail: "fatema.begum@kazifarms.com",
    items: [
      { id: "poi-006-1", description: "Moisture-Proof Poly Bag (Large)", unit: "box", quantity: 300, unitPrice: 220, totalPrice: 66000 },
      { id: "poi-006-2", description: "PVC Shrink Wrap Film (19 micron)", unit: "kg", quantity: 500, unitPrice: 180, totalPrice: 90000 },
    ],
    subtotal: 156000, vatAmount: 23400, grandTotal: 179400,
    status: "acknowledged", termsAndConditions: TERMS,
    deliveryAddress: "Warehouse Block B, Narayanganj-1400",
    acknowledgedAt: daysAgo(43),
  },
  {
    id: "po-007", poNumber: "PO-2026-0037",
    issuedDate: daysAgo(30), requiredDeliveryDate: daysFromNow(5),
    buyerDepartment: "Human Resources",
    buyerContactName: "Md. Habibur Rahman", buyerContactEmail: "habibur.rahman@kazifarms.com",
    items: [
      { id: "poi-007-1", description: "Kraft Paper Bag (Multi-wall, 5-ply)", unit: "pcs", quantity: 5000, unitPrice: 85, totalPrice: 425000 },
    ],
    subtotal: 425000, vatAmount: 63750, grandTotal: 488750,
    status: "acknowledged", termsAndConditions: TERMS,
    deliveryAddress: "Factory Gate 3, Tejgaon I/A, Dhaka-1208",
    acknowledgedAt: daysAgo(28),
  },
  // issued (awaiting acknowledgment)
  {
    id: "po-008", poNumber: "PO-2026-0041",
    issuedDate: daysAgo(5), requiredDeliveryDate: daysFromNow(20),
    buyerDepartment: "Procurement & Supply Chain",
    buyerContactName: "Shafiqul Islam", buyerContactEmail: "shafiqul.islam@kazifarms.com",
    items: [
      { id: "poi-008-1", description: "Corrugated Carton Box (30×20×15 cm)", unit: "pcs", quantity: 10000, unitPrice: 45, totalPrice: 450000 },
      { id: "poi-008-2", description: "Stretch Wrap Film (500mm × 300m roll)", unit: "roll", quantity: 150, unitPrice: 680, totalPrice: 102000 },
      { id: "poi-008-3", description: "Cello Tape (48mm × 65m, 6-pack)", unit: "box", quantity: 100, unitPrice: 420, totalPrice: 42000 },
    ],
    subtotal: 594000, vatAmount: 89100, grandTotal: 683100,
    status: "issued", termsAndConditions: TERMS,
    deliveryAddress: "Distribution Hub, Savar EPZ, Savar-1340",
  },
  {
    id: "po-009", poNumber: "PO-2026-0042",
    issuedDate: daysAgo(3), requiredDeliveryDate: daysFromNow(25),
    buyerDepartment: "Operations",
    buyerContactName: "Nusrat Jahan", buyerContactEmail: "nusrat.jahan@kazifarms.com",
    items: [
      { id: "poi-009-1", description: "Bubble Wrap Roll (1.2m × 50m)", unit: "roll", quantity: 300, unitPrice: 950, totalPrice: 285000 },
    ],
    subtotal: 285000, vatAmount: 42750, grandTotal: 327750,
    status: "issued", termsAndConditions: TERMS,
    deliveryAddress: "BGMEA Complex, Kawran Bazar, Dhaka-1215",
  },
  {
    id: "po-010", poNumber: "PO-2026-0043",
    issuedDate: daysAgo(2), requiredDeliveryDate: daysFromNow(30),
    buyerDepartment: "Information Technology",
    buyerContactName: "Kamrul Hasan", buyerContactEmail: "kamrul.hasan@kazifarms.com",
    items: [
      { id: "poi-010-1", description: "Thermal Transfer Label (100×150 mm)", unit: "ream", quantity: 800, unitPrice: 350, totalPrice: 280000 },
      { id: "poi-010-2", description: "Foam Corner Protector Set", unit: "set", quantity: 500, unitPrice: 60, totalPrice: 30000 },
    ],
    subtotal: 310000, vatAmount: 46500, grandTotal: 356500,
    status: "issued", termsAndConditions: TERMS,
    deliveryAddress: "Head Office Store Room, Motijheel C/A, Dhaka-1000",
  },
  {
    id: "po-011", poNumber: "PO-2026-0044",
    issuedDate: daysAgo(1), requiredDeliveryDate: daysFromNow(35),
    buyerDepartment: "Facilities Management",
    buyerContactName: "Md. Habibur Rahman", buyerContactEmail: "habibur.rahman@kazifarms.com",
    items: [
      { id: "poi-011-1", description: "BOPP Laminated Woven Bag (50 kg capacity)", unit: "pcs", quantity: 1500, unitPrice: 120, totalPrice: 180000 },
      { id: "poi-011-2", description: "Moisture-Proof Poly Bag (Large)", unit: "box", quantity: 200, unitPrice: 220, totalPrice: 44000 },
    ],
    subtotal: 224000, vatAmount: 33600, grandTotal: 257600,
    status: "issued", termsAndConditions: TERMS,
    deliveryAddress: "Warehouse Block B, Narayanganj-1400",
  },
  {
    id: "po-012", poNumber: "PO-2026-0045",
    issuedDate: daysAgo(1), requiredDeliveryDate: daysFromNow(28),
    buyerDepartment: "Finance & Accounts",
    buyerContactName: "Fatema Begum", buyerContactEmail: "fatema.begum@kazifarms.com",
    items: [
      { id: "poi-012-1", description: "PVC Shrink Wrap Film (19 micron)", unit: "kg", quantity: 1000, unitPrice: 180, totalPrice: 180000 },
    ],
    subtotal: 180000, vatAmount: 27000, grandTotal: 207000,
    status: "issued", termsAndConditions: TERMS,
    deliveryAddress: "Factory Gate 3, Tejgaon I/A, Dhaka-1208",
  },
  // cancelled
  {
    id: "po-013", poNumber: "PO-2026-0011",
    issuedDate: daysAgo(130), requiredDeliveryDate: daysAgo(115),
    buyerDepartment: "Human Resources",
    buyerContactName: "Shafiqul Islam", buyerContactEmail: "shafiqul.islam@kazifarms.com",
    items: [
      { id: "poi-013-1", description: "Corrugated Carton Box (30×20×15 cm)", unit: "pcs", quantity: 2000, unitPrice: 45, totalPrice: 90000 },
    ],
    subtotal: 90000, vatAmount: 13500, grandTotal: 103500,
    status: "cancelled", termsAndConditions: TERMS,
    deliveryAddress: "BGMEA Complex, Kawran Bazar, Dhaka-1215",
    notes: "Cancelled due to change in procurement plan.",
  },
  // draft
  {
    id: "po-014", poNumber: "PO-2026-0046",
    issuedDate: daysAgo(0), requiredDeliveryDate: daysFromNow(45),
    buyerDepartment: "Procurement & Supply Chain",
    buyerContactName: "Md. Habibur Rahman", buyerContactEmail: "habibur.rahman@kazifarms.com",
    items: [
      { id: "poi-014-1", description: "Kraft Paper Bag (Multi-wall, 5-ply)", unit: "pcs", quantity: 10000, unitPrice: 85, totalPrice: 850000 },
    ],
    subtotal: 850000, vatAmount: 127500, grandTotal: 977500,
    status: "draft", termsAndConditions: TERMS,
    deliveryAddress: "Distribution Hub, Savar EPZ, Savar-1340",
  },
];

// --- Tenders ---
export const tenders: Tender[] = [
  // published, open, no bid submitted yet — eligible
  {
    id: "tnd-001", tenderNumber: "TND-2026-0012",
    title: "Supply of Corrugated Packaging Materials — Annual Rate Contract",
    category: "Packaging Materials",
    description: "Annual rate contract for supply of corrugated cartons and protective packaging materials across all Kazi Farms Group warehouses. Suppliers must be able to fulfil rolling monthly call-off orders.",
    buyerDepartment: "Procurement & Supply Chain",
    buyerContactName: "Md. Habibur Rahman", buyerContactEmail: "habibur.rahman@kazifarms.com",
    publishedDate: daysAgo(6), submissionDeadline: daysFromNow(12), bidOpeningDate: daysFromNow(13),
    estimatedValue: 4500000,
    items: [
      { id: "tli-001-1", description: "Corrugated Carton Box (30×20×15 cm)", specification: "5-ply, burst strength ≥ 18 kg/cm²", unit: "pcs", quantity: 60000 },
      { id: "tli-001-2", description: "Stretch Wrap Film (500mm × 300m roll)", specification: "23 micron, pre-stretch ≥ 150%", unit: "roll", quantity: 1200 },
    ],
    eligibilityCriteria: [
      "Minimum 3 years of continuous operation in packaging manufacturing",
      "Annual turnover of at least ৳2 crore for the last 2 fiscal years",
      "Valid trade license and VAT registration (BIN)",
      "ISO 9001:2015 certification preferred",
    ],
    requiredDocuments: ["trade_license", "tin_certificate", "vat_registration"],
    status: "published",
    clarifications: [
      {
        id: "tc-001-1",
        question: "Will partial deliveries against a single call-off order be accepted?",
        askedBy: "Ahsan Kabir", askedAt: daysAgo(2),
        response: "Yes, partial deliveries are acceptable provided the full quantity is completed within the call-off lead time of 15 days.",
        respondedBy: "Md. Habibur Rahman", respondedAt: daysAgo(1),
      },
    ],
  },
  // published, near deadline — supplier already bid (bid-001)
  {
    id: "tnd-002", tenderNumber: "TND-2026-0009",
    title: "Industrial Poly Bags & Shrink Wrap Supply",
    category: "Packaging Materials",
    description: "Procurement of moisture-proof poly bags and PVC shrink wrap film for the Narayanganj distribution hub.",
    buyerDepartment: "Operations",
    buyerContactName: "Fatema Begum", buyerContactEmail: "fatema.begum@kazifarms.com",
    publishedDate: daysAgo(20), submissionDeadline: daysFromNow(2), bidOpeningDate: daysFromNow(3),
    estimatedValue: 620000,
    items: [
      { id: "tli-002-1", description: "Moisture-Proof Poly Bag (Large)", specification: "0.08mm LDPE, heat-sealable", unit: "box", quantity: 800 },
      { id: "tli-002-2", description: "PVC Shrink Wrap Film (19 micron)", specification: "Clear, shrink ratio ≥ 45%", unit: "kg", quantity: 1500 },
    ],
    eligibilityCriteria: [
      "Valid trade license and VAT registration (BIN)",
      "Prior supply record with Kazi Farms Group preferred",
    ],
    requiredDocuments: ["trade_license", "vat_registration"],
    status: "published",
    clarifications: [],
  },
  // evaluation — supplier bid under review (bid-002 will be clarification instead, keep this one clean under_evaluation)
  {
    id: "tnd-003", tenderNumber: "TND-2026-0004",
    title: "Corporate Stationery & Office Consumables Framework",
    category: "Office & Stationery Consumables",
    description: "Two-year framework agreement for thermal labels, tapes and general office consumables across head office and factory sites.",
    buyerDepartment: "Information Technology",
    buyerContactName: "Nusrat Jahan", buyerContactEmail: "nusrat.jahan@kazifarms.com",
    publishedDate: daysAgo(35), submissionDeadline: daysAgo(15), bidOpeningDate: daysAgo(14),
    estimatedValue: 980000,
    items: [
      { id: "tli-003-1", description: "Thermal Transfer Label (100×150 mm)", specification: "Semi-gloss, permanent adhesive", unit: "ream", quantity: 2000 },
      { id: "tli-003-2", description: "Cello Tape (48mm × 65m, 6-pack)", specification: "BOPP, transparent", unit: "box", quantity: 600 },
    ],
    eligibilityCriteria: [
      "Valid trade license and TIN certificate",
      "Ability to deliver within 7 days of purchase order across all sites",
    ],
    requiredDocuments: ["trade_license", "tin_certificate"],
    status: "negotiation",
    clarifications: [],
  },
  // awarded — this supplier won
  {
    id: "tnd-004", tenderNumber: "TND-2025-0087",
    title: "Warehouse Racking & Storage Systems Supply",
    category: "Storage & Warehousing Equipment",
    description: "Supply and installation of protective storage and racking accessories for the Savar EPZ distribution hub expansion.",
    buyerDepartment: "Facilities Management",
    buyerContactName: "Shafiqul Islam", buyerContactEmail: "shafiqul.islam@kazifarms.com",
    publishedDate: daysAgo(150), submissionDeadline: daysAgo(120), bidOpeningDate: daysAgo(119),
    estimatedValue: 350000,
    items: [
      { id: "tli-004-1", description: "Foam Corner Protector Set", specification: "High-density EPE foam, 90° corner", unit: "set", quantity: 1200 },
      { id: "tli-004-2", description: "Bubble Wrap Roll (1.2m × 50m)", specification: "Anti-static, 2-layer", unit: "roll", quantity: 250 },
    ],
    eligibilityCriteria: [
      "Valid trade license and VAT registration (BIN)",
      "Site installation capability within Dhaka division",
    ],
    requiredDocuments: ["trade_license", "vat_registration"],
    status: "awarded",
    clarifications: [],
    awardedSupplierName: "Dhaka Packaging Industries Ltd.",
    awardedAt: daysAgo(112),
  },
  // awarded — different supplier won (this supplier lost)
  {
    id: "tnd-005", tenderNumber: "TND-2025-0072",
    title: "Bubble Wrap & Protective Packaging Annual Supply",
    category: "Packaging Materials",
    description: "Annual supply of protective packaging consumables for the Tejgaon factory gate distribution point.",
    buyerDepartment: "Operations",
    buyerContactName: "Fatema Begum", buyerContactEmail: "fatema.begum@kazifarms.com",
    publishedDate: daysAgo(170), submissionDeadline: daysAgo(140), bidOpeningDate: daysAgo(139),
    estimatedValue: 410000,
    items: [
      { id: "tli-005-1", description: "Bubble Wrap Roll (1.2m × 50m)", specification: "Anti-static, 2-layer", unit: "roll", quantity: 300 },
      { id: "tli-005-2", description: "Foam Corner Protector Set", specification: "High-density EPE foam, 90° corner", unit: "set", quantity: 800 },
    ],
    eligibilityCriteria: [
      "Valid trade license and VAT registration (BIN)",
    ],
    requiredDocuments: ["trade_license", "vat_registration"],
    status: "awarded",
    clarifications: [],
    awardedSupplierName: "Bengal Poly Industries Ltd.",
    awardedAt: daysAgo(132),
  },
  // closed — supplier did not participate
  {
    id: "tnd-006", tenderNumber: "TND-2025-0061",
    title: "ISO-Certified Corrugated Box Manufacturing Partnership",
    category: "Packaging Materials",
    description: "Long-term manufacturing partnership for ISO-certified corrugated boxes supplying all Kazi Farms Group factory sites.",
    buyerDepartment: "Procurement & Supply Chain",
    buyerContactName: "Md. Habibur Rahman", buyerContactEmail: "habibur.rahman@kazifarms.com",
    publishedDate: daysAgo(200), submissionDeadline: daysAgo(170), bidOpeningDate: daysAgo(169),
    estimatedValue: 6200000,
    items: [
      { id: "tli-006-1", description: "Corrugated Carton Box (30×20×15 cm)", specification: "5-ply, ISO 9001 manufactured", unit: "pcs", quantity: 150000 },
    ],
    eligibilityCriteria: [
      "ISO 9001:2015 certification mandatory",
      "Minimum 5 years of continuous operation",
    ],
    requiredDocuments: ["trade_license", "vat_registration", "iso_certification"],
    status: "closed",
    clarifications: [],
  },
  // published, prequalification blocked — supplier's bank solvency cert is expired
  {
    id: "tnd-007", tenderNumber: "TND-2026-0015",
    title: "Thermal Label & Barcode Consumables Supply",
    category: "IT & Barcode Consumables",
    description: "Supply of barcode and thermal label consumables for warehouse inventory tracking systems.",
    buyerDepartment: "Information Technology",
    buyerContactName: "Kamrul Hasan", buyerContactEmail: "kamrul.hasan@kazifarms.com",
    publishedDate: daysAgo(3), submissionDeadline: daysFromNow(20), bidOpeningDate: daysFromNow(21),
    estimatedValue: 780000,
    items: [
      { id: "tli-007-1", description: "Thermal Transfer Label (100×150 mm)", specification: "Semi-gloss, permanent adhesive", unit: "ream", quantity: 1800 },
    ],
    eligibilityCriteria: [
      "Valid trade license and VAT registration (BIN)",
      "Valid bank solvency certificate required for financial capability assessment",
    ],
    requiredDocuments: ["trade_license", "vat_registration", "bank_solvency"],
    status: "published",
    clarifications: [],
  },
  // cancelled
  {
    id: "tnd-008", tenderNumber: "TND-2026-0002",
    title: "Emergency PPE & Safety Equipment Procurement",
    category: "Safety & PPE Equipment",
    description: "Emergency procurement of personal protective equipment for factory floor staff.",
    buyerDepartment: "Human Resources",
    buyerContactName: "Shafiqul Islam", buyerContactEmail: "shafiqul.islam@kazifarms.com",
    publishedDate: daysAgo(45), submissionDeadline: daysAgo(30), bidOpeningDate: daysAgo(29),
    estimatedValue: 190000,
    items: [
      { id: "tli-008-1", description: "Foam Corner Protector Set", specification: "N/A — placeholder line item", unit: "set", quantity: 100 },
    ],
    eligibilityCriteria: ["Valid trade license"],
    requiredDocuments: ["trade_license"],
    status: "cancelled",
    clarifications: [],
    cancelReason: "Procurement requirement withdrawn by Finance & Accounts department due to budget reallocation.",
  },
];

// --- Bids ---
export const bids: Bid[] = [
  {
    id: "bid-001", bidNumber: "BID-2026-0031",
    tenderId: "tnd-002", tenderNumber: "TND-2026-0009", tenderTitle: "Industrial Poly Bags & Shrink Wrap Supply",
    supplierId: "SP-2024-001",
    submittedAt: daysAgo(5),
    technicalNotes: "We propose LDPE poly bags sourced from our in-house extrusion line, with heat-seal strength exceeding the minimum specification by 20%. Lead time: 10 days from PO.",
    items: [
      { id: "bli-001-1", tenderLineItemId: "tli-002-1", description: "Moisture-Proof Poly Bag (Large)", unit: "box", quantity: 800, specificationOffered: "0.09mm LDPE, heat-sealable, reinforced seams", unitPrice: 215, totalPrice: 172000 },
      { id: "bli-001-2", tenderLineItemId: "tli-002-2", description: "PVC Shrink Wrap Film (19 micron)", unit: "kg", quantity: 1500, specificationOffered: "Clear, shrink ratio 48%", unitPrice: 175, totalPrice: 262500 },
    ],
    subtotal: 434500, vatAmount: 65175, totalBidAmount: 499675,
    bidValidityDays: 90,
    status: "under_evaluation",
    clarifications: [],
    timeline: [
      { status: "submitted", timestamp: daysAgo(5), actor: "Ahsan Kabir" },
      { status: "under_evaluation", timestamp: daysAgo(3), actor: "Fatema Begum", note: "Technical evaluation in progress." },
    ],
  },
  {
    id: "bid-002", bidNumber: "BID-2026-0018",
    tenderId: "tnd-003", tenderNumber: "TND-2026-0004", tenderTitle: "Corporate Stationery & Office Consumables Framework",
    supplierId: "SP-2024-001",
    submittedAt: daysAgo(16),
    technicalNotes: "Supply proposal covers all listed items with delivery from our Tejgaon warehouse within 5 business days of each purchase order.",
    items: [
      { id: "bli-002-1", tenderLineItemId: "tli-003-1", description: "Thermal Transfer Label (100×150 mm)", unit: "ream", quantity: 2000, specificationOffered: "Semi-gloss, permanent adhesive", unitPrice: 340, totalPrice: 680000 },
      { id: "bli-002-2", tenderLineItemId: "tli-003-2", description: "Cello Tape (48mm × 65m, 6-pack)", unit: "box", quantity: 600, specificationOffered: "BOPP, transparent, 6-pack", unitPrice: 410, totalPrice: 246000 },
    ],
    subtotal: 926000, vatAmount: 138900, totalBidAmount: 1064900,
    bidValidityDays: 60,
    status: "clarification_requested",
    clarifications: [
      {
        id: "bc-002-1",
        question: "Your quoted unit price for the thermal transfer label is 8% above the median of received bids. Can you clarify if a volume discount is possible for orders above 1000 reams, and confirm the origin of the label stock (local vs. imported)?",
        askedBy: "Nusrat Jahan", askedAt: daysAgo(4),
      },
    ],
    timeline: [
      { status: "submitted", timestamp: daysAgo(16), actor: "Ahsan Kabir" },
      { status: "under_evaluation", timestamp: daysAgo(12), actor: "Nusrat Jahan" },
      { status: "clarification_requested", timestamp: daysAgo(4), actor: "Nusrat Jahan", note: "Pricing and stock origin clarification requested." },
    ],
  },
  {
    id: "bid-003", bidNumber: "BID-2025-0142",
    tenderId: "tnd-004", tenderNumber: "TND-2025-0087", tenderTitle: "Warehouse Racking & Storage Systems Supply",
    supplierId: "SP-2024-001",
    submittedAt: daysAgo(118),
    technicalNotes: "Proposal includes on-site installation support and a 12-month replacement warranty on all foam and bubble wrap protective materials.",
    items: [
      { id: "bli-003-1", tenderLineItemId: "tli-004-1", description: "Foam Corner Protector Set", unit: "set", quantity: 1200, specificationOffered: "High-density EPE foam, 90° corner, reinforced edge", unitPrice: 58, totalPrice: 69600 },
      { id: "bli-003-2", tenderLineItemId: "tli-004-2", description: "Bubble Wrap Roll (1.2m × 50m)", unit: "roll", quantity: 250, specificationOffered: "Anti-static, 2-layer, UV-stabilized", unitPrice: 920, totalPrice: 230000 },
    ],
    subtotal: 299600, vatAmount: 44940, totalBidAmount: 344540,
    bidValidityDays: 90,
    status: "awarded",
    technicalScore: 92, financialScore: 88,
    evaluationRemarks: "Best overall value for money with strong technical compliance (96%) and competitive pricing. Installation support was a key differentiator.",
    clarifications: [],
    timeline: [
      { status: "submitted", timestamp: daysAgo(118), actor: "Ahsan Kabir" },
      { status: "under_evaluation", timestamp: daysAgo(116), actor: "Shafiqul Islam" },
      { status: "shortlisted", timestamp: daysAgo(114), actor: "Shafiqul Islam" },
      { status: "awarded", timestamp: daysAgo(112), actor: "Shafiqul Islam", note: "Contract awarded — Purchase Order to follow." },
    ],
  },
  {
    id: "bid-004", bidNumber: "BID-2025-0119",
    tenderId: "tnd-005", tenderNumber: "TND-2025-0072", tenderTitle: "Bubble Wrap & Protective Packaging Annual Supply",
    supplierId: "SP-2024-001",
    submittedAt: daysAgo(148),
    technicalNotes: "Standard specification protective packaging materials sourced from our regular production line.",
    items: [
      { id: "bli-004-1", tenderLineItemId: "tli-005-1", description: "Bubble Wrap Roll (1.2m × 50m)", unit: "roll", quantity: 300, specificationOffered: "Anti-static, 2-layer", unitPrice: 960, totalPrice: 288000 },
      { id: "bli-004-2", tenderLineItemId: "tli-005-2", description: "Foam Corner Protector Set", unit: "set", quantity: 800, specificationOffered: "High-density EPE foam, 90° corner", unitPrice: 62, totalPrice: 49600 },
    ],
    subtotal: 337600, vatAmount: 50640, totalBidAmount: 388240,
    bidValidityDays: 60,
    status: "not_awarded",
    technicalScore: 85, financialScore: 70,
    evaluationRemarks: "Technically compliant, but a competing bidder offered equivalent specifications at approximately 8% lower pricing.",
    clarifications: [],
    timeline: [
      { status: "submitted", timestamp: daysAgo(148), actor: "Ahsan Kabir" },
      { status: "under_evaluation", timestamp: daysAgo(144), actor: "Fatema Begum" },
      { status: "shortlisted", timestamp: daysAgo(140), actor: "Fatema Begum" },
      { status: "not_awarded", timestamp: daysAgo(132), actor: "Fatema Begum", note: "Contract awarded to a competing bidder on price." },
    ],
  },
];

// --- Invoices ---
export const invoices: Invoice[] = [
  {
    id: "inv-001", invoiceNumber: "INV-2026-0045", supplierId: "SP-2024-001",
    poId: "po-001", poNumber: "PO-2026-0001",
    invoiceDate: daysAgo(160), dueDate: daysAgo(130),
    submittedAt: daysAgo(158),
    items: [
      { id: "ii-001-1", poLineItemId: "poi-001-1", description: "Corrugated Carton Box (30×20×15 cm)", unit: "pcs", quantity: 5000, unitPrice: 45, totalPrice: 225000 },
      { id: "ii-001-2", poLineItemId: "poi-001-2", description: "Stretch Wrap Film (500mm × 300m roll)", unit: "roll", quantity: 100, unitPrice: 680, totalPrice: 68000 },
    ],
    subtotal: 293000, vatAmount: 43950, aitAmount: 8790, tdsAmount: 0, totalAmount: 328160,
    status: "paid", approvedBy: "Md. Habibur Rahman", approvedAt: daysAgo(152), paidAt: daysAgo(130),
    paymentRef: "PAY-2026-0012",
    timeline: [
      { status: "submitted", timestamp: daysAgo(158), actor: "Ahsan Kabir" },
      { status: "under_review", timestamp: daysAgo(155), actor: "Md. Habibur Rahman" },
      { status: "approved", timestamp: daysAgo(152), actor: "Md. Habibur Rahman" },
      { status: "paid", timestamp: daysAgo(130), actor: "System" },
    ],
  },
  {
    id: "inv-002", invoiceNumber: "INV-2026-0068", supplierId: "SP-2024-001",
    poId: "po-002", poNumber: "PO-2026-0008",
    invoiceDate: daysAgo(135), dueDate: daysAgo(105),
    submittedAt: daysAgo(133),
    items: [
      { id: "ii-002-1", poLineItemId: "poi-002-1", description: "BOPP Laminated Woven Bag (50 kg capacity)", unit: "pcs", quantity: 2000, unitPrice: 120, totalPrice: 240000 },
      { id: "ii-002-2", poLineItemId: "poi-002-2", description: "Kraft Paper Bag (Multi-wall, 5-ply)", unit: "pcs", quantity: 3000, unitPrice: 85, totalPrice: 255000 },
    ],
    subtotal: 495000, vatAmount: 74250, aitAmount: 14850, tdsAmount: 0, totalAmount: 554400,
    status: "paid", approvedBy: "Fatema Begum", approvedAt: daysAgo(127), paidAt: daysAgo(105),
    paymentRef: "PAY-2026-0019",
    timeline: [
      { status: "submitted", timestamp: daysAgo(133), actor: "Ahsan Kabir" },
      { status: "under_review", timestamp: daysAgo(130), actor: "Fatema Begum" },
      { status: "approved", timestamp: daysAgo(127), actor: "Fatema Begum" },
      { status: "paid", timestamp: daysAgo(105), actor: "System" },
    ],
  },
  {
    id: "inv-003", invoiceNumber: "INV-2026-0081", supplierId: "SP-2024-001",
    poId: "po-003", poNumber: "PO-2026-0015",
    invoiceDate: daysAgo(105), dueDate: daysAgo(75),
    submittedAt: daysAgo(103),
    items: [
      { id: "ii-003-1", poLineItemId: "poi-003-1", description: "Bubble Wrap Roll (1.2m × 50m)", unit: "roll", quantity: 100, unitPrice: 950, totalPrice: 95000 },
      { id: "ii-003-2", poLineItemId: "poi-003-2", description: "Foam Corner Protector Set", unit: "set", quantity: 500, unitPrice: 60, totalPrice: 30000 },
    ],
    subtotal: 125000, vatAmount: 18750, aitAmount: 3750, tdsAmount: 0, totalAmount: 140000,
    status: "paid", approvedBy: "Shafiqul Islam", approvedAt: daysAgo(97), paidAt: daysAgo(75),
    paymentRef: "PAY-2026-0026",
    timeline: [
      { status: "submitted", timestamp: daysAgo(103), actor: "Ahsan Kabir" },
      { status: "under_review", timestamp: daysAgo(100), actor: "Shafiqul Islam" },
      { status: "approved", timestamp: daysAgo(97), actor: "Shafiqul Islam" },
      { status: "paid", timestamp: daysAgo(75), actor: "System" },
    ],
  },
  {
    id: "inv-004", invoiceNumber: "INV-2026-0094", supplierId: "SP-2024-001",
    poId: "po-004", poNumber: "PO-2026-0019",
    invoiceDate: daysAgo(80), dueDate: daysAgo(50),
    submittedAt: daysAgo(78),
    items: [
      { id: "ii-004-1", poLineItemId: "poi-004-1", description: "Thermal Transfer Label (100×150 mm)", unit: "ream", quantity: 300, unitPrice: 350, totalPrice: 105000 },
    ],
    subtotal: 105000, vatAmount: 15750, aitAmount: 3150, tdsAmount: 0, totalAmount: 117600,
    status: "paid", approvedBy: "Nusrat Jahan", approvedAt: daysAgo(72), paidAt: daysAgo(50),
    paymentRef: "PAY-2026-0033",
    timeline: [
      { status: "submitted", timestamp: daysAgo(78), actor: "Ahsan Kabir" },
      { status: "under_review", timestamp: daysAgo(75), actor: "Nusrat Jahan" },
      { status: "approved", timestamp: daysAgo(72), actor: "Nusrat Jahan" },
      { status: "paid", timestamp: daysAgo(50), actor: "System" },
    ],
  },
  {
    id: "inv-005", invoiceNumber: "INV-2026-0107", supplierId: "SP-2024-001",
    poId: "po-005", poNumber: "PO-2026-0025",
    invoiceDate: daysAgo(50), dueDate: daysAgo(20),
    submittedAt: daysAgo(48),
    items: [
      { id: "ii-005-1", poLineItemId: "poi-005-1", description: "Corrugated Carton Box (30×20×15 cm)", unit: "pcs", quantity: 8000, unitPrice: 45, totalPrice: 360000 },
    ],
    subtotal: 360000, vatAmount: 54000, aitAmount: 10800, tdsAmount: 0, totalAmount: 403200,
    status: "paid", approvedBy: "Kamrul Hasan", approvedAt: daysAgo(42), paidAt: daysAgo(20),
    paymentRef: "PAY-2026-0041",
    timeline: [
      { status: "submitted", timestamp: daysAgo(48), actor: "Ahsan Kabir" },
      { status: "under_review", timestamp: daysAgo(45), actor: "Kamrul Hasan" },
      { status: "approved", timestamp: daysAgo(42), actor: "Kamrul Hasan" },
      { status: "paid", timestamp: daysAgo(20), actor: "System" },
    ],
  },
  {
    id: "inv-006", invoiceNumber: "INV-2026-0118", supplierId: "SP-2024-001",
    poId: "po-006", poNumber: "PO-2026-0031",
    invoiceDate: daysAgo(38), dueDate: daysAgo(8),
    submittedAt: daysAgo(36),
    items: [
      { id: "ii-006-1", poLineItemId: "poi-006-1", description: "Moisture-Proof Poly Bag (Large)", unit: "box", quantity: 300, unitPrice: 220, totalPrice: 66000 },
      { id: "ii-006-2", poLineItemId: "poi-006-2", description: "PVC Shrink Wrap Film (19 micron)", unit: "kg", quantity: 500, unitPrice: 180, totalPrice: 90000 },
    ],
    subtotal: 156000, vatAmount: 23400, aitAmount: 4680, tdsAmount: 0, totalAmount: 174720,
    status: "approved", approvedBy: "Fatema Begum", approvedAt: daysAgo(30),
    timeline: [
      { status: "submitted", timestamp: daysAgo(36), actor: "Ahsan Kabir" },
      { status: "under_review", timestamp: daysAgo(33), actor: "Fatema Begum" },
      { status: "approved", timestamp: daysAgo(30), actor: "Fatema Begum", note: "Approved. Payment scheduled within 7 business days." },
    ],
  },
  {
    id: "inv-007", invoiceNumber: "INV-2026-0125", supplierId: "SP-2024-001",
    poId: "po-007", poNumber: "PO-2026-0037",
    invoiceDate: daysAgo(20), dueDate: daysFromNow(10),
    submittedAt: daysAgo(18),
    items: [
      { id: "ii-007-1", poLineItemId: "poi-007-1", description: "Kraft Paper Bag (Multi-wall, 5-ply)", unit: "pcs", quantity: 5000, unitPrice: 85, totalPrice: 425000 },
    ],
    subtotal: 425000, vatAmount: 63750, aitAmount: 12750, tdsAmount: 0, totalAmount: 476000,
    status: "under_review",
    timeline: [
      { status: "submitted", timestamp: daysAgo(18), actor: "Ahsan Kabir" },
      { status: "under_review", timestamp: daysAgo(15), actor: "Md. Habibur Rahman" },
    ],
  },
  {
    id: "inv-008", invoiceNumber: "INV-2026-0129", supplierId: "SP-2024-001",
    poId: "po-003", poNumber: "PO-2026-0015",
    invoiceDate: daysAgo(10), dueDate: daysFromNow(20),
    submittedAt: daysAgo(8),
    items: [
      { id: "ii-008-1", poLineItemId: "poi-003-1", description: "Bubble Wrap Roll (1.2m × 50m)", unit: "roll", quantity: 100, unitPrice: 950, totalPrice: 95000 },
      { id: "ii-008-2", poLineItemId: "poi-003-2", description: "Foam Corner Protector Set", unit: "set", quantity: 500, unitPrice: 60, totalPrice: 30000 },
    ],
    subtotal: 125000, vatAmount: 18750, aitAmount: 3750, tdsAmount: 0, totalAmount: 140000,
    status: "submitted",
    timeline: [
      { status: "submitted", timestamp: daysAgo(8), actor: "Ahsan Kabir" },
    ],
  },
  {
    id: "inv-009", invoiceNumber: "INV-2026-0131", supplierId: "SP-2024-001",
    poId: "po-004", poNumber: "PO-2026-0019",
    invoiceDate: daysAgo(8), dueDate: daysFromNow(22),
    submittedAt: daysAgo(6),
    items: [
      { id: "ii-009-1", poLineItemId: "poi-004-2", description: "Cello Tape (48mm × 65m, 6-pack)", unit: "box", quantity: 200, unitPrice: 420, totalPrice: 84000 },
    ],
    subtotal: 84000, vatAmount: 12600, aitAmount: 2520, tdsAmount: 0, totalAmount: 94080,
    status: "submitted",
    timeline: [
      { status: "submitted", timestamp: daysAgo(6), actor: "Ahsan Kabir" },
    ],
  },
  {
    id: "inv-010", invoiceNumber: "INV-2026-0133", supplierId: "SP-2024-001",
    poId: "po-005", poNumber: "PO-2026-0025",
    invoiceDate: daysAgo(5), dueDate: daysFromNow(25),
    items: [],
    subtotal: 0, vatAmount: 0, aitAmount: 0, tdsAmount: 0, totalAmount: 0,
    status: "draft",
    timeline: [],
  },
  // Rejected invoice
  {
    id: "inv-011", invoiceNumber: "INV-2026-0089", supplierId: "SP-2024-001",
    poId: "po-003", poNumber: "PO-2026-0015",
    invoiceDate: daysAgo(90), dueDate: daysAgo(60),
    submittedAt: daysAgo(88),
    items: [
      { id: "ii-011-1", poLineItemId: "poi-003-1", description: "Bubble Wrap Roll (1.2m × 50m)", unit: "roll", quantity: 200, unitPrice: 950, totalPrice: 190000 },
    ],
    subtotal: 190000, vatAmount: 28500, aitAmount: 5700, tdsAmount: 0, totalAmount: 212800,
    status: "rejected",
    rejectionReason: "Invoice amount does not match the PO. Mushak-6.3 VAT invoice copy not attached. Please resubmit with correct documentation.",
    timeline: [
      { status: "submitted", timestamp: daysAgo(88), actor: "Ahsan Kabir" },
      { status: "under_review", timestamp: daysAgo(85), actor: "Shafiqul Islam" },
      { status: "rejected", timestamp: daysAgo(82), actor: "Shafiqul Islam", note: "Invoice amount does not match the PO. Mushak-6.3 VAT invoice copy not attached." },
    ],
  },
];

// --- Payments ---
export const payments: Payment[] = [
  {
    id: "pay-001", invoiceId: "inv-001", invoiceNumber: "INV-2026-0045", poNumber: "PO-2026-0001",
    paymentDate: daysAgo(130),
    grossAmount: 293000, vatDeductedAtSource: 43950, aitDeduction: 8790, tdsDeduction: 0, netAmountPaid: 240260,
    bankTransferRef: "BEFTN-2026-01-088341", bankName: "Dutch-Bangla Bank Ltd.", accountNumber: "****4521", status: "paid",
  },
  {
    id: "pay-002", invoiceId: "inv-002", invoiceNumber: "INV-2026-0068", poNumber: "PO-2026-0008",
    paymentDate: daysAgo(105),
    grossAmount: 495000, vatDeductedAtSource: 74250, aitDeduction: 14850, tdsDeduction: 0, netAmountPaid: 405900,
    bankTransferRef: "BEFTN-2026-02-091233", bankName: "Dutch-Bangla Bank Ltd.", accountNumber: "****4521", status: "paid",
  },
  {
    id: "pay-003", invoiceId: "inv-003", invoiceNumber: "INV-2026-0081", poNumber: "PO-2026-0015",
    paymentDate: daysAgo(75),
    grossAmount: 125000, vatDeductedAtSource: 18750, aitDeduction: 3750, tdsDeduction: 0, netAmountPaid: 102500,
    bankTransferRef: "BEFTN-2026-03-094112", bankName: "Dutch-Bangla Bank Ltd.", accountNumber: "****4521", status: "paid",
  },
  {
    id: "pay-004", invoiceId: "inv-004", invoiceNumber: "INV-2026-0094", poNumber: "PO-2026-0019",
    paymentDate: daysAgo(50),
    grossAmount: 105000, vatDeductedAtSource: 15750, aitDeduction: 3150, tdsDeduction: 0, netAmountPaid: 86100,
    bankTransferRef: "BEFTN-2026-04-097841", bankName: "Dutch-Bangla Bank Ltd.", accountNumber: "****4521", status: "paid",
  },
  {
    id: "pay-005", invoiceId: "inv-005", invoiceNumber: "INV-2026-0107", poNumber: "PO-2026-0025",
    paymentDate: daysAgo(20),
    grossAmount: 360000, vatDeductedAtSource: 54000, aitDeduction: 10800, tdsDeduction: 0, netAmountPaid: 295200,
    bankTransferRef: "BEFTN-2026-05-102234", bankName: "Dutch-Bangla Bank Ltd.", accountNumber: "****4521", status: "paid",
  },
];

// --- Delivery Challans ---
export const challans: DeliveryChallan[] = [
  {
    id: "dc-001", challanNumber: "DC-2026-0011", poId: "po-001", poNumber: "PO-2026-0001",
    items: [
      { id: "ci-001-1", poLineItemId: "poi-001-1", description: "Corrugated Carton Box (30×20×15 cm)", unit: "pcs", quantity: 5000 },
      { id: "ci-001-2", poLineItemId: "poi-001-2", description: "Stretch Wrap Film", unit: "roll", quantity: 100 },
    ],
    scheduledDeliveryDate: daysAgo(165), deliveryAddress: "Warehouse Block B, Narayanganj-1400",
    vehicleNumber: "DHAKA-GA-11-1234", driverName: "Md. Jamal Uddin",
    receivedBy: "Warehouse Officer", grnNumber: "GRN-2026-0018",
    status: "grn_confirmed", createdAt: daysAgo(167), deliveredAt: daysAgo(165), grnConfirmedAt: daysAgo(163),
  },
  {
    id: "dc-002", challanNumber: "DC-2026-0024", poId: "po-002", poNumber: "PO-2026-0008",
    items: [
      { id: "ci-002-1", poLineItemId: "poi-002-1", description: "BOPP Laminated Woven Bag", unit: "pcs", quantity: 2000 },
      { id: "ci-002-2", poLineItemId: "poi-002-2", description: "Kraft Paper Bag", unit: "pcs", quantity: 3000 },
    ],
    scheduledDeliveryDate: daysAgo(135), deliveryAddress: "Factory Gate 3, Tejgaon I/A, Dhaka-1208",
    vehicleNumber: "DHAKA-GA-12-5678", driverName: "Md. Rafiqul Islam",
    receivedBy: "Store Keeper", grnNumber: "GRN-2026-0029",
    status: "grn_confirmed", createdAt: daysAgo(137), deliveredAt: daysAgo(135), grnConfirmedAt: daysAgo(134),
  },
  {
    id: "dc-003", challanNumber: "DC-2026-0035", poId: "po-003", poNumber: "PO-2026-0015",
    items: [
      { id: "ci-003-1", poLineItemId: "poi-003-1", description: "Bubble Wrap Roll", unit: "roll", quantity: 100 },
      { id: "ci-003-2", poLineItemId: "poi-003-2", description: "Foam Corner Protector Set", unit: "set", quantity: 500 },
    ],
    scheduledDeliveryDate: daysAgo(100), deliveryAddress: "Head Office Store Room, Motijheel C/A, Dhaka-1000",
    vehicleNumber: "DHAKA-GA-13-9012", driverName: "Md. Karim Hossain",
    receivedBy: "Admin Officer", grnNumber: "GRN-2026-0041",
    status: "grn_confirmed", createdAt: daysAgo(102), deliveredAt: daysAgo(100), grnConfirmedAt: daysAgo(99),
  },
  {
    id: "dc-004", challanNumber: "DC-2026-0041", poId: "po-004", poNumber: "PO-2026-0019",
    items: [
      { id: "ci-004-1", poLineItemId: "poi-004-1", description: "Thermal Transfer Label", unit: "ream", quantity: 300 },
    ],
    scheduledDeliveryDate: daysAgo(85), deliveryAddress: "BGMEA Complex, Kawran Bazar, Dhaka-1215",
    vehicleNumber: "DHAKA-GA-14-3456", driverName: "Md. Salam Mia",
    receivedBy: "IT Store Manager", grnNumber: "GRN-2026-0052",
    status: "grn_confirmed", createdAt: daysAgo(87), deliveredAt: daysAgo(85), grnConfirmedAt: daysAgo(84),
  },
  {
    id: "dc-005", challanNumber: "DC-2026-0052", poId: "po-005", poNumber: "PO-2026-0025",
    items: [
      { id: "ci-005-1", poLineItemId: "poi-005-1", description: "Corrugated Carton Box", unit: "pcs", quantity: 8000 },
    ],
    scheduledDeliveryDate: daysAgo(45), deliveryAddress: "Distribution Hub, Savar EPZ, Savar-1340",
    vehicleNumber: "DHAKA-GA-15-7890", driverName: "Md. Alam Hossain",
    receivedBy: "Warehouse Supervisor", grnNumber: "GRN-2026-0067",
    status: "grn_confirmed", createdAt: daysAgo(47), deliveredAt: daysAgo(45), grnConfirmedAt: daysAgo(44),
  },
  {
    id: "dc-006", challanNumber: "DC-2026-0061", poId: "po-006", poNumber: "PO-2026-0031",
    items: [
      { id: "ci-006-1", poLineItemId: "poi-006-1", description: "Moisture-Proof Poly Bag", unit: "box", quantity: 300 },
      { id: "ci-006-2", poLineItemId: "poi-006-2", description: "PVC Shrink Wrap Film", unit: "kg", quantity: 500 },
    ],
    scheduledDeliveryDate: daysAgo(30), deliveryAddress: "Warehouse Block B, Narayanganj-1400",
    vehicleNumber: "DHAKA-GA-16-2345", driverName: "Md. Ripon Ahmed",
    receivedBy: "Store Officer", grnNumber: "GRN-2026-0078",
    status: "delivered", createdAt: daysAgo(32), deliveredAt: daysAgo(30),
  },
  {
    id: "dc-007", challanNumber: "DC-2026-0068", poId: "po-007", poNumber: "PO-2026-0037",
    items: [
      { id: "ci-007-1", poLineItemId: "poi-007-1", description: "Kraft Paper Bag", unit: "pcs", quantity: 5000 },
    ],
    scheduledDeliveryDate: daysFromNow(5), deliveryAddress: "Factory Gate 3, Tejgaon I/A, Dhaka-1208",
    vehicleNumber: "DHAKA-GA-17-6789", driverName: "Md. Sumon Khan",
    status: "in_transit", createdAt: daysAgo(5),
  },
  {
    id: "dc-008", challanNumber: "DC-2026-0071", poId: "po-003", poNumber: "PO-2026-0015",
    items: [
      { id: "ci-008-1", poLineItemId: "poi-003-1", description: "Bubble Wrap Roll", unit: "roll", quantity: 100 },
      { id: "ci-008-2", poLineItemId: "poi-003-2", description: "Foam Corner Protector Set", unit: "set", quantity: 500 },
    ],
    scheduledDeliveryDate: daysFromNow(10), deliveryAddress: "Head Office Store Room, Motijheel C/A, Dhaka-1000",
    status: "scheduled", createdAt: daysAgo(2),
  },
];

// --- Compliance Documents ---
export const documents: ComplianceDocument[] = [
  {
    id: "doc-001", type: "trade_license", displayName: "Trade License",
    documentNumber: "DNCC-2018-TL-08841", issuingAuthority: "Dhaka North City Corporation",
    issuedDate: daysAgo(365 * 2), expiryDate: daysFromNow(365),
    status: "valid", uploadedAt: daysAgo(365), verifiedAt: daysAgo(360), fileSize: "1.8 MB",
  },
  {
    id: "doc-002", type: "tin_certificate", displayName: "TIN Certificate",
    documentNumber: "123456789012", issuingAuthority: "National Board of Revenue (NBR)",
    issuedDate: daysAgo(365 * 5), expiryDate: daysFromNow(365 * 10),
    status: "valid", uploadedAt: daysAgo(365), verifiedAt: daysAgo(360), fileSize: "0.9 MB",
  },
  {
    id: "doc-003", type: "vat_registration", displayName: "VAT Registration (BIN)",
    documentNumber: "000123456-0101", issuingAuthority: "National Board of Revenue (NBR)",
    issuedDate: daysAgo(365 * 3), expiryDate: daysFromNow(45),
    status: "expiring_soon", uploadedAt: daysAgo(300), verifiedAt: daysAgo(295), fileSize: "1.2 MB",
  },
  {
    id: "doc-004", type: "bank_solvency", displayName: "Bank Solvency Certificate",
    documentNumber: "DBBL-SOL-2025-4421", issuingAuthority: "Dutch-Bangla Bank Ltd.",
    issuedDate: daysAgo(400), expiryDate: daysAgo(35),
    status: "expired", uploadedAt: daysAgo(400), verifiedAt: daysAgo(395), fileSize: "2.1 MB",
  },
  {
    id: "doc-005", type: "iso_certification", displayName: "ISO 9001:2015 Certificate",
    documentNumber: "ISO-9001-BD-2024-0881", issuingAuthority: "Bureau Veritas",
    issuedDate: daysAgo(365 * 2), expiryDate: daysFromNow(180),
    status: "valid", uploadedAt: daysAgo(365 * 2), verifiedAt: daysAgo(365 * 2 - 5), fileSize: "3.4 MB",
  },
  {
    id: "doc-006", type: "bank_solvency", displayName: "Updated Bank Solvency Certificate",
    documentNumber: "", issuingAuthority: "",
    issuedDate: "", expiryDate: "",
    status: "pending_verification", uploadedAt: daysAgo(3), fileSize: "1.9 MB",
  },
];

// --- Notifications ---
export const notifications: SupplierNotification[] = [
  {
    id: "notif-011", type: "tender_published", title: "New Tender Published",
    body: "TND-2026-0015 (Thermal Label & Barcode Consumables Supply) has been published. Submission deadline is in 20 days.",
    timestamp: daysAgo(3), read: false, link: "/app/tenders/tnd-007",
  },
  {
    id: "notif-012", type: "bid_clarification_requested", title: "Bid Clarification Requested",
    body: "The buyer has requested clarification on your bid BID-2026-0018 for TND-2026-0004. Please respond before evaluation resumes.",
    timestamp: daysAgo(4), read: false, link: "/app/bids/bid-002",
  },
  {
    id: "notif-001", type: "po_issued", title: "New Purchase Order Received",
    body: "PO-2026-0045 has been issued by Procurement & Supply Chain. Please acknowledge within 3 business days.",
    timestamp: daysAgo(1), read: false, link: "/app/purchase-orders/po-012",
  },
  {
    id: "notif-002", type: "invoice_approved", title: "Invoice Approved",
    body: "INV-2026-0118 has been approved by Fatema Begum. Payment will be processed within 7 business days.",
    timestamp: daysAgo(30), read: false, link: "/app/invoices/inv-006",
  },
  {
    id: "notif-003", type: "document_expiring", title: "Document Expiring Soon",
    body: "Your VAT Registration (BIN) certificate expires in 45 days. Please upload a renewed copy.",
    timestamp: daysAgo(2), read: false, link: "/app/documents",
  },
  {
    id: "notif-004", type: "payment_received", title: "Payment Received",
    body: "৳ 2,95,200 has been credited to your account for INV-2026-0107 (BEFTN-2026-05-102234).",
    timestamp: daysAgo(20), read: true, link: "/app/payments",
  },
  {
    id: "notif-005", type: "payment_received", title: "Payment Received",
    body: "৳ 86,100 has been credited to your account for INV-2026-0094 (BEFTN-2026-04-097841).",
    timestamp: daysAgo(50), read: true, link: "/app/payments",
  },
  {
    id: "notif-006", type: "payment_received", title: "Payment Received",
    body: "৳ 1,02,500 has been credited to your account for INV-2026-0081 (BEFTN-2026-03-094112).",
    timestamp: daysAgo(75), read: true, link: "/app/payments",
  },
  {
    id: "notif-007", type: "invoice_rejected", title: "Invoice Rejected",
    body: "INV-2026-0089 has been rejected. Reason: Invoice amount does not match the PO. Mushak-6.3 VAT invoice copy not attached.",
    timestamp: daysAgo(82), read: true, link: "/app/invoices/inv-011",
  },
  {
    id: "notif-008", type: "grn_confirmed", title: "GRN Confirmed",
    body: "Goods Receipt Note GRN-2026-0078 confirmed for DC-2026-0061 (PO-2026-0031). You may now submit your invoice.",
    timestamp: daysAgo(30), read: true, link: "/app/deliveries",
  },
  {
    id: "notif-009", type: "po_acknowledged", title: "PO Acknowledgment Confirmed",
    body: "Your acknowledgment of PO-2026-0037 has been recorded. Delivery expected by 05 Jul 2026.",
    timestamp: daysAgo(28), read: true, link: "/app/purchase-orders/po-007",
  },
  {
    id: "notif-010", type: "payment_received", title: "Payment Received",
    body: "৳ 4,05,900 has been credited to your account for INV-2026-0068 (BEFTN-2026-02-091233).",
    timestamp: daysAgo(105), read: true, link: "/app/payments",
  },
];

// --- Profile ---
export const supplierProfile: SupplierProfile = {
  id: "SP-2024-001",
  companyName: "Dhaka Packaging Industries Ltd.",
  companyNameBn: "ঢাকা প্যাকেজিং ইন্ডাস্ট্রিজ লি.",
  tinNumber: "123456789012",
  binNumber: "000123456-0101",
  tradeLicenseNo: "DNCC-2018-TL-08841",
  incorporationType: "Private Limited Company",
  registeredAddress: "Plot 22, Tejgaon Industrial Area, Dhaka-1208",
  phone: "+880 2-8878833",
  email: "procurement@dhakapackaging.com.bd",
  website: "www.dhakapackaging.com.bd",
  bankName: "Dutch-Bangla Bank Ltd.",
  bankBranch: "Tejgaon Branch, Dhaka",
  accountNumber: "1091234567890",
  routingNumber: "090261482",
  accountHolderName: "Dhaka Packaging Industries Ltd.",
  primaryContactName: "Ahsan Kabir",
  primaryContactPhone: "+880 1711-234567",
  primaryContactEmail: "ahsan.kabir@dhakapackaging.com.bd",
};

// --- KPI Summary ---
export function buildKpiSummary(): SupplierKpiSummary {
  const activePOs = purchaseOrders.filter(
    (p) => !["cancelled", "draft", "fulfilled"].includes(p.status)
  ).length;

  const pendingInvoices = invoices.filter(
    (i) => ["submitted", "under_review"].includes(i.status)
  ).length;

  const totalReceivedYTD = payments.reduce((s, p) => s + p.netAmountPaid, 0);
  const totalReceivedMTD = payments.filter((p) => {
    const d = new Date(p.paymentDate);
    return d.getFullYear() === 2026 && d.getMonth() === 5; // June
  }).reduce((s, p) => s + p.netAmountPaid, 0);
  const totalReceivedLastMonth = payments.filter((p) => {
    const d = new Date(p.paymentDate);
    return d.getFullYear() === 2026 && d.getMonth() === 4; // May
  }).reduce((s, p) => s + p.netAmountPaid, 0);

  const overdueInvoices = invoices.filter((i) => {
    if (i.status !== "approved") return false;
    const due = new Date(i.dueDate);
    return due < NOW;
  }).length;

  const monthlyPaymentTrend = [
    { month: "Jan", paid: 240260, lastYear: 185000 },
    { month: "Feb", paid: 405900, lastYear: 310000 },
    { month: "Mar", paid: 102500, lastYear: 280000 },
    { month: "Apr", paid: 86100, lastYear: 195000 },
    { month: "May", paid: 295200, lastYear: 350000 },
    { month: "Jun", paid: 0, lastYear: 220000 },
  ];

  const invoiceStatusBreakdown = [
    { status: "paid" as const, label: "Paid", count: invoices.filter(i => i.status === "paid").length, color: "var(--ok)" },
    { status: "approved" as const, label: "Approved", count: invoices.filter(i => i.status === "approved").length, color: "var(--chart-4)" },
    { status: "under_review" as const, label: "Under Review", count: invoices.filter(i => i.status === "under_review").length, color: "var(--warn)" },
    { status: "submitted" as const, label: "Submitted", count: invoices.filter(i => i.status === "submitted").length, color: "var(--info)" },
    { status: "rejected" as const, label: "Rejected", count: invoices.filter(i => i.status === "rejected").length, color: "var(--danger)" },
  ].filter(d => d.count > 0);

  const deliveryPerformance = [
    { month: "Jan", onTime: 3, late: 0 },
    { month: "Feb", onTime: 2, late: 1 },
    { month: "Mar", onTime: 4, late: 0 },
    { month: "Apr", onTime: 2, late: 1 },
    { month: "May", onTime: 3, late: 0 },
    { month: "Jun", onTime: 1, late: 1 },
  ];

  const recentActivity = [
    { id: "ra-0", type: "tender_published", description: "TND-2026-0015 published — submission deadline in 20 days", timestamp: daysAgo(3), link: "/app/tenders/tnd-007" },
    { id: "ra-1", type: "po_issued", description: "PO-2026-0045 issued by Procurement & Supply Chain", timestamp: daysAgo(1), link: "/app/purchase-orders/po-012" },
    { id: "ra-2", type: "invoice_approved", description: "INV-2026-0118 approved — payment scheduled", timestamp: daysAgo(30), link: "/app/invoices/inv-006" },
    { id: "ra-3", type: "payment_received", description: "Payment ৳ 2,95,200 credited for INV-2026-0107", timestamp: daysAgo(20), link: "/app/payments" },
    { id: "ra-4", type: "document_expiring", description: "BIN certificate expiring in 45 days", timestamp: daysAgo(2), link: "/app/documents" },
    { id: "ra-5", type: "grn_confirmed", description: "DC-2026-0061 GRN confirmed by Procurement", timestamp: daysAgo(30), link: "/app/deliveries" },
  ];

  return { activePOs, pendingInvoices, totalReceivedYTD, totalReceivedMTD, totalReceivedLastMonth, overdueInvoices, monthlyPaymentTrend, invoiceStatusBreakdown, deliveryPerformance, recentActivity };
}
