const CACHE_NAME = "skmedkart-customer-v2";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./app.js",
  "./firebase-config.js",
  "./icon-192.png",
  "./icon-512.png"
];


/* INSTALL */

self.addEventListener("install", (event) => {

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(APP_FILES);
      })
      .then(() => self.skipWaiting())
  );

});


/* ACTIVATE */

self.addEventListener("activate", (event) => {

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {

        return Promise.all(

          cacheNames.map((cacheName) => {

            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }

          })

        );

      })
      .then(() => self.clients.claim())
  );

});


/* FETCH */

self.addEventListener("fetch", (event) => {

  if (event.request.method !== "GET") {
    return;
  }


  /* PAGE NAVIGATION - NETWORK FIRST */

  if (event.request.mode === "navigate") {

    event.respondWith(

      fetch(event.request)

        .then((response) => {

          const responseClone = response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseClone);
            });

          return response;

        })

        .catch(() => {
          return caches.match(event.request)
            .then((cachedResponse) => {
              return cachedResponse || caches.match("./index.html");
            });
        })

    );

    return;

  }


  /* OTHER FILES - CACHE FIRST */

  event.respondWith(

    caches.match(event.request)

      .then((cachedResponse) => {

        if (cachedResponse) {
          return cachedResponse;
        }


        return fetch(event.request)

          .then((response) => {

            if (
              !response ||
              response.status !== 200 ||
              response.type !== "basic"
            ) {
              return response;
            }


            const responseClone = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseClone);
              });

            return response;

          });

      })

  );

});
