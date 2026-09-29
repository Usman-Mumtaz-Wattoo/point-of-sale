import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SYSTEM_ROLES } from "@/lib/roles";
import { listStaffAction, listInvitationsAction } from "./actions";
import { StaffView } from "./staff-view";

export const metadata = {
  title: "Staff & Permissions — Point of Sale",
  description: "Manage team members, roles, branch assignments, and invitations.",
};

interface StaffPageProps {
  searchParams: Promise<{
    org?: string;
  }>;
}

export default async function StaffPage(props: StaffPageProps) {
  const user = await requireAuth();
  const searchParams = await props.searchParams;

  // Zero-membership handling
  if (user.memberships.length === 0) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-800 p-6 md:p-12 flex items-center justify-center">
        <div className="max-w-md w-full text-center bg-white border border-slate-200 rounded-2xl p-8 space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto text-xl border border-emerald-100">
            🏢
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-slate-900">No Business Found</h1>
            <p className="text-sm text-slate-500">
              You do not belong to any active organization yet. Complete setup to manage business staff.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/onboarding"
              className="inline-flex items-center px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors shadow-xs"
            >
              Launch Business Setup &rarr;
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const activeMemberships = user.memberships.filter(
    (m) => m.isActive && m.organization && m.organization.isActive
  );

  if (activeMemberships.length === 0) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-800 p-6 md:p-12 flex items-center justify-center">
        <div className="max-w-md w-full text-center bg-white border border-slate-200 rounded-2xl p-8 space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto text-xl border border-rose-100">
            🚫
          </div>
          <h1 className="text-xl font-bold text-slate-900">No Active Membership</h1>
          <p className="text-sm text-slate-500">
            Your account does not have an active membership in any operational organization.
          </p>
        </div>
      </main>
    );
  }

  // Multi-organization selection handling
  const requestedOrgId = searchParams.org?.trim();
  let activeMembership = activeMemberships[0];

  if (requestedOrgId) {
    const match = activeMemberships.find((m) => m.organizationId === requestedOrgId);
    if (!match) {
      return (
        <main className="min-h-screen bg-slate-50 text-slate-800 p-6 md:p-12 flex items-center justify-center">
          <div className="max-w-md w-full text-center bg-white border border-slate-200 rounded-2xl p-8 space-y-4 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto text-xl border border-rose-100">
              ⚠️
            </div>
            <h1 className="text-xl font-bold text-slate-900">Organization Not Found</h1>
            <p className="text-sm text-slate-500">
              The requested organization could not be found or you do not have an active membership in it.
            </p>
            <div className="pt-2">
              <Link
                href="/dashboard"
                className="inline-flex items-center px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
              >
                &larr; Return to Dashboard
              </Link>
            </div>
          </div>
        </main>
      );
    }
    activeMembership = match;
  } else {
    // If user has multiple organizations, do not silently default: prompt for selection
    if (activeMemberships.length > 1) {
      return (
        <main className="min-h-screen bg-slate-50 text-slate-800 p-6 md:p-12 flex items-center justify-center">
          <div className="max-w-md w-full text-center bg-white border border-slate-200 rounded-2xl p-8 space-y-5 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto text-xl border border-emerald-100">
              🏢
            </div>
            <div className="space-y-1">
              <h1 className="text-xl font-bold text-slate-900">Select Business</h1>
              <p className="text-sm text-slate-500">
                You belong to multiple businesses. Please select which organization you want to manage staff for:
              </p>
            </div>
            <div className="space-y-2 pt-2 text-left">
              {activeMemberships.map((m) => (
                <Link
                  key={m.organizationId}
                  href={`/settings/staff?org=${m.organizationId}`}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 transition-colors"
                >
                  <div>
                    <span className="font-semibold text-sm text-slate-900 block">
                      {m.organization.name}
                    </span>
                    <span className="text-xs text-slate-500">Role: {m.role.name}</span>
                  </div>
                  <span className="text-xs font-semibold text-emerald-600">Select &rarr;</span>
                </Link>
              ))}
            </div>
          </div>
        </main>
      );
    }
    activeMembership = activeMemberships[0];
  }

  // Server-side OWNER role enforcement
  if (activeMembership.role.name !== SYSTEM_ROLES.OWNER) {
    const userRole = activeMembership.role.name || "Staff";
    return (
      <main className="min-h-screen bg-slate-50 text-slate-800 p-6 md:p-12 flex items-center justify-center">
        <div className="max-w-md w-full text-center bg-white border border-slate-200 rounded-2xl p-8 space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto text-xl border border-rose-100">
            🚫
          </div>
          <h1 className="text-xl font-bold text-slate-900">Access Denied</h1>
          <p className="text-sm text-slate-500">
            Your current role (<strong className="text-slate-800">{userRole}</strong>) does not have
            permission to manage staff for{" "}
            <strong className="text-slate-800">{activeMembership.organization.name}</strong>. Only the
            organization <strong className="text-emerald-700">OWNER</strong> can invite staff, assign
            roles, and configure branch access.
          </p>
          <div className="pt-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
            >
              &larr; Return to Dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const organization = activeMembership.organization;

  // Hydrate initial staff and invitations via server actions
  const [staffRes, invitationsRes, branches] = await Promise.all([
    listStaffAction(organization.id),
    listInvitationsAction(organization.id),
    db.branch.findMany({
      where: {
        organizationId: organization.id,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        code: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!staffRes.success) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-800 p-6 md:p-12 flex items-center justify-center">
        <div className="max-w-md w-full text-center bg-white border border-slate-200 rounded-2xl p-8 space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto text-xl border border-rose-100">
            ⚠️
          </div>
          <h1 className="text-xl font-bold text-slate-900">Staff Unavailable</h1>
          <p className="text-sm text-slate-500">
            {staffRes.error || "An unexpected error occurred while loading staff members."}
          </p>
          <div className="pt-2">
            <Link
              href={`/settings/staff?org=${organization.id}`}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
            >
              Try Again
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <StaffView
      initialStaff={staffRes.data || []}
      initialInvitations={invitationsRes.success && invitationsRes.data ? invitationsRes.data : []}
      branches={branches}
      organizationId={organization.id}
      organizationName={organization.name}
      userEmail={user.email}
      userName={user.name}
    />
  );
}
