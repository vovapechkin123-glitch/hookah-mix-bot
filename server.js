import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const MASTER_ID = Number(process.env.MASTER_ID);

let ORDERS = [];

function formatOrderMessage(order) {
  const a = order.answers;
  const g = order.guest;
  return [
    "🕯 НОВЫЙ МОМЕНТ",
    "",
    `Гость: ${g.name}${g.username ? " (@" + g.username + ")" : ""}`,
    "",
    `Цвет: ${a.color}`,
    `Ощущение: ${a.mouthfeel}`,
    `Пауза: ${a.pause}`,
    `Скорость: ${a.speed}`,
    `Пространство: ${a.space}`,
    `Момент: ${a.moment}`,
    "",
    "Статус: Момент зафиксирован"
  ].join("\n");
}

async function notifyMaster(text) {
  if (!BOT_TOKEN || !MASTER_ID) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: MASTER_ID, text })
  });
}

app.get("/", (_, res) => res.send("OK"));

app.post("/order", async (req, res) => {
  const order = req.body;
  if (!order?.id) return res.status(400).json({ ok: false });

  order.status = "accepted";
  ORDERS.push(order);
  ORDERS = ORDERS.slice(-200);

  try {
    await notifyMaster(formatOrderMessage(order));
  } catch {}

  res.json({ ok: true });
});

app.get("/orders", (req, res) => {
  res.json({ ok: true, orders: ORDERS });
});

app.patch("/order/:id/status", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const order = ORDERS.find(o => String(o.id) === id);
  if (!order) return res.status(404).json({ ok: false });

  order.status = status;
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server started on", PORT));
