"use client";

import { useEffect, useRef } from "react";
import { Printer, X, Receipt, AlertTriangle } from "lucide-react";
import { type SerializedSaleDetail } from "./types";

interface SaleReceiptModalProps {
  isOpen: boolean;
  sale: SerializedSaleDetail | null;
  organizationName: string;
  currency?: string;
  timeZone?: string;
  onClose: () => void;
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

export function SaleReceiptModal({
  isOpen,
  sale,
  organizationName,
  currency = "USD",
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

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sale-receipt-title"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Scoped CSS for 80mm thermal receipt printing */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #thermal-receipt-printable, #thermal-receipt-printable * {
            visibility: visible !important;
          }
          #thermal-receipt-printable {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 80mm !important;
            margin: 0 !important;
            padding: 8px !important;
            background: white !important;
            color: black !important;
            border: none !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      <div
        ref={modalRef}
        className="bg-slate-950 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl my-8"
      >
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-400" />
            <h2 id="sale-receipt-title" className="text-base font-bold text-white">
              Sale Receipt Preview
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close receipt preview"
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 80mm Thermal Receipt Content */}
        <div
          id="thermal-receipt-printable"
          className="bg-white text-black p-5 rounded-lg font-mono text-xs shadow-inner space-y-3.5 leading-tight print:p-0 print:shadow-none"
        >
          {/* Header */}
          <div className="text-center space-y-1">
            <h3 className="font-extrabold text-base tracking-wider uppercase">
              {organizationName}
            </h3>
            <p className="text-[11px] text-gray-700">
              Branch: {sale.branch.name} ({sale.branch.code})
            </p>
            {sale.cashier && (
              <p className="text-[10px] text-gray-600">
                Cashier: {sale.cashier.name}
              </p>
            )}
          </div>

          {/* Voided Alert Banner */}
          {isVoided && (
            <div className="border-2 border-dashed border-red-600 bg-red-50 p-2 text-center my-2 rounded">
              <div className="flex items-center justify-center gap-1 font-bold text-red-700 text-xs uppercase tracking-wide">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                <span>*** VOIDED TRANSACTION ***</span>
              </div>
              <p className="text-[9px] text-red-600 mt-0.5">
                NOT VALID FOR REFUND, RETURN, OR EXCHANGE
              </p>
            </div>
          )}

          {/* Transaction Metadata */}
          <div className="border-t border-b border-dashed border-gray-400 py-2 space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-gray-600">Invoice #:</span>
              <span className="font-bold">{sale.invoiceNumber}</span>
            </div>
            {sale.receiptNumber && (
              <div className="flex justify-between">
                <span className="text-gray-600">Receipt #:</span>
                <span>{sale.receiptNumber}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-600">Date:</span>
              <span>{formatDateTime(sale.saleDate, timeZone)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Customer:</span>
              <span>
                {sale.customer ? sale.customer.name : "Walk-in Customer"}
              </span>
            </div>
            {sale.customer?.phone && (
              <div className="flex justify-between">
                <span className="text-gray-600">Phone:</span>
                <span>{sale.customer.phone}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-600">Status:</span>
              <span className={isVoided ? "font-bold text-red-600" : "font-semibold text-emerald-800"}>
                {sale.status}
              </span>
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-[10px] font-bold uppercase border-b border-gray-300 pb-1 text-gray-700">
              <span className="flex-1">Item</span>
              <span className="w-12 text-center">Qty</span>
              <span className="w-16 text-right">Price</span>
              <span className="w-16 text-right">Total</span>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto divide-y divide-gray-100 print:max-h-none print:overflow-visible">
              {sale.items.map((item) => {
                const qty = parseFloat(item.quantity) || 0;
                const price = parseFloat(item.unitPrice) || 0;
                const lineTot = parseFloat(item.lineTotal) || 0;
                const itemDiscount = parseFloat(item.discountAmount) || 0;

                return (
                  <div key={item.id} className="pt-1 text-[11px]">
                    <div className="flex justify-between items-start gap-1">
                      <span className="flex-1 font-medium break-words leading-tight">
                        {item.productName}
                      </span>
                      <span className="w-12 text-center font-mono">
                        {qty}
                      </span>
                      <span className="w-16 text-right font-mono">
                        {price.toFixed(2)}
                      </span>
                      <span className="w-16 text-right font-bold font-mono">
                        {lineTot.toFixed(2)}
                      </span>
                    </div>
                    {itemDiscount > 0 && (
                      <div className="text-[10px] text-gray-500 pl-2">
                        Disc: -{itemDiscount.toFixed(2)}
                      </div>
                    )}
                    {item.quantityReturned && parseFloat(item.quantityReturned) > 0 && (
                      <div className="text-[10px] text-amber-700 pl-2">
                        Returned: {item.quantityReturned}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Financial Totals */}
          <div className="border-t border-dashed border-gray-400 pt-2 space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal:</span>
              <span className="font-mono">{formatCurrency(sale.subtotal, currency)}</span>
            </div>
            {parseFloat(sale.discountAmount || "0") > 0 && (
              <div className="flex justify-between text-gray-700">
                <span>Discount:</span>
                <span className="font-mono">
                  -{formatCurrency(sale.discountAmount, currency)}
                </span>
              </div>
            )}
            {parseFloat(sale.taxAmount || "0") > 0 && (
              <div className="flex justify-between text-gray-700">
                <span>Tax:</span>
                <span className="font-mono">+{formatCurrency(sale.taxAmount, currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-extrabold border-t border-gray-300 pt-1">
              <span>TOTAL:</span>
              <span className="font-mono">{formatCurrency(sale.totalAmount, currency)}</span>
            </div>
          </div>

          {/* Payment & Settlement */}
          <div className="border-t border-dashed border-gray-400 pt-2 space-y-1 text-[11px]">
            <div className="flex justify-between font-medium">
              <span className="text-gray-600">Paid Amount:</span>
              <span className="font-mono">{formatCurrency(sale.paidAmount, currency)}</span>
            </div>
            {parseFloat(sale.changeAmount || "0") > 0 && (
              <div className="flex justify-between text-gray-700">
                <span>Change Given:</span>
                <span className="font-mono">{formatCurrency(sale.changeAmount, currency)}</span>
              </div>
            )}

            {sale.payments && sale.payments.length > 0 && (
              <div className="pt-1 space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-gray-500">
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

          {/* Legal / POS Disclaimer Footer */}
          <div className="border-t border-dashed border-gray-400 pt-3 text-center space-y-1 text-[9px] text-gray-500">
            <p className="font-bold text-gray-700 uppercase">
              Thank You For Your Business!
            </p>
            <p>
              * POS Transaction Record. Official Tax Authority (FBR/PRA) integration is not active in this checkpoint.
            </p>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Receipt</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
