"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { User, Search, Check, X, UserCheck } from "lucide-react";
import { CustomerSearchResultDTO } from "@/lib/customers";
import { searchCustomersAction } from "@/app/customers/actions";

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

  // Debounced search when query changes
  useEffect(() => {
    const trimmed = searchQuery.trim();
    const timer = setTimeout(() => {
      if (trimmed.length < 2) {
        setResults([]);
        return;
      }
      startSearch(async () => {
        const matching = await searchCustomersAction(trimmed, organizationId);
        setResults(matching);
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, organizationId]);

  const handleSelect = (customer: CustomerSearchResultDTO) => {
    onSelectCustomer(customer);
    setIsOpen(false);
    setSearchQuery("");
    setResults([]);
  };

  const handleClear = () => {
    onSelectCustomer(null);
    setSearchQuery("");
    setResults([]);
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
                className="px-2 py-1 text-[11px] font-medium rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
              >
                Clear
              </button>
            )}

            <button
              type="button"
              disabled={disabled}
              onClick={() => setIsOpen((prev) => !prev)}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30 transition-colors"
            >
              {selectedCustomer ? "Change" : "+ Customer"}
            </button>
          </div>
        </div>
      </div>

      {/* Autocomplete Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 z-40 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-3 space-y-2">
          {/* Quick Search Input */}
          <div className="relative">
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone, email, or code..."
              className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          </div>

          {/* Customer list options */}
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {/* Walk-in shortcut button */}
            <button
              type="button"
              onClick={handleClear}
              className="w-full text-left p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 flex items-center justify-between text-slate-700 dark:text-slate-300 transition-colors"
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
            ) : searchQuery.trim().length >= 2 && results.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-xs">
                No active customer matches &quot;{searchQuery}&quot;.
              </div>
            ) : (
              results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c)}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 flex items-center justify-between text-slate-700 dark:text-slate-300 transition-colors"
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
    </div>
  );
}
