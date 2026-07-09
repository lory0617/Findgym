// tests/backend-client.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createBackendClient } from "../src/backend-client.js";

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k)
  };
}

test("ensureSession signs in anonymously once and caches the token", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ access_token: "tok_123" }) };
  };
  const client = createBackendClient({
    url: "https://x.supabase.co",
    anonKey: "anon_key",
    fetchImpl,
    storage: makeStorage()
  });

  const first = await client.ensureSession();
  const second = await client.ensureSession();

  assert.equal(first, "tok_123");
  assert.equal(second, "tok_123");
  assert.equal(calls.length, 1); // cached — only one network sign-in
  assert.equal(calls[0].url, "https://x.supabase.co/auth/v1/signup");
  assert.equal(calls[0].options.headers.apikey, "anon_key");
});

test("insertReport posts to the reports table with the bearer token", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/auth/v1/signup")) {
      return { ok: true, json: async () => ({ access_token: "tok_123" }) };
    }
    return { ok: true, json: async () => ({}) };
  };
  const client = createBackendClient({
    url: "https://x.supabase.co",
    anonKey: "anon_key",
    fetchImpl,
    storage: makeStorage()
  });

  const ok = await client.insertReport({ gymId: "g1", reportType: "wrong_price", submittedValue: "100", evidenceUrl: "" });

  assert.equal(ok, true);
  const post = calls.find((c) => c.url.endsWith("/rest/v1/reports"));
  assert.ok(post);
  assert.equal(post.options.method, "POST");
  assert.equal(post.options.headers.Authorization, "Bearer tok_123");
  assert.deepEqual(JSON.parse(post.options.body), {
    gym_id: "g1",
    report_type: "wrong_price",
    submitted_value: "100",
    evidence_url: ""
  });
});

test("insertReport returns false on network error without throwing", async () => {
  const fetchImpl = async () => {
    throw new Error("offline");
  };
  const client = createBackendClient({ url: "https://x.supabase.co", anonKey: "k", fetchImpl, storage: makeStorage() });
  assert.equal(await client.insertReport({ reportType: "other" }), false);
});

test("ensureSession returns null on failure without throwing", async () => {
  const fetchImpl = async () => {
    throw new Error("offline");
  };
  const client = createBackendClient({ url: "https://x.supabase.co", anonKey: "k", fetchImpl, storage: makeStorage() });
  assert.equal(await client.ensureSession(), null);
});

test("listSaved returns gym ids and addSaved/removeSaved hit the saved table", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, method: options.method ?? "GET", options });
    if (url.endsWith("/auth/v1/signup")) return { ok: true, json: async () => ({ access_token: "t" }) };
    if (url.includes("/rest/v1/saved") && (options.method ?? "GET") === "GET") {
      return { ok: true, json: async () => [{ gym_id: "a" }, { gym_id: "b" }] };
    }
    return { ok: true, json: async () => ({}) };
  };
  const storage = makeStorage();
  const client = createBackendClient({ url: "https://x.supabase.co", anonKey: "k", fetchImpl, storage });

  assert.deepEqual(await client.listSaved(), ["a", "b"]);
  assert.equal(await client.addSaved("c"), true);
  assert.equal(await client.removeSaved("a"), true);

  const del = calls.find((c) => c.method === "DELETE");
  assert.ok(del.url.includes("gym_id=eq.a"));
});

test("listSaved returns [] on failure without throwing", async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith("/auth/v1/signup")) return { ok: true, json: async () => ({ access_token: "t" }) };
    throw new Error("offline");
  };
  const client = createBackendClient({ url: "https://x.supabase.co", anonKey: "k", fetchImpl, storage: makeStorage() });
  assert.deepEqual(await client.listSaved(), []);
});
