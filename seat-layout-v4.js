'use strict';

/**
 * 20주년 행사 좌석배치 V4 오버라이드
 * ------------------------------------------------------------
 * 사용법:
 * 1) 이 파일을 GitHub 저장소 루트에 seat-layout-v4.js 로 업로드
 * 2) admin.html의 admin.js 다음 줄에 아래 1줄 추가
 *    <script src="seat-layout-v4.js?v=1.0"></script>
 *
 * 설계:
 * - 전체 300석: A~Y × (좌 6 + 우 6)
 * - VIP/내빈: A~B 전체 24석
 * - 휠체어 우선: C~D 바깥쪽 8석
 *   CL-01~02, CR-05~06, DL-01~02, DR-05~06
 * - 나머지는 일반석
 * - 일반 자동배정은 VIP/휠체어 지정석을 제외
 * - 일괄 재배정은 기존 하드코딩된 adminReassignAllSeats를 쓰지 않고
 *   좌석 메타를 새 구조로 저장한 뒤 adminReflowSeats를 사용
 * - 이미 도착한 참가자는 서버의 기존 재정렬 규칙에 따라 유지
 */

(() => {
  const ROWS = 'ABCDEFGHIJKLMNOPQRSTUVWXY'.split('');
  const PAD = n => String(n).padStart(2, '0');

  function seatCode(row, side, no) {
    return `${row}${side}-${PAD(no)}`;
  }

  function rowSeats(row) {
    return [
      ...Array.from({ length: 6 }, (_, i) => seatCode(row, 'L', i + 1)),
      ...Array.from({ length: 6 }, (_, i) => seatCode(row, 'R', i + 1))
    ];
  }

  function allSeats() {
    return ROWS.flatMap(rowSeats);
  }

  // A~B 전체 = 24석. 기존 66석보다 단순하고 대칭적인 VIP 구역.
  function vipSeats() {
    return ['A', 'B'].flatMap(rowSeats);
  }

  // 출입·이동 편의를 고려해 런웨이 반대편 바깥쪽 좌석을 휠체어 우선으로 지정.
  function wheelchairSeats() {
    return [
      'CL-01', 'CL-02', 'CR-05', 'CR-06',
      'DL-01', 'DL-02', 'DR-05', 'DR-06'
    ];
  }

  function toSeatInput(codes) {
    return codes.join(',');
  }

  function updateSeatPageCopy() {
    const heading = document.querySelector('#view-seats .section-heading .small-text');
    if (heading) {
      heading.innerHTML =
        '<strong>도면 기준 A~Y 25행 × (좌 6석 + 런웨이 + 우 6석) = 총 300석</strong><br>' +
        '앞 2개 행(A~B) <strong>24석은 내빈·VIP 지정석</strong>으로 일반 자동배정에서 제외합니다. ' +
        'C~D 바깥쪽 8석은 <strong>휠체어 우선석</strong>으로 사용합니다.';
    }

    const vipBanner = document.querySelector('.vip-location-banner');
    if (vipBanner) {
      vipBanner.innerHTML =
        '<strong>★ 내빈·VIP 지정석 24석</strong>' +
        '<span>A · B 앞 2개 행 전체</span>' +
        '<small>좌·우 각각 6석씩, 총 24석 · 일반 자동배정 제외</small>';
    }

    const wcBanner = document.querySelector('.disabled-priority-banner');
    if (wcBanner) {
      wcBanner.innerHTML =
        '<strong>♿ 휠체어 우선석 8석</strong>' +
        '<span>C · D 행 바깥쪽</span>' +
        '<small>CL-01~02 · CR-05~06 · DL-01~02 · DR-05~06</small>';
    }

    const legend = document.querySelector('#view-seats .legend');
    if (legend) {
      legend.innerHTML =
        '<span><i class="legend-dot vip"></i>내빈·VIP 24석</span>' +
        '<span><i class="legend-dot disabled-priority"></i>휠체어 우선 8석</span>' +
        '<span><i class="legend-dot pending"></i>배정완료</span>' +
        '<span><i class="legend-dot arrived"></i>현장도착</span>' +
        '<span><i class="legend-dot empty"></i>빈 좌석</span>';
    }

    const resetButton = document.querySelector('#reassignAllSeatsButton');
    if (resetButton) {
      resetButton.textContent = 'V4 좌석 구조 적용 + 미도착자 재정렬';
    }

    const resetNote = document.querySelector('.seat-reset-note');
    if (resetNote) {
      resetNote.textContent =
        'A~B 24석은 VIP로 보호하고, C~D 바깥쪽 8석은 휠체어 우선석으로 지정합니다. ' +
        '나머지는 일반석으로 사용하며 도착자는 유지한 채 미도착 참가자만 다시 정렬합니다.';
    }

    const syncNotice = document.querySelector('.sync-notice');
    if (syncNotice && syncNotice.textContent.includes('300석 좌석배정')) {
      syncNotice.innerHTML =
        '<strong>관리자 전용 화면</strong> — 1인 1QR·특수 다중신청, ' +
        '300석 좌석배정, 현장 QR 확인과 행운추첨 상품 수령을 관리합니다.';
    }
  }

  // 좌석 지도는 기존 300석 구조를 유지하되, 실제 seatMeta만으로 색을 표시합니다.
  // 기존 A~K 강제 VIP 로직은 여기에서 전혀 사용하지 않습니다.
  if (typeof window.renderSeatMap === 'function' || typeof renderSeatMap === 'function') {
    window.renderSeatMap = function renderSeatMapV4() {
      const mm = seatMetaByCode();
      const om = seatOccupantMap();

      const host = document.querySelector('#seatMap');
      if (!host) return;

      host.innerHTML = ROWS.map(row => runwayRow(row, 6, 6, mm, om)).join('');

      const extra = document.querySelector('#extraSeatMap');
      if (extra) extra.innerHTML = '';
    };

    // 전역 함수 바인딩도 같이 교체
    try { renderSeatMap = window.renderSeatMap; } catch (_) {}
  }

  async function saveZone(codes, category, {
    autoAssignable = true,
    enabled = true,
    wheelchairEligible = false,
    note = ''
  } = {}) {
    return await jsonpRequest('saveSeatMeta', {
      seats: toSeatInput(codes),
      category,
      autoAssignable,
      enabled,
      wheelchairEligible,
      note
    });
  }

  async function applySeatLayoutV4() {
    const everySeat = allSeats();
    const vip = vipSeats();
    const wheelchair = wheelchairSeats();

    // 1. 과거 VIP/휠체어/사용안함 메타를 전부 일반석으로 초기화
    state.seatMeta = await saveZone(everySeat, '일반', {
      autoAssignable: true,
      enabled: true,
      wheelchairEligible: false,
      note: 'V4 기본 일반석'
    });

    // 2. VIP
    state.seatMeta = await saveZone(vip, '내빈·VIP', {
      autoAssignable: false,
      enabled: true,
      wheelchairEligible: false,
      note: 'A~B 앞 2개 행 VIP 지정석'
    });

    // 3. 휠체어 우선
    state.seatMeta = await saveZone(wheelchair, '장애인(휠체어)', {
      autoAssignable: false,
      enabled: true,
      wheelchairEligible: true,
      note: '출입·이동 편의를 위한 바깥쪽 휠체어 우선석'
    });

    return { everySeat, vip, wheelchair };
  }

  async function reassignAllSeatsV4() {
    const active = state.participants.filter(
      p => String(p.participationStatus || '참여') !== '미참여'
    );
    const arrived = active.filter(p => p.arrived).length;
    const movable = active.length - arrived;
    const button = document.querySelector('#reassignAllSeatsButton');

    const ok = confirm(
      `V4 좌석 구조로 다시 정리할까요?\n\n` +
      `• 총 300석: A~Y × 좌6 + 우6\n` +
      `• A~B 전체 24석: 내빈·VIP 지정석\n` +
      `• C~D 바깥쪽 8석: 휠체어 우선석\n` +
      `• 나머지 268석: 일반석\n` +
      `• 이미 도착한 ${arrived}명은 유지\n` +
      `• 미도착 ${movable}명만 새 구조 기준으로 재정렬\n\n` +
      `기존 A~K 중앙 66석 VIP 규칙은 삭제됩니다.`
    );
    if (!ok) return;

    const oldText = button?.textContent || '';
    if (button) {
      button.disabled = true;
      button.textContent = 'V4 좌석 구조 적용 중...';
    }

    try {
      showToast('1/2 좌석 구역을 V4 구조로 정리하고 있습니다.', 5000);
      await applySeatLayoutV4();

      // 기존 adminReassignAllSeats는 A~K 66석을 다시 만들어버리므로 사용하지 않습니다.
      // 기존의 기관/동반그룹 재정렬 API를 새 seatMeta 위에서 실행합니다.
      showToast('2/2 미도착 참가자를 새 좌석 구조에 맞춰 재정렬합니다.', 6000);
      const result = await jsonpRequest('adminReflowSeats', {});

      await refreshFromServer({ silent: true, full: true });
      updateSeatPageCopy();

      const moved = Number(result?.movedCount || 0);
      showToast(
        `V4 적용 완료 · 미도착 ${moved}명 재정렬 · 도착자 ${arrived}명 유지`,
        8000
      );
    } catch (error) {
      console.error('[seat-layout-v4]', error);
      showToast(`V4 좌석 적용 실패: ${error.message || error}`, 9000);
      throw error;
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = oldText || 'V4 좌석 구조 적용 + 미도착자 재정렬';
      }
    }
  }

  window.applySeatLayoutV4 = applySeatLayoutV4;
  window.reassignAllSeatsV31 = reassignAllSeatsV4;
  try { reassignAllSeatsV31 = reassignAllSeatsV4; } catch (_) {}

  document.addEventListener('DOMContentLoaded', () => {
    updateSeatPageCopy();

    // 초기 로딩/새로고침 후 관리자 문구가 다시 옛 내용으로 보이지 않게 한 번 더 보정
    setTimeout(updateSeatPageCopy, 500);
    setTimeout(updateSeatPageCopy, 1800);
  });
})();
