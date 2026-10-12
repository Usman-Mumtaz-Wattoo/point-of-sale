"use client";

import React, { useState, useEffect, useTransition } from "react";
import { Prisma } from "@prisma/client";
import {
  type SerializedPurchaseDetailDTO,
  type CreatePurchaseReturnInputDTO,
  type CreatePurchaseReturnActionResult,
} from "./types";
import { createPurchaseReturnAction } from "./actions";
import { formatMoney } from "@/lib/currency";

interface PurchaseReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string, returnNumber?: string) => void;
  purchase: SerializedPurchaseDetailDTO | null;
  organizationId: string;
  currency?: string;
}

interface ItemReturnState {
  purchaseItemId: string;
  productName: string;
  sku: string;
  variantName: string | null;
  unit: string;
  quantityOrdered: string;
  quantityReceived: string;
  quantityReturned: string;
  remainingReturnable: string;
  unitCost: string;
  quantityInput: string;
  reason: string;
  error?: string;
}

interface PurchaseReturnModalContentProps {
  purchase: SerializedPurchaseDetailDTO;
  currency?: string;
  onClose: () => void;
  onSuccess: (message: string, returnNumber?: string) => void;
}

export function PurchaseReturnModal(props: PurchaseReturnModalProps) {
  if (!props.isOpen || !props.purchase) return null;

  return (
    <PurchaseReturnModalContent
      key={`${props.purchase.id}-${props.purchase.updatedAt}`}
      purchase={props.purchase}
      currency={props.currency}
      onClose={props.onClose}
      onSuccess={props.onSuccess}
    />
  );
}

const COMMON_RETURN_REASONS = [
  "Damaged in transit",
  "Defective or expired goods",
  "Incorrect item received",
  "Over-shipped quantity",
  "Quality / specification mismatch",
  "Other",
];

function PurchaseReturnModalContent({
  purchase,
  currency = "PKR",
  onClose,
  onSuccess,
}: PurchaseReturnModalContentProps) {
  const [isPending, startTransition] = useTransition();
  const [returnDate, setReturnDate] = useState<string>(
    () => new Date().toISOString().split("T")[0]
  );
  const [selectedReasonOption, setSelectedReasonOption] = useState<string>(COMMON_RETURN_REASONS[0]);
  const [customReason, setCustomReason] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  // Initialize line items state once on mount from purchase prop
  const [items, setItems] = useState<ItemReturnState[]>(() => {
    return purchase.items.map((pi) => {
      const recDec = new Prisma.Decimal(pi.quantityReceived);
      const retDec = new Prisma.Decimal(pi.quantityReturned);
      const returnableDec = recDec.greaterThan(retDec) ? recDec.minus(retDec) : new Prisma.Decimal(0);
      const isReturnable = returnableDec.greaterThan(0);

      return {
        purchaseItemId: pi.id,
        productName: pi.product.name,
        sku: pi.variant?.sku || pi.product.sku,
        variantName: pi.variant?.name || null,
        unit: pi.product.unit,
        quantityOrdered: pi.quantityOrdered,
        quantityReceived: pi.quantityReceived,
        quantityReturned: pi.quantityReturned,
        remainingReturnable: returnableDec.toFixed(3),
        unitCost: pi.unitCost,
        quantityInput: isReturnable ? returnableDec.toFixed(3) : "0.000",
        reason: "",
      };
    });
  });

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPending, onClose]);

  // Quick Action: Return All Returnable
  const handleReturnAllReturnable = () => {
    setItems((prev) =>
      prev.map((it) => {
        const remDec = new Prisma.Decimal(it.remainingReturnable);
        return {
          ...it,
          quantityInput: remDec.greaterThan(0) ? it.remainingReturnable : "0.000",
          error: undefined,
        };
      })
    );
    setFormError(null);
  };

  // Quick Action: Clear Quantities
  const handleClearQuantities = () => {
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        quantityInput: "",
        error: undefined,
      }))
    );
    setFormError(null);
  };

  // Handle line item quantity change with validation
  const handleQuantityChange = (purchaseItemId: string, val: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.purchaseItemId !== purchaseItemId) return it;

        let err: string | undefined;
        if (val.trim() !== "") {
          const num = parseFloat(val);
          const rem = parseFloat(it.remainingReturnable);
          if (isNaN(num)) {
            err = "Invalid number";
          } else if (num < 0) {
            err = "Must be ≥ 0";
          } else if (num > rem + 0.0001) {
            err = `Exceeds max (${rem.toFixed(3)})`;
          } else {
            const parts = val.split(".");
            if (parts.length === 2 && parts[1].length > 3) {
              err = "Max 3 decimals";
            }
          }
        }

        return {
          ...it,
          quantityInput: val,
          error: err,
        };
      })
    );
  };

  // Compute live summary totals
  let returningItemsCount = 0;
  let totalReturningQuantity = new Prisma.Decimal(0);
  let totalEstimatedReturnValue = new Prisma.Decimal(0);
  let hasAnyInputError = false;

  for (const it of items) {
    if (it.error) {
      hasAnyInputError = true;
    }
    const val = it.quantityInput.trim();
    if (val !== "") {
      try {
        const dec = new Prisma.Decimal(val);
        if (dec.greaterThan(0)) {
          returningItemsCount++;
          totalReturningQuantity = totalReturningQuantity.add(dec);
          const costDec = new Prisma.Decimal(it.unitCost);
          totalEstimatedReturnValue = totalEstimatedReturnValue.add(dec.mul(costDec));
        }
      } catch {
        hasAnyInputError = true;
      }
    }
  }

  const effectiveReason =
    selectedReasonOption === "Other"
      ? customReason.trim()
      : customReason.trim()
      ? `${selectedReasonOption}: ${customReason.trim()}`
      : selectedReasonOption;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (hasAnyInputError) {
      setFormError("Please fix the validation errors on the return quantities before submitting.");
      return;
    }

    // Build payload of items with quantity > 0
    const itemsToSubmit: { purchaseItemId: string; quantityReturned: string; reason?: string | null }[] = [];
    for (const it of items) {
      const val = it.quantityInput.trim();
      if (!val) continue;

      let dec: Prisma.Decimal;
      try {
        dec = new Prisma.Decimal(val);
      } catch {
        setFormError(`Invalid quantity for ${it.productName}`);
        return;
      }

      if (dec.lessThan(0)) {
        setFormError(`Quantity for ${it.productName} cannot be negative.`);
        return;
      }

      const remDec = new Prisma.Decimal(it.remainingReturnable);
      if (dec.greaterThan(remDec)) {
        setFormError(
          `Return quantity for ${it.productName} (${dec.toString()}) exceeds returnable remaining (${remDec.toString()}).`
        );
        return;
      }

      if (dec.greaterThan(0)) {
        itemsToSubmit.push({
          purchaseItemId: it.purchaseItemId,
          quantityReturned: dec.toString(),
          reason: it.reason.trim() || null,
        });
      }
    }

    if (itemsToSubmit.length === 0) {
      setFormError("Please specify a return quantity greater than 0 for at least one item.");
      return;
    }

    if (effectiveReason.length > 255) {
      setFormError("Return reason cannot exceed 255 characters.");
      return;
    }

    if (notes.trim().length > 1000) {
      setFormError("Notes cannot exceed 1000 characters.");
      return;
    }

    const payload: CreatePurchaseReturnInputDTO = {
      purchaseId: purchase.id,
      items: itemsToSubmit,
      returnDate: returnDate || null,
      reason: effectiveReason || null,
      notes: notes.trim() || null,
    };

    startTransition(async () => {
      try {
        const result: CreatePurchaseReturnActionResult = await createPurchaseReturnAction(payload);
        if (!result.success) {
          setFormError(result.error || "Failed to record purchase return.");
          return;
        }

        onSuccess(
          result.message || `Purchase return "${result.returnNumber}" recorded successfully.`,
          result.returnNumber
        );
      } catch (err: unknown) {
        setFormError(
          err instanceof Error ? err.message : "An unexpected error occurred while processing the return."
        );
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="return-modal-title"
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-800 bg-slate-950/60 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                Purchase Return
              </span>
              <span className="text-xs text-slate-400">
                Order: <strong className="text-white font-mono">{purchase.purchaseNumber}</strong>
              </span>
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs text-slate-400">
                Branch: <strong className="text-slate-200">{purchase.branch.name}</strong>
              </span>
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs text-slate-400">
                Supplier: <strong className="text-slate-200">{purchase.supplier.name}</strong>
              </span>
            </div>
            <h3 id="return-modal-title" className="text-lg font-bold text-white tracking-tight">
              Return Goods to Supplier
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Select items and quantities to physically return to the supplier. Returned quantities will be deducted from branch inventory.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors disabled:opacity-50"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {formError && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2.5">
              <span className="text-base leading-none">⚠️</span>
              <div className="flex-1 space-y-1">
                <p className="font-semibold">Unable to process return</p>
                <p className="text-slate-300">{formError}</p>
              </div>
            </div>
          )}

          {/* Return Metadata Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-950/40 border border-slate-800 text-xs">
            <div>
              <label htmlFor="return-date" className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Return Date
              </label>
              <input
                id="return-date"
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                disabled={isPending}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label htmlFor="return-reason-select" className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Return Reason
              </label>
              <select
                id="return-reason-select"
                value={selectedReasonOption}
                onChange={(e) => setSelectedReasonOption(e.target.value)}
                disabled={isPending}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 disabled:opacity-50"
              >
                {COMMON_RETURN_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="return-custom-reason" className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Reason Details / Notes
              </label>
              <input
                id="return-custom-reason"
                type="text"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Specific defect or details..."
                maxLength={255}
                disabled={isPending}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 disabled:opacity-50"
              />
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="return-notes" className="block text-[11px] font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Internal Audit Notes (Optional)
              </label>
              <input
                id="return-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="RMA number, carrier return tracking, or credit agreement notes..."
                maxLength={1000}
                disabled={isPending}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Line Items Table Header & Quick Actions */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  Line Items & Return Quantities
                </h4>
                <p className="text-[11px] text-slate-400">
                  Only items previously received can be returned. Maximum returnable quantity is net received minus already returned.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReturnAllReturnable}
                  disabled={isPending}
                  className="px-2.5 py-1 rounded text-xs font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-colors disabled:opacity-50"
                >
                  Return All Returnable
                </button>
                <button
                  type="button"
                  onClick={handleClearQuantities}
                  disabled={isPending}
                  className="px-2.5 py-1 rounded text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-[11px] font-semibold text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Product / SKU</th>
                    <th className="py-2.5 px-2 text-right">Ordered</th>
                    <th className="py-2.5 px-2 text-right">Received</th>
                    <th className="py-2.5 px-2 text-right">Returned</th>
                    <th className="py-2.5 px-2 text-right">Returnable</th>
                    <th className="py-2.5 px-2 text-right">Unit Cost ({currency})</th>
                    <th className="py-2.5 px-3 w-32 sm:w-36 text-right">Qty to Return</th>
                    <th className="py-2.5 px-3 text-right">Estimated Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {items.map((it) => {
                    const remNum = parseFloat(it.remainingReturnable);
                    const isZeroReturnable = remNum <= 0;
                    const inputNum = parseFloat(it.quantityInput) || 0;
                    const unitCostNum = parseFloat(it.unitCost) || 0;
                    const estimatedLineVal = inputNum * unitCostNum;

                    return (
                      <tr
                        key={it.purchaseItemId}
                        className={`hover:bg-slate-800/30 transition-colors ${
                          isZeroReturnable ? "opacity-50 bg-slate-950/20" : ""
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-white">{it.productName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            SKU: {it.sku}
                            {it.variantName && ` • ${it.variantName}`}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-slate-400">
                          {parseFloat(it.quantityOrdered).toFixed(3)}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-emerald-400 font-medium">
                          {parseFloat(it.quantityReceived).toFixed(3)}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-slate-400">
                          {parseFloat(it.quantityReturned).toFixed(3)}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-bold text-white">
                          {it.remainingReturnable}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-slate-400">
                          {formatMoney(unitCostNum, currency)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {isZeroReturnable ? (
                            <span className="text-[11px] text-slate-500 italic">None Returnable</span>
                          ) : (
                            <div className="flex flex-col items-end">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={it.quantityInput}
                                onChange={(e) =>
                                  handleQuantityChange(it.purchaseItemId, e.target.value)
                                }
                                placeholder="0.000"
                                disabled={isPending}
                                className={`w-28 px-2.5 py-1 text-right font-mono text-xs rounded-lg bg-slate-900 border ${
                                  it.error
                                    ? "border-rose-500 text-rose-400 focus:ring-rose-500"
                                    : "border-slate-700 text-white focus:border-rose-500 focus:ring-rose-500"
                                } focus:outline-none focus:ring-1 disabled:opacity-50`}
                              />
                              {it.error && (
                                <span className="text-[10px] text-rose-400 mt-0.5">{it.error}</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-rose-400 font-medium">
                          {formatMoney(estimatedLineVal, currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mandatory Accounting & Inventory Disclosure */}
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2.5">
            <span className="text-base leading-none">ℹ️</span>
            <div className="space-y-1 text-[11px]">
              <p className="font-semibold text-amber-200">Inventory & Accounting Notice</p>
              <p className="text-slate-300 leading-relaxed">
                Recording a purchase return deducts stock from this branch&apos;s inventory. It does not change the original purchase totals or supplier payments, and does not issue a supplier refund or credit.
              </p>
            </div>
          </div>

          {/* Summary Strip & Action Buttons */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between flex-wrap gap-4">
            <div className="grid grid-cols-3 gap-6 text-xs">
              <div>
                <span className="block text-[10px] text-slate-500 uppercase tracking-wider">Item Lines</span>
                <span className="font-mono font-bold text-white text-sm">{returningItemsCount}</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-500 uppercase tracking-wider">Total Return Units</span>
                <span className="font-mono font-bold text-rose-400 text-sm">
                  {totalReturningQuantity.toFixed(3)}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-500 uppercase tracking-wider">Estimated Return Value</span>
                <span className="font-mono font-bold text-slate-200 text-sm">
                  {formatMoney(totalEstimatedReturnValue, currency)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || returningItemsCount === 0 || hasAnyInputError}
                className="px-5 py-2 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-rose-950/40 transition-all flex items-center gap-1.5"
              >
                {isPending ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>Processing Return...</span>
                  </>
                ) : (
                  <>
                    <span>↩️</span>
                    <span>Confirm Purchase Return</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
