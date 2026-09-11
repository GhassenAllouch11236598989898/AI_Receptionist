/**
 * Centralized API helper for the Mia AI backend.
 * All requests go through the Vite dev proxy (/api → localhost:8000).
 * In production, set VITE_API_BASE_URL to the deployed backend origin.
 */

const BASE = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * Headers builder — includes X-API-Key if configured.
 */
function headers(json = true) {
  const h = {};
  if (json) h['Content-Type'] = 'application/json';
  const apiKey = import.meta.env.VITE_API_KEY;
  if (apiKey) h['X-API-Key'] = apiKey;
  return h;
}

/**
 * GET /health — check system status.
 */
export async function fetchHealth() {
  const res = await fetch(`${BASE}/health`, { headers: headers(false) });
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

/**
 * POST /chat — send a message to Mia.
 * @param {string} message
 * @param {string|null} callerPhone
 * @param {Array} history
 * @returns {{ reply: string, updated_history: Array, tools_called: Array }}
 */
export async function sendChat(message, callerPhone = null, history = []) {
  const body = { message, history };
  if (callerPhone) {
    const sanitized = String(callerPhone).replace(/[^\d+]/g, '');
    if (/^\+[1-9]\d{7,14}$/.test(sanitized)) {
      body.caller_phone = sanitized;
    }
  }
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.detail || `Chat failed: ${res.status}`);
  }
  return res.json();
}

/**
 * GET /bookings — list confirmed bookings.
 * @param {number} limit
 * @param {number} offset
 * @returns {Array}
 */
export async function fetchBookings(limit = 20, offset = 0) {
  const res = await fetch(`${BASE}/bookings?limit=${limit}&offset=${offset}`, {
    headers: headers(false),
  });
  if (!res.ok) {
    // 503 means Supabase not configured — return empty gracefully
    if (res.status === 503) return [];
    throw new Error(`Bookings fetch failed: ${res.status}`);
  }
  return res.json();
}

/**
 * POST /voice/tts-test — synthesize speech, returns audio Blob.
 * @param {string} text
 * @returns {Blob}
 */
export async function testTTS(text) {
  const res = await fetch(`${BASE}/voice/tts-test`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ text, output_format: 'mp3_44100_128' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.detail || `TTS failed: ${res.status}`);
  }
  return res.blob();
}
