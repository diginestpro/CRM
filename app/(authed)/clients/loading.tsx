export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="h-8 w-32 skeleton mb-2" />
          <div className="h-4 w-64 skeleton" />
        </div>
        <div className="h-10 w-32 skeleton rounded-xl" />
      </div>
      <div className="h-10 w-full max-w-md skeleton rounded-xl" />
      <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
          <div className="grid grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => <div key={i} className="h-3 skeleton" />)}
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="px-4 py-4 grid grid-cols-6 gap-4 items-center">
              {[...Array(6)].map((_, j) => <div key={j} className="h-4 skeleton" style={{ width: `${60 + Math.random() * 30}%` }} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}