'use strict';

(() => {
  const MASTER_RE = /\[REPQR:MASTER:([A-Z0-9_-]+)\]/i;
  const MEMBER_RE = /\[REPQR:MEMBER:([A-Z0-9_-]+)\]/i;
  const LABEL_RE = /\[REPQR:LABEL:([^\]]+)\]/i;
  const INTERNAL_PATTERNS = [
    '남양주시장애인복지관','사회서비스','활동지원사','활동지원팀','활동지원',
    '이용인','낮활동팀','낮활동','주간활동팀','주간활동','직업재활팀',
    '기획협력지원팀','지역융합서비스팀','운영지원팀','직원','복지관직원'
  ];

  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

  const normalizeOrg=value=>String(value||'').trim().toLowerCase()
    .replace(/[㈜]/g,'주식회사').replace(/\(주\)/g,'주식회사')
    .replace(/\s+/g,'').replace(/[·ㆍ.,]/g,'');

  const isInternalOrg=value=>{
    const n=normalizeOrg(value);
    return !n || INTERNAL_PATTERNS.some(p=>n.includes(normalizeOrg(p)));
  };

  function markerInfo(p){
    const note=String(p?.note||'');
    let m=note.match(MASTER_RE);
    if(m)return{role:'master',representativeId:m[1].toUpperCase()};
    m=note.match(MEMBER_RE);
    if(m)return{role:'member',representativeId:m[1].toUpperCase()};
    return null;
  }

  function groupLabel(rep){
    const m=String(rep?.note||'').match(LABEL_RE);
    if(!m)return'';
    try{return decodeURIComponent(m[1])}catch(_){return m[1]}
  }

  function rows(){
    try{return Array.isArray(state?.participants)?state.participants:[]}catch(_){return[]}
  }

  function manualGroups(){
    const all=rows();
    return all.filter(p=>markerInfo(p)?.role==='master').map(rep=>{
      const members=all.filter(p=>markerInfo(p)?.representativeId===String(rep.id).toUpperCase());
      return{rep,members,label:groupLabel(rep)};
    });
  }

  function autoGroups(){
    const all=rows(),manualIds=new Set();
    manualGroups().forEach(g=>g.members.forEach(p=>manualIds.add(String(p.id))));
    const map=new Map();

    all.forEach(p=>{
      if(!p||p.active===false||String(p.participationStatus||'참여')==='미참여')return;
      if(manualIds.has(String(p.id)))return;
      const org=String(p.organization||'').trim();
      if(!org||isInternalOrg(org))return;
      const key=normalizeOrg(org);
      if(!map.has(key))map.set(key,{key,organization:org,members:[]});
      map.get(key).members.push(p);
    });

    return[...map.values()].filter(g=>g.members.length>=2).map(g=>({
      ...g,
      arrived:g.members.filter(p=>p.arrived).length,
      pending:g.members.filter(p=>!p.arrived).length
    })).sort((a,b)=>b.members.length-a.members.length||a.organization.localeCompare(b.organization,'ko'));
  }

  function ensureStyles(){
    if(document.getElementById('gmCompactV2Styles'))return;
    const s=document.createElement('style');
    s.id='gmCompactV2Styles';
    s.textContent=`
      #gmGroupList{display:grid;gap:7px}
      .gmcv-divider{font-size:.76rem;font-weight:900;color:#64748b;margin:9px 2px 2px}
      .gmcv-card{border:1px solid #d9e2ef;border-radius:12px;background:#fff;overflow:hidden}
      .gmcv-head{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;
        padding:11px 12px;border:0;background:transparent;text-align:left;cursor:pointer}
      .gmcv-head:hover{background:#f8fafc}
      .gmcv-title{min-width:0}
      .gmcv-title strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#172554}
      .gmcv-title small{display:block;margin-top:2px;color:#64748b}
      .gmcv-side{display:flex;align-items:center;gap:7px;flex:none}
      .gmcv-badge{padding:4px 7px;border-radius:999px;background:#eef4ff;color:#1d4ed8;font-size:.7rem;font-weight:900}
      .gmcv-arrow{font-size:1rem;color:#64748b;transition:.15s}
      .gmcv-card.open .gmcv-arrow{transform:rotate(180deg)}
      .gmcv-body{display:none;padding:0 12px 12px;border-top:1px solid #eef2f7}
      .gmcv-card.open .gmcv-body{display:block}
      .gmcv-members{display:flex;flex-wrap:wrap;gap:6px;padding:10px 0}
      .gmcv-members span{padding:4px 8px;border-radius:999px;background:#f1f5f9;font-size:.78rem}
      .gmcv-actions{display:flex;gap:7px;flex-wrap:wrap}
      .gmcv-note{font-size:.8rem;color:#64748b;line-height:1.5;margin:2px 0 9px}
      .gmcv-auto{background:#fbfdff}
      .gm-edit-grid{display:grid;gap:12px}
      .gm-edit-members{display:flex;flex-wrap:wrap;gap:7px}
      .gm-edit-chip{display:inline-flex;align-items:center;gap:5px;padding:6px 8px;border-radius:999px;background:#eef2f7}
      .gm-edit-chip button{border:0;background:transparent;cursor:pointer;font-weight:900}
      .gm-edit-search-results{display:grid;gap:6px;max-height:220px;overflow:auto}
      .gm-edit-result{display:flex;justify-content:space-between;gap:10px;padding:9px 10px;border:1px solid #dbe3ef;
        border-radius:10px;background:#fff;cursor:pointer;text-align:left}
      @media(max-width:650px){.gmcv-head{padding:10px}.gmcv-side{gap:4px}.gmcv-badge{display:none}}
    `;
    document.head.appendChild(s);
  }

  function render(){
    const host=document.querySelector('#gmGroupList');
    if(!host)return;
    ensureStyles();

    const manual=manualGroups(),auto=autoGroups();
    const html=[];

    if(manual.length){
      html.push(`<div class="gmcv-divider">직접 지정 대표자 그룹 · ${manual.length}개</div>`);
      manual.forEach(g=>{
        const title=g.label||g.rep.organization||`${g.rep.name} 대표 그룹`;
        html.push(`
          <div class="gmcv-card" data-manual-card="${esc(g.rep.id)}">
            <button class="gmcv-head" type="button" data-toggle-card="${esc(g.rep.id)}">
              <div class="gmcv-title">
                <strong>👑 ${esc(title)}</strong>
                <small>${g.members.length}명 · 대표 ${esc(g.rep.name)}</small>
              </div>
              <div class="gmcv-side"><span class="gmcv-badge">직접 지정</span><span class="gmcv-arrow">⌄</span></div>
            </button>
            <div class="gmcv-body">
              <div class="gmcv-members">${g.members.map(p=>`<span>${esc(p.name)}${p.id===g.rep.id?' · 대표':''}</span>`).join('')}</div>
              <div class="gmcv-actions">
                <button class="button small primary" type="button" data-edit-manual="${esc(g.rep.id)}">그룹 수정</button>
                <button class="button small secondary" type="button" data-clear="${esc(g.rep.id)}">그룹 해제</button>
              </div>
            </div>
          </div>`);
      });
    }

    if(auto.length){
      html.push(`<div class="gmcv-divider">자동 기관 그룹 · ${auto.length}개</div>`);
      auto.forEach(g=>{
        html.push(`
          <div class="gmcv-card gmcv-auto">
            <button class="gmcv-head" type="button" data-toggle-auto="${esc(g.key)}">
              <div class="gmcv-title">
                <strong>🏢 ${esc(g.organization)}</strong>
                <small>${g.members.length}명 · 도착 ${g.arrived} · 미도착 ${g.pending}</small>
              </div>
              <div class="gmcv-side"><span class="gmcv-badge">대표자 미지정</span><span class="gmcv-arrow">⌄</span></div>
            </button>
            <div class="gmcv-body">
              <div class="gmcv-members">${g.members.map(p=>`<span>${esc(p.name)}${p.arrived?' · 도착':''}</span>`).join('')}</div>
              <p class="gmcv-note">이 기관은 자동 그룹입니다. 구성원 누구의 QR을 찍어도 ‘이 사람만 / 같은 기관 함께 도착’을 선택할 수 있습니다.</p>
            </div>
          </div>`);
      });
    }

    host.innerHTML=html.length?html.join(''):'<div class="empty-state compact">현재 대표자·기관 그룹이 없습니다.</div>';
  }

  function findManual(repId){return manualGroups().find(g=>String(g.rep.id)===String(repId))}

  function openEditor(repId){
    const g=findManual(repId);
    if(!g)return;
    const selected=new Set(g.members.map(p=>String(p.id)));
    let representativeId=String(g.rep.id);

    const html=()=>`
      <div class="gm-edit-grid">
        <label>그룹 표시 이름
          <input id="gmEditLabel" maxlength="80" value="${esc(g.label||g.rep.organization||'')}" placeholder="예: OO교회 / CWL">
        </label>
        <label>대표자
          <select id="gmEditRepresentative">
            ${[...selected].map(id=>{
              const p=rows().find(x=>String(x.id)===id);
              return p?`<option value="${esc(p.id)}" ${id===representativeId?'selected':''}>${esc(p.name)} · ${esc(p.phone||'')}</option>`:'';
            }).join('')}
          </select>
        </label>
        <div>
          <strong>현재 구성원 · ${selected.size}명</strong>
          <div id="gmEditMembers" class="gm-edit-members"></div>
        </div>
        <label>참가자 추가 검색
          <input id="gmEditSearch" type="search" placeholder="이름 / 연락처 / 기관">
        </label>
        <div id="gmEditSearchResults" class="gm-edit-search-results"></div>
        <div class="form-actions">
          <button id="gmEditSave" class="button primary" type="button">수정 내용 저장</button>
        </div>
      </div>`;

    openModal('대표자 그룹 수정',html());

    const refreshMembers=()=>{
      const people=[...selected].map(id=>rows().find(p=>String(p.id)===id)).filter(Boolean);
      const memberHost=document.querySelector('#gmEditMembers');
      memberHost.innerHTML=people.map(p=>`
        <span class="gm-edit-chip">${esc(p.name)}${String(p.id)===representativeId?' · 대표':''}
          <button type="button" data-remove-member="${esc(p.id)}" aria-label="${esc(p.name)} 제거">×</button>
        </span>`).join('');
      const select=document.querySelector('#gmEditRepresentative');
      select.innerHTML=people.map(p=>`<option value="${esc(p.id)}" ${String(p.id)===representativeId?'selected':''}>${esc(p.name)} · ${esc(p.phone||'')}</option>`).join('');
    };

    const search=()=>{
      const q=String(document.querySelector('#gmEditSearch')?.value||'').trim().toLowerCase();
      const host=document.querySelector('#gmEditSearchResults');
      if(!q){host.innerHTML='';return}
      const items=rows().filter(p=>{
        if(p.active===false||String(p.participationStatus||'참여')==='미참여')return false;
        if(selected.has(String(p.id)))return false;
        const mark=markerInfo(p);
        if(mark && mark.representativeId!==repId)return false;
        const hay=`${p.name||''} ${p.phone||''} ${p.organization||''}`.toLowerCase();
        return hay.includes(q);
      }).slice(0,30);

      host.innerHTML=items.map(p=>`
        <button class="gm-edit-result" type="button" data-add-member="${esc(p.id)}">
          <span><strong>${esc(p.name)}</strong><br><small>${esc(p.organization||'소속 없음')} · ${esc(p.phone||'')}</small></span>
          <b>+ 추가</b>
        </button>`).join('')||'<div class="empty-state compact">검색 결과가 없습니다.</div>';
    };

    document.querySelector('#gmEditMembers')?.addEventListener('click',e=>{
      const b=e.target.closest('[data-remove-member]');if(!b)return;
      if(selected.size<=2){showToast('대표자 그룹은 2명 이상이어야 합니다.',4000);return}
      const id=b.dataset.removeMember;
      selected.delete(id);
      if(id===representativeId)representativeId=[...selected][0]||'';
      refreshMembers();
    });

    document.querySelector('#gmEditSearch')?.addEventListener('input',search);
    document.querySelector('#gmEditSearchResults')?.addEventListener('click',e=>{
      const b=e.target.closest('[data-add-member]');if(!b)return;
      selected.add(b.dataset.addMember);
      refreshMembers();
      search();
    });
    document.querySelector('#gmEditRepresentative')?.addEventListener('change',e=>{
      representativeId=e.target.value;
      refreshMembers();
    });

    document.querySelector('#gmEditSave')?.addEventListener('click',async()=>{
      const btn=document.querySelector('#gmEditSave');
      btn.disabled=true;
      try{
        const result=await jsonpRequest('adminUpdateRepresentativeGroup',{
          representativeId:repId,
          newRepresentativeId:representativeId,
          ids:[...selected],
          label:String(document.querySelector('#gmEditLabel')?.value||'').trim()
        });
        closeModal();
        await refreshFromServer({silent:true,full:false});
        render();
        showToast(`${result.label||result.representativeName} 그룹을 수정했습니다.`,5000);
      }catch(err){
        showToast(`그룹 수정 실패: ${err.message}`,7000);
      }finally{btn.disabled=false}
    });

    refreshMembers();
  }

  function bind(){
    const host=document.querySelector('#gmGroupList');
    if(!host||host.dataset.compactV2Bound==='1')return;
    host.dataset.compactV2Bound='1';
    host.addEventListener('click',e=>{
      const toggle=e.target.closest('[data-toggle-card],[data-toggle-auto]');
      if(toggle){
        toggle.closest('.gmcv-card')?.classList.toggle('open');
        return;
      }
      const edit=e.target.closest('[data-edit-manual]');
      if(edit){openEditor(edit.dataset.editManual);return}
    });
  }

  function schedule(){
    clearTimeout(schedule.t);
    schedule.t=setTimeout(()=>{render();bind()},90);
  }

  function init(){
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(document.querySelector('#gmGroupList')){
        clearInterval(timer);schedule();
      }else if(tries>50)clearInterval(timer);
    },100);

    window.addEventListener('nyj20:participants-rendered',schedule);
    window.addEventListener('nyj20:data-updated',e=>{if(e?.detail?.view==='participants')schedule()});
    window.addEventListener('nyj20:view-changed',e=>{if(e?.detail?.view==='participants')schedule()});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();