const CACHE_NAME = 'nomutore-v26'; // バージョンを更新
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './style.css',          // パス修正 (css/削除)
    './main.js',            // パス修正 (js/削除)
    './constants.js',       // パス修正 (js/削除)
    './store.js',           // パス修正 (js/削除)
    './logic.js',           // パス修正 (js/削除)
    './ui.js',              // パス修正 (js/削除)
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap',
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://unpkg.com/dexie@3.2.4/dist/dexie.js',
    'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/+esm',
    'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/+esm'
];

// インストール時にキャッシュする
self.addEventListener('install', (event) => {
    // 新しいSWをすぐに有効化する
    self.skipWaiting();
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
});

// 新しいSWが有効になったら、古いキャッシュを削除する
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // すぐに制御を開始
    );
});

// リクエスト時にキャッシュがあればそれを返す
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // キャッシュがあれば返す、なければネットワークへ
                return response || fetch(event.request).catch(() => {
                    // オフライン等のエラーハンドリング（必要に応じて）
                });
            })
    );
});