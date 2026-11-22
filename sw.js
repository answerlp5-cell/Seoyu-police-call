/* 서유의 경찰 아저씨 – 오프라인 지원 서비스 워커
   GitHub Pages 프로젝트 경로(/Seoyu-police-call/)에서도 동작하도록 모든 경로는 상대경로를 사용합니다.

   v4: 문서(navigate) 요청을 네트워크 우선으로 바꿔, 새 버전이 배포되면
       홈 화면 앱에서도 다음 실행/새로고침 때 바로 최신 index.html이 보이게 합니다. */
'use strict';

var CACHE_NAME = 'seoyu-call-v4';
var NAV_TIMEOUT = 3000; /* 문서 요청 네트워크 대기 한도(ms) – 느리면 곧바로 캐시로 폴백 */
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

/* HTTP 캐시를 건너뛰고 네트워크에서 새 문서를 받아옵니다.
   navigate 요청에 init을 넘기지 못하는 브라우저(Safari 등)를 위해 일반 fetch로 한 번 더 시도합니다. */
function fetchFresh(request) {
  var first;
  try {
    first = Promise.resolve(fetch(request, { cache: 'no-cache' }));
  } catch (e) {
    first = Promise.reject(e);
  }
  return first.catch(function () {
    return fetch(request);
  });
}

/* 느린 네트워크에서 기다리지 않도록 promise에 시간 제한을 둡니다 (제한 초과 시 null) */
function withTimeout(promise, ms) {
  return new Promise(function (resolve) {
    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      resolve(null);
    }, ms);
    promise.then(function (value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    });
  });
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

  /* 페이지 이동(문서 요청): 네트워크 우선 → 3초 안에 응답 없거나 실패하면 캐시 → 그것도 없으면 오프라인 안내 */
  if (request.mode === 'navigate') {
    event.respondWith(
      (async function () {
        var cache = await caches.open(CACHE_NAME);

        var network = fetchFresh(request).then(async function (res) {
          if (res && res.ok) {
            try {
              await cache.put('./index.html', res.clone());
            } catch (e) {}
          }
          return res;
        }).catch(function () {
          return null;
        });

        var fresh = await withTimeout(network, NAV_TIMEOUT);
        if (fresh && fresh.ok) return fresh;

        var cached = (await cache.match('./index.html')) || (await cache.match('./'));
        if (cached) return cached;

        var late = await network;
        if (late && late.ok) return late;

        return (await cache.match('./index.html')) || offlineDocument();
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
