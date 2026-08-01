// sw.js - Minimaler Service Worker für PWA-Installierbarkeit
const CACHE_NAME = 'lie-scorecard-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Leitet alle Netzwerk-Anfragen normal durch
  event.respondWith(fetch(event.request));
});