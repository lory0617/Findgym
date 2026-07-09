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
    try {
      const response = await fetchImpl(`${url}/auth/v1/signup`, {
        method: "POST",
        headers: { apikey: anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      if (!data.access_token) {
        return null;
      }
      storage.setItem(SESSION_KEY, data.access_token);
      return data.access_token;
    } catch {
      return null;
    }
  }

  async function authHeaders() {
    const token = await ensureSession();
    if (!token) {
      return null;
    }
    return {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    };
  }

  async function insertReport(report) {
    try {
      const headers = await authHeaders();
      if (!headers) {
        return false;
      }
      const response = await fetchImpl(`${url}/rest/v1/reports`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=minimal" },
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

  async function listSaved() {
    try {
      const headers = await authHeaders();
      if (!headers) {
        return [];
      }
      const response = await fetchImpl(`${url}/rest/v1/saved?select=gym_id`, {
        method: "GET",
        headers: headers
      });
      if (!response.ok) {
        return [];
      }
      const rows = await response.json();
      return rows.map((row) => row.gym_id);
    } catch {
      return [];
    }
  }

  async function addSaved(gymId) {
    try {
      const headers = await authHeaders();
      if (!headers) {
        return false;
      }
      const response = await fetchImpl(`${url}/rest/v1/saved`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify({ gym_id: gymId })
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function removeSaved(gymId) {
    try {
      const headers = await authHeaders();
      if (!headers) {
        return false;
      }
      const response = await fetchImpl(`${url}/rest/v1/saved?gym_id=eq.${encodeURIComponent(gymId)}`, {
        method: "DELETE",
        headers: headers
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  return { ensureSession, insertReport, listSaved, addSaved, removeSaved };
}
