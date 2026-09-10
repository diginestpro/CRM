"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Mail, MailOpen, Loader2, Send, Inbox, AlertCircle, CheckCircle2, Clock } from "lucide-react"
import { cn } from "@/lib/utils"

type Row = {
  id: string
  to_email: string
  from_email: string | null
  subject: string
  template: string | null
  related_type: string | null
  related_id: string | null
  status: "pending" | "sending" | "sent" | "failed"
  attempts: number
  last_error: string | null
  scheduled_for: string | null
  sent_at: string | null
  created_at: string
}

const STATUSES = ["all", "pending", "sent", "failed"] as const
type StatusFilter = (typeof STATUSES)[number]

const statusBadge: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 ring-amber-200",
  sending: "bg-blue-100 text-blue-800 ring-blue-200",
  sent: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  failed: "bg-rose-100 text-rose-800 ring-rose-200",
}

const statusIcon: Record<string, any> = {
  pending: Clock,
  sending: Loader2,
  sent: CheckCircle2,
  failed: AlertCircle,
}

export function EmailsQueueClient({
  rows,
  initialStatus,
  loadError,
}: {
  rows: Row[]
  initialStatus: string
  loadError: string | null
}) {
  const [filter, setFilter] = useState<StatusFilter>(
    (STATUSES as readonly string[]).includes(initialStatus)
      ? (initialStatus as StatusFilter)
      : "all"
  )
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [preview, setPreview] = useState<Row | null>(null)
  const [previewBody, setPreviewBody] = useState<string>("")
  const [previewLoading, setPreviewLoading] = useState(false)

  const counts = useMemo(() => {
    const out: Record<StatusFilter, number> = { all: rows.length, pending: 0, sent: 0, failed: 0 }
    for (const r of rows) {
      if (r.status === "pending") out.pending++
      else if (r.status === "sent") out.sent++
      else if (r.status === "failed") out.failed++
    }
    return out
  }, [rows])

  const filtered = useMemo(() => {
    if (filter === "all") return rows
    return rows.filter((r) => r.status === filter)
  }, [rows, filter])

  async function handleResend(row: Row) {
    setBusy((b) => ({ ...b, [row.id]: true }))
    try {
      const res = await fetch(`/api/emails/${row.id}/resend`, { method: "POST" })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error || "Resend failed")
      } else {
        toast.success("Email sent")
        row.status = "sent"
        row.sent_at = new Date().toISOString()
        row.last_error = null
      }
    } catch (e: any) {
      toast.error(e?.message || "Resend failed")
    } finally {
      setBusy((b) => ({ ...b, [row.id]: false }))
    }
  }

  async function openPreview(row: Row) {
    setPreview(row)
    setPreviewBody("")
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/emails/${row.id}/body`)
      const data = await res.json()
      setPreviewBody(data.body_html || "")
    } catch (e: any) {
      setPreviewBody(`<p style="color:#dc2626">Failed to load body: ${e?.message || e}</p>`)
    } finally {
      setPreviewLoading(false)
    }
  }

  // Auto-refresh every 30s so the queue updates as emails go out.
  // The page is a server component, so we trigger a hard refresh
  // via a query param bump.
  useEffect(() => {
    const t = setInterval(() => {
      try { window.location.reload() } catch {}
    }, 30_000)
    return () => clearInterval(t)
  }, [])

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
              filter === s
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            )}
          >
            <span className="capitalize">{s}</span>
            <span className="ml-2 text-xs opacity-70">{counts[s]}</span>
          </button>
        ))}
      </div>

      {loadError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {loadError}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Inbox className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm">
                {filter === "all"
                  ? "No emails have been queued yet."
                  : `No emails with status "${filter}".`}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map((row) => {
                const StatusIcon = statusIcon[row.status] || Mail
                return (
                  <div key={row.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50/60">
                    <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <StatusIcon className={cn("h-4 w-4", row.status === "sending" && "animate-spin")} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900 truncate max-w-md">{row.subject}</span>
                        <span
                          className={cn(
                            "text-[10px] uppercase tracking-wider font-semibold rounded-full px-1.5 py-0.5 ring-1",
                            statusBadge[row.status] || "bg-slate-100 text-slate-700 ring-slate-200"
                          )}
                        >
                          {row.status}
                        </span>
                        {row.template && (
                          <span className="text-[10px] uppercase tracking-wider rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5">
                            {row.template}
                          </span>
                        )}
                        {row.attempts > 1 && (
                          <span className="text-[10px] rounded-full bg-orange-100 text-orange-700 px-1.5 py-0.5">
                            attempt {row.attempts}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        To: <span className="font-medium text-slate-700">{row.to_email}</span>
                        {row.from_email && (
                          <>
                            {" · From: "}
                            <span className="text-slate-700">{row.from_email}</span>
                          </>
                        )}
                        {" · "}
                        {new Date(row.created_at).toLocaleString()}
                      </p>
                      {row.last_error && (
                        <p className="text-xs text-rose-600 mt-1 truncate" title={row.last_error}>
                          {row.last_error}
                        </p>
                      )}
                      {row.sent_at && (
                        <p className="text-[11px] text-emerald-700 mt-0.5">
                          Sent {new Date(row.sent_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openPreview(row)}
                        title="Preview"
                      >
                        <MailOpen className="h-4 w-4" />
                      </Button>
                      {(row.status === "pending" || row.status === "failed") && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy[row.id]}
                          onClick={() => handleResend(row)}
                          className="gap-1"
                        >
                          {busy[row.id] ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          {row.status === "failed" ? "Retry" : "Send"}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview dialog */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="pr-8">{preview?.subject || "Email"}</DialogTitle>
          </DialogHeader>
          {preview && (
            <>
              <div className="text-xs text-slate-500 space-y-0.5">
                <p>
                  To: <span className="font-medium text-slate-700">{preview.to_email}</span>
                  {preview.from_email && (
                    <>
                      {" · From: "}
                      <span className="text-slate-700">{preview.from_email}</span>
                    </>
                  )}
                </p>
                <p>Created {new Date(preview.created_at).toLocaleString()}</p>
                {preview.last_error && (
                  <p className="text-rose-600 break-words">{preview.last_error}</p>
                )}
              </div>
              <div className="flex-1 overflow-auto rounded border bg-slate-50 p-3 mt-3">
                {previewLoading ? (
                  <div className="flex items-center gap-2 text-slate-500 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading preview…
                  </div>
                ) : (
                  <iframe
                    srcDoc={previewBody}
                    title="Email body"
                    className="w-full min-h-[300px] bg-white rounded border-0"
                  />
                )}
              </div>
              <div className="flex justify-end gap-2 mt-3">
                <Button variant="outline" onClick={() => setPreview(null)}>Close</Button>
                {(preview.status === "pending" || preview.status === "failed") && (
                  <Button
                    onClick={async () => {
                      await handleResend(preview)
                      setPreview(null)
                    }}
                    disabled={busy[preview.id]}
                    className="gap-1"
                  >
                    {busy[preview.id] ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {preview.status === "failed" ? "Retry Now" : "Send Now"}
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}