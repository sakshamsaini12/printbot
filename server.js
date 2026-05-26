/**
 * PrintBot License Server
 * Run: node server.js
 * Config via environment variables:
 *   PB_SECRET   — HMAC signing secret (change before production!)
 *   PB_ADMIN    — Admin panel password
 *   PORT        — HTTP port (default 3131)
 */

const express = require("express");
const crypto  = require("crypto");
const fs      = require("fs");
const path    = require("path");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") res.sendStatus(200);
  else next();
});
app.use(express.static(path.join(__dirname, "public")));   // serve index.html, app.js, etc.

// ── Config ──────────────────────────────────────────────────────────────────
const SECRET     = process.env.PB_SECRET || "pb-shopship-2024-change-in-prod-XzK9m";
const ADMIN_PASS = process.env.PB_ADMIN  || "shopship@admin";
const DB_FILE    = path.join(__dirname, "licenses.json");
const PORT       = process.env.PORT || 3131;

// ── Simple rate limiter ──────────────────────────────────────────────────────
const rateMap = new Map();
function rateLimit(ip, maxHits = 10, windowMs = 60_000) {
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
  entry.count++;
  rateMap.set(ip, entry);
  return entry.count > maxHits;
}

// ── DB helpers ───────────────────────────────────────────────────────────────
function loadDB() {
  if (!fs.existsSync(DB_FILE)) return { keys: {} };
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { return { keys: {} }; }
}
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

// ── Crypto helpers ───────────────────────────────────────────────────────────
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 confusion

function makeSerial() {
  let s = "";
  const bytes = crypto.randomBytes(8);
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
  return { serial: m[1]+m[2], checksum: m[3]+m[4] };
}

function isValidKey(key) {
  const p = parseKey(key);
  if (!p) return false;
  return keyChecksum(p.serial) === p.checksum;
}

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
 * Validates the key and binds it to the device. Returns a signed token.
 */
app.post("/api/activate", (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  if (rateLimit(ip, 10, 60_000)) {
    return res.status(429).json({ ok: false, msg: "Too many attempts. Try again in a minute." });
  }

  const { key, deviceId } = req.body || {};
  if (!key || !deviceId) return res.json({ ok: false, msg: "Missing key or device ID." });

  const clean = key.trim().toUpperCase();
  if (!isValidKey(clean)) {
    return res.json({ ok: false, msg: "Invalid license key format." });
  }

  const db = loadDB();
  const record = db.keys[clean];

  if (!record)          return res.json({ ok: false, msg: "License key not found." });
  if (!record.active)   return res.json({ ok: false, msg: "This license key has been revoked." });
  if (record.deviceId && record.deviceId !== deviceId) {
    return res.json({ ok: false, msg: "This key is already activated on a different device." });
  }

  // Bind key to device on first activation
  if (!record.deviceId) {
    record.deviceId    = deviceId;
    record.activatedAt = Date.now();
    saveDB(db);
  }

  const token = makeToken(clean, deviceId);
  return res.json({ ok: true, token });
});

/**
 * POST /api/verify
 * Body: { key, deviceId, token }
 * Checks that the stored token is still valid and key is not revoked.
 */
app.post("/api/verify", (req, res) => {
  const { key, deviceId, token } = req.body || {};
  if (!key || !deviceId || !token) return res.json({ ok: false });

  const clean = key.trim().toUpperCase();
  const db    = loadDB();
  const record = db.keys[clean];

  if (!record || !record.active)   return res.json({ ok: false });
  if (record.deviceId !== deviceId) return res.json({ ok: false });

  const expected = makeToken(clean, deviceId);
  const ok = crypto.timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
  return res.json({ ok });
});

// ── ADMIN API ────────────────────────────────────────────────────────────────

/** POST /api/admin/generate — generate N new license keys */
app.post("/api/admin/generate", requireAdmin, (req, res) => {
  const count = Math.min(parseInt(req.body.count) || 1, 200);
  const note  = (req.body.note || "").substring(0, 120);

  const db   = loadDB();
  const keys = [];

  for (let i = 0; i < count; i++) {
    let key, attempts = 0;
    do { key = buildKey(makeSerial()); attempts++; } while (db.keys[key] && attempts < 50);
    db.keys[key] = {
      active:      true,
      deviceId:    null,
      activatedAt: null,
      createdAt:   Date.now(),
      note,
    };
    keys.push(key);
  }

  saveDB(db);
  res.json({ ok: true, keys });
});

/** POST /api/admin/list — list all keys with status */
app.post("/api/admin/list", requireAdmin, (req, res) => {
  const db   = loadDB();
  const rows = Object.entries(db.keys).map(([key, info]) => ({ key, ...info }));
  // newest first
  rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json({ ok: true, keys: rows });
});

/** POST /api/admin/revoke — revoke a key */
app.post("/api/admin/revoke", requireAdmin, (req, res) => {
  const { key } = req.body;
  const db = loadDB();
  if (!db.keys[key]) return res.json({ ok: false, error: "Key not found." });
  db.keys[key].active = false;
  saveDB(db);
  res.json({ ok: true });
});

/** POST /api/admin/unrevoke — re-activate a revoked key */
app.post("/api/admin/unrevoke", requireAdmin, (req, res) => {
  const { key } = req.body;
  const db = loadDB();
  if (!db.keys[key]) return res.json({ ok: false, error: "Key not found." });
  db.keys[key].active = true;
  saveDB(db);
  res.json({ ok: true });
});

/** POST /api/admin/reset-device — unbind key from device (allows re-activation on new device) */
app.post("/api/admin/reset-device", requireAdmin, (req, res) => {
  const { key } = req.body;
  const db = loadDB();
  if (!db.keys[key]) return res.json({ ok: false, error: "Key not found." });
  db.keys[key].deviceId    = null;
  db.keys[key].activatedAt = null;
  saveDB(db);
  res.json({ ok: true });
});

// ── Block direct access to sensitive files ───────────────────────────────────
app.get("/licenses.json", (_, res) => res.status(403).send("Forbidden"));
app.get("/server.js",     (_, res) => res.status(403).send("Forbidden"));

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ✅  PrintBot server running at http://localhost:${PORT}`);
  console.log(`  🔑  Admin panel: http://localhost:${PORT}/keygen.html`);
  console.log(`  🔒  Admin password: ${ADMIN_PASS}\n`);
});
