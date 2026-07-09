// Supabase connection config. The anon key is public by design — RLS is the
// security boundary. Leave as the placeholder to run the app local-only.
export const SUPABASE_URL = "REPLACE_ME";
export const SUPABASE_ANON_KEY = "REPLACE_ME";

export function isBackendConfigured() {
  return (
    typeof SUPABASE_URL === "string" &&
    typeof SUPABASE_ANON_KEY === "string" &&
    SUPABASE_URL.startsWith("https://") &&
    SUPABASE_ANON_KEY !== "REPLACE_ME" &&
    SUPABASE_ANON_KEY.length > 0
  );
}
