import { createClientServer } from '@/lib/supabase/server'

export async function getSetting(key: string) {
  const supabase = await createClientServer()
  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', key)
    .single()

  if (error || !data) return null
  return data.value
}

export async function updateSetting(key: string, value: string) {
  const supabase = await createClientServer()
  const { error } = await supabase
    .from('system_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  if (error) throw error
  return true
}

export async function getAllSettings() {
  const supabase = await createClientServer()
  const { data, error } = await supabase
    .from('system_settings')
    .select('*')

  if (error) throw error
  return data || []
}
