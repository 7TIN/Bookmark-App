import { createServerSupabaseClient } from './ssr-server'

// Backward-compatible shim. Prefer createServerSupabaseClient from `./ssr-server`.
export const createClient = createServerSupabaseClient
