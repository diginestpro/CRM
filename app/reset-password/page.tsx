"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import Link from "next/link"
import { createClientBrowser } from "@/lib/supabase/client"
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
} from "lucide-react"

const schema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one digit"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })

type FormValues = z.infer<typeof schema>

export default function ResetPasswordPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const [success, setSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  // When the user clicks the link in the email, Supabase sets a
  // recovery session (special "PASSWORD_RECOVERY" event). Until that
  // session is present, we cannot call updateUser({ password }).
  useEffect(() => {
    const supabase = createClientBrowser()

    // 1) Verify we actually have a session.
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session)
    })

    // 2) Also listen for the recovery event in case the session
    //    is established asynchronously after the URL hash is parsed.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setHasSession(true)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function onSubmit(values: FormValues) {
    setIsLoading(true)
    try {
      const supabase = createClientBrowser()

      // The user reached this page via the password-recovery email
      // link, so they're authenticated under a recovery session.
      // updateUser({ password }) is the supported way to set the
      // new password without requiring the old one.
      const { error } = await supabase.auth.updateUser({
        password: values.password,
      })
      if (error) {
        toast.error(error.message || "Could not update password")
        return
      }

      setSuccess(true)
      toast.success("Password updated!")

      // Sign out the recovery session and send them to login.
      await supabase.auth.signOut()
      setTimeout(() => router.push("/login"), 1500)
    } catch (e: any) {
      toast.error(e?.message || "Could not update password")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow-lg">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <Lock className="h-6 w-6 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Set a new password
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Enter a strong password for your account.
          </p>
        </div>

        {hasSession === false && !success && (
          <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
              <div>
                <p className="font-medium text-amber-900">
                  Reset link is invalid or expired
                </p>
                <p className="mt-1 text-amber-800">
                  Password reset links expire after 1 hour. Request a new one
                  and try again.
                </p>
                <Link
                  href="/forgot-password"
                  className="mt-2 inline-block font-medium text-blue-600 hover:underline"
                >
                  Request a new reset link
                </Link>
              </div>
            </div>
          </div>
        )}

        {success ? (
          <div className="space-y-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
              <div>
                <p className="font-medium text-green-900">Password updated!</p>
                <p className="mt-1 text-green-800">
                  Redirecting you to sign in with your new password...
                </p>
              </div>
            </div>
          </div>
        ) : (
          hasSession !== false && (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    {...register("password")}
                    placeholder="••••••••"
                    className={
                      errors.password ? "border-red-500 pr-10" : "pr-10"
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-red-500">
                    {errors.password.message}
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  Must be 8+ characters with upper, lower, and a number.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  {...register("confirmPassword")}
                  placeholder="••••••••"
                  className={errors.confirmPassword ? "border-red-500" : ""}
                />
                {errors.confirmPassword && (
                  <p className="text-xs text-red-500">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !hasSession}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating password...
                  </>
                ) : (
                  "Update password"
                )}
              </Button>
            </form>
          )
        )}

        <div className="text-center text-sm">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-blue-600 hover:underline"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
