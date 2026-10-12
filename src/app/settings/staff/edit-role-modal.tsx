"use client";

import { useState, useEffect } from "react";
import { ASSIGNABLE_STAFF_ROLES, type StaffMemberDTO, type UpdateStaffRoleInput } from "./types";
import { SYSTEM_ROLE_DEFINITIONS, type SystemRoleName } from "@/lib/roles";

interface EditRoleModalProps {
  isOpen: boolean;
  staffMember: StaffMemberDTO | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (input: UpdateStaffRoleInput) => Promise<boolean>;
}

export function EditRoleModal({
  isOpen,
  staffMember,
  isPending,
  onClose,
  onSubmit,
}: EditRoleModalProps) {
  if (!isOpen || !staffMember) return null;

  return (
    <EditRoleModalContent
      staffMember={staffMember}
      isPending={isPending}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

function EditRoleModalContent({
  staffMember,
  isPending,
  onClose,
  onSubmit,
}: Omit<EditRoleModalProps, "isOpen"> & { staffMember: StaffMemberDTO }) {
  const [selectedRole, setSelectedRole] = useState(
    ASSIGNABLE_STAFF_ROLES.includes(staffMember.role.name as SystemRoleName)
      ? staffMember.role.name
      : ASSIGNABLE_STAFF_ROLES[0]
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const success = await onSubmit({
      membershipId: staffMember.id,
      newRoleName: selectedRole,
    });

    if (!success) {
      setError("Failed to update role. Please try again.");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-role-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
    >
      <div className="w-full max-w-md bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-base font-semibold border border-indigo-200 dark:border-indigo-500/20">
              🛡️
            </span>
            <div>
              <h2 id="edit-role-title" className="text-base font-semibold text-slate-900 dark:text-white">
                Change Staff Role
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Update operational permissions for {staffMember.name}.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="p-6 space-y-4">
            {error && (
              <div role="alert" className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-200 text-xs font-medium">
                {error}
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
              <span className="text-slate-500 dark:text-slate-400 block">Staff Member:</span>
              <span className="font-semibold text-slate-900 dark:text-white block">{staffMember.name}</span>
              <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px] block">{staffMember.email}</span>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="select-new-role" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                New Role <span className="text-rose-500">*</span>
              </label>
              <select
                id="select-new-role"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
              >
                {ASSIGNABLE_STAFF_ROLES.map((r) => {
                  const def = SYSTEM_ROLE_DEFINITIONS.find((d) => d.name === r);
                  return (
                    <option key={r} value={r}>
                      {r} — {def?.description || ""}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || selectedRole === staffMember.role.name}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isPending && (
                <span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              )}
              <span>Update Role</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
