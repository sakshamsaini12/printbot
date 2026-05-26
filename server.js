/**
 * PrintBot License Server — Stateless / Vercel-compatible
 *
 * Keys are cryptographically self-validating (HMAC).
 * No database or filesystem writes — works on Vercel serverless.
 *
 * Env vars:
 *   PB_SECRET   — HMAC signing secret (set in Vercel dashboard)
 *   PB_ADMIN    — Admin panel password
 *   PB_REVOKED  — Comma-separated list of revoked keys (set in Vercel dashboard)
 *   PORT        — HTTP port (default 3131, ignored on Vercel)
 */

const express = require("express");
const crypto  = require("crypto");
const path    = require("path");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-admin-password");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});
app.use(express.static(path.join(__dirname, "public")));

// ── Config ──────────────────────────────────────────────────────────────────
const SECRET     = process.env.PB_SECRET || "pb-shopship-2024-change-in-prod-XzK9m";
const ADMIN_PASS = process.env.PB_ADMIN  || "shopship@admin";
const PORT       = process.env.PORT      || 3131;

// Revoked keys stored as a comma-separated env var (set in Vercel dashboard)
// e.g.  PB_REVOKED=PBOT-XXXX-XXXX-XXXX-XXXX,PBOT-YYYY-YYYY-YYYY-YYYY
function getRevokedSet() {
  const raw = process.env.PB_REVOKED || "";
  return new Set(
    raw.split(",").map(k => k.trim().toUpperCase()).filter(Boolean)
  );
}

// ── Simple rate limiter ──────────────────────────────────────────────────────
const rateMap = new Map();
function rateLimit(ip, maxHits = 10, windowMs = 60_000) {
  const now   = Date.now();
  const entry = rateMap.get(ip) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
  entry.count++;
  rateMap.set(ip, entry);
  return entry.count > maxHits;
}

// ── Crypto helpers ───────────────────────────────────────────────────────────
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 confusion

function makeSerial() {
  const bytes = crypto.randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += CHARS[bytes[i] % CHARS.length];
  return s;
}

function keyChecksum(serial) {
  return crypto.createHmac("sha256", SECRET)
    .update("KEY:" + serial)
    .digest("hex")
    .substring(0, 8)
    .toUpperCase();
}

function buildKey(serial) {
  const cs = keyChecksum(serial);
  return `PBOT-${serial.slice(0,4)}-${serial.slice(4,8)}-${cs.slice(0,4)}-${cs.slice(4,8)}`;
}

function parseKey(key) {
  const m = key.trim().toUpperCase()
    .match(/^PBOT-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})$/);
  if (!m) return null;
  return { serial: m[1] + m[2], checksum: m[3] + m[4] };
}

function isValidKey(key) {
  const p = parseKey(key);
  if (!p) return false;
  return keyChecksum(p.serial) === p.checksum;
}

/** Token is deterministic: HMAC(SECRET, "TOKEN:" + key + ":" + deviceId).
 *  This means verification needs no DB — the token itself encodes everything. */
function makeToken(key, deviceId) {
  return crypto.createHmac("sha256", SECRET)
    .update("TOKEN:" + key + ":" + deviceId)
    .digest("hex");
}

// ── Middleware: admin auth ───────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const pass = req.body?.password || req.headers["x-admin-password"];
  if (!pass || pass !== ADMIN_PASS) {
    return res.status(403).json({ ok: false, error: "Invalid admin password." });
  }
  next();
}

// ── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * POST /api/activate
 * Body: { key, deviceId }
 * Validates key via HMAC. Revocation checked via PB_REVOKED env var.
 * Returns a signed token (device-bound, stateless).
 */
app.post("/api/activate", (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim()
           || req.socket?.remoteAddress
           || "unknown";
  if (rateLimit(ip, 10, 60_000)) {
    return res.status(429).json({ ok: false, msg: "Too many attempts. Try again in a minute." });
  }

  const { key, deviceId } = req.body || {};
  if (!key || !deviceId) return res.json({ ok: false, msg: "Missing key or device ID." });

  const clean = key.trim().toUpperCase();

  if (!isValidKey(clean)) {
    return res.json({ ok: false, msg: "Invalid license key format." });
  }

  if (getRevokedSet().has(clean)) {
    return res.json({ ok: false, msg: "This license key has been revoked." });
  }

  const token = makeToken(clean, deviceId);
  return res.json({ ok: true, token });
});

/**
 * POST /api/verify
 * Body: { key, deviceId, token }
 * Pure HMAC check — no DB needed.
 */
app.post("/api/verify", (req, res) => {
  const { key, deviceId, token } = req.body || {};
  if (!key || !deviceId || !token) return res.json({ ok: false });

  const clean = key.trim().toUpperCase();

  if (!isValidKey(clean)) return res.json({ ok: false });
  if (getRevokedSet().has(clean)) return res.json({ ok: false });

  let tokenBuf, expectedBuf;
  try {
    const expected = makeToken(clean, deviceId);
    tokenBuf    = Buffer.from(token,    "hex");
    expectedBuf = Buffer.from(expected, "hex");
    if (tokenBuf.length !== expectedBuf.length) return res.json({ ok: false });
  } catch {
    return res.json({ ok: false });
  }

  const ok = crypto.timingSafeEqual(tokenBuf, expectedBuf);
  return res.json({ ok });
});

// ── ADMIN API ────────────────────────────────────────────────────────────────

/**
 * POST /api/admin/generate
 * Generates N new license keys (pure crypto, no DB write).
 * Keys are valid as long as they pass HMAC verification and are not revoked.
 */
app.post("/api/admin/generate", requireAdmin, (req, res) => {
  const count = Math.min(parseInt(req.body?.count) || 1, 200);
  const keys  = [];
  const seen  = new Set();

  for (let i = 0; i < count; i++) {
    let key;
    let attempts = 0;
    do {
      key = buildKey(makeSerial());
      attempts++;
    } while (seen.has(key) && attempts < 50);
    seen.add(key);
    keys.push(key);
  }

  return res.json({ ok: true, keys });
});

/**
 * POST /api/admin/list
 * Lists currently revoked keys from PB_REVOKED env var.
 */
app.post("/api/admin/list", requireAdmin, (req, res) => {
  const revoked = Array.from(getRevokedSet());
  return res.json({
    ok: true,
    info: "Keys are stateless — any key with a valid HMAC signature is active unless listed in PB_REVOKED.",
    revoked,
  });
});

/**
 * POST /api/admin/revoke
 * Instructions: add the key to PB_REVOKED in Vercel env vars.
 * This endpoint returns guidance since we can't write to disk.
 */
app.post("/api/admin/revoke", requireAdmin, (req, res) => {
  const { key } = req.body || {};
  if (!key) return res.json({ ok: false, error: "Missing key." });
  const clean = key.trim().toUpperCase();
  if (!isValidKey(clean)) return res.json({ ok: false, error: "Invalid key format." });
  return res.json({
    ok: true,
    action: "add_to_env",
    message: `To revoke: add "${clean}" to your PB_REVOKED environment variable in Vercel dashboard (comma-separated), then redeploy.`,
  });
});

/**
 * POST /api/admin/validate
 * Checks if a given key is currently valid (format + not revoked).
 */
app.post("/api/admin/validate", requireAdmin, (req, res) => {
  const { key } = req.body || {};
  if (!key) return res.json({ ok: false, error: "Missing key." });
  const clean   = key.trim().toUpperCase();
  const valid   = isValidKey(clean);
  const revoked = getRevokedSet().has(clean);
  return res.json({ ok: true, key: clean, valid, revoked, active: valid && !revoked });
});

// ── Block direct access to sensitive files ───────────────────────────────────
app.get("/licenses.json", (_, res) => res.status(403).send("Forbidden"));
app.get("/server.js",     (_, res) => res.status(403).send("Forbidden"));

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ✅  PrintBot server running at http://localhost:${PORT}`);
  console.log(`  🔑  Admin panel: http://localhost:${PORT}/keygen.html`);
  console.log(`  🔒  Admin password: ${ADMIN_PASS}`);
  console.log(`  🚫  Revoked keys: ${process.env.PB_REVOKED || "(none)"}\n`);
});
