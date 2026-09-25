'use strict';

// 다음 업데이트에서는 v8을 v9, v10처럼 올려주세요.
const CACHE_VERSION = 'researchtalk-shell-v8-excel-compact';

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
  './icons/icon.svg',
  './icons/favicon-32.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png'
].map(path => new URL(path, BASE).href);

const ASSET_SET = new Set(ASSETS);

// 새 화면의 파일을 저장한 다음 새 버전을 활성화합니다.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(
        ASSETS.map(url => new Request(url, {
          cache: 'reload'
        }))
      ))
      .then(() => self.skipWaiting())
  );
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

// 화면 파일만 캐시에서 제공합니다.
self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  // HTML에 붙어 있는 ?ui=... 주소도 같은 파일로 처리합니다.
  url.search = '';

  const isAppPage = request.mode === 'navigate' && (
    url.pathname === new URL('./', BASE).pathname ||
    url.pathname === new URL('./index.html', BASE).pathname
  );

  if (!isAppPage && !ASSET_SET.has(url.href)) return;

  event.respondWith((async () => {
    const key = isAppPage
      ? new URL('./index.html', BASE).href
      : url.href;

    const cached = await caches.match(key, {
      cacheName: CACHE_VERSION
    });

    return cached || fetch(request);
  })());
});
