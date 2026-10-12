"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { User, Search, Check, X, UserPlus, Phone, Mail, MapPin, Loader2, AlertCircle } from "lucide-react";
import { CustomerSearchResultDTO } from "@/lib/customers";
import { searchCustomersAction, createCustomerAction } from "@/app/customers/actions";

export interface PosCustomerSelectorProps {
  organizationId: string;
  selectedCustomer: CustomerSearchResultDTO | null;
  onSelectCustomer: (customer: CustomerSearchResultDTO | null) => void;
  disabled?: boolean;
}

export function PosCustomerSelector({
  organizationId,
  selectedCustomer,
  onSelectCustomer,
  disabled = false,
}: PosCustomerSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<CustomerSearchResultDTO[]>([]);
  const [isSearching, startSearch] = useTransition();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // New customer creation modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmittingNewCustomer, setIsSubmittingNewCustomer] = useState(false);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch initial active customers when opening
  useEffect(() => {
    if (isOpen) {
      startSearch(async () => {
        const matching = await searchCustomersAction(searchQuery.trim(), organizationId);
        setResults(matching);
      });
    }
  }, [isOpen, organizationId]);

  // Debounced search when query changes
  useEffect(() => {
    if (!isOpen) return;
    const trimmed = searchQuery.trim();
    const timer = setTimeout(() => {
      startSearch(async () => {
        const matching = await searchCustomersAction(trimmed, organizationId);
        setResults(matching);
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, organizationId, isOpen]);

  const handleSelect = (customer: CustomerSearchResultDTO) => {
    onSelectCustomer(customer);
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleClear = () => {
    onSelectCustomer(null);
    setSearchQuery("");
  };

  const handleCreateCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newName.trim();
    if (!trimmedName) {
      setFormError("Customer name is required.");
      return;
    }

    setFormError(null);
    setIsSubmittingNewCustomer(true);

    try {
      const formData = new FormData();
      formData.set("name", trimmedName);
      if (newPhone.trim()) formData.set("phone", newPhone.trim());
      if (newEmail.trim()) formData.set("email", newEmail.trim());
      if (newAddress.trim()) formData.set("address", newAddress.trim());
      formData.set("organizationId", organizationId);

      const res = await createCustomerAction(null, formData, { organizationId });

      if (res.error) {
        setFormError(res.error);
        setIsSubmittingNewCustomer(false);
        return;
      }

      if (res.customer) {
        const createdCustomer: CustomerSearchResultDTO = {
          id: res.customer.id,
          name: res.customer.name,
          code: res.customer.code,
          phone: res.customer.phone,
          email: res.customer.email,
        };

        // Select newly created customer immediately
        onSelectCustomer(createdCustomer);
        setIsCreateModalOpen(false);
        setIsOpen(false);
        setNewName("");
        setNewPhone("");
        setNewEmail("");
        setNewAddress("");
        setFormError(null);
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create customer.");
    } finally {
      setIsSubmittingNewCustomer(false);
    }
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Customer Account
        </label>
        {selectedCustomer && (
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
            <Check className="w-3 h-3" /> Assigned
          </span>
        )}
      </div>

      {/* Selected Customer / Walk-in Bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 flex items-center justify-between shadow-2xs">
          {selectedCustomer ? (
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/20 font-bold text-xs">
                {selectedCustomer.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="truncate">
                <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {selectedCustomer.name}
                  {selectedCustomer.code && (
                    <span className="ml-1 text-[11px] font-mono text-indigo-600 dark:text-indigo-400">
                      (#{selectedCustomer.code})
                    </span>
                  )}
                </div>
                {(selectedCustomer.phone || selectedCustomer.email) && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {selectedCustomer.phone || selectedCustomer.email}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 text-slate-600 dark:text-slate-300">
              <div className="w-8 h-8 rounded-full bg-slate-200/70 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-500">
                <User className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">Walk-in Customer</span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 block">Default guest sale</span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {selectedCustomer && (
              <button
                type="button"
                disabled={disabled}
                onClick={handleClear}
                title="Reset to Walk-in Customer"
                className="px-2 py-1 text-[11px] font-medium rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}

            <button
              type="button"
              disabled={disabled}
              onClick={() => setIsOpen((prev) => !prev)}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30 transition-colors cursor-pointer"
            >
              {selectedCustomer ? "Change" : "+ Customer"}
            </button>
          </div>
        </div>
      </div>

      {/* Autocomplete Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 z-40 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-3 space-y-2">
          {/* Action Row: Quick Search Input + Add New Customer Button */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search active customers..."
                className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            </div>

            <button
              type="button"
              onClick={() => {
                setIsCreateModalOpen(true);
                setFormError(null);
              }}
              className="px-2.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs shrink-0"
              title="Add New Customer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ New</span>
            </button>
          </div>

          {/* Customer list options */}
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {/* Walk-in shortcut button */}
            <button
              type="button"
              onClick={handleClear}
              className="w-full text-left p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 flex items-center justify-between text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                  <User className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">Walk-in Customer</div>
                  <div className="text-[10px] text-slate-400">Anonymous standard sale</div>
                </div>
              </div>
              {!selectedCustomer && (
                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">Selected</span>
              )}
            </button>

            {isSearching ? (
              <div className="p-4 text-center text-slate-400 text-xs">
                <span className="inline-block w-3.5 h-3.5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mr-2" />
                Searching active customers...
              </div>
            ) : results.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-xs space-y-1">
                <p>No customers match &quot;{searchQuery}&quot;.</p>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(true)}
                  className="text-indigo-600 dark:text-indigo-400 font-semibold underline text-xs"
                >
                  Create &quot;{searchQuery}&quot; as new customer
                </button>
              </div>
            ) : (
              results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c)}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 flex items-center justify-between text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  <div className="truncate pr-2">
                    <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 truncate">
                      <span>{c.name}</span>
                      {c.code && (
                        <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400">#{c.code}</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {c.phone && <span>📞 {c.phone} </span>}
                      {c.email && <span>✉️ {c.email}</span>}
                    </div>
                  </div>
                  {selectedCustomer?.id === c.id && (
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Selected
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Add New Customer Modal */}
      {isCreateModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-customer-title"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 id="new-customer-title" className="text-sm font-bold text-slate-900 dark:text-white">
                    Add New Customer
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Create account and assign to current POS cart
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomerSubmit} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Fatima Ali"
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-slate-400" /> Phone
                  </label>
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+92 300 1234567"
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <Mail className="w-3 h-3 text-slate-400" /> Email
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="customer@example.pk"
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-400" /> Address / City
                </label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="e.g. Model Town, Lahore"
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNewCustomer}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-md shadow-indigo-950/20 disabled:opacity-50"
                >
                  {isSubmittingNewCustomer ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving Customer...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Save & Select Customer
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
