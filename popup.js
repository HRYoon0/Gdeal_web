// G-DEAL 공지사항 팝업 (왼쪽 상단 고정)
(function() {
  'use strict';

  // 팝업 설정 - 이 부분만 수정하면 됩니다
  const POPUP_CONFIG = {
    id: 'gdeal-popup-20260913-growth',  // 팝업 ID (새 공지 시 변경 — 바꾸면 "열지 않음"을 누른 사람에게도 다시 뜸)
    title: '성장패스가 열렸어요',
    // html이 있으면 이미지 대신 글 공지로 띄운다. 이미지 공지로 돌아가려면 html을 ''로 두고 imageUrl을 채운다.
    html: '<strong>배움을 찍고, 실천을 기록하고, 성장을 나누다</strong>' +
      '<p>나눔활동에 신청하거나 웨비나·카페연수 현장에서 QR로 참여를 인증하면 스탬프가 찍혀요. 성찰과 실천을 기록하면 배지가 쌓이고, 한 학기 기록은 포트폴리오로 묶을 수 있어요.</p>' +
      '<p>웹앱 광장은 자료공유로 합쳤어요. 직접 만든 웹앱도 자료공유에 등록해 주세요.</p>',
    imageUrl: '/popup-notice.jpg',  // 이미지 공지일 때 경로
    linkUrl: '/growth/',  // 이미지 클릭 또는 글 공지 버튼의 이동 주소
    linkText: '성장패스 둘러보기',
    width: 400,  // 팝업 너비 (px)
    top: 80,     // 상단 여백 (px)
    left: 20,    // 왼쪽 여백 (px)
    enabled: true  // false로 변경하면 팝업 비활성화
  };

  // 쿠키 관련 함수
  function setCookie(name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${date.toUTCString()};path=/`;
  }

  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  }

  // 세션 동안 닫힘 상태 추적
  let closedThisSession = false;

  // 팝업 표시 여부 확인
  function shouldShowPopup() {
    if (!POPUP_CONFIG.enabled) return false;
    if (closedThisSession) return false;
    const cookieName = `popup_hide_${POPUP_CONFIG.id}`;
    return getCookie(cookieName) !== 'true';
  }

  // 팝업 HTML 생성
  function createPopupHTML() {
    const external = /^https?:/.test(POPUP_CONFIG.linkUrl || '');
    const htmlContent = POPUP_CONFIG.html
      ? `<div class="gdeal-popup-html">${POPUP_CONFIG.html}${POPUP_CONFIG.linkUrl ? `<a class="gdeal-popup-cta" href="${POPUP_CONFIG.linkUrl}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${POPUP_CONFIG.linkText || '자세히 보기'}</a>` : ''}</div>`
      : '';
    const imageContent = htmlContent || (POPUP_CONFIG.linkUrl
      ? `<a href="${POPUP_CONFIG.linkUrl}" target="_blank" rel="noopener noreferrer" class="gdeal-popup-image-link"><img src="${POPUP_CONFIG.imageUrl}" alt="공지사항" class="gdeal-popup-image"></a>`
      : `<img src="${POPUP_CONFIG.imageUrl}" alt="공지사항" class="gdeal-popup-image">`);

    return `
      <div id="gdeal-popup-container" class="gdeal-popup-container" style="width: ${POPUP_CONFIG.width}px; top: ${POPUP_CONFIG.top}px; left: ${POPUP_CONFIG.left}px;">
        <div class="gdeal-popup-header">
          <span class="gdeal-popup-title">${POPUP_CONFIG.title}</span>
          <button class="gdeal-popup-close" aria-label="닫기">✕</button>
        </div>
        <div class="gdeal-popup-content">
          ${imageContent}
        </div>
        <div class="gdeal-popup-footer">
          <button class="gdeal-popup-btn" data-days="1">하루동안 열지 않음</button>
          <button class="gdeal-popup-btn" data-days="7">일주일동안 열지 않음</button>
        </div>
      </div>
    `;
  }

  // 팝업 스타일 생성
  function createPopupStyles() {
    return `
      <style id="gdeal-popup-styles">
        .gdeal-popup-container {
          position: fixed;
          z-index: 9999;
          background: white;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          display: flex;
          flex-direction: column;
          opacity: 0;
          transform: translateY(-10px);
          transition: opacity 0.3s ease, transform 0.3s ease;
        }

        .gdeal-popup-container.active {
          opacity: 1;
          transform: translateY(0);
        }

        .gdeal-popup-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          background: #f5f5f5;
          border-bottom: 1px solid #ddd;
        }

        .gdeal-popup-title {
          font-size: 0.9rem;
          font-weight: 500;
          color: #333;
          font-family: 'Paperlogy', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        .gdeal-popup-close {
          background: none;
          border: 1px solid #ccc;
          border-radius: 4px;
          width: 26px;
          height: 26px;
          cursor: pointer;
          color: #666;
          font-size: 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .gdeal-popup-close:hover {
          background: #e0e0e0;
          color: #333;
        }

        .gdeal-popup-content {
          background: white;
        }

        .gdeal-popup-image-link {
          display: block;
        }

        .gdeal-popup-image {
          width: 100%;
          height: auto;
          display: block;
        }

        .gdeal-popup-html {
          padding: 18px 20px 20px;
          color: #1f2937;
          font-size: 0.92rem;
          font-weight: 500;
          line-height: 1.65;
          font-family: 'Paperlogy', -apple-system, BlinkMacSystemFont, 'Malgun Gothic', sans-serif;
        }

        .gdeal-popup-html strong {
          display: block;
          font-size: 1.02rem;
          font-weight: 700;
          color: #14532d;
          margin-bottom: 8px;
        }

        .gdeal-popup-html p {
          margin: 0 0 8px;
        }

        .gdeal-popup-cta {
          display: inline-block;
          margin-top: 6px;
          padding: 9px 16px;
          border-radius: 8px;
          background: #66ae7d;
          color: #fff !important;
          font-weight: 700;
          text-decoration: none;
        }

        .gdeal-popup-cta:hover {
          background: #497e56;
        }

        .gdeal-popup-footer {
          display: flex;
          background: #3d5a80;
        }

        .gdeal-popup-btn {
          flex: 1;
          padding: 12px 10px;
          background: transparent;
          border: none;
          color: white;
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          font-family: 'Paperlogy', -apple-system, BlinkMacSystemFont, sans-serif;
          transition: background-color 0.2s ease;
        }

        .gdeal-popup-btn:first-child {
          border-right: 1px solid rgba(255, 255, 255, 0.2);
        }

        .gdeal-popup-btn:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        /* 모바일 대응 */
        @media (max-width: 500px) {
          .gdeal-popup-container {
            width: calc(100% - 20px) !important;
            left: 10px !important;
            right: 10px;
          }

          .gdeal-popup-btn {
            padding: 11px 6px;
            font-size: 0.75rem;
          }
        }
      </style>
    `;
  }

  // 팝업 닫기
  function closePopup(days) {
    const container = document.getElementById('gdeal-popup-container');
    if (container) {
      closedThisSession = true;  // 세션 동안 다시 안 뜨게
      if (days && days > 0) {
        const cookieName = `popup_hide_${POPUP_CONFIG.id}`;
        setCookie(cookieName, 'true', days);
      }
      container.classList.remove('active');
      setTimeout(() => {
        container.remove();
      }, 300);
    }
  }

  // 팝업 표시
  function showPopup() {
    if (!shouldShowPopup()) return;

    // 이미 팝업이 있으면 중복 생성 방지
    if (document.getElementById('gdeal-popup-container')) return;

    // 스타일 추가 (중복 방지)
    if (!document.getElementById('gdeal-popup-styles')) {
      document.head.insertAdjacentHTML('beforeend', createPopupStyles());
    }

    // HTML 추가
    document.body.insertAdjacentHTML('beforeend', createPopupHTML());

    // 애니메이션
    requestAnimationFrame(() => {
      const container = document.getElementById('gdeal-popup-container');
      if (container) {
        container.classList.add('active');
      }
    });

    // 이벤트 리스너 등록
    const closeBtn = document.querySelector('.gdeal-popup-close');
    const dayBtns = document.querySelectorAll('.gdeal-popup-btn');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => closePopup(0));
    }

    dayBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const days = parseInt(btn.dataset.days, 10);
        closePopup(days);
      });
    });
  }

  // 페이지 완전 로드 후 팝업 표시 (Next.js hydration 완료 대기)
  function initPopup() {
    // Next.js hydration 완료 후 팝업 표시
    setTimeout(showPopup, 300);
  }

  if (document.readyState === 'complete') {
    initPopup();
  } else {
    window.addEventListener('load', initPopup);
  }
})();
