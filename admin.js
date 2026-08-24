'use strict';

const ADMIN_UI_VERSION = '2.7-FEEDBACK-FORM';

const CONFIG = window.NYJ20_CONFIG || {};
const API_URL = String(CONFIG.appsScriptUrl || '').trim();
const STORAGE = Object.freeze({
  TOKEN: 'nyj20_admin_session_token_v3',
  EXPIRES: 'nyj20_admin_session_expires_v3',
  STATION: 'nyj20_admin_station_v3'
});
const DEFAULT_SETTINGS = Object.freeze({
  eventName: '남양주시장애인복지관 개관 20주년 기념행사',
  eventDate: '2026. 9. 17.(목) 13:30',
  eventVenue: '남양주금곡실내체육관',
  eventOrganizer: '남양주시장애인복지관',
  seatRows: 'A,B,C,D,E,F,G,H,I,J,K,L,M,N,O',
  seatsPerRow: 30,
  autoSeatStartRow: 'A',
  autoRefreshSeconds: CONFIG.defaultAutoRefreshSeconds || 15,
  publicSubtitle: '스무번의 계절, 스물한 번째 약속',
  publicGreeting: '남양주시장애인복지관의 스무 해를 함께해 주신 여러분을 초대합니다.',
  privacyRetentionText: '행사 종료 후 결과 정리 및 문의 대응 완료 시까지(최대 30일)',
  registrationOpen: true,
  registrationCapacity: 450,
  autoAssignSeat: true
});

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let session = {
  token: localStorage.getItem(STORAGE.TOKEN) || '',
  expiresAt: localStorage.getItem(STORAGE.EXPIRES) || '',
  station: localStorage.getItem(STORAGE.STATION) || '관리자 웹'
};
let state = { settings: { ...DEFAULT_SETTINGS }, participants: [], seatMeta: [], prizes: [], serverTime: null };
let currentView = 'dashboard';
let refreshTimer = null;
let scanner = null;
let scannerRunning = false;
let scanBusy = false;
let lastScannedText = '';
let lastScannedAt = 0;
let selectedSeatParticipantId = '';

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
function parseSeatList(value) {
  const text=String(value||'').trim();
  if(!text)return[];
  const out=[];
  text.split(/[,，]/).forEach(part=>{
    const token=String(part||'').trim().toUpperCase();
    if(!token)return;
    const range=token.match(/^([A-Z]+)[-_]?(\d+)\s*[~～-]\s*([A-Z]+)?[-_]?(\d+)$/);
    if(range){
      const r1=range[1],r2=range[3]||r1,a=Number(range[2]),b=Number(range[4]);
      if(r1===r2&&a<=b&&b-a<=100){for(let i=a;i<=b;i++)out.push(normalizeSeat(`${r1}-${i}`));return;}
    }
    out.push(normalizeSeat(token));
  });
  return out.filter(Boolean);
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
  // 관리자 화면에서는 참가자 확인을 위해 연락처 전체를 표시합니다.
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
  return String(phone || '-');
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

function createBridgeRequestId(prefix = 'adm') {
  const bytes = new Uint8Array(18);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
    return `${prefix}_${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}

/**
 * 관리자 비밀번호·세션토큰·참가자 개인정보를 URL에 넣지 않는 POST 브리지.
 * 요청 본문은 숨김 form POST로 보내고, 무작위 requestId로 1회성 응답만 조회합니다.
 */
function bridgeRequest(action, payload = {}, { auth = true, tokenOverride = '' } = {}) {
  return new Promise((resolve, reject) => {
    if (!validateApiUrl(API_URL)) return reject(new Error('config.js의 Apps Script /exec 주소를 확인하세요.'));
    const token = tokenOverride || (auth ? session.token : '');
    if (auth && !token) return reject(new Error('관리자 로그인이 필요합니다.'));

    const requestId = createBridgeRequestId('adm');
    const frameName = `nyj20_admin_bridge_${requestId.replace(/[^A-Za-z0-9_]/g, '')}`;

    const iframe = document.createElement('iframe');
    iframe.name = frameName;
    iframe.style.display = 'none';
    iframe.setAttribute('aria-hidden', 'true');

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = API_URL;
    form.target = frameName;
    form.style.display = 'none';
    form.acceptCharset = 'UTF-8';

    const fields = {
      bridge: '1',
      requestId,
      action,
      token,
      station: session.station || '관리자 웹',
      payload: JSON.stringify(payload)
    };
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = String(value ?? '');
      form.appendChild(input);
    });

    document.body.appendChild(iframe);
    document.body.appendChild(form);

    let finished = false;
    let activeScript = null;
    let activeCallback = '';
    const deadline = Date.now() + (Number(CONFIG.requestTimeoutMs) || 25000);

    function clearPollScript() {
      if (activeScript) activeScript.remove();
      activeScript = null;
      if (activeCallback) {
        try { delete window[activeCallback]; } catch (_) { window[activeCallback] = undefined; }
      }
      activeCallback = '';
    }

    function cleanup() {
      if (finished) return;
      finished = true;
      clearPollScript();
      form.remove();
      setTimeout(() => iframe.remove(), 50);
    }

    function fail(error) {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error || '서버 오류가 발생했습니다.')));
    }

    function poll() {
      if (finished) return;
      if (Date.now() > deadline) {
        fail(new Error('서버 응답 시간이 초과되었습니다.'));
        return;
      }

      clearPollScript();
      const cb = `__nyj20_admin_poll_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const url = new URL(API_URL);
      url.searchParams.set('action', 'bridgePoll');
      url.searchParams.set('requestId', requestId);
      url.searchParams.set('callback', cb);
      url.searchParams.set('_', String(Date.now()));

      const script = document.createElement('script');
      activeScript = script;
      activeCallback = cb;

      window[cb] = response => {
        clearPollScript();
        if (response?.pending === true) {
          setTimeout(poll, 220);
          return;
        }
        if (!response || response.ok !== true) {
          fail(new Error(response?.error || '서버 오류가 발생했습니다.'));
          return;
        }
        const data = response.data;
        cleanup();
        resolve(data);
      };

      script.onerror = () => {
        clearPollScript();
        setTimeout(poll, 350);
      };
      script.src = url.toString();
      document.head.appendChild(script);
    }

    try {
      form.submit();
      setTimeout(poll, 180);
    } catch (_) {
      fail(new Error('Apps Script 서버에 요청을 보내지 못했습니다.'));
    }
  });
}

async function jsonpRequest(action, payload = {}, { auth = true } = {}) {
  try {
    return await bridgeRequest(action, payload, { auth });
  } catch (error) {
    const msg = error?.message || String(error);
    if (/로그인|만료/.test(msg)) {
      clearSession();
      showLogin(msg);
    }
    throw error;
  }
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
  return bridgeRequest(action, payload, { auth:false, tokenOverride: token });
}

async function refreshFromServer({ silent=false }={}) {
  if (!silent) setStatus('warning','동기화 중');
  try {
    const data = await jsonpRequest('bootstrap');
    state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    state.participants = Array.isArray(data.participants) ? data.participants : [];
    state.seatMeta = Array.isArray(data.seatMeta) ? data.seatMeta : [];
    state.prizes = Array.isArray(data.prizes) ? data.prizes : [];
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
  if(name==='draw') renderPrizeDraw();
  window.scrollTo({top:0,behavior:'smooth'});
}
function renderAll() {
  $('#headerEventName').textContent = state.settings.eventName;
  $('#lastSyncLabel').textContent = `마지막 동기화: ${formatDateTime(state.serverTime)}`;
  renderDashboard(); renderParticipants(); renderSeatMap(); renderPrizeDraw(); renderSettings();
}
function renderDashboard() {
  const total=state.participants.length;
  const arrived=state.participants.filter(p=>p.arrived).length;
  const wheelchairTotal=state.participants.filter(p=>p.wheelchairUser).length;

  $('#statApplications').textContent=total.toLocaleString();
  $('#statTotal').textContent=total.toLocaleString();
  $('#statArrived').textContent=arrived.toLocaleString();
  $('#statRate').textContent=`${total?Math.round(arrived/total*1000)/10:0}%`;
  if($('#statWheelchair'))$('#statWheelchair').textContent=`${wheelchairTotal} / 15`;
  if($('#statCenterUsers'))$('#statCenterUsers').textContent=state.participants.filter(p=>p.usesCenter).length.toLocaleString();
  if($('#statDisabledPersons'))$('#statDisabledPersons').textContent=state.participants.filter(p=>p.disabledPerson).length.toLocaleString();
  if($('#statUnassigned'))$('#statUnassigned').textContent=state.participants.filter(p=>!String(p.seat||'').trim()).length.toLocaleString();

  const recent=state.participants
    .filter(p=>p.arrived&&p.checkInAt)
    .sort((a,b)=>new Date(b.checkInAt)-new Date(a.checkInAt))
    .slice(0,8);

  const c=$('#recentCheckins');
  if(!recent.length){
    c.className='empty-state';
    c.textContent='아직 도착한 참가자가 없습니다.';
    return;
  }

  c.className='recent-list';
  c.innerHTML=recent.map(p=>`<div class="recent-item"><div><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.seat||'좌석 미정')}${p.organization?' · '+escapeHtml(p.organization):''}</span></div><span>${escapeHtml(formatDateTime(p.checkInAt))}</span></div>`).join('');
}
function prizeForParticipant(p){
  const seat=parseSeatList(p?.seat)[0]||'';
  return state.prizes.find(x=>normalizeSeat(x.seat)===normalizeSeat(seat))||null;
}

function filteredParticipants() {
  const q=($('#participantSearch')?.value||'').trim().toLowerCase();
  const st=$('#participantStatusFilter')?.value||'all';

  return [...state.participants].filter(p=>{
    const hay=[
      p.id,p.number,p.name,p.phone,p.organization,p.seat,p.note,
      p.usesCenter?'복지관 이용':'',
      p.wheelchairUser?'휠체어':'',
      p.disabledPerson?'장애인 당사자':''
    ].join(' ').toLowerCase();

    return(!q||hay.includes(q))&&
      (st==='all'||(st==='arrived'?p.arrived:!p.arrived));
  }).sort((a,b)=>a.number-b.number);
}

function renderParticipants() {
  const rows=filteredParticipants();
  $('#participantCountLabel').textContent=
    `${rows.length}명 표시 / 전체 ${state.participants.length}명`;

  $('#participantTableBody').innerHTML=rows.length
    ?rows.map(p=>{
      const prize=prizeForParticipant(p);
      const centerInfo=p.disabledPerson
        ?(p.usesCenter?'복지관 서비스 이용':'복지관 서비스 미이용')
        :'편의제공 해당 없음';

      const flags=[
        p.wheelchairUser?'♿ 휠체어':'',
        p.disabledPerson?'장애인 당사자':''
      ].filter(Boolean).join(' · ');

      const prizeHtml=prize
        ?`<span class="lucky-mini ${prize.redeemed?'redeemed':''}">${prize.redeemed?'수령완료':'당첨'} · ${escapeHtml(prize.prizeName)}</span>`
        :'<span class="small-text">-</span>';

      return `<tr>
        <td>${String(p.number).padStart(4,'0')}</td>
        <td><strong>${escapeHtml(p.name)}</strong><br><span class="small-text">${escapeHtml(p.organization||'소속 없음')} · ${escapeHtml(p.id)}</span></td>
        <td>${escapeHtml(maskPhone(p.phone))}</td>
        <td><span>${centerInfo}</span>${flags?`<br><span class="small-text">${escapeHtml(flags)}</span>`:''}</td>
        <td><strong>${escapeHtml(p.seat||'미배정')}</strong></td>
        <td>${prizeHtml}</td>
        <td><span class="badge ${p.arrived?'arrived':'pending'}">${p.arrived?'도착':'미도착'}</span></td>
        <td><div class="row-actions">
          <button class="button small secondary" data-action="qr" data-id="${escapeHtml(p.id)}">QR</button>
          <button class="button small secondary" data-action="edit" data-id="${escapeHtml(p.id)}">수정</button>
          <button class="button small ${p.arrived?'secondary':'primary'}" data-action="toggle" data-id="${escapeHtml(p.id)}">${p.arrived?'도착 취소':'도착 처리'}</button>
          <button class="button small secondary" data-action="delete" data-id="${escapeHtml(p.id)}">사용중지</button>
        </div></td>
      </tr>`;
    }).join('')
    :'<tr><td colspan="8"><div class="empty-state">참가자가 없습니다.</div></td></tr>';
}
function seatMetaByCode(){const m=new Map();state.seatMeta.forEach(s=>m.set(normalizeSeat(s.code),s));return m}
function seatOccupantMap(){const m=new Map();state.participants.forEach(p=>parseSeatList(p.seat).forEach(c=>m.set(normalizeSeat(c),p)));return m}
function zoneClass(c){const v=String(c||'').toLowerCase();if(v.includes('vip'))return'zone-vip';if(v.includes('장애인지정'))return'zone-disabled-priority';if(v.includes('휠체어'))return'zone-wheelchair';if(v.includes('관계자'))return'zone-staff';if(v.includes('추가')||v.includes('예비'))return'zone-extra';if(v.includes('사용안함'))return'zone-disabled';return'zone-general'}
function isWheelchairPersonSeat(p,code){if(!p||!p.wheelchairUser)return false;const target=normalizeSeat(code),list=(p.wheelchairSeats||[]).map(normalizeSeat);if(list.length)return list.includes(target);const seats=parseSeatList(p.seat).map(c=>{const m=normalizeSeat(c).match(/^([A-O])R-(\d{2})$/);return m?{code:normalizeSeat(c),row:m[1],n:Number(m[2])}:null}).filter(Boolean),count=p.wheelchairUser?1:0,out=[];for(const row of 'ABCDEFGHIJKLMNO'.split('')){const rs=seats.filter(s=>s.row===row).sort((a,b)=>b.n-a.n);if(!rs.some(s=>s.n===15))continue;for(const s of rs){if(out.length>=count)break;out.push(s.code)}if(out.length>=count)break}return out.includes(target)}
function seatButton(code,meta,p){const cls=['runway-seat',zoneClass(meta?.category)];const disabledPriority=String(meta?.category||'').includes('장애인지정');if(meta?.wheelchairEligible)cls.push('wheelchair-anchor');if(disabledPriority)cls.push('disabled-priority-seat');const wcSeat=isWheelchairPersonSeat(p,code);if(wcSeat)cls.push('wheelchair-person');if(meta?.enabled===false)cls.push('disabled-seat');else if(p?.arrived)cls.push('arrived');else if(p)cls.push('pending');else cls.push('empty');const title=code+' · '+(meta?.category||'일반')+(disabledPriority?' · 장애인 당사자 우선 좌석':'')+(meta?.wheelchairEligible?' · 휠체어 접근성 슬롯':'')+(wcSeat?' · 휠체어 위치':'')+(p?' · '+p.name:'');const icon=meta?.wheelchairEligible||wcSeat?'<i class="wheelchair-seat-icon">♿</i>':disabledPriority?'<i class="disabled-priority-icon">우선</i>':'';return `<button class="${cls.join(' ')}" type="button" data-seat-code="${escapeHtml(code)}" title="${escapeHtml(title)}">${icon}<strong>${code.split('-')[1]}</strong>${p?`<span>${escapeHtml(p.name)}</span>`:''}</button>`}
function runwayRow(row,leftN,rightN,mm,om){let l='',r='';for(let i=1;i<=leftN;i++){const c=`${row}L-${String(i).padStart(2,'0')}`;l+=seatButton(c,mm.get(c),om.get(c))}for(let i=1;i<=rightN;i++){const c=`${row}R-${String(i).padStart(2,'0')}`;r+=seatButton(c,mm.get(c),om.get(c))}return `<div class="runway-row"><div class="runway-side runway-left"><span class="runway-row-label">${row}L</span><div class="runway-side-seats">${l}</div></div><div class="runway-spine"><span>${row}</span></div><div class="runway-side runway-right"><div class="runway-side-seats">${r}</div><span class="runway-row-label">${row}R</span></div></div>`}
function renderSeatMap(){const mm=seatMetaByCode(),om=seatOccupantMap();$('#seatMap').innerHTML='ABCDEFGHIJKLMNO'.split('').map(r=>runwayRow(r,15,15,mm,om)).join('');if($('#extraSeatMap'))$('#extraSeatMap').innerHTML=''}
function renderSettings(){
  $('#eventName').value=state.settings.eventName||'';$('#eventDate').value=state.settings.eventDate||'';$('#eventVenue').value=state.settings.eventVenue||'';$('#eventOrganizer').value=state.settings.eventOrganizer||'';$('#autoRefreshSeconds').value=state.settings.autoRefreshSeconds||15;$('#publicSubtitle').value=state.settings.publicSubtitle||'';$('#publicGreeting').value=state.settings.publicGreeting||'';$('#privacyRetentionText').value=state.settings.privacyRetentionText||'';$('#registrationOpen').value=String(state.settings.registrationOpen!==false);$('#registrationCapacity').value=state.settings.registrationCapacity||450;$('#autoAssignSeat').value=String(state.settings.autoAssignSeat!==false);$('#ticketRefreshSeconds').value=state.settings.ticketRefreshSeconds||15;$('#stationName').value=session.station||'관리자 웹';
}
function findById(id){return state.participants.find(p=>p.id===id)}
function findMatches(q){
  const v=String(q||'').trim().toLowerCase();if(!v)return[];
  const parsed=parseQrPayload(v).toLowerCase();
  const exact=state.participants.find(p=>String(p.id).toLowerCase()===parsed);if(exact)return[exact];
  return state.participants.filter(p=>[p.id,p.name,p.phone,p.organization,p.seat,p.number,p.note].some(x=>String(x||'').toLowerCase().includes(v))).slice(0,20)
}
async function checkIn(pOrCode){
  const code=typeof pOrCode==='string'?parseQrPayload(pOrCode):pOrCode.id;
  scanBusy=true;
  try{
    const r=await jsonpRequest('checkIn',{code});
    updateCache(r.participant);
    showCheckinResult(r.participant,r.already,r.prize||null);
    showToast(
      r.already
        ?'이미 도착 처리된 참가자입니다.'
        :`${r.participant.name} 님 도착 완료`
    );
  }finally{
    scanBusy=false;
  }
}

async function undoCheckIn(p){
  const u=await jsonpRequest('undoCheckIn',{code:p.id});
  updateCache(u);
  showCheckinResult(u,false,prizeForParticipant(u));
  showToast(`${u.name} 님 도착을 취소했습니다.`);
}

function showCheckinResult(p,already=false,prize=null){
  $('#checkinResultPanel').classList.remove('hidden');

  const profile=[
    p.organization?`소속 · ${p.organization}`:'',
    p.disabledPerson?(p.usesCenter?'복지관 서비스 이용':'복지관 서비스 미이용'):'편의제공 해당 없음',
    p.wheelchairUser?'♿ 휠체어 이용':'',
    p.disabledPerson?'장애인 당사자':''
  ].filter(Boolean);

  let prizeBox='';
  if(prize){
    prizeBox=`<div class="winner-alert ${prize.redeemed?'redeemed':''}">
      <span>${prize.redeemed?'상품 수령 확인':'🎉 행운추첨 당첨'}</span>
      <strong>${escapeHtml(p.name)} 님은 ${escapeHtml(prize.prizeName)} 당첨자입니다.</strong>
      <p>당첨 좌석 ${escapeHtml(prize.seat)}${prize.redeemed&&prize.redeemedAt?' · 수령 '+escapeHtml(formatDateTime(prize.redeemedAt)):''}</p>
      ${prize.redeemed
        ?`<button class="button secondary" data-result="undo-prize" data-seat="${escapeHtml(prize.seat)}">상품 수령취소</button>`
        :`<button class="button lucky-primary" data-result="redeem-prize" data-id="${escapeHtml(p.id)}">상품 수령완료</button>`}
    </div>`;
  }else{
    prizeBox=`<div class="not-winner-alert"><strong>행운추첨 당첨 좌석이 아닙니다.</strong><span>현재 좌석 ${escapeHtml(p.seat||'미배정')}</span></div>`;
  }

  $('#checkinResult').innerHTML=`<div class="result-card ${already?'already':''}">
    <span class="badge ${p.arrived?'arrived':'pending'}">${already?'이미 도착 처리됨':p.arrived?'도착 완료':'미도착'}</span>
    <h3>${escapeHtml(p.name)} 님</h3>
    <p>${profile.map(escapeHtml).join(' · ')}</p>
    <div class="seat-large">${escapeHtml(p.seat||'좌석 미배정')}</div>
    ${prizeBox}
    <p>접수번호 ${String(p.number).padStart(4,'0')}</p>
    <p>연락처 ${escapeHtml(maskPhone(p.phone))}</p>
    ${p.note?`<p class="participant-note"><strong>관리자 메모</strong><br>${escapeHtml(p.note)}</p>`:''}
    <p class="small-text">${p.arrived?'도착 시각: '+escapeHtml(formatDateTime(p.checkInAt)):'아직 도착하지 않았습니다.'}</p>
    <div class="result-actions">
      ${p.arrived
        ?`<button class="button secondary" data-result="undo" data-id="${escapeHtml(p.id)}">도착 취소</button>`
        :`<button class="button primary" data-result="checkin" data-id="${escapeHtml(p.id)}">도착 처리</button>`}
      <button class="button secondary" data-result="qr" data-id="${escapeHtml(p.id)}">QR 보기</button>
    </div>
  </div>`;

  $('#checkinResultPanel').scrollIntoView({behavior:'smooth',block:'center'});
}
async function handleScanned(text){const now=Date.now();if(scanBusy||(text===lastScannedText&&now-lastScannedAt<3000))return;lastScannedText=text;lastScannedAt=now;try{await checkIn(text)}catch(e){showToast(e.message,4500);$('#checkinResultPanel').classList.remove('hidden');$('#checkinResult').innerHTML=`<div class="empty-state"><strong>${escapeHtml(e.message)}</strong></div>`}}
function startScanner(){if(scannerRunning)return;if(typeof Html5QrcodeScanner==='undefined')return showToast('QR 스캐너 라이브러리를 불러오지 못했습니다.');$('#reader').innerHTML='';scanner=new Html5QrcodeScanner('reader',{fps:10,qrbox:{width:230,height:230},rememberLastUsedCamera:true,supportedScanTypes:[Html5QrcodeScanType.SCAN_TYPE_CAMERA,Html5QrcodeScanType.SCAN_TYPE_FILE]},false);scanner.render(t=>handleScanned(t),()=>{});scannerRunning=true;$('#toggleScannerButton').textContent='카메라 종료'}
async function stopScanner(){if(!scannerRunning||!scanner)return;try{await scanner.clear()}catch(_){}scanner=null;scannerRunning=false;$('#reader').innerHTML='<p>카메라 시작 버튼을 눌러주세요.</p>';$('#toggleScannerButton').textContent='카메라 시작'}
function openModal(title,html){$('#modalTitle').textContent=title;$('#modalContent').innerHTML=html;$('#modalBackdrop').classList.remove('hidden');document.body.style.overflow='hidden'}
function closeModal(){$('#modalBackdrop').classList.add('hidden');document.body.style.overflow=''}

function seatPersonMatches(query){
  const q=String(query||'').trim().toLowerCase();
  if(!q)return[];
  const digits=q.replace(/\D/g,'');
  return state.participants.filter(p=>{
    const phoneDigits=String(p.phone||'').replace(/\D/g,'');
    const hay=[p.name,p.organization,p.note,p.phone,p.id,p.number,p.seat,p.usesCenter?'복지관 서비스 이용':'',p.wheelchairUser?'휠체어':'',p.disabledPerson?'장애인 당사자':''].join(' ').toLowerCase();
    return hay.includes(q)||(digits.length>=3&&phoneDigits.includes(digits));
  }).sort((a,b)=>{
    const aq=String(a.name||'').toLowerCase().startsWith(q)?0:1;
    const bq=String(b.name||'').toLowerCase().startsWith(q)?0:1;
    return aq-bq||a.number-b.number;
  }).slice(0,30);
}
function seatPersonResultHtml(p,action='seat-search-pick'){
  return `<button class="seat-person-result ${p.wheelchairRequired?'wheelchair-requester':''}" type="button" data-${action}="${escapeHtml(p.id)}">
    <div class="seat-person-main">
      <strong>${escapeHtml(p.name)} ${p.disabledPerson?'<span class="disabled-person-badge">장애인 당사자</span>':''} ${p.wheelchairUser?'<span class="wheelchair-badge">♿ 휠체어</span>':''}</strong>
      <span>${escapeHtml(maskPhone(p.phone))}${p.programName?' · '+escapeHtml(p.programName):''}</span>
    </div>
    <div class="seat-person-meta">
      <b>개인</b>
      <span>${escapeHtml(p.seat||'미배정')}</span>
    </div>
  </button>`;
}
function renderSeatSearchResults(query,host,action='seat-search-pick'){
  const matches=seatPersonMatches(query);
  host.innerHTML=matches.length?matches.map(p=>seatPersonResultHtml(p,action)).join(''):'<div class="empty-state compact">일치하는 참가자가 없습니다.</div>';
}
function updateSeatSelectedPersonBanner(){
  const host=$('#seatSelectedPersonBanner');
  if(!host)return;
  const p=findById(selectedSeatParticipantId);
  if(!p){host.classList.add('hidden');host.innerHTML='';return;}
  host.classList.remove('hidden');
  host.innerHTML=`<div><strong>${escapeHtml(p.name)} ${p.disabledPerson?'<span class="disabled-person-badge">장애인 당사자</span>':''} ${p.wheelchairUser?'<span class="wheelchair-badge">♿ 휠체어</span>':''}</strong><span>${escapeHtml(maskPhone(p.phone))} · 개인 · 현재 ${escapeHtml(p.seat||'미배정')}</span></div><div><b>배정할 좌석을 지도에서 클릭하세요.</b><button id="clearSeatSelectedPerson" class="button small secondary" type="button">선택 해제</button></div>`;
  $('#clearSeatSelectedPerson')?.addEventListener('click',()=>{selectedSeatParticipantId='';updateSeatSelectedPersonBanner();});
}
async function assignSelectedPersonToSeat(p,code){
  const occupant=state.participants.find(x=>x.id!==p.id&&parseSeatList(x.seat).includes(code));
  const replace=Boolean(occupant);
  if(replace&&!confirm(`${code}은 현재 ${occupant.name} 님 좌석입니다.\n${p.name} 님을 이 자리로 옮기면 ${occupant.name} 님은 좌석 미배정 상태가 됩니다.\n계속할까요?`))return;
  await jsonpRequest('assignSeatFromMap',{participantCode:p.id,targetSeat:code,replaceCurrent:replace});
  await refreshFromServer({silent:true});
  selectedSeatParticipantId='';
  updateSeatSelectedPersonBanner();
  showToast(`${p.name} 님을 ${code}부터 배정/이동했습니다.`);
}
function showSeatAssignmentModal(seatCode){
  const code=normalizeSeat(seatCode),meta=state.seatMeta.find(s=>normalizeSeat(s.code)===code)||{},occupant=state.participants.find(p=>parseSeatList(p.seat).includes(code));
  openModal(`${code} 좌석 관리`,`<div class="seat-manage-summary"><div><span>좌석</span><strong>${escapeHtml(code)}</strong></div><div><span>구역</span><strong>${escapeHtml(meta.category||'일반')}${meta.wheelchairEligible?' · ♿':''}</strong></div><div><span>현재 배정</span><strong>${occupant?escapeHtml(occupant.name):'빈 좌석'}</strong></div></div>
  <div class="stack-form seat-modal-search">
    <label>참가자 검색<input id="seatModalPersonSearch" autocomplete="off" placeholder="이름 / 전화번호 / 프로그램명"></label>
    <div id="seatModalPersonResults" class="seat-person-search-results"><div class="empty-state compact">검색해서 참가자를 선택하세요.</div></div>
    <p class="help-text">이미 다른 좌석에 있는 참가자를 선택해도 됩니다. 기존 좌석은 자동으로 비우고 선택한 개인 참가자를 이 좌석으로 이동합니다.</p>
    ${occupant?`<button id="unassignCurrentSeatButton" class="button secondary" type="button">현재 ${escapeHtml(occupant.name)} 님 좌석 전체 비우기</button>`:''}
  </div>
  <hr class="modal-separator">
  <form id="singleSeatZoneForm" class="stack-form"><h3>이 좌석 속성</h3><label>구역명<input id="singleSeatCategory" list="seatCategoryPresets" value="${escapeHtml(meta.category||'일반')}"></label><label>일반 자동배정<select id="singleSeatAuto"><option value="true" ${meta.autoAssignable?'selected':''}>허용</option><option value="false" ${!meta.autoAssignable?'selected':''}>제외</option></select></label><label>좌석 사용<select id="singleSeatEnabled"><option value="true" ${meta.enabled!==false?'selected':''}>사용</option><option value="false" ${meta.enabled===false?'selected':''}>사용안함</option></select></label><label>휠체어 자동배정 위치<select id="singleSeatWheelchair"><option value="false" ${!meta.wheelchairEligible?'selected':''}>아님</option><option value="true" ${meta.wheelchairEligible?'selected':''}>휠체어 위치</option></select></label><label>메모<input id="singleSeatNote" value="${escapeHtml(meta.note||'')}"></label><button class="button secondary" type="submit">좌석 속성 저장</button></form>`);
  const search=$('#seatModalPersonSearch'),results=$('#seatModalPersonResults');
  search?.addEventListener('input',()=>renderSeatSearchResults(search.value,results,'seat-modal-pick'));
  results?.addEventListener('click',async e=>{
    const b=e.target.closest('[data-seat-modal-pick]');if(!b)return;
    const p=findById(b.dataset.seatModalPick);if(!p)return;
    try{await assignSelectedPersonToSeat(p,code);closeModal();}catch(err){showToast(err.message,5200)}
  });
  $('#unassignCurrentSeatButton')?.addEventListener('click',async ()=>{
    if(!occupant)return;if(!confirm(`${occupant.name} 님의 현재 좌석 전체를 비울까요?`))return;
    try{await jsonpRequest('unassignSeat',{participantCode:occupant.id});await refreshFromServer({silent:true});closeModal();showToast(`${occupant.name} 님 좌석을 미배정으로 변경했습니다.`)}catch(err){showToast(err.message,5000)}
  });
  $('#singleSeatZoneForm')?.addEventListener('submit',async e=>{
    e.preventDefault();try{state.seatMeta=await jsonpRequest('saveSeatMeta',{seats:code,category:$('#singleSeatCategory').value.trim()||'일반',autoAssignable:$('#singleSeatAuto').value==='true',enabled:$('#singleSeatEnabled').value==='true',wheelchairEligible:$('#singleSeatWheelchair').value==='true',note:$('#singleSeatNote').value.trim()});renderSeatMap();closeModal();showToast('좌석 속성을 저장했습니다.')}catch(err){showToast(err.message,5000)}
  });
}

function participantProfileText(p){
  const list=[];
  if(p.organization)list.push(`소속 · ${p.organization}`);
  list.push(p.disabledPerson?(p.usesCenter?'복지관 서비스 이용':'복지관 서비스 미이용'):'편의제공 해당 없음');
  if(p.wheelchairUser)list.push('♿ 휠체어 이용');
  if(p.disabledPerson)list.push('장애인 당사자');
  return list.join(' · ');
}

function showQr(p){
  const prize=prizeForParticipant(p);
  openModal(`${p.name} 님 QR`,`<div class="qr-detail">
    <div id="singleQrCode" class="qr-code-box"></div>
    <div class="detail-list">
      <div><dt>접수번호</dt><dd>${String(p.number).padStart(4,'0')}</dd></div>
      <div><dt>참가자</dt><dd>${escapeHtml(p.name)}</dd></div>
      <div><dt>연락처</dt><dd>${escapeHtml(maskPhone(p.phone))}</dd></div>
      <div><dt>참가정보</dt><dd>${escapeHtml(participantProfileText(p))}</dd></div>
      <div><dt>좌석</dt><dd>${escapeHtml(p.seat||'미배정')}</dd></div>
      <div><dt>행운추첨</dt><dd>${prize?escapeHtml(prize.prizeName)+(prize.redeemed?' · 수령완료':' · 당첨'):'당첨 아님'}</dd></div>
      <div><dt>상태</dt><dd>${p.arrived?'도착':'미도착'}</dd></div>
    </div>
  </div>`);
  new QRCode($('#singleQrCode'),{
    text:qrPayload(p),
    width:220,
    height:220,
    correctLevel:QRCode.CorrectLevel.H
  });
}

function showSeatDetail(p){
  const prize=prizeForParticipant(p);
  openModal(`${p.name} 님 정보`,`<div class="detail-list">
    <div><dt>참가자</dt><dd>${escapeHtml(p.name)}</dd></div>
    <div><dt>참가정보</dt><dd>${escapeHtml(participantProfileText(p))}</dd></div>
    <div><dt>좌석</dt><dd>${escapeHtml(p.seat||'미배정')}</dd></div>
    <div><dt>행운추첨</dt><dd>${prize?escapeHtml(prize.prizeName)+(prize.redeemed?' · 수령완료':' · 당첨'):'당첨 아님'}</dd></div>
    <div><dt>상태</dt><dd>${p.arrived?'도착 완료':'미도착'}</dd></div>
    <div><dt>연락처</dt><dd>${escapeHtml(maskPhone(p.phone))}</dd></div>
    <div><dt>도착 시각</dt><dd>${escapeHtml(formatDateTime(p.checkInAt))}</dd></div>
    <div><dt>비고</dt><dd>${escapeHtml(p.note||'-')}</dd></div>
  </div>
  <div class="form-actions" style="margin-top:16px">
    <button id="seatDetailEditButton" class="button primary" type="button">정보 수정</button>
  </div>`);
  $('#seatDetailEditButton')?.addEventListener('click',()=>showEdit(p));
}

function showEdit(p){
  openModal('개인 참가자 정보 수정',`<form id="editParticipantForm" class="form-grid">
    <label>이름<input name="name" required value="${escapeHtml(p.name)}"></label>
    <label>소속기관<input name="organization" maxlength="80" value="${escapeHtml(p.organization||'')}" placeholder="해당사항 없으면 공란"></label>
    <label>핸드폰 번호<input name="phone" value="${escapeHtml(p.phone||'')}"></label>
    <label>장애인 당사자<select name="disabledPerson"><option value="false" ${!p.disabledPerson?'selected':''}>해당 없음</option><option value="true" ${p.disabledPerson?'selected':''}>장애인 당사자</option></select></label>
    <label>휠체어<select name="wheelchairUser"><option value="false" ${!p.wheelchairUser?'selected':''}>미사용</option><option value="true" ${p.wheelchairUser?'selected':''}>사용</option></select></label>
    <label>복지관 서비스<select name="usesCenter"><option value="false" ${!p.usesCenter?'selected':''}>이용하지 않음</option><option value="true" ${p.usesCenter?'selected':''}>이용함</option></select></label>
    <label class="wide">좌석번호<input name="seat" maxlength="30" value="${escapeHtml(p.seat||'')}" placeholder="예: CL-01"></label>
    <label class="wide">관리자 메모<textarea name="note" maxlength="500" rows="4">${escapeHtml(p.note||'')}</textarea></label>
    <div class="form-actions wide"><button class="button primary" type="submit">저장</button></div>
  </form>`);

  $('#editParticipantForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const b=e.currentTarget.querySelector('button');
    b.disabled=true;
    try{
      const v=Object.fromEntries(new FormData(e.currentTarget).entries());
      v.usesCenter=v.usesCenter==='true';
      v.wheelchairUser=v.wheelchairUser==='true';
      v.disabledPerson=v.disabledPerson==='true';
      if(!v.disabledPerson){
        v.wheelchairUser=false;
        v.usesCenter=false;
      }
      v.programName='';
      const u=await jsonpRequest('updateParticipant',{code:p.id,...v});
      updateCache(u);
      closeModal();
      showToast('수정했습니다.');
    }catch(err){
      showToast(err.message,4500);
    }finally{
      b.disabled=false;
    }
  });
}

function exportCsv(){
  const h=[
    '접수번호','QR고유코드','이름','핸드폰번호','소속기관','좌석번호',
    '장애인당사자여부','휠체어사용여부','복지관서비스이용여부',
    '관리자메모','행운추첨상품','상품수령여부',
    '도착여부','도착시각','개인정보동의','동의일시','동의서버전'
  ];

  const rows=state.participants.map(p=>{
    const prize=prizeForParticipant(p);
    return[
      p.number,p.id,p.name,p.phone,p.organization||'',p.seat,
      p.disabledPerson?'예':'아니오',
      p.wheelchairUser?'사용':'미사용',
      p.usesCenter?'이용함':'이용하지 않음',
      p.note||'',
      prize?.prizeName||'',prize?.redeemed?'수령완료':prize?'미수령':'',
      p.arrived?'도착':'미도착',p.checkInAt||'',
      p.privacyConsentConfirmed?'동의':'온라인동의기록없음',
      p.privacyConsentConfirmedAt||'',p.privacyConsentVersion||''
    ];
  });

  const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;
  const csv='\uFEFF'+[h,...rows].map(r=>r.map(esc).join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`20주년_개인참가자명단_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function drawParticipantForSeat(seat){
  const target=normalizeSeat(seat);
  return state.participants.find(p=>parseSeatList(p.seat).includes(target))||null;
}

function filteredDrawPrizes(){
  const q=String($('#drawSearch')?.value||'').trim().toLowerCase();
  const pendingOnly=Boolean($('#drawPendingOnly')?.checked);
  return [...state.prizes].filter(prize=>{
    if(pendingOnly&&prize.redeemed)return false;
    const p=drawParticipantForSeat(prize.seat);
    const hay=[
      prize.seat,prize.prizeName,prize.note,
      p?.name,p?.phone
    ].join(' ').toLowerCase();
    return !q||hay.includes(q);
  }).sort((a,b)=>a.seat.localeCompare(b.seat));
}

function renderPrizeDraw(){
  const tbody=$('#drawPrizeTableBody');
  if(!tbody)return;

  const rows=filteredDrawPrizes();
  const redeemed=state.prizes.filter(x=>x.redeemed).length;
  const noOccupant=state.prizes.filter(x=>!drawParticipantForSeat(x.seat)).length;
  if($('#drawCountLabel')){
    $('#drawCountLabel').textContent=
      `당첨 좌석 ${state.prizes.length}개 · 수령완료 ${redeemed}개`;
  }
  if($('#drawStatTotal'))$('#drawStatTotal').textContent=state.prizes.length.toLocaleString();
  if($('#drawStatRedeemed'))$('#drawStatRedeemed').textContent=redeemed.toLocaleString();
  if($('#drawStatPending'))$('#drawStatPending').textContent=(state.prizes.length-redeemed).toLocaleString();
  if($('#drawStatNoOccupant'))$('#drawStatNoOccupant').textContent=noOccupant.toLocaleString();

  tbody.innerHTML=rows.length?rows.map(prize=>{
    const p=drawParticipantForSeat(prize.seat);
    return `<tr>
      <td><strong>${escapeHtml(prize.seat)}</strong></td>
      <td><strong>${escapeHtml(prize.prizeName)}</strong>${prize.note?`<br><span class="small-text">${escapeHtml(prize.note)}</span>`:''}</td>
      <td>${prize.redeemed&&prize.winnerName?`<strong>수령자: ${escapeHtml(prize.winnerName)}</strong>${p?`<br><span class="small-text">현재 좌석: ${escapeHtml(p.name)}</span>`:''}`:p?`<strong>${escapeHtml(p.name)}</strong><br><span class="small-text">${escapeHtml(maskPhone(p.phone))}</span>`:'<span class="small-text">현재 미배정</span>'}</td>
      <td><span class="badge ${prize.redeemed?'arrived':'pending'}">${prize.redeemed?'수령완료':'미수령'}</span>${prize.redeemedAt?`<br><span class="small-text">${escapeHtml(formatDateTime(prize.redeemedAt))}</span>`:''}</td>
      <td><div class="row-actions">
        ${prize.redeemed?`<button class="button small secondary" data-draw-action="undo" data-seat="${escapeHtml(prize.seat)}">수령취소</button>`:''}
        <button class="button small secondary" data-draw-action="delete" data-seat="${escapeHtml(prize.seat)}">삭제</button>
      </div></td>
    </tr>`;
  }).join(''):'<tr><td colspan="5"><div class="empty-state">등록된 당첨 좌석이 없습니다.</div></td></tr>';
}

function parseDrawBulkInput(text,note=''){
  const lines=String(text||'')
    .split(/\r?\n/)
    .map(x=>x.trim())
    .filter(Boolean);

  const entries=[];
  const errors=[];

  lines.forEach((line,index)=>{
    const parts=line.split('|');
    if(parts.length<2){
      errors.push(`${index+1}번째 줄: 좌석번호 | 상품명 형식으로 입력하세요.`);
      return;
    }

    const seat=parts.shift().trim();
    const prizeName=parts.join('|').trim();

    if(!seat||!prizeName){
      errors.push(`${index+1}번째 줄: 좌석번호와 상품명이 모두 필요합니다.`);
      return;
    }

    entries.push({seat,prizeName,note});
  });

  const seen=new Set();
  entries.forEach(entry=>{
    const seat=normalizeSeat(entry.seat);
    if(seen.has(seat))errors.push(`중복 좌석: ${seat}`);
    seen.add(seat);
  });
  if(errors.length)throw new Error(errors.join('\n'));
  return entries;
}


function exportDrawCsv(){
  const h=['좌석번호','상품명','현재좌석참가자','수령여부','수령자','수령시각','비고'];
  const rows=state.prizes.map(prize=>{
    const p=drawParticipantForSeat(prize.seat);
    return[
      prize.seat,prize.prizeName,p?.name||'',
      prize.redeemed?'수령완료':'미수령',
      prize.winnerName||'',prize.redeemedAt||'',prize.note||''
    ];
  });
  const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;
  const csv='\uFEFF'+[h,...rows].map(r=>r.map(esc).join(',')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=`20주년_행운추첨현황_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
function bindEvents(){
  $('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const b=$('#loginButton');b.disabled=true;$('#loginMessage').classList.add('hidden');try{await login($('#adminUsername').value.trim(),$('#adminPassword').value)}catch(err){showLogin(err.message)}finally{b.disabled=false}});$$('.nav-button').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));$$('[data-go]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.go)));$('#refreshDashboardButton').addEventListener('click',()=>refreshFromServer().catch(()=>{}));$('#exportCsvButton').addEventListener('click',exportCsv);$('#exportCsvDashboardButton').addEventListener('click',exportCsv);$('#participantSearch').addEventListener('input',renderParticipants);$('#participantStatusFilter').addEventListener('change',renderParticipants);
  $('#drawSearch')?.addEventListener('input',renderPrizeDraw);
  $('#drawPendingOnly')?.addEventListener('change',renderPrizeDraw);
  $('#drawExportButton')?.addEventListener('click',exportDrawCsv);
  $('#drawPrizeForm')?.addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,b=form.querySelector('button');b.disabled=true;try{const entries=parseDrawBulkInput($('#drawBulkInput').value,$('#drawPrizeNote').value.trim());state.prizes=await jsonpRequest('saveDrawPrizes',{entries});$('#drawBulkInput').value='';$('#drawPrizeNote').value='';renderPrizeDraw();renderParticipants();showToast(`${entries.length}개 당첨 좌석을 등록했습니다.`);}catch(err){showToast(err.message,5500)}finally{b.disabled=false}});
  $('#drawPrizeTableBody')?.addEventListener('click',async e=>{const b=e.target.closest('[data-draw-action]');if(!b)return;try{if(b.dataset.drawAction==='delete'){if(!confirm(`${b.dataset.seat} 당첨 설정을 삭제할까요?`))return;state.prizes=await jsonpRequest('deleteDrawPrize',{seat:b.dataset.seat});}if(b.dataset.drawAction==='undo'){if(!confirm(`${b.dataset.seat} 상품 수령 처리를 취소할까요?`))return;state.prizes=await jsonpRequest('undoPrizeRedeem',{seat:b.dataset.seat});}renderPrizeDraw();renderParticipants();showToast('행운추첨 정보를 변경했습니다.');}catch(err){showToast(err.message,5000)}});
  $('#seatParticipantSearchForm').addEventListener('submit',e=>{e.preventDefault();renderSeatSearchResults($('#seatParticipantSearchInput').value,$('#seatParticipantSearchResults'),'seat-search-pick')});
  $('#seatParticipantSearchInput').addEventListener('input',e=>{const q=e.currentTarget.value.trim();if(q.length>=2)renderSeatSearchResults(q,$('#seatParticipantSearchResults'),'seat-search-pick');else $('#seatParticipantSearchResults').innerHTML='<div class="empty-state compact">두 글자 이상 입력하세요.</div>'});
  $('#seatParticipantSearchResults').addEventListener('click',e=>{const b=e.target.closest('[data-seat-search-pick]');if(!b)return;selectedSeatParticipantId=b.dataset.seatSearchPick;updateSeatSelectedPersonBanner();const p=findById(selectedSeatParticipantId);showToast(`${p?.name||'참가자'} 선택됨. 배정할 좌석을 클릭하세요.`);});
  $('#participantForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,b=form.querySelector('button');b.disabled=true;try{const v=Object.fromEntries(new FormData(form).entries());v.usesCenter=v.usesCenter==='true';v.wheelchairUser=v.wheelchairUser==='true';v.disabledPerson=v.disabledPerson==='true';if(!v.disabledPerson){v.usesCenter=false;v.wheelchairUser=false;}v.programName='';const p=await jsonpRequest('createParticipant',v);updateCache(p);form.reset();showToast('개인 참가자를 등록했습니다.')}catch(err){showToast(err.message,4500)}finally{b.disabled=false}});
  $('#participantTableBody').addEventListener('click',async e=>{const b=e.target.closest('[data-action]');if(!b)return;const p=findById(b.dataset.id);if(!p)return;try{if(b.dataset.action==='qr')showQr(p);if(b.dataset.action==='edit')showEdit(p);if(b.dataset.action==='toggle')p.arrived?await undoCheckIn(p):await checkIn(p);if(b.dataset.action==='delete'&&confirm(`${p.name} 님 신청을 사용중지할까요?`)){await jsonpRequest('deleteParticipant',{code:p.id});state.participants=state.participants.filter(x=>x.id!==p.id);renderAll();showToast('사용중지했습니다.')}}catch(err){showToast(err.message,4500)}});
  $('#toggleScannerButton').addEventListener('click',()=>scannerRunning?stopScanner():startScanner());$('#manualCheckinForm').addEventListener('submit',e=>{e.preventDefault();const m=findMatches($('#manualCheckinInput').value);$('#manualSearchResults').innerHTML=m.length?m.map(p=>`<button class="search-result-button" data-manual-id="${escapeHtml(p.id)}"><strong>${escapeHtml(p.name)}${p.wheelchairUser?' · ♿':''}</strong><br><span>${escapeHtml(p.seat||'미배정')} · ${p.organization?escapeHtml(p.organization)+' · ':''}${escapeHtml(maskPhone(p.phone))}</span></button>`).join(''):'<div class="empty-state">찾지 못했습니다.</div>'});$('#manualSearchResults').addEventListener('click',e=>{const b=e.target.closest('[data-manual-id]');if(!b)return;const p=findById(b.dataset.manualId);if(p)showCheckinResult(p,p.arrived,prizeForParticipant(p))});$('#checkinResult').addEventListener('click',async e=>{const b=e.target.closest('[data-result]');if(!b)return;try{const resultAction=b.dataset.result;if(resultAction==='undo-prize'){state.prizes=await jsonpRequest('undoPrizeRedeem',{seat:b.dataset.seat});const currentId=$('#checkinResult [data-result="qr"]')?.dataset.id||'';const current=currentId?findById(currentId):null;if(current)showCheckinResult(current,true,prizeForParticipant(current));renderPrizeDraw();renderParticipants();showToast('상품 수령 처리를 취소했습니다.');return;}const p=findById(b.dataset.id);if(!p)return;if(resultAction==='checkin')await checkIn(p);if(resultAction==='undo')await undoCheckIn(p);if(resultAction==='qr')showQr(p);if(resultAction==='redeem-prize'){const r=await jsonpRequest('redeemPrize',{code:p.id});await refreshFromServer({silent:true});showCheckinResult(findById(p.id),true,r.prize);showToast(r.already?'이미 상품 수령 완료된 당첨자입니다.':'상품 수령완료 처리했습니다.');}}catch(err){showToast(err.message,4500)}});
  const seatClick=async e=>{const b=e.target.closest('[data-seat-code]');if(!b)return;const code=b.dataset.seatCode;if(selectedSeatParticipantId){const p=findById(selectedSeatParticipantId);if(!p){selectedSeatParticipantId='';updateSeatSelectedPersonBanner();return;}try{await assignSelectedPersonToSeat(p,code)}catch(err){showToast(err.message,5200)}return;}showSeatAssignmentModal(code)};$('#seatMap').addEventListener('click',seatClick);$('#extraSeatMap')?.addEventListener('click',seatClick);
  $('#seatZoneForm').addEventListener('submit',async e=>{e.preventDefault();try{state.seatMeta=await jsonpRequest('saveSeatMeta',{seats:$('#seatZoneSeats').value.trim(),category:$('#seatZoneCategory').value.trim()||'일반',autoAssignable:$('#seatZoneAuto').value==='true',enabled:$('#seatZoneEnabled').value==='true',wheelchairEligible:$('#seatZoneWheelchair').value==='true',note:$('#seatZoneNote').value.trim()});renderSeatMap();showToast('좌석 구역을 저장했습니다.')}catch(err){showToast(err.message,5200)}});
  $('#eventSettingsForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button');b.disabled=true;session.station=$('#stationName').value.trim()||'관리자 웹';localStorage.setItem(STORAGE.STATION,session.station);const s={eventName:$('#eventName').value.trim(),eventDate:$('#eventDate').value.trim(),eventVenue:$('#eventVenue').value.trim(),eventOrganizer:$('#eventOrganizer').value.trim(),autoRefreshSeconds:Number($('#autoRefreshSeconds').value)||15,publicSubtitle:$('#publicSubtitle').value.trim(),publicGreeting:$('#publicGreeting').value.trim(),privacyRetentionText:$('#privacyRetentionText').value.trim(),registrationOpen:$('#registrationOpen').value==='true',registrationCapacity:Math.min(450,Number($('#registrationCapacity').value)||450),autoAssignSeat:$('#autoAssignSeat').value==='true',ticketRefreshSeconds:Number($('#ticketRefreshSeconds').value)||15};try{state.settings=await jsonpRequest('saveSettings',s);renderAll();scheduleRefresh();showToast('설정을 저장했습니다.')}catch(err){showToast(err.message,4500)}finally{b.disabled=false}});
  $('#logoutButton').addEventListener('click',logout);$('#logoutButtonTop').addEventListener('click',logout);$('#closeModalButton').addEventListener('click',closeModal);$('#modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
}

async function initialize(){
  bindEvents();
  if(!validateApiUrl(API_URL)){showLogin('config.js에 Apps Script /exec 주소가 설정되지 않았습니다.');return;}
  if(!isSessionLocallyValid()){clearSession();showLogin();return;}
  setStatus('warning','로그인 확인 중');
  try{await refreshFromServer({silent:true})}catch(err){showLogin(err.message)}
}

document.addEventListener('DOMContentLoaded',initialize);
