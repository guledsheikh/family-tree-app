// src/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

// For Vite, we need to use import.meta.env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase environment variables are not set");
  // You might want to provide fallback values for development
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);