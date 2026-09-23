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
      </div>
    </main>
  );
}
