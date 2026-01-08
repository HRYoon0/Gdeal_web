// 스크롤 애니메이션
(function() {
  // Intersection Observer 설정
  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.15 // 요소의 15%가 보이면 트리거
  };

  // 애니메이션 스타일 추가
  const style = document.createElement('style');
  style.textContent = `
    /* 스크롤 애니메이션을 위한 기본 클래스 */
    .scroll-animate {
      opacity: 0;
      transform: translateY(30px);
      transition: opacity 0.6s ease-out, transform 0.6s ease-out;
    }

    .scroll-animate.animate-in {
      opacity: 1;
      transform: translateY(0);
    }

    /* 지연 애니메이션 */
    .scroll-animate-delay-1 {
      transition-delay: 0.15s;
    }

    .scroll-animate-delay-2 {
      transition-delay: 0.3s;
    }

    .scroll-animate-delay-3 {
      transition-delay: 0.45s;
    }

    /* 스케일 애니메이션 */
    .scroll-animate-scale {
      opacity: 0;
      transform: scale(0.95);
      transition: opacity 0.6s ease-out, transform 0.6s ease-out;
    }

    .scroll-animate-scale.animate-in {
      opacity: 1;
      transform: scale(1);
    }

    /* 좌우에서 나타나는 애니메이션 */
    .scroll-animate-left {
      opacity: 0;
      transform: translateX(-40px);
      transition: opacity 0.7s ease-out, transform 0.7s ease-out;
    }

    .scroll-animate-left.animate-in {
      opacity: 1;
      transform: translateX(0);
    }

    .scroll-animate-right {
      opacity: 0;
      transform: translateX(40px);
      transition: opacity 0.7s ease-out, transform 0.7s ease-out;
    }

    .scroll-animate-right.animate-in {
      opacity: 1;
      transform: translateX(0);
    }
  `;
  document.head.appendChild(style);

  // Observer 생성
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        // 한 번 애니메이션되면 관찰 중지 (성능 향상)
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // 애니메이션을 적용할 요소들을 찾아서 클래스 추가
  function initScrollAnimations() {
    // main 요소가 있는지 확인
    const main = document.querySelector('main');
    if (!main) return;

    // 홈 페이지인지 확인
    if (!window.location.pathname.includes('/home')) return;

    // 최신 소식과 교육 활동 섹션의 그리드 컨테이너
    const gridContainers = main.querySelectorAll('.grid.grid-cols-1.lg\\:grid-cols-2 > .col-span-1');

    gridContainers.forEach((container, index) => {
      // 이미 애니메이션 클래스가 있으면 건너뛰기
      if (!container.classList.contains('scroll-animate-left') &&
          !container.classList.contains('scroll-animate-right')) {

        // 첫 번째는 왼쪽에서, 두 번째는 오른쪽에서
        const animClass = index === 0 ? 'scroll-animate-left' : 'scroll-animate-right';
        container.classList.add(animClass);
        observer.observe(container);
      }
    });

    // 하단 CTA 영역 (G-DEAL과 함께 성장하세요)
    const ctaSection = main.querySelector('.mt-12.p-6.bg-gradient-to-r');
    if (ctaSection && !ctaSection.classList.contains('scroll-animate-scale')) {
      ctaSection.classList.add('scroll-animate-scale');
      observer.observe(ctaSection);
    }

    // 푸터의 각 섹션에 순차 애니메이션
    const footer = document.querySelector('footer');
    if (footer) {
      const footerSections = footer.querySelectorAll('.grid > .space-y-4');
      footerSections.forEach((section, index) => {
        if (!section.classList.contains('scroll-animate')) {
          section.classList.add('scroll-animate');
          if (index > 0) {
            section.classList.add(`scroll-animate-delay-${Math.min(index, 3)}`);
          }
          observer.observe(section);
        }
      });
    }
  }

  // DOM이 로드된 후 실행
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // React Hydration 이후 실행을 위해 지연
      setTimeout(initScrollAnimations, 500);
    });
  } else {
    setTimeout(initScrollAnimations, 500);
  }

  // SPA 라우팅을 위한 재초기화
  let lastPathname = window.location.pathname;
  setInterval(() => {
    if (window.location.pathname !== lastPathname) {
      lastPathname = window.location.pathname;
      if (window.location.pathname.includes('/home')) {
        setTimeout(initScrollAnimations, 500);
      }
    }
  }, 1000);
})();
