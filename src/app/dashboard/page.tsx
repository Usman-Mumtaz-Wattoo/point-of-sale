import Link from "next/link";
import { requireAuth } from "@/lib/auth";
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

  // Zero-organization handling
  if (user.memberships.length === 0) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12 flex items-center justify-center">
        <div className="max-w-md w-full text-center bg-slate-950 border border-slate-800 rounded-2xl p-8 space-y-4 shadow-xl">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto text-xl border border-emerald-500/20">
            🏢
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-white">Create Your First Business</h1>
            <p className="text-sm text-slate-400">
              You are authenticated but do not belong to any business organization yet. Set up your
              organization to access your Executive Business Dashboard.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/onboarding"
              className="inline-flex items-center px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-emerald-950/40"
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
          <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="max-w-md w-full text-center bg-slate-950 border border-slate-800 rounded-2xl p-8 space-y-5 shadow-xl">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto text-xl border border-emerald-500/20">
                🏢
              </div>
              <div className="space-y-1">
                <h1 className="text-xl font-bold text-white">Select Business</h1>
                <p className="text-sm text-slate-400">
                  You belong to multiple businesses. Please select which organization you want to
                  view the dashboard for:
                </p>
              </div>
              <div className="space-y-2 pt-2 text-left">
                {activeMemberships.map((m) => (
                  <Link
                    key={m.organizationId}
                    href={`/dashboard?org=${m.organizationId}`}
                    className="flex items-center justify-between p-3.5 rounded-xl border border-slate-800 bg-slate-900/60 hover:border-emerald-500 hover:bg-emerald-950/20 transition-colors"
                  >
                    <div>
                      <span className="font-semibold text-sm text-white block">
                        {m.organization?.name}
                      </span>
                      <span className="text-xs text-slate-400">Role: {m.role.name}</span>
                    </div>
                    <span className="text-xs font-semibold text-emerald-400">Select &rarr;</span>
                  </Link>
                ))}
              </div>
            </div>
          </main>
        );
      }

      if (err.code === "NO_ACTIVE_MEMBERSHIP") {
        return (
          <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="max-w-md w-full text-center bg-slate-950 border border-slate-800 rounded-2xl p-8 space-y-4 shadow-xl">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto text-xl border border-rose-500/20">
                🚫
              </div>
              <h1 className="text-xl font-bold text-white">No Active Membership</h1>
              <p className="text-sm text-slate-400">
                Your account does not have an active membership in any operational organization.
              </p>
              <div className="pt-2">
                <Link
                  href="/onboarding"
                  className="inline-flex items-center px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-emerald-950/40"
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
          <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="max-w-md w-full text-center bg-slate-950 border border-slate-800 rounded-2xl p-8 space-y-4 shadow-xl">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto text-xl border border-rose-500/20">
                ⚠️
              </div>
              <h1 className="text-xl font-bold text-white">Organization Inaccessible</h1>
              <p className="text-sm text-slate-400">
                The requested organization could not be found or your membership in it is inactive.
              </p>
              <div className="pt-2">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
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
          <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12 flex items-center justify-center">
            <div className="max-w-md w-full text-center bg-slate-950 border border-slate-800 rounded-2xl p-8 space-y-4 shadow-xl">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto text-xl border border-rose-500/20">
                🚫
              </div>
              <h1 className="text-xl font-bold text-white">Access Denied</h1>
              <p className="text-sm text-slate-400">
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
  const initialMetricsRes = await getDashboardMetricsAction(undefined, tenantContext.organizationId);

  if (!initialMetricsRes.success || !initialMetricsRes.data) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12 flex items-center justify-center">
        <div className="max-w-md w-full text-center bg-slate-950 border border-slate-800 rounded-2xl p-8 space-y-4 shadow-xl">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto text-xl border border-rose-500/20">
            ⚠️
          </div>
          <h1 className="text-xl font-bold text-white">Dashboard Unavailable</h1>
          <p className="text-sm text-slate-400">
            {initialMetricsRes.error ||
              "An unexpected error occurred while loading initial metrics."}
          </p>
          <div className="pt-2">
            <Link
              href={`/dashboard?org=${tenantContext.organizationId}`}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
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
