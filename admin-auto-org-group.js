'use strict';

(() => {
  const STORAGE_DISABLED='nyj20_auto_org_group_disabled_v2';
  const INTERNAL_PATTERNS=[
    '남양주시장애인복지관','사회서비스','활동지원사','활동지원팀','활동지원',
    '이용인','낮활동팀','낮활동','주간활동팀','주간활동','직업재활팀',
    '기획협력지원팀','지역융합서비스팀','운영지원팀','직원','복지관직원'
  ];

  let overrides={};

  const digits=v=>String(v||'').replace(/\D/g,'');
  const normalizeOrg=value=>String(value||'').trim().toLowerCase()
    .replace(/[㈜]/g,'주식회사').replace(/\(주\)/g,'주식회사')
    .replace(/\s+/g,'').replace(/[·ㆍ.,]/g,'');

  const isInternalOrg=value=>{
    const n=normalizeOrg(value);
    if(!n)return true;
    return INTERNAL_PATTERNS.some(p=>n.includes(normalizeOrg(p)));
  };

  function activeRows(){
    try{
      return (state.participants||[]).filter(p=>
        p&&p.active!==false&&String(p.participationStatus||'참여')!=='미참여'
      );
    }catch(_){return[]}
  }

  function disabledKeys(){
    try{return new Set(JSON.parse(localStorage.getItem(STORAGE_DISABLED)||'[]'))}
    catch(_){return new Set()}
  }

  function buildBase(){
    const map=new Map();
    activeRows().forEach(p=>{
      const org=String(p.organization||'').trim();
      if(!org||isInternalOrg(org))return;
      const key=normalizeOrg(org);
      if(!map.has(key))map.set(key,{key,organization:org,members:[]});
      map.get(key).members.push(p);
    });
    return map;
  }

  function buildCandidateGroups(){
    const base=buildBase();
    const allRows=activeRows();
    const byId={};
    allRows.forEach(p=>byId[p.id]=p);
    const disabled=disabledKeys();
    const result=[];

    base.forEach((g,key)=>{
      const ov=overrides[key];
      if(ov&&ov.hidden===true)return;

      let members=g.members;
      let label=g.organization;

      if(ov&&Array.isArray(ov.ids)){
        members=ov.ids.map(id=>byId[id]).filter(Boolean);
        label=String(ov.label||label);
      }

      if(members.length<2)return;
      const phones=[...new Set(members.map(p=>digits(p.phone)).filter(Boolean))];
      result.push({
        key,
        organization:label,
        sourceOrganization:g.organization,
        members,
        override:Boolean(ov),
        disabled:disabled.has(key),
        commonPhone:phones.length===1?phones[0]:'',
        phoneCount:phones.length,
        arrivedCount:members.filter(p=>p.arrived).length,
        pendingCount:members.filter(p=>!p.arrived).length
      });
    });

    // override에 추가된 사람이 원래 기관명 그룹에 없어도 표시
    Object.entries(overrides).forEach(([key,ov])=>{
      if(ov&&ov.hidden===true)return;
      if(result.some(g=>g.key===key))return;
      const members=(ov.ids||[]).map(id=>byId[id]).filter(Boolean);
      if(members.length<2)return;
      result.push({
        key,
        organization:String(ov.label||'기관 그룹'),
        sourceOrganization:'',
        members,
        override:true,
        disabled:disabled.has(key),
        commonPhone:'',
        phoneCount:new Set(members.map(p=>digits(p.phone)).filter(Boolean)).size,
        arrivedCount:members.filter(p=>p.arrived).length,
        pendingCount:members.filter(p=>!p.arrived).length
      });
    });

    return result.sort((a,b)=>
      b.members.length-a.members.length||
      a.organization.localeCompare(b.organization,'ko')
    );
  }

  function groupForParticipant(p){
    if(!p)return null;
    return buildCandidateGroups().find(g=>
      !g.disabled&&g.members.some(m=>m.id===p.id)
    )||null;
  }

  async function reloadOverrides(){
    try{
      const r=await jsonpRequest('adminGetAutoOrgGroups',{});
      overrides=r?.overrides&&typeof r.overrides==='object'?r.overrides:{};
    }catch(_){overrides={}}
    window.dispatchEvent(new CustomEvent('nyj20:auto-org-updated'));
    return overrides;
  }

  async function saveOverride(key,label,ids){
    const r=await jsonpRequest('adminSaveAutoOrgGroup',{key,label,ids});
    await reloadOverrides();
    return r;
  }

  async function resetOverride(key){
    const r=await jsonpRequest('adminResetAutoOrgGroup',{key});
    await reloadOverrides();
    return r;
  }

  async function deleteGroup(key,label){
    const r=await jsonpRequest('adminDeleteAutoOrgGroup',{key,label});
    await reloadOverrides();
    return r;
  }

  function resolveParticipant(input){
    if(input&&typeof input==='object'&&input.id){
      return activeRows().find(p=>p.id===input.id)||input;
    }
    let code=String(input||'').trim();
    try{if(typeof parseQrPayload==='function')code=parseQrPayload(code)}catch(_){}
    code=String(code||'').trim().toUpperCase();
    return activeRows().find(p=>String(p.id||'').toUpperCase()===code)||null;
  }

  function ask(group,person){
    const pending=group.members.filter(p=>!p.arrived);
    if(pending.length<=1)return Promise.resolve('single');

    return new Promise(resolve=>{
      const back=document.createElement('div');
      back.style.cssText='position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,.7);display:flex;align-items:center;justify-content:center;padding:20px';
      back.innerHTML=`
        <section style="width:min(600px,100%);background:#fff;border-radius:20px;padding:24px;max-height:90vh;overflow:auto">
          <p style="margin:0 0 6px;color:#1d4ed8;font-weight:900">기관 그룹 확인</p>
          <h2 style="margin:0 0 8px">${person.name} 님 QR 확인</h2>
          <p><strong>${group.organization}</strong> 그룹입니다. 이 사람만 처리할지 함께 도착 처리할지 선택하세요.</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin:15px 0">
            ${group.members.map(p=>`<span style="padding:6px 9px;border-radius:999px;background:#f1f5f9">${p.name}${p.arrived?' · 도착':''}</span>`).join('')}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1.2fr;gap:10px">
            <button type="button" data-aog-choice="single" style="min-height:62px;border-radius:14px;border:2px solid #174ea6;background:#fff;color:#174ea6;font-weight:900">이 사람만 도착</button>
            <button type="button" data-aog-choice="group" style="min-height:62px;border-radius:14px;border:0;background:#174ea6;color:#fff;font-weight:900">같은 기관 함께 도착</button>
          </div>
        </section>`;
      document.body.appendChild(back);
      back.addEventListener('click',e=>{
        const b=e.target.closest('[data-aog-choice]');
        if(!b)return;
        const v=b.dataset.aogChoice;back.remove();resolve(v);
      });
    });
  }

  async function checkGroup(group,scanned){
    const pending=group.members.filter(p=>!p.arrived);
    const success=[],failed=[];
    for(const member of pending){
      try{
        const r=await jsonpRequest('checkIn',{code:member.id});
        if(r?.participant&&typeof updateCache==='function')updateCache(r.participant);
        success.push(r?.participant||member);
      }catch(e){failed.push({member,error:e})}
    }
    if(typeof refreshFieldStats==='function')refreshFieldStats();
    window.dispatchEvent(new CustomEvent('nyj20:auto-org-updated'));
    showToast?.(
      `${group.organization} ${success.length}명 함께 도착 처리`+
      (failed.length?` · ${failed.length}명 확인 필요`:''),
      6500
    );
    return{group:true,success,failed};
  }

  function installWrapper(){
    if(typeof checkIn!=='function'||checkIn.__aogV83)return false;
    const original=checkIn;
    const wrapped=async function(input){
      const p=resolveParticipant(input);
      const group=groupForParticipant(p);
      if(!p||!group||group.pendingCount<=1)return original(input);

      const choice=await ask(group,p);
      if(choice==='group')return checkGroup(group,p);
      return original(input);
    };
    wrapped.__aogV83=true;
    checkIn=wrapped;
    try{window.checkIn=wrapped}catch(_){}
    return true;
  }

  async function init(){
    // 상단 자동 기관 그룹 후보 패널은 더 이상 만들지 않습니다.
    await reloadOverrides();

    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      if(installWrapper()||tries>40)clearInterval(timer);
    },250);

    window.addEventListener('nyj20:auto-org-refresh',()=>reloadOverrides());
    window.addEventListener('nyj20:data-updated',e=>{
      if(e?.detail?.view==='participants'){
        window.dispatchEvent(new CustomEvent('nyj20:auto-org-updated'));
      }
    });
  }

  window.NYJ20_AUTO_ORG={
    getGroups:buildCandidateGroups,
    reload:reloadOverrides,
    saveOverride,
    resetOverride,
    deleteGroup
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();