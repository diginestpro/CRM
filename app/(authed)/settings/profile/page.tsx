"use client"

import { useEffect, useState } from "react"
import { createClientBrowser } from "@/lib/supabase/client"
import { safeUpdate } from "@/lib/supabase/safe-write"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Loader2, Save, User, Mail, Phone, MapPin, Camera } from "lucide-react"

interface Profile {
  id: string
  full_name: string
  email: string
  phone: string
  avatar_url: string
}

export default function ProfileSettingsPage() {
  const [profile, setProfile] = useState<Profile>({ id: "", full_name: "", email: "", phone: "", avatar_url: "" })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const sb = createClientBrowser()
      const { data: { user } } = await sb.auth.getUser()
      if (user) {
        const { data } = await sb.from("profiles").select("id, full_name, email, phone, country, avatar_url").eq("id", user.id).maybeSingle()
        if (data) {
          setProfile({
            id: data.id,
            full_name: data.full_name || "",
            email: data.email || user.email || "",
            phone: (data as any).phone || "",
            avatar_url: data.avatar_url || "",
          })
        }
      }
      setIsLoading(false)
    }
    load()
  }, [])

  async function handleSave() {
    if (!profile.id) {
      toast.error("Profile not loaded yet. Please refresh the page.")
      return
    }
    setIsSaving(true)
    const sb = createClientBrowser()
    const { error } = await safeUpdate(sb, "profiles", {
      full_name: profile.full_name,
      phone: profile.phone,
      avatar_url: profile.avatar_url,
    }, { id: profile.id })
    setIsSaving(false)
    if (error) { toast.error(error); return }
    toast.success("Profile updated!")
  }

  if (isLoading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Profile Settings</h2>
        <p className="text-slate-500">Manage your personal information and avatar.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Avatar</CardTitle>
          <CardDescription>Your profile picture.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="h-24 w-24 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-3xl font-semibold">
              {profile.full_name?.charAt(0).toUpperCase() || profile.email?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="space-y-2">
              <Button variant="outline" size="sm">
                <Camera className="h-4 w-4 mr-2" /> Upload Photo
              </Button>
              <p className="text-xs text-slate-500">JPG, PNG. Max 2MB.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Update your account details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full Name</Label>
            <Input
              id="full_name"
              value={profile.full_name}
              onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
              placeholder="John Doe"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-slate-400" />
              <Input
                id="email"
                value={profile.email}
                disabled={true}
                className="bg-slate-50"
              />
            </div>
            <p className="text-xs text-slate-500">Email cannot be changed here. Contact support to update.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-slate-400" />
              <Input
                id="phone"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                placeholder="+1 555 0000"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>
    </div>
  )
}
