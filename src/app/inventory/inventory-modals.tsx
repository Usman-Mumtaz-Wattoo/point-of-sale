"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  recordOpeningBalanceAction,
  recordStockInflowAction,
  recordStockOutflowAction,
  adjustStockAction,
  updateStockThresholdsAction,
  searchCatalogItemsAction,
} from "./actions";
import type {
  AuthorizedBranchDTO,
  SerializedInventoryStock,
  SelectableCatalogItem,
  SerializedStockMutationResult,
  SerializedThresholdResult,
} from "./types";

export type ModalType = "OPENING_BALANCE" | "INFLOW" | "OUTFLOW" | "ADJUST" | "THRESHOLDS" | null;

export type ModalSuccessHandler = (
  result: SerializedStockMutationResult | SerializedThresholdResult | null,
  message: string
) => void;

interface InventoryModalsProps {
  modalType: ModalType;
  selectedBranch: AuthorizedBranchDTO;
  orgId: string;
  targetStockItem?: SerializedInventoryStock | null;
  onClose: () => void;
  onSuccess: ModalSuccessHandler;
}

export function InventoryModals({
  modalType,
  selectedBranch,
  orgId,
  targetStockItem,
  onClose,
  onSuccess,
}: InventoryModalsProps) {
  if (!modalType) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100 my-8">
        {modalType === "OPENING_BALANCE" && (
          <OpeningBalanceModalContent
            branch={selectedBranch}
            orgId={orgId}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        )}
        {modalType === "INFLOW" && (
          <InflowModalContent
            branch={selectedBranch}
            orgId={orgId}
            targetItem={targetStockItem}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        )}
        {modalType === "OUTFLOW" && (
          <OutflowModalContent
            branch={selectedBranch}
            orgId={orgId}
            targetItem={targetStockItem}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        )}
        {modalType === "ADJUST" && (
          <AdjustStockModalContent
            branch={selectedBranch}
            orgId={orgId}
            targetItem={targetStockItem}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        )}
        {modalType === "THRESHOLDS" && targetStockItem && (
          <ThresholdsModalContent
            branch={selectedBranch}
            orgId={orgId}
            targetItem={targetStockItem}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ITEM SELECTOR COMPONENT
// ============================================================================

interface CatalogItemPickerProps {
  branchId: string;
  orgId: string;
  onSelect: (item: SelectableCatalogItem | null) => void;
  selectedItem: SelectableCatalogItem | null;
}

function CatalogItemPicker({ branchId, orgId, onSelect, selectedItem }: CatalogItemPickerProps) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SelectableCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setIsLoading(true);
      const res = await searchCatalogItemsAction(branchId, query, orgId);
      if (active) {
        if (res.success && res.data) {
          setItems(res.data);
        }
        setIsLoading(false);
        setHasSearched(true);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [branchId, query, orgId]);

  if (selectedItem) {
    return (
      <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-white">
            {selectedItem.productName}
            {selectedItem.variantName && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                {selectedItem.variantName}
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            SKU: {selectedItem.sku || "—"} | Unit: {selectedItem.unit}
          </div>
          {selectedItem.currentStockInBranch !== null && (
            <div className="text-[11px] text-amber-400 mt-0.5">
              Current stock: {selectedItem.currentStockInBranch} {selectedItem.unit}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 transition-colors"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          type="text"
          placeholder="Search product name or SKU..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        {isLoading && (
          <span className="absolute right-3 top-2.5 text-xs text-slate-400 animate-spin">
            🔄
          </span>
        )}
      </div>

      <div className="max-h-48 overflow-y-auto divide-y divide-slate-800/80 border border-slate-800 rounded-lg bg-slate-950/60">
        {items.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500">
            {hasSearched ? "No matching products found." : "Type to search catalog..."}
          </div>
        ) : (
          items.map((item) => (
            <button
              key={`${item.productId}-${item.variantId || "base"}`}
              type="button"
              onClick={() => onSelect(item)}
              className="w-full text-left p-2.5 hover:bg-slate-800/60 transition-colors flex items-center justify-between text-xs"
            >
              <div>
                <span className="font-medium text-white">{item.productName}</span>
                {item.variantName && (
                  <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                    {item.variantName}
                  </span>
                )}
                <div className="text-[10px] text-slate-400 font-mono">SKU: {item.sku}</div>
              </div>
              <div className="text-right">
                {item.currentStockInBranch !== null ? (
                  <span className="text-[10px] text-amber-400">
                    Stock: {item.currentStockInBranch}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500 italic">Not initialized</span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 1. OPENING BALANCE MODAL
// ============================================================================

function OpeningBalanceModalContent({
  branch,
  orgId,
  onClose,
  onSuccess,
}: {
  branch: AuthorizedBranchDTO;
  orgId: string;
  onClose: () => void;
  onSuccess: ModalSuccessHandler;
}) {
  const [selectedItem, setSelectedItem] = useState<SelectableCatalogItem | null>(null);
  const [quantity, setQuantity] = useState("");
  const [reorderLevel, setReorderLevel] = useState("");
  const [reorderQuantity, setReorderQuantity] = useState("");
  const [reason, setReason] = useState("Initial Stock Balance");
  const [notes, setNotes] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isAlreadyInitialized = selectedItem?.currentStockInBranch !== null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) {
      setError("Please select a product or variant.");
      return;
    }
    if (isAlreadyInitialized) {
      setError(
        "Opening balance already exists for this item. Use stock adjustment for subsequent changes."
      );
      return;
    }
    const num = parseFloat(quantity);
    if (isNaN(num) || num <= 0) {
      setError("Quantity must be strictly greater than 0.");
      return;
    }

    if (!isConfirming) {
      setError(null);
      setIsConfirming(true);
      return;
    }

    startTransition(async () => {
      setError(null);
      const res = await recordOpeningBalanceAction(
        {
          branchId: branch.id,
          productId: selectedItem.productId,
          variantId: selectedItem.variantId,
          quantity: quantity.trim(),
          reorderLevel: reorderLevel.trim() || null,
          reorderQuantity: reorderQuantity.trim() || null,
          reason: reason.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        orgId
      );

      if (!res.success) {
        setError(res.error || "Failed to record opening balance.");
        setIsConfirming(false);
        return;
      }

      onSuccess(res.data ?? null, `Opening balance recorded for ${selectedItem.productName}.`);
      onClose();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-base font-bold text-white">Record Opening Balance</h2>
          <p className="text-xs text-slate-400">Branch: {branch.name} ({branch.code})</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-white text-lg p-1"
        >
          ✕
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-lg text-xs">
          {error}
        </div>
      )}

      {/* Confirmation Step */}
      {isConfirming ? (
        <div className="space-y-3 py-2">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-2 text-xs">
            <div className="font-semibold text-emerald-400 uppercase tracking-wider text-[10px]">
              Confirm Opening Balance
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Item:</span>
              <span className="font-medium text-white">
                {selectedItem?.productName} {selectedItem?.variantName ? `(${selectedItem.variantName})` : ""}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Branch:</span>
              <span className="font-medium text-white">{branch.name}</span>
            </div>
            <div className="flex justify-between text-slate-300 font-mono">
              <span>Initial Quantity:</span>
              <span className="font-bold text-emerald-400 text-sm">
                {quantity} {selectedItem?.unit}
              </span>
            </div>
            {reorderLevel && (
              <div className="flex justify-between text-slate-300 font-mono text-[11px]">
                <span>Reorder Level:</span>
                <span>{reorderLevel}</span>
              </div>
            )}
            {reorderQuantity && (
              <div className="flex justify-between text-slate-300 font-mono text-[11px]">
                <span>Reorder Qty:</span>
                <span>{reorderQuantity}</span>
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-400">
            Note: Opening balance can only be established once per item per branch.
          </p>
        </div>
      ) : (
        /* Form Step */
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Select Product / Variant *
            </label>
            <CatalogItemPicker
              branchId={branch.id}
              orgId={orgId}
              onSelect={setSelectedItem}
              selectedItem={selectedItem}
            />
          </div>

          {isAlreadyInitialized && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-lg text-xs">
              ⚠️ Opening balance already exists for this item in this branch (Current stock:{" "}
              {selectedItem?.currentStockInBranch}). Use stock adjustment for subsequent changes.
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Initial Quantity * (e.g. 50 or 12.500)
            </label>
            <input
              type="text"
              placeholder="0.000"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={isAlreadyInitialized}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Reorder Level (optional)
              </label>
              <input
                type="text"
                placeholder="e.g. 10.000"
                value={reorderLevel}
                onChange={(e) => setReorderLevel(e.target.value)}
                disabled={isAlreadyInitialized}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Reorder Quantity (optional)
              </label>
              <input
                type="text"
                placeholder="e.g. 20.000"
                value={reorderQuantity}
                onChange={(e) => setReorderQuantity(e.target.value)}
                disabled={isAlreadyInitialized}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Reason / Reference
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isAlreadyInitialized}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Notes (optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isAlreadyInitialized}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
        {isConfirming ? (
          <>
            <button
              type="button"
              onClick={() => setIsConfirming(false)}
              disabled={isPending}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-lg shadow-emerald-950/40"
            >
              {isPending && <span className="animate-spin">🔄</span>}
              <span>{isPending ? "Confirming..." : "Confirm Opening Balance"}</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedItem || isAlreadyInitialized}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Review Details &rarr;
            </button>
          </>
        )}
      </div>
    </form>
  );
}

// ============================================================================
// 2. STOCK INFLOW MODAL
// ============================================================================

function InflowModalContent({
  branch,
  orgId,
  targetItem,
  onClose,
  onSuccess,
}: {
  branch: AuthorizedBranchDTO;
  orgId: string;
  targetItem?: SerializedInventoryStock | null;
  onClose: () => void;
  onSuccess: ModalSuccessHandler;
}) {
  const [selectedItem, setSelectedItem] = useState<SelectableCatalogItem | null>(
    targetItem
      ? {
          productId: targetItem.productId,
          variantId: targetItem.variantId,
          productName: targetItem.product.name,
          variantName: targetItem.variant?.name || null,
          sku: targetItem.variant?.sku || targetItem.product.sku,
          isVariable: !!targetItem.variantId,
          unit: targetItem.product.unit,
          currentStockInBranch: targetItem.quantity,
        }
      : null
  );

  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("Manual stock addition");
  const [notes, setNotes] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) {
      setError("Please select a product or variant.");
      return;
    }
    const num = parseFloat(quantity);
    if (isNaN(num) || num <= 0) {
      setError("Quantity must be strictly greater than 0.");
      return;
    }

    if (!isConfirming) {
      setError(null);
      setIsConfirming(true);
      return;
    }

    startTransition(async () => {
      setError(null);
      const res = await recordStockInflowAction(
        {
          branchId: branch.id,
          productId: selectedItem.productId,
          variantId: selectedItem.variantId,
          quantity: quantity.trim(),
          movementType: "ADJUSTMENT_IN",
          reason: reason.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        orgId
      );

      if (!res.success) {
        setError(res.error || "Failed to record stock inflow.");
        setIsConfirming(false);
        return;
      }

      onSuccess(res.data ?? null, `Added ${quantity} ${selectedItem.unit} to stock.`);
      onClose();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-base font-bold text-white">Add Stock (Inflow)</h2>
          <p className="text-xs text-slate-400">Branch: {branch.name} ({branch.code})</p>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1">
          ✕
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-lg text-xs">
          {error}
        </div>
      )}

      {isConfirming ? (
        <div className="space-y-3 py-2">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-2 text-xs">
            <div className="font-semibold text-emerald-400 uppercase tracking-wider text-[10px]">
              Confirm Stock Inflow
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Item:</span>
              <span className="font-medium text-white">
                {selectedItem?.productName} {selectedItem?.variantName ? `(${selectedItem.variantName})` : ""}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Movement Type:</span>
              <span className="font-semibold text-emerald-300">ADJUSTMENT_IN (Manual Addition)</span>
            </div>
            <div className="flex justify-between text-slate-300 font-mono">
              <span>Inflow Quantity:</span>
              <span className="font-bold text-emerald-400 text-sm">
                +{quantity} {selectedItem?.unit}
              </span>
            </div>
            {selectedItem?.currentStockInBranch && (
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Snapshot Current Stock:</span>
                <span>{selectedItem.currentStockInBranch} {selectedItem.unit}</span>
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-400">
            Note: Displayed system stock is an informational snapshot. The backend will calculate the final transactional stock atomically.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Selected Item *
            </label>
            {targetItem ? (
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-xs">
                <span className="font-semibold text-white">{targetItem.product.name}</span>
                {targetItem.variant && (
                  <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                    {targetItem.variant.name}
                  </span>
                )}
                <div className="text-[11px] text-slate-400 mt-1">
                  SKU: {targetItem.variant?.sku || targetItem.product.sku} | Snapshot Stock:{" "}
                  <strong className="text-white">{targetItem.quantity} {targetItem.product.unit}</strong>
                </div>
              </div>
            ) : (
              <CatalogItemPicker
                branchId={branch.id}
                orgId={orgId}
                onSelect={setSelectedItem}
                selectedItem={selectedItem}
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Quantity to Add * (3 decimal places supported)
            </label>
            <input
              type="text"
              placeholder="e.g. 10.000"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Reason / Note</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Additional Notes (optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
        {isConfirming ? (
          <>
            <button
              type="button"
              onClick={() => setIsConfirming(false)}
              disabled={isPending}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-lg shadow-emerald-950/40"
            >
              {isPending && <span className="animate-spin">🔄</span>}
              <span>{isPending ? "Adding..." : "Confirm Stock Addition"}</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedItem}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Review Addition &rarr;
            </button>
          </>
        )}
      </div>
    </form>
  );
}

// ============================================================================
// 3. STOCK OUTFLOW MODAL
// ============================================================================

function OutflowModalContent({
  branch,
  orgId,
  targetItem,
  onClose,
  onSuccess,
}: {
  branch: AuthorizedBranchDTO;
  orgId: string;
  targetItem?: SerializedInventoryStock | null;
  onClose: () => void;
  onSuccess: ModalSuccessHandler;
}) {
  const [selectedItem, setSelectedItem] = useState<SelectableCatalogItem | null>(
    targetItem
      ? {
          productId: targetItem.productId,
          variantId: targetItem.variantId,
          productName: targetItem.product.name,
          variantName: targetItem.variant?.name || null,
          sku: targetItem.variant?.sku || targetItem.product.sku,
          isVariable: !!targetItem.variantId,
          unit: targetItem.product.unit,
          currentStockInBranch: targetItem.quantity,
        }
      : null
  );

  const [quantity, setQuantity] = useState("");
  const [movementType, setMovementType] = useState<"ADJUSTMENT_OUT" | "DAMAGE" | "WASTE">("DAMAGE");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) {
      setError("Please select a product or variant.");
      return;
    }
    const num = parseFloat(quantity);
    if (isNaN(num) || num <= 0) {
      setError("Quantity must be strictly greater than 0.");
      return;
    }

    if (!isConfirming) {
      setError(null);
      setIsConfirming(true);
      return;
    }

    startTransition(async () => {
      setError(null);
      const res = await recordStockOutflowAction(
        {
          branchId: branch.id,
          productId: selectedItem.productId,
          variantId: selectedItem.variantId,
          quantity: quantity.trim(),
          movementType,
          reason: reason.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        orgId
      );

      if (!res.success) {
        setError(res.error || "Failed to record stock deduction.");
        setIsConfirming(false);
        return;
      }

      onSuccess(res.data ?? null, `Deducted ${quantity} ${selectedItem.unit} from stock (${movementType}).`);
      onClose();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-base font-bold text-white">Issue / Deduct Stock</h2>
          <p className="text-xs text-slate-400">Branch: {branch.name} ({branch.code})</p>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1">
          ✕
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-lg text-xs">
          {error}
        </div>
      )}

      {isConfirming ? (
        <div className="space-y-3 py-2">
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-2 text-xs">
            <div className="font-semibold text-rose-400 uppercase tracking-wider text-[10px]">
              Confirm Stock Deduction
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Item:</span>
              <span className="font-medium text-white">
                {selectedItem?.productName} {selectedItem?.variantName ? `(${selectedItem.variantName})` : ""}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Reason Type:</span>
              <span className="font-semibold text-rose-300">{movementType}</span>
            </div>
            <div className="flex justify-between text-slate-300 font-mono">
              <span>Quantity to Deduct:</span>
              <span className="font-bold text-rose-400 text-sm">
                -{quantity} {selectedItem?.unit}
              </span>
            </div>
            {selectedItem?.currentStockInBranch && (
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Snapshot Current Stock:</span>
                <span>{selectedItem.currentStockInBranch} {selectedItem.unit}</span>
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-400">
            Note: Server will verify transactional stock balance. Deductions cannot reduce stock below zero.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Selected Item *
            </label>
            {targetItem ? (
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-xs">
                <span className="font-semibold text-white">{targetItem.product.name}</span>
                {targetItem.variant && (
                  <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                    {targetItem.variant.name}
                  </span>
                )}
                <div className="text-[11px] text-slate-400 mt-1">
                  SKU: {targetItem.variant?.sku || targetItem.product.sku} | Snapshot Stock:{" "}
                  <strong className="text-white">{targetItem.quantity} {targetItem.product.unit}</strong>
                </div>
              </div>
            ) : (
              <CatalogItemPicker
                branchId={branch.id}
                orgId={orgId}
                onSelect={setSelectedItem}
                selectedItem={selectedItem}
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Deduction Reason Type *
            </label>
            <select
              value={movementType}
              onChange={(e) => setMovementType(e.target.value as "ADJUSTMENT_OUT" | "DAMAGE" | "WASTE")}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <option value="DAMAGE">DAMAGE — Damaged goods / Broken packaging</option>
              <option value="WASTE">WASTE — Expired / Perished items</option>
              <option value="ADJUSTMENT_OUT">ADJUSTMENT_OUT — Stock correction / Shrinkage</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Quantity to Deduct *
            </label>
            <input
              type="text"
              placeholder="e.g. 5.000"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Specific Reason / Justification
            </label>
            <input
              type="text"
              placeholder="e.g. Broken in storage transit"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Additional Notes (optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
        {isConfirming ? (
          <>
            <button
              type="button"
              onClick={() => setIsConfirming(false)}
              disabled={isPending}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-lg shadow-rose-950/40"
            >
              {isPending && <span className="animate-spin">🔄</span>}
              <span>{isPending ? "Deducting..." : "Confirm Deduction"}</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedItem}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Review Deduction &rarr;
            </button>
          </>
        )}
      </div>
    </form>
  );
}

// ============================================================================
// 4. STOCK ADJUSTMENT / PHYSICAL COUNT MODAL
// ============================================================================

function AdjustStockModalContent({
  branch,
  orgId,
  targetItem,
  onClose,
  onSuccess,
}: {
  branch: AuthorizedBranchDTO;
  orgId: string;
  targetItem?: SerializedInventoryStock | null;
  onClose: () => void;
  onSuccess: ModalSuccessHandler;
}) {
  const [selectedItem, setSelectedItem] = useState<SelectableCatalogItem | null>(
    targetItem
      ? {
          productId: targetItem.productId,
          variantId: targetItem.variantId,
          productName: targetItem.product.name,
          variantName: targetItem.variant?.name || null,
          sku: targetItem.variant?.sku || targetItem.product.sku,
          isVariable: !!targetItem.variantId,
          unit: targetItem.product.unit,
          currentStockInBranch: targetItem.quantity,
        }
      : null
  );

  const [countedQuantity, setCountedQuantity] = useState("");
  const [reason, setReason] = useState("Physical Stocktake Reconciliation");
  const [notes, setNotes] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentSystemQty = selectedItem?.currentStockInBranch
    ? parseFloat(selectedItem.currentStockInBranch)
    : 0;

  const countedNum = countedQuantity.trim() !== "" ? parseFloat(countedQuantity) : NaN;
  const difference = !isNaN(countedNum) ? countedNum - currentSystemQty : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) {
      setError("Please select a product or variant.");
      return;
    }
    if (isNaN(countedNum) || countedNum < 0) {
      setError("Counted quantity must be greater than or equal to 0.");
      return;
    }
    if (difference === 0) {
      setError("Counted quantity is identical to current stock. Adjustment delta cannot be zero.");
      return;
    }
    if (!reason.trim() || reason.trim().length < 2) {
      setError("Adjustment reason is required (minimum 2 characters).");
      return;
    }

    if (!isConfirming) {
      setError(null);
      setIsConfirming(true);
      return;
    }

    startTransition(async () => {
      setError(null);
      const res = await adjustStockAction(
        {
          branchId: branch.id,
          productId: selectedItem.productId,
          variantId: selectedItem.variantId,
          newQuantity: countedQuantity.trim(),
          reason: reason.trim(),
          notes: notes.trim() || undefined,
        },
        orgId
      );

      if (!res.success) {
        setError(res.error || "Failed to adjust stock.");
        setIsConfirming(false);
        return;
      }

      onSuccess(res.data ?? null, `Stock reconciled to ${countedQuantity} ${selectedItem.unit}.`);
      onClose();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-base font-bold text-white">Physical Count / Stocktake</h2>
          <p className="text-xs text-slate-400">Branch: {branch.name} ({branch.code})</p>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1">
          ✕
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-lg text-xs">
          {error}
        </div>
      )}

      {isConfirming ? (
        <div className="space-y-3 py-2">
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl space-y-2 text-xs">
            <div className="font-semibold text-indigo-400 uppercase tracking-wider text-[10px]">
              Confirm Stocktake Reconciliation
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Item:</span>
              <span className="font-medium text-white">
                {selectedItem?.productName} {selectedItem?.variantName ? `(${selectedItem.variantName})` : ""}
              </span>
            </div>
            <div className="flex justify-between text-slate-300 font-mono">
              <span>System Balance:</span>
              <span>{currentSystemQty.toFixed(3)} {selectedItem?.unit}</span>
            </div>
            <div className="flex justify-between text-slate-300 font-mono">
              <span>Target Counted:</span>
              <span className="font-bold text-white text-sm">
                {countedNum.toFixed(3)} {selectedItem?.unit}
              </span>
            </div>
            <div className="flex justify-between text-slate-300 font-mono">
              <span>Calculated Difference:</span>
              <span
                className={
                  (difference || 0) > 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"
                }
              >
                {(difference || 0) > 0 ? `+${(difference || 0).toFixed(3)}` : (difference || 0).toFixed(3)}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400">
            The backend will atomically determine whether to create an ADJUSTMENT_IN or ADJUSTMENT_OUT movement based on the transactional balance at commit time.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Target Item *
            </label>
            {targetItem ? (
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-xs">
                <span className="font-semibold text-white">{targetItem.product.name}</span>
                {targetItem.variant && (
                  <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                    {targetItem.variant.name}
                  </span>
                )}
                <div className="text-[11px] text-slate-400 mt-1">
                  SKU: {targetItem.variant?.sku || targetItem.product.sku} | System Balance:{" "}
                  <strong className="text-white font-mono">{targetItem.quantity} {targetItem.product.unit}</strong>
                </div>
              </div>
            ) : (
              <CatalogItemPicker
                branchId={branch.id}
                orgId={orgId}
                onSelect={setSelectedItem}
                selectedItem={selectedItem}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
            <div>
              <span className="text-[11px] text-slate-400 block mb-1">Current System Balance:</span>
              <span className="font-mono text-sm font-semibold text-slate-200">
                {currentSystemQty.toFixed(3)} {selectedItem?.unit || "PCS"}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block mb-1">Calculated Difference:</span>
              {difference !== null ? (
                <span
                  className={`font-mono text-sm font-bold ${
                    difference > 0 ? "text-emerald-400" : difference < 0 ? "text-rose-400" : "text-slate-400"
                  }`}
                >
                  {difference > 0 ? `+${difference.toFixed(3)}` : difference.toFixed(3)}
                </span>
              ) : (
                <span className="text-xs text-slate-500 italic">—</span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Actual Counted Physical Quantity *
            </label>
            <input
              type="text"
              placeholder="e.g. 12.000"
              value={countedQuantity}
              onChange={(e) => setCountedQuantity(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Reconciliation Reason *
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Notes (optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
        {isConfirming ? (
          <>
            <button
              type="button"
              onClick={() => setIsConfirming(false)}
              disabled={isPending}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-lg shadow-indigo-950/40"
            >
              {isPending && <span className="animate-spin">🔄</span>}
              <span>{isPending ? "Reconciling..." : "Confirm Reconciliation"}</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedItem || isNaN(countedNum) || difference === 0}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Review Adjustment &rarr;
            </button>
          </>
        )}
      </div>
    </form>
  );
}

// ============================================================================
// 5. THRESHOLDS MODAL
// ============================================================================

function ThresholdsModalContent({
  branch,
  orgId,
  targetItem,
  onClose,
  onSuccess,
}: {
  branch: AuthorizedBranchDTO;
  orgId: string;
  targetItem: SerializedInventoryStock;
  onClose: () => void;
  onSuccess: ModalSuccessHandler;
}) {
  const [reorderLevel, setReorderLevel] = useState(targetItem.reorderLevel || "");
  const [reorderQuantity, setReorderQuantity] = useState(targetItem.reorderQuantity || "");
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConfirming) {
      setError(null);
      setIsConfirming(true);
      return;
    }

    startTransition(async () => {
      setError(null);
      const res = await updateStockThresholdsAction(
        {
          branchId: branch.id,
          stockId: targetItem.id,
          reorderLevel: reorderLevel.trim() === "" ? null : reorderLevel.trim(),
          reorderQuantity: reorderQuantity.trim() === "" ? null : reorderQuantity.trim(),
        },
        orgId
      );

      if (!res.success) {
        setError(res.error || "Failed to update thresholds.");
        setIsConfirming(false);
        return;
      }

      onSuccess(res.data ?? null, `Updated reorder thresholds for ${targetItem.product.name}.`);
      onClose();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-base font-bold text-white">Reorder Thresholds</h2>
          <p className="text-xs text-slate-400">Branch: {branch.name} ({branch.code})</p>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1">
          ✕
        </button>
      </div>

      <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-xs space-y-1">
        <div className="font-semibold text-white">
          {targetItem.product.name}
          {targetItem.variant && (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
              {targetItem.variant.name}
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-400">
          Current Balance: <strong className="text-emerald-400 font-mono">{targetItem.quantity} {targetItem.product.unit}</strong>
        </div>
      </div>

      <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded-lg text-xs">
        ℹ️ <strong>Changing thresholds does not change current stock balance.</strong> Reorder level triggers low-stock alerts, and reorder quantity suggests reorder quantities on purchase orders.
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-lg text-xs">
          {error}
        </div>
      )}

      {isConfirming ? (
        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-xs space-y-2">
          <div className="text-slate-400 font-medium">New Threshold Settings:</div>
          <div className="flex justify-between font-mono">
            <span className="text-slate-300">Reorder Level:</span>
            <span className="font-semibold text-white">{reorderLevel.trim() || "None (Disabled)"}</span>
          </div>
          <div className="flex justify-between font-mono">
            <span className="text-slate-300">Reorder Quantity:</span>
            <span className="font-semibold text-white">{reorderQuantity.trim() || "None"}</span>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Reorder Level (Low-Stock Trigger)
            </label>
            <input
              type="text"
              placeholder="Leave blank to disable alert"
              value={reorderLevel}
              onChange={(e) => setReorderLevel(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-[10px] text-slate-500 mt-0.5 block">
              When stock balance falls to or below this quantity, item is flagged as Low Stock.
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Suggested Reorder Quantity
            </label>
            <input
              type="text"
              placeholder="e.g. 50.000"
              value={reorderQuantity}
              onChange={(e) => setReorderQuantity(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-[10px] text-slate-500 mt-0.5 block">
              Default quantity pre-filled when drafting purchase replenishment orders.
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
        {isConfirming ? (
          <>
            <button
              type="button"
              onClick={() => setIsConfirming(false)}
              disabled={isPending}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-lg shadow-blue-950/40"
            >
              {isPending && <span className="animate-spin">🔄</span>}
              <span>{isPending ? "Saving..." : "Confirm Thresholds"}</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
            >
              Review &rarr;
            </button>
          </>
        )}
      </div>
    </form>
  );
}
