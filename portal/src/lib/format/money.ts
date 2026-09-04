const TAKA = "৳";

export function toBengaliDigits(s: string): string {
  const map: Record<string, string> = {
    "0": "০","1": "১","2": "২","3": "৩","4": "৪",
    "5": "৫","6": "৬","7": "৭","8": "৮","9": "৯"
  };
  return s.replace(/[0-9]/g, (d) => map[d] ?? d);
}

interface MoneyOpts { symbol?: boolean; decimals?: number; lang?: "en" | "bn"; }

export function formatBDT(amount: number, opts: MoneyOpts = {}): string {
  const { symbol = true, decimals = 0, lang = "en" } = opts;
  let n = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(amount);
  if (lang === "bn") n = toBengaliDigits(n);
  return symbol ? `${TAKA} ${n}` : n;
}

export function formatBDTCompact(amount: number, lang: "en" | "bn" = "en"): string {
  const abs = Math.abs(amount);
  let body: string;
  if (abs >= 10000000) body = `${(amount / 10000000).toFixed(2)} Cr`;
  else if (abs >= 100000) body = `${(amount / 100000).toFixed(2)} L`;
  else body = new Intl.NumberFormat("en-IN").format(amount);
  if (lang === "bn") body = toBengaliDigits(body).replace("Cr", "কোটি").replace("L", "লাখ");
  return `${TAKA} ${body}`;
}

export function formatNumber(value: number, lang: "en" | "bn" = "en"): string {
  const n = new Intl.NumberFormat("en-IN").format(value);
  return lang === "bn" ? toBengaliDigits(n) : n;
}
