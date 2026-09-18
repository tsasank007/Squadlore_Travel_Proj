import { createClient } from "@supabase/supabase-js";

// This is the ONLY file in the codebase that should import
// @supabase/supabase-js directly. Every service class below
// goes through this client - never call Supabase from a route
// handler or anywhere else. That's what makes it possible to
// swap Supabase out later without touching route handlers or
// the mobile apps: only this file and the service internals change.

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment");
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
