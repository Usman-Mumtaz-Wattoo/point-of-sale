"use client";

import { useState, useTransition, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type PurchasingPageInitialData,
  type SerializedSupplier,
  type SerializedPurchaseDetailDTO,
} from "./types";
import { SupplierModal } from "./supplier-modal";
import { PurchaseList } from "./purchase-list";
import { PurchaseOrderModal } from "./purchase-order-modal";
import { PurchaseDetailDrawer } from "./purchase-detail-drawer";
import { listSuppliersAction, updateSupplierAction } from "./actions";

interface PurchasingViewProps {
  initialData: PurchasingPageInitialData;
}

export function PurchasingView({ initialData }: PurchasingViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Active tab state
  const currentTabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<"purchases" | "suppliers">(
    currentTabParam === "suppliers" ? "suppliers" : "purchases"
  );

  // Sync tab with URL
  const handleTabChange = (tab: "purchases" | "suppliers") => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`/purchasing?${params.toString()}`);
  };

  // Suppliers state
  const [suppliers, setSuppliers] = useState<SerializedSupplier[]>(
    initialData.initialSuppliers.suppliers
  );
  const [supplierTotalCount, setSupplierTotalCount] = useState<number>(
    initialData.initialSuppliers.totalCount
  );
  const [supplierSearch, setSupplierSearch] = useState("");
  const [debouncedSupplierSearch, setDebouncedSupplierSearch] = useState("");
  const [supplierStatusFilter, setSupplierStatusFilter] = useState<string>("ALL");
  const [supplierPage, setSupplierPage] = useState(1);
  const [supplierPageSize] = useState(25);

  const [isSupplierPending, startSupplierTransition] = useTransition();
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [supplierToEdit, setSupplierToEdit] = useState<SerializedSupplier | null>(null);

  // Purchase modal & drawer state
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [purchaseToEdit, setPurchaseToEdit] = useState<SerializedPurchaseDetailDTO | null>(null);
  const [refreshPurchasesTrigger, setRefreshPurchasesTrigger] = useState(0);

  const handleOpenCreatePurchase = () => {
    setPurchaseToEdit(null);
    setIsPurchaseModalOpen(true);
  };

  const handleSelectPurchase = (purchaseId: string) => {
    setSelectedPurchaseId(purchaseId);
    setIsDetailDrawerOpen(true);
  };

  const handleEditPurchaseFromDrawer = (po: SerializedPurchaseDetailDTO) => {
    setIsDetailDrawerOpen(false);
    setPurchaseToEdit(po);
    setIsPurchaseModalOpen(true);
  };

  const handlePurchaseModalSuccess = (msg: string, newPurchaseId?: string) => {
    setIsPurchaseModalOpen(false);
    setFeedbackMessage(msg);
    setRefreshPurchasesTrigger((prev) => prev + 1);
    if (newPurchaseId) {
      setSelectedPurchaseId(newPurchaseId);
      setIsDetailDrawerOpen(true);
    }
  };

  const handlePurchaseDrawerUpdated = (msg: string) => {
    setFeedbackMessage(msg);
    setRefreshPurchasesTrigger((prev) => prev + 1);
  };

  // Debounce supplier search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSupplierSearch(supplierSearch);
      setSupplierPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [supplierSearch]);

  const refreshSuppliers = useCallback(
    (page = supplierPage) => {
      startSupplierTransition(async () => {
        try {
          const offset = (page - 1) * supplierPageSize;
          const res = await listSuppliersAction({
            organizationId: initialData.organizationId,
            search: debouncedSupplierSearch.trim() || undefined,
            isActive:
              supplierStatusFilter === "ALL"
                ? undefined
                : supplierStatusFilter === "ACTIVE",
            limit: supplierPageSize,
            offset,
          });

          setSuppliers(res.suppliers);
          setSupplierTotalCount(res.totalCount);
          setSupplierError(null);
        } catch (err: unknown) {
          setSupplierError(err instanceof Error ? err.message : "Failed to load suppliers.");
        }
      });
    },
    [debouncedSupplierSearch, initialData.organizationId, supplierPage, supplierPageSize, supplierStatusFilter]
  );

  const isFirstMount = useRef(true);

  // Re-fetch suppliers on filter change
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    if (activeTab !== "suppliers") {
      return;
    }

    refreshSuppliers(supplierPage);
  }, [debouncedSupplierSearch, supplierStatusFilter, supplierPage, activeTab, refreshSuppliers]);

  const supplierTotalPages = Math.ceil(supplierTotalCount / supplierPageSize) || 1;

  async function handleToggleSupplierActive(supplier: SerializedSupplier) {
    if (!initialData.canMutateSuppliers) return;
    setSupplierError(null);

    const nextState = !supplier.isActive;
    startSupplierTransition(async () => {
      try {
        const res = await updateSupplierAction(
          supplier.id,
          { isActive: nextState },
          { organizationId: initialData.organizationId }
        );

        if (!res.success) {
          setSupplierError(res.error || "Failed to update supplier status.");
          return;
        }

        setFeedbackMessage(res.message || "Supplier status updated.");
        refreshSuppliers(supplierPage);
      } catch {
        setSupplierError("Failed to update supplier status.");
      }
    });
  }

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-800 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Purchasing Management
              </span>
              <span className="text-xs text-slate-400 font-medium">
                {initialData.organizationName}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Purchasing & Vendor Operations
            </h1>
            <p className="text-xs text-slate-400">
              Manage purchase orders, suppliers, and incoming inventory shipments.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-300">
              Role: {initialData.userRole}
            </span>
            <Link
              href={`/dashboard`}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
            >
              &larr; Dashboard
            </Link>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {feedbackMessage && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center justify-between animate-in fade-in">
            <span>{feedbackMessage}</span>
            <button
              type="button"
              onClick={() => setFeedbackMessage(null)}
              className="text-slate-400 hover:text-white font-bold ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-slate-800">
          <button
            type="button"
            onClick={() => handleTabChange("purchases")}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "purchases"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>📦</span>
            <span>Purchase Orders</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("suppliers")}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "suppliers"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>🏢</span>
            <span>Suppliers Directory</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
              {supplierTotalCount}
            </span>
          </button>
        </div>

        {/* Tab Content: Purchase Orders */}
        {activeTab === "purchases" && (
          <PurchaseList
            initialPurchases={initialData.initialPurchases.purchases}
            initialTotalCount={initialData.initialPurchases.totalCount}
            initialKpis={initialData.initialPurchases.kpis}
            organizationId={initialData.organizationId}
            authorizedBranches={initialData.authorizedBranches}
            suppliers={initialData.allActiveSuppliersForFilter}
            canMutatePurchases={initialData.canMutatePurchases}
            onOpenCreateModal={handleOpenCreatePurchase}
            onSelectPurchase={handleSelectPurchase}
            refreshTrigger={refreshPurchasesTrigger}
          />
        )}

        {/* Tab Content: Suppliers Directory */}
        {activeTab === "suppliers" && (
          <div className="space-y-4">
            {/* Supplier Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-950/50 border border-slate-800 rounded-xl p-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
                {/* Search */}
                <div className="relative flex-1 max-w-md">
                  <input
                    type="text"
                    value={supplierSearch}
                    onChange={(e) => setSupplierSearch(e.target.value)}
                    placeholder="Search suppliers by name, contact, city, phone..."
                    className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-800 focus:border-emerald-500 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                </div>

                {/* Status Filter */}
                <div className="w-40">
                  <select
                    value={supplierStatusFilter}
                    onChange={(e) => {
                      setSupplierStatusFilter(e.target.value);
                      setSupplierPage(1);
                    }}
                    className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-800 focus:border-emerald-500 text-slate-200 focus:outline-none transition-colors"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="ACTIVE">Active Only</option>
                    <option value="INACTIVE">Inactive Only</option>
                  </select>
                </div>
              </div>

              {/* Add Supplier Button */}
              {initialData.canMutateSuppliers && (
                <button
                  type="button"
                  onClick={() => {
                    setSupplierToEdit(null);
                    setIsModalOpen(true);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors shadow-lg shadow-emerald-950/50"
                >
                  <span>+</span>
                  <span>Add Supplier</span>
                </button>
              )}
            </div>

            {/* Supplier Error banner */}
            {supplierError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {supplierError}
              </div>
            )}

            {/* Suppliers Table */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden relative">
              {isSupplierPending && (
                <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[1px] z-10 flex items-center justify-center">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-xs shadow-lg">
                    <span className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <span>Loading suppliers...</span>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Name</th>
                      <th className="px-4 py-3 font-semibold">Contact Person</th>
                      <th className="px-4 py-3 font-semibold">Phone</th>
                      <th className="px-4 py-3 font-semibold">Email</th>
                      <th className="px-4 py-3 font-semibold">City</th>
                      <th className="px-4 py-3 font-semibold">Payment Terms</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {suppliers.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-slate-400">No suppliers found</p>
                            <p className="text-xs text-slate-600">
                              {supplierSearch || supplierStatusFilter !== "ALL"
                                ? "Try adjusting your search criteria."
                                : "Add a supplier to start creating purchase orders."}
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      suppliers.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-900/40 transition-colors">
                          <td className="px-4 py-3 font-semibold text-white">
                            {s.name}
                            {s.taxNumber && (
                              <span className="block text-[10px] font-mono text-slate-500 font-normal">
                                NTN/Tax: {s.taxNumber}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            {s.contactPerson || "—"}
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-300">
                            {s.phone || "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            {s.email ? (
                              <a
                                href={`mailto:${s.email}`}
                                className="text-emerald-400/80 hover:text-emerald-400 underline underline-offset-2"
                              >
                                {s.email}
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            {s.city || "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            {s.paymentTerms || "—"}
                          </td>
                          <td className="px-4 py-3">
                            {s.isActive ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                                Inactive
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {initialData.canMutateSuppliers ? (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSupplierToEdit(s);
                                    setIsModalOpen(true);
                                  }}
                                  className="px-2 py-1 rounded text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleSupplierActive(s)}
                                  disabled={isSupplierPending}
                                  className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                                    s.isActive
                                      ? "text-slate-400 hover:text-rose-400 bg-slate-900 hover:bg-slate-800 border-slate-800"
                                      : "text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20"
                                  }`}
                                >
                                  {s.isActive ? "Deactivate" : "Reactivate"}
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-600 text-xs italic">Read-only</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Suppliers Pagination Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-slate-800 text-xs text-slate-400 gap-3">
                <span>
                  Showing {supplierTotalCount === 0 ? 0 : (supplierPage - 1) * supplierPageSize + 1} to{" "}
                  {Math.min(supplierPage * supplierPageSize, supplierTotalCount)} of {supplierTotalCount} suppliers
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSupplierPage((p) => Math.max(p - 1, 1))}
                    disabled={supplierPage <= 1 || isSupplierPending}
                    className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 font-medium transition-colors"
                  >
                    Previous
                  </button>
                  <span className="px-2 font-mono text-slate-300">
                    {supplierPage} / {supplierTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSupplierPage((p) => Math.min(p + 1, supplierTotalPages))}
                    disabled={supplierPage >= supplierTotalPages || isSupplierPending}
                    className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 font-medium transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Supplier Create/Edit Modal */}
        <SupplierModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={(msg) => {
            setFeedbackMessage(msg);
            refreshSuppliers(supplierPage);
          }}
          supplierToEdit={supplierToEdit}
          organizationId={initialData.organizationId}
        />

        {/* Purchase Order Create/Edit Modal */}
        <PurchaseOrderModal
          isOpen={isPurchaseModalOpen}
          onClose={() => setIsPurchaseModalOpen(false)}
          onSuccess={handlePurchaseModalSuccess}
          purchaseToEdit={purchaseToEdit}
          organizationId={initialData.organizationId}
          authorizedBranches={initialData.authorizedBranches}
          suppliers={initialData.allActiveSuppliersForFilter}
        />

        {/* Purchase Detail Drawer */}
        <PurchaseDetailDrawer
          isOpen={isDetailDrawerOpen}
          purchaseId={selectedPurchaseId}
          organizationId={initialData.organizationId}
          canMutatePurchases={initialData.canMutatePurchases}
          onClose={() => setIsDetailDrawerOpen(false)}
          onEditPurchase={handleEditPurchaseFromDrawer}
          onPurchaseUpdated={handlePurchaseDrawerUpdated}
        />
      </div>
    </main>
  );
}
