'use strict';

const ADMIN_UI_VERSION = '3.3-300-AK-VIP';

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
  registrationCapacity: 300,
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
let extrasLoaded = false;
let extrasLoadingPromise = null;
let lastCoreRefreshAt = 0;
let scanner = null;
let scannerRunning = false;
let scanBusy = false;
let nativeScannerStream = null;
let nativeScannerVideo = null;
let nativeScannerFrame = null;
let nativeScannerDetector = null;
let nativeScannerLastDetectAt = 0;
let scannerMode = 'idle';
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
  setTimeout(() => $('#adminPassword')?.focus(), 80);
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

async function login(password) {
  const data = await jsonpRequest('adminLogin', { password }, { auth:false });
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

async function loadBootstrapExtras({force=false,silent=true}={}){
  if(extrasLoaded&&!force)return;
  if(extrasLoadingPromise)return extrasLoadingPromise;

  extrasLoadingPromise=(async()=>{
    try{
      const data=await jsonpRequest('bootstrapExtras');
      state.seatMeta=Array.isArray(data.seatMeta)?data.seatMeta:[];
      state.prizes=Array.isArray(data.prizes)?data.prizes:[];
      if(data.serverTime)state.serverTime=data.serverTime;
      extrasLoaded=true;
      renderAll();
    }catch(error){
      if(!silent)showToast(error.message,4500);
      throw error;
    }finally{
      extrasLoadingPromise=null;
    }
  })();

  return extrasLoadingPromise;
}

async function refreshFromServer({ silent=false, full=false }={}) {
  if (!silent) setStatus('warning','동기화 중');

  try {
    const data = await jsonpRequest(full?'bootstrap':'bootstrapCore');

    state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || state.settings || {}) };
    state.participants = Array.isArray(data.participants) ? data.participants : state.participants;
    if(full){
      state.seatMeta = Array.isArray(data.seatMeta) ? data.seatMeta : [];
      state.prizes = Array.isArray(data.prizes) ? data.prizes : [];
      extrasLoaded=true;
    }

    state.serverTime = data.serverTime || new Date().toISOString();
    lastCoreRefreshAt=Date.now();

    renderAll();
    refreshFieldStats();
    setStatus('connected','연결됨');
    hideLogin();
    scheduleRefresh();

    // 첫 화면은 기다리지 않고 표시하고, 무거운 좌석/경품 데이터는 뒤에서 한 번만 로드
    if(!full&&!extrasLoaded){
      setTimeout(()=>loadBootstrapExtras({silent:true}).catch(()=>{}),250);
    }
  } catch (error) {
    if (!/로그인|만료/.test(error.message)) setStatus('error','연결 오류');
    if (!silent) showToast(error.message,4500);
    throw error;
  }
}

function scheduleRefresh() {
  clearInterval(refreshTimer);
  // 기존 최소 5초 대신 최소 20초. 기본 설정 15초여도 서버 과호출을 방지.
  const configured = Number(state.settings.autoRefreshSeconds) || 30;
  const sec = Math.max(20, configured);
  refreshTimer = setInterval(() => {
    if (!document.hidden && !scanBusy && session.token) {
      refreshFromServer({silent:true,full:false}).catch(()=>{});
    }
  }, sec*1000);
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
  if(['seats','raffle','lucky','roulette'].includes(name)&&!extrasLoaded){
    loadBootstrapExtras({silent:false}).catch(()=>{});
  }
  if(name==='seats') renderSeatMap();
  if(name==='draw') renderPrizeDraw();
  window.scrollTo({top:0,behavior:'smooth'});
}

let excelImportRows=[];

function renderCompanionSearch(){
  const box=$('#companionSearchResults');
  if(!box)return;
  const q=String($('#companionSearchInput')?.value||'').trim().toLowerCase();
  if(!q){box.innerHTML='<div class="empty-state compact">이름이나 기관을 검색하세요.</div>';return;}
  const rows=state.participants.filter(p=>String(p.name||'').toLowerCase().includes(q)||String(p.organization||'').toLowerCase().includes(q)).slice(0,50);
  box.innerHTML=rows.length?rows.map(p=>`<label class="companion-result-item"><input type="checkbox" value="${escapeHtml(p.id)}" /><span><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.organization||'소속기관 없음')} · ${escapeHtml(p.seat||'미배정')}${p.companionGroup?` · 동반 ${escapeHtml(p.companionGroup)}`:''}</small></span></label>`).join(''):'<div class="empty-state compact">검색 결과가 없습니다.</div>';
}
function selectedCompanionIds(){return[...document.querySelectorAll('#companionSearchResults input:checked')].map(x=>x.value)}
async function linkCompanions(){const ids=selectedCompanionIds();if(ids.length<2){showToast('같이 앉을 사람을 2명 이상 선택해 주세요.',4200);return;}const r=await jsonpRequest('adminLinkCompanions',{ids});showToast(`${r.count}명을 동반좌석 그룹으로 묶었습니다.`);await refreshFromServer({silent:true});renderCompanionSearch()}
async function clearCompanions(){const ids=selectedCompanionIds();if(!ids.length){showToast('묶기 해제할 참가자를 선택해 주세요.',4200);return;}await jsonpRequest('adminClearCompanions',{ids});showToast('동반좌석 묶기를 해제했습니다.');await refreshFromServer({silent:true});renderCompanionSearch()}
async function reflowOrganizationSeats(){
  const movable=state.participants.filter(p=>!p.arrived&&String(p.participationStatus||'참여')!=='미참여').length;
  if(!confirm(`미도착 참가자 ${movable}명을 대상으로 좌석을 재정렬할까요?\n\n동반그룹 → 같은 소속기관 순으로 최대한 붙여 배치합니다.\n이미 도착한 참가자는 이동하지 않습니다.`))return;
  const r=await jsonpRequest('adminReflowSeats',{});
  showToast(`${r.movedCount}명의 좌석을 재정렬했습니다.`,5000);await refreshFromServer({silent:true});
}
async function reassignAllSeatsV31(){
  const active=state.participants.filter(
    p=>String(p.participationStatus||'참여')!=='미참여'
  );
  const arrived=active.filter(p=>p.arrived).length;
  const button=$('#reassignAllSeatsButton');

  if(!confirm(
    `현재 접수자의 좌석을 300석 도면 기준으로 다시 정리할까요?\n\n`+
    `• A~Y 25행 × 좌6 + 우6 = 총 300석\n`+
    `• A~K의 런웨이 가까운 6석씩 = 내빈·수상자 66석\n`+
    `• A~K 바깥쪽 6석은 일반석으로 사용\n`+
    `• 휠체어 이용자는 A~D 바깥쪽 우선석 사용\n`+
    `• 이미 도착한 ${arrived}명은 현재 좌석 유지\n\n`+
    `좌석표 구조 적용과 참가자 재배정을 한 번에 실행합니다.`
  ))return;

  const oldText=button?.textContent||'';
  if(button){
    button.disabled=true;
    button.textContent='300석 좌석 재배정 중...';
  }

  try{
    const r=await jsonpRequest('adminReassignAllSeats',{});

    if(r.unassignedCount>0){
      const names=(r.unassignedNames||[]).join(', ');
      showToast(
        `재배정 ${r.movedCount}명 완료 · 미배정 ${r.unassignedCount}명`+
        (names?` (${names})`:''),
        8500
      );
    }else{
      showToast(
        `300석 재배정 완료 · ${r.movedCount}명 / 미배정 0명 / 도착자 ${r.arrivedLocked}명 유지`,
        7500
      );
    }

    await refreshFromServer({silent:true,full:true});
  }finally{
    if(button){
      button.disabled=false;
      button.textContent=oldText||'300석 구조 적용 · 현재 접수자 재배정';
    }
  }
}
function normalizeExcelImportRow(row){
  const map={};Object.entries(row||{}).forEach(([k,v])=>map[String(k).replace(/\s+/g,'').toLowerCase()]=v);
  const pick=(...names)=>{for(const n of names){const key=n.replace(/\s+/g,'').toLowerCase();if(Object.prototype.hasOwnProperty.call(map,key))return map[key]}return''};
  return{name:String(pick('이름','성명','참가자명','name')||'').trim(),phone:String(pick('핸드폰번호','휴대폰번호','연락처','전화번호','phone')||'').trim(),organization:String(pick('소속기관','기관명','소속','organization')||'').trim(),seat:String(pick('좌석','좌석번호','seat')||'').trim(),status:String(pick('참여상태','상태','status')||'').trim()};
}
async function previewExcelImport(){
  const file=$('#excelImportFile')?.files?.[0];if(!file){showToast('엑셀 또는 CSV 파일을 선택해 주세요.',4200);return}
  if(typeof XLSX==='undefined'){showToast('엑셀 읽기 모듈을 불러오지 못했습니다.',5200);return}
  const buffer=await file.arrayBuffer(),book=XLSX.read(buffer,{type:'array'}),sheet=book.Sheets[book.SheetNames[0]];
  excelImportRows=XLSX.utils.sheet_to_json(sheet,{defval:''}).map(normalizeExcelImportRow).filter(r=>r.name);
  const preview=$('#excelImportPreview');
  if(!excelImportRows.length){preview.innerHTML='<div class="empty-state">이름 열을 찾을 수 없습니다.</div>';$('#excelImportButton').disabled=true;return}
  const unavailable=excelImportRows.filter(r=>r.seat==='미참여'||r.status==='미참여').length;
  preview.innerHTML=`<div class="excel-preview-summary"><strong>${excelImportRows.length}명</strong><span>미참여 ${unavailable}명</span></div><div class="excel-preview-table-wrap"><table class="excel-preview-table"><thead><tr><th>이름</th><th>핸드폰</th><th>소속기관</th><th>좌석</th></tr></thead><tbody>${excelImportRows.slice(0,30).map(r=>`<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.phone)}</td><td>${escapeHtml(r.organization||'-')}</td><td>${escapeHtml(r.seat||'자동배정')}</td></tr>`).join('')}</tbody></table></div>`;
  $('#excelImportButton').disabled=false;
}
async function importExcelParticipants(){
  if(!excelImportRows.length)return;
  if(!confirm(`${excelImportRows.length}명을 참가자명단에 추가할까요?`))return;
  $('#excelImportButton').disabled=true;
  try{const r=await jsonpRequest('adminImportExcelRows',{rows:excelImportRows});showToast(`가져오기 완료 · 성공 ${r.success}명 / 실패 ${r.failed}명`,5200);await refreshFromServer({silent:true})}finally{$('#excelImportButton').disabled=false}
}

async function refreshFieldStats(){try{const s=await jsonpRequest('fieldStats',{});$('#fieldStatRegistered').textContent=s.registered??0;$('#fieldStatArrived').textContent=s.arrived??0;$('#fieldStatWheelchair').textContent=s.wheelchair??0;$('#fieldStatGift').textContent=s.giftReceived??0;$('#fieldStatRaffle').textContent=s.raffleEligible??0;}catch(_){}}
function giftControlHtml(p){const done=Boolean(p?.giftReceived);return `<div class="gift-control ${done?'done':''}"><strong>${done?'🎁 기념품 지급완료':'🎁 기념품 미지급'}</strong>${done&&p.giftReceivedAt?`<small>${escapeHtml(formatDateTime(p.giftReceivedAt))}</small>`:''}<button class="button small ${done?'secondary':'primary'}" data-result="${done?'undo-gift':'gift'}" data-id="${escapeHtml(p.id)}" type="button">${done?'지급취소':'지급 완료'}</button></div>`;}
async function submitOnsiteRegistration(event){event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;const r=await jsonpRequest('adminOnsiteRegister',{name:String(form.elements.name?.value||'').trim(),phone:String(form.elements.phone?.value||'').trim(),organization:String(form.elements.organization?.value||'').trim(),disabledPerson:Boolean(form.elements.disabledPerson?.checked),wheelchairUser:Boolean(form.elements.wheelchairUser?.checked)});form.reset();updateCache(r.participant);showToast(`${r.participant.name} 님 현장등록 완료 · ${r.participant.seat||'좌석 미배정'}`,5200);refreshFieldStats();}
async function emergencyRows(){const rows=await jsonpRequest('emergencyList',{});return Array.isArray(rows)?rows:[];}
function csvCellV32(v){return `"${String(v??'').replace(/"/g,'""')}"`;}
async function downloadEmergencyCsv(){const rows=await emergencyRows();const header=['접수번호','이름','전화번호','소속기관','좌석','휠체어','도착','기념품','QR코드'];const lines=[header.map(csvCellV32).join(',')];rows.forEach(r=>lines.push([r.number,r.name,r.phone,r.organization,r.seat,r.wheelchair,r.arrived,r.gift,r.qr].map(csvCellV32).join(',')));const blob=new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`20주년_비상용참가자명단_${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}
async function printEmergencyList(){const rows=await emergencyRows(),w=window.open('','_blank');if(!w){showToast('팝업 차단을 해제해 주세요.',4200);return;}w.document.write(`<html><head><title>비상용 참가자명단</title><style>body{font-family:Arial,"Malgun Gothic",sans-serif;padding:20px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #aaa;padding:5px}th{background:#eee}</style></head><body><h2>남양주시장애인복지관 개관 20주년 비상용 참가자명단</h2><p>출력시각 ${new Date().toLocaleString()}</p><table><thead><tr><th>No</th><th>이름</th><th>전화</th><th>소속기관</th><th>좌석</th><th>휠체어</th><th>도착</th><th>기념품</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHtml(r.number)}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.phone)}</td><td>${escapeHtml(r.organization||'')}</td><td>${escapeHtml(r.seat||'')}</td><td>${r.wheelchair}</td><td>${r.arrived}</td><td>${r.gift}</td></tr>`).join('')}</tbody></table></body></html>`);w.document.close();setTimeout(()=>w.print(),300);}

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
  if($('#statWheelchair'))$('#statWheelchair').textContent=`${wheelchairTotal.toLocaleString()}명`;
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
      p.id,p.number,p.name,p.phone,p.organization,p.seat,p.note,p.companionGroup,p.participationStatus,
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
        <td><strong>${escapeHtml(p.name)}</strong><br><span class="small-text">${escapeHtml(p.organization||'소속 없음')} · ${escapeHtml(p.id)}</span>${p.companionGroup?`<br><span class="table-sub-badge">동반 ${escapeHtml(p.companionGroup)}</span>`:''}${String(p.participationStatus||'참여')==='미참여'?'<br><span class="table-sub-badge unavailable">미참여</span>':''}</td>
        <td>${escapeHtml(maskPhone(p.phone))}</td>
        <td><span>${centerInfo}</span>${flags?`<br><span class="small-text">${escapeHtml(flags)}</span>`:''}</td>
        <td><strong>${String(p.participationStatus||'참여')==='미참여'?'미참여':escapeHtml(p.seat||'미배정')}</strong></td>
        <td>${prizeHtml}</td>
        <td><span class="badge ${p.arrived?'arrived':'pending'}">${p.arrived?'도착':'미도착'}</span></td>
        <td><div class="row-actions">
          <button class="button small secondary" data-action="qr" data-id="${escapeHtml(p.id)}">QR</button>
          <button class="button small secondary" data-action="edit" data-id="${escapeHtml(p.id)}">수정</button>
          <button class="button small ${p.arrived?'secondary':'primary'}" data-action="toggle" data-id="${escapeHtml(p.id)}">${p.arrived?'도착 취소':'도착 처리'}</button>
          <button class="button small danger-outline" data-action="delete" data-id="${escapeHtml(p.id)}">참여불가</button>
        </div></td>
      </tr>`;
    }).join('')
    :'<tr><td colspan="8"><div class="empty-state">참가자가 없습니다.</div></td></tr>';
}
function seatMetaByCode(){const m=new Map();state.seatMeta.forEach(s=>m.set(normalizeSeat(s.code),s));return m}
function seatOccupantMap(){const m=new Map();state.participants.forEach(p=>parseSeatList(p.seat).forEach(c=>m.set(normalizeSeat(c),p)));return m}
function zoneClass(c){const v=String(c||'').toLowerCase();if(v.includes('vip')||v.includes('내빈')||v.includes('수상자'))return'zone-vip';if(v.includes('장애인'))return'zone-disabled-priority';if(v.includes('휠체어'))return'zone-wheelchair';if(v.includes('관계자'))return'zone-staff';if(v.includes('추가')||v.includes('예비'))return'zone-extra';if(v.includes('사용안함'))return'zone-disabled';return'zone-general'}
function isWheelchairPersonSeat(p,code){
  if(!p||!p.wheelchairUser)return false;
  return parseSeatList(p.seat).map(normalizeSeat).includes(normalizeSeat(code));
}
function seatButton(code,meta,p){
  const cls=['runway-seat',zoneClass(meta?.category)];
  const disabledAccessible=Boolean(meta?.wheelchairEligible)||String(meta?.category||'').includes('장애인')||String(meta?.category||'').includes('휠체어');
  if(disabledAccessible)cls.push('disabled-priority-seat');

  const wcSeat=isWheelchairPersonSeat(p,code);
  if(wcSeat)cls.push('wheelchair-person');

  if(meta?.enabled===false)cls.push('disabled-seat');
  else if(p?.arrived)cls.push('arrived');
  else if(p)cls.push('pending');
  else cls.push('empty');

  const title=code+' · '+(meta?.category||'일반')+
    (disabledAccessible?' · 장애인(휠체어) 지정석':'')+
    (wcSeat?' · 휠체어 이용 참가자':'')+(p?' · '+p.name:'');

  const icon=disabledAccessible?'<i class="wheelchair-seat-icon">♿</i>':'';

  return `<button class="${cls.join(' ')}" type="button" data-seat-code="${escapeHtml(code)}" title="${escapeHtml(title)}">${icon}<strong>${code.split('-')[1]}</strong>${p?`<span>${escapeHtml(p.name)}</span>`:''}</button>`;
}

function runwayRow(row,leftN,rightN,mm,om){let l='',r='';for(let i=1;i<=leftN;i++){const c=`${row}L-${String(i).padStart(2,'0')}`;l+=seatButton(c,mm.get(c),om.get(c))}for(let i=1;i<=rightN;i++){const c=`${row}R-${String(i).padStart(2,'0')}`;r+=seatButton(c,mm.get(c),om.get(c))}return `<div class="runway-row"><div class="runway-side runway-left"><span class="runway-row-label">${row}L</span><div class="runway-side-seats">${l}</div></div><div class="runway-spine"><span>${row}</span></div><div class="runway-side runway-right"><div class="runway-side-seats">${r}</div><span class="runway-row-label">${row}R</span></div></div>`}
function renderSeatMap(){const mm=seatMetaByCode(),om=seatOccupantMap();$('#seatMap').innerHTML='ABCDEFGHIJKLMNOPQRSTUVWXY'.split('').map(r=>runwayRow(r,6,6,mm,om)).join('');if($('#extraSeatMap'))$('#extraSeatMap').innerHTML=''}
function renderSettings(){
  $('#eventName').value=state.settings.eventName||'';$('#eventDate').value=state.settings.eventDate||'';$('#eventVenue').value=state.settings.eventVenue||'';$('#eventOrganizer').value=state.settings.eventOrganizer||'';$('#autoRefreshSeconds').value=state.settings.autoRefreshSeconds||15;$('#publicSubtitle').value=state.settings.publicSubtitle||'';$('#publicGreeting').value=state.settings.publicGreeting||'';$('#publicProgramTitle').value=state.settings.publicProgramTitle||'';$('#publicProgramIntro').value=state.settings.publicProgramIntro||'';$('#publicProgramItems').value=state.settings.publicProgramItems||'';$('#privacyRetentionText').value=state.settings.privacyRetentionText||'';$('#registrationOpen').value=String(state.settings.registrationOpen!==false);$('#registrationCapacity').value=state.settings.registrationCapacity||300;$('#autoAssignSeat').value=String(state.settings.autoAssignSeat!==false);$('#ticketRefreshSeconds').value=state.settings.ticketRefreshSeconds||15;$('#stationName').value=session.station||'관리자 웹';
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
    refreshFieldStats();
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
    ${giftControlHtml(p)}
    <div class="result-actions">
      ${p.arrived
        ?`<button class="button secondary" data-result="undo" data-id="${escapeHtml(p.id)}">도착 취소</button>`
        :`<button class="button primary" data-result="checkin" data-id="${escapeHtml(p.id)}">도착 처리</button>`}
      <button class="button secondary" data-result="qr" data-id="${escapeHtml(p.id)}">QR 보기</button>
    </div>
  </div>`;

  $('#checkinResultPanel').scrollIntoView({behavior:'smooth',block:'center'});
}
async function handleScanned(text){
  const now=Date.now();
  if(scanBusy||(text===lastScannedText&&now-lastScannedAt<1200))return;
  lastScannedText=text;
  lastScannedAt=now;
  try{
    if(navigator.vibrate)navigator.vibrate(45);
    setScannerStatus('QR 인식 · 확인 중','busy');
    await checkIn(text);
    setScannerStatus('체크인 완료 · 다음 QR을 보여주세요','ok');
  }catch(e){
    setScannerStatus('QR 인식됨 · 확인 필요','error');
    showToast(e.message,4500);
    $('#checkinResultPanel').classList.remove('hidden');
    $('#checkinResult').innerHTML=`<div class="empty-state"><strong>${escapeHtml(e.message)}</strong></div>`;
  }
}

function setScannerStatus(text,state='idle',modeText=''){
  const status=$('#scannerStatusText');
  const dot=$('#scannerStatusDot');
  const badge=$('#scannerModeBadge');
  if(status)status.textContent=text;
  if(dot){dot.className='scanner-status-dot';if(state)dot.classList.add(state);}
  if(badge&&modeText)badge.textContent=modeText;
}

async function stopNativeScanner(){
  if(nativeScannerFrame){cancelAnimationFrame(nativeScannerFrame);nativeScannerFrame=null;}
  if(nativeScannerVideo){try{nativeScannerVideo.pause()}catch(_){}nativeScannerVideo.srcObject=null;nativeScannerVideo=null;}
  if(nativeScannerStream){nativeScannerStream.getTracks().forEach(track=>track.stop());nativeScannerStream=null;}
  nativeScannerDetector=null;
}

async function startNativeScanner(){
  if(!('BarcodeDetector' in window))return false;
  try{
    if(typeof BarcodeDetector.getSupportedFormats==='function'){
      const formats=await BarcodeDetector.getSupportedFormats();
      if(!formats.includes('qr_code'))return false;
    }
    nativeScannerDetector=new BarcodeDetector({formats:['qr_code']});
  }catch(_){nativeScannerDetector=null;return false;}
  if(!navigator.mediaDevices?.getUserMedia)return false;
  try{
    nativeScannerStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30,max:60}}});
  }catch(_){nativeScannerStream=null;return false;}
  const video=document.createElement('video');
  video.className='native-scanner-video';
  video.setAttribute('playsinline','');
  video.autoplay=true;video.muted=true;video.srcObject=nativeScannerStream;
  const guide=document.createElement('div');guide.className='native-scanner-guide';guide.innerHTML='<span></span>';
  const reader=$('#reader');reader.innerHTML='';reader.append(video,guide);nativeScannerVideo=video;
  try{await video.play();}catch(_){await stopNativeScanner();return false;}
  try{
    const track=nativeScannerStream.getVideoTracks()[0];
    const caps=track?.getCapabilities?.()||{};
    if(Array.isArray(caps.focusMode)&&caps.focusMode.includes('continuous'))await track.applyConstraints({advanced:[{focusMode:'continuous'}]});
  }catch(_){}
  scannerMode='native';scannerRunning=true;
  setScannerStatus('고속 스캔 중 · QR을 화면에 보여주세요','ok','고속 네이티브');
  $('#toggleScannerButton').textContent='카메라 종료';
  const loop=async timestamp=>{
    if(!scannerRunning||scannerMode!=='native'||!nativeScannerVideo)return;
    if(!scanBusy&&nativeScannerVideo.readyState>=2&&timestamp-nativeScannerLastDetectAt>=70){
      nativeScannerLastDetectAt=timestamp;
      try{
        const results=await nativeScannerDetector.detect(nativeScannerVideo);
        const qr=results?.find(item=>item?.rawValue);
        if(qr?.rawValue)handleScanned(String(qr.rawValue));
      }catch(_){}
    }
    nativeScannerFrame=requestAnimationFrame(loop);
  };
  nativeScannerFrame=requestAnimationFrame(loop);
  return true;
}

async function startHtml5FastScanner(){
  if(typeof Html5Qrcode==='undefined')return false;
  $('#reader').innerHTML='';
  scanner=new Html5Qrcode('reader',{verbose:false});
  try{
    await scanner.start({facingMode:'environment'},{fps:20,qrbox:(width,height)=>{const edge=Math.floor(Math.min(width,height)*0.82);return{width:edge,height:edge};},aspectRatio:1.7777778,disableFlip:true},decodedText=>handleScanned(decodedText),()=>{});
  }catch(_){try{await scanner.clear()}catch(__){}scanner=null;return false;}
  scannerMode='html5';scannerRunning=true;
  setScannerStatus('고속 호환 스캔 중 · QR을 화면에 보여주세요','ok','고속 호환');
  $('#toggleScannerButton').textContent='카메라 종료';
  return true;
}

async function startScanner(){
  if(scannerRunning)return;
  setScannerStatus('카메라를 준비하고 있습니다.','busy','준비');
  $('#toggleScannerButton').disabled=true;
  try{
    if(await startNativeScanner())return;
    if(await startHtml5FastScanner())return;
    setScannerStatus('카메라를 시작하지 못했습니다.','error','오류');
    showToast('카메라 권한을 확인한 뒤 다시 시도해 주세요.',4800);
    $('#reader').innerHTML='<p>카메라를 사용할 수 없습니다. 브라우저의 카메라 권한을 확인해 주세요.</p>';
  }finally{$('#toggleScannerButton').disabled=false;}
}

async function stopScanner(){
  scannerRunning=false;
  if(scannerMode==='native')await stopNativeScanner();
  if(scannerMode==='html5'&&scanner){try{await scanner.stop()}catch(_){}try{await scanner.clear()}catch(_){}}
  scanner=null;scannerMode='idle';
  $('#reader').innerHTML='<p>카메라 시작 버튼을 눌러주세요.</p>';
  $('#toggleScannerButton').textContent='카메라 시작';
  setScannerStatus('카메라 대기 중','idle','대기');
}

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
    try{await jsonpRequest('unassignSeat',{participantCode:occupant.id});await refreshFromServer({silent:true});await loadBootstrapExtras({force:true,silent:true});closeModal();showToast(`${occupant.name} 님 좌석을 미배정으로 변경했습니다.`)}catch(err){showToast(err.message,5000)}
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

/* =====================================================================
   v2.7.5 — 관리자 설치형 웹앱(PWA)
   공개 초대장에는 설치 UI가 없고 admin.html에서만 등록합니다.
   ===================================================================== */
let deferredAdminInstallPrompt=null;

function isAdminAppStandalone(){
  return window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator.standalone===true;
}

function isIosDevice(){
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent||'');
}

function updateAdminInstallButtons(){
  const installed=isAdminAppStandalone();
  document.querySelectorAll('.admin-app-install-trigger').forEach(button=>{
    button.classList.toggle('hidden',installed);
    if(installed){
      button.setAttribute('aria-hidden','true');
    }else{
      button.removeAttribute('aria-hidden');
    }
  });

  document.body.classList.toggle('admin-pwa-standalone',installed);
}

function showAdminInstallGuide(){
  if(isIosDevice()){
    openModal(
      '아이폰 관리자 앱 설치',
      `<div class="admin-install-guide">
        <div class="admin-install-icon">20</div>
        <h3>Safari에서 홈 화면에 추가</h3>
        <ol>
          <li>아래쪽 <strong>공유</strong> 버튼을 누릅니다.</li>
          <li><strong>홈 화면에 추가</strong>를 선택합니다.</li>
          <li>오른쪽 위 <strong>추가</strong>를 누릅니다.</li>
        </ol>
        <p>설치하면 홈 화면의 <strong>20주년 관리자</strong> 아이콘으로 바로 실행할 수 있습니다.</p>
      </div>`
    );
    return;
  }

  openModal(
    '관리자 앱 설치',
    `<div class="admin-install-guide">
      <div class="admin-install-icon">20</div>
      <h3>설치 메뉴를 선택해 주세요.</h3>
      <p>현재 브라우저에서 자동 설치창을 바로 띄울 수 없는 상태입니다.</p>
      <p><strong>Chrome / Edge 메뉴 → 앱 설치 또는 이 페이지를 앱으로 설치</strong>를 선택해 주세요.</p>
      <p class="small-text">GitHub Pages의 HTTPS 주소에서 관리자 페이지를 열었을 때 설치할 수 있습니다.</p>
    </div>`
  );
}

async function requestAdminAppInstall(){
  if(isAdminAppStandalone()){
    showToast('이미 관리자 앱으로 실행 중입니다.');
    return;
  }

  if(deferredAdminInstallPrompt){
    const promptEvent=deferredAdminInstallPrompt;
    deferredAdminInstallPrompt=null;
    promptEvent.prompt();

    try{
      const choice=await promptEvent.userChoice;
      if(choice?.outcome==='accepted'){
        showToast('관리자 앱 설치를 시작했습니다.');
      }
    }catch(_){}

    updateAdminInstallButtons();
    return;
  }

  showAdminInstallGuide();
}

async function setupAdminPwa(){
  if('serviceWorker' in navigator){
    try{
      await navigator.serviceWorker.register('./admin-sw.js');
    }catch(error){
      console.warn('관리자 PWA 서비스워커 등록 실패:',error);
    }
  }

  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    deferredAdminInstallPrompt=event;
    updateAdminInstallButtons();
  });

  window.addEventListener('appinstalled',()=>{
    deferredAdminInstallPrompt=null;
    updateAdminInstallButtons();
    showToast('관리자 앱이 설치되었습니다.');
  });

  document.querySelectorAll('.admin-app-install-trigger').forEach(button=>{
    button.addEventListener('click',requestAdminAppInstall);
  });

  updateAdminInstallButtons();
}

function bindEvents(){
  $('#onsiteRegistrationForm')?.addEventListener('submit',e=>submitOnsiteRegistration(e).catch(err=>showToast(err.message,5200)));
  $('#downloadEmergencyCsvButton')?.addEventListener('click',()=>downloadEmergencyCsv().catch(err=>showToast(err.message,5200)));
  $('#printEmergencyListButton')?.addEventListener('click',()=>printEmergencyList().catch(err=>showToast(err.message,5200)));
  $('#reassignAllSeatsButton')?.addEventListener('click',()=>reassignAllSeatsV31().catch(err=>showToast(err.message,6000)));
  $('#companionSearchButton')?.addEventListener('click',renderCompanionSearch);
  $('#companionSearchInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();renderCompanionSearch()}});
  $('#linkCompanionButton')?.addEventListener('click',()=>linkCompanions().catch(err=>showToast(err.message,5200)));
  $('#clearCompanionButton')?.addEventListener('click',()=>clearCompanions().catch(err=>showToast(err.message,5200)));
  $('#reflowOrganizationButton')?.addEventListener('click',()=>reflowOrganizationSeats().catch(err=>showToast(err.message,5200)));
  $('#excelPreviewButton')?.addEventListener('click',()=>previewExcelImport().catch(err=>showToast(err.message,5200)));
  $('#excelImportButton')?.addEventListener('click',()=>importExcelParticipants().catch(err=>showToast(err.message,5200)));

  $('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const b=$('#loginButton');b.disabled=true;$('#loginMessage').classList.add('hidden');try{await login($('#adminPassword').value)}catch(err){showLogin(err.message)}finally{b.disabled=false}});$$('.nav-button').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));$$('[data-go]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.go)));$('#refreshDashboardButton').addEventListener('click',()=>refreshFromServer({full:true}).catch(()=>{}));$('#exportCsvButton').addEventListener('click',exportCsv);$('#exportCsvDashboardButton').addEventListener('click',exportCsv);$('#participantSearch').addEventListener('input',renderParticipants);$('#participantStatusFilter').addEventListener('change',renderParticipants);
  $('#drawSearch')?.addEventListener('input',renderPrizeDraw);
  $('#drawPendingOnly')?.addEventListener('change',renderPrizeDraw);
  $('#drawExportButton')?.addEventListener('click',exportDrawCsv);
  $('#drawPrizeForm')?.addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,b=form.querySelector('button');b.disabled=true;try{const entries=parseDrawBulkInput($('#drawBulkInput').value,$('#drawPrizeNote').value.trim());state.prizes=await jsonpRequest('saveDrawPrizes',{entries});$('#drawBulkInput').value='';$('#drawPrizeNote').value='';renderPrizeDraw();renderParticipants();showToast(`${entries.length}개 당첨 좌석을 등록했습니다.`);}catch(err){showToast(err.message,5500)}finally{b.disabled=false}});
  $('#drawPrizeTableBody')?.addEventListener('click',async e=>{const b=e.target.closest('[data-draw-action]');if(!b)return;try{if(b.dataset.drawAction==='delete'){if(!confirm(`${b.dataset.seat} 당첨 설정을 삭제할까요?`))return;state.prizes=await jsonpRequest('deleteDrawPrize',{seat:b.dataset.seat});}if(b.dataset.drawAction==='undo'){if(!confirm(`${b.dataset.seat} 상품 수령 처리를 취소할까요?`))return;state.prizes=await jsonpRequest('undoPrizeRedeem',{seat:b.dataset.seat});}renderPrizeDraw();renderParticipants();showToast('행운추첨 정보를 변경했습니다.');}catch(err){showToast(err.message,5000)}});
  $('#seatParticipantSearchForm').addEventListener('submit',e=>{e.preventDefault();renderSeatSearchResults($('#seatParticipantSearchInput').value,$('#seatParticipantSearchResults'),'seat-search-pick')});
  $('#seatParticipantSearchInput').addEventListener('input',e=>{const q=e.currentTarget.value.trim();if(q.length>=2)renderSeatSearchResults(q,$('#seatParticipantSearchResults'),'seat-search-pick');else $('#seatParticipantSearchResults').innerHTML='<div class="empty-state compact">두 글자 이상 입력하세요.</div>'});
  $('#seatParticipantSearchResults').addEventListener('click',e=>{const b=e.target.closest('[data-seat-search-pick]');if(!b)return;selectedSeatParticipantId=b.dataset.seatSearchPick;updateSeatSelectedPersonBanner();const p=findById(selectedSeatParticipantId);showToast(`${p?.name||'참가자'} 선택됨. 배정할 좌석을 클릭하세요.`);});
  $('#participantForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,b=form.querySelector('button');b.disabled=true;try{const v=Object.fromEntries(new FormData(form).entries());v.usesCenter=v.usesCenter==='true';v.wheelchairUser=v.wheelchairUser==='true';v.disabledPerson=v.disabledPerson==='true';if(!v.disabledPerson){v.usesCenter=false;v.wheelchairUser=false;}v.programName='';const p=await jsonpRequest('createParticipant',v);updateCache(p);form.reset();showToast('개인 참가자를 등록했습니다.')}catch(err){showToast(err.message,4500)}finally{b.disabled=false}});
  $('#participantTableBody').addEventListener('click',async e=>{const b=e.target.closest('[data-action]');if(!b)return;const p=findById(b.dataset.id);if(!p)return;try{if(b.dataset.action==='qr')showQr(p);if(b.dataset.action==='edit')showEdit(p);if(b.dataset.action==='toggle')p.arrived?await undoCheckIn(p):await checkIn(p);if(b.dataset.action==='delete'&&confirm(`${p.name} 님을 참여불가 처리할까요?\n\n처리하면 기존 QR은 사용할 수 없고 배정 좌석은 즉시 비워집니다.`)){const r=await jsonpRequest('deleteParticipant',{code:p.id});state.participants=state.participants.filter(x=>x.id!==p.id);renderAll();showToast(r.releasedSeat?`참여불가 처리했습니다. ${r.releasedSeat} 좌석이 비워졌습니다.`:'참여불가 처리했습니다.')}}catch(err){showToast(err.message,4500)}});
  $('#toggleScannerButton').addEventListener('click',async()=>scannerRunning?await stopScanner():await startScanner());$('#manualCheckinForm').addEventListener('submit',e=>{e.preventDefault();const m=findMatches($('#manualCheckinInput').value);$('#manualSearchResults').innerHTML=m.length?m.map(p=>`<button class="search-result-button" data-manual-id="${escapeHtml(p.id)}"><strong>${escapeHtml(p.name)}${p.wheelchairUser?' · ♿':''}</strong><br><span>${escapeHtml(p.seat||'미배정')} · ${p.organization?escapeHtml(p.organization)+' · ':''}${escapeHtml(maskPhone(p.phone))}</span></button>`).join(''):'<div class="empty-state">찾지 못했습니다.</div>'});$('#manualSearchResults').addEventListener('click',e=>{const b=e.target.closest('[data-manual-id]');if(!b)return;const p=findById(b.dataset.manualId);if(p)showCheckinResult(p,p.arrived,prizeForParticipant(p))});$('#checkinResult').addEventListener('click',async e=>{const b=e.target.closest('[data-result]');if(!b)return;try{const resultAction=b.dataset.result;if(resultAction==='undo-prize'){state.prizes=await jsonpRequest('undoPrizeRedeem',{seat:b.dataset.seat});const currentId=$('#checkinResult [data-result="qr"]')?.dataset.id||'';const current=currentId?findById(currentId):null;if(current)showCheckinResult(current,true,prizeForParticipant(current));renderPrizeDraw();renderParticipants();showToast('상품 수령 처리를 취소했습니다.');return;}const p=findById(b.dataset.id);if(!p)return;if(resultAction==='checkin')await checkIn(p);if(resultAction==='undo')await undoCheckIn(p);if(resultAction==='qr')showQr(p);if(resultAction==='gift'||resultAction==='undo-gift'){const received=resultAction==='gift',r=await jsonpRequest('setGiftReceived',{code:p.id,received});updateCache(r.participant);showCheckinResult(r.participant,r.participant.arrived,prizeForParticipant(r.participant));showToast(received?(r.already?'이미 지급된 참가자입니다.':'기념품 지급완료 처리했습니다.'):'기념품 지급상태를 취소했습니다.');refreshFieldStats();return;}if(resultAction==='redeem-prize'){const r=await jsonpRequest('redeemPrize',{code:p.id});await loadBootstrapExtras({force:true,silent:true});showCheckinResult(findById(p.id),true,r.prize);renderPrizeDraw();showToast(r.already?'이미 상품 수령 완료된 당첨자입니다.':'상품 수령완료 처리했습니다.');}}catch(err){showToast(err.message,4500)}});
  const seatClick=async e=>{const b=e.target.closest('[data-seat-code]');if(!b)return;const code=b.dataset.seatCode;if(selectedSeatParticipantId){const p=findById(selectedSeatParticipantId);if(!p){selectedSeatParticipantId='';updateSeatSelectedPersonBanner();return;}try{await assignSelectedPersonToSeat(p,code)}catch(err){showToast(err.message,5200)}return;}showSeatAssignmentModal(code)};$('#seatMap').addEventListener('click',seatClick);$('#extraSeatMap')?.addEventListener('click',seatClick);
  $('#seatZoneForm').addEventListener('submit',async e=>{e.preventDefault();try{state.seatMeta=await jsonpRequest('saveSeatMeta',{seats:$('#seatZoneSeats').value.trim(),category:$('#seatZoneCategory').value.trim()||'일반',autoAssignable:$('#seatZoneAuto').value==='true',enabled:$('#seatZoneEnabled').value==='true',wheelchairEligible:$('#seatZoneWheelchair').value==='true',note:$('#seatZoneNote').value.trim()});renderSeatMap();showToast('좌석 구역을 저장했습니다.')}catch(err){showToast(err.message,5200)}});
  $('#eventSettingsForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button');b.disabled=true;session.station=$('#stationName').value.trim()||'관리자 웹';localStorage.setItem(STORAGE.STATION,session.station);const s={eventName:$('#eventName').value.trim(),eventDate:$('#eventDate').value.trim(),eventVenue:$('#eventVenue').value.trim(),eventOrganizer:$('#eventOrganizer').value.trim(),autoRefreshSeconds:Number($('#autoRefreshSeconds').value)||15,publicSubtitle:$('#publicSubtitle').value.trim(),publicGreeting:$('#publicGreeting').value.trim(),publicProgramTitle:$('#publicProgramTitle').value.trim(),publicProgramIntro:$('#publicProgramIntro').value.trim(),publicProgramItems:$('#publicProgramItems').value.trim(),privacyRetentionText:$('#privacyRetentionText').value.trim(),registrationOpen:$('#registrationOpen').value==='true',registrationCapacity:Math.min(300,Number($('#registrationCapacity').value)||300),autoAssignSeat:$('#autoAssignSeat').value==='true',ticketRefreshSeconds:Number($('#ticketRefreshSeconds').value)||15};try{state.settings=await jsonpRequest('saveSettings',s);renderAll();scheduleRefresh();showToast('설정을 저장했습니다.')}catch(err){showToast(err.message,4500)}finally{b.disabled=false}});
  $('#logoutButton').addEventListener('click',logout);$('#logoutButtonTop').addEventListener('click',logout);$('#closeModalButton').addEventListener('click',closeModal);$('#modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
}

async function initialize(){
  bindEvents();
  setupAdminPwa();
  if(!validateApiUrl(API_URL)){showLogin('config.js에 Apps Script /exec 주소가 설정되지 않았습니다.');return;}
  if(!isSessionLocallyValid()){clearSession();showLogin();return;}
  setStatus('warning','로그인 확인 중');
  try{await refreshFromServer({silent:true})}catch(err){showLogin(err.message)}
}

document.addEventListener('DOMContentLoaded',initialize);
