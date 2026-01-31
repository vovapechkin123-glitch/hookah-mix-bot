import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// ===== ХРАНИЛИЩЕ (MVP) =====
let MOMENTS = []; // последние 200

// ===== УТИЛИТЫ =====
function toRad(v){ return (v * Math.PI) / 180; }

function haversineMeters(lat1, lng1, lat2, lng2){
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng/2) * Math.sin(dLng/2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ===== API =====
app.get("/", (req,res)=>res.send("OK"));

// Гео-проверка
app.post("/geo/check", (req,res)=>{
  const { lat, lng, venue } = req.body || {};

  if(typeof lat !== "number" || typeof lng !== "number"){
    return res.status(400).json({ ok:false, error:"bad_coords" });
  }

  const v = venue && typeof venue.lat === "number" && typeof venue.lng === "number"
    ? venue
    : null;

  if(!v){
    return res.status(400).json({ ok:false, error:"bad_venue" });
  }

  const radius = Number(v.radius || 40);
  const dist = haversineMeters(lat, lng, v.lat, v.lng);

  return res.json({
    ok:true,
    allowed: dist <= radius,
    distanceMeters: Math.round(dist),
    radius
  });
});

// Создание момента
app.post("/moment", (req,res)=>{
  const m = req.body;

  if(!m || !m.id || !m.guest || !m.answers){
    return res.status(400).json({ ok:false, error:"bad_moment" });
  }

  MOMENTS.push({
    id: String(m.id),
    guest: m.guest,
    createdAt: m.createdAt || Date.now(),
    startAt: m.startAt || Date.now(),
    endAt: m.endAt || (Date.now() + 25*60*1000),
    status: m.status || "active",
    epithet: m.epithet || null,
    answers: m.answers,
    venue: m.venue || null
  });

  if(MOMENTS.length > 200) MOMENTS = MOMENTS.slice(-200);

  return res.json({ ok:true });
});

// Получение моментов (для отладки/будущего)
app.get("/moments", (req,res)=>{
  const limit = Math.min(Number(req.query.limit || 50), 200);
  return res.json({
    ok:true,
    moments: MOMENTS.slice(-limit)
  });
});

// ===== START =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>{
  console.log("Server started on port", PORT);
});
