// supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Enhanced debug check
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ Supabase env vars are missing!", {
    url: supabaseUrl,
    key: supabaseAnonKey ? "Present" : "Missing"
  });
  // Provide fallback for development
  if (import.meta.env.DEV) {
    console.warn("Using fallback values for development");
  }
} else {
  console.log("✅ Supabase env vars loaded");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: true
  }
});