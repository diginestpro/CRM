"use client"

import Link from "next/link"
import { ShieldX, ArrowLeft } from "lucide-react"

export default function RegisterClosedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6 rounded-xl bg-white p-8 shadow-lg text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <ShieldX className="h-6 w-6 text-amber-600" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          Registration is closed
        </h2>
        <p className="text-sm text-slate-600">
          This CRM is invite-only. New team members must be added by an
          administrator from{" "}
          <span className="font-medium">Settings → Team</span>. Ask your
          admin to send you an invite.
        </p>
        <p className="text-sm text-slate-600">
          Already have an account but forgot your password?{" "}
          <Link
            href="/forgot-password"
            className="font-medium text-blue-600 hover:underline"
          >
            Reset it here
          </Link>
          .
        </p>
        <div className="pt-2">
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
