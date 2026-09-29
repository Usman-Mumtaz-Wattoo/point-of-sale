"use client";

import { useState, useEffect } from "react";
import { type StaffMemberDTO, type UpdateStaffBranchAccessInput } from "./types";

interface BranchOption {
  id: string;
  name: string;
  code: string;
}

interface EditBranchesModalProps {
  isOpen: boolean;
  staffMember: StaffMemberDTO | null;
  branches: BranchOption[];
  isPending: boolean;
  onClose: () => void;
  onSubmit: (input: UpdateStaffBranchAccessInput) => Promise<boolean>;
}

export function EditBranchesModal({
  isOpen,
  staffMember,
  branches,
  isPending,
  onClose,
  onSubmit,
}: EditBranchesModalProps) {
  if (!isOpen || !staffMember) return null;

  return (
    <EditBranchesModalContent
      staffMember={staffMember}
      branches={branches}
      isPending={isPending}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

function EditBranchesModalContent({
  staffMember,
  branches,
  isPending,
  onClose,
  onSubmit,
}: Omit<EditBranchesModalProps, "isOpen"> & { staffMember: StaffMemberDTO }) {
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>(() =>
    staffMember.branchMemberships.map((bm) => bm.branchId)
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPending, onClose]);

  const handleToggle = (branchId: string) => {
    setSelectedBranchIds((prev) =>
      prev.includes(branchId) ? prev.filter((id) => id !== branchId) : [...prev, branchId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const success = await onSubmit({
      membershipId: staffMember.id,
      branchIds: selectedBranchIds,
    });

    if (!success) {
      setError("Failed to update branch access. Please try again.");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-branches-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
    >
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm font-semibold border border-emerald-100">
              🏪
            </span>
            <div>
              <h2 id="edit-branches-title" className="text-base font-semibold text-slate-900">
                Manage Branch Access
              </h2>
              <p className="text-xs text-slate-500">
                Configure store locations for {staffMember.name}.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            {error && (
              <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {error}
              </div>
            )}

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
              <span className="text-slate-500 block">Staff Member:</span>
              <span className="font-semibold text-slate-900 block">{staffMember.name}</span>
              <span className="text-slate-500 text-[11px] block">Role: {staffMember.role.name}</span>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-semibold text-slate-700">
                Assign Branches
              </span>
              <p className="text-[11px] text-slate-500">
                Select which retail store locations this staff member can operate:
              </p>

              {branches.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No active branches found in your organization.</p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {branches.map((b) => {
                    const isChecked = selectedBranchIds.includes(b.id);
                    return (
                      <label
                        key={b.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                          isChecked
                            ? "bg-emerald-50/60 border-emerald-300 text-slate-900"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100/60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggle(b.id)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div className="flex-1 truncate">
                          <span className="font-semibold block truncate">{b.name}</span>
                          <span className="text-[11px] font-mono text-slate-400">{b.code}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-xs transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isPending && (
                <span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              )}
              <span>Save Assignments</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
