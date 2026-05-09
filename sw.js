// G-DEAL PWA Service Worker
const CACHE_NAME = 'gdeal-v35';

// 알림 → 페이지 네비게이션 전달용 IndexedDB 큐
//   iOS PWA가 백그라운드에서 종료된 상태로 알림이 오면, 페이지가 콜드 스타트 되는 동안
//   SW의 postMessage가 메시지 리스너 등록 전에 사라져 직전 탭이 그대로 보이는 문제가 있음.
//   영속 저장소에 목적지를 기록해 두고 페이지 init 시 읽어 네비게이션하면 콜드 스타트도 안전.
function openNavQueue() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('gdeal-nav', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('queue')) {
        req.result.createObjectStore('queue');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function setPendingNav(url) {
  try {
    const db = await openNavQueue();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('queue', 'readwrite');
      tx.objectStore('queue').put({ url: url, ts: Date.now() }, 'pending');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn('pendingNav 기록 실패:', e);
  }
}

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

// 백그라운드 메시지 수신 (data-only 메시지)
messaging.onBackgroundMessage((payload) => {
  console.log('백그라운드 메시지 수신:', payload);

  // Cloud Function에서 data-only로 보내므로 payload.data에서 값을 읽음
  const notificationTitle = payload.data?.title || payload.notification?.title || 'G-DEAL 알림';
  const notificationOptions = {
    body: payload.data?.body || payload.notification?.body || '새로운 소식이 있습니다.',
    icon: payload.data?.icon || '/icon-192.png',
    badge: '/icon-badge.svg',
    tag: payload.data?.tag || 'gdeal-notification',
    data: payload.data,
    requireInteraction: true,
    actions: [
      { action: 'open', title: '열기' },
      { action: 'close', title: '닫기' }
    ]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// 알림 클릭 이벤트 - 해당 탭으로 이동
self.addEventListener('notificationclick', (event) => {
  console.log('알림 클릭:', event);
  event.notification.close();

  if (event.action === 'close') return;

  const urlToOpen = event.notification.data?.url || '/home/';
  const absoluteUrl = new URL(urlToOpen, self.location.origin).href;

  event.waitUntil((async () => {
    try {
      // 핫패스 실패 대비: 콜드 스타트로 페이지가 새로 뜨더라도 init 시 읽어 갈 수 있게
      // IndexedDB에 목적지 URL을 먼저 기록 (postMessage 유실에 대한 안전망)
      await setPendingNav(absoluteUrl);

      const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });

      // 1) 이미 목표 URL의 창이 열려 있으면 포커스만
      for (const client of windowClients) {
        if (client.url === absoluteUrl) {
          return client.focus();
        }
      }

      // 2) 같은 origin의 창이 있으면 포커스 후 postMessage로 네비게이션 지시
      //    (client.navigate()는 iOS PWA에서 불안정하므로 postMessage 방식 사용)
      //    살아있는 페이지엔 즉시 반영, 콜드 스타트는 IDB 폴백으로 처리됨.
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin)) {
          client.postMessage({ type: 'GDEAL_NAVIGATE', url: absoluteUrl });
          if ('focus' in client) return client.focus();
          return;
        }
      }

      // 3) 열려있는 창이 없으면 새 창
      if (clients.openWindow) {
        return clients.openWindow(absoluteUrl);
      }
    } catch (err) {
      console.error('알림 클릭 처리 실패:', err);
    }
  })());
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
    return;
  }

  // http/https 스킴만 캐시 가능 (chrome-extension 등 제외)
  const url = new URL(event.request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
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
