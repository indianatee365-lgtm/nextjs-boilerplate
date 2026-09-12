import LoginForm from "./LoginForm"

export const metadata = { title: "Sign In | Tee365" }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string }>
}) {
  const { return: returnUrl } = await searchParams
  const safeReturn = returnUrl?.startsWith("/") ? returnUrl : undefined
  const signupHref = safeReturn ? `/signup?return=${encodeURIComponent(safeReturn)}` : "/signup"

  // Anyone sent here from /book is usually a first-time customer trying to
  // buy, not a returning one. The only route to signup used to be a
  // neutral-400 line of small print above the form, and people sat on this
  // page without ever seeing it. The prompt now appears twice: once inline
  // for anyone reading top-down, and once as a real button BELOW the form,
  // which is where someone looks after the sign-in they do not have fails.
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Sign in</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Don&apos;t have an account?{" "}
          <a href={signupHref} className="font-semibold text-brand underline underline-offset-2">
            Create one
          </a>
        </p>
      </div>

      <LoginForm returnUrl={safeReturn} />

      <div className="mt-10">
        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-white/10" />
          <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
            New to Tee365?
          </span>
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <a
          href={signupHref}
          className="mt-5 flex w-full items-center justify-center rounded-xl px-5 py-3.5 text-sm font-semibold text-black transition hover:brightness-95"
          style={{ backgroundColor: "var(--brand)" }}
        >
          Create an account
        </a>

        <p className="mt-3 text-center text-xs leading-relaxed text-neutral-500">
          Takes about a minute. You need one to book a bay and get your door code.
        </p>
      </div>
    </main>
  )
}
