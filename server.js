import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

// === НАСТРОЙКИ ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const MASTER_ID = Number(process.env.MASTER_ID || 1292778768);

// === ХРАНИЛИЩЕ (MVP / RAM) ===
let MOMENTS = [];

/**
 * userId -> { allowed: boolean, updatedAt: number }
 */
const GEO_SESSIONS = new Map();

// === UTILS ===
function toRad(x) {
  return (x * Math.PI) / 180;
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function fmt(v) {
  return Array.isArray(v) ? v.join(", ") : (v ?? "—");
}

function formatMomentMessage(moment) {
  const g = moment.guest || {};
  const a = moment.answers || {};

  return [
    "🕯 НОВЫЙ МОМЕНТ",
    "",
    `Гость: ${g.name || "Гость"}${g.username ? " (@" + g.username + ")" : ""}`,
    "",
    `q1: ${fmt(a.q1)}`,
    `q2: ${fmt(a.q2)}`,
    `q3: ${fmt(a.q3)}`,
    `q4: ${fmt(a.q4)}`,
    `q5: ${fmt(a.q5)}`,
    `q6 (нельзя): ${fmt(a.q6)}`,
    `q7: ${fmt(a.q7)}`,
    "",
    `Эпитет: ${moment.epithet || "—"}`,
    "",
    "⏱ Время начнётся, когда кухня подтвердит."
  ].join("\n");
}

async function notifyMaster(text) {
  if (!BOT_TOKEN || !MASTER_ID) return;

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: MASTER_ID,
      text
    })
  });
}

// === API ===
app.get("/", (req, res) => res.send("OK"));

/**
 * POST /geo/check
 */
app.post("/geo/check", (req, res) => {
  const { lat, lng, venue } = req.body || {};

  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !venue ||
    typeof venue.lat !== "number" ||
    typeof venue.lng !== "number" ||
    typeof venue.radius !== "number"
  ) {
    return res.status(400).json({ ok: false, error: "bad_request" });
  }

  const dist = distanceMeters(lat, lng, venue.lat, venue.lng);
  const allowed = dist <= venue.radius;

  res.json({
    ok: true,
    allowed,
    distanceMeters: Math.round(dist),
    radiusMeters: venue.radius
  });
});

/**
 * GET /geo/session?userId=123
 */
app.get("/geo/session", (req, res) => {
  const userId = String(req.query.userId || "");
  if (!userId) return res.json({ ok: true, allowed: false });

  const s = GEO_SESSIONS.get(userId);
  if (!s) return res.json({ ok: true, allowed: false });

  const TTL = 2 * 60 * 60 * 1000;
  const alive = Date.now() - s.updatedAt < TTL;

  res.json({ ok: true, allowed: !!(alive && s.allowed) });
});

/**
 * POST /geo/session/allow
 */
app.post("/geo/session/allow", (req, res) => {
  const { userId, allowed } = req.body || {};
  if (!userId) return res.status(400).json({ ok: false, error: "bad_request" });

  GEO_SESSIONS.set(String(userId), {
    allowed: allowed !== false,
    updatedAt: Date.now()
  });

  res.json({ ok: true });
});

/**
 * POST /moment
 */
app.post("/moment", async (req, res) => {
  const moment = req.body;

  if (!moment || !moment.id || !moment.guest || !moment.answers) {
    return res.status(400).json({ ok: false, error: "bad_moment" });
  }

  if (!moment.createdAt) moment.createdAt = Date.now();

  // новый момент всегда "created"
  moment.status = "created";
  moment.acceptedAt = null;

  MOMENTS.push(moment);

  if (MOMENTS.length > 300) MOMENTS = MOMENTS.slice(-300);

  try {
    const msg = formatMomentMessage(moment);
    await notifyMaster(msg);
  } catch (e) {
    console.error("Telegram notify error", e);
  }

  res.json({ ok: true });
});

/**
 * GET /moments?limit=200
 */
app.get("/moments", (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 300);
  res.json({
    ok: true,
    moments: MOMENTS.slice(-limit)
  });
});

/**
 * GET /moment/:id
 */
app.get("/moment/:id", (req, res) => {
  const id = String(req.params.id || "");
  const m = MOMENTS.find(x => String(x.id) === id);
  if (!m) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, moment: m });
});

/**
 * PATCH /moment/:id/status
 * body: { status }
 *
 * status values:
 * created -> accepted -> cooking -> serving -> done
 */
app.patch("/moment/:id/status", (req, res) => {
  const id = String(req.params.id || "");
  const { status } = req.body || {};

  if (!id || !status) {
    return res.status(400).json({ ok: false, error: "bad_request" });
  }

  const idx = MOMENTS.findIndex(m => String(m.id) === id);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "not_found" });
  }

  const prev = MOMENTS[idx].status;

  MOMENTS[idx].status = status;

  // таймер гостя стартует только при accepted
  if (status === "accepted" && !MOMENTS[idx].acceptedAt) {
    MOMENTS[idx].acceptedAt = Date.now();
  }

  res.json({ ok: true, prev, moment: MOMENTS[idx] });
});

// === START ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
