"use client";

import React, { useState, useEffect } from "react";
import { PurchasePaymentMethod } from "@prisma/client";
import {
  type SerializedPurchaseDetailDTO,
  type RecordPurchasePaymentActionResult,
} from "./types";
import { recordPurchasePaymentAction } from "./actions";
import { formatMoney, getCurrencyLabel } from "@/lib/currency";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  purchase: SerializedPurchaseDetailDTO;
  organizationId: string;
  currency?: string;
}

export function PaymentModal(props: PaymentModalProps) {
  if (!props.isOpen) return null;

  return (
    <PaymentModalContent
      key={`${props.purchase.id}-${props.purchase.paidAmount}`}
      {...props}
    />
  );
}

function PaymentModalContent({
  onClose,
  onSuccess,
  purchase,
  organizationId,
  currency = "PKR",
}: PaymentModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<PurchasePaymentMethod>(
    PurchasePaymentMethod.BANK_TRANSFER
  );
  const [amount, setAmount] = useState<string>("");
  const [paidAt, setPaidAt] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [reference, setReference] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Derive authoritative balances
  const totalAmountNum = parseFloat(purchase.totalAmount) || 0;
  const paidAmountNum = parseFloat(purchase.paidAmount) || 0;
  const balanceDueNum = Math.max(0, totalAmountNum - paidAmountNum);

  // Handle ESC key for modal dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, isSubmitting]);

  // Handle amount change with Decimal-safe format
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Allow empty or valid decimal pattern (up to 2 decimals)
    if (val === "" || /^\d+(\.\d{0,2})?$/.test(val)) {
      setAmount(val);
      setErrorMessage(null);
    }
  };

  const handlePayFullBalance = () => {
    setAmount(balanceDueNum.toFixed(2));
    setErrorMessage(null);
  };

  // Live calculation for preview
  const enteredAmountNum = parseFloat(amount) || 0;
  const remainingAfterPayment = Math.max(0, balanceDueNum - enteredAmountNum);
  const isOverpaying = enteredAmountNum > balanceDueNum + 0.0001;
  const isAmountValid = enteredAmountNum > 0 && !isOverpaying;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!amount || enteredAmountNum <= 0) {
      setErrorMessage("Please enter a valid payment amount greater than zero.");
      return;
    }

    if (isOverpaying) {
      setErrorMessage(
        `Payment amount ($${enteredAmountNum.toFixed(2)}) cannot exceed the remaining balance ($${balanceDueNum.toFixed(2)}).`
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result: RecordPurchasePaymentActionResult = await recordPurchasePaymentAction(
        {
          purchaseId: purchase.id,
          amount: amount.trim(),
          paymentMethod,
          paidAt: paidAt ? new Date(paidAt).toISOString() : null,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
        },
        { organizationId }
      );

      if (!result.success) {
        setErrorMessage(result.error || "Failed to record payment. Please try again.");
        setIsSubmitting(false);
        return;
      }

      onSuccess(result.message || "Payment recorded successfully.");
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setErrorMessage(msg);
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
    >
      <div
        className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                Supplier Payment
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {purchase.purchaseNumber}
              </span>
            </div>
            <h2 id="payment-modal-title" className="text-lg font-bold text-white tracking-tight">
              Record Payment
            </h2>
            <p className="text-xs text-slate-400">
              {purchase.supplier.name} • {purchase.branch.name} ({purchase.branch.code})
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 transition-colors disabled:opacity-50"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Financial Summary Card */}
        <div className="mx-6 mt-4 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              Total Order
            </span>
            <span className="text-slate-200 font-mono font-bold text-sm">
              {formatMoney(totalAmountNum, currency)}
            </span>
          </div>
          <div>
            <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              Already Paid
            </span>
            <span className="text-emerald-400 font-mono font-bold text-sm">
              {formatMoney(paidAmountNum, currency)}
            </span>
          </div>
          <div className="border-l border-slate-800 pl-2">
            <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              Balance Due
            </span>
            <span className="text-amber-400 font-mono font-bold text-sm">
              {formatMoney(balanceDueNum, currency)}
            </span>
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-6 mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-start gap-2">
            <span className="text-sm leading-none mt-0.5">⚠️</span>
            <div className="flex-1 whitespace-pre-wrap">{errorMessage}</div>
          </div>
        )}

        {/* Payment Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Payment Method Selector */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1.5">
              Payment Method <span className="text-rose-400">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { method: PurchasePaymentMethod.CASH, label: "Cash", icon: "💵" },
                { method: PurchasePaymentMethod.BANK_TRANSFER, label: "Bank Transfer", icon: "🏦" },
                { method: PurchasePaymentMethod.CHECK, label: "Check", icon: "📑" },
                { method: PurchasePaymentMethod.OTHER, label: "Other", icon: "💳" },
              ].map(({ method, label, icon }) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  disabled={isSubmitting}
                  className={`py-2 px-2.5 rounded-lg border text-xs font-semibold flex flex-col items-center justify-center gap-1 transition-all ${
                    paymentMethod === method
                      ? "bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-sm shadow-emerald-950"
                      : "bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                  }`}
                >
                  <span className="text-sm">{icon}</span>
                  <span className="text-[11px] truncate w-full text-center">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Amount & Quick Action */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="payment-amount-input" className="text-slate-300 font-semibold">
                Payment Amount ({getCurrencyLabel(currency)}) <span className="text-rose-400">*</span>
              </label>
              <button
                type="button"
                onClick={handlePayFullBalance}
                disabled={isSubmitting || balanceDueNum <= 0}
                className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/20 transition-colors disabled:opacity-40"
              >
                Pay Full Balance ({formatMoney(balanceDueNum, currency)})
              </button>
            </div>

            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 font-mono text-xs pointer-events-none">
                {getCurrencyLabel(currency)}
              </span>
              <input
                id="payment-amount-input"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={handleAmountChange}
                disabled={isSubmitting}
                placeholder={`0.00 (Max: ${balanceDueNum.toFixed(2)})`}
                className={`w-full pl-12 pr-3 py-2 rounded-lg bg-slate-950 border font-mono text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 transition-colors ${
                  isOverpaying
                    ? "border-rose-500 focus:ring-rose-500"
                    : "border-slate-800 focus:border-emerald-500 focus:ring-emerald-500"
                }`}
                autoFocus
              />
            </div>

            {/* Live Remaining Balance Preview */}
            <div className="flex items-center justify-between text-[11px] mt-1.5 text-slate-400">
              <span>
                Remaining after payment:{" "}
                <span
                  className={`font-mono font-semibold ${
                    isOverpaying
                      ? "text-rose-400"
                      : enteredAmountNum > 0
                      ? "text-emerald-400"
                      : "text-slate-300"
                  }`}
                >
                  {isOverpaying ? "Overpayment" : formatMoney(remainingAfterPayment, currency)}
                </span>
              </span>
              {enteredAmountNum > 0 && !isOverpaying && (
                <span className="text-slate-500">
                  {remainingAfterPayment === 0 ? "Order will be fully paid" : "Order will be partially paid"}
                </span>
              )}
            </div>
          </div>

          {/* Payment Date & Reference (Grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="payment-date-input" className="block text-slate-300 font-semibold mb-1">
                Payment Date
              </label>
              <input
                id="payment-date-input"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label htmlFor="payment-reference-input" className="block text-slate-300 font-semibold mb-1">
                Reference / Cheque #
              </label>
              <input
                id="payment-reference-input"
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. Wire-9821 or Cheque #104"
                maxLength={255}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="payment-notes-input" className="block text-slate-300 font-semibold mb-1">
              Payment Notes (Optional)
            </label>
            <textarea
              id="payment-notes-input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
              placeholder="Add any relevant payment or banking remarks..."
              maxLength={1000}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Modal Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !isAmountValid}
              className="px-5 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-950/40 transition-all flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Processing Payment...</span>
                </>
              ) : (
                <>
                  <span>💳</span>
                  <span>Confirm Payment</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
