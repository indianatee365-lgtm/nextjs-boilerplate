import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'nonce-" + nonce + "' 'strict-dynamic' https://js.stripe.com https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.stripe.com https://www.google-analytics.com",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://r.stripe.com https://errors.stripe.com https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com",
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (pathname.startsWith("/account") && !user) {
    const redirect = NextResponse.redirect(new URL("/login", request.url))
    redirect.headers.set("Content-Security-Policy", csp)
    return redirect
  }

  if (pathname.startsWith("/admin") && !user) {
    const redirect = NextResponse.redirect(new URL("/login", request.url))
    redirect.headers.set("Content-Security-Policy", csp)
    return redirect
  }

  if (pathname.startsWith("/gift-cards") && !user) {
    const redirect = NextResponse.redirect(new URL("/login", request.url))
    redirect.headers.set("Content-Security-Policy", csp)
    return redirect
  }

  if ((pathname === "/login" || pathname === "/signup") && user) {
    const redirect = NextResponse.redirect(new URL("/account", request.url))
    redirect.headers.set("Content-Security-Policy", csp)
    return redirect
  }

  supabaseResponse.headers.set("Content-Security-Policy", csp)
  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook|display).*)",
  ],
}
