import ForgotPasswordForm from "./ForgotPasswordForm"

export const metadata = { title: "Reset Password | Tee365" }

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Reset your password</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>
      <ForgotPasswordForm />
    </main>
  )
}
