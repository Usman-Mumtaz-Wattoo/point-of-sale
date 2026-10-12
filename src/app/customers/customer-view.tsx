"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CustomerDTO } from "@/lib/customers";
import { CustomerForm } from "./customer-form";
import { setCustomerActiveStatusAction, CustomerActionResult } from "./actions";

interface BranchOption {
  id: string;
  name: string;
  code: string;
}

interface CustomerViewProps {
  organizationId: string;
  organizationName: string;
  userRole: string;
  canMutate: boolean;
  canChangeStatus: boolean;
  branches: BranchOption[];
  customers: CustomerDTO[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  currentSearch?: string;
  currentStatus?: string;
}

export function CustomerView({
  organizationId,
  canMutate,
  canChangeStatus,
  branches,
  customers,
  pagination,
  currentSearch = "",
  currentStatus = "all",
}: CustomerViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState(currentSearch);
  const [statusFilter, setStatusFilter] = useState(currentStatus);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerDTO | null>(null);
  const [statusTargetCustomer, setStatusTargetCustomer] = useState<CustomerDTO | null>(null);

  // Notifications
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const updateFilters = (newSearch: string, newStatus: string, newPage = 1) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newSearch.trim()) {
      params.set("search", newSearch.trim());
    } else {
      params.delete("search");
    }

    if (newStatus && newStatus !== "all") {
      params.set("status", newStatus);
    } else {
      params.delete("status");
    }

    if (newPage > 1) {
      params.set("page", String(newPage));
    } else {
      params.delete("page");
    }

    startTransition(() => {
      router.push(`/customers?${params.toString()}`);
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters(searchTerm, statusFilter, 1);
  };

  const handleStatusFilterChange = (newStatus: string) => {
    setStatusFilter(newStatus);
    updateFilters(searchTerm, newStatus, 1);
  };

  const handleToggleStatus = async () => {
    if (!statusTargetCustomer) return;
    const newStatus = !statusTargetCustomer.isActive;

    startTransition(async () => {
      try {
        const result = await setCustomerActiveStatusAction(
          statusTargetCustomer.id,
          newStatus,
          organizationId
        );

        if (result.error) {
          setNotification({ type: "error", message: result.error });
        } else {
          setNotification({
            type: "success",
            message: result.message || `Customer status updated.`,
          });
          setStatusTargetCustomer(null);
          router.refresh();
        }
      } catch (err: unknown) {
        setNotification({
          type: "error",
          message: err instanceof Error ? err.message : "Failed to change customer status.",
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Flash notification */}
      {notification && (
        <div
          className={`p-3 text-xs rounded-xl flex items-center justify-between shadow-xs ${
            notification.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
              : "bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-400"
          }`}
        >
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 ml-3 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Action Toolbar */}
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between shadow-xs">
        {/* Search & Filter Form */}
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap flex-1 gap-3 w-full">
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, phone, email, or code..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => handleStatusFilterChange("all")}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                statusFilter === "all"
                  ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => handleStatusFilterChange("active")}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                statusFilter === "active"
                  ? "bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => handleStatusFilterChange("inactive")}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                statusFilter === "inactive"
                  ? "bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              Inactive
            </button>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          >
            Apply
          </button>
        </form>

        {/* Create Customer CTA */}
        {canMutate && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-xs shrink-0 w-full sm:w-auto justify-center cursor-pointer"
          >
            <span>+</span> Add Customer
          </button>
        )}
      </div>

      {/* Customers Table / List */}
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        {customers.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center mx-auto text-xl text-slate-400">
              👥
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">No Customers Found</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              {currentSearch || currentStatus !== "all"
                ? "No customer profiles match your current search or status filters."
                : "You have not added any registered customers yet. Walk-in sales are always available."}
            </p>
            {canMutate && !currentSearch && currentStatus === "all" && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-xs cursor-pointer"
                >
                  Create First Customer
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Primary Branch</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors">
                    {/* Name & Code */}
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-white">{c.name}</div>
                      {c.code && (
                        <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-mono">
                          #{c.code}
                        </div>
                      )}
                      {c.city && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{c.city}</div>
                      )}
                    </td>

                    {/* Contact */}
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      {c.phone && <div>📞 {c.phone}</div>}
                      {c.email && (
                        <div className="text-slate-500 dark:text-slate-400 text-[11px]">✉️ {c.email}</div>
                      )}
                      {!c.phone && !c.email && (
                        <span className="text-slate-400 dark:text-slate-600 italic">None provided</span>
                      )}
                    </td>

                    {/* Primary Branch */}
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      {c.primaryBranch ? (
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                            {c.primaryBranch.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500 text-[11px]">All Branches</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      {c.isActive ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20">
                          Inactive
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canMutate && (
                          <button
                            type="button"
                            onClick={() => setEditingCustomer(c)}
                            className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                          >
                            Edit
                          </button>
                        )}

                        {canChangeStatus && (
                          <button
                            type="button"
                            onClick={() => setStatusTargetCustomer(c)}
                            className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors cursor-pointer ${
                              c.isActive
                                ? "bg-slate-100 dark:bg-slate-900 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/30 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                                : "bg-slate-100 dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                            }`}
                          >
                            {c.isActive ? "Deactivate" : "Activate"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 bg-slate-50/80 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <div>
              Showing page <strong className="text-slate-800 dark:text-slate-200">{pagination.page}</strong> of{" "}
              <strong className="text-slate-800 dark:text-slate-200">{pagination.totalPages}</strong> (
              <span className="text-slate-700 dark:text-slate-300">{pagination.total}</span> customers)
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pagination.page <= 1 || isPending}
                onClick={() => updateFilters(searchTerm, statusFilter, pagination.page - 1)}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
              >
                &larr; Previous
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages || isPending}
                onClick={() => updateFilters(searchTerm, statusFilter, pagination.page + 1)}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
              >
                Next &rarr;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CREATE CUSTOMER MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Create New Customer</h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <CustomerForm
              organizationId={organizationId}
              branches={branches}
              onCancel={() => setShowCreateModal(false)}
              onSuccess={(result: CustomerActionResult) => {
                setShowCreateModal(false);
                setNotification({
                  type: "success",
                  message: result.message || "Customer created successfully.",
                });
                router.refresh();
              }}
            />
          </div>
        </div>
      )}

      {/* EDIT CUSTOMER MODAL */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Edit Customer Profile</h2>
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <CustomerForm
              customer={editingCustomer}
              organizationId={organizationId}
              branches={branches}
              onCancel={() => setEditingCustomer(null)}
              onSuccess={(result: CustomerActionResult) => {
                setEditingCustomer(null);
                setNotification({
                  type: "success",
                  message: result.message || "Customer updated successfully.",
                });
                router.refresh();
              }}
            />
          </div>
        </div>
      )}

      {/* ACTIVATE / DEACTIVATE CONFIRMATION MODAL */}
      {statusTargetCustomer && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {statusTargetCustomer.isActive ? "Deactivate Customer?" : "Reactivate Customer?"}
            </h3>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {statusTargetCustomer.isActive ? (
                <>
                  Are you sure you want to deactivate{" "}
                  <strong className="text-slate-900 dark:text-white">{statusTargetCustomer.name}</strong>?
                  <br />
                  <br />
                  Deactivating this customer will preserve all historical sales and receipts, but
                  they will be <strong>hidden from POS customer search</strong> and cannot be
                  assigned to new sales until reactivated.
                </>
              ) : (
                <>
                  Are you sure you want to reactivate{" "}
                  <strong className="text-slate-900 dark:text-white">{statusTargetCustomer.name}</strong>?
                  <br />
                  <br />
                  This customer will immediately reappear in POS search and become available for
                  new transactions across all branches.
                </>
              )}
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setStatusTargetCustomer(null)}
                className="px-3.5 py-1.5 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleToggleStatus}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg text-white transition-colors cursor-pointer ${
                  statusTargetCustomer.isActive
                    ? "bg-rose-600 hover:bg-rose-500"
                    : "bg-indigo-600 hover:bg-indigo-500"
                }`}
              >
                {isPending ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    Updating...
                  </>
                ) : statusTargetCustomer.isActive ? (
                  "Yes, Deactivate"
                ) : (
                  "Yes, Reactivate"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
