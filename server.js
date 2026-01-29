import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

// === НАСТРОЙКИ ===
const BOT_TOKEN = process.env.BOT_TOKEN;      // токен от BotFather
const MASTER_ID = Number(process.env.MASTER_ID); // твой Telegram ID

// Хранилище заказов (MVP)
let ORDERS = [];

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
function formatOrderMessage(order) {
  const a = order.answers;
  const guest = order.guest;

  return [
    "🕯 НОВЫЙ ЗАКАЗ",
    "",
    `Гость: ${guest.name}${guest.username ? " (@" + guest.username + ")" : ""}`,
    "",
    `Цвет: ${a.color}`,
    `Ощущение: ${a.mouthfeel}`,
    `Пауза: ${a.pause}`,
    `Скорость: ${a.speed}`,
    `Пространство: ${a.space}`,
    `Момент: ${a.moment}`,
    "",
    "⏱ Кальян готовится ~25 минут"
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

// Создание заказа
app.post("/order", async (req, res) => {
  const order = req.body;

  if (!order || !order.id || !order.answers || !order.guest) {
    return res.status(400).json({ ok: false, error: "bad_order" });
  }

  // статус по умолчанию
  if (!order.status) order.status = "accepted";

  ORDERS.push(order);

  // Ограничим память
  if (ORDERS.length > 200) ORDERS = ORDERS.slice(-200);

  // Уведомляем мастера
  try {
    const message = formatOrderMessage(order);
    await notifyMaster(message);
  } catch (e) {
    console.error("Telegram notify error", e);
  }

  res.json({ ok: true });
});

// Получение заказов
app.get("/orders", (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 200);
  res.json({
    ok: true,
    orders: ORDERS.slice(-limit)
  });
});

// Смена статуса заказа (id — строка!)
app.patch("/order/:id/status", async (req, res) => {
  const id = String(req.params.id);
  const { status } = req.body || {};

  if (!id || !status) {
    return res.status(400).json({ ok: false, error: "bad_request" });
  }

  const idx = ORDERS.findIndex(o => String(o.id) === id);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: "not_found" });
  }

  ORDERS[idx].status = status;
  res.json({ ok: true, order: ORDERS[idx] });
});

// === СТАРТ ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
