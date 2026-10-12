import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { SYSTEM_ROLES } from "@/lib/roles";
import { resolveTenantContext, TenantContextError } from "@/lib/tenant-context";
import { AppShell } from "@/components/app-shell";
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
  const requestedOrgId = searchParams.org?.trim();

  // Zero-membership handling
  if (!user.memberships || user.memberships.length === 0) {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 flex items-center justify-center">
        <div className="max-w-md w-full text-center bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-8 space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto text-xl border border-indigo-200 dark:border-indigo-500/20">
            🏢
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">No Business Found</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              You do not belong to any active organization yet. Complete setup to manage business
              branches.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/onboarding"
              className="inline-flex items-center px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors shadow-xs"
            >
              Launch Business Setup &rarr;
            </Link>
          </div>
        </div>
      </main>
    );
  }

  let tenantContext;
  try {
    tenantContext = await resolveTenantContext(requestedOrgId, {
      requireRoles: [SYSTEM_ROLES.OWNER],
      actorUser: user,
    });
  } catch (err: unknown) {
    if (err instanceof TenantContextError) {
      if (err.code === "MULTIPLE_ORGS_SPECIFY_REQUIRED") {
        const activeMemberships = user.memberships.filter(
          (m) => m.isActive && m.organization && m.organization.isActive
        );

        return (
          <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="max-w-md w-full text-center bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-8 space-y-5 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto text-xl border border-indigo-200 dark:border-indigo-500/20">
                🏢
              </div>
              <div className="space-y-1">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Select Business</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  You belong to multiple businesses. Please select which organization you want to
                  administer branches for:
                </p>
              </div>
              <div className="space-y-2 pt-2 text-left">
                {activeMemberships.map((m) => (
                  <Link
                    key={m.organizationId}
                    href={`/settings/branches?org=${m.organizationId}`}
                    className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 hover:border-indigo-500 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-colors"
                  >
                    <div>
                      <span className="font-semibold text-sm text-slate-900 dark:text-white block">
                        {m.organization.name}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">Role: {m.role.name}</span>
                    </div>
                    <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Select &rarr;</span>
                  </Link>
                ))}
              </div>
            </div>
          </main>
        );
      }

      if (err.code === "NO_ACTIVE_MEMBERSHIP") {
        return (
          <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="max-w-md w-full text-center bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-8 space-y-4 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto text-xl border border-rose-200 dark:border-rose-500/20">
                🚫
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">No Active Membership</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Your account does not have an active membership in any operational organization.
              </p>
              <div className="pt-2">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  &larr; Return to Dashboard
                </Link>
              </div>
            </div>
          </main>
        );
      }

      if (err.code === "MEMBERSHIP_NOT_FOUND" || err.code === "INACTIVE_MEMBERSHIP") {
        return (
          <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="max-w-md w-full text-center bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-8 space-y-4 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto text-xl border border-rose-200 dark:border-rose-500/20">
                ⚠️
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Organization Not Found</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                The requested organization could not be found or you do not have an active membership
                in it.
              </p>
              <div className="pt-2">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  &larr; Return to Dashboard
                </Link>
              </div>
            </div>
          </main>
        );
      }

      if (err.code === "OWNER_ROLE_REQUIRED" || err.code === "UNAUTHORIZED_ROLE") {
        const membership = user.memberships.find((m) => m.organizationId === requestedOrgId);
        const userRole = membership?.role?.name || "Staff";
        const orgName = membership?.organization?.name || "this business";

        return (
          <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="max-w-md w-full text-center bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-8 space-y-4 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto text-xl border border-rose-200 dark:border-rose-500/20">
                🚫
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Access Denied</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Your current role (<strong className="text-slate-800 dark:text-slate-200">{userRole}</strong>) does not have
                permission to manage branches for{" "}
                <strong className="text-slate-800 dark:text-slate-200">{orgName}</strong>. Only the
                organization <strong className="text-indigo-600 dark:text-indigo-400">OWNER</strong> can administer branch
                locations.
              </p>
              <div className="pt-2">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  &larr; Return to Dashboard
                </Link>
              </div>
            </div>
          </main>
        );
      }
    }

    throw err;
  }

  // Hydrate initial branches via server action
  const branchesRes = await listBranchesAction(tenantContext.organizationId, { actorUser: user });

  if (!branchesRes.success) {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 flex items-center justify-center">
        <div className="max-w-md w-full text-center bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-slate-800 rounded-2xl p-8 space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto text-xl border border-rose-200 dark:border-rose-500/20">
            ⚠️
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Branches Unavailable</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {branchesRes.error || "An unexpected error occurred while loading branch locations."}
          </p>
          <div className="pt-2">
            <Link
              href={`/settings/branches?org=${tenantContext.organizationId}`}
              className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
            >
              Try Again
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <AppShell
      organizationId={tenantContext.organizationId}
      organizationName={tenantContext.organizationName}
      userRole={tenantContext.role}
      userName={user.name}
      userEmail={user.email}
      breadcrumbs={[
        { label: "Settings" },
        { label: "Branch Administration" },
      ]}
    >
      <BranchListView
        initialBranches={branchesRes.data}
        organizationId={tenantContext.organizationId}
        organizationName={tenantContext.organizationName}
        userEmail={user.email}
        userName={user.name}
      />
    </AppShell>
  );
}
