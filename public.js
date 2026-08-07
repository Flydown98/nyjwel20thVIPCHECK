'use strict';

const PUBLIC_CONFIG = window.NYJ20_CONFIG || {};
const API_URL = String(PUBLIC_CONFIG.appsScriptUrl || '').trim();
const DEFAULT_PUBLIC_SETTINGS = Object.freeze({
  eventName: '남양주시장애인복지관 개관 20주년 기념행사',
  eventDate: '2026. 9. 17.(목) 14:00',
  eventVenue: '남양주금곡실내체육관',
  eventOrganizer: '남양주시장애인복지관',
  publicSubtitle: '스무번의 계절, 스물한번째 약속',
  publicGreeting: '남양주시장애인복지관의 스무 해를 함께해 주신 여러분을 초대합니다.',
  registrationOpen: true,
  registrationCapacity: 40,
  registeredCount: 0,
  remainingCount: 40,
  autoAssignSeat: true
});

let publicState = {
  settings: { ...DEFAULT_PUBLIC_SETTINGS },
  ticket: null
};

const $ = selector => document.querySelector(selector);

function isConfiguredUrl(url) {
  return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/i.test(url) && !url.includes('PASTE_YOUR');
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

function publicApiRequest(action, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!isConfiguredUrl(API_URL)) {
      reject(new Error('Apps Script 웹 앱 주소가 아직 설정되지 않았습니다.'));
      return;
    }

    const callbackName = `__nyj20_public_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const url = new URL(API_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('payload', JSON.stringify(payload));
    url.searchParams.set('callback', callbackName);
    url.searchParams.set('_', String(Date.now()));

    const script = document.createElement('script');
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.'));
    }, Number(PUBLIC_CONFIG.requestTimeoutMs) || 25000);

    function cleanup() {
      clearTimeout(timeout);
      script.remove();
      try { delete window[callbackName]; } catch (error) { window[callbackName] = undefined; }
    }

    window[callbackName] = response => {
      cleanup();
      if (!response || response.ok !== true) {
        reject(new Error(response?.error || '신청 서버에서 오류가 발생했습니다.'));
        return;
      }
      resolve(response.data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('신청 서버에 연결하지 못했습니다. Apps Script 배포 권한을 확인해 주세요.'));
    };
    script.src = url.toString();
    document.head.appendChild(script);
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
  document.title = `${settings.eventName} 모바일 초대장`;

  const status = $('#registrationStatus');
  const submit = $('#submitButton');
  const full = Number(settings.remainingCount) <= 0;
  const open = settings.registrationOpen !== false && !full;
  status.className = `registration-status ${open ? 'open' : 'closed'}`;
  if (open) {
    status.textContent = `현재 신청 가능 · ${Number(settings.registeredCount).toLocaleString()}명 신청 · 잔여 ${Number(settings.remainingCount).toLocaleString()}명`;
  } else if (full) {
    status.textContent = `신청 정원이 마감되었습니다. 현재 ${Number(settings.registeredCount).toLocaleString()}명이 등록되었습니다.`;
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

function renderTicket(ticket, { existing = false } = {}) {
  publicState.ticket = ticket;
  const settings = publicState.settings;
  $('#ticketNumber').textContent = `NO. ${String(ticket.number).padStart(4, '0')}`;
  $('#ticketOrganizer').textContent = settings.eventOrganizer;
  $('#ticketEventName').textContent = settings.eventName;
  $('#ticketName').textContent = `${ticket.name} 님`;
  $('#ticketSeat').textContent = ticket.seat || '좌석 미정';
  $('#ticketDate').textContent = settings.eventDate;
  $('#ticketVenue').textContent = settings.eventVenue;
  $('#ticketMessage').textContent = existing
    ? '이미 신청된 정보가 확인되어 기존 개인 QR을 다시 보여드립니다.'
    : '현장에서 아래 QR을 보여주세요. 이미지로 저장해 두면 더 편리합니다.';

  clearQrContainer();
  new QRCode($('#ticketQr'), {
    text: qrPayload(ticket),
    width: 192,
    height: 192,
    correctLevel: QRCode.CorrectLevel.H
  });

  $('#ticketSection').classList.remove('hidden');
  history.replaceState(null, '', ticketLink(ticket.id));
  setTimeout(() => $('#ticketSection').scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
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

    const seatY = nextY + 180;
    roundedRect(ctx, 125, seatY, 830, 185, 36);
    ctx.fillStyle = 'rgba(255,255,255,.09)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.18)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ead1a5';
    ctx.font = '700 22px Arial, sans-serif';
    ctx.fillText('YOUR SEAT', 540, seatY + 52);
    ctx.font = '700 82px Georgia, "Noto Sans KR", serif';
    ctx.fillText(ticket.seat || '좌석 미정', 540, seatY + 139);

    const qrSize = 500;
    const qrX = (1080 - qrSize) / 2;
    const qrY = seatY + 240;
    roundedRect(ctx, qrX - 25, qrY - 25, qrSize + 50, qrSize + 50, 38);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

    ctx.fillStyle = 'rgba(255,255,255,.78)';
    ctx.font = '500 26px "Noto Sans KR", Arial, sans-serif';
    ctx.fillText('행사장 입구에서 이 QR을 제시해 주세요.', 540, qrY + qrSize + 92);
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

async function loadTicketFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code') || params.get('ticket');
  if (!code) return false;
  setLoading(true, '개인 티켓을 불러오고 있습니다.');
  try {
    const result = await publicApiRequest('publicTicket', { code });
    if (result.settings) publicState.settings = { ...DEFAULT_PUBLIC_SETTINGS, ...result.settings };
    renderPublicSettings();
    renderTicket(result.participant, { existing: true });
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
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const submitButton = $('#submitButton');
  const values = Object.fromEntries(new FormData(form).entries());
  values.consent = form.elements.consent.checked;
  values.startedAt = Number(form.dataset.startedAt || Date.now());
  submitButton.disabled = true;
  setLoading(true, '참가 신청을 등록하고 개인 QR을 발급하고 있습니다.');
  try {
    const result = await publicApiRequest('publicRegister', values);
    if (result.settings) publicState.settings = { ...publicState.settings, ...result.settings };
    renderPublicSettings();
    renderTicket(result.participant, { existing: result.existing });
    if (!result.existing) form.reset();
    form.dataset.startedAt = String(Date.now());
    showToast(result.existing ? '기존 신청 정보의 개인 QR을 불러왔습니다.' : '참가 신청과 개인 QR 발급이 완료되었습니다.');
  } catch (error) {
    showToast(error.message, 5200);
  } finally {
    setLoading(false);
    const canSubmit = publicState.settings.registrationOpen !== false && Number(publicState.settings.remainingCount) > 0;
    submitButton.disabled = !canSubmit;
  }
}

async function initialize() {
  $('#applicationForm').dataset.startedAt = String(Date.now());
  $('#applicationForm input[name="phone"]').addEventListener('input', event => normalizePhoneInput(event.currentTarget));
  $('#applicationForm').addEventListener('submit', handleApplicationSubmit);
  $('#downloadTicketButton').addEventListener('click', downloadTicketImage);
  $('#downloadQrButton').addEventListener('click', downloadQrOnly);
  $('#copyLinkButton').addEventListener('click', copyTicketLink);

  if (!isConfiguredUrl(API_URL)) {
    $('#setupWarning').classList.remove('hidden');
    $('#registrationStatus').className = 'registration-status closed';
    $('#registrationStatus').textContent = '서버 설정 전에는 신청할 수 없습니다.';
    $('#submitButton').disabled = true;
    return;
  }

  try {
    await loadPublicBootstrap();
    await loadTicketFromUrl();
  } catch (error) {
    $('#registrationStatus').className = 'registration-status closed';
    $('#registrationStatus').textContent = error.message;
    $('#submitButton').disabled = true;
    showToast(error.message, 5200);
  }
}

initialize();
