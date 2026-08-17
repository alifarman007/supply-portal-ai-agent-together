export const VAT_RATE = 0.15;
export const AIT_RATE = 0.03;
export const calcVAT = (subtotal: number) => Math.round(subtotal * VAT_RATE);
export const calcAIT = (subtotal: number) => Math.round(subtotal * AIT_RATE);
export const calcNetPayable = (subtotal: number) =>
  subtotal + calcVAT(subtotal) - calcAIT(subtotal);

/**
 * VDS (VAT deducted at source) and TDS are withheld by the buyer when an order
 * is settled — they reduce what lands in the supplier's account rather than
 * adding to the order value.
 *
 * Both are assessed on the taxable value, i.e. the order subtotal, per the NBR
 * schedule for goods supply. Deriving them from the VAT-inclusive grand total
 * instead would tax the VAT, and would make the order list and the order detail
 * page disagree about the same purchase order.
 */
export const VDS_RATE = 0.075;
export const TDS_RATE = 0.03;

export const vdsAmount = (taxableValue: number) => Math.round(taxableValue * VDS_RATE);
export const tdsAmount = (taxableValue: number) => Math.round(taxableValue * TDS_RATE);
