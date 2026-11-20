/* 서유의 경찰 아저씨 – 오프라인 지원 서비스 워커
   GitHub Pages 프로젝트 경로(/Seoyu-police-call/)에서도 동작하도록 모든 경로는 상대경로를 사용합니다. */
'use strict';

var CACHE_NAME = 'seoyu-call-v1';
var APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

/* 설치: 앱 셸을 미리 캐시하고 즉시 활성화 */
self.addEventListener('install', function (event) {
  event.waitUntil(
    (async function () {
      var cache = await caches.open(CACHE_NAME);
      await Promise.all(
        APP_SHELL.map(async function (url) {
          try {
            var res = await fetch(url, { cache: 'reload' });
            if (res && res.ok) await cache.put(url, res);
          } catch (e) {
            /* 한 항목이 실패해도 설치 자체는 계속 진행 */
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

/* 활성화: 이전 버전 캐시 정리 후 바로 페이지 제어 */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    (async function () {
      var keys = await caches.keys();
      await Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_NAME) return caches.delete(key);
          return null;
        })
      );
      await self.clients.claim();
    })()
  );
});

function offlineDocument() {
  return new Response(
    '<!doctype html><html lang="ko"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>서유의 경찰 아저씨</title></head>' +
      '<body style="margin:0;background:#05070c;color:#f5c96a;font-family:sans-serif;' +
      'display:flex;align-items:center;justify-content:center;height:100vh;text-align:center">' +
      '<p>네트워크에 연결된 뒤 다시 열어 주세요.</p></body></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

self.addEventListener('fetch', function (event) {
  var request = event.request;

  if (request.method !== 'GET') return;

  var url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  /* 페이지 이동(문서 요청): 캐시 우선 → 백그라운드 갱신 → 없으면 네트워크 */
  if (request.mode === 'navigate') {
    event.respondWith(
      (async function () {
        var cache = await caches.open(CACHE_NAME);
        var cached = (await cache.match('./index.html')) || (await cache.match('./'));

        var network = fetch(request)
          .then(async function (res) {
            if (res && res.ok) {
              try {
                await cache.put('./index.html', res.clone());
              } catch (e) {}
            }
            return res;
          })
          .catch(function () {
            return null;
          });

        if (cached) return cached;

        var fresh = await network;
        return fresh || (await cache.match('./index.html')) || offlineDocument();
      })()
    );
    return;
  }

  /* 그 밖의 요청: 캐시 우선, 없으면 네트워크 후 캐시 저장 */
  event.respondWith(
    (async function () {
      var cache = await caches.open(CACHE_NAME);
      var cached = await cache.match(request);
      if (cached) return cached;

      try {
        var res = await fetch(request);
        if (res && res.ok && res.type === 'basic') {
          try {
            await cache.put(request, res.clone());
          } catch (e) {}
        }
        return res;
      } catch (e) {
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })()
  );
});
