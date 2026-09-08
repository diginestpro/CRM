import { createClientAdmin } from '@/lib/supabase/client'

export interface PaymentGatewayConfig {
  id: string
  gateway_name: string
  api_key: string | null
  secret_key: string | null
  webhook_secret: string | null
  is_active: boolean
  config: any
}

/**
 * Get a single payment gateway's configuration by name.
 * Uses the admin client to bypass RLS for server-side operations.
 */
export async function getPaymentGateway(name: string): Promise<PaymentGatewayConfig | null> {
  try {
    const supabase = createClientAdmin()
    const { data, error } = await supabase
      .from('payment_gateways')
      .select('*')
      .eq('gateway_name', name)
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      console.error(`[getPaymentGateway] Error fetching ${name}:`, error)
      return null
    }
    return data as PaymentGatewayConfig | null
  } catch (e) {
    console.error(`[getPaymentGateway] Exception:`, e)
    return null
  }
}

/**
 * Get all active payment gateways.
 */
export async function getActivePaymentGateways(): Promise<PaymentGatewayConfig[]> {
  try {
    const supabase = createClientAdmin()
    const { data, error } = await supabase
      .from('payment_gateways')
      .select('*')
      .eq('is_active', true)

    if (error) {
      console.error('[getActivePaymentGateways] Error:', error)
      return []
    }
    return (data as PaymentGatewayConfig[]) || []
  } catch (e) {
    console.error('[getActivePaymentGateways] Exception:', e)
    return []
  }
}

/**
 * Check if a specific gateway is active.
 */
export async function isGatewayActive(name: string): Promise<boolean> {
  const gw = await getPaymentGateway(name)
  return gw?.is_active ?? false
}
