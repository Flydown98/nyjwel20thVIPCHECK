'use strict';

/**
 * 남양주시장애인복지관 20주년
 * 자동 기관 그룹 QR 접수 addon v1.1
 *
 * 동작
 * - 대표자를 미리 지정하지 않음
 * - 같은 소속기관의 참가자가 2명 이상이면 "자동 기관 그룹 후보"로 표시
 * - 내부 팀/서비스명은 자동 그룹 후보에서 제외
 * - 후보 그룹의 누구 QR을 찍어도:
 *      [이 사람만 도착] [같은 기관 함께 도착]
 *   두 버튼을 보여주고 관리자가 현장에서 결정
 * - 그룹 함께 도착을 선택하면 아직 미도착인 구성원만 순차 도착 처리
 * - 기존 대표자 그룹/QR 기능과 충돌하지 않도록 별도 동작
 */

(() => {
  const ADDON_ID = 'autoOrgGroupAddonPanel';
  const STORAGE_KEY = 'nyj20_auto_org_group_disabled_v1';

  // 내부 팀/서비스/이용인 표기로 간주하여 자동 기관그룹에서 제외.
  // 너무 넓은 "장애인복지관" 단어 자체는 제외하지 않습니다.
  // 다른 지역 장애인복지관 같은 외부 기관도 기업/기관 그룹으로 묶일 수 있기 때문입니다.
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

  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const digits = value => String(value || '').replace(/\D/g, '');

  function normalizeOrg(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[㈜]/g, '주식회사')
      .replace(/\(주\)/g, '주식회사')
      .replace(/\s+/g, '')
      .replace(/[·ㆍ.,]/g, '');
  }

  function displayOrg(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function isInternalOrg(value) {
    const normalized = normalizeOrg(value);
    if (!normalized) return true;

    return INTERNAL_PATTERNS.some(pattern => {
      const p = normalizeOrg(pattern);
      return normalized.includes(p);
    });
  }

  function participantIsActive(p) {
    if (!p) return false;
    if (p.active === false) return false;
    if (String(p.participationStatus || '참여') === '미참여') return false;
    return true;
  }

  function disabledKeys() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return new Set(Array.isArray(raw) ? raw : []);
    } catch (_) {
      return new Set();
    }
  }

  function setDisabled(key, disabled) {
    const set = disabledKeys();
    if (disabled) set.add(key);
    else set.delete(key);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  }

  function buildCandidateGroups() {
    if (typeof state === 'undefined' || !Array.isArray(state.participants)) return [];

    const map = new Map();

    state.participants
      .filter(participantIsActive)
      .forEach(p => {
        const org = displayOrg(p.organization);
        const key = normalizeOrg(org);
        if (!key || isInternalOrg(org)) return;

        if (!map.has(key)) {
          map.set(key, {
            key,
            organization: org,
            members: []
          });
        }
        map.get(key).members.push(p);
      });

    const disabled = disabledKeys();

    return [...map.values()]
      .filter(group => group.members.length >= 2)
      .map(group => {
        const phones = [...new Set(
          group.members.map(p => digits(p.phone)).filter(Boolean)
        )];
        return {
          ...group,
          disabled: disabled.has(group.key),
          commonPhone: phones.length === 1 ? phones[0] : '',
          phoneCount: phones.length,
          arrivedCount: group.members.filter(p => p.arrived).length,
          pendingCount: group.members.filter(p => !p.arrived).length
        };
      })
      .sort((a, b) =>
        b.members.length - a.members.length ||
        a.organization.localeCompare(b.organization, 'ko')
      );
  }

  function groupForParticipant(p) {
    if (!p || isInternalOrg(p.organization)) return null;
    const key = normalizeOrg(p.organization);
    if (!key) return null;
    const group = buildCandidateGroups().find(g => g.key === key);
    if (!group || group.disabled) return null;
    return group;
  }

  function injectStyles() {
    if (document.getElementById('autoOrgGroupAddonStyles')) return;
    const style = document.createElement('style');
    style.id = 'autoOrgGroupAddonStyles';
    style.textContent = `
      .aog-panel{margin:0 0 18px;border:2px solid #d9e4f6;background:#fbfdff}
      .aog-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
      .aog-heading h3{margin:0 0 4px}
      .aog-help{margin:0;color:#64748b;font-size:.92rem;line-height:1.55}
      .aog-summary{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 14px}
      .aog-chip{display:inline-flex;align-items:center;min-height:34px;padding:6px 10px;border-radius:999px;background:#eef4ff;color:#23427b;font-weight:800;font-size:.86rem}
      .aog-list{display:grid;gap:10px}
      .aog-card{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;padding:14px;border:1px solid #d9e2ef;border-radius:14px;background:#fff}
      .aog-card.disabled{opacity:.58;background:#f8fafc}
      .aog-card-main strong{display:block;font-size:1rem;margin-bottom:4px}
      .aog-card-main small{display:block;color:#64748b;line-height:1.5}
      .aog-members{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
      .aog-members span{display:inline-flex;padding:4px 8px;border-radius:999px;background:#f1f5f9;font-size:.78rem;color:#334155}
      .aog-toggle{min-width:116px;min-height:44px;border-radius:12px;border:1px solid #7891b7;background:#fff;color:#29466f;font-weight:900;cursor:pointer}
      .aog-card:not(.disabled) .aog-toggle{background:#174ea6;color:#fff;border-color:#174ea6}

      .aog-modal-backdrop{
        position:fixed;inset:0;z-index:999999;
        display:flex;align-items:center;justify-content:center;
        padding:20px;background:rgba(15,23,42,.72)
      }
      .aog-modal{
        width:min(620px,100%);max-height:min(760px,90vh);overflow:auto;
        padding:24px;border-radius:22px;background:#fff;
        box-shadow:0 30px 80px rgba(0,0,0,.32)
      }
      .aog-modal .eyebrow{margin:0 0 6px;color:#1d4ed8;font-weight:900;letter-spacing:.06em}
      .aog-modal h2{margin:0 0 8px;font-size:1.65rem;line-height:1.3}
      .aog-modal p{line-height:1.65;color:#475569}
      .aog-modal-org{
        margin:16px 0;padding:15px 16px;border-radius:14px;
        background:#eef4ff;border:1px solid #c7d7f4
      }
      .aog-modal-org strong{display:block;font-size:1.12rem;color:#163f85}
      .aog-modal-members{
        display:grid;grid-template-columns:repeat(2,minmax(0,1fr));
        gap:7px;margin:12px 0 18px
      }
      .aog-modal-member{
        padding:9px 10px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;
        font-size:.88rem
      }
      .aog-modal-member.arrived{opacity:.55;text-decoration:line-through}
      .aog-actions{display:grid;grid-template-columns:1fr 1.25fr;gap:10px}
      .aog-actions button{
        min-height:64px;border-radius:16px;border:2px solid #174ea6;
        padding:12px 16px;font-weight:900;font-size:1.05rem;cursor:pointer
      }
      .aog-only{background:#fff;color:#174ea6}
      .aog-all{background:#174ea6;color:#fff}
      .aog-modal-note{margin:10px 0 0!important;font-size:.82rem;color:#64748b!important}
      .aog-checkin-summary{
        margin-top:14px;padding:13px 15px;border-radius:14px;
        background:#eefbf4;border:1px solid #b7e4c8;color:#17633a;font-weight:800
      }
      @media(max-width:680px){
        .aog-card{grid-template-columns:1fr}
        .aog-toggle{width:100%}
        .aog-modal{padding:19px}
        .aog-modal-members{grid-template-columns:1fr}
        .aog-actions{grid-template-columns:1fr}
        .aog-actions button{min-height:62px}
      }
    `;
    document.head.appendChild(style);
  }

  function panelHtml() {
    return `
      <article id="${ADDON_ID}" class="panel aog-panel">
        <div class="aog-heading">
          <div>
            <h3>자동 기관 그룹 후보</h3>
            <p class="aog-help">
              같은 소속기관이 2명 이상인 경우만 표시합니다.
              대표자를 미리 정하지 않고, 현장에서 누구의 QR을 찍더라도
              그룹 도착 여부를 선택할 수 있습니다.
            </p>
          </div>
          <button id="aogRefresh" class="button secondary" type="button">후보 다시 확인</button>
        </div>
        <div id="aogSummary" class="aog-summary"></div>
        <div id="aogList" class="aog-list"></div>
      </article>
    `;
  }

  function ensurePanel() {
    if (document.getElementById(ADDON_ID)) return;
    const view = document.querySelector('#view-participants');
    if (!view) return;

    const host = document.createElement('div');
    host.innerHTML = panelHtml();

    const firstPanel = view.querySelector('.panel');
    if (firstPanel) firstPanel.before(host.firstElementChild);
    else view.appendChild(host.firstElementChild);

    document.querySelector('#aogRefresh')?.addEventListener('click', renderPanel);
    document.querySelector('#aogList')?.addEventListener('click', event => {
      const button = event.target.closest('[data-aog-toggle]');
      if (!button) return;
      const key = button.dataset.aogToggle || '';
      const group = buildCandidateGroups().find(g => g.key === key);
      if (!group) return;
      setDisabled(key, !group.disabled);
      renderPanel();
    });
  }

  function formatPhone(phone) {
    const d = digits(phone);
    if (d.length === 11) return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`;
    if (d.length === 10) return `${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`;
    return phone || '';
  }

  function renderPanel() {
    ensurePanel();
    const list = document.querySelector('#aogList');
    const summary = document.querySelector('#aogSummary');
    if (!list || !summary) return;

    const groups = buildCandidateGroups();
    const enabled = groups.filter(g => !g.disabled);
    const people = enabled.reduce((sum, g) => sum + g.members.length, 0);

    summary.innerHTML = `
      <span class="aog-chip">후보 ${groups.length}개 기관</span>
      <span class="aog-chip">묶음 사용 ${enabled.length}개</span>
      <span class="aog-chip">대상 ${people}명</span>
    `;

    if (!groups.length) {
      list.innerHTML = '<div class="empty-state compact">현재 자동으로 묶을 외부 기관 후보가 없습니다.</div>';
      return;
    }

    list.innerHTML = groups.map(group => {
      const phoneText = group.commonPhone
        ? `공통 연락처 ${formatPhone(group.commonPhone)}`
        : group.phoneCount > 1
          ? `연락처 ${group.phoneCount}종류 · 확인 권장`
          : '연락처 없음';

      return `
        <div class="aog-card ${group.disabled ? 'disabled' : ''}">
          <div class="aog-card-main">
            <strong>${esc(group.organization)} · ${group.members.length}명</strong>
            <small>
              도착 ${group.arrivedCount}명 / 미도착 ${group.pendingCount}명 · ${esc(phoneText)}
            </small>
            <div class="aog-members">
              ${group.members.map(p =>
                `<span>${esc(p.name)}${p.arrived ? ' · 도착' : ''}</span>`
              ).join('')}
            </div>
          </div>
          <button
            class="aog-toggle"
            data-aog-toggle="${esc(group.key)}"
            type="button"
          >${group.disabled ? '묶음 사용 안함' : '묶음 사용 중'}</button>
        </div>
      `;
    }).join('');
  }

  function resolveParticipant(pOrCode) {
    if (typeof state === 'undefined' || !Array.isArray(state.participants)) return null;
    if (pOrCode && typeof pOrCode === 'object' && pOrCode.id) {
      return state.participants.find(p => p.id === pOrCode.id) || pOrCode;
    }

    let code = String(pOrCode || '').trim();
    try {
      if (typeof parseQrPayload === 'function') code = parseQrPayload(code);
    } catch (_) {}
    code = String(code || '').trim().toUpperCase();

    return state.participants.find(p => String(p.id || '').trim().toUpperCase() === code) || null;
  }

  function askGroupCheckin(group, scannedPerson) {
    const pending = group.members.filter(p => !p.arrived);
    if (pending.length <= 1) return Promise.resolve('single');

    return new Promise(resolve => {
      const backdrop = document.createElement('div');
      backdrop.className = 'aog-modal-backdrop';

      backdrop.innerHTML = `
        <section class="aog-modal" role="dialog" aria-modal="true" aria-labelledby="aogDialogTitle">
          <p class="eyebrow">기관 그룹 확인</p>
          <h2 id="aogDialogTitle">${esc(scannedPerson.name)} 님 QR을 확인했습니다.</h2>
          <p>
            같은 소속기관으로 등록된 참가자가 있습니다.
            <strong>이 한 사람만</strong> 도착 처리할지,
            <strong>같은 기관 사람들을 함께</strong> 도착 처리할지 선택해 주세요.
          </p>

          <div class="aog-modal-org">
            <strong>${esc(group.organization)}</strong>
            <span>총 ${group.members.length}명 · 현재 미도착 ${pending.length}명</span>
          </div>

          <div class="aog-modal-members">
            ${group.members.map(p => `
              <div class="aog-modal-member ${p.arrived ? 'arrived' : ''}">
                ${esc(p.name)} · ${p.arrived ? '이미 도착' : '미도착'}
              </div>
            `).join('')}
          </div>

          <div class="aog-actions">
            <button type="button" class="aog-only" data-choice="single">
              이 사람만 도착
            </button>
            <button type="button" class="aog-all" data-choice="group">
              같은 기관 함께 도착
            </button>
          </div>
          <p class="aog-modal-note">
            이미 도착 처리된 사람은 다시 처리하지 않습니다.
          </p>
        </section>
      `;

      document.body.appendChild(backdrop);
      const finish = choice => {
        backdrop.remove();
        resolve(choice);
      };

      backdrop.addEventListener('click', event => {
        const button = event.target.closest('[data-choice]');
        if (!button) return;
        finish(button.dataset.choice);
      });

      backdrop.querySelector('[data-choice="group"]')?.focus();
    });
  }

  async function groupCheckIn(group, scannedPerson) {
    const pending = group.members.filter(p => !p.arrived);
    const success = [];
    const failed = [];

    for (const member of pending) {
      try {
        const r = await jsonpRequest('checkIn', { code: member.id });
        if (r?.participant && typeof updateCache === 'function') {
          updateCache(r.participant);
        }
        success.push(r?.participant || member);
      } catch (error) {
        failed.push({
          member,
          error: error?.message || String(error)
        });
      }
    }

    const scannedFresh =
      (typeof state !== 'undefined' && Array.isArray(state.participants)
        ? state.participants.find(p => p.id === scannedPerson.id)
        : null) ||
      success.find(p => p.id === scannedPerson.id) ||
      scannedPerson;

    if (typeof showCheckinResult === 'function') {
      showCheckinResult(scannedFresh, Boolean(scannedPerson.arrived), null);
      const result = document.querySelector('#checkinResult');
      if (result) {
        result.insertAdjacentHTML(
          'beforeend',
          `<div class="aog-checkin-summary">
            ${esc(group.organization)} · ${success.length}명 함께 도착 처리
            ${failed.length ? ` · ${failed.length}명 확인 필요` : ''}
          </div>`
        );
      }
    }

    if (typeof refreshFieldStats === 'function') refreshFieldStats();
    renderPanel();

    if (failed.length) {
      const names = failed.map(x => x.member.name).join(', ');
      showToast?.(
        `${success.length}명 도착 완료 · 처리되지 않은 참가자: ${names}`,
        8000
      );
    } else {
      showToast?.(
        `${group.organization} ${success.length}명을 함께 도착 처리했습니다.`,
        6000
      );
    }

    return {
      group: true,
      success,
      failed
    };
  }

  function installCheckInWrapper() {
    if (typeof checkIn !== 'function') return false;
    if (checkIn.__autoOrgGroupWrapped) return true;

    const originalCheckIn = checkIn;

    const wrapped = async function(pOrCode) {
      const participant = resolveParticipant(pOrCode);
      const group = groupForParticipant(participant);

      // 후보가 아니거나, 남은 미도착자가 1명 이하라면 기존 접수 그대로 사용
      if (!participant || !group || group.pendingCount <= 1) {
        return originalCheckIn(pOrCode);
      }

      try {
        if (typeof scanBusy !== 'undefined') scanBusy = true;
      } catch (_) {}

      try {
        const choice = await askGroupCheckin(group, participant);

        if (choice === 'group') {
          return await groupCheckIn(group, participant);
        }

        // 한 사람만 처리하는 경우 기존 로직을 그대로 호출
        try {
          if (typeof scanBusy !== 'undefined') scanBusy = false;
        } catch (_) {}
        return await originalCheckIn(pOrCode);
      } finally {
        try {
          if (typeof scanBusy !== 'undefined') scanBusy = false;
        } catch (_) {}
      }
    };

    wrapped.__autoOrgGroupWrapped = true;
    wrapped.__originalCheckIn = originalCheckIn;

    // 전역 함수 선언을 실제로 교체
    checkIn = wrapped;
    try { window.checkIn = wrapped; } catch (_) {}

    return true;
  }

  function init() {
    injectStyles();
    ensurePanel();
    renderPanel();

    let tries = 0;
    const installTimer = setInterval(() => {
      tries += 1;
      if (installCheckInWrapper() || tries > 40) clearInterval(installTimer);
    }, 250);

    // v1.1: 3초마다 참가자 전체를 다시 계산하던 반복작업 제거.
    // 실제 데이터가 갱신되거나 참가자 메뉴를 열었을 때만 후보를 다시 계산합니다.
    let renderTimer = null;
    const requestRender = () => {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(() => {
        if (document.hidden) return;
        renderPanel();
      }, 120);
    };

    window.addEventListener('nyj20:participants-rendered', requestRender);
    window.addEventListener('nyj20:data-updated', event => {
      if (event?.detail?.view === 'participants') requestRender();
    });
    window.addEventListener('nyj20:view-changed', event => {
      if (event?.detail?.view === 'participants') requestRender();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
