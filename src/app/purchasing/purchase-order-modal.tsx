"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import {
  type AuthorizedBranchDTO,
  type SerializedPurchaseDetailDTO,
  type SelectablePurchasingCatalogItem,
  type CreatePurchaseInputDTO,
  type UpdatePurchaseInputDTO,
} from "./types";
import {
  createPurchaseAction,
  updatePurchaseAction,
  searchPurchasingCatalogItemsAction,
} from "./actions";

interface FormLineItem {
  id: string; // local temporary key
  productId: string;
  variantId: string | null;
  productName: string;
  variantName: string | null;
  sku: string;
  unit: string;
  isVariable: boolean;
  quantity: string;
  unitCost: string;
  taxRate: string;
}

interface PurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string, purchaseId?: string) => void;
  purchaseToEdit?: SerializedPurchaseDetailDTO | null;
  organizationId: string;
  authorizedBranches: AuthorizedBranchDTO[];
  suppliers: { id: string; name: string }[];
}

function generateTempId(): string {
  return "line_" + Math.random().toString(36).substring(2, 9);
}

function PurchaseOrderModalContent({
  onClose,
  onSuccess,
  purchaseToEdit,
  organizationId,
  authorizedBranches,
  suppliers,
}: {
  onClose: () => void;
  onSuccess: (message: string, purchaseId?: string) => void;
  purchaseToEdit?: SerializedPurchaseDetailDTO | null;
  organizationId: string;
  authorizedBranches: AuthorizedBranchDTO[];
  suppliers: { id: string; name: string }[];
}) {
  const isEdit = Boolean(purchaseToEdit);

  // Form State
  const [supplierId, setSupplierId] = useState(purchaseToEdit?.supplierId || (suppliers[0]?.id ?? ""));
  const [branchId, setBranchId] = useState(
    purchaseToEdit?.branchId || (authorizedBranches.length === 1 ? authorizedBranches[0].id : "")
  );
  const [orderDate, setOrderDate] = useState(
    purchaseToEdit?.orderDate ? purchaseToEdit.orderDate.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [expectedDate, setExpectedDate] = useState(
    purchaseToEdit?.expectedDate ? purchaseToEdit.expectedDate.slice(0, 10) : ""
  );
  const [notes, setNotes] = useState(purchaseToEdit?.notes || "");
  const [discountAmount, setDiscountAmount] = useState(purchaseToEdit?.discountAmount || "0.00");
  const [taxAmount, setTaxAmount] = useState(purchaseToEdit?.taxAmount || "0.00");
  const [shippingAmount, setShippingAmount] = useState(purchaseToEdit?.shippingAmount || "0.00");

  // Lines State
  const [lines, setLines] = useState<FormLineItem[]>(() => {
    if (purchaseToEdit && purchaseToEdit.items.length > 0) {
      return purchaseToEdit.items.map((it) => ({
        id: generateTempId(),
        productId: it.productId,
        variantId: it.variantId,
        productName: it.product.name,
        variantName: it.variant?.name || null,
        sku: it.variant?.sku || it.product.sku,
        unit: it.product.unit || "piece",
        isVariable: Boolean(it.variantId),
        quantity: it.quantityOrdered,
        unitCost: it.unitCost,
        taxRate: it.taxRate,
      }));
    }
    return [
      {
        id: generateTempId(),
        productId: "",
        variantId: null,
        productName: "",
        variantName: null,
        sku: "",
        unit: "piece",
        isVariable: false,
        quantity: "1",
        unitCost: "0.00",
        taxRate: "0.00",
      },
    ];
  });

  // Catalog search per row state
  const [activeSearchLineId, setActiveSearchLineId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SelectablePurchasingCatalogItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Errors & transition
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, startSubmitTransition] = useTransition();

  // Escape key handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSubmitting, onClose]);

  // Product Catalog Search Debounce
  useEffect(() => {
    if (!activeSearchLineId) {
      return;
    }

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    searchTimerRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchPurchasingCatalogItemsAction(searchQuery, organizationId);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [searchQuery, activeSearchLineId, organizationId]);

  // Line item modifiers
  function handleSelectProduct(lineId: string, item: SelectablePurchasingCatalogItem) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        return {
          ...l,
          productId: item.productId,
          variantId: item.variantId,
          productName: item.productName,
          variantName: item.variantName,
          sku: item.sku,
          unit: item.unit,
          isVariable: item.isVariable,
          unitCost: item.costPrice || "0.00",
        };
      })
    );
    setActiveSearchLineId(null);
    setSearchQuery("");
    setSearchResults([]);
  }

  function handleLineChange(lineId: string, field: keyof FormLineItem, val: string) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        return { ...l, [field]: val };
      })
    );
  }

  function handleAddLine() {
    setLines((prev) => [
      ...prev,
      {
        id: generateTempId(),
        productId: "",
        variantId: null,
        productName: "",
        variantName: null,
        sku: "",
        unit: "piece",
        isVariable: false,
        quantity: "1",
        unitCost: "0.00",
        taxRate: "0.00",
      },
    ]);
  }

  function handleRemoveLine(lineId: string) {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((l) => l.id !== lineId));
    if (activeSearchLineId === lineId) {
      setActiveSearchLineId(null);
    }
  }

  // Live financial preview
  const subtotalNum = lines.reduce((sum, l) => {
    const q = parseFloat(l.quantity) || 0;
    const c = parseFloat(l.unitCost) || 0;
    return sum + q * c;
  }, 0);

  const discountNum = parseFloat(discountAmount) || 0;
  const taxNum = parseFloat(taxAmount) || 0;
  const shippingNum = parseFloat(shippingAmount) || 0;
  const grandTotalNum = Math.max(0, subtotalNum - discountNum + taxNum + shippingNum);

  // Form Validation
  function validateForm(): boolean {
    const errs: Record<string, string> = {};

    if (!supplierId) {
      errs.supplierId = "Supplier is required.";
    }
    if (!branchId) {
      errs.branchId = "Branch is required.";
    }
    if (!orderDate) {
      errs.orderDate = "Order date is required.";
    }

    if (discountNum < 0) {
      errs.discountAmount = "Discount cannot be negative.";
    }
    if (taxNum < 0) {
      errs.taxAmount = "Tax cannot be negative.";
    }
    if (shippingNum < 0) {
      errs.shippingAmount = "Shipping cannot be negative.";
    }

    if (lines.length === 0) {
      errs.lines = "At least one line item is required.";
    }

    // Check line items
    const seenItems = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.productId) {
        errs[`line_${line.id}_product`] = `Item #${i + 1} has no product selected.`;
      }
      const itemKey = `${line.productId}::${line.variantId || "base"}`;
      if (line.productId && seenItems.has(itemKey)) {
        errs[`line_${line.id}_product`] = `Duplicate item in list (#${i + 1}). Combine quantities instead.`;
      }
      seenItems.add(itemKey);

      const qty = parseFloat(line.quantity);
      if (isNaN(qty) || qty <= 0) {
        errs[`line_${line.id}_qty`] = `Item #${i + 1} quantity must be greater than 0.`;
      }
      const cost = parseFloat(line.unitCost);
      if (isNaN(cost) || cost < 0) {
        errs[`line_${line.id}_cost`] = `Item #${i + 1} unit cost cannot be negative.`;
      }
      const taxRate = parseFloat(line.taxRate);
      if (isNaN(taxRate) || taxRate < 0 || taxRate > 100) {
        errs[`line_${line.id}_tax`] = `Item #${i + 1} tax rate must be between 0% and 100%.`;
      }
    }

    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setGeneralError("Please resolve the validation errors highlighted below.");
      return false;
    }
    setGeneralError(null);
    return true;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;

    startSubmitTransition(async () => {
      try {
        if (isEdit && purchaseToEdit) {
          const updateInput: UpdatePurchaseInputDTO = {
            supplierId,
            branchId,
            orderDate,
            expectedDate: expectedDate || null,
            notes: notes.trim() || null,
            discountAmount,
            taxAmount,
            shippingAmount,
            items: lines.map((l) => ({
              productId: l.productId,
              variantId: l.variantId,
              quantity: l.quantity,
              unitCost: l.unitCost,
              taxRate: l.taxRate,
            })),
          };

          const res = await updatePurchaseAction(purchaseToEdit.id, updateInput, {
            organizationId,
          });

          if (!res.success) {
            setGeneralError(res.error || "Failed to update purchase order.");
            return;
          }

          onSuccess(res.message || "Purchase order updated successfully.", res.purchaseId);
        } else {
          const createInput: CreatePurchaseInputDTO = {
            supplierId,
            branchId,
            orderDate,
            expectedDate: expectedDate || null,
            notes: notes.trim() || null,
            discountAmount,
            taxAmount,
            shippingAmount,
            items: lines.map((l) => ({
              productId: l.productId,
              variantId: l.variantId,
              quantity: l.quantity,
              unitCost: l.unitCost,
              taxRate: l.taxRate,
            })),
          };

          const res = await createPurchaseAction(createInput, { organizationId });

          if (!res.success) {
            setGeneralError(res.error || "Failed to create purchase order.");
            return;
          }

          onSuccess(res.message || "Purchase order created successfully.", res.purchaseId);
        }
      } catch (err: unknown) {
        setGeneralError(err instanceof Error ? err.message : "An unexpected server error occurred.");
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-headline"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
    >
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {isEdit ? "Edit Purchase Order" : "New Purchase Order"}
              </span>
              {isEdit && purchaseToEdit && (
                <span className="text-xs font-mono text-slate-400">
                  {purchaseToEdit.purchaseNumber} (DRAFT)
                </span>
              )}
            </div>
            <h2 id="modal-headline" className="text-lg font-bold text-white tracking-tight mt-1">
              {isEdit ? `Edit Order #${purchaseToEdit?.purchaseNumber}` : "Create Purchase Order"}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Specify supplier, destination branch, order dates, and purchase line items.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {generalError && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2">
              <span className="font-bold">Error:</span>
              <span>{generalError}</span>
            </div>
          )}

          {/* Section 1: Header Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-950/40 border border-slate-800/80">
            {/* Supplier */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Supplier <span className="text-rose-400">*</span>
              </label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">Select an active supplier...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {fieldErrors.supplierId && (
                <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.supplierId}</p>
              )}
            </div>

            {/* Branch */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Destination Branch <span className="text-rose-400">*</span>
              </label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="">Select destination branch...</option>
                {authorizedBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
              {fieldErrors.branchId && (
                <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.branchId}</p>
              )}
            </div>

            {/* Order Date */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Order Date <span className="text-rose-400">*</span>
              </label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              {fieldErrors.orderDate && (
                <p className="text-[11px] text-rose-400 mt-1">{fieldErrors.orderDate}</p>
              )}
            </div>

            {/* Expected Delivery Date */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Expected Delivery Date
              </label>
              <input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Notes */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">Order Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional delivery instructions or notes..."
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Section 2: Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Purchase Line Items</h3>
                <p className="text-xs text-slate-400">
                  Select products or specific variants. Unit costs default from catalog.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddLine}
                disabled={isSubmitting}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors flex items-center gap-1.5"
              >
                <span>+</span>
                <span>Add Line Item</span>
              </button>
            </div>

            {fieldErrors.lines && (
              <p className="text-xs text-rose-400">{fieldErrors.lines}</p>
            )}

            {/* Line Items Table */}
            <div className="border border-slate-800 rounded-xl overflow-x-auto bg-slate-950/30">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="px-3 py-2.5 min-w-[260px]">Product / Variant</th>
                    <th className="px-3 py-2.5 w-24">Qty</th>
                    <th className="px-3 py-2.5 w-28">Unit Cost ($)</th>
                    <th className="px-3 py-2.5 w-20">Tax (%)</th>
                    <th className="px-3 py-2.5 w-24 text-right">Line Total</th>
                    <th className="px-3 py-2.5 w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {lines.map((line) => {
                    const lineTotal = (
                      (parseFloat(line.quantity) || 0) * (parseFloat(line.unitCost) || 0)
                    ).toFixed(2);
                    const isSearchOpen = activeSearchLineId === line.id;
                    const productErr = fieldErrors[`line_${line.id}_product`];
                    const qtyErr = fieldErrors[`line_${line.id}_qty`];
                    const costErr = fieldErrors[`line_${line.id}_cost`];

                    return (
                      <tr key={line.id} className="hover:bg-slate-800/20">
                        {/* Product Column */}
                        <td className="px-3 py-2.5 relative align-top">
                          {!line.productId || isSearchOpen ? (
                            <div className="relative">
                              <input
                                type="text"
                                placeholder="Type to search product or SKU..."
                                value={isSearchOpen ? searchQuery : ""}
                                onFocus={() => {
                                  setActiveSearchLineId(line.id);
                                  setSearchQuery("");
                                }}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full px-2.5 py-1.5 text-xs rounded bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              />

                              {/* Search Dropdown */}
                              {isSearchOpen && (
                                <div className="absolute left-0 top-full mt-1 w-full sm:w-96 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-30 max-h-60 overflow-y-auto">
                                  <div className="p-2 border-b border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                                    <span>
                                      {isSearching ? "Searching catalog..." : `Found ${searchResults.length} matches`}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setActiveSearchLineId(null)}
                                      className="text-slate-400 hover:text-white"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                  {searchResults.length === 0 && !isSearching && (
                                    <div className="p-3 text-xs text-slate-500 text-center">
                                      No active products found matching &ldquo;{searchQuery}&rdquo;.
                                    </div>
                                  )}
                                  {searchResults.map((item) => (
                                    <button
                                      key={`${item.productId}_${item.variantId || "base"}`}
                                      type="button"
                                      onClick={() => handleSelectProduct(line.id, item)}
                                      className="w-full text-left px-3 py-2 hover:bg-slate-800 border-b border-slate-800/40 text-xs flex flex-col transition-colors"
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="font-semibold text-white">
                                          {item.productName}
                                          {item.variantName && (
                                            <span className="text-emerald-400 ml-1">
                                              ({item.variantName})
                                            </span>
                                          )}
                                        </span>
                                        <span className="font-mono text-emerald-400 text-[11px]">
                                          Cost: ${parseFloat(item.costPrice).toFixed(2)}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                                        <span className="font-mono">SKU: {item.sku}</span>
                                        <span>•</span>
                                        <span>Unit: {item.unit}</span>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-slate-900 border border-slate-800">
                              <div className="truncate">
                                <span className="font-medium text-white">{line.productName}</span>
                                {line.variantName && (
                                  <span className="text-emerald-400 text-[11px] ml-1">
                                    ({line.variantName})
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-400 block font-mono">
                                  SKU: {line.sku} • {line.unit}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveSearchLineId(line.id);
                                  setSearchQuery("");
                                }}
                                className="px-2 py-0.5 rounded text-[10px] text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
                              >
                                Change
                              </button>
                            </div>
                          )}
                          {productErr && (
                            <p className="text-[10px] text-rose-400 mt-1">{productErr}</p>
                          )}
                        </td>

                        {/* Qty Column */}
                        <td className="px-3 py-2.5 align-top">
                          <input
                            type="number"
                            step="any"
                            min="0.001"
                            value={line.quantity}
                            onChange={(e) => handleLineChange(line.id, "quantity", e.target.value)}
                            disabled={isSubmitting}
                            className="w-full px-2 py-1.5 text-xs rounded bg-slate-900 border border-slate-700 text-white font-mono text-right focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                          {qtyErr && <p className="text-[10px] text-rose-400 mt-1">{qtyErr}</p>}
                        </td>

                        {/* Unit Cost Column */}
                        <td className="px-3 py-2.5 align-top">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.unitCost}
                            onChange={(e) => handleLineChange(line.id, "unitCost", e.target.value)}
                            disabled={isSubmitting}
                            className="w-full px-2 py-1.5 text-xs rounded bg-slate-900 border border-slate-700 text-white font-mono text-right focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                          {costErr && <p className="text-[10px] text-rose-400 mt-1">{costErr}</p>}
                        </td>

                        {/* Tax Rate Column */}
                        <td className="px-3 py-2.5 align-top">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={line.taxRate}
                            onChange={(e) => handleLineChange(line.id, "taxRate", e.target.value)}
                            disabled={isSubmitting}
                            className="w-full px-2 py-1.5 text-xs rounded bg-slate-900 border border-slate-700 text-white font-mono text-right focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </td>

                        {/* Line Total Column */}
                        <td className="px-3 py-2.5 align-top text-right font-mono font-medium text-slate-200">
                          ${lineTotal}
                        </td>

                        {/* Remove Action */}
                        <td className="px-3 py-2.5 align-top text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(line.id)}
                            disabled={lines.length <= 1 || isSubmitting}
                            className="text-slate-500 hover:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed p-1 transition-colors"
                            title={lines.length <= 1 ? "At least one row required" : "Remove line"}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Financial Summary & Adjustments */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-xl bg-slate-950/40 border border-slate-800">
            {/* Header Monetary Adjustments */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Order Adjustments
              </h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Discount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full px-2.5 py-1.5 text-xs rounded bg-slate-900 border border-slate-700 text-white font-mono text-right focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  {fieldErrors.discountAmount && (
                    <p className="text-[10px] text-rose-400 mt-1">{fieldErrors.discountAmount}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Tax Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={taxAmount}
                    onChange={(e) => setTaxAmount(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full px-2.5 py-1.5 text-xs rounded bg-slate-900 border border-slate-700 text-white font-mono text-right focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  {fieldErrors.taxAmount && (
                    <p className="text-[10px] text-rose-400 mt-1">{fieldErrors.taxAmount}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Shipping ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={shippingAmount}
                    onChange={(e) => setShippingAmount(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full px-2.5 py-1.5 text-xs rounded bg-slate-900 border border-slate-700 text-white font-mono text-right focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  {fieldErrors.shippingAmount && (
                    <p className="text-[10px] text-rose-400 mt-1">{fieldErrors.shippingAmount}</p>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-slate-500 italic">
                Note: Tax amount represents the total order tax adjustment. Line tax rates are saved for line reporting.
              </p>
            </div>

            {/* Financial Preview Card */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-2">
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Line Items Subtotal:</span>
                  <span className="font-mono text-slate-200">${subtotalNum.toFixed(2)}</span>
                </div>
                {discountNum > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>Discount:</span>
                    <span className="font-mono text-rose-400">-${discountNum.toFixed(2)}</span>
                  </div>
                )}
                {taxNum > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>Tax:</span>
                    <span className="font-mono text-slate-200">+${taxNum.toFixed(2)}</span>
                  </div>
                )}
                {shippingNum > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>Shipping:</span>
                    <span className="font-mono text-slate-200">+${shippingNum.toFixed(2)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-800 flex justify-between items-baseline">
                  <span className="text-sm font-bold text-white">Estimated Grand Total:</span>
                  <span className="text-lg font-bold font-mono text-emerald-400">
                    ${grandTotalNum.toFixed(2)}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 text-right">
                (Client preview — server authoritative totals calculated on save)
              </p>
            </div>
          </div>

          {/* Footer Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-lg shadow-emerald-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {isSubmitting && (
                <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
              )}
              <span>{isEdit ? "Update Order" : "Create Order"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PurchaseOrderModal(props: PurchaseOrderModalProps) {
  if (!props.isOpen) return null;

  return (
    <PurchaseOrderModalContent
      key={props.purchaseToEdit ? props.purchaseToEdit.id : "new"}
      {...props}
    />
  );
}
