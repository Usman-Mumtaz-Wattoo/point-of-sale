"use client";

import React, { useEffect, useState, useTransition, useCallback } from "react";
import { getInventoryHistoryAction } from "./actions";
import { type ModalType } from "./inventory-modals";
import type {
  AuthorizedBranchDTO,
  SerializedInventoryStock,
  SerializedInventoryMovement,
  StockMovementTypeValue,
} from "./types";

interface StockDetailDrawerProps {
  isOpen: boolean;
  item: SerializedInventoryStock | null;
  branch: AuthorizedBranchDTO;
  orgId: string;
  canMutate: boolean;
  onClose: () => void;
  onOpenModal: (type: ModalType, item: SerializedInventoryStock) => void;
  onViewFullHistory: (productId: string, variantId?: string | null, itemName?: string) => void;
}

// Human-readable labels for movement types
const MOVEMENT_TYPE_LABELS: Record<StockMovementTypeValue, string> = {
  OPENING_BALANCE: "Opening Balance",
  PURCHASE_RECEIPT: "Purchase Receipt",
  SALE: "Sale",
  SALE_RETURN: "Sale Return",
  PURCHASE_RETURN: "Purchase Return",
  ADJUSTMENT_IN: "Adjustment In",
  ADJUSTMENT_OUT: "Adjustment Out",
  DAMAGE: "Damage",
  WASTE: "Waste",
  TRANSFER_IN: "Transfer In",
  TRANSFER_OUT: "Transfer Out",
};

export function StockDetailDrawer({
  isOpen,
  item,
  branch,
  orgId,
  canMutate,
  onClose,
  onOpenModal,
  onViewFullHistory,
}: StockDetailDrawerProps) {
  const [movements, setMovements] = useState<SerializedInventoryMovement[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const fetchRecentMovements = useCallback(() => {
    if (!item) return;

    startTransition(async () => {
      try {
        const res = await getInventoryHistoryAction(
          {
            branchId: branch.id,
            productId: item.productId,
            variantId: item.variantId || undefined,
            take: 10,
            skip: 0,
          },
          orgId
        );

        if (!res.success) {
          setHistoryError(res.error || "Failed to load recent movements.");
          setMovements([]);
        } else if (res.data) {
          setHistoryError(null);
          setMovements(res.data.items);
        }
      } catch {
        setHistoryError("An unexpected error occurred while loading movements.");
        setMovements([]);
      }
    });
  }, [item, branch.id, orgId]);

  // Load recent movements when item changes or drawer opens
  useEffect(() => {
    if (isOpen && item) {
      fetchRecentMovements();
    }
  }, [isOpen, item, fetchRecentMovements]);

  // Handle ESC key to close drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  const effectiveSku = item.variant?.sku || item.product.sku;
  const effectiveBarcode = item.variant?.barcode || item.product.barcode;
  const effectiveCostPrice = item.variant?.costPrice || item.product.costPrice;
  const effectiveSellingPrice = item.variant?.sellingPrice || item.product.sellingPrice;
  const unit = item.product.unit || "PCS";

  const itemName = item.variant
    ? `${item.product.name} (${item.variant.name})`
    : item.product.name;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
      className="fixed inset-0 z-40 overflow-hidden"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-300"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-xl bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col text-slate-100 z-50">
          {/* Header */}
          <div className="p-6 border-b border-slate-800 flex items-start justify-between bg-slate-950/50">
            <div className="space-y-1 pr-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {branch.name}
                </span>
                {item.status === "OUT_OF_STOCK" && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    Out of Stock
                  </span>
                )}
                {item.status === "LOW_STOCK" && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                    Low Stock
                  </span>
                )}
                {item.status === "IN_STOCK" && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    In Stock
                  </span>
                )}
              </div>
              <h2 id="drawer-title" className="text-lg font-bold text-white leading-snug">
                {item.product.name}
              </h2>
              {item.variant && (
                <div className="inline-flex items-center gap-1.5 text-xs text-indigo-300 bg-indigo-950/50 border border-indigo-800/50 px-2 py-0.5 rounded">
                  <span className="text-slate-400">Variant:</span>
                  <span className="font-semibold">{item.variant.name}</span>
                </div>
              )}
              <div className="flex items-center gap-3 text-xs text-slate-400 pt-1 font-mono">
                <span>SKU: {effectiveSku || "—"}</span>
                {effectiveBarcode && <span>Barcode: {effectiveBarcode}</span>}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              aria-label="Close drawer"
            >
              ✕
            </button>
          </div>

          {/* Drawer Body Scrollable */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Primary Stock Metric Card */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Current Authoritative Stock
              </div>
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-4xl font-extrabold tracking-tight font-mono ${
                    item.status === "OUT_OF_STOCK"
                      ? "text-rose-400"
                      : item.status === "LOW_STOCK"
                      ? "text-amber-400"
                      : "text-emerald-400"
                  }`}
                >
                  {Number(item.quantity).toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 3,
                  })}
                </span>
                <span className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
                  {unit}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-2 flex items-center gap-1.5">
                <span>Last inventory sync:</span>
                <span className="text-slate-400 font-mono">
                  {new Date(item.updatedAt).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Thresholds & Pricing Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Thresholds Card */}
              <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Reorder Thresholds
                  </span>
                  {canMutate && (
                    <button
                      type="button"
                      onClick={() => onOpenModal("THRESHOLDS", item)}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                    >
                      Edit
                    </button>
                  )}
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Reorder Level:</span>
                    <span className="font-mono font-medium text-slate-200">
                      {item.reorderLevel !== null
                        ? `${Number(item.reorderLevel).toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 3,
                          })} ${unit}`
                        : "None configured"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">Reorder Quantity:</span>
                    <span className="font-mono font-medium text-slate-200">
                      {item.reorderQuantity !== null
                        ? `${Number(item.reorderQuantity).toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 3,
                          })} ${unit}`
                        : "None configured"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Pricing Card */}
              <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 space-y-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Catalog Pricing
                </span>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                    <span className="text-slate-400">Selling Price:</span>
                    <span className="font-mono font-medium text-slate-200">
                      {effectiveSellingPrice !== null && effectiveSellingPrice !== undefined
                        ? `$${Number(effectiveSellingPrice).toFixed(2)}`
                        : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">Cost Price:</span>
                    <span className="font-mono font-medium text-slate-200">
                      {effectiveCostPrice !== null && effectiveCostPrice !== undefined
                        ? `$${Number(effectiveCostPrice).toFixed(2)}`
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Mutation Actions (Authorized Roles Only) */}
            {canMutate && (
              <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 space-y-2">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Inventory Operations
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenModal("INFLOW", item)}
                    className="p-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 font-semibold text-xs flex flex-col items-center justify-center gap-1 transition-colors"
                  >
                    <span className="text-base font-bold">+</span>
                    <span>Add Stock</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenModal("OUTFLOW", item)}
                    className="p-2.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 font-semibold text-xs flex flex-col items-center justify-center gap-1 transition-colors"
                  >
                    <span className="text-base font-bold">-</span>
                    <span>Deduct</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenModal("ADJUST", item)}
                    className="p-2.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 font-semibold text-xs flex flex-col items-center justify-center gap-1 transition-colors"
                  >
                    <span className="text-base">⚖</span>
                    <span>Adjust</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenModal("THRESHOLDS", item)}
                    className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold text-xs flex flex-col items-center justify-center gap-1 transition-colors"
                  >
                    <span className="text-base">⚙</span>
                    <span>Thresholds</span>
                  </button>
                </div>
              </div>
            )}

            {/* Recent Movement Preview */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Recent Movements (Latest 10)
                  </span>
                  {isPending && (
                    <span className="animate-spin text-xs text-indigo-400">⏳</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={fetchRecentMovements}
                  disabled={isPending}
                  className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Refresh
                </button>
              </div>

              {historyError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-xs">
                  {historyError}
                </div>
              )}

              {!isPending && movements.length === 0 && !historyError && (
                <div className="p-6 bg-slate-950/40 border border-slate-800/80 rounded-xl text-center text-xs text-slate-400 space-y-1">
                  <div className="text-xl">📭</div>
                  <div>No inventory movements recorded for this item yet.</div>
                </div>
              )}

              {movements.length > 0 && (
                <div className="divide-y divide-slate-800/70 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40 text-xs">
                  {movements.map((m) => {
                    const deltaNum = Number(m.quantityDelta);
                    const isPositive = deltaNum > 0;
                    const isNegative = deltaNum < 0;
                    const deltaPrefix = isPositive ? "+" : "";

                    return (
                      <div key={m.id} className="p-3.5 hover:bg-slate-800/30 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2 py-0.5 rounded font-semibold text-[11px] bg-slate-800 text-slate-200 border border-slate-700">
                                {MOVEMENT_TYPE_LABELS[m.movementType] || m.movementType}
                              </span>
                              {m.referenceType && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-indigo-950/60 text-indigo-300 border border-indigo-800/50">
                                  {m.referenceType}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
                              <span>
                                {new Date(m.createdAt).toLocaleString(undefined, {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })}
                              </span>
                              <span>•</span>
                              <span>
                                By: {m.performedBy?.name || m.performedBy?.email || "System"}
                              </span>
                              {m.referenceId && (
                                <>
                                  <span>•</span>
                                  <span className="font-mono text-slate-500">
                                    Ref: {m.referenceId.slice(0, 8)}…
                                  </span>
                                </>
                              )}
                            </div>
                            {m.reason && (
                              <div className="text-[11px] text-slate-300 italic">
                                Reason: &quot;{m.reason}&quot;
                              </div>
                            )}
                          </div>

                          <div className="text-right space-y-0.5 shrink-0">
                            <div
                              className={`font-mono font-bold text-sm ${
                                isPositive
                                  ? "text-emerald-400"
                                  : isNegative
                                  ? "text-rose-400"
                                  : "text-slate-300"
                              }`}
                            >
                              {deltaPrefix}
                              {deltaNum.toLocaleString(undefined, {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 3,
                              })}
                            </div>
                            <div className="font-mono text-[11px] text-slate-400">
                              {Number(m.quantityBefore).toLocaleString(undefined, {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 3,
                              })}{" "}
                              &rarr;{" "}
                              {Number(m.quantityAfter).toLocaleString(undefined, {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 3,
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* View Full Ledger Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onViewFullHistory(item.productId, item.variantId, itemName);
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <span>View Full Movement Ledger for this item</span>
                  <span>&rarr;</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
