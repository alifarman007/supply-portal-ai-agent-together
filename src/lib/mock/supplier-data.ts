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

export const PRODUCTS = [
  { desc: "Corrugated Carton Box (30×20×15 cm)", unit: "pcs", price: 45 },
  { desc: "BOPP Laminated Woven Bag (50 kg capacity)", unit: "pcs", price: 120 },
  { desc: "Stretch Wrap Film (500mm × 300m roll)", unit: "roll", price: 680 },
  { desc: "Thermal Transfer Label (100×150 mm)", unit: "ream", price: 350 },
  { desc: "Bubble Wrap Roll (1.2m × 50m)", unit: "roll", price: 950 },
  { desc: "Moisture-Proof Poly Bag (Large)", unit: "box", price: 220 },
  { desc: "PVC Shrink Wrap Film (19 micron)", unit: "kg", price: 180 },
  { desc: "Kraft Paper Bag (Multi-wall, 5-ply)", unit: "pcs", price: 85 },
  { desc: "Foam Corner Protector Set", unit: "set", price: 60 },
  { desc: "Cello Tape (48mm × 65m, 6-pack)", unit: "box", price: 420 },
];

export const BANKS = [
  "Dutch-Bangla Bank Ltd.",
  "BRAC Bank Ltd.",
  "Eastern Bank Ltd.",
  "Islami Bank Bangladesh Ltd.",
];

export const BUYER_CONTACTS = [
  { name: "Md. Habibur Rahman", email: "habibur.rahman@sysnova.com.bd" },
  { name: "Fatema Begum", email: "fatema.begum@sysnova.com.bd" },
  { name: "Shafiqul Islam", email: "shafiqul.islam@sysnova.com.bd" },
  { name: "Nusrat Jahan", email: "nusrat.jahan@sysnova.com.bd" },
  { name: "Kamrul Hasan", email: "kamrul.hasan@sysnova.com.bd" },
];

export const TERMS = `1. Payment terms: Net 30 days from invoice date.
2. Delivery must be completed by the required delivery date.
3. All goods must meet the quality standards specified in the product catalogue.
4. Invoice must reference this PO number.
5. VAT invoice (mushak-6.3) must be submitted along with the invoice.
6. TIN and BIN of both parties must appear on all invoices.`;

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
