"use client";

import { useState, useEffect } from "react";
import {
  type SerializedSupplier,
  type CreateSupplierInputDTO,
  type UpdateSupplierInputDTO,
} from "./types";
import { createSupplierAction, updateSupplierAction } from "./actions";

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  supplierToEdit?: SerializedSupplier | null;
  organizationId: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function SupplierModalContent({
  onClose,
  onSuccess,
  supplierToEdit,
  organizationId,
}: {
  onClose: () => void;
  onSuccess: (message: string) => void;
  supplierToEdit?: SerializedSupplier | null;
  organizationId: string;
}) {
  const isEdit = Boolean(supplierToEdit);

  const [name, setName] = useState(supplierToEdit?.name || "");
  const [contactPerson, setContactPerson] = useState(supplierToEdit?.contactPerson || "");
  const [email, setEmail] = useState(supplierToEdit?.email || "");
  const [phone, setPhone] = useState(supplierToEdit?.phone || "");
  const [address, setAddress] = useState(supplierToEdit?.address || "");
  const [city, setCity] = useState(supplierToEdit?.city || "");
  const [taxNumber, setTaxNumber] = useState(supplierToEdit?.taxNumber || "");
  const [paymentTerms, setPaymentTerms] = useState(supplierToEdit?.paymentTerms || "");
  const [notes, setNotes] = useState(supplierToEdit?.notes || "");
  const [isActive, setIsActive] = useState(supplierToEdit ? supplierToEdit.isActive : true);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSubmitting, onClose]);

  function validate(): boolean {
    const errors: Record<string, string> = {};
    const trimmedName = name.trim();

    if (!trimmedName) {
      errors.name = "Supplier name is required.";
    } else if (trimmedName.length > 150) {
      errors.name = "Name cannot exceed 150 characters.";
    }

    if (contactPerson.trim().length > 100) {
      errors.contactPerson = "Contact person cannot exceed 100 characters.";
    }

    const trimmedEmail = email.trim();
    if (trimmedEmail) {
      if (trimmedEmail.length > 150) {
        errors.email = "Email cannot exceed 150 characters.";
      } else if (!EMAIL_REGEX.test(trimmedEmail)) {
        errors.email = "Invalid email format (e.g. supplier@example.com).";
      }
    }

    if (phone.trim().length > 50) {
      errors.phone = "Phone cannot exceed 50 characters.";
    }
    if (address.trim().length > 255) {
      errors.address = "Address cannot exceed 255 characters.";
    }
    if (city.trim().length > 100) {
      errors.city = "City cannot exceed 100 characters.";
    }
    if (taxNumber.trim().length > 50) {
      errors.taxNumber = "Tax number cannot exceed 50 characters.";
    }
    if (paymentTerms.trim().length > 100) {
      errors.paymentTerms = "Payment terms cannot exceed 100 characters.";
    }
    if (notes.trim().length > 1000) {
      errors.notes = "Notes cannot exceed 1000 characters.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGeneralError(null);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEdit && supplierToEdit) {
        const payload: UpdateSupplierInputDTO = {
          name: name.trim(),
          contactPerson: contactPerson.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          city: city.trim() || null,
          taxNumber: taxNumber.trim() || null,
          paymentTerms: paymentTerms.trim() || null,
          notes: notes.trim() || null,
          isActive,
        };

        const res = await updateSupplierAction(supplierToEdit.id, payload, {
          organizationId,
        });

        if (!res.success) {
          setGeneralError(res.error || "Failed to update supplier.");
          setIsSubmitting(false);
          return;
        }

        onSuccess(res.message || "Supplier updated successfully.");
        onClose();
      } else {
        const payload: CreateSupplierInputDTO = {
          name: name.trim(),
          contactPerson: contactPerson.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          city: city.trim() || null,
          taxNumber: taxNumber.trim() || null,
          paymentTerms: paymentTerms.trim() || null,
          notes: notes.trim() || null,
          isActive: true,
        };

        const res = await createSupplierAction(payload, { organizationId });

        if (!res.success) {
          setGeneralError(res.error || "Failed to create supplier.");
          setIsSubmitting(false);
          return;
        }

        onSuccess(res.message || "Supplier created successfully.");
        onClose();
      }
    } catch {
      setGeneralError("An unexpected network error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm font-semibold">
              🏢
            </div>
            <div>
              <h2 id="modal-title" className="text-base font-semibold text-white">
                {isEdit ? "Edit Supplier" : "Add New Supplier"}
              </h2>
              <p className="text-xs text-slate-400">
                {isEdit
                  ? "Update vendor contact details and payment conditions."
                  : "Register a vendor to supply goods and generate purchase orders."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {generalError && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2">
              <span className="font-bold text-sm">⚠</span>
              <span>{generalError}</span>
            </div>
          )}

          {/* Supplier Name */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Supplier / Company Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Supplies Pvt Ltd"
              maxLength={150}
              disabled={isSubmitting}
              className={`w-full px-3 py-2 text-sm rounded-lg bg-slate-950 border ${
                fieldErrors.name ? "border-rose-500/80 focus:ring-rose-500" : "border-slate-800 focus:border-emerald-500"
              } text-white placeholder-slate-500 focus:outline-none focus:ring-1 transition-colors`}
            />
            {fieldErrors.name && (
              <p className="mt-1 text-xs text-rose-400">{fieldErrors.name}</p>
            )}
          </div>

          {/* Contact Person & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Contact Person
              </label>
              <input
                type="text"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="e.g. Jane Doe"
                maxLength={100}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-sm rounded-lg bg-slate-950 border border-slate-800 focus:border-emerald-500 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
              {fieldErrors.contactPerson && (
                <p className="mt-1 text-xs text-rose-400">{fieldErrors.contactPerson}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Phone Number
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +92 300 1234567"
                maxLength={50}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-sm rounded-lg bg-slate-950 border border-slate-800 focus:border-emerald-500 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
              {fieldErrors.phone && (
                <p className="mt-1 text-xs text-rose-400">{fieldErrors.phone}</p>
              )}
            </div>
          </div>

          {/* Email & City */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. contact@supplier.com"
                maxLength={150}
                disabled={isSubmitting}
                className={`w-full px-3 py-2 text-sm rounded-lg bg-slate-950 border ${
                  fieldErrors.email ? "border-rose-500/80 focus:ring-rose-500" : "border-slate-800 focus:border-emerald-500"
                } text-white placeholder-slate-500 focus:outline-none focus:ring-1 transition-colors`}
              />
              {fieldErrors.email && (
                <p className="mt-1 text-xs text-rose-400">{fieldErrors.email}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                City / Region
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Lahore, Karachi"
                maxLength={100}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-sm rounded-lg bg-slate-950 border border-slate-800 focus:border-emerald-500 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
              {fieldErrors.city && (
                <p className="mt-1 text-xs text-rose-400">{fieldErrors.city}</p>
              )}
            </div>
          </div>

          {/* Physical Address */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Physical Address
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 123 Industrial Estate, Phase 2"
              maxLength={255}
              disabled={isSubmitting}
              className="w-full px-3 py-2 text-sm rounded-lg bg-slate-950 border border-slate-800 focus:border-emerald-500 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
            />
            {fieldErrors.address && (
              <p className="mt-1 text-xs text-rose-400">{fieldErrors.address}</p>
            )}
          </div>

          {/* Tax Number & Payment Terms */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Tax / NTN / STRN #
              </label>
              <input
                type="text"
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value)}
                placeholder="e.g. 1234567-8"
                maxLength={50}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-sm rounded-lg bg-slate-950 border border-slate-800 focus:border-emerald-500 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
              {fieldErrors.taxNumber && (
                <p className="mt-1 text-xs text-rose-400">{fieldErrors.taxNumber}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Payment Terms
              </label>
              <input
                type="text"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="e.g. Net 30, Cash on Delivery"
                maxLength={100}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-sm rounded-lg bg-slate-950 border border-slate-800 focus:border-emerald-500 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
              {fieldErrors.paymentTerms && (
                <p className="mt-1 text-xs text-rose-400">{fieldErrors.paymentTerms}</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Internal Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Preferred supplier for raw packaging. Weekly delivery on Mondays."
              maxLength={1000}
              rows={3}
              disabled={isSubmitting}
              className="w-full px-3 py-2 text-sm rounded-lg bg-slate-950 border border-slate-800 focus:border-emerald-500 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors resize-none"
            />
            {fieldErrors.notes && (
              <p className="mt-1 text-xs text-rose-400">{fieldErrors.notes}</p>
            )}
          </div>

          {/* Active Status (Edit Mode only) */}
          {isEdit && (
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-slate-200 block">
                  Supplier Active Status
                </span>
                <span className="text-xs text-slate-400">
                  Inactive suppliers cannot be selected on new purchase orders.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                disabled={isSubmitting}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  isActive ? "bg-emerald-600" : "bg-slate-700"
                }`}
                role="switch"
                aria-checked={isActive}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isActive ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          )}

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shadow-lg shadow-emerald-950/50"
            >
              {isSubmitting && (
                <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              )}
              {isEdit ? "Save Changes" : "Create Supplier"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function SupplierModal({
  isOpen,
  onClose,
  onSuccess,
  supplierToEdit,
  organizationId,
}: SupplierModalProps) {
  if (!isOpen) return null;

  return (
    <SupplierModalContent
      key={supplierToEdit ? supplierToEdit.id : "new-supplier"}
      onClose={onClose}
      onSuccess={onSuccess}
      supplierToEdit={supplierToEdit}
      organizationId={organizationId}
    />
  );
}
