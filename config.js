window.NYJ20_CONFIG = {
  // 현재 운영용 Apps Script /exec 주소입니다. 새 배포 후 주소가 달라진 경우 이 한 줄만 교체하세요.
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbyqDm0WPM43BTwqwxvdcnKBWoFroG4iYfcxWJ4XGOHDzzI-GAXJfnawUqvs0glWD6l0/exec',
  requestTimeoutMs: 40000, // 신청·QR POST 요청용. 공개 첫 화면은 12초 direct GET 사용
  defaultAutoRefreshSeconds: 15
};

/*
 * 관리자 자동 기관 그룹 접수 addon loader v1.0
 * 공개 초대장/키오스크에는 로드하지 않고 관리자 페이지에서만 실행합니다.
 */
(() => {
  const path = String(location.pathname || '').toLowerCase();
  const isAdmin =
    path.endsWith('/admin.html') ||
    path.endsWith('/admin') ||
    path.includes('/admin.html');

  if (!isAdmin) return;

  window.addEventListener('load', () => {
    if (document.querySelector('script[data-auto-org-group-addon]')) return;
    const script = document.createElement('script');
    script.src = 'admin-auto-org-group.js?v=1.0';
    script.defer = true;
    script.dataset.autoOrgGroupAddon = '1';
    document.body.appendChild(script);
  }, { once: true });
})();
