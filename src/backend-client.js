// Thin fetch wrapper around Supabase Auth (anonymous) + PostgREST. All methods
// are best-effort: they return a boolean/data and never throw, so the UI can
// treat the backend as optional. `fetchImpl` and `storage` are injected for
// testability; the app passes globalThis.fetch and localStorage.
const SESSION_KEY = "findgymSession";

export function createBackendClient({ url, anonKey, fetchImpl, storage }) {
  async function ensureSession() {
    const cached = storage.getItem(SESSION_KEY);
    if (cached) {
      return cached;
    }
    const response = await fetchImpl(`${url}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    if (!response.ok) {
      throw new Error("anonymous sign-in failed");
    }
    const data = await response.json();
    storage.setItem(SESSION_KEY, data.access_token);
    return data.access_token;
  }

  async function authHeaders() {
    const token = await ensureSession();
    return {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    };
  }

  async function insertReport(report) {
    try {
      const response = await fetchImpl(`${url}/rest/v1/reports`, {
        method: "POST",
        headers: { ...(await authHeaders()), Prefer: "return=minimal" },
        body: JSON.stringify({
          gym_id: report.gymId ?? null,
          report_type: report.reportType,
          submitted_value: report.submittedValue ?? "",
          evidence_url: report.evidenceUrl ?? ""
        })
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  return { ensureSession, insertReport };
}
