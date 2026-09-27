import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

// Reuse one client across dev hot reloads, which otherwise create a new one on every edit.
const globalForSupabase = globalThis as unknown as { supabase?: SupabaseClient };

// Placeholders keep the build working before .env.local exists; the UI shows a setup notice instead.
export const supabase =
  globalForSupabase.supabase ?? createClient(url || "http://localhost:54321", anonKey || "missing-anon-key");
globalForSupabase.supabase = supabase;
