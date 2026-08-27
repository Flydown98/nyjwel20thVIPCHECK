const CARD_URL="https://flydown98.github.io/nyjwel20thVIPCHECK/invite-card/";
const defaultMessage=`안녕하세요.
남양주시장애인복지관 개관 20주년 기념행사에 초대합니다.

스무 번의 계절, 스물한 번째 약속
📅 2026. 9. 17. (목) 13:30
📍 남양주시금곡실내체육관

아래 모바일 초대장에서 행사 안내 및 참가 신청을 확인해 주세요.`;

const $=s=>document.querySelector(s);
const toast=(msg)=>{
  const el=$('#toast'); el.textContent=msg; el.classList.add('show');
  clearTimeout(window.__toast); window.__toast=setTimeout(()=>el.classList.remove('show'),2200);
};

async function copyText(text){
  try{await navigator.clipboard.writeText(text);return true;}
  catch(_){
    const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);
    ta.select();document.execCommand('copy');ta.remove();return true;
  }
}

async function shareInvitation(){
  const text=$('#shareMessage').value.trim()||defaultMessage;
  if(navigator.share){
    try{
      await navigator.share({
        title:'남양주시장애인복지관 개관 20주년 기념행사',
        text,
        url:CARD_URL
      });
      return;
    }catch(error){
      if(error?.name==='AbortError')return;
    }
  }
  await copyText(text+'\n\n'+CARD_URL);
  toast('공유 문구와 링크를 복사했습니다.');
}

$('#shareButton').addEventListener('click',shareInvitation);
$('#copyButton').addEventListener('click',async()=>{await copyText(CARD_URL);toast('초대장 링크를 복사했습니다.');});
$('#copyMessageButton').addEventListener('click',async()=>{await copyText($('#shareMessage').value.trim()+'\n\n'+CARD_URL);toast('공유 문구를 복사했습니다.');});
$('#qrButton').addEventListener('click',()=>$('#qrBox').classList.toggle('show'));
$('#shareMessage').value=defaultMessage;
