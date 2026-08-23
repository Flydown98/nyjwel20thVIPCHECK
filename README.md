# 남양주시장애인복지관 개관 20주년 개인 QR 접수 시스템

현재 운영 구조는 **1인 1신청 · 1인 1QR**입니다.

## 공개 초대장
- PC: https://flydown98.github.io/nyjwel20thVIPCHECK/
- 모바일도 같은 주소를 사용합니다.
- 이름/연락처 개인 신청
- 복지관 이용 여부 및 프로그램명
- 휠체어 이용 여부
- 장애인 당사자 여부
- 필요한 사항/전달사항
- 개인 QR 발급·저장
- 개인 좌석 확인
- PC/모바일 반응형 인트로

## 관리자
- https://flydown98.github.io/nyjwel20thVIPCHECK/admin
- Google Apps Script + Google Sheets 중앙 저장
- 개인 참가자 검색/수정
- QR 현장 체크인
- 450석 좌석배치도
- VIP 지정석 24석
- 휠체어 접근성 기본 좌석 15석
- 좌석번호 기반 행운추첨
- QR 스캔 당첨확인 및 상품 수령완료 기록

## 영상 파일
GitHub `assets` 폴더:
- `intro.mp4` — PC/가로 인트로
- `intro_mobile.mp4` — 휴대폰 세로 인트로
- `20th_trailer.mp4` — 초대장 중간 행사 예고편

영상 파일이 없거나 재생 오류가 발생해도 초대장 본문은 이용할 수 있도록 구성되어 있습니다.

## 서버
`config.js`의 Apps Script `/exec` 주소가 실제 최신 배포 주소와 일치해야 합니다.

## 중요
관리자 비밀번호는 GitHub가 아니라 Apps Script `Code.gs`의 `ADMIN_LOGIN_CONFIG`에서만 설정합니다.
`Code.gs`는 GitHub에 올리지 않습니다.
