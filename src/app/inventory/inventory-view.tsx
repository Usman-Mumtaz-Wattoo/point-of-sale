"use client";

import React, { useState, useTransition, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getInventorySummaryAction, getBranchInventoryAction } from "./actions";
import type {
  AuthorizedBranchDTO,
  InventorySummaryDTO,
  InventoryStockListResult,
  SerializedInventoryStock,
} from "./types";

interface InventoryViewProps {
  initialBranches: AuthorizedBranchDTO[];
  initialSelectedBranchId: string;
  initialSummary: InventorySummaryDTO;
  initialInventory: InventoryStockListResult;
  orgId: string;
  userRole: string;
  canMutate: boolean;
}

export function InventoryView({
  initialBranches,
  initialSelectedBranchId,
  initialSummary,
  initialInventory,
  orgId,
  userRole,
  canMutate,
}: InventoryViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // State
  const [selectedBranchId, setSelectedBranchId] = useState<string>(initialSelectedBranchId);
  const [summary, setSummary] = useState<InventorySummaryDTO>(initialSummary);
  const [inventory, setInventory] = useState<InventoryStockListResult>(initialInventory);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeSearch, setActiveSearch] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(initialInventory.page);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const selectedBranch = initialBranches.find((b) => b.id === selectedBranchId) || initialBranches[0];

  // Fetch data function
  const loadData = useCallback(
    (branchId: string, page = 1, search = "") => {
      startTransition(async () => {
        setErrorMessage(null);

        // Fetch summary and branch inventory in parallel
        const [summaryRes, inventoryRes] = await Promise.all([
          getInventorySummaryAction(branchId, orgId),
          getBranchInventoryAction(
            {
              branchId,
              search: search || undefined,
              page,
              pageSize: 50,
            },
            orgId
          ),
        ]);

        if (!summaryRes.success) {
          setErrorMessage(summaryRes.error || "Failed to load inventory summary.");
          return;
        }

        if (!inventoryRes.success) {
          setErrorMessage(inventoryRes.error || "Failed to load branch inventory.");
          return;
        }

        if (summaryRes.data) setSummary(summaryRes.data);
        if (inventoryRes.data) {
          setInventory(inventoryRes.data);
          setCurrentPage(inventoryRes.data.page);
        }
        setLastRefreshed(new Date());
      });
    },
    [orgId]
  );

  // Handle branch switch
  const handleBranchChange = (newBranchId: string) => {
    setSelectedBranchId(newBranchId);
    setCurrentPage(1);
    setSearchQuery("");
    setActiveSearch("");

    // Update URL query param cleanly without full reload
    const currentParams = new URLSearchParams(searchParams?.toString() || "");
    currentParams.set("branch", newBranchId);
    router.replace(`?${currentParams.toString()}`);

    loadData(newBranchId, 1, "");
  };

  // Handle Search submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(searchQuery.trim());
    setCurrentPage(1);
    loadData(selectedBranchId, 1, searchQuery.trim());
  };

  // Handle Clear Search
  const handleClearSearch = () => {
    setSearchQuery("");
    setActiveSearch("");
    setCurrentPage(1);
    loadData(selectedBranchId, 1, "");
  };

  // Handle Refresh
  const handleRefresh = () => {
    loadData(selectedBranchId, currentPage, activeSearch);
  };

  // Handle Pagination
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > inventory.totalPages || newPage === currentPage) return;
    loadData(selectedBranchId, newPage, activeSearch);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Context Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-lg">
            📦
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                ROLE: {userRole}
              </span>
              {canMutate ? (
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  MUTATION PERMITTED
                </span>
              ) : (
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  READ ONLY
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Active branch tracking, reorder levels, and real-time stock balances.
            </p>
          </div>
        </div>

        {/* Branch Selector & Refresh Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {initialBranches.length > 1 ? (
            <div className="flex items-center gap-2">
              <label htmlFor="branch-select" className="text-xs font-medium text-slate-400">
                Branch:
              </label>
              <select
                id="branch-select"
                value={selectedBranchId}
                onChange={(e) => handleBranchChange(e.target.value)}
                disabled={isPending}
                className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-colors"
              >
                {initialBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name} ({branch.code})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
              <span className="text-slate-400">Branch:</span>
              <span className="font-semibold text-white">
                {selectedBranch?.name} ({selectedBranch?.code})
              </span>
            </div>
          )}

          <button
            id="refresh-inventory-btn"
            onClick={handleRefresh}
            disabled={isPending}
            title="Refresh inventory counts"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors disabled:opacity-50"
          >
            <span className={isPending ? "animate-spin" : ""}>🔄</span>
            <span>{isPending ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-xs text-rose-400 hover:text-rose-200 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Tracked */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
            <span>Total Tracked</span>
            <span className="p-1 rounded bg-slate-800 text-slate-300">📊</span>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {summary.totalTracked.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-500 mt-1">Distinct stock records</span>
        </div>

        {/* In Stock */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-400 text-xs font-medium mb-2">
            <span>In Stock</span>
            <span className="p-1 rounded bg-emerald-500/10 border border-emerald-500/20">✅</span>
          </div>
          <div className="text-2xl font-bold text-emerald-400 tracking-tight">
            {summary.inStockCount.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-500 mt-1">Healthy balance</span>
        </div>

        {/* Low Stock */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-400 text-xs font-medium mb-2">
            <span>Low Stock</span>
            <span className="p-1 rounded bg-amber-500/10 border border-amber-500/20">⚠️</span>
          </div>
          <div className="text-2xl font-bold text-amber-400 tracking-tight">
            {summary.lowStockCount.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-500 mt-1">At or below reorder level</span>
        </div>

        {/* Out of Stock */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-rose-400 text-xs font-medium mb-2">
            <span>Out of Stock</span>
            <span className="p-1 rounded bg-rose-500/10 border border-rose-500/20">⛔</span>
          </div>
          <div className="text-2xl font-bold text-rose-400 tracking-tight">
            {summary.outOfStockCount.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-500 mt-1">Zero or depleted balance</span>
        </div>
      </div>

      {/* Main Stock Table Container */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full sm:w-80">
            <div className="relative w-full">
              <input
                id="inventory-search-input"
                type="text"
                placeholder="Search Product / Variant / SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
              <span className="absolute left-2.5 top-2 text-slate-500 text-xs">🔍</span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-200 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              id="inventory-search-btn"
              type="submit"
              disabled={isPending}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
            >
              Search
            </button>
          </form>

          {/* Sync indicator */}
          <div className="text-[11px] text-slate-500 flex items-center gap-2">
            {activeSearch && (
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                Filter: &quot;{activeSearch}&quot;
              </span>
            )}
            <span>Last updated: {lastRefreshed.toLocaleTimeString()}</span>
          </div>
        </div>

        {/* Stock Items Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Product / Item</th>
                <th className="py-3 px-4">Variant</th>
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4 text-right">Quantity</th>
                <th className="py-3 px-4">Unit</th>
                <th className="py-3 px-4 text-right">Reorder Level</th>
                <th className="py-3 px-4 text-right">Reorder Qty</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {inventory.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 space-y-2">
                    <div className="text-3xl">📭</div>
                    <div className="text-sm font-medium text-slate-300">
                      {activeSearch ? "No matching inventory records found" : "No inventory records in this branch"}
                    </div>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      {activeSearch
                        ? `No items found matching "${activeSearch}". Try adjusting your search term.`
                        : "Stock records will appear here as opening balances are recorded or purchase receipts are posted."}
                    </p>
                  </td>
                </tr>
              ) : (
                inventory.items.map((item: SerializedInventoryStock) => {
                  const effectiveSku = item.variant?.sku || item.product.sku;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-800/30 transition-colors group"
                    >
                      <td className="py-3 px-4 font-medium text-white">
                        <div className="flex flex-col">
                          <span>{item.product.name}</span>
                          {!item.product.isActive && (
                            <span className="text-[10px] text-rose-400 font-normal">
                              Inactive in Catalog
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-300">
                        {item.variant ? (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700/60">
                            {item.variant.name}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">Standard</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">
                        {effectiveSku || "—"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold">
                        <span
                          className={
                            item.status === "OUT_OF_STOCK"
                              ? "text-rose-400"
                              : item.status === "LOW_STOCK"
                              ? "text-amber-400"
                              : "text-emerald-400"
                          }
                        >
                          {Number(item.quantity).toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 3,
                          })}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 uppercase">
                        {item.product.unit || "PCS"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-300">
                        {item.reorderLevel !== null
                          ? Number(item.reorderLevel).toLocaleString(undefined, {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 3,
                            })
                          : "—"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-300">
                        {item.reorderQuantity !== null
                          ? Number(item.reorderQuantity).toLocaleString(undefined, {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 3,
                            })
                          : "—"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.status === "OUT_OF_STOCK" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            Out of Stock
                          </span>
                        )}
                        {item.status === "LOW_STOCK" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                            Low Stock
                          </span>
                        )}
                        {item.status === "IN_STOCK" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            In Stock
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {inventory.totalCount > 0 && (
          <div className="p-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div>
              Showing{" "}
              <span className="font-semibold text-slate-200">
                {(inventory.page - 1) * inventory.pageSize + 1}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-slate-200">
                {Math.min(inventory.page * inventory.pageSize, inventory.totalCount)}
              </span>{" "}
              of <span className="font-semibold text-slate-200">{inventory.totalCount}</span> items
            </div>

            <div className="flex items-center gap-2">
              <button
                id="pagination-prev-btn"
                onClick={() => handlePageChange(inventory.page - 1)}
                disabled={inventory.page <= 1 || isPending}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              >
                &larr; Previous
              </button>
              <span className="px-2 py-1 text-slate-300 font-mono">
                Page {inventory.page} / {inventory.totalPages}
              </span>
              <button
                id="pagination-next-btn"
                onClick={() => handlePageChange(inventory.page + 1)}
                disabled={inventory.page >= inventory.totalPages || isPending}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-medium"
              >
                Next &rarr;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Footer */}
      <div className="flex items-center justify-between pt-2">
        <Link
          href="/dashboard"
          className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
        >
          &larr; Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
