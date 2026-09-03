window.NYJ20_CONFIG = {
  // 현재 운영용 Apps Script /exec 주소입니다. 새 배포 후 주소가 달라진 경우 이 한 줄만 교체하세요.
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbyqDm0WPM43BTwqwxvdcnKBWoFroG4iYfcxWJ4XGOHDzzI-GAXJfnawUqvs0glWD6l0/exec',
  requestTimeoutMs: 40000, // 신청·QR POST 요청용. 공개 첫 화면은 12초 direct GET 사용
  defaultAutoRefreshSeconds: 15
};

/* =====================================================================
 * 관리자 고속화 패치 v1.0
 *
 * 핵심:
 * - DOMContentLoaded에서 admin.js initialize보다 먼저 설치
 * - 현재 보고 있는 메뉴만 렌더링
 * - 좌석 400석 / 추첨 / 참가자표를 숨겨진 상태에서 다시 그리지 않음
 * - 좌석표 변경이 없으면 재렌더링 생략
 * - 초기 로그인 시 무거운 bootstrapExtras 자동 선로딩 차단
 * - 자동 새로고침 간격 완화 + QR 카메라 사용 중 자동 새로고침 중지
 * - fieldStats 서버 호출을 60초 단위로 제한
 * - 현황 새로고침 버튼은 무거운 full bootstrap 대신 core만 요청
 * ===================================================================== */
(() => {
  const FAST = Object.freeze({
    dashboardRefreshSeconds: 45,
    participantsRefreshSeconds: 60,
    backgroundRefreshSeconds: 120,
    fieldStatsMinIntervalMs: 60000,
    participantRenderDelayMs: 70,
    drawRenderDelayMs: 50
  });

  document.addEventListener('DOMContentLoaded', () => {
    if (window.__NYJ20_ADMIN_FAST_MODE__) return;
    window.__NYJ20_ADMIN_FAST_MODE__ = 'v1.0';

    // admin.js가 정상 로드되지 않은 경우에는 원본 오류를 숨기지 않고 종료합니다.
    if (
      typeof renderAll !== 'function' ||
      typeof refreshFromServer !== 'function' ||
      typeof switchView !== 'function'
    ) {
      console.warn('[FAST MODE] admin.js 핵심 함수가 없어 고속화 패치를 적용하지 않았습니다.');
      return;
    }

    const emit = (name, detail = {}) => {
      try {
        window.dispatchEvent(new CustomEvent(name, { detail }));
      } catch (_) {}
    };

    // -----------------------------------------------------------------
    // 1) 숨겨진 메뉴 렌더링 차단
    // -----------------------------------------------------------------
    const originalRenderParticipants = renderParticipants;
    const originalRenderSeatMap = renderSeatMap;
    const originalRenderPrizeDraw = renderPrizeDraw;
    const originalRenderSettings = renderSettings;

    let participantRenderTimer = null;
    let drawRenderTimer = null;
    let lastSeatSignature = '';

    function seatSignature() {
      const people = Array.isArray(state?.participants) ? state.participants : [];
      const meta = Array.isArray(state?.seatMeta) ? state.seatMeta : [];

      // JSON.stringify 전체보다 짧은 시그니처를 만들어 DOM 400개 재생성을 피합니다.
      const pSig = people.map(p =>
        `${p.id}:${p.seat || ''}:${p.arrived ? 1 : 0}:${p.participationStatus || ''}`
      ).join('|');

      const mSig = meta.map(s =>
        `${s.code || ''}:${s.category || ''}:${s.enabled === false ? 0 : 1}:` +
        `${s.autoAssignable ? 1 : 0}:${s.wheelchairEligible ? 1 : 0}:${s.note || ''}`
      ).join('|');

      return `${people.length}#${meta.length}#${pSig}#${mSig}`;
    }

    renderParticipants = function fastRenderParticipants() {
      if (currentView !== 'participants') return;

      clearTimeout(participantRenderTimer);
      participantRenderTimer = setTimeout(() => {
        if (currentView !== 'participants') return;
        originalRenderParticipants();
        emit('nyj20:participants-rendered', {
          count: Array.isArray(state?.participants) ? state.participants.length : 0
        });
      }, FAST.participantRenderDelayMs);
    };

    renderPrizeDraw = function fastRenderPrizeDraw() {
      if (currentView !== 'draw') return;

      clearTimeout(drawRenderTimer);
      drawRenderTimer = setTimeout(() => {
        if (currentView !== 'draw') return;
        originalRenderPrizeDraw();
      }, FAST.drawRenderDelayMs);
    };

    renderSeatMap = function fastRenderSeatMap(force = false) {
      if (currentView !== 'seats') return;

      const sig = seatSignature();
      const host = document.querySelector('#seatMap');
      const hasMap = Boolean(host && host.children.length);

      if (!force && hasMap && sig === lastSeatSignature) return;

      lastSeatSignature = sig;
      originalRenderSeatMap();
    };

    renderSettings = function fastRenderSettings() {
      if (currentView !== 'settings') return;
      originalRenderSettings();
    };

    function renderCurrentView(force = false) {
      if (currentView === 'dashboard') {
        renderDashboard();
        return;
      }

      if (currentView === 'participants') {
        renderParticipants();
        return;
      }

      if (currentView === 'seats') {
        renderSeatMap(force);
        return;
      }

      if (currentView === 'draw') {
        renderPrizeDraw();
        return;
      }

      if (currentView === 'settings') {
        renderSettings();
      }
      // checkin 화면은 서버 새로고침 때 전체 DOM을 다시 그릴 필요가 없습니다.
    }

    renderAll = function fastRenderAll() {
      const header = document.querySelector('#headerEventName');
      if (header) header.textContent = state?.settings?.eventName || '';

      const sync = document.querySelector('#lastSyncLabel');
      if (sync) sync.textContent = `마지막 동기화: ${formatDateTime(state?.serverTime)}`;

      renderCurrentView(false);

      emit('nyj20:data-updated', {
        view: currentView,
        participantCount: Array.isArray(state?.participants)
          ? state.participants.length
          : 0
      });
    };

    // -----------------------------------------------------------------
    // 2) 좌석/경품 extras는 실제로 그 메뉴를 열 때만 로드
    // -----------------------------------------------------------------
    const originalLoadBootstrapExtras = loadBootstrapExtras;

    loadBootstrapExtras = async function fastLoadBootstrapExtras(options = {}) {
      const force = Boolean(options?.force);
      const needsExtras =
        currentView === 'seats' ||
        currentView === 'draw';

      // 상품 수령 확정처럼 코드가 force:true로 호출할 때는 항상 허용
      if (!force && !needsExtras) return null;

      return originalLoadBootstrapExtras(options);
    };

    // -----------------------------------------------------------------
    // 3) 탭 전환 즉시 "그 탭만" 그림
    // -----------------------------------------------------------------
    switchView = function fastSwitchView(name) {
      currentView = name;

      $$('.view').forEach(view =>
        view.classList.toggle('active', view.id === `view-${name}`)
      );
      $$('.nav-button').forEach(button =>
        button.classList.toggle('active', button.dataset.view === name)
      );

      if (name !== 'checkin' && scannerRunning) {
        stopScanner().catch(() => {});
      }

      if ((name === 'seats' || name === 'draw') && !extrasLoaded) {
        // 무거운 데이터는 지금 필요한 순간에만 1회 로드
        originalLoadBootstrapExtras({ silent: false })
          .then(() => renderCurrentView(true))
          .catch(() => {});
      } else {
        renderCurrentView(false);
      }

      // 메뉴를 바꿀 때 자동 새로고침 주기도 해당 메뉴에 맞춰 재설정
      scheduleRefresh();

      // smooth 스크롤도 저사양 기기에서는 체감 지연이 생겨 즉시 이동
      window.scrollTo(0, 0);

      emit('nyj20:view-changed', { view: name });
    };

    // -----------------------------------------------------------------
    // 4) fieldStats 서버 요청 제한
    // -----------------------------------------------------------------
    const originalRefreshFieldStats = refreshFieldStats;
    let lastFieldStatsAt = 0;
    let fieldStatsPromise = null;

    refreshFieldStats = async function fastRefreshFieldStats(force = false) {
      const now = Date.now();
      const relevantView =
        currentView === 'dashboard' ||
        currentView === 'checkin';

      if (!force && !relevantView) return null;
      if (!force && now - lastFieldStatsAt < FAST.fieldStatsMinIntervalMs) {
        return fieldStatsPromise;
      }
      if (fieldStatsPromise) return fieldStatsPromise;

      lastFieldStatsAt = now;
      fieldStatsPromise = Promise.resolve(originalRefreshFieldStats())
        .finally(() => {
          fieldStatsPromise = null;
        });

      return fieldStatsPromise;
    };

    // -----------------------------------------------------------------
    // 5) 서버 새로고침 중복 요청 방지
    // -----------------------------------------------------------------
    const originalRefreshFromServer = refreshFromServer;
    let refreshPromise = null;

    refreshFromServer = function fastRefreshFromServer(options = {}) {
      if (refreshPromise && options?.silent !== false) {
        return refreshPromise;
      }

      refreshPromise = Promise.resolve(originalRefreshFromServer(options))
        .finally(() => {
          refreshPromise = null;
        });

      return refreshPromise;
    };

    // -----------------------------------------------------------------
    // 6) 자동 새로고침 간격 완화
    // -----------------------------------------------------------------
    scheduleRefresh = function fastScheduleRefresh() {
      clearInterval(refreshTimer);

      let seconds = FAST.backgroundRefreshSeconds;
      if (currentView === 'dashboard') {
        seconds = FAST.dashboardRefreshSeconds;
      } else if (currentView === 'participants') {
        seconds = FAST.participantsRefreshSeconds;
      }

      refreshTimer = setInterval(() => {
        if (document.hidden || !session?.token) return;

        // QR 카메라가 켜져 있는 동안에는 CPU/네트워크를 스캔에 우선 사용
        if (scanBusy || scannerRunning) return;

        // 입력 중 명단이 다시 그려져 타이핑이 끊기는 현상 방지
        const active = document.activeElement;
        const editing =
          active &&
          /^(INPUT|TEXTAREA|SELECT)$/i.test(active.tagName) &&
          currentView === 'participants';

        if (editing) return;

        // 모달에서 편집 중일 때도 자동 갱신하지 않음
        const modal = document.querySelector('#modalBackdrop');
        if (modal && !modal.classList.contains('hidden')) return;

        refreshFromServer({ silent: true, full: false }).catch(() => {});
      }, seconds * 1000);
    };

    // -----------------------------------------------------------------
    // 7) 현황 "새로고침" 버튼의 full bootstrap 제거
    // 기존 bindEvents가 나중에 붙더라도 capture 단계에서 먼저 처리합니다.
    // -----------------------------------------------------------------
    const refreshButton = document.querySelector('#refreshDashboardButton');
    if (refreshButton) {
      refreshButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();

        refreshFromServer({ silent: false, full: false })
          .then(() => refreshFieldStats(true))
          .catch(() => {});
      }, true);
    }

    // -----------------------------------------------------------------
    // 8) 탭 밖에서 발생하는 렌더 호출은 위 wrapper가 자동 차단.
    // updateCache는 그대로 두되, 내부 renderAll()이 현재 메뉴만 갱신합니다.
    // -----------------------------------------------------------------

    emit('nyj20:fast-mode-ready', { version: 'v1.0' });
    console.info('[NYJ20] 관리자 고속화 패치 v1.0 적용');
  }, { once: true });
})();

/*
 * 관리자 자동 기관 그룹 접수 addon loader v1.1
 * 공개 초대장/키오스크에는 로드하지 않고 관리자 페이지에서만 실행합니다.
 */
(() => {
  const path = String(location.pathname || '').toLowerCase();
  const isAdmin =
    path.endsWith('/admin.html') ||
    path.endsWith('/admin') ||
    path.includes('/admin.html');

  if (!isAdmin) return;

  window.addEventListener('load', () => {
    if (document.querySelector('script[data-auto-org-group-addon]')) return;
    const script = document.createElement('script');
    script.src = 'admin-auto-org-group.js?v=1.1';
    script.defer = true;
    script.dataset.autoOrgGroupAddon = '1';
    document.body.appendChild(script);
  }, { once: true });
})();

/*
 * 현재 대표자 그룹 영역에 자동 기관 그룹도 함께 표시 v1.0
 */
(() => {
  const path = String(location.pathname || '').toLowerCase();
  const isAdmin =
    path.endsWith('/admin.html') ||
    path.endsWith('/admin') ||
    path.includes('/admin.html');

  if (!isAdmin) return;

  window.addEventListener('load', () => {
    if (document.querySelector('script[data-group-view-addon]')) return;
    const script = document.createElement('script');
    script.src = 'admin-group-auto-view.js?v=2.0';
    script.defer = true;
    script.dataset.groupViewAddon = '1';
    document.body.appendChild(script);
  }, { once: true });
})();
