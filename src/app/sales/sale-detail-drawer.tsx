"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import {
  X,
  Receipt,
  Printer,
  Calendar,
  User,
  Store,
  CreditCard,
  AlertTriangle,
  RotateCcw,
  Tag,
  CheckCircle2,
  Clock,
  Ban,
  Loader2,
  ShieldAlert,
  ArrowRight,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { getSaleDetailAction } from "./actions";
import { SaleReceiptModal } from "./sale-receipt-modal";
import { VoidSaleModal } from "./void-sale-modal";
import { extractSavedSaleTaxBreakdown } from "@/lib/tax";
import {
  type SerializedSaleDetail,
  type SerializedVoidSaleResult,
} from "./types";
import { SYSTEM_ROLES } from "@/lib/roles";

interface SaleDetailDrawerProps {
  isOpen: boolean;
  saleId: string | null;
  organizationId: string;
  organizationName: string;
  organizationCurrency?: string;
  organizationTimezone?: string;
  userRole: string;
  onClose: () => void;
  onSaleVoided?: (voidResult: SerializedVoidSaleResult) => void;
}

interface SaleDetailDrawerContentProps {
  saleId: string;
  organizationId: string;
  organizationName: string;
  organizationCurrency?: string;
  organizationTimezone?: string;
  userRole: string;
  onClose: () => void;
  onSaleVoided?: (voidResult: SerializedVoidSaleResult) => void;
}

function formatCurrency(amount: string | number, currency = "USD"): string {
  const num = typeof amount === "number" ? amount : parseFloat(amount || "0");
  if (isNaN(num)) return `${currency} 0.00`;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${currency} ${num.toFixed(2)}`;
  }
}

function formatDateTime(dateString: string, timeZone = "UTC"): string {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return new Date(dateString).toLocaleString();
  }
}

function SaleDetailDrawerContent({
  saleId,
  organizationId,
  organizationName,
  organizationCurrency = "USD",
  organizationTimezone = "UTC",
  userRole,
  onClose,
  onSaleVoided,
}: SaleDetailDrawerContentProps) {
  const [sale, setSale] = useState<SerializedSaleDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [voidSuccessBanner, setVoidSuccessBanner] = useState<string | null>(null);
  const [, startLoadTransition] = useTransition();

  const canVoidSales =
    userRole === SYSTEM_ROLES.OWNER || userRole === SYSTEM_ROLES.MANAGER;

  // Load sale detail
  const loadSaleDetail = useCallback(() => {
    startLoadTransition(async () => {
      setIsLoading(true);
      setErrorMessage(null);
      setVoidSuccessBanner(null);

      try {
        const res = await getSaleDetailAction(saleId, organizationId);
        if (!res.success || !res.data) {
          setErrorMessage(res.error || "Failed to load sale details.");
          setSale(null);
        } else {
          setSale(res.data);
        }
      } catch (err: unknown) {
        setErrorMessage(
          err instanceof Error ? err.message : "An unexpected server error occurred."
        );
        setSale(null);
      } finally {
        setIsLoading(false);
      }
    });
  }, [saleId, organizationId]);

  useEffect(() => {
    loadSaleDetail();
  }, [loadSaleDetail]);

  // Handle Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isReceiptModalOpen && !isVoidModalOpen) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isReceiptModalOpen, isVoidModalOpen, onClose]);

  const handleVoidSuccess = (result: SerializedVoidSaleResult) => {
    setIsVoidModalOpen(false);
    setVoidSuccessBanner(
      `Sale ${result.invoiceNumber} has been successfully voided. ${result.restoredItemCount} items (${result.restoredQuantity} units) were restored to inventory.`
    );

    // Update local sale state immediately
    if (sale) {
      setSale({
        ...sale,
        status: "VOIDED",
        notes: result.reason
          ? `${sale.notes ? sale.notes + " | " : ""}VOID REASON: ${result.reason}`
          : sale.notes,
      });
    }

    // Inform parent listing view to update table rows and KPIs
    if (onSaleVoided) {
      onSaleVoided(result);
    }
  };

  const isVoided = sale?.status === "VOIDED";
  const hasReturns = sale?.hasReturns || ((sale?.returns?.length ?? 0) > 0);

  return (
    <div className="fixed inset-0 z-40 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={() => {
          if (!isReceiptModalOpen && !isVoidModalOpen) {
            onClose();
          }
        }}
        aria-hidden="true"
      />

      {/* Slide-over Drawer Panel */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sale-drawer-title"
          className="w-screen max-w-2xl bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col z-50 text-slate-200"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between shrink-0">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-400" />
                <h2 id="sale-drawer-title" className="text-lg font-bold text-white font-mono">
                  {sale ? sale.invoiceNumber : "Sale Details"}
                </h2>
                {sale?.receiptNumber && (
                  <span className="text-xs text-slate-400 font-mono">
                    (Rcpt: {sale.receiptNumber})
                  </span>
                )}
              </div>
              {sale && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{formatDateTime(sale.saleDate, organizationTimezone)}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close sale details drawer"
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Loading State */}
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-20 space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                <p className="text-xs text-slate-400">Loading sale details...</p>
              </div>
            )}

            {/* Error State */}
            {!isLoading && errorMessage && (
              <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-800/40 text-rose-300 text-xs space-y-3">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Failed to Load Sale</span>
                </div>
                <p className="text-slate-300">{errorMessage}</p>
                <button
                  type="button"
                  onClick={loadSaleDetail}
                  className="px-3 py-1.5 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 text-xs font-semibold border border-rose-500/30 transition-colors"
                >
                  Retry Loading
                </button>
              </div>
            )}

            {/* Sale Loaded Content */}
            {!isLoading && sale && (
              <>
                {/* Void Success Banner */}
                {voidSuccessBanner && (
                  <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-800/50 text-emerald-300 text-xs flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{voidSuccessBanner}</span>
                  </div>
                )}

                {/* Status Banners */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Status Badge */}
                  {isVoided ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                      <Ban className="w-3.5 h-3.5" />
                      VOIDED TRANSACTION
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      COMPLETED
                    </span>
                  )}

                  {/* Payment Status Badge */}
                  {sale.paymentStatus === "PAID" ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                      <CreditCard className="w-3.5 h-3.5" />
                      PAYMENT: PAID
                    </span>
                  ) : sale.paymentStatus === "PARTIAL" ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                      <CreditCard className="w-3.5 h-3.5" />
                      PAYMENT: PARTIAL
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/20">
                      <CreditCard className="w-3.5 h-3.5" />
                      PAYMENT: UNPAID
                    </span>
                  )}

                  {/* Has Returns Indicator */}
                  {hasReturns && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                      <RotateCcw className="w-3.5 h-3.5" />
                      HAS RETURNS ({sale.returns?.length || 1})
                    </span>
                  )}
                </div>

                {/* Metadata Summary Card: Branch, Cashier, Customer */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Customer */}
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-500" />
                      Customer
                    </span>
                    <p className="font-semibold text-xs text-white">
                      {sale.customer ? sale.customer.name : "Walk-in Customer"}
                    </p>
                    {sale.customer?.phone && (
                      <p className="text-[11px] text-slate-400 font-mono">
                        {sale.customer.phone}
                      </p>
                    )}
                    {sale.customer?.code && (
                      <p className="text-[10px] text-slate-500">
                        Code: {sale.customer.code}
                      </p>
                    )}
                  </div>

                  {/* Branch */}
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1">
                      <Store className="w-3 h-3 text-slate-500" />
                      Branch
                    </span>
                    <p className="font-semibold text-xs text-white">
                      {sale.branch.name}
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Code: {sale.branch.code}
                    </p>
                  </div>

                  {/* Cashier */}
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      Cashier
                    </span>
                    <p className="font-semibold text-xs text-white">
                      {sale.cashier ? sale.cashier.name : "System / Unassigned"}
                    </p>
                    {sale.cashier?.email && (
                      <p className="text-[11px] text-slate-400 truncate">
                        {sale.cashier.email}
                      </p>
                    )}
                  </div>
                </div>

                {/* Items Table */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-emerald-400" />
                      Purchased Items ({sale.items.length})
                    </h3>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-950/60 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                          <tr>
                            <th className="px-3.5 py-2.5">Item</th>
                            <th className="px-3.5 py-2.5 text-center">Qty</th>
                            <th className="px-3.5 py-2.5 text-right">Unit Price</th>
                            <th className="px-3.5 py-2.5 text-right">Discount</th>
                            <th className="px-3.5 py-2.5 text-right">Tax</th>
                            <th className="px-3.5 py-2.5 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {sale.items.map((item) => {
                            const qty = parseFloat(item.quantity) || 0;
                            const price = parseFloat(item.unitPrice) || 0;
                            const disc = parseFloat(item.discountAmount) || 0;
                            const tax = parseFloat(item.taxAmount) || 0;
                            const total = parseFloat(item.lineTotal) || 0;
                            const returnedQty = parseFloat(item.quantityReturned || "0");

                            return (
                              <tr key={item.id} className="hover:bg-slate-800/30">
                                <td className="px-3.5 py-2.5 font-sans">
                                  <div className="font-medium text-slate-200">
                                    {item.productName}
                                  </div>
                                  {item.productSku && (
                                    <div className="text-[10px] text-slate-500 font-mono">
                                      SKU: {item.productSku}
                                    </div>
                                  )}
                                  {returnedQty > 0 && (
                                    <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                                      Returned: {returnedQty}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3.5 py-2.5 text-center text-slate-300">
                                  {qty}
                                </td>
                                <td className="px-3.5 py-2.5 text-right text-slate-300">
                                  {formatCurrency(price, organizationCurrency)}
                                </td>
                                <td className="px-3.5 py-2.5 text-right text-amber-400">
                                  {disc > 0 ? `-${formatCurrency(disc, organizationCurrency)}` : "—"}
                                </td>
                                <td className="px-3.5 py-2.5 text-right text-slate-400">
                                  {tax > 0 ? `+${formatCurrency(tax, organizationCurrency)}` : "—"}
                                </td>
                                <td className="px-3.5 py-2.5 text-right font-bold text-white">
                                  {formatCurrency(total, organizationCurrency)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Financial Summary & Breakdown */}
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal:</span>
                    <span className="font-mono text-slate-200">
                      {formatCurrency(sale.subtotal, organizationCurrency)}
                    </span>
                  </div>
                  {parseFloat(sale.discountAmount || "0") > 0 && (
                    <div className="flex justify-between text-amber-400">
                      <span>Total Discounts:</span>
                      <span className="font-mono">
                        -{formatCurrency(sale.discountAmount, organizationCurrency)}
                      </span>
                    </div>
                  )}
                  {parseFloat(sale.taxAmount || "0") > 0 && (() => {
                    const tb = extractSavedSaleTaxBreakdown(sale);
                    return (
                      <>
                        <div className="flex justify-between text-slate-400">
                          <span>FBR Sales Tax ({tb.fbrRate}%):</span>
                          <span className="font-mono text-slate-200">
                            +{formatCurrency(tb.fbrTaxAmount, organizationCurrency)}
                          </span>
                        </div>
                        {tb.praFee > 0 && (
                          <div className="flex justify-between text-slate-400">
                            <span>PRA Invoice Fee:</span>
                            <span className="font-mono text-slate-200">
                              +{formatCurrency(tb.praFee, organizationCurrency)}
                            </span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                  <div className="flex justify-between pt-2 border-t border-slate-800 text-sm font-bold text-white">
                    <span>Total Amount:</span>
                    <span className={`font-mono ${isVoided ? "line-through text-rose-400" : "text-emerald-400"}`}>
                      {formatCurrency(sale.totalAmount, organizationCurrency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300 pt-1">
                    <span>Paid Amount:</span>
                    <span className="font-mono text-emerald-400">
                      {formatCurrency(sale.paidAmount, organizationCurrency)}
                    </span>
                  </div>
                  {parseFloat(sale.changeAmount || "0") > 0 && (
                    <div className="flex justify-between text-slate-400">
                      <span>Change Given:</span>
                      <span className="font-mono text-slate-300">
                        {formatCurrency(sale.changeAmount, organizationCurrency)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Payment History Records */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                    Payment Records ({sale.payments.length})
                  </h3>

                  {sale.payments.length > 0 ? (
                    <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
                      {sale.payments.map((p) => (
                        <div key={p.id} className="p-3 text-xs flex items-center justify-between">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-200 border border-slate-700">
                                {p.paymentMethod}
                              </span>
                              {p.reference && (
                                <span className="text-[11px] text-slate-400 font-mono">
                                  Ref: {p.reference}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Paid {formatDateTime(p.paidAt, organizationTimezone)}
                              {p.recordedBy && ` • Recorded by ${p.recordedBy.name}`}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-emerald-400 text-sm">
                              {formatCurrency(p.amount, organizationCurrency)}
                            </span>
                            {p.tenderedAmount && (
                              <div className="text-[10px] text-slate-500">
                                Tendered: {formatCurrency(p.tenderedAmount, organizationCurrency)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No payment records found.</p>
                  )}
                </div>

                {/* Associated Returns Section (if any) */}
                {sale.returns && sale.returns.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                        <RotateCcw className="w-3.5 h-3.5" />
                        Processed Sales Returns ({sale.returns.length})
                      </h3>
                      <Link
                        href={`/sales/returns?org=${organizationId}&search=${sale.invoiceNumber}`}
                        className="text-[11px] text-purple-300 hover:text-purple-200 flex items-center gap-1 underline underline-offset-2"
                      >
                        <span>View Returns</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>

                    <div className="divide-y divide-purple-900/40 rounded-xl border border-purple-900/40 bg-purple-950/10 overflow-hidden">
                      {sale.returns.map((ret) => (
                        <div key={ret.id} className="p-3 text-xs flex items-center justify-between">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-purple-300">
                                #{ret.returnNumber}
                              </span>
                              {ret.reason && (
                                <span className="text-[11px] text-slate-400 italic">
                                  &ldquo;{ret.reason}&rdquo;
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Returned {formatDateTime(ret.createdAt, organizationTimezone)}
                              {ret.returnedBy && ` by ${ret.returnedBy.name}`}
                            </div>
                          </div>
                          <div className="text-right font-mono">
                            <div className="text-xs text-purple-300 font-bold">
                              Refunded: {formatCurrency(ret.refundedAmount, organizationCurrency)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Internal / Transaction Notes */}
                {sale.notes && (
                  <div className="space-y-1.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-500" />
                      Transaction Notes
                    </h3>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 whitespace-pre-wrap">
                      {sale.notes}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Sticky Drawer Footer Controls */}
          {sale && (
            <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                {/* Reprint Receipt Button */}
                <button
                  type="button"
                  onClick={() => setIsReceiptModalOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Reprint Receipt</span>
                </button>

                {/* Void Sale Button: ONLY OWNER & MANAGER */}
                {canVoidSales && (
                  <button
                    type="button"
                    onClick={() => setIsVoidModalOpen(true)}
                    disabled={isVoided || hasReturns}
                    title={
                      isVoided
                        ? "Sale is already voided"
                        : hasReturns
                        ? "Sales with processed returns cannot be voided"
                        : "Void transaction and restore stock"
                    }
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors flex items-center gap-1.5 cursor-pointer ${
                      isVoided || hasReturns
                        ? "bg-slate-900/50 text-slate-500 border-slate-800 cursor-not-allowed opacity-50"
                        : "bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 border-rose-800/60"
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                    <span>Void Sale</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 transition-colors cursor-pointer"
              >
                Close Drawer
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Receipt Reprint Modal */}
      <SaleReceiptModal
        isOpen={isReceiptModalOpen}
        sale={sale}
        organizationName={organizationName}
        currency={organizationCurrency}
        timeZone={organizationTimezone}
        onClose={() => setIsReceiptModalOpen(false)}
      />

      {/* Void Sale Modal */}
      <VoidSaleModal
        isOpen={isVoidModalOpen}
        sale={sale}
        organizationId={organizationId}
        onClose={() => setIsVoidModalOpen(false)}
        onVoidSuccess={handleVoidSuccess}
      />
    </div>
  );
}

export function SaleDetailDrawer(props: SaleDetailDrawerProps) {
  if (!props.isOpen || !props.saleId) {
    return null;
  }

  return (
    <SaleDetailDrawerContent
      key={props.saleId}
      saleId={props.saleId}
      organizationId={props.organizationId}
      organizationName={props.organizationName}
      organizationCurrency={props.organizationCurrency}
      organizationTimezone={props.organizationTimezone}
      userRole={props.userRole}
      onClose={props.onClose}
      onSaleVoided={props.onSaleVoided}
    />
  );
}
