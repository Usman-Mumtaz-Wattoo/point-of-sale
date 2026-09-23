export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-900 text-slate-100">
      <div className="max-w-md w-full rounded-xl border border-slate-800 bg-slate-950/70 p-8 shadow-2xl backdrop-blur text-center space-y-4">
        <div className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          Ready for Development
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Point of Sale SaaS
        </h1>
        <p className="text-sm text-slate-400">
          Foundation initialized successfully.
        </p>
        <div className="pt-4 flex items-center justify-center gap-3">
          <a
            href="/login"
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
          >
            Sign In
          </a>
          <a
            href="/signup"
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
          >
            Sign Up
          </a>
          <a
            href="/dashboard"
            className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium border border-slate-800 transition-colors"
          >
            Dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
