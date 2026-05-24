/**
 * /api/chat.js  —  Vercel Serverless Function
 *
 * Proxies requests to the Anthropic Claude API so that the API key
 * never appears in client-side code.
 *
 * Environment variable required (set in Vercel dashboard or .env.local):
 *   ANTHROPIC_API_KEY=sk-ant-...
 */

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL         = 'claude-sonnet-4-20250514';
const ANTHROPIC_VER = '2023-06-01';

// ── CORS headers returned on every response ────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

module.exports = async function handler(req, res) {

  // ── Pre-flight request (browser CORS check) ────────────────────────
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // ── Only accept POST ───────────────────────────────────────────────
  if (req.method !== 'POST') {
    res.writeHead(405, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // ── Validate API key is configured ────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY environment variable is not set');
    res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Server configuration error: API key not set' }));
    return;
  }

  // ── Parse request body ─────────────────────────────────────────────
  let body;
  try {
    // Vercel automatically parses JSON bodies when Content-Type is application/json
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (err) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const { messages, system, max_tokens } = body ?? {};

  // ── Validate required fields ───────────────────────────────────────
  if (!Array.isArray(messages) || messages.length === 0) {
    res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '`messages` must be a non-empty array' }));
    return;
  }

  // ── Build Anthropic request payload ───────────────────────────────
  const anthropicPayload = {
    model:      MODEL,
    max_tokens: Number.isInteger(max_tokens) && max_tokens > 0 ? max_tokens : 1024,
    messages,
  };
  if (system) anthropicPayload.system = system;

  // ── Forward to Anthropic ───────────────────────────────────────────
  let anthropicRes;
  try {
    anthropicRes = await fetch(ANTHROPIC_API, {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': ANTHROPIC_VER,
      },
      body: JSON.stringify(anthropicPayload),
    });
  } catch (networkErr) {
    console.error('Network error reaching Anthropic:', networkErr);
    res.writeHead(502, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Could not reach Anthropic API', detail: networkErr.message }));
    return;
  }

  // ── Relay Anthropic's response (status + body) to the client ──────
  const responseText = await anthropicRes.text();

  res.writeHead(anthropicRes.status, {
    ...CORS_HEADERS,
    'Content-Type': 'application/json',
  });
  res.end(responseText);
};
