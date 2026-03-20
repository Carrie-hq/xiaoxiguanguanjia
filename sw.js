// Service Worker - 让网页可以离线使用
const CACHE_NAME = 'xiaoxiguanjia-v1';
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon-192x192.png',
  './icon-512x512.png'
];

// 安装时缓存资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('缓存已打开');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// 激活时清理旧缓存
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
    })
  );
  self.clients.claim();
});

// 拦截请求，优先使用缓存
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // 缓存命中，返回缓存
        if (response) {
          return response;
        }
        // 缓存未命中，发起网络请求
        return fetch(event.request).then((response) => {
          // 检查响应是否有效
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          // 克隆响应（因为响应只能使用一次）
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        });
      })
  );
});

// 后台同步（用于离线时记录的任务）
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-tasks') {
    event.waitUntil(syncTasks());
  }
});

// 推送通知
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : '任务时间到了！',
    icon: './icon-192x192.png',
    badge: './icon-72x72.png',
    vibrate: [200, 100, 200],
    tag: 'task-reminder',
    requireInteraction: true,
    actions: [
      {
        action: 'complete',
        title: '完成了'
      },
      {
        action: 'snooze',
        title: '稍后提醒'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('小习惯管家', options)
  );
});

// 点击通知
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'complete') {
    // 用户点击