"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { PurchaseStatus, PurchasePaymentStatus } from "@prisma/client";
import {
  type SerializedPurchaseListItem,
  type PurchaseKPIs,
  type AuthorizedBranchDTO,
} from "./types";
import { listPurchasesAction } from "./actions";

interface PurchaseListProps {
  initialPurchases: SerializedPurchaseListItem[];
  initialTotalCount: number;
  initialKpis: PurchaseKPIs;
  organizationId: string;
  authorizedBranches: AuthorizedBranchDTO[];
  suppliers: { id: string; name: string }[];
  canMutatePurchases: boolean;
}

export function PurchaseList({
  initialPurchases,
  initialTotalCount,
  initialKpis,
  organizationId,
  authorizedBranches,
  suppliers,
}: PurchaseListProps) {
  const [purchases, setPurchases] = useState<SerializedPurchaseListItem[]>(initialPurchases);
  const [totalCount, setTotalCount] = useState<number>(initialTotalCount);
  const [kpis, setKpis] = useState<PurchaseKPIs>(initialKpis);

  // Filters state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [paymentStatus, setPaymentStatus] = useState<string>("ALL");
  const [branchId, setBranchId] = useState<string>("ALL");
  const [supplierId, setSupplierId] = useState<string>("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // reset to page 1 on new search
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const isFirstMount = useRef(true);

  // Re-fetch on filter change
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    let isCancelled = false;
    async function executeFetch() {
      try {
        const offset = (page - 1) * pageSize;
        const res = await listPurchasesAction(
          {
            search: debouncedSearch.trim() || undefined,
            status: status !== "ALL" ? (status as PurchaseStatus) : undefined,
            paymentStatus: paymentStatus !== "ALL" ? (paymentStatus as PurchasePaymentStatus) : undefined,
            branchId: branchId !== "ALL" ? branchId : undefined,
            supplierId: supplierId !== "ALL" ? supplierId : undefined,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            limit: pageSize,
            offset,
          },
          { organizationId }
        );

        if (!isCancelled) {
          setPurchases(res.purchases);
          setTotalCount(res.totalCount);
          setKpis(res.kpis);
          setError(null);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "Failed to load purchase orders.");
        }
      }
    }

    startTransition(() => {
      void executeFetch();
    });

    return () => {
      isCancelled = true;
    };
  }, [debouncedSearch, status, paymentStatus, branchId, supplierId, dateFrom, dateTo, page, pageSize, organizationId, isFirstMount]);

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const getStatusBadge = (st: PurchaseStatus) => {
    switch (st) {
      case PurchaseStatus.DRAFT:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
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
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-400">
            {st}
          </span>
        );
    }
  };

  const getPaymentStatusBadge = (pst: PurchasePaymentStatus) => {
    switch (pst) {
      case PurchasePaymentStatus.UNPAID:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-rose-500/10 text-rose-300 border border-rose-500/20">
            Unpaid
          </span>
        );
      case PurchasePaymentStatus.PARTIAL:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
            Partial
          </span>
        );
      case PurchasePaymentStatus.PAID:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            Paid
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-400">
            {pst}
          </span>
        );
    }
  };

  function formatMoney(amountStr: string) {
    const num = parseFloat(amountStr);
    if (isNaN(num)) return "$0.00";
    return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatDate(dateStr: string) {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  }

  return (
    <div className="space-y-6">
      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
          <span className="text-xs font-medium text-slate-400 block mb-1">Total Orders</span>
          <span className="text-2xl font-bold text-white">{kpis.totalOrders}</span>
        </div>
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
          <span className="text-xs font-medium text-sky-400 block mb-1">Open / In Progress</span>
          <span className="text-2xl font-bold text-white">{kpis.openOrders}</span>
        </div>
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
          <span className="text-xs font-medium text-emerald-400 block mb-1">Completed</span>
          <span className="text-2xl font-bold text-white">{kpis.completedOrders}</span>
        </div>
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
          <span className="text-xs font-medium text-amber-400 block mb-1">Total Outstanding</span>
          <span className="text-2xl font-bold text-amber-300">
            {formatMoney(kpis.totalOutstanding)}
          </span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Search Orders</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="PO number or supplier..."
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-800 focus:border-emerald-500 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
            />
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Order Status</label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-800 focus:border-emerald-500 text-slate-200 focus:outline-none transition-colors"
            >
              <option value="ALL">All Statuses</option>
              <option value={PurchaseStatus.DRAFT}>Draft</option>
              <option value={PurchaseStatus.ORDERED}>Ordered</option>
              <option value={PurchaseStatus.PARTIALLY_RECEIVED}>Partially Received</option>
              <option value={PurchaseStatus.RECEIVED}>Received</option>
              <option value={PurchaseStatus.CANCELLED}>Cancelled</option>
            </select>
          </div>

          {/* Payment Status Filter */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Payment Status</label>
            <select
              value={paymentStatus}
              onChange={(e) => {
                setPaymentStatus(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-800 focus:border-emerald-500 text-slate-200 focus:outline-none transition-colors"
            >
              <option value="ALL">All Payment Statuses</option>
              <option value={PurchasePaymentStatus.UNPAID}>Unpaid</option>
              <option value={PurchasePaymentStatus.PARTIAL}>Partial</option>
              <option value={PurchasePaymentStatus.PAID}>Paid</option>
            </select>
          </div>

          {/* Branch Filter */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Branch</label>
            <select
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-800 focus:border-emerald-500 text-slate-200 focus:outline-none transition-colors"
            >
              <option value="ALL">All Authorized Branches</option>
              {authorizedBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Secondary Filter Line: Supplier & Dates */}
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-1 border-t border-slate-800/60">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Supplier</label>
            <select
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-800 focus:border-emerald-500 text-slate-200 focus:outline-none transition-colors"
            >
              <option value="ALL">All Suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Order Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-800 focus:border-emerald-500 text-slate-200 focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Order Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-800 focus:border-emerald-500 text-slate-200 focus:outline-none transition-colors"
            />
          </div>

          <div className="flex items-end">
            {(search || status !== "ALL" || paymentStatus !== "ALL" || branchId !== "ALL" || supplierId !== "ALL" || dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatus("ALL");
                  setPaymentStatus("ALL");
                  setBranchId("ALL");
                  setSupplierId("ALL");
                  setDateFrom("");
                  setDateTo("");
                  setPage(1);
                }}
                className="w-full px-3 py-1.5 text-xs font-medium rounded-lg text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
          {error}
        </div>
      )}

      {/* Table Container */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden relative">
        {isPending && (
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[1px] z-10 flex items-center justify-center">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-xs shadow-lg">
              <span className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span>Updating orders...</span>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3 font-semibold">PO Number</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Supplier</th>
                <th className="px-4 py-3 font-semibold">Branch</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Payment</th>
                <th className="px-4 py-3 font-semibold text-right">Items</th>
                <th className="px-4 py-3 font-semibold text-right">Total</th>
                <th className="px-4 py-3 font-semibold text-right">Balance Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {purchases.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-400">No purchase orders found</p>
                      <p className="text-xs text-slate-600">
                        {search || status !== "ALL" || paymentStatus !== "ALL" || branchId !== "ALL" || supplierId !== "ALL"
                          ? "Try clearing filters to see more results."
                          : "Orders will appear here once created."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                purchases.map((po) => (
                  <tr
                    key={po.id}
                    className="hover:bg-slate-900/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono font-medium text-emerald-400">
                      {po.purchaseNumber}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatDate(po.orderDate)}
                    </td>
                    <td className="px-4 py-3 font-medium text-white">
                      {po.supplier.name}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      <span className="font-mono text-[11px] text-slate-300 mr-1.5 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                        {po.branch.code}
                      </span>
                      {po.branch.name}
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(po.status)}</td>
                    <td className="px-4 py-3">{getPaymentStatusBadge(po.paymentStatus)}</td>
                    <td className="px-4 py-3 text-right text-slate-400 font-mono">
                      {po.itemCount}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-white font-mono">
                      {formatMoney(po.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium font-mono">
                      {parseFloat(po.balanceDue) > 0 ? (
                        <span className="text-amber-400">{formatMoney(po.balanceDue)}</span>
                      ) : (
                        <span className="text-slate-500">$0.00</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-slate-800 text-xs text-slate-400 gap-3">
          <div className="flex items-center gap-2">
            <span>
              Showing {totalCount === 0 ? 0 : (page - 1) * pageSize + 1} to{" "}
              {Math.min(page * pageSize, totalCount)} of {totalCount} orders
            </span>
            <span className="text-slate-600">|</span>
            <label className="flex items-center gap-1.5">
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-200 focus:outline-none"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page <= 1 || isPending}
              className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 font-medium transition-colors"
            >
              Previous
            </button>
            <span className="px-2 font-mono text-slate-300">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page >= totalPages || isPending}
              className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 font-medium transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
