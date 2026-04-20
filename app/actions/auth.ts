"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"

const SignupSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().min(10, "Valid phone number required"),
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  disclosureIds: z.array(z.string()).min(1, "You must acknowledge all disclosures"),
})

export type SignupState = {
  errors?: Record<string, string[]>
  message?: string
}

export async function signup(
  prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const supabase = await createClient()

  const disclosureIds = formData.getAll("disclosureId") as string[]

  const parsed = SignupSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    password: formData.get("password"),
    disclosureIds,
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const { firstName, lastName, phone, email, password } = parsed.data

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name: firstName, last_name: lastName, phone },
    },
  })

  if (error) {
    return { message: error.message }
  }

  if (data.user) {
    // Record disclosure acknowledgments
    const acks = disclosureIds.map((id) => ({
      user_id: data.user!.id,
      disclosure_id: id,
    }))

    await supabase.from("disclosure_acknowledgments").insert(acks)
  }

  revalidatePath("/", "layout")
  redirect("/account")
}

export async function login(
  prevState: SignupState,
  formData: FormData
): Promise<SignupState> {
  const supabase = await createClient()

  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!email || !password) {
    return { message: "Email and password are required" }
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { message: "Invalid email or password" }
  }

  revalidatePath("/", "layout")
  redirect("/account")
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath("/", "layout")
  redirect("/login")
}
