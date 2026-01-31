import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

// ENV
const BOT_TOKEN = process.env.BOT_TOKEN;
const MASTER_ID = Number(process.env.MASTER_ID || "0");

// storage (MVP)
let MOMENTS = [];

function now() {
  return Date.now();
}

function escapeText(s = "") {
  return String(s).replaceAll("<", "").replaceAll(">", "");
}

function formatMomentMessage(m) {
  const g = m.guest || {};
  const a = m.answers || {};

  const lines = [
    "🕯 НОВЫЙ МОМЕНТ",
    "",
    `Гость: ${g.name || "Гость"}${g.username ? " (@" + g.username + ")" : ""}`,
    "",
    `q1: ${a[1] || "—"}`,
    `q2: ${a[2] || "—"}`,
    `q3: ${a[3] || "—"}`,
    `q4: ${a[4] || "—"}`,
    `q5: ${a[5] || "—"}`,
    `q6: ${a[6] || "—"}`,
    `q7: ${a[7] || "—"}`,
    `q8: ${a[8] || "—"}`,
    `q9: ${a[9] || "—"}`,
    `q10 (нельзя): ${a[10] || "—"}`,
    `q11: ${a[11] || "—"}`,
    "",
    `Эпитет: ${m.epithet || "—"}`,
    "",
    "⏳ Время начнётся, когда кухня подтвердит."
  ];

  return lines.join("\n");
}

async function notifyMaster(text) {
  if (!BOT_TOKEN || !MASTER_ID) return;

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: MASTER_ID,
        text: escapeText(text)
      })
    });
  } catch (e) {
    console.error("Telegram notify error:", e);
  }
}

app.get("/", (req, res) => res.send("OK"));

// create moment
app.post("/moment", async (req, res) => {
  const m = req.body;

  if (!m || !m.id || !m.guest || !m.answers) {
    return res.status(400).json({ ok: false, error: "bad_moment" });
  }

  // normalize
  const moment = {
    id: String(m.id),
    createdAt: Number(m.createdAt || now()),
    status: String(m.status || "new"),
    guest: {
      id: m.guest.id,
      name: m.guest.name || "Гость",
      username: m.guest.username || ""
    },
    answers: m.answers || {},
    epithet: m.epithet || "",
    rating: m.rating || null,
    acceptedAt: m.acceptedAt || null
  };

  MOMENTS.push(moment);

  // limit memory
  if (MOMENTS.length > 400) MOMENTS = MOMENTS.slice(-400);

  // notify
  await notifyMaster(formatMomentMessage(moment));

  res.json({ ok: true, moment });
});

// get moments
app.get("/moments", (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 400);
  res.json({ ok: true, moments: MOMENTS.slice(-limit) });
});

// set status
app.patch("/moment/:id/status", (req, res) => {
  const id = String(req.params.id);
  const { status } = req.body || {};

  if (!id || !status) {
    return res.status(400).json({ ok: false, error: "bad_request" });
  }

  const idx = MOMENTS.findIndex((m) => String(m.id) === id);
  if (idx === -1) return res.status(404).json({ ok: false, error: "not_found" });

  const next = String(status);

  MOMENTS[idx].status = next;

  // IMPORTANT: timer starts when kitchen accepts
  if (next === "accepted" && !MOMENTS[idx].acceptedAt) {
    MOMENTS[idx].acceptedAt = now();
  }

  res.json({ ok: true, moment: MOMENTS[idx] });
});

// set rating
app.patch("/moment/:id/rating", (req, res) => {
  const id = String(req.params.id);
  const { rating } = req.body || {};

  if (!id || !rating) {
    return res.status(400).json({ ok: false, error: "bad_request" });
  }

  const idx = MOMENTS.findIndex((m) => String(m.id) === id);
  if (idx === -1) return res.status(404).json({ ok: false, error: "not_found" });

  MOMENTS[idx].rating = String(rating);

  res.json({ ok: true, moment: MOMENTS[idx] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
