"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import Link from "next/link"
import { createClientBrowser } from "@/lib/supabase/client"
import { ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react"

const schema = z.object({
  email: z.string().email("Invalid email address"),
})

type FormValues = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [emailSent, setEmailSent] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setIsLoading(true)
    try {
      const supabase = createClientBrowser()

      // Build the absolute URL so the email link works no matter where
      // the user clicks it from (mobile, webmail preview, etc.).
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined

      const { error } = await supabase.auth.resetPasswordForEmail(
        values.email,
        { redirectTo }
      )

      if (error) {
        // For security, Supabase doesn't reveal whether an email exists,
        // but our wrapper surfaces a friendly message either way.
        toast.error(error.message || "Could not send reset email")
        return
      }

      setEmailSent(values.email)
      toast.success("Check your inbox for the reset link")
    } catch (e: any) {
      toast.error(e?.message || "Could not send reset email")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow-lg">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <Mail className="h-6 w-6 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Forgot your password?
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Enter the email address you use to sign in, and we'll send you a
            link to reset your password.
          </p>
        </div>

        {emailSent ? (
          <div className="space-y-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
              <div>
                <p className="font-medium text-green-900">Check your inbox</p>
                <p className="mt-1 text-green-800">
                  If an account exists for{" "}
                  <span className="font-semibold">{emailSent}</span>, we just
                  sent a password reset link. The link expires in 1 hour.
                </p>
              </div>
            </div>
            <Link
              href="/login"
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  {...register("email")}
                  placeholder="name@company.com"
                  className={errors.email ? "border-red-500" : ""}
                />
                {errors.email && (
                  <p className="text-xs text-red-500">
                    {errors.email.message}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending reset link...
                  </>
                ) : (
                  "Send reset link"
                )}
              </Button>
            </form>
            <div className="text-center text-sm">
              <Link
                href="/login"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
              >
                <ArrowLeft className="h-3 w-3" />
                Back to sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
