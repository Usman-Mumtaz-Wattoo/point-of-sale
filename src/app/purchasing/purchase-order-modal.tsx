"use client";

import { useState, useEffect, useRef } from "react";
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
import { formatMoney } from "@/lib/currency";
import {
  Search,
  Plus,
  Trash2,
  X,
  Package,
  Layers,
  AlertCircle,
  Check,
} from "lucide-react";

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
  currency?: string;
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
  currency = "PKR",
  authorizedBranches,
  suppliers,
}: {
  onClose: () => void;
  onSuccess: (message: string, purchaseId?: string) => void;
  purchaseToEdit?: SerializedPurchaseDetailDTO | null;
  organizationId: string;
  currency?: string;
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
    return [];
  });

  // Dedicated Product Selector Modal State
  const [isProductSelectorOpen, setIsProductSelectorOpen] = useState(false);
  const [selectorSearch, setSelectorSearch] = useState("");
  const [catalogItems, setCatalogItems] = useState<SelectablePurchasingCatalogItem[]>([]);
  const [isSearchingCatalog, setIsSearchingCatalog] = useState(false);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Errors & submission
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load catalog items when selector opens or search changes
  useEffect(() => {
    if (!isProductSelectorOpen) return;

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setIsSearchingCatalog(true);

    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchPurchasingCatalogItemsAction(selectorSearch, organizationId);
        setCatalogItems(results);
      } catch {
        setCatalogItems([]);
      } finally {
        setIsSearchingCatalog(false);
      }
    }, 200);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [isProductSelectorOpen, selectorSearch, organizationId]);

  // Handle adding product from selector to line items
  const handleSelectProductFromModal = (item: SelectablePurchasingCatalogItem) => {
    // Check if line already exists
    const existingIndex = lines.findIndex(
      (l) => l.productId === item.productId && l.variantId === item.variantId
    );

    if (existingIndex >= 0) {
      // Increment existing line quantity by 1
      const updated = [...lines];
      const curQty = parseFloat(updated[existingIndex].quantity) || 1;
      updated[existingIndex].quantity = (curQty + 1).toString();
      setLines(updated);
    } else {
      // Add new line item
      setLines((prev) => [
        ...prev,
        {
          id: generateTempId(),
          productId: item.productId,
          variantId: item.variantId,
          productName: item.productName,
          variantName: item.variantName,
          sku: item.sku,
          unit: item.unit,
          isVariable: item.isVariable,
          quantity: "1",
          unitCost: parseFloat(item.costPrice || "0").toFixed(2),
          taxRate: "0.00",
        },
      ]);
    }

    setIsProductSelectorOpen(false);
    setSelectorSearch("");
  };

  const handleRemoveLine = (lineId: string) => {
    setLines((prev) => prev.filter((l) => l.id !== lineId));
  };

  const handleUpdateLine = (lineId: string, updates: Partial<FormLineItem>) => {
    setLines((prev) =>
      prev.map((line) => (line.id === lineId ? { ...line, ...updates } : line))
    );
  };

  // Arithmetic totals calculation
  const subtotalNum = lines.reduce((acc, line) => {
    const q = parseFloat(line.quantity) || 0;
    const c = parseFloat(line.unitCost) || 0;
    return acc + q * c;
  }, 0);

  const discountNum = parseFloat(discountAmount) || 0;
  const taxNum = parseFloat(taxAmount) || 0;
  const shippingNum = parseFloat(shippingAmount) || 0;
  const grandTotalNum = Math.max(0, subtotalNum - discountNum + taxNum + shippingNum);

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const errs: Record<string, string> = {};

    if (!supplierId.trim()) errs.supplierId = "Supplier is required.";
    if (!branchId.trim()) errs.branchId = "Destination branch is required.";
    if (!orderDate.trim()) errs.orderDate = "Order date is required.";

    if (lines.length === 0) {
      errs.lines = "At least one purchase line item is required.";
    }

    // Validate line items
    const seenItems = new Set<string>();
    lines.forEach((line, i) => {
      if (!line.productId) {
        errs[`line_${line.id}_product`] = `Item #${i + 1} has no product selected.`;
      }
      const itemKey = `${line.productId}::${line.variantId || "base"}`;
      if (seenItems.has(itemKey)) {
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
      const tax = parseFloat(line.taxRate);
      if (isNaN(tax) || tax < 0 || tax > 100) {
        errs[`line_${line.id}_tax`] = `Item #${i + 1} tax rate must be between 0% and 100%.`;
      }
    });

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setFormError("Please correct the errors in the form before submitting.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEdit && purchaseToEdit) {
        const payload: UpdatePurchaseInputDTO = {
          supplierId,
          branchId,
          orderDate,
          expectedDate: expectedDate || null,
          notes: notes || null,
          discountAmount: discountNum.toFixed(2),
          taxAmount: taxNum.toFixed(2),
          shippingAmount: shippingNum.toFixed(2),
          items: lines.map((l) => ({
            productId: l.productId,
            variantId: l.variantId,
            quantity: l.quantity,
            unitCost: l.unitCost,
            taxRate: l.taxRate,
          })),
        };

        const res = await updatePurchaseAction(
          purchaseToEdit.id,
          payload,
          { organizationId }
        );

        if (!res.success) {
          setFormError(res.error || "Failed to update purchase order.");
          setIsSubmitting(false);
          return;
        }

        onSuccess(res.message || "Purchase order updated successfully.", purchaseToEdit.id);
      } else {
        const payload: CreatePurchaseInputDTO = {
          supplierId,
          branchId,
          orderDate,
          expectedDate: expectedDate || null,
          notes: notes || null,
          discountAmount: discountNum.toFixed(2),
          taxAmount: taxNum.toFixed(2),
          shippingAmount: shippingNum.toFixed(2),
          items: lines.map((l) => ({
            productId: l.productId,
            variantId: l.variantId,
            quantity: l.quantity,
            unitCost: l.unitCost,
            taxRate: l.taxRate,
          })),
        };

        const res = await createPurchaseAction(payload, { organizationId });

        if (!res.success) {
          setFormError(res.error || "Failed to create purchase order.");
          setIsSubmitting(false);
          return;
        }

        onSuccess(res.message || "Purchase order created successfully.", res.purchaseId);
      }
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "An unexpected error occurred while saving the purchase order."
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="purchase-order-title"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
    >
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div>
            <h2 id="purchase-order-title" className="text-base font-bold text-slate-900 dark:text-white">
              {isEdit ? `Edit Order #${purchaseToEdit?.purchaseNumber}` : "Create Purchase Order"}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Procure stock and manage inventory inflows across authorized branches
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body Scroll Area */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
          {formError && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Supplier & Branch Context Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Supplier Selector */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Supplier <span className="text-rose-500">*</span>
              </label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {fieldErrors.supplierId && (
                <p className="text-[11px] text-rose-500">{fieldErrors.supplierId}</p>
              )}
            </div>

            {/* Destination Branch */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Destination Branch <span className="text-rose-500">*</span>
              </label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="">Select branch...</option>
                {authorizedBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
              {fieldErrors.branchId && (
                <p className="text-[11px] text-rose-500">{fieldErrors.branchId}</p>
              )}
            </div>

            {/* Order Date */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Order Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
              {fieldErrors.orderDate && (
                <p className="text-[11px] text-rose-500">{fieldErrors.orderDate}</p>
              )}
            </div>

            {/* Expected Delivery Date */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Expected Date
              </label>
              <input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>
          </div>

          {/* PURCHASE LINE ITEMS AREA */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Purchase Line Items ({lines.length})
                </h3>
                <p className="text-[11px] text-slate-400">
                  Items to be received and verified into inventory
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsProductSelectorOpen(true)}
                disabled={isSubmitting}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Line Item</span>
              </button>
            </div>

            {fieldErrors.lines && (
              <p className="text-xs text-rose-500 font-medium">{fieldErrors.lines}</p>
            )}

            {/* Spacious Line Items Container */}
            {lines.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30 space-y-2">
                <Package className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  No line items in this purchase order
                </p>
                <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                  Click &quot;+ Add Line Item&quot; to open the catalog selector and add items to your purchase order.
                </p>
                <button
                  type="button"
                  onClick={() => setIsProductSelectorOpen(true)}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold hover:bg-indigo-100 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Select Products
                </button>
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-950 shadow-2xs">
                {/* Desktop Structured Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                      <tr>
                        <th className="px-4 py-3 min-w-[220px]">Product / Variant</th>
                        <th className="px-3 py-3 w-32">SKU & Unit</th>
                        <th className="px-3 py-3 w-28">Quantity</th>
                        <th className="px-3 py-3 w-32">Unit Cost ({currency})</th>
                        <th className="px-3 py-3 w-24">Tax (%)</th>
                        <th className="px-3 py-3 w-28 text-right">Line Total</th>
                        <th className="px-3 py-3 w-12 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {lines.map((line, idx) => {
                        const lineTot = (
                          (parseFloat(line.quantity) || 0) * (parseFloat(line.unitCost) || 0)
                        ).toFixed(2);
                        const qtyErr = fieldErrors[`line_${line.id}_qty`];
                        const costErr = fieldErrors[`line_${line.id}_cost`];

                        return (
                          <tr key={line.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                            <td className="px-4 py-3 align-middle">
                              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                                <span>{line.productName}</span>
                                {line.variantName && (
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                                    {line.variantName}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 align-middle font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              <div>{line.sku}</div>
                              <span className="text-[10px] text-slate-400">{line.unit}</span>
                            </td>
                            <td className="px-3 py-3 align-middle">
                              <input
                                type="number"
                                step="any"
                                min="0.001"
                                value={line.quantity}
                                onChange={(e) => handleUpdateLine(line.id, { quantity: e.target.value })}
                                className="w-24 px-2.5 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                              {qtyErr && <p className="text-[10px] text-rose-500 mt-0.5">{qtyErr}</p>}
                            </td>
                            <td className="px-3 py-3 align-middle">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={line.unitCost}
                                onChange={(e) => handleUpdateLine(line.id, { unitCost: e.target.value })}
                                className="w-28 px-2.5 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                              {costErr && <p className="text-[10px] text-rose-500 mt-0.5">{costErr}</p>}
                            </td>
                            <td className="px-3 py-3 align-middle">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                value={line.taxRate}
                                onChange={(e) => handleUpdateLine(line.id, { taxRate: e.target.value })}
                                className="w-20 px-2 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-3 py-3 align-middle text-right font-mono font-bold text-slate-900 dark:text-white">
                              {formatMoney(lineTot, currency)}
                            </td>
                            <td className="px-3 py-3 align-middle text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveLine(line.id)}
                                title="Remove line item"
                                className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors rounded-lg cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Responsive Cards */}
                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800 p-2">
                  {lines.map((line) => {
                    const lineTot = (
                      (parseFloat(line.quantity) || 0) * (parseFloat(line.unitCost) || 0)
                    ).toFixed(2);

                    return (
                      <div key={line.id} className="p-3 space-y-2.5">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-semibold text-xs text-slate-900 dark:text-white">
                              {line.productName}
                              {line.variantName && ` • ${line.variantName}`}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400">
                              SKU: {line.sku} • {line.unit}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(line.id)}
                            className="p-1 text-rose-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <label className="text-[10px] text-slate-400 block">Quantity</label>
                            <input
                              type="number"
                              step="any"
                              value={line.quantity}
                              onChange={(e) => handleUpdateLine(line.id, { quantity: e.target.value })}
                              className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 block">
                              Unit Cost ({currency})
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={line.unitCost}
                              onChange={(e) => handleUpdateLine(line.id, { unitCost: e.target.value })}
                              className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                            />
                          </div>
                        </div>

                        <div className="flex justify-between items-center pt-1 border-t border-slate-100 dark:border-slate-800 text-xs">
                          <span className="text-slate-500">Line Total:</span>
                          <span className="font-bold font-mono text-slate-900 dark:text-white">
                            {formatMoney(lineTot, currency)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Notes and Order Adjustments */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Order Notes
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional supplier instructions, freight notes, or delivery terms..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Adjustments: Discount, Tax, Shipping in organization currency */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
                    Discount ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-mono text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
                    Tax Amount ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={taxAmount}
                    onChange={(e) => setTaxAmount(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-mono text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block">
                    Shipping ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={shippingAmount}
                    onChange={(e) => setShippingAmount(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-mono text-right focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Financial Preview Card in Organization Currency */}
            <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-2">
              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Subtotal:</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {formatMoney(subtotalNum, currency)}
                  </span>
                </div>
                {discountNum > 0 && (
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>Discount:</span>
                    <span className="font-mono text-rose-500">
                      -{formatMoney(discountNum, currency)}
                    </span>
                  </div>
                )}
                {taxNum > 0 && (
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>Tax:</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">
                      +{formatMoney(taxNum, currency)}
                    </span>
                  </div>
                )}
                {shippingNum > 0 && (
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>Shipping:</span>
                    <span className="font-mono text-slate-800 dark:text-slate-200">
                      +{formatMoney(shippingNum, currency)}
                    </span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between items-baseline text-sm font-black">
                  <span className="text-slate-900 dark:text-white">Order Grand Total:</span>
                  <span className="font-mono text-indigo-600 dark:text-indigo-400 text-base">
                    {formatMoney(grandTotalNum, currency)}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 text-right italic">
                Final authoritative values calculated by server on save
              </p>
            </div>
          </div>

          {/* Modal Footer Controls */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer shadow-md shadow-indigo-950/20 disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? "Saving Order..." : isEdit ? "Update Purchase Order" : `Save Order • ${formatMoney(grandTotalNum, currency)}`}
            </button>
          </div>
        </form>
      </div>

      {/* DEDICATED CATALOG PRODUCT SELECTOR MODAL / DRAWER */}
      {isProductSelectorOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="catalog-selector-title"
          className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="catalog-selector-title" className="text-sm font-bold text-slate-900 dark:text-white">
                    Select Catalog Product
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Search and pick products to populate the purchase order
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsProductSelectorOpen(false);
                  setSelectorSearch("");
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input Bar */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/40 shrink-0">
              <div className="relative">
                <input
                  type="text"
                  autoFocus
                  value={selectorSearch}
                  onChange={(e) => setSelectorSearch(e.target.value)}
                  placeholder="Search by product name, SKU, or barcode..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              </div>
            </div>

            {/* Scrollable Results List */}
            <div className="p-4 overflow-y-auto max-h-[380px] divide-y divide-slate-100 dark:divide-slate-800 flex-1">
              {isSearchingCatalog ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <span className="inline-block w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mr-2" />
                  Searching authoritative catalog...
                </div>
              ) : catalogItems.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <Package className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    No matching products found
                  </p>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                    Try adjusting your search query or add items in the Catalog module.
                  </p>
                </div>
              ) : (
                catalogItems.map((item) => {
                  const isAlreadyAdded = lines.some(
                    (l) => l.productId === item.productId && l.variantId === item.variantId
                  );

                  return (
                    <div
                      key={`${item.productId}-${item.variantId || "base"}`}
                      className="py-3 px-2 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-900/40 rounded-xl transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {item.productName}
                          </h4>
                          {item.variantName && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 shrink-0">
                              {item.variantName}
                            </span>
                          )}
                          {isAlreadyAdded && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shrink-0 flex items-center gap-0.5">
                              <Check className="w-2.5 h-2.5" /> Added
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
                          <span>SKU: {item.sku}</span>
                          <span>•</span>
                          <span>Unit: {item.unit}</span>
                          <span>•</span>
                          <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                            Cost: {formatMoney(item.costPrice, currency)}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSelectProductFromModal(item)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer shrink-0 ${
                          isAlreadyAdded
                            ? "bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                            : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs"
                        }`}
                      >
                        {isAlreadyAdded ? "+ 1 More" : "Select & Add"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
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
