'use strict';

/**
 * 남양주시장애인복지관 20주년 행사
 * 좌석 자동배치 V5 — FRONT PACK
 *
 * 핵심 규칙
 * 1. 관리자가 이미 지정한 VIP/내빈/수상자 좌석은 절대 변경하지 않음.
 * 2. 이미 도착한 참가자의 좌석도 변경하지 않음.
 * 3. 사용안함/관계자/휠체어/자동배정 제외 좌석도 보호.
 * 4. '동행'으로 묶인 참가자는 기존 companionGroup을 최우선 유지.
 * 5. 동행 정보가 없더라도 같은 기관으로 강하게 판단되는 참가자는 자동으로 동행그룹으로 묶은 뒤 재정렬.
 * 6. 단, 아래처럼 복지관 이용인으로 보이는 일반값은 같은 기관으로 묶지 않음.
 *    - 남양주시장애인복지관
 *    - 남양주장애인복지관
 *    - 남양주복지관
 *    - 복지관
 *    - 없음 / 무소속 / 개인 / 이용인 / 공란
 * 7. 실제 좌석 재정렬은 기존 서버의 adminReflowSeats를 사용.
 *
 * IMPORTANT
 * - 이 파일은 VIP 위치를 새로 만들거나 기존 VIP 구역을 초기화하지 않습니다.
 * - 즉 "VIP는 관리자가 직접 지정하고, 자동배정은 그 자리를 피한다"는 방식입니다.
 */

(() => {
  const VERSION = '5.0-FRONT-PACK';

  const GENERIC_ORG_WORDS = new Set([
    '',
    '없음',
    '무소속',
    '개인',
    '개인참가',
    '개인참가자',
    '이용인',
    '복지관이용인',
    '남양주시장애인복지관',
    '남양주장애인복지관',
    '남양주복지관',
    '남양주시복지관',
    '우리복지관',
    '복지관'
  ]);

  function normalizeOrgName(value) {
    let s = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[()（）[\]{}]/g, '')
      .replace(/[·ㆍ.,/\\_-]/g, '')
      .replace(/\s+/g, '');

    // 법인 표기/지점 표기의 단순한 표현 차이는 같은 기관으로 보기 쉽게 정리
    s = s
      .replace(/사회복지법인/g, '')
      .replace(/재단법인/g, '')
      .replace(/사단법인/g, '')
      .replace(/주식회사/g, '')
      .replace(/㈜/g, '')
      .replace(/\(주\)/g, '');

    return s;
  }

  function isGenericUserOrganization(value) {
    const n = normalizeOrgName(value);
    if (!n) return true;

    if (GENERIC_ORG_WORDS.has(n)) return true;

    // '남양주 + 장애인 + 복지관' 정도만 적힌 경우도 이용인 기본값으로 처리
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
      !n.includes('직업')
    ) {
      return true;
    }

    return false;
  }

  function isProtectedSeatMeta(meta) {
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

  function currentVipSeatCodes() {
    return (state.seatMeta || [])
      .filter(meta => {
        const c = String(meta?.category || '').toLowerCase();
        return c.includes('vip') || c.includes('내빈') || c.includes('수상자');
      })
      .map(meta => normalizeSeat(meta.code))
      .filter(Boolean);
  }

  function currentProtectedSeatCodes() {
    const out = new Set(
      (state.seatMeta || [])
        .filter(isProtectedSeatMeta)
        .map(meta => normalizeSeat(meta.code))
        .filter(Boolean)
    );

    // 이미 도착한 사람의 현재 좌석은 무조건 잠금
    (state.participants || [])
      .filter(p => p.arrived)
      .forEach(p => parseSeatList(p.seat).forEach(code => out.add(normalizeSeat(code))));

    return [...out];
  }

  function eligibleParticipants() {
    return (state.participants || []).filter(
      p => String(p.participationStatus || '참여') !== '미참여'
    );
  }

  function inferredOrganizationGroups() {
    const buckets = new Map();

    eligibleParticipants().forEach(p => {
      // 사용자가 명시적으로 동행을 지정한 사람은 절대 자동 그룹으로 덮어쓰지 않음
      if (String(p.companionGroup || '').trim()) return;
      if (p.arrived) return;

      const raw = String(p.organization || '').trim();
      if (isGenericUserOrganization(raw)) return;

      const key = normalizeOrgName(raw);
      if (!key || key.length < 3) return;

      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(p);
    });

    return [...buckets.entries()]
      .map(([key, people]) => ({
        key,
        organization: people[0]?.organization || key,
        people
      }))
      .filter(group => group.people.length >= 2);
  }

  async function linkInferredOrganizationGroups() {
    const groups = inferredOrganizationGroups();
    let linkedGroups = 0;
    let linkedPeople = 0;
    const linkedNames = [];

    for (const group of groups) {
      const ids = group.people.map(p => p.id).filter(Boolean);
      if (ids.length < 2) continue;

      // 너무 큰 기관 전체를 하나의 '동행'으로 묶으면 좌석 선택지가 지나치게 좁아질 수 있으므로
      // 12명 단위로 잘라 "같은 기관끼리 최대한 가까이" 배치하도록 함.
      for (let i = 0; i < ids.length; i += 12) {
        const chunk = ids.slice(i, i + 12);
        if (chunk.length < 2) continue;

        await jsonpRequest('adminLinkCompanions', { ids: chunk });
        linkedGroups += 1;
        linkedPeople += chunk.length;
      }

      linkedNames.push(`${group.organization} ${group.people.length}명`);
    }

    return { linkedGroups, linkedPeople, linkedNames };
  }

  function updateSeatV5Copy() {
    const heading = document.querySelector('#view-seats .section-heading .small-text');
    if (heading) {
      heading.innerHTML =
        '<strong>V5 자동배치: 앞자리부터 밀도 있게 채우는 방식</strong><br>' +
        '관리자가 지정한 VIP·내빈·수상자 좌석은 건드리지 않습니다. ' +
        '일반 참가자는 <strong>앞줄 우선 → 같은 줄에서는 런웨이 가까운 자리 우선</strong>으로 재정렬하며, ' +
        '동행자는 붙이고 같은 기관 참가자도 가능한 범위에서 함께 배치합니다.';
    }

    const vipBanner = document.querySelector('.vip-location-banner');
    if (vipBanner) {
      const count = currentVipSeatCodes().length;
      vipBanner.innerHTML =
        `<strong>★ VIP·내빈·수상자 보호석 ${count}석</strong>` +
        '<span>관리자가 직접 지정한 좌석만 보호</span>' +
        '<small>V5는 VIP 위치를 새로 만들지 않으며, 현재 지정된 VIP 좌석을 자동배정 대상에서 제외합니다.</small>';
    }

    const wcBanner = document.querySelector('.disabled-priority-banner');
    if (wcBanner) {
      wcBanner.innerHTML =
        '<strong>♿ 별도 지정석도 보호</strong>' +
        '<span>휠체어 · 장애인지정 · 관계자 · 사용안함</span>' +
        '<small>좌석 속성에서 자동배정 제외로 설정한 좌석은 V5가 건드리지 않습니다.</small>';
    }

    const resetButton = document.querySelector('#reassignAllSeatsButton');
    if (resetButton) resetButton.textContent = 'V5 앞자리 밀집배치 실행';

    const resetNote = document.querySelector('.seat-reset-note');
    if (resetNote) {
      resetNote.textContent =
        'VIP는 수동 지정 그대로 보호합니다. 동행자를 먼저 붙이고, 같은 기관은 자동으로 묶은 뒤 ' +
        '앞자리부터 밀도 있게 재정렬합니다. 남양주시장애인복지관·남양주복지관·없음 등은 이용인 기본값으로 보고 기관 그룹에서 제외합니다.';
    }
  }

  function organizationPreviewText(groups) {
    if (!groups.length) return '추가로 자동 묶을 기관 없음';

    const visible = groups
      .slice(0, 8)
      .map(g => `${g.organization} ${g.people.length}명`)
      .join('\n• ');

    return `자동 기관묶음 ${groups.length}개\n• ${visible}` +
      (groups.length > 8 ? `\n• 외 ${groups.length - 8}개 기관` : '');
  }

  async function reassignAllSeatsV5() {
    const participants = eligibleParticipants();
    const arrived = participants.filter(p => p.arrived).length;
    const explicitCompanions = participants.filter(p => String(p.companionGroup || '').trim()).length;
    const orgGroups = inferredOrganizationGroups();
    const vipCount = currentVipSeatCodes().length;
    const protectedCount = currentProtectedSeatCodes().length;
    const button = document.querySelector('#reassignAllSeatsButton');

    const ok = confirm(
      `V5 앞자리 밀집배치를 실행할까요?\n\n` +
      `자동배치 원칙\n` +
      `• 현재 VIP/내빈/수상자 ${vipCount}석: 절대 건드리지 않음\n` +
      `• 전체 보호좌석 ${protectedCount}석: 자동배정 제외\n` +
      `• 도착자 ${arrived}명: 현재 좌석 유지\n` +
      `• 명시적 동행그룹 참가자 ${explicitCompanions}명: 붙여 배치\n` +
      `• 같은 기관으로 판단되는 사람: 가능한 한 함께 배치\n` +
      `• 남양주시장애인복지관/남양주복지관/없음/개인 등은 기관묶음 제외\n` +
      `• 일반석은 앞자리부터 밀도 있게 정렬\n\n` +
      `${organizationPreviewText(orgGroups)}`
    );

    if (!ok) return;

    const oldText = button?.textContent || '';
    if (button) {
      button.disabled = true;
      button.textContent = 'V5 기관·동행 분석 중...';
    }

    try {
      let autoGrouped = { linkedGroups: 0, linkedPeople: 0, linkedNames: [] };

      if (orgGroups.length) {
        showToast(`같은 기관으로 판단되는 ${orgGroups.length}개 그룹을 정리하고 있습니다.`, 5000);
        autoGrouped = await linkInferredOrganizationGroups();

        // companionGroup 값이 서버에 반영된 최신 상태를 다시 읽음
        await refreshFromServer({ silent: true, full: false });
      }

      if (button) button.textContent = 'V5 앞자리 밀집배치 중...';

      // 기존 서버 재정렬은
      // companionGroup → 같은 기관 → 일반 참가자 순으로 연속좌석을 우선 사용하도록 설계되어 있음.
      // VIP 등 autoAssignable=false 좌석은 후보에서 제외됨.
      const result = await jsonpRequest('adminReflowSeats', {});

      await refreshFromServer({ silent: true, full: true });
      updateSeatV5Copy();

      showToast(
        `V5 완료 · ${Number(result?.movedCount || 0)}명 재정렬` +
        (autoGrouped.linkedPeople ? ` · 같은 기관 ${autoGrouped.linkedPeople}명 자동묶음` : '') +
        ` · VIP/보호좌석 유지`,
        9000
      );
    } catch (error) {
      console.error(`[seat-layout-v5 ${VERSION}]`, error);
      showToast(`V5 좌석 재정렬 실패: ${error.message || error}`, 9000);
      throw error;
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = oldText || 'V5 앞자리 밀집배치 실행';
      }
    }
  }

  // 기존 버튼이 호출하는 이름을 V5로 교체
  window.reassignAllSeatsV31 = reassignAllSeatsV5;
  window.reassignAllSeatsV5 = reassignAllSeatsV5;
  window.inferredOrganizationGroupsV5 = inferredOrganizationGroups;

  try { reassignAllSeatsV31 = reassignAllSeatsV5; } catch (_) {}

  document.addEventListener('DOMContentLoaded', () => {
    updateSeatV5Copy();
    setTimeout(updateSeatV5Copy, 500);
    setTimeout(updateSeatV5Copy, 1800);
  });
})();
