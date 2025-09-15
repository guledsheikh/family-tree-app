// supabaseClient.ts
import { createClient } from "@supabase/supabase-js";
console.log("build-time envs:");
console.log("VITE_SUPABASE_URL ->", import.meta.env.VITE_SUPABASE_URL);
console.log("VITE_SUPABASE_ANON_KEY present? ->", !!import.meta.env.VITE_SUPABASE_ANON_KEY);
console.log("MODE ->", import.meta.env.MODE);

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log("URL:", supabaseUrl)
console.log("KEY:", supabaseAnonKey ? "Anon key is set" : "Missing key")

// ✅ Debug check (safe for browser logs)
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ Supabase env vars are missing!");
} else {
  console.log("✅ Supabase env vars loaded:", {
    url: supabaseUrl,
    key: supabaseAnonKey ? "Anon key is set" : "Missing anon key",
  });
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
