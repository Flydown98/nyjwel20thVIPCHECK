'use strict';

(() => {
  const ROOT_ID = 'groupMessageAdminAddon';
  const MASTER_RE = /\[REPQR:MASTER:([A-Z0-9_-]+)\]/i;
  const MEMBER_RE = /\[REPQR:MEMBER:([A-Z0-9_-]+)\]/i;
  const selectedIds = new Set();

  const esc = v => String(v ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');

  const digits = v => String(v || '').replace(/\D/g,'');
  const participantById = id =>
    (state.participants || []).find(p => String(p.id).toUpperCase() === String(id).toUpperCase());

  function markerInfo(p) {
    const note = String(p?.note || '');
    let m = note.match(MASTER_RE);
    if (m) return {role:'master', representativeId:m[1].toUpperCase()};
    m = note.match(MEMBER_RE);
    if (m) return {role:'member', representativeId:m[1].toUpperCase()};
    return null;
  }

  function representativeGroups() {
    return (state.participants || [])
      .filter(p => markerInfo(p)?.role === 'master')
      .map(rep => {
        const members = (state.participants || []).filter(p =>
          markerInfo(p)?.representativeId === rep.id
        );
        return {rep, members};
      });
  }

  function ensureCss() {
    if (document.querySelector('link[data-gm-addon]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'admin-group.css?v=1.1';
    link.dataset.gmAddon = '1';
    document.head.appendChild(link);
  }

  function panelHtml() {
    return `
      <article id="${ROOT_ID}" class="panel gm-panel">
        <div class="panel-heading">
          <div>
            <h3>동행 대표자 QR · 초대장 발송</h3>
            <p class="help-text">여러 참가자를 직접 묶고 대표자를 지정합니다. 대표자 QR 하나로 그룹 전체 현장 확인이 가능합니다.</p>
          </div>
        </div>

        <div class="gm-grid">
          <section class="gm-section">
            <div class="gm-section-title">
              <div><strong>대표자 그룹 만들기</strong><span>2~30명 선택 후 대표자 1명 지정</span></div>
              <b id="gmSelectedCount">0명</b>
            </div>
            <div class="gm-search-row">
              <input id="gmSearch" type="search" placeholder="이름 / 연락처 / 기관 검색">
              <button id="gmSearchButton" class="button secondary" type="button">검색</button>
            </div>
            <div id="gmSearchResults" class="gm-search-results"><div class="empty-state compact">참가자를 검색하세요.</div></div>
            <div id="gmSelected" class="gm-selected"></div>
            <label class="gm-label">대표자
              <select id="gmRepresentative"><option value="">2명 이상 선택하세요.</option></select>
            </label>
            <div class="gm-actions">
              <button id="gmCreate" class="button primary" type="button">대표자 그룹 저장</button>
              <button id="gmReset" class="button secondary" type="button">선택 초기화</button>
            </div>
          </section>

          <section class="gm-section">
            <div class="gm-section-title"><div><strong>현재 대표자 그룹</strong><span>개인 QR도 그대로 사용 가능</span></div></div>
            <div id="gmGroupList" class="gm-group-list"></div>
          </section>
        </div>

        <hr class="gm-divider">

        <section>
          <div class="gm-section-title">
            <div><strong>카카오 알림톡 · 개인 QR 링크</strong><span>즉시 발송 또는 행사 전날 예약 발송</span></div>
            <span id="gmConfigBadge" class="badge warning">설정 확인 전</span>
          </div>
          <div class="gm-message-options">
            <label>발송 대상
              <select id="gmTarget">
                <option value="all">참여 예정 전체</option>
                <option value="pending">미도착 참가자만</option>
                <option value="representatives">대표자만</option>
              </select>
            </label>
            <label>예약 일시
              <input id="gmScheduleAt" type="datetime-local">
            </label>
          </div>
          <div class="gm-actions">
            <button id="gmSendNow" class="button primary" type="button">지금 일괄 발송</button>
            <button id="gmSchedule" class="button secondary" type="button">예약 발송 등록</button>
            <button id="gmConfigCheck" class="button secondary" type="button">발송 설정 확인</button>
          </div>
          <p class="help-text">알림톡은 Google Apps Script에서 발송하며 API 키는 GitHub에 저장하지 않습니다.</p>
        </section>
      </article>`;
  }

  function mount() {
    if (document.getElementById(ROOT_ID)) return;
    const view = document.querySelector('#view-participants');
    if (!view) return;
    const holder = document.createElement('div');
    holder.innerHTML = panelHtml();
    view.prepend(holder.firstElementChild);
    bind();
    renderGroups();
    setDefaultSchedule();
    checkConfig(true);
  }

  function search() {
    const q = String(document.querySelector('#gmSearch')?.value || '').trim().toLowerCase();
    const host = document.querySelector('#gmSearchResults');
    if (!host) return;
    if (!q) {
      host.innerHTML = '<div class="empty-state compact">참가자를 검색하세요.</div>';
      return;
    }
    const qd = digits(q);
    const rows = (state.participants || []).filter(p => {
      if (String(p.participationStatus || '참여') === '미참여') return false;
      const hay = `${p.name||''} ${p.phone||''} ${p.organization||''} ${p.id||''}`.toLowerCase();
      return hay.includes(q) || (qd.length >= 3 && digits(p.phone).includes(qd));
    }).slice(0,50);

    host.innerHTML = rows.length ? rows.map(p => {
      const info = markerInfo(p);
      const selected = selectedIds.has(p.id);
      return `<button type="button" class="gm-result ${selected?'selected':''}" data-id="${esc(p.id)}">
        <b>${selected?'✓':'+'}</b>
        <span><strong>${esc(p.name)} ${info?`<em>${info.role==='master'?'👑 대표':'↳ 동행'}</em>`:''}</strong>
        <small>${esc(p.organization||'소속 없음')} · ${esc(p.phone||'연락처 없음')} · ${esc(p.seat||'미배정')}</small></span>
      </button>`;
    }).join('') : '<div class="empty-state compact">검색 결과가 없습니다.</div>';
  }

  function renderSelected() {
    const people = [...selectedIds].map(participantById).filter(Boolean);
    document.querySelector('#gmSelectedCount').textContent = `${people.length}명`;
    document.querySelector('#gmSelected').innerHTML = people.length
      ? people.map(p => `<span>${esc(p.name)}<button type="button" data-remove="${esc(p.id)}">×</button></span>`).join('')
      : '<small>선택된 참가자가 없습니다.</small>';

    const select = document.querySelector('#gmRepresentative');
    select.innerHTML = people.length >= 2
      ? '<option value="">대표자를 선택하세요.</option>' +
        people.map(p => `<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.phone||'')}</option>`).join('')
      : '<option value="">2명 이상 선택하세요.</option>';
    search();
  }

  async function createGroup() {
    const ids = [...selectedIds];
    const representativeId = document.querySelector('#gmRepresentative')?.value || '';
    if (ids.length < 2) return showToast('2명 이상 선택해 주세요.',4500);
    if (!representativeId) return showToast('대표자를 선택해 주세요.',4500);

    const rep = participantById(representativeId);
    if (!confirm(`${rep?.name || '선택한 참가자'} 님을 대표자로 총 ${ids.length}명을 묶을까요?`)) return;

    try {
      await jsonpRequest('adminSetRepresentativeGroup',{ids, representativeId});
      await refreshFromServer({silent:true,full:false});
      selectedIds.clear();
      renderSelected();
      renderGroups();
      showToast(`${rep.name} 님 대표 그룹을 저장했습니다.`,6000);
    } catch(e) {
      showToast(`대표자 그룹 저장 실패: ${e.message}`,8000);
    }
  }

  async function clearGroup(id) {
    const rep = participantById(id);
    if (!confirm(`${rep?.name || ''} 님 대표 그룹을 해제할까요?`)) return;
    try {
      await jsonpRequest('adminClearRepresentativeGroup',{representativeId:id});
      await refreshFromServer({silent:true,full:false});
      renderGroups();
      showToast('대표자 그룹을 해제했습니다.');
    } catch(e) {
      showToast(`그룹 해제 실패: ${e.message}`,7000);
    }
  }

  function renderGroups() {
    const host = document.querySelector('#gmGroupList');
    if (!host) return;
    const groups = representativeGroups();
    host.innerHTML = groups.length ? groups.map(g => `
      <div class="gm-group-card">
        <div><strong>👑 ${esc(g.rep.name)}</strong><small>${g.members.length}명 · ${esc(g.rep.id)}</small></div>
        <div class="gm-members">${g.members.map(p=>`<span>${esc(p.name)}${p.id===g.rep.id?' · 대표':''}</span>`).join('')}</div>
        <button type="button" class="button small secondary" data-clear="${esc(g.rep.id)}">그룹 해제</button>
      </div>`).join('') : '<div class="empty-state compact">대표자 그룹이 없습니다.</div>';
  }

  function setDefaultSchedule() {
    const el = document.querySelector('#gmScheduleAt');
    if (!el || el.value) return;
    el.value = '2026-09-16T10:00';
  }

  async function checkConfig(silent=false) {
    try {
      const r = await jsonpRequest('invitationMessageConfigStatus',{});
      const b = document.querySelector('#gmConfigBadge');
      if (b) {
        b.className = `badge ${r?.ready?'connected':'warning'}`;
        b.textContent = r?.ready ? '알림톡 준비됨' : '알림톡 설정 필요';
      }
      if (!silent) showToast(r?.ready ? '발송 설정이 완료되어 있습니다.' : `설정 필요: ${(r?.missing||[]).join(', ')}`,6500);
      return r;
    } catch(e) {
      if (!silent) showToast(`설정 확인 실패: ${e.message}`,6500);
    }
  }

  async function sendNow() {
    const target = document.querySelector('#gmTarget')?.value || 'all';
    if (!(await checkConfig(true))?.ready) return showToast('먼저 SOLAPI 알림톡 설정을 완료해 주세요.',6500);
    if (!confirm('선택한 대상에게 지금 QR 초대장 알림톡을 발송할까요?')) return;
    try {
      const r = await jsonpRequest('sendInvitationMessages',{target});
      showToast(`발송 요청 완료 · ${r.requested || 0}명`,7500);
    } catch(e) {
      showToast(`발송 실패: ${e.message}`,8500);
    }
  }

  async function schedule() {
    const target = document.querySelector('#gmTarget')?.value || 'all';
    const raw = document.querySelector('#gmScheduleAt')?.value || '';
    const d = new Date(raw);
    if (!raw || Number.isNaN(d.getTime())) return showToast('예약 일시를 선택해 주세요.',5000);
    if (!(await checkConfig(true))?.ready) return showToast('먼저 SOLAPI 알림톡 설정을 완료해 주세요.',6500);
    if (!confirm(`${d.toLocaleString('ko-KR')}에 예약 발송할까요?`)) return;
    try {
      const r = await jsonpRequest('scheduleInvitationMessages',{target, scheduledAt:d.toISOString()});
      showToast(`예약 완료 · 현재 기준 ${r.requested || 0}명`,7500);
    } catch(e) {
      showToast(`예약 실패: ${e.message}`,8500);
    }
  }

  function bind() {
    document.querySelector('#gmSearchButton')?.addEventListener('click',search);
    document.querySelector('#gmSearch')?.addEventListener('input',search);
    document.querySelector('#gmSearchResults')?.addEventListener('click',e=>{
      const b=e.target.closest('[data-id]'); if(!b)return;
      const id=b.dataset.id;
      selectedIds.has(id)?selectedIds.delete(id):selectedIds.add(id);
      renderSelected();
    });
    document.querySelector('#gmSelected')?.addEventListener('click',e=>{
      const b=e.target.closest('[data-remove]'); if(!b)return;
      selectedIds.delete(b.dataset.remove); renderSelected();
    });
    document.querySelector('#gmCreate')?.addEventListener('click',createGroup);
    document.querySelector('#gmReset')?.addEventListener('click',()=>{selectedIds.clear();renderSelected();});
    document.querySelector('#gmGroupList')?.addEventListener('click',e=>{
      const b=e.target.closest('[data-clear]'); if(b)clearGroup(b.dataset.clear);
    });
    document.querySelector('#gmConfigCheck')?.addEventListener('click',()=>checkConfig(false));
    document.querySelector('#gmSendNow')?.addEventListener('click',sendNow);
    document.querySelector('#gmSchedule')?.addEventListener('click',schedule);
  }

  // 대표자 QR을 기존 checkIn보다 먼저 가로채 그룹 체크인 API를 호출합니다.
  const originalCheckIn = window.checkIn;
  if (typeof originalCheckIn === 'function') {
    const wrapped = async function(input) {
      let code = '';
      try {
        if (typeof input === 'string') {
          code = typeof parseQrPayload === 'function' ? parseQrPayload(input) : input;
        } else {
          code = input?.id || input?.code || '';
        }
      } catch(_) {
        code = typeof input === 'string' ? input : '';
      }

      const p = participantById(code);
      if (p && markerInfo(p)?.role === 'master') {
        const groups = representativeGroups();
        const g = groups.find(x=>x.rep.id===p.id);
        const names = g?.members?.map(x=>`${x.arrived?'✓':'○'} ${x.name}`).join('\n') || '';
        if (!confirm(`${p.name} 님은 동행 대표자입니다.\n\n${names}\n\n미도착 동행자를 모두 함께 도착 처리할까요?`)) {
          return originalCheckIn(input);
        }

        try {
          const r = await jsonpRequest('checkInRepresentativeGroup',{representativeId:p.id});
          await refreshFromServer({silent:true,full:false});
          showToast(`${p.name} 님 그룹 ${r.total}명 · 이번 도착 ${r.checkedInNow}명`,8000);
          // 기존 체크인 결과 UI는 대표자의 최신 상태를 이용해 다시 표시
          const fresh = participantById(p.id) || p;
          if (typeof showCheckinResult === 'function') {
            try { showCheckinResult(fresh, fresh.arrived, typeof prizeForParticipant === 'function' ? prizeForParticipant(fresh) : null); } catch(_) {}
          }
          return r;
        } catch(e) {
          showToast(`그룹 체크인 실패: ${e.message}`,8500);
          return;
        }
      }

      return originalCheckIn(input);
    };

    window.checkIn = wrapped;
    try { checkIn = wrapped; } catch(_) {}
  }

  document.addEventListener('DOMContentLoaded',()=>{
    ensureCss();
    setTimeout(mount,350);
    setTimeout(mount,1300);
  });
})();
