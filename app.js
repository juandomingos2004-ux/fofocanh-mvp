(() => {
  const SESSION_KEY='fofocanh.session.v2';
  const EMOJIS=['❤️','😂','😮'];
  const $=s=>document.querySelector(s);
  const els={online:$('#onlineCount'),credits:$('#creditsValue'),hot:$('#hotGrid'),supers:$('#superCarousel'),chat:$('#chatList'),form:$('#messageForm'),input:$('#messageInput'),emoji:$('#emojiButton'),creditsButton:$('#creditsButton'),identityModal:$('#identityModal'),identityForm:$('#identityForm'),nickname:$('#nicknameInput'),anon:$('#anonButton'),superModal:$('#superchatModal'),superForm:$('#superchatForm'),superInput:$('#superchatInput'),modalCredits:$('#modalCredits'),toast:$('#toast'),planGrid:$('#planGrid'),closeSuper:$('#closeSuper')};
  let sessionToken=localStorage.getItem(SESSION_KEY)||'';
  let state={messages:[],superchats:[],topIds:[],credits:0,onlineCount:1,now:Date.now()};
  let eventSource=null,clockOffset=0,pollTimer=null,presenceTimer=null;
  const esc=(s='')=>String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
  const serverNow=()=>Date.now()+clockOffset;
  const timeLeft=ms=>{const n=Math.max(0,Math.ceil(ms/1000));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};
  const clock=ts=>new Date(ts).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});

  async function api(path,options={}){
    const headers={'content-type':'application/json',...(options.headers||{})};
    if(sessionToken)headers.authorization=`Bearer ${sessionToken}`;
    const r=await fetch(path,{...options,headers});
    const data=await r.json().catch(()=>({error:'Resposta inválida do servidor.'}));
    if(!r.ok)throw new Error(data.error||'Não foi possível concluir.');
    return data;
  }
  function applyState(data){
    if(!data)return;
    if(data.now)clockOffset=data.now-Date.now();
    state={...state,...data};render();
  }
  async function createOrResume(nickname){
    const data=await api('/api/session',{method:'POST',body:JSON.stringify({sessionToken,nickname})});
    sessionToken=data.sessionToken;localStorage.setItem(SESSION_KEY,sessionToken);applyState(data);connectEvents();startHeartbeat();return data;
  }
  async function refresh(){
    if(!sessionToken)return;
    try{applyState(await api('/api/state'));}catch(e){ if(/Sessão inválida/.test(e.message)){localStorage.removeItem(SESSION_KEY);sessionToken='';openIdentity();} }
  }
  function render(){
    els.credits.textContent=state.credits??0;els.modalCredits.textContent=state.credits??0;els.online.textContent=state.onlineCount??1;renderHot();renderSupers();renderChat();
  }
  function renderHot(){
    const byId=new Map((state.messages||[]).map(m=>[m.id,m]));
    const list=(state.topIds||[]).map(id=>byId.get(id)).filter(Boolean).slice(0,3);
    els.hot.innerHTML=list.length?list.map((m,i)=>`<article class="hot-card rank-${i+1}" data-message-id="${m.id}"><div class="hot-meta"><span class="rank-badge">${i+1}º</span><span class="hot-timer">${timeLeft(m.hotUntil-serverNow())}</span></div><div class="hot-text">${esc(m.text)}</div><div class="hot-reactions">${EMOJIS.map(e=>`<span>${e} ${m.reactions?.[e]||0}</span>`).join('')}</div></article>`).join(''):'<div class="empty" style="grid-column:1/-1">Nada bombando agora.</div>';
  }
  function renderSupers(){
    els.supers.innerHTML=(state.superchats||[]).length?state.superchats.map(s=>`<article class="super-card ${s.tone||'purple'}"><div class="super-head"><span class="super-user"><span class="super-crown">👑</span>${esc(s.nickname)}</span><span class="super-time">${timeLeft(s.expiresAt-serverNow())}</span></div><div class="super-text">${esc(s.text)}</div></article>`).join(''):'<div class="empty">Nenhum Superchat ativo.</div>';
  }
  function renderChat(){
    els.chat.innerHTML=(state.messages||[]).length?state.messages.map(m=>`<article class="chat-row"><div class="avatar" style="background:${m.avatarColor||'#6f39dc'}">${esc((m.nickname||'?').slice(0,1).toUpperCase())}</div><div class="chat-main"><div class="chat-line"><span class="chat-user">${esc(m.nickname)}</span><span class="chat-text">${esc(m.text)}</span></div></div><time class="chat-time">${clock(m.createdAt)}</time><div class="reaction-strip">${EMOJIS.map(e=>`<button class="reaction-button${m.myReaction===e?' active':''}" type="button" data-react="${e}" data-id="${m.id}">${e} ${m.reactions?.[e]||0}</button>`).join('')}</div></article>`).join(''):'<div class="empty">A conversa está quieta. Puxe assunto.</div>';
  }
  function toast(msg){els.toast.textContent=msg;els.toast.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>els.toast.classList.remove('show'),2200);}
  function openIdentity(){if(!els.identityModal.open)els.identityModal.showModal();}
  function connectEvents(){
    if(eventSource)eventSource.close();eventSource=new EventSource('/api/events');
    eventSource.addEventListener('state',()=>refresh());eventSource.addEventListener('ready',()=>refresh());
    eventSource.onerror=()=>{clearTimeout(pollTimer);pollTimer=setTimeout(refresh,4000);};
  }
  function startHeartbeat(){
    clearInterval(presenceTimer);presenceTimer=setInterval(async()=>{try{const p=await api('/api/presence',{method:'POST',body:'{}'});state.credits=p.credits;state.onlineCount=p.onlineCount;render();}catch{}},10_000);
  }
  async function sendMessage(text){
    text=text.trim();if(!text)return;try{applyState(await api('/api/messages',{method:'POST',body:JSON.stringify({text})}));els.input.value='';}catch(e){toast(e.message);}
  }
  async function react(id,emoji){try{applyState(await api('/api/reactions',{method:'POST',body:JSON.stringify({messageId:id,emoji})}));}catch(e){toast(e.message);}}
  async function sendSuper(text,cost){try{applyState(await api('/api/superchats',{method:'POST',body:JSON.stringify({text,cost})}));els.superInput.value='';els.superModal.close();toast('Superchat publicado.');}catch(e){toast(e.message);}}

  els.form.addEventListener('submit',e=>{e.preventDefault();if(!sessionToken)return openIdentity();sendMessage(els.input.value);});
  els.chat.addEventListener('click',e=>{const b=e.target.closest('[data-react]');if(b)react(b.dataset.id,b.dataset.react);});
  els.emoji.addEventListener('click',()=>{els.input.value+=['😂','👀','😮','🔥','🤔'][Math.floor(Math.random()*5)];els.input.focus();});
  els.creditsButton.addEventListener('click',()=>{if(!sessionToken)return openIdentity();els.modalCredits.textContent=state.credits;els.superModal.showModal();});
  els.planGrid.addEventListener('change',()=>document.querySelectorAll('.plan').forEach(p=>p.classList.toggle('selected',p.querySelector('input').checked)));
  els.superForm.addEventListener('submit',e=>{e.preventDefault();const cost=Number(new FormData(els.superForm).get('plan'));sendSuper(els.superInput.value,cost);});
  els.closeSuper.addEventListener('click',()=>els.superModal.close());
  els.identityForm.addEventListener('submit',async e=>{e.preventDefault();try{await createOrResume(els.nickname.value.trim()||'Anônimo');els.identityModal.close();}catch(err){toast(err.message);}});
  els.anon.addEventListener('click',async()=>{try{await createOrResume('Anônimo');els.identityModal.close();}catch(err){toast(err.message);}});
  setInterval(()=>{renderHot();renderSupers();},1000);
  setInterval(refresh,15_000);

  (async()=>{if(sessionToken){try{await createOrResume();return;}catch{localStorage.removeItem(SESSION_KEY);sessionToken='';}}openIdentity();render();})();
})();
