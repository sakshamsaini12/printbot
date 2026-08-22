/**
 * PrintBot License Server — Vercel-compatible
 *
 * Storage: /tmp/pb_keys.json  (writable on Vercel, survives warm instances)
 * Cold-start seed: PB_KEYS_DB env var (base64 JSON — export from admin panel)
 *
 * Env vars:
 *   PB_SECRET   — HMAC signing secret
 *   PB_ADMIN    — Admin panel password
 *   PB_KEYS_DB  — Base64 DB backup (paste from admin "Backup DB" button)
 *   PORT        — local dev only (default 3131)
 */

const express = require("express");
const crypto  = require("crypto");
const fs      = require("fs");
const path    = require("path");

// ── Load .env.local / .env for local dev (Vercel sets real env vars itself) ──
for (const file of [".env.local", ".env"]) {
  const envPath = path.join(__dirname, file);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = (m[2] || "").trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "50kb" })); // cap body size

// ── Security headers ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options",  "nosniff");
  res.setHeader("X-Frame-Options",         "DENY");
  res.setHeader("X-XSS-Protection",        "1; mode=block");
  res.setHeader("Referrer-Policy",         "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy",      "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  if (IS_PROD) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  const scriptPolicy = req.path === "/keygen.html" ? "'self' 'unsafe-inline'" : "'self'";
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; " +
    `script-src ${scriptPolicy}; ` +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; " +
    "img-src 'self' data: blob:; " +
    "connect-src 'self';"
  );
  next();
});

// ── Same-origin protection ───────────────────────────────────────────────────
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    const host = req.headers.host;
    const allowedOrigin = `${req.protocol}://${host}`;
    if (origin !== allowedOrigin) {
      return res.status(403).json({ ok: false, error: "Cross-origin request blocked." });
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.static(path.join(__dirname, "public"), {
  setHeaders(res, filePath) {
    if (/\.(?:png|jpe?g|webp|woff2?)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else if (/\.(?:js|css)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=86400");
    }
  },
}));

// ── Config ───────────────────────────────────────────────────────────────────
const IS_PROD    = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
const LICENSE_ENABLED = !IS_PROD || Boolean(process.env.PB_SECRET);
const SECRET     = process.env.PB_SECRET || crypto.randomBytes(32).toString("hex");
const ADMIN_PASS = process.env.PB_ADMIN || "";
const DEMO_LIMIT = 5;
const PORT       = process.env.PORT || 3131;
const DB_FILE    = process.env.PB_DB_FILE || path.join(__dirname, ".data", "pb_keys.json");
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 30 * 60 * 1000;

if (process.env.VERCEL && !process.env.PB_DB_FILE) {
  console.warn("PB_DB_FILE is not configured. Connect persistent storage before production use.");
}
if (IS_PROD && !process.env.PB_SECRET) console.warn("PB_SECRET is missing. License activation is disabled; free demo remains available.");
if (IS_PROD && !ADMIN_PASS) console.warn("PB_ADMIN is missing. License administration is disabled.");

// ── DB helpers ───────────────────────────────────────────────────────────────
function loadDB() {
  if (fs.existsSync(DB_FILE)) {
    try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch {}
  }
  if (process.env.PB_KEYS_DB) {
    try {
      const db = JSON.parse(Buffer.from(process.env.PB_KEYS_DB, "base64").toString("utf8"));
      try { fs.writeFileSync(DB_FILE, JSON.stringify(db), "utf8"); } catch {}
      return db;
    } catch {}
  }
  return { keys: {}, demos: {} };
}

function saveDB(db) {
  try {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    const tempFile = `${DB_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(db), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tempFile, DB_FILE);
  }
  catch (e) { console.error("saveDB:", e.message); }
}

function ensureDemos(db) {
  if (!db.demos) db.demos = {};
  return db;
}

// ── Rate limiter ─────────────────────────────────────────────────────────────
const rateMap = new Map();
let lastRateCleanup = 0;
function rateLimit(key, maxHits, windowMs = 60_000) {
  const now   = Date.now();
  if (now - lastRateCleanup > 60_000) {
    for (const [entryKey, value] of rateMap) {
      if (now > value.reset) rateMap.delete(entryKey);
    }
    lastRateCleanup = now;
  }
  const entry = rateMap.get(key) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
  entry.count++;
  rateMap.set(key, entry);
  return entry.count > maxHits;
}

function getIp(req) {
  if (process.env.VERCEL) {
    const forwarded = req.headers["x-vercel-forwarded-for"] || req.headers["x-forwarded-for"];
    if (forwarded) return String(forwarded).split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

// ── Input sanitization helpers ────────────────────────────────────────────────
function sanitizeKey(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().toUpperCase().replace(/[^A-Z0-9\-]/g, "").slice(0, 30);
}
function sanitizeNote(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/[<>"'&]/g, "").slice(0, 120);
}
function sanitizeDeviceId(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/[^A-Za-z0-9\-_]/g, "").slice(0, 80);
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
    .update("KEY:" + serial).digest("hex").substring(0, 8).toUpperCase();
}
function buildKey(serial) {
  const cs = keyChecksum(serial);
  return `PBOT-${serial.slice(0,4)}-${serial.slice(4,8)}-${cs.slice(0,4)}-${cs.slice(4,8)}`;
}
function parseKey(key) {
  const m = key.match(/^PBOT-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})$/);
  return m ? { serial: m[1]+m[2], checksum: m[3]+m[4] } : null;
}
function isValidKeyFormat(key) {
  const p = parseKey(key);
  return p ? keyChecksum(p.serial) === p.checksum : false;
}
function signValue(value) {
  return crypto.createHmac("sha256", SECRET).update(value).digest("base64url");
}
function makeToken(key, deviceId) {
  const payload = Buffer.from(JSON.stringify({ key, deviceId, iat: Date.now(), exp: Date.now() + TOKEN_TTL_MS }))
    .toString("base64url");
  return `${payload}.${signValue(payload)}`;
}
function parseToken(token) {
  if (typeof token !== "string" || token.length > 1024) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = signValue(payload);
  const a = Buffer.from(signature), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}

// ── Admin sessions — HttpOnly cookie + CSRF token ────────────────────────────
const adminSessions = new Map();
function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf("=");
    return [decodeURIComponent(v.slice(0, i)), decodeURIComponent(v.slice(i + 1))];
  }));
}
function safeEqualText(a, b) {
  const aa = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function requireAdmin(req, res, next) {
  const ip = getIp(req);
  const now = Date.now();
  for (const [sessionId, value] of adminSessions) {
    if (value.expires < now) adminSessions.delete(sessionId);
  }
  if (rateLimit(ip + ":admin-api", 120, 60_000)) return res.status(429).json({ ok: false, error: "Too many requests." });
  const sid = parseCookies(req).pb_admin_session;
  const session = sid && adminSessions.get(sid);
  if (!session || session.expires < now) {
    if (sid) adminSessions.delete(sid);
    return res.status(401).json({ ok: false, error: "Authentication required." });
  }
  if (!safeEqualText(req.headers["x-csrf-token"] || "", session.csrf)) {
    return res.status(403).json({ ok: false, error: "Invalid CSRF token." });
  }
  session.expires = now + SESSION_TTL_MS;
  next();
}

app.post("/api/admin/login", (req, res) => {
  const ip = getIp(req);
  if (rateLimit(ip + ":admin-login", 8, 10 * 60_000)) return res.status(429).json({ ok: false, error: "Too many attempts." });
  if (!ADMIN_PASS || !safeEqualText(req.body?.password || "", ADMIN_PASS)) {
    return res.status(403).json({ ok: false, error: "Invalid admin password." });
  }
  const sid = crypto.randomBytes(32).toString("base64url");
  const csrf = crypto.randomBytes(24).toString("base64url");
  adminSessions.set(sid, { csrf, expires: Date.now() + SESSION_TTL_MS });
  res.setHeader("Set-Cookie", `pb_admin_session=${encodeURIComponent(sid)}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${SESSION_TTL_MS / 1000}${IS_PROD ? "; Secure" : ""}`);
  return res.json({ ok: true, csrf });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  const sid = parseCookies(req).pb_admin_session;
  if (sid) adminSessions.delete(sid);
  res.setHeader("Set-Cookie", `pb_admin_session=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0${IS_PROD ? "; Secure" : ""}`);
  return res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
//  PUBLIC API
// ════════════════════════════════════════════════════════════════════════════

/** POST /api/demo/check — how many demo uploads remain for this IP */
app.post("/api/demo/check", (req, res) => {
  const ip  = getIp(req);
  const deviceId = sanitizeDeviceId(req.body?.deviceId || "");
  const demoKey = deviceId ? `${ip}:${deviceId}` : ip;
  const db  = ensureDemos(loadDB());
  const used      = db.demos[demoKey] || 0;
  const remaining = Math.max(0, DEMO_LIMIT - used);
  return res.json({ ok: true, used, remaining, limit: DEMO_LIMIT });
});

/** POST /api/demo/use — consume 1+ demo upload slots for this IP */
app.post("/api/demo/use", (req, res) => {
  const ip = getIp(req);
  if (rateLimit(ip + ":demo", 30, 60_000)) {
    return res.status(429).json({ ok: false, remaining: 0, msg: "Too many requests." });
  }
  const count = Math.min(parseInt(req.body?.count) || 1, 5);
  const deviceId = sanitizeDeviceId(req.body?.deviceId || "");
  if (!deviceId) return res.status(400).json({ ok: false, remaining: 0, msg: "Missing device ID." });
  const demoKey = `${ip}:${deviceId}`;
  const db    = ensureDemos(loadDB());
  const used  = db.demos[demoKey] || 0;
  if (used >= DEMO_LIMIT) {
    return res.json({ ok: false, remaining: 0, msg: "Demo limit reached." });
  }
  const canUse     = Math.min(count, DEMO_LIMIT - used);
  db.demos[demoKey] = used + canUse;
  saveDB(db);
  const remaining  = Math.max(0, DEMO_LIMIT - db.demos[demoKey]);
  return res.json({ ok: true, used: canUse, remaining });
});

/** POST /api/activate */
app.post("/api/activate", (req, res) => {
  if (!LICENSE_ENABLED) return res.status(503).json({ ok: false, msg: "License activation is temporarily unavailable." });
  const ip = getIp(req);
  if (rateLimit(ip + ":activate", 10, 60_000)) {
    return res.status(429).json({ ok: false, msg: "Too many attempts. Try again in a minute." });
  }
  const key      = sanitizeKey(req.body?.key || "");
  const deviceId = sanitizeDeviceId(req.body?.deviceId || "");
  if (!key || !deviceId) return res.json({ ok: false, msg: "Missing key or device ID." });
  if (!isValidKeyFormat(key)) return res.json({ ok: false, msg: "Invalid license key format." });

  const db     = loadDB();
  const record = db.keys[key];
  if (!record)        return res.json({ ok: false, msg: "License key not found." });
  if (!record.active) return res.json({ ok: false, msg: "This license key has been revoked." });
  if (record.deviceId && record.deviceId !== deviceId)
    return res.json({ ok: false, msg: "This key is already activated on a different device." });

  if (!record.deviceId) {
    record.deviceId    = deviceId;
    record.activatedAt = Date.now();
    saveDB(db);
  }
  return res.json({ ok: true, token: makeToken(key, deviceId) });
});

/** POST /api/verify */
app.post("/api/verify", (req, res) => {
  if (!LICENSE_ENABLED) return res.status(503).json({ ok: false });
  const key      = sanitizeKey(req.body?.key || "");
  const deviceId = sanitizeDeviceId(req.body?.deviceId || "");
  const token    = typeof req.body?.token === "string" ? req.body.token.trim().slice(0,1024) : "";
  if (!key || !deviceId || !token) return res.json({ ok: false });

  const db     = loadDB();
  const record = db.keys[key];
  if (!record || !record.active || record.deviceId !== deviceId) return res.json({ ok: false });
  const payload = parseToken(token);
  return res.json({ ok: Boolean(payload && payload.key === key && payload.deviceId === deviceId) });
});

// ════════════════════════════════════════════════════════════════════════════
//  ADMIN API
// ════════════════════════════════════════════════════════════════════════════

app.post("/api/admin/generate", requireAdmin, (req, res) => {
  const count = Math.min(Math.max(1, parseInt(req.body?.count) || 1), 200);
  const note  = sanitizeNote(req.body?.note || "");
  const db    = loadDB();
  const keys  = [];
  for (let i = 0; i < count; i++) {
    let key, attempts = 0;
    do { key = buildKey(makeSerial()); attempts++; } while (db.keys[key] && attempts < 50);
    db.keys[key] = { active: true, deviceId: null, activatedAt: null, createdAt: Date.now(), note };
    keys.push(key);
  }
  saveDB(db);
  return res.json({ ok: true, keys });
});

app.post("/api/admin/list", requireAdmin, (req, res) => {
  const db   = loadDB();
  const rows = Object.entries(db.keys)
    .map(([key, info]) => ({ key, ...info }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return res.json({ ok: true, keys: rows });
});

app.post("/api/admin/revoke", requireAdmin, (req, res) => {
  const key = sanitizeKey(req.body?.key || "");
  const db  = loadDB();
  if (!db.keys[key]) return res.json({ ok: false, error: "Key not found." });
  db.keys[key].active = false;
  saveDB(db);
  return res.json({ ok: true });
});

app.post("/api/admin/unrevoke", requireAdmin, (req, res) => {
  const key = sanitizeKey(req.body?.key || "");
  const db  = loadDB();
  if (!db.keys[key]) return res.json({ ok: false, error: "Key not found." });
  db.keys[key].active = true;
  saveDB(db);
  return res.json({ ok: true });
});

app.post("/api/admin/reset-device", requireAdmin, (req, res) => {
  const key = sanitizeKey(req.body?.key || "");
  const db  = loadDB();
  if (!db.keys[key]) return res.json({ ok: false, error: "Key not found." });
  db.keys[key].deviceId    = null;
  db.keys[key].activatedAt = null;
  saveDB(db);
  return res.json({ ok: true });
});

app.post("/api/admin/delete", requireAdmin, (req, res) => {
  const key = sanitizeKey(req.body?.key || "");
  const db  = loadDB();
  if (!db.keys[key]) return res.json({ ok: false, error: "Key not found." });
  delete db.keys[key];
  saveDB(db);
  return res.json({ ok: true });
});

app.post("/api/admin/backup", requireAdmin, (req, res) => {
  const db    = loadDB();
  const b64   = Buffer.from(JSON.stringify(db)).toString("base64");
  const count = Object.keys(db.keys).length;
  return res.json({ ok: true, b64, count });
});

// ── Block direct access to sensitive files ────────────────────────────────────
app.get("/licenses.json", (_, res) => res.status(403).send("Forbidden"));
app.get("/server.js",     (_, res) => res.status(403).send("Forbidden"));

app.listen(PORT, () => {
  console.log(`\n  ✅  PrintBot: http://localhost:${PORT}`);
  console.log(`  🔑  Admin: http://localhost:${PORT}/keygen.html`);
  console.log(`  🔒  Admin authentication ${ADMIN_PASS ? "enabled" : "disabled"}\n`);
});
