import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SUPABASE_URL, SUPABASE_ANON_KEY, isBackendConfigured } from "../src/backend-config.js";

test("backend-config ships unconfigured by default so the app stays local-only", () => {
  assert.equal(typeof SUPABASE_URL, "string");
  assert.equal(typeof SUPABASE_ANON_KEY, "string");
  assert.equal(isBackendConfigured(), false);
});

test("supabase schema declares tables and RLS", async () => {
  const sql = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
  assert.equal(sql.includes("create table") && sql.includes("public.reports"), true);
  assert.equal(sql.includes("public.saved"), true);
  assert.equal(/enable row level security/i.test(sql), true);
  assert.equal(sql.includes("auth.uid()"), true);
});
