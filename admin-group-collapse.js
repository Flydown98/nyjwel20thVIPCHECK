'use strict';

/**
 * 대표자 그룹/초대장 패널 접기 v1.0
 * - 기본값: 접힘
 * - 메인 관리자가 필요할 때만 열기
 * - 열림/닫힘 상태는 이 브라우저에 기억
 */
(() => {
  const ROOT_ID='groupMessageAdminAddon';
  const STORAGE_KEY='nyj20_group_panel_open_v1';

  function ensureStyle(){
    if(document.getElementById('gmPanelCollapseStyle'))return;
    const s=document.createElement('style');
    s.id='gmPanelCollapseStyle';
    s.textContent=`
      #${ROOT_ID}.gm-panel-collapsed{
        padding:12px 14px!important;
      }
      #${ROOT_ID}.gm-panel-collapsed > :not(.gm-collapse-header){
        display:none!important;
      }
      #${ROOT_ID} .gm-collapse-header{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
      }
      #${ROOT_ID} .gm-collapse-summary{
        min-width:0;
      }
      #${ROOT_ID} .gm-collapse-summary strong{
        display:block;
        color:#172554;
        font-size:1rem;
      }
      #${ROOT_ID} .gm-collapse-summary small{
        display:block;
        margin-top:3px;
        color:#64748b;
        line-height:1.45;
      }
      #${ROOT_ID} .gm-collapse-toggle{
        flex:none;
        min-height:42px;
        padding:8px 13px;
        border-radius:11px;
        border:1px solid #9db2d0;
        background:#fff;
        color:#23427b;
        font-weight:900;
        cursor:pointer;
      }
      #${ROOT_ID}:not(.gm-panel-collapsed) .gm-collapse-header{
        margin-bottom:12px;
        padding-bottom:10px;
        border-bottom:1px solid #e7edf5;
      }
      @media(max-width:650px){
        #${ROOT_ID} .gm-collapse-header{
          align-items:flex-start;
        }
        #${ROOT_ID} .gm-collapse-summary small{
          font-size:.78rem;
        }
        #${ROOT_ID} .gm-collapse-toggle{
          min-height:40px;
          padding:7px 10px;
          font-size:.82rem;
        }
      }
    `;
    document.head.appendChild(s);
  }

  function counts(){
    let manual=0,auto=0;
    try{
      const txt=String(document.querySelector('#gmGroupList')?.textContent||'');
      const m=txt.match(/직접 지정 대표자 그룹\s*·\s*(\d+)개/);
      const a=txt.match(/자동 기관 그룹\s*·\s*(\d+)개/);
      manual=m?Number(m[1]):0;
      auto=a?Number(a[1]):0;
    }catch(_){}
    return{manual,auto};
  }

  function updateSummary(){
    const root=document.getElementById(ROOT_ID);
    if(!root)return;
    const c=counts();
    const small=root.querySelector('.gm-collapse-summary small');
    if(small){
      small.textContent=`대표자 ${c.manual}개 · 자동 기관 ${c.auto}개 · 필요할 때만 열어 관리하세요.`;
    }
  }

  function mount(){
    const root=document.getElementById(ROOT_ID);
    if(!root||root.dataset.collapseReady==='1')return Boolean(root);

    ensureStyle();
    root.dataset.collapseReady='1';

    const header=document.createElement('div');
    header.className='gm-collapse-header';
    header.innerHTML=`
      <div class="gm-collapse-summary">
        <strong>대표자 그룹 · 초대장 관리</strong>
        <small>대표자 그룹 관리 기능을 접어두었습니다.</small>
      </div>
      <button type="button" class="gm-collapse-toggle">관리 열기</button>
    `;

    root.prepend(header);

    let open=false;
    try{open=localStorage.getItem(STORAGE_KEY)==='1'}catch(_){}
    root.classList.toggle('gm-panel-collapsed',!open);

    const button=header.querySelector('.gm-collapse-toggle');
    const apply=()=>{
      const isOpen=!root.classList.contains('gm-panel-collapsed');
      button.textContent=isOpen?'관리 접기':'관리 열기';
      button.setAttribute('aria-expanded',String(isOpen));
      updateSummary();
    };

    button.addEventListener('click',()=>{
      const next=root.classList.contains('gm-panel-collapsed');
      root.classList.toggle('gm-panel-collapsed',!next);
      try{localStorage.setItem(STORAGE_KEY,next?'1':'0')}catch(_){}
      apply();
    });

    apply();

    const observer=new MutationObserver(()=>updateSummary());
    const groupList=document.querySelector('#gmGroupList');
    if(groupList)observer.observe(groupList,{childList:true,subtree:true});
    return true;
  }

  function init(){
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(mount()||tries>60)clearInterval(timer);
    },100);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init,{once:true});
  }else init();
})();