import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { SYSTEM_ROLES } from "@/lib/roles";
import { listBranchesAction } from "./actions";
import { BranchListView } from "./branch-list-view";

export const metadata = {
  title: "Branch Administration — Point of Sale",
  description: "Manage branch locations, contact information, document prefixes, and operational status.",
};

interface BranchesPageProps {
  searchParams: Promise<{
    org?: string;
  }>;
}

export default async function BranchesPage(props: BranchesPageProps) {
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
              You do not belong to any active organization yet. Complete setup to manage business
              branches.
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
              The requested organization could not be found or you do not have an active membership
              in it.
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
    // If user has multiple organizations, do not guess: show clear organization selector
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
                You belong to multiple businesses. Please select which organization you want to
                administer branches for:
              </p>
            </div>
            <div className="space-y-2 pt-2 text-left">
              {activeMemberships.map((m) => (
                <Link
                  key={m.organizationId}
                  href={`/settings/branches?org=${m.organizationId}`}
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
            permission to manage branches for{" "}
            <strong className="text-slate-800">{activeMembership.organization.name}</strong>. Only the
            organization <strong className="text-emerald-700">OWNER</strong> can administer branch
            locations.
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

  // Hydrate initial branches via server action
  const branchesRes = await listBranchesAction(organization.id);

  if (!branchesRes.success) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-800 p-6 md:p-12 flex items-center justify-center">
        <div className="max-w-md w-full text-center bg-white border border-slate-200 rounded-2xl p-8 space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto text-xl border border-rose-100">
            ⚠️
          </div>
          <h1 className="text-xl font-bold text-slate-900">Branches Unavailable</h1>
          <p className="text-sm text-slate-500">
            {branchesRes.error || "An unexpected error occurred while loading branch locations."}
          </p>
          <div className="pt-2">
            <Link
              href={`/settings/branches?org=${organization.id}`}
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
    <BranchListView
      initialBranches={branchesRes.data}
      organizationId={organization.id}
      organizationName={organization.name}
      userEmail={user.email}
      userName={user.name}
    />
  );
}
