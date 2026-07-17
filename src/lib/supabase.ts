import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";

let browserClient: SupabaseClient | null = null;

/** Singleton browser client for client components. */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient();
  }
  return browserClient;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}
