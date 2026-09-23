/* 화면 파일을 바꿔 배포할 때 CACHE_VERSION도 바꾸면 새 오프라인 파일을 준비해요. */
'use strict';
const CACHE_VERSION = 'researchtalk-shell-v5-enter-badge';
const BASE = self.registration.scope;
const ASSETS = [
  './', './index.html',
  './manifest.webmanifest', './icons/icon.svg', './icons/favicon-32.png',
  './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png'
].map(path => new URL(path, BASE).href);
const ASSET_SET = new Set(ASSETS);

self.addEventListener('install', event => {
  // 모두 받아야 설치가 완료돼요. 실패하면 이전 오프라인 버전을 보존해요.
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('researchtalk-shell-') && name !== CACHE_VERSION).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate' && (url.pathname === new URL('./', BASE).pathname || url.pathname === new URL('./index.html', BASE).pathname)) {
    event.respondWith((async () => {
      // 화면과 코드를 같은 버전으로 불러옵니다.
      const cached = await caches.match(new URL('./index.html', BASE).href, { cacheName: CACHE_VERSION });
      return cached || fetch(request);
    })());
  } else if (ASSET_SET.has(url.href)) {
    event.respondWith((async () => {
      const cached = await caches.match(request, { cacheName: CACHE_VERSION });
      return cached || fetch(request);
    })());
  }
});
