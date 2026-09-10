'use strict';

(() => {
  function updateUi(){
    const heading=document.querySelector('#view-seats .section-heading .small-text');
    if(heading){
      heading.innerHTML=
        '<strong>V6.4 · 현장 입장순 좌석배정</strong><br>'+
        'A~C 주요 내빈 인사 · D~F 내빈 관련 인사 · A~C 양끝 파란 구역은 휠체어·보호자 좌석 · G~Y 일반석';
    }

    const button=document.querySelector('#reassignAllSeatsButton');
    if(button)button.textContent='일반 사전좌석 초기화 · 현장배정 준비';

    const note=document.querySelector('.seat-reset-note');
    if(note){
      note.textContent=
        '내빈석·장애인석처럼 미리 지정한 좌석만 유지하고, 일반 참가자의 사전 좌석은 비웁니다. 일반석은 행사 당일 QR 입장 순서대로 G~Y에 배정됩니다.';
    }
  }

  async function reassignAllSeatsV6(){
    const button=document.querySelector('#reassignAllSeatsButton');
    const oldText=button?.textContent||'';

    const active=(state.participants||[]).filter(
      p=>String(p.participationStatus||'참여')!=='미참여'
    );
    const arrived=active.filter(p=>p.arrived).length;
    const wc=active.filter(p=>!p.arrived&&p.wheelchairUser).length;

    const ok=confirm(
      `V6.2 좌석 구역 엄격 재배치를 실행할까요?\n\n`+
      `구역\n`+
      `• A~C : 주요 내빈 인사\n`+
      `• D~F : 내빈 관련 인사\n`+
      `• 장애인·휠체어/보호자 구역 : AL01~04, BL01~04, CL01~04, AR06~08, BR05~08, CR05~08\n`+
      `• G~Y : 일반석 304석\n\n`+
      `재배치\n`+
      `• AL07·08, AR01~05 또는 VIP 표식이 있는 사람만 내빈으로 보호\n`+
      `• 휠체어 이용자 + 같은 동반그룹 보호자를 파란 블록에 함께 배치\n`+
      `• 나머지는 G~Y 일반석에만 배치\n`+
      `• 동반/같은 기관을 붙이되 그룹의 최초 신청번호 순으로 배치\n`+
      `• 이미 도착한 ${arrived}명은 이동하지 않음\n\n`+
      `현재 미도착 휠체어 이용자 ${wc}명`
    );
    if(!ok)return;

    if(button){
      button.disabled=true;
      button.textContent='좌석 구역 적용 · 재배치 중...';
    }

    try{
      const r=await jsonpRequest('adminReassignAllSeats',{mode:'v6'});
      await refreshFromServer({silent:true,full:true});
      updateUi();

      const warn=[];
      if(r.unassignedCount)warn.push(`미배정 ${r.unassignedCount}명`);
      if(r.arrivedZoneMismatchCount)warn.push(`도착자 구역확인 ${r.arrivedZoneMismatchCount}명`);

      showToast(
        `재배치 완료 · ${r.movedCount}명 · 내빈보호 ${r.vipProtectedCount}명 · `+
        `휠체어 ${r.wheelchairUserCount}명 · 파란구역 ${r.wheelchairZoneUsed}/${r.wheelchairCapacity}석 · 일반 ${r.generalCount}명`+
        (warn.length?` · ${warn.join(' / ')}`:''),
        11000
      );
    }catch(error){
      try{await refreshFromServer({silent:true,full:true})}catch(_){}
      showToast(`좌석 재배치 실패: ${error.message||error}`,12000);
      throw error;
    }finally{
      if(button){
        button.disabled=false;
        button.textContent=oldText||'좌석 구역 적용 · 전체 참가자 재배치';
      }
    }
  }

  window.reassignAllSeatsV6=reassignAllSeatsV6;
  window.reassignAllSeatsV5=reassignAllSeatsV6;
  window.reassignAllSeatsV4=reassignAllSeatsV6;
  window.reassignAllSeatsV31=reassignAllSeatsV6;
  try{reassignAllSeatsV31=reassignAllSeatsV6}catch(_){}

  document.addEventListener('DOMContentLoaded',()=>{
    updateUi();
    setTimeout(updateUi,500);
    setTimeout(updateUi,1500);
  });
})();

/* v6.4 현장 입장순 좌석 준비 버튼 */
(() => {
  async function prepareArrivalSeatingV64(){
    const button=document.querySelector('#reassignAllSeatsButton');
    if(!confirm(
      '일반 참가자의 현재 사전 좌석을 모두 비울까요?\n\n'+
      '• 내빈으로 직접 지정된 좌석은 유지\n'+
      '• 휠체어 이용자가 파란 장애인석에 지정된 경우 유지\n'+
      '• 나머지 일반 참가자는 좌석 미배정으로 변경\n'+
      '• 행사 당일 QR 입장 순서대로 G~Y 일반석 자동배정\n\n'+
      '이미 도착 처리된 참가자는 변경하지 않습니다.'
    ))return;

    const old=button?.textContent||'';
    if(button){button.disabled=true;button.textContent='현장배정 준비 중...';}

    try{
      const r=await jsonpRequest('adminReassignAllSeats',{mode:'arrival'});
      await refreshFromServer({silent:true,full:true});
      showToast(
        `준비 완료 · 일반 사전좌석 ${r.clearedGeneral}명 초기화 · `+
        `내빈 ${r.preservedVip}명 유지 · 장애인석 ${r.preservedWheelchair}명 유지`,
        9000
      );
    }catch(e){
      showToast(`현장배정 준비 실패: ${e.message||e}`,9000);
    }finally{
      if(button){button.disabled=false;button.textContent='일반 사전좌석 초기화 · 현장배정 준비';}
    }
  }

  window.reassignAllSeatsV31=prepareArrivalSeatingV64;
  window.reassignAllSeatsV4=prepareArrivalSeatingV64;
  window.reassignAllSeatsV5=prepareArrivalSeatingV64;
  window.reassignAllSeatsV6=prepareArrivalSeatingV64;
  window.prepareArrivalSeatingV64=prepareArrivalSeatingV64;
  try{reassignAllSeatsV31=prepareArrivalSeatingV64}catch(_){}
})();

(() => {
  function updateDeferredUi(){
    const h=document.querySelector('#view-seats .section-heading .small-text');
    if(h)h.innerHTML='<strong>V6.8 · 좌우 10석 구조 · 좌석 추후배정</strong><br>지금은 접수만 받고 일반 좌석은 비워둡니다. 좌석 확정 후 별도 일괄배치를 적용합니다.';
    const b=document.querySelector('#reassignAllSeatsButton');
    if(b)b.textContent='일반 사전좌석 초기화 · 추후배정 준비';
  }
  window.prepareDeferredSeatingV65=async function(){
    if(!confirm('일반 참가자의 사전 좌석을 비우고 추후배정 상태로 둘까요?\n\n내빈/장애인처럼 명시적으로 지정한 좌석은 유지합니다.'))return;
    const r=await jsonpRequest('adminReassignAllSeats',{mode:'deferred'});
    await refreshFromServer({silent:true,full:true});
    showToast(`추후배정 준비 완료 · 일반좌석 ${r.clearedGeneral}명 초기화 · 예약좌석 ${r.keptReserved}명 유지`,8000);
  };
  window.reassignAllSeatsV31=window.prepareDeferredSeatingV65;
  window.reassignAllSeatsV4=window.prepareDeferredSeatingV65;
  window.reassignAllSeatsV5=window.prepareDeferredSeatingV65;
  window.reassignAllSeatsV6=window.prepareDeferredSeatingV65;
  try{reassignAllSeatsV31=window.prepareDeferredSeatingV65}catch(_){}
  document.addEventListener('DOMContentLoaded',()=>{updateDeferredUi();setTimeout(updateDeferredUi,600)});
})();


/* V6.8 좌석 구조 안내 */
(() => {
  function updateSeatInfoV68(){
    const h=document.querySelector('#view-seats .section-heading .small-text');
    if(h){
      h.innerHTML=
        '<strong>V6.8 · 좌우 10석 구조</strong><br>'+
        'A~C는 런웨이 가까운 5자리씩 귀빈석, 바깥쪽 5자리씩 장애인·휠체어석입니다. '+
        'D~F는 내빈 관련 인사석, G~Y는 일반석입니다. 지금은 좌석 추후배정 모드입니다.';
    }
  }
  document.addEventListener('DOMContentLoaded',()=>{updateSeatInfoV68();setTimeout(updateSeatInfoV68,600)});
})();
