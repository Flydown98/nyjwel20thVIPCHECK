'use strict';

const CONFIG = window.NYJ20_CONFIG || {};
const LOCAL_KEYS = Object.freeze({
  URL: 'nyj20_apps_script_url_v2',
  ADMIN: 'nyj20_admin_key_v2',
  STATION: 'nyj20_station_name_v2'
});

const DEFAULT_SETTINGS = Object.freeze({
  eventName: '남양주시장애인복지관 개관 20주년 기념행사',
  eventDate: '2026. 9. 17.(목) 14:00',
  eventVenue: '남양주금곡실내체육관',
  eventOrganizer: '남양주시장애인복지관',
  seatRows: 'A,B,C,D',
  seatsPerRow: 10,
  autoRefreshSeconds: CONFIG.defaultAutoRefreshSeconds || 15,
  publicSubtitle: '스무번의 계절, 스물한번째 약속',
  publicGreeting: '남양주시장애인복지관의 스무 해를 함께해 주신 여러분을 초대합니다.',
  registrationOpen: true,
  registrationCapacity: 40,
  autoAssignSeat: true
});

let state = {
  settings: { ...DEFAULT_SETTINGS },
  participants: [],
  serverTime: null
};
let connection = {
  url: localStorage.getItem(LOCAL_KEYS.URL) || CONFIG.appsScriptUrl || '',
  key: localStorage.getItem(LOCAL_KEYS.ADMIN) || '',
  station: localStorage.getItem(LOCAL_KEYS.STATION) || ''
};
let scanner = null;
let scannerRunning = false;
let scanBusy = false;
let lastScannedText = '';
let lastScannedAt = 0;
let refreshTimer = null;
let currentView = 'dashboard';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeSeat(value) {
  const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  const match = raw.match(/^([A-Z가-힣]+)[-_]?(\d+)$/);
  return match ? `${match[1]}-${String(Number(match[2])).padStart(2, '0')}` : raw;
}

function parseQrPayload(text) {
  let value = String(text || '').trim();
  if (value.startsWith('NYJ20|') || value.startsWith('NYJ20:')) value = value.slice(6);
  try {
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      value = url.searchParams.get('code') || url.searchParams.get('id') || value;
    }
  } catch (error) {
    console.warn('QR URL 해석 실패', error);
  }
  return value.trim().toUpperCase();
}

function qrPayload(participant) {
  return `NYJ20|${participant.id}`;
}

function formatDateTime(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).format(date);
}

function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 7) return phone || '-';
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}

function showToast(message, duration = 2800) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add('hidden'), duration);
}

function setConnectionStatus(type, text) {
  const badge = $('#storageBadge');
  badge.className = `badge ${type}`;
  badge.textContent = text;
}

function validateWebAppUrl(url) {
  return /^https:\/\/script\.google\.com\/macros\/s\/.+\/(exec|dev)(?:\?.*)?$/i.test(String(url || '').trim());
}

function apiRequest(action, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!validateWebAppUrl(connection.url)) {
      reject(new Error('Apps Script 웹 앱 주소가 올바르지 않습니다. /exec 주소를 입력하세요.'));
      return;
    }
    if (!connection.key) {
      reject(new Error('관리자 키를 입력하세요.'));
      return;
    }

    const callbackName = `__nyj20_jsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const url = new URL(connection.url);
    url.searchParams.set('action', action);
    url.searchParams.set('key', connection.key);
    url.searchParams.set('station', connection.station || '미지정 접수대');
    url.searchParams.set('payload', JSON.stringify(payload));
    url.searchParams.set('callback', callbackName);
    url.searchParams.set('_', String(Date.now()));

    if (url.toString().length > 7500) {
      reject(new Error('한 번에 보내는 데이터가 너무 많습니다. CSV 등록 단위를 줄여주세요.'));
      return;
    }

    const script = document.createElement('script');
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('서버 응답 시간이 초과되었습니다. 인터넷 연결과 배포 주소를 확인하세요.'));
    }, Number(CONFIG.requestTimeoutMs) || 25000);

    function cleanup() {
      clearTimeout(timeout);
      script.remove();
      try { delete window[callbackName]; } catch (error) { window[callbackName] = undefined; }
    }

    window[callbackName] = response => {
      cleanup();
      if (!response || response.ok !== true) {
        reject(new Error(response?.error || '서버에서 알 수 없는 오류가 발생했습니다.'));
        return;
      }
      resolve(response.data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('Apps Script 서버에 연결하지 못했습니다. 배포 권한이 “모든 사용자”인지 확인하세요.'));
    };
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

async function connectAndLoad() {
  setConnectionStatus('warning', '연결 확인 중');
  const data = await apiRequest('bootstrap');
  state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  state.participants = Array.isArray(data.participants) ? data.participants : [];
  state.serverTime = data.serverTime || new Date().toISOString();
  localStorage.setItem(LOCAL_KEYS.URL, connection.url);
  localStorage.setItem(LOCAL_KEYS.ADMIN, connection.key);
  localStorage.setItem(LOCAL_KEYS.STATION, connection.station);
  $('#connectionOverlay').classList.add('hidden');
  setConnectionStatus('connected', '스프레드시트 연결됨');
  renderAll();
  scheduleAutoRefresh();
}

async function refreshFromServer({ silent = false } = {}) {
  if (!silent) setConnectionStatus('warning', '동기화 중');
  try {
    const data = await apiRequest('bootstrap');
    state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    state.participants = Array.isArray(data.participants) ? data.participants : [];
    state.serverTime = data.serverTime || new Date().toISOString();
    renderAll();
    setConnectionStatus('connected', '스프레드시트 연결됨');
    if (!silent) showToast('스프레드시트에서 최신 데이터를 불러왔습니다.');
  } catch (error) {
    setConnectionStatus('error', '연결 오류');
    if (!silent) showToast(error.message, 4500);
    throw error;
  }
}

function scheduleAutoRefresh() {
  clearInterval(refreshTimer);
  const seconds = Math.max(5, Number(state.settings.autoRefreshSeconds) || 15);
  refreshTimer = setInterval(() => {
    if (document.hidden || scanBusy) return;
    refreshFromServer({ silent: true }).catch(() => {});
  }, seconds * 1000);
}

function updateParticipantInCache(participant) {
  const index = state.participants.findIndex(item => item.id === participant.id);
  if (index >= 0) state.participants[index] = participant;
  else state.participants.push(participant);
  state.participants.sort((a, b) => a.number - b.number);
  renderAll();
}

function switchView(viewName) {
  currentView = viewName;
  $$('.view').forEach(view => view.classList.toggle('active', view.id === `view-${viewName}`));
  $$('.nav-button').forEach(button => button.classList.toggle('active', button.dataset.view === viewName));
  if (viewName !== 'checkin' && scannerRunning) stopScanner();
  if (viewName === 'seats') renderSeatMap();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderAll() {
  $('#headerEventName').textContent = state.settings.eventName;
  $('#lastSyncLabel').textContent = `마지막 동기화: ${formatDateTime(state.serverTime)}`;
  $('#currentStationLabel').textContent = connection.station || '-';
  $('#currentServerLabel').textContent = connection.url ? `${connection.url.slice(0, 42)}…` : '-';
  renderDashboard();
  renderParticipants();
  renderSeatMap();
  renderSettings();
}

function renderDashboard() {
  const total = state.participants.length;
  const arrived = state.participants.filter(item => item.arrived).length;
  const pending = total - arrived;
  const rate = total ? Math.round((arrived / total) * 1000) / 10 : 0;
  $('#statTotal').textContent = total.toLocaleString();
  $('#statArrived').textContent = arrived.toLocaleString();
  $('#statNotArrived').textContent = pending.toLocaleString();
  $('#statRate').textContent = `${rate}%`;

  const recent = state.participants
    .filter(item => item.arrived && item.checkInAt)
    .sort((a, b) => new Date(b.checkInAt) - new Date(a.checkInAt))
    .slice(0, 8);
  const container = $('#recentCheckins');
  if (!recent.length) {
    container.className = 'empty-state';
    container.textContent = '아직 도착한 참가자가 없습니다.';
    return;
  }
  container.className = 'recent-list';
  container.innerHTML = recent.map(item => `
    <div class="recent-item">
      <div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.seat || '좌석 미정')} · ${escapeHtml(item.group || '구분 없음')}</span></div>
      <span>${escapeHtml(formatDateTime(item.checkInAt))}</span>
    </div>`).join('');
}

function getFilteredParticipants() {
  const query = $('#participantSearch')?.value.trim().toLowerCase() || '';
  const status = $('#participantStatusFilter')?.value || 'all';
  return [...state.participants]
    .filter(item => {
      const haystack = [item.id, item.number, item.name, item.phone, item.seat, item.group].join(' ').toLowerCase();
      const queryMatch = !query || haystack.includes(query);
      const statusMatch = status === 'all' || (status === 'arrived' ? item.arrived : !item.arrived);
      return queryMatch && statusMatch;
    })
    .sort((a, b) => a.number - b.number);
}

function renderParticipants() {
  const rows = getFilteredParticipants();
  $('#participantCountLabel').textContent = `${rows.length}명 표시 / 전체 ${state.participants.length}명`;
  const tbody = $('#participantTableBody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state">조건에 맞는 참가자가 없습니다.</div></td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(item => `
    <tr>
      <td>${String(item.number).padStart(4, '0')}</td>
      <td><strong>${escapeHtml(item.name)}</strong><br><span class="small-text">${escapeHtml(item.id)}</span></td>
      <td>${escapeHtml(maskPhone(item.phone))}</td>
      <td><strong>${escapeHtml(item.seat || '미정')}</strong></td>
      <td>${escapeHtml(item.group || '-')}</td>
      <td><span class="badge ${item.arrived ? 'arrived' : 'pending'}">${item.arrived ? '도착' : '미도착'}</span></td>
      <td><div class="row-actions">
        <button class="button small secondary" data-action="qr" data-id="${escapeHtml(item.id)}" type="button">QR</button>
        <button class="button small secondary" data-action="edit" data-id="${escapeHtml(item.id)}" type="button">수정</button>
        <button class="button small ${item.arrived ? 'secondary' : 'primary'}" data-action="toggle" data-id="${escapeHtml(item.id)}" type="button">${item.arrived ? '도착 취소' : '도착 처리'}</button>
        <button class="button small secondary" data-action="delete" data-id="${escapeHtml(item.id)}" type="button">사용중지</button>
      </div></td>
    </tr>`).join('');
}

function renderSeatMap() {
  const container = $('#seatMap');
  const rows = String(state.settings.seatRows || '').split(',').map(value => value.trim().toUpperCase()).filter(Boolean);
  const seatsPerRow = Math.max(1, Number(state.settings.seatsPerRow) || 10);
  const assigned = new Map(state.participants.filter(item => item.seat).map(item => [normalizeSeat(item.seat), item]));

  const panels = rows.map(rowName => {
    const seats = [];
    for (let index = 1; index <= seatsPerRow; index += 1) {
      const code = `${rowName}-${String(index).padStart(2, '0')}`;
      const participant = assigned.get(code);
      if (participant) {
        seats.push(`<button class="seat ${participant.arrived ? 'arrived' : 'pending'}" data-seat-id="${escapeHtml(participant.id)}" type="button"><strong>${code}</strong><span>${escapeHtml(participant.name)}</span></button>`);
      } else {
        seats.push(`<button class="seat empty" type="button" disabled><strong>${code}</strong><span>미배정</span></button>`);
      }
    }
    return `<section class="seat-row-panel"><h3>${escapeHtml(rowName)}구역</h3><div class="seat-row">${seats.join('')}</div></section>`;
  });

  const rowPattern = rows.length ? new RegExp(`^(${rows.map(row => row.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})-\\d+$`) : null;
  const outside = state.participants.filter(item => !item.seat || !rowPattern || !rowPattern.test(normalizeSeat(item.seat)));
  if (outside.length) {
    panels.push(`<section class="seat-row-panel"><h3>좌석 미정 또는 별도 좌석</h3><div class="seat-row">${outside.map(item => `<button class="seat ${item.arrived ? 'arrived' : 'pending'}" data-seat-id="${escapeHtml(item.id)}" type="button"><strong>${escapeHtml(item.seat || '미정')}</strong><span>${escapeHtml(item.name)}</span></button>`).join('')}</div></section>`);
  }
  container.innerHTML = panels.join('') || '<div class="empty-state">좌석 행을 행사 설정에서 입력하세요.</div>';
}

function renderSettings() {
  $('#eventName').value = state.settings.eventName || '';
  $('#eventDate').value = state.settings.eventDate || '';
  $('#eventVenue').value = state.settings.eventVenue || '';
  $('#eventOrganizer').value = state.settings.eventOrganizer || '';
  $('#seatRows').value = state.settings.seatRows || '';
  $('#seatsPerRow').value = state.settings.seatsPerRow || 10;
  $('#autoRefreshSeconds').value = state.settings.autoRefreshSeconds || 15;
  $('#publicSubtitle').value = state.settings.publicSubtitle || '';
  $('#publicGreeting').value = state.settings.publicGreeting || '';
  $('#registrationOpen').value = String(state.settings.registrationOpen !== false);
  $('#registrationCapacity').value = state.settings.registrationCapacity || 40;
  $('#autoAssignSeat').value = String(state.settings.autoAssignSeat !== false);
}

function findParticipantById(id) {
  return state.participants.find(item => item.id === id);
}

function findMatches(query) {
  const value = String(query || '').trim().toLowerCase();
  if (!value) return [];
  const parsed = parseQrPayload(value).toLowerCase();
  const exact = state.participants.find(item => item.id.toLowerCase() === parsed);
  if (exact) return [exact];
  return state.participants.filter(item => [item.id, item.name, item.phone, item.seat, item.number]
    .some(field => String(field || '').toLowerCase().includes(value))).slice(0, 20);
}

async function checkInParticipant(participantOrCode) {
  const code = typeof participantOrCode === 'string' ? parseQrPayload(participantOrCode) : participantOrCode.id;
  scanBusy = true;
  try {
    const result = await apiRequest('checkIn', { code });
    updateParticipantInCache(result.participant);
    showCheckinResult(result.participant, result.already);
    if (navigator.vibrate) navigator.vibrate(result.already ? [100, 80, 100] : 120);
    showToast(result.already ? '이미 도착 처리된 참가자입니다.' : `${result.participant.name} 님 도착 완료`);
  } finally {
    scanBusy = false;
  }
}

async function undoCheckIn(participant) {
  const updated = await apiRequest('undoCheckIn', { code: participant.id });
  updateParticipantInCache(updated);
  showCheckinResult(updated, false);
  showToast(`${updated.name} 님 도착 처리를 취소했습니다.`);
}

function showCheckinResult(participant, already = false) {
  const panel = $('#checkinResultPanel');
  panel.classList.remove('hidden');
  $('#checkinResult').innerHTML = `
    <div class="result-card ${already ? 'already' : ''}">
      <div>
        <span class="badge ${participant.arrived ? 'arrived' : 'pending'}">${already ? '이미 도착 처리됨' : participant.arrived ? '도착 완료' : '미도착'}</span>
        <h3>${escapeHtml(participant.name)} 님</h3>
        <div class="seat-large">${escapeHtml(participant.seat || '좌석 미정')}</div>
        <p>접수번호 ${String(participant.number).padStart(4, '0')} · ${escapeHtml(participant.group || '구분 없음')}</p>
        <p class="small-text">${participant.arrived ? `도착 시각: ${escapeHtml(formatDateTime(participant.checkInAt))}` : '아직 도착 처리되지 않았습니다.'}</p>
        <div class="result-actions">
          ${participant.arrived
            ? `<button class="button primary" data-result-action="ticket" data-id="${escapeHtml(participant.id)}" type="button">티켓 보기·인쇄</button><button class="button secondary" data-result-action="undo" data-id="${escapeHtml(participant.id)}" type="button">도착 취소</button>`
            : `<button class="button primary" data-result-action="checkin" data-id="${escapeHtml(participant.id)}" type="button">도착 처리</button>`}
          <button class="button secondary" data-result-action="qr" data-id="${escapeHtml(participant.id)}" type="button">QR 확인</button>
        </div>
      </div>
    </div>`;
  panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function handleScannedText(decodedText) {
  const now = Date.now();
  if (scanBusy || (decodedText === lastScannedText && now - lastScannedAt < 3000)) return;
  lastScannedText = decodedText;
  lastScannedAt = now;
  const code = parseQrPayload(decodedText);
  $('#checkinResultPanel').classList.remove('hidden');
  $('#checkinResult').innerHTML = '<div class="loading-cover">스프레드시트에서 참가자를 확인하는 중입니다…</div>';
  try {
    await checkInParticipant(code);
  } catch (error) {
    showToast(error.message, 4500);
    $('#checkinResult').innerHTML = `<div class="empty-state"><strong>${escapeHtml(error.message)}</strong><br><span class="small-text">읽은 값: ${escapeHtml(decodedText)}</span></div>`;
  }
}

function startScanner() {
  if (scannerRunning) return;
  if (typeof Html5QrcodeScanner === 'undefined') {
    showToast('QR 스캐너 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.');
    return;
  }
  $('#reader').innerHTML = '';
  scanner = new Html5QrcodeScanner('reader', {
    fps: 10,
    qrbox: { width: 230, height: 230 },
    rememberLastUsedCamera: true,
    supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA, Html5QrcodeScanType.SCAN_TYPE_FILE]
  }, false);
  scanner.render(decodedText => handleScannedText(decodedText), () => {});
  scannerRunning = true;
  $('#toggleScannerButton').textContent = '카메라 종료';
}

async function stopScanner() {
  if (!scannerRunning || !scanner) return;
  try { await scanner.clear(); } catch (error) { console.warn(error); }
  scanner = null;
  scannerRunning = false;
  $('#reader').innerHTML = '<p>카메라 시작 버튼을 누르면 QR 스캐너가 열립니다.</p>';
  $('#toggleScannerButton').textContent = '카메라 시작';
}

function openModal(title, html) {
  $('#modalTitle').textContent = title;
  $('#modalContent').innerHTML = html;
  $('#modalBackdrop').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  $('#modalBackdrop').classList.add('hidden');
  document.body.style.overflow = '';
  document.body.classList.remove('print-ticket-mode');
}

function showQrModal(participant) {
  openModal(`${participant.name} 님 QR코드`, `
    <div class="qr-detail">
      <div id="singleQrCode" class="qr-code-box"></div>
      <div class="detail-list">
        <div><dt>접수번호</dt><dd>${String(participant.number).padStart(4, '0')}</dd></div>
        <div><dt>이름</dt><dd>${escapeHtml(participant.name)}</dd></div>
        <div><dt>좌석</dt><dd>${escapeHtml(participant.seat || '미정')}</dd></div>
        <div><dt>고유코드</dt><dd>${escapeHtml(participant.id)}</dd></div>
      </div>
      <div class="toolbar modal-actions">
        <button id="downloadQrButton" class="button primary" type="button">QR 이미지 저장</button>
        <button id="showTicketFromQrButton" class="button secondary" type="button">티켓 보기</button>
      </div>
    </div>`);
  const container = $('#singleQrCode');
  new QRCode(container, { text: qrPayload(participant), width: 220, height: 220, correctLevel: QRCode.CorrectLevel.H });
  $('#downloadQrButton').addEventListener('click', () => downloadQrImage(container, participant));
  $('#showTicketFromQrButton').addEventListener('click', () => showTicketModal(participant));
}

function downloadQrImage(container, participant) {
  const canvas = container.querySelector('canvas');
  const image = container.querySelector('img');
  const url = canvas ? canvas.toDataURL('image/png') : image?.src;
  if (!url) return showToast('QR 이미지를 준비하지 못했습니다.');
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${String(participant.number).padStart(4, '0')}_${participant.name}_QR.png`;
  anchor.click();
}

function showTicketModal(participant) {
  openModal(`${participant.name} 님 좌석 티켓`, `
    <article class="ticket">
      <p class="eyebrow">${escapeHtml(state.settings.eventOrganizer)}</p>
      <h2>${escapeHtml(state.settings.eventName)}</h2>
      <p><strong>${escapeHtml(participant.name)} 님</strong></p>
      <p class="ticket-seat">${escapeHtml(participant.seat || '좌석 미정')}</p>
      <p>${escapeHtml(state.settings.eventDate)}</p>
      <p>${escapeHtml(state.settings.eventVenue)}</p>
      <p class="small-text">접수번호 ${String(participant.number).padStart(4, '0')} · ${escapeHtml(participant.id)}</p>
    </article>
    <div class="toolbar modal-actions" style="justify-content:center; margin-top:16px;"><button id="printTicketButton" class="button primary" type="button">티켓 인쇄</button></div>`);
  $('#printTicketButton').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const updated = await apiRequest('markTicketPrinted', { code: participant.id });
      updateParticipantInCache(updated);
      document.body.classList.add('print-ticket-mode');
      window.print();
      setTimeout(() => document.body.classList.remove('print-ticket-mode'), 500);
    } catch (error) {
      showToast(error.message, 4500);
    } finally {
      button.disabled = false;
    }
  });
}

function showParticipantEditModal(participant) {
  openModal('참가자 정보 수정', `
    <form id="editParticipantForm" class="form-grid">
      <label>이름<input name="name" required value="${escapeHtml(participant.name)}" /></label>
      <label>연락처<input name="phone" value="${escapeHtml(participant.phone)}" /></label>
      <label>좌석번호<input name="seat" value="${escapeHtml(participant.seat)}" /></label>
      <label>구분<input name="group" value="${escapeHtml(participant.group)}" /></label>
      <label class="wide">비고<input name="note" value="${escapeHtml(participant.note)}" /></label>
      <div class="form-actions wide"><button class="button primary" type="submit">스프레드시트에 저장</button></div>
    </form>`);
  $('#editParticipantForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      const updated = await apiRequest('updateParticipant', { code: participant.id, ...values });
      updateParticipantInCache(updated);
      closeModal();
      showToast('참가자 정보를 수정했습니다.');
    } catch (error) {
      showToast(error.message, 4500);
    } finally {
      button.disabled = false;
    }
  });
}

function showSeatParticipant(participant) {
  openModal(`${participant.seat || '좌석 미정'} 좌석`, `
    <div class="detail-list">
      <div><dt>이름</dt><dd>${escapeHtml(participant.name)}</dd></div>
      <div><dt>상태</dt><dd>${participant.arrived ? '도착 완료' : '미도착'}</dd></div>
      <div><dt>도착 시각</dt><dd>${escapeHtml(formatDateTime(participant.checkInAt))}</dd></div>
      <div><dt>구분</dt><dd>${escapeHtml(participant.group || '-')}</dd></div>
      <div><dt>비고</dt><dd>${escapeHtml(participant.note || '-')}</dd></div>
    </div>`);
}

function exportCsv() {
  const headers = ['접수번호', 'QR고유코드', '이름', '연락처', '좌석번호', '구분', '비고', '도착여부', '도착시각', '티켓출력시각'];
  const rows = [...state.participants].sort((a, b) => a.number - b.number).map(item => [
    item.number, item.id, item.name, item.phone, item.seat, item.group, item.note,
    item.arrived ? '도착' : '미도착', item.checkInAt || '', item.ticketPrintedAt || ''
  ]);
  const csvEscape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `20주년_참석자명단_${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current.trim()); current = '';
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}

async function importCsv(file) {
  const text = await file.text();
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) throw new Error('CSV에 참가자 데이터가 없습니다.');
  const headers = parseCsvLine(lines[0]).map(header => header.trim());
  const aliases = {
    name: ['이름', '성명', 'name'], phone: ['연락처', '전화번호', 'phone'],
    seat: ['좌석', '좌석번호', 'seat'], group: ['구분', '분류', 'group'], note: ['비고', 'note']
  };
  const indexOfAlias = key => headers.findIndex(header => aliases[key].some(alias => alias.toLowerCase() === header.toLowerCase()));
  const columns = Object.fromEntries(Object.keys(aliases).map(key => [key, indexOfAlias(key)]));
  if (columns.name < 0) throw new Error("첫 줄에 '이름' 열이 필요합니다.");

  const items = lines.slice(1).map(line => {
    const cells = parseCsvLine(line);
    return {
      name: cells[columns.name] || '',
      phone: columns.phone >= 0 ? cells[columns.phone] : '',
      seat: columns.seat >= 0 ? cells[columns.seat] : '',
      group: columns.group >= 0 ? cells[columns.group] : '',
      note: columns.note >= 0 ? cells[columns.note] : ''
    };
  }).filter(item => item.name.trim());

  if (!items.length) throw new Error('등록할 참가자가 없습니다.');
  let added = 0;
  let skipped = 0;
  const errors = [];
  const chunkSize = 10;

  for (let index = 0; index < items.length; index += chunkSize) {
    showToast(`CSV 등록 중 ${Math.min(index + chunkSize, items.length)} / ${items.length}`, 4000);
    const result = await apiRequest('batchImport', { items: items.slice(index, index + chunkSize) });
    added += result.added || 0;
    skipped += result.skipped || 0;
    errors.push(...(result.errors || []));
  }
  await refreshFromServer({ silent: true });
  alert(`CSV 등록 완료\n\n추가: ${added}명\n건너뜀: ${skipped}명${errors.length ? `\n\n사유 일부:\n- ${errors.slice(0, 10).join('\n- ')}` : ''}`);
}

function printAllQr() {
  if (!state.participants.length) return showToast('인쇄할 참가자가 없습니다.');
  const printWindow = window.open('', '_blank');
  if (!printWindow) return showToast('팝업 차단을 해제한 뒤 다시 시도하세요.');
  const participantsJson = JSON.stringify([...state.participants].sort((a, b) => a.number - b.number)).replaceAll('<', '\\u003c');
  const settingsJson = JSON.stringify(state.settings).replaceAll('<', '\\u003c');
  printWindow.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>참가자 QR 일괄 인쇄</title>
    <style>body{font-family:Arial,sans-serif;margin:0}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10mm;padding:10mm}.card{break-inside:avoid;border:1px solid #bbb;padding:8mm;text-align:center;border-radius:4mm}.qr{display:grid;place-items:center;min-height:45mm}.qr img,.qr canvas{width:42mm!important;height:42mm!important}.seat{font-size:22pt;font-weight:900;margin:3mm 0}.small{font-size:9pt;color:#555}@media print{.no-print{display:none}.grid{padding:0}}</style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script></head><body>
    <div class="no-print" style="padding:10px;text-align:center"><button onclick="window.print()" style="padding:10px 16px">인쇄하기</button></div><main id="grid" class="grid"></main>
    <script>const participants=${participantsJson};const settings=${settingsJson};const grid=document.getElementById('grid');participants.forEach(p=>{const card=document.createElement('article');card.className='card';card.innerHTML='<strong>'+settings.eventOrganizer+'</strong><h2>'+p.name+' 님</h2><div class="qr"></div><div class="seat">'+(p.seat||'좌석 미정')+'</div><div class="small">접수번호 '+String(p.number).padStart(4,'0')+' · '+p.id+'</div>';grid.appendChild(card);new QRCode(card.querySelector('.qr'),{text:'NYJ20|'+p.id,width:180,height:180,correctLevel:QRCode.CorrectLevel.H});});<\/script></body></html>`);
  printWindow.document.close();
}

function showConnectionOverlay(message = '') {
  $('#appsScriptUrlInput').value = connection.url;
  $('#adminKeyInput').value = connection.key;
  $('#stationNameInput').value = connection.station;
  $('#connectionOverlay').classList.remove('hidden');
  const messageBox = $('#connectionMessage');
  messageBox.textContent = message;
  messageBox.classList.toggle('hidden', !message);
}

function bindEvents() {
  $('#connectionForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('#connectButton');
    const messageBox = $('#connectionMessage');
    connection = {
      url: $('#appsScriptUrlInput').value.trim(),
      key: $('#adminKeyInput').value.trim(),
      station: $('#stationNameInput').value.trim()
    };
    button.disabled = true;
    button.textContent = '연결 확인 중…';
    messageBox.classList.add('hidden');
    try {
      await connectAndLoad();
    } catch (error) {
      setConnectionStatus('error', '연결 오류');
      messageBox.textContent = error.message;
      messageBox.classList.remove('hidden');
    } finally {
      button.disabled = false;
      button.textContent = '연결하고 시작';
    }
  });

  $('#connectionSettingsButton').addEventListener('click', () => showConnectionOverlay());
  $('#logoutButton').addEventListener('click', () => {
    if (!confirm('이 기기에 저장된 Apps Script 주소와 관리자 키를 삭제할까요?')) return;
    Object.values(LOCAL_KEYS).forEach(key => localStorage.removeItem(key));
    connection = { url: '', key: '', station: '' };
    clearInterval(refreshTimer);
    showConnectionOverlay('접속정보가 삭제되었습니다. 다시 입력하세요.');
  });

  $$('.nav-button').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
  $$('[data-go]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.go)));
  $('#refreshDashboardButton').addEventListener('click', () => refreshFromServer().catch(() => {}));
  $('#exportCsvButton').addEventListener('click', exportCsv);
  $('#exportCsvDashboardButton').addEventListener('click', exportCsv);
  $('#printAllQrButton').addEventListener('click', printAllQr);

  $('#participantForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(form).entries());
      const participant = await apiRequest('createParticipant', values);
      updateParticipantInCache(participant);
      form.reset();
      showToast(`${participant.name} 님을 ${String(participant.number).padStart(4, '0')}번으로 등록했습니다.`);
    } catch (error) {
      showToast(error.message, 4500);
    } finally {
      button.disabled = false;
    }
  });

  $('#participantSearch').addEventListener('input', renderParticipants);
  $('#participantStatusFilter').addEventListener('change', renderParticipants);
  $('#participantTableBody').addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const participant = findParticipantById(button.dataset.id);
    if (!participant) return;
    const action = button.dataset.action;
    try {
      if (action === 'qr') showQrModal(participant);
      if (action === 'edit') showParticipantEditModal(participant);
      if (action === 'toggle') participant.arrived ? await undoCheckIn(participant) : await checkInParticipant(participant);
      if (action === 'delete' && confirm(`${participant.name} 님을 사용중지할까요? 스프레드시트 행은 보존됩니다.`)) {
        await apiRequest('deleteParticipant', { code: participant.id });
        state.participants = state.participants.filter(item => item.id !== participant.id);
        renderAll();
        showToast('참가자를 사용중지했습니다.');
      }
    } catch (error) {
      showToast(error.message, 4500);
    }
  });

  $('#csvFileInput').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try { await importCsv(file); } catch (error) { showToast(error.message, 5000); }
  });

  $('#toggleScannerButton').addEventListener('click', () => scannerRunning ? stopScanner() : startScanner());
  $('#manualCheckinForm').addEventListener('submit', event => {
    event.preventDefault();
    const matches = findMatches($('#manualCheckinInput').value);
    const results = $('#manualSearchResults');
    if (!matches.length) {
      results.innerHTML = '<div class="empty-state">참가자를 찾지 못했습니다. 서버 새로고침 후 다시 검색하세요.</div>';
      return;
    }
    results.innerHTML = matches.map(item => `<button class="search-result-button" data-manual-id="${escapeHtml(item.id)}" type="button"><strong>${escapeHtml(item.name)}</strong><br><span>${escapeHtml(item.seat || '좌석 미정')} · ${escapeHtml(maskPhone(item.phone))} · ${item.arrived ? '도착' : '미도착'}</span></button>`).join('');
  });
  $('#manualSearchResults').addEventListener('click', event => {
    const button = event.target.closest('[data-manual-id]');
    if (!button) return;
    const participant = findParticipantById(button.dataset.manualId);
    if (participant) showCheckinResult(participant, participant.arrived);
  });
  $('#checkinResult').addEventListener('click', async event => {
    const button = event.target.closest('[data-result-action]');
    if (!button) return;
    const participant = findParticipantById(button.dataset.id);
    if (!participant) return;
    button.disabled = true;
    try {
      if (button.dataset.resultAction === 'checkin') await checkInParticipant(participant);
      if (button.dataset.resultAction === 'undo') await undoCheckIn(participant);
      if (button.dataset.resultAction === 'ticket') showTicketModal(participant);
      if (button.dataset.resultAction === 'qr') showQrModal(participant);
    } catch (error) {
      showToast(error.message, 4500);
    } finally {
      button.disabled = false;
    }
  });

  $('#seatMap').addEventListener('click', event => {
    const button = event.target.closest('[data-seat-id]');
    if (!button) return;
    const participant = findParticipantById(button.dataset.seatId);
    if (participant) showSeatParticipant(participant);
  });

  $('#eventSettingsForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    const settings = {
      eventName: $('#eventName').value.trim(),
      eventDate: $('#eventDate').value.trim(),
      eventVenue: $('#eventVenue').value.trim(),
      eventOrganizer: $('#eventOrganizer').value.trim(),
      seatRows: $('#seatRows').value.trim(),
      seatsPerRow: Number($('#seatsPerRow').value) || 10,
      autoRefreshSeconds: Number($('#autoRefreshSeconds').value) || 15,
      publicSubtitle: $('#publicSubtitle').value.trim(),
      publicGreeting: $('#publicGreeting').value.trim(),
      registrationOpen: $('#registrationOpen').value === 'true',
      registrationCapacity: Number($('#registrationCapacity').value) || 40,
      autoAssignSeat: $('#autoAssignSeat').value === 'true'
    };
    try {
      state.settings = await apiRequest('saveSettings', settings);
      renderAll();
      scheduleAutoRefresh();
      showToast('행사 설정을 스프레드시트에 저장했습니다.');
    } catch (error) {
      showToast(error.message, 4500);
    } finally {
      button.disabled = false;
    }
  });

  $('#closeModalButton').addEventListener('click', closeModal);
  $('#modalBackdrop').addEventListener('click', event => { if (event.target.id === 'modalBackdrop') closeModal(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && connection.url && connection.key) refreshFromServer({ silent: true }).catch(() => {});
  });
}

bindEvents();
renderAll();
if (connection.url && connection.key && connection.station) {
  connectAndLoad().catch(error => showConnectionOverlay(error.message));
} else {
  showConnectionOverlay();
}
