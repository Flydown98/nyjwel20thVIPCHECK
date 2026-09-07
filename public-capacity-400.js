'use strict';

/**
 * V6.7 · 신청방식 선택 + 스탠딩석 확인
 *
 * 상단/하단에 큰 신청버튼 2개:
 * - 혼자 신청하기
 * - 동행자와 같이 신청하기
 *
 * 두 버튼 모두 신청 전 스탠딩석 안내 확인창을 거침.
 * 확인 후 선택한 신청폼으로 바로 이동.
 */
(() => {
  const $ = s => document.querySelector(s);
  let pendingMode = '';
  let bypassOriginalReveal = false;

  function stateSettings() {
    try {
      if (typeof publicState !== 'undefined' && publicState?.settings) return publicState.settings;
    } catch (_) {}
    return window.__NYJ20_PUBLIC_STATE__?.settings || {};
  }

  function isRegistrationCapacityFull() {
    const s = stateSettings();
    const remain = Number(s.remainingCount);
    if (Number.isFinite(remain)) return remain <= 0;

    const registered = Number(s.registeredCount);
    const capacity = Number(s.registrationCapacity || 450);
    return Number.isFinite(registered) && registered >= capacity;
  }

  function ensureStyles() {
    if ($('#applicationChoiceStyles')) return;

    const style = document.createElement('style');
    style.id = 'applicationChoiceStyles';
    style.textContent = `
      .application-choice-box {
        display: grid;
        gap: 12px;
        margin-top: 18px;
      }
      .application-choice-title {
        margin: 0;
        text-align: center;
        color: #475569;
        font-size: .9rem;
        font-weight: 800;
      }
      .application-choice-buttons {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .application-choice-button {
        min-height: 78px;
        border-radius: 16px;
        border: 1px solid #cbd5e1;
        background: #fff;
        color: #1e293b;
        padding: 13px 12px;
        font: inherit;
        cursor: pointer;
        text-align: left;
        transition: transform .08s ease, box-shadow .08s ease;
      }
      .application-choice-button:hover {
        transform: translateY(-1px);
        box-shadow: 0 7px 20px rgba(15,23,42,.08);
      }
      .application-choice-button.primary-choice {
        border: 2px solid #3459a5;
        background: #3459a5;
        color: #fff;
      }
      .application-choice-button.group-choice {
        border: 2px solid #7c3aed;
        background: #f7f2ff;
        color: #4c1d95;
      }
      .application-choice-button strong {
        display: block;
        font-size: 1.02rem;
        margin-bottom: 4px;
      }
      .application-choice-button span {
        display: block;
        font-size: .8rem;
        line-height: 1.45;
        opacity: .88;
      }
      .application-choice-bottom {
        margin: 20px 0 4px;
        padding: 17px;
        border: 1px solid #e1e7ef;
        border-radius: 18px;
        background: #f8fafc;
      }
      .application-choice-bottom h3 {
        margin: 0 0 5px;
        font-size: 1rem;
        color: #172554;
      }
      .application-choice-bottom > p {
        margin: 0 0 12px;
        font-size: .85rem;
        line-height: 1.55;
        color: #64748b;
      }

      #standingConfirmModal,
      #standingCapacityFullModal {
        position: fixed;
        inset: 0;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      #standingConfirmModal.hidden,
      #standingCapacityFullModal.hidden { display:none!important; }

      .sc-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(15,23,42,.66);
        backdrop-filter: blur(2px);
      }
      .sc-card {
        position: relative;
        width: min(540px,100%);
        max-height: 90vh;
        overflow: auto;
        background: #fff;
        border-radius: 22px;
        padding: 26px 24px 22px;
        box-shadow: 0 24px 70px rgba(15,23,42,.24);
        color: #24324a;
      }
      .sc-badge {
        display:inline-flex;
        min-height:31px;
        align-items:center;
        padding:5px 10px;
        border-radius:999px;
        background:#fff4d8;
        color:#8a5a00;
        font-size:.82rem;
        font-weight:900;
        margin-bottom:10px;
      }
      .sc-card h2 { margin:0 0 12px;color:#172554;font-size:1.35rem;line-height:1.35; }
      .sc-main { margin:0;line-height:1.72;font-size:.96rem; }
      .sc-main strong { color:#b45309; }
      .sc-sub {
        margin:13px 0 0;
        padding:12px 13px;
        border-radius:12px;
        background:#f7f9fc;
        color:#5b6678;
        font-size:.86rem;
        line-height:1.6;
      }
      .sc-check {
        display:flex;
        gap:10px;
        align-items:flex-start;
        margin:18px 0 16px;
        padding:13px 14px;
        border:1px solid #d7dfeb;
        border-radius:13px;
        cursor:pointer;
        font-weight:800;
        line-height:1.45;
      }
      .sc-check input { width:19px;height:19px;margin:1px 0 0;flex:none;accent-color:#3459a5; }
      .sc-actions { display:grid;grid-template-columns:.8fr 1.3fr;gap:9px; }
      .sc-actions button {
        min-height:50px;border-radius:13px;font:inherit;font-weight:900;cursor:pointer;
      }
      #standingConfirmCancel {
        border:1px solid #cbd5e1;background:#fff;color:#475569;
      }
      #standingConfirmProceed {
        border:0;background:#3459a5;color:#fff;
      }
      #standingConfirmProceed:disabled {
        background:#cbd5e1;color:#64748b;cursor:not-allowed;
      }
      #standingCapacityFullClose {
        width:100%;min-height:48px;margin-top:8px;border:0;border-radius:12px;
        background:#3459a5;color:#fff;font-weight:900;cursor:pointer;
      }

      @media(max-width:620px){
        .application-choice-buttons { grid-template-columns:1fr; }
        .application-choice-button { min-height:70px; }
        .sc-card { padding:22px 18px 18px; }
        .sc-actions { grid-template-columns:1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function choiceHtml(position) {
    return `
      <div class="application-choice-box ${position==='bottom'?'application-choice-bottom':''}" data-choice-position="${position}">
        ${position==='bottom'
          ? '<h3>신청 방법을 선택해 주세요</h3><p>혼자 오시는 분과 동행자와 같이 신청하시는 분 모두 바로 신청할 수 있습니다.</p>'
          : '<p class="application-choice-title">신청 방법을 선택해 주세요</p>'}
        <div class="application-choice-buttons">
          <button type="button" class="application-choice-button primary-choice" data-application-mode="single">
            <strong>혼자 신청하기</strong>
            <span>본인 1명만 신청할 때</span>
          </button>
          <button type="button" class="application-choice-button group-choice" data-application-mode="group">
            <strong>동행자와 같이 신청하기</strong>
            <span>가족·친구·동행자를 함께 신청할 때</span>
          </button>
        </div>
      </div>
    `;
  }

  function ensureChoiceButtons() {
    // 상단 RSVP 영역: 기존 단일 신청버튼 대신 선택형 버튼 노출
    const gateway = document.querySelector('.application-gateway-card');
    if (gateway && !gateway.querySelector('[data-choice-position="top"]')) {
      const old = $('#revealApplicationButton');
      if (old) old.style.display = 'none';

      const wrap = document.createElement('div');
      wrap.innerHTML = choiceHtml('top');
      gateway.appendChild(wrap.firstElementChild);
    }

    // 신청서 하단: 개인폼 아래, 특수 다중신청 위에 선택형 버튼 추가
    const individualForm = $('#applicationForm');
    const specialGroup = document.querySelector('.special-group-application');
    if (
      individualForm &&
      specialGroup &&
      !document.querySelector('[data-choice-position="bottom"]')
    ) {
      const wrap = document.createElement('div');
      wrap.innerHTML = choiceHtml('bottom');
      specialGroup.parentNode.insertBefore(wrap.firstElementChild, specialGroup);
    }
  }

  function ensureStandingModal() {
    if ($('#standingConfirmModal')) return;

    const modal = document.createElement('div');
    modal.id = 'standingConfirmModal';
    modal.className = 'hidden';
    modal.setAttribute('aria-hidden','true');
    modal.innerHTML = `
      <div class="sc-backdrop" data-standing-close="1"></div>
      <section class="sc-card" role="dialog" aria-modal="true" aria-labelledby="standingConfirmTitle">
        <span class="sc-badge">좌석 안내</span>
        <h2 id="standingConfirmTitle">신청 전 좌석 안내를 꼭 확인해 주세요</h2>
        <p class="sc-main">
          현재 준비된 좌석은 기존 신청 인원으로 모두 배정 예정되어 있어,
          <strong>지금부터 신청하시는 분은 스탠딩석으로 안내됩니다.</strong>
        </p>
        <p class="sc-sub">
          행사 당일 취소 또는 미참석 등으로 잔여 좌석이 발생할 경우에는
          현장 상황에 따라 좌석을 별도로 안내해 드릴 수 있습니다.
          다만 좌석 제공을 사전에 보장드리기 어려운 점 양해 부탁드립니다.
        </p>
        <label class="sc-check">
          <input id="standingConfirmCheck" type="checkbox">
          <span>스탠딩석 안내 내용을 확인했으며, 이에 동의하고 신청하겠습니다.</span>
        </label>
        <div class="sc-actions">
          <button id="standingConfirmCancel" type="button">취소</button>
          <button id="standingConfirmProceed" type="button" disabled>확인하고 신청하기</button>
        </div>
      </section>
    `;
    document.body.appendChild(modal);

    const check = $('#standingConfirmCheck');
    const proceed = $('#standingConfirmProceed');
    check?.addEventListener('change',()=>{ if(proceed) proceed.disabled=!check.checked; });

    modal.addEventListener('click',e=>{
      if(e.target.closest('[data-standing-close="1"]')||e.target.id==='standingConfirmCancel'){
        closeStanding();
      }
    });

    proceed?.addEventListener('click',()=>{
      if(!check?.checked||!pendingMode)return;
      const mode=pendingMode;
      pendingMode='';
      closeStanding();
      openApplication(mode);
    });
  }

  function ensureFullModal() {
    if ($('#standingCapacityFullModal')) return;

    const modal=document.createElement('div');
    modal.id='standingCapacityFullModal';
    modal.className='hidden';
    modal.setAttribute('aria-hidden','true');
    modal.innerHTML=`
      <div class="sc-backdrop" data-capacity-close="1"></div>
      <section class="sc-card" role="dialog" aria-modal="true">
        <h2>온라인 사전접수가 마감되었습니다</h2>
        <p class="sc-main">
          준비된 추가 접수 인원까지 모두 신청이 완료되었습니다.<br>
          행사 당일 현장 상황에 따라 입장이 제한될 수 있는 점 양해 부탁드립니다.
        </p>
        <button id="standingCapacityFullClose" type="button">확인</button>
      </section>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{
      if(e.target.closest('[data-capacity-close="1"]')||e.target.id==='standingCapacityFullClose'){
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden','true');
      }
    });
  }

  function closeStanding(){
    const m=$('#standingConfirmModal');
    m?.classList.add('hidden');
    m?.setAttribute('aria-hidden','true');
    const c=$('#standingConfirmCheck');
    if(c)c.checked=false;
    const p=$('#standingConfirmProceed');
    if(p)p.disabled=true;
  }

  function askStanding(mode){
    if(isRegistrationCapacityFull()){
      const m=$('#standingCapacityFullModal');
      m?.classList.remove('hidden');
      m?.setAttribute('aria-hidden','false');
      return;
    }
    pendingMode=mode;
    const m=$('#standingConfirmModal');
    m?.classList.remove('hidden');
    m?.setAttribute('aria-hidden','false');
    setTimeout(()=>$('#standingConfirmCheck')?.focus(),30);
  }

  function revealApplicationBody(){
    const body=$('#applicationRevealBody');
    if(body&&!body.classList.contains('hidden'))return;

    const original=$('#revealApplicationButton');
    if(original){
      bypassOriginalReveal=true;
      try{original.click()}finally{
        setTimeout(()=>{bypassOriginalReveal=false},0);
      }
    }else if(body){
      body.classList.remove('hidden');
    }
  }

  function openApplication(mode){
    revealApplicationBody();

    setTimeout(()=>{
      if(mode==='group'){
        const details=document.querySelector('.special-group-application');
        if(details){
          details.open=true;
          details.scrollIntoView({behavior:'smooth',block:'start'});
          setTimeout(()=>details.querySelector('input[name="phone"]')?.focus(),500);
        }
      }else{
        const form=$('#applicationForm');
        form?.scrollIntoView({behavior:'smooth',block:'start'});
        setTimeout(()=>form?.querySelector('input[name="name"]')?.focus(),500);
      }
    },120);
  }

  function bindChoiceButtons(){
    document.querySelectorAll('[data-application-mode]').forEach(button=>{
      if(button.dataset.choiceBound==='1')return;
      button.dataset.choiceBound='1';
      button.addEventListener('click',()=>{
        askStanding(button.dataset.applicationMode==='group'?'group':'single');
      });
    });
  }

  function guardOldButtons(){
    // 행사프로그램 안의 기존 신청버튼은 '혼자 신청하기' 흐름으로 연결.
    ['#programApplyButton','#easyGoApply'].forEach(sel=>{
      const button=$(sel);
      if(!button||button.dataset.v67Guard==='1')return;
      button.dataset.v67Guard='1';
      button.addEventListener('click',e=>{
        e.preventDefault();
        e.stopImmediatePropagation();
        askStanding('single');
      },true);
    });

    // 숨겨둔 기존 reveal 버튼은 내부 동작용이므로 외부 직접 클릭만 보호.
    const original=$('#revealApplicationButton');
    if(original&&original.dataset.v67Guard!=='1'){
      original.dataset.v67Guard='1';
      original.addEventListener('click',e=>{
        if(bypassOriginalReveal)return;
        e.preventDefault();
        e.stopImmediatePropagation();
        askStanding('single');
      },true);
    }
  }

  function updateStatus(){
    const status=$('#registrationStatus');
    if(!status)return;
    if(isRegistrationCapacityFull()){
      status.className='registration-status closed';
      status.textContent='온라인 사전접수 마감';
    }else{
      status.textContent='온라인 참가 신청 가능 · 추가 신청자는 스탠딩석으로 안내됩니다';
    }
  }

  function mount(){
    ensureStyles();
    ensureChoiceButtons();
    ensureStandingModal();
    ensureFullModal();
    bindChoiceButtons();
    guardOldButtons();
    updateStatus();
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{
      setTimeout(mount,150);
      setInterval(mount,1500);
    });
  }else{
    setTimeout(mount,80);
    setInterval(mount,1500);
  }
})();
