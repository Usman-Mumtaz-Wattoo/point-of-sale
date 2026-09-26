"use client";

import { useState, useEffect, useRef, useTransition } from "react";
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
      <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
        Customer
      </label>

      {/* Selected state vs Walk-in display */}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 flex items-center justify-between">
          {selectedCustomer ? (
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <div className="truncate">
                <div className="text-xs font-semibold text-white truncate">
                  {selectedCustomer.name}
                  {selectedCustomer.code && (
                    <span className="ml-1 text-[11px] font-mono text-emerald-400">
                      (#{selectedCustomer.code})
                    </span>
                  )}
                </div>
                {(selectedCustomer.phone || selectedCustomer.email) && (
                  <div className="text-[10px] text-slate-400 truncate">
                    {selectedCustomer.phone || selectedCustomer.email}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-300">
              <span className="text-sm">🚶</span>
              <div>
                <span className="text-xs font-medium text-slate-200">Walk-in Customer</span>
                <span className="text-[10px] text-slate-500 block">Standard anonymous sale</span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-1 shrink-0 ml-2">
            {selectedCustomer && (
              <button
                type="button"
                disabled={disabled}
                onClick={handleClear}
                title="Reset to Walk-in Customer"
                className="px-2 py-1 text-[11px] font-medium rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              >
                Clear
              </button>
            )}

            <button
              type="button"
              disabled={disabled}
              onClick={() => setIsOpen((prev) => !prev)}
              className="px-2.5 py-1 text-xs font-medium rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition-colors"
            >
              {selectedCustomer ? "Change" : "Find Customer"}
            </button>
          </div>
        </div>
      </div>

      {/* Autocomplete Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-3 space-y-2">
          {/* Quick Search Input */}
          <div className="relative">
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search active customer by name, phone, email, or code..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
            <span className="absolute left-2.5 top-2 text-slate-500 text-xs">🔍</span>
          </div>

          {/* Quick options or search status */}
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-800/80 text-xs">
            {/* Walk-in shortcut button */}
            <button
              type="button"
              onClick={handleClear}
              className="w-full text-left p-2 rounded-lg hover:bg-slate-900 flex items-center justify-between text-slate-300 hover:text-white transition-colors"
            >
              <div className="flex items-center gap-2">
                <span>🚶</span>
                <div>
                  <div className="font-semibold text-slate-200">Walk-in Customer</div>
                  <div className="text-[10px] text-slate-500">Anonymous / No registered profile</div>
                </div>
              </div>
              {!selectedCustomer && (
                <span className="text-[10px] font-semibold text-emerald-400">Selected</span>
              )}
            </button>

            {isSearching ? (
              <div className="p-3 text-center text-slate-400 text-xs">
                <span className="inline-block w-3 h-3 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin mr-2" />
                Searching active customers...
              </div>
            ) : searchQuery.trim().length >= 2 && results.length === 0 ? (
              <div className="p-3 text-center text-slate-500 text-xs">
                No active customer matches &quot;{searchQuery}&quot;.
              </div>
            ) : (
              results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c)}
                  className="w-full text-left p-2 rounded-lg hover:bg-slate-900 flex items-center justify-between text-slate-200 hover:text-white transition-colors"
                >
                  <div className="truncate pr-2">
                    <div className="font-medium text-white flex items-center gap-1.5 truncate">
                      <span>{c.name}</span>
                      {c.code && (
                        <span className="text-[10px] font-mono text-emerald-400">#{c.code}</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {c.phone && <span>📞 {c.phone} </span>}
                      {c.email && <span>✉️ {c.email}</span>}
                    </div>
                  </div>
                  {selectedCustomer?.id === c.id && (
                    <span className="text-[10px] font-semibold text-emerald-400 shrink-0">
                      ✓ Selected
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
