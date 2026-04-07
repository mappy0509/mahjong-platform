import { createClient } from "@supabase/supabase-js";
import { storageAdapter } from "./storage-adapter";

// Expo public env vars are inlined at build time
declare const process: { env: Record<string, string | undefined> };

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: storageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
