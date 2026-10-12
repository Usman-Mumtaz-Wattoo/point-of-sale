"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import {
  type BranchListItemDTO,
  type CreateBranchInput,
  type UpdateBranchInput,
} from "./types";
import {
  createBranchAction,
  updateBranchAction,
  toggleBranchStatusAction,
} from "./actions";
import { BranchModal } from "./branch-modal";

interface BranchListViewProps {
  initialBranches: BranchListItemDTO[];
  organizationId: string;
  organizationName: string;
  userEmail: string;
  userName: string;
}

export function BranchListView({
  initialBranches,
  organizationId,
  organizationName,
  userEmail,
  userName,
}: BranchListViewProps) {
  const [branches, setBranches] = useState<BranchListItemDTO[]>(initialBranches);
  const [isPending, startTransition] = useTransition();

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Notification banners
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [branchToEdit, setBranchToEdit] = useState<BranchListItemDTO | null>(null);

  // Deactivation confirmation dialog state
  const [deactivatingBranch, setDeactivatingBranch] = useState<BranchListItemDTO | null>(null);

  const activeCount = useMemo(
    () => branches.filter((b) => b.isActive).length,
    [branches]
  );
  const inactiveCount = branches.length - activeCount;

  // Filtered branches list
  const filteredBranches = useMemo(() => {
    return branches.filter((b) => {
      // Status filter
      if (statusFilter === "active" && !b.isActive) return false;
      if (statusFilter === "inactive" && b.isActive) return false;

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchesName = b.name.toLowerCase().includes(query);
        const matchesCode = b.code.toLowerCase().includes(query);
        const matchesCity = b.city?.toLowerCase().includes(query);
        const matchesAddress = b.address?.toLowerCase().includes(query);
        return matchesName || matchesCode || matchesCity || matchesAddress;
      }

      return true;
    });
  }, [branches, statusFilter, searchQuery]);

  const handleOpenCreateModal = () => {
    setBranchToEdit(null);
    setIsModalOpen(true);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleOpenEditModal = (branch: BranchListItemDTO) => {
    setBranchToEdit(branch);
    setIsModalOpen(true);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleModalSubmit = async (
    formData: CreateBranchInput | UpdateBranchInput
  ): Promise<boolean> => {
    setErrorMessage(null);
    setSuccessMessage(null);

    return new Promise((resolve) => {
      startTransition(async () => {
        if ("branchId" in formData) {
          // Edit operation
          const res = await updateBranchAction(formData, organizationId);
          if (res.success) {
            setBranches((prev) =>
              prev.map((b) => (b.id === res.data.id ? res.data : b))
            );
            setSuccessMessage(res.message || "Branch updated successfully.");
            setIsModalOpen(false);
            resolve(true);
          } else {
            setErrorMessage(res.error || "Failed to update branch.");
            resolve(false);
          }
        } else {
          // Create operation
          const res = await createBranchAction(formData, organizationId);
          if (res.success) {
            setBranches((prev) => [res.data, ...prev]);
            setSuccessMessage(res.message || "Branch created successfully.");
            setIsModalOpen(false);
            resolve(true);
          } else {
            setErrorMessage(res.error || "Failed to create branch.");
            resolve(false);
          }
        }
      });
    });
  };

  const handleToggleStatus = (branch: BranchListItemDTO) => {
    // If branch is currently active, prompt for confirmation
    if (branch.isActive) {
      setDeactivatingBranch(branch);
      return;
    }

    // Direct reactivation
    executeStatusToggle(branch.id);
  };

  const executeStatusToggle = (branchId: string) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setDeactivatingBranch(null);

    startTransition(async () => {
      const res = await toggleBranchStatusAction(branchId, organizationId);
      if (res.success) {
        setBranches((prev) =>
          prev.map((b) =>
            b.id === res.data.id ? { ...b, isActive: res.data.isActive } : b
          )
        );
        setSuccessMessage(res.message || "Branch status updated.");
      } else {
        setErrorMessage(res.error || "Failed to update branch status.");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Sub-Navigation Tabs & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Branch Administration
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Configure retail store branches, warehouses, contact channels, and document prefixes.
          </p>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs shrink-0 self-start sm:self-auto">
          <Link
            href={`/settings?org=${organizationId}`}
            className="px-3 py-1.5 rounded-lg font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            🏢 Organization Profile
          </Link>
          <Link
            href={`/settings/branches?org=${organizationId}`}
            className="px-3 py-1.5 rounded-lg font-semibold bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs transition-colors"
          >
            🏪 Branches
          </Link>
          <Link
            href={`/settings/staff?org=${organizationId}`}
            className="px-3 py-1.5 rounded-lg font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            👥 Staff & Roles
          </Link>
        </div>
      </div>

      {/* Main Content Workspace */}
      <div className="space-y-6">
        {/* Banner: Success Notification */}
        {successMessage && (
          <div
            role="status"
            className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200 text-sm shadow-xs"
          >
            <span className="text-emerald-600 dark:text-emerald-400 font-bold select-none">✓</span>
            <div className="flex-1 font-medium">{successMessage}</div>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-700 dark:text-emerald-400/80 hover:text-emerald-900 dark:hover:text-emerald-200 text-xs px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/40"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Banner: Error Notification */}
        {errorMessage && (
          <div
            role="alert"
            className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200 text-sm shadow-xs"
          >
            <span className="text-rose-600 dark:text-rose-400 font-bold select-none">⚠</span>
            <div className="flex-1 font-medium">{errorMessage}</div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-700 dark:text-rose-400/80 hover:text-rose-900 dark:hover:text-rose-200 text-xs px-2 py-0.5 rounded border border-rose-200 dark:border-rose-800/40"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Operational Overview Metrics */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Total Locations
              </span>
              <span className="text-2xl font-bold text-slate-900 dark:text-white mt-1 block">
                {branches.length}
              </span>
            </div>
            <span className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center text-lg border border-slate-200 dark:border-slate-700">
              🏪
            </span>
          </div>

          <div className="bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                Active Operational
              </span>
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 block">
                {activeCount}
              </span>
            </div>
            <span className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-lg border border-emerald-200 dark:border-emerald-500/20">
              ✓
            </span>
          </div>

          <div className="bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Deactivated
              </span>
              <span className="text-2xl font-bold text-slate-500 dark:text-slate-400 mt-1 block">
                {inactiveCount}
              </span>
            </div>
            <span className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center text-lg border border-slate-200 dark:border-slate-700">
              ⏸
            </span>
          </div>
        </section>

        {/* Action & Filter Bar */}
        <div className="bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-xs flex items-center justify-between gap-4 flex-wrap">
          {/* Search box & status filter */}
          <div className="flex items-center gap-3 flex-1 min-w-[280px]">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search branch name, code, or city..."
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
              />
              <span className="absolute left-3 top-2.5 text-slate-400 text-xs select-none">
                🔍
              </span>
            </div>

            <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-100 dark:bg-slate-900 text-xs shrink-0">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  statusFilter === "all"
                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-semibold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                All ({branches.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("active")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  statusFilter === "active"
                    ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs font-semibold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Active ({activeCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("inactive")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  statusFilter === "inactive"
                    ? "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 shadow-xs font-semibold"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Inactive ({inactiveCount})
              </button>
            </div>
          </div>

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 shrink-0"
          >
            <span>+</span>
            <span>Create New Branch</span>
          </button>
        </div>

        {/* Branches Grid */}
        {filteredBranches.length === 0 ? (
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-12 text-center space-y-3 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto text-xl">
              🏪
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">No Branches Found</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              {searchQuery
                ? `No branch records matched "${searchQuery}". Clear your search query to see all branches.`
                : "No branches are registered in this category."}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Clear Search Filter
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredBranches.map((branch) => (
              <article
                key={branch.id}
                className={`bg-white dark:bg-[#0f172a] border rounded-2xl p-5 shadow-xs transition-shadow hover:shadow-sm flex flex-col justify-between space-y-4 ${
                  branch.isActive
                    ? "border-slate-200/80 dark:border-slate-800"
                    : "border-slate-200/60 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/30 opacity-85"
                }`}
              >
                {/* Header: Title, Code, Status */}
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">{branch.name}</h3>
                        <span className="px-2 py-0.5 rounded-lg text-[11px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {branch.code}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {branch.city ? `${branch.city}, ` : ""}
                        {branch.address || "No street address recorded"}
                      </p>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase border shrink-0 ${
                        branch.isActive
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      {branch.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>

                  {/* Operational Details & Phone */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-300">
                    <div>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 block font-medium">Contact</span>
                      <span className="text-slate-900 dark:text-slate-200 font-medium">
                        {branch.phone || "—"}
                      </span>
                    </div>

                    <div>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 block font-medium">Warehouse</span>
                      <span className="text-slate-900 dark:text-slate-200 font-medium truncate block">
                        {branch.settings?.defaultWarehouseName || "Standard"}
                      </span>
                    </div>

                    <div>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 block font-medium">Invoice Prefix</span>
                      <span className="text-slate-900 dark:text-slate-200 font-mono text-[11px]">
                        {branch.settings?.invoiceNumberPrefix || "INV-"}
                      </span>
                    </div>

                    <div>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 block font-medium">Receipt Prefix</span>
                      <span className="text-slate-900 dark:text-slate-200 font-mono text-[11px]">
                        {branch.settings?.receiptNumberPrefix || "REC-"}
                      </span>
                    </div>
                  </div>

                  {/* Historical counts overview */}
                  {branch._count && (
                    <div className="mt-3 py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        Orders: <strong className="text-slate-800 dark:text-slate-200 font-semibold">{branch._count.sales}</strong>
                      </span>
                      <span>
                        Stock Items: <strong className="text-slate-800 dark:text-slate-200 font-semibold">{branch._count.inventoryStocks}</strong>
                      </span>
                      <span>
                        Assigned Staff: <strong className="text-slate-800 dark:text-slate-200 font-semibold">{branch._count.memberships}</strong>
                      </span>
                    </div>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    Created: {new Date(branch.createdAt).toLocaleDateString()}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(branch)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-2xs"
                    >
                      Edit Details
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleStatus(branch)}
                      disabled={isPending}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors shadow-2xs disabled:opacity-50 ${
                        branch.isActive
                          ? "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20 hover:bg-rose-100/70 dark:hover:bg-rose-500/20"
                          : "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 hover:bg-emerald-100/70 dark:hover:bg-emerald-500/20"
                      }`}
                    >
                      {branch.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Branch Modal Dialog */}
      <BranchModal
        isOpen={isModalOpen}
        branchToEdit={branchToEdit}
        isPending={isPending}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleModalSubmit}
      />

      {/* Deactivation Confirmation Dialog */}
      {deactivatingBranch && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="deactivate-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
        >
          <div className="w-full max-w-md bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <span className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 flex items-center justify-center text-lg select-none">
                ⚠️
              </span>
              <div>
                <h3 id="deactivate-dialog-title" className="text-base font-bold text-slate-900 dark:text-white">
                  Deactivate &ldquo;{deactivatingBranch.name}&rdquo;?
                </h3>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 uppercase">
                  Code: {deactivatingBranch.code}
                </span>
              </div>
            </div>

            {activeCount <= 1 ? (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-xs text-amber-800 dark:text-amber-200 space-y-1">
                <strong className="block font-bold">Action Restricted:</strong>
                <p>
                  This is the only active branch for your business. Your organization must maintain
                  at least one active branch to operate POS registers and process sales.
                </p>
              </div>
            ) : (
              <div className="text-xs text-slate-600 dark:text-slate-400 space-y-2 leading-relaxed">
                <p>
                  Deactivating this branch will prevent staff from operating the POS register or
                  processing new sales and receipts at this location.
                </p>
                <p className="text-slate-500 dark:text-slate-500">
                  Existing historical sales records, returns, and inventory stock movements remain
                  completely preserved and searchable in reports.
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDeactivatingBranch(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending || activeCount <= 1}
                onClick={() => executeStatusToggle(deactivatingBranch.id)}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? "Processing..." : "Confirm Deactivation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
