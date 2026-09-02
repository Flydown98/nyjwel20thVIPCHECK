'use strict';

/* 400석 좌석도 표시 보강: A~Y, 좌8 + 우8 = 400석 */
(() => {
  function renderSeatMap350(){
    const mm=seatMetaByCode(),om=seatOccupantMap();
    const host=document.querySelector('#seatMap');
    if(!host)return;
    host.innerHTML='ABCDEFGHIJKLMNOPQRSTUVWXY'.split('')
      .map(r=>runwayRow(r,8,8,mm,om)).join('');
    const extra=document.querySelector('#extraSeatMap');
    if(extra)extra.innerHTML='';
  }

  window.renderSeatMap=renderSeatMap350;
  try{renderSeatMap=renderSeatMap350}catch(_){}

  function updateCopy(){
    const btn=document.querySelector('#reassignAllSeatsButton');
    if(btn&&!/350/.test(btn.textContent||''))btn.textContent='400석 구조 · 압축배치 실행';

    const small=document.querySelector('#view-seats .section-heading .small-text');
    if(small){
      small.innerHTML=
        '<strong>400석 좌석도</strong> · A~Y 25행 × 좌8 + 우8<br>'+
        '기존 300석은 그대로 유지하고 각 행 좌·우 바깥쪽에 2석씩 총 100석을 추가했습니다.';
    }
  }

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(()=>{updateCopy();renderSeatMap350()},500);
  });
})();
