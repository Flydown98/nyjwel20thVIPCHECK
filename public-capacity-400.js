'use strict';

/**
 * 400석 온라인 신청 마감 안내 v1.1
 * - publicState가 window 속성이 아니어도 읽을 수 있게 수정
 * - 신청하기 / 행사프로그램 신청 / 쉬운UI 신청 버튼 모두 보호
 */
(() => {
  const $ = s => document.querySelector(s);

  function stateSettings() {
    try {
      if (typeof publicState !== 'undefined' && publicState?.settings) {
        return publicState.settings;
      }
    } catch (_) {}

    return window.__NYJ20_PUBLIC_STATE__?.settings || {};
  }

  function isFull() {
    const s = stateSettings();

    const remain = Number(s.remainingCount);
    if (Number.isFinite(remain)) return remain <= 0;

    const registered = Number(s.registeredCount);
    const capacity = Number(s.registrationCapacity || 400);
    return Number.isFinite(registered) && registered >= capacity;
  }

  function ensureModal() {
    if ($('#seat400FullModal')) return;

    const modal = document.createElement('div');
    modal.id = 'seat400FullModal';
    modal.className = 'seat350-full-modal hidden';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="seat350-full-backdrop" data-close="1"></div>
      <section class="seat350-full-card" role="dialog" aria-modal="true" aria-labelledby="seat400FullTitle">
        <div class="seat350-full-icon" aria-hidden="true">안내</div>
        <h2 id="seat400FullTitle">온라인 일반좌석 신청이 마감되었습니다</h2>
        <p>추가 참여를 원하시는 경우<br><strong>행사 당일 현장접수 후 스탠딩석</strong>으로 안내드립니다.</p>
        <small>행사 당일 현장 상황에 따라 입장이 제한될 수 있습니다.</small>
        <button id="seat400FullClose" type="button">확인</button>
      </section>`;
    document.body.appendChild(modal);

    modal.addEventListener('click', event => {
      if (
        event.target.closest('[data-close="1"]') ||
        event.target.id === 'seat400FullClose'
      ) {
        closeModal();
      }
    });
  }

  function openModal() {
    ensureModal();
    const m = $('#seat400FullModal');
    if (!m) return;
    m.classList.remove('hidden');
    m.setAttribute('aria-hidden', 'false');
    setTimeout(() => $('#seat400FullClose')?.focus(), 30);
  }

  function closeModal() {
    const m = $('#seat400FullModal');
    if (!m) return;
    m.classList.add('hidden');
    m.setAttribute('aria-hidden', 'true');
  }

  function guard(event) {
    if (!isFull()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openModal();
  }

  function bind() {
    ensureModal();

    [
      '#revealApplicationButton',
      '#programApplyButton',
      '#easyGoApply'
    ].forEach(selector => {
      const button = $(selector);
      if (button && !button.dataset.seat400Guard) {
        button.dataset.seat400Guard = '1';
        button.addEventListener('click', guard, true);
      }
    });

    if (isFull()) {
      const status = $('#registrationStatus');
      if (status) {
        status.className = 'registration-status closed';
        status.textContent =
          '온라인 좌석 마감 · 당일 현장접수 및 스탠딩석 안내';
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(bind, 200);
      setInterval(bind, 1500);
    });
  } else {
    setTimeout(bind, 100);
    setInterval(bind, 1500);
  }

  window.addEventListener('unhandledrejection', event => {
    const msg = String(event.reason?.message || '');
    if (/일반좌석 신청이 마감|자동 배정 가능한 좌석이 모두/.test(msg)) {
      event.preventDefault();
      openModal();
    }
  });
})();
