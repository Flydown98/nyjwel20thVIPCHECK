'use strict';

(() => {
  const ROWS='ABCDEFGHIJKLMNOPQRSTUVWXY'.split('');

  function ensureStyles(){
    if(document.getElementById('seatV6Style'))return;
    const style=document.createElement('style');
    style.id='seatV6Style';
    style.textContent=`
      #seatMap.seat-v6{display:flex;flex-direction:column;gap:5px;width:100%}
      #seatMap.seat-v6 .sv6-row{
        display:grid;grid-template-columns:34px minmax(0,1fr) 66px minmax(0,1fr) 34px;
        gap:6px;align-items:stretch
      }
      #seatMap.seat-v6 .sv6-side{display:grid;grid-template-columns:repeat(8,minmax(44px,1fr));gap:5px}
      #seatMap.seat-v6 .sv6-label{display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#59708d}
      #seatMap.seat-v6 .sv6-runway{
        display:flex;align-items:center;justify-content:center;
        background:linear-gradient(180deg,#ead7a8,#d7bf82);
        color:#74521b;font-weight:900;font-size:16px;min-height:52px
      }
      #seatMap.seat-v6 .sv6-seat{
        position:relative;appearance:none;min-height:50px;padding:4px 2px;
        border:1.5px solid #d9dee7;border-radius:10px;background:#fff;
        color:#253858;font:inherit;font-size:13px;font-weight:900;cursor:pointer
      }
      #seatMap.seat-v6 .sv6-seat.vip-main,
      #seatMap.seat-v6 .sv6-seat.vip-related{
        background:#f6d45c;border-color:#d7a922;color:#664900
      }
      #seatMap.seat-v6 .sv6-seat.wheelchair{
        background:#dcecff;border-color:#62a0f2;color:#183f7a
      }
      #seatMap.seat-v6 .sv6-seat.general{
        background:#fff;border-color:#d9dee7;color:#334155
      }
      #seatMap.seat-v6 .sv6-seat.occupied{
        box-shadow:inset 0 0 0 2px rgba(22,163,74,.38)
      }
      #seatMap.seat-v6 .sv6-seat.arrived::after{
        content:'✓';position:absolute;right:3px;top:2px;font-size:9px;
        width:15px;height:15px;border-radius:999px;background:#178b51;color:#fff;
        display:grid;place-items:center
      }
      #seatMap.seat-v6 .sv6-seat small{
        display:block;margin-top:2px;font-size:9px;line-height:1.05;font-weight:700;
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap
      }
      #seatMap.seat-v6 .sv6-section-gap{margin-top:4px}
      #seatMap.seat-v6 .sv6-row[data-row="G"]{margin-top:8px}
      @media(max-width:1100px){
        #seatMap.seat-v6 .sv6-row{grid-template-columns:28px minmax(0,1fr) 50px minmax(0,1fr) 28px;gap:4px}
        #seatMap.seat-v6 .sv6-side{grid-template-columns:repeat(8,minmax(36px,1fr));gap:3px}
        #seatMap.seat-v6 .sv6-seat{min-height:44px;font-size:11px;border-radius:8px}
      }
    `;
    document.head.appendChild(style);
  }

  const normalize=v=>String(v||'').trim().toUpperCase();
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  function maps(){
    let mm=new Map(),om=new Map();
    try{
      const x=typeof seatMetaByCode==='function'?seatMetaByCode():null;
      if(x instanceof Map)mm=x;
      else if(x&&typeof x==='object')mm=new Map(Object.entries(x));
    }catch(_){}
    try{
      const x=typeof seatOccupantMap==='function'?seatOccupantMap():null;
      if(x instanceof Map)om=x;
      else if(x&&typeof x==='object')om=new Map(Object.entries(x));
    }catch(_){}
    return{mm,om};
  }

  function nameOf(o){
    if(!o)return'';
    if(typeof o==='string')return o;
    return String(o.name||o.participantName||o.label||'').trim();
  }

  function arrivedOf(o){
    return Boolean(o&&typeof o==='object'&&o.arrived);
  }

  function cls(meta){
    const c=String(meta?.category||'').toLowerCase();
    if(meta?.wheelchairEligible===true||c.includes('휠체어')||c.includes('장애인'))return'wheelchair';
    if(c.includes('주요 내빈'))return'vip-main';
    if(c.includes('내빈')||c.includes('수상자')||c.includes('vip')||c.includes('관계자'))return'vip-related';
    return'general';
  }

  function seat(row,side,n,mm,om){
    const code=`${row}${side}-${String(n).padStart(2,'0')}`;
    const meta=mm.get(code)||mm.get(normalize(code))||null;
    const occ=om.get(code)||om.get(normalize(code))||null;
    const name=nameOf(occ);
    const classes=['sv6-seat',cls(meta)];
    if(name)classes.push('occupied');
    if(arrivedOf(occ))classes.push('arrived');

    const title=[code,meta?.category||'',name?`배정: ${name}`:''].filter(Boolean).join(' · ');
    return `<button type="button" class="${classes.join(' ')}" data-seat-code="${code}" title="${esc(title)}">
      <span>${String(n).padStart(2,'0')}</span>
      ${name?`<small>${esc(name)}</small>`:''}
    </button>`;
  }

  function render(){
    const host=document.querySelector('#seatMap');
    if(!host)return;
    ensureStyles();
    host.className='seat-v6';
    const {mm,om}=maps();

    host.innerHTML=ROWS.map(row=>`
      <div class="sv6-row" data-row="${row}">
        <div class="sv6-label">${row}L</div>
        <div class="sv6-side">${Array.from({length:8},(_,i)=>seat(row,'L',i+1,mm,om)).join('')}</div>
        <div class="sv6-runway">${row}</div>
        <div class="sv6-side">${Array.from({length:8},(_,i)=>seat(row,'R',i+1,mm,om)).join('')}</div>
        <div class="sv6-label">${row}R</div>
      </div>
    `).join('');

    const extra=document.querySelector('#extraSeatMap');
    if(extra)extra.innerHTML='';
  }

  function bind(){
    const host=document.querySelector('#seatMap');
    if(!host||host.dataset.v6bound==='1')return;
    host.dataset.v6bound='1';
    host.addEventListener('click',e=>{
      const b=e.target.closest('[data-seat-code]');
      if(!b)return;
      const code=b.dataset.seatCode;
      // admin.js 자체 클릭 핸들러가 같은 host에 이미 묶여 있으므로
      // 여기서는 별도 quick-action을 중복 호출하지 않습니다.
    });
  }

  window.renderSeatMap=render;
  window.renderSeatMap400=render;
  try{renderSeatMap=render}catch(_){}

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(()=>{render();bind()},180);
  });
  window.addEventListener('load',()=>setTimeout(()=>{render();bind()},100));
})();