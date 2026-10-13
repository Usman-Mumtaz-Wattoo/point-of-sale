import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { claimPendingInvitationsForUser } from "@/lib/invitation-claim";
import { resolveTenantContext, TenantContextError } from "@/lib/tenant-context";
import { getDashboardMetricsAction } from "./actions";
import { DASHBOARD_ALLOWED_ROLES } from "./types";
import { DashboardView } from "./dashboard-view";

export const metadata = {
  title: "Executive Business Dashboard — Point of Sale",
  description:
    "Monitor real-time business performance, revenue KPIs, order volume, and inventory health.",
};

interface DashboardPageProps {
  searchParams: Promise<{
    org?: string;
  }>;
}

export default async function DashboardPage(props: DashboardPageProps) {
  const user = await requireAuth();
  const searchParams = await props.searchParams;

  // Zero-organization handling: Verify if any pending invitation can be authoritatively claimed
  if (user.memberships.length === 0) {
    const claimed = await claimPendingInvitationsForUser(user);
    if (claimed.length > 0) {
      redirect(claimed[0].redirectUrl);
    }
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 flex items-center justify-center">
        <div className="max-w-md w-full text-center bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 space-y-4 shadow-xl">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto text-xl border border-emerald-500/20">
            🏢
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Create Your First Business</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              You are authenticated but do not belong to any business organization yet. Set up your
              organization to access your Executive Business Dashboard.
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

  // Resolve requested or default active organization context via shared resolver
  let tenantContext;
  try {
    tenantContext = await resolveTenantContext(searchParams.org, {
      requireRoles: DASHBOARD_ALLOWED_ROLES,
      actorUser: user,
    });
  } catch (err: unknown) {
    if (err instanceof TenantContextError) {
      if (err.code === "MULTIPLE_ORGS_SPECIFY_REQUIRED") {
        // Multi-organization selection screen:
        const activeMemberships = user.memberships.filter(
          (m) => m.isActive && m.organization && m.organization.isActive
        );
        return (
          <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="max-w-md w-full text-center bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 space-y-5 shadow-xl">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto text-xl border border-emerald-500/20">
                🏢
              </div>
              <div className="space-y-1">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">Select Business</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  You belong to multiple businesses. Please select which organization you want to
                  view the dashboard for:
                </p>
              </div>
              <div className="space-y-2 pt-2 text-left">
                {activeMemberships.map((m) => (
                  <Link
                    key={m.organizationId}
                    href={`/dashboard?org=${m.organizationId}`}
                    className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors"
                  >
                    <div>
                      <span className="font-semibold text-sm text-slate-900 dark:text-white block">
                        {m.organization?.name}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">Role: {m.role.name}</span>
                    </div>
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Select &rarr;</span>
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
            <div className="max-w-md w-full text-center bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 space-y-4 shadow-xl">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto text-xl border border-rose-500/20">
                🚫
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">No Active Membership</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Your account does not have an active membership in any operational organization.
              </p>
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

      if (err.code === "MEMBERSHIP_NOT_FOUND" || err.code === "INACTIVE_MEMBERSHIP") {
        return (
          <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="max-w-md w-full text-center bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 space-y-4 shadow-xl">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto text-xl border border-rose-500/20">
                ⚠️
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Organization Inaccessible</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                The requested organization could not be found or your membership in it is inactive.
              </p>
              <div className="pt-2">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  &larr; Return to Dashboard
                </Link>
              </div>
            </div>
          </main>
        );
      }

      if (err.code === "UNAUTHORIZED_ROLE") {
        return (
          <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="max-w-md w-full text-center bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 space-y-4 shadow-xl">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto text-xl border border-rose-500/20">
                🚫
              </div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Access Denied</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Your role does not have permission to access the Executive Business Dashboard.
              </p>
            </div>
          </main>
        );
      }
    }

    throw err;
  }

  // Server-side initial data fetch via secure action with verified organization context
  const initialMetricsRes = await getDashboardMetricsAction(
    undefined,
    tenantContext.organizationId,
    { actorUser: user }
  );

  if (!initialMetricsRes.success || !initialMetricsRes.data) {
    return (
      <main className="min-h-screen bg-slate-50 dark:bg-[#080d1a] text-slate-900 dark:text-slate-100 p-6 md:p-12 flex items-center justify-center">
        <div className="max-w-md w-full text-center bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 space-y-4 shadow-xl">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto text-xl border border-rose-500/20">
            ⚠️
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Dashboard Unavailable</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {initialMetricsRes.error ||
              "An unexpected error occurred while loading initial metrics."}
          </p>
          <div className="pt-2">
            <Link
              href={`/dashboard?org=${tenantContext.organizationId}`}
              className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
            >
              Refresh Dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <DashboardView
      initialData={initialMetricsRes.data}
      userEmail={user.email}
      userName={user.name}
    />
  );
}
