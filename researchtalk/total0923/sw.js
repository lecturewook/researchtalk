'use strict';

// index.html 버전과 함께 올려주세요.
// 배포 시 이 값이 바뀌면 이전 캐시는 자동으로 정리됩니다.
const CACHE_VERSION = 'researchtalk-shell-v17-onesignal';

const BASE = self.registration.scope;

const ASSETS = [
  './',
  './index.html',
  './onesignal.js',
  './styles.css',
  './vendor/supabase.js',
  './dates.js',
  './config.js',
  './storage.js',
  './summary.js',
  './app.js',
  './manifest.webmanifest',

  // 현재 사용 중인 아이콘
  './icons/icon.svg',
  './icons/favicon-32.jpg',
  './icons/favicon-32-hangul.png',
  './icons/apple-touch-icon.jpg',
  './icons/icon-192.jpg',
  './icons/icon-512.jpg',
  './icons/maskable-512.jpg'
].map(path => new URL(path, BASE).href);

const ASSET_SET = new Set(ASSETS);

function appUrl(path = './') {
  return new URL(path, BASE).href;
}

async function setBadge(count) {
  const n = Number(count) || 0;

  try {
    if (n > 0 && 'setAppBadge' in navigator) {
      await navigator.setAppBadge(n);
    } else if (n <= 0 && 'clearAppBadge' in navigator) {
      await navigator.clearAppBadge();
    }
  } catch (error) {
    console.warn('[researchtalk] badge update failed:', error);
  }
}

// 새 화면 파일을 저장한 다음 새 버전을 즉시 활성화합니다.
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);

    await cache.addAll(
      ASSETS.map(url => new Request(url, {
        cache: 'reload'
      }))
    );

    await self.skipWaiting();
  })());
});

// 이전 화면의 캐시를 정리합니다.
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();

    await Promise.all(
      names
        .filter(name =>
          name.startsWith('researchtalk-shell-') &&
          name !== CACHE_VERSION
        )
        .map(name => caches.delete(name))
    );

    await self.clients.claim();
  })());
});

// 화면 파일을 제공합니다.
// index.html은 새 배포가 빨리 반영되도록 network-first,
// 나머지 정적 파일은 cache-first로 처리합니다.
self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  // HTML에 붙어 있는 ?ui=... 같은 버전 쿼리는 같은 파일로 처리합니다.
  url.search = '';

  const rootPath = new URL('./', BASE).pathname;
  const indexPath = new URL('./index.html', BASE).pathname;

  const isAppPage =
    request.mode === 'navigate' &&
    (url.pathname === rootPath || url.pathname === indexPath);

  if (!isAppPage && !ASSET_SET.has(url.href)) return;

  event.respondWith((async () => {
    if (isAppPage) {
      const indexKey = appUrl('./index.html');

      try {
        const fresh = await fetch(new Request(indexKey, {
          cache: 'no-store'
        }));

        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE_VERSION);
          cache.put(indexKey, fresh.clone());
          return fresh;
        }
      } catch (_) {
        // 오프라인이면 아래 캐시로 폴백
      }

      const cached = await caches.match(indexKey, {
        cacheName: CACHE_VERSION
      });

      if (cached) return cached;

      return fetch(request);
    }

    const cached = await caches.match(url.href, {
      cacheName: CACHE_VERSION
    });

    if (cached) return cached;

    const fresh = await fetch(request);

    if (fresh && fresh.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(url.href, fresh.clone());
    }

    return fresh;
  })());
});

// index.html에서 읽지 않은 메시지 수를 Service Worker에 전달할 때 사용합니다.
// 예:
// navigator.serviceWorker.controller?.postMessage({
//   type: 'SET_BADGE',
//   count: unreadCount
// });
self.addEventListener('message', event => {
  const data = event.data || {};

  if (data.type === 'SET_BADGE') {
    event.waitUntil(setBadge(data.count));
  }

  if (data.type === 'CLEAR_BADGE') {
    event.waitUntil(setBadge(0));
  }

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Web Push를 나중에 연결했을 때 바로 사용할 수 있는 수신부입니다.
// 이 코드만으로 Push가 활성화되는 것은 아니며,
// Push 구독 + 서버/Edge Function 발송 로직이 별도로 필요합니다.
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload = {};

    if (event.data) {
      try {
        payload = event.data.json();
      } catch (_) {
        payload = {
          body: event.data.text()
        };
      }
    }

    const title = payload.title || 'researchtalk';
    const body = payload.body || '새 메시지가 도착했습니다.';
    const unreadCount =
      Number(payload.unreadCount ?? payload.unread_count ?? payload.count) || 0;

    await setBadge(unreadCount);

    await self.registration.showNotification(title, {
      body,
      icon: appUrl('./icons/icon-192.jpg'),
      badge: appUrl('./icons/favicon-32.jpg'),
      tag: payload.tag || 'researchtalk-message',
      renotify: true,
      data: {
        url: payload.url || appUrl('./'),
        roomId: payload.roomId || payload.room_id || null
      }
    });
  })());
});

// 알림을 누르면 기존 researchtalk 창을 앞으로 가져오고,
// 없으면 새 창을 엽니다.
self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil((async () => {
    const targetUrl =
      event.notification.data?.url ||
      appUrl('./');

    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of windows) {
      if ('focus' in client) {
        if ('navigate' in client) {
          try {
            await client.navigate(targetUrl);
          } catch (_) {}
        }

        return client.focus();
      }
    }

    if (self.clients.openWindow) {
      return self.clients.openWindow(targetUrl);
    }
  })());
});
