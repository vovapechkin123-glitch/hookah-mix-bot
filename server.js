import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const MASTER_ID = Number(process.env.MASTER_ID);

let ORDERS = [];

async function notify(text){
  if(!BOT_TOKEN || !MASTER_ID) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{
    method:"POST",
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:MASTER_ID,text})
  });
}

app.post("/order", async (req,res)=>{
  const o=req.body;
  ORDERS.push(o);
  await notify(`🕯 Новый заказ\nГость: ${o.guest.name}`);
  res.json({ok:true});
});

app.get("/orders",(req,res)=>{
  const now=Date.now();
  ORDERS=ORDERS.filter(o=>o.status!=="finished"||now-o.start<5*60*1000);
  res.json({ok:true,orders:ORDERS});
});

app.patch("/order/:id/status",(req,res)=>{
  const id=Number(req.params.id);
  const o=ORDERS.find(x=>x.id===id);
  if(o) o.status=req.body.status;
  res.json({ok:true});
});

app.listen(process.env.PORT||3000);
