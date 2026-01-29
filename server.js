import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const MASTER_ID = Number(process.env.MASTER_ID);

let ORDERS = [];

async function notifyMaster(text){
  if(!BOT_TOKEN||!MASTER_ID)return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{
    method:"POST",
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:MASTER_ID,text})
  });
}

app.get("/",(_,res)=>res.send("OK"));

app.post("/order",async(req,res)=>{
  const o=req.body;
  if(!o?.id)return res.status(400).json({ok:false});
  ORDERS.push(o);
  notifyMaster("🕯 Новый заказ от "+o.guest.name);
  res.json({ok:true});
});

app.get("/orders",(req,res)=>{
  res.json({ok:true,orders:ORDERS});
});

app.patch("/order/:id/status",(req,res)=>{
  const {id}=req.params;
  const {status}=req.body;
  const o=ORDERS.find(o=>o.id===id);
  if(!o)return res.status(404).json({ok:false});
  o.status=status;
  res.json({ok:true});
});

app.listen(process.env.PORT||3000);
