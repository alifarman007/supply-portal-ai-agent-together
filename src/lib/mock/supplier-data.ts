export const SUPPLIER_INFO = {
  id: "SP-2024-001",
  name: "Dhaka Packaging Industries Ltd.",
  nameBn: "ঢাকা প্যাকেজিং ইন্ডাস্ট্রিজ লি.",
  tin: "123456789012",
  bin: "000123456-0101",
  tradeLicenseNo: "DNCC-2018-TL-08841",
  address: "Plot 22, Tejgaon Industrial Area, Dhaka-1208",
  phone: "+880 2-8878833",
  email: "procurement@dhakapackaging.com.bd",
};

export const BUYER_COMPANY = "Kazi Farms Group";

export const BUYER_DEPARTMENTS = [
  "Procurement & Supply Chain",
  "Operations",
  "Information Technology",
  "Finance & Accounts",
  "Facilities Management",
  "Human Resources",
];

export const DELIVERY_ADDRESSES = [
  "BGMEA Complex, Kawran Bazar, Dhaka-1215",
  "Factory Gate 3, Tejgaon I/A, Dhaka-1208",
  "Warehouse Block B, Narayanganj-1400",
  "Head Office Store Room, Motijheel C/A, Dhaka-1000",
  "Distribution Hub, Savar EPZ, Savar-1340",
];

/**
 * `desc` is the catalogue key every purchase order line refers to, so `code`
 * and `name`/`spec` here are the single source for the item columns on the
 * order detail page.
 */
export const PRODUCTS = [
  { desc: "Corrugated Carton Box (30×20×15 cm)", code: "PKG-0102", name: "Corrugated Carton Box", spec: "30×20×15 cm, 5-ply", unit: "pcs", price: 45 },
  { desc: "BOPP Laminated Woven Bag (50 kg capacity)", code: "PKG-0118", name: "BOPP Woven Bag", spec: "Laminated, 50 kg capacity", unit: "pcs", price: 120 },
  { desc: "Stretch Wrap Film (500mm × 300m roll)", code: "PKG-0143", name: "Stretch Wrap Film", spec: "500mm × 300m, 23 micron", unit: "roll", price: 680 },
  { desc: "Thermal Transfer Label (100×150 mm)", code: "ITC-0207", name: "Thermal Transfer Label", spec: "100×150 mm, semi-gloss", unit: "ream", price: 350 },
  { desc: "Bubble Wrap Roll (1.2m × 50m)", code: "PKG-0156", name: "Bubble Wrap Roll", spec: "1.2m × 50m, anti-static", unit: "roll", price: 950 },
  { desc: "Moisture-Proof Poly Bag (Large)", code: "PKG-0189", name: "Moisture-Proof Poly Bag", spec: "Large, 0.08mm LDPE", unit: "box", price: 220 },
  { desc: "PVC Shrink Wrap Film (19 micron)", code: "PKG-0194", name: "PVC Shrink Wrap Film", spec: "19 micron, clear", unit: "kg", price: 180 },
  { desc: "Kraft Paper Bag (Multi-wall, 5-ply)", code: "PKG-0231", name: "Kraft Paper Bag", spec: "Multi-wall, 5-ply, brown", unit: "pcs", price: 85 },
  { desc: "Foam Corner Protector Set", code: "PKG-0248", name: "Foam Corner Protector Set", spec: "High-density EPE, 90° corner", unit: "set", price: 60 },
  { desc: "Cello Tape (48mm × 65m, 6-pack)", code: "OFC-0311", name: "Cello Tape", spec: "48mm × 65m, BOPP, 6-pack", unit: "box", price: 420 },
];

export const BANKS = [
  "Dutch-Bangla Bank Ltd.",
  "BRAC Bank Ltd.",
  "Eastern Bank Ltd.",
  "Islami Bank Bangladesh Ltd.",
];

export const BUYER_CONTACTS = [
  { name: "Md. Habibur Rahman", email: "habibur.rahman@kazifarms.com" },
  { name: "Fatema Begum", email: "fatema.begum@kazifarms.com" },
  { name: "Shafiqul Islam", email: "shafiqul.islam@kazifarms.com" },
  { name: "Nusrat Jahan", email: "nusrat.jahan@kazifarms.com" },
  { name: "Kamrul Hasan", email: "kamrul.hasan@kazifarms.com" },
];

export const TERMS = `1. Payment terms: Net 30 days from invoice date.
2. Delivery must be completed by the required delivery date.
3. All goods must meet the quality standards specified in the product catalogue.
4. Invoice must reference this PO number.
5. VAT invoice (mushak-6.3) must be submitted along with the invoice.
6. TIN and BIN of both parties must appear on all invoices.`;

/** Boilerplate attached to every tender the group publishes. */
export const TENDER_TERMS = [
  "Bids must be submitted before the submission deadline; late bids will not be considered.",
  "Bid amount must be inclusive of all applicable taxes and delivery charges.",
  "Bidder must attach VAT registration (BIN) and trade license copies with the submission.",
  "Kazi Farms Group reserves the right to reject any or all bids without assigning reasons.",
  "The awarded supplier must accept the Purchase Order within 3 business days of award.",
];

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(arr: T[], r: number): T {
  return arr[Math.floor(r * arr.length)];
}
