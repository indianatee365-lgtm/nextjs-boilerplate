import SignupForm from "./SignupForm"

export const metadata = {
  title: "Create Account | Tee365",
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string }>
}) {
  const { return: returnUrl } = await searchParams
  const safeReturn = returnUrl?.startsWith("/") ? returnUrl : undefined

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Create your account</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Already have an account?{" "}
          <a
            href={safeReturn ? `/login?return=${encodeURIComponent(safeReturn)}` : "/login"}
            className="text-brand hover:underline"
          >
            Sign in
          </a>
        </p>
      </div>
      <SignupForm returnUrl={safeReturn} />
    </main>
  )
}
