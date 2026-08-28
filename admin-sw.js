'use strict';

const ADMIN_CACHE = 'nyj20-admin-pwa-v24';
const ADMIN_SHELL = [
  './admin.html',
  './admin.js',
  './style.css',
  './admin-manifest.webmanifest',
  './assets/admin-app-icon-192.png',
  './assets/admin-app-icon-512.png',
  './assets/admin-app-icon-180.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(ADMIN_CACHE)
      .then(cache => cache.addAll(ADMIN_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('nyj20-admin-pwa-') && key !== ADMIN_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isAdminAsset =
    path.endsWith('/admin.html') ||
    path.endsWith('/admin.js') ||
    path.endsWith('/style.css') ||
    path.endsWith('/admin-manifest.webmanifest') ||
    path.includes('/assets/admin-app-icon-');

  // 공개 초대장(index/public.js/public.css)은 서비스워커가 건드리지 않습니다.
  if (!isAdminAsset) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(ADMIN_CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, {ignoreSearch: true});
        if (cached) return cached;

        if (request.mode === 'navigate') {
          const shell = await caches.match('./admin.html', {ignoreSearch: true});
          if (shell) return shell;
        }
        return Response.error();
      })
  );
});
