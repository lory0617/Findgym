// Thin fetch wrapper around Supabase Auth (anonymous) + PostgREST. All methods
// are best-effort: they return a boolean/data and never throw, so the UI can
// treat the backend as optional. `fetchImpl` and `storage` are injected for
// testability; the app passes globalThis.fetch and localStorage.
const SESSION_KEY = "findgymSession";
const EXPIRY_SKEW_MS = 60000;

function readSession(storage) {
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.access_token === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeSession(storage, data) {
  const expiresInMs = (Number(data.expires_in) || 3600) * 1000;
  storage.setItem(
    SESSION_KEY,
    JSON.stringify({
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? null,
      expires_at: Date.now() + expiresInMs
    })
  );
}

export function createBackendClient({ url, anonKey, fetchImpl, storage }) {
  async function ensureSession() {
    const session = readSession(storage);
    if (session && session.expires_at && Date.now() < session.expires_at - EXPIRY_SKEW_MS) {
      return session.access_token;
    }
    if (session && session.refresh_token) {
      try {
        const response = await fetchImpl(`${url}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: { apikey: anonKey, "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: session.refresh_token })
        });
        if (response.ok) {
          const data = await response.json();
          if (data.access_token) {
            writeSession(storage, data);
            return data.access_token;
          }
        }
      } catch {
        // fall through to a fresh anonymous sign-in
      }
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
      writeSession(storage, data);
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
