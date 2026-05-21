import Image from "next/image";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next || "/";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef3f8] px-4 text-slate-950">
      <section className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Image
            src="/brand/automatrix-logo.png"
            alt="Automatrix"
            width={56}
            height={56}
            className="object-contain"
            priority
          />
          <div>
            <h1 className="text-xl font-semibold text-slate-950">UMS — UPS Monitoring</h1>
            <p className="text-sm text-slate-500">Industrial UPS Monitoring System by Automatrix</p>
          </div>
        </div>

        {params.error ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            Invalid username or password.
          </div>
        ) : null}

        <form action="/api/login" method="post" className="grid gap-4">
          <input name="next" type="hidden" value={next} />
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Username
            <input
              autoComplete="username"
              className="rounded-md border border-slate-300 px-3 py-2 font-normal"
              name="username"
              required
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Password
            <input
              autoComplete="current-password"
              className="rounded-md border border-slate-300 px-3 py-2 font-normal"
              name="password"
              required
              type="password"
            />
          </label>
          <button className="rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white" type="submit">
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}

