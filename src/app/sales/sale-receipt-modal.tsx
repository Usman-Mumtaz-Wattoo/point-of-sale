"use client";

import { useEffect, useRef } from "react";
import { Printer, X, Receipt, AlertTriangle } from "lucide-react";
import { type SerializedSaleDetail } from "./types";
import { extractSavedSaleTaxBreakdown } from "@/lib/tax";

interface SaleReceiptModalProps {
  isOpen: boolean;
  sale: SerializedSaleDetail | null;
  organizationName: string;
  currency?: string;
  timeZone?: string;
  onClose: () => void;
}

function formatCurrency(amount: string | number, currency = "PKR"): string {
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

export function SaleReceiptModal({
  isOpen,
  sale,
  organizationName,
  currency = "PKR",
  timeZone = "UTC",
  onClose,
}: SaleReceiptModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !sale) {
    return null;
  }

  const isVoided = sale.status === "VOIDED";
  const taxBreakdown = extractSavedSaleTaxBreakdown(sale);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sale-receipt-title"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Strict Scoped CSS for 80mm thermal receipt printing */}
      <style>{`
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }
          body * {
            visibility: hidden !important;
          }
          #thermal-receipt-printable,
          #thermal-receipt-printable * {
            visibility: visible !important;
          }
          #thermal-receipt-printable {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 !important;
            padding: 5mm 4mm !important;
            background: #ffffff !important;
            color: #000000 !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            font-size: 11px !important;
            line-height: 1.3 !important;
          }
          .thermal-no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Centered Modal Container */}
      <div
        ref={modalRef}
        className="flex flex-col items-center max-w-sm w-full my-auto space-y-3"
      >
        {/* Modal Controls Bar (Hidden during Print) */}
        <div className="thermal-no-print flex items-center justify-between w-full px-2 py-1 text-white">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-emerald-400" />
            <span id="sale-receipt-title" className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Thermal Receipt Preview
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              aria-label="Print receipt"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors cursor-pointer shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close receipt preview"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Real Thermal Receipt Paper: Always White Paper, Always Black Text */}
        <div
          id="thermal-receipt-printable"
          style={{ backgroundColor: "#ffffff", color: "#000000" }}
          className="w-[320px] max-w-[320px] bg-white text-black font-mono text-xs shadow-2xl p-4 sm:p-5 rounded-xs space-y-2.5 leading-tight select-text border border-neutral-200"
        >
          {/* Header */}
          <div className="text-center space-y-0.5">
            <h3 className="font-black text-sm tracking-widest uppercase">
              {organizationName}
            </h3>
            <p className="text-[11px] font-semibold text-neutral-800">
              Branch: {sale.branch.name} ({sale.branch.code})
            </p>
            {sale.cashier && (
              <p className="text-[10px] text-neutral-700">
                Cashier: {sale.cashier.name}
              </p>
            )}
          </div>

          {/* Voided Alert Banner */}
          {isVoided && (
            <div className="border border-dashed border-red-600 bg-red-50 p-1.5 text-center my-1">
              <div className="flex items-center justify-center gap-1 font-bold text-red-700 text-xs uppercase tracking-wide">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                <span>*** VOIDED TRANSACTION ***</span>
              </div>
              <p className="text-[9px] text-red-600 mt-0.5">
                NOT VALID FOR REFUND OR EXCHANGE
              </p>
            </div>
          )}

          {/* Dashed Divider */}
          <div className="border-t border-dashed border-black/80 my-1.5" />

          {/* Transaction Metadata */}
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-neutral-700 font-medium">Invoice #:</span>
              <span className="font-bold">{sale.invoiceNumber}</span>
            </div>
            {sale.receiptNumber && (
              <div className="flex justify-between">
                <span className="text-neutral-700 font-medium">Receipt #:</span>
                <span>{sale.receiptNumber}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-neutral-700 font-medium">Date/Time:</span>
              <span>{formatDateTime(sale.saleDate, timeZone)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-700 font-medium">Customer:</span>
              <span className="font-medium">
                {sale.customer ? sale.customer.name : "Walk-in Customer"}
              </span>
            </div>
            {sale.customer?.phone && (
              <div className="flex justify-between">
                <span className="text-neutral-700 font-medium">Customer Phone:</span>
                <span>{sale.customer.phone}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-neutral-700 font-medium">Status:</span>
              <span className={isVoided ? "font-bold text-red-700" : "font-semibold"}>
                {sale.status}
              </span>
            </div>
          </div>

          {/* Dashed Divider */}
          <div className="border-t border-dashed border-black/80 my-1.5" />

          {/* Product & Price Rows */}
          <div>
            <div className="flex justify-between text-[10px] font-bold uppercase pb-1 border-b border-black/40 mb-1">
              <span className="flex-1">Item</span>
              <span className="w-10 text-center">Qty</span>
              <span className="w-14 text-right">Price</span>
              <span className="w-16 text-right">Total</span>
            </div>

            <div className="space-y-1 divide-y divide-black/10">
              {sale.items.map((item) => {
                const qty = parseFloat(item.quantity) || 0;
                const price = parseFloat(item.unitPrice) || 0;
                const lineTot = parseFloat(item.lineTotal) || 0;
                const itemDiscount = parseFloat(item.discountAmount) || 0;

                return (
                  <div key={item.id} className="pt-1 text-[11px]">
                    <div className="flex justify-between items-start gap-1">
                      <span className="flex-1 font-semibold break-words leading-tight">
                        {item.productName}
                      </span>
                      <span className="w-10 text-center font-mono">
                        {qty}
                      </span>
                      <span className="w-14 text-right font-mono">
                        {price.toFixed(2)}
                      </span>
                      <span className="w-16 text-right font-bold font-mono">
                        {lineTot.toFixed(2)}
                      </span>
                    </div>
                    {itemDiscount > 0 && (
                      <div className="text-[10px] text-neutral-600 pl-2">
                        Line Disc: -{itemDiscount.toFixed(2)}
                      </div>
                    )}
                    {item.quantityReturned && parseFloat(item.quantityReturned) > 0 && (
                      <div className="text-[10px] text-red-700 pl-2">
                        Returned: {item.quantityReturned}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dashed Divider */}
          <div className="border-t border-dashed border-black/80 my-1.5" />

          {/* Aligned Financial Totals */}
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-neutral-700 font-medium">Subtotal:</span>
              <span className="font-mono">{formatCurrency(sale.subtotal, currency)}</span>
            </div>

            {taxBreakdown.discountAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-neutral-700 font-medium">Discounts:</span>
                <span className="font-mono">
                  -{formatCurrency(taxBreakdown.discountAmount, currency)}
                </span>
              </div>
            )}

            {/* FBR Sales Tax Row with Applicable Rate & Amount */}
            <div className="flex justify-between">
              <span className="text-neutral-700 font-medium">
                FBR Sales Tax ({taxBreakdown.fbrRate}%):
              </span>
              <span className="font-mono font-medium">
                +{formatCurrency(taxBreakdown.fbrTaxAmount, currency)}
              </span>
            </div>

            {/* PRA Invoice Fee Row (PKR 1.00 per invoice) */}
            {taxBreakdown.praFee > 0 && (
              <div className="flex justify-between">
                <span className="text-neutral-700 font-medium">
                  PRA Invoice Fee:
                </span>
                <span className="font-mono font-medium">
                  +{formatCurrency(taxBreakdown.praFee, currency)}
                </span>
              </div>
            )}

            {/* Total Divider */}
            <div className="border-t border-double border-black/90 pt-1 mt-1 flex justify-between text-sm font-black">
              <span>TOTAL:</span>
              <span className="font-mono">
                {formatCurrency(sale.totalAmount, currency)}
              </span>
            </div>
          </div>

          {/* Dashed Divider */}
          <div className="border-t border-dashed border-black/80 my-1.5" />

          {/* Payment Method & Settlement */}
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-neutral-700 font-medium">Payment Method:</span>
              <span className="font-bold">{taxBreakdown.paymentMethod}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-700 font-medium">Paid Amount:</span>
              <span className="font-mono font-semibold">{formatCurrency(sale.paidAmount, currency)}</span>
            </div>
            {parseFloat(sale.changeAmount || "0") > 0 && (
              <div className="flex justify-between">
                <span className="text-neutral-700 font-medium">Change Given:</span>
                <span className="font-mono">{formatCurrency(sale.changeAmount, currency)}</span>
              </div>
            )}

            {sale.payments && sale.payments.length > 1 && (
              <div className="pt-1 space-y-0.5 border-t border-black/20">
                <span className="text-[10px] uppercase font-bold text-neutral-600 block">
                  Payment Breakdown:
                </span>
                {sale.payments.map((p) => (
                  <div key={p.id} className="flex justify-between text-[10px] pl-1">
                    <span>
                      {p.paymentMethod}
                      {p.reference ? ` (${p.reference})` : ""}
                    </span>
                    <span className="font-mono">{formatCurrency(p.amount, currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dashed Divider */}
          <div className="border-t border-dashed border-black/80 my-1.5" />

          {/* Receipt Footer */}
          <div className="text-center space-y-1 pt-1 text-[10px] text-neutral-700">
            <p className="font-extrabold uppercase tracking-wide">
              *** THANK YOU FOR YOUR BUSINESS ***
            </p>
            <p className="text-[9px] text-neutral-600">
              Tax Authority (FBR & PRA) Invoiced Transaction
            </p>
            <p className="text-[9px] font-mono tracking-widest text-neutral-500">
              {sale.invoiceNumber}
            </p>
          </div>
        </div>

        {/* Action Buttons Below Receipt (Hidden in Print) */}
        <div className="thermal-no-print flex items-center justify-center gap-3 w-full pt-1">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 max-w-[200px] py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Thermal Receipt</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
