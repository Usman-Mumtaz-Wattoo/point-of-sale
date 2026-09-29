"use client";

import { useState, useEffect } from "react";
import { ASSIGNABLE_STAFF_ROLES, type CreateInvitationInput } from "./types";
import { SYSTEM_ROLE_DEFINITIONS } from "@/lib/roles";

interface BranchOption {
  id: string;
  name: string;
  code: string;
}

interface InviteModalProps {
  isOpen: boolean;
  branches: BranchOption[];
  isPending: boolean;
  onClose: () => void;
  onSubmit: (data: CreateInvitationInput) => Promise<{ inviteUrl?: string } | boolean>;
}

export function InviteModal({
  isOpen,
  branches,
  isPending,
  onClose,
  onSubmit,
}: InviteModalProps) {
  if (!isOpen) return null;

  return (
    <InviteModalContent
      branches={branches}
      isPending={isPending}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

function InviteModalContent({
  branches,
  isPending,
  onClose,
  onSubmit,
}: Omit<InviteModalProps, "isOpen">) {
  const [email, setEmail] = useState("");
  const [roleName, setRoleName] = useState<string>(ASSIGNABLE_STAFF_ROLES[1]); // Default to CASHIER
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [modalError, setModalError] = useState<string | null>(null);
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  const handleBranchToggle = (branchId: string) => {
    setSelectedBranchIds((prev) =>
      prev.includes(branchId) ? prev.filter((id) => id !== branchId) : [...prev, branchId]
    );
  };

  const handleCopyLink = async () => {
    if (!generatedInviteUrl) return;
    const fullUrl = `${window.location.origin}${generatedInviteUrl}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setFieldErrors({});

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setFieldErrors({ email: "Email address is required." });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setFieldErrors({ email: "Please enter a valid email address." });
      return;
    }

    const res = await onSubmit({
      email: cleanEmail,
      roleName,
      branchIds: selectedBranchIds,
    });

    if (res && typeof res === "object" && res.inviteUrl) {
      setGeneratedInviteUrl(res.inviteUrl);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto"
    >
      <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm font-semibold border border-emerald-100">
              ✉️
            </span>
            <div>
              <h2 id="invite-modal-title" className="text-base font-semibold text-slate-900">
                Invite Staff Member
              </h2>
              <p className="text-xs text-slate-500">
                Send an invitation to join your business with a specific operational role.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center text-sm transition-colors disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Modal Content */}
        {generatedInviteUrl ? (
          <div className="p-6 space-y-4">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
              <span className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto text-lg font-bold">
                ✓
              </span>
              <h3 className="text-sm font-bold text-emerald-900">Invitation Created!</h3>
              <p className="text-xs text-emerald-700 max-w-sm mx-auto">
                An invitation has been created for <strong className="font-semibold">{email}</strong>.
                Share the secure invitation link below with your employee:
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Invitation Link</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}${generatedInviteUrl}`}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 rounded-lg border border-slate-300 text-slate-700 select-all"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-xs transition-colors shrink-0"
                >
                  {copied ? "Copied! ✓" : "Copy Link"}
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                This single-use link expires in 7 days. The employee will sign in and accept it.
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {modalError && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium"
                >
                  {modalError}
                </div>
              )}

              {/* Email Address */}
              <div className="space-y-1">
                <label htmlFor="invite-email" className="block text-xs font-semibold text-slate-700">
                  Staff Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  id="invite-email"
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. employee@company.com"
                  className={`w-full px-3 py-2 text-sm rounded-lg border text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 transition-colors ${
                    fieldErrors.email
                      ? "border-rose-300 focus:ring-rose-500/20"
                      : "border-slate-300 focus:border-emerald-500 focus:ring-emerald-500/20"
                  }`}
                />
                {fieldErrors.email && (
                  <p role="alert" className="text-[11px] text-rose-600 font-medium">
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              {/* Role Selection */}
              <div className="space-y-1">
                <label htmlFor="invite-role" className="block text-xs font-semibold text-slate-700">
                  Assigned Operational Role <span className="text-rose-500">*</span>
                </label>
                <select
                  id="invite-role"
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-colors"
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
                <p className="text-[11px] text-slate-400">
                  Organization OWNER role cannot be assigned through staff invitations.
                </p>
              </div>

              {/* Branch Scope Checkboxes */}
              {branches.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <label className="block text-xs font-semibold text-slate-700">
                    Assign Branches (Optional)
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Select which retail store locations this staff member can operate:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 max-h-40 overflow-y-auto">
                    {branches.map((b) => {
                      const isChecked = selectedBranchIds.includes(b.id);
                      return (
                        <label
                          key={b.id}
                          className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                            isChecked
                              ? "bg-emerald-50/60 border-emerald-300 text-slate-900"
                              : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100/60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleBranchToggle(b.id)}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <div className="truncate">
                            <span className="font-semibold block truncate">{b.name}</span>
                            <span className="text-[10px] font-mono text-slate-400">{b.code}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
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
                <span>Send Invitation</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
