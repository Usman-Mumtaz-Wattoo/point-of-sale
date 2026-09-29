"use client";

import { ChevronLeft, ChevronRight, User, Store, Receipt, Calendar, CreditCard, Eye } from "lucide-react";
import type { SerializedSaleSummary } from "./types";

interface SalesTableProps {
  sales: SerializedSaleSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  currency?: string;
  timeZone?: string;
  isLoading?: boolean;
  onPageChange: (newPage: number) => void;
  onSelectSale?: (saleId: string) => void;
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
    return new Date(dateString).toLocaleDateString();
  }
}

export function SalesTable({
  sales,
  page,
  pageSize,
  totalItems,
  totalPages,
  currency = "USD",
  timeZone = "UTC",
  isLoading = false,
  onPageChange,
  onSelectSale,
}: SalesTableProps) {
  const startItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems);

  if (sales.length === 0) {
    return null; // Empty state handled by parent view
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th scope="col" className="px-4 py-3.5">
                  Invoice / Receipt
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Date & Time
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Customer
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Branch
                </th>
                <th scope="col" className="px-4 py-3.5">
                  Cashier
                </th>
                <th scope="col" className="px-4 py-3.5 text-center">
                  Items
                </th>
                <th scope="col" className="px-4 py-3.5 text-right">
                  Total
                </th>
                <th scope="col" className="px-4 py-3.5 text-center">
                  Payment
                </th>
                <th scope="col" className="px-4 py-3.5 text-center">
                  Status
                </th>
                <th scope="col" className="px-4 py-3.5 text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-normal">
              {sales.map((sale) => {
                const isVoided = sale.status === "VOIDED";
                const isPaid = sale.paymentStatus === "PAID";
                const isPartial = sale.paymentStatus === "PARTIAL";

                return (
                  <tr
                    key={sale.id}
                    onClick={() => onSelectSale?.(sale.id)}
                    className={`transition-colors cursor-pointer ${
                      isVoided
                        ? "bg-rose-950/10 hover:bg-rose-950/20 text-slate-400"
                        : "hover:bg-slate-900/60"
                    }`}
                  >
                    {/* Invoice & Receipt # */}
                    <td className="px-4 py-3.5 font-mono">
                      <div className="flex items-center gap-1.5">
                        <Receipt className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span
                          className={`font-semibold ${
                            isVoided ? "line-through text-rose-300" : "text-white"
                          }`}
                        >
                          {sale.invoiceNumber}
                        </span>
                      </div>
                      {sale.receiptNumber && (
                        <div className="text-[10px] text-slate-500 mt-0.5 pl-5">
                          Rcpt: {sale.receiptNumber}
                        </div>
                      )}
                    </td>

                    {/* Date & Time */}
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>{formatDateTime(sale.saleDate, timeZone)}</span>
                      </div>
                    </td>

                    {/* Customer */}
                    <td className="px-4 py-3.5">
                      {sale.customer ? (
                        <div>
                          <div className="font-medium text-slate-200 flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{sale.customer.name}</span>
                          </div>
                          {sale.customer.phone && (
                            <div className="text-[10px] text-slate-500 pl-4">
                              {sale.customer.phone}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-500 italic">Walk-in Customer</span>
                      )}
                    </td>

                    {/* Branch */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1 text-slate-300">
                        <Store className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="font-medium text-slate-200">{sale.branch.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 pl-4">{sale.branch.code}</span>
                    </td>

                    {/* Cashier */}
                    <td className="px-4 py-3.5 text-slate-300">
                      {sale.cashier ? (
                        <span>{sale.cashier.name}</span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    {/* Items Count */}
                    <td className="px-4 py-3.5 text-center font-mono text-slate-300">
                      <span className="inline-block px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 text-xs">
                        {sale.itemCount}
                      </span>
                    </td>

                    {/* Total Amount */}
                    <td className="px-4 py-3.5 text-right font-mono font-medium whitespace-nowrap">
                      <span
                        className={`text-sm ${
                          isVoided ? "line-through text-slate-400" : "text-emerald-400"
                        }`}
                      >
                        {formatCurrency(sale.totalAmount, currency)}
                      </span>
                      {parseFloat(sale.discountAmount || "0") > 0 && (
                        <div className="text-[10px] text-amber-400/80">
                          Disc: -{formatCurrency(sale.discountAmount, currency)}
                        </div>
                      )}
                    </td>

                    {/* Payment Status */}
                    <td className="px-4 py-3.5 text-center whitespace-nowrap">
                      {isPaid ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CreditCard className="w-2.5 h-2.5" />
                          PAID
                        </span>
                      ) : isPartial ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <CreditCard className="w-2.5 h-2.5" />
                          PARTIAL
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <CreditCard className="w-2.5 h-2.5" />
                          UNPAID
                        </span>
                      )}
                    </td>

                    {/* Sale Status */}
                    <td className="px-4 py-3.5 text-center whitespace-nowrap">
                      {isVoided ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
                          VOIDED
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                          COMPLETED
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectSale?.(sale.id);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors cursor-pointer text-[11px]"
                        title="View Sale Details"
                      >
                        <Eye className="w-3.5 h-3.5 text-emerald-400" />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-1 text-xs text-slate-400">
        <div>
          Showing <span className="font-semibold text-slate-200">{startItem}</span> to{" "}
          <span className="font-semibold text-slate-200">{endItem}</span> of{" "}
          <span className="font-semibold text-slate-200">{totalItems}</span> sales
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || isLoading}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>

          <span className="px-2 font-mono text-slate-300">
            Page {page} of {Math.max(1, totalPages)}
          </span>

          <button
            type="button"
            disabled={page >= totalPages || isLoading}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
