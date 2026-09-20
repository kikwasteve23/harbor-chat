import { createClient } from "@supabase/supabase-js";

/** Server-only Supabase client. Browser code must never receive the service role key. */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase is not configured. Keep DATA_BACKEND=local or set URL + service role key.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase anon credentials are not configured.");
  }
  return createClient(url, key);
}
