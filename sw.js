// G-DEAL PWA Service Worker
const CACHE_NAME = 'gdeal-v3';

// Firebase Cloud Messaging
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCOl5zvS29HOH5RGCR7cP_-WCzglddpNKM",
  authDomain: "gdeal-page-a67e2.firebaseapp.com",
  projectId: "gdeal-page-a67e2",
  storageBucket: "gdeal-page-a67e2.firebasestorage.app",
  messagingSenderId: "309761797743",
  appId: "1:309761797743:web:f0e10f2f8f05724f91335b"
});

const messaging = firebase.messaging();

// 백그라운드 메시지 수신
messaging.onBackgroundMessage((payload) => {
  console.log('백그라운드 메시지 수신:', payload);

  const notificationTitle = payload.notification?.title || 'G-DEAL 알림';
  const notificationOptions = {
    body: payload.notification?.body || '새로운 소식이 있습니다.',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: payload.data?.tag || 'gdeal-notification',
    data: payload.data,
    actions: [
      { action: 'open', title: '열기' },
      { action: 'close', title: '닫기' }
    ]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// 알림 클릭 이벤트
self.addEventListener('notificationclick', (event) => {
  console.log('알림 클릭:', event);
  event.notification.close();

  if (event.action === 'close') return;

  const urlToOpen = event.notification.data?.url || '/home/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(urlToOpen);
            return client.focus();
          }
        }
        return clients.openWindow(urlToOpen);
      })
  );
});
const urlsToCache = [
  '/home/',
  '/about/',
  '/events/',
  '/training/',
  '/resources/',
  '/diary/',
  '/G-DEAL_green.svg',
  '/manifest.json'
];

// 설치 이벤트: 캐시 생성
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('캐시 오픈됨');
        return cache.addAll(urlsToCache);
      })
  );
  // 새 Service Worker 즉시 활성화
  self.skipWaiting();
});

// 활성화 이벤트: 오래된 캐시 삭제
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('오래된 캐시 삭제:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // 즉시 제어권 획득
  return self.clients.claim();
});

// Fetch 이벤트: 네트워크 우선, 실패 시 캐시 사용
self.addEventListener('fetch', (event) => {
  // POST 요청은 캐시하지 않음 (Cache API는 GET만 지원)
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 응답 복제 (한 번은 브라우저에, 한 번은 캐시에)
        const responseToCache = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      })
      .catch(() => {
        // 네트워크 실패 시 캐시에서 가져오기
        return caches.match(event.request)
          .then((response) => {
            if (response) {
              return response;
            }
            // 캐시에도 없으면 오프라인 페이지 또는 기본 응답
            return new Response('오프라인 상태입니다.', {
              headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
          });
      })
  );
});
