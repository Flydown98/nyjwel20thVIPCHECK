'use strict';

(() => {
  const ROWS='ABCDEFGHIJKLMNOPQRSTUVWXY'.split('');

  const VIP = new Set();
  const WHEEL = new Set();

  // A~C: 런웨이 가까운 5자리 = 귀빈 / 바깥 5자리 = 휠체어
  'ABC'.split('').forEach(row=>{
    for(let n=6;n<=10;n++) VIP.add(`${row}L-${String(n).padStart(2,'0')}`);
    for(let n=1;n<=5;n++)  VIP.add(`${row}R-${String(n).padStart(2,'0')}`);

    for(let n=1;n<=5;n++)  WHEEL.add(`${row}L-${String(n).padStart(2,'0')}`);
    for(let n=6;n<=10;n++) WHEEL.add(`${row}R-${String(n).padStart(2,'0')}`);
  });

  // D~F: 내빈 관련 인사석
  'DEF'.split('').forEach(row=>{
    ['L','R'].forEach(side=>{
      for(let n=1;n<=10;n++) VIP.add(`${row}${side}-${String(n).padStart(2,'0')}`);
    });
  });

  const esc=v=>String(v??'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  function ensureStyles(){
    if(document.getElementById('seatV68Style'))return;
    const s=document.createElement('style');
    s.id='seatV68Style';
    s.textContent=`
      #seatMap.seat-v68{display:flex;flex-direction:column;gap:5px;width:100%}
      #seatMap.seat-v68 .r{
        display:grid;
        grid-template-columns:34px minmax(0,1fr) 66px minmax(0,1fr) 34px;
        gap:6px;align-items:stretch
      }
      #seatMap.seat-v68 .side{
        display:grid;
        grid-template-columns:repeat(10,minmax(38px,1fr));
        gap:4px
      }
      #seatMap.seat-v68 .lab{
        display:flex;align-items:center;justify-content:center;
        font-size:12px;font-weight:900;color:#59708d
      }
      #seatMap.seat-v68 .run{
        display:flex;align-items:center;justify-content:center;
        background:linear-gradient(180deg,#ead7a8,#d7bf82);
        color:#74521b;font-weight:900
      }
      #seatMap.seat-v68 .s{
        position:relative;
        min-height:50px;
        padding:4px 2px;
        border:1.5px solid #d8dee8;
        border-radius:9px;
        background:#fff;
        color:#253858;
        font:inherit;
        font-size:12px;
        font-weight:900;
        cursor:pointer
      }
      /* 좌석은 기본적으로 흰색 유지, 구역만 테두리로 구분 */
      #seatMap.seat-v68 .s.vip{
        background:#fff;
        border-color:#d2a84b;
        box-shadow:inset 0 0 0 1px rgba(210,168,75,.16)
      }
      #seatMap.seat-v68 .s.wheel{
        background:#fff;
        border-color:#6ea4dd;
        box-shadow:inset 0 0 0 1px rgba(110,164,221,.18)
      }
      #seatMap.seat-v68 .s.assigned{
        background:#fff;
        font-weight:900
      }
      #seatMap.seat-v68 .s.arrived{
        background:#9be7b4!important;
        border-color:#2eae63!important;
        color:#164e2a;
        box-shadow:none
      }
      #seatMap.seat-v68 .s small{
        display:block;
        margin-top:2px;
        font-size:8.5px;
        line-height:1.05;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis
      }
      #seatMap.seat-v68 .zone-key{
        display:flex;gap:14px;flex-wrap:wrap;
        margin:8px 0 12px;
        font-size:12px;color:#566579
      }
      #seatMap.seat-v68 .zone-key span::before{
        content:'';
        display:inline-block;width:13px;height:13px;
        margin-right:5px;vertical-align:-2px;
        border-radius:4px;background:#fff;border:2px solid #d8dee8
      }
      #seatMap.seat-v68 .zone-key .k-vip::before{border-color:#d2a84b}
      #seatMap.seat-v68 .zone-key .k-wheel::before{border-color:#6ea4dd}
      #seatMap.seat-v68 .zone-key .k-arrived::before{background:#9be7b4;border-color:#2eae63}
      @media(max-width:1200px){
        #seatMap.seat-v68 .side{grid-template-columns:repeat(10,minmax(32px,1fr));gap:3px}
        #seatMap.seat-v68 .s{min-height:44px;font-size:10px}
      }
    `;
    document.head.appendChild(s);
  }

  function occMap(){
    try{
      const x=typeof seatOccupantMap==='function'?seatOccupantMap():null;
      if(x instanceof Map)return x;
      if(x&&typeof x==='object')return new Map(Object.entries(x));
    }catch(_){}
    return new Map();
  }

  function nameOf(o){
    if(!o)return'';
    return typeof o==='string'?o:String(o.name||o.participantName||o.label||'').trim();
  }

  function arrivedOf(o){
    return Boolean(o&&typeof o==='object'&&o.arrived);
  }

  function seat(row,side,n,om){
    const code=`${row}${side}-${String(n).padStart(2,'0')}`;
    const o=om.get(code)||null;
    const name=nameOf(o);
    const arrived=arrivedOf(o);

    const cls=['s'];
    if(VIP.has(code))cls.push('vip');
    if(WHEEL.has(code))cls.push('wheel');
    if(name)cls.push('assigned');
    if(arrived)cls.push('arrived');

    let zone='일반석';
    if(WHEEL.has(code))zone='장애인·휠체어석';
    else if(VIP.has(code))zone=row<'D'?'주요 귀빈석':'내빈 관련 인사석';

    return `<button type="button" class="${cls.join(' ')}" data-seat-code="${code}" title="${esc(code+' · '+zone+(name?' · '+name:''))}">
      <span>${String(n).padStart(2,'0')}</span>
      ${name?`<small>${esc(name)}</small>`:''}
    </button>`;
  }

  function render(){
    const host=document.querySelector('#seatMap');
    if(!host)return;

    ensureStyles();
    host.className='seat-v68';

    const om=occMap();

    host.innerHTML=`
      <div class="zone-key">
        <span class="k-vip">귀빈·내빈석</span>
        <span class="k-wheel">장애인·휠체어석</span>
        <span class="k-arrived">도착 완료</span>
      </div>
      ${ROWS.map(row=>`
        <div class="r" data-row="${row}">
          <div class="lab">${row}L</div>
          <div class="side">${Array.from({length:10},(_,i)=>seat(row,'L',i+1,om)).join('')}</div>
          <div class="run">${row}</div>
          <div class="side">${Array.from({length:10},(_,i)=>seat(row,'R',i+1,om)).join('')}</div>
          <div class="lab">${row}R</div>
        </div>
      `).join('')}
    `;
  }

  window.renderSeatMap=render;
  window.renderSeatMap400=render;
  try{renderSeatMap=render}catch(_){}

  document.addEventListener('DOMContentLoaded',()=>setTimeout(render,180));
  window.addEventListener('load',()=>setTimeout(render,100));
})();