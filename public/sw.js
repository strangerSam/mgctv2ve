const CACHE_NAME = 'movie-cache-v1';

self.addEventListener('fetch', (event) => {
    // Ne gérer que les requêtes d'images
    if (event.request.url.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((response) => {
                    // Retourner la réponse du cache si elle existe
                    if (response) {
                        return response;
                    }

                    // Sinon, faire la requête au réseau
                    return fetch(event.request).then((networkResponse) => {
                        // Mettre en cache la nouvelle image
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
                    });
                });
            })
        );
    }
});