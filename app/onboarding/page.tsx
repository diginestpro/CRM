"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { createClientBrowser, getCurrentCompanyId } from '@/lib/supabase/client'

const onboardingSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  companyName: z.string().min(2, 'Company name is required'),
  companyEmail: z.string().email('Valid company email is required'),
  companyPhone: z.string().min(5, 'Valid phone number is required'),
})

type OnboardingFormValues = z.infer<typeof onboardingSchema>

export default function OnboardingPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
  })

  // If the user already has a company, send them to the dashboard
  useEffect(() => {
    async function checkExisting() {
      try {
        const supabase = createClientBrowser()
        const company_id = await getCurrentCompanyId(supabase)
        if (company_id) {
          router.replace('/dashboard')
          return
        }
      } catch (e) {}
      setIsChecking(false)
    }
    checkExisting()
  }, [router])


  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Checking your account...</p>
        </div>
      </div>
    )
  }
  async function onSubmit(values: OnboardingFormValues) {
    setIsLoading(true)
    try {
      const supabase = createClientBrowser()
      
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        toast.error('You must be logged in to complete onboarding')
        router.push('/login')
        return
      }

      // 1. Create the company
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .insert({
          name: values.companyName,
          email: values.companyEmail,
          phone: values.companyPhone,
        })
        .select()
        .single()

      if (companyError) {
        toast.error(`Company creation failed: ${companyError.message}`)
        return
      }

      // 2. Update or Create the user profile
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          company_id: company.id,
          full_name: values.fullName,
          role: 'admin',
        })

      if (profileError) {
        toast.error(`Profile setup failed: ${profileError.message}`)
        return
      }

      // 3. Add to company_users
      const { error: userError } = await supabase
        .from('company_users')
        .insert({
          company_id: company.id,
          user_id: user.id,
          role: 'admin',
        })

      if (userError) {
        toast.error(`Company user assignment failed: ${userError.message}`)
        return
      }

      toast.success('Welcome aboard! Your company has been created.')
      router.push('/dashboard')
      router.refresh()

    } catch (err) {
      toast.error('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-lg space-y-8 rounded-xl bg-white p-8 shadow-lg">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Setup Your Workspace</h2>
          <p className="mt-2 text-sm text-slate-600">Let's get your company configured to start managing clients</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="fullName">Your Full Name</Label>
              <Input 
                id="fullName" 
                {...register('fullName')} 
                placeholder="John Doe"
                className={errors.fullName ? 'border-red-500' : ''}
              />
              {errors.fullName && <p className="text-xs text-red-500">{errors.fullName.message}</p>}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input 
                id="companyName" 
                {...register('companyName')} 
                placeholder="Acme Corp"
                className={errors.companyName ? 'border-red-500' : ''}
              />
              {errors.companyName && <p className="text-xs text-red-500">{errors.companyName.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyEmail">Company Email</Label>
              <Input 
                id="companyEmail" 
                type="email" 
                {...register('companyEmail')} 
                placeholder="info@acme.com"
                className={errors.companyEmail ? 'border-red-500' : ''}
              />
              {errors.companyEmail && <p className="text-xs text-red-500">{errors.companyEmail.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyPhone">Company Phone</Label>
              <Input 
                id="companyPhone" 
                {...register('companyPhone')} 
                placeholder="+1 234 567 890"
                className={errors.companyPhone ? 'border-red-500' : ''}
              />
              {errors.companyPhone && <p className="text-xs text-red-500">{errors.companyPhone.message}</p>}
            </div>
          </div>
          <Button 
            type="submit" 
            className="w-full" 
            disabled={isLoading}
          >
            {isLoading ? 'Setting up...' : 'Complete Setup'}
          </Button>
        </form>
      </div>
    </div>
  )
}


