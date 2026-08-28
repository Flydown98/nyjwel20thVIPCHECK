const IDLE_LIMIT_SECONDS=60;
const WARNING_AT_SECONDS=15;
const INVITATION_URL='../?kiosk=1';

const $=s=>document.querySelector(s);

let remaining=IDLE_LIMIT_SECONDS;
let timer=null;
let frameHooks=[];

function setRemaining(value){
  remaining=Math.max(0,Math.floor(value));
  const label=$('#idleSeconds');
  if(label)label.textContent=String(remaining);
  $('#idleWarning')?.classList.toggle(
    'hidden',
    remaining>WARNING_AT_SECONDS
  );
}

function resetIdle(){
  if($('#contentScreen')?.classList.contains('hidden'))return;
  setRemaining(IDLE_LIMIT_SECONDS);
}

function clearFrameHooks(){
  frameHooks.forEach(({target,type,handler})=>{
    try{target.removeEventListener(type,handler,true)}catch(_){}
  });
  frameHooks=[];
}

function hookFrameActivity(){
  clearFrameHooks();
  const frame=$('#invitationFrame');
  try{
    const doc=frame.contentDocument;
    const win=frame.contentWindow;
    if(!doc||!win)return;

    const events=[
      'pointerdown','pointermove','touchstart','click',
      'keydown','input','change','scroll','wheel'
    ];
    events.forEach(type=>{
      const handler=()=>resetIdle();
      const target=type==='scroll'?win:doc;
      target.addEventListener(type,handler,true);
      frameHooks.push({target,type,handler});
    });
  }catch(error){
    console.warn('iframe activity hook unavailable',error);
  }
}

function startIdleTimer(){
  clearInterval(timer);
  setRemaining(IDLE_LIMIT_SECONDS);
  timer=setInterval(()=>{
    if($('#contentScreen')?.classList.contains('hidden'))return;
    setRemaining(remaining-1);
    if(remaining<=0)returnHome();
  },1000);
}

function openInvitation(){
  $('#attractScreen')?.classList.add('hidden');
  $('#contentScreen')?.classList.remove('hidden');

  const frame=$('#invitationFrame');
  if(frame.src==='about:blank'||!frame.src.includes('?kiosk=1')){
    frame.src=INVITATION_URL;
  }
  startIdleTimer();
  resetIdle();
}

function returnHome(){
  clearInterval(timer);
  timer=null;
  clearFrameHooks();

  const frame=$('#invitationFrame');
  frame.src='about:blank';

  $('#contentScreen')?.classList.add('hidden');
  $('#attractScreen')?.classList.remove('hidden');
  $('#idleWarning')?.classList.add('hidden');
  setRemaining(IDLE_LIMIT_SECONDS);
}

$('#openInvitationButton')?.addEventListener('click',openInvitation);
$('#posterTapArea')?.addEventListener('click',openInvitation);
$('#homeButton')?.addEventListener('click',returnHome);

['pointerdown','touchstart','click','keydown'].forEach(type=>{
  document.addEventListener(type,()=>{
    if(!$('#contentScreen')?.classList.contains('hidden'))resetIdle();
  },true);
});

$('#invitationFrame')?.addEventListener('load',()=>{
  hookFrameActivity();
  resetIdle();
});

document.addEventListener('visibilitychange',()=>{
  if(document.hidden)return;
  if(!$('#contentScreen')?.classList.contains('hidden'))resetIdle();
});

// 키오스크 브라우저에서 Esc로도 초기화면 복귀
document.addEventListener('keydown',event=>{
  if(event.key==='Escape')returnHome();
});

returnHome();
