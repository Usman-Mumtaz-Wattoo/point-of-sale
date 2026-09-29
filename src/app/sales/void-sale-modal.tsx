"use client";

import { useState, useTransition, useEffect } from "react";
import { AlertTriangle, ShieldAlert, X, Loader2, Ban } from "lucide-react";
import { voidSaleAction } from "./actions";
import { type SerializedSaleDetail, type SerializedVoidSaleResult } from "./types";

interface VoidSaleModalProps {
  isOpen: boolean;
  sale: SerializedSaleDetail | null;
  organizationId: string;
  onClose: () => void;
  onVoidSuccess: (result: SerializedVoidSaleResult) => void;
}

interface VoidSaleModalContentProps {
  sale: SerializedSaleDetail;
  organizationId: string;
  onClose: () => void;
  onVoidSuccess: (result: SerializedVoidSaleResult) => void;
}

function VoidSaleModalContent({
  sale,
  organizationId,
  onClose,
  onVoidSuccess,
}: VoidSaleModalContentProps) {
  const [reason, setReason] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Handle Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPending) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPending, onClose]);

  const isAlreadyVoided = sale.status === "VOIDED";
  const hasReturns = sale.hasReturns || (sale.returns && sale.returns.length > 0);
  const cannotVoid = isAlreadyVoided || hasReturns || isPending;

  const handleConfirmVoid = () => {
    if (cannotVoid) return;
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const res = await voidSaleAction(
          {
            saleId: sale.id,
            reason: reason.trim() || undefined,
          },
          organizationId
        );

        if (!res.success || !res.data) {
          setErrorMessage(res.error || "Failed to void sale. Please try again.");
          return;
        }

        onVoidSuccess(res.data);
      } catch (err: unknown) {
        setErrorMessage(
          err instanceof Error ? err.message : "An unexpected server error occurred."
        );
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="void-sale-title"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) {
          onClose();
        }
      }}
    >
      <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 id="void-sale-title" className="text-base font-bold text-white">
                Void Sale Transaction
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                Invoice #{sale.invoiceNumber}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            aria-label="Close void dialog"
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Guard 1: Already Voided */}
        {isAlreadyVoided && (
          <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-800/40 text-rose-300 text-xs flex items-start gap-3">
            <Ban className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-200">Transaction Already Voided</p>
              <p className="mt-1 text-slate-400">
                This sale has already been marked as VOIDED. Stock movements were already compensated and no further voiding operations can be applied.
              </p>
            </div>
          </div>
        )}

        {/* Guard 2: Sale Has Returns */}
        {!isAlreadyVoided && hasReturns && (
          <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/40 text-amber-300 text-xs flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-200">Voiding Blocked: Active Return Records</p>
              <p className="mt-1 text-slate-400">
                This transaction has {sale.returns?.length || 1} processed sale return(s). To maintain inventory integrity and prevent double-refund accounting discrepancies, sales with active returns cannot be voided. Please handle remaining adjustments via the Sales Returns module.
              </p>
            </div>
          </div>
        )}

        {/* Warning & Consequences (Eligible) */}
        {!isAlreadyVoided && !hasReturns && (
          <>
            <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-800/40 text-xs space-y-2">
              <div className="flex items-center gap-2 text-rose-300 font-semibold">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Consequential Irreversible Operation</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Voiding this transaction cannot be undone. Please review the operational outcomes before confirming:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-slate-400 text-[11px]">
                <li>
                  Status will be permanently updated to <strong className="text-rose-400">VOIDED</strong>.
                </li>
                <li>
                  All sold line items ({sale.items.length} item types) will be automatically returned to branch inventory via compensating <code className="text-emerald-400 font-mono">ADJUSTMENT_IN</code> movements.
                </li>
                <li>
                  Historical line items and payment records are preserved in the ledger for compliance and audit logs.
                </li>
              </ul>
            </div>

            {/* Error Message if any */}
            {errorMessage && (
              <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/50 text-rose-300 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Void Reason Input */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <label htmlFor="voidReason" className="font-medium text-slate-300">
                  Void Reason <span className="text-slate-500 font-normal">(optional but recommended)</span>
                </label>
                <span className="text-[10px] text-slate-500">
                  {reason.length}/255
                </span>
              </div>
              <textarea
                id="voidReason"
                rows={3}
                maxLength={255}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Customer cancelled before leaving counter, duplicate register swipe, cashier error"
                disabled={isPending}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-colors resize-none disabled:opacity-50"
              />
            </div>
          </>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 transition-colors disabled:opacity-40 cursor-pointer"
          >
            Cancel
          </button>
          {!isAlreadyVoided && !hasReturns && (
            <button
              type="button"
              onClick={handleConfirmVoid}
              disabled={cannotVoid}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none cursor-pointer shadow-sm"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Voiding & Restoring Stock...</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Confirm Void Transaction</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function VoidSaleModal(props: VoidSaleModalProps) {
  if (!props.isOpen || !props.sale) {
    return null;
  }

  return (
    <VoidSaleModalContent
      key={props.sale.id}
      sale={props.sale}
      organizationId={props.organizationId}
      onClose={props.onClose}
      onVoidSuccess={props.onVoidSuccess}
    />
  );
}
