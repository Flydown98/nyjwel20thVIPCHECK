'use strict';

(() => {
  const ROWS = 'ABCDEFGHIJKLMNOPQRSTUVWXY'.split('');
  const GENERIC_ORGS = new Set([
    '', '없음', '없슴', '해당없음', '무', '무소속',
    '개인', '개인참가', '개인참가자', '이용인', '복지관이용인',
    '복지관', '우리복지관', '남양주시장애인복지관',
    '남양주장애인복지관', '남양주복지관', '남양주시복지관'
  ]);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function seatCode(row, side, n) {
    return normalizeSeat(`${row}${side}-${String(n).padStart(2,'0')}`);
  }

  function allSeatCodes() {
    const out = [];
    ROWS.forEach(row => {
      for (let n=1;n<=6;n++) out.push(seatCode(row,'L',n));
      for (let n=1;n<=6;n++) out.push(seatCode(row,'R',n));
    });
    return out;
  }

  function normalizeOrg(v) {
    return String(v||'').trim().toLowerCase()
      .replace(/[()（）[\]{}]/g,'')
      .replace(/[·ㆍ.,/\\_-]/g,'')
      .replace(/\s+/g,'')
      .replace(/사회복지법인|재단법인|사단법인|주식회사|유한회사|㈜/g,'');
  }

  function isGenericOrg(v) {
    const n = normalizeOrg(v);
    if (!n || GENERIC_ORGS.has(n)) return true;
    if (
      n.includes('남양주') && n.includes('장애인') && n.includes('복지관') &&
      !n.includes('협회') && !n.includes('센터') && !n.includes('재단') &&
      !n.includes('공단') && !n.includes('학교') && !n.includes('주간') &&
      !n.includes('보호') && !n.includes('직업') && !n.includes('자립')
    ) return true;
    return false;
  }

  function metaMap() {
    const m = new Map();
    (state.seatMeta||[]).forEach(x => m.set(normalizeSeat(x.code), x));
    return m;
  }

  function cat(meta) { return String(meta?.category||'').toLowerCase(); }

  function isHardProtectedMeta(meta) {
    const c = cat(meta);
    return meta?.enabled === false ||
      c.includes('vip') || c.includes('내빈') || c.includes('수상자') ||
      c.includes('관계자') || c.includes('사용안함');
  }

  function isWheelchairMeta(meta) {
    const c = cat(meta);
    return meta?.enabled !== false && (
      meta?.wheelchairEligible === true ||
      c.includes('휠체어') || c.includes('장애인지정')
    );
  }

  function isGeneralAutoSeat(meta) {
    const c = cat(meta);
    if (!meta) return true;
    if (meta.enabled === false) return false;
    if (isHardProtectedMeta(meta)) return false;
    if (isWheelchairMeta(meta)) return false;
    if (meta.autoAssignable === false) return false;
    if (c.includes('장애인')) return false;
    return true;
  }

  function activeParticipants() {
    return (state.participants||[]).filter(
      p => String(p.participationStatus||'참여') !== '미참여'
    );
  }

  function currentSeats(p) {
    return parseSeatList(p?.seat).map(normalizeSeat).filter(Boolean);
  }

  function protectedSeatSet() {
    const mm = metaMap();
    const s = new Set();

    allSeatCodes().forEach(seat => {
      if (isHardProtectedMeta(mm.get(seat))) s.add(seat);
    });

    activeParticipants().forEach(p => {
      if (p.arrived) currentSeats(p).forEach(seat => s.add(seat));
      currentSeats(p).forEach(seat => {
        if (isHardProtectedMeta(mm.get(seat))) s.add(seat);
      });
    });

    return s;
  }

  function isLockedParticipant(p, protectedSeats) {
    if (p.arrived) return true;
    return currentSeats(p).some(seat => protectedSeats.has(seat));
  }

  function occupiedByLocked() {
    const protectedSeats = protectedSeatSet();
    const occupied = new Set();
    activeParticipants().forEach(p => {
      if (isLockedParticipant(p, protectedSeats)) {
        currentSeats(p).forEach(seat => occupied.add(seat));
      }
    });
    return occupied;
  }

  function seatParts(seat) {
    const m = normalizeSeat(seat).match(/^([A-Z])([LR])-(\d+)$/);
    if (!m) return null;
    return { row:m[1], side:m[2], no:Number(m[3]), rowIndex:ROWS.indexOf(m[1]) };
  }

  function runwayDistance(seat) {
    const p = seatParts(seat);
    if (!p) return 999;
    return p.side === 'L' ? 6-p.no : p.no-1;
  }

  function compareSeat(a,b) {
    const pa = seatParts(a), pb = seatParts(b);
    if (!pa || !pb) return String(a).localeCompare(String(b));
    if (pa.rowIndex !== pb.rowIndex) return pa.rowIndex-pb.rowIndex;
    const da = runwayDistance(a), db = runwayDistance(b);
    if (da !== db) return da-db;
    if (pa.side !== pb.side) return pa.side === 'L' ? -1 : 1;
    return pa.no-pb.no;
  }

  function wheelchairSeatOrder() {
    const mm = metaMap(), occupied = occupiedByLocked();
    return allSeatCodes()
      .filter(seat => isWheelchairMeta(mm.get(seat)))
      .filter(seat => !occupied.has(seat))
      .sort(compareSeat);
  }

  function generalSeatOrder() {
    const mm = metaMap(), occupied = occupiedByLocked();
    return allSeatCodes()
      .filter(seat => isGeneralAutoSeat(mm.get(seat)))
      .filter(seat => !occupied.has(seat))
      .sort(compareSeat);
  }

  function movableWheelchair() {
    const protectedSeats = protectedSeatSet();
    return activeParticipants()
      .filter(p => p.wheelchairUser && !isLockedParticipant(p, protectedSeats))
      .sort((a,b)=>Number(a.number||0)-Number(b.number||0));
  }

  function movableGeneral() {
    const protectedSeats = protectedSeatSet();
    return activeParticipants()
      .filter(p => !p.wheelchairUser && !isLockedParticipant(p, protectedSeats))
      .sort((a,b)=>Number(a.number||0)-Number(b.number||0));
  }

  function companionGroups(people) {
    const buckets = new Map();
    people.forEach(p => {
      const key = String(p.companionGroup||'').trim();
      if (!key) return;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(p);
    });
    return [...buckets.entries()]
      .filter(([,v])=>v.length>=2)
      .map(([key,members])=>({
        key,
        members:[...members].sort((a,b)=>Number(a.number||0)-Number(b.number||0))
      }));
  }

  function organizationGroups(people, excludedIds) {
    const buckets = new Map();
    people.forEach(p => {
      if (excludedIds.has(p.id)) return;
      const raw = String(p.organization||'').trim();
      if (isGenericOrg(raw)) return;
      const key = normalizeOrg(raw);
      if (!key || key.length < 3) return;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(p);
    });
    return [...buckets.entries()]
      .filter(([,v])=>v.length>=2)
      .map(([key,members])=>({
        key,
        label:members[0]?.organization||key,
        members:[...members].sort((a,b)=>Number(a.number||0)-Number(b.number||0))
      }));
  }

  function contiguousBlock(freeSet, size) {
    for (const row of ROWS) {
      const candidates = [];
      for (const side of ['L','R']) {
        for (let start=1; start<=7-size; start++) {
          const nums = Array.from({length:size},(_,i)=>start+i);
          const seats = nums.map(n=>seatCode(row,side,n));
          if (!seats.every(s=>freeSet.has(s))) continue;
          const distance = side==='L' ? 6-Math.max(...nums) : Math.min(...nums)-1;
          candidates.push({side,seats,distance});
        }
      }
      if (!candidates.length) continue;
      candidates.sort((a,b)=>a.distance-b.distance || (a.side==='L'?-1:1));
      const chosen = candidates[0];
      chosen.seats.sort((a,b)=>runwayDistance(a)-runwayDistance(b));
      return chosen.seats;
    }
    return null;
  }

  function buildPlan() {
    const wcPeople = movableWheelchair();
    const genPeople = movableGeneral();
    const wcSeats = wheelchairSeatOrder();
    const genSeats = generalSeatOrder();

    const plan = new Map();
    const wcUnassigned = [];
    const genUnassigned = [];

    // 휠체어 이용자: 휠체어 지정석만
    wcPeople.forEach((p,i)=>{
      if (wcSeats[i]) plan.set(p.id, wcSeats[i]);
      else wcUnassigned.push(p);
    });

    const free = new Set(genSeats);

    // 명시적 동행: 같은 쪽 연속좌석 강제
    const comps = companionGroups(genPeople);
    const compIds = new Set();
    comps.forEach(g=>g.members.forEach(p=>compIds.add(p.id)));

    for (const group of comps) {
      let cursor = 0;
      while (cursor < group.members.length) {
        const remaining = group.members.length-cursor;
        let block = null;
        for (let size=Math.min(6,remaining); size>=2 && !block; size--) {
          block = contiguousBlock(free,size);
        }

        if (!block) {
          group.members.slice(cursor).forEach(p=>genUnassigned.push(p));
          break;
        }

        const chunk = group.members.slice(cursor,cursor+block.length);
        chunk.forEach((p,i)=>{
          plan.set(p.id,block[i]);
          free.delete(block[i]);
        });
        cursor += block.length;
      }
    }

    // 같은 기관: 연속석 "강제"가 아니라 배정 순서만 붙임.
    // 그래서 앞자리 구멍이 생기지 않음.
    const remain = genPeople.filter(p=>!compIds.has(p.id));
    const orgs = organizationGroups(remain,new Set());
    const orgIds = new Set();

    orgs.forEach(g=>{
      g.members.forEach(p=>orgIds.add(p.id));
      g.members.forEach(p=>{
        const seat = [...free].sort(compareSeat)[0];
        if (!seat) return genUnassigned.push(p);
        plan.set(p.id,seat);
        free.delete(seat);
      });
    });

    // 일반 1인: 남은 자리 앞에서부터 전부 메움
    remain.filter(p=>!orgIds.has(p.id)).forEach(p=>{
      const seat = [...free].sort(compareSeat)[0];
      if (!seat) return genUnassigned.push(p);
      plan.set(p.id,seat);
      free.delete(seat);
    });

    return {
      plan,
      wcPeople, genPeople,
      comps, orgs,
      wcUnassigned, genUnassigned
    };
  }

  async function unassignSequential(people) {
    for (const p of people) {
      if (!currentSeats(p).length) continue;
      await jsonpRequest('unassignSeat',{participantCode:p.id});
      await sleep(90);
    }
  }

  async function assignSequential(entries,button) {
    let i=0;
    for (const [participantCode,targetSeat] of entries) {
      if (button) button.textContent = `새 좌석 배정 중... ${i+1}/${entries.length}`;
      await jsonpRequest('assignSeatFromMap',{
        participantCode,
        targetSeat,
        replaceCurrent:false
      });
      i++;
      await sleep(100);
    }
  }

  function validateLayout() {
    const participants = activeParticipants();
    const mm = metaMap();
    const seatOwners = new Map();
    const duplicates = [];
    const wheelchairWrong = [];
    const unassigned = [];

    participants.forEach(p=>{
      const seats = currentSeats(p);
      if (!seats.length) unassigned.push(p.name);

      seats.forEach(seat=>{
        if (seatOwners.has(seat)) duplicates.push(`${seat}: ${seatOwners.get(seat)} / ${p.name}`);
        else seatOwners.set(seat,p.name);
      });

      // 이미 도착한 휠체어 이용자는 현장 혼선을 막기 위해 검사에서 제외
      if (p.wheelchairUser && !p.arrived && seats.length) {
        if (!seats.every(seat=>isWheelchairMeta(mm.get(seat)))) {
          wheelchairWrong.push(`${p.name} (${p.seat})`);
        }
      }
    });

    // 앞자리 구멍 검사: 일반 자동배정석만
    const generalOrder = allSeatCodes()
      .filter(seat=>isGeneralAutoSeat(mm.get(seat)))
      .sort(compareSeat);

    let lastOccupied = -1;
    generalOrder.forEach((seat,idx)=>{
      if (seatOwners.has(seat)) lastOccupied=idx;
    });

    const frontGaps = [];
    for (let i=0;i<lastOccupied;i++) {
      const seat = generalOrder[i];
      if (!seatOwners.has(seat)) frontGaps.push(seat);
    }

    return {duplicates,wheelchairWrong,unassigned,frontGaps};
  }

  function updateUi() {
    const heading = document.querySelector('#view-seats .section-heading .small-text');
    if (heading) {
      heading.innerHTML =
        '<strong>V4.2 검증형 압축배치</strong><br>' +
        'VIP·도착자는 고정합니다. 미도착 휠체어 이용자는 휠체어 지정석에 먼저 배정하고, ' +
        '동행자는 반드시 붙이며, 같은 기관은 가까이 두되 <strong>앞자리 밀도를 최우선</strong>으로 합니다.';
    }

    const button = document.querySelector('#reassignAllSeatsButton');
    if (button) button.textContent='V4 검증형 압축배치 실행';

    const note = document.querySelector('.seat-reset-note');
    if (note) {
      note.textContent =
        '한 명씩 순차 배정하고, 완료 후 중복좌석·미배정·휠체어 오배정·앞자리 빈칸을 자동 검사합니다.';
    }
  }

  async function reassignAllSeatsV4() {
    const button = document.querySelector('#reassignAllSeatsButton');
    const oldText = button?.textContent||'';

    const r = buildPlan();
    const warnings = [];
    if (r.wcUnassigned.length) warnings.push(`휠체어 지정석 부족: ${r.wcUnassigned.map(p=>p.name).join(', ')}`);
    if (r.genUnassigned.length) warnings.push(`일반/동행 연속석 부족: ${r.genUnassigned.map(p=>p.name).join(', ')}`);

    const ok = confirm(
      `V4.2 검증형 압축배치를 실행할까요?\n\n`+
      `• 휠체어 재배치 대상 ${r.wcPeople.length}명\n`+
      `• 일반 재배치 대상 ${r.genPeople.length}명\n`+
      `• 명시적 동행그룹 ${r.comps.length}개\n`+
      `• 같은 기관 자동그룹 ${r.orgs.length}개\n`+
      `• VIP/내빈/수상자/관계자/도착자는 유지\n`+
      `• 미도착 휠체어 이용자는 휠체어 지정석만 사용\n`+
      `• 기관그룹보다 앞자리 밀도 우선\n`+
      `• 서버에는 한 명씩 순차 적용`+
      (warnings.length?`\n\n주의\n${warnings.join('\n')}`:'')
    );
    if (!ok) return;

    if (button) {
      button.disabled=true;
      button.textContent='기존 이동대상 좌석 비우는 중...';
    }

    try {
      await unassignSequential([...r.wcPeople,...r.genPeople]);

      const entries=[...r.plan.entries()];
      await assignSequential(entries,button);

      await refreshFromServer({silent:true,full:true});
      const v=validateLayout();
      updateUi();

      const issues=[];
      if (v.duplicates.length) issues.push(`중복 ${v.duplicates.length}`);
      if (v.wheelchairWrong.length) issues.push(`휠체어 오배정 ${v.wheelchairWrong.length}`);
      if (v.unassigned.length) issues.push(`미배정 ${v.unassigned.length}`);
      if (v.frontGaps.length) issues.push(`앞빈자리 ${v.frontGaps.length}`);

      if (!issues.length) {
        showToast(`V4.2 완료 · ${entries.length}명 재배치 · 검증 이상 없음`,9000);
      } else {
        const details=[];
        if (v.wheelchairWrong.length) details.push(`휠체어: ${v.wheelchairWrong.slice(0,5).join(', ')}`);
        if (v.unassigned.length) details.push(`미배정: ${v.unassigned.slice(0,8).join(', ')}`);
        if (v.frontGaps.length) details.push(`빈자리: ${v.frontGaps.slice(0,10).join(', ')}`);
        showToast(`배치 완료 후 확인 필요 · ${issues.join(' / ')}${details.length?' · '+details.join(' · '):''}`,12000);
      }
    } catch (e) {
      console.error('[seat-layout-v4 4.2]',e);
      try { await refreshFromServer({silent:true,full:true}); } catch (_) {}
      showToast(`배치 도중 오류가 발생했습니다. 현재 상태를 다시 읽었습니다. ${e.message||''}`,12000);
      throw e;
    } finally {
      if (button) {
        button.disabled=false;
        button.textContent=oldText||'V4 검증형 압축배치 실행';
      }
    }
  }

  window.reassignAllSeatsV4=reassignAllSeatsV4;
  window.reassignAllSeatsV31=reassignAllSeatsV4;
  window.buildSeatPlanV4=buildPlan;
  window.validateSeatLayoutV4=validateLayout;
  try { reassignAllSeatsV31=reassignAllSeatsV4; } catch (_) {}

  document.addEventListener('DOMContentLoaded',()=>{
    updateUi();
    setTimeout(updateUi,600);
    setTimeout(updateUi,1800);
  });
})();
