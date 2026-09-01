'use strict';

/**
 * 20주년 참가자 엑셀 가져오기 FIX
 *
 * 지원 양식
 * ① 20주년_참가자명단_엑셀입력양식.xlsx
 *    - 참가자명단_입력 시트
 *    - 앞쪽 행사명/안내문 4줄 + 실제 헤더행
 *
 * ② NYJWEL20_참가자명단_엑셀등록_양식.xlsx
 *    - 작성안내 시트가 앞에 있어도 자동으로 참가자명단 시트를 선택
 *    - 장애인/휠체어/복지관서비스/비고/참여상태까지 읽음
 */

(() => {
  const HEADER_ALIASES = {
    name: [
      '이름','성명','참가자명','참가자이름','참석자명','신청자명','신청자','name'
    ],
    phone: [
      '핸드폰번호','휴대폰번호','핸드폰','휴대폰','연락처','전화번호','phone'
    ],
    organization: [
      '소속기관','기관명','소속','소속명','organization'
    ],
    seat: [
      '좌석','좌석번호','배정좌석','seat'
    ],
    disabledPerson: [
      '장애인당사자여부','장애인당사자','장애여부','당사자여부'
    ],
    wheelchairUser: [
      '휠체어사용여부','휠체어이용여부','휠체어사용','휠체어이용','휠체어'
    ],
    usesCenter: [
      '복지관서비스이용여부','복지관이용여부','복지관서비스이용','복지관이용'
    ],
    note: [
      '비고','메모','관리자메모','특이사항','note'
    ],
    status: [
      '참여상태','참가상태','상태','참여여부','참석여부','status'
    ]
  };

  function normalizeHeader(value) {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, '')
      .replace(/[()（）\[\]{}<>·ㆍ:：/\\._-]/g, '');
  }

  const NORMALIZED_ALIASES = Object.fromEntries(
    Object.entries(HEADER_ALIASES).map(([field, names]) => [
      field,
      new Set(names.map(normalizeHeader))
    ])
  );

  function fieldForHeader(value) {
    const key = normalizeHeader(value);
    if (!key) return '';

    for (const [field, aliases] of Object.entries(NORMALIZED_ALIASES)) {
      if (aliases.has(key)) return field;
    }

    // "이름(필수)", "휴대폰번호 *" 같은 변형도 허용
    if (key.includes('이름') && !key.includes('기관')) return 'name';
    if (key.includes('휴대폰') || key.includes('핸드폰') || key === '연락처') return 'phone';
    if (key.includes('소속기관') || key === '기관명' || key === '소속') return 'organization';
    if (key === '좌석' || key.includes('좌석번호')) return 'seat';
    if (key.includes('장애인당사자')) return 'disabledPerson';
    if (key.includes('휠체어')) return 'wheelchairUser';
    if (key.includes('복지관') && key.includes('이용')) return 'usesCenter';
    if (key === '비고' || key.includes('메모') || key.includes('특이사항')) return 'note';
    if (key.includes('참여상태') || key.includes('참가상태') || key.includes('참석여부')) return 'status';

    return '';
  }

  function detectHeaderRow(matrix) {
    const scanLimit = Math.min(matrix.length, 30);
    let best = null;

    for (let r = 0; r < scanLimit; r++) {
      const row = Array.isArray(matrix[r]) ? matrix[r] : [];
      const fields = row.map(fieldForHeader).filter(Boolean);
      const unique = [...new Set(fields)];

      // 이름은 반드시 있어야 하고, 다른 필드가 하나 이상 같이 있는 행만 헤더로 인정.
      if (!unique.includes('name') || unique.length < 2) continue;

      const score =
        (unique.includes('name') ? 10 : 0) +
        (unique.includes('phone') ? 4 : 0) +
        (unique.includes('organization') ? 3 : 0) +
        (unique.includes('seat') ? 3 : 0) +
        (unique.includes('status') ? 2 : 0) +
        (unique.includes('wheelchairUser') ? 2 : 0) +
        unique.length;

      if (!best || score > best.score) {
        best = { rowIndex: r, score, fields: row.map(fieldForHeader) };
      }
    }

    return best;
  }

  function preferredSheetNames(book) {
    const names = Array.isArray(book?.SheetNames) ? book.SheetNames : [];
    const priorities = [
      '참가자명단',
      '참가자명단_입력',
      '참가자명단 입력',
      '명단',
      '작성예시'
    ];

    return [
      ...priorities.filter(name => names.includes(name)),
      ...names.filter(name =>
        !priorities.includes(name) &&
        !/작성안내|안내|설명|가이드/i.test(name)
      ),
      ...names.filter(name =>
        !priorities.includes(name)
      )
    ].filter((name, i, arr) => arr.indexOf(name) === i);
  }

  function findParticipantSheet(book) {
    let fallback = null;

    for (const sheetName of preferredSheetNames(book)) {
      const sheet = book.Sheets[sheetName];
      if (!sheet) continue;

      const matrix = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        raw: false,
        blankrows: true
      });

      const header = detectHeaderRow(matrix);
      if (header) {
        return { sheetName, sheet, matrix, header };
      }

      if (!fallback && matrix.length) {
        fallback = { sheetName, sheet, matrix, header: null };
      }
    }

    return fallback;
  }

  function normalizeCell(value) {
    return String(value ?? '').trim();
  }

  function parseBooleanText(value, type) {
    const text = normalizeCell(value).toLowerCase().replace(/\s+/g, '');

    if (type === 'disabledPerson') {
      return ['예','y','yes','true','1','해당','해당함','장애인당사자'].includes(text);
    }
    if (type === 'wheelchairUser') {
      return ['사용','사용함','이용','이용함','예','y','yes','true','1','휠체어'].includes(text);
    }
    if (type === 'usesCenter') {
      return ['이용','이용함','사용','사용함','예','y','yes','true','1'].includes(text);
    }

    return false;
  }

  function rowsFromDetectedSheet(found) {
    if (!found?.header) return [];

    const { matrix, header } = found;
    const fieldByCol = header.fields;
    const output = [];

    for (let r = header.rowIndex + 1; r < matrix.length; r++) {
      const source = Array.isArray(matrix[r]) ? matrix[r] : [];
      const item = {
        name: '',
        phone: '',
        organization: '',
        seat: '',
        disabledPerson: false,
        wheelchairUser: false,
        usesCenter: false,
        note: '',
        status: ''
      };

      fieldByCol.forEach((field, col) => {
        if (!field) return;
        const value = normalizeCell(source[col]);

        if (field === 'disabledPerson') item.disabledPerson = parseBooleanText(value, field);
        else if (field === 'wheelchairUser') item.wheelchairUser = parseBooleanText(value, field);
        else if (field === 'usesCenter') item.usesCenter = parseBooleanText(value, field);
        else item[field] = value;
      });

      // 이름이 없는 기본 빈 행(좌석 칸에 미참여만 들어있는 행 등)은 완전히 무시.
      if (!item.name) continue;

      // 휠체어/복지관 서비스 값은 장애인 당사자인 경우에만 적용.
      if (!item.disabledPerson) {
        item.wheelchairUser = false;
        item.usesCenter = false;
      }

      // 구형 양식은 참여상태 열이 없고 좌석의 '미참여' 값만 사용.
      if (item.seat === '미참여') item.status = '미참여';

      output.push(item);
    }

    return output;
  }

  function previewRowHtml(row) {
    const flags = [
      row.disabledPerson ? '장애인 당사자' : '',
      row.wheelchairUser ? '♿ 휠체어' : '',
      row.usesCenter ? '복지관 이용' : ''
    ].filter(Boolean).join(' · ');

    return `<tr>
      <td>${escapeHtml(row.name)}</td>
      <td>${escapeHtml(row.phone || '-')}</td>
      <td>${escapeHtml(row.organization || '-')}</td>
      <td>${escapeHtml(row.seat || '자동배정')}</td>
      <td>${escapeHtml(flags || '-')}</td>
      <td>${escapeHtml(row.status || (row.seat === '미참여' ? '미참여' : '참여'))}</td>
    </tr>`;
  }

  async function fixedPreviewExcelImport() {
    const file = $('#excelImportFile')?.files?.[0];
    if (!file) {
      showToast('엑셀 또는 CSV 파일을 선택해 주세요.', 4200);
      return;
    }

    if (typeof XLSX === 'undefined') {
      showToast('엑셀 읽기 모듈을 불러오지 못했습니다.', 5200);
      return;
    }

    const preview = $('#excelImportPreview');
    const importButton = $('#excelImportButton');

    try {
      const buffer = await file.arrayBuffer();
      const book = XLSX.read(buffer, { type: 'array', cellDates: false });
      const found = findParticipantSheet(book);

      if (!found?.header) {
        excelImportRows = [];
        preview.innerHTML =
          '<div class="empty-state">' +
          '<strong>참가자 입력표의 헤더를 찾지 못했습니다.</strong><br>' +
          '지정 양식의 “이름 / 핸드폰번호 / 소속기관 / 좌석…” 제목행을 유지해 주세요.' +
          '</div>';
        importButton.disabled = true;
        return;
      }

      excelImportRows = rowsFromDetectedSheet(found);

      if (!excelImportRows.length) {
        preview.innerHTML =
          `<div class="empty-state">
            <strong>${escapeHtml(found.sheetName)}</strong> 시트의 입력행을 찾았지만
            이름이 입력된 참가자가 없습니다.
          </div>`;
        importButton.disabled = true;
        return;
      }

      const unavailable = excelImportRows.filter(
        r => r.seat === '미참여' || r.status === '미참여'
      ).length;

      const wheelchair = excelImportRows.filter(r => r.wheelchairUser).length;
      const disabled = excelImportRows.filter(r => r.disabledPerson).length;

      preview.innerHTML =
        `<div class="excel-preview-summary">
          <strong>${excelImportRows.length}명</strong>
          <span>${escapeHtml(found.sheetName)} 시트 · 제목행 ${found.header.rowIndex + 1}행 자동 인식</span>
          <span>미참여 ${unavailable}명 · 장애인 당사자 ${disabled}명 · 휠체어 ${wheelchair}명</span>
        </div>
        <div class="excel-preview-table-wrap">
          <table class="excel-preview-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>핸드폰</th>
                <th>소속기관</th>
                <th>좌석</th>
                <th>편의정보</th>
                <th>참여상태</th>
              </tr>
            </thead>
            <tbody>
              ${excelImportRows.slice(0, 40).map(previewRowHtml).join('')}
            </tbody>
          </table>
        </div>`;

      importButton.disabled = false;
      showToast(
        `${found.sheetName} 시트의 ${found.header.rowIndex + 1}행을 제목행으로 인식했습니다. ${excelImportRows.length}명 확인.`,
        6000
      );
    } catch (error) {
      excelImportRows = [];
      importButton.disabled = true;
      preview.innerHTML =
        `<div class="empty-state"><strong>엑셀 읽기 실패</strong><br>${escapeHtml(error.message || String(error))}</div>`;
      throw error;
    }
  }

  // 기존 admin.js의 함수명을 그대로 덮어써서 기존 버튼 이벤트를 그대로 사용합니다.
  window.previewExcelImport = fixedPreviewExcelImport;
  try { previewExcelImport = fixedPreviewExcelImport; } catch (_) {}

  // 개발자 콘솔에서 검사할 수 있도록 노출
  window.NYJ20ExcelImportFix = {
    detectHeaderRow,
    findParticipantSheet,
    rowsFromDetectedSheet,
    version: '1.2-TEMPLATE-FIX'
  };
})();
