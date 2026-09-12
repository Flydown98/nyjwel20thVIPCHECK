'use strict';

(() => {
  const MASTER_RE = /\[REPQR:MASTER:([A-Z0-9_-]+)\]/i;

  const participantById = id =>
    (state.participants || []).find(p =>
      String(p.id || '').toUpperCase() === String(id || '').toUpperCase()
    );

  function isRepresentative(p) {
    const m = String(p?.note || '').match(MASTER_RE);
    return Boolean(m && String(m[1] || '').toUpperCase() === String(p?.id || '').toUpperCase());
  }

  function groupMembers(repId) {
    const id = String(repId || '').toUpperCase();
    return (state.participants || []).filter(p => {
      const note = String(p?.note || '');
      return note.includes(`[REPQR:MASTER:${id}]`) || note.includes(`[REPQR:MEMBER:${id}]`);
    });
  }

  async function relayStatus(silent = true) {
    try {
      const r = await jsonpRequest('smsRelayStatus', {});
      const badge = document.querySelector('#smsRelayBadgeV9');
      if (badge) {
        badge.className = `badge ${r?.ready ? 'connected' : 'warning'}`;
        badge.textContent = r?.ready
          ? `문자 중계 준비됨 · 대기 ${r.pending || 0}건`
          : '문자 중계 설정 필요';
      }
      if (!silent) showToast(r?.ready
        ? `문자 중계 준비됨 · 대기 ${r.pending || 0}건`
        : 'SMS_RELAY_TOKEN 설정을 확인해 주세요.', 6000);
      return r;
    } catch (e) {
      if (!silent) showToast(`문자 중계 상태 확인 실패: ${e.message}`, 7000);
      return null;
    }
  }

  async function queuePreEventSms() {
    const target = document.querySelector('#smsTargetV9')?.value || 'all';
    const status = await relayStatus(true);
    if (!status?.ready) {
      showToast('문자 중계 설정을 먼저 확인해 주세요.', 6500);
      return;
    }

    const label = target === 'representatives'
      ? '단체 대표자'
      : target === 'pending'
        ? '미도착 대상'
        : '개인 + 단체 대표자 전체';

    if (!confirm(
      `${label}에게 행사 전날 안내문자를 대기열에 등록할까요?\n\n` +
      `인원 변경·불참 시 연락 요청과, 추가 인원은 현장 참여 가능하나 좌석 미배정 가능하다는 안내가 포함됩니다.`
    )) return;

    try {
      const r = await jsonpRequest('queuePreEventSms', { target });
      showToast(`안내문자 대기열 등록 완료 · ${r.queued || 0}건${r.failed ? ` · 실패 ${r.failed}건` : ''}`, 9000);
      await relayStatus(true);
    } catch (e) {
      showToast(`안내문자 등록 실패: ${e.message}`, 9000);
    }
  }

  function mountSmsPanel() {
    if (document.querySelector('#smsRelayPanelV9')) return;
    const view = document.querySelector('#view-participants');
    if (!view) return;

    const panel = document.createElement('article');
    panel.id = 'smsRelayPanelV9';
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="panel-heading">
        <div>
          <h3>문자나라 · 행사 전날 안내문자</h3>
          <p class="help-text">집 PC 문자 중계 프로그램을 이용합니다. 단체는 대표자에게만 1건 발송합니다.</p>
        </div>
        <span id="smsRelayBadgeV9" class="badge warning">확인 전</span>
      </div>
      <div class="button-row" style="align-items:end;gap:10px;flex-wrap:wrap">
        <label style="min-width:230px">발송 대상
          <select id="smsTargetV9">
            <option value="all">개인 + 단체 대표자 전체</option>
            <option value="pending">미도착 대상만</option>
            <option value="representatives">단체 대표자만</option>
          </select>
        </label>
        <button id="smsQueuePreEventV9" class="button primary" type="button">전날 안내문자 대기열 등록</button>
        <button id="smsRelayCheckV9" class="button secondary" type="button">중계 상태 확인</button>
      </div>
      <p class="help-text" style="margin-top:12px;line-height:1.6">
        안내문에는 <strong>인원 변경·불참 시 복지관 연락 요청</strong>과
        <strong>추가 인원은 현장 참여 가능하나 좌석은 배정받지 못할 수 있음</strong>이 포함됩니다.
      </p>`;

    view.prepend(panel);
    document.querySelector('#smsQueuePreEventV9')?.addEventListener('click', queuePreEventSms);
    document.querySelector('#smsRelayCheckV9')?.addEventListener('click', () => relayStatus(false));
    relayStatus(true);

    // 기존 SOLAPI 알림톡 UI는 숨깁니다. 그룹 생성/관리 부분은 그대로 유지합니다.
    const oldBadge = document.querySelector('#gmConfigBadge');
    const oldMessageSection = oldBadge?.closest('section');
    if (oldMessageSection) oldMessageSection.style.display = 'none';
  }

  function installCheckInWrapper() {
    if (window.__NYJ20_CHECKIN_V9_INSTALLED__) return;
    const previousCheckIn = window.checkIn;
    if (typeof previousCheckIn !== 'function') return;

    const wrapped = async function(input) {
      let code = '';
      try {
        code = typeof input === 'string'
          ? (typeof parseQrPayload === 'function' ? parseQrPayload(input) : input)
          : (input?.id || input?.code || '');
      } catch (_) {
        code = typeof input === 'string' ? input : '';
      }

      const p = participantById(code);
      if (!p || !isRepresentative(p)) {
        return previousCheckIn(input);
      }

      const members = groupMembers(p.id).filter(x => String(x.participationStatus || '참여') !== '미참여');
      const remaining = members.filter(x => !x.arrived);
      const arrived = members.length - remaining.length;

      if (!remaining.length) {
        showToast(`${p.name} 님 단체는 등록 ${members.length}명 모두 도착 처리되었습니다.`, 6500);
        return;
      }

      const answer = prompt(
        `${p.name} 님 단체 접수\n\n` +
        `등록 인원: ${members.length}명\n` +
        `이미 도착: ${arrived}명\n` +
        `남은 인원: ${remaining.length}명\n\n` +
        `이번에 실제로 도착한 인원 수를 입력해 주세요. (1~${remaining.length})`,
        String(remaining.length)
      );
      if (answer === null) return;

      const arrivedCount = Number(String(answer).trim());
      if (!Number.isInteger(arrivedCount) || arrivedCount < 1 || arrivedCount > remaining.length) {
        showToast(`1명부터 ${remaining.length}명 사이의 숫자를 입력해 주세요.`, 6000);
        return;
      }

      scanBusy = true;
      try {
        const r = await jsonpRequest('checkInRepresentativeGroup', {
          representativeId: p.id,
          arrivedCount
        });
        await refreshFromServer({ silent:true, full:false });

        const fresh = participantById(p.id) || p;
        try {
          if (typeof showCheckinResult === 'function') {
            showCheckinResult(fresh, Boolean(fresh.arrived), typeof prizeForParticipant === 'function' ? prizeForParticipant(fresh) : null);
          }
        } catch (_) {}

        const seats = Array.isArray(r.seats) && r.seats.length ? ` · 좌석 ${r.seats.join(', ')}` : '';
        showToast(
          `단체 접수 완료 · 이번 ${r.checkedInNow}명 · 누적 ${r.arrivedTotal}/${r.total}명` +
          ` · 기념품 ${r.giftCount || r.checkedInNow}명 지급${seats}` +
          (r.smsQueued ? ' · 대표자 문자 등록' : ''),
          10000
        );
        return r;
      } catch (e) {
        showToast(`단체 체크인 실패: ${e.message}`, 9000);
      } finally {
        scanBusy = false;
      }
    };

    window.checkIn = wrapped;
    try { checkIn = wrapped; } catch (_) {}
    window.__NYJ20_CHECKIN_V9_INSTALLED__ = true;
  }

  function boot() {
    mountSmsPanel();
    installCheckInWrapper();
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(boot, 700);
    setTimeout(boot, 1500);
  });
})();
