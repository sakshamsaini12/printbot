/**
 * PrintBot License Server — Vercel-compatible
 *
 * Storage: /tmp/pb_keys.json  (writable on Vercel, survives warm instances)
 * Cold-start seed: PB_KEYS_DB env var (base64-encoded JSON — export from admin panel)
 *
 * Env vars (set in Vercel dashboard):
 *   PB_SECRET   — HMAC signing secret
 *   PB_ADMIN    — Admin panel password
 *   PB_KEYS_DB  — Base64 backup of keys (paste from "Backup DB" button in admin)
 *   PORT        — local dev port (default 3131)
 */

const express = require("express");
const crypto  = require("crypto");
const fs      = require("fs");
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

// ── Config ───────────────────────────────────────────────────────────────────
const SECRET     = process.env.PB_SECRET || "pb-shopship-2024-change-in-prod-XzK9m";
const ADMIN_PASS = process.env.PB_ADMIN  || "shopship@admin";
const PORT       = process.env.PORT      || 3131;
// Use /tmp — writable on Vercel serverless, survives within a warm instance
const DB_FILE    = "/tmp/pb_keys.json";

// ── DB helpers ───────────────────────────────────────────────────────────────
function loadDB() {
  // 1. Try /tmp first
  if (fs.existsSync(DB_FILE)) {
    try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch {}
  }
  // 2. Cold start — seed from PB_KEYS_DB env var (base64 backup)
  if (process.env.PB_KEYS_DB) {
    try {
      const db = JSON.parse(Buffer.from(process.env.PB_KEYS_DB, "base64").toString("utf8"));
      // Write to /tmp so subsequent calls are fast
      try { fs.writeFileSync(DB_FILE, JSON.stringify(db), "utf8"); } catch {}
      return db;
    } catch {}
  }
  return { keys: {} };
}

function saveDB(db) {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db), "utf8"); } catch (e) {
    console.error("saveDB error:", e.message);
  }
}

// ── Rate limiter ─────────────────────────────────────────────────────────────
const rateMap = new Map();
function rateLimit(ip, maxHits = 10, windowMs = 60_000) {
  const now   = Date.now();
  const entry = rateMap.get(ip) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
  entry.count++;
  rateMap.set(ip, entry);
  return entry.count > maxHits;
}

// ── Crypto ───────────────────────────────────────────────────────────────────
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeSerial() {
  const bytes = crypto.randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += CHARS[bytes[i] % CHARS.length];
  return s;
}

function keyChecksum(serial) {
  return crypto.createHmac("sha256", SECRET)
    .update("KEY:" + serial).digest("hex")
    .substring(0, 8).toUpperCase();
}

function buildKey(serial) {
  const cs = keyChecksum(serial);
  return `PBOT-${serial.slice(0,4)}-${serial.slice(4,8)}-${cs.slice(0,4)}-${cs.slice(4,8)}`;
}

function parseKey(key) {
  const m = key.trim().toUpperCase()
    .match(/^PBOT-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})$/);
  return m ? { serial: m[1]+m[2], checksum: m[3]+m[4] } : null;
}

function isValidKey(key) {
  const p = parseKey(key);
  return p ? keyChecksum(p.serial) === p.checksum : false;
}

function makeToken(key, deviceId) {
  return crypto.createHmac("sha256", SECRET)
    .update("TOKEN:" + key + ":" + deviceId).digest("hex");
}

// ── Admin middleware ──────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const pass = req.body?.password || req.headers["x-admin-password"];
  if (!pass || pass !== ADMIN_PASS)
    return res.status(403).json({ ok: false, error: "Invalid admin password." });
  next();
}

// ── PUBLIC API ────────────────────────────────────────────────────────────────

/** POST /api/activate */
app.post("/api/activate", (req, res) => {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
           || req.socket?.remoteAddress || "unknown";
  if (rateLimit(ip)) return res.status(429).json({ ok: false, msg: "Too many attempts. Try again in a minute." });

  const { key, deviceId } = req.body || {};
  if (!key || !deviceId) return res.json({ ok: false, msg: "Missing key or device ID." });

  const clean = key.trim().toUpperCase();
  if (!isValidKey(clean)) return res.json({ ok: false, msg: "Invalid license key format." });

  const db     = loadDB();
  const record = db.keys[clean];
  if (!record)        return res.json({ ok: false, msg: "License key not found." });
  if (!record.active) return res.json({ ok: false, msg: "This license key has been revoked." });
  if (record.deviceId && record.deviceId !== deviceId)
    return res.json({ ok: false, msg: "This key is already activated on a different device." });

  if (!record.deviceId) {
    record.deviceId    = deviceId;
    record.activatedAt = Date.now();
    saveDB(db);
  }

  return res.json({ ok: true, token: makeToken(clean, deviceId) });
});

/** POST /api/verify */
app.post("/api/verify", (req, res) => {
  const { key, deviceId, token } = req.body || {};
  if (!key || !deviceId || !token) return res.json({ ok: false });

  const clean  = key.trim().toUpperCase();
  const db     = loadDB();
  const record = db.keys[clean];
  if (!record || !record.active || record.deviceId !== deviceId) return res.json({ ok: false });

  try {
    const expected = makeToken(clean, deviceId);
    const a = Buffer.from(token, "hex"), b = Buffer.from(expected, "hex");
    return res.json({ ok: a.length === b.length && crypto.timingSafeEqual(a, b) });
  } catch { return res.json({ ok: false }); }
});

// ── ADMIN API ─────────────────────────────────────────────────────────────────

/** POST /api/admin/generate — create N keys */
app.post("/api/admin/generate", requireAdmin, (req, res) => {
  const count = Math.min(parseInt(req.body?.count) || 1, 200);
  const note  = (req.body?.note || "").substring(0, 120);

  const db   = loadDB();
  const keys = [];

  for (let i = 0; i < count; i++) {
    let key, attempts = 0;
    do { key = buildKey(makeSerial()); attempts++; } while (db.keys[key] && attempts < 50);
    db.keys[key] = { active: true, deviceId: null, activatedAt: null, createdAt: Date.now(), note };
    keys.push(key);
  }

  saveDB(db);
  return res.json({ ok: true, keys });
});

/** POST /api/admin/list — list all keys */
app.post("/api/admin/list", requireAdmin, (req, res) => {
  const db   = loadDB();
  const rows = Object.entries(db.keys)
    .map(([key, info]) => ({ key, ...info }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return res.json({ ok: true, keys: rows });
});

/** POST /api/admin/revoke */
app.post("/api/admin/revoke", requireAdmin, (req, res) => {
  const db = loadDB();
  const { key } = req.body || {};
  if (!db.keys[key]) return res.json({ ok: false, error: "Key not found." });
  db.keys[key].active = false;
  saveDB(db);
  return res.json({ ok: true });
});

/** POST /api/admin/unrevoke */
app.post("/api/admin/unrevoke", requireAdmin, (req, res) => {
  const db = loadDB();
  const { key } = req.body || {};
  if (!db.keys[key]) return res.json({ ok: false, error: "Key not found." });
  db.keys[key].active = true;
  saveDB(db);
  return res.json({ ok: true });
});

/** POST /api/admin/reset-device */
app.post("/api/admin/reset-device", requireAdmin, (req, res) => {
  const db = loadDB();
  const { key } = req.body || {};
  if (!db.keys[key]) return res.json({ ok: false, error: "Key not found." });
  db.keys[key].deviceId    = null;
  db.keys[key].activatedAt = null;
  saveDB(db);
  return res.json({ ok: true });
});

/** POST /api/admin/delete — remove key entirely */
app.post("/api/admin/delete", requireAdmin, (req, res) => {
  const db = loadDB();
  const { key } = req.body || {};
  if (!db.keys[key]) return res.json({ ok: false, error: "Key not found." });
  delete db.keys[key];
  saveDB(db);
  return res.json({ ok: true });
});

/** POST /api/admin/backup — returns full DB as base64 to paste into PB_KEYS_DB env var */
app.post("/api/admin/backup", requireAdmin, (req, res) => {
  const db     = loadDB();
  const b64    = Buffer.from(JSON.stringify(db)).toString("base64");
  const count  = Object.keys(db.keys).length;
  return res.json({ ok: true, b64, count });
});

// ── Block sensitive files ─────────────────────────────────────────────────────
app.get("/licenses.json", (_, res) => res.status(403).send("Forbidden"));
app.get("/server.js",     (_, res) => res.status(403).send("Forbidden"));

app.listen(PORT, () => {
  console.log(`\n  ✅  PrintBot server: http://localhost:${PORT}`);
  console.log(`  🔑  Admin: http://localhost:${PORT}/keygen.html`);
  console.log(`  🔒  Password: ${ADMIN_PASS}\n`);
});
