'use strict';

const CONFIG=window.NYJ20_CONFIG||{};
const API_URL=String(CONFIG.appsScriptUrl||'').trim();
const STORE=Object.freeze({TOKEN:'nyj20_kiosk_session_token_v1',EXPIRES:'nyj20_kiosk_session_expires_v1'});
const params=new URLSearchParams(location.search);
const STATION=String(params.get('station')||'현장 키오스크').trim().slice(0,40)||'현장 키오스크';
const $=s=>document.querySelector(s);

let state={
  token:localStorage.getItem(STORE.TOKEN)||'',
  expiresAt:localStorage.getItem(STORE.EXPIRES)||'',
  settings:{},participants:[],scannerRunning:false,scanBusy:false,
  nativeStream:null,nativeVideo:null,nativeFrame:null,nativeDetector:null,
  html5:null,lastCode:'',lastProcessedAt:0,resultTimer:null,wakeLock:null
};

function validApi(){return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/i.test(API_URL)}
function escapeHtml(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')}
function maskName(name){const s=String(name||'').trim();if(s.length<=1)return s||'참가자';if(s.length===2)return s[0]+'*';return s[0]+'*'.repeat(Math.max(1,s.length-2))+s[s.length-1]}
function parseQrPayload(text){
  let v=String(text||'').trim();
  if(!v)return'';
  if(v.startsWith('NYJ20|')||v.startsWith('NYJ20:'))v=v.slice(6);
  try{const u=new URL(v);v=u.searchParams.get('code')||u.searchParams.get('ticket')||v}catch(_){}
  return String(v||'').trim().toUpperCase();
}
function requestId(){return 'kiosk_'+Date.now()+'_'+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2)}
function callbackName(){return '__nyj20k_'+Date.now()+'_'+Math.random().toString(36).slice(2)}
function jsonp(url,timeout=7000){
  return new Promise((resolve,reject)=>{
    const cb=callbackName(),script=document.createElement('script');let done=false;
    const timer=setTimeout(()=>finish(new Error('서버 응답 시간이 초과되었습니다.')),timeout);
    function finish(err,data){if(done)return;done=true;clearTimeout(timer);script.remove();try{delete window[cb]}catch(_){window[cb]=undefined}err?reject(err):resolve(data)}
    window[cb]=data=>finish(null,data);script.onerror=()=>finish(new Error('서버 응답을 불러오지 못했습니다.'));
    const u=new URL(url);u.searchParams.set('callback',cb);u.searchParams.set('_',Date.now());script.src=u.toString();document.head.appendChild(script);
  });
}
function bridge(action,payload={},opts={}){
  return new Promise((resolve,reject)=>{
    if(!validApi()){reject(new Error('config.js의 Apps Script 주소를 확인해 주세요.'));return}
    const id=requestId(),frameName='nyj20_kiosk_frame_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const iframe=document.createElement('iframe');iframe.name=frameName;iframe.style.display='none';
    const form=document.createElement('form');form.method='POST';form.action=API_URL;form.target=frameName;form.style.display='none';
    const fields={bridge:'1',requestId:id,action,payload:JSON.stringify(payload)};
    if(opts.token!==false&&state.token)fields.token=state.token;
    if(opts.station!==false)fields.station=STATION;
    Object.entries(fields).forEach(([name,value])=>{const input=document.createElement('input');input.type='hidden';input.name=name;input.value=String(value);form.appendChild(input)});
    document.body.append(iframe,form);
    const deadline=Date.now()+30000;let finished=false;
    function cleanup(){if(finished)return;finished=true;form.remove();setTimeout(()=>iframe.remove(),50)}
    async function poll(){
      if(finished)return;
      if(Date.now()>deadline){cleanup();reject(new Error('서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.'));return}
      try{
        const u=new URL(API_URL);u.searchParams.set('action','bridgePoll');u.searchParams.set('requestId',id);
        const r=await jsonp(u.toString(),6500);
        if(r?.pending===true){setTimeout(poll,260);return}
        cleanup();
        if(!r||r.ok!==true){const err=new Error(r?.error||'서버 처리 중 오류가 발생했습니다.');err.code=r?.errorCode||'';reject(err);return}
        resolve(r.data);
      }catch(_){setTimeout(poll,420)}
    }
    try{form.submit();setTimeout(poll,220)}catch(e){cleanup();reject(e)}
  });
}

function setConnection(ok,text){$('#connectionDot').className='dot '+(ok?'ok':'error');$('#connectionText').textContent=text}
function setScanStatus(text,kind='idle'){const el=$('#scanStatus');el.className='scan-status '+kind;el.querySelector('strong').textContent=text}
function updateCounts(){
  const active=state.participants.filter(p=>p&&p.active!==false),arrived=active.filter(p=>p.arrived).length;
  $('#totalCount').textContent=active.length.toLocaleString();$('#arrivedCount').textContent=arrived.toLocaleString();$('#pendingCount').textContent=Math.max(0,active.length-arrived).toLocaleString();
}
function updateParticipant(p){const i=state.participants.findIndex(x=>x.id===p.id);if(i>=0)state.participants[i]={...state.participants[i],...p};else state.participants.push(p);updateCounts()}
function renderSettings(){
  const s=state.settings||{};$('#eventName').textContent=s.eventName||'남양주시장애인복지관 개관 20주년 기념행사';
  $('#eventMeta').textContent=[s.eventDate,s.eventVenue].filter(Boolean).join(' · ')||'현장 QR 접수';$('#stationLabel').textContent=STATION;
}
function resetResult(){
  clearTimeout(state.resultTimer);const section=$('#resultSection');section.className='result-section ready';
  $('#resultContent').innerHTML='<div class="ready-icon">✓</div><h2>다음 QR을 보여주세요</h2><p>카메라는 계속 켜져 있습니다. 사각형 안에 QR을 맞춰주세요.</p>';
}
function showResult(p,already,prize){
  clearTimeout(state.resultTimer);const section=$('#resultSection');section.className='result-section '+(already?'already':'success');
  const seat=p.seat||'좌석 미배정';
  const prizeHtml=prize&&!prize.redeemed?`<div class="prize-alert">🎉 행운추첨 당첨 좌석입니다 · ${escapeHtml(prize.prizeName)}<br>상품은 안내데스크에서 확인해 주세요.</div>`:'';
  $('#resultContent').innerHTML=`<div class="result-icon">${already?'!':'✓'}</div><p class="person-name">${escapeHtml(maskName(p.name))} 님</p><span class="seat-label">${already?'이미 도착 확인이 완료되었습니다':'도착 확인이 완료되었습니다'} · 좌석번호</span><strong class="seat-number">${escapeHtml(seat)}</strong><p class="result-message">${already?'좌석을 확인하고 행사장으로 입장해 주세요.':'감사합니다. 좌석을 확인하고 행사장으로 입장해 주세요.'}</p>${prizeHtml}`;
  state.resultTimer=setTimeout(resetResult,8500);
}
function showError(message){
  clearTimeout(state.resultTimer);const section=$('#resultSection');section.className='result-section error';
  $('#resultContent').innerHTML=`<div class="result-icon">×</div><h2>QR을 확인하지 못했습니다</h2><p class="result-message">${escapeHtml(message)}</p><p>문제가 계속되면 안내데스크 직원에게 말씀해 주세요.</p>`;
  state.resultTimer=setTimeout(resetResult,6500);
}
async function bootstrap(){
  const data=await bridge('bootstrap',{});state.settings=data.settings||{};state.participants=Array.isArray(data.participants)?data.participants:[];renderSettings();updateCounts();setConnection(true,'서버 연결됨');return data;
}
async function checkIn(raw){
  const code=parseQrPayload(raw),now=Date.now();if(!code)return;
  if(state.scanBusy)return;if(code===state.lastCode&&now-state.lastProcessedAt<15000)return;
  state.scanBusy=true;setScanStatus('QR 확인 중…','active');
  try{
    const r=await bridge('checkIn',{code});state.lastCode=code;state.lastProcessedAt=Date.now();updateParticipant(r.participant);showResult(r.participant,Boolean(r.already),r.prize||null);setScanStatus('접수 완료 · 다음 QR 대기','ok');if(navigator.vibrate)navigator.vibrate(r.already?[60,80,60]:80);setConnection(true,'서버 연결됨');
  }catch(e){
    if(/로그인|만료/.test(e.message)){clearSession();showLogin('로그인 시간이 만료되었습니다. 다시 로그인해 주세요.');}
    else{showError(e.message);setScanStatus('확인 필요 · 다시 스캔해 주세요','error');setConnection(false,'서버 확인 필요');if(navigator.vibrate)navigator.vibrate([120,70,120]);}
  }finally{state.scanBusy=false;setTimeout(()=>{if(state.scannerRunning)setScanStatus('QR 인식 대기','active')},1800)}
}

function clearSession(){state.token='';state.expiresAt='';localStorage.removeItem(STORE.TOKEN);localStorage.removeItem(STORE.EXPIRES)}
function showLogin(msg=''){stopScanner().catch(()=>{});$('#loginOverlay').classList.remove('hidden');const m=$('#loginMessage');m.textContent=msg;m.classList.toggle('hidden',!msg);setConnection(false,'로그인 필요')}
function hideLogin(){$('#loginOverlay').classList.add('hidden');$('#password').value=''}
async function login(username,password){
  const data=await bridge('adminLogin',{username,password},{token:false,station:false});state.token=data.token;state.expiresAt=data.expiresAt||'';localStorage.setItem(STORE.TOKEN,state.token);localStorage.setItem(STORE.EXPIRES,state.expiresAt);await bootstrap();hideLogin();resetResult();
}
function sessionLooksValid(){if(!state.token)return false;if(!state.expiresAt)return true;return new Date(state.expiresAt).getTime()>Date.now()+5000}

async function stopNative(){if(state.nativeFrame){cancelAnimationFrame(state.nativeFrame);state.nativeFrame=null}if(state.nativeVideo){try{state.nativeVideo.pause()}catch(_){}state.nativeVideo.srcObject=null;state.nativeVideo.remove();state.nativeVideo=null}if(state.nativeStream){state.nativeStream.getTracks().forEach(t=>t.stop());state.nativeStream=null}state.nativeDetector=null}
async function startNative(){
  if(!('BarcodeDetector'in window)||!navigator.mediaDevices?.getUserMedia)return false;
  try{if(typeof BarcodeDetector.getSupportedFormats==='function'){const f=await BarcodeDetector.getSupportedFormats();if(!f.includes('qr_code'))return false}state.nativeDetector=new BarcodeDetector({formats:['qr_code']});state.nativeStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1080},height:{ideal:1920},frameRate:{ideal:30,max:60}}});
    const v=document.createElement('video');v.autoplay=true;v.muted=true;v.setAttribute('playsinline','');v.srcObject=state.nativeStream;$('#reader').innerHTML='';$('#reader').appendChild(v);state.nativeVideo=v;await v.play();
    const loop=async()=>{if(!state.scannerRunning||!state.nativeDetector||!state.nativeVideo)return;try{const found=await state.nativeDetector.detect(state.nativeVideo);if(found?.[0]?.rawValue)checkIn(found[0].rawValue)}catch(_){}state.nativeFrame=requestAnimationFrame(loop)};state.nativeFrame=requestAnimationFrame(loop);return true;
  }catch(_){await stopNative();return false}
}
async function startHtml5(){
  if(typeof Html5Qrcode!=='function')throw new Error('QR 카메라 모듈을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
  $('#reader').innerHTML='';state.html5=new Html5Qrcode('reader');
  await state.html5.start({facingMode:'environment'},{fps:15,qrbox:(w,h)=>{const s=Math.floor(Math.min(w,h)*.72);return{width:s,height:s}},aspectRatio:9/16},decoded=>checkIn(decoded),()=>{});return true;
}
async function startScanner(){
  if(state.scannerRunning)return;state.scannerRunning=true;$('#scannerToggle').textContent='카메라 중지';setScanStatus('카메라 시작 중…','active');
  try{const native=await startNative();if(!native)await startHtml5();setScanStatus('QR 인식 대기','active');requestWakeLock().catch(()=>{});}catch(e){state.scannerRunning=false;$('#scannerToggle').textContent='카메라 시작';setScanStatus('카메라를 시작하지 못했습니다','error');showError(e.message)}
}
async function stopScanner(){
  state.scannerRunning=false;await stopNative();if(state.html5){try{await state.html5.stop()}catch(_){}try{state.html5.clear()}catch(_){}state.html5=null}
  const reader=$('#reader');if(reader)reader.innerHTML='<div class="reader-placeholder"><div class="qr-symbol">⌗</div><strong>카메라 대기 중</strong><span>‘카메라 시작’을 눌러주세요.</span></div>';const b=$('#scannerToggle');if(b)b.textContent='카메라 시작';setScanStatus('QR 인식 대기','idle');
}
async function requestWakeLock(){try{if('wakeLock'in navigator)state.wakeLock=await navigator.wakeLock.request('screen')}catch(_){} }
async function toggleFullscreen(){try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch(_){} }

function bind(){
  $('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const b=$('#loginButton');b.disabled=true;$('#loginMessage').classList.add('hidden');try{await login($('#username').value.trim(),$('#password').value)}catch(err){clearSession();const m=$('#loginMessage');m.textContent=err.message;m.classList.remove('hidden')}finally{b.disabled=false}});
  $('#scannerToggle').addEventListener('click',()=>state.scannerRunning?stopScanner():startScanner());
  $('#manualForm').addEventListener('submit',async e=>{e.preventDefault();const code=$('#manualCode').value.trim();if(!code)return;await checkIn(code);$('#manualCode').value=''});
  $('#fullscreenButton').addEventListener('click',toggleFullscreen);
  $('#logoutButton').addEventListener('click',async()=>{try{if(state.token)await bridge('adminLogout',{token:state.token})}catch(_){}clearSession();showLogin('키오스크를 종료했습니다.')});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.scannerRunning)requestWakeLock().catch(()=>{})});
  window.addEventListener('beforeunload',()=>{try{state.nativeStream?.getTracks().forEach(t=>t.stop())}catch(_){}});
}
async function init(){
  bind();$('#stationLabel').textContent=STATION;
  if(!validApi()){showLogin('config.js의 Apps Script 주소가 올바르지 않습니다.');return}
  if(sessionLooksValid()){
    try{await bootstrap();hideLogin();resetResult();return}catch(_){clearSession()}
  }
  showLogin();
}
init();
