'use strict';
(() => {
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const set=(s,t)=>{const e=$(s);if(e)e.textContent=t};
  function details(title, html){const d=document.createElement('details');d.className='easy-more';d.innerHTML=`<summary><span aria-hidden="true">＋</span><strong>${title}</strong></summary><div class="easy-more-body">${html}</div>`;d.addEventListener('toggle',()=>d.querySelector('summary span').textContent=d.open?'−':'＋');return d}
  function shorten(el, shortText, title){if(!el||el.dataset.easyDone)return;const old=el.innerHTML;el.dataset.easyDone='1';el.innerHTML=`<span class="easy-short-copy">${shortText}</span>`;el.after(details(title,`<div>${old}</div>`))}
  function quickGuide(){if($('#easyQuickGuide'))return;const hero=$('.invite-hero');if(!hero)return;const s=document.createElement('section');s.id='easyQuickGuide';s.className='easy-quick-guide';s.setAttribute('aria-label','행사 핵심 정보');s.innerHTML=`<h2>한눈에 보기</h2><div class="easy-quick-grid"><div class="easy-quick-card c1"><b>①</b><strong>언제?</strong><p>9월 17일 오후 1시 30분</p></div><div class="easy-quick-card c2"><b>②</b><strong>어디서?</strong><p>남양주금곡실내체육관</p></div><div class="easy-quick-card c3"><b>③</b><strong>어떻게?</strong><p>신청하고 QR을 보여주세요</p></div></div><div class="easy-quick-actions"><button id="easyGoApply">참가 신청하기</button><button id="easyGoMap">오시는 길 보기</button></div>`;hero.after(s);$('#easyGoApply')?.addEventListener('click',()=>{$('#revealApplicationButton')?.click();setTimeout(()=>$('#application')?.scrollIntoView({behavior:'smooth'}),50)});$('#easyGoMap')?.addEventListener('click',()=>$('#location')?.scrollIntoView({behavior:'smooth'}))}
  function app(){
    quickGuide();
    set('#heroProgramButton','행사 순서 보기');
    const badge=$('.application-personal-badge');if(badge)badge.textContent='한 사람씩 QR을 받아요';
    shorten($('.application-important-copy'),'이름과 전화번호를 입력하면 개인 QR을 받을 수 있어요.','QR 신청 방법 자세히 보기');
    const org=$('#applicationForm input[name="organization"]')?.closest('label')?.querySelector(':scope > span');if(org)org.innerHTML='소속기관 <em class="optional-field-mark">(없으면 비워도 돼요)</em>';
    set('#accessibilityApplicationTitle','필요한 도움을 선택해 주세요');
    const intro=$('.accessibility-application-intro p');if(intro){const old=intro.innerHTML;intro.remove();$('.accessibility-application-intro')?.append(details('선택 방법 보기',`<p>${old}</p>`))}
    set('#disabledPersonCheckbox + span strong','장애인입니다');
    set('#wheelchairUserCheckbox + span strong','휠체어 자리가 필요합니다');
    set('#wheelchairUserCheckbox + span small','휠체어를 사용하는 경우 선택해 주세요');
    set('#accessibilityDetails legend','복지관을 이용하고 있나요?');
    const opts=$$('#accessibilityDetails .binary-choice-buttons label span');if(opts[0])opts[0].textContent='네, 이용해요';if(opts[1])opts[1].textContent='아니요';
    set('#privacyDetailsButton','개인정보 내용 보기');
    set('#submitButton','신청하고 QR 받기');
    const sp=$('.special-group-application');if(sp){set('.special-group-application summary strong','가족·동행자도 함께 신청할까요?');set('.special-group-application summary span','여러 명 함께 신청');const g=sp.querySelector('.special-group-guide');if(g){const old=g.innerHTML;g.innerHTML='대표 전화번호 하나로 여러 명을 함께 신청할 수 있어요.';g.after(details('함께 신청하는 방법 자세히 보기',`<p>${old}</p>`))}set('#addGroupMemberButton','＋ 사람 추가');set('#groupSubmitButton','함께 신청하고 QR 받기')}
    set('#lookup .section-heading h2','내 신청 확인');const lp=$('#lookup .section-heading > p:last-child');if(lp)lp.textContent='이름과 전화번호를 입력하면 내 QR을 다시 볼 수 있어요.';set('#lookupButton','내 신청·QR 확인하기');set('#showRememberedTicketButton','저장된 QR 보기');
    const trailer=$('#trailer');if(trailer&&!trailer.dataset.easyDone){trailer.dataset.easyDone='1';set('#trailer .section-heading h2','20주년 영상');const p=$('#trailer .section-heading p:last-child');if(p)p.textContent='보고 싶을 때 재생해 주세요.';const frame=trailer.querySelector('.trailer-frame');if(frame){const d=details('20주년 영상 보기','');d.classList.add('easy-video-details');frame.before(d);d.querySelector('.easy-more-body').append(frame)}const cap=trailer.querySelector('.trailer-caption');if(cap)cap.textContent='영상은 보지 않아도 참가 신청할 수 있어요.'}
    set('.venue-map-button','지도에서 길 찾기');
    const classes=[['#submitButton,#groupSubmitButton,#revealApplicationButton,#programApplyButton','easy-primary'],['#lookupButton,#showRememberedTicketButton','easy-check'],['.venue-map-button','easy-map'],['#addGroupMemberButton','easy-add'],['#copyVenueAddressButton','easy-secondary']];classes.forEach(([s,c])=>$$(s).forEach(e=>e.classList.add(c)));
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',app,{once:true}):app();
})();
