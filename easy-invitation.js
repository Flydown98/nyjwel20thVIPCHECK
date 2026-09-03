'use strict';

/**
 * 남양주시장애인복지관 20주년
 * 쉬운 초대장 + 큰 버튼 + 본행사 통합 일정 v1.4
 *
 * 현재 public.js 맨 끝에 HTML <script> 태그가 잘못 들어가면
 * 브라우저가 public.js 전체를 실행하지 못해 '초대장 열기' 버튼도 동작하지 않습니다.
 *
 * 이 파일은:
 * 1) public.js가 정상 실행됐는지 확인
 * 2) 실행되지 않았다면 같은 public.js를 텍스트로 다시 읽음
 * 3) JS 안에 잘못 들어간 <script>/<link> HTML 줄만 제거
 * 4) 정상 JS로 다시 실행
 * 5) 이후 쉬운 초대장 UI를 적용
 *
 * 따라서 index.html을 손으로 수정하지 않아도
 * 이 파일 하나를 기존 easy-invitation.js와 교체하면 됩니다.
 */
(() => {
  const CORE_TEST = () =>
    typeof window.openInvitationIntro === 'function' ||
    typeof window.setupIntroVideo === 'function' ||
    typeof window.finishIntro === 'function';

  function cleanBrokenPublicJs(source) {
    let code = String(source || '');

    // JS 파일 안에 실수로 들어간 HTML 리소스 태그 제거.
    code = code
      .split(/\r?\n/)
      .filter(line => !/^\s*<(?:script|link)\b/i.test(line))
      .join('\n');

    // 혹시 한 줄 뒤쪽에 붙어 있는 경우도 안전하게 제거.
    code = code
      .replace(/<script\b[^>]*>\s*<\/script>/gi, '')
      .replace(/<link\b[^>]*>/gi, '');

    return code;
  }

  async function recoverPublicCoreIfNeeded() {
    if (CORE_TEST()) return true;

    try {
      const url = new URL('public.js', window.location.href);
      url.searchParams.set('recovery', String(Date.now()));

      const response = await fetch(url.toString(), {
        cache: 'no-store',
        credentials: 'same-origin'
      });

      if (!response.ok) {
        throw new Error(`public.js 불러오기 실패 (${response.status})`);
      }

      const raw = await response.text();
      const cleaned = cleanBrokenPublicJs(raw);

      if (!cleaned.trim()) {
        throw new Error('public.js 내용이 비어 있습니다.');
      }

      // 전역 스크립트처럼 실행해야 기존 코드의 함수/변수 참조가 그대로 작동합니다.
      (0, eval)(`${cleaned}\n//# sourceURL=public.recovered.js`);

      // 공개 상태를 후속 애드온에서도 읽을 수 있도록 보강.
      try {
        if (typeof publicState !== 'undefined') {
          window.__NYJ20_PUBLIC_STATE__ = publicState;
        }
      } catch (_) {}

      console.info('[NYJ20] public.js 자동복구 완료');
      return CORE_TEST();
    } catch (error) {
      console.error('[NYJ20] public.js 자동복구 실패', error);
      showRecoveryNotice(error);
      return false;
    }
  }

  function showRecoveryNotice(error) {
    if (document.getElementById('publicRecoveryError')) return;

    const box = document.createElement('div');
    box.id = 'publicRecoveryError';
    box.setAttribute('role', 'alert');
    box.style.cssText =
      'position:fixed;z-index:999999;left:12px;right:12px;bottom:12px;' +
      'max-width:560px;margin:auto;padding:14px 16px;border-radius:14px;' +
      'background:#fff1f0;color:#8a1c14;border:2px solid #f4b4ae;' +
      'font:700 14px/1.55 Pretendard,"Noto Sans KR",sans-serif;' +
      'box-shadow:0 12px 40px rgba(0,0,0,.18)';
    box.textContent =
      '초대장 기능을 불러오지 못했습니다. 페이지를 새로고침해 주세요.' +
      (error?.message ? ` (${error.message})` : '');
    document.body.appendChild(box);
  }

  function loadCapacityAddon() {
    // index.html에 현재 CSS만 있고 JS 로딩이 빠져 있어도 여기서 자동 로드합니다.
    if (document.querySelector('script[data-nyj20-capacity-400]')) return;

    const script = document.createElement('script');
    script.src = `public-capacity-400.js?v=1.1&t=${Date.now()}`;
    script.async = false;
    script.dataset.nyj20Capacity400 = '1';
    document.body.appendChild(script);
  }

  // ------------------------------------------------------------------
  // 쉬운 초대장 UI
  // ------------------------------------------------------------------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const set = (s, t) => {
    const e = $(s);
    if (e) e.textContent = t;
  };

  function details(title, html) {
    const d = document.createElement('details');
    d.className = 'easy-more';
    d.innerHTML =
      `<summary><span aria-hidden="true">＋</span><strong>${title}</strong></summary>` +
      `<div class="easy-more-body">${html}</div>`;
    d.addEventListener('toggle', () => {
      const icon = d.querySelector('summary span');
      if (icon) icon.textContent = d.open ? '−' : '＋';
    });
    return d;
  }

  function shorten(el, shortText, title) {
    if (!el || el.dataset.easyDone) return;
    const old = el.innerHTML;
    el.dataset.easyDone = '1';
    el.innerHTML = `<span class="easy-short-copy">${shortText}</span>`;
    el.after(details(title, `<div>${old}</div>`));
  }

  function quickGuide() {
    if ($('#easyQuickGuide')) return;
    const hero = $('.invite-hero');
    if (!hero) return;

    const s = document.createElement('section');
    s.id = 'easyQuickGuide';
    s.className = 'easy-quick-guide';
    s.setAttribute('aria-label', '행사 핵심 정보');
    s.innerHTML =
      `<h2>한눈에 보기</h2>` +
      `<div class="easy-quick-grid">` +
      `<div class="easy-quick-card c1"><b>①</b><strong>언제?</strong><p>9월 17일 오후 1시 30분</p></div>` +
      `<div class="easy-quick-card c2"><b>②</b><strong>어디서?</strong><p>남양주금곡실내체육관</p></div>` +
      `<div class="easy-quick-card c3"><b>③</b><strong>어떻게?</strong><p>신청하고 QR을 보여주세요</p></div>` +
      `</div>` +
      `<div class="easy-quick-actions">` +
      `<button id="easyGoApply" type="button">참가 신청하기</button>` +
      `<button id="easyGoMap" type="button">오시는 길 보기</button>` +
      `</div>`;

    hero.after(s);

    $('#easyGoApply')?.addEventListener('click', () => {
      $('#revealApplicationButton')?.click();
      setTimeout(
        () => $('#application')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        80
      );
    });

    $('#easyGoMap')?.addEventListener('click', () => {
      $('#location')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }


  let simplifyingProgram = false;

  function simplifyProgramTimeline() {
    const list = $('#programTimeline');
    if (!list || simplifyingProgram) return;

    if (list.querySelector('[data-easy-simple-program="1"]')) return;

    simplifyingProgram = true;
    try {
      set('#programTitleText', '행사는 이렇게 진행돼요');
      set(
        '#programIntroText',
        '접수와 공연, 런웨이에 이어 개관 20주년 본행사가 진행됩니다.'
      );

      list.innerHTML = `
        <article class="program-timeline-item easy-simple-program" data-easy-simple-program="1">
          <div class="program-time">13:00~14:00</div>
          <div class="program-copy">
            <h3>접수 · 식전공연</h3>
            <p>QR 확인 후 공연과 함께 행사를 시작합니다.</p>
          </div>
        </article>

        <article class="program-timeline-item easy-simple-program easy-runway-program" data-easy-simple-program="1">
          <div class="program-time">14:00~14:20</div>
          <div class="program-copy">
            <h3>인클루시브 런웨이</h3>
            <p>Stage 1 · Bridge · Stage 2 · Finale</p>
          </div>
        </article>

        <article class="program-timeline-item easy-simple-program easy-main-program" data-easy-simple-program="1">
          <div class="program-time">14:20~15:15</div>
          <div class="program-copy">
            <div class="easy-main-program-head">
              <span class="easy-main-program-badge">MAIN CEREMONY</span>
              <h3>개관 20주년 본행사</h3>
            </div>
            <p class="easy-main-program-summary">기념식부터 앞으로의 20년을 나누는 시간까지 하나의 본행사로 이어집니다.</p>

            <div class="easy-main-program-flow">
              <span>기념식 오프닝</span>
              <i>→</i>
              <span>환영사 · 내빈소개</span>
              <i>→</i>
              <span>시상 · 축사</span>
            </div>

            <div class="easy-main-program-feature easy-main-program-feature-no-time">
              <div>
                <strong>사례공유 · 비전 선포</strong>
                <p>앞으로의 복지관과 새로운 약속을 함께 나눕니다.</p>
              </div>
            </div>
          </div>
        </article>

        <article class="program-timeline-item easy-simple-program" data-easy-simple-program="1">
          <div class="program-time">15:15~15:20</div>
          <div class="program-copy">
            <h3>기념촬영 · 마무리</h3>
            <p>함께 사진을 찍고 행사를 마칩니다.</p>
          </div>
        </article>
      `;
    } finally {
      simplifyingProgram = false;
    }
  }

  function watchProgramTimeline() {
    const list = $('#programTimeline');
    if (!list || list.dataset.easyProgramWatching === '1') return;
    list.dataset.easyProgramWatching = '1';

    const observer = new MutationObserver(() => {
      if (simplifyingProgram) return;
      if (!list.querySelector('[data-easy-simple-program="1"]')) {
        setTimeout(simplifyProgramTimeline, 0);
      }
    });
    observer.observe(list, { childList: true, subtree: false });

    simplifyProgramTimeline();
    setTimeout(simplifyProgramTimeline, 800);
    setTimeout(simplifyProgramTimeline, 1800);
  }

  function applyEasyUi() {
    if (document.documentElement.dataset.easyInvitationV11 === '1') return;
    document.documentElement.dataset.easyInvitationV11 = '1';

    quickGuide();
    watchProgramTimeline();
    set('#heroProgramButton', '행사 확인하기');

    const badge = $('.application-personal-badge');
    if (badge) badge.textContent = '한 사람씩 QR을 받아요';

    shorten(
      $('.application-important-copy'),
      '이름과 전화번호를 입력하면 개인 QR을 받을 수 있어요.',
      'QR 신청 방법 자세히 보기'
    );

    const org = $('#applicationForm input[name="organization"]')
      ?.closest('label')
      ?.querySelector(':scope > span');
    if (org) {
      org.innerHTML =
        '소속기관 <em class="optional-field-mark">(없으면 비워도 돼요)</em>';
    }

    set('#accessibilityApplicationTitle', '필요한 도움을 선택해 주세요');

    const intro = $('.accessibility-application-intro p');
    if (intro && !intro.dataset.easyMoved) {
      intro.dataset.easyMoved = '1';
      const old = intro.innerHTML;
      intro.remove();
      $('.accessibility-application-intro')
        ?.append(details('선택 방법 보기', `<p>${old}</p>`));
    }

    set('#disabledPersonCheckbox + span strong', '장애인입니다');
    set('#wheelchairUserCheckbox + span strong', '휠체어 자리가 필요합니다');
    set(
      '#wheelchairUserCheckbox + span small',
      '휠체어를 사용하는 경우 선택해 주세요'
    );
    set('#accessibilityDetails legend', '복지관을 이용하고 있나요?');

    const opts = $$('#accessibilityDetails .binary-choice-buttons label span');
    if (opts[0]) opts[0].textContent = '네, 이용해요';
    if (opts[1]) opts[1].textContent = '아니요';

    set('#privacyDetailsButton', '개인정보 내용 보기');
    set('#submitButton', '신청하고 QR 받기');

    const sp = $('.special-group-application');
    if (sp) {
      set(
        '.special-group-application summary strong',
        '가족·동행자도 함께 신청할까요?'
      );
      set('.special-group-application summary span', '여러 명 함께 신청');

      const g = sp.querySelector('.special-group-guide');
      if (g && !g.dataset.easyDone) {
        g.dataset.easyDone = '1';
        const old = g.innerHTML;
        g.innerHTML =
          '대표 전화번호 하나로 여러 명을 함께 신청할 수 있어요.';
        g.after(
          details(
            '함께 신청하는 방법 자세히 보기',
            `<p>${old}</p>`
          )
        );
      }

      set('#addGroupMemberButton', '＋ 사람 추가');
      set('#groupSubmitButton', '함께 신청하고 QR 받기');
    }

    const programApply = $('#programApplyButton');
    if (programApply) {
      const span = programApply.querySelector('span');
      const strong = programApply.querySelector('strong');
      if (span) span.textContent = '행사 내용을 확인했어요';
      if (strong) strong.textContent = '참가 신청하기';
    }

    const revealApply = $('#revealApplicationButton span');
    if (revealApply) revealApply.textContent = '참가 신청하기';

    set('#lookup .section-heading h2', '내 신청 확인');
    const lp = $('#lookup .section-heading > p:last-child');
    if (lp) {
      lp.textContent =
        '이름과 전화번호를 입력하면 내 QR을 다시 볼 수 있어요.';
    }
    set('#lookupButton', '내 신청·QR 확인하기');
    set('#showRememberedTicketButton', '저장된 QR 보기');

    const trailer = $('#trailer');
    if (trailer && !trailer.dataset.easyDone) {
      trailer.dataset.easyDone = '1';
      set('#trailer .section-heading h2', '20주년 영상');

      const p = $('#trailer .section-heading p:last-child');
      if (p) p.textContent = '보고 싶을 때 재생해 주세요.';

      const frame = trailer.querySelector('.trailer-frame');
      if (frame) {
        const d = details('20주년 영상 보기', '');
        d.classList.add('easy-video-details');
        frame.before(d);
        d.querySelector('.easy-more-body')?.append(frame);
      }

      const cap = trailer.querySelector('.trailer-caption');
      if (cap) cap.textContent = '영상은 보지 않아도 참가 신청할 수 있어요.';
    }

    set('.venue-map-button', '지도에서 길 찾기');

    const classes = [
      [
        '#submitButton,#groupSubmitButton,#revealApplicationButton,#programApplyButton',
        'easy-primary'
      ],
      ['#lookupButton,#showRememberedTicketButton', 'easy-check'],
      ['.venue-map-button', 'easy-map'],
      ['#addGroupMemberButton', 'easy-add'],
      ['#copyVenueAddressButton', 'easy-secondary']
    ];

    classes.forEach(([selector, className]) =>
      $$(selector).forEach(e => e.classList.add(className))
    );
  }

  async function boot() {
    const ok = await recoverPublicCoreIfNeeded();

    // core initialize()는 eval 내부에서 바로 호출됩니다.
    // DOM 변경이 반영된 뒤 쉬운 UI 적용.
    setTimeout(() => {
      applyEasyUi();
      if (ok) loadCapacityAddon();
    }, 50);
  }

  if (document.readyState === 'loading') {
    // 스크립트 자체는 body 끝에서 로딩되지만, fetch 복구를 바로 시작합니다.
    boot();
  } else {
    boot();
  }
})();
