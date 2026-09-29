import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { SALE_READ_ROLES } from "@/lib/sales";
import { SYSTEM_ROLES, type SystemRoleName } from "@/lib/roles";
import { db } from "@/lib/db";
import { SalesView } from "./sales-view";
import { listSalesAction } from "./actions";
import type { SerializedPaginatedSales } from "./types";

export const metadata = {
  title: "Sales Orders & History — Point of Sale",
  description: "Inspect historical sales orders, monitor revenue KPIs, and search customer transactions.",
};

interface SalesPageProps {
  searchParams: Promise<{
    org?: string;
  }>;
}

export default async function SalesPage(props: SalesPageProps) {
  const user = await requireAuth();
  const searchParams = await props.searchParams;

  // Zero-organization handling
  if (user.memberships.length === 0) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12">
        <div className="max-w-3xl mx-auto text-center bg-slate-950 border border-slate-800 rounded-xl p-12 space-y-4">
          <div className="w-12 h-12 rounded-full bg-slate-900 text-slate-400 flex items-center justify-center mx-auto text-xl border border-slate-800">
            🏢
          </div>
          <h1 className="text-xl font-bold text-white">No Business Found</h1>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            You must belong to an active organization to access the Sales History screen.
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

  // Resolve requested or default active organization membership
  const requestedOrgId = searchParams.org;
  const activeMembership = requestedOrgId
    ? user.memberships.find((m) => m.organizationId === requestedOrgId && m.isActive) ||
      user.memberships.find((m) => m.isActive) ||
      user.memberships[0]
    : user.memberships.find((m) => m.isActive) || user.memberships[0];

  const organization = activeMembership.organization;
  const userRole = activeMembership.role.name as SystemRoleName;

  // Server-side role enforcement: Only SALE_READ_ROLES (OWNER, MANAGER, CASHIER, ACCOUNTANT)
  // Unsupported roles like INVENTORY_MANAGER are strictly denied
  if (!SALE_READ_ROLES.includes(userRole)) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12">
        <div className="max-w-3xl mx-auto text-center bg-slate-950 border border-slate-800 rounded-xl p-12 space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto text-xl border border-rose-500/20">
            🚫
          </div>
          <h1 className="text-xl font-bold text-white">Access Denied</h1>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Your role (<strong className="text-slate-200">{userRole}</strong>) does not have
            permission to access Sales Orders & History.
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

  // Resolve accessible active branches for the caller
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

  // Fetch initial sales history via server action
  const initialSalesRes = await listSalesAction(
    { page: 1, pageSize: 25 },
    organization.id
  );

  const initialSales: SerializedPaginatedSales =
    initialSalesRes.success && initialSalesRes.data
      ? initialSalesRes.data
      : {
          items: [],
          page: 1,
          pageSize: 25,
          totalItems: 0,
          totalPages: 0,
          kpiSummary: {
            totalSalesCount: 0,
            totalCompletedRevenue: "0.00",
            totalDiscountAmount: "0.00",
            totalTaxAmount: "0.00",
          },
        };

  return (
    <SalesView
      organizationId={organization.id}
      organizationName={organization.name}
      organizationTimezone={organization.timezone || "UTC"}
      organizationCurrency={organization.currency || "USD"}
      userRole={userRole}
      userName={user.name}
      branches={branches}
      initialSales={initialSales}
    />
  );
}
