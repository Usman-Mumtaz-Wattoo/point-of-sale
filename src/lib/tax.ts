import { Prisma, SalePaymentMethod } from "@prisma/client";

/**
 * Authoritative Tax Constants for POS Sales according to Pakistani FBR & PRA regulations
 * and project owner specifications:
 * - CASH payments: FBR Sales Tax is 16.00%.
 * - CARD payments: FBR Sales Tax is 8.00% (digital incentive, alternative NOT additive).
 * - PRA Fee: PKR 1.00 per finalized invoice, charged exactly once per invoice.
 */
export const FBR_CASH_TAX_RATE = new Prisma.Decimal("16.00");
export const FBR_CARD_TAX_RATE = new Prisma.Decimal("8.00");
export const PRA_INVOICE_FEE = new Prisma.Decimal("1.00");

export interface FbrRateResolution {
  rate: Prisma.Decimal;
  methodLabel: string;
  isAmbiguous?: boolean;
  ambiguityNote?: string;
}

/**
 * Resolves the applicable FBR sales tax rate based on the transaction payment method.
 *
 * Rules:
 * - CASH: 16.00% standard rate.
 * - CARD: 8.00% reduced digital rate (alternative, not additive).
 * - DIGITAL_WALLET: Resolved as 8.00% (digital payment incentive), but explicitly flagged
 *   as an ambiguous method under the project owner's base rules (Cash 16% / Card 8%).
 * - BANK_TRANSFER / OTHER: Treated as 16.00% standard rate with explicit ambiguity flag.
 */
export function resolveFbrTaxRate(
  paymentMethod: SalePaymentMethod | string | undefined | null
): FbrRateResolution {
  const method = paymentMethod || SalePaymentMethod.CASH;

  switch (method) {
    case SalePaymentMethod.CASH:
      return {
        rate: FBR_CASH_TAX_RATE,
        methodLabel: "Cash",
      };

    case SalePaymentMethod.CARD:
      return {
        rate: FBR_CARD_TAX_RATE,
        methodLabel: "Card",
      };

    case SalePaymentMethod.DIGITAL_WALLET:
      return {
        rate: FBR_CARD_TAX_RATE,
        methodLabel: "Digital Wallet",
        isAmbiguous: true,
        ambiguityNote:
          "Digital Wallet classified under digital payment incentive (8.00% FBR rate). Note: Project rules explicitly define Cash (16%) and Card (8%); confirm if wallet receives card or standard rate.",
      };

    case SalePaymentMethod.BANK_TRANSFER:
      return {
        rate: FBR_CASH_TAX_RATE,
        methodLabel: "Bank Transfer",
        isAmbiguous: true,
        ambiguityNote:
          "Bank Transfer classified under standard FBR rate (16.00%). Unresolved payment method.",
      };

    case SalePaymentMethod.OTHER:
    default:
      return {
        rate: FBR_CASH_TAX_RATE,
        methodLabel: "Other",
        isAmbiguous: true,
        ambiguityNote:
          "Other payment method classified under standard FBR rate (16.00%). Unresolved payment method.",
      };
  }
}

export interface TaxCalculationLineInput {
  quantity: Prisma.Decimal.Value;
  unitPrice: Prisma.Decimal.Value;
  discountAmount?: Prisma.Decimal.Value | null;
}

export interface PreparedTaxLine {
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  taxableAmount: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}

export interface AuthoritativeTaxBreakdown {
  subtotal: Prisma.Decimal;
  itemDiscounts: Prisma.Decimal;
  orderDiscount: Prisma.Decimal;
  totalDiscount: Prisma.Decimal;
  taxableSubtotal: Prisma.Decimal;
  fbrRate: Prisma.Decimal;
  fbrTaxAmount: Prisma.Decimal;
  praFee: Prisma.Decimal;
  totalTaxAmount: Prisma.Decimal;
  totalPayable: Prisma.Decimal;
  lines: PreparedTaxLine[];
  paymentMethod: SalePaymentMethod;
  isAmbiguous?: boolean;
  ambiguityNote?: string;
}

/**
 * Calculates authoritative FBR sales tax and PRA invoice fee for a sale.
 *
 * Guaranteed invariants:
 * 1. FBR tax rates are alternatives: Cash is 16%, Card is 8%. Never added together.
 * 2. For each line: taxableAmount = subtotal - lineDiscount.
 * 3. Line FBR tax = round(taxableAmount * fbrRate / 100, 2).
 * 4. Line total = taxableAmount + lineTax.
 * 5. PRA Fee is charged exactly once per finalized invoice (PKR 1.00), never per item.
 * 6. Total Tax = fbrTaxAmount + praFee.
 * 7. Total Payable = subtotal - totalDiscount + totalTaxAmount.
 */
export function calculateSaleTaxAndTotals(input: {
  items: TaxCalculationLineInput[];
  saleDiscountAmount?: Prisma.Decimal.Value | null;
  paymentMethod?: SalePaymentMethod | string | null;
}): AuthoritativeTaxBreakdown {
  const method = (input.paymentMethod as SalePaymentMethod) || SalePaymentMethod.CASH;
  const { rate: fbrRate, isAmbiguous, ambiguityNote } = resolveFbrTaxRate(method);

  let sumSubtotal = new Prisma.Decimal("0.00");
  let sumItemDiscounts = new Prisma.Decimal("0.00");
  let sumTaxableSubtotal = new Prisma.Decimal("0.00");
  let sumFbrTax = new Prisma.Decimal("0.00");

  const lines: PreparedTaxLine[] = [];

  for (const item of input.items) {
    const qty = new Prisma.Decimal(item.quantity || 0);
    const price = new Prisma.Decimal(item.unitPrice || 0);
    const lineDiscount = new Prisma.Decimal(item.discountAmount || 0);

    const lineSubtotal = qty.times(price).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const taxableAmount = lineSubtotal.minus(lineDiscount).greaterThan(0)
      ? lineSubtotal.minus(lineDiscount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      : new Prisma.Decimal("0.00");

    const lineTax = taxableAmount
      .times(fbrRate)
      .dividedBy(100)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    const lineTotal = taxableAmount.plus(lineTax).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    sumSubtotal = sumSubtotal.add(lineSubtotal);
    sumItemDiscounts = sumItemDiscounts.add(lineDiscount);
    sumTaxableSubtotal = sumTaxableSubtotal.add(taxableAmount);
    sumFbrTax = sumFbrTax.add(lineTax);

    lines.push({
      quantity: qty,
      unitPrice: price,
      discountAmount: lineDiscount,
      subtotal: lineSubtotal,
      taxableAmount,
      taxRate: fbrRate,
      taxAmount: lineTax,
      lineTotal,
    });
  }

  const orderDiscount = input.saleDiscountAmount
    ? new Prisma.Decimal(input.saleDiscountAmount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
    : new Prisma.Decimal("0.00");

  const totalDiscount = sumItemDiscounts.add(orderDiscount);

  // PRA fee: PKR 1.00 per finalized invoice (empty cart has no invoice fee)
  const praFee = input.items.length > 0 ? PRA_INVOICE_FEE : new Prisma.Decimal("0.00");

  // Total tax = FBR tax + PRA fee
  const totalTaxAmount = sumFbrTax.add(praFee);

  // Total payable = subtotal - totalDiscount + totalTaxAmount
  const totalPayable = sumSubtotal
    .minus(totalDiscount)
    .plus(totalTaxAmount)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  return {
    subtotal: sumSubtotal,
    itemDiscounts: sumItemDiscounts,
    orderDiscount,
    totalDiscount,
    taxableSubtotal: sumTaxableSubtotal,
    fbrRate,
    fbrTaxAmount: sumFbrTax,
    praFee,
    totalTaxAmount,
    totalPayable: totalPayable.greaterThan(0) ? totalPayable : new Prisma.Decimal("0.00"),
    lines,
    paymentMethod: method,
    isAmbiguous,
    ambiguityNote,
  };
}

/**
 * Extracts or reconstructs the authoritative tax and PRA breakdown from a saved Sale record.
 * Handles both new FBR/PRA sales and historical sales gracefully.
 */
export function extractSavedSaleTaxBreakdown(sale: {
  subtotal: Prisma.Decimal.Value;
  discountAmount?: Prisma.Decimal.Value | null;
  taxAmount?: Prisma.Decimal.Value | null;
  totalAmount: Prisma.Decimal.Value;
  items?: Array<{
    subtotal?: Prisma.Decimal.Value | null;
    discountAmount?: Prisma.Decimal.Value | null;
    taxRate?: Prisma.Decimal.Value | null;
    taxAmount?: Prisma.Decimal.Value | null;
    lineTotal?: Prisma.Decimal.Value | null;
  }>;
  payments?: Array<{
    paymentMethod: SalePaymentMethod | string;
    amount: Prisma.Decimal.Value;
  }>;
}): {
  subtotal: number;
  discountAmount: number;
  taxableSubtotal: number;
  fbrRate: number;
  fbrTaxAmount: number;
  praFee: number;
  totalTaxAmount: number;
  totalAmount: number;
  paymentMethod: string;
} {
  const subtotal = parseFloat(String(sale.subtotal || 0));
  const discountAmount = parseFloat(String(sale.discountAmount || 0));
  const totalTaxAmount = parseFloat(String(sale.taxAmount || 0));
  const totalAmount = parseFloat(String(sale.totalAmount || 0));

  const paymentMethod = sale.payments?.[0]?.paymentMethod || "CASH";

  let sumItemTax = 0;
  let detectedFbrRate = 0;
  let sumTaxable = 0;

  if (sale.items && sale.items.length > 0) {
    for (const item of sale.items) {
      const itemSub = parseFloat(String(item.subtotal || 0));
      const itemDisc = parseFloat(String(item.discountAmount || 0));
      const itemTax = parseFloat(String(item.taxAmount || 0));
      const itemRate = parseFloat(String(item.taxRate || 0));

      sumItemTax += itemTax;
      sumTaxable += Math.max(0, itemSub - itemDisc);
      if (itemRate > 0 && detectedFbrRate === 0) {
        detectedFbrRate = itemRate;
      }
    }
  }

  // If rate wasn't explicitly stored on items, derive from payment method
  if (detectedFbrRate === 0) {
    detectedFbrRate = paymentMethod === "CARD" || paymentMethod === "DIGITAL_WALLET" ? 8 : 16;
  }

  // If items had tax recorded:
  // FBR tax = sum of item tax
  // PRA fee = totalTaxAmount - sumItemTax
  let fbrTaxAmount = sumItemTax;
  let praFee = 0;

  if (totalTaxAmount > 0) {
    if (sumItemTax > 0) {
      praFee = Math.max(0, Math.round((totalTaxAmount - sumItemTax) * 100) / 100);
      fbrTaxAmount = sumItemTax;
    } else {
      // Historical sale where items had 0 tax, or single block:
      // If totalTaxAmount >= 1, check if exactly totalTax - 1 matches standard rate
      if (totalTaxAmount >= 1) {
        praFee = 1.0;
        fbrTaxAmount = Math.round((totalTaxAmount - 1.0) * 100) / 100;
      } else {
        praFee = 0;
        fbrTaxAmount = totalTaxAmount;
      }
    }
  }

  const taxableSubtotal = sumTaxable > 0 ? sumTaxable : Math.max(0, subtotal - discountAmount);

  return {
    subtotal,
    discountAmount,
    taxableSubtotal,
    fbrRate: detectedFbrRate,
    fbrTaxAmount,
    praFee,
    totalTaxAmount,
    totalAmount,
    paymentMethod,
  };
}
