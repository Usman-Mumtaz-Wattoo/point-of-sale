"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { PurchaseStatus, PurchasePaymentStatus } from "@prisma/client";
import {
  type SerializedPurchaseDetailDTO,
  type PurchaseDetailActionResult,
} from "./types";
import {
  getPurchaseDetailAction,
  markPurchaseOrderedAction,
  cancelPurchaseAction,
} from "./actions";
import { ReceivingModal } from "./receiving-modal";

interface PurchaseDetailDrawerProps {
  isOpen: boolean;
  purchaseId: string | null;
  organizationId: string;
  canMutatePurchases: boolean;
  onClose: () => void;
  onEditPurchase: (purchase: SerializedPurchaseDetailDTO) => void;
  onPurchaseUpdated: (message: string) => void;
}

function PurchaseDetailDrawerContent({
  purchaseId,
  organizationId,
  canMutatePurchases,
  onClose,
  onEditPurchase,
  onPurchaseUpdated,
}: {
  purchaseId: string;
  organizationId: string;
  canMutatePurchases: boolean;
  onClose: () => void;
  onEditPurchase: (purchase: SerializedPurchaseDetailDTO) => void;
  onPurchaseUpdated: (message: string) => void;
}) {
  const [purchase, setPurchase] = useState<SerializedPurchaseDetailDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "receipts" | "payments" | "returns">("overview");

  // Confirmation dialogs
  const [confirmOrderOpen, setConfirmOrderOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [isReceivingModalOpen, setIsReceivingModalOpen] = useState(false);
  const [isActionPending, startActionTransition] = useTransition();
  const [, startLoadTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  // Fetch detail data
  const loadDetail = useCallback(() => {
    startLoadTransition(async () => {
      setIsLoading(true);
      setError(null);
      setActionError(null);
      try {
        const res: PurchaseDetailActionResult = await getPurchaseDetailAction(purchaseId, {
          organizationId,
        });

        if (!res.success || !res.purchase) {
          setError(res.error || "Failed to load purchase details.");
          setPurchase(null);
        } else {
          setPurchase(res.purchase);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "An unexpected server error occurred.");
        setPurchase(null);
      } finally {
        setIsLoading(false);
      }
    });
  }, [purchaseId, organizationId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // Handle ESC key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.key === "Escape" &&
        !confirmOrderOpen &&
        !confirmCancelOpen &&
        !isReceivingModalOpen &&
        !isActionPending
      ) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmOrderOpen, confirmCancelOpen, isReceivingModalOpen, isActionPending, onClose]);

  // Action: Mark as Ordered
  function handleMarkOrdered() {
    if (!purchase) return;
    setActionError(null);

    startActionTransition(async () => {
      try {
        const res = await markPurchaseOrderedAction(purchase.id, { organizationId });
        if (!res.success) {
          setActionError(res.error || "Failed to mark purchase order as ordered.");
          return;
        }

        setConfirmOrderOpen(false);
        onPurchaseUpdated(res.message || "Purchase order marked as ordered.");
        loadDetail();
      } catch (err: unknown) {
        setActionError(err instanceof Error ? err.message : "Failed to mark purchase order as ordered.");
      }
    });
  }

  // Action: Cancel Purchase
  function handleCancelPurchase() {
    if (!purchase) return;
    setActionError(null);

    startActionTransition(async () => {
      try {
        const res = await cancelPurchaseAction(purchase.id, { organizationId });
        if (!res.success) {
          setActionError(res.error || "Failed to cancel purchase order.");
          return;
        }

        setConfirmCancelOpen(false);
        onPurchaseUpdated(res.message || "Purchase order cancelled.");
        loadDetail();
      } catch (err: unknown) {
        setActionError(err instanceof Error ? err.message : "Failed to cancel purchase order.");
      }
    });
  }

  const getStatusBadge = (st: PurchaseStatus) => {
    switch (st) {
      case PurchaseStatus.DRAFT:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            Draft
          </span>
        );
      case PurchaseStatus.ORDERED:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
            Ordered
          </span>
        );
      case PurchaseStatus.PARTIALLY_RECEIVED:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Partially Received
          </span>
        );
      case PurchaseStatus.RECEIVED:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Received
          </span>
        );
      case PurchaseStatus.CANCELLED:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            Cancelled
          </span>
        );
      default:
        return null;
    }
  };

  const getPaymentStatusBadge = (st: PurchasePaymentStatus) => {
    switch (st) {
      case PurchasePaymentStatus.UNPAID:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            Unpaid
          </span>
        );
      case PurchasePaymentStatus.PARTIAL:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Partially Paid
          </span>
        );
      case PurchasePaymentStatus.PAID:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Paid
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
      className="fixed inset-0 z-40 overflow-hidden"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10">
        <div className="pointer-events-auto w-screen max-w-3xl bg-slate-900 border-l border-slate-800 text-slate-100 flex flex-col h-full shadow-2xl">
          {/* Header */}
          <div className="p-4 sm:p-6 border-b border-slate-800 bg-slate-950/60">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Purchase Order
                  </span>
                  {purchase && (
                    <>
                      {getStatusBadge(purchase.status)}
                      {getPaymentStatusBadge(purchase.paymentStatus)}
                    </>
                  )}
                </div>
                <h2 id="drawer-title" className="text-xl font-bold text-white tracking-tight">
                  {purchase ? purchase.purchaseNumber : "Loading Purchase..."}
                </h2>
                {purchase && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {purchase.supplier.name} • {purchase.branch.name} ({purchase.branch.code})
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {purchase && (
                  <button
                    type="button"
                    onClick={() => loadDetail()}
                    disabled={isLoading}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 transition-colors"
                    title="Refresh data"
                    aria-label="Refresh purchase details"
                  >
                    🔄
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 transition-colors"
                  aria-label="Close drawer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Quick Summary Strip */}
            {purchase && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 pt-3 border-t border-slate-800/60 text-xs text-slate-400">
                <div>
                  <span className="block text-[10px] text-slate-500 uppercase tracking-wider">Order Date</span>
                  <span className="text-slate-200 font-medium">
                    {new Date(purchase.orderDate).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500 uppercase tracking-wider">Expected Date</span>
                  <span className="text-slate-200 font-medium">
                    {purchase.expectedDate ? new Date(purchase.expectedDate).toLocaleDateString() : "—"}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500 uppercase tracking-wider">Total Amount</span>
                  <span className="text-emerald-400 font-mono font-bold">
                    ${parseFloat(purchase.totalAmount).toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500 uppercase tracking-wider">Balance Due</span>
                  <span className="text-slate-200 font-mono font-medium">
                    ${parseFloat(purchase.balanceDue).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Action Bar */}
          {purchase && (
            <div className="px-4 sm:px-6 py-3 bg-slate-950/40 border-b border-slate-800">
              {actionError && (
                <div className="mb-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                  {actionError}
                </div>
              )}

              {/* DRAFT Actions */}
              {purchase.status === PurchaseStatus.DRAFT && (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    {canMutatePurchases ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onEditPurchase(purchase)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
                        >
                          ✏️ Edit Order
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmOrderOpen(true)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 transition-colors"
                        >
                          Mark as Ordered
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-500 italic">Read-only permissions</span>
                    )}
                  </div>

                  {canMutatePurchases && (
                    <button
                      type="button"
                      onClick={() => setConfirmCancelOpen(true)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                    >
                      Cancel Order
                    </button>
                  )}
                </div>
              )}

              {/* Non-DRAFT Informational / Action Areas */}
              {(purchase.status === PurchaseStatus.ORDERED ||
                purchase.status === PurchaseStatus.PARTIALLY_RECEIVED) && (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    {canMutatePurchases ? (
                      <button
                        type="button"
                        onClick={() => setIsReceivingModalOpen(true)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-900/20 transition-all flex items-center gap-1.5"
                      >
                        <span>📦</span>
                        <span>Receive Goods</span>
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500 italic">Read-only permissions</span>
                    )}
                  </div>

                  <div className="text-xs text-slate-400">
                    Status:{" "}
                    <span className="font-semibold text-slate-200">
                      {purchase.status === PurchaseStatus.ORDERED
                        ? "Ordered (Awaiting Delivery)"
                        : "Partially Received"}
                    </span>
                  </div>
                </div>
              )}

              {purchase.status === PurchaseStatus.RECEIVED && (
                <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-lg flex items-center gap-2">
                  <span>✅</span>
                  <span>All ordered items have been fully received into stock.</span>
                </div>
              )}

              {purchase.status === PurchaseStatus.CANCELLED && (
                <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-lg flex items-center gap-2">
                  <span>🚫</span>
                  <span>This order was cancelled and is permanently read-only.</span>
                </div>
              )}
            </div>
          )}

          {/* Navigation Tabs */}
          {purchase && (
            <div className="flex items-center px-4 sm:px-6 border-b border-slate-800 bg-slate-900">
              <button
                type="button"
                onClick={() => setActiveTab("overview")}
                className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === "overview"
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>📦</span>
                <span>Overview & Items ({purchase.items.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("receipts")}
                className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === "receipts"
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>📥</span>
                <span>Receipts ({purchase.receipts.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("payments")}
                className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === "payments"
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>💳</span>
                <span>Payments ({purchase.payments.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("returns")}
                className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === "returns"
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <span>↩️</span>
                <span>Returns ({purchase.returns.length})</span>
              </button>
            </div>
          )}

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {isLoading && (
              <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                <span className="animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
                <span className="text-xs">Loading purchase order details...</span>
              </div>
            )}

            {error && !isLoading && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs space-y-3">
                <p className="font-semibold">Unable to display purchase order:</p>
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => loadDetail()}
                  className="px-3 py-1.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-medium transition-colors"
                >
                  Retry Loading
                </button>
              </div>
            )}

            {!isLoading && !error && purchase && (
              <>
                {/* TAB 1: OVERVIEW & ITEMS */}
                {activeTab === "overview" && (
                  <div className="space-y-6">
                    {/* Metadata Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Supplier Card */}
                      <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 space-y-2 text-xs">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <span className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">
                            Supplier Details
                          </span>
                          <span className="text-emerald-400 font-medium">{purchase.supplier.name}</span>
                        </div>
                        <div className="space-y-1 text-slate-400">
                          {purchase.supplier.contactPerson && (
                            <p>Contact: <span className="text-slate-200">{purchase.supplier.contactPerson}</span></p>
                          )}
                          {purchase.supplier.email && (
                            <p>Email: <span className="text-slate-200">{purchase.supplier.email}</span></p>
                          )}
                          {purchase.supplier.phone && (
                            <p>Phone: <span className="text-slate-200">{purchase.supplier.phone}</span></p>
                          )}
                          {purchase.supplier.address && (
                            <p>Address: <span className="text-slate-200">{purchase.supplier.address}, {purchase.supplier.city}</span></p>
                          )}
                          {purchase.supplier.taxNumber && (
                            <p>Tax ID: <span className="text-slate-200 font-mono">{purchase.supplier.taxNumber}</span></p>
                          )}
                        </div>
                      </div>

                      {/* Branch & Order Info */}
                      <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 space-y-2 text-xs">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <span className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">
                            Destination & Audit
                          </span>
                          <span className="text-slate-200 font-medium">
                            {purchase.branch.name} ({purchase.branch.code})
                          </span>
                        </div>
                        <div className="space-y-1 text-slate-400">
                          <p>
                            Created By:{" "}
                            <span className="text-slate-200">
                              {purchase.createdBy?.name || purchase.createdBy?.email || "System"}
                            </span>
                          </p>
                          <p>
                            Created On:{" "}
                            <span className="text-slate-200">
                              {new Date(purchase.createdAt).toLocaleString()}
                            </span>
                          </p>
                          <p>
                            Last Updated:{" "}
                            <span className="text-slate-200">
                              {new Date(purchase.updatedAt).toLocaleString()}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Line Items Table */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                          Ordered Items ({purchase.items.length})
                        </h4>
                      </div>

                      <div className="border border-slate-800 rounded-xl overflow-x-auto bg-slate-950/30">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                            <tr>
                              <th className="px-3 py-2.5">Product & SKU</th>
                              <th className="px-3 py-2.5 text-right">Ordered</th>
                              <th className="px-3 py-2.5 text-right">Received</th>
                              <th className="px-3 py-2.5 text-right">Returned</th>
                              <th className="px-3 py-2.5 text-right">Remaining</th>
                              <th className="px-3 py-2.5 text-right">Unit Cost</th>
                              <th className="px-3 py-2.5 text-right">Tax (%)</th>
                              <th className="px-3 py-2.5 text-right">Line Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {purchase.items.map((item) => (
                              <tr key={item.id} className="hover:bg-slate-800/20">
                                <td className="px-3 py-2.5">
                                  <div className="font-semibold text-white">{item.product.name}</div>
                                  {item.variant && (
                                    <div className="text-emerald-400 text-[11px]">
                                      {item.variant.name}
                                    </div>
                                  )}
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    SKU: {item.variant?.sku || item.product.sku} • {item.product.unit}
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono text-slate-200">
                                  {parseFloat(item.quantityOrdered).toFixed(3)}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono text-emerald-400">
                                  {parseFloat(item.quantityReceived).toFixed(3)}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono text-amber-400">
                                  {parseFloat(item.quantityReturned).toFixed(3)}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono text-sky-400 font-semibold">
                                  {parseFloat(item.remainingToReceive).toFixed(3)}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono text-slate-300">
                                  ${parseFloat(item.unitCost).toFixed(2)}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono text-slate-400">
                                  {parseFloat(item.taxRate).toFixed(2)}%
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-100">
                                  ${parseFloat(item.lineTotal).toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Authoritative Financial Breakdown Card */}
                    <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 space-y-3">
                      <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider border-b border-slate-800 pb-2">
                        Financial Summary (Server-Authoritative)
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div className="space-y-1.5 text-slate-400">
                          <div className="flex justify-between">
                            <span>Subtotal (Items):</span>
                            <span className="font-mono text-slate-200">
                              ${parseFloat(purchase.subtotal).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Order Discount:</span>
                            <span className="font-mono text-rose-400">
                              -${parseFloat(purchase.discountAmount).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Order Tax:</span>
                            <span className="font-mono text-slate-200">
                              +${parseFloat(purchase.taxAmount).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Shipping Amount:</span>
                            <span className="font-mono text-slate-200">
                              +${parseFloat(purchase.shippingAmount).toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1.5 p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                          <div className="flex justify-between font-bold text-white text-sm">
                            <span>Grand Total:</span>
                            <span className="font-mono text-emerald-400">
                              ${parseFloat(purchase.totalAmount).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Total Paid:</span>
                            <span className="font-mono text-slate-200">
                              ${parseFloat(purchase.paidAmount).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between font-semibold pt-1 border-t border-slate-800">
                            <span className="text-slate-300">Balance Due:</span>
                            <span
                              className={`font-mono ${
                                parseFloat(purchase.balanceDue) > 0 ? "text-amber-400" : "text-emerald-400"
                              }`}
                            >
                              ${parseFloat(purchase.balanceDue).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Notes Section */}
                    {purchase.notes && (
                      <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 space-y-1 text-xs">
                        <span className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                          Order Notes
                        </span>
                        <p className="text-slate-200 whitespace-pre-wrap">{purchase.notes}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: RECEIPTS HISTORY */}
                {activeTab === "receipts" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Receiving History (Read-Only)
                      </h4>
                      <span className="text-xs text-slate-500">
                        {purchase.receipts.length} recorded receipt(s)
                      </span>
                    </div>

                    {purchase.receipts.length === 0 ? (
                      <div className="py-12 text-center text-slate-500 text-xs bg-slate-950/30 rounded-xl border border-slate-800/80">
                        No receipts recorded for this purchase order yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {purchase.receipts.map((rec) => (
                          <div
                            key={rec.id}
                            className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 text-xs space-y-2"
                          >
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-white">
                                  {rec.receiptNumber}
                                </span>
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  Goods Receipt
                                </span>
                              </div>
                              <span className="text-slate-400">
                                Received on: {new Date(rec.receivedAt).toLocaleString()}
                              </span>
                            </div>

                            <div className="text-slate-400 flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60 text-[11px]">
                              <span>
                                Received by: {rec.receivedBy?.name || rec.receivedBy?.email || "Unknown"}
                              </span>
                              <span>{rec.itemCount} item lines received</span>
                            </div>

                            {rec.notes && (
                              <p className="text-slate-300 italic pt-1">{rec.notes}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: PAYMENTS HISTORY */}
                {activeTab === "payments" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Payment Records (Read-Only)
                      </h4>
                      <span className="text-xs text-slate-500">
                        {purchase.payments.length} payment(s) recorded
                      </span>
                    </div>

                    {purchase.payments.length === 0 ? (
                      <div className="py-12 text-center text-slate-500 text-xs bg-slate-950/30 rounded-xl border border-slate-800/80">
                        No payments recorded for this purchase order yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {purchase.payments.map((pmt) => (
                          <div
                            key={pmt.id}
                            className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 text-xs space-y-2"
                          >
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-semibold text-slate-200">
                                  {pmt.reference ? `Ref: ${pmt.reference}` : "Payment Record"}
                                </span>
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                                  {pmt.paymentMethod}
                                </span>
                              </div>
                              <span className="font-mono font-bold text-emerald-400 text-sm">
                                ${parseFloat(pmt.amount).toFixed(2)}
                              </span>
                            </div>

                            <div className="text-slate-400 flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60 text-[11px]">
                              <span>
                                Recorded by: {pmt.recordedBy?.name || pmt.recordedBy?.email || "Unknown"}
                              </span>
                              <span>Date: {new Date(pmt.paidAt).toLocaleDateString()}</span>
                            </div>

                            <div className="text-[11px] text-slate-400 flex items-center gap-3">
                              <span>
                                Payment ID: <span className="font-mono text-slate-300">{pmt.id}</span>
                              </span>
                              {pmt.reference ? (
                                <span>
                                  Reference: <span className="font-mono text-slate-300">{pmt.reference}</span>
                                </span>
                              ) : (
                                <span className="italic text-slate-500">No reference</span>
                              )}
                            </div>

                            {pmt.notes && (
                              <p className="text-slate-300 italic pt-1">{pmt.notes}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 4: RETURNS HISTORY */}
                {activeTab === "returns" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Purchase Returns History (Read-Only)
                      </h4>
                      <span className="text-xs text-slate-500">
                        {purchase.returns.length} return(s) processed
                      </span>
                    </div>

                    {purchase.returns.length === 0 ? (
                      <div className="py-12 text-center text-slate-500 text-xs bg-slate-950/30 rounded-xl border border-slate-800/80">
                        No purchase returns recorded for this purchase order yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {purchase.returns.map((ret) => (
                          <div
                            key={ret.id}
                            className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 text-xs space-y-2"
                          >
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <span className="font-mono font-bold text-white">
                                {ret.returnNumber}
                              </span>
                              <span className="text-slate-400">
                                Date: {new Date(ret.returnDate).toLocaleDateString()}
                              </span>
                            </div>

                            <p className="text-slate-300">
                              Reason: <span className="text-white font-medium">{ret.reason}</span>
                            </p>

                            {ret.items && ret.items.length > 0 && (
                              <div className="pt-2 border-t border-slate-800/60 space-y-1">
                                {ret.items.map((ri) => (
                                  <div
                                    key={ri.id}
                                    className="flex items-center justify-between text-[11px] text-slate-300"
                                  >
                                    <span>
                                      {ri.productName} {ri.variantName ? `(${ri.variantName})` : ""}
                                    </span>
                                    <span className="font-mono">
                                      Returned: {parseFloat(ri.quantityReturned).toFixed(3)} • Total: $
                                      {parseFloat(ri.lineTotal).toFixed(2)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="text-slate-500 text-[10px] pt-1">
                              Processed by: {ret.returnedBy?.name || ret.returnedBy?.email || "Unknown"}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal: Mark as Ordered */}
      {confirmOrderOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">Mark Order as ORDERED?</h3>
            <p className="text-xs text-slate-300">
              Are you sure you want to transition purchase order{" "}
              <strong className="text-white">{purchase?.purchaseNumber}</strong> from DRAFT to ORDERED?
              Once ordered, line items cannot be modified directly.
            </p>
            {actionError && (
              <p className="text-xs text-rose-400 bg-rose-500/10 p-2 rounded">{actionError}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmOrderOpen(false)}
                disabled={isActionPending}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleMarkOrdered}
                disabled={isActionPending}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50"
              >
                {isActionPending ? "Transitioning..." : "Confirm & Mark Ordered"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Cancel Purchase */}
      {confirmCancelOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-rose-400">Cancel Purchase Order?</h3>
            <p className="text-xs text-slate-300">
              Are you sure you want to cancel purchase order{" "}
              <strong className="text-white">{purchase?.purchaseNumber}</strong>?
            </p>
            <p className="text-xs text-amber-300/80 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
              ⚠️ Warning: Cancellation is terminal. This order will become permanently read-only and will be excluded from active payable calculations.
            </p>
            {actionError && (
              <p className="text-xs text-rose-400 bg-rose-500/10 p-2 rounded">{actionError}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmCancelOpen(false)}
                disabled={isActionPending}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={handleCancelPurchase}
                disabled={isActionPending}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50"
              >
                {isActionPending ? "Cancelling..." : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Goods Receiving Modal */}
      {isReceivingModalOpen && purchase && (
        <ReceivingModal
          isOpen={isReceivingModalOpen}
          onClose={() => setIsReceivingModalOpen(false)}
          onSuccess={(msg) => {
            setIsReceivingModalOpen(false);
            onPurchaseUpdated(msg);
            loadDetail();
          }}
          purchase={purchase}
          organizationId={organizationId}
        />
      )}
    </div>
  );
}

export function PurchaseDetailDrawer(props: PurchaseDetailDrawerProps) {
  if (!props.isOpen || !props.purchaseId) return null;

  return (
    <PurchaseDetailDrawerContent
      key={props.purchaseId}
      {...props}
      purchaseId={props.purchaseId}
    />
  );
}
