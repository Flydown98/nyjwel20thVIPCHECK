'use strict';

/**
 * 현재 대표자 그룹 + 자동 기관 그룹 통합 표시 v1.0
 *
 * 기존 수동 대표자 그룹은 그대로 표시.
 * 같은 소속기관 2명 이상인 자동 그룹 후보도 오른쪽 "현재 대표자 그룹"에 함께 표시.
 * 자동 그룹은 대표자 미지정 상태이며 QR을 누가 찍든 그룹 확인창이 뜨는 구조.
 */
(() => {
  const MASTER_RE = /\[REPQR:MASTER:([A-Z0-9_-]+)\]/i;
  const MEMBER_RE = /\[REPQR:MEMBER:([A-Z0-9_-]+)\]/i;

  const INTERNAL_PATTERNS = [
    '남양주시장애인복지관',
    '사회서비스',
    '활동지원사',
    '활동지원팀',
    '활동지원',
    '이용인',
    '낮활동팀',
    '낮활동',
    '주간활동팀',
    '주간활동',
    '직업재활팀',
    '기획협력지원팀',
    '지역융합서비스팀',
    '운영지원팀',
    '직원',
    '복지관직원'
  ];

  const esc = v => String(v ?? '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');

  const normalizeOrg = value => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[㈜]/g,'주식회사')
    .replace(/\(주\)/g,'주식회사')
    .replace(/\s+/g,'')
    .replace(/[·ㆍ.,]/g,'');

  const isInternalOrg = value => {
    const normalized = normalizeOrg(value);
    if (!normalized) return true;
    return INTERNAL_PATTERNS.some(pattern =>
      normalized.includes(normalizeOrg(pattern))
    );
  };

  function markerInfo(p) {
    const note = String(p?.note || '');
    let m = note.match(MASTER_RE);
    if (m) return { role:'master', representativeId:m[1].toUpperCase() };
    m = note.match(MEMBER_RE);
    if (m) return { role:'member', representativeId:m[1].toUpperCase() };
    return null;
  }

  function participants() {
    try {
      return Array.isArray(state?.participants) ? state.participants : [];
    } catch (_) {
      return [];
    }
  }

  function manualGroups() {
    const rows = participants();
    return rows
      .filter(p => markerInfo(p)?.role === 'master')
      .map(rep => {
        const members = rows.filter(p =>
          markerInfo(p)?.representativeId === String(rep.id).toUpperCase()
        );
        return { rep, members };
      });
  }

  function autoGroups() {
    const rows = participants();
    const manualIds = new Set();

    manualGroups().forEach(group => {
      group.members.forEach(p => manualIds.add(String(p.id)));
    });

    const map = new Map();

    rows.forEach(p => {
      if (!p || p.active === false) return;
      if (String(p.participationStatus || '참여') === '미참여') return;
      if (manualIds.has(String(p.id))) return;

      const org = String(p.organization || '').trim();
      if (!org || isInternalOrg(org)) return;

      const key = normalizeOrg(org);
      if (!key) return;

      if (!map.has(key)) {
        map.set(key, {
          key,
          organization: org,
          members: []
        });
      }
      map.get(key).members.push(p);
    });

    return [...map.values()]
      .filter(group => group.members.length >= 2)
      .map(group => ({
        ...group,
        arrived: group.members.filter(p => p.arrived).length,
        pending: group.members.filter(p => !p.arrived).length
      }))
      .sort((a,b) =>
        b.members.length - a.members.length ||
        a.organization.localeCompare(b.organization,'ko')
      );
  }

  function ensureStyles() {
    if (document.getElementById('gmAutoViewStyles')) return;
    const style = document.createElement('style');
    style.id = 'gmAutoViewStyles';
    style.textContent = `
      #gmGroupList .gm-auto-group-card{
        border:1px solid #c9d8f2;
        background:#f8fbff;
      }
      #gmGroupList .gm-auto-head{
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
        gap:8px;
      }
      #gmGroupList .gm-auto-badge{
        display:inline-flex;
        align-items:center;
        min-height:25px;
        padding:3px 8px;
        border-radius:999px;
        background:#e8f0ff;
        color:#1d4ed8;
        font-size:.72rem;
        font-weight:900;
        white-space:nowrap;
      }
      #gmGroupList .gm-auto-note{
        margin-top:7px;
        color:#53657d;
        font-size:.78rem;
        line-height:1.45;
      }
      #gmGroupList .gm-list-divider{
        display:flex;
        align-items:center;
        gap:8px;
        margin:12px 0 7px;
        color:#64748b;
        font-size:.77rem;
        font-weight:900;
      }
      #gmGroupList .gm-list-divider::before,
      #gmGroupList .gm-list-divider::after{
        content:'';
        flex:1;
        height:1px;
        background:#dbe3ef;
      }
      #gmGroupList .gm-auto-count{
        color:#1d4ed8;
        font-weight:900;
      }
    `;
    document.head.appendChild(style);
  }

  function renderCombined() {
    const host = document.querySelector('#gmGroupList');
    if (!host) return;

    ensureStyles();

    const manual = manualGroups();
    const auto = autoGroups();

    const manualHtml = manual.map(g => `
      <div class="gm-group-card">
        <div>
          <strong>👑 ${esc(g.rep.name)}</strong>
          <small>${g.members.length}명 · ${esc(g.rep.id)}</small>
        </div>
        <div class="gm-members">
          ${g.members.map(p =>
            `<span>${esc(p.name)}${p.id===g.rep.id?' · 대표':''}</span>`
          ).join('')}
        </div>
        <button
          type="button"
          class="button small secondary"
          data-clear="${esc(g.rep.id)}"
        >그룹 해제</button>
      </div>
    `).join('');

    const autoHtml = auto.map(g => `
      <div class="gm-group-card gm-auto-group-card">
        <div class="gm-auto-head">
          <div>
            <strong>🏢 ${esc(g.organization)}</strong>
            <small>
              ${g.members.length}명 · 도착 ${g.arrived}명 · 미도착 ${g.pending}명
            </small>
          </div>
          <span class="gm-auto-badge">대표자 미지정</span>
        </div>

        <div class="gm-members">
          ${g.members.map(p =>
            `<span>${esc(p.name)}${p.arrived?' · 도착':''}</span>`
          ).join('')}
        </div>

        <div class="gm-auto-note">
          이 그룹은 대표자를 미리 정하지 않습니다.
          구성원 중 누구의 QR을 찍어도
          <strong>‘이 사람만 / 같은 기관 함께 도착’</strong> 선택창이 표시됩니다.
        </div>
      </div>
    `).join('');

    if (!manual.length && !auto.length) {
      host.innerHTML =
        '<div class="empty-state compact">현재 묶을 수 있는 대표자·기관 그룹이 없습니다.</div>';
      return;
    }

    host.innerHTML =
      (manual.length
        ? `<div class="gm-list-divider">직접 지정 대표자 그룹</div>${manualHtml}`
        : '') +
      (auto.length
        ? `<div class="gm-list-divider">자동 기관 그룹 <span class="gm-auto-count">${auto.length}개</span></div>${autoHtml}`
        : '');
  }

  function scheduleRender() {
    clearTimeout(scheduleRender.timer);
    scheduleRender.timer = setTimeout(renderCombined, 100);
  }

  function init() {
    // 기존 admin-group.js가 먼저 패널을 생성할 시간을 아주 짧게 줍니다.
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (document.querySelector('#gmGroupList')) {
        clearInterval(timer);
        scheduleRender();
      } else if (tries > 40) {
        clearInterval(timer);
      }
    }, 100);

    // 고속화 패치 이벤트에만 반응: 상시 3초 반복 없음.
    window.addEventListener('nyj20:participants-rendered', scheduleRender);
    window.addEventListener('nyj20:data-updated', event => {
      if (event?.detail?.view === 'participants') scheduleRender();
    });
    window.addEventListener('nyj20:view-changed', event => {
      if (event?.detail?.view === 'participants') scheduleRender();
    });

    // 수동 그룹 저장/해제 후 기존 코드가 gmGroupList를 덮어쓴 경우만 다시 합칩니다.
    const observe = () => {
      const host = document.querySelector('#gmGroupList');
      if (!host || host.dataset.autoViewObserved === '1') return;
      host.dataset.autoViewObserved = '1';

      let internal = false;
      const observer = new MutationObserver(() => {
        if (internal) return;
        clearTimeout(observer._timer);
        observer._timer = setTimeout(() => {
          internal = true;
          try { renderCombined(); }
          finally { setTimeout(() => { internal = false; }, 0); }
        }, 80);
      });
      observer.observe(host, { childList:true });
    };

    setTimeout(observe, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once:true });
  } else {
    init();
  }
})();
