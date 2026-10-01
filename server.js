'use strict';

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const DATA_FILE = process.env.DATA_FILE || path.join(ROOT, 'data.json');
const MAX_BODY = 16 * 1024;
const EMOJIS = new Set(['❤️','😂','😮']);
const SUPER_PLANS = {20: 60_000, 35: 120_000, 80: 300_000};
const clients = new Set();
let saveTimer = null;

function id(prefix='id') { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return Date.now(); }
function sumReactions(m) { return Object.values(m.reactions || {}).reduce((a,b)=>a+Number(b||0),0); }
function cleanText(value, max) { return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0,max); }
function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store','content-length':Buffer.byteLength(body)});
  res.end(body);
}
function randomColor() {
  const colors=['#6f39dc','#ed5ba7','#3ecb80','#64a4ff','#c58470','#ffbd43','#27c8ce','#9c45ec'];
  return colors[Math.floor(Math.random()*colors.length)];
}
function makeSeedState(){
  const t = now();
  const seedReactors = (prefix, counts) => {
    const out={}; let n=0;
    for(const [emoji,count] of Object.entries(counts)) for(let i=0;i<count;i++) out[`${prefix}_${++n}`]=emoji;
    return out;
  };
  const m=(key,nickname,text,minAgo,reactions,hotMin=0)=>({
    id:key,nickname,text,authorId:`seed_${key}`,createdAt:t-minAgo*60_000,expiresAt:t+(12-minAgo)*60_000,
    hotUntil:hotMin?t+hotMin*60_000:null,reactions:{...reactions},reactors:seedReactors(key,reactions),avatarColor:randomColor()
  });
  return {
    users:[],
    messages:[
      m('m1','Lua','alguém sabe o que tá acontecendo na avenida?',1,{'❤️':18,'😂':12,'😮':32},3.2),
      m('m2','Coxinha','essa loja nova do centro vale a pena mesmo?',2,{'❤️':28,'😂':14,'😮':7},2.25),
      m('m3','NHraiz','gente, ouviram aquilo agora?',2,{'❤️':6,'😂':11,'😮':25},1.75),
      m('m4','Anônimo','tô passada',2,{'❤️':2,'😂':4,'😮':4}),
      m('m5','Solar','isso sempre acontece por aqui',3,{'❤️':4,'😂':2,'😮':1}),
      m('m6','Visitante','alguém sabe o motivo?',3,{'❤️':3,'😂':1,'😮':2}),
      m('m7','Coxinha','kkkkkkkk',4,{'❤️':2,'😂':6,'😮':0}),
      m('m8','NHraiz','não acredito',4,{'❤️':4,'😂':1,'😮':3}),
      m('m9','Anonimazinha','genteee',5,{'❤️':2,'😂':2,'😮':1}),
      m('m10','Tonhão','alguém tem foto?',5,{'❤️':3,'😂':0,'😮':5}),
      m('m11','Lua','é sério isso?',6,{'❤️':4,'😂':0,'😮':2}),
      m('m12','Cidadão','o centro tá complicado hoje',6,{'❤️':2,'😂':0,'😮':1}),
      m('m13','Anônimo','vish',7,{'❤️':1,'😂':2,'😮':1}),
      m('m14','Fofoqueira','tô indo lá ver',7,{'❤️':3,'😂':1,'😮':1})
    ],
    superchats:[
      {id:'s1',authorId:'seed',nickname:'Anônimo',text:'Alguém tem informações sobre o evento de sábado?',createdAt:t-20_000,expiresAt:t+60_000,tone:'purple'},
      {id:'s2',authorId:'seed',nickname:'CuriosoNH',text:'Procuro indicação de mecânico confiável!',createdAt:t-30_000,expiresAt:t+120_000,tone:'gold'},
      {id:'s3',authorId:'seed',nickname:'Fofocaeiro',text:'Qual a melhor pizza da cidade?',createdAt:t-45_000,expiresAt:t+170_000,tone:'pink'}
    ],
    reports:[]
  };
}

let state = loadData();
function loadData(){
  try { return JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); }
  catch { return makeSeedState(); }
}
function scheduleSave(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(async()=>{
    const tmp=`${DATA_FILE}.tmp`;
    await fsp.writeFile(tmp,JSON.stringify(state,null,2));
    await fsp.rename(tmp,DATA_FILE);
  },80);
}
function broadcast(type='state'){
  const payload=`event: ${type}\ndata: ${JSON.stringify({at:now()})}\n\n`;
  for(const res of clients){ try{res.write(payload);}catch{clients.delete(res);} }
}
function cleanup(){
  const t=now(); let changed=false;
  const m=state.messages.length,s=state.superchats.length;
  state.messages=state.messages.filter(x=>x.expiresAt>t);
  state.superchats=state.superchats.filter(x=>x.expiresAt>t);
  if(m!==state.messages.length||s!==state.superchats.length) changed=true;
  if(changed){scheduleSave();broadcast();}
}
function userByToken(token){ return state.users.find(u=>u.sessionToken===token && !u.banned); }
function authFrom(req, body){
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'') || body?.sessionToken;
  return token ? userByToken(token) : null;
}
function accrue(user){
  const t=now();
  user.lastSeenAt ||= t;
  user.lastCreditAt ||= t;
  // Only accrue if the previous activity heartbeat is recent, preventing offline farming.
  if(t-user.lastSeenAt <= 30_000 && t-user.lastCreditAt >= 120_000){
    const earned=Math.floor((t-user.lastCreditAt)/120_000);
    user.credits=Math.min(200,(user.credits||0)+earned);
    user.lastCreditAt += earned*120_000;
  }
  user.lastSeenAt=t;
}
function publicState(user){
  cleanup(); const t=now();
  const top=state.messages.filter(m=>m.hotUntil&&m.hotUntil>t).sort((a,b)=>sumReactions(b)-sumReactions(a)||b.hotUntil-a.hotUntil).slice(0,3).map(m=>m.id);
  const messages=state.messages.slice().sort((a,b)=>b.createdAt-a.createdAt).map(m=>({
    id:m.id,nickname:m.nickname,text:m.text,createdAt:m.createdAt,expiresAt:m.expiresAt,hotUntil:m.hotUntil,
    reactions:m.reactions||{},myReaction:user ? (m.reactors||{})[user.id]||null : null,avatarColor:m.avatarColor||'#6f39dc'
  }));
  return {
    now:t,
    credits:user?.credits ?? 0,
    nickname:user?.nickname ?? null,
    onlineCount:Math.max(1,state.users.filter(u=>!u.banned&&t-(u.lastSeenAt||0)<30_000).length),
    topIds:top,
    messages,
    superchats:state.superchats.slice().sort((a,b)=>b.createdAt-a.createdAt).map(s=>({id:s.id,nickname:s.nickname,text:s.text,createdAt:s.createdAt,expiresAt:s.expiresAt,tone:s.tone}))
  };
}
async function readBody(req){
  let size=0,chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw Object.assign(new Error('too_large'),{status:413});chunks.push(chunk);}
  if(!chunks.length)return {};
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(new Error('invalid_json'),{status:400});}
}

async function handleApi(req,res,url){
  if(req.method==='GET'&&url.pathname==='/api/events'){
    res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive','x-accel-buffering':'no'});
    res.write(`event: ready\ndata: {}\n\n`); clients.add(res); req.on('close',()=>clients.delete(res)); return;
  }
  const body = req.method==='POST' ? await readBody(req) : {};

  if(req.method==='POST'&&url.pathname==='/api/session'){
    let user=userByToken(body.sessionToken);
    if(!user){
      const nickname=cleanText(body.nickname,20)||'Anônimo';
      user={id:id('u'),sessionToken:crypto.randomBytes(24).toString('base64url'),nickname,credits:48,createdAt:now(),lastSeenAt:now(),lastCreditAt:now(),banned:false};
      state.users.push(user); scheduleSave(); broadcast();
    } else accrue(user);
    scheduleSave();
    return json(res,200,{sessionToken:user.sessionToken,userId:user.id,...publicState(user)});
  }

  const user=authFrom(req,body);
  if(!user) return json(res,401,{error:'Sessão inválida. Entre novamente.'});
  accrue(user);

  if(req.method==='GET'&&url.pathname==='/api/state'){ scheduleSave(); return json(res,200,publicState(user)); }
  if(req.method==='POST'&&url.pathname==='/api/presence'){ scheduleSave(); return json(res,200,{credits:user.credits,onlineCount:publicState(user).onlineCount}); }

  if(req.method==='POST'&&url.pathname==='/api/messages'){
    const text=cleanText(body.text,300); if(!text)return json(res,400,{error:'Escreva uma mensagem.'});
    const m={id:id('m'),authorId:user.id,nickname:user.nickname,text,createdAt:now(),expiresAt:now()+600_000,hotUntil:null,reactions:{'❤️':0,'😂':0,'😮':0},reactors:{},avatarColor:randomColor()};
    state.messages.push(m); scheduleSave(); broadcast(); return json(res,201,publicState(user));
  }

  if(req.method==='POST'&&url.pathname==='/api/reactions'){
    const emoji=String(body.emoji||''); if(!EMOJIS.has(emoji))return json(res,400,{error:'Reação inválida.'});
    const m=state.messages.find(x=>x.id===body.messageId&&x.expiresAt>now()); if(!m)return json(res,404,{error:'Essa mensagem já sumiu.'});
    m.reactors ||= {}; m.reactions ||= {'❤️':0,'😂':0,'😮':0};
    const prev=m.reactors[user.id];
    if(prev===emoji){m.reactions[emoji]=Math.max(0,(m.reactions[emoji]||0)-1);delete m.reactors[user.id];}
    else{
      if(prev)m.reactions[prev]=Math.max(0,(m.reactions[prev]||0)-1);
      m.reactions[emoji]=(m.reactions[emoji]||0)+1;m.reactors[user.id]=emoji;
      const unique=Object.keys(m.reactors).length;
      if(m.hotUntil&&m.hotUntil>now())m.hotUntil+=30_000;
      else if(unique>=2)m.hotUntil=now()+180_000;
    }
    scheduleSave();broadcast();return json(res,200,publicState(user));
  }

  if(req.method==='POST'&&url.pathname==='/api/superchats'){
    const cost=Number(body.cost),duration=SUPER_PLANS[cost],text=cleanText(body.text,180);
    if(!duration)return json(res,400,{error:'Plano inválido.'});
    if(!text)return json(res,400,{error:'Escreva a mensagem do Superchat.'});
    if(user.credits<cost)return json(res,400,{error:'Você ainda não tem créditos suficientes.'});
    user.credits-=cost;
    state.superchats.push({id:id('s'),authorId:user.id,nickname:user.nickname,text,createdAt:now(),expiresAt:now()+duration,tone:['purple','gold','pink'][Math.floor(Math.random()*3)]});
    scheduleSave();broadcast();return json(res,201,publicState(user));
  }

  return json(res,404,{error:'Rota não encontrada.'});
}

const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.json':'application/json; charset=utf-8'};
async function serveStatic(req,res,url){
  let rel=decodeURIComponent(url.pathname); if(rel==='/')rel='/index.html';
  const file=path.resolve(ROOT,'.'+rel);
  if(!file.startsWith(ROOT+path.sep))return json(res,403,{error:'forbidden'});
  try{
    const stat=await fsp.stat(file); if(!stat.isFile())throw new Error('not file');
    res.writeHead(200,{'content-type':MIME[path.extname(file)]||'application/octet-stream','cache-control':path.extname(file)==='.html'?'no-cache':'public, max-age=3600'});
    fs.createReadStream(file).pipe(res);
  }catch{json(res,404,{error:'not_found'});}
}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
    if(url.pathname.startsWith('/api/'))await handleApi(req,res,url); else await serveStatic(req,res,url);
  }catch(err){console.error(err);json(res,err.status||500,{error:err.status?'Requisição inválida.':'Erro interno.'});}
});
setInterval(cleanup,1000).unref();
setInterval(()=>{for(const res of clients){try{res.write(`: ping ${now()}\n\n`);}catch{clients.delete(res);}}},15_000).unref();
server.listen(PORT,HOST,()=>console.log(`FofocaNH rodando em http://localhost:${PORT}`));
