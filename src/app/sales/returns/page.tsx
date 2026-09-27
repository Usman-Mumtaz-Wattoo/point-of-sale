import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import {
  SALE_RETURN_READ_ROLES,
  SALE_RETURN_MUTATION_ROLES,
} from "@/lib/sale-returns";
import { SYSTEM_ROLES, type SystemRoleName } from "@/lib/roles";
import { db } from "@/lib/db";
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

  if (user.memberships.length === 0) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12">
        <div className="max-w-3xl mx-auto text-center bg-slate-950 border border-slate-800 rounded-xl p-12 space-y-4">
          <div className="w-12 h-12 rounded-full bg-slate-900 text-slate-400 flex items-center justify-center mx-auto text-xl border border-slate-800">
            🏢
          </div>
          <h1 className="text-xl font-bold text-white">No Business Found</h1>
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

  // Resolve requested or default active membership
  const requestedOrgId = searchParams.org;
  const activeMembership = requestedOrgId
    ? user.memberships.find((m) => m.organizationId === requestedOrgId && m.isActive) ||
      user.memberships.find((m) => m.isActive) ||
      user.memberships[0]
    : user.memberships.find((m) => m.isActive) || user.memberships[0];

  const organization = activeMembership.organization;
  const userRole = activeMembership.role.name as SystemRoleName;

  // Strict server-side role gate: INVENTORY_MANAGER or any role not in SALE_RETURN_READ_ROLES is denied
  if (!SALE_RETURN_READ_ROLES.includes(userRole)) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12">
        <div className="max-w-3xl mx-auto text-center bg-slate-950 border border-slate-800 rounded-xl p-12 space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto text-xl border border-rose-500/20">
            🚫
          </div>
          <h1 className="text-xl font-bold text-white">Access Denied</h1>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Your role (<strong className="text-slate-200">{userRole}</strong>) does not have
            permission to access Sales Returns & Refunds.
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

  const canCreateReturn = SALE_RETURN_MUTATION_ROLES.includes(userRole);

  // Resolve accessible active branches
  const isOwner = userRole === SYSTEM_ROLES.OWNER;
  const branches = isOwner
    ? await db.branch.findMany({
        where: { organizationId: organization.id, isActive: true },
        select: { id: true, name: true, code: true },
        orderBy: { name: "asc" },
      })
    : activeMembership.branchMemberships
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
