import Image from "next/image";
import { Zap } from "lucide-react";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next || "/";

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "var(--background)" }}
    >
      <section
        className="relative w-full max-w-sm rounded-2xl border p-8 shadow-2xl"
        style={{
          background: "var(--surface-1)",
          borderColor: "var(--border-default)",
          boxShadow: "0 0 40px rgba(6, 182, 212, 0.08), 0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl border border-cyan-500/30 bg-slate-950 shadow-xl shadow-cyan-950/40">
            <Image
              src="/brand/automatrix-logo.png"
              alt="Automatrix Engineering"
              width={84}
              height={84}
              className="object-contain"
              priority
            />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Automatrix Engineering</p>
            <div className="my-1 flex items-center justify-center gap-2">
              <Zap size={16} className="text-cyan-400" />
              <h1 className="text-xl font-bold tracking-tight text-cyan-200">VOLTAGETEST / UMS</h1>
            </div>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Industrial UPS Monitoring
            </p>
          </div>
        </div>

        {params.error ? (
          <div
            className="mb-5 rounded-lg border px-3 py-2.5 text-sm font-semibold text-red-400"
            style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.25)" }}
          >
            Invalid username or password.
          </div>
        ) : null}

        <form action="/api/login" method="post" className="grid gap-4">
          <input name="next" type="hidden" value={next} />

          <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
            Username
            <input
              autoComplete="username"
              className="rounded-lg border border-slate-600 px-3 py-2.5 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20"
              style={{ background: "var(--surface-2)" }}
              name="username"
              required
            />
          </label>

          <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
            Password
            <input
              autoComplete="current-password"
              className="rounded-lg border border-slate-600 px-3 py-2.5 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20"
              style={{ background: "var(--surface-2)" }}
              name="password"
              required
              type="password"
            />
          </label>

          <button
            className="mt-1 rounded-lg py-2.5 text-sm font-bold text-white transition-all hover:brightness-110 active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, var(--cyan-600, #0891b2), var(--cyan-500))",
              boxShadow: "0 4px 16px rgba(6,182,212,0.25)",
            }}
            type="submit"
          >
            Sign in
          </button>
        </form>

        <p className="mt-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
          (c) {new Date().getFullYear()} Automatrix Engineering
        </p>
      </section>
    </main>
  );
}
