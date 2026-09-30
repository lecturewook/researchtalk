'use strict';

// index.html 버전과 함께 올려주세요.
// 배포 시 이 값이 바뀌면 이전 캐시는 자동으로 정리됩니다.
const CACHE_VERSION = 'researchtalk-shell-v16-excel-hangul';

const BASE = self.registration.scope;

const ASSETS = [
  './',
  './index.html',
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


/* =========================================================
   기본 URL
========================================================= */

function appUrl(path = './') {
  return new URL(path, BASE).href;
}


/* =========================================================
   앱 아이콘 배지
   - 읽지 않은 메시지가 있으면 숫자 표시
   - 모두 읽으면 제거
========================================================= */

async function setBadge(count) {
  const n = Number(count) || 0;

  try {
    if (n > 0 && 'setAppBadge' in navigator) {

      await navigator.setAppBadge(n);

    } else if (
      n <= 0 &&
      'clearAppBadge' in navigator
    ) {

      await navigator.clearAppBadge();
    }

  } catch (error) {

    console.warn(
      '[researchtalk] badge update failed:',
      error
    );
  }
}


/* =========================================================
   Service Worker 설치
========================================================= */

self.addEventListener('install', event => {

  event.waitUntil((async () => {

    const cache =
      await caches.open(CACHE_VERSION);

    await cache.addAll(
      ASSETS.map(url =>
        new Request(url, {
          cache: 'reload'
        })
      )
    );

    await self.skipWaiting();

  })());
});


/* =========================================================
   이전 캐시 삭제
========================================================= */

self.addEventListener('activate', event => {

  event.waitUntil((async () => {

    const names =
      await caches.keys();

    await Promise.all(

      names
        .filter(name =>
          name.startsWith(
            'researchtalk-shell-'
          ) &&
          name !== CACHE_VERSION
        )
        .map(name =>
          caches.delete(name)
        )

    );

    await self.clients.claim();

  })());
});


/* =========================================================
   파일 요청 처리
========================================================= */

self.addEventListener('fetch', event => {

  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url =
    new URL(request.url);

  // 다른 사이트 요청은 건드리지 않음
  if (
    url.origin !==
    self.location.origin
  ) {
    return;
  }


  /*
    index.html 등에 붙은

    ?ui=compact-...
    ?v=20260929

    같은 버전값 제거
  */

  url.search = '';


  const rootPath =
    new URL('./', BASE).pathname;

  const indexPath =
    new URL(
      './index.html',
      BASE
    ).pathname;


  const isAppPage =
    request.mode === 'navigate' &&
    (
      url.pathname === rootPath ||
      url.pathname === indexPath
    );


  /*
    우리가 관리하는 앱 파일만
    캐시 처리
  */

  if (
    !isAppPage &&
    !ASSET_SET.has(url.href)
  ) {
    return;
  }


  event.respondWith((async () => {

    /* -----------------------------------------
       index.html
       → network first

       새 배포가 빠르게 반영되도록 함
    ----------------------------------------- */

    if (isAppPage) {

      const indexKey =
        appUrl('./index.html');

      try {

        const fresh =
          await fetch(
            new Request(
              indexKey,
              {
                cache: 'no-store'
              }
            )
          );


        if (
          fresh &&
          fresh.ok
        ) {

          const cache =
            await caches.open(
              CACHE_VERSION
            );

          cache.put(
            indexKey,
            fresh.clone()
          );

          return fresh;
        }

      } catch (_) {

        // 인터넷이 없으면
        // 아래 캐시를 사용

      }


      const cached =
        await caches.match(
          indexKey,
          {
            cacheName:
              CACHE_VERSION
          }
        );


      if (cached) {
        return cached;
      }


      return fetch(request);
    }


    /* -----------------------------------------
       JS / CSS / 아이콘
       → cache first
    ----------------------------------------- */

    const cached =
      await caches.match(
        url.href,
        {
          cacheName:
            CACHE_VERSION
        }
      );


    if (cached) {
      return cached;
    }


    const fresh =
      await fetch(request);


    if (
      fresh &&
      fresh.ok
    ) {

      const cache =
        await caches.open(
          CACHE_VERSION
        );

      cache.put(
        url.href,
        fresh.clone()
      );
    }


    return fresh;

  })());
});


/* =========================================================
   index.html → Service Worker 메시지

   index.html에서 아래처럼 보내면 됩니다.

   navigator.serviceWorker.controller?.postMessage({
     type: 'SET_BADGE',
     count: unreadCount
   });

========================================================= */

self.addEventListener(
  'message',
  event => {

    const data =
      event.data || {};


    /* 읽지 않은 메시지 숫자 */

    if (
      data.type ===
      'SET_BADGE'
    ) {

      event.waitUntil(
        setBadge(
          data.count
        )
      );
    }


    /* 배지 지우기 */

    if (
      data.type ===
      'CLEAR_BADGE'
    ) {

      event.waitUntil(
        setBadge(0)
      );
    }


    /* 새 Service Worker 즉시 적용 */

    if (
      data.type ===
      'SKIP_WAITING'
    ) {

      self.skipWaiting();
    }

  }
);


/* =========================================================
   PUSH 알림

   주의:
   아래 코드가 있다고 해서
   Push가 바로 작동하는 것은 아닙니다.

   나중에

   1. Push 구독
   2. Supabase에 구독정보 저장
   3. Edge Function에서 Push 발송

   을 추가하면 이 부분이 작동합니다.
========================================================= */

self.addEventListener(
  'push',
  event => {

    event.waitUntil((async () => {

      let payload = {};


      /* Push 데이터 읽기 */

      if (event.data) {

        try {

          payload =
            event.data.json();

        } catch (_) {

          payload = {
            body:
              event.data.text()
          };

        }
      }


      const title =
        payload.title ||
        'researchtalk';


      const body =
        payload.body ||
        '새 메시지가 도착했습니다.';


      /*
        서버에서 다음 중 어떤 이름으로
        보내더라도 읽음 숫자로 인식
      */

      const unreadCount =
        Number(
          payload.unreadCount ??
          payload.unread_count ??
          payload.count
        ) || 0;


      /* 앱 아이콘 숫자 */

      await setBadge(
        unreadCount
      );


      /* 시스템 알림 */

      await self.registration
        .showNotification(
          title,
          {

            body,

            icon:
              appUrl(
                './icons/icon-192.jpg'
              ),

            badge:
              appUrl(
                './icons/favicon-32.jpg'
              ),

            tag:
              payload.tag ||
              'researchtalk-message',

            renotify: true,

            data: {

              url:
                payload.url ||
                appUrl('./'),

              roomId:
                payload.roomId ||
                payload.room_id ||
                null

            }

          }
        );

    })());

  }
);


/* =========================================================
   PUSH 알림 클릭

   이미 researchtalk가 열려 있으면
   그 창을 앞으로 가져옵니다.

   열려 있지 않으면 새 창을 엽니다.
========================================================= */

self.addEventListener(
  'notificationclick',
  event => {

    event.notification.close();


    event.waitUntil((async () => {

      const targetUrl =
        event.notification
          .data?.url ||
        appUrl('./');


      const windows =
        await self.clients
          .matchAll({

            type: 'window',

            includeUncontrolled:
              true

          });


      /*
        이미 열린 researchtalk가 있으면
        그 창을 활성화
      */

      for (
        const client of windows
      ) {

        if ('focus' in client) {

          if (
            'navigate' in client
          ) {

            try {

              await client.navigate(
                targetUrl
              );

            } catch (_) {}

          }


          return client.focus();
        }
      }


      /*
        열린 창이 없으면
        새 창 실행
      */

      if (
        self.clients.openWindow
      ) {

        return self.clients
          .openWindow(
            targetUrl
          );
      }

    })());

  }
);
