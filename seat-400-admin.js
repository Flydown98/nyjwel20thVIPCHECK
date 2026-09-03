'use strict';

/*
 * 400석 좌석도 시각표현 수정본 v1.0
 * 목적:
 * - 07, 08 좌석이 다음 줄로 떨어져 보이는 문제 해결
 * - 좌/우 8석이 한 줄에 자연스럽게 보이도록 렌더링 교체
 * - 기존 배정 로직은 건드리지 않고, '좌석도 그림'만 안정적으로 교체
 */
(() => {
  const ROWS = 'ABCDEFGHIJKLMNOPQRSTUVWXY'.split('');
  const LEFT_LABEL_WIDTH = 46;
  const RIGHT_LABEL_WIDTH = 46;
  const RUNWAY_WIDTH = 74;

  function ensureStyles() {
    if (document.getElementById('seat400VisualFixStyle')) return;
    const style = document.createElement('style');
    style.id = 'seat400VisualFixStyle';
    style.textContent = `
      #seatMap.seat400-visual-fix {
        display: flex;
        flex-direction: column;
        gap: 6px;
        width: 100%;
      }
      #seatMap.seat400-visual-fix .seat400-row {
        display: grid;
        grid-template-columns: ${LEFT_LABEL_WIDTH}px minmax(0,1fr) ${RUNWAY_WIDTH}px minmax(0,1fr) ${RIGHT_LABEL_WIDTH}px;
        align-items: stretch;
        gap: 8px;
      }
      #seatMap.seat400-visual-fix .seat400-side {
        display: grid;
        grid-template-columns: repeat(8, minmax(50px, 1fr));
        gap: 6px;
        align-items: center;
      }
      #seatMap.seat400-visual-fix .seat400-row-label {
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        color: #59708d;
        font-size: 13px;
      }
      #seatMap.seat400-visual-fix .seat400-runway {
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 0;
        background: linear-gradient(180deg, #efe1b8 0%, #dcc89a 100%);
        color: #7a5923;
        font-weight: 800;
        font-size: 17px;
        min-height: 56px;
        box-shadow: inset 0 0 0 1px rgba(122,89,35,.08);
      }
      #seatMap.seat400-visual-fix .seat400-seat {
        appearance: none;
        border: 2px solid #d8dee7;
        background: #f4f6fa;
        border-radius: 12px;
        min-height: 54px;
        padding: 0 4px;
        font: inherit;
        font-weight: 800;
        font-size: 15px;
        color: #41546d;
        cursor: pointer;
        box-shadow: inset 0 -2px 0 rgba(0,0,0,.04);
        transition: transform .08s ease, box-shadow .08s ease;
      }
      #seatMap.seat400-visual-fix .seat400-seat:hover {
        transform: translateY(-1px);
        box-shadow: inset 0 -2px 0 rgba(0,0,0,.04), 0 3px 10px rgba(15,23,42,.08);
      }
      #seatMap.seat400-visual-fix .seat400-seat.is-occupied {
        background: #9ee8b5;
        border-color: #22c55e;
        color: #14532d;
      }
      #seatMap.seat400-visual-fix .seat400-seat.is-vip {
        background: #f4d35e;
        border-color: #d4a72c;
        color: #6b4e00;
      }
      #seatMap.seat400-visual-fix .seat400-seat.is-wheelchair {
        background: #d8efff;
        border-color: #60a5fa;
        color: #1e3a8a;
      }
      #seatMap.seat400-visual-fix .seat400-seat.is-disabled {
        background: #eceff4;
        border-color: #d8dee7;
        color: #9aa6b2;
        opacity: .75;
      }
      #seatMap.seat400-visual-fix .seat400-seat.is-selected {
        outline: 3px solid #9db8f8;
        outline-offset: 1px;
      }
      #seatMap.seat400-visual-fix .seat400-seat small {
        display: block;
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
        margin-top: 3px;
        opacity: .8;
      }
      @media (max-width: 1380px) {
        #seatMap.seat400-visual-fix .seat400-side {
          grid-template-columns: repeat(8, minmax(44px, 1fr));
        }
        #seatMap.seat400-visual-fix .seat400-seat {
          min-height: 48px;
          font-size: 13px;
          border-radius: 10px;
        }
      }
      @media (max-width: 1080px) {
        #seatMap.seat400-visual-fix .seat400-row {
          grid-template-columns: 34px minmax(0,1fr) 52px minmax(0,1fr) 34px;
          gap: 5px;
        }
        #seatMap.seat400-visual-fix .seat400-side {
          grid-template-columns: repeat(8, minmax(38px, 1fr));
          gap: 4px;
        }
        #seatMap.seat400-visual-fix .seat400-seat {
          min-height: 42px;
          font-size: 12px;
          padding: 0 2px;
        }
        #seatMap.seat400-visual-fix .seat400-runway {
          min-height: 42px;
          font-size: 14px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeSeatCode(value) {
    return String(value || '').trim().toUpperCase();
  }

  function getMetaMap() {
    try {
      const source = typeof seatMetaByCode === 'function' ? seatMetaByCode() : null;
      if (source instanceof Map) return source;
      if (source && typeof source === 'object') return new Map(Object.entries(source));
    } catch (_) {}
    return new Map();
  }

  function getOccupantMap() {
    try {
      const source = typeof seatOccupantMap === 'function' ? seatOccupantMap() : null;
      if (source instanceof Map) return source;
      if (source && typeof source === 'object') return new Map(Object.entries(source));
    } catch (_) {}
    return new Map();
  }

  function seatCode(row, side, number) {
    return `${row}${side}-${String(number).padStart(2, '0')}`;
  }

  function categoryOf(meta) {
    return String(meta?.category || '').toLowerCase();
  }

  function occupantName(occupant) {
    if (!occupant) return '';
    if (typeof occupant === 'string') return occupant;
    return String(occupant.name || occupant.participantName || occupant.label || '').trim();
  }

  function isSelectedSeat(code) {
    try {
      const active = String(window.state?.selectedSeatCode || '').toUpperCase();
      return active && active === code;
    } catch (_) {
      return false;
    }
  }

  function seatClass(meta, occupied, selected) {
    const classes = ['seat400-seat'];
    const category = categoryOf(meta);

    if (meta?.enabled === false || category.includes('사용안함')) classes.push('is-disabled');
    else if (category.includes('vip') || category.includes('내빈') || category.includes('수상자') || category.includes('관계자')) classes.push('is-vip');
    else if (meta?.wheelchairEligible === true || category.includes('휠체어') || category.includes('장애인')) classes.push('is-wheelchair');
    else if (occupied) classes.push('is-occupied');

    if (selected) classes.push('is-selected');
    return classes.join(' ');
  }

  function seatTitle(code, meta, occupant) {
    const lines = [code];
    const category = String(meta?.category || '').trim();
    const name = occupantName(occupant);
    if (category) lines.push(category);
    if (name) lines.push(`배정: ${name}`);
    return lines.join(' · ');
  }

  function seatHtml(code, meta, occupant) {
    const number = code.split('-')[1] || '';
    const occupied = Boolean(occupant);
    const selected = isSelectedSeat(code);
    const classes = seatClass(meta, occupied, selected);
    const name = occupantName(occupant);
    const badge = name ? `<small>${escapeHtml(name.length > 6 ? name.slice(0, 6) + '…' : name)}</small>` : '';

    return `
      <button
        type="button"
        class="${classes}"
        data-seat-code="${code}"
        data-code="${code}"
        data-seat="${code}"
        title="${escapeHtml(seatTitle(code, meta, occupant))}"
        aria-label="${escapeHtml(seatTitle(code, meta, occupant))}">
        <span>${number}</span>
        ${badge}
      </button>
    `;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderSide(row, side, metaMap, occupantMap) {
    let html = '';
    for (let n = 1; n <= 8; n++) {
      const code = seatCode(row, side, n);
      html += seatHtml(
        code,
        metaMap.get(normalizeSeatCode(code)) || metaMap.get(code) || null,
        occupantMap.get(normalizeSeatCode(code)) || occupantMap.get(code) || null
      );
    }
    return html;
  }

  function renderSeatMap400() {
    const host = document.querySelector('#seatMap');
    if (!host) return;

    ensureStyles();
    host.classList.add('seat400-visual-fix');

    const metaMap = getMetaMap();
    const occupantMap = getOccupantMap();

    host.innerHTML = ROWS.map(row => `
      <div class="seat400-row" data-seat-row="${row}">
        <div class="seat400-row-label">${row}L</div>
        <div class="seat400-side seat400-left" data-side="L">${renderSide(row, 'L', metaMap, occupantMap)}</div>
        <div class="seat400-runway">${row}</div>
        <div class="seat400-side seat400-right" data-side="R">${renderSide(row, 'R', metaMap, occupantMap)}</div>
        <div class="seat400-row-label">${row}R</div>
      </div>
    `).join('');

    const extra = document.querySelector('#extraSeatMap');
    if (extra) extra.innerHTML = '';

    updateCopy();
  }

  function updateCopy() {
    const button = document.querySelector('#reassignAllSeatsButton');
    if (button) button.textContent = '400석 구조 · 압축배치 실행';

    const small = document.querySelector('#view-seats .section-heading .small-text');
    if (small) {
      small.innerHTML =
        '<strong>400석 좌석도</strong> · A~Y 25행 × 좌8 + 우8<br>' +
        '각 행의 좌석을 <strong>좌측 01~08 / 우측 01~08</strong>로 한 줄에 보이도록 정리했습니다.';
    }
  }

  function tryForwardSeatClick(code) {
    const seatCodeValue = normalizeSeatCode(code);

    try {
      if (typeof window.showSeatQuickActions === 'function') {
        window.showSeatQuickActions(seatCodeValue);
        return;
      }
    } catch (_) {}

    try {
      if (typeof window.openSeatQuickActions === 'function') {
        window.openSeatQuickActions(seatCodeValue);
        return;
      }
    } catch (_) {}

    try {
      if (typeof window.handleSeatClick === 'function') {
        window.handleSeatClick({ currentTarget: { dataset: { seatCode: seatCodeValue, code: seatCodeValue, seat: seatCodeValue } } });
        return;
      }
    } catch (_) {}

    try {
      if (window.state) window.state.selectedSeatCode = seatCodeValue;
    } catch (_) {}
  }

  function bindSeatClick() {
    const host = document.querySelector('#seatMap');
    if (!host || host.dataset.seat400VisualBound === '1') return;
    host.dataset.seat400VisualBound = '1';

    host.addEventListener('click', event => {
      const button = event.target.closest('[data-seat-code]');
      if (!button) return;
      const code = button.dataset.seatCode || button.dataset.code || button.dataset.seat;
      if (!code) return;
      tryForwardSeatClick(code);
    });
  }

  function mount() {
    renderSeatMap400();
    bindSeatClick();
  }

  window.renderSeatMap = renderSeatMap400;
  window.renderSeatMap350 = renderSeatMap400;
  window.renderSeatMap400 = renderSeatMap400;

  try { renderSeatMap = renderSeatMap400; } catch (_) {}

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(mount, 200);
    setTimeout(mount, 900);
  });

  window.addEventListener('load', () => {
    setTimeout(mount, 120);
  });
})();
