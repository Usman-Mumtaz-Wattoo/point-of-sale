import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { SYSTEM_ROLES } from "@/lib/roles";
import { getOrganizationSettingsAction } from "./actions";
import { SettingsView } from "./settings-view";

export const metadata = {
  title: "Organization Settings — Point of Sale",
  description: "Manage business identity, contact details, currency, and timezone settings.",
};

export default async function SettingsPage() {
  const user = await requireAuth();

  // Zero-membership handling
  if (user.memberships.length === 0) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12 flex items-center justify-center">
        <div className="max-w-md w-full text-center bg-slate-950 border border-slate-800 rounded-2xl p-8 space-y-4 shadow-xl">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto text-xl border border-emerald-500/20">
            🏢
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-white">No Organization Found</h1>
            <p className="text-sm text-slate-400">
              You do not belong to any active organization yet. Complete setup to manage business
              settings.
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

  // Find user's active membership
  const activeMembership = user.memberships.find(
    (m) => m.isActive && m.organization && m.organization.isActive
  );

  // Server-side OWNER role enforcement
  if (!activeMembership || activeMembership.role.name !== SYSTEM_ROLES.OWNER) {
    const userRole = activeMembership?.role?.name || "Staff";
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12 flex items-center justify-center">
        <div className="max-w-md w-full text-center bg-slate-950 border border-slate-800 rounded-2xl p-8 space-y-4 shadow-xl">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto text-xl border border-rose-500/20">
            🚫
          </div>
          <h1 className="text-xl font-bold text-white">Access Denied</h1>
          <p className="text-sm text-slate-400">
            Your current role (<strong className="text-slate-200">{userRole}</strong>) does not have
            permission to manage organization settings. Only the organization{" "}
            <strong className="text-emerald-400">OWNER</strong> can modify these settings.
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

  // Fetch verified initial settings via server action
  const settingsRes = await getOrganizationSettingsAction();

  if (!settingsRes.success) {
    return (
      <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12 flex items-center justify-center">
        <div className="max-w-md w-full text-center bg-slate-950 border border-slate-800 rounded-2xl p-8 space-y-4 shadow-xl">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto text-xl border border-rose-500/20">
            ⚠️
          </div>
          <h1 className="text-xl font-bold text-white">Settings Unavailable</h1>
          <p className="text-sm text-slate-400">
            {settingsRes.error || "An unexpected error occurred while loading organization settings."}
          </p>
          <div className="pt-2">
            <Link
              href="/settings"
              className="inline-flex items-center px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
            >
              Try Again
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <SettingsView
      initialData={settingsRes.data}
      userEmail={user.email}
      userName={user.name}
    />
  );
}
