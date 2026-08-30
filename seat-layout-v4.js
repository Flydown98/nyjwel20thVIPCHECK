'use strict';

/**
 * 남양주시장애인복지관 20주년 행사
 * 좌석 자동배치 V4 — FRONT COMPACT / COMPANION LOCK
 *
 * 이번 버전의 핵심
 * ------------------------------------------------------------
 * 1) 관리자가 지정한 VIP/내빈/수상자석은 절대 건드리지 않음.
 * 2) 이미 도착한 참가자는 절대 이동하지 않음.
 * 3) 휠체어 이용 참가자는 안전을 위해 자동 재배치하지 않음.
 * 4) 동행(companionGroup) 참가자는 같은 쪽 연속좌석을 최우선 배정.
 * 5) 같은 기관으로 판단되는 참가자도 가능한 한 같은 줄/가까운 좌석으로 배정.
 * 6) 남양주시장애인복지관/남양주복지관/없음/개인/이용인 등은
 *    '같은 기관'으로 묶지 않음.
 * 7) 그 외 일반 참가자는 앞줄부터 꽉 채움.
 * 8) 같은 줄에서는 런웨이에 가까운 좌석부터 채움.
 *
 * 일반 1인 좌석 우선순위 예시
 *   L06 → R01 → L05 → R02 → L04 → R03 → L03 → R04 → L02 → R05 → L01 → R06
 *
 * IMPORTANT
 * - 기존 adminReflowSeats에 맡기지 않고, 프론트에서 좌석계획을 직접 만든 뒤
 *   assignSeatFromMap API로 실제 배정합니다.
 * - 그래서 뒤쪽 R/S/U/W 등에 남은 미도착 일반 참가자를 앞쪽 빈자리로 확실히 당깁니다.
 */

(() => {
  const ROWS = 'ABCDEFGHIJKLMNOPQRSTUVWXY'.split('');
  const SIDE_CAPACITY = 6;
  const VERSION = '4.1-FRONT-COMPACT';

  const GENERIC_ORGS = new Set([
    '',
    '없음','없슴','해당없음','무','무소속','개인','개인참가','개인참가자',
    '이용인','복지관이용인','복지관','우리복지관',
    '남양주시장애인복지관','남양주장애인복지관','남양주복지관','남양주시복지관'
  ]);

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function code(row, side, n) {
    return `${row}${side}-${pad(n)}`;
  }

  function allSeatCodes() {
    const out = [];
    ROWS.forEach(row => {
      for (let i = 1; i <= SIDE_CAPACITY; i++) out.push(code(row, 'L', i));
      for (let i = 1; i <= SIDE_CAPACITY; i++) out.push(code(row, 'R', i));
    });
    return out;
  }

  function normalizeOrg(value) {
    let s = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[()（）[\]{}]/g, '')
      .replace(/[·ㆍ.,/\\_-]/g, '')
      .replace(/\s+/g, '');

    s = s
      .replace(/사회복지법인/g, '')
      .replace(/재단법인/g, '')
      .replace(/사단법인/g, '')
      .replace(/주식회사/g, '')
      .replace(/㈜/g, '')
      .replace(/유한회사/g, '');

    return s;
  }

  function isGenericOrg(value) {
    const n = normalizeOrg(value);
    if (!n || GENERIC_ORGS.has(n)) return true;

    // 남양주 장애인복지관의 단순 표기변형은 이용인 기본값으로 처리.
    if (
      n.includes('남양주') &&
      n.includes('장애인') &&
      n.includes('복지관') &&
      !n.includes('협회') &&
      !n.includes('센터') &&
      !n.includes('재단') &&
      !n.includes('공단') &&
      !n.includes('학교') &&
      !n.includes('주간') &&
      !n.includes('보호') &&
      !n.includes('직업') &&
      !n.includes('자립')
    ) {
      return true;
    }

    return false;
  }

  function metaMap() {
    const m = new Map();
    (state.seatMeta || []).forEach(meta => {
      m.set(normalizeSeat(meta.code), meta);
    });
    return m;
  }

  function isProtectedMeta(meta) {
    const category = String(meta?.category || '').toLowerCase();
    return (
      meta?.enabled === false ||
      meta?.autoAssignable === false ||
      meta?.wheelchairEligible === true ||
      category.includes('vip') ||
      category.includes('내빈') ||
      category.includes('수상자') ||
      category.includes('관계자') ||
      category.includes('휠체어') ||
      category.includes('장애인') ||
      category.includes('사용안함')
    );
  }

  function protectedSeatSet() {
    const mm = metaMap();
    const protectedSeats = new Set();

    allSeatCodes().forEach(seat => {
      const meta = mm.get(normalizeSeat(seat));
      if (isProtectedMeta(meta)) protectedSeats.add(normalizeSeat(seat));
    });

    // 도착자 및 휠체어 이용 참가자의 현재 좌석은 잠금.
    (state.participants || []).forEach(p => {
      if (p.arrived || p.wheelchairUser) {
        parseSeatList(p.seat).forEach(seat => protectedSeats.add(normalizeSeat(seat)));
      }
    });

    return protectedSeats;
  }

  function activeParticipants() {
    return (state.participants || []).filter(
      p => String(p.participationStatus || '참여') !== '미참여'
    );
  }

  function movableParticipants() {
    const protectedSeats = protectedSeatSet();

    return activeParticipants().filter(p => {
      if (p.arrived) return false;
      if (p.wheelchairUser) return false;

      const current = parseSeatList(p.seat).map(normalizeSeat);
      // VIP/관계자/기타 보호석에 관리자가 직접 앉혀둔 사람은 이동하지 않음.
      if (current.some(seat => protectedSeats.has(seat))) return false;

      return true;
    });
  }

  function explicitCompanionGroups(people) {
    const buckets = new Map();

    people.forEach(p => {
      const key = String(p.companionGroup || '').trim();
      if (!key) return;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(p);
    });

    return [...buckets.entries()]
      .filter(([, members]) => members.length >= 2)
      .map(([key, members]) => ({
        type: 'companion',
        key,
        label: `동행 ${key}`,
        members: [...members].sort((a, b) => Number(a.number || 0) - Number(b.number || 0))
      }));
  }

  function inferredOrganizationGroups(people, alreadyGroupedIds) {
    const buckets = new Map();

    people.forEach(p => {
      if (alreadyGroupedIds.has(p.id)) return;

      const raw = String(p.organization || '').trim();
      if (isGenericOrg(raw)) return;

      const key = normalizeOrg(raw);
      if (!key || key.length < 3) return;

      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(p);
    });

    return [...buckets.entries()]
      .filter(([, members]) => members.length >= 2)
      .map(([key, members]) => ({
        type: 'organization',
        key,
        label: members[0]?.organization || key,
        members: [...members].sort((a, b) => Number(a.number || 0) - Number(b.number || 0))
      }));
  }

  function buildGroups() {
    const people = movableParticipants();

    const companionGroups = explicitCompanionGroups(people);
    const grouped = new Set();
    companionGroups.forEach(g => g.members.forEach(p => grouped.add(p.id)));

    const orgGroups = inferredOrganizationGroups(people, grouped);
    orgGroups.forEach(g => g.members.forEach(p => grouped.add(p.id)));

    const singles = people
      .filter(p => !grouped.has(p.id))
      .sort((a, b) => Number(a.number || 0) - Number(b.number || 0));

    // 동행 최우선 → 같은 기관 → 일반 1인
    return { people, companionGroups, orgGroups, singles };
  }

  function seatState() {
    const protectedSeats = protectedSeatSet();
    const free = new Set(
      allSeatCodes()
        .map(normalizeSeat)
        .filter(seat => !protectedSeats.has(seat))
    );

    return {
      protectedSeats,
      free,
      planned: new Map(),
      rowSideCount: new Map()
    };
  }

  function sideCountKey(row, side) {
    return `${row}${side}`;
  }

  function addPlan(ss, participant, seat) {
    const normalized = normalizeSeat(seat);
    ss.planned.set(participant.id, normalized);
    ss.free.delete(normalized);

    const m = normalized.match(/^([A-Z])([LR])-(\d+)$/);
    if (m) {
      const key = sideCountKey(m[1], m[2]);
      ss.rowSideCount.set(key, (ss.rowSideCount.get(key) || 0) + 1);
    }
  }

  function contiguousWindows(row, side, size, free) {
    const windows = [];

    // 왼쪽: 06이 런웨이 쪽, 오른쪽: 01이 런웨이 쪽
    const physical = side === 'L'
      ? [1, 2, 3, 4, 5, 6]
      : [1, 2, 3, 4, 5, 6];

    for (let start = 0; start <= SIDE_CAPACITY - size; start++) {
      const nums = physical.slice(start, start + size);
      const seats = nums.map(n => normalizeSeat(code(row, side, n)));

      if (!seats.every(s => free.has(s))) continue;

      const runwayDistance = side === 'L'
        ? SIDE_CAPACITY - Math.max(...nums)
        : Math.min(...nums) - 1;

      windows.push({
        row,
        side,
        seats,
        runwayDistance
      });
    }

    return windows.sort((a, b) => a.runwayDistance - b.runwayDistance);
  }

  function chooseContiguousBlock(ss, size) {
    for (const row of ROWS) {
      const candidates = [
        ...contiguousWindows(row, 'L', size, ss.free),
        ...contiguousWindows(row, 'R', size, ss.free)
      ];

      if (!candidates.length) continue;

      candidates.sort((a, b) => {
        const ac = ss.rowSideCount.get(sideCountKey(a.row, a.side)) || 0;
        const bc = ss.rowSideCount.get(sideCountKey(b.row, b.side)) || 0;

        // 같은 행에서는 좌/우가 한쪽으로만 몰리지 않도록 현재 적게 찬 쪽 우선.
        if (ac !== bc) return ac - bc;
        if (a.runwayDistance !== b.runwayDistance) return a.runwayDistance - b.runwayDistance;
        return a.side.localeCompare(b.side);
      });

      const chosen = candidates[0];

      // 사람 이름 순서가 런웨이에서 바깥 방향으로 자연스럽게 이어지도록 정렬.
      chosen.seats.sort((a, b) => {
        const an = Number(a.split('-')[1]);
        const bn = Number(b.split('-')[1]);
        return chosen.side === 'L' ? bn - an : an - bn;
      });

      return chosen.seats;
    }

    return null;
  }

  function singleSeatOrder() {
    const list = [];

    ROWS.forEach(row => {
      const order = [
        ['L', 6], ['R', 1],
        ['L', 5], ['R', 2],
        ['L', 4], ['R', 3],
        ['L', 3], ['R', 4],
        ['L', 2], ['R', 5],
        ['L', 1], ['R', 6]
      ];

      order.forEach(([side, n]) => list.push(normalizeSeat(code(row, side, n))));
    });

    return list;
  }

  function chooseSingleSeat(ss) {
    return singleSeatOrder().find(seat => ss.free.has(seat)) || null;
  }

  function allocateGroup(ss, group) {
    const members = group.members;
    let cursor = 0;

    while (cursor < members.length) {
      const remaining = members.length - cursor;
      let chunkSize = Math.min(SIDE_CAPACITY, remaining);
      let block = null;

      // 동행자는 가능한 한 같은 쪽 연속좌석.
      // 현재 앞줄에 해당 크기의 연속공간이 없으면 작은 조각으로 줄여서라도 최대한 붙임.
      while (chunkSize >= 2 && !block) {
        block = chooseContiguousBlock(ss, chunkSize);
        if (!block) chunkSize -= 1;
      }

      if (!block) {
        // 1명만 남았거나 연속공간이 전혀 없으면 일반 좌석 순서 사용.
        const seat = chooseSingleSeat(ss);
        if (!seat) break;
        addPlan(ss, members[cursor], seat);
        cursor += 1;
        continue;
      }

      const chunk = members.slice(cursor, cursor + block.length);
      chunk.forEach((p, index) => addPlan(ss, p, block[index]));
      cursor += block.length;
    }
  }

  function createSeatPlan() {
    const groups = buildGroups();
    const ss = seatState();

    // 명시적 동행 우선
    groups.companionGroups.forEach(group => allocateGroup(ss, group));

    // 같은 기관
    groups.orgGroups.forEach(group => allocateGroup(ss, group));

    // 그 외 일반인 — 앞줄/런웨이 가까운 곳부터
    groups.singles.forEach(p => {
      const seat = chooseSingleSeat(ss);
      if (seat) addPlan(ss, p, seat);
    });

    const unplanned = groups.people.filter(p => !ss.planned.has(p.id));

    return {
      ...groups,
      protectedSeats: ss.protectedSeats,
      plan: ss.planned,
      unplanned
    };
  }

  async function runPool(items, worker, concurrency = 4) {
    const queue = [...items];
    const errors = [];

    async function runner() {
      while (queue.length) {
        const item = queue.shift();
        try {
          await worker(item);
        } catch (error) {
          errors.push({ item, error });
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, () => runner())
    );

    if (errors.length) {
      const first = errors[0]?.error;
      const err = new Error(
        `${errors.length}건 처리 실패` + (first?.message ? ` · ${first.message}` : '')
      );
      err.details = errors;
      throw err;
    }
  }

  async function clearMovableSeats(people) {
    const withSeat = people.filter(p => parseSeatList(p.seat).length > 0);

    await runPool(
      withSeat,
      p => jsonpRequest('unassignSeat', { participantCode: p.id }),
      5
    );
  }

  async function applySeatPlan(plan) {
    const entries = [...plan.entries()];

    await runPool(
      entries,
      ([participantCode, targetSeat]) =>
        jsonpRequest('assignSeatFromMap', {
          participantCode,
          targetSeat,
          replaceCurrent: false
        }),
      4
    );
  }

  function previewGroups(groups) {
    const lines = [];

    groups.companionGroups.slice(0, 5).forEach(g => {
      lines.push(`동행: ${g.members.map(p => p.name).join(', ')}`);
    });

    groups.orgGroups.slice(0, 5).forEach(g => {
      lines.push(`기관: ${g.label} ${g.members.length}명`);
    });

    return lines.length ? `\n\n${lines.join('\n')}` : '';
  }

  function updateUiCopy() {
    const heading = document.querySelector('#view-seats .section-heading .small-text');
    if (heading) {
      heading.innerHTML =
        '<strong>V4.1 앞자리 압축배치</strong><br>' +
        'VIP·도착자·휠체어석은 고정합니다. 그 외 미도착 일반 참가자는 기존 좌석을 비운 뒤 ' +
        '<strong>앞줄부터 다시 배정</strong>합니다. 동행자는 같은 쪽 연속좌석, 같은 기관은 최대한 가까이 배치합니다.';
    }

    const button = document.querySelector('#reassignAllSeatsButton');
    if (button) button.textContent = 'V4 앞자리 압축배치 실행';

    const note = document.querySelector('.seat-reset-note');
    if (note) {
      note.textContent =
        '뒤쪽에 듬성듬성 남은 미도착 일반 참가자까지 앞자리로 당깁니다. ' +
        'VIP/내빈/수상자, 도착자, 휠체어 이용자는 자동 이동하지 않습니다.';
    }

    const vip = document.querySelector('.vip-location-banner');
    if (vip) {
      const count = (state.seatMeta || []).filter(meta => {
        const c = String(meta.category || '').toLowerCase();
        return c.includes('vip') || c.includes('내빈') || c.includes('수상자');
      }).length;

      vip.innerHTML =
        `<strong>★ 관리자 지정 VIP 보호 ${count}석</strong>` +
        '<span>현재 지정된 위치 그대로 유지</span>' +
        '<small>V4는 VIP 위치를 새로 만들지 않습니다.</small>';
    }
  }

  async function reassignAllSeatsV4() {
    const button = document.querySelector('#reassignAllSeatsButton');
    const oldText = button?.textContent || '';

    const seatPlan = createSeatPlan();
    const movableCount = seatPlan.people.length;
    const explicitCount = seatPlan.companionGroups.reduce((n, g) => n + g.members.length, 0);
    const orgCount = seatPlan.orgGroups.reduce((n, g) => n + g.members.length, 0);
    const arrived = activeParticipants().filter(p => p.arrived).length;
    const wheelchair = activeParticipants().filter(p => p.wheelchairUser).length;

    if (seatPlan.unplanned.length) {
      const names = seatPlan.unplanned.slice(0, 10).map(p => p.name).join(', ');
      showToast(
        `배정 가능한 일반석이 부족합니다. 미배정 예정 ${seatPlan.unplanned.length}명 (${names})`,
        9000
      );
    }

    const ok = confirm(
      `앞자리 압축배치를 실행할까요?\n\n` +
      `• 재배치 대상: ${movableCount}명\n` +
      `• 명시적 동행 참가자: ${explicitCount}명\n` +
      `• 같은 기관 자동그룹: ${orgCount}명\n` +
      `• 도착자 ${arrived}명: 좌석 유지\n` +
      `• 휠체어 이용자 ${wheelchair}명: 좌석 유지\n` +
      `• VIP/내빈/수상자/관계자 등 보호석: 이동·자동배정 제외\n` +
      `• 일반 참가자: 앞줄부터, 같은 줄에서는 런웨이 가까운 자리부터\n` +
      previewGroups(seatPlan)
    );

    if (!ok) return;

    if (button) {
      button.disabled = true;
      button.textContent = '기존 미도착 좌석 비우는 중...';
    }

    try {
      // 1) 이동대상자의 기존 좌석을 먼저 모두 비워서
      //    뒤쪽 자리 잔존/서로 자리 밀어내기 문제를 없앰.
      await clearMovableSeats(seatPlan.people);

      if (button) button.textContent = '앞자리부터 새로 배정 중...';

      // 2) 미리 계산한 좌석계획 적용
      await applySeatPlan(seatPlan.plan);

      await refreshFromServer({ silent: true, full: true });
      updateUiCopy();

      const unassigned = seatPlan.unplanned.length;
      showToast(
        `앞자리 압축배치 완료 · ${seatPlan.plan.size}명 이동` +
        (unassigned ? ` · 미배정 ${unassigned}명` : ' · 미배정 0명') +
        ` · VIP/도착자/휠체어석 유지`,
        10000
      );
    } catch (error) {
      console.error(`[seat-layout-v4 ${VERSION}]`, error);

      // 중간 실패 시 서버 상태를 다시 읽어 화면을 사실대로 맞춤.
      try { await refreshFromServer({ silent: true, full: true }); } catch (_) {}

      showToast(
        `좌석 재배치 중 일부 처리가 실패했습니다. 새로고침 후 다시 확인해 주세요. ${error.message || ''}`,
        10000
      );
      throw error;
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = oldText || 'V4 앞자리 압축배치 실행';
      }
    }
  }

  window.reassignAllSeatsV4 = reassignAllSeatsV4;
  window.reassignAllSeatsV31 = reassignAllSeatsV4;
  window.createSeatPlanV4 = createSeatPlan;

  // admin.js의 기존 이벤트 핸들러가 호출하는 함수명도 덮어씀.
  try { reassignAllSeatsV31 = reassignAllSeatsV4; } catch (_) {}

  document.addEventListener('DOMContentLoaded', () => {
    updateUiCopy();
    setTimeout(updateUiCopy, 600);
    setTimeout(updateUiCopy, 1800);
  });
})();
