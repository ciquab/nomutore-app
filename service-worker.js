const CACHE_NAME = 'nomutore-v25';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './css/style.css',      // 追加
    './js/main.js',         // 追加
    './js/constants.js',    // 追加
    './js/store.js',        // 追加
    './js/logic.js',        // 追加
    './js/ui.js',           // 追加
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap',
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://unpkg.com/dexie@3.2.4/dist/dexie.js'
];

// インストール時にキャッシュする
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
});

// リクエスト時にキャッシュがあればそれを返す
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => response || fetch(event.request))
    );
});