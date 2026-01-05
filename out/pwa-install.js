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

  // 페이지 로드 후 즉시 버튼 표시
  function initInstallButton() {
    // 이미 standalone 모드로 실행 중이 아니면 버튼 표시
    if (!window.matchMedia('(display-mode: standalone)').matches && !isInStandaloneMode()) {
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

  // 설치 버튼 생성 및 표시
  function showInstallButton() {
    // 이미 버튼이 있으면 중복 생성 방지
    if (installButton) return;

    // 설치 버튼 생성
    installButton = document.createElement('button');
    installButton.id = 'pwa-install-btn';
    installButton.innerHTML = `
      <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" height="20" width="20" xmlns="http://www.w3.org/2000/svg">
        <path fill="none" d="M0 0h24v24H0z"></path>
        <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"></path>
      </svg>
      <span>홈 화면에 추가</span>
    `;

    // 스타일 적용
    installButton.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 9999;
      background: linear-gradient(135deg, #66ae7d 0%, #5a9d6f 100%);
      color: white;
      border: none;
      border-radius: 50px;
      padding: 12px 24px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(102, 174, 125, 0.4), 0 2px 8px rgba(0, 0, 0, 0.15);
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      animation: slideInUp 0.5s ease-out;
    `;

    // hover 효과를 위한 이벤트
    installButton.addEventListener('mouseenter', () => {
      installButton.style.transform = 'translateY(-2px)';
      installButton.style.boxShadow = '0 6px 24px rgba(102, 174, 125, 0.5), 0 4px 12px rgba(0, 0, 0, 0.2)';
    });

    installButton.addEventListener('mouseleave', () => {
      installButton.style.transform = 'translateY(0)';
      installButton.style.boxShadow = '0 4px 20px rgba(102, 174, 125, 0.4), 0 2px 8px rgba(0, 0, 0, 0.15)';
    });

    // 클릭 이벤트
    installButton.addEventListener('click', async () => {
      if (deferredPrompt) {
        // beforeinstallprompt가 있는 경우 자동 설치
        deferredPrompt.prompt();

        // 사용자의 선택 대기
        const { outcome } = await deferredPrompt.userChoice;

        console.log(`사용자 선택: ${outcome}`);

        // 프롬프트는 한 번만 사용 가능
        deferredPrompt = null;

        if (outcome === 'accepted') {
          hideInstallButton();
        }
      } else {
        // beforeinstallprompt가 없는 경우 수동 설치 안내
        showInstallInstructions();
      }
    });

    // 애니메이션 CSS 추가
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideInUp {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      #pwa-install-btn:active {
        transform: scale(0.95) !important;
      }

      @media (max-width: 768px) {
        #pwa-install-btn {
          bottom: 80px;
          right: 16px;
          font-size: 14px;
          padding: 10px 20px;
        }
      }
    `;
    document.head.appendChild(style);

    // body에 버튼 추가
    document.body.appendChild(installButton);
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

  // 수동 설치 안내 표시
  function showInstallInstructions() {
    // 오버레이 생성
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      animation: fadeIn 0.3s ease-out;
    `;

    // 안내 모달 생성
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: white;
      border-radius: 16px;
      padding: 24px;
      max-width: 400px;
      width: 100%;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
      animation: slideInUp 0.3s ease-out;
    `;

    // iOS 확인
    const isIOSDevice = isIOS();

    modal.innerHTML = `
      <div style="text-align: center;">
        <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #66ae7d 0%, #5a9d6f 100%); border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
          <svg stroke="white" fill="white" stroke-width="0" viewBox="0 0 24 24" height="32" width="32" xmlns="http://www.w3.org/2000/svg">
            <path fill="none" d="M0 0h24v24H0z"></path>
            <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"></path>
          </svg>
        </div>
        <h2 style="margin: 0 0 12px; font-size: 20px; font-weight: 700; color: #1a1a1a;">홈 화면에 추가하기</h2>
        <p style="margin: 0 0 20px; font-size: 14px; color: #666; line-height: 1.6;">
          ${isIOSDevice
            ? 'Safari에서 공유 버튼 <span style="display: inline-block; border: 1px solid #ccc; border-radius: 4px; padding: 2px 6px; font-size: 16px;">□↑</span>을 누른 후<br/>"홈 화면에 추가"를 선택하세요.'
            : '브라우저 메뉴 <span style="display: inline-block; border: 1px solid #ccc; border-radius: 4px; padding: 2px 6px;">⋮</span>를 열고<br/>"홈 화면에 추가" 또는 "앱 설치"를 선택하세요.'
          }
        </p>
        <button id="close-install-modal" style="
          background: #66ae7d;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 12px 24px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          width: 100%;
          transition: background 0.2s;
        ">확인</button>
      </div>
    `;

    overlay.appendChild(modal);

    // 애니메이션 추가
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `;
    document.head.appendChild(style);

    // 닫기 이벤트
    const closeButton = modal.querySelector('#close-install-modal');
    const closeModal = () => {
      overlay.style.animation = 'fadeIn 0.2s ease-out reverse';
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }, 200);
    };

    closeButton.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal();
      }
    });

    document.body.appendChild(overlay);
  }

  // 앱이 이미 설치된 경우 감지
  window.addEventListener('appinstalled', () => {
    hideInstallButton();
    deferredPrompt = null;
  });
})();
