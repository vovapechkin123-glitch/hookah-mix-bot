const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

/* =========================
   CONFIG
   ========================= */
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "moments.json");

const MAX_LIMIT = 500;

const ALLOWED_STATUS = new Set([
  "new",
  "accepted",
  "in_progress",
  "serving",
  "finished"
]);

const ALLOWED_RATING = new Set([
  "bad",
  "ok",
  "perfect"
]);

/* =========================
   MIDDLEWARE
   ========================= */
app.use(express.json({ limit: "1mb" }));

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

/* =========================
   STORAGE
   ========================= */
let moments = [];

function readFileSafe() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify({ moments: [] }, null, 2), "utf-8");
      return { moments: [] };
    }
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.moments)) return { moments: [] };
    return parsed;
  } catch (e) {
    return { moments: [] };
  }
}

function writeFileSafe() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ moments }, null, 2), "utf-8");
    return true;
  } catch (e) {
    return false;
  }
}

function initStorage() {
  const data = readFileSafe();
  moments = data.moments || [];
  if (!Array.isArray(moments)) moments = [];
}
initStorage();

function normalizeMoment(m) {
  const now = Date.now();
  return {
    id: String(m.id || `${now}_${Math.random().toString(36).slice(2, 8)}`),
    createdAt: Number(m.createdAt || now),
    status: String(m.status || "new"),
    acceptedAt: m.acceptedAt ? Number(m.acceptedAt) : null,
    rating: m.rating ? String(m.rating) : null,
    epithet: m.epithet ? String(m.epithet) : null,
    guest: m.guest || null,
    answers: m.answers || {}
  };
}

function findMoment(id) {
  return moments.find((x) => String(x.id) === String(id)) || null;
}

function sortNewestFirst(arr) {
  return arr.slice().sort((a, b) => (Number(b.createdAt || 0) - Number(a.createdAt || 0)));
}

/* =========================
   ROUTES
   ========================= */
app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "THE MENU backend",
    moments: moments.length
  });
});

app.get("/moments", (req, res) => {
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number(req.query.limit || 200)));
  const list = sortNewestFirst(moments).slice(0, limit);

  res.json({
    ok: true,
    moments: list
  });
});

app.post("/moment", (req, res) => {
  try {
    const incoming = req.body || {};
    const m = normalizeMoment(incoming);

    const exists = findMoment(m.id);
    if (exists) {
      return res.status(200).json({
        ok: true,
        moment: exists,
        message: "Already exists"
      });
    }

    if (!ALLOWED_STATUS.has(m.status)) {
      m.status = "new";
    }

    moments.push(m);
    writeFileSafe();

    res.status(201).json({
      ok: true,
      moment: m
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: "createMoment error"
    });
  }
});

app.patch("/moment/:id/status", (req, res) => {
  try {
    const id = req.params.id;
    const status = String(req.body?.status || "").trim();

    if (!ALLOWED_STATUS.has(status)) {
      return res.status(400).json({ ok: false, error: "Invalid status" });
    }

    const m = findMoment(id);
    if (!m) {
      return res.status(404).json({ ok: false, error: "Moment not found" });
    }

    m.status = status;

    if (status === "accepted" && !m.acceptedAt) {
      m.acceptedAt = Date.now();
    }

    writeFileSafe();

    res.json({ ok: true, moment: m });
  } catch (e) {
    res.status(500).json({ ok: false, error: "setStatus error" });
  }
});

app.patch("/moment/:id/rating", (req, res) => {
  try {
    const id = req.params.id;
    const rating = String(req.body?.rating || "").trim();

    if (!ALLOWED_RATING.has(rating)) {
      return res.status(400).json({ ok: false, error: "Invalid rating" });
    }

    const m = findMoment(id);
    if (!m) {
      return res.status(404).json({ ok: false, error: "Moment not found" });
    }

    m.rating = rating;

    writeFileSafe();

    res.json({ ok: true, moment: m });
  } catch (e) {
    res.status(500).json({ ok: false, error: "setRating error" });
  }
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`THE MENU backend running on port ${PORT}`);
});
