const CACHE_NAME = 'ams-offline-v25';
const STATIC_ASSETS = [
    './',
    './index.html',
    './assets/css/styles.css?v=20260323-1',
    './assets/css/face-verification.css?v=20260323-1',
    './assets/js/app.js?v=20260323-1',
    './assets/js/face-verification.js?v=20260323-1',
    './assets/js/face-registration.js?v=20260323-1',
    './assets/img/logo-placeholder.svg',
    './assets/img/avatar-placeholder.svg',
    './manifest.json',
    // Face models (offline-ready)
    './assets/models/tiny_face_detector_model-weights_manifest.json',
    './assets/models/tiny_face_detector_model-shard1',
    './assets/models/face_landmark_68_model-weights_manifest.json',
    './assets/models/face_landmark_68_model-shard1',
    './assets/models/face_recognition_model-weights_manifest.json',
    './assets/models/face_recognition_model-shard1',
    './assets/models/face_recognition_model-shard2',
    './assets/models/ssd_mobilenetv1_model-weights_manifest.json',
    './assets/models/ssd_mobilenetv1_model-shard1',
    './assets/models/ssd_mobilenetv1_model-shard2',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', (evt) => {
    evt.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[ServiceWorker] Pre-caching offline page');
            return cache.addAll(STATIC_ASSETS).catch(err => {
                console.warn('[ServiceWorker] Some assets failed to cache:', err);
                // We don't want to fail the entire install if external CDN fails, so we just log and continue
            });
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
    evt.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[ServiceWorker] Removing old cache', key);
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim();
});

// Network-first strategy for API calls, Cache-first for static assets
self.addEventListener('fetch', (evt) => {
    // Ignore non-GET requests and browser extensions
    if (evt.request.method !== 'GET' || !evt.request.url.startsWith('http')) {
        return;
    }

    const url = new URL(evt.request.url);

    // API calls: Always network-only (session cookies must always be sent fresh, never cached)
    if (url.pathname.includes('/api.php') || url.pathname.includes('api.php')) {
        evt.respondWith(
            fetch(evt.request.clone(), { credentials: 'include' })
                .catch(() => {
                    // Return a minimal JSON error so the app can handle it gracefully
                    return new Response(JSON.stringify({ success: false, error: 'Offline' }), {
                        status: 503,
                        headers: { 'Content-Type': 'application/json' }
                    });
                })
        );
        return;
    }

    // Static assets: Cache first, fallback to network
    evt.respondWith(
        caches.match(evt.request).then((response) => {
            return response || fetch(evt.request).then((fetchResponse) => {
                return caches.open(CACHE_NAME).then((cache) => {
                    // Only cache successful external responses
                    if (evt.request.url.startsWith('http') && fetchResponse.status === 200) {
                        cache.put(evt.request, fetchResponse.clone());
                    }
                    return fetchResponse;
                });
            });
        }).catch(() => {
            // Optional: return a fallback offline page/image if nothing is available
            console.warn('[ServiceWorker] Fetch failed and no cache available for', evt.request.url);
        })
    );
});
