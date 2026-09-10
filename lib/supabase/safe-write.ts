/**
 * Defensive wrappers around Supabase write operations.
 *
 * Why: by default, Supabase's .update(), .insert(), .upsert(), .delete()
 * returns { data, error } where `error` is null if the WHERE clause
 * doesn't match any row (i.e. RLS silently rejected the write). The
 * UI then shows a success toast, but nothing actually changed.
 *
 * These helpers run the operation with .select() so we can detect
 * the "no rows affected" case and surface a clear error to the user.
 *
 * Usage:
 *   const { data, error } = await safeUpdate(sb, "companies", { name }, { id: companyId })
 *   if (error) { toast.error(error); return }
 *   toast.success("Saved!")
 */

type SupabaseClient = any

type Filter = Record<string, any>

export type SafeWriteResult<T = any> = {
  data: T[] | null
  error: string | null
}

function emptyResult<T>(data: T[] | null = null, error: string | null = null): SafeWriteResult<T> {
  return { data, error }
}

/**
 * Update rows in a table. Returns a clear error if the WHERE filter
 * doesn't match any row (which is how Supabase surfaces RLS rejections
 * on UPDATE — no exception, just an empty result).
 */
export async function safeUpdate<T = any>(
  sb: SupabaseClient,
  table: string,
  patch: Record<string, any>,
  filter: Filter,
  opts: { expectAtLeastOne?: boolean } = {}
): Promise<SafeWriteResult<T>> {
  try {
    let q = sb.from(table).update(patch)
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v)
    const { data, error } = await q.select("*")
    if (error) return emptyResult<T>(null, error.message || String(error))
    if (opts.expectAtLeastOne !== false && (!data || data.length === 0)) {
      return emptyResult<T>(null,
        "Update did not affect any rows. This usually means you don't have permission to edit this record, or it was deleted. Please refresh and try again.")
    }
    return emptyResult<T>(data || [])
  } catch (e: any) {
    return emptyResult<T>(null, e?.message || String(e))
  }
}

/**
 * Insert a row (or rows). Returns a clear error if no row was created.
 */
export async function safeInsert<T = any>(
  sb: SupabaseClient,
  table: string,
  row: Record<string, any> | Record<string, any>[],
  opts: { expectAtLeastOne?: boolean } = {}
): Promise<SafeWriteResult<T>> {
  try {
    const payload = Array.isArray(row) ? row : [row]
    const { data, error } = await sb.from(table).insert(payload).select("*")
    if (error) return emptyResult<T>(null, error.message || String(error))
    if (opts.expectAtLeastOne !== false && (!data || data.length === 0)) {
      return emptyResult<T>(null,
        "Insert did not create any rows. This usually means you don't have permission, or your session expired. Please refresh and try again.")
    }
    return emptyResult<T>(data || [])
  } catch (e: any) {
    return emptyResult<T>(null, e?.message || String(e))
  }
}

/**
 * Upsert rows. Returns a clear error if nothing was upserted.
 */
export async function safeUpsert<T = any>(
  sb: SupabaseClient,
  table: string,
  row: Record<string, any> | Record<string, any>[],
  opts: { onConflict?: string; expectAtLeastOne?: boolean } = {}
): Promise<SafeWriteResult<T>> {
  try {
    const payload = Array.isArray(row) ? row : [row]
    let q = sb.from(table).upsert(payload, opts.onConflict ? { onConflict: opts.onConflict } : undefined)
    const { data, error } = await q.select("*")
    if (error) return emptyResult<T>(null, error.message || String(error))
    if (opts.expectAtLeastOne !== false && (!data || data.length === 0)) {
      return emptyResult<T>(null,
        "Upsert did not affect any rows. This usually means you don't have permission, or your session expired. Please refresh and try again.")
    }
    return emptyResult<T>(data || [])
  } catch (e: any) {
    return emptyResult<T>(null, e?.message || String(e))
  }
}

/**
 * Delete rows. Returns a clear error if nothing was deleted.
 */
export async function safeDelete<T = any>(
  sb: SupabaseClient,
  table: string,
  filter: Filter,
  opts: { expectAtLeastOne?: boolean } = {}
): Promise<SafeWriteResult<T>> {
  try {
    let q = sb.from(table).delete()
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v)
    const { data, error } = await q.select("*")
    if (error) return emptyResult<T>(null, error.message || String(error))
    if (opts.expectAtLeastOne !== false && (!data || data.length === 0)) {
      return emptyResult<T>(null,
        "Delete did not affect any rows. This usually means you don't have permission, or the record was already removed.")
    }
    return emptyResult<T>(data || [])
  } catch (e: any) {
    return emptyResult<T>(null, e?.message || String(e))
  }
}
