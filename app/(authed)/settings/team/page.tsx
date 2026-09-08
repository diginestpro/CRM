"use client"

import { useEffect, useState } from "react"
import { createClientBrowser } from "@/lib/supabase/client"
import { createClient } from "@supabase/supabase-js"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Loader2, Mail, MoreVertical, UserPlus, Trash2 } from "lucide-react"

interface Member {
  id: string
  full_name: string
  email: string
  role: string
  created_at: string
}

export default function TeamSettingsPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isInviting, setIsInviting] = useState(false)
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("user")

  useEffect(() => {
    loadMembers()
  }, [])

  async function loadMembers() {
    try {
      const sb = createClientBrowser()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data: profile } = await sb.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
      if (!profile?.company_id) return
      const { data } = await sb.from("profiles").select("id, full_name, email, role, created_at").eq("company_id", profile.company_id).order("created_at", { ascending: true })
      setMembers(data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleInvite() {
    if (!inviteEmail || !inviteEmail.includes("@")) {
      toast.error("Please enter a valid email")
      return
    }
    setIsInviting(true)
    try {
      // Use service role on server to create user and add to company
      const res = await fetch("/api/settings/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed")
      toast.success("Invitation sent!")
      setInviteEmail("")
      setShowInviteDialog(false)
      loadMembers()
    } catch (e: any) {
      toast.error(e.message || "Failed to invite")
    } finally {
      setIsInviting(false)
    }
  }

  async function handleRemove(memberId: string) {
    if (!confirm("Are you sure you want to remove this member?")) return
    try {
      const sb = createClientBrowser()
      const { error } = await sb.from("profiles").update({ company_id: null }).eq("id", memberId)
      if (error) throw error
      toast.success("Member removed")
      loadMembers()
    } catch (e: any) {
      toast.error(e.message || "Failed")
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Team Members</h2>
          <p className="text-slate-500">Manage users in your workspace.</p>
        </div>
        <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <UserPlus className="h-4 w-4 mr-2" /> Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>Send an invitation to join your workspace.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email Address</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="member@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Role</Label>
                <select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="admin">Admin</option>
                  <option value="user">User</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowInviteDialog(false)}>Cancel</Button>
              <Button onClick={handleInvite} disabled={isInviting} className="bg-blue-600 hover:bg-blue-700">
                {isInviting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                Send Invitation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members ({members.length})</CardTitle>
          <CardDescription>People with access to your CRM workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No team members yet. Click Invite Member to add someone.
            </div>
          ) : (
            <div className="space-y-3">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold">
                      {(m.full_name || m.email || "U").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{m.full_name || "Unnamed User"}</p>
                      <p className="text-sm text-slate-500 flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {m.email || "No email"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={"px-2 py-0.5 rounded-full text-xs font-medium " + (m.role === "admin" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600")}>
                      {m.role || "user"}
                    </span>
                    <Button variant="ghost" size="icon" onClick={() => handleRemove(m.id)} title="Remove">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
