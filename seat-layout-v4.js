'use strict';

(() => {
  function updateUi(){
    const heading=document.querySelector('#view-seats .section-heading .small-text');
    if(heading){
      heading.innerHTML=
        '<strong>V6.0 · 좌석 구역 엄격 적용</strong><br>'+
        'A~C 주요 내빈 인사 · D~F 내빈 관련 인사 · 지정된 파란 좌석만 장애인·휠체어석 · G~Y 일반석';
    }

    const button=document.querySelector('#reassignAllSeatsButton');
    if(button)button.textContent='좌석 구역 적용 · 전체 참가자 재배치';

    const note=document.querySelector('.seat-reset-note');
    if(note){
      note.textContent=
        '내빈 지정좌석의 기존 배정자는 유지하고, 휠체어 이용자는 파란 지정석으로, 나머지는 G~Y 일반석으로 다시 배치합니다.';
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
      `V6.0 좌석 구역 적용 + 전체 재배치를 실행할까요?\n\n`+
      `구역\n`+
      `• A~C : 주요 내빈 인사\n`+
      `• D~F : 내빈 관련 인사\n`+
      `• 장애인·휠체어석 : AL01~03, BL01~03, AR06~08, BR06~08, CR06~08\n`+
      `• G~Y : 일반석 304석\n\n`+
      `재배치\n`+
      `• 새 내빈석에 이미 배정된 사람은 최대한 현재 자리 유지\n`+
      `• 휠체어 이용자는 지정 장애인석으로 이동\n`+
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
        `휠체어 ${r.wheelchairCount}/${r.wheelchairCapacity} · 일반 ${r.generalCount}명`+
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