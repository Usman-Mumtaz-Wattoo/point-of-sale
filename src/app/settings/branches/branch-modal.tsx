"use client";

import { useState, useEffect } from "react";
import { type BranchListItemDTO, type CreateBranchInput, type UpdateBranchInput } from "./types";

interface BranchModalProps {
  isOpen: boolean;
  branchToEdit: BranchListItemDTO | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (formData: CreateBranchInput | UpdateBranchInput) => Promise<boolean>;
}

export function BranchModal(props: BranchModalProps) {
  if (!props.isOpen) return null;
  // Keying by branch ID ensures clean state initialization without an effect
  return <BranchModalContent key={props.branchToEdit?.id ?? "new"} {...props} />;
}

function BranchModalContent({
  branchToEdit,
  isPending,
  onClose,
  onSubmit,
}: BranchModalProps) {
  const isEditing = Boolean(branchToEdit);

  const [formData, setFormData] = useState(() => ({
    name: branchToEdit?.name ?? "",
    code: branchToEdit?.code ?? "",
    address: branchToEdit?.address ?? "",
    city: branchToEdit?.city ?? "",
    phone: branchToEdit?.phone ?? "",
    invoiceNumberPrefix: branchToEdit?.settings?.invoiceNumberPrefix ?? "",
    receiptNumberPrefix: branchToEdit?.settings?.receiptNumberPrefix ?? "",
    defaultWarehouseName: branchToEdit?.settings?.defaultWarehouseName ?? "",
  }));

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [modalError, setModalError] = useState<string | null>(null);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPending, onClose]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "code" ? value.toUpperCase() : value,
    }));

    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setFieldErrors({});

    // Client-side preflight check
    const errors: Record<string, string> = {};
    if (!formData.name.trim() || formData.name.trim().length < 2) {
      errors.name = "Branch name must be at least 2 characters.";
    }
    if (!formData.code.trim()) {
      errors.code = "Branch code is required.";
    } else if (!/^[A-Za-z0-9_-]+$/.test(formData.code.trim())) {
      errors.code = "Code can only contain letters, numbers, hyphens, and underscores.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const payload = isEditing
      ? ({
          branchId: branchToEdit!.id,
          name: formData.name.trim(),
          code: formData.code.trim().toUpperCase(),
          address: formData.address.trim() || null,
          city: formData.city.trim() || null,
          phone: formData.phone.trim() || null,
          invoiceNumberPrefix: formData.invoiceNumberPrefix.trim() || null,
          receiptNumberPrefix: formData.receiptNumberPrefix.trim() || null,
          defaultWarehouseName: formData.defaultWarehouseName.trim() || null,
        } as UpdateBranchInput)
      : ({
          name: formData.name.trim(),
          code: formData.code.trim().toUpperCase(),
          address: formData.address.trim() || null,
          city: formData.city.trim() || null,
          phone: formData.phone.trim() || null,
          invoiceNumberPrefix: formData.invoiceNumberPrefix.trim() || null,
          receiptNumberPrefix: formData.receiptNumberPrefix.trim() || null,
          defaultWarehouseName: formData.defaultWarehouseName.trim() || null,
        } as CreateBranchInput);

    await onSubmit(payload);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="branch-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto"
    >
      <div className="w-full max-w-lg bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-base font-semibold border border-indigo-200 dark:border-indigo-500/20">
              🏪
            </span>
            <div>
              <h2 id="branch-modal-title" className="text-base font-semibold text-slate-900 dark:text-white">
                {isEditing ? `Edit Branch: ${branchToEdit?.name}` : "Create New Branch"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isEditing
                  ? "Update location, contact details, and document prefixes."
                  : "Add an operational retail store or warehouse location."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-sm transition-colors disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            {modalError && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-200 text-xs font-medium"
              >
                {modalError}
              </div>
            )}

            {/* Name & Code */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="branch-name"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Branch Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="branch-name"
                  name="name"
                  type="text"
                  required
                  autoFocus
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g. Downtown Outlet"
                  className={`w-full px-3.5 py-2 text-sm rounded-xl border bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 transition-colors ${
                    fieldErrors.name
                      ? "border-rose-300 dark:border-rose-600 focus:ring-rose-500/20"
                      : "border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-indigo-500/20"
                  }`}
                />
                {fieldErrors.name && (
                  <p role="alert" className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                    {fieldErrors.name}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="branch-code"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Branch Code <span className="text-rose-500">*</span>
                </label>
                <input
                  id="branch-code"
                  name="code"
                  type="text"
                  required
                  value={formData.code}
                  onChange={handleChange}
                  placeholder="e.g. DWTN-01"
                  className={`w-full px-3.5 py-2 text-sm font-mono uppercase rounded-xl border bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 transition-colors ${
                    fieldErrors.code
                      ? "border-rose-300 dark:border-rose-600 focus:ring-rose-500/20"
                      : "border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-indigo-500/20"
                  }`}
                />
                {fieldErrors.code ? (
                  <p role="alert" className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                    {fieldErrors.code}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">Unique code (max 20).</p>
                )}
              </div>
            </div>

            {/* Address */}
            <div className="space-y-1.5">
              <label
                htmlFor="branch-address"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Physical Address
              </label>
              <input
                id="branch-address"
                name="address"
                type="text"
                value={formData.address}
                onChange={handleChange}
                placeholder="e.g. Shop # 14, Commercial Center"
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
              />
            </div>

            {/* City & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="branch-city"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  City
                </label>
                <input
                  id="branch-city"
                  name="city"
                  type="text"
                  value={formData.city}
                  onChange={handleChange}
                  placeholder="e.g. Lahore"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="branch-phone"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Contact Phone
                </label>
                <input
                  id="branch-phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="e.g. +92 42 1234567"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
                />
              </div>
            </div>

            {/* Document Settings Section */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2.5">
                Document & Warehouse Preferences (Optional)
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label
                    htmlFor="branch-inv-prefix"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
                  >
                    Invoice Prefix
                  </label>
                  <input
                    id="branch-inv-prefix"
                    name="invoiceNumberPrefix"
                    type="text"
                    value={formData.invoiceNumberPrefix}
                    onChange={handleChange}
                    placeholder="e.g. INV-DWTN-"
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="branch-rec-prefix"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
                  >
                    Receipt Prefix
                  </label>
                  <input
                    id="branch-rec-prefix"
                    name="receiptNumberPrefix"
                    type="text"
                    value={formData.receiptNumberPrefix}
                    onChange={handleChange}
                    placeholder="e.g. REC-DWTN-"
                    className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="branch-wh-name"
                    className="block text-[11px] font-medium text-slate-600 dark:text-slate-400"
                  >
                    Default Warehouse
                  </label>
                  <input
                    id="branch-wh-name"
                    name="defaultWarehouseName"
                    type="text"
                    value={formData.defaultWarehouseName}
                    onChange={handleChange}
                    placeholder="e.g. Main Store"
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isPending && (
                <span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              )}
              <span>{isEditing ? "Save Changes" : "Create Branch"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
