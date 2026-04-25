import LoginForm from "./LoginForm"

export const metadata = { title: "Sign In | Tee365" }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string }>
}) {
  const { return: returnUrl } = await searchParams
  const safeReturn = returnUrl?.startsWith("/") ? returnUrl : undefined

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Sign in</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Don&apos;t have an account?{" "}
          <a
            href={safeReturn ? `/signup?return=${encodeURIComponent(safeReturn)}` : "/signup"}
            className="text-brand hover:underline"
          >
            Create one
          </a>
        </p>
      </div>
      <LoginForm returnUrl={safeReturn} />
    </main>
  )
}
