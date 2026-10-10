import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import {
  SALE_RETURN_READ_ROLES,
  SALE_RETURN_MUTATION_ROLES,
} from "@/lib/sale-returns";
import { SYSTEM_ROLES, type SystemRoleName } from "@/lib/roles";
import { db } from "@/lib/db";
import { resolveTenantContext, TenantContextError } from "@/lib/tenant-context";
import { ReturnsView } from "./returns-view";
import { listSaleReturnsAction } from "./actions";
import type { SerializedPaginatedReturns } from "./types";

export const metadata = {
  title: "Sales Returns & Refunds — Point of Sale",
  description: "Process product returns, issue atomic payment refunds, and inspect return history.",
};

interface ReturnsPageProps {
  searchParams: Promise<{
    org?: string;
  }>;
}

export default async function SalesReturnsPage(props: ReturnsPageProps) {
  const user = await requireAuth();
  const searchParams = await props.searchParams;
  const requestedOrgId = searchParams.org;

  let tenantContext;
  try {
    tenantContext = await resolveTenantContext(requestedOrgId, {
      requireRoles: SALE_RETURN_READ_ROLES,
      actorUser: user,
    });
  } catch (err: unknown) {
    if (err instanceof TenantContextError) {
      if (err.code === "MULTIPLE_ORGS_SPECIFY_REQUIRED") {
        const eligibleMemberships = user.memberships.filter(
          (m) =>
            m.isActive &&
            m.organization.isActive &&
            SALE_RETURN_READ_ROLES.includes(m.role.name as SystemRoleName)
        );

        return (
          <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12">
            <div className="max-w-xl mx-auto bg-slate-950 border border-slate-800 rounded-xl p-8 space-y-6">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto text-xl border border-emerald-500/20">
                  🏢
                </div>
                <h1 className="text-xl font-bold text-white">Select Business</h1>
                <p className="text-sm text-slate-400">
                  You have access to multiple businesses. Please choose which business to process sales returns for.
                </p>
              </div>

              <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden">
                {eligibleMemberships.map((m) => (
                  <Link
                    key={m.organizationId}
                    href={`/sales/returns?org=${m.organizationId}`}
                    className="flex items-center justify-between p-4 hover:bg-slate-900/60 transition-colors"
                  >
                    <div>
                      <div className="text-sm font-medium text-white">{m.organization.name}</div>
                      <div className="text-xs text-slate-400 capitalize">Role: {m.role.name.toLowerCase()}</div>
                    </div>
                    <span className="text-xs text-emerald-400 font-semibold">&rarr;</span>
                  </Link>
                ))}
              </div>

              <div className="text-center pt-2">
                <Link
                  href="/dashboard"
                  className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
                >
                  &larr; Back to Dashboard
                </Link>
              </div>
            </div>
          </main>
        );
      }

      if (err.code === "NO_ACTIVE_MEMBERSHIP") {
        return (
          <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12">
            <div className="max-w-3xl mx-auto text-center bg-slate-950 border border-slate-800 rounded-xl p-12 space-y-4">
              <div className="w-12 h-12 rounded-full bg-slate-900 text-slate-400 flex items-center justify-center mx-auto text-xl border border-slate-800">
                🏢
              </div>
              <h1 className="text-xl font-bold text-white">No Active Business Found</h1>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                You must belong to an active organization to access the Sales Returns management screen.
              </p>
              <div className="pt-2">
                <Link
                  href="/onboarding"
                  className="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors"
                >
                  Create Your Business &rarr;
                </Link>
              </div>
            </div>
          </main>
        );
      }

      if (err.code === "MEMBERSHIP_NOT_FOUND" || err.code === "INACTIVE_MEMBERSHIP") {
        return (
          <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12">
            <div className="max-w-3xl mx-auto text-center bg-slate-950 border border-slate-800 rounded-xl p-12 space-y-4">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto text-xl border border-amber-500/20">
                ⚠️
              </div>
              <h1 className="text-xl font-bold text-white">Business Unavailable</h1>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                {err.message}
              </p>
              <div className="pt-2">
                <Link
                  href="/sales/returns"
                  className="inline-flex items-center px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
                >
                  Choose Another Business
                </Link>
              </div>
            </div>
          </main>
        );
      }

      if (err.code === "UNAUTHORIZED_ROLE") {
        return (
          <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12">
            <div className="max-w-3xl mx-auto text-center bg-slate-950 border border-slate-800 rounded-xl p-12 space-y-4">
              <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto text-xl border border-rose-500/20">
                🚫
              </div>
              <h1 className="text-xl font-bold text-white">Access Denied</h1>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                Your role does not have permission to access Sales Returns & Refunds.
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
    }
    throw err;
  }

  const organization = tenantContext.organization;
  const userRole = tenantContext.role;
  const activeMembership =
    user.memberships.find((m) => m.id === tenantContext.membershipId) ||
    user.memberships.find((m) => m.organizationId === tenantContext.organizationId)!;

  const canCreateReturn = SALE_RETURN_MUTATION_ROLES.includes(userRole);

  // Resolve accessible active branches
  const isOwner = userRole === SYSTEM_ROLES.OWNER;
  const branches = isOwner
    ? await db.branch.findMany({
        where: { organizationId: organization.id, isActive: true },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      })
    : (activeMembership.branchMemberships || [])
        .filter((bm) => bm.branch.isActive)
        .map((bm) => ({
          id: bm.branch.id,
          name: bm.branch.name,
          code: bm.branch.code,
        }));

  // Fetch initial returns history
  const initialReturnsRes = await listSaleReturnsAction(
    { page: 1, pageSize: 10 },
    organization.id
  );

  const initialReturns: SerializedPaginatedReturns = initialReturnsRes.success && initialReturnsRes.data
    ? initialReturnsRes.data
    : { items: [], page: 1, pageSize: 10, totalItems: 0, totalPages: 0 };

  return (
    <ReturnsView
      organizationId={organization.id}
      organizationName={organization.name}
      userRole={userRole}
      userName={user.name}
      canCreateReturn={canCreateReturn}
      branches={branches}
      initialReturns={initialReturns}
    />
  );
}
