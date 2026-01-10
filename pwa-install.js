// PWA 설치 버튼 기능
(function() {
  let deferredPrompt;
  let installButton;

  // Helper 함수들
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  function isInStandaloneMode() {
    return ('standalone' in window.navigator) && (window.navigator.standalone);
  }

  // beforeinstallprompt 이벤트 리스닝 (Android/Desktop Chrome)
  window.addEventListener('beforeinstallprompt', (e) => {
    // 기본 설치 프롬프트 방지
    e.preventDefault();

    // 나중에 사용하기 위해 이벤트 저장
    deferredPrompt = e;
  });

  // 모바일 기기 감지
  function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           window.innerWidth <= 768;
  }

  // 페이지 로드 후 즉시 버튼 표시
  function initInstallButton() {
    // 모바일이고 standalone 모드가 아닐 때만 버튼 표시
    if (isMobile() && !window.matchMedia('(display-mode: standalone)').matches && !isInStandaloneMode()) {
      showInstallButton();
    }
  }

  // React Hydration이 완료될 때까지 기다린 후 버튼 추가
  // Next.js는 클라이언트 사이드에서 DOM을 다시 렌더링하므로
  // 충분한 시간을 두고 버튼을 추가해야 합니다
  function delayedInit() {
    // React Hydration 및 초기 렌더링이 완료될 때까지 대기
    setTimeout(() => {
      initInstallButton();
    }, 2000); // 2초 대기
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', delayedInit);
  } else {
    delayedInit();
  }

  // 모달 상태 감지 - 모달이 닫히면 버튼 표시, 열리면 숨김
  let modalWasOpen = false;
  const globalModalObserver = new MutationObserver(function() {
    const modal = document.querySelector('.fixed.inset-0.z-50');
    const pwaContainer = document.getElementById('pwa-install-container');

    if (modal) {
      // 모달 열림
      modalWasOpen = true;
      if (pwaContainer) {
        pwaContainer.style.display = 'none';
      }
    } else if (modalWasOpen) {
      // 모달 닫힘 - 버튼이 없으면 생성, 있으면 표시
      modalWasOpen = false;
      if (pwaContainer) {
        pwaContainer.style.display = 'flex';
      } else if (!installButton) {
        initInstallButton();
      }
    }
  });
  globalModalObserver.observe(document.body, { childList: true, subtree: true });

  // 설치 버튼 생성 및 표시
  function showInstallButton() {
    // 이미 버튼이 있으면 중복 생성 방지
    if (installButton) return;

    // 홈 페이지에서만 작동
    if (!window.location.pathname.includes('/home')) return;

    // 모달이 열려있으면 버튼 표시하지 않음
    if (document.querySelector('.fixed.inset-0.z-50')) return;

    // 설치 버튼 생성
    installButton = document.createElement('a');
    installButton.id = 'pwa-install-btn';
    installButton.href = '/install/';
    installButton.innerHTML = `
      <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" height="14" width="14" xmlns="http://www.w3.org/2000/svg">
        <path fill="none" d="M0 0h24v24H0z"></path>
        <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"></path>
      </svg>
      <span>홈 화면에 추가</span>
    `;

    // 스타일 적용
    installButton.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      background: linear-gradient(135deg, #66ae7d 0%, #5a9d6f 100%);
      color: white;
      border: none;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
      box-shadow: 0 2px 6px rgba(102, 174, 125, 0.25);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      animation: slideInDown 0.5s ease-out;
      z-index: 50;
    `;

    // hover 효과를 위한 이벤트
    installButton.addEventListener('mouseenter', () => {
      installButton.style.transform = 'translateY(-2px)';
      installButton.style.boxShadow = '0 6px 16px rgba(102, 174, 125, 0.4)';
    });

    installButton.addEventListener('mouseleave', () => {
      installButton.style.transform = 'translateY(0)';
      installButton.style.boxShadow = '0 4px 12px rgba(102, 174, 125, 0.3)';
    });

    // 애니메이션 CSS 추가
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideInDown {
        from {
          opacity: 0;
          transform: translateY(-20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      #pwa-install-btn:active {
        transform: scale(0.98) !important;
      }
    `;
    document.head.appendChild(style);

    // header 요소 찾기
    const header = document.querySelector('header');
    if (header && header.nextSibling) {
      // 버튼을 감싸는 컨테이너 생성
      const container = document.createElement('div');
      container.id = 'pwa-install-container';
      container.style.cssText = 'display: flex; justify-content: flex-end; padding: 8px 24px; background: white;';

      // 버튼에만 pointer-events 활성화
      installButton.style.pointerEvents = 'auto';

      container.appendChild(installButton);

      // header 바로 다음에 추가
      header.parentNode.insertBefore(container, header.nextSibling);
    } else {
      // header 못 찾으면 body에 추가
      document.body.appendChild(installButton);
    }
  }

  // 설치 버튼 숨기기
  function hideInstallButton() {
    if (installButton) {
      installButton.style.animation = 'slideInUp 0.3s ease-out reverse';
      setTimeout(() => {
        if (installButton && installButton.parentNode) {
          installButton.parentNode.removeChild(installButton);
          installButton = null;
        }
      }, 300);
    }
  }

  // 간단한 토스트 알림 표시
  function showToast() {
    const toast = document.createElement('div');
    const message = isIOS()
      ? 'Safari 공유 버튼(□↑)에서 "홈 화면에 추가"를 선택하세요'
      : '브라우저 메뉴에서 "홈 화면에 추가"를 선택하세요';

    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.85);
      color: white;
      padding: 14px 24px;
      border-radius: 25px;
      font-size: 14px;
      z-index: 10000;
      max-width: 90%;
      text-align: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      animation: toastSlideIn 0.3s ease-out;
    `;

    // 애니메이션 CSS 추가
    if (!document.getElementById('toast-animation-style')) {
      const style = document.createElement('style');
      style.id = 'toast-animation-style';
      style.textContent = `
        @keyframes toastSlideIn {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
        @keyframes toastSlideOut {
          from {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
          to {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
          }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    // 3초 후 자동 제거
    setTimeout(() => {
      toast.style.animation = 'toastSlideOut 0.3s ease-out';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }

  // 앱이 이미 설치된 경우 감지
  window.addEventListener('appinstalled', () => {
    hideInstallButton();
    deferredPrompt = null;
  });
})();

// Service Worker 등록
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('Service Worker 등록 성공:', registration.scope);
      })
      .catch((error) => {
        console.log('Service Worker 등록 실패:', error);
      });
  });
}
