// Helpers for probing the LM Studio HTTP server.

// In the browser we go through the Vite dev-server proxy (configured in vite.config.js)
// so we don't trip CORS — LM Studio's local server doesn't send Access-Control-Allow-Origin
// headers. In tests / Node the proxy doesn't exist, so we hit LM Studio directly.
const isBrowser = typeof window !== 'undefined'
export const LM_STUDIO_URL = isBrowser ? '/lm/v1' : 'http://localhost:1234/v1'
export const EXPECTED_MODEL = 'google/gemma-4-e4b'

export async function probeLmStudio({ signal } = {}) {
  try {
    const resp = await fetch(`${LM_STUDIO_URL}/models`, { signal })
    if (!resp.ok) {
      return { reachable: false, error: `HTTP ${resp.status}` }
    }
    const data = await resp.json()
    const models = (data?.data ?? []).map((m) => m.id)
    return {
      reachable: true,
      models,
      hasExpectedModel: models.includes(EXPECTED_MODEL),
    }
  } catch (err) {
    return { reachable: false, error: err.message }
  }
}
