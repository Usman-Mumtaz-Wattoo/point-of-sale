"use strict";
"use client";

import React, { useState, useEffect, useTransition } from "react";
import { Prisma } from "@prisma/client";
import {
  type SerializedPurchaseDetailDTO,
  type ReceivePurchaseOrderInputDTO,
} from "./types";
import { receivePurchaseOrderAction } from "./actions";

interface ReceivingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string, receiptNumber: string) => void;
  purchase: SerializedPurchaseDetailDTO | null;
  organizationId: string;
}

interface ItemReceiveState {
  purchaseItemId: string;
  productName: string;
  sku: string;
  variantName: string | null;
  unit: string;
  quantityOrdered: string;
  quantityReceived: string;
  remainingToReceive: string;
  quantityInput: string;
  error?: string;
}

interface ReceivingModalContentProps {
  purchase: SerializedPurchaseDetailDTO;
  organizationId: string;
  onClose: () => void;
  onSuccess: (message: string, receiptNumber: string) => void;
}

function ReceivingModalContent({
  purchase,
  organizationId,
  onClose,
  onSuccess,
}: ReceivingModalContentProps) {
  const [isPending, startTransition] = useTransition();
  const [receiptDate, setReceiptDate] = useState<string>(
    () => new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  // Initialize line items state once on mount from purchase prop
  const [items, setItems] = useState<ItemReceiveState[]>(() => {
    return purchase.items.map((pi) => {
      const remainingDec = new Prisma.Decimal(pi.remainingToReceive);
      const isReceivable = remainingDec.greaterThan(0);

      return {
        purchaseItemId: pi.id,
        productName: pi.product.name,
        sku: pi.variant?.sku || pi.product.sku,
        variantName: pi.variant?.name || null,
        unit: pi.product.unit,
        quantityOrdered: pi.quantityOrdered,
        quantityReceived: pi.quantityReceived,
        remainingToReceive: pi.remainingToReceive,
        quantityInput: isReceivable ? pi.remainingToReceive : "0.000",
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

  // Quick Action: Receive All Remaining
  const handleReceiveAllRemaining = () => {
    setItems((prev) =>
      prev.map((it) => {
        const remDec = new Prisma.Decimal(it.remainingToReceive);
        return {
          ...it,
          quantityInput: remDec.greaterThan(0) ? it.remainingToReceive : "0.000",
          error: undefined,
        };
      })
    );
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
  };

  // Handle line item quantity change with validation
  const handleQuantityChange = (purchaseItemId: string, val: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.purchaseItemId !== purchaseItemId) return it;

        let err: string | undefined;
        if (val.trim() !== "") {
          const num = parseFloat(val);
          const rem = parseFloat(it.remainingToReceive);
          if (isNaN(num)) {
            err = "Invalid number";
          } else if (num < 0) {
            err = "Must be > 0";
          } else if (num > rem + 0.00001) {
            err = `Max ${rem}`;
          } else {
            // Check decimal places
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

  // Compute live summary
  let activeLinesCount = 0;
  let totalUnitsReceiving = new Prisma.Decimal(0);
  let hasLineErrors = false;

  for (const it of items) {
    if (it.error) {
      hasLineErrors = true;
    }
    const val = it.quantityInput.trim();
    if (val !== "" && val !== "0" && val !== "0.000") {
      try {
        const dec = new Prisma.Decimal(val);
        if (dec.greaterThan(0)) {
          activeLinesCount++;
          totalUnitsReceiving = totalUnitsReceiving.add(dec);
        }
      } catch {
        hasLineErrors = true;
      }
    }
  }

  // Handle Form Submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (hasLineErrors) {
      setFormError("Please correct line item quantity errors before confirming.");
      return;
    }

    const payloadItems = items
      .filter((it) => {
        const val = it.quantityInput.trim();
        return val !== "" && val !== "0" && val !== "0.000";
      })
      .map((it) => ({
        purchaseItemId: it.purchaseItemId,
        quantityReceived: it.quantityInput.trim(),
      }));

    if (payloadItems.length === 0) {
      setFormError("Please enter a quantity greater than zero for at least one item.");
      return;
    }

    // Verify no line exceeds remaining
    for (const it of items) {
      const val = it.quantityInput.trim();
      if (val !== "" && val !== "0" && val !== "0.000") {
        const dec = new Prisma.Decimal(val);
        const rem = new Prisma.Decimal(it.remainingToReceive);
        if (dec.greaterThan(rem)) {
          setFormError(`Item "${it.productName}" cannot exceed remaining quantity (${it.remainingToReceive}).`);
          return;
        }
      }
    }

    const inputDTO: ReceivePurchaseOrderInputDTO = {
      purchaseId: purchase.id,
      items: payloadItems,
      receivedAt: receiptDate || null,
      notes: notes.trim() || null,
    };

    startTransition(async () => {
      try {
        const res = await receivePurchaseOrderAction(inputDTO, { organizationId });
        if (!res.success) {
          setFormError(res.error || "Failed to record goods receipt.");
          return;
        }

        onSuccess(
          res.message || `Goods receipt ${res.receiptNumber || ""} recorded successfully.`,
          res.receiptNumber || ""
        );
      } catch (err: unknown) {
        setFormError(err instanceof Error ? err.message : "An unexpected error occurred.");
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="receiving-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
    >
      <div
        className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl text-slate-100 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-800 bg-slate-950/60 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Goods Receipt
              </span>
              <span className="text-xs font-mono text-slate-400">
                PO #{purchase.purchaseNumber}
              </span>
            </div>
            <h2 id="receiving-modal-title" className="text-lg sm:text-xl font-bold text-white tracking-tight">
              Receive Goods Shipment
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Supplier: <strong className="text-slate-200">{purchase.supplier.name}</strong> •{" "}
              <span className="text-emerald-400 font-medium">
                Receiving into: {purchase.branch.name} ({purchase.branch.code})
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 transition-colors"
            aria-label="Close goods receipt modal"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto flex flex-col">
          <div className="p-4 sm:p-6 space-y-5 flex-1">
            {formError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {formError}
              </div>
            )}

            {/* Receipt Meta Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/80">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Receipt Date <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="date"
                  value={receiptDate}
                  onChange={(e) => setReceiptDate(e.target.value)}
                  disabled={isPending}
                  required
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Receiving Branch (Display Only)
                </label>
                <div className="px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs text-slate-300 flex items-center gap-2">
                  <span className="font-mono text-emerald-400 font-semibold">{purchase.branch.code}</span>
                  <span>— {purchase.branch.name}</span>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Delivery / Receipt Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isPending}
                  placeholder="e.g. Carrier BOL #987654, Delivered to dock bay 2"
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

            {/* Quick Actions & Header */}
            <div className="flex items-center justify-between gap-3 pt-1">
              <div>
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Receivable Line Items
                </h3>
                <p className="text-[11px] text-slate-400">
                  Enter physical count received for each line. Stock updates apply immediately upon confirmation.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReceiveAllRemaining}
                  disabled={isPending}
                  className="px-2.5 py-1 rounded text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors"
                >
                  Receive All Remaining
                </button>
                <button
                  type="button"
                  onClick={handleClearQuantities}
                  disabled={isPending}
                  className="px-2.5 py-1 rounded text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 transition-colors"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/30">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      <th className="py-2.5 px-3">Product / SKU</th>
                      <th className="py-2.5 px-3 text-right">Ordered</th>
                      <th className="py-2.5 px-3 text-right">Prev. Received</th>
                      <th className="py-2.5 px-3 text-right">Remaining</th>
                      <th className="py-2.5 px-3 text-right w-36">Quantity to Receive</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {items.map((it) => {
                      const remainingDec = new Prisma.Decimal(it.remainingToReceive);
                      const isFullyReceived = remainingDec.lessThanOrEqualTo(0);

                      return (
                        <tr
                          key={it.purchaseItemId}
                          className={`transition-colors ${
                            isFullyReceived ? "bg-slate-950/50 opacity-60" : "hover:bg-slate-800/30"
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-slate-200">{it.productName}</div>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                              <span className="font-mono text-slate-500">SKU: {it.sku}</span>
                              {it.variantName && (
                                <span className="px-1.5 py-0.2 rounded bg-slate-800 text-sky-400 border border-slate-700">
                                  {it.variantName}
                                </span>
                              )}
                              <span className="text-slate-500">({it.unit})</span>
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                            {parseFloat(it.quantityOrdered).toFixed(3)}
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                            {parseFloat(it.quantityReceived).toFixed(3)}
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono font-medium">
                            {isFullyReceived ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                Fully Received
                              </span>
                            ) : (
                              <span className="text-amber-400">
                                {parseFloat(it.remainingToReceive).toFixed(3)}
                              </span>
                            )}
                          </td>

                          <td className="py-2.5 px-3 text-right">
                            {isFullyReceived ? (
                              <span className="text-slate-500 font-mono text-xs">—</span>
                            ) : (
                              <div>
                                <input
                                  type="number"
                                  min="0"
                                  max={it.remainingToReceive}
                                  step="0.001"
                                  value={it.quantityInput}
                                  onChange={(e) =>
                                    handleQuantityChange(it.purchaseItemId, e.target.value)
                                  }
                                  disabled={isPending}
                                  className={`w-28 px-2.5 py-1 text-right font-mono text-xs rounded-lg bg-slate-900 border ${
                                    it.error
                                      ? "border-rose-500 text-rose-400 focus:border-rose-400"
                                      : "border-slate-700 text-slate-100 focus:border-emerald-500"
                                  } focus:outline-none transition-colors`}
                                />
                                {it.error && (
                                  <div className="text-[10px] text-rose-400 mt-0.5">
                                    {it.error}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Footer & Summary */}
          <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/70 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase">Lines Receiving</span>
                <span className="font-semibold text-white">{activeLinesCount} of {items.length}</span>
              </div>
              <div className="border-l border-slate-800 pl-4">
                <span className="text-slate-400 block text-[10px] uppercase">Total Units</span>
                <span className="font-mono font-bold text-emerald-400">
                  {totalUnitsReceiving.toFixed(3)}
                </span>
              </div>
              <div className="border-l border-slate-800 pl-4 hidden md:block">
                <span className="text-slate-400 block text-[10px] uppercase">Receiving Branch</span>
                <span className="text-slate-300">{purchase.branch.name}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isPending || activeLinesCount === 0 || hasLineErrors}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-900/30 transition-all flex items-center gap-2"
              >
                {isPending && <span className="animate-spin text-xs">⏳</span>}
                <span>Confirm & Receive Goods</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ReceivingModal(props: ReceivingModalProps) {
  if (!props.isOpen || !props.purchase) return null;

  return (
    <ReceivingModalContent
      key={`${props.purchase.id}-${props.isOpen}`}
      purchase={props.purchase}
      organizationId={props.organizationId}
      onClose={props.onClose}
      onSuccess={props.onSuccess}
    />
  );
}
