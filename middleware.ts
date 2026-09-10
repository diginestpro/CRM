import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Never redirect API routes or the public /pay/* page.
  // Webhooks from payment gateways must run without auth checks.
  if (pathname.startsWith('/api/') || pathname.startsWith('/pay/')) {
    return response
  }

  // Protected routes
  const isProtectedRoute = request.nextUrl.pathname.startsWith('/dashboard') ||
                           request.nextUrl.pathname.startsWith('/clients') ||
                           request.nextUrl.pathname.startsWith('/services') ||
                           request.nextUrl.pathname.startsWith('/quotations') ||
                           request.nextUrl.pathname.startsWith('/invoices') ||
                           request.nextUrl.pathname.startsWith('/payments') ||
                           request.nextUrl.pathname.startsWith('/reports') ||
                           request.nextUrl.pathname.startsWith('/settings') ||
                           request.nextUrl.pathname.startsWith('/emails') ||
                           request.nextUrl.pathname.startsWith('/onboarding')

  if (isProtectedRoute && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Auth routes (redirect to dashboard if already logged in)
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') || 
                      request.nextUrl.pathname.startsWith('/register')

  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/|favicon\\.ico|api/|pay/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
}
