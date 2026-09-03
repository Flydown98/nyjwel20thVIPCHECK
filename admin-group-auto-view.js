'use strict';

(() => {
  const MASTER_RE=/\[REPQR:MASTER:([A-Z0-9_-]+)\]/i;
  const MEMBER_RE=/\[REPQR:MEMBER:([A-Z0-9_-]+)\]/i;
  const LABEL_RE=/\[REPQR:LABEL:([^\]]+)\]/i;
  const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

  const rows=()=>{try{return state.participants||[]}catch(_){return[]}};

  function markerInfo(p){
    const note=String(p?.note||'');
    let m=note.match(MASTER_RE);
    if(m)return{role:'master',representativeId:m[1].toUpperCase()};
    m=note.match(MEMBER_RE);
    if(m)return{role:'member',representativeId:m[1].toUpperCase()};
    return null;
  }

  function labelOf(rep){
    const m=String(rep?.note||'').match(LABEL_RE);
    if(!m)return'';
    try{return decodeURIComponent(m[1])}catch(_){return m[1]}
  }

  function manualGroups(){
    const all=rows();
    return all.filter(p=>markerInfo(p)?.role==='master').map(rep=>({
      rep,
      label:labelOf(rep),
      members:all.filter(p=>markerInfo(p)?.representativeId===String(rep.id).toUpperCase())
    }));
  }

  function autoGroups(){
    try{return window.NYJ20_AUTO_ORG?.getGroups?.()||[]}catch(_){return[]}
  }

  function ensureStyles(){
    if(document.getElementById('groupCompact83Style'))return;
    const s=document.createElement('style');
    s.id='groupCompact83Style';
    s.textContent=`
      #gmGroupList{display:grid;gap:7px}
      .g83-divider{margin:10px 2px 3px;font-size:.77rem;font-weight:900;color:#64748b}
      .g83-card{border:1px solid #d9e2ef;border-radius:12px;background:#fff;overflow:hidden}
      .g83-head{width:100%;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 12px;border:0;background:#fff;text-align:left;cursor:pointer}
      .g83-head:hover{background:#f8fafc}
      .g83-title{min-width:0}.g83-title strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#172554}
      .g83-title small{display:block;color:#64748b;margin-top:2px}
      .g83-arrow{font-weight:900;color:#64748b}.g83-card.open .g83-arrow{transform:rotate(180deg)}
      .g83-body{display:none;border-top:1px solid #eef2f7;padding:10px 12px 12px}.g83-card.open .g83-body{display:block}
      .g83-members{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}.g83-members span{padding:5px 8px;border-radius:999px;background:#f1f5f9;font-size:.78rem}
      .g83-actions{display:flex;gap:7px;flex-wrap:wrap}
      .g83-auto{background:#fbfdff}.g83-badge{font-size:.7rem;font-weight:900;padding:4px 7px;border-radius:999px;background:#eef4ff;color:#1d4ed8}
      .g83-editor{display:grid;gap:12px}.g83-edit-members{display:flex;flex-wrap:wrap;gap:7px}
      .g83-chip{display:inline-flex;align-items:center;gap:5px;padding:6px 8px;border-radius:999px;background:#eef2f7}
      .g83-chip button{border:0;background:transparent;font-weight:900;cursor:pointer}
      .g83-search-results{display:grid;gap:6px;max-height:230px;overflow:auto}
      .g83-result{display:flex;justify-content:space-between;gap:10px;padding:9px;border:1px solid #dbe3ef;border-radius:10px;background:#fff;cursor:pointer;text-align:left}
    `;
    document.head.appendChild(s);
  }

  function render(){
    const host=document.querySelector('#gmGroupList');
    if(!host)return;
    ensureStyles();

    const manual=manualGroups();
    const auto=autoGroups();
    const html=[];

    if(manual.length){
      html.push(`<div class="g83-divider">직접 지정 대표자 그룹 · ${manual.length}개</div>`);
      manual.forEach(g=>{
        const title=g.label||g.rep.organization||`${g.rep.name} 대표 그룹`;
        html.push(`<div class="g83-card">
          <button class="g83-head" type="button" data-toggle-group>
            <div class="g83-title"><strong>👑 ${esc(title)}</strong><small>${g.members.length}명 · 대표 ${esc(g.rep.name)}</small></div>
            <span class="g83-arrow">⌄</span>
          </button>
          <div class="g83-body">
            <div class="g83-members">${g.members.map(p=>`<span>${esc(p.name)}${p.id===g.rep.id?' · 대표':''}</span>`).join('')}</div>
            <div class="g83-actions">
              <button type="button" class="button small primary" data-edit-manual="${esc(g.rep.id)}">그룹 수정</button>
              <button type="button" class="button small secondary" data-clear="${esc(g.rep.id)}">그룹 해제</button>
            </div>
          </div>
        </div>`);
      });
    }

    if(auto.length){
      html.push(`<div class="g83-divider">자동 기관 그룹 · ${auto.length}개</div>`);
      auto.forEach(g=>{
        html.push(`<div class="g83-card g83-auto">
          <button class="g83-head" type="button" data-toggle-group>
            <div class="g83-title"><strong>🏢 ${esc(g.organization)}</strong><small>${g.members.length}명 · 도착 ${g.arrivedCount} · 미도착 ${g.pendingCount}</small></div>
            <span class="g83-badge">${g.override?'수정됨':'자동'}</span><span class="g83-arrow">⌄</span>
          </button>
          <div class="g83-body">
            <div class="g83-members">${g.members.map(p=>`<span>${esc(p.name)}${p.arrived?' · 도착':''}</span>`).join('')}</div>
            <div class="g83-actions">
              <button type="button" class="button small primary" data-edit-auto="${esc(g.key)}">기관 그룹 수정</button>
              ${g.override?`<button type="button" class="button small secondary" data-reset-auto="${esc(g.key)}">자동구성으로 되돌리기</button>`:''}
            </div>
          </div>
        </div>`);
      });
    }

    host.innerHTML=html.length?html.join(''):'<div class="empty-state compact">현재 대표자·기관 그룹이 없습니다.</div>';
  }

  function openManualEditor(repId){
    const g=manualGroups().find(x=>String(x.rep.id)===String(repId));
    if(!g)return;
    const selected=new Set(g.members.map(p=>String(p.id)));
    let representativeId=String(g.rep.id);

    openModal('대표자 그룹 수정',`
      <div class="g83-editor">
        <label>그룹 표시 이름<input id="g83ManualLabel" value="${esc(g.label||g.rep.organization||'')}" maxlength="80"></label>
        <label>대표자<select id="g83ManualRep"></select></label>
        <div><strong>구성원</strong><div id="g83ManualMembers" class="g83-edit-members"></div></div>
        <label>참가자 추가 검색<input id="g83ManualSearch" type="search" placeholder="이름 / 연락처 / 기관"></label>
        <div id="g83ManualResults" class="g83-search-results"></div>
        <button id="g83ManualSave" class="button primary" type="button">수정 내용 저장</button>
      </div>`);

    const refresh=()=>{
      const people=[...selected].map(id=>rows().find(p=>String(p.id)===id)).filter(Boolean);
      $('#g83ManualMembers').innerHTML=people.map(p=>`<span class="g83-chip">${esc(p.name)}${String(p.id)===representativeId?' · 대표':''}<button data-remove-manual="${esc(p.id)}">×</button></span>`).join('');
      $('#g83ManualRep').innerHTML=people.map(p=>`<option value="${esc(p.id)}" ${String(p.id)===representativeId?'selected':''}>${esc(p.name)}</option>`).join('');
    };
    const search=()=>{
      const q=String($('#g83ManualSearch')?.value||'').trim().toLowerCase();
      if(!q){$('#g83ManualResults').innerHTML='';return}
      const found=rows().filter(p=>{
        if(selected.has(String(p.id)))return false;
        const mark=markerInfo(p);
        if(mark&&mark.representativeId!==repId)return false;
        return `${p.name||''} ${p.phone||''} ${p.organization||''}`.toLowerCase().includes(q);
      }).slice(0,30);
      $('#g83ManualResults').innerHTML=found.map(p=>`<button class="g83-result" data-add-manual="${esc(p.id)}"><span><strong>${esc(p.name)}</strong><br><small>${esc(p.organization||'소속 없음')}</small></span><b>+ 추가</b></button>`).join('');
    };

    $('#g83ManualMembers').onclick=e=>{
      const b=e.target.closest('[data-remove-manual]');if(!b)return;
      if(selected.size<=2)return showToast('대표자 그룹은 2명 이상이어야 합니다.',4000);
      selected.delete(b.dataset.removeManual);
      if(b.dataset.removeManual===representativeId)representativeId=[...selected][0]||'';
      refresh();
    };
    $('#g83ManualSearch').oninput=search;
    $('#g83ManualResults').onclick=e=>{
      const b=e.target.closest('[data-add-manual]');if(!b)return;
      selected.add(b.dataset.addManual);refresh();search();
    };
    $('#g83ManualRep').onchange=e=>{representativeId=e.target.value;refresh()};
    $('#g83ManualSave').onclick=async()=>{
      try{
        await jsonpRequest('adminUpdateRepresentativeGroup',{
          representativeId:repId,newRepresentativeId:representativeId,
          ids:[...selected],label:String($('#g83ManualLabel').value||'').trim()
        });
        closeModal();await refreshFromServer({silent:true,full:false});render();
        showToast('대표자 그룹을 수정했습니다.',5000);
      }catch(e){showToast(`그룹 수정 실패: ${e.message}`,7000)}
    };
    refresh();
  }

  function openAutoEditor(key){
    const g=autoGroups().find(x=>x.key===key);
    if(!g)return;
    const selected=new Set(g.members.map(p=>String(p.id)));

    openModal('자동 기관 그룹 수정',`
      <div class="g83-editor">
        <label>기관/그룹 표시 이름<input id="g83AutoLabel" value="${esc(g.organization)}" maxlength="80"></label>
        <div><strong>현재 구성원 · <span id="g83AutoCount">${selected.size}</span>명</strong><div id="g83AutoMembers" class="g83-edit-members"></div></div>
        <label>참가자 추가 검색<input id="g83AutoSearch" type="search" placeholder="이름 / 연락처 / 기관"></label>
        <div id="g83AutoResults" class="g83-search-results"></div>
        <button id="g83AutoSave" class="button primary" type="button">기관 그룹 수정 저장</button>
      </div>`);

    const refresh=()=>{
      const people=[...selected].map(id=>rows().find(p=>String(p.id)===id)).filter(Boolean);
      $('#g83AutoCount').textContent=people.length;
      $('#g83AutoMembers').innerHTML=people.map(p=>`<span class="g83-chip">${esc(p.name)}<button data-remove-auto="${esc(p.id)}">×</button></span>`).join('');
    };
    const search=()=>{
      const q=String($('#g83AutoSearch')?.value||'').trim().toLowerCase();
      if(!q){$('#g83AutoResults').innerHTML='';return}
      const found=rows().filter(p=>
        !selected.has(String(p.id))&&
        `${p.name||''} ${p.phone||''} ${p.organization||''}`.toLowerCase().includes(q)
      ).slice(0,30);
      $('#g83AutoResults').innerHTML=found.map(p=>`<button class="g83-result" data-add-auto="${esc(p.id)}"><span><strong>${esc(p.name)}</strong><br><small>${esc(p.organization||'소속 없음')}</small></span><b>+ 추가</b></button>`).join('');
    };

    $('#g83AutoMembers').onclick=e=>{
      const b=e.target.closest('[data-remove-auto]');if(!b)return;
      if(selected.size<=2)return showToast('기관 그룹은 2명 이상이어야 합니다.',4000);
      selected.delete(b.dataset.removeAuto);refresh();
    };
    $('#g83AutoSearch').oninput=search;
    $('#g83AutoResults').onclick=e=>{
      const b=e.target.closest('[data-add-auto]');if(!b)return;
      selected.add(b.dataset.addAuto);refresh();search();
    };
    $('#g83AutoSave').onclick=async()=>{
      try{
        await window.NYJ20_AUTO_ORG.saveOverride(
          key,String($('#g83AutoLabel').value||'').trim(),[...selected]
        );
        closeModal();render();
        showToast('자동 기관 그룹을 수정했습니다.',5000);
      }catch(e){showToast(`기관 그룹 수정 실패: ${e.message}`,7000)}
    };
    refresh();
  }

  function bind(){
    const host=document.querySelector('#gmGroupList');
    if(!host||host.dataset.g83bound==='1')return;
    host.dataset.g83bound='1';
    host.addEventListener('click',async e=>{
      const toggle=e.target.closest('[data-toggle-group]');
      if(toggle){toggle.closest('.g83-card')?.classList.toggle('open');return}
      const manual=e.target.closest('[data-edit-manual]');
      if(manual){openManualEditor(manual.dataset.editManual);return}
      const auto=e.target.closest('[data-edit-auto]');
      if(auto){openAutoEditor(auto.dataset.editAuto);return}
      const reset=e.target.closest('[data-reset-auto]');
      if(reset){
        if(!confirm('수정한 기관 그룹을 원래 기관명 자동구성으로 되돌릴까요?'))return;
        await window.NYJ20_AUTO_ORG.resetOverride(reset.dataset.resetAuto);
        render();showToast('자동 구성으로 되돌렸습니다.');
      }
    });
  }

  function schedule(){clearTimeout(schedule.t);schedule.t=setTimeout(()=>{render();bind()},100)}

  function init(){
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(document.querySelector('#gmGroupList')){clearInterval(timer);schedule()}
      else if(tries>50)clearInterval(timer);
    },100);
    window.addEventListener('nyj20:auto-org-updated',schedule);
    window.addEventListener('nyj20:participants-rendered',schedule);
    window.addEventListener('nyj20:view-changed',e=>{if(e?.detail?.view==='participants')schedule()});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();