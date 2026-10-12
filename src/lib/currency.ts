import { Prisma } from "@prisma/client";

/**
 * Authoritative currency and money formatting utility for multi-tenant POS SaaS.
 *
 * Guarantees:
 * - Unambiguous display of the organization's configured currency (e.g., "PKR 480.00" for Urban Basket).
 * - Avoids ambiguous "$" signs across financial displays.
 * - Handles number, string, and Prisma.Decimal values safely.
 * - Respects negative values correctly (e.g., "-PKR 50.00").
 * - Formats with 2 decimal places and thousands separators.
 */

export function formatMoney(
  amount: number | string | Prisma.Decimal | null | undefined,
  currency: string = "PKR"
): string {
  if (amount === null || amount === undefined || amount === "") {
    return "—";
  }

  let num: number;
  if (typeof amount === "number") {
    num = amount;
  } else if (typeof amount === "string") {
    num = parseFloat(amount.trim());
  } else if (amount instanceof Prisma.Decimal) {
    num = amount.toNumber();
  } else {
    num = Number(amount);
  }

  if (isNaN(num)) {
    return `${currency} 0.00`;
  }

  const isNegative = num < 0;
  const absNum = Math.abs(num);

  const formattedNumber = absNum.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `${isNegative ? "-" : ""}${currency} ${formattedNumber}`;
}

/**
 * Returns the currency prefix or label to use in table headers or input placeholders.
 * E.g. getCurrencyLabel("Unit Cost", "PKR") -> "Unit Cost (PKR)"
 * E.g. getCurrencyLabel("PKR") -> "PKR"
 */
export function getCurrencyLabel(labelOrCurrency: string, optionalCurrency?: string): string {
  if (optionalCurrency) {
    return `${labelOrCurrency} (${optionalCurrency})`;
  }
  return labelOrCurrency;
}
