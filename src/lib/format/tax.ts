export const VAT_RATE = 0.15;
export const AIT_RATE = 0.03;
export const calcVAT = (subtotal: number) => Math.round(subtotal * VAT_RATE);
export const calcAIT = (subtotal: number) => Math.round(subtotal * AIT_RATE);
export const calcNetPayable = (subtotal: number) =>
  subtotal + calcVAT(subtotal) - calcAIT(subtotal);
