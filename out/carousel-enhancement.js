// 초고속 슬라이드 전환 효과 - 60fps 최적화 (블러 제거)
(function() {
  'use strict';

  const style = document.createElement('style');
  style.textContent = `
    /* 인디케이터 숨기기 */
    .absolute.top-6.right-6 {
      display: none !important;
    }

    /* 슬라이드쇼 컨테이너 */
    .relative.bg-gray-900.rounded-2xl,
    .relative.bg-gray-200.rounded-2xl {
      overflow: hidden !important;
    }

    /* 슬라이드 래퍼 */
    .relative.bg-gray-900.rounded-2xl .relative.w-full.h-full,
    .relative.bg-gray-200.rounded-2xl .relative.w-full.h-full {
      overflow: hidden !important;
    }

    /* 슬라이드 아이템 - React의 transition 완전 비활성화 */
    .relative.bg-gray-900.rounded-2xl .absolute.inset-0,
    .relative.bg-gray-200.rounded-2xl .absolute.inset-0 {
      overflow: hidden !important;
      border-radius: 1rem !important;
      will-change: transform, filter, opacity !important;
      transition: none !important;
      animation-fill-mode: both !important;
      contain: layout style paint !important;
      transform: translateZ(0) !important;
      -webkit-transform: translateZ(0) !important;
    }

    /* z-index 조정 - opacity-0 (나가는)이 위에 */
    .relative.bg-gray-900.rounded-2xl .absolute.inset-0.opacity-0,
    .relative.bg-gray-200.rounded-2xl .absolute.inset-0.opacity-0 {
      z-index: 2 !important;
    }

    /* z-index 조정 - opacity-100 (들어오는)이 아래 */
    .relative.bg-gray-900.rounded-2xl .absolute.inset-0.opacity-100,
    .relative.bg-gray-200.rounded-2xl .absolute.inset-0.opacity-100 {
      z-index: 1 !important;
      /* 애니메이션 전 초기 상태에서 숨김 */
      visibility: hidden;
    }

    /* 애니메이션이 적용되면 visibility 복원 */
    .relative.bg-gray-900.rounded-2xl .absolute.inset-0.opacity-100[style*="animation"],
    .relative.bg-gray-200.rounded-2xl .absolute.inset-0.opacity-100[style*="animation"] {
      visibility: visible !important;
    }

    /* React의 duration-700 클래스 비활성화 - 매우 강력하게 */
    .relative.bg-gray-900.rounded-2xl .duration-700,
    .relative.bg-gray-200.rounded-2xl .duration-700,
    .relative.bg-gray-900.rounded-2xl .absolute.inset-0[class*="duration"],
    .relative.bg-gray-200.rounded-2xl .absolute.inset-0[class*="duration"] {
      transition-duration: 0s !important;
      -webkit-transition-duration: 0s !important;
    }

    /* React의 transition-all 비활성화 - 매우 강력하게 */
    .relative.bg-gray-900.rounded-2xl .transition-all,
    .relative.bg-gray-200.rounded-2xl .transition-all,
    .relative.bg-gray-900.rounded-2xl .absolute.inset-0[class*="transition"],
    .relative.bg-gray-200.rounded-2xl .absolute.inset-0[class*="transition"] {
      transition: none !important;
      -webkit-transition: none !important;
      transition-property: none !important;
      -webkit-transition-property: none !important;
    }

    /* React의 scale 클래스 비활성화 - 매우 강력하게 */
    .relative.bg-gray-900.rounded-2xl .scale-105,
    .relative.bg-gray-200.rounded-2xl .scale-105,
    .relative.bg-gray-900.rounded-2xl .scale-100,
    .relative.bg-gray-200.rounded-2xl .scale-100,
    .relative.bg-gray-900.rounded-2xl .absolute.inset-0[class*="scale"],
    .relative.bg-gray-200.rounded-2xl .absolute.inset-0[class*="scale"] {
      transform: translateZ(0) !important;
      -webkit-transform: translateZ(0) !important;
    }

    /* 인라인 스타일도 오버라이드 */
    .relative.bg-gray-900.rounded-2xl .absolute.inset-0[style*="scale"],
    .relative.bg-gray-200.rounded-2xl .absolute.inset-0[style*="scale"],
    .relative.bg-gray-900.rounded-2xl .absolute.inset-0[style*="transform"],
    .relative.bg-gray-200.rounded-2xl .absolute.inset-0[style*="transform"] {
      transform: translateZ(0) !important;
      -webkit-transform: translateZ(0) !important;
    }

    /* ease-in-out 비활성화 */
    .relative.bg-gray-900.rounded-2xl .ease-in-out,
    .relative.bg-gray-200.rounded-2xl .ease-in-out {
      transition-timing-function: linear !important;
      transition-duration: 0s !important;
    }

    /* 나가는 슬라이드 - 최적화된 페이드 효과 */
    .relative.bg-gray-900.rounded-2xl .absolute.inset-0.opacity-0,
    .relative.bg-gray-200.rounded-2xl .absolute.inset-0.opacity-0 {
      animation: smoothFadeOut 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards !important;
    }

    /* 들어오는 슬라이드 - 최적화된 페이드 효과 */
    .relative.bg-gray-900.rounded-2xl .absolute.inset-0.opacity-100,
    .relative.bg-gray-200.rounded-2xl .absolute.inset-0.opacity-100 {
      animation: smoothFadeIn 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards !important;
    }

    /* 나가는 애니메이션 - 블러 제거, 초고속 최적화 */
    @keyframes smoothFadeOut {
      0% {
        transform: translateX(0) scale(1) translateZ(0) !important;
        opacity: 1;
        visibility: visible;
      }
      99% {
        visibility: visible;
      }
      100% {
        transform: translateX(-8%) scale(0.96) translateZ(0) !important;
        opacity: 0;
        visibility: hidden;
      }
    }

    /* 들어오는 애니메이션 - 블러 제거, 초고속 최적화 */
    @keyframes smoothFadeIn {
      0% {
        transform: translateX(8%) scale(0.96) translateZ(0) !important;
        opacity: 0;
        visibility: visible;
      }
      1% {
        visibility: visible;
      }
      100% {
        transform: translateX(0) scale(1) translateZ(0) !important;
        opacity: 1;
        visibility: visible;
      }
    }

    /* 슬라이드 이미지에 부드러운 그림자 */
    .relative.bg-gray-900.rounded-2xl .w-full.h-full.relative.overflow-hidden,
    .relative.bg-gray-200.rounded-2xl .w-full.h-full.relative.overflow-hidden {
      box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.3) !important;
      border-radius: 1rem !important;
    }

    /* 네비게이션 버튼 - 프리미엄 스타일 */
    .relative.bg-gray-900.rounded-2xl button.left-4,
    .relative.bg-gray-900.rounded-2xl button.right-4,
    .relative.bg-gray-200.rounded-2xl button.left-4,
    .relative.bg-gray-200.rounded-2xl button.right-4 {
      background: rgba(255, 255, 255, 0.95) !important;
      backdrop-filter: blur(20px) saturate(180%) !important;
      -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
      width: 56px !important;
      height: 56px !important;
      border-radius: 50% !important;
      border: 1px solid rgba(255, 255, 255, 0.3) !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12),
                  0 2px 8px rgba(0, 0, 0, 0.08),
                  inset 0 0 0 1px rgba(255, 255, 255, 0.5) !important;
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important;
      z-index: 100 !important;
    }

    .relative.bg-gray-900.rounded-2xl button.left-4:hover,
    .relative.bg-gray-900.rounded-2xl button.right-4:hover,
    .relative.bg-gray-200.rounded-2xl button.left-4:hover,
    .relative.bg-gray-200.rounded-2xl button.right-4:hover {
      background: rgba(255, 255, 255, 1) !important;
      transform: translateY(-50%) scale(1.1) !important;
      box-shadow: 0 12px 48px rgba(0, 0, 0, 0.18),
                  0 4px 16px rgba(0, 0, 0, 0.12),
                  inset 0 0 0 1px rgba(255, 255, 255, 0.8) !important;
    }

    .relative.bg-gray-900.rounded-2xl button.left-4:active,
    .relative.bg-gray-900.rounded-2xl button.right-4:active,
    .relative.bg-gray-200.rounded-2xl button.left-4:active,
    .relative.bg-gray-200.rounded-2xl button.right-4:active {
      transform: translateY(-50%) scale(1.02) !important;
      transition: all 0.1s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }

    .relative.bg-gray-900.rounded-2xl button.left-4 svg,
    .relative.bg-gray-900.rounded-2xl button.right-4 svg,
    .relative.bg-gray-200.rounded-2xl button.left-4 svg,
    .relative.bg-gray-200.rounded-2xl button.right-4 svg {
      color: #66ae7d !important;
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }

    .relative.bg-gray-900.rounded-2xl button.left-4:hover svg,
    .relative.bg-gray-200.rounded-2xl button.left-4:hover svg {
      transform: translateX(-2px) !important;
    }

    .relative.bg-gray-900.rounded-2xl button.right-4:hover svg,
    .relative.bg-gray-200.rounded-2xl button.right-4:hover svg {
      transform: translateX(2px) !important;
    }

    /* 반응형 */
    @media (max-width: 768px) {
      .relative.bg-gray-900.rounded-2xl button.left-4,
      .relative.bg-gray-900.rounded-2xl button.right-4,
      .relative.bg-gray-200.rounded-2xl button.left-4,
      .relative.bg-gray-200.rounded-2xl button.right-4 {
        width: 48px !important;
        height: 48px !important;
      }

      @keyframes smoothFadeOut {
        0% {
          transform: translateX(0) scale(1) translateZ(0) !important;
          opacity: 1;
          visibility: visible;
        }
        99% {
          visibility: visible;
        }
        100% {
          transform: translateX(-6%) scale(0.97) translateZ(0) !important;
          opacity: 0;
          visibility: hidden;
        }
      }

      @keyframes smoothFadeIn {
        0% {
          transform: translateX(6%) scale(0.97) translateZ(0) !important;
          opacity: 0;
          visibility: visible;
        }
        1% {
          visibility: visible;
        }
        100% {
          transform: translateX(0) scale(1) translateZ(0) !important;
          opacity: 1;
          visibility: visible;
        }
      }
    }

    /* 성능 최적화 - GPU 가속 */
    .relative.bg-gray-900.rounded-2xl .absolute.inset-0,
    .relative.bg-gray-200.rounded-2xl .absolute.inset-0 {
      backface-visibility: hidden !important;
      -webkit-backface-visibility: hidden !important;
      perspective: 1000px !important;
      -webkit-perspective: 1000px !important;
    }

    /* 이미지 GPU 가속 */
    .relative.bg-gray-900.rounded-2xl img,
    .relative.bg-gray-200.rounded-2xl img {
      transform: translateZ(0) !important;
      -webkit-transform: translateZ(0) !important;
      will-change: transform !important;
    }
  `;
  document.head.appendChild(style);

  // 초기 로딩 시 애니메이션 비활성화
  let isFirstLoad = true;

  // React의 transition 클래스 제거 함수
  function removeReactTransitions() {
    const carouselContainers = document.querySelectorAll('.relative.bg-gray-900.rounded-2xl, .relative.bg-gray-200.rounded-2xl');

    console.log(`🎬 발견된 슬라이드쇼 컨테이너: ${carouselContainers.length}개`);

    carouselContainers.forEach((container, index) => {
      const bgClass = container.classList.contains('bg-gray-900') ? '교육 활동 (어두운)' : '최신 소식 (밝은)';
      const slides = container.querySelectorAll('.absolute.inset-0');
      console.log(`  - ${index + 1}번 컨테이너: ${bgClass}, 슬라이드 ${slides.length}개`);

      slides.forEach(slide => {
        // React의 transition 클래스 제거
        slide.classList.remove('transition-all', 'duration-700', 'ease-in-out');
        slide.classList.remove('scale-105', 'scale-100');

        // transition만 제거 (transform은 애니메이션이 제어)
        slide.style.transition = 'none';

        // opacity-100이지만 애니메이션이 없는 슬라이드는 초기에 숨김
        if (slide.classList.contains('opacity-100') &&
            !slide.style.animation &&
            !slide.style.webkitAnimation) {
          // 애니메이션이 시작되기 전까지는 투명하게
          const computedStyle = window.getComputedStyle(slide);
          if (!computedStyle.animationName || computedStyle.animationName === 'none') {
            slide.style.visibility = 'hidden';
            // 다음 프레임에 visibility 복원
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                slide.style.visibility = '';
              });
            });
          }
        }
      });
    });
  }

  // 슬라이드쇼 컨테이너 감지 및 초기 애니메이션 제거
  function disableInitialAnimation() {
    const carouselContainers = document.querySelectorAll('.relative.bg-gray-900.rounded-2xl, .relative.bg-gray-200.rounded-2xl');

    carouselContainers.forEach(container => {
      if (container.querySelector('.absolute.inset-0')) {
        // 초기 로딩 시에만 애니메이션 비활성화 클래스 추가
        if (isFirstLoad) {
          container.classList.add('carousel-first-load');

          // 1초 후 클래스 제거 (슬라이드쇼가 시작되기 전)
          setTimeout(() => {
            container.classList.remove('carousel-first-load');
            isFirstLoad = false;
          }, 100);
        }
      }
    });

    // React transition 클래스 제거
    removeReactTransitions();
  }

  // MutationObserver로 DOM 변경 감지 및 클래스 제거 (초고속)
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes') {
        const target = mutation.target;
        if (target.classList.contains('absolute') && target.classList.contains('inset-0')) {

          // class 속성 변경 감지
          if (mutation.attributeName === 'class') {
            // React가 클래스를 추가하면 즉시 동기적으로 제거
            if (target.classList.contains('scale-105') ||
                target.classList.contains('scale-100') ||
                target.classList.contains('transition-all') ||
                target.classList.contains('duration-700') ||
                target.classList.contains('ease-in-out')) {

              // 즉시 제거 (requestAnimationFrame 없이)
              target.classList.remove('transition-all', 'duration-700', 'ease-in-out');
              target.classList.remove('scale-105', 'scale-100');
              target.style.transition = 'none';
              target.style.transitionDuration = '0s';
              target.style.transitionProperty = 'none';
            }
          }

          // style 속성 변경 감지
          if (mutation.attributeName === 'style') {
            const style = target.style;
            // transition이나 transform이 설정되면 즉시 제거
            if (style.transition && style.transition !== 'none') {
              target.style.transition = 'none';
              target.style.transitionDuration = '0s';
              target.style.transitionProperty = 'none';
            }
          }
        }
      }
    });
  });

  // Observer 시작
  function startObserver() {
    const carouselContainers = document.querySelectorAll('.relative.bg-gray-900.rounded-2xl, .relative.bg-gray-200.rounded-2xl');

    console.log(`👁️ MutationObserver 시작 (class + style 속성 감시)`);

    carouselContainers.forEach(container => {
      observer.observe(container, {
        attributes: true,
        attributeFilter: ['class', 'style'],
        subtree: true,
        attributeOldValue: false
      });
    });
  }

  // 초기 로딩 애니메이션 비활성화를 위한 추가 스타일
  const additionalStyle = document.createElement('style');
  additionalStyle.textContent = `
    /* 첫 로딩 시 애니메이션 비활성화 */
    .carousel-first-load .absolute.inset-0 {
      animation: none !important;
    }

    /* 첫 로딩 시 현재 슬라이드는 보이도록 */
    .carousel-first-load .absolute.inset-0.opacity-100 {
      visibility: visible !important;
    }

    /* 브라우저별 하드웨어 가속 최적화 */
    @supports (transform-style: preserve-3d) {
      .relative.bg-gray-900.rounded-2xl .absolute.inset-0,
      .relative.bg-gray-200.rounded-2xl .absolute.inset-0 {
        transform-style: flat !important;
      }
    }

    /* 애니메이션 성능 최적화 */
    @media (prefers-reduced-motion: no-preference) {
      .relative.bg-gray-900.rounded-2xl .absolute.inset-0,
      .relative.bg-gray-200.rounded-2xl .absolute.inset-0 {
        animation-timing-function: cubic-bezier(0.33, 0, 0.2, 1) !important;
      }
    }
  `;
  document.head.appendChild(additionalStyle);

  // DOM 로드 후 실행
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        disableInitialAnimation();
        startObserver();
      }, 100);
    });
  } else {
    setTimeout(() => {
      disableInitialAnimation();
      startObserver();
    }, 100);
  }

  // 주기적으로 클래스 제거 (보험용) - 더 빠르게
  setInterval(removeReactTransitions, 100);

  console.log('✨ 초고속 페이드 전환 효과 적용 완료!');
  console.log('📍 적용 대상: 교육 활동 (bg-gray-900) + 최신 소식 (bg-gray-200)');
  console.log('🚫 React transition 완전 차단, 60fps 최적화');
})();
