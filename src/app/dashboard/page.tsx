import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { getDashboardMetricsAction } from "./actions";
import { DASHBOARD_ALLOWED_ROLES } from "./types";
import { DashboardView } from "./dashboard-view";
import type { SystemRoleName } from "@/lib/roles";

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

  // Resolve requested or default active organization membership
  const requestedOrgId = searchParams.org;
  const activeMembership = requestedOrgId
    ? user.memberships.find((m) => m.organizationId === requestedOrgId && m.isActive) ||
      user.memberships.find((m) => m.isActive) ||
      user.memberships[0]
    : user.memberships.find((m) => m.isActive) || user.memberships[0];

  const organization = activeMembership.organization;
  const userRole = activeMembership.role.name as SystemRoleName;

  // Server-side role enforcement
  if (!DASHBOARD_ALLOWED_ROLES.includes(userRole)) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12 flex items-center justify-center">
        <div className="max-w-md w-full text-center bg-slate-950 border border-slate-800 rounded-2xl p-8 space-y-4 shadow-xl">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto text-xl border border-rose-500/20">
            🚫
          </div>
          <h1 className="text-xl font-bold text-white">Access Denied</h1>
          <p className="text-sm text-slate-400">
            Your role (<strong className="text-slate-200">{userRole}</strong>) does not have
            permission to access the Executive Business Dashboard.
          </p>
        </div>
      </main>
    );
  }

  // Server-side initial data fetch via secure action
  const initialMetricsRes = await getDashboardMetricsAction(undefined, organization.id);

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
              href="/dashboard"
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
