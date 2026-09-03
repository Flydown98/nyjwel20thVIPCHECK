'use strict';

/**
 * 온라인 사전접수 450명 + 현장 입장순 좌석배정 v1.0
 *
 * - 1~450번째: 온라인 접수 가능
 * - 신청 단계에서는 일반 좌석번호를 미리 배정하지 않음
 * - 행사 당일 QR 입장 순서대로 잔여 일반석 배정
 * - 450명 이후: 스탠딩 안내
 */
(() => {
  const $=s=>document.querySelector(s);
  const CAPACITY=450;

  function settings(){
    try{
      if(typeof publicState!=='undefined'&&publicState?.settings)return publicState.settings;
    }catch(_){}
    return window.__NYJ20_PUBLIC_STATE__?.settings||{};
  }

  function isFull(){
    const s=settings();
    const registered=Number(s.registeredCount);
    const capacity=Number(s.registrationCapacity||CAPACITY);
    return Number.isFinite(registered)&&registered>=capacity;
  }

  function ensureNotice(){
    if($('#arrivalSeatNotice'))return;
    const target=$('#registrationStatus')?.parentElement||$('#registrationStatus');
    if(!target)return;

    const box=document.createElement('div');
    box.id='arrivalSeatNotice';
    box.style.cssText=
      'margin:12px 0;padding:14px 16px;border-radius:14px;'+
      'background:#f5f8ff;border:1px solid #cfdcf5;color:#253858;line-height:1.65;font-weight:700';
    box.innerHTML=
      '<strong>좌석은 행사 당일 입장 순서대로 안내됩니다.</strong><br>'+
      '온라인 신청 단계에서는 일반 좌석번호가 미리 지정되지 않습니다. '+
      '행사 당일 QR 확인 후 잔여 좌석을 순서대로 안내해 드립니다.';
    target.appendChild(box);
  }

  function ensureModal(){
    if($('#seat450FullModal'))return;
    const modal=document.createElement('div');
    modal.id='seat450FullModal';
    modal.className='seat350-full-modal hidden';
    modal.setAttribute('aria-hidden','true');
    modal.innerHTML=`
      <div class="seat350-full-backdrop" data-close="1"></div>
      <section class="seat350-full-card" role="dialog" aria-modal="true" aria-labelledby="seat450FullTitle">
        <div class="seat350-full-icon" aria-hidden="true">안내</div>
        <h2 id="seat450FullTitle">온라인 사전접수가 마감되었습니다</h2>
        <p>
          이후 참석자분들은 <strong>스탠딩석</strong>으로 안내될 예정입니다.<br><br>
          행사 당일 현장에 참석해 주시고,
          <strong>잔여 좌석이 있는 경우 현장에서 좌석을 배정</strong>받아 주시기 바랍니다.
        </p>
        <small>현장 상황에 따라 좌석 배정이 어려울 수 있습니다.</small>
        <button id="seat450FullClose" type="button">확인</button>
      </section>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{
      if(e.target.closest('[data-close="1"]')||e.target.id==='seat450FullClose')close();
    });
  }

  function open(){
    ensureModal();
    const m=$('#seat450FullModal');
    m?.classList.remove('hidden');
    m?.setAttribute('aria-hidden','false');
  }

  function close(){
    const m=$('#seat450FullModal');
    m?.classList.add('hidden');
    m?.setAttribute('aria-hidden','true');
  }

  function guard(e){
    if(!isFull())return;
    e.preventDefault();
    e.stopImmediatePropagation();
    open();
  }

  function bind(){
    ensureNotice();
    ensureModal();

    ['#revealApplicationButton','#programApplyButton','#easyGoApply'].forEach(sel=>{
      const b=$(sel);
      if(b&&!b.dataset.seat450Guard){
        b.dataset.seat450Guard='1';
        b.addEventListener('click',guard,true);
      }
    });

    const status=$('#registrationStatus');
    if(status){
      if(isFull()){
        status.className='registration-status closed';
        status.textContent='온라인 사전접수 마감 · 이후 참석자는 현장 스탠딩 안내';
      }else{
        status.textContent='온라인 참가 신청 가능 · 일반 좌석은 행사 당일 입장 순서대로 배정';
      }
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{setTimeout(bind,200);setInterval(bind,1800)});
  }else{
    setTimeout(bind,100);setInterval(bind,1800);
  }
})();