"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import {
  type StaffMemberDTO,
  type InvitationDTO,
  type CreateInvitationInput,
  type UpdateStaffRoleInput,
  type UpdateStaffBranchAccessInput,
} from "./types";
import {
  createInvitationAction,
  resendInvitationAction,
  cancelInvitationAction,
  updateStaffRoleAction,
  updateStaffBranchAccessAction,
  toggleStaffStatusAction,
} from "./actions";
import { InviteModal } from "./invite-modal";
import { EditRoleModal } from "./edit-role-modal";
import { EditBranchesModal } from "./edit-branches-modal";

interface BranchOption {
  id: string;
  name: string;
  code: string;
}

interface StaffViewProps {
  initialStaff: StaffMemberDTO[];
  initialInvitations: InvitationDTO[];
  branches: BranchOption[];
  organizationId: string;
  organizationName: string;
  userEmail: string;
  userName: string;
}

export function StaffView({
  initialStaff,
  initialInvitations,
  branches,
  organizationId,
  organizationName,
  userEmail,
  userName,
}: StaffViewProps) {
  const [staff, setStaff] = useState<StaffMemberDTO[]>(initialStaff);
  const [invitations, setInvitations] = useState<InvitationDTO[]>(initialInvitations);
  const [isPending, startTransition] = useTransition();

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"staff" | "invitations">("staff");

  // Notifications
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modal states
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [roleModalStaff, setRoleModalStaff] = useState<StaffMemberDTO | null>(null);
  const [branchModalStaff, setBranchModalStaff] = useState<StaffMemberDTO | null>(null);
  const [deactivatingStaff, setDeactivatingStaff] = useState<StaffMemberDTO | null>(null);

  // Filtered staff
  const filteredStaff = useMemo(() => {
    if (!searchQuery.trim()) return staff;
    const q = searchQuery.toLowerCase().trim();
    return staff.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.role.name.toLowerCase().includes(q)
    );
  }, [staff, searchQuery]);

  // Filtered invitations
  const pendingInvitations = useMemo(
    () => invitations.filter((inv) => inv.status === "PENDING"),
    [invitations]
  );

  const handleCreateInvitation = async (input: CreateInvitationInput) => {
    return new Promise<{ inviteUrl?: string } | boolean>((resolve) => {
      startTransition(async () => {
        const res = await createInvitationAction(input, organizationId);
        if (res.success) {
          setSuccessMessage(res.message || "Invitation created successfully.");
          // Add to invitations list
          const newInv: InvitationDTO = {
            id: res.data.invitationId,
            email: input.email,
            role: { id: "", name: input.roleName },
            status: "PENDING",
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date().toISOString(),
            acceptedAt: null,
            invitedBy: { id: "", name: userName, email: userEmail },
            branches: branches
              .filter((b) => input.branchIds?.includes(b.id))
              .map((b) => ({ branchId: b.id, branchName: b.name, branchCode: b.code })),
          };
          setInvitations((prev) => [newInv, ...prev]);
          resolve({ inviteUrl: res.data.inviteUrl });
        } else {
          setErrorMessage(res.error || "Failed to create invitation.");
          resolve(false);
        }
      });
    });
  };

  const handleResendInvitation = (invitationId: string) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const res = await resendInvitationAction(invitationId, organizationId);
      if (res.success) {
        setSuccessMessage(
          `Invitation resent! Link: ${window.location.origin}${res.data.inviteUrl}`
        );
        setInvitations((prev) =>
          prev.map((inv) =>
            inv.id === invitationId
              ? {
                  ...inv,
                  status: "PENDING",
                  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                }
              : inv
          )
        );
      } else {
        setErrorMessage(res.error || "Failed to resend invitation.");
      }
    });
  };

  const handleCancelInvitation = (invitationId: string) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const res = await cancelInvitationAction(invitationId, organizationId);
      if (res.success) {
        setSuccessMessage("Invitation cancelled.");
        setInvitations((prev) =>
          prev.map((inv) => (inv.id === invitationId ? { ...inv, status: "CANCELLED" } : inv))
        );
      } else {
        setErrorMessage(res.error || "Failed to cancel invitation.");
      }
    });
  };

  const handleUpdateRole = async (input: UpdateStaffRoleInput): Promise<boolean> => {
    setErrorMessage(null);
    setSuccessMessage(null);

    return new Promise((resolve) => {
      startTransition(async () => {
        const res = await updateStaffRoleAction(input, organizationId);
        if (res.success) {
          setStaff((prev) => prev.map((s) => (s.id === res.data.id ? res.data : s)));
          setSuccessMessage(res.message || "Role updated successfully.");
          setRoleModalStaff(null);
          resolve(true);
        } else {
          setErrorMessage(res.error || "Failed to update role.");
          resolve(false);
        }
      });
    });
  };

  const handleUpdateBranchAccess = async (input: UpdateStaffBranchAccessInput): Promise<boolean> => {
    setErrorMessage(null);
    setSuccessMessage(null);

    return new Promise((resolve) => {
      startTransition(async () => {
        const res = await updateStaffBranchAccessAction(input, organizationId);
        if (res.success) {
          setStaff((prev) => prev.map((s) => (s.id === res.data.id ? res.data : s)));
          setSuccessMessage(res.message || "Branch access updated successfully.");
          setBranchModalStaff(null);
          resolve(true);
        } else {
          setErrorMessage(res.error || "Failed to update branch access.");
          resolve(false);
        }
      });
    });
  };

  const executeToggleStatus = (membershipId: string) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setDeactivatingStaff(null);

    startTransition(async () => {
      const res = await toggleStaffStatusAction({ membershipId }, organizationId);
      if (res.success) {
        setStaff((prev) =>
          prev.map((s) => (s.id === res.data.id ? { ...s, isActive: res.data.isActive } : s))
        );
        setSuccessMessage(res.message || "Staff member status updated.");
      } else {
        setErrorMessage(res.error || "Failed to toggle status.");
      }
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Deep Navy Navigation Header */}
      <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 px-4 sm:px-6 lg:px-8 py-3.5 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard?org=${organizationId}`}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            >
              &larr; Back to Dashboard
            </Link>
            <span className="text-slate-600 hidden sm:inline">|</span>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                {organizationName} — Settings
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-xs text-slate-400">
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              OWNER
            </span>
            <span>
              {userName} ({userEmail})
            </span>
          </div>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="max-w-6xl mx-auto mt-3 flex items-center gap-2 border-t border-slate-800/80 pt-2.5">
          <Link
            href={`/settings?org=${organizationId}`}
            className="text-xs font-medium px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
          >
            🏢 Organization Profile
          </Link>
          <Link
            href={`/settings/branches?org=${organizationId}`}
            className="text-xs font-medium px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
          >
            🏪 Branch Administration
          </Link>
          <Link
            href={`/settings/staff?org=${organizationId}`}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 transition-colors"
          >
            👥 Staff & Permissions
          </Link>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6 flex-1">
        {/* Banner: Success Notification */}
        {successMessage && (
          <div
            role="status"
            className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm shadow-xs"
          >
            <span className="text-emerald-600 font-bold select-none">✓</span>
            <div className="flex-1 font-medium break-all">{successMessage}</div>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-700/80 hover:text-emerald-900 text-xs px-2 py-0.5 rounded border border-emerald-200"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Banner: Error Notification */}
        {errorMessage && (
          <div
            role="alert"
            className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm shadow-xs"
          >
            <span className="text-rose-600 font-bold select-none">⚠</span>
            <div className="flex-1 font-medium">{errorMessage}</div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-700/80 hover:text-rose-900 text-xs px-2 py-0.5 rounded border border-rose-200"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Operational Overview Metrics */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Total Team Members
              </span>
              <span className="text-2xl font-bold text-slate-900 mt-0.5 block">{staff.length}</span>
            </div>
            <span className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center text-lg">
              👥
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider block">
                Active Staff
              </span>
              <span className="text-2xl font-bold text-emerald-700 mt-0.5 block">
                {staff.filter((s) => s.isActive).length}
              </span>
            </div>
            <span className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg border border-emerald-100">
              ✓
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider block">
                Pending Invites
              </span>
              <span className="text-2xl font-bold text-amber-700 mt-0.5 block">
                {pendingInvitations.length}
              </span>
            </div>
            <span className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-lg border border-amber-100">
              ✉️
            </span>
          </div>
        </section>

        {/* Action & Filter Bar */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-1 min-w-[280px]">
            {/* View Tab Toggle */}
            <div className="flex items-center rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab("staff")}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === "staff"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Active Team ({staff.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("invitations")}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeTab === "invitations"
                    ? "bg-white text-amber-800 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Invitations ({pendingInvitations.length})
              </button>
            </div>

            {/* Search Input */}
            {activeTab === "staff" && (
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search staff by name, email, or role..."
                  className="w-full pl-9 pr-3.5 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-colors"
                />
                <span className="absolute left-3 top-2 text-slate-400 text-xs select-none">🔍</span>
              </div>
            )}
          </div>

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={() => setIsInviteModalOpen(true)}
            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-xs transition-colors flex items-center gap-1.5 shrink-0"
          >
            <span>+</span>
            <span>Invite New Staff</span>
          </button>
        </div>

        {/* Tab 1: Staff Table / Cards */}
        {activeTab === "staff" && (
          <div className="space-y-4">
            {filteredStaff.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3 shadow-xs">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto text-xl">
                  👥
                </div>
                <h3 className="text-sm font-bold text-slate-900">No Staff Members Found</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {searchQuery
                    ? `No staff members matched "${searchQuery}".`
                    : "Invite team members to assign roles and manage operational access."}
                </p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="py-3 px-4">Member Name</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Branch Access</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredStaff.map((member) => {
                        const isOwner = member.role.name === "OWNER";
                        return (
                          <tr key={member.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-900">{member.name}</span>
                                {member.isSelf && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    You
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-400 block font-mono">
                                {member.email}
                              </span>
                            </td>

                            <td className="py-3.5 px-4">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase border ${
                                  isOwner
                                    ? "bg-purple-50 text-purple-700 border-purple-200"
                                    : "bg-slate-100 text-slate-700 border-slate-200"
                                }`}
                              >
                                {member.role.name}
                              </span>
                            </td>

                            <td className="py-3.5 px-4">
                              {isOwner ? (
                                <span className="text-slate-500 italic">Organization-wide</span>
                              ) : member.branchMemberships.length === 0 ? (
                                <span className="text-amber-600 text-[11px]">No branches assigned</span>
                              ) : (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {member.branchMemberships.map((bm) => (
                                    <span
                                      key={bm.branchId}
                                      className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-200"
                                    >
                                      {bm.branchCode}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>

                            <td className="py-3.5 px-4">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${
                                  member.isActive
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : "bg-slate-100 text-slate-500 border-slate-300"
                                }`}
                              >
                                {member.isActive ? "Active" : "Inactive"}
                              </span>
                            </td>

                            <td className="py-3.5 px-4 text-right">
                              {isOwner ? (
                                <span className="text-slate-400 text-[11px] italic">Owner Protected</span>
                              ) : (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setRoleModalStaff(member)}
                                    className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
                                  >
                                    Role
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setBranchModalStaff(member)}
                                    className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
                                  >
                                    Branches
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (member.isActive) {
                                        setDeactivatingStaff(member);
                                      } else {
                                        executeToggleStatus(member.id);
                                      }
                                    }}
                                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors shadow-2xs ${
                                      member.isActive
                                        ? "text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100/60"
                                        : "text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100/60"
                                    }`}
                                  >
                                    {member.isActive ? "Deactivate" : "Activate"}
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Pending Invitations */}
        {activeTab === "invitations" && (
          <div className="space-y-4">
            {invitations.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3 shadow-xs">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto text-xl">
                  ✉️
                </div>
                <h3 className="text-sm font-bold text-slate-900">No Invitations Dispatched</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Click &ldquo;Invite New Staff&rdquo; above to send an invitation to a colleague.
                </p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="py-3 px-4">Invited Email</th>
                        <th className="py-3 px-4">Target Role</th>
                        <th className="py-3 px-4">Branches</th>
                        <th className="py-3 px-4">Expires</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invitations.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-slate-900 block font-mono text-[11px]">
                              {inv.email}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Sent {new Date(inv.createdAt).toLocaleDateString()}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                              {inv.role.name}
                            </span>
                          </td>

                          <td className="py-3.5 px-4">
                            {inv.branches.length === 0 ? (
                              <span className="text-slate-400 italic">None selected</span>
                            ) : (
                              <div className="flex items-center gap-1 flex-wrap">
                                {inv.branches.map((b) => (
                                  <span
                                    key={b.branchId}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-200"
                                  >
                                    {b.branchCode}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-slate-500">
                            {new Date(inv.expiresAt).toLocaleDateString()}
                          </td>

                          <td className="py-3.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${
                                inv.status === "PENDING"
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : inv.status === "ACCEPTED"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-slate-100 text-slate-500 border-slate-300"
                              }`}
                            >
                              {inv.status}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            {inv.status === "PENDING" && (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleResendInvitation(inv.id)}
                                  disabled={isPending}
                                  className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs disabled:opacity-50"
                                >
                                  Resend
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCancelInvitation(inv.id)}
                                  disabled={isPending}
                                  className="px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100/60 transition-colors shadow-2xs disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal Dialogs */}
      <InviteModal
        isOpen={isInviteModalOpen}
        branches={branches}
        isPending={isPending}
        onClose={() => setIsInviteModalOpen(false)}
        onSubmit={handleCreateInvitation}
      />

      <EditRoleModal
        isOpen={Boolean(roleModalStaff)}
        staffMember={roleModalStaff}
        isPending={isPending}
        onClose={() => setRoleModalStaff(null)}
        onSubmit={handleUpdateRole}
      />

      <EditBranchesModal
        isOpen={Boolean(branchModalStaff)}
        staffMember={branchModalStaff}
        branches={branches}
        isPending={isPending}
        onClose={() => setBranchModalStaff(null)}
        onSubmit={handleUpdateBranchAccess}
      />

      {/* Deactivation Confirmation Modal */}
      {deactivatingStaff && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="deactivate-staff-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600">
              <span className="w-10 h-10 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center text-lg select-none">
                ⚠️
              </span>
              <div>
                <h3 id="deactivate-staff-title" className="text-base font-bold text-slate-900">
                  Deactivate Staff Member?
                </h3>
                <span className="text-xs text-slate-500">{deactivatingStaff.name}</span>
              </div>
            </div>

            <div className="text-xs text-slate-600 space-y-2 leading-relaxed">
              <p>
                Deactivating <strong className="text-slate-900">{deactivatingStaff.name}</strong> will
                suspend their login access to this business and prevent them from operating registers
                or ringing sales.
              </p>
              <p className="text-slate-500">
                Historical transactions, orders, and receipts processed by this staff member remain
                completely preserved in the database.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeactivatingStaff(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => executeToggleStatus(deactivatingStaff.id)}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg shadow-xs transition-colors disabled:opacity-50"
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
