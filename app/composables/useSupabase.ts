export function useSupabase() {
  const { $supabase } = useNuxtApp()
  return $supabase as import('@supabase/supabase-js').SupabaseClient
}
