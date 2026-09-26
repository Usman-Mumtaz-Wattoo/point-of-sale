import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import {
  listCustomers,
  CUSTOMER_READ_ROLES,
  CUSTOMER_MUTATION_ROLES,
  CUSTOMER_STATUS_ROLES,
} from "@/lib/customers";
import { SYSTEM_ROLES, type SystemRoleName } from "@/lib/roles";
import { db } from "@/lib/db";
import { CustomerView } from "./customer-view";

export const metadata = {
  title: "Customer Management — POS SaaS",
  description: "Manage registered customers, contact details, and primary branches.",
};

interface CustomersPageProps {
  searchParams: Promise<{
    org?: string;
    search?: string;
    status?: string;
    page?: string;
  }>;
}

export default async function CustomersPage(props: CustomersPageProps) {
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
            You need to create or belong to an organization before accessing customer management.
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

  // Strict server-side role gate: INVENTORY_MANAGER or any role not in CUSTOMER_READ_ROLES is denied
  if (!CUSTOMER_READ_ROLES.includes(userRole)) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12">
        <div className="max-w-3xl mx-auto text-center bg-slate-950 border border-slate-800 rounded-xl p-12 space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto text-xl border border-rose-500/20">
            🚫
          </div>
          <h1 className="text-xl font-bold text-white">Access Denied</h1>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Your role (<strong className="text-slate-200">{userRole}</strong>) does not have
            permission to access Customer Management.
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

  const canMutate = CUSTOMER_MUTATION_ROLES.includes(userRole);
  const canChangeStatus = CUSTOMER_STATUS_ROLES.includes(userRole);

  // Parse filters
  const page = searchParams.page ? Math.max(1, parseInt(searchParams.page, 10) || 1) : 1;
  const search = searchParams.search?.trim() || undefined;

  let isActiveFilter: boolean | undefined = undefined;
  if (searchParams.status === "active") {
    isActiveFilter = true;
  } else if (searchParams.status === "inactive") {
    isActiveFilter = false;
  }

  // Fetch accessible active branches for primary branch selector
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

  // Fetch paginated customers using authoritative business service
  const paginatedResult = await listCustomers(
    {
      page,
      pageSize: 25,
      search,
      isActive: isActiveFilter,
    },
    {
      organizationId: organization.id,
      actorUser: user,
    }
  );

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-800 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link
                href="/dashboard"
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                &larr; Dashboard
              </Link>
              <span className="text-slate-600 text-xs">•</span>
              <span className="text-xs text-slate-400">Customer Management</span>
            </div>
            <h1 className="text-2xl font-bold text-white">
              {organization.name} — Customers
            </h1>
            <p className="text-xs text-slate-400">
              Manage customer records, tax identifiers, and contact profiles across all branches.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Role: {userRole}
            </span>
            <Link
              href={`/pos?org=${organization.id}`}
              className="px-3 py-1.5 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              Go to POS &rarr;
            </Link>
          </div>
        </div>

        {/* Customer Management View */}
        <CustomerView
          organizationId={organization.id}
          organizationName={organization.name}
          userRole={userRole}
          canMutate={canMutate}
          canChangeStatus={canChangeStatus}
          branches={branches}
          customers={paginatedResult.items}
          pagination={{
            page: paginatedResult.page,
            pageSize: paginatedResult.pageSize,
            total: paginatedResult.total,
            totalPages: paginatedResult.totalPages,
          }}
          currentSearch={search}
          currentStatus={searchParams.status || "all"}
        />
      </div>
    </main>
  );
}
