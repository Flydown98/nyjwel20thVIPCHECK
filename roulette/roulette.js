'use strict';

const CONFIG=window.NYJ20_CONFIG||{};
const API_URL=String(CONFIG.appsScriptUrl||'').trim();
const STORAGE=Object.freeze({
  TOKEN:'nyj20_admin_session_token_v3',
  EXPIRES:'nyj20_admin_session_expires_v3',
  STATION:'nyj20_admin_station_v3'
});
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const session={
  token:localStorage.getItem(STORAGE.TOKEN)||'',
  expiresAt:localStorage.getItem(STORAGE.EXPIRES)||'',
  station:localStorage.getItem(STORAGE.STATION)||'마블룰렛'
};
const state={
  data:null,selectedPrizeNo:1,selectedImage:'',editorPrizeNo:1,
  editorImageAction:'keep',editorImageData:'',plan:null,running:false,
  animationId:null,marbles:[],finished:[],elapsed:0,lastFrame:0,speed:1,
  pendingCommitToken:'',lastResult:null
};

function validApi(){return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/i.test(API_URL)}
function sessionValid(){return Boolean(session.token&&session.expiresAt&&new Date(session.expiresAt).getTime()>Date.now())}
function escapeHtml(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
function toast(msg,d=3300){const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.add('hidden'),d)}
function formatTime(v){if(!v)return'-';const d=new Date(v);return Number.isNaN(d.getTime())?'-':new Intl.DateTimeFormat('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d)}
function createRequestId(){const b=new Uint8Array(18);if(crypto?.getRandomValues){crypto.getRandomValues(b);return 'rlt_'+[...b].map(x=>x.toString(16).padStart(2,'0')).join('')}return 'rlt_'+Date.now()+'_'+Math.random().toString(36).slice(2)}

function bridgeRequest(action,payload={}){
  return new Promise((resolve,reject)=>{
    if(!validApi())return reject(new Error('Apps Script 연결주소를 확인해 주세요.'));
    if(!session.token)return reject(new Error('관리자 로그인이 필요합니다.'));
    const requestId=createRequestId();
    const frameName='roulette_bridge_'+requestId.replace(/[^A-Za-z0-9_]/g,'');
    const iframe=document.createElement('iframe');iframe.name=frameName;iframe.style.display='none';
    const form=document.createElement('form');form.method='POST';form.action=API_URL;form.target=frameName;form.style.display='none';form.acceptCharset='UTF-8';
    const fields={bridge:'1',requestId,action,token:session.token,station:session.station||'마블룰렛',payload:JSON.stringify(payload)};
    Object.entries(fields).forEach(([k,v])=>{const i=document.createElement('input');i.type='hidden';i.name=k;i.value=String(v??'');form.appendChild(i)});
    document.body.append(iframe,form);
    let done=false,script=null,cbName='';
    const deadline=Date.now()+(Number(CONFIG.requestTimeoutMs)||25000);
    const clearScript=()=>{if(script)script.remove();script=null;if(cbName){try{delete window[cbName]}catch(_){window[cbName]=undefined}}cbName=''};
    const cleanup=()=>{if(done)return;done=true;clearScript();form.remove();setTimeout(()=>iframe.remove(),60)};
    const fail=e=>{cleanup();reject(e instanceof Error?e:new Error(String(e||'서버 오류')))};
    const poll=()=>{
      if(done)return;if(Date.now()>deadline)return fail(new Error('서버 응답 시간이 초과되었습니다.'));
      clearScript();cbName='__roulette_poll_'+Date.now()+'_'+Math.random().toString(36).slice(2);
      const u=new URL(API_URL);u.searchParams.set('action','bridgePoll');u.searchParams.set('requestId',requestId);u.searchParams.set('callback',cbName);u.searchParams.set('_',Date.now());
      script=document.createElement('script');window[cbName]=res=>{clearScript();if(res?.pending===true)return setTimeout(poll,220);if(!res||res.ok!==true)return fail(new Error(res?.error||'서버 오류가 발생했습니다.'));cleanup();resolve(res.data)};script.onerror=()=>{clearScript();setTimeout(poll,350)};script.src=u.toString();document.head.appendChild(script)
    };
    try{form.submit();setTimeout(poll,180)}catch(e){fail(new Error('서버에 요청을 보내지 못했습니다.'))}
  })
}

async function api(action,payload={}){
  try{return await bridgeRequest(action,payload)}catch(e){if(/로그인|만료/.test(e.message||''))showLoginGate();throw e}
}
function showLoginGate(){$('#loadingOverlay').classList.add('hidden');$('#loginGate').classList.remove('hidden')}
function setLoading(show,text=''){if(text)$('#loadingText').textContent=text;$('#loadingOverlay').classList.toggle('hidden',!show)}
function currentPrize(){return state.data?.prizes?.find(p=>p.prizeNo===state.selectedPrizeNo)||null}
function participantById(id){return state.data?.participants?.find(p=>p.id===id)||null}

async function loadBootstrap({quiet=false}={}){
  if(!quiet)setLoading(true,'도착 참가자와 상품 정보를 불러오는 중입니다.');
  try{
    const data=await api('rouletteBootstrap');state.data=data;
    $('#connectionBadge').textContent='연결됨 · '+formatTime(data.serverTime);$('#connectionBadge').className='status-badge ok';
    renderAll();
  }finally{if(!quiet)setLoading(false)}
}

function renderAll(){
  $('#arrivedCount').textContent=(state.data?.arrivedCount||0).toLocaleString();
  $('#eligibleCount').textContent=(state.data?.eligibleCount||0).toLocaleString();
  $('#excludedCount').textContent=(state.data?.excludedWinnerCount||0).toLocaleString();
  renderPrizeSlots();renderSelectedPrize();renderHistory();renderEditorSlots();
}
function renderPrizeSlots(){
  const host=$('#prizeSlots');if(!state.data)return;
  host.innerHTML=state.data.prizes.map(p=>`<button type="button" class="prize-slot ${p.prizeNo===state.selectedPrizeNo?'active':''} ${!p.active||p.remaining<1?'disabled':''}" data-prize="${p.prizeNo}"><strong>${p.prizeNo}번</strong><small>${escapeHtml(p.prizeName||'미설정')}</small></button>`).join('');
}
async function selectPrize(no){state.selectedPrizeNo=Number(no);state.selectedImage='';renderPrizeSlots();renderSelectedPrize();const p=currentPrize();if(p?.hasImage){try{const r=await api('roulettePrizeImage',{prizeNo:p.prizeNo});if(state.selectedPrizeNo===p.prizeNo){state.selectedImage=r.imageDataUrl||'';renderSelectedPrize()}}catch(_){}}}
function renderSelectedPrize(){
  const p=currentPrize(),img=$('#selectedPrizeImage');img.innerHTML=state.selectedImage?`<img src="${state.selectedImage}" alt="" />`:'<span>사진</span>';
  if(!p){$('#selectedPrizeNumber').textContent='상품 선택';$('#selectedPrizeName').textContent='사용할 상품을 선택하세요.';$('#selectedPrizeStock').textContent='남은 수량 -';return}
  $('#selectedPrizeNumber').textContent=`상품 ${p.prizeNo}번`;$('#selectedPrizeName').textContent=p.prizeName||'미설정';$('#selectedPrizeStock').textContent=`총 ${p.quantity}개 · 추첨완료 ${p.drawnCount}개 · 남음 ${p.remaining}개`;
  $('#winnerCount').max=Math.max(1,p.remaining);if(Number($('#winnerCount').value)>p.remaining)$('#winnerCount').value=Math.max(1,p.remaining);
  $('#racePrizeNo').textContent=`상품 ${p.prizeNo}번`;$('#racePrizeName').textContent=p.prizeName||'마블룰렛';
  updateStartEnabled();
}
function updateStartEnabled(){const p=currentPrize(),cnt=Number($('#winnerCount').value)||0,pool=state.data?.eligibleCount||0;$('#startDrawButton').disabled=state.running||!p||!p.active||p.remaining<1||cnt<1||cnt>p.remaining||cnt>pool}

function renderHistory(){
  const host=$('#drawHistory'),rows=state.data?.history||[];
  if(!rows.length){host.innerHTML='<p class="empty-copy">추첨 기록이 없습니다.</p>';return}
  host.innerHTML=rows.map(r=>`<article class="history-item ${r.active?'':'cancelled'}"><div class="history-head"><strong>${r.prizeNo}번 · ${escapeHtml(r.prizeName)}</strong><span>${formatTime(r.drawnAt)}</span></div><div class="history-winners">${r.active?'당첨':'취소'} · ${r.winnerMode==='last'?'꼴찌':'1등'} 기준 · ${r.winners.map(w=>escapeHtml(w.seat)).join(', ')}</div>${r.active?`<button class="history-cancel" type="button" data-undo-draw="${escapeHtml(r.drawId)}">추첨 취소</button>`:''}</article>`).join('')
}
function renderEditorSlots(){const host=$('#editorPrizeSlots');if(!state.data)return;host.innerHTML=state.data.prizes.map(p=>`<button type="button" class="prize-slot ${p.prizeNo===state.editorPrizeNo?'active':''}" data-editor-prize="${p.prizeNo}"><strong>${p.prizeNo}</strong><small>${escapeHtml(p.prizeName||'미설정')}</small></button>`).join('')}
async function loadEditorPrize(no){state.editorPrizeNo=Number(no);state.editorImageAction='keep';state.editorImageData='';renderEditorSlots();const p=state.data.prizes.find(x=>x.prizeNo===state.editorPrizeNo);$('#editorPrizeNo').value=p.prizeNo;$('#editorPrizeName').value=p.prizeName||'';$('#editorPrizeQuantity').value=p.quantity||0;$('#editorPrizeNote').value=p.note||'';$('#editorPrizeActive').checked=Boolean(p.active);$('#editorPrizeImage').value='';$('#editorStockInfo').textContent=`이미 추첨된 수량 ${p.drawnCount}개 · 현재 남은 수량 ${p.remaining}개`;const preview=$('#editorPreview');preview.innerHTML='<span>상품사진</span>';if(p.hasImage){try{const r=await api('roulettePrizeImage',{prizeNo:p.prizeNo});if(state.editorPrizeNo===p.prizeNo&&r.imageDataUrl){state.editorImageData=r.imageDataUrl;preview.innerHTML=`<img src="${r.imageDataUrl}" alt="" />`}}catch(_){}}}

async function compressImage(file){
  const url=URL.createObjectURL(file);try{const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url});let max=420,q=.82;for(let attempt=0;attempt<12;attempt++){const scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));const w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);const data=c.toDataURL('image/jpeg',q);if(data.length<=44000)return data;q-=.09;if(q<.45){q=.72;max=Math.round(max*.82)}}throw new Error('사진을 충분히 줄이지 못했습니다. 다른 사진을 사용해 주세요.')}finally{URL.revokeObjectURL(url)}}

async function savePrize(e){e.preventDefault();const button=e.currentTarget.querySelector('button[type=submit]');button.disabled=true;try{const p=state.data.prizes.find(x=>x.prizeNo===state.editorPrizeNo);const payload={prizeNo:state.editorPrizeNo,prizeName:$('#editorPrizeName').value.trim(),quantity:Number($('#editorPrizeQuantity').value)||0,active:$('#editorPrizeActive').checked,note:$('#editorPrizeNote').value.trim(),imageAction:state.editorImageAction};if(state.editorImageAction==='replace')payload.imageDataUrl=state.editorImageData;await api('saveRoulettePrize',payload);toast(`${state.editorPrizeNo}번 상품을 저장했습니다.`);await loadBootstrap({quiet:true});await selectPrize(state.editorPrizeNo);await loadEditorPrize(state.editorPrizeNo)}catch(err){toast(err.message,5200)}finally{button.disabled=false}}

function winnerMode(){return document.querySelector('input[name=winnerMode]:checked')?.value==='last'?'last':'first'}
async function startDraw(){
  const p=currentPrize(),winnerCount=Math.max(1,Number($('#winnerCount').value)||1);if(!p||!p.active)return toast('사용할 상품을 선택하세요.');if(!state.data?.eligibleCount)return toast('현재 추첨 가능한 도착 참가자가 없습니다.');if(winnerCount>p.remaining)return toast('상품 남은 수량을 확인해 주세요.');if(winnerCount>state.data.eligibleCount)return toast('당첨 인원이 추첨 대상보다 많습니다.');
  const mode=winnerMode(),desc=mode==='last'?`마지막 ${winnerCount}명`:`먼저 도착한 ${winnerCount}명`;if(!confirm(`${p.prizeName}\n\n현재 추첨 대상 ${state.data.eligibleCount}명 중 ${desc}을 당첨 처리합니다.\n추첨을 시작할까요?`))return;
  setLoading(true,'현재 도착자 기준으로 무작위 추첨 순서를 준비하고 있습니다.');
  try{await loadBootstrap({quiet:true});const fresh=currentPrize();if(!fresh||fresh.remaining<winnerCount)throw new Error('상품 수량이 변경되었습니다. 다시 확인해 주세요.');const plan=await api('prepareRouletteRound',{prizeNo:fresh.prizeNo,winnerCount,winnerMode:mode});state.plan=plan;state.pendingCommitToken=plan.roundToken;prepareRace(plan);setLoading(false);runRace()}catch(err){setLoading(false);toast(err.message,5500)}
}

function hashString(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function seeded01(seed,n){let x=(seed+Math.imul(n+1,2654435761))>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967295}
function resizeCanvas(){const c=$('#rouletteCanvas'),dpr=Math.min(2,devicePixelRatio||1),w=innerWidth,h=innerHeight;c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);c.style.width=w+'px';c.style.height=h+'px';const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0)}
function prepareRace(plan){
  resizeCanvas();const w=innerWidth,h=innerHeight,trackLeft=Math.min(410,w*.38),trackRight=w-20,usable=Math.max(250,trackRight-trackLeft),count=plan.ranking.length;state.marbles=plan.ranking.map((r,i)=>{const seed=hashString(r.id+r.seat),radius=count<=55?12:count<=130?8.5:6;return{...r,seed,radius,baseX:trackLeft+radius+seeded01(seed,1)*(usable-radius*2),phase:seeded01(seed,2)*Math.PI*2,freq:3+seeded01(seed,3)*5,amp:18+seeded01(seed,4)*Math.min(70,usable*.1),finishAt:4700+i*Math.max(28,Math.min(80,6000/Math.max(1,count))),done:false}});state.finished=[];state.elapsed=0;state.lastFrame=performance.now();state.running=true;$('#controlPanel').classList.add('race-mode');$('#abortDrawButton').classList.remove('hidden');$('#startDrawButton').classList.add('hidden');$('#rankTicker').innerHTML='';$('#raceStatus').textContent=`${count}개 좌석 출발 준비 · ${plan.winnerMode==='last'?'꼴찌':'1등'} 기준 ${plan.winnerCount}명 당첨`;updateStartEnabled();drawFrame()}
function runRace(){cancelAnimationFrame(state.animationId);state.lastFrame=performance.now();state.animationId=requestAnimationFrame(tickRace)}
function tickRace(now){if(!state.running)return;const dt=Math.min(60,now-state.lastFrame);state.lastFrame=now;state.elapsed+=dt*state.speed;const plan=state.plan;for(const m of state.marbles){if(!m.done&&state.elapsed>=m.finishAt){m.done=true;state.finished.push(m);appendRank(m);if(plan.winnerMode==='first'&&state.finished.length>=plan.winnerCount){state.running=false;drawFrame();setTimeout(finalizeRace,650);return}}}if(plan.winnerMode==='last'&&state.finished.length>=state.marbles.length){state.running=false;drawFrame();setTimeout(finalizeRace,650);return}drawFrame();state.animationId=requestAnimationFrame(tickRace)}
function appendRank(m){const host=$('#rankTicker');const row=document.createElement('div');row.className='rank-row';row.innerHTML=`<b>#${m.rank}</b><span>${escapeHtml(m.seat)}</span>`;host.prepend(row);while(host.children.length>10)host.lastElementChild.remove();$('#raceStatus').textContent=`결승선 통과 ${state.finished.length} / ${state.marbles.length}`}
function drawFrame(){
  const c=$('#rouletteCanvas'),ctx=c.getContext('2d'),w=innerWidth,h=innerHeight,trackLeft=Math.min(410,w*.38),trackRight=w-20,top=92,finishY=h-72;ctx.clearRect(0,0,w,h);const g=ctx.createLinearGradient(trackLeft,0,trackRight,h);g.addColorStop(0,'rgba(30,37,78,.9)');g.addColorStop(1,'rgba(6,8,14,.96)');ctx.fillStyle=g;ctx.fillRect(trackLeft,0,trackRight-trackLeft,h);
  ctx.strokeStyle='rgba(255,255,255,.08)';ctx.lineWidth=1;const cols=Math.max(5,Math.floor((trackRight-trackLeft)/85));for(let row=0;row<8;row++){const y=150+row*((finishY-180)/8),offset=(row%2)*36;for(let col=0;col<cols;col++){const x=trackLeft+55+col*85+offset;if(x>trackRight-28)continue;ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.12)';ctx.fill()}}
  ctx.strokeStyle='#d7b45e';ctx.lineWidth=3;ctx.setLineDash([10,8]);ctx.beginPath();ctx.moveTo(trackLeft+12,finishY);ctx.lineTo(trackRight-12,finishY);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#d7b45e';ctx.font='900 11px sans-serif';ctx.fillText('FINISH',trackLeft+18,finishY-9);
  const active=state.marbles.filter(m=>!m.done);for(const m of active){const p=Math.max(0,Math.min(1,state.elapsed/m.finishAt));const eased=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;const x=Math.max(trackLeft+m.radius+6,Math.min(trackRight-m.radius-6,m.baseX+Math.sin(p*m.freq*Math.PI*2+m.phase)*m.amp+Math.sin(p*24+m.phase)*8));const y=top+(finishY-top-8)*eased;const hue=(m.seed%300)+20;ctx.beginPath();ctx.arc(x,y,m.radius,0,Math.PI*2);const rg=ctx.createRadialGradient(x-m.radius*.35,y-m.radius*.4,1,x,y,m.radius);rg.addColorStop(0,`hsl(${hue} 95% 78%)`);rg.addColorStop(.55,`hsl(${hue} 85% 56%)`);rg.addColorStop(1,`hsl(${hue} 80% 34%)`);ctx.fillStyle=rg;ctx.fill();ctx.strokeStyle='rgba(255,255,255,.45)';ctx.lineWidth=1;ctx.stroke();if(m.radius>=8){ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`900 ${Math.max(7,m.radius*.65)}px sans-serif`;ctx.fillText(m.seat.split('-')[1]||m.seat,x,y)}}
  ctx.textAlign='left';ctx.textBaseline='alphabetic';
}
function abortRace(){if(!state.running)return;if(!confirm('현재 추첨을 중단할까요?\n중단한 추첨은 당첨 결과로 저장되지 않습니다.'))return;state.running=false;cancelAnimationFrame(state.animationId);state.plan=null;state.pendingCommitToken='';$('#controlPanel').classList.remove('race-mode');$('#abortDrawButton').classList.add('hidden');$('#startDrawButton').classList.remove('hidden');$('#raceStatus').textContent='추첨이 중단되었습니다. 다시 시작할 수 있습니다.';drawFrame();updateStartEnabled()}

async function finalizeRace(){
  const plan=state.plan;if(!plan)return;const plannedWinners=plan.winnerMode==='last'?plan.ranking.slice(-plan.winnerCount):plan.ranking.slice(0,plan.winnerCount);showResultPreview(plan,plannedWinners);await commitCurrentRound()
}
function showResultPreview(plan,winnerRows){const p=currentPrize();$('#resultPrizeName').textContent=plan.prize.prizeName;$('#resultSummary').textContent=`${plan.poolCount}명 중 ${plan.winnerMode==='last'?'꼴찌':'1등'} 기준 ${plan.winnerCount}명 당첨`;const host=$('#winnerList');host.innerHTML=winnerRows.map(row=>{const person=participantById(row.id);return`<div class="winner-item"><span class="winner-rank">#${row.rank}</span><div><strong>${escapeHtml(person?.name||'확인 중')}</strong><small>${escapeHtml(person?.organization||'')}</small></div><span class="winner-seat">${escapeHtml(row.seat)}</span></div>`}).join('');const img=$('#resultPrizeImage');if(state.selectedImage){img.innerHTML=`<img src="${state.selectedImage}" alt="" />`;img.classList.remove('hidden')}else img.classList.add('hidden');$('#resultSaveStatus').className='result-save-status';$('#resultSaveStatus').textContent='당첨 결과를 저장하고 있습니다.';$('#retryCommitButton').classList.add('hidden');$('#resultModal').classList.remove('hidden');makeConfetti()}
async function commitCurrentRound(){if(!state.pendingCommitToken)return;try{const res=await api('commitRouletteRound',{roundToken:state.pendingCommitToken});state.lastResult=res.draw;state.pendingCommitToken='';$('#resultSaveStatus').className='result-save-status ok';$('#resultSaveStatus').textContent='✓ 당첨 결과 저장 완료 · 기존 QR 당첨확인과 자동 연동되었습니다.';if(res.bootstrap)state.data=res.bootstrap;renderAll()}catch(err){$('#resultSaveStatus').className='result-save-status error';$('#resultSaveStatus').textContent='결과 저장 실패: '+err.message;$('#retryCommitButton').classList.remove('hidden')}}
function closeResult(){if(state.pendingCommitToken){toast('결과 저장이 완료되지 않았습니다. 다시 저장해 주세요.',4500);return}$('#resultModal').classList.add('hidden');$('#controlPanel').classList.remove('race-mode');$('#abortDrawButton').classList.add('hidden');$('#startDrawButton').classList.remove('hidden');state.plan=null;state.running=false;$('#raceStatus').textContent='다음 추첨을 준비할 수 있습니다.';updateStartEnabled()}
function makeConfetti(){const host=$('#resultConfetti');host.innerHTML='';for(let i=0;i<60;i++){const el=document.createElement('i');el.className='confetti';el.style.left=(Math.random()*100)+'%';el.style.background=`hsl(${Math.random()*360} 85% 60%)`;el.style.setProperty('--dx',(Math.random()*240-120)+'px');el.style.animationDelay=(Math.random()*.7)+'s';host.appendChild(el)}setTimeout(()=>host.innerHTML='',3600)}

async function undoDraw(drawId){if(!confirm('이 마블룰렛 추첨 결과를 취소할까요?\n상품 수령완료된 당첨자가 있으면 취소할 수 없습니다.'))return;setLoading(true,'추첨 결과를 취소하고 있습니다.');try{state.data=await api('undoRouletteDraw',{drawId});renderAll();toast('추첨 결과를 취소했습니다.')}catch(err){toast(err.message,5200)}finally{setLoading(false)}}

function bind(){
  $('#refreshButton').addEventListener('click',()=>loadBootstrap().catch(e=>toast(e.message,5000)));
  $('#prizeSlots').addEventListener('click',e=>{const b=e.target.closest('[data-prize]');if(b)selectPrize(b.dataset.prize)});
  $('#openPrizeSettingsButton').addEventListener('click',()=>{$('#prizeSettingsModal').classList.remove('hidden');loadEditorPrize(state.selectedPrizeNo)});
  $$('[data-close]').forEach(b=>b.addEventListener('click',()=>$('#'+b.dataset.close).classList.add('hidden')));
  $('#editorPrizeSlots').addEventListener('click',e=>{const b=e.target.closest('[data-editor-prize]');if(b)loadEditorPrize(b.dataset.editorPrize)});
  $('#editorPrizeImage').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{state.editorImageData=await compressImage(f);state.editorImageAction='replace';$('#editorPreview').innerHTML=`<img src="${state.editorImageData}" alt="" />`;toast('사진을 자동 압축했습니다. 상품 저장을 눌러주세요.')}catch(err){toast(err.message,5000)}});
  $('#removePrizeImageButton').addEventListener('click',()=>{state.editorImageAction='remove';state.editorImageData='';$('#editorPreview').innerHTML='<span>상품사진 없음</span>'});
  $('#prizeEditorForm').addEventListener('submit',savePrize);
  $('#winnerMinus').addEventListener('click',()=>{$('#winnerCount').value=Math.max(1,(Number($('#winnerCount').value)||1)-1);updateStartEnabled()});
  $('#winnerPlus').addEventListener('click',()=>{const p=currentPrize(),max=Math.min(p?.remaining||1,state.data?.eligibleCount||1);$('#winnerCount').value=Math.min(max,(Number($('#winnerCount').value)||1)+1);updateStartEnabled()});
  $('#winnerCount').addEventListener('input',updateStartEnabled);
  $('#startDrawButton').addEventListener('click',startDraw);
  $('#abortDrawButton').addEventListener('click',abortRace);
  $('#retryCommitButton').addEventListener('click',commitCurrentRound);
  $('#resultDoneButton').addEventListener('click',closeResult);
  $('#drawHistory').addEventListener('click',e=>{const b=e.target.closest('[data-undo-draw]');if(b)undoDraw(b.dataset.undoDraw)});
  $('#speedButton').addEventListener('click',()=>{state.speed=state.speed===1?2:state.speed===2?4:1;$('#speedButton').textContent=`속도 ${state.speed}×`});
  addEventListener('resize',()=>{resizeCanvas();drawFrame()});
}

async function init(){bind();resizeCanvas();drawFrame();if(!sessionValid()||!validApi())return showLoginGate();try{await loadBootstrap();await selectPrize((state.data.prizes.find(p=>p.active&&p.remaining>0)||state.data.prizes[0]).prizeNo)}catch(err){setLoading(false);toast(err.message,6000);if(/로그인|만료/.test(err.message))showLoginGate()}}
document.addEventListener('DOMContentLoaded',init);
