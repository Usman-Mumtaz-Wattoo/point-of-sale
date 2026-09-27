"use client";

import { useState, useTransition, useId } from "react";
import Link from "next/link";
import {
  RotateCcw,
  History,
  Search,
  CheckCircle2,
  AlertTriangle,
  Printer,
  Eye,
  ArrowLeft,
  X,
  Plus,
  Minus,
  Building2,
  CreditCard,
  Banknote,
  Smartphone,
  HelpCircle,
  FileText,
} from "lucide-react";
import {
  getSaleReturnableInfoAction,
  createSaleReturnAction,
  getSaleReturnByIdAction,
  listSaleReturnsAction,
} from "./actions";
import {
  SalePaymentMethod,
  type SerializedReturnableInfo,
  type SerializedSaleReturnDetail,
  type SerializedPaginatedReturns,
} from "./types";

interface BranchOption {
  id: string;
  name: string;
  code: string;
}

interface ReturnsViewProps {
  organizationId: string;
  organizationName: string;
  userRole: string;
  userName: string;
  canCreateReturn: boolean;
  branches: BranchOption[];
  initialReturns: SerializedPaginatedReturns;
}

export function ReturnsView({
  organizationId,
  organizationName,
  userRole,
  userName,
  canCreateReturn,
  branches,
  initialReturns,
}: ReturnsViewProps) {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<"process" | "history">("process");

  // Lookup state
  const [searchQuery, setSearchQuery] = useState("");
  const [isLookingUp, startLookupTransition] = useTransition();
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [loadedSale, setLoadedSale] = useState<SerializedReturnableInfo | null>(null);

  // Return quantities & details state (saleItemId -> quantity string)
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});
  const [itemReasons, setItemReasons] = useState<Record<string, string>>({});
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<SalePaymentMethod>(
    SalePaymentMethod.CASH
  );
  const [refundReference, setRefundReference] = useState("");
  const [generalReason, setGeneralReason] = useState("");
  const [generalNotes, setGeneralNotes] = useState("");

  // Confirmation & submission state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");
  const [completedReturn, setCompletedReturn] = useState<SerializedSaleReturnDetail | null>(null);

  // Return History state
  const [historyReturns, setHistoryReturns] = useState<SerializedPaginatedReturns>(initialReturns);
  const [historySearch, setHistorySearch] = useState("");
  const [historyBranchId, setHistoryBranchId] = useState("");
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [isHistoryLoading, startHistoryTransition] = useTransition();

  // History detail modal
  const [selectedReturnDetail, setSelectedReturnDetail] = useState<SerializedSaleReturnDetail | null>(
    null
  );
  const [isDetailLoading, startDetailTransition] = useTransition();

  // Unique ID generator for fallback
  const fallbackUniqueId = useId();

  function generateUUID(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `ret_${Date.now()}_${Math.random().toString(36).slice(2, 11)}_${fallbackUniqueId}`;
  }

  // Handle invoice lookup
  const handleLookup = () => {
    if (!searchQuery.trim()) {
      setLookupError("Please enter an invoice number or sale ID.");
      return;
    }
    setLookupError(null);
    setLoadedSale(null);
    setReturnQuantities({});
    setItemReasons({});

    startLookupTransition(async () => {
      const res = await getSaleReturnableInfoAction(searchQuery.trim(), organizationId);
      if (res.success && res.data) {
        setLoadedSale(res.data);
        // Initialize return quantities to 0
        const initialQty: Record<string, string> = {};
        for (const it of res.data.items) {
          initialQty[it.saleItemId] = "0";
        }
        setReturnQuantities(initialQty);
      } else {
        setLookupError(res.error || "Sale not found or ineligible for return.");
      }
    });
  };

  // Set quantity for a specific item
  const handleQuantityChange = (itemId: string, maxQty: number, val: string) => {
    // Sanitize numeric input
    const clean = val.replace(/[^0-9.]/g, "");
    const num = parseFloat(clean);
    if (isNaN(num) || num < 0) {
      setReturnQuantities((prev) => ({ ...prev, [itemId]: "0" }));
      return;
    }
    if (num > maxQty) {
      setReturnQuantities((prev) => ({ ...prev, [itemId]: maxQty.toString() }));
      return;
    }
    setReturnQuantities((prev) => ({ ...prev, [itemId]: clean }));
  };

  // Helper: Return All
  const handleReturnAll = () => {
    if (!loadedSale) return;
    const newQty: Record<string, string> = {};
    for (const it of loadedSale.items) {
      const returnable = parseFloat(it.quantityReturnable);
      newQty[it.saleItemId] = returnable > 0 ? returnable.toString() : "0";
    }
    setReturnQuantities(newQty);
  };

  // Helper: Reset All
  const handleResetAll = () => {
    if (!loadedSale) return;
    const newQty: Record<string, string> = {};
    for (const it of loadedSale.items) {
      newQty[it.saleItemId] = "0";
    }
    setReturnQuantities(newQty);
  };

  // Live financial preview calculation
  const calculateFinancialPreview = () => {
    if (!loadedSale) {
      return { subtotal: 0, discount: 0, tax: 0, total: 0, totalQty: 0, itemsCount: 0 };
    }

    let estSubtotal = 0;
    let estDiscount = 0;
    let estTax = 0;
    let estTotal = 0;
    let totalQty = 0;
    let itemsCount = 0;

    for (const it of loadedSale.items) {
      const q = parseFloat(returnQuantities[it.saleItemId] || "0");
      if (q > 0) {
        itemsCount++;
        totalQty += q;
        const soldQty = parseFloat(it.quantitySold);
        const ratio = soldQty > 0 ? q / soldQty : 0;

        const lineSubtotal = parseFloat(it.unitPrice) * q;
        const lineTax = parseFloat(it.taxAmount) * ratio;
        const lineCeiling = parseFloat(it.totalRefundableAmount);
        const alreadyReturned = parseFloat(it.amountAlreadyReturned);
        const remainingCeiling = Math.max(0, lineCeiling - alreadyReturned);

        // If returning all remaining, absorb remaining ceiling
        const returnableQty = parseFloat(it.quantityReturnable);
        let lineRefund = 0;
        if (Math.abs(q - returnableQty) < 0.0001) {
          lineRefund = remainingCeiling;
        } else {
          lineRefund = Math.min(remainingCeiling, lineCeiling * ratio);
        }

        const lineDiscount = Math.max(0, lineSubtotal + lineTax - lineRefund);

        estSubtotal += lineSubtotal;
        estDiscount += lineDiscount;
        estTax += lineTax;
        estTotal += lineRefund;
      }
    }

    return {
      subtotal: Math.round(estSubtotal * 100) / 100,
      discount: Math.round(estDiscount * 100) / 100,
      tax: Math.round(estTax * 100) / 100,
      total: Math.round(estTotal * 100) / 100,
      totalQty,
      itemsCount,
    };
  };

  const preview = calculateFinancialPreview();

  // Initiate confirmation
  const handleProceedToConfirmation = () => {
    if (preview.itemsCount === 0 || preview.totalQty <= 0) {
      setSubmitError("Please select at least one item with quantity greater than 0.");
      return;
    }
    setSubmitError(null);
    // Generate fresh idempotency key for this logical return attempt if not already set
    if (!idempotencyKey) {
      setIdempotencyKey(generateUUID());
    }
    setShowConfirmModal(true);
  };

  // Submit Return Action
  const handleConfirmSubmit = () => {
    if (!loadedSale) return;
    setSubmitError(null);

    const itemsToSubmit = loadedSale.items
      .filter((it) => parseFloat(returnQuantities[it.saleItemId] || "0") > 0)
      .map((it) => ({
        saleItemId: it.saleItemId,
        quantityReturned: returnQuantities[it.saleItemId],
        reason: itemReasons[it.saleItemId]?.trim() || null,
      }));

    if (itemsToSubmit.length === 0) {
      setSubmitError("No items selected for return.");
      return;
    }

    startSubmitTransition(async () => {
      const res = await createSaleReturnAction(
        {
          saleId: loadedSale.saleId,
          items: itemsToSubmit,
          refund: {
            paymentMethod: selectedPaymentMethod,
            reference: refundReference.trim() || null,
            notes: generalNotes.trim() || null,
          },
          idempotencyKey,
          reason: generalReason.trim() || null,
          notes: generalNotes.trim() || null,
        },
        organizationId
      );

      if (res.success && res.data) {
        setShowConfirmModal(false);
        setCompletedReturn(res.data);
        // Refresh history list
        fetchHistory(1);
      } else {
        setSubmitError(res.error || "Failed to process sale return.");
      }
    });
  };

  // Reset to start a new return
  const handleStartNewReturn = () => {
    setCompletedReturn(null);
    setLoadedSale(null);
    setSearchQuery("");
    setReturnQuantities({});
    setItemReasons({});
    setRefundReference("");
    setGeneralReason("");
    setGeneralNotes("");
    setIdempotencyKey("");
    setSubmitError(null);
  };

  // Fetch History helper
  const fetchHistory = (page: number) => {
    startHistoryTransition(async () => {
      const res = await listSaleReturnsAction(
        {
          search: historySearch.trim() || undefined,
          branchId: historyBranchId || undefined,
          startDate: historyStartDate || undefined,
          endDate: historyEndDate || undefined,
          page,
          pageSize: 10,
        },
        organizationId
      );
      if (res.success && res.data) {
        setHistoryReturns(res.data);
        setHistoryPage(page);
      }
    });
  };

  // View return detail in history
  const handleViewReturnDetail = (returnId: string) => {
    startDetailTransition(async () => {
      const res = await getSaleReturnByIdAction(returnId, organizationId);
      if (res.success && res.data) {
        setSelectedReturnDetail(res.data);
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard?org=${organizationId}`}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Return to Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-amber-400" />
                  Sales Returns & Refunds
                </h1>
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {organizationName}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Operator: <span className="text-slate-300 font-medium">{userName}</span> ({userRole})
              </p>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab("process")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "process"
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Process Return
            </button>
            <button
              onClick={() => {
                setActiveTab("history");
                fetchHistory(1);
              }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "history"
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Return History ({historyReturns.totalItems})
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* =================================================================== */}
        {/* TAB 1: PROCESS RETURN */}
        {/* =================================================================== */}
        {activeTab === "process" && (
          <div className="space-y-6">
            {/* Read-Only Notice for Accountant */}
            {!canCreateReturn && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3 text-amber-300 text-sm">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-400" />
                <div>
                  <strong className="font-semibold">Read-Only Mode:</strong> Your role (
                  <span className="font-medium text-amber-200">{userRole}</span>) is permitted to
                  inspect sales and review return history, but return disbursements require CASHIER,
                  MANAGER, or OWNER permissions.
                </div>
              </div>
            )}

            {/* Step A: Invoice Search Card */}
            <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Search className="w-4 h-4 text-emerald-400" />
                    Lookup Original Sale
                  </h2>
                  <p className="text-xs text-slate-400">
                    Scan barcode or enter invoice number (e.g. <code>INV-202609-0001</code>) to inspect
                    returnable quantities.
                  </p>
                </div>
                {loadedSale && (
                  <button
                    onClick={handleStartNewReturn}
                    className="text-xs text-slate-400 hover:text-white underline transition-colors"
                  >
                    Clear & Search Another
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                    placeholder="Enter Invoice Number or Sale ID..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all font-mono"
                    autoFocus
                  />
                  <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                </div>
                <button
                  onClick={handleLookup}
                  disabled={isLookingUp || !searchQuery.trim()}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/10 cursor-pointer"
                >
                  {isLookingUp ? (
                    <span className="inline-block w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  Lookup Sale
                </button>
              </div>

              {lookupError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>{lookupError}</span>
                </div>
              )}
            </div>

            {/* Step B: Loaded Sale Information & Item Selection */}
            {loadedSale && (
              <div className="space-y-6">
                {/* Sale Header Summary Banner */}
                <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs text-slate-500 block">Original Invoice:</span>
                    <span className="text-sm font-mono font-bold text-emerald-400">
                      {loadedSale.invoiceNumber}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      {new Date(loadedSale.saleDate).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs text-slate-500 block">Branch:</span>
                    <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      {loadedSale.branch.name}
                    </span>
                    <span className="text-[10px] text-slate-500 block">Code: {loadedSale.branch.code}</span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs text-slate-500 block">Customer:</span>
                    <span className="text-sm font-semibold text-slate-200">
                      {loadedSale.customer ? loadedSale.customer.name : "Walk-in Customer"}
                    </span>
                    {loadedSale.customer?.phone && (
                      <span className="text-[10px] text-slate-500 block">
                        {loadedSale.customer.phone}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs text-slate-500 block">Financial Status:</span>
                    <div className="text-xs space-y-0.5">
                      <div className="flex justify-between text-slate-400">
                        <span>Paid:</span>
                        <span className="font-mono text-slate-200">
                          Rs. {parseFloat(loadedSale.paidAmount).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Refund Limit:</span>
                        <span className="font-mono text-amber-400 font-semibold">
                          Rs. {parseFloat(loadedSale.remainingRefundCeiling).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Ineligible warning banner */}
                {!loadedSale.isEligibleForReturn && (
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
                    <div>
                      <strong className="font-bold">Not Eligible for Return:</strong>{" "}
                      {loadedSale.ineligibilityReason}
                    </div>
                  </div>
                )}

                {/* Returnable Items Table */}
                <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 shadow-xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                    <div>
                      <h3 className="text-base font-bold text-white">Select Return Quantities</h3>
                      <p className="text-xs text-slate-400">
                        Adjust quantities to return. Full residual absorbs rounding difference
                        automatically.
                      </p>
                    </div>
                    {loadedSale.isEligibleForReturn && canCreateReturn && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleReturnAll}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-colors"
                        >
                          Return All Items
                        </button>
                        <button
                          type="button"
                          onClick={handleResetAll}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800 transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider font-semibold">
                          <th className="pb-3 pl-2">Product</th>
                          <th className="pb-3 text-right">Sold</th>
                          <th className="pb-3 text-right">Prev. Returned</th>
                          <th className="pb-3 text-right">Returnable</th>
                          <th className="pb-3 text-right">Unit Price</th>
                          <th className="pb-3 text-right">Tax Rate</th>
                          <th className="pb-3 text-right">Refund Ceiling</th>
                          <th className="pb-3 text-center w-36">Return Qty</th>
                          <th className="pb-3 pr-2">Reason / Note</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-sans">
                        {loadedSale.items.map((item) => {
                          const returnable = parseFloat(item.quantityReturnable);
                          const isZeroReturnable = returnable <= 0;
                          const currentQty = returnQuantities[item.saleItemId] || "0";
                          const currentQtyNum = parseFloat(currentQty);

                          return (
                            <tr
                              key={item.saleItemId}
                              className={`transition-colors ${
                                isZeroReturnable
                                  ? "opacity-40 bg-slate-900/10"
                                  : currentQtyNum > 0
                                  ? "bg-amber-500/5"
                                  : "hover:bg-slate-900/30"
                              }`}
                            >
                              <td className="py-3 pl-2">
                                <div className="font-semibold text-white">{item.productName}</div>
                                {item.productSku && (
                                  <div className="text-[11px] font-mono text-slate-400">
                                    SKU: {item.productSku}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 text-right font-mono text-slate-300">
                                {parseFloat(item.quantitySold).toFixed(2)}
                              </td>
                              <td className="py-3 text-right font-mono text-slate-400">
                                {parseFloat(item.quantityAlreadyReturned).toFixed(2)}
                              </td>
                              <td className="py-3 text-right font-mono font-semibold text-emerald-400">
                                {returnable.toFixed(2)}
                              </td>
                              <td className="py-3 text-right font-mono text-slate-300">
                                Rs. {parseFloat(item.unitPrice).toFixed(2)}
                              </td>
                              <td className="py-3 text-right font-mono text-slate-400">
                                {parseFloat(item.taxRate).toFixed(1)}%
                              </td>
                              <td className="py-3 text-right font-mono font-medium text-amber-300">
                                Rs. {parseFloat(item.totalRefundableAmount).toFixed(2)}
                              </td>
                              <td className="py-3 text-center">
                                {isZeroReturnable ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-500">
                                    Fully Returned
                                  </span>
                                ) : (
                                  <div className="inline-flex items-center border border-slate-700 rounded-lg overflow-hidden bg-slate-900">
                                    <button
                                      type="button"
                                      disabled={!canCreateReturn || currentQtyNum <= 0}
                                      onClick={() => {
                                        const next = Math.max(0, currentQtyNum - 1);
                                        handleQuantityChange(
                                          item.saleItemId,
                                          returnable,
                                          next.toString()
                                        );
                                      }}
                                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition-colors"
                                    >
                                      <Minus className="w-3.5 h-3.5" />
                                    </button>
                                    <input
                                      type="number"
                                      step="any"
                                      min="0"
                                      max={returnable}
                                      disabled={!canCreateReturn}
                                      value={currentQty}
                                      onChange={(e) =>
                                        handleQuantityChange(
                                          item.saleItemId,
                                          returnable,
                                          e.target.value
                                        )
                                      }
                                      className="w-16 py-1 text-center bg-transparent text-white font-mono text-xs focus:outline-none"
                                    />
                                    <button
                                      type="button"
                                      disabled={!canCreateReturn || currentQtyNum >= returnable}
                                      onClick={() => {
                                        const next = Math.min(returnable, currentQtyNum + 1);
                                        handleQuantityChange(
                                          item.saleItemId,
                                          returnable,
                                          next.toString()
                                        );
                                      }}
                                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition-colors"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </td>
                              <td className="py-3 pr-2">
                                <input
                                  type="text"
                                  disabled={isZeroReturnable || !canCreateReturn}
                                  value={itemReasons[item.saleItemId] || ""}
                                  onChange={(e) =>
                                    setItemReasons((prev) => ({
                                      ...prev,
                                      [item.saleItemId]: e.target.value,
                                    }))
                                  }
                                  placeholder="e.g. Defective"
                                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Refund Options & Financial Preview Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left (2 cols): Refund Method & Details */}
                  <div className="lg:col-span-2 p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-5">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-emerald-400" />
                      Refund Disbursement Method
                    </h3>

                    {/* Payment Method Pills */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                      {[
                        { method: SalePaymentMethod.CASH, label: "Cash", icon: Banknote },
                        { method: SalePaymentMethod.CARD, label: "Card", icon: CreditCard },
                        {
                          method: SalePaymentMethod.BANK_TRANSFER,
                          label: "Bank",
                          icon: Building2,
                        },
                        {
                          method: SalePaymentMethod.DIGITAL_WALLET,
                          label: "Wallet",
                          icon: Smartphone,
                        },
                        { method: SalePaymentMethod.OTHER, label: "Other", icon: HelpCircle },
                      ].map(({ method, label, icon: Icon }) => (
                        <button
                          key={method}
                          type="button"
                          disabled={!canCreateReturn}
                          onClick={() => setSelectedPaymentMethod(method)}
                          className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold gap-1.5 transition-all cursor-pointer ${
                            selectedPaymentMethod === method
                              ? "bg-amber-500/15 border-amber-500/60 text-amber-300 shadow-md shadow-amber-500/10"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Reference & Reason Fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium text-slate-400 block mb-1">
                          Payment Reference (Optional)
                        </label>
                        <input
                          type="text"
                          disabled={!canCreateReturn}
                          value={refundReference}
                          onChange={(e) => setRefundReference(e.target.value)}
                          placeholder="e.g. Card Auth ID / Bank Txn"
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-400 block mb-1">
                          General Return Reason
                        </label>
                        <input
                          type="text"
                          disabled={!canCreateReturn}
                          value={generalReason}
                          onChange={(e) => setGeneralReason(e.target.value)}
                          placeholder="e.g. Customer returned items"
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-400 block mb-1">
                        Internal Return Notes
                      </label>
                      <textarea
                        rows={2}
                        disabled={!canCreateReturn}
                        value={generalNotes}
                        onChange={(e) => setGeneralNotes(e.target.value)}
                        placeholder="Internal store notes regarding this transaction..."
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                      />
                    </div>
                  </div>

                  {/* Right (1 col): Live Financial Preview & Submit */}
                  <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col justify-between space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                          Refund Summary
                        </h4>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-300">
                          {preview.itemsCount} item{preview.itemsCount !== 1 ? "s" : ""}
                        </span>
                      </div>

                      <div className="space-y-2 text-xs font-mono">
                        <div className="flex justify-between text-slate-400">
                          <span>Return Subtotal:</span>
                          <span className="text-slate-200">Rs. {preview.subtotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Discount Deducted:</span>
                          <span className="text-rose-400">-Rs. {preview.discount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Tax Adjusted:</span>
                          <span className="text-slate-200">+Rs. {preview.tax.toFixed(2)}</span>
                        </div>
                        <div className="pt-3 border-t border-slate-800/80 flex justify-between items-baseline">
                          <span className="text-xs uppercase font-sans font-bold text-slate-300">
                            Estimated Total:
                          </span>
                          <span className="text-xl font-bold text-amber-400">
                            Rs. {preview.total.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-500 leading-tight">
                        * Note: Preview is informational. Authoritative amounts and residual
                        absorptions are computed server-side inside the transaction.
                      </p>
                    </div>

                    <div className="space-y-3 pt-2">
                      <button
                        type="button"
                        onClick={handleProceedToConfirmation}
                        disabled={
                          !canCreateReturn ||
                          preview.itemsCount === 0 ||
                          preview.totalQty <= 0 ||
                          !loadedSale.isEligibleForReturn
                        }
                        className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Review & Confirm Return
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: RETURN HISTORY */}
        {/* =================================================================== */}
        {activeTab === "history" && (
          <div className="space-y-6">
            {/* Filters Bar */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto flex-1">
                {/* Search */}
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && fetchHistory(1)}
                    placeholder="Search by Return #, Invoice #, or Customer..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                </div>

                {/* Branch selector if multi-branch */}
                {branches.length > 1 && (
                  <select
                    value={historyBranchId}
                    onChange={(e) => setHistoryBranchId(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="">All Branches</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                )}

                {/* Date Filters */}
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={historyStartDate}
                    onChange={(e) => setHistoryStartDate(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none"
                  />
                  <span className="text-slate-600 text-xs">to</span>
                  <input
                    type="date"
                    value={historyEndDate}
                    onChange={(e) => setHistoryEndDate(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => fetchHistory(1)}
                disabled={isHistoryLoading}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
              >
                {isHistoryLoading ? (
                  <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                Filter
              </button>
            </div>

            {/* Returns Table */}
            <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 shadow-xl space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider font-semibold">
                      <th className="pb-3 pl-2">Return #</th>
                      <th className="pb-3">Original Invoice</th>
                      <th className="pb-3">Date</th>
                      <th className="pb-3">Customer</th>
                      <th className="pb-3">Branch</th>
                      <th className="pb-3 text-right">Refund Total</th>
                      <th className="pb-3">Method</th>
                      <th className="pb-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {historyReturns.items.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-slate-500 text-xs">
                          No sales returns found matching your query.
                        </td>
                      </tr>
                    ) : (
                      historyReturns.items.map((ret) => (
                        <tr key={ret.id} className="hover:bg-slate-900/40 transition-colors">
                          <td className="py-3 pl-2 font-mono font-bold text-amber-400">
                            {ret.returnNumber}
                          </td>
                          <td className="py-3 font-mono text-emerald-400">
                            {ret.sale.invoiceNumber}
                          </td>
                          <td className="py-3 text-xs text-slate-300">
                            {new Date(ret.createdAt).toLocaleDateString()}{" "}
                            <span className="text-slate-500">
                              {new Date(ret.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </td>
                          <td className="py-3 text-xs text-slate-300">
                            {ret.sale.customer ? ret.sale.customer.name : "Walk-in Customer"}
                          </td>
                          <td className="py-3 text-xs text-slate-400">{ret.branch.name}</td>
                          <td className="py-3 text-right font-mono font-bold text-white">
                            Rs. {parseFloat(ret.totalAmount).toFixed(2)}
                          </td>
                          <td className="py-3 text-xs">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                              {ret.refunds[0]?.paymentMethod || "CASH"}
                            </span>
                          </td>
                          <td className="py-3 text-center">
                            <button
                              onClick={() => handleViewReturnDetail(ret.id)}
                              disabled={isDetailLoading}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {isDetailLoading ? (
                                <span className="w-3 h-3 inline-block border-2 border-slate-400 border-t-transparent rounded-full animate-spin mr-1" />
                              ) : (
                                <Eye className="w-3.5 h-3.5 inline mr-1" />
                              )}
                              View
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {historyReturns.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-xs text-slate-400">
                  <div>
                    Page {historyPage} of {historyReturns.totalPages} (
                    {historyReturns.totalItems} total returns)
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={historyReturns.page <= 1}
                      onClick={() => fetchHistory(historyReturns.page - 1)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
                    >
                      Previous
                    </button>
                    <button
                      disabled={historyReturns.page >= historyReturns.totalPages}
                      onClick={() => fetchHistory(historyReturns.page + 1)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* =================================================================== */}
      {/* CONFIRMATION MODAL */}
      {/* =================================================================== */}
      {showConfirmModal && loadedSale && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                Confirm Sales Return & Refund
              </h3>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5 font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>Target Invoice:</span>
                  <span className="text-emerald-400 font-bold">{loadedSale.invoiceNumber}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Refund Method:</span>
                  <span className="text-white">{selectedPaymentMethod}</span>
                </div>
                {refundReference && (
                  <div className="flex justify-between text-slate-400">
                    <span>Reference:</span>
                    <span className="text-slate-200">{refundReference}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-400 pt-1 border-t border-slate-800">
                  <span>Authoritative Refund:</span>
                  <span className="text-amber-400 font-bold text-sm">
                    Rs. {preview.total.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Items summary */}
              <div className="space-y-1">
                <span className="font-semibold text-slate-300 block">Items to Return:</span>
                <ul className="divide-y divide-slate-800/60 max-h-36 overflow-y-auto pr-1">
                  {loadedSale.items
                    .filter((it) => parseFloat(returnQuantities[it.saleItemId] || "0") > 0)
                    .map((it) => (
                      <li key={it.saleItemId} className="py-1.5 flex justify-between items-center">
                        <span className="text-slate-300 truncate max-w-[200px]">
                          {it.productName}
                        </span>
                        <span className="font-mono text-amber-400 font-semibold">
                          x{returnQuantities[it.saleItemId]}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>

              {/* Business Policy Alert */}
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] leading-relaxed">
                <strong>Inventory & Refund Policy:</strong> Inventory stock for these items will be
                restored atomically to branch stock and the refund registered in a single
                transaction.
              </div>

              {submitError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                  {submitError}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 transition-colors"
              >
                Back to Edit
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmSubmit}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Confirm & Refund
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* SUCCESS / RECEIPT MODAL */}
      {/* =================================================================== */}
      {completedReturn && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl print:border-none print:shadow-none print:bg-white print:text-black">
            {/* Success Header */}
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white print:text-black">
                Return Processed Successfully
              </h3>
              <p className="text-xs text-slate-400 print:text-gray-600">
                POS Internal Refund Disbursement Receipt
              </p>
            </div>

            {/* Receipt Summary Body */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800/80 space-y-2.5 text-xs font-mono print:bg-gray-50 print:border-gray-300">
              <div className="flex justify-between">
                <span className="text-slate-400 print:text-gray-600">Return Number:</span>
                <span className="font-bold text-amber-400 print:text-black">
                  {completedReturn.returnNumber}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 print:text-gray-600">Refund Number:</span>
                <span className="font-bold text-white print:text-black">
                  {completedReturn.refunds[0]?.refundNumber || "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 print:text-gray-600">Original Invoice:</span>
                <span className="text-emerald-400 print:text-black">
                  {completedReturn.sale.invoiceNumber}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 print:text-gray-600">Branch:</span>
                <span className="text-slate-200 print:text-black">
                  {completedReturn.branch.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 print:text-gray-600">Refund Method:</span>
                <span className="text-slate-200 print:text-black">
                  {completedReturn.refunds[0]?.paymentMethod || "CASH"}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-800 print:border-gray-300 text-sm">
                <span className="font-bold text-white print:text-black">Total Refunded:</span>
                <span className="font-bold text-amber-400 print:text-black">
                  Rs. {parseFloat(completedReturn.totalAmount).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Items Returned */}
            <div className="space-y-1 text-xs">
              <span className="font-semibold text-slate-400 print:text-black">Returned Items:</span>
              <div className="divide-y divide-slate-800/50 print:divide-gray-200 max-h-32 overflow-y-auto">
                {completedReturn.items.map((it) => (
                  <div key={it.id} className="py-1 flex justify-between text-slate-300 print:text-black">
                    <span>{it.productName}</span>
                    <span className="font-mono text-amber-400 print:text-black">
                      x{parseFloat(it.quantityReturned).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Notice */}
            <p className="text-[10px] text-slate-500 text-center leading-tight print:text-gray-500">
              * POS Return Record. Official Tax Authority (FBR/PRA) integration is not active in this
              checkpoint.
            </p>

            {/* Modal Actions */}
            <div className="space-y-2 pt-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold border border-slate-800 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Print Receipt
              </button>
              <button
                type="button"
                onClick={handleStartNewReturn}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer"
              >
                Start New Return
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* RETURN DETAILS MODAL (FROM HISTORY) */}
      {/* =================================================================== */}
      {selectedReturnDetail && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-400" />
                  Return #{selectedReturnDetail.returnNumber}
                </h3>
                <span className="text-xs text-slate-400">
                  Against Invoice {selectedReturnDetail.sale.invoiceNumber}
                </span>
              </div>
              <button
                onClick={() => setSelectedReturnDetail(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div>
                  <span className="text-slate-500 block text-[10px]">Processed Date:</span>
                  <span className="text-slate-200">
                    {new Date(selectedReturnDetail.createdAt).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Processed By:</span>
                  <span className="text-slate-200">
                    {selectedReturnDetail.returnedBy?.name || "Cashier"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Refund Method:</span>
                  <span className="text-emerald-400 font-bold">
                    {selectedReturnDetail.refunds[0]?.paymentMethod || "CASH"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Refund Reference:</span>
                  <span className="text-slate-300">
                    {selectedReturnDetail.refunds[0]?.reference || "None"}
                  </span>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <span className="text-xs font-sans font-semibold text-slate-400 block mb-2">
                  Returned Items Breakdown:
                </span>
                <div className="divide-y divide-slate-800/80 max-h-48 overflow-y-auto border border-slate-800 rounded-xl p-2 bg-slate-900/40">
                  {selectedReturnDetail.items.map((it) => (
                    <div key={it.id} className="py-2 flex justify-between items-center text-xs">
                      <div>
                        <div className="font-semibold text-white">{it.productName}</div>
                        <div className="text-[10px] text-slate-500">
                          Qty: {parseFloat(it.quantityReturned).toFixed(2)} @ Rs.{" "}
                          {parseFloat(it.unitPrice).toFixed(2)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-amber-400">
                          Rs. {parseFloat(it.lineTotal).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Tax: Rs. {parseFloat(it.taxAmount).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center text-sm">
                <span className="font-sans font-bold text-slate-300">Total Refunded Amount:</span>
                <span className="font-bold text-amber-400 font-mono text-base">
                  Rs. {parseFloat(selectedReturnDetail.totalAmount).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setSelectedReturnDetail(null)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
