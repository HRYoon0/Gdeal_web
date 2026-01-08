// G-DEAL FCM 클라이언트
// 홈 화면에 추가한 사용자(standalone 모드)만 알림 구독

(function() {
  'use strict';

  // Firebase SDK 로드
  function loadFirebaseSDK() {
    return new Promise((resolve, reject) => {
      if (window.firebase) {
        resolve();
        return;
      }

      const appScript = document.createElement('script');
      appScript.src = 'https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js';
      appScript.onload = () => {
        const messagingScript = document.createElement('script');
        messagingScript.src = 'https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js';
        messagingScript.onload = () => {
          const firestoreScript = document.createElement('script');
          firestoreScript.src = 'https://www.gstatic.com/firebasejs/9.0.0/firebase-firestore-compat.js';
          firestoreScript.onload = resolve;
          firestoreScript.onerror = reject;
          document.head.appendChild(firestoreScript);
        };
        messagingScript.onerror = reject;
        document.head.appendChild(messagingScript);
      };
      appScript.onerror = reject;
      document.head.appendChild(appScript);
    });
  }

  // Standalone 모드 확인 (홈 화면에 추가된 경우)
  function isStandaloneMode() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true ||
           document.referrer.includes('android-app://');
  }

  // FCM 토큰을 Firestore에 저장
  async function saveTokenToFirestore(token, deviceInfo) {
    try {
      const db = firebase.firestore();
      const tokenRef = db.collection('fcm_tokens').doc(token);

      await tokenRef.set({
        token: token,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        platform: deviceInfo.platform,
        userAgent: deviceInfo.userAgent,
        isActive: true,
        // 알림 구독 설정 (기본값: 모든 알림 받기)
        subscriptions: {
          events: true,      // 대외행사
          training: true,    // 월별연수
          resources: true,   // 자료공유
          diary: true        // 교단일기
        }
      }, { merge: true });

      console.log('FCM 토큰이 Firestore에 저장되었습니다.');
      return true;
    } catch (error) {
      console.error('토큰 저장 실패:', error);
      return false;
    }
  }

  // FCM 초기화 및 토큰 획득
  async function initializeFCM() {
    try {
      // Firebase 앱이 초기화되지 않은 경우에만 초기화
      if (!firebase.apps.length) {
        firebase.initializeApp({
          apiKey: "AIzaSyCOl5zvS29HOH5RGCR7cP_-WCzglddpNKM",
          authDomain: "gdeal-page-a67e2.firebaseapp.com",
          projectId: "gdeal-page-a67e2",
          storageBucket: "gdeal-page-a67e2.firebasestorage.app",
          messagingSenderId: "309761797743",
          appId: "1:309761797743:web:f0e10f2f8f05724f91335b"
        });
      }

      const messaging = firebase.messaging();

      // 알림 권한 요청
      const permission = await Notification.requestPermission();

      if (permission === 'granted') {
        console.log('알림 권한이 허용되었습니다.');

        // Service Worker 등록 확인
        const registration = await navigator.serviceWorker.ready;

        // FCM 토큰 획득
        const token = await messaging.getToken({
          vapidKey: 'BPq1JdP4QYyKmMwxG_XS7qKXmMgGMCjNMkWZWBNhTdBMOZdA5pTxKJxM5nM8GqN8mZUdWXh7vxW8K9VqQnP5dME',
          serviceWorkerRegistration: registration
        });

        if (token) {
          console.log('FCM 토큰 획득:', token.substring(0, 20) + '...');

          // 디바이스 정보
          const deviceInfo = {
            platform: /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' :
                      /Android/.test(navigator.userAgent) ? 'android' : 'web',
            userAgent: navigator.userAgent
          };

          // Firestore에 토큰 저장
          await saveTokenToFirestore(token, deviceInfo);

          // 로컬 스토리지에도 저장 (중복 요청 방지)
          localStorage.setItem('fcm_token', token);
          localStorage.setItem('fcm_subscribed', 'true');
        }
      } else {
        console.log('알림 권한이 거부되었습니다.');
      }

      // 포그라운드 메시지 수신 처리
      messaging.onMessage((payload) => {
        console.log('포그라운드 메시지 수신:', payload);

        // 포그라운드에서 알림 표시
        const notificationTitle = payload.notification?.title || 'G-DEAL 알림';
        const notificationOptions = {
          body: payload.notification?.body || '새로운 소식이 있습니다.',
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-72x72.png',
          tag: payload.data?.tag || 'gdeal-notification',
          data: payload.data
        };

        // Notification API로 알림 표시
        if (Notification.permission === 'granted') {
          const notification = new Notification(notificationTitle, notificationOptions);
          notification.onclick = () => {
            window.focus();
            if (payload.data?.url) {
              window.location.href = payload.data.url;
            }
            notification.close();
          };
        }
      });

    } catch (error) {
      console.error('FCM 초기화 실패:', error);
    }
  }

  // 메인 함수
  async function main() {
    // Standalone 모드가 아니면 종료
    if (!isStandaloneMode()) {
      console.log('Standalone 모드가 아닙니다. FCM을 초기화하지 않습니다.');
      return;
    }

    console.log('Standalone 모드 감지. FCM 초기화 시작...');

    // Service Worker 지원 확인
    if (!('serviceWorker' in navigator)) {
      console.log('Service Worker를 지원하지 않는 브라우저입니다.');
      return;
    }

    // 알림 지원 확인
    if (!('Notification' in window)) {
      console.log('알림을 지원하지 않는 브라우저입니다.');
      return;
    }

    // 이미 구독된 경우 토큰만 갱신
    const isSubscribed = localStorage.getItem('fcm_subscribed');

    try {
      await loadFirebaseSDK();
      await initializeFCM();
    } catch (error) {
      console.error('FCM 설정 중 오류:', error);
    }
  }

  // DOM 로드 후 실행
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
