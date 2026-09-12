/**
 * 남양주시장애인복지관 20주년 행사 QR 접수 시스템
 * Google Spreadsheet + Apps Script 백엔드
 *
 * 설치 순서
 * 1) 빈 Google 스프레드시트 생성
 * 2) 확장 프로그램 > Apps Script
 * 3) 이 파일 전체를 Code.gs에 붙여넣기
 * 4) setupSystem()을 한 번 실행하고 권한 허용
 * 5) 배포 > 새 배포 > 웹 앱
 *    - 실행 사용자: 나
 *    - 액세스 권한: 모든 사용자
 */

const APP_VERSION = '8.6.0-SEAT-10X10-ZONES';
const PRIVACY_CONSENT_VERSION = 'NYJWEL20-INDIVIDUAL-2026-08-24-v4';

// ============================================================
// Google 스프레드시트 연결 설정
// 현재 사용 중인 실제 참가자 명단 스프레드시트 ID를 고정합니다.
// ============================================================
const SPREADSHEET_ID_CONFIG = '1Cq9jXtd2yYXo4XM-Rq0HYk_Tl5gqWubzysrN0a813WE';

// ============================================================
// 관리자 로그인 설정 - 비밀번호만 바꾸면 됩니다.
// 대괄호 안내문 전체를 원하는 비밀번호로 교체하세요.
// 예: password: 'myStrongPassword123!'
// ============================================================
const ADMIN_LOGIN_CONFIG = Object.freeze({
  password: '1234',
  sessionHours: 24
});
const ADMIN_SESSION_PREFIX = 'ADMIN_SESSION_';
const ADMIN_LOGIN_FAIL_PREFIX = 'ADMIN_LOGIN_FAIL_';
const SEAT_LAYOUT_SCHEMA_VERSION = 'RUNWAY-AY-300-AK-CENTER66-AD-WHEEL24-V341';
const SHEET_NAMES = Object.freeze({
  PARTICIPANTS: '참가자',
  SETTINGS: '설정',
  LOGS: '접수로그',
  DRAW: '행운추첨',
  ROULETTE_PRIZES: '룰렛상품',
  ROULETTE_HISTORY: '룰렛추첨내역'
});

const PARTICIPANT_HEADERS = Object.freeze([
  '접수번호', 'QR고유코드', '이름', '연락처', '좌석번호', '신청유형', '비고',
  '도착여부', '도착시각', '티켓출력시각', '등록시각', '수정시각', '사용여부',
  '소속기관', '신청인원(개인=1)', '개인정보동의', '개인정보동의일시',
  '개인정보동의버전', '구버전_선택동의', '구버전_선택동의일시'
]);

const LOG_HEADERS = Object.freeze([
  '처리시각', '작업', 'QR고유코드', '접수번호', '이름', '좌석번호', '접수대', '비고'
]);

const ROULETTE_PRIZE_HEADERS_V29 = Object.freeze([
  '상품번호','상품명','총수량','사용여부','수정시각','비고','사진여부','상품사진DataURL'
]);

const ROULETTE_HISTORY_HEADERS_V29 = Object.freeze([
  '추첨ID','추첨시각','상품번호','상품명','당첨방식','이번당첨인원','대상인원',
  '당첨자QR','당첨자명','좌석번호','결승순위','사용여부','취소시각','접수대','비고'
]);

const ROULETTE_ROUND_CACHE_PREFIX_V29 = 'ROULETTE_ROUND_V29_';
const ROULETTE_IMAGE_MAX_CHARS_V29 = 46000;


const DEFAULT_SETTINGS = Object.freeze({
  eventName: '남양주시장애인복지관 개관 20주년 기념행사',
  eventDate: '2026. 9. 17.(목) 13:30',
  eventVenue: '남양주금곡실내체육관',
  eventOrganizer: '남양주시장애인복지관',
  seatRows: 'A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X,Y',
  seatsPerRow: 12,
  autoSeatStartRow: 'A',
  autoRefreshSeconds: 15,
  publicSubtitle: '스무번의 계절, 스물한 번째 약속',
  publicGreeting: '남양주시장애인복지관의 스무 해를 함께해 주신 여러분을 초대합니다.',
  publicProgramTitle: '스무 해의 발자취와 새로운 약속',
  publicProgramIntro: '공연과 런웨이, 기념식, 사례공유와 비전 선포까지 함께해 주세요.',
  publicProgramItems: "13:00~13:30|접수 및 행사 안내|QR 확인, 기념품 수령 및 입장 안내\n13:30~14:00|식전 공연|줌바·핏합·셔플·댄스 공연\n14:00~14:20|인클루시브 런웨이|Stage 1 · Bridge 퍼포먼스 · Stage 2 · Finale\n14:20~14:25|기념식 오프닝|개회 및 국민의례\n14:25~14:30|환영사|개관 20주년을 맞아 전하는 환영의 말씀\n14:30~14:35|내빈 소개|함께해 주신 내빈 소개\n14:35~14:55|시상 및 축사|표창·시상과 축하의 말씀\n14:55~15:10|청년사회복지사 사례공유|스마트재활·AI돌봄·미래를 여는 복지관\n15:10~15:15|비전 선포|앞으로의 20년을 향한 비전 선포\n15:15~15:20|단체 사진 촬영 및 폐회|기념촬영 후 행사를 마무리합니다.",
  privacyRetentionText: '행사 종료 후 결과 정리 및 문의 대응 완료 시까지(최대 30일)',
  registrationOpen: true,
  registrationCapacity: 450,
  autoAssignSeat: true
});

const SETTING_DESCRIPTIONS = Object.freeze({
  eventName: '행사명',
  eventDate: '행사 일시',
  eventVenue: '행사 장소',
  eventOrganizer: '주최 기관',
  seatRows: '좌석 행. 쉼표로 구분',
  seatsPerRow: '행당 좌석 수',
  autoSeatStartRow: '온라인 신청 자동 좌석 배정을 시작할 행',
  autoRefreshSeconds: '화면 자동 새로고침 간격(초)',
  publicSubtitle: '공개 모바일 초대장 부제',
  publicGreeting: '공개 모바일 초대장 인사말',
  publicProgramTitle: '공개 초대장 행사 세부내용 제목',
  publicProgramIntro: '공개 초대장 행사 세부내용 소개문',
  publicProgramItems: '행사 일정. 한 줄에 시간|행사명|설명 형식',
  privacyRetentionText: '개인정보 보유 및 이용 기간 안내 문구',
  registrationOpen: '온라인 참가 신청 가능 여부',
  registrationCapacity: '온라인 신청 최대 인원',
  autoAssignSeat: '신청 순서대로 좌석 자동 배정 여부'
});
/** 최초 한 번 실행 */
function showAdminLoginSettingGuide() {
  const message = 'Code.gs 상단 ADMIN_LOGIN_CONFIG의 password를 설정하세요. 로그인은 24시간 유지됩니다.';
  console.log(message);
  return message;
}


function showConnectedSpreadsheetInfo() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEET_NAMES.PARTICIPANTS);
  const lastRow = sheet ? sheet.getLastRow() : 0;
  const activeCount = sheet ? readParticipants_().length : 0;
  const result = {
    spreadsheetName: ss.getName(),
    spreadsheetId: ss.getId(),
    expectedSpreadsheetId: SPREADSHEET_ID_CONFIG,
    participantSheetLastRow: lastRow,
    activeParticipantCount: activeCount,
    idMatches: ss.getId() === SPREADSHEET_ID_CONFIG
  };
  console.log('스프레드시트 연결 확인: ' + JSON.stringify(result));
  return result;
}

function clearAllAdminSessions() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).forEach(function(key) {
    if (key.indexOf(ADMIN_SESSION_PREFIX) === 0) props.deleteProperty(key);
  });
  console.log('모든 관리자 로그인 세션을 로그아웃했습니다.');
  return { ok: true };
}

function applyCinemaSeatDefaults() {
  const next = Object.assign({}, getSettings_(), {
    seatRows: 'A,B,C,D,E,F,G,H,I,J,K,L,M,N,O',
    seatsPerRow: 12,
    autoSeatStartRow: 'A',
    registrationCapacity: 400,
    autoAssignSeat: true
  });
  const settingsSheet = getSpreadsheet_().getSheetByName(SHEET_NAMES.SETTINGS);
  const rows = Object.keys(DEFAULT_SETTINGS).map(function(key) {
    return [key, next[key], SETTING_DESCRIPTIONS[key] || ''];
  });
  settingsSheet.getRange(2, 1, rows.length, 3).setValues(rows);
  PropertiesService.getScriptProperties().setProperty('SEAT_LAYOUT_SCHEMA_VERSION', SEAT_LAYOUT_SCHEMA_VERSION);
  SpreadsheetApp.flush();
  console.log('좌석 기본값 적용 완료: A~O × 12석 = 180석 / 자동배정 A열부터');
  return next;
}

/** 참가자 시트 C~G열에 명단을 붙여넣은 뒤 실행 */
function fillMissingNumbersAndCodes() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      console.log('참가자 데이터가 없습니다.');
      return;
    }

    const range = sheet.getRange(2, 1, lastRow - 1, PARTICIPANT_HEADERS.length);
    const values = range.getValues();
    const usedNumbers = new Set();
    const usedCodes = new Set();
    let maxNumber = 0;

    values.forEach(row => {
      const number = Number(row[0]);
      if (number > maxNumber) maxNumber = number;
    });

    let changed = 0;
    const now = new Date();
    values.forEach(row => {
      const name = String(row[2] || '').trim();
      if (!name) return;

      let number = Number(row[0]);
      if (!number || usedNumbers.has(number)) {
        maxNumber += 1;
        number = maxNumber;
        row[0] = number;
        changed += 1;
      }
      usedNumbers.add(number);

      let code = String(row[1] || '').trim().toUpperCase();
      if (!code || usedCodes.has(code)) {
        code = createUniqueCode_(number, usedCodes);
        row[1] = code;
        changed += 1;
      }
      usedCodes.add(code);

      row[4] = normalizeSeat_(row[4]);
      if (row[7] === '') row[7] = false;
      if (!row[10]) row[10] = now;
      row[11] = now;
      if (row[12] === '') row[12] = true;
      if (!row[14]) row[14] = 1;
    });

    range.setValues(values);
    SpreadsheetApp.flush();
    console.log('완료: ' + changed + '개의 누락 또는 중복 값을 정리했습니다.');
  } finally {
    lock.releaseLock();
  }
}

function addSampleParticipants() {
  const samples = [
    { name: '홍길동', phone: '010-1111-1111', partySize: 1, group: '이용인', organization: '', note: '' },
    { name: '김복지', phone: '010-2222-2222', partySize: 2, group: '보호자', organization: '', note: '' },
    { name: '이남양', phone: '010-3333-3333', partySize: 3, group: '유관기관', organization: '예시기관', note: '' }
  ];
  const result = batchImportParticipants_({ items: samples }, 'Apps Script');
  console.log('예시 참가자 추가: ' + JSON.stringify(result));
  return result;
}

function clearAllCheckIns() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      sheet.getRange(2, 8, lastRow - 1, 3).clearContent();
      sheet.getRange(2, 8, lastRow - 1, 1).setValue(false);
      sheet.getRange(2, 12, lastRow - 1, 1).setValue(new Date());
    }
    appendLog_('전체 도착기록 초기화', {}, 'Apps Script', '');
    SpreadsheetApp.flush();
    console.log('도착 기록을 초기화했습니다.');
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 웹 앱 진입점
 *
 * GitHub Pages와 Apps Script는 서로 다른 출처(origin)이므로 운영본은
 * 개인정보/관리자 비밀번호/세션토큰을 URL 쿼리스트링에 싣지 않습니다.
 * 브라우저는 숨김 form POST로 요청 본문을 보내고, 무작위 requestId로
 * 1회성 응답을 조회합니다. bridgePoll URL에는 개인정보가 포함되지 않습니다.
 */
const BRIDGE_CACHE_PREFIX = 'NYJ20_BRIDGE_';
const BRIDGE_CACHE_TTL_SECONDS = 120;
const BRIDGE_CHUNK_CHARS = 24000;

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = String(params.action || 'health');

  // 집 PC 문자 중계 전용 요청
  if (action === 'smsPending') return handleSmsPending_(params);
  if (action === 'bridgePoll') return handleBridgePoll_(params);

  // 개인정보가 없는 읽기 전용 공개 데이터만 GET/JSONP 허용
  if (action === 'health' || action === 'publicBootstrap') {
    return output_(executeWebRequest_(params), String(params.callback || ''));
  }

  return output_({
    ok: false,
    error: '개인정보가 포함될 수 있는 요청은 POST 방식으로만 처리합니다.',
    version: APP_VERSION
  }, String(params.callback || ''));
}

function doPost(e) {
  const rawBody = e && e.postData && e.postData.contents ? e.postData.contents : '';

  // 집 PC 문자 중계 결과는 JSON으로 직접 수신
  if (rawBody) {
    try {
      const body = JSON.parse(rawBody);
      if (body && body.action === 'smsResult') return handleSmsResult_(body);
    } catch (_) {}
  }

  const params = Object.assign({}, e && e.parameter ? e.parameter : {});
  if (rawBody && !params.payload) params.payload = rawBody;
  if (String(params.bridge || '') === '1' && params.requestId) {
    return handleBridgePost_(params);
  }
  return handleWebRequest_(params);
}

function normalizeBridgeRequestId_(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{20,120}$/.test(id)) throw new Error('잘못된 요청 식별자입니다.');
  return id;
}

function bridgeMetaKey_(requestId) {
  return BRIDGE_CACHE_PREFIX + requestId + '_META';
}

function bridgeChunkKey_(requestId, index) {
  return BRIDGE_CACHE_PREFIX + requestId + '_' + index;
}

function cacheBridgeResponse_(requestId, response) {
  const id = normalizeBridgeRequestId_(requestId);
  const json = JSON.stringify(response);
  const chunks = [];
  for (let i = 0; i < json.length; i += BRIDGE_CHUNK_CHARS) {
    chunks.push(json.slice(i, i + BRIDGE_CHUNK_CHARS));
  }
  if (!chunks.length) chunks.push('{}');

  const cache = CacheService.getScriptCache();
  chunks.forEach(function(chunk, index) {
    cache.put(bridgeChunkKey_(id, index), chunk, BRIDGE_CACHE_TTL_SECONDS);
  });
  cache.put(bridgeMetaKey_(id), String(chunks.length), BRIDGE_CACHE_TTL_SECONDS);
}

function readAndDeleteBridgeResponse_(requestId) {
  const id = normalizeBridgeRequestId_(requestId);
  const cache = CacheService.getScriptCache();
  const metaKey = bridgeMetaKey_(id);
  const countRaw = cache.get(metaKey);
  if (!countRaw) return null;

  const count = Number(countRaw);
  if (!count || count < 1 || count > 100) {
    cache.remove(metaKey);
    throw new Error('응답 데이터가 올바르지 않습니다.');
  }

  let json = '';
  const keys = [];
  for (let i = 0; i < count; i += 1) {
    const key = bridgeChunkKey_(id, i);
    const chunk = cache.get(key);
    if (chunk == null) return null;
    json += chunk;
    keys.push(key);
  }

  cache.remove(metaKey);
  keys.forEach(function(key) { cache.remove(key); });
  return JSON.parse(json);
}

function handleBridgePost_(params) {
  let requestId = '';
  try {
    requestId = normalizeBridgeRequestId_(params.requestId);
    const response = executeWebRequest_(params);
    cacheBridgeResponse_(requestId, response);
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    if (requestId) {
      try {
        cacheBridgeResponse_(requestId, {
          ok: false,
          error: error && error.message ? error.message : String(error),
          errorCode: error && error.code ? String(error.code) : '',
          version: APP_VERSION
        });
      } catch (_) {}
    }
  }
  // iframe은 이 본문을 읽지 않습니다. 개인정보를 응답 본문에 다시 싣지 않습니다.
  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}

function handleBridgePoll_(params) {
  const callback = String(params.callback || '');
  try {
    const response = readAndDeleteBridgeResponse_(params.requestId);
    if (!response) return output_({ ok: true, pending: true, version: APP_VERSION }, callback);
    response.pending = false;
    return output_(response, callback);
  } catch (error) {
    return output_({
      ok: false,
      pending: false,
      error: error && error.message ? error.message : String(error),
      version: APP_VERSION
    }, callback);
  }
}

function handleWebRequest_(params) {
  return output_(executeWebRequest_(params), String(params.callback || ''));
}
/** 공개 모바일 초대장에 필요한 최소 정보만 반환 */
/** 공개 신청: 관리자 키 없이 참가자를 등록하고 개인 QR용 코드를 반환 */
/** 개인 티켓 링크로 접속할 때 고유코드에 해당하는 최소 정보 반환 */
function getPublicTicket_(payload) {
  const code = extractCode_(payload.code || payload.id || payload.ticket);
  if (!code) throw new Error('개인 티켓 코드가 없습니다.');

  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
  const target = findParticipantRowByCode_(sheet, code);
  if (!target) {
    throw codedError_('TICKET_NOT_FOUND','유효하지 않은 개인 티켓입니다.');
  }
  const participant = readParticipantAtRow_(sheet, target.rowNumber);
  if (!participant.active) {
    throw codedError_(
      'TICKET_INACTIVE',
      '참가 신청이 취소되었거나 참여불가 처리된 티켓입니다.'
    );
  }
  return {
    participant: publicParticipant_(participant),
    settings: publicSettings_(getSettings_())
  };
}

/** 이름과 연락처가 모두 일치하는 신청 내역의 개인 QR을 다시 반환 */
function lookupPublicApplication_(payload) {
  const name = cleanText_(payload.name, 40);
  const phoneDigits = normalizePhoneDigits_(payload.phone);
  if (!name) throw new Error('신청할 때 입력한 이름을 입력하세요.');
  if (phoneDigits.length < 10 || phoneDigits.length > 11) throw new Error('신청할 때 입력한 연락처를 정확히 입력하세요.');

  const participant = readParticipants_().find(function(item) {
    return normalizeName_(item.name) === normalizeName_(name)
      && normalizePhoneDigits_(item.phone) === phoneDigits;
  });
  if (!participant) {
    throw new Error('일치하는 신청 내역이 없습니다. 이름과 연락처를 다시 확인해 주세요.');
  }

  appendLog_('공개 접수확인', participant, '모바일 초대장', '이름·연락처 일치');
  return {
    participant: publicParticipant_(participant),
    settings: publicSettings_(getSettings_())
  };
}
function normalizePhoneDigits_(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}

function formatPhone_(digits) {
  const value = normalizePhoneDigits_(digits);
  if (value.length === 11) return value.slice(0, 3) + '-' + value.slice(3, 7) + '-' + value.slice(7);
  if (value.length === 10) return value.slice(0, 3) + '-' + value.slice(3, 6) + '-' + value.slice(6);
  return value;
}

function normalizeName_(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, '').toLowerCase();
}

function codedError_(code, message) {
  const error = new Error(message);
  error.code = String(code || '').trim();
  return error;
}
function deleteParticipant_(payload, station) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const code = extractCode_(payload.code || payload.id);
    const sheet = getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
    const target = findParticipantRowByCode_(sheet, code);
    if (!target) throw new Error('참가자를 찾지 못했습니다.');

    const participant = readParticipantAtRow_(sheet, target.rowNumber);
    if (!participant.active) {
      return { id: code, alreadyInactive: true, releasedSeat: '' };
    }

    assertSeatMoveSafeV25_(
      participant,
      parseSeatList_(participant.seat),
      []
    );

    const previousSeat = String(participant.seat || '').trim();
    const now = new Date();

    sheet.getRange(target.rowNumber, 5).setValue('');
    sheet.getRange(target.rowNumber, 8, 1, 3).setValues([[false, '', '']]);
    sheet.getRange(target.rowNumber, 12).setValue(now);
    sheet.getRange(target.rowNumber, 13).setValue(false);
    SpreadsheetApp.flush();

    appendLog_(
      '참여불가 처리',
      participant,
      station,
      (previousSeat ? '해제 좌석 ' + previousSeat + ' / ' : '') +
      '개인 QR 사용 중지'
    );

    return {
      id: code,
      alreadyInactive: false,
      releasedSeat: previousSeat
    };
  } finally {
    lock.releaseLock();
  }
}
function undoCheckInParticipant_(payload, station) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const code = extractCode_(payload.code || payload.id);
    const sheet = getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
    const target = findParticipantRowByCode_(sheet, code);
    if (!target) throw new Error('참가자를 찾지 못했습니다.');

    const now = new Date();
    sheet.getRange(target.rowNumber, 8, 1, 3).setValues([[false, '', '']]);
    sheet.getRange(target.rowNumber, 12).setValue(now);
    SpreadsheetApp.flush();

    const participant = readParticipantAtRow_(sheet, target.rowNumber);
    appendLog_('도착 취소', participant, station, '');
    return withGiftStatusV32_(participant);
  } finally {
    lock.releaseLock();
  }
}

function markTicketPrinted_(payload, station) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const code = extractCode_(payload.code || payload.id);
    const sheet = getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
    const target = findParticipantRowByCode_(sheet, code);
    if (!target) throw new Error('참가자를 찾지 못했습니다.');

    const now = new Date();
    sheet.getRange(target.rowNumber, 10).setValue(now);
    sheet.getRange(target.rowNumber, 12).setValue(now);
    SpreadsheetApp.flush();

    const participant = readParticipantAtRow_(sheet, target.rowNumber);
    appendLog_('티켓 출력', participant, station, '');
    return participant;
  } finally {
    lock.releaseLock();
  }
}
function batchImportParticipants_(payload, station) {
  const items = Array.isArray(payload.items) ? payload.items.slice(0, 500) : [];
  if (!items.length) return { added: 0, skipped: 0, errors: [] };
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
    const participants = readParticipants_();
    const allParticipants = readAllParticipants_();
    const usedCodes = new Set(allParticipants.map(item => item.id));
    const exactKeys = new Set(participants.map(item => participantExactKey_(item)));
    let nextNumber = nextParticipantNumber_(allParticipants);
    let added = 0;
    let skipped = 0;
    const errors = [];

    items.forEach(function(raw, index) {
      try {
        const input = normalizeParticipantInput_(raw);
        if (!input.name) throw new Error('이름 없음');
        const exactKey = participantExactKey_(input);
        if (exactKeys.has(exactKey)) throw new Error('동일한 참가자 정보가 이미 있음');
        let seat = input.seat;
        const current = readParticipants_();
        const settings = getSettings_();
        assertCapacityAvailable_(settings, current, input.partySize, '');
        if (!seat && settings.autoAssignSeat) seat = findFirstAvailableSeatBlock_(settings, current, input.partySize);
        assertSeatAvailable_(current, seat, '', input.partySize);
        const number = nextNumber++;
        const code = createUniqueCode_(number, usedCodes);
        usedCodes.add(code);
        const now = new Date();
        const row = [
          number, code, input.name, input.phone, seat, input.group, input.note,
          false, '', '', now, now, true,
          input.organization, input.partySize, false, '', '관리자 일괄등록', false, ''
        ];
        const writtenRow = writeParticipantRow_(sheet, row);
        appendLog_('참가자 일괄등록', rowToParticipant_(row, writtenRow), station, '참여인원 ' + input.partySize + '명');
        exactKeys.add(exactKey);
        added += 1;
      } catch (error) {
        skipped += 1;
        errors.push((index + 1) + '번째: ' + (error.message || String(error)));
      }
    });
    SpreadsheetApp.flush();
    return { added: added, skipped: skipped, errors: errors.slice(0, 50) };
  } finally {
    lock.releaseLock();
  }
}


/**
 * 참가자 행은 appendRow()를 사용하지 않습니다.
 * H/M열에 미리 생성된 체크박스가 시트의 마지막 행으로 인식되는 경우에도
 * 실제 참가자 이름(C열)이 비어 있는 첫 행을 찾아 저장합니다.
 */
function findFirstEmptyParticipantRow_(sheet) {
  const maxRows = Math.max(sheet.getMaxRows(), 2);
  const rowCount = Math.max(1, maxRows - 1);
  const names = sheet.getRange(2, 3, rowCount, 1).getDisplayValues();
  for (let i = 0; i < names.length; i += 1) {
    if (!String(names[i][0] || '').trim()) return i + 2;
  }
  sheet.insertRowAfter(maxRows);
  return maxRows + 1;
}
/**
 * 이전 버전에서 H/M열 체크박스 때문에 2001행 부근에 저장된 참가자를
 * 위쪽(2행부터)으로 모아주는 1회 복구 함수입니다.
 * 참가자 이름(C열)이 있는 행만 참가자 데이터로 판단합니다.
 */
function buildParticipantRowIndexV80_(sheet) {
  const last = sheet.getLastRow();
  const index = {};
  if (last >= 2) {
    const values = sheet.getRange(2, 2, last - 1, 1).getDisplayValues();
    values.forEach(function(row, i) {
      const code = String(row[0] || '').trim().toUpperCase();
      if (code) index[code] = i + 2;
    });
  }
  try {
    CacheService.getScriptCache().put(
      PARTICIPANT_ROW_INDEX_CACHE_V80,
      JSON.stringify(index),
      PARTICIPANT_ROW_INDEX_TTL_V80
    );
  } catch (_) {}
  return index;
}

function getParticipantRowIndexV80_(sheet) {
  try {
    const raw = CacheService.getScriptCache().get(PARTICIPANT_ROW_INDEX_CACHE_V80);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return buildParticipantRowIndexV80_(sheet);
}

function clearParticipantRowIndexV80_() {
  try {
    CacheService.getScriptCache().remove(PARTICIPANT_ROW_INDEX_CACHE_V80);
  } catch (_) {}
}

function findParticipantRowByCode_(sheet, code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized || sheet.getLastRow() < 2) return null;

  // 대부분의 QR 접수는 캐시된 코드→행번호로 즉시 찾습니다.
  const index = getParticipantRowIndexV80_(sheet);
  const cachedRow = Number(index[normalized] || 0);
  if (cachedRow >= 2) return { rowNumber: cachedRow };

  // 방금 추가된 참가자는 캐시에 아직 없을 수 있으므로 1회 fallback 검색.
  const finder = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1)
    .createTextFinder(normalized)
    .matchEntireCell(true)
    .matchCase(false)
    .findNext();

  if (!finder) return null;

  // 새 참가자가 있었으므로 인덱스를 다시 생성합니다.
  buildParticipantRowIndexV80_(sheet);
  return { rowNumber: finder.getRow() };
}
function appendLog_(action, participant, station, note) {
  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAMES.LOGS);
  sheet.appendRow([
    new Date(), action,
    participant.id || '', participant.number || '', participant.name || '', participant.seat || '',
    station || '', note || ''
  ]);
}
function getTotalParticipantPeople_(participants, exceptCode) {
  return participants.reduce(function(total, item) {
    if (exceptCode && item.id === exceptCode) return total;
    return total + Math.max(1, Number(item.partySize) || 1);
  }, 0);
}

function assertCapacityAvailable_(settings, participants, partySize, exceptCode) {
  const capacity = Math.min(400, Math.max(1, Number(settings.registrationCapacity) || 350));
  const requested = Math.max(1, Number(partySize) || 1);
  const currentPeople = getTotalParticipantPeople_(participants, exceptCode || '');
  if (currentPeople + requested > capacity) {
    throw new Error('최대 수용인원 ' + capacity + '명을 초과합니다. 현재 ' + currentPeople + '명 / 추가 ' + requested + '명입니다.');
  }
}

function nextParticipantNumber_(participants) {
  const max = participants.reduce((value, item) => Math.max(value, Number(item.number) || 0), 0);
  return max + 1;
}


function normalizeParticipationStatus_(value){
  return String(value||'').trim()==='미참여'?'미참여':'참여';
}
function isParticipationExcluded_(p){
  return normalizeParticipationStatus_(p&&p.participationStatus)==='미참여';
}
function newCompanionGroupCode_(){
  return 'G'+Utilities.getUuid().replace(/-/g,'').slice(0,8).toUpperCase();
}

function participantExactKey_(participant) {
  return [participant.name, participant.phone, participant.organization, participant.partySize]
    .map(value => String(value || '').trim().toLowerCase())
    .join('|');
}

function createUniqueCode_(number, usedCodes) {
  let code;
  do {
    const suffix = Utilities.getUuid().replace(/-/g, '').slice(0, 20).toUpperCase();
    code = '20TH-' + String(number).padStart(4, '0') + '-' + suffix;
  } while (usedCodes && usedCodes.has(code));
  return code;
}

function extractCode_(value) {
  let text = String(value || '').trim();
  if (!text) return '';
  if (text.indexOf('NYJ20|') === 0) text = text.slice(6);
  if (text.indexOf('NYJ20:') === 0) text = text.slice(6);
  try {
    if (/^https?:\/\//i.test(text)) {
      const match = text.match(/[?&](?:code|id)=([^&]+)/i);
      if (match) text = decodeURIComponent(match[1]);
    }
  } catch (error) {
    // URL 형식이 아니면 그대로 처리
  }
  return text.trim().toUpperCase();
}

function normalizeSeat_(value) {
  const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  const match = raw.match(/^([A-Z가-힣]+)[-_]?(\d+)$/);
  if (!match) return raw;
  return match[1] + '-' + String(Number(match[2])).padStart(2, '0');
}

function parseSeatList_(value) {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return [];
  const result = [];
  text.split(/[,，]/).forEach(function(part) {
    const token = String(part || '').trim();
    if (!token) return;
    const range = token.match(/^([A-Z]+)[-_]?(\d+)\s*[~～-]\s*([A-Z]+)?[-_]?(\d+)$/);
    if (range) {
      const row1 = range[1];
      const row2 = range[3] || row1;
      const start = Number(range[2]);
      const end = Number(range[4]);
      if (row1 === row2 && start <= end && end - start <= 100) {
        for (let i = start; i <= end; i += 1) result.push(normalizeSeat_(row1 + '-' + i));
        return;
      }
    }
    result.push(normalizeSeat_(token));
  });
  return result.filter(Boolean);
}

function formatSeatList_(value) {
  return parseSeatList_(value).join(',');
}

function cleanText_(value, maxLength) {
  return String(value == null ? '' : value).trim().slice(0, maxLength || 200);
}

function toBoolean_(value) {
  if (value === true) return true;
  const text = String(value == null ? '' : value).trim().toLowerCase();
  return ['true', '1', 'y', 'yes', '도착', '완료', '사용'].indexOf(text) >= 0;
}

function dateToIso_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value.toISOString();
  }
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

function parsePayload_(text) {
  if (!text) return {};
  if (typeof text === 'object') return text;
  try {
    return JSON.parse(String(text));
  } catch (error) {
    throw new Error('요청 데이터 형식이 올바르지 않습니다.');
  }
}

function adminLogin_(payload) {
  const password = String(payload.password || '');
  const configuredPassword = String(ADMIN_LOGIN_CONFIG.password || '');

  if (!configuredPassword || configuredPassword.indexOf('[여기다 입력') === 0) {
    throw new Error('관리자 비밀번호가 아직 설정되지 않았습니다. Code.gs 상단의 [여기다 입력] 부분을 수정하세요.');
  }

  const loginCache = CacheService.getScriptCache();
  const failKey = ADMIN_LOGIN_FAIL_PREFIX + 'PASSWORD_ONLY';
  const failedAttempts = Number(loginCache.get(failKey) || 0);
  if (failedAttempts >= 5) {
    throw new Error('로그인 실패가 반복되어 잠시 차단되었습니다. 약 10분 후 다시 시도해 주세요.');
  }

  if (password !== configuredPassword) {
    loginCache.put(failKey, String(failedAttempts + 1), 600);
    throw new Error('비밀번호가 올바르지 않습니다.');
  }
  loginCache.remove(failKey);

  purgeExpiredAdminSessions_();

  const token = Utilities.getUuid().replace(/-/g, '') +
    Utilities.getUuid().replace(/-/g, '');
  const hours = Math.max(1, Number(ADMIN_LOGIN_CONFIG.sessionHours) || 24);
  const expiresAt = Date.now() + hours * 60 * 60 * 1000;
  const sessionData = JSON.stringify({
    username: 'admin',
    expiresAt: expiresAt,
    createdAt: Date.now()
  });

  PropertiesService.getScriptProperties().setProperty(
    ADMIN_SESSION_PREFIX + token,
    sessionData
  );

  // 같은 실행환경/캐시가 살아 있는 동안 매 요청마다 PropertiesService를 읽지 않도록 함
  try {
    loginCache.put(
      ADMIN_SESSION_FAST_PREFIX_V80 + token,
      sessionData,
      Math.min(21600, hours * 3600)
    );
  } catch (_) {}

  return {
    token: token,
    expiresAt: new Date(expiresAt).toISOString(),
    sessionHours: hours
  };
}

function adminLogout_(token) {
  const value = String(token || '').trim();
  if (value) {
    PropertiesService.getScriptProperties().deleteProperty(ADMIN_SESSION_PREFIX + value);
    try {
      CacheService.getScriptCache().remove(ADMIN_SESSION_FAST_PREFIX_V80 + value);
    } catch (_) {}
  }
  return { loggedOut: true };
}

function assertSessionAuthorized_(token) {
  const value = String(token || '').trim();
  if (!value) throw new Error('관리자 로그인이 필요합니다.');

  const cache = CacheService.getScriptCache();
  let raw = '';
  try {
    raw = cache.get(ADMIN_SESSION_FAST_PREFIX_V80 + value) || '';
  } catch (_) {}

  if (!raw) {
    raw = PropertiesService.getScriptProperties().getProperty(
      ADMIN_SESSION_PREFIX + value
    ) || '';
    if (raw) {
      try {
        cache.put(ADMIN_SESSION_FAST_PREFIX_V80 + value, raw, 21600);
      } catch (_) {}
    }
  }

  if (!raw) {
    throw new Error('관리자 로그인 시간이 만료되었습니다. 다시 로그인하세요.');
  }

  let session;
  try {
    session = JSON.parse(raw);
  } catch (_) {
    session = null;
  }

  if (!session || Number(session.expiresAt) <= Date.now()) {
    try {
      cache.remove(ADMIN_SESSION_FAST_PREFIX_V80 + value);
    } catch (_) {}
    PropertiesService.getScriptProperties().deleteProperty(
      ADMIN_SESSION_PREFIX + value
    );
    throw new Error('관리자 로그인 시간이 만료되었습니다. 다시 로그인하세요.');
  }

  return session;
}

function purgeExpiredAdminSessions_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).forEach(function(key) {
    if (key.indexOf(ADMIN_SESSION_PREFIX) !== 0) return;
    try {
      const session = JSON.parse(all[key]);
      if (!session || Number(session.expiresAt) <= Date.now()) props.deleteProperty(key);
    } catch (error) {
      props.deleteProperty(key);
    }
  });
}


// v8.0 서버 고속화: 한 실행 안에서 Spreadsheet.openById 반복 호출 방지
let __SPREADSHEET_MEMO_V80 = null;
const PARTICIPANT_ROW_INDEX_CACHE_V80 = 'participant-row-index-v80';
const AUTO_ORG_OVERRIDE_PROP_V83 = 'AUTO_ORG_GROUP_OVERRIDES_V83';
const PARTICIPANT_ROW_INDEX_TTL_V80 = 300;
const ADMIN_SESSION_FAST_PREFIX_V80 = 'admin-session-fast-v80-';


function isExplicitVipParticipantV83_(participant) {
  if (!participant) return false;
  const note = String(participant.note || '');
  if (/\[(?:SEATROLE:VIP|VIP|내빈|수상자|관계자)\]/i.test(note)) return true;

  // 사용자가 직접 지정해 둔 최우선 주요 내빈석은 재배치 시 보호합니다.
  const pinned = {
    'AL-07':true,'AL-08':true,
    'AR-01':true,'AR-02':true,'AR-03':true,'AR-04':true,'AR-05':true
  };
  return parseSeatList_(participant.seat).some(function(code){
    return Boolean(pinned[normalizeSeat_(code)]);
  });
}

function getAutoOrgOverridesV83_() {
  const raw = PropertiesService.getScriptProperties().getProperty(AUTO_ORG_OVERRIDE_PROP_V83);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function saveAutoOrgOverridesV83_(data) {
  PropertiesService.getScriptProperties().setProperty(
    AUTO_ORG_OVERRIDE_PROP_V83,
    JSON.stringify(data || {})
  );
}

function adminGetAutoOrgGroupsV83_() {
  return { overrides:getAutoOrgOverridesV83_() };
}

function adminSaveAutoOrgGroupV83_(payload, station) {
  payload = payload || {};
  const key = cleanText_(payload.key || '', 120);
  const label = cleanText_(payload.label || '', 80);
  const ids = Array.isArray(payload.ids)
    ? [...new Set(payload.ids.map(extractCode_).filter(Boolean))]
    : [];

  if (!key) throw new Error('기관 그룹 키가 없습니다.');
  if (ids.length < 2) throw new Error('자동 기관 그룹은 2명 이상이어야 합니다.');
  if (ids.length > 50) throw new Error('자동 기관 그룹은 최대 50명까지 지정할 수 있습니다.');

  // active 참가자만 읽으면 기존 그룹 안의 미참여/비활성 1명 때문에
  // 정상 참가자를 새로 추가해도 전체 저장이 실패할 수 있습니다.
  // v8.3.2는 전체 참가자에서 ID를 확인한 뒤 유효한 사람만 저장합니다.
  const participants = readAllParticipants_();
  const byId = {};
  participants.forEach(function(p){ byId[String(p.id||'').toUpperCase()] = p; });

  const valid = [];
  const skipped = [];

  ids.forEach(function(id){
    const p = byId[String(id||'').toUpperCase()];
    if (!p) {
      skipped.push({id:id, reason:'명단에서 찾을 수 없음'});
      return;
    }
    if (!p.active) {
      skipped.push({id:id, name:p.name, reason:'비활성'});
      return;
    }
    if (isParticipationExcluded_(p)) {
      skipped.push({id:id, name:p.name, reason:'미참여'});
      return;
    }
    valid.push(p);
  });

  if (valid.length < 2) {
    const detail = skipped.slice(0,5).map(function(x){
      return (x.name || x.id) + '(' + x.reason + ')';
    }).join(', ');
    throw new Error(
      '저장 가능한 참가자가 2명 미만입니다.' +
      (detail ? ' 제외된 참가자: ' + detail : '')
    );
  }

  const all = getAutoOrgOverridesV83_();
  all[key] = {
    label: label || String(valid[0].organization || '기관 그룹'),
    ids: valid.map(function(p){return p.id;}),
    updatedAt: new Date().toISOString()
  };
  saveAutoOrgOverridesV83_(all);

  appendLog_(
    '자동 기관그룹 수정',
    valid[0],
    station,
    (all[key].label || key)+' / '+valid.length+'명' +
    (skipped.length ? ' / 제외 '+skipped.length+'명' : '')
  );

  return {
    key:key,
    label:all[key].label,
    count:valid.length,
    ids:all[key].ids,
    skipped:skipped
  };
}


function adminDeleteAutoOrgGroupV831_(payload, station) {
  const key = cleanText_(payload && payload.key || '', 120);
  if (!key) throw new Error('삭제할 기관 그룹 키가 없습니다.');

  const all = getAutoOrgOverridesV83_();
  const previous = all[key] || {};

  all[key] = {
    label: cleanText_(previous.label || payload.label || '', 80),
    ids: Array.isArray(previous.ids) ? previous.ids : [],
    hidden: true,
    deletedAt: new Date().toISOString()
  };
  saveAutoOrgOverridesV83_(all);

  appendLog_(
    '자동 기관그룹 삭제',
    {},
    station,
    (all[key].label || key) + ' / 자동 그룹 목록에서 제외'
  );

  return { key:key, deleted:true };
}

function adminResetAutoOrgGroupV83_(payload, station) {
  const key = cleanText_(payload && payload.key || '', 120);
  if (!key) throw new Error('기관 그룹 키가 없습니다.');
  const all = getAutoOrgOverridesV83_();
  delete all[key];
  saveAutoOrgOverridesV83_(all);
  appendLog_('자동 기관그룹 초기화', {}, station, key);
  return {key:key, reset:true};
}

function getSpreadsheet_() {
  if (__SPREADSHEET_MEMO_V80) return __SPREADSHEET_MEMO_V80;

  const configuredId = String(SPREADSHEET_ID_CONFIG || '').trim();
  const savedId = configuredId
    ? ''
    : PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  const id = configuredId || savedId;

  if (!id) {
    throw new Error('스프레드시트 연결 정보가 없습니다. setupSystem()을 먼저 실행하세요.');
  }

  __SPREADSHEET_MEMO_V80 = SpreadsheetApp.openById(id);
  return __SPREADSHEET_MEMO_V80;
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

function applyParticipantSheetFormat_(sheet) {
  sheet.getRange(1, 1, 1, PARTICIPANT_HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#172554')
    .setFontColor('#ffffff');
  sheet.setColumnWidth(1, 90);
  sheet.setColumnWidth(2, 210);
  sheet.setColumnWidth(3, 120);
  sheet.setColumnWidth(4, 150);
  sheet.setColumnWidth(5, 360);
  sheet.setColumnWidth(6, 110);
  sheet.setColumnWidth(7, 220);
  sheet.setColumnWidths(8, 3, 145);
  sheet.setColumnWidths(11, 2, 145);
  sheet.setColumnWidth(13, 90);
  sheet.setColumnWidth(14, 180);
  sheet.setColumnWidth(15, 90);
  sheet.setColumnWidth(16, 110);
  sheet.setColumnWidth(17, 160);
  sheet.setColumnWidth(18, 190);
  sheet.setColumnWidth(19, 110);
  sheet.setColumnWidth(20, 160);
  const checkboxRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  sheet.getRange('H2:H2000').setDataValidation(checkboxRule);
  sheet.getRange('M2:M2000').setDataValidation(checkboxRule);
  sheet.getRange('P2:P2000').setDataValidation(checkboxRule);
  sheet.getRange('S2:S2000').setDataValidation(checkboxRule);
  sheet.getRange('I2:L2000').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.getRange('Q2:Q2000').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.getRange('T2:T2000').setNumberFormat('yyyy-mm-dd hh:mm:ss');
}

function applySettingsSheetFormat_(sheet) {
  sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#172554').setFontColor('#ffffff');
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 420);
  sheet.setColumnWidth(3, 260);
}

function applyLogSheetFormat_(sheet) {
  sheet.getRange(1, 1, 1, LOG_HEADERS.length).setFontWeight('bold').setBackground('#172554').setFontColor('#ffffff');
  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 150);
  sheet.setColumnWidth(3, 210);
  sheet.setColumnWidths(4, 4, 120);
  sheet.setColumnWidth(8, 260);
  sheet.getRange('A2:A5000').setNumberFormat('yyyy-mm-dd hh:mm:ss');
}

function writeDefaultSettings_(sheet) {
  const existing = {};
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(row => {
      existing[String(row[0] || '').trim()] = row[1];
    });
  }
  const rows = Object.keys(DEFAULT_SETTINGS).map(key => [
    key,
    Object.prototype.hasOwnProperty.call(existing, key) && existing[key] !== '' ? existing[key] : DEFAULT_SETTINGS[key],
    SETTING_DESCRIPTIONS[key] || ''
  ]);
  sheet.getRange(2, 1, rows.length, 3).setValues(rows);
}


function output_(payload, callback) {
  const json = JSON.stringify(payload);
  const safeCallback = /^[A-Za-z_$][0-9A-Za-z_$]*(?:\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(callback)
    ? callback
    : '';
  if (safeCallback) {
    return ContentService.createTextOutput(safeCallback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}


/* ======================================================================
 * v1.3 RUNWAY 500-SEAT + VIP + WHEELCHAIR OVERRIDES
 * 메인 A~O 15줄 × 좌10/우10 = 300석
 * 후면 X구역 좌25/우25 = 50석 / 총 500석
 * A줄 30석 VIP / 일반 온라인 자동배정 제외
 * 기본 휠체어 자동배정 앵커: AL-01, AR-15 (전면 바깥 통로측)
 * ====================================================================== */

const RUNWAY_SEAT_SHEET_V13 = '좌석설정';
const RUNWAY_SEAT_SCHEMA_V13 = 'RUNWAY-AY-300-AK-CENTER66-AD-WHEEL24-V341';
const PARTICIPANT_COLUMN_COUNT_V13 = 30;
const SENSITIVE_CONSENT_VERSION_V13 = 'NYJWEL20-SENSITIVE-2026-08-21-v2';
const RUNWAY_SEAT_HEADERS_V13 = Object.freeze([
  '좌석코드','행','측면','번호','구역','일반자동배정','사용여부','휠체어자동배정','메모','정렬순서'
]);
const PARTICIPANT_EXTRA_HEADERS_V13 = Object.freeze([
  '휠체어이용여부',
  '민감정보동의',
  '민감정보동의일시',
  '민감정보동의버전',
  '휠체어이용인원(개인신청 0·1)',
  '복지관이용여부',
  '이용프로그램(현재 미사용)',
  '장애인당사자여부',
  '동반그룹',
  '참여상태'
]);
const RUNWAY_EXTRA_SETTINGS_V13 = Object.freeze({
  introVideoEnabled: false,
  introVideoUrl: 'assets/intro.mp4',
  ticketRefreshSeconds: 15
});
function upsertSettingV13_(sheet,key,value,description){
  const last=sheet.getLastRow();
  if(last>=2){const vals=sheet.getRange(2,1,last-1,1).getDisplayValues();for(let i=0;i<vals.length;i++){if(String(vals[i][0]||'').trim()===key){if(sheet.getRange(i+2,2).getValue()==='')sheet.getRange(i+2,2).setValue(value);sheet.getRange(i+2,3).setValue(description||'');return;}}}
  sheet.appendRow([key,value,description||'']);
}
function getSeatOccupantMapV13_(participants,ignore){const out={};(participants||[]).forEach(function(p){if(ignore&&ignore[p.id])return;parseSeatList_(p.seat).forEach(c=>out[normalizeSeat_(c)]=p);});return out;}
function saveSeatMetaV13_(payload,station){
  clearAdminExtrasCacheV301_();
  const seats=parseSeatList_(payload.seats||payload.seat);if(!seats.length)throw new Error('변경할 좌석을 입력하세요.');const sheet=ensureRunwaySeatSheetV13_(true),meta=getSeatMetaV13_(),map={};meta.forEach(s=>map[s.code]=s);
  const category=cleanText_(payload.category||'일반',40)||'일반',autoAssignable=toBoolean_(payload.autoAssignable),enabled=payload.enabled===undefined?true:toBoolean_(payload.enabled),wheelchairEligible=toBoolean_(payload.wheelchairEligible),note=cleanText_(payload.note,120);
  seats.forEach(function(c){const code=normalizeSeat_(c),m=map[code];if(!m)throw new Error('좌석배치도에 없는 좌석입니다: '+code);sheet.getRange(m.sheetRow,5,1,5).setValues([[category,autoAssignable,enabled,wheelchairEligible,note]]);});SpreadsheetApp.flush();appendLog_('좌석구역 설정변경',{},station,seats.join(',')+' / '+category);return getSeatMetaV13_();
}
function getPublicSeatLayoutV13_(){return getSeatMetaV13_().map(s=>({code:s.code,row:s.row,side:s.side,number:s.number,category:s.category,enabled:s.enabled,wheelchairEligible:s.wheelchairEligible,order:s.order}));}
function readAllParticipants_(){const sheet=getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS),last=sheet.getLastRow();if(last<2)return[];const range=sheet.getRange(2,1,last-1,PARTICIPANT_COLUMN_COUNT_V13),raw=range.getValues(),display=range.getDisplayValues(),out=[];raw.forEach((r,i)=>{const p=rowToParticipant_(r,i+2,display[i]);if(p.name)out.push(p);});out.sort((a,b)=>a.number-b.number);return out;}
function readParticipants_(){return readAllParticipants_().filter(p=>p.active);}
function readParticipantAtRow_(sheet,rowNumber){const range=sheet.getRange(rowNumber,1,1,PARTICIPANT_COLUMN_COUNT_V13);return rowToParticipant_(range.getValues()[0],rowNumber,range.getDisplayValues()[0]);}
function repairParticipantSheet(){const sheet=getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS),last=sheet.getLastRow();if(last<2)return{ok:true,participantCount:0};const range=sheet.getRange(2,1,last-1,PARTICIPANT_COLUMN_COUNT_V13),rows=range.getValues().filter(r=>Boolean(String(r[2]||'').trim()));range.clearContent();if(rows.length)sheet.getRange(2,1,rows.length,PARTICIPANT_COLUMN_COUNT_V13).setValues(rows);ensureParticipantExtraColumnsV13_(sheet);applyParticipantSheetFormat_(sheet);SpreadsheetApp.flush();return{ok:true,participantCount:rows.length};}
function assertSeatAvailable_(participants,seatValue,exceptCode,partySize){const seats=parseSeatList_(seatValue);if(!seats.length)return;const expected=Math.max(1,Number(partySize)||1);if(seats.length!==expected)throw new Error('참여인원 '+expected+'명에 맞게 좌석도 '+expected+'개를 지정해 주세요.');if(new Set(seats).size!==seats.length)throw new Error('중복된 좌석번호가 있습니다.');const valid={};getSeatMetaV13_().forEach(s=>valid[s.code]=s);seats.forEach(function(code){const c=normalizeSeat_(code);if(!valid[c])throw new Error('유효하지 않은 좌석번호입니다: '+c);if(!valid[c].enabled)throw new Error(c+' 좌석은 사용 중지 상태입니다.');const dup=participants.find(p=>p.id!==exceptCode&&parseSeatList_(p.seat).includes(c));if(dup)throw new Error(c+' 좌석은 이미 '+dup.name+' 님에게 배정되어 있습니다.');});}
function publicSettings_(s){return{
  eventName:s.eventName,
  eventDate:s.eventDate,
  eventVenue:s.eventVenue,
  eventOrganizer:s.eventOrganizer,
  publicSubtitle:s.publicSubtitle,
  publicGreeting:s.publicGreeting,
  publicProgramTitle:s.publicProgramTitle,
  publicProgramIntro:s.publicProgramIntro,
  publicProgramItems:s.publicProgramItems,
  privacyRetentionText:s.privacyRetentionText,
  registrationOpen:s.registrationOpen,
  registrationCapacity:s.registrationCapacity,
  introVideoEnabled:s.introVideoEnabled,
  introVideoUrl:s.introVideoUrl,
  ticketRefreshSeconds:s.ticketRefreshSeconds,
  privacyConsentVersion:PRIVACY_CONSENT_VERSION,
  sensitiveConsentVersion:SENSITIVE_CONSENT_VERSION_V13
};}
const PUBLIC_BOOTSTRAP_CACHE_KEY_V352='NYJ20_PUBLIC_BOOTSTRAP_V352';
const PUBLIC_BOOTSTRAP_CACHE_SECONDS_V352=8;

function clearPublicBootstrapCacheV352_(){
  try{CacheService.getScriptCache().remove(PUBLIC_BOOTSTRAP_CACHE_KEY_V352);}catch(_){}
}

function getPublicBootstrapData_(){
  const cache=CacheService.getScriptCache();
  try{
    const hit=cache.get(PUBLIC_BOOTSTRAP_CACHE_KEY_V352);
    if(hit)return JSON.parse(hit);
  }catch(_){}

  const s=getSettings_();
  const p=readParticipants_();
  const data={
    settings:publicSettings_(s),
    counts:registrationCounts_(s,p),
    serverTime:new Date().toISOString(),
    version:APP_VERSION
  };

  try{
    cache.put(
      PUBLIC_BOOTSTRAP_CACHE_KEY_V352,
      JSON.stringify(data),
      PUBLIC_BOOTSTRAP_CACHE_SECONDS_V352
    );
  }catch(_){}
  return data;
}
/* ======================================================================
 * v1.7 SMART 450-SEAT OVERRIDES
 * A~O 15줄 × (좌 15 + 런웨이 + 우 15) = 총 450석
 *
 * VIP 24석:
 *   AL-10~15 / AR-01~06 / BL-10~15 / BR-01~06
 *   -> 무대와 런웨이 앞 중앙부 2줄, 일반 자동배정 제외
 *
 * 휠체어 4석:
 *   AL-01, AL-02, AR-14, AR-15
 *   -> 맨 앞줄 바깥 통로측, 일반 자동배정 제외
 *
 * 일반 자동배정 우선순위:
 *   1) 런웨이에 가까운 연속 자리
 *   2) 같은 조건이면 앞줄
 *   3) 1~15명은 한쪽에 연속 배치
 *   4) 16~30명은 같은 줄 좌·우로 최대한 균형 분할
 *   5) 현재 줄에 인원수만큼 연속 좌석이 없으면 다음 적합 줄로 이동
 * ====================================================================== */

const SMART_SEAT_COUNT_V17 = 500;
const SMART_ROWS_V17 = 'ABCDEFGHIJKLMNOPQRSTUVWXY'.split('');

/*
 * v8.6 좌석 구조
 *
 * 전체 구조
 * - A~Y 25줄
 * - 좌측 10석 + 런웨이 + 우측 10석
 * - 총 500석
 *
 * 앞쪽 A~C
 * - 런웨이 가까운 5자리씩 = 주요 귀빈석
 *   · 좌측: 06~10
 *   · 우측: 01~05
 * - 바깥쪽 나머지 5자리씩 = 장애인·휠체어석
 *   · 좌측: 01~05
 *   · 우측: 06~10
 *
 * D~F
 * - 내빈 관련 인사 지정석
 *
 * G~Y
 * - 일반석
 *
 * 현재 운영은 '좌석 추후배정 모드'이므로
 * 일반 참가자는 신청 시 좌석을 자동배정하지 않습니다.
 */
const DISABLED_ACCESSIBLE_CODES_V31 = (function(){
  const out=[];
  'ABC'.split('').forEach(function(row){
    for(let n=1;n<=5;n++){
      out.push(row+'L-'+String(n).padStart(2,'0'));
    }
    for(let n=6;n<=10;n++){
      out.push(row+'R-'+String(n).padStart(2,'0'));
    }
  });
  return out;
})();

const SMART_VIP_CODES_V17 = (function(){
  const out=[];

  // A~C: 런웨이 쪽 5자리씩만 주요 귀빈석
  'ABC'.split('').forEach(function(row){
    for(let n=6;n<=10;n++){
      out.push(row+'L-'+String(n).padStart(2,'0'));
    }
    for(let n=1;n<=5;n++){
      out.push(row+'R-'+String(n).padStart(2,'0'));
    }
  });

  // D~F: 양쪽 10자리 모두 내빈 관련 인사석
  'DEF'.split('').forEach(function(row){
    ['L','R'].forEach(function(side){
      for(let n=1;n<=10;n++){
        out.push(row+side+'-'+String(n).padStart(2,'0'));
      }
    });
  });

  return out;
})();

const DISABLED_ACCESSIBLE_CODES_V28 = DISABLED_ACCESSIBLE_CODES_V31.slice();
const DISABLED_ACCESSIBLE_CODES_V273 = DISABLED_ACCESSIBLE_CODES_V31.slice();
const SMART_WHEELCHAIR_CODES_V17 = DISABLED_ACCESSIBLE_CODES_V31.slice();
const DISABLED_PRIORITY_CODES_V272 = DISABLED_ACCESSIBLE_CODES_V31.slice();
const DISABLED_FRONT3_CODES_V272 = DISABLED_ACCESSIBLE_CODES_V31.slice();


function forceSettingV17_(sheet,key,value,description){
  const last=sheet.getLastRow();
  if(last>=2){
    const values=sheet.getRange(2,1,last-1,1).getDisplayValues();
    for(let i=0;i<values.length;i++){
      if(String(values[i][0]||'').trim()===key){
        sheet.getRange(i+2,2,1,2).setValues([[value,description||'']]);
        return;
      }
    }
  }
  sheet.appendRow([key,value,description||'']);
}
function buildRunwaySeatRowsV13_(){
  const rows=[];let order=1;

  SMART_ROWS_V17.forEach(function(row){
    ['L','R'].forEach(function(side){
      for(let n=1;n<=10;n++){
        const code=row+side+'-'+String(n).padStart(2,'0');
        const wheelchair=DISABLED_ACCESSIBLE_CODES_V31.indexOf(code)>=0;
        const vip=SMART_VIP_CODES_V17.indexOf(code)>=0;

        let category='일반석';
        let note='G~Y 일반석 · 추후배정';
        let autoAssignable=true;
        let wheelchairEligible=false;

        if(wheelchair){
          category='장애인·휠체어석';
          note='장애인·휠체어 지정석 · 일반 참가자 배정 제외';
          autoAssignable=false;
          wheelchairEligible=true;
        }else if(vip){
          category='ABC'.indexOf(row)>=0?'주요 내빈 인사':'내빈 관련 인사';
          note=(category==='주요 내빈 인사'
            ?'A~C 주요 귀빈 지정석'
            :'D~F 내빈 관련 인사 지정석')+
            ' · 일반 자동배정 제외';
          autoAssignable=false;
        }

        rows.push([
          code,row,side,n,
          category,autoAssignable,true,wheelchairEligible,note,order++
        ]);
      }
    });
  });

  return rows;
}

function ensureRunwaySeatSheetV13_(preserveExisting){
  const ss=getSpreadsheet_();
  let sheet=ss.getSheetByName(RUNWAY_SEAT_SHEET_V13);
  if(!sheet) sheet=ss.insertSheet(RUNWAY_SEAT_SHEET_V13);

  const defaults=buildRunwaySeatRowsV13_(),existing={};
  if(preserveExisting!==false&&sheet.getLastRow()>=2&&sheet.getLastColumn()>=8){
    const width=Math.min(10,sheet.getLastColumn());
    sheet.getRange(2,1,sheet.getLastRow()-1,width).getValues().forEach(function(r){
      const code=normalizeSeat_(r[0]);
      if(code) existing[code]=r;
    });
  }

  const vipSet={};SMART_VIP_CODES_V17.forEach(c=>vipSet[c]=true);
  const disabledSet={};DISABLED_ACCESSIBLE_CODES_V273.forEach(c=>disabledSet[c]=true);

  const rows=defaults.map(function(base){
    const old=existing[base[0]];
    if(!old) return base;

    if(vipSet[base[0]]||disabledSet[base[0]]) return base;

    const oldCategory=cleanText_(old[4]||'',40);
    const oldCategoryLower=String(oldCategory).toLowerCase();
    if(
      oldCategoryLower.indexOf('vip')>=0 ||
      oldCategoryLower.indexOf('내빈')>=0 ||
      oldCategoryLower.indexOf('수상자')>=0 ||
      oldCategoryLower.indexOf('휠체어')>=0 ||
      oldCategoryLower.indexOf('장애인지정')>=0 ||
      oldCategoryLower.indexOf('장애인(')>=0
    ){
      return [base[0],base[1],base[2],base[3],'일반',true,true,false,'',base[9]];
    }

    return [
      base[0],base[1],base[2],base[3],
      oldCategory||base[4],
      old[5]===''?base[5]:toBoolean_(old[5]),
      old[6]===''?base[6]:toBoolean_(old[6]),
      old[7]===''?base[7]:toBoolean_(old[7]),
      cleanText_(old[8]||base[8],120),
      base[9]
    ];
  });

  sheet.clearContents();
  sheet.getRange(1,1,1,RUNWAY_SEAT_HEADERS_V13.length).setValues([RUNWAY_SEAT_HEADERS_V13]);
  sheet.getRange(2,1,rows.length,RUNWAY_SEAT_HEADERS_V13.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.getRange(1,1,1,RUNWAY_SEAT_HEADERS_V13.length)
    .setFontWeight('bold').setBackground('#172554').setFontColor('#fff');
  sheet.getRange('F2:H401').setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  sheet.setColumnWidth(1,110);
  sheet.setColumnWidth(5,110);
  sheet.setColumnWidth(9,220);
  SpreadsheetApp.flush();
  return sheet;
}

function applyRunwaySeatDefaultsV13(){
  ensureRunwaySeatSheetV13_(false);
  const settings=getSpreadsheet_().getSheetByName(SHEET_NAMES.SETTINGS);
  if(settings)forceSettingV17_(settings,'registrationCapacity',400,'전체 참가자 정원 · 500석 확장');
  clearPublicBootstrapCacheV352_();
  return{ok:true,seatCount:400,vipCount:SMART_VIP_CODES_V17.length,wheelchairCount:24,disabledPriorityCount:24,disabledFrontZoneCount:24};
}

function getSeatMetaV13_(){
  let sheet=getSpreadsheet_().getSheetByName(RUNWAY_SEAT_SHEET_V13);
  if(!sheet||sheet.getLastRow()!==401) sheet=ensureRunwaySeatSheetV13_(true);
  return sheet.getRange(2,1,400,10).getValues().map(function(r,i){
    return{
      code:normalizeSeat_(r[0]),
      row:String(r[1]||'').trim().toUpperCase(),
      side:String(r[2]||'').trim().toUpperCase(),
      number:Number(r[3])||0,
      category:cleanText_(r[4]||'일반',40),
      autoAssignable:toBoolean_(r[5]),
      enabled:r[6]===''?true:toBoolean_(r[6]),
      wheelchairEligible:toBoolean_(r[7]),
      note:cleanText_(r[8],120),
      order:Number(r[9])||i+1,
      sheetRow:i+2
    };
  }).filter(x=>x.code).sort((a,b)=>a.order-b.order);
}

function getRunwaySeatBlocksV13_(meta){
  const map={};
  (meta||getSeatMetaV13_()).forEach(function(s){
    const key=s.row+s.side;
    if(!map[key]) map[key]=[];
    map[key].push(s);
  });
  Object.keys(map).forEach(k=>map[k].sort((a,b)=>a.number-b.number));
  const keys=[];
  SMART_ROWS_V17.forEach(r=>keys.push(r+'L',r+'R'));
  return keys.map(k=>map[k]||[]).filter(b=>b.length);
}

function bestWindowOnSideV17_(seats,count,side,occupied){
  if(count<1||count>8) return null;
  let best=null;

  function seatDistance(s){
    if(side==='L'){
      // 기존 L06이 런웨이 가장 가까움. 새 L07/L08은 바깥쪽 추가석.
      if(s.number===7)return 6;
      if(s.number===8)return 7;
      return Math.max(0,6-s.number);
    }
    // 기존 R01이 런웨이 가장 가까움. 새 R07/R08은 바깥쪽 추가석.
    return Math.max(0,s.number-1);
  }

  for(let start=0;start<=seats.length-count;start++){
    const win=seats.slice(start,start+count);
    const ok=win.every(function(s){
      return s.enabled&&s.autoAssignable&&!occupied[s.code];
    });
    if(!ok) continue;

    const distance=Math.max.apply(null,win.map(seatDistance));
    const candidate={seats:win.map(s=>s.code),distance:distance};
    if(!best||candidate.distance<best.distance) best=candidate;
  }
  return best;
}

function rowSidesV17_(meta,row){
  const leftOrder={8:0,7:1,1:2,2:3,3:4,4:5,5:6,6:7};
  const left=meta.filter(s=>s.row===row&&s.side==='L')
    .sort((a,b)=>(leftOrder[a.number]??99)-(leftOrder[b.number]??99));
  const right=meta.filter(s=>s.row===row&&s.side==='R')
    .sort((a,b)=>a.number-b.number);
  return{left,right};
}

function bestRowPlanV17_(meta,occupied,row,count){
  if(count<1||count>16) return null;
  const sides=rowSidesV17_(meta,row);

  if(count<=8){
    const left=bestWindowOnSideV17_(sides.left,count,'L',occupied);
    const right=bestWindowOnSideV17_(sides.right,count,'R',occupied);
    const candidates=[];
    if(left) candidates.push({codes:left.seats,distance:left.distance,imbalance:0,side:'L'});
    if(right) candidates.push({codes:right.seats,distance:right.distance,imbalance:0,side:'R'});
    if(!candidates.length) return null;
    candidates.sort((a,b)=>a.distance-b.distance || (a.side==='L'?-1:1));
    return candidates[0];
  }

  let best=null;
  const minLeft=Math.max(1,count-8);
  const maxLeft=Math.min(8,count-1);

  for(let leftCount=minLeft;leftCount<=maxLeft;leftCount++){
    const rightCount=count-leftCount;
    const left=bestWindowOnSideV17_(sides.left,leftCount,'L',occupied);
    const right=bestWindowOnSideV17_(sides.right,rightCount,'R',occupied);
    if(!left||!right) continue;

    const imbalance=Math.abs(leftCount-rightCount);
    const maxDistance=Math.max(left.distance,right.distance);
    const totalDistance=left.distance+right.distance;
    const score=maxDistance*10000+imbalance*1000+totalDistance*100;
    const candidate={
      codes:left.seats.concat(right.seats),
      distance:maxDistance,
      imbalance:imbalance,
      score:score,
      split:[leftCount,rightCount]
    };
    if(!best||candidate.score<best.score) best=candidate;
  }
  return best;
}

function findFirstAvailableSeatBlock_(settings,participants,partySize){
  const requested=Math.max(1,Number(partySize)||1);
  const meta=getSeatMetaV13_();
  const occupied=getSeatOccupantMapV13_(participants,{});

  if(requested<=16){
    const candidates=[];
    SMART_ROWS_V17.forEach(function(row,rowIndex){
      const plan=bestRowPlanV17_(meta,occupied,row,requested);
      if(!plan) return;
      const score=(plan.distance||0)*100000+(plan.imbalance||0)*10000+rowIndex;
      candidates.push({codes:plan.codes,score:score,row:row});
    });
    if(!candidates.length) return '';
    candidates.sort((a,b)=>a.score-b.score);
    return candidates[0].codes.join(',');
  }

  for(let start=0;start<SMART_ROWS_V17.length;start++){
    let remaining=requested;
    const out=[];
    const tempOccupied=Object.assign({},occupied);
    let ok=true;

    for(let r=start;r<SMART_ROWS_V17.length&&remaining>0;r++){
      const take=Math.min(16,remaining);
      const plan=bestRowPlanV17_(meta,tempOccupied,SMART_ROWS_V17[r],take);
      if(!plan){ok=false;break;}
      plan.codes.forEach(code=>tempOccupied[code]={id:'__TEMP__'});
      out.push.apply(out,plan.codes);
      remaining-=take;
    }
    if(ok&&remaining===0) return out.join(',');
  }
  return '';
}

function findWheelchairSeatBlockV13_(participants,partySize,exceptCode){
  const requested=Math.max(1,Number(partySize)||1);
  const meta=getSeatMetaV13_();
  const ignore={};if(exceptCode)ignore[exceptCode]=true;
  const occupied=getSeatOccupantMapV13_(participants,ignore);

  const anchors=meta.filter(s=>s.enabled&&s.wheelchairEligible&&!occupied[s.code]).sort((a,b)=>a.order-b.order);
  for(const anchor of anchors){
    const rowSeats=meta.filter(s=>s.row===anchor.row&&s.side===anchor.side).sort((a,b)=>a.number-b.number);
    const idx=rowSeats.findIndex(s=>s.code===anchor.code);
    if(idx<0) continue;

    // 휠체어 좌석을 포함하면서 같은 앞줄에 일행을 붙입니다.
    for(const dir of [1,-1]){
      const out=[anchor.code];
      let pos=idx;
      while(out.length<requested){
        pos+=dir;
        if(pos<0||pos>=rowSeats.length) break;
        const s=rowSeats[pos];
        if(!s.enabled||occupied[s.code]) break;
        out.push(s.code);
      }
      if(out.length===requested) return out.join(',');
    }
  }
  return '';
}

function buildManualSeatBlockV13_(targetSeat,partySize,participants,ignoredIds){
  const target=normalizeSeat_(targetSeat);
  const requested=Math.max(1,Number(partySize)||1);
  const meta=getSeatMetaV13_();
  const targetMeta=meta.find(s=>s.code===target);
  if(!targetMeta) throw new Error('좌석배치도에 없는 좌석입니다: '+target);

  const occupied=getSeatOccupantMapV13_(participants,ignoredIds||{});

  if(requested<=6){
    const sideSeats=meta.filter(s=>s.row===targetMeta.row&&s.side===targetMeta.side).sort((a,b)=>a.number-b.number);
    for(let start=0;start<=sideSeats.length-requested;start++){
      const win=sideSeats.slice(start,start+requested);
      if(!win.some(s=>s.code===target)) continue;
      if(win.every(s=>s.enabled&&!occupied[s.code])) return win.map(s=>s.code);
    }
    throw new Error('선택한 자리와 같은 쪽에 '+requested+'개의 연속 좌석을 확보할 수 없습니다.');
  }

  if(requested<=12){
    const plan=bestRowPlanV17_(meta,occupied,targetMeta.row,requested);
    if(plan) return plan.codes;
    throw new Error(targetMeta.row+'줄에 '+requested+'명을 함께 배정할 수 없습니다.');
  }

  throw new Error('13명 이상 단체의 수동 이동은 좌석번호 직접 수정 기능을 사용해 주세요.');
}

function getSettings_(){
  const sheet=getSpreadsheet_().getSheetByName(SHEET_NAMES.SETTINGS);

  // v8.4: 온라인 사전접수는 450명까지 받되,
  // 일반 좌석은 신청 시점에 배정하지 않고 현장 입장 순서대로 배정.
  try{
    const props=PropertiesService.getScriptProperties();
    if(props.getProperty('NYJ20_REG450_MIGRATED')!=='1'&&sheet){
      forceSettingV17_(sheet,'registrationCapacity',450,'온라인 사전접수 정원 · 450명');
      forceSettingV17_(sheet,'autoAssignSeat',false,'일반 좌석은 현장 입장순 배정');
      props.setProperty('NYJ20_REG450_MIGRATED','1');
    }
  }catch(_){}

  const settings=Object.assign(
    {},
    DEFAULT_SETTINGS,
    RUNWAY_EXTRA_SETTINGS_V13,
    {registrationCapacity:450,autoAssignSeat:false}
  );

  if(sheet&&sheet.getLastRow()>=2){
    sheet.getRange(2,1,sheet.getLastRow()-1,2).getValues().forEach(function(r){
      const key=String(r[0]||'').trim();
      if(key) settings[key]=r[1];
    });
  }

  settings.registrationCapacity=Math.min(
    450,
    Math.max(1,Number(settings.registrationCapacity)||450)
  );
  settings.autoRefreshSeconds=Math.max(5,Number(settings.autoRefreshSeconds)||15);
  settings.ticketRefreshSeconds=Math.max(5,Number(settings.ticketRefreshSeconds)||15);
  settings.registrationOpen=toBoolean_(settings.registrationOpen);

  // 신청 시 일반 좌석 자동배정은 강제로 사용하지 않습니다.
  settings.autoAssignSeat=false;

  settings.introVideoEnabled=toBoolean_(settings.introVideoEnabled);
  settings.introVideoUrl=cleanText_(settings.introVideoUrl||'assets/intro.mp4',500);
  return settings;
}

function saveSettings_(payload,station){
  const sheet=getSpreadsheet_().getSheetByName(SHEET_NAMES.SETTINGS);
  const current=getSettings_(),next=Object.assign({},current);
  const allowed=[
    'eventName','eventDate','eventVenue','eventOrganizer','autoRefreshSeconds',
    'publicSubtitle','publicGreeting','publicProgramTitle','publicProgramIntro','publicProgramItems',
    'privacyRetentionText','registrationOpen',
    'registrationCapacity','autoAssignSeat','introVideoEnabled','introVideoUrl','ticketRefreshSeconds'
  ];
  allowed.forEach(k=>{if(Object.prototype.hasOwnProperty.call(payload,k))next[k]=payload[k];});

  next.registrationCapacity=Math.min(450,Math.max(1,Number(next.registrationCapacity)||450));
  next.autoRefreshSeconds=Math.max(5,Number(next.autoRefreshSeconds)||15);
  next.ticketRefreshSeconds=Math.max(5,Number(next.ticketRefreshSeconds)||15);
  next.registrationOpen=toBoolean_(next.registrationOpen);
  next.autoAssignSeat=false;
  next.introVideoEnabled=toBoolean_(next.introVideoEnabled);
  next.introVideoUrl=cleanText_(next.introVideoUrl||'assets/intro.mp4',500);
  next.publicProgramTitle=cleanText_(next.publicProgramTitle||'행사 안내',120);
  next.publicProgramIntro=cleanText_(next.publicProgramIntro||'',1000);
  next.publicProgramItems=String(next.publicProgramItems||'').slice(0,12000);

  const desc=Object.assign({},SETTING_DESCRIPTIONS,{
    introVideoEnabled:'공개 초대장 인트로 영상 사용',
    introVideoUrl:'인트로 영상 URL 또는 상대경로',
    ticketRefreshSeconds:'개인 티켓 좌석 갱신 간격(초)'
  });
  const existing={};
  if(sheet.getLastRow()>=2){
    sheet.getRange(2,1,sheet.getLastRow()-1,1).getDisplayValues()
      .forEach((r,i)=>existing[String(r[0]||'').trim()]=i+2);
  }
  allowed.forEach(function(k){
    if(existing[k]) sheet.getRange(existing[k],2,1,2).setValues([[next[k],desc[k]||'']]);
    else sheet.appendRow([k,next[k],desc[k]||'']);
  });
  SpreadsheetApp.flush();
  clearPublicBootstrapCacheV352_();
  appendLog_('행사 설정 수정',{},station,'300석 스마트 자동배정 설정');
  return getSettings_();
}


const WHEELCHAIR_CAPACITY_V22 = 24;
function writeParticipantRow_(sheet,row){const target=findFirstEmptyParticipantRow_(sheet),out=row.slice(0,PARTICIPANT_COLUMN_COUNT_V13);while(out.length<PARTICIPANT_COLUMN_COUNT_V13)out.push('');sheet.getRange(target,1,1,PARTICIPANT_COLUMN_COUNT_V13).setValues([out]);sheet.getRange(target,8).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());sheet.getRange(target,13).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());sheet.getRange(target,21,1,2).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());sheet.getRange(target,9,1,4).setNumberFormat('yyyy-mm-dd hh:mm:ss');sheet.getRange(target,23).setNumberFormat('yyyy-mm-dd hh:mm:ss');sheet.getRange(target,25).setNumberFormat('0');return target}
function getTotalWheelchairPeopleV22_(participants,exceptCode){return participants.reduce((total,p)=>total+((exceptCode&&p.id===exceptCode)?0:Math.max(0,Number(p.wheelchairCount)||0)),0)}
function assertWheelchairCapacityV22_(participants,wheelchairCount,exceptCode){const requested=Math.max(0,Number(wheelchairCount)||0),current=getTotalWheelchairPeopleV22_(participants,exceptCode||'');if(current+requested>24)throw new Error('휠체어 이용인원 접수 가능 수를 초과합니다. 현재 '+current+'명 / 추가 '+requested+'명 / 최대 24명입니다.')}
function occupiedSeatMapV22_(participants,exceptCode){const occupied={};participants.forEach(p=>{if(exceptCode&&p.id===exceptCode)return;parseSeatList_(p.seat).forEach(c=>occupied[normalizeSeat_(c)]=p)});return occupied}
function buildMixedWheelchairRowPlanV22_(meta,occupied,row,total,wheelchairCount){const wc=Math.max(1,Math.min(15,Math.floor(Number(wheelchairCount)||1))),totalPeople=Math.max(wc,Math.min(30,Math.floor(Number(total)||wc))),companions=totalPeople-wc,byCode={};meta.forEach(s=>byCode[s.code]=s);const wheel=[];for(let n=16-wc;n<=15;n++)wheel.push(row+'R-'+String(n).padStart(2,'0'));const rc=Math.min(companions,15-wc),rightComp=[];for(let n=16-wc-rc;n<=15-wc;n++)if(n>=1)rightComp.push(row+'R-'+String(n).padStart(2,'0'));const lc=companions-rc,leftComp=[];for(let n=16-lc;n<=15;n++)if(n>=1)leftComp.push(row+'L-'+String(n).padStart(2,'0'));const generalOk=code=>{const s=byCode[code];if(!s||!s.enabled||occupied[code])return false;const cat=String(s.category||'').toLowerCase();return !cat.includes('vip')&&!cat.includes('휠체어')&&s.autoAssignable===true};const wheelOk=code=>{const s=byCode[code];if(!s||!s.enabled||occupied[code])return false;return !String(s.category||'').toLowerCase().includes('vip')};if(!wheel.every(wheelOk)||!rightComp.every(generalOk)||!leftComp.every(generalOk))return null;return{row,wheel,companions:rightComp.concat(leftComp),seats:leftComp.concat(rightComp).concat(wheel)}}
function findMixedWheelchairSeatBlockV22_(participants,partySize,wheelchairCount,exceptCode,preferredRow){const total=Math.max(1,Math.floor(Number(partySize)||1)),wc=Math.max(1,Math.min(total,Math.floor(Number(wheelchairCount)||1))),meta=getSeatMetaV13_(),occupied=occupiedSeatMapV22_(participants,exceptCode||''),rows='ABCDEFGHIJKLMNO'.split('');if(preferredRow&&rows.includes(String(preferredRow).toUpperCase())){const pr=String(preferredRow).toUpperCase();rows.splice(rows.indexOf(pr),1);rows.unshift(pr)}if(total<=30){for(const row of rows){const plan=buildMixedWheelchairRowPlanV22_(meta,occupied,row,total,wc);if(plan)return plan}}let firstPlan=null;for(const row of rows){for(let together=Math.min(total,30);together>=wc;together--){const plan=buildMixedWheelchairRowPlanV22_(meta,occupied,row,together,wc);if(plan){firstPlan=plan;break}}if(firstPlan)break}if(!firstPlan)return null;const remaining=total-firstPlan.seats.length;if(remaining<=0)return firstPlan;const pseudo=participants.slice();pseudo.push({id:'__WHEEL_TEMP__',seat:firstPlan.seats.join(','),partySize:firstPlan.seats.length});const rest=findFirstAvailableSeatBlock_(getSettings_(),pseudo,remaining);if(!rest)return null;return{row:firstPlan.row,wheel:firstPlan.wheel,companions:firstPlan.companions.concat(parseSeatList_(rest)),seats:firstPlan.seats.concat(parseSeatList_(rest))}}
function wheelchairSeatCodesForParticipantV22_(p){const count=Math.max(0,Number(p.wheelchairCount)||0);if(!count)return[];const seats=parseSeatList_(p.seat).map(code=>{const m=normalizeSeat_(code).match(/^([A-O])R-(\d{2})$/);return m?{code:normalizeSeat_(code),row:m[1],n:Number(m[2])}:null}).filter(Boolean),out=[];for(const row of 'ABCDEFGHIJKLMNOPQRSTUVWXY'.split('')){const rs=seats.filter(s=>s.row===row).sort((a,b)=>b.n-a.n);if(!rs.some(s=>s.n===15))continue;for(const s of rs){if(out.length>=count)break;out.push(s.code)}if(out.length>=count)break}return out.slice(0,count)}
/* ======================================================================
 * v2.4 — 1인 1신청 · 1인 1QR + 좌석번호 행운추첨
 * ====================================================================== */

const DRAW_HEADERS_V24 = Object.freeze([
  '좌석번호','상품명','사용여부','수령여부','수령시각',
  '당첨자QR','당첨자명','등록시각','수정시각','비고'
]);

function ensureParticipantExtraColumnsV13_(sheet){
  if(sheet.getMaxColumns()<PARTICIPANT_COLUMN_COUNT_V13){
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      PARTICIPANT_COLUMN_COUNT_V13-sheet.getMaxColumns()
    );
  }

  sheet.getRange(1,21,1,10).setValues([PARTICIPANT_EXTRA_HEADERS_V13]);
  sheet.getRange(1,21,1,10)
    .setFontWeight('bold')
    .setBackground('#172554')
    .setFontColor('#fff');

  [21,22,26,28].forEach(function(col){
    sheet.getRange(2,col,1999,1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireCheckbox().build()
    );
  });

  sheet.getRange('W2:W2000').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.getRange('Y2:Y2000').setNumberFormat('0');

  sheet.setColumnWidth(21,110);
  sheet.setColumnWidth(22,110);
  sheet.setColumnWidth(23,150);
  sheet.setColumnWidth(24,230);
  sheet.setColumnWidth(25,150);
  sheet.setColumnWidth(26,110);
  sheet.setColumnWidth(27,220);
  sheet.setColumnWidth(28,140);
}

function ensureDrawSheetV24_(){
  const ss=getSpreadsheet_();
  let sheet=ss.getSheetByName(SHEET_NAMES.DRAW);
  if(!sheet)sheet=ss.insertSheet(SHEET_NAMES.DRAW);

  if(sheet.getMaxColumns()<DRAW_HEADERS_V24.length){
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      DRAW_HEADERS_V24.length-sheet.getMaxColumns()
    );
  }

  sheet.getRange(1,1,1,DRAW_HEADERS_V24.length).setValues([DRAW_HEADERS_V24]);
  sheet.getRange(1,1,1,DRAW_HEADERS_V24.length)
    .setFontWeight('bold')
    .setBackground('#5b3a00')
    .setFontColor('#fff');

  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1,110);
  sheet.setColumnWidth(2,220);
  sheet.setColumnWidth(5,155);
  sheet.setColumnWidth(6,190);
  sheet.setColumnWidth(7,120);
  sheet.setColumnWidth(10,220);

  sheet.getRange('C2:D2000').setDataValidation(
    SpreadsheetApp.newDataValidation().requireCheckbox().build()
  );
  sheet.getRange('E2:E2000').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.getRange('H2:I2000').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  return sheet;
}
function normalizeParticipantInput_(raw){
  const disabledPerson=toBoolean_(raw.disabledPerson);
  const wheelchairUser=toBoolean_(
    raw.wheelchairUser||raw.wheelchairRequired
  );
  const usesCenter=disabledPerson&&toBoolean_(raw.usesCenter);

  return{
    name:cleanText_(raw.name,40),
    phone:cleanText_(raw.phone,30),
    seat:formatSeatList_(raw.seat),
    group:'개인신청',
    note:cleanText_(raw.note,500),
    organization:cleanText_(raw.organization,80),
    partySize:1,
    wheelchairCount:wheelchairUser?1:0,
    wheelchairRequired:wheelchairUser,
    wheelchairUser,
    usesCenter,
    programName:'',
    disabledPerson
  };
}

function rowToParticipant_(row,rowNumber,displayRow){
  const d=displayRow||row.map(function(v){return v==null?'':String(v);});
  const active=row[12]===''?true:toBoolean_(row[12]);
  const legacyPartySize=Math.max(1,Number(row[14])||1);
  const privacyRecordVersion=String(d[17]||row[17]||'').trim();

  const wheelchairUser=toBoolean_(row[20]) || Math.max(0,Number(row[24])||0)>0;
  const usesCenter=toBoolean_(row[25]);
  const programName=String(d[26]||row[26]||'').trim();
  const disabledPerson=toBoolean_(row[27]);

  return{
    rowNumber,
    number:Number(row[0])||0,
    id:String(d[1]||row[1]||'').trim().toUpperCase(),
    name:String(d[2]||row[2]||'').trim(),
    phone:String(d[3]||row[3]||'').trim(),
    seat:formatSeatList_(d[4]||row[4]),
    group:String(d[5]||row[5]||'').trim()||'개인신청',
    note:String(d[6]||row[6]||'').trim(),
    arrived:toBoolean_(row[7]),
    checkInAt:dateToIso_(row[8]),
    ticketPrintedAt:dateToIso_(row[9]),
    createdAt:dateToIso_(row[10]),
    updatedAt:dateToIso_(row[11]),
    active,
    organization:String(d[13]||row[13]||'').trim(),
    partySize:legacyPartySize,
    legacyGroup:legacyPartySize>1,
    privacyConsentConfirmed:
      privacyRecordVersion===PRIVACY_CONSENT_VERSION&&toBoolean_(row[15]),
    privacyConsentConfirmedAt:dateToIso_(row[16]),
    privacyConsentVersion:privacyRecordVersion,
    optionalConsent:toBoolean_(row[18]),
    optionalConsentAt:dateToIso_(row[19]),
    wheelchairCount:wheelchairUser?1:0,
    wheelchairRequired:wheelchairUser,
    wheelchairUser,
    sensitiveConsent:toBoolean_(row[21]),
    sensitiveConsentAt:dateToIso_(row[22]),
    sensitiveConsentVersion:String(d[23]||row[23]||'').trim(),
    usesCenter,
    programName,
    disabledPerson,
    companionGroup:String(d[28]||row[28]||'').trim(),
    participationStatus:String(d[29]||row[29]||'참여').trim()||'참여'
  };
}

function publicParticipant_(p){
  return{
    number:p.number,
    id:p.id,
    name:p.name,
    group:p.group,
    organization:p.organization||'',
    wheelchairUser:Boolean(p.wheelchairUser),
    wheelchairRequired:Boolean(p.wheelchairUser),
    wheelchairCount:p.wheelchairUser?1:0,
    usesCenter:Boolean(p.usesCenter),
    programName:p.programName||'',
    disabledPerson:Boolean(p.disabledPerson),
    companionGroup:String(p.companionGroup||''),
    participationStatus:String(p.participationStatus||'참여'),
    note:p.note||'',
    createdAt:p.createdAt,
    updatedAt:p.updatedAt
  };
}

function registrationCounts_(settings,participants){
  const capacity=Math.min(450,Math.max(1,Number(settings.registrationCapacity)||450));
  const registeredCount=participants.filter(p=>!isParticipationExcluded_(p)).length;
  const wheelchairCount=participants.filter(function(p){
    return Boolean(p.wheelchairUser);
  }).length;

  return{
    registeredCount,
    remainingCount:Math.max(0,capacity-registeredCount),
    wheelchairCount,
    wheelchairCapacity:DISABLED_ACCESSIBLE_CODES_V31.length,
    wheelchairRemaining:Math.max(
      0,
      DISABLED_ACCESSIBLE_CODES_V31.length-wheelchairCount
    )
  };
}
function createParticipant_(payload,station){
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    const input=normalizeParticipantInput_(payload);
    if(!input.name)throw new Error('이름을 입력하세요.');

    const digits=normalizePhoneDigits_(input.phone);
    input.phone=digits?formatPhone_(digits):'';

    const sheet=getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
    const participants=readParticipants_();
    const allParticipants=readAllParticipants_();
    const settings=getSettings_();
    const counts=registrationCounts_(settings,participants);

    if(counts.remainingCount<1)throw new Error('온라인 사전접수 정원이 가득 찼습니다.');

    // 관리자 직접 지정 좌석이 있을 때만 좌석 저장.
    // 입력하지 않은 일반 참가자는 미배정 상태로 접수합니다.
    let seat=normalizeSeat_(input.seat||'');
    if(seat)assertSeatAvailable_(participants,seat,'',1);

    const number=nextParticipantNumber_(allParticipants);
    const qr=createUniqueCode_(number,new Set(allParticipants.map(function(p){return p.id;})));
    const now=new Date();

    const row=[
      number,qr,input.name,input.phone,seat,'개인신청',input.note,
      false,'','',now,now,true,
      input.organization,1,
      false,'','관리자 직접 등록',
      false,'',
      input.wheelchairUser,
      false,'','관리자 직접 등록-민감정보 동의 별도 확인 필요',
      input.wheelchairUser?1:0,
      input.usesCenter,
      '',
      input.disabledPerson,
      '',
      '참여'
    ];

    const written=writeParticipantRow_(sheet,row);
    const p=rowToParticipant_(row,written);
    appendLog_('개인 참가자 등록',p,station,'좌석 미배정 접수');
    return p;
  }finally{
    lock.releaseLock();
  }
}
/* ------------------------ 마블룰렛 행운권 추첨 v2.9 ------------------------ */

function ensureRoulettePrizeSheetV29_(){
  const ss=getSpreadsheet_();
  let sheet=ss.getSheetByName(SHEET_NAMES.ROULETTE_PRIZES);
  if(!sheet)sheet=ss.insertSheet(SHEET_NAMES.ROULETTE_PRIZES);

  if(sheet.getMaxColumns()<ROULETTE_PRIZE_HEADERS_V29.length){
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      ROULETTE_PRIZE_HEADERS_V29.length-sheet.getMaxColumns()
    );
  }

  sheet.getRange(1,1,1,ROULETTE_PRIZE_HEADERS_V29.length)
    .setValues([ROULETTE_PRIZE_HEADERS_V29])
    .setFontWeight('bold')
    .setBackground('#0f5132')
    .setFontColor('#fff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1,90);
  sheet.setColumnWidth(2,230);
  sheet.setColumnWidth(3,90);
  sheet.setColumnWidth(4,90);
  sheet.setColumnWidth(5,155);
  sheet.setColumnWidth(6,240);
  sheet.setColumnWidth(7,90);
  sheet.setColumnWidth(8,120);
  try{sheet.hideColumns(8,1);}catch(_){ }
  sheet.getRange('D2:D11').setDataValidation(
    SpreadsheetApp.newDataValidation().requireCheckbox().build()
  );
  sheet.getRange('E2:E11').setNumberFormat('yyyy-mm-dd hh:mm:ss');

  const existing={};
  if(sheet.getLastRow()>=2){
    sheet.getRange(2,1,sheet.getLastRow()-1,1).getValues().forEach(function(row,i){
      const n=Number(row[0]);
      if(n>=1&&n<=10)existing[n]=i+2;
    });
  }
  for(let n=1;n<=10;n++){
    if(existing[n])continue;
    const row=Math.max(2,sheet.getLastRow()+1);
    sheet.getRange(row,1,1,8).setValues([[
      n,'',0,false,new Date(),'','', ''
    ]]);
  }
  return sheet;
}

function ensureRouletteHistorySheetV29_(){
  const ss=getSpreadsheet_();
  let sheet=ss.getSheetByName(SHEET_NAMES.ROULETTE_HISTORY);
  if(!sheet)sheet=ss.insertSheet(SHEET_NAMES.ROULETTE_HISTORY);
  if(sheet.getMaxColumns()<ROULETTE_HISTORY_HEADERS_V29.length){
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      ROULETTE_HISTORY_HEADERS_V29.length-sheet.getMaxColumns()
    );
  }
  sheet.getRange(1,1,1,ROULETTE_HISTORY_HEADERS_V29.length)
    .setValues([ROULETTE_HISTORY_HEADERS_V29])
    .setFontWeight('bold')
    .setBackground('#4c1d95')
    .setFontColor('#fff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1,210);
  sheet.setColumnWidth(2,155);
  sheet.setColumnWidth(4,220);
  sheet.setColumnWidth(8,200);
  sheet.setColumnWidth(9,120);
  sheet.setColumnWidth(10,100);
  sheet.setColumnWidth(15,250);
  sheet.getRange('L2:L3000').setDataValidation(
    SpreadsheetApp.newDataValidation().requireCheckbox().build()
  );
  sheet.getRange('B2:B3000').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.getRange('M2:M3000').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  return sheet;
}

function prepareRouletteSheetsV29(){
  const p=ensureRoulettePrizeSheetV29_();
  const h=ensureRouletteHistorySheetV29_();
  SpreadsheetApp.flush();
  return{ok:true,prizeSheet:p.getName(),historySheet:h.getName()};
}

function readRouletteHistoryV29_(){
  const sheet=ensureRouletteHistorySheetV29_();
  if(sheet.getLastRow()<2)return[];
  return sheet.getRange(2,1,sheet.getLastRow()-1,ROULETTE_HISTORY_HEADERS_V29.length)
    .getValues().map(function(r,i){
      return{
        rowNumber:i+2,
        drawId:String(r[0]||'').trim(),
        drawnAt:dateToIso_(r[1]),
        prizeNo:Number(r[2])||0,
        prizeName:cleanText_(r[3],160),
        winnerMode:String(r[4]||'first').trim(),
        winnerCount:Number(r[5])||0,
        poolCount:Number(r[6])||0,
        winnerCode:String(r[7]||'').trim(),
        winnerName:String(r[8]||'').trim(),
        seat:normalizeSeat_(r[9]),
        rank:Number(r[10])||0,
        active:r[11]===''?true:toBoolean_(r[11]),
        cancelledAt:dateToIso_(r[12]),
        station:String(r[13]||'').trim(),
        note:cleanText_(r[14],240)
      };
    }).filter(function(x){return x.drawId&&x.prizeNo;});
}

function rouletteUsedCountsV29_(){
  const counts={};
  readRouletteHistoryV29_().forEach(function(row){
    if(!row.active)return;
    counts[row.prizeNo]=(counts[row.prizeNo]||0)+1;
  });
  return counts;
}

function readRoulettePrizesV29_(){
  const sheet=ensureRoulettePrizeSheetV29_();
  const used=rouletteUsedCountsV29_();
  const rows=sheet.getRange(2,1,Math.max(10,sheet.getLastRow()-1),7).getValues();
  const byNo={};
  rows.forEach(function(r,i){
    const n=Number(r[0]);
    if(n<1||n>10)return;
    const total=Math.max(0,Math.floor(Number(r[2])||0));
    const drawn=used[n]||0;
    byNo[n]={
      rowNumber:i+2,
      prizeNo:n,
      prizeName:cleanText_(r[1],160),
      quantity:total,
      active:toBoolean_(r[3]),
      updatedAt:dateToIso_(r[4]),
      note:cleanText_(r[5],200),
      hasImage:toBoolean_(r[6]),
      drawnCount:drawn,
      remaining:Math.max(0,total-drawn)
    };
  });
  const out=[];
  for(let n=1;n<=10;n++){
    out.push(byNo[n]||{
      rowNumber:n+1,prizeNo:n,prizeName:'',quantity:0,active:false,
      updatedAt:null,note:'',hasImage:false,drawnCount:used[n]||0,remaining:0
    });
  }
  return out;
}

function getRoulettePrizeV29_(prizeNo){
  const n=Math.floor(Number(prizeNo)||0);
  if(n<1||n>10)throw new Error('상품번호는 1번부터 10번까지 선택하세요.');
  const prize=readRoulettePrizesV29_().find(function(x){return x.prizeNo===n;});
  if(!prize)throw new Error('상품 정보를 찾지 못했습니다.');
  return prize;
}

function saveRoulettePrizeV29_(payload,station){
  const n=Math.floor(Number(payload.prizeNo)||0);
  if(n<1||n>10)throw new Error('상품번호는 1번부터 10번까지 선택하세요.');
  const current=getRoulettePrizeV29_(n);
  const name=cleanText_(payload.prizeName,160);
  const quantity=Math.max(0,Math.floor(Number(payload.quantity)||0));
  const active=toBoolean_(payload.active);
  const note=cleanText_(payload.note,200);
  const action=String(payload.imageAction||'keep').trim().toLowerCase();
  const imageData=String(payload.imageDataUrl||'').trim();

  if(quantity<current.drawnCount){
    throw new Error(
      '이미 '+current.drawnCount+'개가 당첨 처리되어 총수량을 그보다 작게 줄일 수 없습니다.'
    );
  }
  if((active||quantity>0)&&!name)throw new Error('상품명을 입력하세요.');
  if(action==='replace'){
    if(!/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(imageData)){
      throw new Error('상품사진 형식이 올바르지 않습니다.');
    }
    if(imageData.length>ROULETTE_IMAGE_MAX_CHARS_V29){
      throw new Error('상품사진 용량이 너무 큽니다. 더 작은 사진을 사용해 주세요.');
    }
  }

  const sheet=ensureRoulettePrizeSheetV29_();
  const row=current.rowNumber||n+1;
  let hasImage=current.hasImage;
  if(action==='replace')hasImage=true;
  if(action==='remove')hasImage=false;

  sheet.getRange(row,1,1,7).setValues([[
    n,name,quantity,active,new Date(),note,hasImage
  ]]);
  if(action==='replace')sheet.getRange(row,8).setValue(imageData);
  if(action==='remove')sheet.getRange(row,8).setValue('');
  SpreadsheetApp.flush();
  appendLog_('룰렛 상품 설정',{},station,n+'번 / '+(name||'미사용')+' / '+quantity+'개');
  return getRoulettePrizeV29_(n);
}

function getRoulettePrizeImageV29_(payload){
  const n=Math.floor(Number(payload.prizeNo)||0);
  const prize=getRoulettePrizeV29_(n);
  if(!prize.hasImage)return{prizeNo:n,imageDataUrl:''};
  const sheet=ensureRoulettePrizeSheetV29_();
  const data=String(sheet.getRange(prize.rowNumber,8).getValue()||'');
  return{prizeNo:n,imageDataUrl:data};
}

function groupRouletteHistoryV29_(limit){
  const max=Math.max(1,Math.min(100,Number(limit)||20));
  const rows=readRouletteHistoryV29_();
  const groups={};
  rows.forEach(function(row){
    if(!groups[row.drawId]){
      groups[row.drawId]={
        drawId:row.drawId,drawnAt:row.drawnAt,prizeNo:row.prizeNo,
        prizeName:row.prizeName,winnerMode:row.winnerMode,
        winnerCount:row.winnerCount,poolCount:row.poolCount,
        active:row.active,cancelledAt:row.cancelledAt,winners:[]
      };
    }
    if(row.active!==groups[row.drawId].active)groups[row.drawId].active=false;
    groups[row.drawId].winners.push({
      code:row.winnerCode,name:row.winnerName,seat:row.seat,rank:row.rank
    });
  });
  return Object.keys(groups).map(function(k){
    groups[k].winners.sort(function(a,b){return a.rank-b.rank;});
    return groups[k];
  }).sort(function(a,b){
    return String(b.drawnAt||'').localeCompare(String(a.drawnAt||''));
  }).slice(0,max);
}

function getRouletteVisibleParticipantsV31_(){
  // 무대 연출용 공: 현장 도착 처리된 참가자는 모두 표시합니다.
  // 실제 당첨 가능 여부와는 분리되어 있습니다.
  return readParticipants_().filter(function(p){
    if(!p.active||!p.arrived)return false;
    const seat=parseSeatList_(p.seat)[0]||'';
    return Boolean(seat);
  }).map(function(p){
    return{
      id:p.id,
      name:p.name,
      seat:parseSeatList_(p.seat)[0]||'',
      organization:p.organization||''
    };
  });
}

function getRouletteEligibleParticipantsV29_(){
  // 본추첨 실제 당첨 대상:
  // 1) 현장 도착
  // 2) 좌석 있음
  // 3) 현재 사용중인 참가자
  // 4) 복지관 이용여부(usesCenter) = true
  // 5) 이전 행운추첨 당첨자가 아님
  const blocked={};
  readDrawPrizesV24_().forEach(function(prize){
    if(prize.active!==false&&prize.seat)blocked[prize.seat]=true;
  });

  return readParticipants_().filter(function(p){
    if(!p.active||!p.arrived||p.usesCenter!==true)return false;
    const seat=parseSeatList_(p.seat)[0]||'';
    return Boolean(seat&&!blocked[seat]);
  }).map(function(p){
    return{
      id:p.id,
      name:p.name,
      seat:parseSeatList_(p.seat)[0]||'',
      organization:p.organization||''
    };
  });
}

function rouletteBootstrapV29_(){
  const visible=getRouletteVisibleParticipantsV31_();
  const eligible=getRouletteEligibleParticipantsV29_();

  return{
    prizes:readRoulettePrizesV29_(),

    // 화면/당첨자 이름 확인에는 모든 현장 도착 참가자를 사용합니다.
    participants:visible,

    // 화면 상단의 전체 도착 인원
    arrivedCount:visible.length,

    // 실제 당첨 가능한 인원 수
    eligibleCount:eligible.length,

    // 이전 당첨자 + 복지관 이용 체크가 없는 인원 등을 합친 비당첨 대상 수
    excludedWinnerCount:Math.max(0,visible.length-eligible.length),

    history:groupRouletteHistoryV29_(20),
    serverTime:new Date().toISOString(),
    version:APP_VERSION
  };
}

function shuffleRouletteParticipantsV29_(participants){
  return participants.map(function(p){
    return{key:Utilities.getUuid()+Utilities.getUuid(),p:p};
  }).sort(function(a,b){return a.key.localeCompare(b.key);})
    .map(function(x,i){
      return{id:x.p.id,seat:x.p.seat,rank:i+1};
    });
}

function buildRouletteVisualRankingV31_(visible,eligible,winnerCount,mode){
  const eligibleShuffled=shuffleRouletteParticipantsV29_(eligible);
  const winnerRows=eligibleShuffled.slice(0,winnerCount);
  const winnerIds={};
  winnerRows.forEach(function(x){winnerIds[x.id]=true;});

  const visualOthers=visible.filter(function(p){
    return !winnerIds[p.id];
  });

  const othersShuffled=shuffleRouletteParticipantsV29_(visualOthers);

  // 화면에는 전체 현장 참가자의 공이 보입니다.
  // first 모드는 실제 당첨자를 앞 순위에,
  // last 모드는 실제 당첨자를 마지막 순위에 배치합니다.
  let combined=mode==='last'
    ?othersShuffled.concat(winnerRows)
    :winnerRows.concat(othersShuffled);

  return combined.map(function(row,index){
    return{id:row.id,seat:row.seat,rank:index+1};
  });
}

function prepareRouletteRoundV29_(payload,station){
  const prize=getRoulettePrizeV29_(payload.prizeNo);
  if(!prize.active||!prize.prizeName)throw new Error('사용 가능한 상품을 선택하세요.');
  if(prize.remaining<1)throw new Error('선택한 상품의 남은 수량이 없습니다.');

  const mode=String(payload.winnerMode||'first').toLowerCase()==='last'?'last':'first';
  const winnerCount=Math.max(1,Math.floor(Number(payload.winnerCount)||1));
  if(winnerCount>prize.remaining){
    throw new Error('이번 당첨 인원이 상품 남은 수량보다 많습니다.');
  }

  const eligible=getRouletteEligibleParticipantsV29_();
  if(!eligible.length){
    throw new Error('현재 추첨 가능한 참가자가 없습니다.');
  }
  if(winnerCount>eligible.length){
    throw new Error('당첨 인원이 현재 추첨 가능한 인원보다 많습니다.');
  }

  const visible=getRouletteVisibleParticipantsV31_();
  if(!visible.length){
    throw new Error('현재 화면에 표시할 도착 참가자가 없습니다.');
  }

  // 전체 도착 참가자는 공으로 표시하되,
  // 당첨 위치에는 복지관 이용 체크가 된 참가자만 배치합니다.
  const ranking=buildRouletteVisualRankingV31_(
    visible,eligible,winnerCount,mode
  );

  const eligibleIdMap={};
  eligible.forEach(function(p){eligibleIdMap[p.id]=true;});

  const token=(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,'');
  const drawId='MR-'+Utilities.formatDate(new Date(),'Asia/Seoul','yyMMdd-HHmmss')+'-'+token.slice(0,8).toUpperCase();

  const plan={
    token:token,
    drawId:drawId,
    createdAt:Date.now(),
    prizeNo:prize.prizeNo,
    prizeName:prize.prizeName,
    winnerMode:mode,
    winnerCount:winnerCount,

    // 기록상 poolCount는 실제 당첨 가능 인원
    poolCount:eligible.length,

    // 무대에 보이는 공 개수
    visualCount:ranking.length,

    ranking:ranking,

    // commit 단계에서 다시 확인할 실제 당첨 대상 ID
    eligibleIds:Object.keys(eligibleIdMap),

    station:station
  };

  const raw=JSON.stringify(plan);
  if(raw.length>90000)throw new Error('추첨 대상 인원이 너무 많아 추첨을 준비하지 못했습니다.');
  CacheService.getScriptCache().put(ROULETTE_ROUND_CACHE_PREFIX_V29+token,raw,21600);

  appendLog_('마블룰렛 추첨 준비',{},station,
    prize.prizeNo+'번 '+prize.prizeName+' / '+winnerCount+'명 / '+
    (mode==='last'?'꼴찌':'1등')+
    ' / 화면공 '+ranking.length+'개');

  return{
    roundToken:token,
    drawId:drawId,
    prize:{
      prizeNo:prize.prizeNo,
      prizeName:prize.prizeName,
      remaining:prize.remaining,
      hasImage:prize.hasImage
    },
    winnerMode:mode,
    winnerCount:winnerCount,

    // 관리자 진행 판단용 실제 당첨 가능 인원
    poolCount:eligible.length,

    // 기존 roulette.js는 ranking 전체를 Canvas 공으로 그립니다.
    // 따라서 여기에는 모든 현장 도착 참가자를 보냅니다.
    visualCount:ranking.length,
    ranking:ranking
  };
}

function getRoulettePlanV29_(token){
  const key=ROULETTE_ROUND_CACHE_PREFIX_V29+String(token||'').trim();
  const raw=CacheService.getScriptCache().get(key);
  if(!raw)throw new Error('추첨 준비 정보가 만료되었습니다. 참가자 새로고침 후 다시 추첨해 주세요.');
  let plan;
  try{plan=JSON.parse(raw);}catch(_){plan=null;}
  if(!plan||!Array.isArray(plan.ranking))throw new Error('추첨 준비 정보를 확인할 수 없습니다.');
  return plan;
}

function commitRouletteRoundV29_(payload,station){
  const token=String(payload.roundToken||'').trim();
  if(!token)throw new Error('추첨번호가 없습니다.');
  const plan=getRoulettePlanV29_(token);
  const lock=LockService.getScriptLock();
  lock.waitLock(30000);

  try{
    const already=groupRouletteHistoryV29_(100).find(function(x){
      return x.drawId===plan.drawId&&x.active;
    });
    if(already)return{already:true,draw:already,bootstrap:rouletteBootstrapV29_()};

    const prize=getRoulettePrizeV29_(plan.prizeNo);
    if(!prize.active||prize.prizeName!==plan.prizeName){
      throw new Error('추첨 중 상품 설정이 변경되었습니다. 다시 추첨해 주세요.');
    }
    if(prize.remaining<plan.winnerCount){
      throw new Error('추첨 중 상품 남은 수량이 변경되었습니다. 다시 확인해 주세요.');
    }

    const activeById={};
    readParticipants_().forEach(function(p){
      activeById[p.id]=p;
    });

    const eligibleIdMap={};
    (Array.isArray(plan.eligibleIds)?plan.eligibleIds:[]).forEach(function(id){
      eligibleIdMap[String(id||'')]=true;
    });

    const winnerRows=plan.winnerMode==='last'
      ?plan.ranking.slice(-plan.winnerCount)
      :plan.ranking.slice(0,plan.winnerCount);

    const currentDrawBySeat={};
    readDrawPrizesV24_().forEach(function(x){
      currentDrawBySeat[x.seat]=x;
    });

    const winners=winnerRows.map(function(row){
      const p=activeById[row.id];

      if(!p||!p.active){
        throw new Error('추첨 중 참가자 상태가 변경되었습니다. 다시 추첨해 주세요.');
      }
      if(!p.arrived){
        throw new Error(p.name+' 님의 도착 상태가 변경되었습니다. 다시 추첨해 주세요.');
      }

      // 핵심 서버 검증:
      // 화면상 순위와 무관하게 복지관 이용 체크값이 없는 사람은 확정 불가.
      if(p.usesCenter!==true||!eligibleIdMap[p.id]){
        throw new Error('추첨 대상 정보가 변경되었습니다. 참가자 정보를 새로고침 후 다시 추첨해 주세요.');
      }

      const currentSeat=parseSeatList_(p.seat)[0]||'';
      if(!currentSeat||currentSeat!==row.seat){
        throw new Error(p.name+' 님의 좌석이 추첨 중 변경되었습니다. 다시 추첨해 주세요.');
      }
      if(currentDrawBySeat[currentSeat]){
        throw new Error(currentSeat+' 좌석은 이미 다른 행운추첨 상품에 당첨되어 있습니다.');
      }

      return{id:p.id,name:p.name,seat:currentSeat,rank:row.rank};
    });

    const note='ROULETTE:'+plan.drawId+' · 상품 '+plan.prizeNo+'번';
    saveDrawPrizesV24_({
      entries:winners.map(function(w){
        return{seat:w.seat,prizeName:plan.prizeName,note:note};
      })
    },station);

    const sheet=ensureRouletteHistorySheetV29_();
    const now=new Date();
    const start=Math.max(2,sheet.getLastRow()+1);

    const values=winners.map(function(w){
      return[
        plan.drawId,now,plan.prizeNo,plan.prizeName,plan.winnerMode,
        plan.winnerCount,plan.poolCount,w.id,w.name,w.seat,w.rank,
        true,'',station,note
      ];
    });

    sheet.getRange(
      start,1,values.length,ROULETTE_HISTORY_HEADERS_V29.length
    ).setValues(values);

    SpreadsheetApp.flush();
    CacheService.getScriptCache().remove(
      ROULETTE_ROUND_CACHE_PREFIX_V29+token
    );

    appendLog_('마블룰렛 당첨 확정',{},station,
      plan.drawId+' / '+plan.prizeName+' / '+
      winners.map(function(x){return x.seat;}).join(', '));

    const draw={
      drawId:plan.drawId,
      drawnAt:now.toISOString(),
      prizeNo:plan.prizeNo,
      prizeName:plan.prizeName,
      winnerMode:plan.winnerMode,
      winnerCount:plan.winnerCount,
      poolCount:plan.poolCount,
      active:true,
      winners:winners
    };

    return{
      already:false,
      draw:draw,
      bootstrap:rouletteBootstrapV29_()
    };
  }finally{
    lock.releaseLock();
  }
}


function commitOriginalMarbleRoundV302_(payload,station){
  const token=String(payload.roundToken||'').trim();
  const winnerSeats=Array.isArray(payload.winnerSeats)
    ?payload.winnerSeats.map(function(x){return String(x||'').trim().toUpperCase();}).filter(Boolean)
    :[];
  if(!token)throw new Error('추첨 준비번호가 없습니다.');
  const plan=getRoulettePlanV29_(token);
  const eligibleIdMap={};
  (Array.isArray(plan.eligibleIds)?plan.eligibleIds:[]).forEach(function(id){
    eligibleIdMap[String(id||'')]=true;
  });
  if(winnerSeats.length!==plan.winnerCount){
    throw new Error('현장 마블 결과 인원과 준비된 당첨 인원이 일치하지 않습니다.');
  }
  if(new Set(winnerSeats).size!==winnerSeats.length){
    throw new Error('중복된 당첨 좌석이 있습니다.');
  }

  const allowedBySeat={};
  plan.ranking.forEach(function(row){
    if(eligibleIdMap[row.id])allowedBySeat[row.seat]=row;
  });
  winnerSeats.forEach(function(seat){
    if(!allowedBySeat[seat]){
      throw new Error(seat+' 좌석은 이번 추첨의 당첨 대상이 아닙니다.');
    }
  });

  const lock=LockService.getScriptLock();
  lock.waitLock(30000);
  try{
    const already=groupRouletteHistoryV29_(100).find(function(x){return x.drawId===plan.drawId&&x.active;});
    if(already)return{already:true,draw:already};

    const prize=getRoulettePrizeV29_(plan.prizeNo);
    if(!prize.active||prize.prizeName!==plan.prizeName){
      throw new Error('상품 설정이 변경되었습니다. 결과를 저장하지 못했습니다.');
    }
    if(prize.remaining<plan.winnerCount){
      throw new Error('상품 남은 수량이 변경되었습니다.');
    }

    const activeBySeat={};
    readParticipants_().forEach(function(p){
      const seat=parseSeatList_(p.seat)[0]||'';
      if(seat)activeBySeat[seat]=p;
    });
    const drawBySeat={};
    readDrawPrizesV24_().forEach(function(x){drawBySeat[x.seat]=x;});

    const winners=winnerSeats.map(function(seat,index){
      const p=activeBySeat[seat];
      if(!p||!p.active)throw new Error(seat+' 참가자 상태가 변경되었습니다.');
      if(!p.arrived)throw new Error(p.name+' 님의 도착 상태가 변경되었습니다.');
      if(p.usesCenter!==true||!eligibleIdMap[p.id]){
        throw new Error('추첨 대상 정보가 변경되었습니다. 다시 추첨해 주세요.');
      }
      if(drawBySeat[seat])throw new Error(seat+' 좌석은 이미 다른 상품에 당첨되어 있습니다.');
      return{id:p.id,name:p.name,seat:seat,rank:index+1};
    });

    const note='ORIGINAL_MARBLE:'+plan.drawId+' · 상품 '+plan.prizeNo+'번';
    saveDrawPrizesV24_({entries:winners.map(function(w){
      return{seat:w.seat,prizeName:plan.prizeName,note:note};
    })},station);

    const sheet=ensureRouletteHistorySheetV29_();
    const now=new Date();
    const start=Math.max(2,sheet.getLastRow()+1);
    const values=winners.map(function(w){return[
      plan.drawId,now,plan.prizeNo,plan.prizeName,plan.winnerMode,
      plan.winnerCount,plan.poolCount,w.id,w.name,w.seat,w.rank,
      true,'',station,note
    ];});
    sheet.getRange(start,1,values.length,ROULETTE_HISTORY_HEADERS_V29.length).setValues(values);
    SpreadsheetApp.flush();
    CacheService.getScriptCache().remove(ROULETTE_ROUND_CACHE_PREFIX_V29+token);

    appendLog_('원본 마블룰렛 당첨 확정',{},station,
      plan.drawId+' / '+plan.prizeName+' / '+winnerSeats.join(', '));

    return{already:false,draw:{
      drawId:plan.drawId,drawnAt:now.toISOString(),prizeNo:plan.prizeNo,
      prizeName:plan.prizeName,winnerMode:plan.winnerMode,
      winnerCount:plan.winnerCount,poolCount:plan.poolCount,active:true,winners:winners
    }};
  }finally{lock.releaseLock();}
}

function undoRouletteDrawV29_(payload,station){
  const drawId=String(payload.drawId||'').trim();
  if(!drawId)throw new Error('취소할 추첨번호가 없습니다.');
  const lock=LockService.getScriptLock();
  lock.waitLock(30000);
  try{
    const historySheet=ensureRouletteHistorySheetV29_();
    const history=readRouletteHistoryV29_().filter(function(x){return x.drawId===drawId&&x.active;});
    if(!history.length)throw new Error('이미 취소되었거나 찾을 수 없는 추첨입니다.');

    const drawSheet=ensureDrawSheetV24_();
    const activeDraw=readDrawPrizesV24_();
    const related=activeDraw.filter(function(x){
      return String(x.note||'').indexOf('ROULETTE:'+drawId)>=0;
    });
    const redeemed=related.find(function(x){return x.redeemed;});
    if(redeemed){
      throw new Error(redeemed.seat+' 상품이 이미 수령완료 상태입니다. 수령취소 후 추첨을 취소해 주세요.');
    }

    const now=new Date();
    related.forEach(function(x){
      drawSheet.getRange(x.rowNumber,3).setValue(false);
      drawSheet.getRange(x.rowNumber,9).setValue(now);
    });
    history.forEach(function(x){
      historySheet.getRange(x.rowNumber,12).setValue(false);
      historySheet.getRange(x.rowNumber,13).setValue(now);
    });
    SpreadsheetApp.flush();
    appendLog_('마블룰렛 추첨 취소',{},station,drawId);
    return rouletteBootstrapV29_();
  }finally{
    lock.releaseLock();
  }
}

/* ------------------------ 행운추첨 ------------------------ */

function normalizeDrawSeatV24_(value){
  const seat=normalizeSeat_(value);
  if(!seat)throw new Error('좌석번호를 입력하세요.');
  const exists=getSeatMetaV13_().some(function(s){return s.code===seat;});
  if(!exists)throw new Error('좌석배치도에 없는 좌석입니다: '+seat);
  return seat;
}

function readDrawPrizesV24_(){
  const sheet=ensureDrawSheetV24_();
  if(sheet.getLastRow()<2)return[];

  return sheet.getRange(2,1,sheet.getLastRow()-1,DRAW_HEADERS_V24.length)
    .getValues()
    .map(function(r,i){
      return{
        rowNumber:i+2,
        seat:normalizeSeat_(r[0]),
        prizeName:cleanText_(r[1],160),
        active:r[2]===''?true:toBoolean_(r[2]),
        redeemed:toBoolean_(r[3]),
        redeemedAt:dateToIso_(r[4]),
        winnerCode:String(r[5]||'').trim(),
        winnerName:String(r[6]||'').trim(),
        createdAt:dateToIso_(r[7]),
        updatedAt:dateToIso_(r[8]),
        note:cleanText_(r[9],200)
      };
    })
    .filter(function(x){return x.seat&&x.prizeName&&x.active;})
    .sort(function(a,b){return a.seat.localeCompare(b.seat);});
}
function deleteDrawPrizeV24_(payload,station){
  clearAdminExtrasCacheV301_();
  const seat=normalizeDrawSeatV24_(payload.seat);
  const sheet=ensureDrawSheetV24_();
  const prize=readDrawPrizesV24_().find(function(x){return x.seat===seat;});
  if(!prize)throw new Error('등록된 당첨 좌석을 찾지 못했습니다.');

  if(prize.redeemed)throw new Error('이미 상품 수령 완료된 항목은 먼저 수령취소해 주세요.');

  sheet.getRange(prize.rowNumber,3).setValue(false);
  sheet.getRange(prize.rowNumber,9).setValue(new Date());
  SpreadsheetApp.flush();

  appendLog_('행운추첨 당첨좌석 삭제',{},station,seat+' / '+prize.prizeName);
  return readDrawPrizesV24_();
}

function getPrizeForParticipantV24_(participant){
  if(!participant)return null;
  const seat=parseSeatList_(participant.seat)[0]||'';
  if(!seat)return null;

  const prize=readDrawPrizesV24_().find(function(x){
    return x.seat===seat;
  });
  if(!prize)return null;

  return{
    seat:prize.seat,
    prizeName:prize.prizeName,
    redeemed:prize.redeemed,
    redeemedAt:prize.redeemedAt,
    winnerCode:prize.winnerCode,
    winnerName:prize.winnerName,
    note:prize.note
  };
}

function redeemPrizeV24_(payload,station){
  clearAdminExtrasCacheV301_();
  const code=extractCode_(payload.code||payload.id||payload.qr);
  if(!code)throw new Error('참가자 QR코드가 없습니다.');

  const p=readParticipants_().find(function(x){return x.id===code;});
  if(!p)throw new Error('참가자를 찾지 못했습니다.');

  const seat=parseSeatList_(p.seat)[0]||'';
  if(!seat)throw new Error('좌석이 아직 배정되지 않았습니다.');

  const sheet=ensureDrawSheetV24_();
  const prize=readDrawPrizesV24_().find(function(x){return x.seat===seat;});
  if(!prize)throw new Error('이 좌석은 행운추첨 당첨 좌석이 아닙니다.');

  if(prize.redeemed){
    if(prize.winnerCode===p.id){
      return{prize:getPrizeForParticipantV24_(p),already:true};
    }
    throw new Error('이미 다른 QR로 상품 수령 완료 처리된 좌석입니다.');
  }

  const now=new Date();
  sheet.getRange(prize.rowNumber,4,1,6).setValues([[
    true,now,p.id,p.name,
    prize.createdAt?new Date(prize.createdAt):now,
    now
  ]]);
  SpreadsheetApp.flush();

  appendLog_('행운추첨 상품 수령',p,station,seat+' / '+prize.prizeName);
  return{prize:getPrizeForParticipantV24_(p),already:false};
}

function undoPrizeRedeemV24_(payload,station){
  clearAdminExtrasCacheV301_();
  const seat=normalizeDrawSeatV24_(payload.seat);
  const sheet=ensureDrawSheetV24_();
  const prize=readDrawPrizesV24_().find(function(x){return x.seat===seat;});
  if(!prize)throw new Error('등록된 당첨 좌석을 찾지 못했습니다.');

  sheet.getRange(prize.rowNumber,4,1,6).setValues([[
    false,'','','',
    prize.createdAt?new Date(prize.createdAt):new Date(),
    new Date()
  ]]);
  SpreadsheetApp.flush();

  appendLog_('행운추첨 수령취소',{},station,seat+' / '+prize.prizeName);
  return readDrawPrizesV24_();
}


function checkInParticipant_(payload,station){
  const lock=LockService.getScriptLock(); lock.waitLock(20000);
  try{
    const code=extractCode_(payload.code||payload.id||payload.qr);
    if(!code)throw new Error('QR코드 값이 비어 있습니다.');
    const sheet=getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
    const target=findParticipantRowByCode_(sheet,code);
    if(!target)throw new Error('등록되지 않은 QR코드입니다.');
    const before=readParticipantAtRow_(sheet,target.rowNumber);
    if(!before.active)throw codedError_('PARTICIPANT_INACTIVE','참여불가 처리된 참가자입니다.');
    if(before.arrived){
      appendLog_('중복 스캔',before,station,'최초 도착 '+(before.checkInAt||''));
      return{participant:withGiftStatusV32_(before),already:true,prize:getPrizeForParticipantV24_(before)};
    }
    const now=new Date();
    const statusRange=sheet.getRange(target.rowNumber,8,1,5);
    const statusValues=statusRange.getValues()[0];
    statusValues[0]=true; statusValues[1]=now; statusValues[4]=now;
    statusRange.setValues([statusValues]);
    const participant=Object.assign({},before,{arrived:true,checkInAt:now.toISOString(),updatedAt:now.toISOString()});
    appendLog_('도착 처리',participant,station,before.seat?'기존 배정 좌석 유지 '+before.seat:'좌석 미배정 상태로 도착 처리');
    return{participant:withGiftStatusV32_(participant),already:false,seatAssignedNow:false,prize:getPrizeForParticipantV24_(participant)};
  }finally{lock.releaseLock();}
}


function getAdminExtrasCachedV301_(){
  const cache=CacheService.getScriptCache();
  const key='admin-extras-v301';
  try{
    const hit=cache.get(key);
    if(hit)return JSON.parse(hit);
  }catch(_){}

  const data={
    seatMeta:getSeatMetaV13_(),
    prizes:readDrawPrizesV24_(),
    serverTime:new Date().toISOString(),
    version:APP_VERSION
  };

  try{cache.put(key,JSON.stringify(data),10);}catch(_){}
  return data;
}

function clearAdminExtrasCacheV301_(){
  try{CacheService.getScriptCache().remove('admin-extras-v301');}catch(_){}
}

const GIFT_SHEET_V32='기념품지급';
const GIFT_HEADERS_V32=Object.freeze(['QR코드','이름','지급여부','지급시각','처리자','수정시각']);

function ensureGiftSheetV32_(){
  const ss=getSpreadsheet_();
  let sheet=ss.getSheetByName(GIFT_SHEET_V32);
  if(!sheet)sheet=ss.insertSheet(GIFT_SHEET_V32);
  if(sheet.getMaxColumns()<GIFT_HEADERS_V32.length)sheet.insertColumnsAfter(sheet.getMaxColumns(),GIFT_HEADERS_V32.length-sheet.getMaxColumns());
  sheet.getRange(1,1,1,GIFT_HEADERS_V32.length).setValues([GIFT_HEADERS_V32]);
  sheet.getRange(1,1,1,GIFT_HEADERS_V32.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.getRange('C2:C2000').setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  sheet.getRange('D2:F2000').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  return sheet;
}

function readGiftMapV32_(){
  const sheet=ensureGiftSheetV32_();
  const last=sheet.getLastRow();
  const map={};
  if(last<2)return map;
  sheet.getRange(2,1,last-1,GIFT_HEADERS_V32.length).getValues().forEach(function(r,i){
    const code=String(r[0]||'').trim().toUpperCase();
    if(!code)return;
    map[code]={
      rowNumber:i+2,
      code:code,
      name:String(r[1]||'').trim(),
      received:toBoolean_(r[2]),
      receivedAt:dateToIso_(r[3]),
      station:String(r[4]||'').trim()
    };
  });
  return map;
}

function withGiftStatusV32_(participant,giftMap){
  if(!participant)return participant;
  const map=giftMap||readGiftMapV32_();
  const gift=map[String(participant.id||'').toUpperCase()]||{};
  participant.giftReceived=Boolean(gift.received);
  participant.giftReceivedAt=gift.receivedAt||'';
  return participant;
}

function setGiftReceivedV32_(payload,station){
  const code=extractCode_(payload.code||payload.id);
  if(!code)throw new Error('참가자 QR코드가 없습니다.');
  const pSheet=getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
  const target=findParticipantRowByCode_(pSheet,code);
  if(!target)throw new Error('참가자를 찾지 못했습니다.');
  const participant=readParticipantAtRow_(pSheet,target.rowNumber);
  if(!participant.active)throw new Error('참여불가 처리된 참가자입니다.');

  const sheet=ensureGiftSheetV32_();
  const map=readGiftMapV32_();
  const current=map[code];
  const received=payload.received===false?false:true;
  const now=new Date();
  const row=current?current.rowNumber:Math.max(2,sheet.getLastRow()+1);
  sheet.getRange(row,1,1,6).setValues([[
    code,participant.name,received,received?now:'',station||'관리자 웹',now
  ]]);
  SpreadsheetApp.flush();
  appendLog_(received?'기념품 지급':'기념품 지급취소',participant,station,received?'입장 기념품 지급완료':'기념품 지급상태 취소');
  return{participant:withGiftStatusV32_(readParticipantAtRow_(pSheet,target.rowNumber)),already:Boolean(current&&current.received&&received)};
}

function getFieldStatsV32_(){
  const gifts=readGiftMapV32_();
  const participants=readParticipants_().filter(p=>!isParticipationExcluded_(p));
  const arrived=participants.filter(p=>p.arrived);
  const giftCount=participants.filter(p=>gifts[p.id]&&gifts[p.id].received).length;
  return{
    registered:participants.length,
    arrived:arrived.length,
    notArrived:Math.max(0,participants.length-arrived.length),
    wheelchair:participants.filter(p=>p.wheelchairUser).length,
    giftReceived:giftCount,
    giftPending:Math.max(0,arrived.length-giftCount),
    raffleEligible:arrived.filter(p=>p.seat).length
  };
}

function emergencyListV32_(){
  const gifts=readGiftMapV32_();
  return readParticipants_().filter(p=>!isParticipationExcluded_(p)).map(p=>({
    number:p.number,name:p.name,phone:p.phone,organization:p.organization||'',seat:p.seat||'',
    wheelchair:p.wheelchairUser?'O':'',arrived:p.arrived?'O':'',gift:(gifts[p.id]&&gifts[p.id].received)?'O':'',qr:p.id
  }));
}

function adminOnsiteRegisterV32_(payload,station){
  const name=cleanText_(payload.name,40);
  if(!name)throw new Error('이름을 입력해 주세요.');
  let phone=cleanText_(payload.phone,30);
  if(!phone){
    const count=readAllParticipants_().filter(p=>String(p.phone||'').indexOf('현장접수-')===0).length+1;
    phone='현장접수-'+String(count).padStart(3,'0');
  }
  const created=createParticipant_({
    name:name,phone:phone,organization:cleanText_(payload.organization,80),
    disabledPerson:toBoolean_(payload.disabledPerson),wheelchairUser:toBoolean_(payload.wheelchairUser),
    usesCenter:false,note:'현장 수기접수 [NOSEAT]'
  },station||'현장 수기접수');
  return{participant:withGiftStatusV32_(created)};
}

function getBootstrapCoreV301_(){
  const giftMap=readGiftMapV32_();
  return{
    settings:getSettings_(),
    participants:readParticipants_().map(p=>withGiftStatusV32_(p,giftMap)),
    serverTime:new Date().toISOString(),
    version:APP_VERSION
  };
}

function getBootstrapExtrasV301_(){
  return getAdminExtrasCachedV301_();
}

function getBootstrapData_(){
  const core=getBootstrapCoreV301_();
  const extras=getBootstrapExtrasV301_();
  return Object.assign(core,extras);
}

function executeWebRequest_(params){
  try{
    const action=String(params.action||'health');

    if(action==='health'){
      return{
        ok:true,
        data:{
          version:APP_VERSION,
          configured:Boolean(
            PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')
          ),
          applicationMode:'individual',
          seatSchema:RUNWAY_SEAT_SCHEMA_V13
        },
        version:APP_VERSION
      };
    }

    const payload=parsePayload_(params.payload);
    let data;

    if(action==='adminLogin')data=adminLogin_(payload);
    else if(action==='adminLogout')data=adminLogout_(params.token||payload.token);
    else if(action==='publicBootstrap')data=getPublicBootstrapData_();
    else if(action==='publicRegister')data=publicRegisterParticipant_(payload);
    else if(action==='publicRegisterGroup')data=publicRegisterGroupV31_(payload);
    else if(action==='publicTicket')data=getPublicTicket_(payload);
    else if(action==='publicLookup')data=lookupPublicApplication_(payload);
    else if(action==='publicSeatLayout'){
      data={seats:getPublicSeatLayoutV13_(),version:RUNWAY_SEAT_SCHEMA_V13};
    }else{
      assertSessionAuthorized_(params.token);
      const station=cleanText_(params.station||payload.station||'관리자 웹',60);

      switch(action){
        case'bootstrap':
          data=getBootstrapData_();
          break;
        case'bootstrapCore':
          data=getBootstrapCoreV301_();
          break;
        case'bootstrapExtras':
          data=getBootstrapExtrasV301_();
          break;
        case'createParticipant':
          data=createParticipant_(payload,station);
          break;
        case'updateParticipant':
          data=updateParticipant_(payload,station);
          break;
        case'deleteParticipant':
          data=deleteParticipant_(payload,station);
          break;
        case'checkIn':
          data=checkInParticipantV90_(payload,station);
          break;
        case'undoCheckIn':
          data=undoCheckInParticipant_(payload,station);
          break;
        case'markTicketPrinted':
          data=markTicketPrinted_(payload,station);
          break;
        case'saveSettings':
          data=saveSettings_(payload,station);
          break;
        case'batchImport':
          data=batchImportParticipants_(payload,station);
          break;
        case'assignSeatFromMap':
          data=assignParticipantSeatFromMapV13_(payload,station);
          break;
        case'unassignSeat':
          data=unassignParticipantSeatV13_(payload,station);
          break;
        case'saveSeatMeta':
          data=saveSeatMetaV13_(payload,station);
          break;
        case'saveDrawPrizes':
          data=saveDrawPrizesV24_(payload,station);
          break;
        case'deleteDrawPrize':
          data=deleteDrawPrizeV24_(payload,station);
          break;
        case'redeemPrize':
          data=redeemPrizeV24_(payload,station);
          break;
        case'undoPrizeRedeem':
          data=undoPrizeRedeemV24_(payload,station);
          break;
        case'adminSetRepresentativeGroup':
          data=adminSetRepresentativeGroupV76_(payload,station);
          break;
        case'adminClearRepresentativeGroup':
          data=adminClearRepresentativeGroupV76_(payload,station);
          break;
        case'adminUpdateRepresentativeGroup':
          data=adminUpdateRepresentativeGroupV80_(payload,station);
          break;
        case'adminGetAutoOrgGroups':
          data=adminGetAutoOrgGroupsV83_();
          break;
        case'adminSaveAutoOrgGroup':
          data=adminSaveAutoOrgGroupV83_(payload,station);
          break;
        case'adminResetAutoOrgGroup':
          data=adminResetAutoOrgGroupV83_(payload,station);
          break;
        case'adminDeleteAutoOrgGroup':
          data=adminDeleteAutoOrgGroupV831_(payload,station);
          break;
        case'checkInRepresentativeGroup':
          data=checkInRepresentativeGroupV90_(payload,station);
          break;
        case'smsRelayStatus':
          data=smsRelayStatusV90_();
          break;
        case'queuePreEventSms':
          data=queuePreEventSmsV90_(payload,station);
          break;
        case'invitationMessageConfigStatus':
          data=invitationMessageConfigStatusV76_();
          break;
        case'sendInvitationMessages':
          data=sendInvitationMessagesV76_(payload,station);
          break;
        case'scheduleInvitationMessages':
          data=scheduleInvitationMessagesV76_(payload,station);
          break;
        case'adminLinkCompanions':
          data=adminLinkCompanionsV30_(payload,station);
          break;
        case'adminClearCompanions':
          data=adminClearCompanionsV30_(payload,station);
          break;
        case'adminReflowSeats':
          data=adminReflowSeatsV30_(payload,station);
          break;
        case'adminReassignAllSeats':
          data=adminReassignAllSeatsV31_(payload,station);
          break;
        case'setGiftReceived':
          data=setGiftReceivedV32_(payload,station);
          break;
        case'fieldStats':
          data=getFieldStatsV32_();
          break;
        case'emergencyList':
          data=emergencyListV32_();
          break;
        case'adminOnsiteRegister':
          data=adminOnsiteRegisterV32_(payload,station);
          break;
        case'adminImportExcelRows':
          data=adminImportExcelRowsV30_(payload,station);
          break;
        case'rouletteBootstrap':
          data=rouletteBootstrapV29_();
          break;
        case'saveRoulettePrize':
          data=saveRoulettePrizeV29_(payload,station);
          break;
        case'roulettePrizeImage':
          data=getRoulettePrizeImageV29_(payload);
          break;
        case'prepareRouletteRound':
          data=prepareRouletteRoundV29_(payload,station);
          break;
        case'commitRouletteRound':
          data=commitRouletteRoundV29_(payload,station);
          break;
        case'commitOriginalMarbleRound':
          data=commitOriginalMarbleRoundV302_(payload,station);
          break;
        case'undoRouletteDraw':
          data=undoRouletteDrawV29_(payload,station);
          break;
        default:
          throw new Error('지원하지 않는 작업입니다: '+action);
      }
    }

    return{ok:true,data,version:APP_VERSION};
  }catch(error){
    console.error(error&&error.stack?error.stack:error);
    return{
      ok:false,
      error:error&&error.message?error.message:String(error),
      errorCode:error&&error.code?String(error.code):'',
      version:APP_VERSION
    };
  }
}


/* ======================================================================
 * v2.5 운영 클린본 보강
 * ====================================================================== */

function onOpen(){
  try{
    SpreadsheetApp.getUi().createMenu('20주년 개인 QR 접수')
      .addItem('시스템·시트 점검/초기화','setupSystem')
      .addItem('300석 좌석 기본값 재구성','applyRunwaySeatDefaultsV13')
      .addItem('휠체어 24석 선착순 재배정','reassignDisabledPrioritySeatsV273')
      .addItem('행운추첨 시트 확인','prepareDrawSheetV25')
      .addItem('룰렛 상품·추첨 시트 확인','prepareRouletteSheetsV29')
      .addItem('참가자 행 정리','repairParticipantSheet')
      .addItem('누락된 접수번호·QR 생성','fillMissingNumbersAndCodes')
      .addItem('도착 기록 전체 초기화','clearAllCheckIns')
      .addToUi();
  }catch(error){
    console.log('독립 Apps Script에서는 스프레드시트 메뉴를 표시하지 않습니다.');
  }
}

function prepareDrawSheetV25(){
  const sheet=ensureDrawSheetV24_();
  SpreadsheetApp.flush();
  return{ok:true,sheet:sheet.getName(),columns:DRAW_HEADERS_V24.length};
}

function applyIndividualParticipantSheetLayoutV25_(sheet){
  sheet.getRange(1,1,1,PARTICIPANT_HEADERS.length).setValues([PARTICIPANT_HEADERS]);
  sheet.getRange(1,1,1,PARTICIPANT_HEADERS.length)
    .setFontWeight('bold').setBackground('#172554').setFontColor('#fff');

  // 구버전 호환 데이터는 삭제하지 않고 숨겨서 운영화면을 깔끔하게 유지합니다.
  try{sheet.hideColumns(14,1);}catch(_){}
  try{sheet.hideColumns(19,2);}catch(_){}

  sheet.setColumnWidth(3,120);
  sheet.setColumnWidth(4,140);
  sheet.setColumnWidth(5,110);
  sheet.setColumnWidth(6,100);
  sheet.setColumnWidth(7,260);
  sheet.setColumnWidth(15,130);
}


function migrateParticipantV30_(){
  const sheet=getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
  if(!sheet)return;
  const last=sheet.getLastRow();
  if(last<2)return;
  const names=sheet.getRange(2,3,last-1,1).getDisplayValues();
  const statuses=sheet.getRange(2,30,last-1,1).getDisplayValues();
  const out=statuses.map((r,i)=>[
    String(names[i][0]||'').trim()&&!String(r[0]||'').trim()
      ?'참여'
      :String(r[0]||'').trim()
  ]);
  sheet.getRange(2,30,out.length,1).setValues(out);
}

function setupSystem(){
  const configuredId=String(SPREADSHEET_ID_CONFIG||'').trim();
  const ss=configuredId?SpreadsheetApp.openById(configuredId):SpreadsheetApp.getActiveSpreadsheet();
  if(!ss)throw new Error('연결할 Google 스프레드시트를 찾지 못했습니다.');

  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID',ss.getId());
  ss.setSpreadsheetTimeZone('Asia/Seoul');

  const participants=ensureSheet_(ss,SHEET_NAMES.PARTICIPANTS,PARTICIPANT_HEADERS);
  const settings=ensureSheet_(ss,SHEET_NAMES.SETTINGS,['설정키','값','설명']);
  const logs=ensureSheet_(ss,SHEET_NAMES.LOGS,LOG_HEADERS);

  ensureParticipantExtraColumnsV13_(participants);
  migrateParticipantV30_();
  applyIndividualParticipantSheetLayoutV25_(participants);
  ensureDrawSheetV24_();
  ensureRoulettePrizeSheetV29_();
  ensureRouletteHistorySheetV29_();
  ensureGiftSheetV32_();

  applyParticipantSheetFormat_(participants);
  applySettingsSheetFormat_(settings);
  applyLogSheetFormat_(logs);
  writeDefaultSettings_(settings);

  forceSettingV17_(settings,'eventDate','2026. 9. 17.(목) 13:30','행사 일시');
  forceSettingV17_(settings,'registrationCapacity',400,'전체 참가자 정원');
  forceSettingV17_(settings,'autoAssignSeat',true,'개인 신청 좌석 자동 배정 여부');
  upsertSettingV13_(settings,'ticketRefreshSeconds',15,'개인 티켓 좌석 자동 새로고침 간격(초)');

  ensureRunwaySeatSheetV13_(true);
  SpreadsheetApp.flush();

  const seatMeta=getSeatMetaV13_();
  const legacyGroups=readParticipants_().filter(p=>Math.max(1,Number(p.partySize)||1)>1).length;

  const result={
    ok:true,
    spreadsheetName:ss.getName(),
    spreadsheetId:ss.getId(),
    applicationMode:'1인 1신청 · 1인 1QR',
    seatCount:seatMeta.length,
    vipCount:seatMeta.filter(s=>{const c=String(s.category||'').toLowerCase();return c.includes('vip')||c.includes('내빈')||c.includes('수상자');}).length,
    wheelchairFlexibleCount:seatMeta.filter(s=>s.wheelchairEligible).length,
    disabledPriorityCount:seatMeta.filter(s=>String(s.category).includes('장애인(휠체어)')).length,
    disabledFrontZoneCount:seatMeta.filter(s=>DISABLED_ACCESSIBLE_CODES_V28.includes(s.code)).length,
    drawSheet:SHEET_NAMES.DRAW,
    roulettePrizeSheet:SHEET_NAMES.ROULETTE_PRIZES,
    rouletteHistorySheet:SHEET_NAMES.ROULETTE_HISTORY,
    legacyGroupRows:legacyGroups,
    version:APP_VERSION
  };
  console.log('setupSystem v2.9 완료: '+JSON.stringify(result));
  return result;
}


function reassignDisabledPrioritySeatsV273(){
  const lock=LockService.getScriptLock();
  lock.waitLock(30000);
  try{
    const sheet=getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
    const participants=readParticipants_()
      .filter(p=>p.active)
      .sort((a,b)=>(a.number||999999)-(b.number||999999));

    const targetSet=new Set(DISABLED_ACCESSIBLE_CODES_V28);
    const conflicts=participants.filter(p=>
      !p.disabledPerson &&
      parseSeatList_(p.seat).some(code=>targetSet.has(code))
    );

    if(conflicts.length){
      return{
        ok:false,needsManualCleanup:true,
        conflicts:conflicts.map(p=>({number:p.number,name:p.name,seat:p.seat})),
        message:'새 휠체어 우선 24석에 일반 참가자가 이미 배정되어 있습니다. 관리자 좌석배치도에서 먼저 이동해 주세요.'
      };
    }

    const used={};
    participants.forEach(p=>{
      if(!p.disabledPerson){
        parseSeatList_(p.seat).forEach(code=>used[code]=p.id);
      }
    });

    let moved=0;
    const assignments=[];
    participants.filter(p=>p.disabledPerson).forEach(p=>{
      const seat=DISABLED_ACCESSIBLE_CODES_V28.find(code=>!used[code]);
      if(!seat)return;
      const target=findParticipantRowByCode_(sheet,p.id);
      if(!target)return;

      if(normalizeSeat_(p.seat)!==seat){
        sheet.getRange(target.rowNumber,5).setValue(seat);
        sheet.getRange(target.rowNumber,12).setValue(new Date());
        moved++;
      }

      used[seat]=p.id;
      assignments.push({number:p.number,name:p.name,wheelchairUser:Boolean(p.wheelchairUser),seat});
    });

    SpreadsheetApp.flush();
    return{
      ok:true,moved,assignments,
      message:'휠체어 이용자를 접수번호 순서대로 A~D 휠체어 우선 24석에 재배정했습니다.'
    };
  }finally{
    lock.releaseLock();
  }
}

function getRedeemedPrizeAtSeatV25_(seat){
  const normalized=normalizeSeat_(seat);
  if(!normalized)return null;
  return readDrawPrizesV24_().find(p=>p.seat===normalized&&p.redeemed)||null;
}

function assertSeatMoveSafeV25_(participant,currentSeats,targetSeats){
  const current=(currentSeats||[]).map(normalizeSeat_).filter(Boolean);
  const target=(targetSeats||[]).map(normalizeSeat_).filter(Boolean);

  for(const seat of current){
    const prize=getRedeemedPrizeAtSeatV25_(seat);
    if(prize&&prize.winnerCode===participant.id&&!target.includes(seat)){
      throw new Error(
        seat+'은 이미 '+prize.prizeName+
        ' 상품 수령완료 처리된 당첨 좌석입니다. 행운추첨 메뉴에서 수령취소 후 좌석을 이동해 주세요.'
      );
    }
  }

  for(const seat of target){
    const prize=getRedeemedPrizeAtSeatV25_(seat);
    if(prize&&prize.winnerCode&&prize.winnerCode!==participant.id){
      throw new Error(
        seat+'은 이미 다른 참가자가 상품을 수령한 당첨 좌석입니다. 좌석을 변경할 수 없습니다.'
      );
    }
  }
}

function findIndividualSeatV24_(participants,wheelchairUser,disabledPerson,exceptCode){
  const ignored={};
  if(exceptCode)ignored[exceptCode]=true;
  const occupied=getSeatOccupantMapV13_(participants,ignored);
  const meta=getSeatMetaV13_();
  if(wheelchairUser){
    const priority=DISABLED_ACCESSIBLE_CODES_V31.map(code=>meta.find(s=>s.code===code)).filter(s=>s&&s.enabled&&!occupied[s.code]);
    if(priority.length)return priority[0].code;
  }
  const filtered=participants.filter(p=>!exceptCode||p.id!==exceptCode);
  return findFirstAvailableSeatBlock_(getSettings_(),filtered,1);
}

function saveDrawPrizesV24_(payload,station){
  clearAdminExtrasCacheV301_();
  const entries=Array.isArray(payload.entries)?payload.entries:[];
  if(!entries.length)throw new Error('등록할 당첨 좌석과 상품을 입력하세요.');

  const seen={};
  entries.forEach(function(entry){
    const seat=normalizeDrawSeatV24_(entry.seat);
    if(seen[seat])throw new Error('한 번의 등록 목록에 같은 좌석이 중복되어 있습니다: '+seat);
    seen[seat]=true;
  });

  const sheet=ensureDrawSheetV24_();
  const existing=readDrawPrizesV24_();
  const bySeat={};
  existing.forEach(x=>bySeat[x.seat]=x);

  const now=new Date();
  const saved=[];

  entries.forEach(function(entry){
    const seat=normalizeDrawSeatV24_(entry.seat);
    const prizeName=cleanText_(entry.prizeName,160);
    const note=cleanText_(entry.note,200);
    if(!prizeName)throw new Error(seat+'의 상품명을 입력하세요.');

    const old=bySeat[seat];
    if(old&&old.redeemed){
      throw new Error(
        seat+'은 이미 상품 수령완료된 당첨 좌석입니다. 수령취소 후 수정해 주세요.'
      );
    }

    if(old){
      sheet.getRange(old.rowNumber,1,1,10).setValues([[
        seat,prizeName,true,false,'','','',
        old.createdAt?new Date(old.createdAt):now,now,note
      ]]);
    }else{
      const target=Math.max(2,sheet.getLastRow()+1);
      sheet.getRange(target,1,1,10).setValues([[
        seat,prizeName,true,false,'','','',now,now,note
      ]]);
    }

    saved.push(seat);
    bySeat[seat]={
      seat,prizeName,active:true,redeemed:false,
      createdAt:old?.createdAt||now.toISOString(),note
    };
  });

  SpreadsheetApp.flush();
  appendLog_('행운추첨 당첨좌석 등록',{},station,saved.join(', '));
  return readDrawPrizesV24_();
}

function assignParticipantSeatFromMapV13_(payload,station){
  const lock=LockService.getScriptLock();
  lock.waitLock(30000);
  try{
    const participantCode=extractCode_(payload.participantCode||payload.code||payload.id);
    const targetSeat=normalizeSeat_(payload.targetSeat);
    const replaceCurrent=toBoolean_(payload.replaceCurrent);

    if(!participantCode||!targetSeat)throw new Error('참가자와 좌석을 선택하세요.');

    const sheet=getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
    const targetRow=findParticipantRowByCode_(sheet,participantCode);
    if(!targetRow)throw new Error('참가자를 찾지 못했습니다.');

    const participants=readParticipants_();
    const selected=participants.find(p=>p.id===participantCode);
    const occupant=participants.find(
      p=>p.id!==selected.id&&parseSeatList_(p.seat).includes(targetSeat)
    );

    if(occupant&&!replaceCurrent){
      throw new Error(targetSeat+'은 현재 '+occupant.name+' 님 좌석입니다.');
    }

    const ignored={[selected.id]:true};
    if(occupant&&replaceCurrent)ignored[occupant.id]=true;

    // 개인신청은 한 좌석만 이동합니다.
    const block=buildManualSeatBlockV13_(targetSeat,1,participants,ignored);
    assertSeatMoveSafeV25_(selected,parseSeatList_(selected.seat),block);

    if(occupant&&replaceCurrent){
      assertSeatMoveSafeV25_(occupant,parseSeatList_(occupant.seat),[]);
      const orow=findParticipantRowByCode_(sheet,occupant.id);
      if(orow){
        sheet.getRange(orow.rowNumber,5).setValue('');
        sheet.getRange(orow.rowNumber,12).setValue(new Date());
      }
    }

    sheet.getRange(targetRow.rowNumber,5).setValue(block.join(','));
    sheet.getRange(targetRow.rowNumber,12).setValue(new Date());
    SpreadsheetApp.flush();

    const updated=readParticipantAtRow_(sheet,targetRow.rowNumber);
    appendLog_('좌석 지도 이동/배정',updated,station,'기준 '+targetSeat);
    return{
      participant:updated,
      displacedParticipantId:occupant&&replaceCurrent?occupant.id:'',
      seats:block
    };
  }finally{
    lock.releaseLock();
  }
}

function unassignParticipantSeatV13_(payload,station){
  const code=extractCode_(payload.participantCode||payload.code||payload.id);
  const sheet=getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
  const target=findParticipantRowByCode_(sheet,code);
  if(!target)throw new Error('참가자를 찾지 못했습니다.');

  const before=readParticipantAtRow_(sheet,target.rowNumber);
  assertSeatMoveSafeV25_(before,parseSeatList_(before.seat),[]);

  sheet.getRange(target.rowNumber,5).setValue('');
  sheet.getRange(target.rowNumber,12).setValue(new Date());
  SpreadsheetApp.flush();

  const updated=readParticipantAtRow_(sheet,target.rowNumber);
  appendLog_('좌석 미배정',before,station,'관리자 좌석배치도');
  return updated;
}

function updateParticipant_(payload,station){
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    const code=extractCode_(payload.code||payload.id);
    if(!code)throw new Error('수정할 참가자 코드가 없습니다.');

    const sheet=getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
    const target=findParticipantRowByCode_(sheet,code);
    if(!target)throw new Error('참가자를 찾지 못했습니다.');

    const before=readParticipantAtRow_(sheet,target.rowNumber);
    const input=normalizeParticipantInput_(payload);
    if(!input.name)throw new Error('이름을 입력하세요.');

    const participants=readParticipants_();
    assertSeatAvailable_(participants,input.seat,code,1);
    assertSeatMoveSafeV25_(before,parseSeatList_(before.seat),parseSeatList_(input.seat));

    const digits=normalizePhoneDigits_(input.phone);
    input.phone=digits?formatPhone_(digits):'';

    sheet.getRange(target.rowNumber,3,1,5).setValues([[
      input.name,input.phone,input.seat,'개인신청',input.note
    ]]);
    sheet.getRange(target.rowNumber,14).setValue(input.organization);
    sheet.getRange(target.rowNumber,12).setValue(new Date());
    sheet.getRange(target.rowNumber,15).setValue(1);
    sheet.getRange(target.rowNumber,21).setValue(input.wheelchairUser);
    sheet.getRange(target.rowNumber,25).setValue(input.wheelchairUser?1:0);
    sheet.getRange(target.rowNumber,26).setValue(input.usesCenter);
    sheet.getRange(target.rowNumber,27).setValue('');
    sheet.getRange(target.rowNumber,28).setValue(input.disabledPerson);
    SpreadsheetApp.flush();

    const p=readParticipantAtRow_(sheet,target.rowNumber);
    appendLog_('개인 참가자 수정',p,station,'개인신청 정보 수정');
    return p;
  }finally{
    lock.releaseLock();
  }
}


function adminLinkCompanionsV30_(payload,station){
  const ids=Array.isArray(payload.ids)?payload.ids.map(extractCode_).filter(Boolean):[];
  const unique=[...new Set(ids)];
  if(unique.length<2)throw new Error('같이 앉을 참가자를 2명 이상 선택해 주세요.');
  if(unique.length>10)throw new Error('한 번에 최대 10명까지 묶을 수 있습니다.');
  const sheet=getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
  const group=String(payload.groupCode||'').trim()||newCompanionGroupCode_();
  const names=[];
  unique.forEach(id=>{
    const target=findParticipantRowByCode_(sheet,id);
    if(!target)throw new Error('선택한 참가자 중 찾을 수 없는 사람이 있습니다.');
    const p=readParticipantAtRow_(sheet,target.rowNumber);
    if(!p.active)throw new Error(p.name+' 님은 참여불가 상태입니다.');
    sheet.getRange(target.rowNumber,29).setValue(group);
    names.push(p.name);
  });
  SpreadsheetApp.flush();
  appendLog_('동반좌석 묶기',{},station,names.join(', ')+' / '+group);
  return{groupCode:group,count:names.length,names};
}

function adminClearCompanionsV30_(payload,station){
  const ids=Array.isArray(payload.ids)?payload.ids.map(extractCode_).filter(Boolean):[];
  if(!ids.length)throw new Error('동반그룹을 해제할 참가자를 선택해 주세요.');
  const sheet=getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
  let count=0;
  ids.forEach(id=>{
    const target=findParticipantRowByCode_(sheet,id);
    if(!target)return;
    sheet.getRange(target.rowNumber,29).setValue('');
    count++;
  });
  SpreadsheetApp.flush();
  appendLog_('동반좌석 해제',{},station,count+'명');
  return{count};
}

function generalSeatCodesV30_(){
  return getSeatMetaV13_()
    .filter(s=>s.enabled&&s.autoAssignable===true&&String(s.category||'')==='일반')
    .map(s=>String(s.code).toUpperCase());
}

function seatRankV30_(code){
  const m=/^([A-Y])([LR])-(\d{2})$/.exec(String(code||'').toUpperCase());
  if(!m)return 999999;
  const row=m[1].charCodeAt(0)-65;
  const side=m[2],n=Number(m[3]);
  const dist=side==='L'?(6-n):(n-1);
  return row*100+dist*2+(side==='R'?1:0);
}

function findConsecutiveGroupV30_(free,need){
  const set=new Set(free);
  if(need<1||need>6)return[];
  for(const row of 'ABCDEFGHIJKLMNO'.split('')){
    for(const side of ['L','R']){
      for(let start=1;start<=6-need+1;start++){
        const block=[];
        for(let n=start;n<start+need;n++)block.push(row+side+'-'+String(n).padStart(2,'0'));
        if(block.every(x=>set.has(x)))return block;
      }
    }
  }
  return[];
}

function adminReflowSeatsV30_(payload,station){
  clearAdminExtrasCacheV301_();
  const sheet=getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
  const meta=getSeatMetaV13_();
  const metaMap=new Map(meta.map(s=>[String(s.code).toUpperCase(),s]));
  const all=readParticipants_();

  const movable=all.filter(p=>
    p.active&&!p.arrived&&!isParticipationExcluded_(p)&&!p.disabledPerson&&
    !parseSeatList_(p.seat).some(code=>{
      const m=metaMap.get(String(code).toUpperCase());
      return m&&String(m.category||'').toLowerCase().includes('vip');
    })
  );

  movable.forEach(p=>sheet.getRange(p.rowNumber,5).setValue(''));
  SpreadsheetApp.flush();

  const movableIds=new Set(movable.map(p=>p.id));
  const occupied=new Set();
  readParticipants_().forEach(p=>{
    if(movableIds.has(p.id)||isParticipationExcluded_(p))return;
    parseSeatList_(p.seat).forEach(s=>occupied.add(String(s).toUpperCase()));
  });

  let free=generalSeatCodesV30_()
    .filter(code=>!occupied.has(code))
    .sort((a,b)=>seatRankV30_(a)-seatRankV30_(b));

  const groups=new Map();
  movable.forEach(p=>{
    const group=String(p.companionGroup||'').trim();
    const org=String(p.organization||'').trim();
    const key=group?'G:'+group:(org?'O:'+org:'S:'+String(p.number).padStart(6,'0'));
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(p);
  });

  const ordered=[...groups.entries()].sort((a,b)=>{
    if(a[0].startsWith('G:')&&!b[0].startsWith('G:'))return-1;
    if(!a[0].startsWith('G:')&&b[0].startsWith('G:'))return 1;
    return a[0].localeCompare(b[0],'ko');
  });

  const moved=[];
  ordered.forEach(([key,members])=>{
    members.sort((a,b)=>a.number-b.number);
    let chosen=findConsecutiveGroupV30_(free,members.length);
    if(!chosen.length)chosen=free.slice(0,members.length);
    const picked=new Set(chosen);
    free=free.filter(x=>!picked.has(x));
    members.forEach((p,i)=>{
      const seat=chosen[i]||'';
      sheet.getRange(p.rowNumber,5).setValue(seat);
      moved.push({id:p.id,name:p.name,seat});
    });
  });

  SpreadsheetApp.flush();
  appendLog_('좌석 재정렬',{},station,'동반그룹·소속기관 기준 '+moved.length+'명');
  return{movedCount:moved.length,moved};
}

function adminImportExcelRowsV30_(payload,station){
  const rows=Array.isArray(payload.rows)?payload.rows.slice(0,1000):[];
  if(!rows.length)throw new Error('가져올 참가자 데이터가 없습니다.');
  const lock=LockService.getScriptLock();
  lock.waitLock(30000);
  try{
    const sheet=getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
    const settings=getSettings_();
    const allParticipants=readAllParticipants_();
    const usedCodes=new Set(allParticipants.map(p=>p.id));
    let nextNumber=nextParticipantNumber_(allParticipants);
    const working=readParticipants_().slice();
    const results=[];

    rows.forEach((raw,index)=>{
      try{
        const name=cleanText_(raw.name,40);
        if(!name)throw new Error('이름 없음');
        const digits=normalizePhoneDigits_(raw.phone||'');
        const phone=digits?formatPhone_(digits):cleanText_(raw.phone,30);
        const organization=cleanText_(raw.organization,80);
        const rawSeat=String(raw.seat||'').trim().toUpperCase();
        const excluded=rawSeat==='미참여'||String(raw.status||'').trim()==='미참여';

        let seat='';
        if(!excluded){
          if(/^([A-Y])([LR])-(0[1-6])$/.test(rawSeat)){
            const occupied=new Set(working.flatMap(p=>parseSeatList_(p.seat).map(s=>String(s).toUpperCase())));
            if(!occupied.has(rawSeat))seat=rawSeat;
          }
          if(!seat&&settings.autoAssignSeat)seat=findIndividualSeatV24_(working,false,false,'')||'';
        }

        const number=nextNumber++;
        const qr=createUniqueCode_(number,usedCodes);
        usedCodes.add(qr);
        const now=new Date();
        const row=[
          number,qr,name,phone,seat,'개인신청','엑셀 가져오기',
          false,'','',now,now,true,
          organization,1,
          false,'','관리자 엑셀 가져오기',
          false,'',
          false,false,'','',
          0,false,'',false,
          '',
          excluded?'미참여':'참여'
        ];
        const written=writeParticipantRow_(sheet,row);
        const p=rowToParticipant_(row,written);
        working.push(p);
        results.push({ok:true,row:index+2,name,seat,status:excluded?'미참여':'참여',id:qr});
      }catch(error){
        results.push({ok:false,row:index+2,error:error.message||String(error)});
      }
    });

    SpreadsheetApp.flush();
    appendLog_('엑셀 참가자 가져오기',{},station,'성공 '+results.filter(r=>r.ok).length+' / 실패 '+results.filter(r=>!r.ok).length);
    return{total:results.length,success:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,results};
  }finally{
    lock.releaseLock();
  }
}


function findAccessibleTripletV31_(occupied){
  const zones=[];
  ['A','B','C','D'].forEach(row=>{zones.push([row+'L-01',row+'L-02',row+'L-03']);zones.push([row+'R-04',row+'R-05',row+'R-06']);});
  return zones.find(block=>block.every(code=>!occupied[code]))||[];
}
function assignSpecificGroupSeatsV31_(ids){
  const sheet=getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
  const members=ids.map(id=>{const t=findParticipantRowByCode_(sheet,id);return t?readParticipantAtRow_(sheet,t.rowNumber):null;}).filter(Boolean);
  if(!members.length)return{moved:[]};
  const memberIds=new Set(members.map(p=>p.id));
  const others=readParticipants_().filter(p=>!memberIds.has(p.id)&&!isParticipationExcluded_(p));
  const occupied=getSeatOccupantMapV13_(others,{}),moved=[],assignedIds=new Set();
  members.forEach(p=>sheet.getRange(p.rowNumber,5).setValue('')); SpreadsheetApp.flush();
  const wheel=members.filter(p=>p.wheelchairUser),normal=members.filter(p=>!p.wheelchairUser);
  wheel.forEach(w=>{
    const block=findAccessibleTripletV31_(occupied); if(!block.length)return;
    const companions=normal.filter(p=>!assignedIds.has(p.id)).slice(0,2),pack=[w].concat(companions);
    pack.forEach((p,i)=>{const seat=block[i];if(!seat)return;sheet.getRange(p.rowNumber,5).setValue(seat);occupied[seat]=true;assignedIds.add(p.id);moved.push({id:p.id,name:p.name,seat,wheelchairBlock:true});});
  });
  wheel.filter(p=>!assignedIds.has(p.id)).forEach(p=>{const seat=DISABLED_ACCESSIBLE_CODES_V31.find(c=>!occupied[c])||'';if(seat){sheet.getRange(p.rowNumber,5).setValue(seat);occupied[seat]=true;assignedIds.add(p.id);moved.push({id:p.id,name:p.name,seat,wheelchairBlock:true});}});
  const remaining=members.filter(p=>!assignedIds.has(p.id));
  if(remaining.length){
    const temp=others.concat(moved.map(m=>({id:m.id,seat:m.seat,active:true})));
    const codes=parseSeatList_(findFirstAvailableSeatBlock_(getSettings_(),temp,remaining.length));
    remaining.forEach((p,i)=>{let seat=codes[i]||'';if(!seat){const cur=readParticipants_().filter(x=>x.id!==p.id);seat=findIndividualSeatV24_(cur,false,p.disabledPerson,p.id)||'';}if(seat){sheet.getRange(p.rowNumber,5).setValue(seat);moved.push({id:p.id,name:p.name,seat,wheelchairBlock:false});}});
  }
  SpreadsheetApp.flush(); return{moved};
}
function publicRegisterGroupV31_(payload){
  if(!toBoolean_(payload.privacyConsentConfirmed))throw new Error('개인정보 처리 동의가 필요합니다.');
  if(String(payload.privacyVersion||'')!==PRIVACY_CONSENT_VERSION)throw new Error('개인정보 동의서가 변경되었습니다. 다시 확인해 주세요.');

  const members=Array.isArray(payload.members)?payload.members:[];
  if(members.length<2)throw new Error('함께 신청할 참가자를 2명 이상 입력해 주세요.');
  if(members.length>10)throw new Error('한 번에 최대 10명까지 신청할 수 있습니다.');

  const digits=normalizePhoneDigits_(payload.phone||'');
  if(digits.length<10||digits.length>11)throw new Error('대표 연락처를 정확히 입력해 주세요.');

  const organization=cleanText_(payload.organization,80);
  const groupCode=newCompanionGroupCode_();
  const ids=[];

  members.forEach((member,index)=>{
    const name=cleanText_(member.name,40);
    if(!name)throw new Error((index+1)+'번째 참가자 이름을 입력해 주세요.');

    const r=publicRegisterParticipant_({
      name,
      phone:formatPhone_(digits),
      organization,
      disabledPerson:toBoolean_(member.disabledPerson),
      wheelchairUser:toBoolean_(member.wheelchairUser),
      usesCenter:toBoolean_(member.usesCenter),
      privacyConsentConfirmed:true,
      privacyVersion:PRIVACY_CONSENT_VERSION,
      sensitiveConsent:true,
      startedAt:Date.now()-2000
    });

    ids.push(r.participant.id);

    const sh=getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
    const t=findParticipantRowByCode_(sh,r.participant.id);
    if(t)sh.getRange(t.rowNumber,29).setValue(groupCode);
  });

  // v8.4: 동반신청도 신청 단계에서는 좌석을 배정하지 않습니다.
  // companionGroup만 저장해 두고 현장 입장 순서 배정 때 활용합니다.
  const sh=getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
  const participants=ids.map(id=>{
    const t=findParticipantRowByCode_(sh,id);
    return t?publicParticipant_(readParticipantAtRow_(sh,t.rowNumber)):null;
  }).filter(Boolean);

  appendLog_(
    '특수 다중 참가신청',
    {},
    '모바일 초대장',
    participants.length+'명 / '+groupCode+' / 좌석 미배정'
  );

  clearPublicBootstrapCacheV352_();

  return{
    participants,
    groupCode,
    counts:{
      total:participants.length,
      disabled:participants.filter(p=>p.disabledPerson).length,
      wheelchair:participants.filter(p=>p.wheelchairUser).length
    }
  };
}
function isLegacyOrCurrentVipSeatV31_(seat){
  const c=normalizeSeat_(seat);
  const legacy=[];

  // v3.1/v3.2: A~D 중앙 6석
  ['A','B','C','D'].forEach(r=>{
    for(let n=4;n<=6;n++)legacy.push(r+'L-'+String(n).padStart(2,'0'));
    for(let n=1;n<=3;n++)legacy.push(r+'R-'+String(n).padStart(2,'0'));
  });

  // 더 이전 10+10 구조의 VIP
  ['A','B','C','D'].forEach(r=>{
    for(let n=8;n<=10;n++)legacy.push(r+'L-'+String(n).padStart(2,'0'));
    for(let n=1;n<=3;n++)legacy.push(r+'R-'+String(n).padStart(2,'0'));
  });

  return legacy.includes(c);
}
function adminReassignAllSeatsV31_(payload,station){
  clearAdminExtrasCacheV301_();
  const lock=LockService.getScriptLock(); lock.waitLock(30000);
  try{
    const sheet=getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
    if(!sheet)throw new Error('참가자 시트를 찾지 못했습니다.');
    const participants=readParticipants_();
    const active=participants.filter(p=>p.active&&!isParticipationExcluded_(p));
    const vipSet={}; SMART_VIP_CODES_V17.forEach(c=>vipSet[c]=true);
    const wcSet={}; DISABLED_ACCESSIBLE_CODES_V31.forEach(c=>wcSet[c]=true);
    let keptReserved=0, cleared=0; const now=new Date();
    active.forEach(function(p){
      if(p.arrived)return;
      const seat=normalizeSeat_(p.seat||''); if(!seat)return;
      const keepVip=isExplicitVipParticipantV83_(p)&&vipSet[seat];
      const keepWheelchair=p.wheelchairUser&&wcSet[seat];
      if(keepVip||keepWheelchair){keptReserved++; return;}
      sheet.getRange(p.rowNumber,5).setValue('');
      sheet.getRange(p.rowNumber,12).setValue(now);
      cleared++;
    });
    clearAdminExtrasCacheV301_(); clearPublicBootstrapCacheV352_();
    appendLog_('좌석 미배정 모드 준비',{},station,'예약좌석 유지 '+keptReserved+' / 일반 사전좌석 초기화 '+cleared);
    return{ok:true,keptReserved,clearedGeneral:cleared,deferred:true};
  }finally{lock.releaseLock();}
}

function publicRegisterParticipant_(payload){
  if(cleanText_(payload.website,100))throw new Error('신청을 처리하지 못했습니다.');

  const startedAt=Number(payload.startedAt)||0;
  if(startedAt&&Date.now()-startedAt<900){
    throw new Error('입력 내용을 확인한 뒤 다시 신청해 주세요.');
  }

  if(!toBoolean_(payload.privacyConsentConfirmed)){
    throw new Error('개인정보 처리 동의가 필요합니다.');
  }
  if(String(payload.privacyVersion||'')!==PRIVACY_CONSENT_VERSION){
    throw new Error('개인정보 동의서가 변경되었습니다. 다시 확인해 주세요.');
  }

  const input=normalizeParticipantInput_(payload);
  const sensitiveNeeded=input.disabledPerson;
  const sensitiveConsent=toBoolean_(payload.privacyConsentConfirmed);
  const digits=normalizePhoneDigits_(input.phone);

  if(!input.name)throw new Error('이름을 입력하세요.');
  if(digits.length<10||digits.length>11)throw new Error('연락처를 정확히 입력하세요.');
  input.phone=formatPhone_(digits);

  const lock=LockService.getScriptLock();
  lock.waitLock(30000);

  try{
    const settings=getSettings_();
    const participants=readParticipants_();
    const allParticipants=readAllParticipants_();

    if(!settings.registrationOpen){
      throw new Error('현재 온라인 참가 신청이 마감되어 있습니다.');
    }

    const same=participants.find(p=>
      normalizeName_(p.name)===normalizeName_(input.name)&&
      normalizePhoneDigits_(p.phone)===digits
    );

    if(same){
      const sheet=getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
      const now=new Date();

      sheet.getRange(same.rowNumber,3).setValue(input.name);
      sheet.getRange(same.rowNumber,4).setValue(input.phone);
      sheet.getRange(same.rowNumber,6).setValue('개인신청');
      sheet.getRange(same.rowNumber,7).setValue('');
      sheet.getRange(same.rowNumber,12).setValue(now);
      sheet.getRange(same.rowNumber,14).setValue(input.organization);
      sheet.getRange(same.rowNumber,15).setValue(1);
      sheet.getRange(same.rowNumber,16,1,3).setValues([[
        true,now,PRIVACY_CONSENT_VERSION
      ]]);
      sheet.getRange(same.rowNumber,21).setValue(input.wheelchairUser);
      sheet.getRange(same.rowNumber,22).setValue(sensitiveNeeded?sensitiveConsent:false);
      sheet.getRange(same.rowNumber,23).setValue(sensitiveNeeded?now:'');
      sheet.getRange(same.rowNumber,24).setValue(
        sensitiveNeeded?SENSITIVE_CONSENT_VERSION_V13:''
      );
      sheet.getRange(same.rowNumber,25).setValue(input.wheelchairUser?1:0);
      sheet.getRange(same.rowNumber,26).setValue(input.usesCenter);
      sheet.getRange(same.rowNumber,27).setValue('');
      sheet.getRange(same.rowNumber,28).setValue(input.disabledPerson);
      sheet.getRange(same.rowNumber,30).setValue('참여');

      // 기존 좌석이 비어 있어도 온라인 신청 단계에서는 새 좌석을 배정하지 않습니다.
      const refreshed=readParticipantAtRow_(sheet,same.rowNumber);
      appendLog_('개인신청 기존 QR 확인',refreshed,'모바일 초대장','좌석 미배정 접수');

      const refreshedList=readParticipants_();
      return{
        participant:publicParticipant_(refreshed),
        existing:true,
        settings:Object.assign(
          {},publicSettings_(settings),
          registrationCounts_(settings,refreshedList)
        )
      };
    }

    const counts=registrationCounts_(settings,participants);
    if(counts.remainingCount<1){
      throw new Error(
        '온라인 사전접수가 마감되었습니다. 이후 참석자분들은 스탠딩석으로 안내드리며, 행사 당일 현장에 오셔서 잔여 좌석이 있는 경우 현장에서 좌석을 배정받아 주시기 바랍니다.'
      );
    }

    // 일반/휠체어 여부와 관계없이 온라인 신청 단계에서는 좌석번호를 만들지 않습니다.
    // 내빈석·장애인석은 행사 전 관리자 화면에서 필요한 대상만 미리 지정합니다.
    const seat='';

    const sheet=getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
    const number=nextParticipantNumber_(allParticipants);
    const qr=createUniqueCode_(number,new Set(allParticipants.map(p=>p.id)));
    const now=new Date();

    const row=[
      number,qr,input.name,input.phone,seat,'개인신청','',
      false,'','',now,now,true,
      input.organization,1,
      true,now,PRIVACY_CONSENT_VERSION,
      false,'',
      input.wheelchairUser,
      sensitiveNeeded?sensitiveConsent:false,
      sensitiveNeeded?now:'',
      sensitiveNeeded?SENSITIVE_CONSENT_VERSION_V13:'',
      input.wheelchairUser?1:0,
      input.usesCenter,
      '',
      input.disabledPerson,
      '',
      '참여'
    ];

    const written=writeParticipantRow_(sheet,row);
    const p=rowToParticipant_(row,written);

    appendLog_(
      '개인 참가신청',p,'모바일 초대장',
      '좌석 미배정 접수'+(input.wheelchairUser?' / 휠체어 이용':'')
    );

    const next=participants.concat([p]);
    clearPublicBootstrapCacheV352_();

    return{
      participant:publicParticipant_(p),
      existing:false,
      settings:Object.assign(
        {},publicSettings_(settings),
        registrationCounts_(settings,next)
      )
    };
  }finally{
    lock.releaseLock();
  }
}

/* ======================================================================
 * v7.6 REPRESENTATIVE QR + INVITATION MESSAGE
 *
 * - 관리자 지정 동행 대표자
 * - 대표자 QR 1개로 동행그룹 전체 체크인
 * - 개인 QR 링크 카카오 알림톡 즉시/예약 발송
 * - SOLAPI 비밀키는 Script Properties에만 저장
 * ====================================================================== */

const REPRESENTATIVE_MASTER_MARKER_V76 = '[REPQR:MASTER:';
const REPRESENTATIVE_MEMBER_MARKER_V76 = '[REPQR:MEMBER:';
const SCHEDULED_INVITATION_PROPERTY_V76 = 'NYJ20_SCHEDULED_INVITATION_V76';

// GitHub Pages에 올릴 ticket.html의 고정 주소입니다.
// 저장소 주소가 바뀌면 이 값만 수정하세요.
const PUBLIC_TICKET_BASE_URL_V76 =
  'https://flydown98.github.io/nyjwel20thVIPCHECK/ticket.html';

function stripRepresentativeMarkerV76_(note) {
  return String(note || '')
    .replace(/\s*\[REPQR:MASTER:[A-Z0-9_-]+\]\s*/ig, ' ')
    .replace(/\s*\[REPQR:MEMBER:[A-Z0-9_-]+\]\s*/ig, ' ')
    .replace(/\s*\[REPQR:LABEL:[^\]]+\]\s*/ig, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}


function representativeGroupLabelV80_(participant) {
  const note = String(participant && participant.note || '');
  const match = note.match(/\[REPQR:LABEL:([^\]]+)\]/i);
  if (!match) return '';
  try {
    return decodeURIComponent(String(match[1] || ''));
  } catch (_) {
    return String(match[1] || '');
  }
}

function representativeLabelMarkerV80_(label) {
  const value = cleanText_(label || '', 80);
  return value ? '[REPQR:LABEL:' + encodeURIComponent(value) + ']' : '';
}

function representativeMarkerInfoV76_(participant) {
  const note = String(participant && participant.note || '');
  let match = note.match(/\[REPQR:MASTER:([A-Z0-9_-]+)\]/i);
  if (match) {
    return {
      role: 'master',
      representativeId: String(match[1] || '').trim().toUpperCase()
    };
  }

  match = note.match(/\[REPQR:MEMBER:([A-Z0-9_-]+)\]/i);
  if (match) {
    return {
      role: 'member',
      representativeId: String(match[1] || '').trim().toUpperCase()
    };
  }

  return null;
}

function representativeMembersV76_(representativeId) {
  const repId = extractCode_(representativeId);
  if (!repId) return [];

  return readParticipants_().filter(function(p) {
    const info = representativeMarkerInfoV76_(p);
    return info && info.representativeId === repId;
  });
}

function adminSetRepresentativeGroupV76_(payload, station) {
  payload = payload || {};
  const ids = Array.isArray(payload.ids)
    ? payload.ids.map(extractCode_).filter(Boolean)
    : [];
  const unique = [...new Set(ids)];
  const representativeId = extractCode_(
    payload.representativeId || payload.masterId || payload.repId
  );

  if (unique.length < 2) {
    throw new Error('대표자 그룹은 2명 이상 선택해 주세요.');
  }
  if (unique.length > 30) {
    throw new Error('대표자 그룹은 한 번에 최대 30명까지 지정할 수 있습니다.');
  }
  if (!representativeId || unique.indexOf(representativeId) < 0) {
    throw new Error('선택한 참가자 중 대표자 한 명을 지정해 주세요.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sheet = getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
    const selected = [];

    unique.forEach(function(id) {
      const target = findParticipantRowByCode_(sheet, id);
      if (!target) throw new Error('선택한 참가자를 찾을 수 없습니다: ' + id);

      const participant = readParticipantAtRow_(sheet, target.rowNumber);
      if (!participant.active) {
        throw new Error(participant.name + ' 님은 참여불가 상태입니다.');
      }

      const previous = representativeMarkerInfoV76_(participant);
      if (previous) {
        throw new Error(
          participant.name +
          ' 님은 이미 다른 대표자 그룹에 포함되어 있습니다. 기존 그룹을 먼저 해제해 주세요.'
        );
      }

      selected.push({
        rowNumber: target.rowNumber,
        participant: participant
      });
    });

    const representative = selected.find(function(item) {
      return item.participant.id === representativeId;
    });
    if (!representative) throw new Error('대표자를 찾지 못했습니다.');

    // 기존 companionGroup과 동일한 열(29)을 사용합니다.
    const companionGroup = newCompanionGroupCode_();
    const now = new Date();

    selected.forEach(function(item) {
      const p = item.participant;
      const cleanNote = stripRepresentativeMarkerV76_(p.note);
      const marker = p.id === representativeId
        ? '[REPQR:MASTER:' + representativeId + ']'
        : '[REPQR:MEMBER:' + representativeId + ']';

      sheet.getRange(item.rowNumber, 7).setValue(
        cleanNote ? cleanNote + ' ' + marker : marker
      );
      sheet.getRange(item.rowNumber, 12).setValue(now);
      sheet.getRange(item.rowNumber, 29).setValue(companionGroup);
    });

    SpreadsheetApp.flush();
    clearPublicBootstrapCacheV352_();
    clearParticipantRowIndexV80_();

    appendLog_(
      '대표자 동행그룹 지정',
      representative.participant,
      station,
      '대표 ' + representative.participant.name +
      ' / 총 ' + selected.length + '명 / ' +
      selected.map(function(item) { return item.participant.name; }).join(', ')
    );

    return {
      representativeId: representativeId,
      representativeName: representative.participant.name,
      companionGroup: companionGroup,
      count: selected.length,
      members: selected.map(function(item) {
        return {
          id: item.participant.id,
          name: item.participant.name,
          representative: item.participant.id === representativeId
        };
      })
    };
  } finally {
    lock.releaseLock();
  }
}


function adminUpdateRepresentativeGroupV80_(payload, station) {
  payload = payload || {};

  const oldRepresentativeId = extractCode_(
    payload.representativeId || payload.oldRepresentativeId || payload.id
  );
  const newRepresentativeId = extractCode_(
    payload.newRepresentativeId || payload.masterId || oldRepresentativeId
  );
  const ids = Array.isArray(payload.ids)
    ? payload.ids.map(extractCode_).filter(Boolean)
    : [];
  const unique = [...new Set(ids)];
  const label = cleanText_(payload.label || '', 80);

  if (!oldRepresentativeId) throw new Error('수정할 대표자 그룹 코드가 없습니다.');
  if (unique.length < 2) throw new Error('대표자 그룹은 2명 이상이어야 합니다.');
  if (unique.length > 30) throw new Error('대표자 그룹은 최대 30명까지 지정할 수 있습니다.');
  if (!newRepresentativeId || unique.indexOf(newRepresentativeId) < 0) {
    throw new Error('그룹 구성원 중 대표자 한 명을 선택해 주세요.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sheet = getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
    const all = readParticipants_();

    const oldMembers = all.filter(function(p) {
      const info = representativeMarkerInfoV76_(p);
      return info && info.representativeId === oldRepresentativeId;
    });

    if (!oldMembers.length) throw new Error('수정할 대표자 그룹을 찾지 못했습니다.');

    const oldMemberIds = {};
    oldMembers.forEach(function(p){ oldMemberIds[p.id] = true; });

    const selected = [];
    unique.forEach(function(id) {
      const target = findParticipantRowByCode_(sheet, id);
      if (!target) throw new Error('참가자를 찾을 수 없습니다: ' + id);

      const participant = readParticipantAtRow_(sheet, target.rowNumber);
      if (!participant.active || isParticipationExcluded_(participant)) {
        throw new Error(participant.name + ' 님은 현재 참여 가능한 상태가 아닙니다.');
      }

      const marker = representativeMarkerInfoV76_(participant);
      if (marker && !oldMemberIds[participant.id]) {
        throw new Error(
          participant.name + ' 님은 다른 대표자 그룹에 포함되어 있습니다.'
        );
      }

      selected.push({
        rowNumber: target.rowNumber,
        participant: participant
      });
    });

    const companionGroup =
      (oldMembers.find(function(p){ return p.companionGroup; }) || {}).companionGroup ||
      newCompanionGroupCode_();

    const now = new Date();

    // 기존 그룹 구성원은 먼저 표식을 제거합니다.
    oldMembers.forEach(function(p) {
      const target = findParticipantRowByCode_(sheet, p.id);
      if (!target) return;
      sheet.getRange(target.rowNumber, 7).setValue(
        stripRepresentativeMarkerV76_(p.note)
      );
      sheet.getRange(target.rowNumber, 12).setValue(now);
      sheet.getRange(target.rowNumber, 29).setValue('');
    });

    // 새 구성으로 다시 기록
    selected.forEach(function(item) {
      const p = item.participant;
      const baseNote = stripRepresentativeMarkerV76_(p.note);
      const roleMarker = p.id === newRepresentativeId
        ? '[REPQR:MASTER:' + newRepresentativeId + ']'
        : '[REPQR:MEMBER:' + newRepresentativeId + ']';
      const labelMarker = p.id === newRepresentativeId
        ? representativeLabelMarkerV80_(label)
        : '';

      const parts = [baseNote, roleMarker, labelMarker].filter(Boolean);
      sheet.getRange(item.rowNumber, 7).setValue(parts.join(' '));
      sheet.getRange(item.rowNumber, 12).setValue(now);
      sheet.getRange(item.rowNumber, 29).setValue(companionGroup);
    });

    clearPublicBootstrapCacheV352_();
    clearParticipantRowIndexV80_();

    const representative = selected.find(function(item) {
      return item.participant.id === newRepresentativeId;
    });

    appendLog_(
      '대표자 동행그룹 수정',
      representative.participant,
      station,
      '그룹명 ' + (label || '-') +
      ' / 대표 ' + representative.participant.name +
      ' / 총 ' + selected.length + '명'
    );

    return {
      oldRepresentativeId: oldRepresentativeId,
      representativeId: newRepresentativeId,
      representativeName: representative.participant.name,
      label: label,
      count: selected.length,
      members: selected.map(function(item) {
        return {
          id: item.participant.id,
          name: item.participant.name,
          representative: item.participant.id === newRepresentativeId
        };
      })
    };
  } finally {
    lock.releaseLock();
  }
}

function adminClearRepresentativeGroupV76_(payload, station) {
  payload = payload || {};
  const representativeId = extractCode_(
    payload.representativeId || payload.masterId || payload.repId || payload.id
  );
  if (!representativeId) throw new Error('해제할 대표자 코드가 없습니다.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sheet = getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
    const all = readParticipants_();
    const members = all.filter(function(p) {
      const info = representativeMarkerInfoV76_(p);
      return info && info.representativeId === representativeId;
    });

    if (!members.length) throw new Error('대표자 그룹을 찾지 못했습니다.');

    members.forEach(function(p) {
      const target = findParticipantRowByCode_(sheet, p.id);
      if (!target) return;

      sheet.getRange(target.rowNumber, 7).setValue(
        stripRepresentativeMarkerV76_(p.note)
      );
      sheet.getRange(target.rowNumber, 12).setValue(new Date());
      sheet.getRange(target.rowNumber, 29).setValue('');
    });

    SpreadsheetApp.flush();
    clearPublicBootstrapCacheV352_();
    clearParticipantRowIndexV80_();

    const representative = members.find(function(p) {
      return p.id === representativeId;
    }) || members[0];

    appendLog_(
      '대표자 동행그룹 해제',
      representative,
      station,
      members.map(function(p) { return p.name; }).join(', ')
    );

    return {
      representativeId: representativeId,
      count: members.length,
      names: members.map(function(p) { return p.name; })
    };
  } finally {
    lock.releaseLock();
  }
}

function checkInRepresentativeGroupV76_(payload, station) {
  payload = payload || {};
  const representativeId = extractCode_(
    payload.representativeId || payload.code || payload.id
  );
  if (!representativeId) throw new Error('대표자 QR 코드가 없습니다.');

  const all = readParticipants_();
  const representative = all.find(function(p) {
    return p.id === representativeId;
  });

  if (!representative) throw new Error('대표 참가자를 찾지 못했습니다.');

  const repInfo = representativeMarkerInfoV76_(representative);
  if (!repInfo || repInfo.role !== 'master' || repInfo.representativeId !== representativeId) {
    throw new Error('이 QR은 동행 대표자 QR로 지정되어 있지 않습니다.');
  }

  const membersBefore = all.filter(function(p) {
    const info = representativeMarkerInfoV76_(p);
    return info &&
      info.representativeId === representativeId &&
      p.active &&
      !isParticipationExcluded_(p);
  });

  if (!membersBefore.length) throw new Error('대표자 그룹에 참여 가능한 인원이 없습니다.');

  let checkedInNow = 0;
  const results = [];

  // checkInParticipant_ 내부에서 각각 LockService를 사용하므로,
  // 여기서는 별도 전체 Lock을 잡지 않고 한 명씩 순차 처리합니다.
  membersBefore.forEach(function(p) {
    if (p.arrived) {
      results.push({
        id: p.id,
        name: p.name,
        alreadyArrived: true
      });
      return;
    }

    const checked = checkInParticipant_({ code: p.id }, station || '대표자 QR');
    checkedInNow += 1;
    results.push({
      id: p.id,
      name: p.name,
      alreadyArrived: false,
      participant: checked
    });
  });

  const fresh = readParticipants_();
  const membersAfter = fresh.filter(function(p) {
    const info = representativeMarkerInfoV76_(p);
    return info && info.representativeId === representativeId;
  });

  const freshRepresentative = membersAfter.find(function(p) {
    return p.id === representativeId;
  }) || representative;

  appendLog_(
    '대표자 QR 그룹 도착',
    freshRepresentative,
    station,
    '그룹 ' + membersAfter.length + '명 / 이번 도착 ' + checkedInNow + '명'
  );

  return {
    representative: freshRepresentative,
    members: membersAfter,
    total: membersAfter.length,
    checkedInNow: checkedInNow,
    results: results
  };
}

/* -------------------------- 메시지 발송 -------------------------- */

function invitationMessageConfigStatusV76_() {
  const props = PropertiesService.getScriptProperties();
  const required = [
    'SOLAPI_API_KEY',
    'SOLAPI_API_SECRET',
    'SOLAPI_SENDER',
    'SOLAPI_KAKAO_PF_ID',
    'SOLAPI_KAKAO_TEMPLATE_ID'
  ];
  const missing = required.filter(function(key) {
    return !String(props.getProperty(key) || '').trim();
  });

  return {
    ready: missing.length === 0,
    missing: missing,
    ticketBaseUrl: PUBLIC_TICKET_BASE_URL_V76
  };
}

function solapiConfigV76_() {
  const props = PropertiesService.getScriptProperties();
  const cfg = {
    apiKey: String(props.getProperty('SOLAPI_API_KEY') || '').trim(),
    apiSecret: String(props.getProperty('SOLAPI_API_SECRET') || '').trim(),
    sender: normalizePhoneDigits_(props.getProperty('SOLAPI_SENDER')),
    pfId: String(props.getProperty('SOLAPI_KAKAO_PF_ID') || '').trim(),
    templateId: String(props.getProperty('SOLAPI_KAKAO_TEMPLATE_ID') || '').trim()
  };

  const missing = [];
  Object.keys(cfg).forEach(function(key) {
    if (!cfg[key]) missing.push(key);
  });
  if (missing.length) {
    throw new Error('SOLAPI 설정이 없습니다: ' + missing.join(', '));
  }
  return cfg;
}

function bytesToHexV76_(bytes) {
  return bytes.map(function(b) {
    const value = b < 0 ? b + 256 : b;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function solapiAuthorizationV76_(cfg) {
  const date = new Date().toISOString();
  const salt = Utilities.getUuid().replace(/-/g, '');
  const signature = bytesToHexV76_(
    Utilities.computeHmacSha256Signature(date + salt, cfg.apiSecret)
  );

  return 'HMAC-SHA256 apiKey=' + cfg.apiKey +
    ', date=' + date +
    ', salt=' + salt +
    ', signature=' + signature;
}

function publicTicketUrlV76_(participant) {
  return PUBLIC_TICKET_BASE_URL_V76 +
    '?code=' + encodeURIComponent(String(participant.id || ''));
}

function invitationMessageRecipientsV76_(target) {
  const mode = String(target || 'all').trim();
  let participants = readParticipants_().filter(function(p) {
    return p.active &&
      !isParticipationExcluded_(p) &&
      normalizePhoneDigits_(p.phone).length >= 10;
  });

  if (mode === 'pending') {
    participants = participants.filter(function(p) { return !p.arrived; });
  } else if (mode === 'representatives') {
    participants = participants.filter(function(p) {
      const info = representativeMarkerInfoV76_(p);
      return info && info.role === 'master';
    });
  } else if (mode !== 'all') {
    throw new Error('알 수 없는 발송 대상입니다: ' + mode);
  }

  return participants;
}

function buildSolapiMessageV76_(cfg, participant, eventName) {
  const phone = normalizePhoneDigits_(participant.phone);
  const ticketUrl = publicTicketUrlV76_(participant);
  const info = representativeMarkerInfoV76_(participant);
  const groupSize = info && info.role === 'master'
    ? representativeMembersV76_(participant.id).length
    : 1;

  let fallbackText =
    participant.name + '님, ' + eventName + ' 참여 안내드립니다.\n' +
    '아래 링크에서 개인 QR 입장권을 확인해 주세요.\n' +
    ticketUrl;

  if (groupSize > 1) {
    fallbackText += '\n대표자 QR로 동행 ' + groupSize + '명 함께 현장 확인이 가능합니다.';
  }

  return {
    to: phone,
    from: cfg.sender,
    text: fallbackText,
    kakaoOptions: {
      pfId: cfg.pfId,
      templateId: cfg.templateId,
      disableSms: false,
      variables: {
        '#{이름}': String(participant.name || ''),
        '#{링크}': ticketUrl,
        '#{행사명}': eventName,
        '#{동행인원}': String(groupSize)
      }
    }
  };
}

function sendInvitationMessagesV76_(payload, station) {
  payload = payload || {};
  const target = String(payload.target || 'all').trim();
  const participants = invitationMessageRecipientsV76_(target);

  if (!participants.length) throw new Error('발송 가능한 참가자가 없습니다.');
  if (participants.length > 500) throw new Error('한 번에 최대 500명까지 발송할 수 있습니다.');

  const cfg = solapiConfigV76_();
  const settings = getSettings_();
  const eventName = String(settings.eventName || DEFAULT_SETTINGS.eventName);

  const messages = participants.map(function(p) {
    return buildSolapiMessageV76_(cfg, p, eventName);
  });

  const response = UrlFetchApp.fetch(
    'https://api.solapi.com/messages/v4/send-many',
    {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: {
        Authorization: solapiAuthorizationV76_(cfg)
      },
      payload: JSON.stringify({ messages: messages })
    }
  );

  const status = response.getResponseCode();
  const text = response.getContentText();
  let result;
  try {
    result = JSON.parse(text || '{}');
  } catch (_) {
    result = { raw: text };
  }

  if (status < 200 || status >= 300) {
    throw new Error(
      'SOLAPI 발송 실패 HTTP ' + status + ': ' + String(text || '').slice(0, 500)
    );
  }

  appendLog_(
    '초대장 알림톡 일괄발송',
    {},
    station,
    '대상 ' + target + ' / ' + participants.length + '명'
  );

  return {
    requested: participants.length,
    target: target,
    result: result
  };
}

function scheduleInvitationMessagesV76_(payload, station) {
  payload = payload || {};
  const target = String(payload.target || 'all').trim();
  // 대상값 사전 검증
  invitationMessageRecipientsV76_(target);

  const scheduledAt = new Date(String(payload.scheduledAt || ''));
  if (isNaN(scheduledAt.getTime())) throw new Error('예약 일시가 올바르지 않습니다.');
  if (scheduledAt.getTime() <= Date.now() + 60000) {
    throw new Error('예약 일시는 현재보다 최소 1분 이후로 설정해 주세요.');
  }

  // 예약 시점의 개인정보 목록 자체는 Script Properties에 저장하지 않습니다.
  // 발송시점에 최신 참가자 명단을 다시 읽도록 대상 필터만 저장합니다.
  const store = {
    target: target,
    scheduledAt: scheduledAt.toISOString(),
    createdAt: new Date().toISOString()
  };

  const props = PropertiesService.getScriptProperties();
  props.setProperty(
    SCHEDULED_INVITATION_PROPERTY_V76,
    JSON.stringify(store)
  );

  // 같은 기능의 기존 예약은 하나만 유지합니다.
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'runScheduledInvitationMessagesV76_') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('runScheduledInvitationMessagesV76_')
    .timeBased()
    .at(scheduledAt)
    .create();

  appendLog_(
    '초대장 알림톡 예약등록',
    {},
    station,
    target + ' / ' + scheduledAt.toISOString()
  );

  return {
    target: target,
    requested: invitationMessageRecipientsV76_(target).length,
    scheduledAt: scheduledAt.toISOString()
  };
}

function runScheduledInvitationMessagesV76_() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(SCHEDULED_INVITATION_PROPERTY_V76);
  if (!raw) return;

  const store = JSON.parse(raw);
  try {
    sendInvitationMessagesV76_(
      { target: store.target || 'all' },
      'Apps Script 예약발송'
    );
    props.deleteProperty(SCHEDULED_INVITATION_PROPERTY_V76);
  } finally {
    ScriptApp.getProjectTriggers().forEach(function(trigger) {
      if (trigger.getHandlerFunction() === 'runScheduledInvitationMessagesV76_') {
        ScriptApp.deleteTrigger(trigger);
      }
    });
  }
}


/* ======================================================================
 * v9.0 FIELD CHECK-IN FLOW
 * - QR 체크인 시 기념품 자동 지급
 * - 미배정 사전참가자 좌석 자동 배정
 * - 체크인 완료 문자 자동 대기열 등록
 * - 대표자 그룹은 이번 도착 인원 수만큼 처리
 * ====================================================================== */

function hasNoSeatMarkerV90_(participant) {
  return /\[NOSEAT\]/i.test(String(participant && participant.note || ''));
}

function autoAssignSeatForCheckInV90_(participant, station) {
  if (!participant || participant.seat || hasNoSeatMarkerV90_(participant)) return participant;

  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
  const target = findParticipantRowByCode_(sheet, participant.id);
  if (!target) return participant;

  const participants = readParticipants_();
  const settings = getSettings_();
  let seat = '';

  if (participant.wheelchairUser) {
    seat = findWheelchairSeatBlockV13_(participants, 1, participant.id) || '';
  }
  if (!seat) {
    seat = findFirstAvailableSeatBlock_(settings, participants, 1) || '';
  }
  if (!seat) return participant;

  const now = new Date();
  sheet.getRange(target.rowNumber, 5).setValue(seat);
  sheet.getRange(target.rowNumber, 12).setValue(now);
  clearAdminExtrasCacheV301_();
  clearPublicBootstrapCacheV352_();

  const refreshed = readParticipantAtRow_(sheet, target.rowNumber);
  appendLog_('현장 자동 좌석배정', refreshed, station, seat);
  return refreshed;
}

function autoAssignGroupSeatBlockV90_(members, station) {
  const targets = (members || []).filter(function(p) {
    return p && !p.seat && !p.wheelchairUser && !hasNoSeatMarkerV90_(p);
  });
  if (!targets.length || targets.length !== (members || []).length) return null;

  const participants = readParticipants_();
  const seats = parseSeatList_(
    findFirstAvailableSeatBlock_(getSettings_(), participants, targets.length)
  );
  if (seats.length !== targets.length) return null;

  const sheet = getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
  const now = new Date();
  const assigned = [];

  targets.forEach(function(p, i) {
    const target = findParticipantRowByCode_(sheet, p.id);
    if (!target) return;
    sheet.getRange(target.rowNumber, 5).setValue(seats[i]);
    sheet.getRange(target.rowNumber, 12).setValue(now);
    assigned.push({ id: p.id, seat: seats[i] });
  });

  clearAdminExtrasCacheV301_();
  clearPublicBootstrapCacheV352_();
  appendLog_(
    '단체 현장 자동 좌석배정',
    targets[0],
    station,
    assigned.map(function(x){ return x.seat; }).join(',')
  );
  return assigned;
}

function ensureGiftReceivedV90_(participant, station) {
  if (!participant) return participant;
  const withGift = withGiftStatusV32_(participant);
  if (withGift.giftReceived) return withGift;
  return setGiftReceivedV32_(
    { code: participant.id, received: true },
    station || 'QR 접수'
  ).participant;
}

function buildCheckInSmsV90_(participant) {
  const seat = String(participant.seat || '').trim();
  return [
    '[남양주시장애인복지관]',
    String(participant.name || '') + '님 현장 접수가 완료되었습니다.',
    '좌석: ' + (seat || '현장 안내'),
    '기념품: 지급완료',
    '개관 20주년 기념행사에 함께해 주셔서 감사합니다.'
  ].join('\n');
}

function queueCheckInSmsV90_(participant) {
  const phone = normalizePhoneDigits_(participant && participant.phone);
  if (phone.length < 10 || phone.length > 11) return '';
  try {
    return enqueueSms(phone, buildCheckInSmsV90_(participant));
  } catch (error) {
    console.error('체크인 문자 대기열 등록 실패: ' + (error.message || error));
    return '';
  }
}

function checkInParticipantV90_(payload, station) {
  payload = payload || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const code = extractCode_(payload.code || payload.id || payload.qr);
    if (!code) throw new Error('QR코드 값이 비어 있습니다.');

    const sheet = getSpreadsheet_().getSheetByName(SHEET_NAMES.PARTICIPANTS);
    const target = findParticipantRowByCode_(sheet, code);
    if (!target) throw new Error('등록되지 않은 QR코드입니다.');

    let participant = readParticipantAtRow_(sheet, target.rowNumber);
    if (!participant.active) {
      throw codedError_('PARTICIPANT_INACTIVE', '참여불가 처리된 참가자입니다.');
    }

    if (participant.arrived) {
      participant = ensureGiftReceivedV90_(participant, station);
      if (!payload.suppressSeat) {
        participant = autoAssignSeatForCheckInV90_(participant, station);
      }
      appendLog_('중복 스캔', participant, station, '기존 도착자 확인');
      return {
        participant: withGiftStatusV32_(participant),
        already: true,
        seatAssignedNow: false,
        smsQueued: false,
        prize: getPrizeForParticipantV24_(participant)
      };
    }

    const now = new Date();
    const statusRange = sheet.getRange(target.rowNumber, 8, 1, 5);
    const values = statusRange.getValues()[0];
    values[0] = true;
    values[1] = now;
    values[4] = now;
    statusRange.setValues([values]);

    participant = readParticipantAtRow_(sheet, target.rowNumber);
    const seatBefore = String(participant.seat || '');

    // 현장 흐름: QR 접수 → 기념품 지급 처리 → 좌석 배정 → 문자 대기열
    participant = ensureGiftReceivedV90_(participant, station);
    if (!payload.suppressSeat) {
      participant = autoAssignSeatForCheckInV90_(participant, station);
    }

    const smsId = payload.suppressSms ? '' : queueCheckInSmsV90_(participant);

    appendLog_(
      'QR 현장 접수 완료',
      participant,
      station,
      '기념품 지급완료 / 좌석 ' + (participant.seat || '미배정') +
      (smsId ? ' / 문자 대기열 등록' : '')
    );

    return {
      participant: withGiftStatusV32_(participant),
      already: false,
      seatAssignedNow: !seatBefore && Boolean(participant.seat),
      giftReceived: true,
      smsQueued: Boolean(smsId),
      smsId: smsId,
      prize: getPrizeForParticipantV24_(participant)
    };
  } finally {
    lock.releaseLock();
  }
}

function checkInRepresentativeGroupV90_(payload, station) {
  payload = payload || {};
  const representativeId = extractCode_(
    payload.representativeId || payload.code || payload.id
  );
  if (!representativeId) throw new Error('대표자 QR 코드가 없습니다.');

  const all = readParticipants_();
  const representative = all.find(function(p){ return p.id === representativeId; });
  if (!representative) throw new Error('대표 참가자를 찾지 못했습니다.');

  const repInfo = representativeMarkerInfoV76_(representative);
  if (!repInfo || repInfo.role !== 'master' || repInfo.representativeId !== representativeId) {
    throw new Error('이 QR은 현재 등록된 단체 대표자 QR이 아닙니다.');
  }

  const members = all.filter(function(p) {
    const info = representativeMarkerInfoV76_(p);
    return info &&
      info.representativeId === representativeId &&
      p.active &&
      !isParticipationExcluded_(p);
  });

  const remaining = members.filter(function(p){ return !p.arrived; });
  if (!remaining.length) {
    return {
      representative: representative,
      members: members,
      total: members.length,
      checkedInNow: 0,
      arrivedTotal: members.length,
      remaining: 0,
      already: true
    };
  }

  const requested = Math.floor(Number(payload.arrivedCount));
  const count = Number.isFinite(requested) && requested > 0
    ? requested
    : remaining.length;

  if (count < 1 || count > remaining.length) {
    throw new Error('이번 도착 인원은 1명부터 남은 ' + remaining.length + '명 사이로 입력해 주세요.');
  }

  const ordered = remaining.slice().sort(function(a,b) {
    if (a.id === representativeId) return -1;
    if (b.id === representativeId) return 1;
    return Number(a.number || 0) - Number(b.number || 0);
  });
  const selected = ordered.slice(0, count);

  // 먼저 도착/기념품을 처리하고, 그 다음 좌석을 배정합니다.
  // 단체는 가능하면 이번 도착 인원을 한 블록으로 붙여 배정합니다.
  const processedBeforeSeat = [];
  selected.forEach(function(p) {
    const r = checkInParticipantV90_(
      { code: p.id, suppressSms: true, suppressSeat: true },
      station || '단체 QR 접수'
    );
    processedBeforeSeat.push(r.participant);
  });

  autoAssignGroupSeatBlockV90_(processedBeforeSeat, station);

  // 한 블록 배정이 불가능하거나 휠체어 이용인이 포함된 경우에는 개별 규칙으로 보완합니다.
  const processed = processedBeforeSeat.map(function(p) {
    let freshP = readParticipants_().find(function(x){ return x.id === p.id; }) || p;
    if (!freshP.seat && !hasNoSeatMarkerV90_(freshP)) {
      freshP = autoAssignSeatForCheckInV90_(freshP, station);
    }
    return ensureGiftReceivedV90_(freshP, station);
  });

  const fresh = readParticipants_();
  const freshMembers = fresh.filter(function(p) {
    const info = representativeMarkerInfoV76_(p);
    return info && info.representativeId === representativeId;
  });
  const arrived = freshMembers.filter(function(p){ return p.arrived; });
  const freshRep = freshMembers.find(function(p){ return p.id === representativeId; }) || representative;

  const seats = processed.map(function(p){ return p.seat || ''; }).filter(Boolean);
  let smsId = '';
  const repPhone = normalizePhoneDigits_(freshRep.phone);
  if (repPhone.length >= 10 && repPhone.length <= 11) {
    const msg = [
      '[남양주시장애인복지관]',
      String(freshRep.name || '') + '님 단체 현장 접수가 완료되었습니다.',
      '이번 접수: ' + processed.length + '명',
      '누적 도착: ' + arrived.length + '/' + freshMembers.length + '명',
      '기념품: 이번 도착 ' + processed.length + '명 지급완료',
      '좌석: ' + (seats.length ? seats.join(', ') : '현장 안내'),
      '개관 20주년 기념행사에 함께해 주셔서 감사합니다.'
    ].join('\n');
    try { smsId = enqueueSms(repPhone, msg); } catch (error) {
      console.error('단체 체크인 문자 대기열 등록 실패: ' + (error.message || error));
    }
  }

  appendLog_(
    '단체 QR 현장 접수',
    freshRep,
    station,
    '총 ' + freshMembers.length + '명 / 이번 ' + processed.length +
    '명 / 누적 ' + arrived.length + '명 / 기념품 자동지급'
  );

  return {
    representative: freshRep,
    members: freshMembers.map(function(p){ return withGiftStatusV32_(p); }),
    total: freshMembers.length,
    checkedInNow: processed.length,
    arrivedTotal: arrived.length,
    remaining: Math.max(0, freshMembers.length - arrived.length),
    seats: seats,
    giftCount: processed.length,
    smsQueued: Boolean(smsId),
    smsId: smsId
  };
}

function smsRelayStatusV90_() {
  const tokenReady = Boolean(getSmsRelayToken_());
  const sheet = smsSheet_();
  const last = sheet.getLastRow();
  let pending = 0;
  if (last >= 2) {
    pending = sheet.getRange(2, 4, last - 1, 1).getDisplayValues()
      .filter(function(r){ return r[0] === '대기' || r[0] === '재시도'; }).length;
  }
  return {
    ready: tokenReady,
    queueSheet: SMS_QUEUE_SHEET,
    pending: pending
  };
}

function preEventRecipientsV90_(target) {
  const mode = String(target || 'all');
  const participants = readParticipants_().filter(function(p) {
    return p.active &&
      !isParticipationExcluded_(p) &&
      normalizePhoneDigits_(p.phone).length >= 10;
  });

  const result = [];
  const seenPhones = {};

  participants.forEach(function(p) {
    const info = representativeMarkerInfoV76_(p);
    if (info && info.role === 'member') return;
    if (mode === 'representatives' && (!info || info.role !== 'master')) return;
    if (mode === 'pending' && p.arrived) return;

    const phone = normalizePhoneDigits_(p.phone);
    if (seenPhones[phone]) return;
    seenPhones[phone] = true;
    result.push(p);
  });
  return result;
}

function buildPreEventSmsV90_(participant) {
  const info = representativeMarkerInfoV76_(participant);
  const groupSize = info && info.role === 'master'
    ? representativeMembersV76_(participant.id).filter(function(p) {
        return p.active && !isParticipationExcluded_(p);
      }).length
    : 1;

  const lines = [
    '[남양주시장애인복지관]',
    String(participant.name || '') + '님, 내일 개관 20주년 기념행사가 진행됩니다.',
    '일시: 2026. 9. 17.(목) 13:30',
    '장소: 남양주금곡실내체육관'
  ];

  if (groupSize > 1) lines.push('사전 등록 인원: ' + groupSize + '명');

  lines.push(
    '사전 신청 인원에 변동이 있거나 참석이 어려운 분이 있을 경우 복지관으로 연락 부탁드립니다.',
    '추가 인원은 현장 참여가 가능하나 좌석은 배정받지 못할 수 있습니다.',
    '행사 당일 QR 입장권을 준비해 주세요. 감사합니다.'
  );
  return lines.join('\n');
}

function queuePreEventSmsV90_(payload, station) {
  payload = payload || {};
  const recipients = preEventRecipientsV90_(payload.target || 'all');
  if (!recipients.length) throw new Error('발송 대상이 없습니다.');

  let queued = 0;
  const errors = [];

  recipients.forEach(function(p) {
    try {
      enqueueSms(p.phone, buildPreEventSmsV90_(p));
      queued += 1;
    } catch (error) {
      errors.push((p.name || p.id) + ': ' + (error.message || error));
    }
  });

  appendLog_(
    '행사 전날 안내문자 대기열 등록',
    {},
    station,
    '대상 ' + recipients.length + '명 / 등록 ' + queued + '건'
  );

  return {
    requested: recipients.length,
    queued: queued,
    failed: errors.length,
    errors: errors.slice(0, 20)
  };
}

/* ======================================================================
 * SMS RELAY — Google Sheet queue -> home PC -> Munjanara
 *
 * Script Properties:
 *   SMS_RELAY_TOKEN           : 집 PC config.json과 동일한 긴 비밀문자열
 *   MUNJANARA_TEST_RECEIVER   : testEnqueueSms()용 테스트 수신번호
 * ====================================================================== */

const SMS_QUEUE_SHEET = '문자발송대기';
const SMS_QUEUE_HEADERS = Object.freeze([
  'ID', '수신번호', '메시지', '상태', '결과', '요청일시', '발송일시'
]);

function getSmsRelayToken_() {
  return String(PropertiesService.getScriptProperties().getProperty('SMS_RELAY_TOKEN') || '').trim();
}

function assertSmsRelayToken_(token) {
  const configured = getSmsRelayToken_();
  if (!configured) throw new Error('스크립트 속성 SMS_RELAY_TOKEN이 설정되지 않았습니다.');
  if (String(token || '') !== configured) throw new Error('unauthorized');
}

function smsSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(SMS_QUEUE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SMS_QUEUE_SHEET);
    sheet.getRange(1, 1, 1, SMS_QUEUE_HEADERS.length).setValues([SMS_QUEUE_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function enqueueSms(phone, message) {
  let receiver = normalizePhoneDigits_(phone);
  if (receiver.indexOf('82') === 0) receiver = '0' + receiver.slice(2);
  const body = String(message || '').trim();
  if (receiver.length < 10 || receiver.length > 11) throw new Error('문자 수신번호가 올바르지 않습니다.');
  if (!body) throw new Error('문자 내용이 비어 있습니다.');

  const sheet = smsSheet_();
  const id = Utilities.getUuid();
  const row = Math.max(2, sheet.getLastRow() + 1);
  sheet.getRange(row, 2).setNumberFormat('@');
  sheet.getRange(row, 1, 1, 7).setValues([[
    id, "'" + receiver, body, '대기', '', new Date(), ''
  ]]);
  return id;
}

function handleSmsPending_(params) {
  try {
    assertSmsRelayToken_(params.token);
    const sheet = smsSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return output_({ ok: true, jobs: [] }, '');

    const limit = Math.min(Math.max(Number(params.limit || 20), 1), 100);
    const rows = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    const jobs = [];

    for (let i = 0; i < rows.length && jobs.length < limit; i += 1) {
      const row = rows[i];
      const status = String(row[3] || '').trim();
      if (status === '대기' || status === '재시도') {
        jobs.push({ id: String(row[0]), phone: String(row[1]), message: String(row[2]) });
      }
    }
    return output_({ ok: true, jobs: jobs }, '');
  } catch (error) {
    return output_({ ok: false, error: error.message || String(error) }, '');
  }
}

function handleSmsResult_(body) {
  try {
    assertSmsRelayToken_(body.token);
    const sheet = smsSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return output_({ ok: false, error: 'not_found' }, '');

    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues().flat();
    const idx = ids.indexOf(String(body.id || ''));
    if (idx < 0) return output_({ ok: false, error: 'not_found' }, '');

    const row = idx + 2;
    sheet.getRange(row, 4, 1, 2).setValues([[
      String(body.status || '실패'),
      String(body.result || '').slice(0, 1000)
    ]]);
    sheet.getRange(row, 7).setValue(new Date());
    return output_({ ok: true }, '');
  } catch (error) {
    return output_({ ok: false, error: error.message || String(error) }, '');
  }
}

function setupSmsQueue() {
  smsSheet_();
  return { ok: true, sheet: SMS_QUEUE_SHEET };
}

function testEnqueueSms() {
  const receiver = PropertiesService.getScriptProperties().getProperty('MUNJANARA_TEST_RECEIVER');
  return enqueueSms(receiver, '[남양주시장애인복지관] 자동 문자 중계 테스트입니다.');
}
