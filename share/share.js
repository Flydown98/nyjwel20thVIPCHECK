const KAKAO_JAVASCRIPT_KEY="df612804c7b5f3fc808fa285cf0445a3";
const CARD_URL="https://flydown98.github.io/nyjwel20thVIPCHECK/invite-card/";
const MAIN_URL="https://flydown98.github.io/nyjwel20thVIPCHECK/";
const OG_IMAGE_URL="https://flydown98.github.io/nyjwel20thVIPCHECK/assets/invitation_share_og.png";

const defaultMessage=`안녕하세요.
남양주시장애인복지관 개관 20주년 기념행사에 초대합니다.

스무 번의 계절, 스물한 번째 약속
📅 2026. 9. 17. (목) 13:30
📍 남양주시금곡실내체육관

아래 모바일 초대장에서 행사 안내 및 참가 신청을 확인해 주세요.`;

const $=s=>document.querySelector(s);
const toast=msg=>{const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>el.classList.remove('show'),2400);};
async function copyText(text){try{await navigator.clipboard.writeText(text);return true;}catch(_){const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();return true;}}
function setKakaoStatus(message,type=''){const el=$('#kakaoStatus');if(!el)return;el.textContent=message;el.className='kakao-status'+(type?' '+type:'');}
function initializeKakao(){try{if(!window.Kakao){setKakaoStatus('카카오 SDK를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.','error');return false;}if(!Kakao.isInitialized())Kakao.init(KAKAO_JAVASCRIPT_KEY);if(Kakao.isInitialized()){setKakaoStatus('✓ 카카오톡 카드 공유 준비 완료','ready');return true;}}catch(error){console.error(error);setKakaoStatus('카카오톡 공유 초기화에 실패했습니다. 도메인 설정을 확인해 주세요.','error');}return false;}
function sendKakaoInvitation(){if(!initializeKakao()){toast('카카오톡 공유를 준비하지 못했습니다.');return;}try{Kakao.Share.sendDefault({
  objectType:'feed',
  content:{
    title:'남양주시장애인복지관 개관 20주년 기념행사',
    description:'스무 번의 계절, 스물한 번째 약속\n2026. 9. 17. (목) 13:30 · 남양주시금곡실내체육관',
    imageUrl:OG_IMAGE_URL,
    imageWidth:1200,
    imageHeight:630,
    link:{mobileWebUrl:CARD_URL,webUrl:CARD_URL}
  },
  buttons:[
    {title:'모바일 초대장 확인하기',link:{mobileWebUrl:CARD_URL,webUrl:CARD_URL}},
    {title:'행사 안내 · 참가 신청',link:{mobileWebUrl:MAIN_URL,webUrl:MAIN_URL}}
  ]
});}catch(error){console.error(error);toast('카카오톡 카드 공유를 시작하지 못했습니다.');}}
async function shareInvitationFallback(){const text=$('#shareMessage').value.trim()||defaultMessage;if(navigator.share){try{await navigator.share({title:'남양주시장애인복지관 개관 20주년 기념행사',text,url:CARD_URL});return;}catch(error){if(error?.name==='AbortError')return;}}await copyText(text+'\n\n'+CARD_URL);toast('공유 문구와 링크를 복사했습니다.');}
$('#kakaoShareButton')?.addEventListener('click',sendKakaoInvitation);
$('#shareButton')?.addEventListener('click',shareInvitationFallback);
$('#copyButton')?.addEventListener('click',async()=>{await copyText(CARD_URL);toast('초대장 링크를 복사했습니다.');});
$('#copyMessageButton')?.addEventListener('click',async()=>{await copyText($('#shareMessage').value.trim()+'\n\n'+CARD_URL);toast('공유 문구를 복사했습니다.');});
$('#qrButton')?.addEventListener('click',()=>$('#qrBox').classList.toggle('show'));
$('#shareMessage').value=defaultMessage;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(initializeKakao,50));else setTimeout(initializeKakao,50);
