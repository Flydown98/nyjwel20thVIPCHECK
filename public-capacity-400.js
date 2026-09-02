'use strict';

/**
 * 400석 온라인 신청 마감 안내 v1.0
 * 남은 온라인 좌석이 0이면 참가 신청 버튼을 눌렀을 때
 * 현장접수 / 스탠딩석 안내를 먼저 보여줍니다.
 */
(() => {
  const $ = s => document.querySelector(s);
  const MESSAGE =
    '온라인 일반좌석 신청이 마감되었습니다.\n\n' +
    '추가 참여를 원하시는 경우 행사 당일 현장접수 후 스탠딩석으로 안내드립니다.\n\n' +
    '행사 당일 현장 상황에 따라 입장이 제한될 수 있는 점 양해 부탁드립니다.';

  function isFull(){
    const s=window.publicState?.settings||{};
    const remain=Number(s.remainingCount);
    if(Number.isFinite(remain)) return remain<=0;
    const registered=Number(s.registeredCount);
    const capacity=Number(s.registrationCapacity||400);
    return Number.isFinite(registered)&&registered>=capacity;
  }

  function ensureModal(){
    if($('#seat350FullModal'))return;
    const modal=document.createElement('div');
    modal.id='seat350FullModal';
    modal.className='seat350-full-modal hidden';
    modal.setAttribute('aria-hidden','true');
    modal.innerHTML=`
      <div class="seat350-full-backdrop" data-close="1"></div>
      <section class="seat350-full-card" role="dialog" aria-modal="true" aria-labelledby="seat350FullTitle">
        <div class="seat350-full-icon" aria-hidden="true">안내</div>
        <h2 id="seat350FullTitle">온라인 일반좌석 신청이 마감되었습니다</h2>
        <p>추가 참여를 원하시는 경우<br><strong>행사 당일 현장접수 후 스탠딩석</strong>으로 안내드립니다.</p>
        <small>행사 당일 현장 상황에 따라 입장이 제한될 수 있습니다.</small>
        <button id="seat350FullClose" type="button">확인</button>
      </section>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{
      if(e.target.closest('[data-close="1"]')||e.target.id==='seat350FullClose')closeModal();
    });
  }

  function openModal(){
    ensureModal();
    const m=$('#seat350FullModal');
    m.classList.remove('hidden');
    m.setAttribute('aria-hidden','false');
    setTimeout(()=>$('#seat350FullClose')?.focus(),30);
  }
  function closeModal(){
    const m=$('#seat350FullModal');
    if(!m)return;
    m.classList.add('hidden');
    m.setAttribute('aria-hidden','true');
  }

  function guard(event){
    if(!isFull())return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openModal();
  }

  function bind(){
    ensureModal();
    ['#revealApplicationButton','#programApplyButton','#easyGoApply'].forEach(sel=>{
      const btn=$(sel);
      if(btn&&!btn.dataset.seat350Guard){
        btn.dataset.seat350Guard='1';
        btn.addEventListener('click',guard,true);
      }
    });

    // 마감 상태 문구도 짧게 표시
    if(isFull()){
      const status=$('#registrationStatus');
      if(status){
        status.className='registration-status closed';
        status.textContent='온라인 좌석 마감 · 당일 현장접수 및 스탠딩석 안내';
      }
    }
  }

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(bind,500);
    setInterval(bind,1800);
  });

  // 서버에서 최종 제출 시 좌석마감 오류가 온 경우도 같은 안내로 통일
  window.addEventListener('unhandledrejection',e=>{
    const msg=String(e.reason?.message||'');
    if(/일반좌석 신청이 마감|자동 배정 가능한 좌석이 모두/.test(msg)){
      e.preventDefault();
      openModal();
    }
  });
})();
