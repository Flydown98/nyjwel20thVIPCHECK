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

  function installPopupCss() {
    if (document.querySelector('#nyj20CheckinPopupCssV91')) return;
    const style = document.createElement('style');
    style.id = 'nyj20CheckinPopupCssV91';
    style.textContent = `
      .nyj20-scan-toast-v91{position:fixed;z-index:99999;left:50%;bottom:28px;transform:translateX(-50%);width:min(92vw,520px);background:#fff;border-radius:20px;box-shadow:0 18px 55px rgba(15,23,42,.28);border:1px solid #e2e8f0;padding:20px;animation:nyj20pop .16s ease-out}
      .nyj20-scan-toast-v91 h3{margin:0 0 8px;font-size:21px}.nyj20-scan-toast-v91 p{margin:5px 0;line-height:1.5}.nyj20-scan-toast-v91 .meta{color:#475569;font-size:14px}.nyj20-scan-toast-v91 .ok{font-weight:800;color:#166534}.nyj20-scan-toast-v91 button{width:100%;margin-top:14px}
      .nyj20-group-overlay-v91{position:fixed;z-index:100000;inset:0;background:rgba(15,23,42,.58);display:flex;align-items:center;justify-content:center;padding:18px}
      .nyj20-group-card-v91{width:min(94vw,560px);background:#fff;border-radius:24px;box-shadow:0 24px 80px rgba(0,0,0,.35);padding:24px}
      .nyj20-group-card-v91 h2{margin:0 0 6px}.nyj20-group-card-v91 .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:18px 0}.nyj20-group-card-v91 .summary div{background:#f8fafc;border-radius:14px;padding:12px;text-align:center}.nyj20-group-card-v91 .summary b{display:block;font-size:22px}.nyj20-group-card-v91 .stepper{display:grid;grid-template-columns:60px 1fr 60px;gap:10px;align-items:center;margin:16px 0}.nyj20-group-card-v91 .stepper button{height:56px;border-radius:14px;font-size:28px;font-weight:800}.nyj20-group-card-v91 .stepper .count{text-align:center;font-size:36px;font-weight:900}.nyj20-group-card-v91 .seat-preview{background:#eef2ff;border-radius:14px;padding:14px;line-height:1.6;margin:12px 0}.nyj20-group-card-v91 .standing{color:#b45309;font-weight:800}.nyj20-group-card-v91 .actions{display:grid;grid-template-columns:1fr 2fr;gap:10px;margin-top:18px}.nyj20-group-card-v91 .actions button{height:50px}
      @keyframes nyj20pop{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}
    `;
    document.head.appendChild(style);
  }

  let scanToastTimer = null;
  function showIndividualScanPopup(participant, result) {
    installPopupCss();
    document.querySelector('#nyj20ScanToastV91')?.remove();
    clearTimeout(scanToastTimer);

    const p = participant || {};
    const card = document.createElement('div');
    card.id = 'nyj20ScanToastV91';
    card.className = 'nyj20-scan-toast-v91';
    card.innerHTML = `
      <h3>QR 접수 완료</h3>
      <p><strong>${String(p.name || '참가자')}</strong> 님</p>
      <p class="ok">기념품 지급완료</p>
      <p>좌석 <strong>${String(p.seat || '현장 안내')}</strong></p>
      <p class="meta">${result?.smsQueued ? '접수 안내문자도 발송 대기열에 등록되었습니다.' : '접수 처리가 완료되었습니다.'}</p>
      <button type="button" class="button primary">확인</button>`;
    document.body.appendChild(card);

    const close = () => { clearTimeout(scanToastTimer); card.remove(); };
    card.querySelector('button')?.addEventListener('click', close);
    // 개인은 확인 버튼을 누르지 않아도 자동으로 넘어갑니다.
    scanToastTimer = setTimeout(close, 3500);
  }

  function askGroupArrivalCount(rep, members) {
    installPopupCss();
    return new Promise(resolve => {
      document.querySelector('#nyj20GroupOverlayV91')?.remove();

      const remaining = members.filter(x => !x.arrived).length;
      const already = members.length - remaining;
      let count = remaining > 0 ? remaining : 1;
      const softMax = Math.min(100, Math.max(members.length + 20, count));

      const overlay = document.createElement('div');
      overlay.id = 'nyj20GroupOverlayV91';
      overlay.className = 'nyj20-group-overlay-v91';
      overlay.innerHTML = `
        <section class="nyj20-group-card-v91" role="dialog" aria-modal="true">
          <h2>${String(rep.name || '대표자')} 님 단체 접수</h2>
          <p class="help-text">이번에 실제로 현장에 오신 인원만 화살표로 조절해 주세요.</p>
          <div class="summary">
            <div><span>사전 등록</span><b>${members.length}</b></div>
            <div><span>이미 도착</span><b>${already}</b></div>
            <div><span>남은 등록</span><b>${remaining}</b></div>
          </div>
          <div class="stepper">
            <button id="nyj20GroupMinusV91" type="button" class="button secondary" aria-label="1명 줄이기">−</button>
            <div><div class="count" id="nyj20GroupCountV91">${count}</div><div style="text-align:center;color:#64748b">이번 현장 도착 인원</div></div>
            <button id="nyj20GroupPlusV91" type="button" class="button secondary" aria-label="1명 늘리기">＋</button>
          </div>
          <div id="nyj20GroupSeatPreviewV91" class="seat-preview"></div>
          <div class="actions">
            <button id="nyj20GroupCancelV91" class="button secondary" type="button">취소</button>
            <button id="nyj20GroupConfirmV91" class="button primary" type="button">이 인원으로 접수</button>
          </div>
        </section>`;
      document.body.appendChild(overlay);

      const countEl = overlay.querySelector('#nyj20GroupCountV91');
      const preview = overlay.querySelector('#nyj20GroupSeatPreviewV91');
      const confirm = overlay.querySelector('#nyj20GroupConfirmV91');

      function render() {
        countEl.textContent = String(count);
        const registeredSeatCount = Math.min(count, remaining);
        const extraStanding = Math.max(0, count - remaining);
        preview.innerHTML = `
          <strong>이번 좌석 배정: ${registeredSeatCount}석</strong><br>
          사전 등록 인원 중 이번에 온 ${registeredSeatCount}명에게만 좌석을 배정합니다.
          ${extraStanding > 0 ? `<br><span class="standing">추가 ${extraStanding}명은 좌석 미배정 · 스탠딩 안내</span>` : ''}`;
      }
      render();

      overlay.querySelector('#nyj20GroupMinusV91')?.addEventListener('click', () => {
        count = Math.max(1, count - 1);
        render();
      });
      overlay.querySelector('#nyj20GroupPlusV91')?.addEventListener('click', () => {
        count = Math.min(softMax, count + 1);
        render();
      });
      overlay.querySelector('#nyj20GroupCancelV91')?.addEventListener('click', () => {
        overlay.remove();
        resolve(null);
      });
      confirm?.addEventListener('click', () => {
        confirm.disabled = true;
        confirm.textContent = '접수 처리 중...';
        resolve({ count, overlay });
      });
    });
  }

  function finishGroupPopup(overlay, r, rep) {
    if (!overlay) return;
    const card = overlay.querySelector('.nyj20-group-card-v91');
    const standing = Number(r?.extraStanding || 0);
    card.innerHTML = `
      <h2>단체 접수 완료</h2>
      <p><strong>${String(rep?.name || '대표자')}</strong> 님 단체</p>
      <div class="seat-preview">
        실제 현장 인원 <strong>${Number(r?.actualArrivedNow || 0)}명</strong><br>
        등록인원 처리 <strong>${Number(r?.checkedInNow || 0)}명</strong><br>
        좌석 배정 <strong>${Number(r?.seatCount || 0)}석</strong><br>
        기념품 지급 <strong>${Number(r?.giftCount || 0)}명</strong>
        ${standing > 0 ? `<br><span class="standing">추가 ${standing}명은 스탠딩 안내 대상입니다.</span>` : ''}
      </div>
      <button id="nyj20GroupDoneV91" type="button" class="button primary" style="width:100%">확인</button>`;
    card.querySelector('#nyj20GroupDoneV91')?.addEventListener('click', () => overlay.remove());
  }

  async function relayStatus(silent = true) {
    try {
      const r = await jsonpRequest('smsRelayStatus', {});
      const badge = document.querySelector('#smsRelayBadgeV9');
      if (badge) {
        badge.className = `badge ${r?.ready ? 'connected' : 'warning'}`;
        badge.textContent = r?.ready ? `문자 중계 준비됨 · 대기 ${r.pending || 0}건` : '문자 중계 설정 필요';
      }
      if (!silent) showToast(r?.ready ? `문자 중계 준비됨 · 대기 ${r.pending || 0}건` : 'SMS_RELAY_TOKEN 설정을 확인해 주세요.', 6000);
      return r;
    } catch (e) {
      if (!silent) showToast(`문자 중계 상태 확인 실패: ${e.message}`, 7000);
      return null;
    }
  }

  async function queuePreEventSms() {
    const target = document.querySelector('#smsTargetV9')?.value || 'all';
    const status = await relayStatus(true);
    if (!status?.ready) return showToast('문자 중계 설정을 먼저 확인해 주세요.', 6500);

    const label = target === 'representatives' ? '단체 대표자' : target === 'pending' ? '미도착 대상' : '개인 + 단체 대표자 전체';
    if (!confirm(`${label}에게 행사 전날 안내문자를 대기열에 등록할까요?\n\n인원 변경·불참 시 연락 요청과, 추가 인원은 현장 참여 가능하나 좌석은 배정되지 않는다는 안내가 포함됩니다.`)) return;

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
      <div class="panel-heading"><div><h3>문자나라 · 행사 전날 안내문자</h3><p class="help-text">집 PC 문자 중계 프로그램을 이용합니다. 단체는 대표자에게만 1건 발송합니다.</p></div><span id="smsRelayBadgeV9" class="badge warning">확인 전</span></div>
      <div class="button-row" style="align-items:end;gap:10px;flex-wrap:wrap">
        <label style="min-width:230px">발송 대상<select id="smsTargetV9"><option value="all">개인 + 단체 대표자 전체</option><option value="pending">미도착 대상만</option><option value="representatives">단체 대표자만</option></select></label>
        <button id="smsQueuePreEventV9" class="button primary" type="button">전날 안내문자 대기열 등록</button>
        <button id="smsRelayCheckV9" class="button secondary" type="button">중계 상태 확인</button>
      </div>
      <p class="help-text" style="margin-top:12px;line-height:1.6">안내문에는 <strong>인원 변경·불참 시 복지관 연락 요청</strong>과 <strong>추가 인원은 현장 참여 가능하나 좌석은 배정되지 않음</strong>이 포함됩니다.</p>`;
    view.prepend(panel);
    document.querySelector('#smsQueuePreEventV9')?.addEventListener('click', queuePreEventSms);
    document.querySelector('#smsRelayCheckV9')?.addEventListener('click', () => relayStatus(false));
    relayStatus(true);

    const oldBadge = document.querySelector('#gmConfigBadge');
    const oldMessageSection = oldBadge?.closest('section');
    if (oldMessageSection) oldMessageSection.style.display = 'none';
  }

  function installCheckInWrapper() {
    if (window.__NYJ20_CHECKIN_V91_INSTALLED__) return;
    const previousCheckIn = window.checkIn;
    if (typeof previousCheckIn !== 'function') return;

    const wrapped = async function(input) {
      let code = '';
      try {
        code = typeof input === 'string' ? (typeof parseQrPayload === 'function' ? parseQrPayload(input) : input) : (input?.id || input?.code || '');
      } catch (_) { code = typeof input === 'string' ? input : ''; }

      const isQrScan = typeof input === 'string';
      const p = participantById(code);

      // 개인 QR: 접수 자체는 바로 진행하고, 완료 팝업은 확인을 누르지 않아도 자동으로 닫힙니다.
      if (!p || !isRepresentative(p)) {
        const result = await previousCheckIn(input);
        if (isQrScan) {
          const fresh = result?.participant || participantById(code) || p;
          if (fresh) showIndividualScanPopup(fresh, result || {});
        }
        return result;
      }

      // 단체 대표자 QR: 반드시 인원 팝업에서 숫자를 확인하고 '접수' 버튼을 눌러야 진행합니다.
      const members = groupMembers(p.id).filter(x => String(x.participationStatus || '참여') !== '미참여');
      const answer = await askGroupArrivalCount(p, members);
      if (!answer) return;

      scanBusy = true;
      try {
        const r = await jsonpRequest('checkInRepresentativeGroup', {
          representativeId: p.id,
          arrivedCount: answer.count
        });
        await refreshFromServer({ silent:true, full:false });

        const fresh = participantById(p.id) || p;
        try {
          if (typeof showCheckinResult === 'function') {
            showCheckinResult(fresh, Boolean(fresh.arrived), typeof prizeForParticipant === 'function' ? prizeForParticipant(fresh) : null);
          }
        } catch (_) {}

        finishGroupPopup(answer.overlay, r, fresh);
        showToast(
          `단체 접수 완료 · 현장 ${r.actualArrivedNow}명 · 좌석 ${r.seatCount}석` +
          (r.extraStanding ? ` · 스탠딩 ${r.extraStanding}명` : '') +
          (r.smsQueued ? ' · 대표자 문자 등록' : ''),
          9000
        );
        return r;
      } catch (e) {
        answer.overlay?.remove();
        showToast(`단체 체크인 실패: ${e.message}`, 9000);
      } finally {
        scanBusy = false;
      }
    };

    window.checkIn = wrapped;
    try { checkIn = wrapped; } catch (_) {}
    window.__NYJ20_CHECKIN_V91_INSTALLED__ = true;
  }

  function boot() {
    installPopupCss();
    mountSmsPanel();
    installCheckInWrapper();
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(boot, 700);
    setTimeout(boot, 1500);
  });
})();
