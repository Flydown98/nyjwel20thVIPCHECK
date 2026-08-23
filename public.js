'use strict';

const PUBLIC_CONFIG = window.NYJ20_CONFIG || {};
const API_URL = String(PUBLIC_CONFIG.appsScriptUrl || '').trim();
const DEVICE_TICKET_STORAGE_KEY = 'nyj20.publicTicketCode.v1';
const CURRENT_PRIVACY_VERSION = 'NYJWEL20-INDIVIDUAL-2026-08-23-v2';
const DEFAULT_PUBLIC_SETTINGS = Object.freeze({
  eventName: '남양주시장애인복지관 개관 20주년 기념행사',
  eventDate: '2026. 9. 17.(목) 13:30',
  eventVenue: '남양주금곡실내체육관',
  eventOrganizer: '남양주시장애인복지관',
  publicSubtitle: '스무번의 계절, 스물한 번째 약속',
  publicGreeting: '남양주시장애인복지관의 스무 해를 함께해 주신 여러분을 초대합니다.',
  privacyRetentionText: '행사 종료 후 결과 정리 및 문의 대응 완료 시까지(최대 30일)',
  registrationOpen: true,
  registrationCapacity: 450,
  registeredCount: 0,
  remainingCount: 450,
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

function getRememberedTicketCode() {
  try {
    return String(localStorage.getItem(DEVICE_TICKET_STORAGE_KEY) || '').trim().toUpperCase();
  } catch (error) {
    return '';
  }
}

function rememberTicketCode(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return;
  try {
    localStorage.setItem(DEVICE_TICKET_STORAGE_KEY, normalized);
  } catch (error) {
    // 시크릿 모드나 저장공간 제한 환경에서는 자동 기억만 생략합니다.
  }
  updateRememberedTicketUi();
}

function forgetRememberedTicket() {
  try {
    localStorage.removeItem(DEVICE_TICKET_STORAGE_KEY);
  } catch (error) {
    // 저장공간 접근이 막힌 환경에서는 별도 처리가 필요하지 않습니다.
  }
  updateRememberedTicketUi();
}

function updateRememberedTicketUi() {
  const hasCode = Boolean(getRememberedTicketCode());
  $('#rememberedTicketNotice')?.classList.toggle('hidden', !hasCode);
  $('#forgetTicketButton')?.classList.toggle('hidden', !hasCode);
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
        fail(new Error('서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.'));
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
          fail(new Error(response?.error || '신청 서버에서 오류가 발생했습니다.'));
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
      fail(new Error('신청 서버에 요청을 보내지 못했습니다.'));
    }
  });
}

function renderPublicSettings() {
  const settings = publicState.settings;
  $('#organizerText').textContent = settings.eventOrganizer;
  $('#eventNameText').textContent = settings.eventName;
  $('#subtitleText').textContent = settings.publicSubtitle;
  $('#eventDateText').textContent = settings.eventDate;
  $('#eventVenueText').textContent = settings.eventVenue;
  $('#detailDateText').textContent = settings.eventDate;
  $('#detailVenueText').textContent = settings.eventVenue;
  $('#greetingText').textContent = settings.publicGreeting;
  const retentionText = $('#privacyRetentionText');
  if (retentionText) retentionText.textContent = settings.privacyRetentionText || DEFAULT_PUBLIC_SETTINGS.privacyRetentionText;
  document.title = `${settings.eventName} 모바일 초대장`;

  const status = $('#registrationStatus');
  const submit = $('#submitButton');
  const full = Number(settings.remainingCount) <= 0;
  const open = settings.registrationOpen !== false && !full;
  status.className = `registration-status ${open ? 'open' : 'closed'}`;
  if (open) {
    status.textContent = '현재 참가 신청이 가능합니다.';
  } else if (full) {
    status.textContent = '참가 신청이 마감되었습니다.';
  } else {
    status.textContent = '현재 온라인 참가 신청이 마감되어 있습니다.';
  }
  submit.disabled = !open;
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
function renderTicket(ticket,{existing=false,remember=false,message='',scroll=true}={}){
  publicState.ticket=ticket;
  if(remember)rememberTicketCode(ticket.id);

  const s=publicState.settings;
  $('#ticketNumber').textContent=`NO. ${String(ticket.number).padStart(4,'0')}`;
  $('#ticketOrganizer').textContent=s.eventOrganizer;
  $('#ticketEventName').textContent=s.eventName;
  $('#ticketName').textContent=`${ticket.name} 님`;

  const profile=[];
  if(ticket.usesCenter)profile.push(ticket.programName?`복지관 이용 · ${ticket.programName}`:'복지관 이용');
  else profile.push('개인 참가');
  if(ticket.wheelchairUser)profile.push('♿ 휠체어 이용');
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
    ctx.font = '500 60px Georgia, "Noto Sans KR", sans-serif';
    let nextY = drawCenteredWrappedText(ctx, publicState.settings.eventName, 540, 290, 850, 76, 2);

    ctx.fillStyle = '#ead1a5';
    ctx.font = '700 22px Arial, sans-serif';
    ctx.fillText('INVITED GUEST', 540, nextY + 55);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 56px "Noto Sans KR", Arial, sans-serif';
    ctx.fillText(`${ticket.name} 님`, 540, nextY + 125);
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.font = '500 28px "Noto Sans KR", Arial, sans-serif';
    const ticketProfile = ticket.usesCenter && ticket.programName
      ? `개인 참가 · ${ticket.programName}`
      : '개인 참가';
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
  clearTicketCodeFromUrl();
  showToast('이 휴대폰에서 개인 티켓 자동 표시를 해제했습니다.');
}

function handleNewApplication(event) {
  event.preventDefault();
  forgetRememberedTicket();
  clearTicketCodeFromUrl();
  publicState.ticket = null;
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
    forgetRememberedTicket();
    showToast('저장된 티켓 정보를 확인할 수 없어 자동 표시를 해제했습니다.', 4800);
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
    showToast(error.message, 5000);
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

  values.usesCenter=Boolean(form.elements.usesCenter?.checked);
  values.programName=values.usesCenter
    ?String(form.elements.programName?.value||'').trim()
    :'';
  values.wheelchairUser=Boolean(form.elements.wheelchairUser?.checked);
  values.disabledPerson=Boolean(form.elements.disabledPerson?.checked);
  values.sensitiveConsent=Boolean(form.elements.sensitiveConsent?.checked);
  values.privacyConsentConfirmed=Boolean(
    form.elements.privacyConsentConfirmed?.checked
  );
  values.ageConfirmed=Boolean(form.elements.ageConfirmed?.checked);
  values.privacyVersion=
    publicState.settings.privacyConsentVersion||CURRENT_PRIVACY_VERSION;
  values.note=String(form.elements.note?.value||'').trim();
    values.startedAt=Number(form.dataset.startedAt||Date.now());

  if(values.usesCenter&&!values.programName){
    showToast('복지관 이용 중인 경우 이용 프로그램을 입력해 주세요.',5200);
    form.elements.programName?.focus();
    return;
  }

  if((values.wheelchairUser||values.disabledPerson)&&!values.sensitiveConsent){
    showToast('체크한 민감정보 항목의 처리 동의가 필요합니다.',5200);
    form.elements.sensitiveConsent?.focus();
    return;
  }

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


function defaultPublicSeatMeta(){const out=[];let order=1;const vip=new Set(['AL-13','AL-14','AL-15','AR-01','AR-02','AR-03','BL-13','BL-14','BL-15','BR-01','BR-02','BR-03','CL-13','CL-14','CL-15','CR-01','CR-02','CR-03','DL-13','DL-14','DL-15','DR-01','DR-02','DR-03']);const wc=new Set('ABCDEFGHIJKLMNO'.split('').map(row=>`${row}R-15`));'ABCDEFGHIJKLMNO'.split('').forEach(row=>['L','R'].forEach(side=>{for(let n=1;n<=15;n++){const code=`${row}${side}-${String(n).padStart(2,'0')}`;out.push({code,row,side,number:n,category:wc.has(code)?'휠체어':vip.has(code)?'VIP':'일반',enabled:true,wheelchairEligible:wc.has(code),order:order++})}}));return out}
function publicSeatDot(code,m,selected){const cls=['public-seat-dot'];if(String(m?.category||'').toLowerCase().includes('vip'))cls.push('public-vip');if(m?.wheelchairEligible)cls.push('public-wheelchair');if(selected)cls.push('my-seat');return `<span class="${cls.join(' ')}" title="${code}${selected?' · 내 좌석':''}"></span>`}
function publicRow(row,lN,rN,map,selected){let l='',r='';for(let i=1;i<=lN;i++){const c=`${row}L-${String(i).padStart(2,'0')}`;l+=publicSeatDot(c,map.get(c),selected.has(c))}for(let i=1;i<=rN;i++){const c=`${row}R-${String(i).padStart(2,'0')}`;r+=publicSeatDot(c,map.get(c),selected.has(c))}return `<div class="public-runway-row"><div class="public-side">${l}</div><div class="public-runway-spine">${row}</div><div class="public-side">${r}</div></div>`}
function renderPublicSeatMap(){const a=$('#publicSeatMap');if(!a)return;const src=publicState.seatMeta.length?publicState.seatMeta:defaultPublicSeatMeta(),map=new Map(src.map(s=>[String(s.code).toUpperCase(),s])),selected=new Set(String(publicState.ticket?.seat||'').split(',').map(v=>v.trim().toUpperCase()).filter(Boolean));a.innerHTML='ABCDEFGHIJKLMNO'.split('').map(r=>publicRow(r,15,15,map,selected)).join('');if($('#publicExtraSeatMap'))$('#publicExtraSeatMap').innerHTML=''}
async function loadPublicSeatLayout(){try{const r=await publicApiRequest('publicSeatLayout');publicState.seatMeta=Array.isArray(r?.seats)?r.seats:[];}catch(_){if(!publicState.seatMeta.length)publicState.seatMeta=defaultPublicSeatMeta()}renderPublicSeatMap()}
async function syncCurrentTicket(){if(!publicState.ticket?.id||document.hidden)return;try{const before=String(publicState.ticket.seat||''),r=await publicApiRequest('publicTicket',{code:publicState.ticket.id});if(r.settings)publicState.settings={...publicState.settings,...r.settings};if(r.participant){const changed=before!==String(r.participant.seat||'');renderTicket(r.participant,{existing:true,scroll:false,message:changed?'관리자가 좌석을 변경했습니다. 최신 좌석으로 갱신했습니다.':'현재 좌석 정보가 최신 상태입니다.'});if(changed)showToast('좌석 변경사항이 반영되었습니다.',4200)}}catch(_){}}
function startTicketLiveSync(){clearInterval(ticketRefreshTimer);ticketRefreshTimer=setInterval(syncCurrentTicket,Math.max(5,Number(publicState.settings.ticketRefreshSeconds)||15)*1000);clearInterval(seatLayoutRefreshTimer);seatLayoutRefreshTimer=setInterval(loadPublicSeatLayout,60000)}


function updateIndividualApplicationUi(){
  const form=$('#applicationForm');
  if(!form)return;

  const usesCenter=Boolean(form.elements.usesCenter?.checked);
  const programRow=$('#programFieldRow');
  const programInput=form.elements.programName;

  programRow?.classList.toggle('hidden',!usesCenter);
  if(programInput){
    programInput.required=usesCenter;
    if(!usesCenter)programInput.value='';
  }

  const wheelchair=Boolean(form.elements.wheelchairUser?.checked);
  const disabledPerson=Boolean(form.elements.disabledPerson?.checked);
  const sensitiveNeeded=wheelchair||disabledPerson;
  const sensitiveRow=$('#sensitiveConsentRow');
  const sensitiveBox=form.elements.sensitiveConsent;

  sensitiveRow?.classList.toggle('hidden',!sensitiveNeeded);
  if(sensitiveBox){
    sensitiveBox.required=sensitiveNeeded;
    if(!sensitiveNeeded)sensitiveBox.checked=false;
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

function setupIntroVideo() {
  const overlay = $('#introOverlay');
  const video = $('#introVideo');

  if (!overlay || !video) return;

  applyResponsiveIntroSource();

  introFinished = false;
  overlay.classList.remove('hidden', 'intro-leaving');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('intro-playing');

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
      } catch (_) {
        showIntroStartPanel();
      }
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
    finishIntro();
  }, { once: true });

  // 영상 자체를 눌러도 재생/일시정지.
  video.addEventListener('click', togglePlayPause);

  $('#introPlayPauseButton')?.addEventListener('click', togglePlayPause);
  $('#introBack10Button')?.addEventListener('click', () => seekBySeconds(-10));
  $('#introForward10Button')?.addEventListener('click', () => seekBySeconds(10));
  $('#introSkipButton')?.addEventListener('click', finishIntro);

  seekBar?.addEventListener('input', event => {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    const ratio = Math.max(0, Math.min(1000, Number(event.currentTarget.value) || 0)) / 1000;
    const previewSeconds = video.duration * ratio;
    $('#introCurrentTime').textContent = formatIntroTime(previewSeconds);
  });

  seekBar?.addEventListener('change', event => {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    const ratio = Math.max(0, Math.min(1000, Number(event.currentTarget.value) || 0)) / 1000;
    video.currentTime = video.duration * ratio;
    updateIntroProgress();
  });

  $('#introSoundButton')?.addEventListener('click', async () => {
    // 사용자 클릭이므로 모바일 브라우저에서도 오디오 활성화가 가능.
    video.muted = !video.muted;

    if (!video.muted && video.paused) {
      try { await video.play(); } catch (_) {}
    }

    updateIntroSoundButton();
  });

  $('#introStartButton')?.addEventListener('click', async () => {
    hideIntroStartPanel();

    try {
      video.muted = false;
      await video.play();
    } catch (_) {
      video.muted = true;
      await video.play().catch(finishIntro);
    }

    updateIntroSoundButton();
    updateIntroPlayPauseButton();
  });

  window.addEventListener('orientationchange', () => {
    if (introFinished) return;

    window.setTimeout(() => {
      const before = video.getAttribute('data-selected-source') || '';
      const after = preferredIntroSource();

      if (before !== after) {
        applyResponsiveIntroSource();
        startIntroMuted();
      }
    }, 250);
  }, { once: true });

  updateIntroProgress();
  updateIntroSoundButton();
  updateIntroPlayPauseButton();
  startIntroMuted();

  window.setTimeout(() => {
    if (!introFinished && video.paused && Number(video.currentTime || 0) < 0.2) {
      showIntroStartPanel();
    }
  }, 1500);
}


async function initialize() {
  setupIntroVideo();
  $('#applicationForm').dataset.startedAt = String(Date.now());
  $('#applicationForm input[name="phone"]').addEventListener('input', event => normalizePhoneInput(event.currentTarget));
  $('#lookupForm input[name="phone"]').addEventListener('input', event => normalizePhoneInput(event.currentTarget));
  $('#applicationForm').addEventListener('submit', handleApplicationSubmit);
  $('#applicationForm input[name="usesCenter"]')?.addEventListener('change', updateIndividualApplicationUi);
  $('#applicationForm input[name="wheelchairUser"]')?.addEventListener('change', updateIndividualApplicationUi);
  $('#applicationForm input[name="disabledPerson"]')?.addEventListener('change', updateIndividualApplicationUi);
  updateIndividualApplicationUi();
  $('#sensitiveDetailsButton')?.addEventListener('click', openSensitiveModal);
  $('#sensitiveModalCloseButton')?.addEventListener('click', closeSensitiveModal);
  $('#sensitiveModalConfirmButton')?.addEventListener('click', closeSensitiveModal);
  $('#sensitiveModalBackdrop')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeSensitiveModal()});
  $('#lookupForm').addEventListener('submit', handleLookupSubmit);
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

  if (!isConfiguredUrl(API_URL)) {
    $('#setupWarning').classList.remove('hidden');
    $('#registrationStatus').className = 'registration-status closed';
    $('#registrationStatus').textContent = '서버 설정 전에는 신청할 수 없습니다.';
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
    $('#registrationStatus').textContent = error.message;
    $('#submitButton').disabled = true;
    showToast(error.message, 5200);
  }
}

initialize();
