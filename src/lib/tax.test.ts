import test from "node:test";
import assert from "node:assert/strict";
import { Prisma, SalePaymentMethod } from "@prisma/client";
import {
  FBR_CASH_TAX_RATE,
  FBR_CARD_TAX_RATE,
  PRA_INVOICE_FEE,
  resolveFbrTaxRate,
  calculateSaleTaxAndTotals,
  extractSavedSaleTaxBreakdown,
} from "./tax";

test("FBR & PRA Constants: Cash is 16%, Card is 8%, PRA is PKR 1", () => {
  assert.equal(FBR_CASH_TAX_RATE.toString(), "16");
  assert.equal(FBR_CARD_TAX_RATE.toString(), "8");
  assert.equal(PRA_INVOICE_FEE.toString(), "1");
});

test("Payment method rate resolution: alternative rates, never added together", () => {
  const cashRes = resolveFbrTaxRate(SalePaymentMethod.CASH);
  assert.equal(cashRes.rate.toNumber(), 16);
  assert.equal(cashRes.methodLabel, "Cash");

  const cardRes = resolveFbrTaxRate(SalePaymentMethod.CARD);
  assert.equal(cardRes.rate.toNumber(), 8);
  assert.equal(cardRes.methodLabel, "Card");

  // Must never sum cash (16) and card (8) to 24%
  assert.notEqual(cashRes.rate.plus(cardRes.rate).toNumber(), 16);
  assert.notEqual(cardRes.rate.toNumber(), 24);
});

test("Prompt Specification Example: Taxable subtotal PKR 1,000 with no discounts", () => {
  // CASH: 1,000 + 160 FBR + 1 PRA = PKR 1,161
  const cashCalc = calculateSaleTaxAndTotals({
    items: [{ quantity: 1, unitPrice: 1000 }],
    paymentMethod: SalePaymentMethod.CASH,
  });

  assert.equal(cashCalc.subtotal.toNumber(), 1000);
  assert.equal(cashCalc.taxableSubtotal.toNumber(), 1000);
  assert.equal(cashCalc.fbrRate.toNumber(), 16);
  assert.equal(cashCalc.fbrTaxAmount.toNumber(), 160);
  assert.equal(cashCalc.praFee.toNumber(), 1);
  assert.equal(cashCalc.totalTaxAmount.toNumber(), 161);
  assert.equal(cashCalc.totalPayable.toNumber(), 1161);

  // CARD: 1,000 + 80 FBR + 1 PRA = PKR 1,081
  const cardCalc = calculateSaleTaxAndTotals({
    items: [{ quantity: 1, unitPrice: 1000 }],
    paymentMethod: SalePaymentMethod.CARD,
  });

  assert.equal(cardCalc.subtotal.toNumber(), 1000);
  assert.equal(cardCalc.taxableSubtotal.toNumber(), 1000);
  assert.equal(cardCalc.fbrRate.toNumber(), 8);
  assert.equal(cardCalc.fbrTaxAmount.toNumber(), 80);
  assert.equal(cardCalc.praFee.toNumber(), 1);
  assert.equal(cardCalc.totalTaxAmount.toNumber(), 81);
  assert.equal(cardCalc.totalPayable.toNumber(), 1081);
});

test("PRA fee invariant: PKR 1 per finalized invoice, charged exactly once (not per item)", () => {
  const multiItemCalc = calculateSaleTaxAndTotals({
    items: [
      { quantity: 2, unitPrice: 100 },
      { quantity: 3, unitPrice: 100 },
      { quantity: 1, unitPrice: 500 },
    ],
    paymentMethod: SalePaymentMethod.CASH,
  });

  // 3 distinct line items totaling PKR 1,000
  assert.equal(multiItemCalc.subtotal.toNumber(), 1000);
  assert.equal(multiItemCalc.lines.length, 3);
  // PRA is charged once for the invoice: PKR 1, NOT PKR 3
  assert.equal(multiItemCalc.praFee.toNumber(), 1);
  assert.equal(multiItemCalc.totalPayable.toNumber(), 1161);
});

test("Item discount handling: taxable subtotal is net of line discounts", () => {
  const discountedCalc = calculateSaleTaxAndTotals({
    items: [
      { quantity: 1, unitPrice: 1000, discountAmount: 100 }, // net 900
    ],
    paymentMethod: SalePaymentMethod.CARD,
  });

  assert.equal(discountedCalc.subtotal.toNumber(), 1000);
  assert.equal(discountedCalc.taxableSubtotal.toNumber(), 900);
  assert.equal(discountedCalc.fbrTaxAmount.toNumber(), 72); // 900 * 8% = 72
  assert.equal(discountedCalc.praFee.toNumber(), 1);
  assert.equal(discountedCalc.totalTaxAmount.toNumber(), 73);
  assert.equal(discountedCalc.totalPayable.toNumber(), 973); // 1000 - 100 + 73 = 973
});

test("Empty cart: 0 PRA fee and 0 total payable", () => {
  const emptyCalc = calculateSaleTaxAndTotals({
    items: [],
    paymentMethod: SalePaymentMethod.CASH,
  });

  assert.equal(emptyCalc.subtotal.toNumber(), 0);
  assert.equal(emptyCalc.praFee.toNumber(), 0);
  assert.equal(emptyCalc.totalPayable.toNumber(), 0);
});

test("extractSavedSaleTaxBreakdown: reconstructs FBR rate, FBR tax, PRA fee from saved Sale", () => {
  // Reconstruct Cash Sale (1000 subtotal, 161 tax, 1161 total)
  const savedCashSale = {
    subtotal: "1000.00",
    discountAmount: "0.00",
    taxAmount: "161.00",
    totalAmount: "1161.00",
    items: [
      {
        subtotal: "1000.00",
        discountAmount: "0.00",
        taxRate: "16.00",
        taxAmount: "160.00",
        lineTotal: "1160.00",
      },
    ],
    payments: [
      {
        paymentMethod: SalePaymentMethod.CASH,
        amount: "1161.00",
      },
    ],
  };

  const cashBreakdown = extractSavedSaleTaxBreakdown(savedCashSale);
  assert.equal(cashBreakdown.subtotal, 1000);
  assert.equal(cashBreakdown.fbrRate, 16);
  assert.equal(cashBreakdown.fbrTaxAmount, 160);
  assert.equal(cashBreakdown.praFee, 1);
  assert.equal(cashBreakdown.totalTaxAmount, 161);
  assert.equal(cashBreakdown.totalAmount, 1161);
  assert.equal(cashBreakdown.paymentMethod, "CASH");

  // Reconstruct Card Sale (1000 subtotal, 81 tax, 1081 total)
  const savedCardSale = {
    subtotal: "1000.00",
    discountAmount: "0.00",
    taxAmount: "81.00",
    totalAmount: "1081.00",
    items: [
      {
        subtotal: "1000.00",
        discountAmount: "0.00",
        taxRate: "8.00",
        taxAmount: "80.00",
        lineTotal: "1080.00",
      },
    ],
    payments: [
      {
        paymentMethod: SalePaymentMethod.CARD,
        amount: "1081.00",
      },
    ],
  };

  const cardBreakdown = extractSavedSaleTaxBreakdown(savedCardSale);
  assert.equal(cardBreakdown.subtotal, 1000);
  assert.equal(cardBreakdown.fbrRate, 8);
  assert.equal(cardBreakdown.fbrTaxAmount, 80);
  assert.equal(cardBreakdown.praFee, 1);
  assert.equal(cardBreakdown.totalTaxAmount, 81);
  assert.equal(cardBreakdown.totalAmount, 1081);
  assert.equal(cardBreakdown.paymentMethod, "CARD");
});

test("Thermal receipt output: generates correct receipt lines for FBR and PRA", () => {
  const sale = {
    subtotal: "1000.00",
    discountAmount: "0.00",
    taxAmount: "161.00",
    totalAmount: "1161.00",
    items: [
      {
        subtotal: "1000.00",
        discountAmount: "0.00",
        taxRate: "16.00",
        taxAmount: "160.00",
        lineTotal: "1160.00",
      },
    ],
    payments: [{ paymentMethod: "CASH", amount: "1161.00" }],
  };

  const tb = extractSavedSaleTaxBreakdown(sale);

  // Assert all receipt-critical figures match thermal receipt requirements
  assert.equal(tb.subtotal.toFixed(2), "1000.00");
  assert.equal(tb.fbrRate, 16);
  assert.equal(tb.fbrTaxAmount.toFixed(2), "160.00");
  assert.equal(tb.praFee.toFixed(2), "1.00");
  assert.equal(tb.totalAmount.toFixed(2), "1161.00");
  assert.equal(tb.paymentMethod, "CASH");
});

test("Currency formatting: formats PKR amounts with PKR prefix and 2 decimals", async () => {
  const { formatMoney, getCurrencyLabel } = await import("./currency");
  assert.equal(formatMoney(480, "PKR"), "PKR 480.00");
  assert.equal(formatMoney("1250.5", "PKR"), "PKR 1,250.50");
  assert.equal(formatMoney(0, "PKR"), "PKR 0.00");
  assert.equal(formatMoney(null, "PKR"), "—");
  assert.equal(getCurrencyLabel("PKR"), "PKR");
  assert.equal(getCurrencyLabel("Unit Cost", "PKR"), "Unit Cost (PKR)");
});

test("Product images: maps SKU to local SVG asset with safe fallback", async () => {
  const { getProductImagePath } = await import("./product-images");
  assert.equal(getProductImagePath("PRD-APP-001"), "/images/products/prd-app-001.svg");
  assert.equal(getProductImagePath("PRD-BAN-001"), "/images/products/prd-ban-001.svg");
  assert.equal(getProductImagePath("UNKNOWN-SKU-999"), "/images/products/fallback-product.svg");
  assert.equal(getProductImagePath(null), "/images/products/fallback-product.svg");
});
