import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://veybrkrnfuaoyqfmghve.supabase.co'
const supabaseAnonKey = 'sb_publishable_tlxEu_DNROMrWT5o0rAPYw_uGQfF4hI'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)