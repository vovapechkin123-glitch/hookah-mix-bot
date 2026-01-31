import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

// ================== НАСТРОЙКИ ==================
const BOT_TOKEN = process.env.BOT_TOKEN; // обязателен
const WEBAPP_URL = process.env.WEBAPP_URL || ""; // опционально (для кнопки "Вернуться")
const PORT = process.env.PORT || 3000;

// Геозона по умолчанию (можно менять с фронта, но это fallback)
const DEFAULT_VENUE = {
  lat: 56.519963,
  lng: 84.933527,
  radius: 40
};

// Сколько живёт допуск после отправки гео через бота
const GEO_SESSION_TTL_MS = 2 * 60 * 1000; // 2 минуты

// ================== ХРАНИЛИЩЕ (MVP) ==================
let MOMENTS = []; // последние 200

// Сессии допуска по tg user id
// GEO_SESSIONS[userId] = { allowedUntil, lat, lng, distanceMeters, createdAt }
let GEO_SESSIONS = {};

// ================== УТИЛИТЫ ==================
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

function cleanupGeoSessions(){
  const now = Date.now();
  for(const [userId, s] of Object.entries(GEO_SESSIONS)){
    if(!s?.allowedUntil || s.allowedUntil < now){
      delete GEO_SESSIONS[userId];
    }
  }
}

async function tgSendMessage(chat_id, text, extra = {}){
  if(!BOT_TOKEN) return;

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      chat_id,
      text,
      ...extra
    })
  });
}

// ================== API ==================
app.get("/", (req,res)=>res.send("OK"));

// Гео-проверка по координатам (если вдруг WebView отдаст)
app.post("/geo/check", (req,res)=>{
  const { lat, lng, venue } = req.body || {};

  if(typeof lat !== "number" || typeof lng !== "number"){
    return res.status(400).json({ ok:false, error:"bad_coords" });
  }

  const v = venue && typeof venue.lat === "number" && typeof venue.lng === "number"
    ? venue
    : DEFAULT_VENUE;

  const radius = Number(v.radius || 40);
  const dist = haversineMeters(lat, lng, v.lat, v.lng);

  return res.json({
    ok:true,
    allowed: dist <= radius,
    distanceMeters: Math.round(dist),
    radius
  });
});

// Проверка сессии допуска (через бота)
app.get("/geo/session", (req,res)=>{
  cleanupGeoSessions();

  const userId = String(req.query.userId || "");
  if(!userId){
    return res.status(400).json({ ok:false, error:"no_userId" });
  }

  const s = GEO_SESSIONS[userId];
  if(!s){
    return res.json({ ok:true, allowed:false });
  }

  return res.json({
    ok:true,
    allowed: true,
    allowedUntil: s.allowedUntil,
    distanceMeters: s.distanceMeters ?? null
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

// Для отладки
app.get("/moments", (req,res)=>{
  const limit = Math.min(Number(req.query.limit || 50), 200);
  return res.json({
    ok:true,
    moments: MOMENTS.slice(-limit)
  });
});

// ================== BOT POLLING ==================
let offset = 0;

async function pollUpdates(){
  if(!BOT_TOKEN) return;

  try{
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?timeout=25&offset=${offset}`);
    const data = await r.json();

    if(!data?.ok) return;

    for(const upd of data.result){
      offset = upd.update_id + 1;

      const msg = upd.message;
      if(!msg) continue;

      const chatId = msg.chat?.id;
      const fromId = msg.from?.id;

      // /start
      if(msg.text && msg.text.startsWith("/start")){
        await tgSendMessage(chatId,
          "Передайте геопозицию.\nЭто откроет дверь на 2 минуты.",
          {
            reply_markup: {
              keyboard: [
                [{ text: "📍 Отправить геопозицию", request_location: true }]
              ],
              resize_keyboard: true,
              one_time_keyboard: true
            }
          }
        );
        continue;
      }

      // Location
      if(msg.location && fromId){
        const lat = msg.location.latitude;
        const lng = msg.location.longitude;

        const v = DEFAULT_VENUE;
        const dist = haversineMeters(lat, lng, v.lat, v.lng);
        const allowed = dist <= v.radius;

        if(allowed){
          GEO_SESSIONS[String(fromId)] = {
            createdAt: Date.now(),
            allowedUntil: Date.now() + GEO_SESSION_TTL_MS,
            lat, lng,
            distanceMeters: Math.round(dist)
          };

          await tgSendMessage(chatId,
            "Дверь открыта.\nВернитесь в мини-апп.",
            WEBAPP_URL
              ? {
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: "Вернуться", web_app: { url: WEBAPP_URL } }]
                    ]
                  }
                }
              : {}
          );
        }else{
          await tgSendMessage(chatId,
            `Снаружи это не готовят.\nВы слишком далеко: примерно ${Math.round(dist)} м.`,
            {
              reply_markup: {
                keyboard: [
                  [{ text: "📍 Отправить геопозицию", request_location: true }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
              }
            }
          );
        }

        continue;
      }
    }
  }catch(e){
    // тихо
  }finally{
    setTimeout(pollUpdates, 800);
  }
}

pollUpdates();

// ================== START ==================
app.listen(PORT, ()=>{
  console.log("Server started on port", PORT);
  if(!BOT_TOKEN){
    console.log("⚠️ BOT_TOKEN is not set. Bot polling will not work.");
  }
});
