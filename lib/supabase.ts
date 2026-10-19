import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

/** Lazily created so the app can show a setup screen instead of crashing when env vars are missing. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    if (!url || !key) throw new Error("Supabase environment variables are missing.");
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

export const BUCKET = "deliverables";
