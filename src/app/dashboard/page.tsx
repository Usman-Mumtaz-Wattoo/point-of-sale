import { requireAuth } from "@/lib/auth";
import { signOutAction } from "@/app/auth/actions";

export default async function DashboardPage() {
  const user = await requireAuth();

  const membershipCount = user.memberships?.length ?? 0;

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header with user info & sign out */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-slate-800 gap-4">
          <div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
              Authenticated Session
            </span>
            <h1 className="text-2xl font-bold text-white">Identity Verification Dashboard</h1>
            <p className="text-sm text-slate-400">
              Welcome, <span className="text-slate-200 font-medium">{user.name}</span> ({user.email})
            </p>
          </div>

          <form action={signOutAction}>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-slate-700 hover:border-slate-600"
            >
              Sign Out
            </button>
          </form>
        </div>

        {/* Identity Details Card */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Application Identity
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
              <span className="text-slate-500 block mb-1">Prisma User ID (CUID):</span>
              <span className="text-slate-200 break-all">{user.id}</span>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
              <span className="text-slate-500 block mb-1">Supabase Auth ID (UUID):</span>
              <span className="text-emerald-400 break-all">{user.supabaseAuthId}</span>
            </div>
          </div>
        </div>

        {/* Organization Memberships & Zero-Org Handling */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Tenant Memberships ({membershipCount})
            </h2>
          </div>

          {membershipCount === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/30 p-8 text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto text-lg">
                🏢
              </div>
              <h3 className="text-base font-medium text-white">No Organization Yet</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                Your account is verified, but you are not yet a member of any organization.
                Organization creation and team onboarding will be available in future steps.
              </p>
              <div className="pt-2">
                <span className="inline-block px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
                  Onboarding placeholder (Step 7)
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {user.memberships.map((membership) => (
                <div
                  key={membership.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg bg-slate-900/50 border border-slate-800 gap-3"
                >
                  <div>
                    <h4 className="text-sm font-medium text-white">
                      {membership.organization.name}
                    </h4>
                    <span className="text-xs text-slate-400">
                      Slug: {membership.organization.slug}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {membership.role.name}
                    </span>
                    <span className="text-xs text-slate-500">
                      {membership.branchMemberships.length} branch access
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
