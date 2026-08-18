'use strict';

const CONFIG = window.NYJ20_CONFIG || {};
const API_URL = String(CONFIG.appsScriptUrl || '').trim();
const STORAGE = Object.freeze({
  TOKEN: 'nyj20_admin_session_token_v3',
  EXPIRES: 'nyj20_admin_session_expires_v3',
  STATION: 'nyj20_admin_station_v3'
});
const DEFAULT_SETTINGS = Object.freeze({
  eventName: '남양주시장애인복지관 개관 20주년 기념행사',
  eventDate: '2026. 9. 17.(목) 14:00',
  eventVenue: '남양주금곡실내체육관',
  eventOrganizer: '남양주시장애인복지관',
  seatRows: 'A,B,C,D,E,F,G,H,I,J',
  seatsPerRow: 12,
  autoRefreshSeconds: CONFIG.defaultAutoRefreshSeconds || 15,
  publicSubtitle: '스무번의 계절, 스물한번째 약속',
  publicGreeting: '남양주시장애인복지관의 스무 해를 함께해 주신 여러분을 초대합니다.',
  registrationOpen: true,
  registrationCapacity: 120,
  autoAssignSeat: true
});

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let session = {
  token: localStorage.getItem(STORAGE.TOKEN) || '',
  expiresAt: localStorage.getItem(STORAGE.EXPIRES) || '',
  station: localStorage.getItem(STORAGE.STATION) || '관리자 웹'
};
let state = { settings: { ...DEFAULT_SETTINGS }, participants: [], serverTime: null };
let currentView = 'dashboard';
let refreshTimer = null;
let scanner = null;
let scannerRunning = false;
let scanBusy = false;
let lastScannedText = '';
let lastScannedAt = 0;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function validateApiUrl(url) {
  return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/i.test(String(url || '').trim());
}
function normalizeSeat(value) {
  const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  const m = raw.match(/^([A-Z가-힣]+)[-_]?(\d+)$/);
  return m ? `${m[1]}-${String(Number(m[2])).padStart(2, '0')}` : raw;
}
function parseQrPayload(text) {
  let value = String(text || '').trim();
  if (value.startsWith('NYJ20|') || value.startsWith('NYJ20:')) value = value.slice(6);
  try {
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      value = url.searchParams.get('code') || url.searchParams.get('id') || value;
    }
  } catch (_) {}
  return value.trim().toUpperCase();
}
function qrPayload(p) { return `NYJ20|${p.id}`; }
function maskPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length >= 7 ? `${d.slice(0,3)}-****-${d.slice(-4)}` : (phone || '-');
}
function formatDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(d);
}
function isSessionLocallyValid() {
  return Boolean(session.token && session.expiresAt && new Date(session.expiresAt).getTime() > Date.now());
}
function saveSession(data) {
  session.token = data.token;
  session.expiresAt = data.expiresAt;
  localStorage.setItem(STORAGE.TOKEN, session.token);
  localStorage.setItem(STORAGE.EXPIRES, session.expiresAt);
}
function clearSession() {
  session.token = '';
  session.expiresAt = '';
  localStorage.removeItem(STORAGE.TOKEN);
  localStorage.removeItem(STORAGE.EXPIRES);
}
function showLogin(message = '') {
  $('#loginOverlay').classList.remove('hidden');
  $('#storageBadge').className = 'badge warning';
  $('#storageBadge').textContent = '로그인 필요';
  const box = $('#loginMessage');
  box.textContent = message;
  box.classList.toggle('hidden', !message);
  setTimeout(() => $('#adminUsername')?.focus(), 80);
}
function hideLogin() {
  $('#loginOverlay').classList.add('hidden');
  $('#loginMessage').classList.add('hidden');
}
function showToast(message, duration = 3000) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add('hidden'), duration);
}
function setStatus(type, text) {
  const badge = $('#storageBadge');
  badge.className = `badge ${type}`;
  badge.textContent = text;
}

function jsonpRequest(action, payload = {}, { auth = true } = {}) {
  return new Promise((resolve, reject) => {
    if (!validateApiUrl(API_URL)) return reject(new Error('config.js의 Apps Script /exec 주소를 확인하세요.'));
    if (auth && !session.token) return reject(new Error('관리자 로그인이 필요합니다.'));
    const cb = `__nyj20_admin_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const url = new URL(API_URL);
    url.searchParams.set('action', action);
    if (auth) url.searchParams.set('token', session.token);
    url.searchParams.set('station', session.station || '관리자 웹');
    url.searchParams.set('payload', JSON.stringify(payload));
    url.searchParams.set('callback', cb);
    url.searchParams.set('_', String(Date.now()));
    const script = document.createElement('script');
    const timeout = setTimeout(() => { cleanup(); reject(new Error('서버 응답 시간이 초과되었습니다.')); }, Number(CONFIG.requestTimeoutMs) || 25000);
    function cleanup() { clearTimeout(timeout); script.remove(); try { delete window[cb]; } catch (_) { window[cb] = undefined; } }
    window[cb] = response => {
      cleanup();
      if (!response || response.ok !== true) {
        const msg = response?.error || '서버 오류가 발생했습니다.';
        if (/로그인|만료/.test(msg)) { clearSession(); showLogin(msg); }
        reject(new Error(msg));
        return;
      }
      resolve(response.data);
    };
    script.onerror = () => { cleanup(); reject(new Error('Apps Script 서버에 연결하지 못했습니다.')); };
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

async function login(username, password) {
  const data = await jsonpRequest('adminLogin', { username, password }, { auth:false });
  saveSession(data);
  hideLogin();
  await refreshFromServer({ silent:true });
  showToast(`로그인되었습니다. ${data.sessionHours || 24}시간 유지됩니다.`);
}
async function logout() {
  const token = session.token;
  clearSession();
  try { if (token) await jsonpRequestWithToken('adminLogout', {}, token); } catch (_) {}
  showLogin('로그아웃되었습니다.');
}
function jsonpRequestWithToken(action, payload, token) {
  return new Promise((resolve,reject) => {
    if (!validateApiUrl(API_URL)) return reject(new Error('서버 주소 오류'));
    const cb=`__nyj20_logout_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const url=new URL(API_URL); url.searchParams.set('action',action); url.searchParams.set('token',token); url.searchParams.set('payload',JSON.stringify(payload)); url.searchParams.set('callback',cb);
    const script=document.createElement('script'); const timer=setTimeout(()=>{cleanup();reject(new Error('timeout'));},8000);
    function cleanup(){clearTimeout(timer);script.remove();try{delete window[cb]}catch(_){}}
    window[cb]=r=>{cleanup(); r?.ok?resolve(r.data):reject(new Error(r?.error||'error'));}; script.onerror=()=>{cleanup();reject(new Error('network'));}; script.src=url.toString();document.head.appendChild(script);
  });
}

async function refreshFromServer({ silent=false }={}) {
  if (!silent) setStatus('warning','동기화 중');
  try {
    const data = await jsonpRequest('bootstrap');
    state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    state.participants = Array.isArray(data.participants) ? data.participants : [];
    state.serverTime = data.serverTime || new Date().toISOString();
    renderAll();
    setStatus('connected','연결됨');
    hideLogin();
    scheduleRefresh();
  } catch (error) {
    if (!/로그인|만료/.test(error.message)) setStatus('error','연결 오류');
    if (!silent) showToast(error.message,4500);
    throw error;
  }
}
function scheduleRefresh() {
  clearInterval(refreshTimer);
  const sec = Math.max(5, Number(state.settings.autoRefreshSeconds) || 15);
  refreshTimer = setInterval(() => { if (!document.hidden && !scanBusy && session.token) refreshFromServer({silent:true}).catch(()=>{}); }, sec*1000);
}
function updateCache(p) {
  const i=state.participants.findIndex(x=>x.id===p.id); if(i>=0) state.participants[i]=p; else state.participants.push(p);
  state.participants.sort((a,b)=>a.number-b.number); renderAll();
}
function switchView(name) {
  currentView=name;
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`));
  $$('.nav-button').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  if(name!=='checkin'&&scannerRunning) stopScanner();
  if(name==='seats') renderSeatMap();
  window.scrollTo({top:0,behavior:'smooth'});
}
function renderAll() {
  $('#headerEventName').textContent = state.settings.eventName;
  $('#lastSyncLabel').textContent = `마지막 동기화: ${formatDateTime(state.serverTime)}`;
  renderDashboard(); renderParticipants(); renderSeatMap(); renderSettings();
}
function renderDashboard() {
  const total=state.participants.length, arrived=state.participants.filter(p=>p.arrived).length, pending=total-arrived;
  $('#statTotal').textContent=total.toLocaleString(); $('#statArrived').textContent=arrived.toLocaleString(); $('#statNotArrived').textContent=pending.toLocaleString(); $('#statRate').textContent=`${total?Math.round(arrived/total*1000)/10:0}%`;
  const recent=state.participants.filter(p=>p.arrived&&p.checkInAt).sort((a,b)=>new Date(b.checkInAt)-new Date(a.checkInAt)).slice(0,8);
  const c=$('#recentCheckins');
  if(!recent.length){c.className='empty-state';c.textContent='아직 도착한 참가자가 없습니다.';return;}
  c.className='recent-list'; c.innerHTML=recent.map(p=>`<div class="recent-item"><div><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.seat||'좌석 미정')} · ${escapeHtml(p.group||'구분 없음')}</span></div><span>${escapeHtml(formatDateTime(p.checkInAt))}</span></div>`).join('');
}
function filteredParticipants() {
  const q=($('#participantSearch')?.value||'').trim().toLowerCase(); const st=$('#participantStatusFilter')?.value||'all';
  return [...state.participants].filter(p=>{const hay=[p.id,p.number,p.name,p.phone,p.seat,p.group].join(' ').toLowerCase();return(!q||hay.includes(q))&&(st==='all'||(st==='arrived'?p.arrived:!p.arrived));}).sort((a,b)=>a.number-b.number);
}
function renderParticipants() {
  const rows=filteredParticipants(); $('#participantCountLabel').textContent=`${rows.length}명 표시 / 전체 ${state.participants.length}명`;
  $('#participantTableBody').innerHTML = rows.length ? rows.map(p=>`<tr><td>${String(p.number).padStart(4,'0')}</td><td><strong>${escapeHtml(p.name)}</strong><br><span class="small-text">${escapeHtml(p.id)}</span></td><td>${escapeHtml(maskPhone(p.phone))}</td><td><strong>${escapeHtml(p.seat||'미정')}</strong></td><td>${escapeHtml(p.group||'-')}</td><td><span class="badge ${p.arrived?'arrived':'pending'}">${p.arrived?'도착':'미도착'}</span></td><td><div class="row-actions"><button class="button small secondary" data-action="qr" data-id="${escapeHtml(p.id)}">QR</button><button class="button small secondary" data-action="edit" data-id="${escapeHtml(p.id)}">수정</button><button class="button small ${p.arrived?'secondary':'primary'}" data-action="toggle" data-id="${escapeHtml(p.id)}">${p.arrived?'도착 취소':'도착 처리'}</button><button class="button small secondary" data-action="delete" data-id="${escapeHtml(p.id)}">사용중지</button></div></td></tr>`).join('') : '<tr><td colspan="7"><div class="empty-state">참가자가 없습니다.</div></td></tr>';
}
function renderSeatMap() {
  const rows=String(state.settings.seatRows||'').split(',').map(v=>v.trim().toUpperCase()).filter(Boolean);
  const count=Math.max(1,Number(state.settings.seatsPerRow)||12);
  const assigned=new Map(state.participants.filter(p=>p.seat).map(p=>[normalizeSeat(p.seat),p]));
  const half=Math.ceil(count/2);
  const html=rows.map(row=>{
    let seats='';
    for(let i=1;i<=count;i++){
      if(i===half+1) seats+='<span class="cinema-aisle" aria-hidden="true"></span>';
      const code=`${row}-${String(i).padStart(2,'0')}`; const p=assigned.get(code);
      if(p) seats+=`<button class="cinema-seat ${p.arrived?'arrived':'pending'}" data-seat-id="${escapeHtml(p.id)}" title="${escapeHtml(code+' '+p.name)}"><strong>${String(i).padStart(2,'0')}</strong><span class="seat-name">${escapeHtml(p.name)}</span></button>`;
      else seats+=`<button class="cinema-seat empty" disabled title="${escapeHtml(code+' 빈 좌석')}"><strong>${String(i).padStart(2,'0')}</strong></button>`;
    }
    return `<div class="cinema-row"><span class="row-label">${escapeHtml(row)}</span><div class="seat-row-line">${seats}</div></div>`;
  }).join('');
  $('#seatMap').innerHTML=html||'<div class="empty-state">행사 설정에서 좌석 행을 입력하세요.</div>';
}
function renderSettings() {
  $('#eventName').value=state.settings.eventName||''; $('#eventDate').value=state.settings.eventDate||''; $('#eventVenue').value=state.settings.eventVenue||''; $('#eventOrganizer').value=state.settings.eventOrganizer||'';
  $('#seatRows').value=state.settings.seatRows||''; $('#seatsPerRow').value=state.settings.seatsPerRow||12; $('#autoRefreshSeconds').value=state.settings.autoRefreshSeconds||15;
  $('#publicSubtitle').value=state.settings.publicSubtitle||''; $('#publicGreeting').value=state.settings.publicGreeting||''; $('#registrationOpen').value=String(state.settings.registrationOpen!==false); $('#registrationCapacity').value=state.settings.registrationCapacity||120; $('#autoAssignSeat').value=String(state.settings.autoAssignSeat!==false); $('#stationName').value=session.station||'관리자 웹';
}
function findById(id){return state.participants.find(p=>p.id===id)}
function findMatches(q){const v=String(q||'').trim().toLowerCase();if(!v)return[];const parsed=parseQrPayload(v).toLowerCase();const exact=state.participants.find(p=>String(p.id).toLowerCase()===parsed);if(exact)return[exact];return state.participants.filter(p=>[p.id,p.name,p.phone,p.seat,p.number].some(x=>String(x||'').toLowerCase().includes(v))).slice(0,20)}
async function checkIn(pOrCode){const code=typeof pOrCode==='string'?parseQrPayload(pOrCode):pOrCode.id;scanBusy=true;try{const r=await jsonpRequest('checkIn',{code});updateCache(r.participant);showCheckinResult(r.participant,r.already);showToast(r.already?'이미 도착 처리된 참가자입니다.':`${r.participant.name} 님 도착 완료`);}finally{scanBusy=false}}
async function undoCheckIn(p){const u=await jsonpRequest('undoCheckIn',{code:p.id});updateCache(u);showCheckinResult(u,false);showToast(`${u.name} 님 도착을 취소했습니다.`)}
function showCheckinResult(p,already=false){$('#checkinResultPanel').classList.remove('hidden');$('#checkinResult').innerHTML=`<div class="result-card ${already?'already':''}"><span class="badge ${p.arrived?'arrived':'pending'}">${already?'이미 도착 처리됨':p.arrived?'도착 완료':'미도착'}</span><h3>${escapeHtml(p.name)} 님</h3><div class="seat-large">${escapeHtml(p.seat||'좌석 미정')}</div><p>접수번호 ${String(p.number).padStart(4,'0')} · ${escapeHtml(p.group||'구분 없음')}</p><p class="small-text">${p.arrived?'도착 시각: '+escapeHtml(formatDateTime(p.checkInAt)):'아직 도착하지 않았습니다.'}</p><div class="result-actions">${p.arrived?`<button class="button secondary" data-result="undo" data-id="${escapeHtml(p.id)}">도착 취소</button>`:`<button class="button primary" data-result="checkin" data-id="${escapeHtml(p.id)}">도착 처리</button>`}<button class="button secondary" data-result="qr" data-id="${escapeHtml(p.id)}">QR 보기</button></div></div>`;$('#checkinResultPanel').scrollIntoView({behavior:'smooth',block:'center'})}
async function handleScanned(text){const now=Date.now();if(scanBusy||(text===lastScannedText&&now-lastScannedAt<3000))return;lastScannedText=text;lastScannedAt=now;try{await checkIn(text)}catch(e){showToast(e.message,4500);$('#checkinResultPanel').classList.remove('hidden');$('#checkinResult').innerHTML=`<div class="empty-state"><strong>${escapeHtml(e.message)}</strong></div>`}}
function startScanner(){if(scannerRunning)return;if(typeof Html5QrcodeScanner==='undefined')return showToast('QR 스캐너 라이브러리를 불러오지 못했습니다.');$('#reader').innerHTML='';scanner=new Html5QrcodeScanner('reader',{fps:10,qrbox:{width:230,height:230},rememberLastUsedCamera:true,supportedScanTypes:[Html5QrcodeScanType.SCAN_TYPE_CAMERA,Html5QrcodeScanType.SCAN_TYPE_FILE]},false);scanner.render(t=>handleScanned(t),()=>{});scannerRunning=true;$('#toggleScannerButton').textContent='카메라 종료'}
async function stopScanner(){if(!scannerRunning||!scanner)return;try{await scanner.clear()}catch(_){}scanner=null;scannerRunning=false;$('#reader').innerHTML='<p>카메라 시작 버튼을 눌러주세요.</p>';$('#toggleScannerButton').textContent='카메라 시작'}
function openModal(title,html){$('#modalTitle').textContent=title;$('#modalContent').innerHTML=html;$('#modalBackdrop').classList.remove('hidden');document.body.style.overflow='hidden'}
function closeModal(){$('#modalBackdrop').classList.add('hidden');document.body.style.overflow=''}
function showQr(p){openModal(`${p.name} 님 QR`,`<div class="qr-detail"><div id="singleQrCode" class="qr-code-box"></div><div class="detail-list"><div><dt>접수번호</dt><dd>${String(p.number).padStart(4,'0')}</dd></div><div><dt>이름</dt><dd>${escapeHtml(p.name)}</dd></div><div><dt>좌석</dt><dd>${escapeHtml(p.seat||'미정')}</dd></div><div><dt>상태</dt><dd>${p.arrived?'도착':'미도착'}</dd></div></div></div>`);new QRCode($('#singleQrCode'),{text:qrPayload(p),width:220,height:220,correctLevel:QRCode.CorrectLevel.H})}
function showSeatDetail(p){openModal(`${p.seat||'좌석 미정'} 좌석`,`<div class="detail-list"><div><dt>이름</dt><dd>${escapeHtml(p.name)}</dd></div><div><dt>좌석</dt><dd>${escapeHtml(p.seat||'미정')}</dd></div><div><dt>상태</dt><dd>${p.arrived?'도착 완료':'미도착'}</dd></div><div><dt>연락처</dt><dd>${escapeHtml(maskPhone(p.phone))}</dd></div><div><dt>도착 시각</dt><dd>${escapeHtml(formatDateTime(p.checkInAt))}</dd></div><div><dt>비고</dt><dd>${escapeHtml(p.note||'-')}</dd></div></div>`)}
function showEdit(p){openModal('참가자 정보 수정',`<form id="editParticipantForm" class="form-grid"><label>이름<input name="name" required value="${escapeHtml(p.name)}"></label><label>연락처<input name="phone" value="${escapeHtml(p.phone||'')}"></label><label>좌석번호<input name="seat" value="${escapeHtml(p.seat||'')}"></label><label>구분<input name="group" value="${escapeHtml(p.group||'')}"></label><label class="wide">비고<input name="note" value="${escapeHtml(p.note||'')}"></label><div class="form-actions wide"><button class="button primary" type="submit">저장</button></div></form>`);$('#editParticipantForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button');b.disabled=true;try{const v=Object.fromEntries(new FormData(e.currentTarget).entries());const u=await jsonpRequest('updateParticipant',{code:p.id,...v});updateCache(u);closeModal();showToast('수정했습니다.')}catch(err){showToast(err.message,4500)}finally{b.disabled=false}})}
function exportCsv(){const h=['접수번호','QR고유코드','이름','연락처','좌석번호','구분','비고','도착여부','도착시각'];const rows=state.participants.map(p=>[p.number,p.id,p.name,p.phone,p.seat,p.group,p.note,p.arrived?'도착':'미도착',p.checkInAt||'']);const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;const csv='\uFEFF'+[h,...rows].map(r=>r.map(esc).join(',')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`20주년_참가자명단_${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url)}

function bindEvents(){
  $('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const b=$('#loginButton');b.disabled=true;$('#loginMessage').classList.add('hidden');try{await login($('#adminUsername').value.trim(),$('#adminPassword').value)}catch(err){showLogin(err.message)}finally{b.disabled=false}});
  $$('.nav-button').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view))); $$('[data-go]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.go)));
  $('#refreshDashboardButton').addEventListener('click',()=>refreshFromServer().catch(()=>{})); $('#exportCsvButton').addEventListener('click',exportCsv); $('#exportCsvDashboardButton').addEventListener('click',exportCsv);
  $('#participantSearch').addEventListener('input',renderParticipants); $('#participantStatusFilter').addEventListener('change',renderParticipants);
  $('#participantForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const b=form.querySelector('button');b.disabled=true;try{const v=Object.fromEntries(new FormData(form).entries());const p=await jsonpRequest('createParticipant',v);updateCache(p);form.reset();showToast('참가자를 등록했습니다.')}catch(err){showToast(err.message,4500)}finally{b.disabled=false}});
  $('#participantTableBody').addEventListener('click',async e=>{const b=e.target.closest('[data-action]');if(!b)return;const p=findById(b.dataset.id);if(!p)return;try{if(b.dataset.action==='qr')showQr(p);if(b.dataset.action==='edit')showEdit(p);if(b.dataset.action==='toggle')p.arrived?await undoCheckIn(p):await checkIn(p);if(b.dataset.action==='delete'&&confirm(`${p.name} 님을 사용중지할까요?`)){await jsonpRequest('deleteParticipant',{code:p.id});state.participants=state.participants.filter(x=>x.id!==p.id);renderAll();showToast('사용중지했습니다.')}}catch(err){showToast(err.message,4500)}});
  $('#toggleScannerButton').addEventListener('click',()=>scannerRunning?stopScanner():startScanner());
  $('#manualCheckinForm').addEventListener('submit',e=>{e.preventDefault();const m=findMatches($('#manualCheckinInput').value);$('#manualSearchResults').innerHTML=m.length?m.map(p=>`<button class="search-result-button" data-manual-id="${escapeHtml(p.id)}"><strong>${escapeHtml(p.name)}</strong><br><span>${escapeHtml(p.seat||'미정')} · ${escapeHtml(maskPhone(p.phone))} · ${p.arrived?'도착':'미도착'}</span></button>`).join(''):'<div class="empty-state">찾지 못했습니다.</div>'});
  $('#manualSearchResults').addEventListener('click',e=>{const b=e.target.closest('[data-manual-id]');if(!b)return;const p=findById(b.dataset.manualId);if(p)showCheckinResult(p,p.arrived)});
  $('#checkinResult').addEventListener('click',async e=>{const b=e.target.closest('[data-result]');if(!b)return;const p=findById(b.dataset.id);if(!p)return;try{if(b.dataset.result==='checkin')await checkIn(p);if(b.dataset.result==='undo')await undoCheckIn(p);if(b.dataset.result==='qr')showQr(p)}catch(err){showToast(err.message,4500)}});
  $('#seatMap').addEventListener('click',e=>{const b=e.target.closest('[data-seat-id]');if(!b)return;const p=findById(b.dataset.seatId);if(p)showSeatDetail(p)});
  $('#eventSettingsForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button');b.disabled=true;session.station=$('#stationName').value.trim()||'관리자 웹';localStorage.setItem(STORAGE.STATION,session.station);const settings={eventName:$('#eventName').value.trim(),eventDate:$('#eventDate').value.trim(),eventVenue:$('#eventVenue').value.trim(),eventOrganizer:$('#eventOrganizer').value.trim(),seatRows:$('#seatRows').value.trim(),seatsPerRow:Number($('#seatsPerRow').value)||12,autoRefreshSeconds:Number($('#autoRefreshSeconds').value)||15,publicSubtitle:$('#publicSubtitle').value.trim(),publicGreeting:$('#publicGreeting').value.trim(),registrationOpen:$('#registrationOpen').value==='true',registrationCapacity:Number($('#registrationCapacity').value)||120,autoAssignSeat:$('#autoAssignSeat').value==='true'};try{state.settings=await jsonpRequest('saveSettings',settings);renderAll();scheduleRefresh();showToast('설정을 저장했습니다.')}catch(err){showToast(err.message,4500)}finally{b.disabled=false}});
  $('#logoutButton').addEventListener('click',logout); $('#logoutButtonTop').addEventListener('click',logout); $('#closeModalButton').addEventListener('click',closeModal); $('#modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal()}); document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
}

async function initialize(){
  bindEvents();
  if(!validateApiUrl(API_URL)){showLogin('config.js에 Apps Script /exec 주소가 설정되지 않았습니다.');return;}
  if(!isSessionLocallyValid()){clearSession();showLogin();return;}
  setStatus('warning','로그인 확인 중');
  try{await refreshFromServer({silent:true})}catch(err){showLogin(err.message)}
}

document.addEventListener('DOMContentLoaded',initialize);
