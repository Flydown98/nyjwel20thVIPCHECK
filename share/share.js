const CONFIG=window.NYJ20_KAKAO_SHARE||{};
const KAKAO_JAVASCRIPT_KEY=String(CONFIG.javascriptKey||"df612804c7b5f3fc808fa285cf0445a3");
const KAKAO_TEMPLATE_ID=Number(CONFIG.templateId||0);
const MAIN_URL=String(CONFIG.invitationUrl||"https://flydown98.github.io/nyjwel20thVIPCHECK/");
const IMAGE_URL=String(CONFIG.imageUrl||"https://flydown98.github.io/nyjwel20thVIPCHECK/assets/kakao_invitation_card_3x4.jpg");

const defaultMessage=`남양주시장애인복지관 개관 20주년 기념행사에 초대합니다.

스무 번의 계절, 스물한 번째 약속
2026. 9. 17. (목) 13:30
남양주시금곡실내체육관`;

const $=s=>document.querySelector(s);
const toast=msg=>{
  const el=$('#toast');if(!el)return;
  el.textContent=msg;el.classList.add('show');
  clearTimeout(window.__toast);
  window.__toast=setTimeout(()=>el.classList.remove('show'),2500);
};
async function copyText(text){
  try{await navigator.clipboard.writeText(text);return true;}
  catch(_){const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();return true;}
}
function setKakaoStatus(message,type=''){
  const el=$('#kakaoStatus');if(!el)return;
  el.textContent=message;el.className='kakao-status'+(type?' '+type:'');
}
function initializeKakao(){
  try{
    if(!window.Kakao){
      setKakaoStatus('카카오 SDK를 불러오지 못했습니다.','error');
      return false;
    }
    if(!Kakao.isInitialized())Kakao.init(KAKAO_JAVASCRIPT_KEY);
    if(Kakao.isInitialized()){
      setKakaoStatus(
        KAKAO_TEMPLATE_ID>0
          ?'✓ 사용자 정의 초대장 카드 준비 완료'
          :'✓ 다이렉트 초대장 카드 준비 완료',
        'ready'
      );
      return true;
    }
  }catch(error){
    console.error(error);
    setKakaoStatus('카카오 초기화 실패 · SDK 도메인을 확인해 주세요.','error');
  }
  return false;
}

function sendKakaoInvitation(){
  if(!initializeKakao())return;

  try{
    // Template ID를 넣으면 Kakao Developers에서 만든 이미지 중심 사용자 정의 템플릿 사용.
    if(KAKAO_TEMPLATE_ID>0){
      Kakao.Share.sendCustom({
        templateId:KAKAO_TEMPLATE_ID,
        templateArgs:{
          invite_url:MAIN_URL,
          image_url:IMAGE_URL
        }
      });
      return;
    }

    // Template ID가 없어도 바로 테스트 가능한 최소 Feed 카드.
    // 중요: 이미지 클릭과 버튼 모두 실제 메인 초대장으로 바로 이동.
    Kakao.Share.sendDefault({
      objectType:'feed',
      content:{
        title:'남양주시장애인복지관 개관 20주년 초대장',
        description:'스무 번의 계절, 스물한 번째 약속',
        imageUrl:IMAGE_URL,
        imageWidth:600,
        imageHeight:800,
        link:{
          mobileWebUrl:MAIN_URL,
          webUrl:MAIN_URL
        }
      },
      buttons:[{
        title:'모바일 초대장 확인하기',
        link:{
          mobileWebUrl:MAIN_URL,
          webUrl:MAIN_URL
        }
      }]
    });
  }catch(error){
    console.error(error);
    toast('카카오톡 카드 공유를 시작하지 못했습니다.');
  }
}

async function shareOtherApps(){
  const text=$('#shareMessage')?.value.trim()||defaultMessage;
  if(navigator.share){
    try{
      await navigator.share({title:'남양주시장애인복지관 개관 20주년 초대장',text,url:MAIN_URL});
      return;
    }catch(error){if(error?.name==='AbortError')return;}
  }
  await copyText(text+'\n\n'+MAIN_URL);
  toast('문구와 초대장 링크를 복사했습니다.');
}

$('#kakaoShareButton')?.addEventListener('click',sendKakaoInvitation);
$('#shareButton')?.addEventListener('click',shareOtherApps);
$('#copyButton')?.addEventListener('click',async()=>{await copyText(MAIN_URL);toast('초대장 링크를 복사했습니다.');});
$('#copyMessageButton')?.addEventListener('click',async()=>{await copyText(($('#shareMessage')?.value.trim()||defaultMessage)+'\n\n'+MAIN_URL);toast('문구와 링크를 복사했습니다.');});
$('#qrButton')?.addEventListener('click',()=>$('#qrBox')?.classList.toggle('show'));
if($('#shareMessage'))$('#shareMessage').value=defaultMessage;

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(initializeKakao,80));
else setTimeout(initializeKakao,80);
