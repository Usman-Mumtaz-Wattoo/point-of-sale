"use client";

import React, { useState, useEffect, useTransition, useCallback } from "react";
import { getInventoryHistoryAction } from "./actions";
import type {
  AuthorizedBranchDTO,
  SerializedInventoryMovement,
  InventoryHistoryListResult,
  StockMovementTypeValue,
} from "./types";

interface MovementHistoryViewProps {
  branch: AuthorizedBranchDTO;
  orgId: string;
  initialProductId?: string | null;
  initialVariantId?: string | null;
  initialItemName?: string | null;
  onClearItemFilter?: () => void;
}

const ALL_MOVEMENT_TYPES: { value: StockMovementTypeValue | "ALL"; label: string }[] = [
  { value: "ALL", label: "All Movement Types" },
  { value: "OPENING_BALANCE", label: "Opening Balance" },
  { value: "PURCHASE_RECEIPT", label: "Purchase Receipt" },
  { value: "PURCHASE_RETURN", label: "Purchase Return" },
  { value: "SALE", label: "Sale" },
  { value: "SALE_RETURN", label: "Sale Return" },
  { value: "ADJUSTMENT_IN", label: "Adjustment In" },
  { value: "ADJUSTMENT_OUT", label: "Adjustment Out" },
  { value: "DAMAGE", label: "Damage" },
  { value: "WASTE", label: "Waste" },
  { value: "TRANSFER_IN", label: "Transfer In" },
  { value: "TRANSFER_OUT", label: "Transfer Out" },
];

const MOVEMENT_TYPE_LABELS: Record<StockMovementTypeValue, string> = {
  OPENING_BALANCE: "Opening Balance",
  PURCHASE_RECEIPT: "Purchase Receipt",
  PURCHASE_RETURN: "Purchase Return",
  SALE: "Sale",
  SALE_RETURN: "Sale Return",
  ADJUSTMENT_IN: "Adjustment In",
  ADJUSTMENT_OUT: "Adjustment Out",
  DAMAGE: "Damage",
  WASTE: "Waste",
  TRANSFER_IN: "Transfer In",
  TRANSFER_OUT: "Transfer Out",
};

export function MovementHistoryView({
  branch,
  orgId,
  initialProductId,
  initialVariantId,
  initialItemName,
  onClearItemFilter,
}: MovementHistoryViewProps) {
  const [selectedType, setSelectedType] = useState<StockMovementTypeValue | "ALL">("ALL");
  const [historyResult, setHistoryResult] = useState<InventoryHistoryListResult>({
    items: [],
    totalCount: 0,
    page: 1,
    pageSize: 50,
    totalPages: 1,
  });

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadHistory = useCallback(
    (page: number, typeFilter: StockMovementTypeValue | "ALL", pId?: string | null, vId?: string | null) => {
      startTransition(async () => {
        setErrorMessage(null);
        try {
          const res = await getInventoryHistoryAction(
            {
              branchId: branch.id,
              productId: pId || undefined,
              variantId: vId || undefined,
              movementType: typeFilter === "ALL" ? undefined : typeFilter,
              page,
              pageSize: 50,
            },
            orgId
          );

          if (!res.success) {
            setErrorMessage(res.error || "Failed to load movement ledger.");
          } else if (res.data) {
            setHistoryResult(res.data);
          }
        } catch {
          setErrorMessage("An unexpected error occurred while loading movements.");
        }
      });
    },
    [branch.id, orgId]
  );

  // Initial load and filter change trigger
  useEffect(() => {
    loadHistory(currentPage, selectedType, initialProductId, initialVariantId);
  }, [loadHistory, currentPage, selectedType, initialProductId, initialVariantId]);

  const handleTypeChange = (newType: StockMovementTypeValue | "ALL") => {
    setSelectedType(newType);
    setCurrentPage(1);
  };

  const handleClearItem = () => {
    setCurrentPage(1);
    if (onClearItemFilter) {
      onClearItemFilter();
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > historyResult.totalPages || newPage === currentPage) return;
    setCurrentPage(newPage);
  };

  const handleRefresh = () => {
    loadHistory(currentPage, selectedType, initialProductId, initialVariantId);
  };

  return (
    <div className="space-y-4">
      {/* Ledger Header & Filter Toolbar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Filter Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Movement Type Selector */}
          <div className="flex items-center gap-2">
            <label htmlFor="movement-type-select" className="text-xs font-medium text-slate-400">
              Type:
            </label>
            <select
              id="movement-type-select"
              value={selectedType}
              onChange={(e) => handleTypeChange(e.target.value as StockMovementTypeValue | "ALL")}
              disabled={isPending}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
            >
              {ALL_MOVEMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Active Item Filter Chip */}
          {initialItemName && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-950/60 border border-indigo-800/60 text-indigo-300 text-xs">
              <span className="text-slate-400">Item:</span>
              <span className="font-semibold max-w-[200px] truncate" title={initialItemName}>
                {initialItemName}
              </span>
              <button
                type="button"
                onClick={handleClearItem}
                className="ml-1 text-indigo-400 hover:text-white font-bold text-xs"
                title="Clear item filter (Show all items)"
              >
                ✕
              </button>
            </div>
          )}

          {isPending && (
            <div className="flex items-center gap-1.5 text-xs text-indigo-400">
              <span className="animate-spin">⏳</span>
              <span>Loading ledger…</span>
            </div>
          )}
        </div>

        {/* Right: Branch Info & Refresh */}
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            Branch: {branch.name}
          </span>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isPending}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="Refresh Ledger"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex items-center justify-between">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-rose-300 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Movement Ledger Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Product / Item</th>
                <th className="py-3 px-4">Variant</th>
                <th className="py-3 px-4">Movement Type</th>
                <th className="py-3 px-4 text-right">Delta</th>
                <th className="py-3 px-4 text-center">Before &rarr; After</th>
                <th className="py-3 px-4">Reference & Reason</th>
                <th className="py-3 px-4">Performed By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {historyResult.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 space-y-2">
                    <div className="text-3xl">📜</div>
                    <div className="text-sm font-medium text-slate-300">
                      No movement records found
                    </div>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      {initialItemName || selectedType !== "ALL"
                        ? "No inventory movements match the active filter criteria. Try clearing filters."
                        : "Inventory movements are automatically recorded when opening balances, sales, purchases, or adjustments occur."}
                    </p>
                    {(initialItemName || selectedType !== "ALL") && (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedType("ALL");
                            handleClearItem();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
                        >
                          Clear All Filters
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                historyResult.items.map((m: SerializedInventoryMovement) => {
                  const deltaNum = Number(m.quantityDelta);
                  const isPositive = deltaNum > 0;
                  const isNegative = deltaNum < 0;
                  const deltaPrefix = isPositive ? "+" : "";

                  return (
                    <tr key={m.id} className="hover:bg-slate-800/30 transition-colors">
                      {/* Timestamp */}
                      <td className="py-3 px-4 text-slate-300 font-mono whitespace-nowrap">
                        <div>
                          {new Date(m.createdAt).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {new Date(m.createdAt).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </div>
                      </td>

                      {/* Product */}
                      <td className="py-3 px-4 font-medium text-white">
                        <div>{m.product?.name || "—"}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          SKU: {m.product?.sku || "—"}
                        </div>
                      </td>

                      {/* Variant */}
                      <td className="py-3 px-4 text-slate-300">
                        {m.variant ? (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700/60 font-medium">
                            {m.variant.name}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">Standard</span>
                        )}
                      </td>

                      {/* Movement Type */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded font-semibold text-[11px] bg-slate-800 text-slate-200 border border-slate-700">
                          {MOVEMENT_TYPE_LABELS[m.movementType] || m.movementType}
                        </span>
                      </td>

                      {/* Signed Delta */}
                      <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap">
                        <span
                          className={
                            isPositive
                              ? "text-emerald-400"
                              : isNegative
                              ? "text-rose-400"
                              : "text-slate-300"
                          }
                        >
                          {deltaPrefix}
                          {deltaNum.toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 3,
                          })}
                        </span>
                      </td>

                      {/* Before -> After */}
                      <td className="py-3 px-4 text-center font-mono text-slate-300 whitespace-nowrap">
                        <span className="text-slate-400">
                          {Number(m.quantityBefore).toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 3,
                          })}
                        </span>
                        <span className="mx-1.5 text-slate-500">&rarr;</span>
                        <span className="font-semibold text-white">
                          {Number(m.quantityAfter).toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 3,
                          })}
                        </span>
                      </td>

                      {/* Reference & Reason */}
                      <td className="py-3 px-4 text-slate-300">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {m.referenceType && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-950/60 text-indigo-300 border border-indigo-800/50 font-semibold">
                              {m.referenceType}
                            </span>
                          )}
                          {m.referenceId && (
                            <span
                              className="font-mono text-[11px] text-slate-400"
                              title={`Reference ID: ${m.referenceId}`}
                            >
                              #{m.referenceId.slice(0, 8)}…
                            </span>
                          )}
                        </div>
                        {m.reason && (
                          <div className="text-[11px] text-slate-400 italic mt-0.5">
                            {m.reason}
                          </div>
                        )}
                        {m.notes && (
                          <div className="text-[10px] text-slate-500 italic mt-0.5">
                            Note: {m.notes}
                          </div>
                        )}
                      </td>

                      {/* Performed By */}
                      <td className="py-3 px-4 text-slate-400">
                        <div className="font-medium text-slate-300">
                          {m.performedBy?.name || "System"}
                        </div>
                        {m.performedBy?.email && (
                          <div className="text-[11px] text-slate-500">
                            {m.performedBy.email}
                          </div>
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
        {historyResult.totalCount > 0 && (
          <div className="p-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div>
              Showing{" "}
              <span className="font-semibold text-slate-200">
                {(historyResult.page - 1) * historyResult.pageSize + 1}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-slate-200">
                {Math.min(
                  historyResult.page * historyResult.pageSize,
                  historyResult.totalCount
                )}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-slate-200">
                {historyResult.totalCount}
              </span>{" "}
              movements
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1 || isPending}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 font-semibold border border-slate-700 transition-colors"
              >
                &larr; Previous
              </button>
              <span className="text-slate-500">
                Page {historyResult.page} of {historyResult.totalPages}
              </span>
              <button
                type="button"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= historyResult.totalPages || isPending}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 font-semibold border border-slate-700 transition-colors"
              >
                Next &rarr;
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
