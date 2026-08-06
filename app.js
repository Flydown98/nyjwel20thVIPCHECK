"use strict";

const STORAGE_KEY = "nyj20_qr_checkin_mvp_v1";
const DEFAULT_SETTINGS = {
  eventName: "남양주시장애인복지관 개관 20주년 기념행사",
  eventDate: "2026. 9. 17.(목) 14:00",
  eventVenue: "남양주금곡실내체육관",
  eventOrganizer: "남양주시장애인복지관",
  seatRows: "A,B,C,D",
  seatsPerRow: 10
};

let state = loadState();
let scanner = null;
let scannerRunning = false;
let lastScannedText = "";
let lastScannedAt = 0;
let deferredInstallPrompt = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.participants)) {
      return {
        settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) },
        participants: saved.participants
      };
    }
  } catch (error) {
    console.error("저장 데이터 읽기 실패", error);
  }
  return { settings: { ...DEFAULT_SETTINGS }, participants: createSampleParticipants() };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
}

function createSampleParticipants() {
  return [
    { name: "홍길동", phone: "010-1234-1001", seat: "A-01", group: "이용인", note: "", arrived: false },
    { name: "김복지", phone: "010-1234-1002", seat: "A-02", group: "보호자", note: "", arrived: true, checkInAt: new Date().toISOString() },
    { name: "이남양", phone: "010-1234-1003", seat: "A-03", group: "내빈", note: "", arrived: false },
    { name: "박스무", phone: "010-1234-1004", seat: "B-01", group: "지역주민", note: "휠체어석 확인", arrived: false },
    { name: "최계절", phone: "010-1234-1005", seat: "B-02", group: "직원", note: "", arrived: true, checkInAt: new Date(Date.now() - 1000 * 60 * 8).toISOString() }
  ].map((p, index) => normalizeParticipant(p, index + 1));
}

function normalizeParticipant(raw, fallbackNumber) {
  const number = Number(raw.number) || fallbackNumber || nextNumber();
  return {
    id: raw.id || createParticipantId(number),
    number,
    name: String(raw.name || "").trim(),
    phone: String(raw.phone || "").trim(),
    seat: normalizeSeat(raw.seat || ""),
    group: String(raw.group || "").trim(),
    note: String(raw.note || "").trim(),
    arrived: Boolean(raw.arrived),
    checkInAt: raw.checkInAt || null,
    ticketPrintedAt: raw.ticketPrintedAt || null
  };
}

function nextNumber() {
  return state.participants.length ? Math.max(...state.participants.map((p) => Number(p.number) || 0)) + 1 : 1;
}

function createParticipantId(number) {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, "X");
  return `20TH-${String(number).padStart(4, "0")}-${suffix}`;
}

function normalizeSeat(value) {
  const raw = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  const match = raw.match(/^([A-Z가-힣]+)[-_]?(\d+)$/);
  if (!match) return raw;
  return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}`;
}

function qrPayload(participant) {
  return `NYJ20|${participant.id}`;
}

function parseQrPayload(text) {
  const value = String(text || "").trim();
  if (value.startsWith("NYJ20|")) return value.split("|")[1];
  return value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTime(iso) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).format(date);
}

function maskPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 7) return phone || "-";
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), 2600);
}

function switchView(viewName) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${viewName}`));
  $$(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
  if (viewName !== "checkin" && scannerRunning) stopScanner();
  if (viewName === "seats") renderSeatMap();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderAll() {
  renderHeader();
  renderDashboard();
  renderParticipants();
  renderSeatMap();
  renderSettings();
}

function renderHeader() {
  $("#headerEventName").textContent = state.settings.eventName;
}

function renderDashboard() {
  const total = state.participants.length;
  const arrived = state.participants.filter((p) => p.arrived).length;
  const pending = total - arrived;
  const rate = total ? Math.round((arrived / total) * 1000) / 10 : 0;
  $("#statTotal").textContent = total.toLocaleString();
  $("#statArrived").textContent = arrived.toLocaleString();
  $("#statNotArrived").textContent = pending.toLocaleString();
  $("#statRate").textContent = `${rate}%`;

  const recent = state.participants
    .filter((p) => p.arrived && p.checkInAt)
    .sort((a, b) => new Date(b.checkInAt) - new Date(a.checkInAt))
    .slice(0, 8);
  const container = $("#recentCheckins");
  if (!recent.length) {
    container.className = "empty-state";
    container.textContent = "아직 도착한 참가자가 없습니다.";
    return;
  }
  container.className = "recent-list";
  container.innerHTML = recent.map((p) => `
    <div class="recent-item">
      <div><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.seat || "좌석 미정")} · ${escapeHtml(p.group || "구분 없음")}</span></div>
      <span>${escapeHtml(formatDateTime(p.checkInAt))}</span>
    </div>`).join("");
}

function getFilteredParticipants() {
  const query = $("#participantSearch")?.value.trim().toLowerCase() || "";
  const status = $("#participantStatusFilter")?.value || "all";
  return [...state.participants]
    .filter((p) => {
      const haystack = [p.id, p.number, p.name, p.phone, p.seat, p.group].join(" ").toLowerCase();
      const queryMatch = !query || haystack.includes(query);
      const statusMatch = status === "all" || (status === "arrived" ? p.arrived : !p.arrived);
      return queryMatch && statusMatch;
    })
    .sort((a, b) => a.number - b.number);
}

function renderParticipants() {
  const rows = getFilteredParticipants();
  $("#participantCountLabel").textContent = `${rows.length}명 표시 / 전체 ${state.participants.length}명`;
  const tbody = $("#participantTableBody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state">조건에 맞는 참가자가 없습니다.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((p) => `
    <tr>
      <td>${String(p.number).padStart(4, "0")}</td>
      <td><strong>${escapeHtml(p.name)}</strong><br><span class="small-text">${escapeHtml(p.id)}</span></td>
      <td>${escapeHtml(maskPhone(p.phone))}</td>
      <td><strong>${escapeHtml(p.seat || "미정")}</strong></td>
      <td>${escapeHtml(p.group || "-")}</td>
      <td><span class="badge ${p.arrived ? "arrived" : "pending"}">${p.arrived ? "도착" : "미도착"}</span></td>
      <td><div class="row-actions">
        <button class="button small secondary" data-action="qr" data-id="${escapeHtml(p.id)}" type="button">QR</button>
        <button class="button small secondary" data-action="edit" data-id="${escapeHtml(p.id)}" type="button">수정</button>
        <button class="button small ${p.arrived ? "secondary" : "primary"}" data-action="toggle" data-id="${escapeHtml(p.id)}" type="button">${p.arrived ? "도착 취소" : "도착 처리"}</button>
        <button class="button small secondary" data-action="delete" data-id="${escapeHtml(p.id)}" type="button">삭제</button>
      </div></td>
    </tr>`).join("");
}

function renderSeatMap() {
  const container = $("#seatMap");
  if (!container) return;
  const rows = String(state.settings.seatRows || "").split(",").map((r) => r.trim().toUpperCase()).filter(Boolean);
  const seatsPerRow = Math.max(1, Number(state.settings.seatsPerRow) || 10);
  const assignedBySeat = new Map(state.participants.filter((p) => p.seat).map((p) => [normalizeSeat(p.seat), p]));
  const rowHtml = rows.map((row) => {
    const seats = [];
    for (let i = 1; i <= seatsPerRow; i += 1) {
      const seatCode = `${row}-${String(i).padStart(2, "0")}`;
      const participant = assignedBySeat.get(seatCode);
      if (participant) {
        seats.push(`<button class="seat ${participant.arrived ? "arrived" : "pending"}" data-seat-id="${escapeHtml(participant.id)}" type="button"><strong>${seatCode}</strong><span>${escapeHtml(participant.name)}</span></button>`);
      } else {
        seats.push(`<button class="seat empty" type="button" disabled><strong>${seatCode}</strong><span>미배정</span></button>`);
      }
    }
    return `<section class="seat-row-panel"><h3>${escapeHtml(row)}구역</h3><div class="seat-row">${seats.join("")}</div></section>`;
  }).join("");

  const knownSeatPattern = new RegExp(`^(${rows.map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})-\\d+$`);
  const outside = state.participants.filter((p) => !p.seat || !knownSeatPattern.test(normalizeSeat(p.seat)));
  const outsideHtml = outside.length ? `
    <section class="seat-row-panel"><h3>좌석 미정 또는 별도 좌석</h3><div class="seat-row">
      ${outside.map((p) => `<button class="seat ${p.arrived ? "arrived" : "pending"}" data-seat-id="${escapeHtml(p.id)}" type="button"><strong>${escapeHtml(p.seat || "미정")}</strong><span>${escapeHtml(p.name)}</span></button>`).join("")}
    </div></section>` : "";
  container.innerHTML = rowHtml + outsideHtml;
}

function renderSettings() {
  $("#eventName").value = state.settings.eventName;
  $("#eventDate").value = state.settings.eventDate;
  $("#eventVenue").value = state.settings.eventVenue;
  $("#eventOrganizer").value = state.settings.eventOrganizer;
  $("#seatRows").value = state.settings.seatRows;
  $("#seatsPerRow").value = state.settings.seatsPerRow;
}

function addParticipant(formData) {
  const number = nextNumber();
  const participant = normalizeParticipant({ ...formData, number, arrived: false }, number);
  if (!participant.name) throw new Error("이름을 입력하세요.");
  if (participant.seat && state.participants.some((p) => normalizeSeat(p.seat) === participant.seat)) {
    throw new Error(`${participant.seat} 좌석은 이미 배정되어 있습니다.`);
  }
  state.participants.push(participant);
  saveState();
  return participant;
}

function findParticipantById(id) {
  return state.participants.find((p) => p.id === id);
}

function findMatches(query) {
  const value = String(query || "").trim().toLowerCase();
  if (!value) return [];
  const parsed = parseQrPayload(value).toLowerCase();
  const exact = state.participants.find((p) => p.id.toLowerCase() === parsed);
  if (exact) return [exact];
  return state.participants.filter((p) => [p.id, p.name, p.phone, p.seat, p.number]
    .some((field) => String(field || "").toLowerCase().includes(value))).slice(0, 10);
}

function checkInParticipant(participant) {
  if (!participant.arrived) {
    participant.arrived = true;
    participant.checkInAt = new Date().toISOString();
    saveState();
    showToast(`${participant.name} 님 도착 처리가 완료되었습니다.`);
  }
  showCheckinResult(participant);
}

function undoCheckIn(participant) {
  participant.arrived = false;
  participant.checkInAt = null;
  participant.ticketPrintedAt = null;
  saveState();
  showCheckinResult(participant);
  showToast(`${participant.name} 님 도착 처리를 취소했습니다.`);
}

function showCheckinResult(participant) {
  const panel = $("#checkinResultPanel");
  panel.classList.remove("hidden");
  const alreadyClass = participant.arrived ? "" : "already";
  $("#checkinResult").innerHTML = `
    <div class="result-card ${alreadyClass}">
      <div>
        <span class="badge ${participant.arrived ? "arrived" : "pending"}">${participant.arrived ? "도착 완료" : "미도착"}</span>
        <h3>${escapeHtml(participant.name)} 님</h3>
        <div class="seat-large">${escapeHtml(participant.seat || "좌석 미정")}</div>
        <p>접수번호 ${String(participant.number).padStart(4, "0")} · ${escapeHtml(participant.group || "구분 없음")}</p>
        <p class="small-text">${participant.arrived ? `도착 시각: ${escapeHtml(formatDateTime(participant.checkInAt))}` : "아직 도착 처리되지 않았습니다."}</p>
        <div class="result-actions">
          ${participant.arrived
            ? `<button class="button primary" data-result-action="ticket" data-id="${escapeHtml(participant.id)}" type="button">티켓 보기·인쇄</button>
               <button class="button secondary" data-result-action="undo" data-id="${escapeHtml(participant.id)}" type="button">도착 취소</button>`
            : `<button class="button primary" data-result-action="checkin" data-id="${escapeHtml(participant.id)}" type="button">도착 처리</button>`}
          <button class="button secondary" data-result-action="qr" data-id="${escapeHtml(participant.id)}" type="button">QR 확인</button>
        </div>
      </div>
    </div>`;
  panel.scrollIntoView({ behavior: "smooth", block: "center" });
}

function handleScannedText(decodedText) {
  const now = Date.now();
  if (decodedText === lastScannedText && now - lastScannedAt < 2500) return;
  lastScannedText = decodedText;
  lastScannedAt = now;
  const id = parseQrPayload(decodedText);
  const participant = findParticipantById(id);
  if (!participant) {
    showToast("등록되지 않은 QR코드입니다.");
    $("#checkinResultPanel").classList.remove("hidden");
    $("#checkinResult").innerHTML = `<div class="empty-state"><strong>등록되지 않은 QR코드입니다.</strong><br><span class="small-text">읽은 값: ${escapeHtml(decodedText)}</span></div>`;
    return;
  }
  if (participant.arrived) {
    showToast("이미 도착 처리된 참가자입니다.");
    showCheckinResult(participant);
    return;
  }
  checkInParticipant(participant);
}

function startScanner() {
  if (scannerRunning) return;
  if (typeof Html5QrcodeScanner === "undefined") {
    showToast("QR 스캐너 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.");
    return;
  }
  $("#reader").innerHTML = "";
  scanner = new Html5QrcodeScanner("reader", {
    fps: 10,
    qrbox: { width: 230, height: 230 },
    rememberLastUsedCamera: true,
    supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA, Html5QrcodeScanType.SCAN_TYPE_FILE]
  }, false);
  scanner.render((decodedText) => handleScannedText(decodedText), () => {});
  scannerRunning = true;
  $("#toggleScannerButton").textContent = "카메라 종료";
}

async function stopScanner() {
  if (!scannerRunning || !scanner) return;
  try { await scanner.clear(); } catch (error) { console.warn(error); }
  scanner = null;
  scannerRunning = false;
  $("#reader").innerHTML = "<p>카메라 시작 버튼을 누르면 QR 스캐너가 열립니다.</p>";
  $("#toggleScannerButton").textContent = "카메라 시작";
}

function openModal(title, html) {
  $("#modalTitle").textContent = title;
  $("#modalContent").innerHTML = html;
  $("#modalBackdrop").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  $("#modalBackdrop").classList.add("hidden");
  document.body.style.overflow = "";
  document.body.classList.remove("print-ticket-mode");
}

function showQrModal(participant) {
  openModal(`${participant.name} 님 QR코드`, `
    <div class="qr-detail">
      <div id="singleQrCode" class="qr-code-box"></div>
      <div class="detail-list">
        <div><dt>접수번호</dt><dd>${String(participant.number).padStart(4, "0")}</dd></div>
        <div><dt>이름</dt><dd>${escapeHtml(participant.name)}</dd></div>
        <div><dt>좌석</dt><dd>${escapeHtml(participant.seat || "미정")}</dd></div>
        <div><dt>고유코드</dt><dd>${escapeHtml(participant.id)}</dd></div>
      </div>
      <div class="toolbar modal-actions">
        <button id="downloadQrButton" class="button primary" type="button">QR 이미지 저장</button>
        <button id="showTicketFromQrButton" class="button secondary" type="button">티켓 보기</button>
      </div>
    </div>`);
  const qrContainer = $("#singleQrCode");
  new QRCode(qrContainer, { text: qrPayload(participant), width: 220, height: 220, correctLevel: QRCode.CorrectLevel.H });
  $("#downloadQrButton").addEventListener("click", () => downloadQrImage(qrContainer, participant));
  $("#showTicketFromQrButton").addEventListener("click", () => showTicketModal(participant));
}

function downloadQrImage(container, participant) {
  const canvas = container.querySelector("canvas");
  const image = container.querySelector("img");
  const url = canvas ? canvas.toDataURL("image/png") : image?.src;
  if (!url) return showToast("QR 이미지를 준비하지 못했습니다.");
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${String(participant.number).padStart(4, "0")}_${participant.name}_QR.png`;
  anchor.click();
}

function showTicketModal(participant) {
  openModal(`${participant.name} 님 좌석 티켓`, `
    <article class="ticket">
      <p class="eyebrow">${escapeHtml(state.settings.eventOrganizer)}</p>
      <h2>${escapeHtml(state.settings.eventName)}</h2>
      <p><strong>${escapeHtml(participant.name)} 님</strong></p>
      <p class="ticket-seat">${escapeHtml(participant.seat || "좌석 미정")}</p>
      <p>${escapeHtml(state.settings.eventDate)}</p>
      <p>${escapeHtml(state.settings.eventVenue)}</p>
      <p class="small-text">접수번호 ${String(participant.number).padStart(4, "0")} · ${escapeHtml(participant.id)}</p>
    </article>
    <div class="toolbar modal-actions" style="justify-content:center; margin-top:16px;">
      <button id="printTicketButton" class="button primary" type="button">티켓 인쇄</button>
    </div>`);
  $("#printTicketButton").addEventListener("click", () => {
    participant.ticketPrintedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    document.body.classList.add("print-ticket-mode");
    window.print();
    setTimeout(() => document.body.classList.remove("print-ticket-mode"), 500);
  });
}

function showParticipantEditModal(participant) {
  openModal("참가자 정보 수정", `
    <form id="editParticipantForm" class="form-grid">
      <label>이름<input name="name" required value="${escapeHtml(participant.name)}" /></label>
      <label>연락처<input name="phone" value="${escapeHtml(participant.phone)}" /></label>
      <label>좌석번호<input name="seat" value="${escapeHtml(participant.seat)}" /></label>
      <label>구분<input name="group" value="${escapeHtml(participant.group)}" /></label>
      <label class="wide">비고<input name="note" value="${escapeHtml(participant.note)}" /></label>
      <div class="form-actions wide"><button class="button primary" type="submit">수정 저장</button></div>
    </form>`);
  $("#editParticipantForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newSeat = normalizeSeat(form.get("seat"));
    const duplicate = state.participants.some((p) => p.id !== participant.id && newSeat && normalizeSeat(p.seat) === newSeat);
    if (duplicate) return showToast(`${newSeat} 좌석은 이미 배정되어 있습니다.`);
    participant.name = String(form.get("name") || "").trim();
    participant.phone = String(form.get("phone") || "").trim();
    participant.seat = newSeat;
    participant.group = String(form.get("group") || "").trim();
    participant.note = String(form.get("note") || "").trim();
    saveState();
    closeModal();
    showToast("참가자 정보를 수정했습니다.");
  });
}

function showSeatParticipant(participant) {
  openModal(`${participant.seat || "좌석 미정"} 좌석`, `
    <div class="detail-list">
      <div><dt>이름</dt><dd>${escapeHtml(participant.name)}</dd></div>
      <div><dt>상태</dt><dd>${participant.arrived ? "도착 완료" : "미도착"}</dd></div>
      <div><dt>도착 시각</dt><dd>${escapeHtml(formatDateTime(participant.checkInAt))}</dd></div>
      <div><dt>구분</dt><dd>${escapeHtml(participant.group || "-")}</dd></div>
      <div><dt>비고</dt><dd>${escapeHtml(participant.note || "-")}</dd></div>
    </div>
    <div class="toolbar modal-actions" style="margin-top:16px;">
      <button id="seatQrButton" class="button secondary" type="button">QR 보기</button>
      <button id="seatToggleButton" class="button primary" type="button">${participant.arrived ? "도착 취소" : "도착 처리"}</button>
    </div>`);
  $("#seatQrButton").addEventListener("click", () => showQrModal(participant));
  $("#seatToggleButton").addEventListener("click", () => {
    participant.arrived ? undoCheckIn(participant) : checkInParticipant(participant);
    closeModal();
  });
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function exportCsv() {
  const headers = ["접수번호", "고유코드", "이름", "연락처", "좌석", "구분", "비고", "도착여부", "도착시간", "티켓출력시간"];
  const rows = [...state.participants].sort((a, b) => a.number - b.number).map((p) => [
    String(p.number).padStart(4, "0"), p.id, p.name, p.phone, p.seat, p.group, p.note,
    p.arrived ? "도착" : "미도착", p.checkInAt ? formatDateTime(p.checkInAt) : "", p.ticketPrintedAt ? formatDateTime(p.ticketPrintedAt) : ""
  ]);
  const csv = "\uFEFF" + [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `20주년_참석자명단_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim()); current = "";
    } else current += char;
  }
  cells.push(current.trim());
  return cells;
}

async function importCsv(file) {
  const text = await file.text();
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("CSV에 참가자 데이터가 없습니다.");
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const aliases = {
    name: ["이름", "성명", "name"], phone: ["연락처", "전화번호", "phone"],
    seat: ["좌석", "좌석번호", "seat"], group: ["구분", "분류", "group"], note: ["비고", "note"]
  };
  const indexOfAlias = (key) => headers.findIndex((h) => aliases[key].some((a) => a.toLowerCase() === h.toLowerCase()));
  const idx = Object.fromEntries(Object.keys(aliases).map((key) => [key, indexOfAlias(key)]));
  if (idx.name < 0) throw new Error("첫 줄에 '이름' 열이 필요합니다.");

  let added = 0;
  const occupied = new Set(state.participants.map((p) => normalizeSeat(p.seat)).filter(Boolean));
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const name = cells[idx.name]?.trim();
    if (!name) continue;
    const seat = idx.seat >= 0 ? normalizeSeat(cells[idx.seat]) : "";
    if (seat && occupied.has(seat)) continue;
    const number = nextNumber();
    const participant = normalizeParticipant({
      number, name,
      phone: idx.phone >= 0 ? cells[idx.phone] : "",
      seat,
      group: idx.group >= 0 ? cells[idx.group] : "",
      note: idx.note >= 0 ? cells[idx.note] : "",
      arrived: false
    }, number);
    state.participants.push(participant);
    if (seat) occupied.add(seat);
    added += 1;
  }
  saveState();
  showToast(`${added}명의 참가자를 불러왔습니다.`);
}

function printAllQr() {
  if (!state.participants.length) return showToast("인쇄할 참가자가 없습니다.");
  const printWindow = window.open("", "_blank");
  if (!printWindow) return showToast("팝업 차단을 해제한 뒤 다시 시도하세요.");
  const participantsJson = JSON.stringify([...state.participants].sort((a, b) => a.number - b.number));
  const settingsJson = JSON.stringify(state.settings);
  printWindow.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>참가자 QR 일괄 인쇄</title>
    <style>body{font-family:Arial,sans-serif;margin:0}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10mm;padding:10mm}.card{break-inside:avoid;border:1px solid #bbb;padding:8mm;text-align:center;border-radius:4mm}.qr{display:grid;place-items:center;min-height:45mm}.qr img,.qr canvas{width:42mm!important;height:42mm!important}.seat{font-size:22pt;font-weight:900;margin:3mm 0}.small{font-size:9pt;color:#555}@media print{.no-print{display:none}.grid{padding:0}}</style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script></head><body>
    <div class="no-print" style="padding:10px;text-align:center"><button onclick="window.print()" style="padding:10px 16px">인쇄하기</button></div><main id="grid" class="grid"></main>
    <script>const participants=${participantsJson};const settings=${settingsJson};const grid=document.getElementById('grid');participants.forEach(p=>{const card=document.createElement('article');card.className='card';card.innerHTML='<strong>'+settings.eventOrganizer+'</strong><h2>'+p.name+' 님</h2><div class="qr"></div><div class="seat">'+(p.seat||'좌석 미정')+'</div><div class="small">접수번호 '+String(p.number).padStart(4,'0')+' · '+p.id+'</div>';grid.appendChild(card);new QRCode(card.querySelector('.qr'),{text:'NYJ20|'+p.id,width:180,height:180,correctLevel:QRCode.CorrectLevel.H});});</script></body></html>`);
  printWindow.document.close();
}

function bindEvents() {
  $$(".nav-button").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  $$('[data-go]').forEach((button) => button.addEventListener("click", () => switchView(button.dataset.go)));
  $("#refreshDashboardButton").addEventListener("click", renderDashboard);
  $("#exportCsvButton").addEventListener("click", exportCsv);
  $("#exportCsvDashboardButton").addEventListener("click", exportCsv);
  $("#printAllQrButton").addEventListener("click", printAllQr);

  $("#participantForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const participant = addParticipant(Object.fromEntries(form.entries()));
      event.currentTarget.reset();
      showToast(`${participant.name} 님을 ${String(participant.number).padStart(4, "0")}번으로 등록했습니다.`);
    } catch (error) { showToast(error.message); }
  });
  $("#participantSearch").addEventListener("input", renderParticipants);
  $("#participantStatusFilter").addEventListener("change", renderParticipants);
  $("#participantTableBody").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const participant = findParticipantById(button.dataset.id);
    if (!participant) return;
    const action = button.dataset.action;
    if (action === "qr") showQrModal(participant);
    if (action === "edit") showParticipantEditModal(participant);
    if (action === "toggle") participant.arrived ? undoCheckIn(participant) : checkInParticipant(participant);
    if (action === "delete" && confirm(`${participant.name} 님을 삭제할까요?`)) {
      state.participants = state.participants.filter((p) => p.id !== participant.id);
      saveState();
      showToast("참가자를 삭제했습니다.");
    }
  });

  $("#csvFileInput").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try { await importCsv(file); } catch (error) { showToast(error.message); }
    event.target.value = "";
  });

  $("#toggleScannerButton").addEventListener("click", () => scannerRunning ? stopScanner() : startScanner());
  $("#manualCheckinForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const matches = findMatches($("#manualCheckinInput").value);
    const results = $("#manualSearchResults");
    if (!matches.length) {
      results.innerHTML = `<div class="empty-state">참가자를 찾지 못했습니다.</div>`;
      return;
    }
    if (matches.length === 1) {
      results.innerHTML = "";
      showCheckinResult(matches[0]);
      return;
    }
    results.innerHTML = matches.map((p) => `<button class="search-result-button" data-manual-id="${escapeHtml(p.id)}" type="button"><strong>${escapeHtml(p.name)}</strong><br><span>${escapeHtml(p.seat || "좌석 미정")} · ${escapeHtml(maskPhone(p.phone))} · ${p.arrived ? "도착" : "미도착"}</span></button>`).join("");
  });
  $("#manualSearchResults").addEventListener("click", (event) => {
    const button = event.target.closest("[data-manual-id]");
    if (!button) return;
    const participant = findParticipantById(button.dataset.manualId);
    if (participant) showCheckinResult(participant);
  });
  $("#checkinResult").addEventListener("click", (event) => {
    const button = event.target.closest("[data-result-action]");
    if (!button) return;
    const participant = findParticipantById(button.dataset.id);
    if (!participant) return;
    if (button.dataset.resultAction === "checkin") checkInParticipant(participant);
    if (button.dataset.resultAction === "undo") undoCheckIn(participant);
    if (button.dataset.resultAction === "ticket") showTicketModal(participant);
    if (button.dataset.resultAction === "qr") showQrModal(participant);
  });

  $("#seatMap").addEventListener("click", (event) => {
    const button = event.target.closest("[data-seat-id]");
    if (!button) return;
    const participant = findParticipantById(button.dataset.seatId);
    if (participant) showSeatParticipant(participant);
  });

  $("#eventSettingsForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.settings = {
      eventName: $("#eventName").value.trim(), eventDate: $("#eventDate").value.trim(),
      eventVenue: $("#eventVenue").value.trim(), eventOrganizer: $("#eventOrganizer").value.trim(),
      seatRows: $("#seatRows").value.trim(), seatsPerRow: Number($("#seatsPerRow").value) || 10
    };
    saveState();
    showToast("행사 설정을 저장했습니다.");
  });
  $("#loadSampleButton").addEventListener("click", () => {
    if (!confirm("현재 참가자 명단을 지우고 예시 데이터를 다시 넣을까요?")) return;
    state.participants = createSampleParticipants();
    saveState();
    showToast("예시 데이터를 다시 넣었습니다.");
  });
  $("#clearAllButton").addEventListener("click", () => {
    if (!confirm("참가자와 접수 기록을 모두 삭제합니다. 되돌릴 수 없습니다.")) return;
    state.participants = [];
    saveState();
    showToast("전체 데이터를 삭제했습니다.");
  });

  $("#closeModalButton").addEventListener("click", closeModal);
  $("#modalBackdrop").addEventListener("click", (event) => { if (event.target.id === "modalBackdrop") closeModal(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    $("#installButton").classList.remove("hidden");
  });
  $("#installButton").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $("#installButton").classList.add("hidden");
  });
}

bindEvents();
renderAll();
