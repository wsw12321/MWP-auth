import { createClient } from '@supabase/supabase-js'
import { configError, publishableKey, supabaseUrl } from './config'

export const supabase = configError ? null : createClient(supabaseUrl, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
})
export function getSupabase() {
  if (!supabase) throw new Error('账号中心尚未配置，请联系站点管理员。')
  return supabase
}
