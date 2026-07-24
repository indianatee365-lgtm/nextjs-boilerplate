"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { z } from "zod"
import { randomBytes } from "crypto"
import { sendParentalConsentRequestEmail, sendAccountWelcomeEmail } from "@/lib/resend/email"
import { headers } from "next/headers"
import { authRatelimit } from "@/lib/ratelimit"

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 10) return "+1" + digits
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits
  return raw.startsWith("+") ? raw : "+" + raw
}

async function verifyTurnstile(token: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true
  if (!token) return false
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, response: token }),
  })
  const data = await res.json()
  return data.success === true
}

const SignupSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  isMinor: z.enum(["true", "false"]).transform((v) => v === "true"),
  parentEmail: z.string().email("Valid parent email required").optional().or(z.literal("")),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().min(10, "Valid phone number required").optional().or(z.literal("")),
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

export type SignupState = {
  errors?: Record<string, string[]>
  message?: string
}

export async function signup(
  prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const ip = (await headers()).get("cf-connecting-ip") ?? (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "anonymous"
  const { success } = await authRatelimit.limit(ip)
  if (!success) return { message: "Too many attempts. Please try again later." }

  if (!(await verifyTurnstile(formData.get("cf-turnstile-response") as string | null))) {
    return { message: "Bot verification failed. Please try again." }
  }

  const supabase = await createClient()

  const parsed = SignupSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    password: formData.get("password"),
    isMinor: formData.get("isMinor") as string,
    parentEmail: formData.get("parentEmail") as string | null ?? "",
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const { firstName, lastName, phone, email, password, isMinor, parentEmail } = parsed.data

  if (isMinor && !parentEmail) {
    return { errors: { parentEmail: ["Parent or guardian email is required"] } }
  }

  const { data: signUpData, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name: firstName, last_name: lastName, phone: phone?.trim() ? normalizePhone(phone.trim()) : undefined },
    },
  })

  if (error) {
    return { message: "Unable to create account. If you already have one, try signing in." }
  }

  const userId = signUpData.user?.id

  if (userId) {
    const svcClient = await createServiceClient()
    await svcClient.from("profiles").update({ sms_consent: formData.get("smsConsent") === "on" }).eq("id", userId)
  }

  if (isMinor && userId && parentEmail) {
    const serviceClient = await createServiceClient()
    await serviceClient.from("profiles").update({ is_minor: true }).eq("id", userId)
    const token = randomBytes(32).toString("hex")
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await serviceClient.from("parental_consents").insert({
      minor_user_id: userId,
      parent_email: parentEmail,
      token,
      token_expires_at: expires.toISOString(),
    })
    try {
      await sendParentalConsentRequestEmail({
        to: parentEmail,
        minorFirstName: firstName,
        consentUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://tee365.org"}/minor-consent/${token}`,
      })
    } catch { /* non-fatal */ }
    revalidatePath("/", "layout")
    redirect("/account/awaiting-consent")
  }

  try {
    await sendAccountWelcomeEmail({ to: email, firstName })
  } catch { /* non-fatal */ }

  revalidatePath("/", "layout")
  const returnUrl = formData.get("returnUrl") as string | null
  redirect(returnUrl?.startsWith("/") ? returnUrl : "/account")
}

export async function login(
  prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const ip = (await headers()).get("cf-connecting-ip") ?? (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "anonymous"
  const { success } = await authRatelimit.limit(ip)
  if (!success) return { message: "Too many attempts. Please try again later." }

  if (!(await verifyTurnstile(formData.get("cf-turnstile-response") as string | null))) {
    return { message: "Bot verification failed. Please try again." }
  }

  const supabase = await createClient()

  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!email || !password) {
    return { message: "Email and password are required" }
  }

  const { data: { user: loggedInUser }, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !loggedInUser) {
    return { message: "Invalid email or password" }
  }

  revalidatePath("/", "layout")
  const returnUrl = formData.get("returnUrl") as string | null
  if (returnUrl?.startsWith("/")) redirect(returnUrl)

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", loggedInUser.id).single()
  redirect((profile as { role: string } | null)?.role === "admin" ? "/admin" : "/account")
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath("/", "layout")
  redirect("/login")
}

export async function requestPasswordReset(
  prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const ip = (await headers()).get("cf-connecting-ip") ?? (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "anonymous"
  const { success } = await authRatelimit.limit(ip)
  if (!success) return { message: "Too many attempts. Please try again later." }

  const email = (formData.get("email") as string)?.trim()
  if (!email) return { message: "Email is required" }

  const supabase = await createClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tee365.org"

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  })

  if (error) return { message: error.message }

  return { message: "Check your email for a password reset link." }
}

export async function updatePassword(
  prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const password = formData.get("password") as string
  const confirm = formData.get("confirm") as string

  if (!password || password.length < 8) {
    return { message: "Password must be at least 8 characters" }
  }
  if (password !== confirm) {
    return { message: "Passwords do not match" }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })

  if (error) return { message: error.message }

  revalidatePath("/", "layout")
  redirect("/account")
}
