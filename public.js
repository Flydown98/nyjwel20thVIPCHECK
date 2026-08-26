'use strict';

const PUBLIC_CONFIG = window.NYJ20_CONFIG || {};
const API_URL = String(PUBLIC_CONFIG.appsScriptUrl || '').trim();
const DEVICE_TICKET_STORAGE_KEY = 'nyj20.publicTicketCode.v1';
const LAST_PUBLIC_TICKET_CACHE_KEY = 'nyj20.lastTicketSnapshot.v1';
const LAST_PUBLIC_SEAT_CACHE_KEY = 'nyj20.lastSeatLayout.v1';
const LAST_PUBLIC_SEAT_SYNC_KEY = 'nyj20.lastSeatSync.v1';
const CURRENT_PRIVACY_VERSION = 'NYJWEL20-INDIVIDUAL-2026-08-24-v4';
const DEFAULT_PUBLIC_SETTINGS = Object.freeze({
  eventName: '개관 20주년 기념행사',
  eventDate: '2026. 9. 17.(목) 13:30',
  eventVenue: '남양주금곡실내체육관',
  eventOrganizer: '남양주시장애인복지관',
  publicSubtitle: '스무번의 계절, 스물한 번째 약속',
  publicGreeting: '남양주시장애인복지관의 스무 해를 함께해 주신 여러분을 초대합니다.',
  privacyRetentionText: '행사 종료 후 결과 정리 및 문의 대응 완료 시까지(최대 30일)',
  registrationOpen: true,
  registrationCapacity: 300,
  registeredCount: 0,
  remainingCount: 300,
  autoAssignSeat: true,
  introVideoEnabled: false,
  introVideoUrl: 'assets/intro.mp4',
  ticketRefreshSeconds: 15,
  privacyConsentVersion: CURRENT_PRIVACY_VERSION
});

let publicState = { settings: { ...DEFAULT_PUBLIC_SETTINGS }, ticket: null, seatMeta: [] };
let ticketRefreshTimer=null, seatLayoutRefreshTimer=null;

const $ = selector => document.querySelector(selector);

function isConfiguredUrl(url) {
  return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/i.test(url) && !url.includes('PASTE_YOUR');
}

function getRememberedTicketCodes(){
  try{
    const raw=localStorage.getItem('nyj20.publicTicketCodes.v2');
    if(raw){
      const parsed=JSON.parse(raw);
      if(Array.isArray(parsed))return [...new Set(parsed.map(v=>String(v||'').trim().toUpperCase()).filter(Boolean))];
    }
    const legacy=String(localStorage.getItem('nyj20.publicTicketCode.v1')||'').trim().toUpperCase();
    if(legacy){
      localStorage.setItem('nyj20.publicTicketCodes.v2',JSON.stringify([legacy]));
      localStorage.removeItem('nyj20.publicTicketCode.v1');
      return[legacy];
    }
  }catch(_){}
  return[];
}
function getRememberedTicketCode(){
  const codes=getRememberedTicketCodes();
  return codes[codes.length-1]||'';
}
function rememberTicketCode(code){
  const value=String(code||'').trim().toUpperCase();
  if(!value)return;
  try{
    const codes=getRememberedTicketCodes().filter(v=>v!==value);
    codes.push(value);
    localStorage.setItem('nyj20.publicTicketCodes.v2',JSON.stringify(codes.slice(-20)));
  }catch(_){}
  updateRememberedTicketUi();
}
function forgetRememberedTicket(code=''){
  try{
    if(!code){
      localStorage.removeItem('nyj20.publicTicketCodes.v2');
      localStorage.removeItem('nyj20.publicTicketCode.v1');
    }else{
      const target=String(code).trim().toUpperCase();
      const next=getRememberedTicketCodes().filter(v=>v!==target);
      if(next.length)localStorage.setItem('nyj20.publicTicketCodes.v2',JSON.stringify(next));
      else localStorage.removeItem('nyj20.publicTicketCodes.v2');
    }
  }catch(_){}
  updateRememberedTicketUi();
}

function updateRememberedTicketUi() {
  const codes=getRememberedTicketCodes();
  const hasCode=codes.length>0;
  $('#rememberedTicketNotice')?.classList.toggle('hidden', !hasCode);
  $('#forgetTicketButton')?.classList.toggle('hidden', !hasCode);
  const count=$('#deviceTicketCount');
  if(count)count.textContent=String(codes.length);
}

function showToast(message, duration = 3200) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add('hidden'), duration);
}

function setLoading(active, text = '처리 중입니다.') {
  $('#loadingOverlay p').textContent = text;
  $('#loadingOverlay').classList.toggle('hidden', !active);
}

function createBridgeRequestId(prefix = 'pub') {
  const bytes = new Uint8Array(18);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
    return `${prefix}_${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}

/**
 * 개인정보를 URL 쿼리스트링에 넣지 않기 위한 Apps Script POST 브리지.
 * 실제 요청값은 숨김 form의 POST 본문으로 전송하고, URL에는 무작위 requestId만 사용합니다.
 */
function publicApiRequest(action, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!isConfiguredUrl(API_URL)) {
      reject(new Error('Apps Script 웹 앱 주소가 아직 설정되지 않았습니다.'));
      return;
    }

    const requestId = createBridgeRequestId('pub');
    const frameName = `nyj20_bridge_frame_${requestId.replace(/[^A-Za-z0-9_]/g, '')}`;
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
    const deadline = Date.now() + (Number(PUBLIC_CONFIG.requestTimeoutMs) || 25000);

    function clearPollScript() {
      if (activeScript) activeScript.remove();
      activeScript = null;
      if (activeCallback) {
        try { delete window[activeCallback]; } catch (error) { window[activeCallback] = undefined; }
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
        fail(new Error('연결이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.'));
        return;
      }

      clearPollScript();
      const callbackName = `__nyj20_poll_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const url = new URL(API_URL);
      url.searchParams.set('action', 'bridgePoll');
      url.searchParams.set('requestId', requestId);
      url.searchParams.set('callback', callbackName);
      url.searchParams.set('_', String(Date.now()));

      const script = document.createElement('script');
      activeScript = script;
      activeCallback = callbackName;

      window[callbackName] = response => {
        clearPollScript();
        if (response?.pending === true) {
          setTimeout(poll, 220);
          return;
        }
        if (!response || response.ok !== true) {
          const error=new Error(
            response?.error ||
            '신청 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.'
          );
          error.code=String(response?.errorCode||'');
          fail(error);
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
    } catch (error) {
      fail(new Error('현재 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.'));
    }
  });
}


function displayEventName(settings=publicState.settings){
  const organizer=String(
    settings?.eventOrganizer||DEFAULT_PUBLIC_SETTINGS.eventOrganizer||''
  ).trim();
  let name=String(
    settings?.eventName||DEFAULT_PUBLIC_SETTINGS.eventName||''
  ).trim();

  if(organizer&&name.startsWith(organizer)){
    name=name.slice(organizer.length).trim();
  }
  return name||'개관 20주년 기념행사';
}

function saveJsonLocal(key,value){
  try{localStorage.setItem(key,JSON.stringify(value));}catch(_){}
}

function readJsonLocal(key){
  try{
    const raw=localStorage.getItem(key);
    return raw?JSON.parse(raw):null;
  }catch(_){
    return null;
  }
}

function cacheTicketSnapshot(ticket){
  if(!ticket)return;
  saveJsonLocal(LAST_PUBLIC_TICKET_CACHE_KEY,{
    ticket,
    settings:publicState.settings,
    savedAt:new Date().toISOString()
  });
}

function cachedTicketSnapshot(code=''){
  const snapshot=readJsonLocal(LAST_PUBLIC_TICKET_CACHE_KEY);
  if(!snapshot?.ticket)return null;
  if(code&&String(snapshot.ticket.id||'').toUpperCase()!==String(code).toUpperCase()){
    return null;
  }
  return snapshot;
}

function cacheSeatLayout(seats){
  if(!Array.isArray(seats)||!seats.length)return;
  saveJsonLocal(LAST_PUBLIC_SEAT_CACHE_KEY,seats);
  try{localStorage.setItem(LAST_PUBLIC_SEAT_SYNC_KEY,new Date().toISOString());}catch(_){}
}

function cachedSeatLayout(){
  const seats=readJsonLocal(LAST_PUBLIC_SEAT_CACHE_KEY);
  return Array.isArray(seats)?seats:[];
}

function lastSeatSyncAt(){
  try{return localStorage.getItem(LAST_PUBLIC_SEAT_SYNC_KEY)||'';}catch(_){return'';}
}

function clearCachedTicketSnapshot(){
  try{localStorage.removeItem(LAST_PUBLIC_TICKET_CACHE_KEY);}catch(_){}
}

function isTerminalTicketError(error){
  const code=String(error?.code||'').trim().toUpperCase();
  if(code==='TICKET_INACTIVE'||code==='TICKET_NOT_FOUND')return true;

  const message=String(error?.message||'');
  return /참가 신청이 취소|참여불가 처리|사용이 중지된 개인 티켓|유효하지 않은 개인 티켓/.test(message);
}

function showCancelledTicketState(message='참가 신청이 취소되었습니다.'){
  clearInterval(ticketRefreshTimer);
  clearInterval(seatLayoutRefreshTimer);

  publicState.ticket=null;
  forgetRememberedTicket();
  clearCachedTicketSnapshot();
  clearTicketCodeFromUrl();

  $('#ticketSection')?.classList.add('hidden');

  const section=$('#cancelledTicketSection');
  if(section){
    section.classList.remove('hidden');
    const text=$('#cancelledTicketMessage');
    if(text)text.textContent=message+' 기존 QR은 더 이상 사용할 수 없습니다.';
    setTimeout(()=>section.scrollIntoView({behavior:'smooth',block:'center'}),80);
  }

  updateRememberedTicketUi();
}

function formatSeatSyncTime(value){
  if(!value)return'';
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return'';
  return date.toLocaleString('ko-KR',{
    month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'
  });
}

function renderPublicSettings() {
  const settings = publicState.settings;
  const organizer = String(
    settings.eventOrganizer||DEFAULT_PUBLIC_SETTINGS.eventOrganizer||''
  ).trim();
  const eventName=displayEventName(settings);

  const organizerEl = $('#organizerText');
  if (organizerEl) organizerEl.textContent = organizer;

  const titleEl = $('#eventNameText');
  if (titleEl) {
    titleEl.innerHTML = '';
    const orgSpan = document.createElement('span');
    orgSpan.className = 'event-name-org';
    orgSpan.textContent = organizer;
    const mainSpan = document.createElement('span');
    mainSpan.className = 'event-name-main';
    mainSpan.textContent = eventName;
    titleEl.append(orgSpan, mainSpan);
  }

  $('#subtitleText').textContent = settings.publicSubtitle;
  $('#eventDateText').textContent = settings.eventDate;
  $('#eventVenueText').textContent = settings.eventVenue;
  $('#detailDateText').textContent = settings.eventDate;
  $('#detailVenueText').textContent = settings.eventVenue;
  $('#greetingText').textContent = settings.publicGreeting;

  const retentionText = $('#privacyRetentionText');
  if (retentionText) {
    retentionText.textContent =
      settings.privacyRetentionText||
      DEFAULT_PUBLIC_SETTINGS.privacyRetentionText;
  }

  document.title = `${organizer} ${eventName} 모바일 초대장`;

  const status = $('#registrationStatus');
  if (!status) return;
  const open = settings.registrationOpen !== false;
  status.className = `registration-status ${open ? 'open' : 'closed'}`;
  status.textContent = open ? '참가 신청이 가능합니다.' : '현재 온라인 신청이 마감되었습니다.';
  $('#submitButton').disabled = !open;
}


function normalizePhoneInput(input) {
  const digits = input.value.replace(/\D/g, '').slice(0, 11);
  let formatted = digits;
  if (digits.length > 7) formatted = `${digits.slice(0, 3)}-${digits.slice(3, digits.length - 4)}-${digits.slice(-4)}`;
  else if (digits.length > 3) formatted = `${digits.slice(0, 3)}-${digits.slice(3)}`;
  input.value = formatted;
}

function ticketLink(code) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = 'ticketSection';
  url.searchParams.set('code', code);
  return url.toString();
}

function qrPayload(ticket) {
  return `NYJ20|${ticket.id}`;
}

function clearQrContainer() {
  $('#ticketQr').innerHTML = '';
}

function compactSeatLabel(value){const seats=String(value||'').split(',').map(v=>v.trim()).filter(Boolean);if(!seats.length)return'좌석 배정 중';return seats.length<=4?seats.join(' · '):`${seats[0]} ~ ${seats[seats.length-1]} (${seats.length}석)`}

async function renderDeviceTicketWallet(){
  const section=$('#deviceTicketWallet'),list=$('#deviceTicketWalletList');
  if(!section||!list)return;
  const codes=getRememberedTicketCodes();
  if(codes.length<2){section.classList.add('hidden');list.innerHTML='';return;}
  section.classList.remove('hidden');
  list.innerHTML='<p class="wallet-loading">이 기기에 저장된 참가자를 확인하고 있습니다.</p>';
  const participants=[];
  for(const code of codes.slice().reverse()){
    try{
      const r=await publicApiRequest('publicTicket',{code});
      if(r?.participant)participants.push(r.participant);
    }catch(error){
      if(isTerminalTicketError(error))forgetRememberedTicket(code);
    }
  }
  if(!participants.length){section.classList.add('hidden');return;}
  list.innerHTML=participants.map(p=>`
    <button class="device-wallet-ticket" data-device-ticket="${p.id}" type="button">
      <span><strong>${p.name}</strong><small>${p.seat?compactSeatLabel(p.seat):'좌석 확인 중'}</small></span><b>QR 보기</b>
    </button>`).join('');
  list.querySelectorAll('[data-device-ticket]').forEach(btn=>btn.addEventListener('click',async()=>{
    try{
      const r=await publicApiRequest('publicTicket',{code:btn.dataset.deviceTicket});
      if(r?.participant)renderTicket(r.participant,{existing:true,remember:true,scroll:true});
    }catch(error){showToast(error.message,4500);}
  }));
}
function startAdditionalParticipantApplication(){
  const form=$('#applicationForm');
  if(!form)return;
  form.reset();
  updateIndividualApplicationUi();
  form.dataset.startedAt=String(Date.now());
  $('#ticketSection')?.classList.add('hidden');
  $('#cancelledTicketSection')?.classList.add('hidden');
  $('#application')?.scrollIntoView({behavior:'smooth',block:'start'});
  setTimeout(()=>form.elements.name?.focus(),300);
}

function renderTicket(ticket,{existing=false,remember=false,message='',scroll=true}={}){
  $('#cancelledTicketSection')?.classList.add('hidden');
  publicState.ticket=ticket;
  if(remember)rememberTicketCode(ticket.id);
  cacheTicketSnapshot(ticket);
  setTimeout(renderDeviceTicketWallet,120);

  const s=publicState.settings;
  $('#ticketNumber').textContent=`NO. ${String(ticket.number).padStart(4,'0')}`;
  $('#ticketOrganizer').textContent=s.eventOrganizer;
  $('#ticketEventName').textContent=displayEventName(s);
  $('#ticketName').textContent=`${ticket.name} 님`;

  const profile=[];
  if(ticket.organization)profile.push(ticket.organization);
  if(ticket.disabledPerson){
    profile.push(ticket.usesCenter?'복지관 서비스 이용':'복지관 서비스 미이용');
    if(ticket.wheelchairUser)profile.push('♿ 휠체어 사용');
  }else{
    profile.push('개인 참가');
  }
  $('#ticketPartyInfo').textContent=profile.join(' · ');

  $('#ticketSeat').textContent=compactSeatLabel(ticket.seat);
  $('#ticketDate').textContent=s.eventDate;
  $('#ticketVenue').textContent=s.eventVenue;
  $('#ticketMessage').textContent=message||(
    existing
      ?'신청 정보를 확인했습니다. 개인 QR과 현재 좌석을 확인해 주세요.'
      :'개인 QR 발급이 완료되었습니다. 행사 전 QR을 사진으로 저장해 주세요.'
  );

  clearQrContainer();
  new QRCode($('#ticketQr'),{
    text:qrPayload(ticket),
    width:192,
    height:192,
    correctLevel:QRCode.CorrectLevel.H
  });

  $('#ticketSection').classList.remove('hidden');
  history.replaceState(null,'',ticketLink(ticket.id));
  renderPublicSeatMap();
  startTicketLiveSync();

  if(scroll){
    setTimeout(
      ()=>$('#ticketSection').scrollIntoView({behavior:'smooth',block:'start'}),
      100
    );
  }
}

function getDisplayedQrDataUrl() {
  const canvas = $('#ticketQr canvas');
  const image = $('#ticketQr img');
  return canvas ? canvas.toDataURL('image/png') : image?.src || '';
}

function safeFilename(value) {
  return String(value || '').replace(/[\\/:*?"<>|]/g, '_').trim();
}

async function downloadQrOnly() {
  const ticket = publicState.ticket;
  if (!ticket) return;
  setLoading(true, '고해상도 QR 이미지를 만들고 있습니다.');
  try {
    const qrCanvas = await createHighResolutionQr(qrPayload(ticket), 1000);
    const anchor = document.createElement('a');
    anchor.href = qrCanvas.toDataURL('image/png');
    anchor.download = `${String(ticket.number).padStart(4, '0')}_${safeFilename(ticket.name)}_개인QR.png`;
    anchor.click();
    showToast('개인 QR 이미지를 저장했습니다.');
  } catch (error) {
    showToast(error.message, 4500);
  } finally {
    setLoading(false);
  }
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawCenteredWrappedText(ctx, text, centerX, startY, maxWidth, lineHeight, maxLines = 3) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  words.forEach(word => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = test;
  });
  if (line) lines.push(line);
  const visible = lines.slice(0, maxLines);
  visible.forEach((item, index) => ctx.fillText(item, centerX, startY + index * lineHeight));
  return startY + visible.length * lineHeight;
}

function createHighResolutionQr(payload, size = 620) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:-99999px;';
  document.body.appendChild(host);
  new QRCode(host, { text: payload, width: size, height: size, correctLevel: QRCode.CorrectLevel.H });
  const qrCanvas = host.querySelector('canvas');
  if (qrCanvas) {
    const copy = document.createElement('canvas');
    copy.width = qrCanvas.width;
    copy.height = qrCanvas.height;
    copy.getContext('2d').drawImage(qrCanvas, 0, 0);
    host.remove();
    return Promise.resolve(copy);
  }
  const qrImage = host.querySelector('img');
  return new Promise((resolve, reject) => {
    if (!qrImage) {
      host.remove();
      reject(new Error('QR 생성에 실패했습니다.'));
      return;
    }
    const finish = () => {
      const copy = document.createElement('canvas');
      copy.width = size;
      copy.height = size;
      copy.getContext('2d').drawImage(qrImage, 0, 0, size, size);
      host.remove();
      resolve(copy);
    };
    if (qrImage.complete) finish();
    else { qrImage.onload = finish; qrImage.onerror = () => reject(new Error('QR 이미지 변환에 실패했습니다.')); }
  });
}

async function downloadTicketImage() {
  const ticket = publicState.ticket;
  if (!ticket) return;
  setLoading(true, '모바일 티켓 이미지를 만들고 있습니다.');
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const qrCanvas = await createHighResolutionQr(qrPayload(ticket), 620);
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1600;
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 1080, 1600);
    gradient.addColorStop(0, '#102034');
    gradient.addColorStop(.65, '#24455f');
    gradient.addColorStop(1, '#3b6478');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const glow = ctx.createRadialGradient(160, 130, 0, 160, 130, 480);
    glow.addColorStop(0, 'rgba(231,198,139,.36)');
    glow.addColorStop(1, 'rgba(231,198,139,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 700, 650);

    ctx.fillStyle = 'rgba(255,255,255,.035)';
    ctx.font = '700 560px Georgia, serif';
    ctx.textAlign = 'right';
    ctx.fillText('20', 1160, 1530);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ead1a5';
    ctx.font = '700 25px Arial, sans-serif';
    ctx.fillText('20TH ANNIVERSARY', 90, 100);
    ctx.textAlign = 'right';
    ctx.fillText(`NO. ${String(ticket.number).padStart(4, '0')}`, 990, 100);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.font = '500 31px Arial, sans-serif';
    ctx.fillText(publicState.settings.eventOrganizer, 540, 205);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 60px "Noto Sans KR", "Malgun Gothic", Arial, sans-serif';
    let nextY = drawCenteredWrappedText(ctx, displayEventName(publicState.settings), 540, 290, 850, 76, 2);

    ctx.fillStyle = '#ead1a5';
    ctx.font = '700 22px Arial, sans-serif';
    ctx.fillText('INVITED GUEST', 540, nextY + 55);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 56px "Noto Sans KR", Arial, sans-serif';
    ctx.fillText(`${ticket.name} 님`, 540, nextY + 125);
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.font = '500 28px "Noto Sans KR", Arial, sans-serif';
    const ticketProfile = [
      ticket.organization||'',
      ticket.disabledPerson
        ? (ticket.usesCenter?'복지관 서비스 이용':'복지관 서비스 미이용')
        : '개인 참가',
      ticket.wheelchairUser?'휠체어 사용':''
    ].filter(Boolean).join(' · ');
    ctx.fillText(ticketProfile, 540, nextY + 170);

    const passY = nextY + 220;
    roundedRect(ctx, 125, passY, 830, 135, 36);
    ctx.fillStyle = 'rgba(255,255,255,.09)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ead1a5';
    ctx.font = '700 22px Arial, sans-serif';
    ctx.fillText('YOUR SEAT', 540, passY + 42);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 31px "Noto Sans KR", Arial, sans-serif';
    const seatLabel = compactSeatLabel(ticket.seat);
    ctx.fillText(seatLabel.length>44?seatLabel.slice(0,41)+'…':seatLabel, 540, passY + 94);

    const qrSize = 500;
    const qrX = (1080 - qrSize) / 2;
    const qrY = passY + 195;
    roundedRect(ctx, qrX - 25, qrY - 25, qrSize + 50, qrSize + 50, 38);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

    ctx.fillStyle = 'rgba(255,255,255,.78)';
    ctx.font = '500 26px "Noto Sans KR", Arial, sans-serif';
    ctx.fillText('현장 접수·좌석 확인·행운추첨 확인 시 이 QR을 제시해 주세요.', 540, qrY + qrSize + 92);
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath();
    ctx.moveTo(120, qrY + qrSize + 135);
    ctx.lineTo(960, qrY + qrSize + 135);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,.78)';
    ctx.font = '500 26px "Noto Sans KR", Arial, sans-serif';
    ctx.fillText(publicState.settings.eventDate, 540, qrY + qrSize + 195);
    ctx.fillText(publicState.settings.eventVenue, 540, qrY + qrSize + 240);

    const anchor = document.createElement('a');
    anchor.href = canvas.toDataURL('image/png');
    anchor.download = `${String(ticket.number).padStart(4, '0')}_${safeFilename(ticket.name)}_20주년_모바일티켓.png`;
    anchor.click();
    showToast('모바일 티켓 이미지를 저장했습니다.');
  } catch (error) {
    showToast(error.message, 4500);
  } finally {
    setLoading(false);
  }
}

async function copyTicketLink() {
  if (!publicState.ticket) return;
  const link = ticketLink(publicState.ticket.id);
  try {
    await navigator.clipboard.writeText(link);
    showToast('내 티켓 링크를 복사했습니다.');
  } catch (error) {
    window.prompt('아래 링크를 복사해 주세요.', link);
  }
}

function clearTicketCodeFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('ticket');
  url.hash = '';
  history.replaceState(null, '', url.toString());
}

async function handleForgetTicket() {
  forgetRememberedTicket();
  clearCachedTicketSnapshot();
  clearTicketCodeFromUrl();
  showToast('이 휴대폰에서 개인 티켓 자동 표시를 해제했습니다.');
}

function handleNewApplication(event) {
  event.preventDefault();
  forgetRememberedTicket();
  clearCachedTicketSnapshot();
  clearTicketCodeFromUrl();
  publicState.ticket = null;
  $('#cancelledTicketSection')?.classList.add('hidden');
  $('#ticketSection').classList.add('hidden');
  $('#applicationForm').reset();
  $('#applicationForm').dataset.startedAt = String(Date.now());
  $('#application').scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast('새 참가자를 신청할 수 있도록 기존 티켓 기억을 해제했습니다.');
}

async function loadRememberedTicket({ scroll = true } = {}) {
  const code = getRememberedTicketCode();
  if (!code) return false;

  setLoading(true, '이 휴대폰에 저장된 개인 티켓을 확인하고 있습니다.');
  try {
    const result = await publicApiRequest('publicTicket', { code });
    if (result.settings) publicState.settings = { ...DEFAULT_PUBLIC_SETTINGS, ...result.settings };
    renderPublicSettings();
    renderTicket(result.participant, {
      existing: true,
      remember: true,
      message: '이 휴대폰에 저장된 신청 정보를 자동으로 불러왔습니다.'
    });
    if (!scroll) window.scrollTo({ top: 0, behavior: 'auto' });
    showToast('저장된 개인 티켓을 자동으로 불러왔습니다.');
    return true;
  } catch (error) {
    if(isTerminalTicketError(error)){
      showCancelledTicketState('참가 신청이 취소되었습니다.');
      showToast('참가 취소가 확인되어 기존 QR을 사용할 수 없습니다.',4800);
      return false;
    }

    const cached=cachedTicketSnapshot(code);
    if(cached?.ticket){
      if(cached.settings){
        publicState.settings={...DEFAULT_PUBLIC_SETTINGS,...cached.settings};
        renderPublicSettings();
      }
      renderTicket(cached.ticket,{
        existing:true,
        remember:true,
        message:'현재 연결이 없어 마지막으로 확인한 티켓 정보를 표시합니다.',
        scroll
      });
      showToast('마지막으로 확인한 좌석 정보를 표시합니다.',4200);
      return true;
    }
    showToast('저장된 티켓 정보를 확인할 수 없습니다.',4800);
    return false;
  } finally {
    setLoading(false);
  }
}

async function handleLookupSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;

  const lookupButton = $('#lookupButton');
  const values = Object.fromEntries(new FormData(form).entries());
  lookupButton.disabled = true;
  setLoading(true, '신청 내역을 확인하고 있습니다.');
  try {
    const result = await publicApiRequest('publicLookup', values);
    if (result.settings) publicState.settings = { ...publicState.settings, ...result.settings };
    renderPublicSettings();
    renderTicket(result.participant, {
      existing: true,
      remember: true,
      message: '접수가 정상적으로 확인되었습니다. 아래 개인 QR을 이용해 주세요.'
    });
    showToast('접수 완료 내역과 개인 QR을 확인했습니다.');
  } catch (error) {
    showToast(error.message, 5200);
  } finally {
    setLoading(false);
    lookupButton.disabled = false;
  }
}

async function loadTicketFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code') || params.get('ticket');
  if (!code) return false;
  setLoading(true, '개인 티켓을 불러오고 있습니다.');
  try {
    const result = await publicApiRequest('publicTicket', { code });
    if (result.settings) publicState.settings = { ...DEFAULT_PUBLIC_SETTINGS, ...result.settings };
    renderPublicSettings();
    renderTicket(result.participant, { existing: true, message: '개인 티켓 링크로 신청 정보를 불러왔습니다.' });
    return true;
  } catch (error) {
    if(isTerminalTicketError(error)){
      showCancelledTicketState('참가 신청이 취소되었습니다.');
      showToast('참가 취소가 확인되어 기존 QR을 사용할 수 없습니다.',4800);
      return false;
    }

    const cached=cachedTicketSnapshot(code);
    if(cached?.ticket){
      if(cached.settings){
        publicState.settings={...DEFAULT_PUBLIC_SETTINGS,...cached.settings};
        renderPublicSettings();
      }
      renderTicket(cached.ticket,{
        existing:true,
        message:'현재 연결이 없어 마지막으로 확인한 티켓 정보를 표시합니다.'
      });
      showToast('마지막으로 확인한 좌석 정보를 표시합니다.',4200);
      return true;
    }
    showToast(error.message,5000);
    return false;
  } finally {
    setLoading(false);
  }
}

async function loadPublicBootstrap() {
  const data = await publicApiRequest('publicBootstrap');
  publicState.settings = { ...DEFAULT_PUBLIC_SETTINGS, ...(data.settings || {}), ...data.counts };
  renderPublicSettings();
}

async function handleApplicationSubmit(event) {
  event.preventDefault();

  const form=event.currentTarget;
  updateIndividualApplicationUi();

  if(!form.reportValidity())return;

  const submitButton=$('#submitButton');
  const values=Object.fromEntries(new FormData(form).entries());

  values.organization=String(form.elements.organization?.value||'').trim();
  values.disabledPerson=Boolean(form.elements.disabledPerson?.checked);

  const wheelchairChoice=String(
    form.querySelector('input[name="wheelchairChoice"]:checked')?.value||''
  );
  const centerServiceChoice=String(
    form.querySelector('input[name="centerServiceChoice"]:checked')?.value||''
  );

  if(values.disabledPerson&&!wheelchairChoice){
    showToast('휠체어 사용 또는 미사용을 선택해 주세요.',5200);
    form.querySelector('input[name="wheelchairChoice"]')?.focus();
    return;
  }
  if(values.disabledPerson&&!centerServiceChoice){
    showToast('남양주시장애인복지관 서비스 이용 여부를 선택해 주세요.',5200);
    form.querySelector('input[name="centerServiceChoice"]')?.focus();
    return;
  }

  values.wheelchairUser=values.disabledPerson&&wheelchairChoice==='use';
  values.usesCenter=values.disabledPerson&&centerServiceChoice==='use';
  values.programName='';
  values.note='';
  values.privacyConsentConfirmed=Boolean(form.elements.privacyConsentConfirmed?.checked);
  values.ageConfirmed=values.privacyConsentConfirmed;
  values.sensitiveConsent=values.disabledPerson&&values.privacyConsentConfirmed;
  values.privacyVersion=
    publicState.settings.privacyConsentVersion||CURRENT_PRIVACY_VERSION;
  values.startedAt=Number(form.dataset.startedAt||Date.now());


  submitButton.disabled=true;
  setLoading(true,'개인 참가 신청을 등록하고 QR을 발급하고 있습니다.');

  try{
    const result=await publicApiRequest('publicRegister',values);
    if(result.settings){
      publicState.settings={...publicState.settings,...result.settings};
    }
    renderPublicSettings();
    renderTicket(result.participant,{
      existing:result.existing,
      remember:true
    });

    if(!result.existing){
      form.reset();
      updateIndividualApplicationUi();
    }

    form.dataset.startedAt=String(Date.now());
    showToast(
      result.existing
        ?'기존 개인 신청의 QR을 불러왔습니다.'
        :'개인 신청과 QR 발급이 완료되었습니다.'
    );
  }catch(error){
    showToast(error.message,5200);
  }finally{
    setLoading(false);
    const canSubmit=
      publicState.settings.registrationOpen!==false &&
      Number(publicState.settings.remainingCount)>0;
    submitButton.disabled=!canSubmit;
  }
}


function defaultPublicSeatMeta(){
  const out=[];let order=1;
  const vip=new Set([
    'AL-08','AL-09','AL-10','AR-01','AR-02','AR-03',
    'BL-08','BL-09','BL-10','BR-01','BR-02','BR-03',
    'CL-08','CL-09','CL-10','CR-01','CR-02','CR-03',
    'DL-08','DL-09','DL-10','DR-01','DR-02','DR-03'
  ]);
  const disabled=new Set();
  ['A','B','C'].forEach(row=>{
    for(let n=1;n<=7;n++)disabled.add(`${row}L-${String(n).padStart(2,'0')}`);
    for(let n=4;n<=10;n++)disabled.add(`${row}R-${String(n).padStart(2,'0')}`);
  });
  'ABCDEFGHIJKLMNO'.split('').forEach(row=>['L','R'].forEach(side=>{
    for(let n=1;n<=10;n++){
      const code=`${row}${side}-${String(n).padStart(2,'0')}`;
      out.push({code,row,side,number:n,category:vip.has(code)?'VIP':disabled.has(code)?'장애인(휠체어)':'일반',enabled:true,wheelchairEligible:disabled.has(code),order:order++});
    }
  }));
  return out;
}

function publicSeatDot(code,m,selected){
  const cls=['public-seat-dot'];
  const cat=String(m?.category||'');
  if(cat.toLowerCase().includes('vip'))cls.push('public-vip');
  if(cat.includes('장애인'))cls.push('public-disabled-priority');
  if(selected)cls.push('my-seat');
  return `<span class="${cls.join(' ')}" title="${code}${cat?' · '+cat:''}${selected?' · 내 좌석':''}"></span>`;
}

function publicRow(row,lN,rN,map,selected){let l='',r='';for(let i=1;i<=lN;i++){const c=`${row}L-${String(i).padStart(2,'0')}`;l+=publicSeatDot(c,map.get(c),selected.has(c))}for(let i=1;i<=rN;i++){const c=`${row}R-${String(i).padStart(2,'0')}`;r+=publicSeatDot(c,map.get(c),selected.has(c))}return `<div class="public-runway-row"><div class="public-side">${l}</div><div class="public-runway-spine">${row}</div><div class="public-side">${r}</div></div>`}
function renderPublicSeatMap(){const a=$('#publicSeatMap');if(!a)return;const src=publicState.seatMeta.length?publicState.seatMeta:defaultPublicSeatMeta(),map=new Map(src.map(s=>[String(s.code).toUpperCase(),s])),selected=new Set(String(publicState.ticket?.seat||'').split(',').map(v=>v.trim().toUpperCase()).filter(Boolean));a.innerHTML='ABCDEFGHIJKLMNO'.split('').map(r=>publicRow(r,10,10,map,selected)).join('');if($('#publicExtraSeatMap'))$('#publicExtraSeatMap').innerHTML=''}

let seatDetailZoom=1;

function detailedSeatCell(code,meta,selected){
  const category=String(meta?.category||'일반');
  const cls=['seat-detail-cell'];

  if(category.toLowerCase().includes('vip'))cls.push('vip');
  else if(category.includes('장애인')||category.includes('휠체어'))cls.push('accessible');
  else cls.push('general');

  if(selected)cls.push('mine');

  return `<span class="${cls.join(' ')}" title="${code} · ${category}${selected?' · 내 좌석':''}"><b>${code.split('-')[1]}</b></span>`;
}

function detailedSeatRow(row,map,selected){
  let left='',right='';

  for(let n=1;n<=10;n++){
    const code=`${row}L-${String(n).padStart(2,'0')}`;
    left+=detailedSeatCell(code,map.get(code),selected.has(code));
  }
  for(let n=1;n<=10;n++){
    const code=`${row}R-${String(n).padStart(2,'0')}`;
    right+=detailedSeatCell(code,map.get(code),selected.has(code));
  }

  return `<div class="seat-detail-row">
    <strong class="seat-detail-row-label">${row}L</strong>
    <div class="seat-detail-side">${left}</div>
    <div class="seat-detail-runway-cell">${row}</div>
    <div class="seat-detail-side">${right}</div>
    <strong class="seat-detail-row-label">${row}R</strong>
  </div>`;
}

function renderDetailedSeatMap(){
  const target=$('#seatDetailMap');
  if(!target)return;

  const src=publicState.seatMeta.length
    ?publicState.seatMeta
    :(cachedSeatLayout().length?cachedSeatLayout():defaultPublicSeatMeta());

  const map=new Map(src.map(s=>[
    String(s.code).toUpperCase(),s
  ]));
  const selected=new Set(
    String(publicState.ticket?.seat||'')
      .split(',')
      .map(v=>v.trim().toUpperCase())
      .filter(Boolean)
  );

  target.innerHTML='ABCDEFGHIJKLMNO'
    .split('')
    .map(row=>detailedSeatRow(row,map,selected))
    .join('');

  const current=$('#seatDetailCurrentText');
  if(current){
    current.textContent=publicState.ticket?.seat
      ?`현재 좌석: ${compactSeatLabel(publicState.ticket.seat)}`
      :'현재 배정 좌석을 확인하고 있습니다.';
  }
}

function applySeatDetailZoom(){
  const canvas=$('#seatDetailCanvas');
  if(!canvas)return;
  canvas.style.setProperty('--seat-detail-zoom',String(seatDetailZoom));
  const reset=$('#seatZoomResetButton');
  if(reset)reset.textContent=`${Math.round(seatDetailZoom*100)}%`;
}

function updateSeatDetailConnectionStatus(){
  const text=$('#seatDetailSyncText');
  const dot=$('#seatDetailConnectionDot');
  if(!text||!dot)return;

  const last=formatSeatSyncTime(lastSeatSyncAt());
  const online=navigator.onLine;

  dot.classList.toggle('offline',!online);

  if(online){
    text.textContent=last
      ?`온라인 · 마지막 좌석 확인 ${last}`
      :'온라인 · 최신 좌석 정보를 확인할 수 있습니다.';
  }else{
    text.textContent=last
      ?`오프라인 · ${last}에 마지막으로 확인한 좌석을 표시합니다.`
      :'오프라인 · 저장된 좌석 정보가 없습니다.';
  }
}

async function openSeatDetailModal(){
  const backdrop=$('#seatDetailBackdrop');
  if(!backdrop)return;

  backdrop.classList.remove('hidden');
  backdrop.setAttribute('aria-hidden','false');
  document.body.classList.add('modal-open');
  seatDetailZoom=1;
  applySeatDetailZoom();

  if(navigator.onLine){
    await Promise.allSettled([
      syncCurrentTicket(),
      loadPublicSeatLayout()
    ]);
  }else{
    const cached=cachedSeatLayout();
    if(cached.length)publicState.seatMeta=cached;
  }

  renderDetailedSeatMap();
  updateSeatDetailConnectionStatus();
  $('#seatDetailCloseButton')?.focus();
}

function closeSeatDetailModal(){
  const backdrop=$('#seatDetailBackdrop');
  if(!backdrop)return;
  backdrop.classList.add('hidden');
  backdrop.setAttribute('aria-hidden','true');
  document.body.classList.remove('modal-open');
  $('#openSeatDetailButton')?.focus();
}


async function loadPublicSeatLayout(){
  try{
    const r=await publicApiRequest('publicSeatLayout');
    publicState.seatMeta=Array.isArray(r?.seats)?r.seats:[];
    if(publicState.seatMeta.length)cacheSeatLayout(publicState.seatMeta);
  }catch(_){
    const cached=cachedSeatLayout();
    if(cached.length)publicState.seatMeta=cached;
    else if(!publicState.seatMeta.length)publicState.seatMeta=defaultPublicSeatMeta();
  }

  renderPublicSeatMap();
  renderDetailedSeatMap();
  updateSeatDetailConnectionStatus();
}
async function syncCurrentTicket(){
  if(!publicState.ticket?.id||document.hidden)return;

  try{
    const before=String(publicState.ticket.seat||'');
    const r=await publicApiRequest('publicTicket',{code:publicState.ticket.id});

    if(r.settings)publicState.settings={...publicState.settings,...r.settings};

    if(r.participant){
      const changed=before!==String(r.participant.seat||'');
      renderTicket(r.participant,{
        existing:true,
        scroll:false,
        message:changed
          ?'좌석 정보가 변경되어 최신 내용으로 갱신되었습니다.'
          :'현재 좌석 정보가 최신 상태입니다.'
      });
      if(changed)showToast('최신 좌석 정보가 반영되었습니다.',4200);
    }
  }catch(error){
    if(isTerminalTicketError(error)){
      showCancelledTicketState('참가 신청이 취소되었습니다.');
      showToast('참가 취소가 확인되어 기존 QR을 사용할 수 없습니다.',4800);
      return;
    }
    updateSeatDetailConnectionStatus();
  }
}
function startTicketLiveSync(){clearInterval(ticketRefreshTimer);ticketRefreshTimer=setInterval(syncCurrentTicket,Math.max(5,Number(publicState.settings.ticketRefreshSeconds)||15)*1000);clearInterval(seatLayoutRefreshTimer);seatLayoutRefreshTimer=setInterval(loadPublicSeatLayout,60000)}


function updateIndividualApplicationUi(){
  const form=$('#applicationForm');
  if(!form)return;

  const disabledPerson=Boolean(form.elements.disabledPerson?.checked);
  const details=$('#accessibilityDetails');

  details?.classList.toggle('hidden',!disabledPerson);

  const wheelRadios=[
    ...form.querySelectorAll('input[name="wheelchairChoice"]')
  ];
  const serviceRadios=[
    ...form.querySelectorAll('input[name="centerServiceChoice"]')
  ];

  wheelRadios.forEach(input=>{input.required=disabledPerson;});
  serviceRadios.forEach(input=>{input.required=disabledPerson;});

  if(!disabledPerson){
    wheelRadios.forEach(input=>{input.checked=false;});
    serviceRadios.forEach(input=>{input.checked=false;});
  }
}
function openSensitiveModal(){$('#sensitiveModalBackdrop')?.classList.remove('hidden');$('#sensitiveModalBackdrop')?.setAttribute('aria-hidden','false');document.body.classList.add('modal-open')}
function closeSensitiveModal(){$('#sensitiveModalBackdrop')?.classList.add('hidden');$('#sensitiveModalBackdrop')?.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open')}

function openPrivacyModal() {
  const backdrop = $('#privacyModalBackdrop');
  if (!backdrop) return;
  backdrop.classList.remove('hidden');
  backdrop.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  const body = document.querySelector('.privacy-modal-body');
  if (body) body.scrollTop = 0;
  $('#privacyModalCloseButton')?.focus();
}

function closePrivacyModal() {
  const backdrop = $('#privacyModalBackdrop');
  if (!backdrop) return;
  backdrop.classList.add('hidden');
  backdrop.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  $('#privacyDetailsButton')?.focus();
}


function setupAnniversaryTrailer() {
  const video = $('#anniversaryTrailer');
  const fallback = $('#trailerFallback');
  if (!video || !fallback) return;
  video.addEventListener('error', () => {
    video.classList.add('hidden');
    fallback.classList.remove('hidden');
  });
}
async function copyVenueAddress() {
  const address = '경기 남양주시 경춘로990번길 37';
  try { await navigator.clipboard.writeText(address); showToast('행사장 주소를 복사했습니다.'); }
  catch (error) { window.prompt('아래 주소를 복사해 주세요.', address); }
}


let introFinished = false;

function finishIntro() {
  if (introFinished) return;
  introFinished = true;

  const overlay = $('#introOverlay');
  const video = $('#introVideo');

  try { video?.pause(); } catch (_) {}

  overlay?.classList.add('intro-leaving');
  document.body.classList.remove('intro-playing');

  window.setTimeout(() => {
    overlay?.classList.add('hidden');
    overlay?.setAttribute('aria-hidden', 'true');
    window.scrollTo(0, 0);
  }, 520);
}

function formatIntroTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function updateIntroProgress() {
  const video = $('#introVideo');
  if (!video) return;

  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const current = Number(video.currentTime) || 0;

  const currentLabel = $('#introCurrentTime');
  const durationLabel = $('#introDurationTime');
  const seekBar = $('#introSeekBar');

  if (currentLabel) currentLabel.textContent = formatIntroTime(current);
  if (durationLabel) durationLabel.textContent = duration > 0 ? formatIntroTime(duration) : '00:00';

  if (seekBar && !seekBar.matches(':active') && document.activeElement !== seekBar) {
    seekBar.value = duration > 0 ? String(Math.round((current / duration) * 1000)) : '0';
  }

  updateIntroPlayPauseButton();
}

function updateIntroPlayPauseButton() {
  const video = $('#introVideo');
  const button = $('#introPlayPauseButton');
  if (!video || !button) return;

  const paused = video.paused;
  button.innerHTML = paused
    ? '▶ <span>재생</span>'
    : '❚❚ <span>일시정지</span>';
  button.setAttribute('aria-label', paused ? '영상 재생' : '영상 일시정지');
}

function updateIntroSoundButton() {
  const video = $('#introVideo');
  const button = $('#introSoundButton');
  if (!video || !button) return;

  const muted = video.muted || Number(video.volume) === 0;
  button.innerHTML = muted
    ? '🔇 <span>소리 켜기</span>'
    : '🔊 <span>음소거</span>';
  button.setAttribute('aria-label', muted ? '영상 소리 켜기' : '영상 음소거');
}

function showIntroStartPanel() {
  $('#introStartPanel')?.classList.remove('hidden');
}

function hideIntroStartPanel() {
  $('#introStartPanel')?.classList.add('hidden');
}

async function startIntroMuted() {
  const video = $('#introVideo');

  if (!video) {
    finishIntro();
    return;
  }

  hideIntroStartPanel();

  try {
    video.currentTime = 0;
    video.muted = true;
    await video.play();
    updateIntroSoundButton();
    updateIntroPlayPauseButton();
  } catch (_) {
    showIntroStartPanel();
    updateIntroPlayPauseButton();
  }
}


function shouldUseMobileIntro() {
  const narrowScreen = window.matchMedia('(max-width: 820px)').matches;
  const portrait = window.matchMedia('(orientation: portrait)').matches;
  const touchDevice = window.matchMedia('(pointer: coarse)').matches;
  return portrait && (narrowScreen || touchDevice);
}

function preferredIntroSource() {
  return shouldUseMobileIntro()
    ? 'assets/intro_mobile.mp4'
    : 'assets/intro.mp4';
}

function applyResponsiveIntroSource() {
  const video = $('#introVideo');
  if (!video) return '';

  const nextSource = preferredIntroSource();
  const currentSource = video.getAttribute('data-selected-source') || '';

  if (currentSource !== nextSource) {
    video.pause();
    video.removeAttribute('src');
    video.src = nextSource;
    video.setAttribute('data-selected-source', nextSource);
    video.load();
  }

  return nextSource;
}

async function openInvitationIntro() {
  if (introFinished || window.__invitationIntroOpened) return;
  window.__invitationIntroOpened = true;

  const gate = $('#invitationGate');
  const movieStage = $('#introMovieStage');
  const video = $('#introVideo');

  gate?.classList.add('gate-opening');
  movieStage?.classList.add('active');
  movieStage?.setAttribute('aria-hidden', 'false');

  if (!video) {
    window.setTimeout(finishIntro, 900);
    return;
  }

  try {
    video.currentTime = 0;
    video.volume = 1;
    video.muted = false;

    // 이 play() 호출은 사용자의 클릭 이벤트 안에서 즉시 실행됩니다.
    // 따라서 iOS/Android 브라우저에서도 소리 재생 권한을 얻기 가장 안정적입니다.
    await video.play();
  } catch (_) {
    try {
      video.muted = true;
      await video.play();
    } catch (_) {
      window.setTimeout(finishIntro, 900);
      return;
    }
  }

  updateIntroSoundButton();
  updateIntroPlayPauseButton();

  window.setTimeout(() => {
    gate?.classList.add('gate-hidden');
  }, 1050);
}

function setupIntroVideo() {
  const overlay = $('#introOverlay');
  const gate = $('#invitationGate');
  const movieStage = $('#introMovieStage');
  const video = $('#introVideo');

  if (!overlay || !video) return;

  applyResponsiveIntroSource();

  introFinished = false;
  window.__invitationIntroOpened = false;

  overlay.classList.remove('hidden', 'intro-leaving');
  overlay.setAttribute('aria-hidden', 'false');
  gate?.classList.remove('gate-opening', 'gate-hidden');
  movieStage?.classList.remove('active');
  movieStage?.setAttribute('aria-hidden', 'true');
  document.body.classList.add('intro-playing');

  try {
    video.pause();
    video.currentTime = 0;
    video.muted = true;
  } catch (_) {}

  const seekBar = $('#introSeekBar');

  const seekBySeconds = seconds => {
    if (!Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    updateIntroProgress();
  };

  const togglePlayPause = async () => {
    if (video.paused) {
      try {
        await video.play();
      } catch (_) {}
    } else {
      video.pause();
    }
    updateIntroPlayPauseButton();
  };

  video.addEventListener('loadedmetadata', () => {
    updateIntroProgress();
    updateIntroSoundButton();
  });

  video.addEventListener('durationchange', updateIntroProgress);
  video.addEventListener('timeupdate', updateIntroProgress);
  video.addEventListener('play', updateIntroPlayPauseButton);
  video.addEventListener('pause', updateIntroPlayPauseButton);
  video.addEventListener('volumechange', updateIntroSoundButton);
  video.addEventListener('ended', finishIntro, { once: true });

  video.addEventListener('error', () => {
    // 첫 초대장 화면 자체는 유지합니다.
    // 사용자가 열기를 누른 이후 영상 파일 오류가 난 경우에는 본문으로 자연스럽게 이동합니다.
    if (window.__invitationIntroOpened) {
      window.setTimeout(finishIntro, 700);
    }
  });

  video.addEventListener('click', togglePlayPause);

  $('#introPlayPauseButton')?.addEventListener('click', togglePlayPause);
  $('#introBack10Button')?.addEventListener('click', () => seekBySeconds(-10));
  $('#introForward10Button')?.addEventListener('click', () => seekBySeconds(10));
  $('#introSkipButton')?.addEventListener('click', finishIntro);

  seekBar?.addEventListener('input', event => {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    const ratio = Math.max(0, Math.min(1000, Number(event.currentTarget.value) || 0)) / 1000;
    const previewSeconds = video.duration * ratio;
    const currentLabel = $('#introCurrentTime');
    if (currentLabel) currentLabel.textContent = formatIntroTime(previewSeconds);
  });

  seekBar?.addEventListener('change', event => {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    const ratio = Math.max(0, Math.min(1000, Number(event.currentTarget.value) || 0)) / 1000;
    video.currentTime = video.duration * ratio;
    updateIntroProgress();
  });

  $('#introSoundButton')?.addEventListener('click', async () => {
    video.muted = !video.muted;
    if (!video.muted && video.paused) {
      try { await video.play(); } catch (_) {}
    }
    updateIntroSoundButton();
  });

  $('#invitationOpenButton')?.addEventListener('click', openInvitationIntro);
  $('#invitationEnvelopeButton')?.addEventListener('click', openInvitationIntro);
  $('#invitationSkipButton')?.addEventListener('click', finishIntro);

  // 아직 초대장을 열지 않은 상태에서 회전한 경우에만 세로/가로 영상 소스를 다시 고릅니다.
  window.addEventListener('orientationchange', () => {
    if (introFinished || window.__invitationIntroOpened) return;
    window.setTimeout(() => {
      applyResponsiveIntroSource();
      try {
        video.pause();
        video.currentTime = 0;
        video.muted = true;
      } catch (_) {}
    }, 250);
  });

  updateIntroProgress();
  updateIntroSoundButton();
  updateIntroPlayPauseButton();
}

async function initialize() {
  setupIntroVideo();
  $('#applicationForm').dataset.startedAt = String(Date.now());
  $('#applicationForm input[name="phone"]').addEventListener('input', event => normalizePhoneInput(event.currentTarget));
  $('#lookupForm input[name="phone"]').addEventListener('input', event => normalizePhoneInput(event.currentTarget));
  $('#applicationForm').addEventListener('submit', handleApplicationSubmit);
  $('#applicationForm input[name="disabledPerson"]')?.addEventListener('change', updateIndividualApplicationUi);
  updateIndividualApplicationUi();
  $('#lookupForm').addEventListener('submit', handleLookupSubmit);
  $('#openSeatDetailButton')?.addEventListener('click', openSeatDetailModal);
  $('#seatDetailCloseButton')?.addEventListener('click', closeSeatDetailModal);
  $('#seatDetailDoneButton')?.addEventListener('click', closeSeatDetailModal);
  $('#seatDetailBackdrop')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeSeatDetailModal()});
  $('#seatZoomOutButton')?.addEventListener('click',()=>{seatDetailZoom=Math.max(.75,seatDetailZoom-.25);applySeatDetailZoom()});
  $('#seatZoomResetButton')?.addEventListener('click',()=>{seatDetailZoom=1;applySeatDetailZoom()});
  $('#seatZoomInButton')?.addEventListener('click',()=>{seatDetailZoom=Math.min(1.75,seatDetailZoom+.25);applySeatDetailZoom()});
  $('#additionalParticipantButton')?.addEventListener('click',startAdditionalParticipantApplication);
  $('#downloadTicketButton').addEventListener('click', downloadTicketImage);
  $('#downloadQrButton').addEventListener('click', downloadQrOnly);
  $('#copyLinkButton').addEventListener('click', copyTicketLink);
  $('#forgetTicketButton').addEventListener('click', handleForgetTicket);
  $('#showRememberedTicketButton').addEventListener('click', () => loadRememberedTicket({ scroll: true }));
  $('#newApplicationLink').addEventListener('click', handleNewApplication);
  $('#copyVenueAddressButton')?.addEventListener('click', copyVenueAddress);
  setupAnniversaryTrailer();
  $('#privacyDetailsButton')?.addEventListener('click', openPrivacyModal);
  $('#privacyModalCloseButton')?.addEventListener('click', closePrivacyModal);
  $('#privacyModalConfirmButton')?.addEventListener('click', closePrivacyModal);
  $('#privacyModalBackdrop')?.addEventListener('click', event => { if (event.target === event.currentTarget) closePrivacyModal(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('#privacyModalBackdrop')?.classList.contains('hidden')) closePrivacyModal(); });
  updateRememberedTicketUi();

  const cachedSeats=cachedSeatLayout();
  if(cachedSeats.length){
    publicState.seatMeta=cachedSeats;
    renderPublicSeatMap();
  }
  updateSeatDetailConnectionStatus();
  window.addEventListener('online',updateSeatDetailConnectionStatus);
  window.addEventListener('offline',updateSeatDetailConnectionStatus);

  if (!isConfiguredUrl(API_URL)) {
    $('#setupWarning').classList.remove('hidden');
    $('#registrationStatus').className = 'registration-status closed';
    $('#registrationStatus').textContent = '현재 온라인 신청을 준비 중입니다. 잠시 후 다시 확인해 주세요.';
    $('#submitButton').disabled = true;
    return;
  }

  try {
    await loadPublicBootstrap();
    
    await loadPublicSeatLayout();
    const loadedFromUrl = await loadTicketFromUrl();
    if (!loadedFromUrl) await loadRememberedTicket({ scroll: true });
    window.addEventListener('focus',()=>syncCurrentTicket());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncCurrentTicket()});
  } catch (error) {
    $('#registrationStatus').className = 'registration-status closed';
    $('#registrationStatus').textContent = '현재 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.';
    $('#submitButton').disabled = true;

    const codeFromUrl=new URLSearchParams(window.location.search).get('code')||
      new URLSearchParams(window.location.search).get('ticket')||
      getRememberedTicketCode();
    const cached=cachedTicketSnapshot(codeFromUrl||'');

    if(cached?.ticket){
      if(cached.settings){
        publicState.settings={...DEFAULT_PUBLIC_SETTINGS,...cached.settings};
        renderPublicSettings();
      }
      renderTicket(cached.ticket,{
        existing:true,
        remember:Boolean(cached.ticket.id),
        message:'현재 연결이 없어 마지막으로 확인한 티켓 정보를 표시합니다.',
        scroll:true
      });
      showToast('마지막으로 확인한 좌석 정보를 표시합니다.',4200);
    }else{
      showToast('현재 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.',5200);
    }
  }
}

initialize();
