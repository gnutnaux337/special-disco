// Cache-first service worker for post media (images/videos committed to the
// repo and served from raw.githubusercontent.com). Uploaded files get a
// unique timestamped name, so a cached copy never goes stale.
const CACHE = 'post-media-v1'
const MEDIA = /\.(png|jpe?g|gif|webp|avif|svg|mp4|webm|ogg|mov|m4v|enc)$/i
const MAX_VIDEO_BYTES = 25 * 1024 * 1024

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

function sliceRange(full, rangeHeader) {
  return full.arrayBuffer().then((buf) => {
    const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
    const size = buf.byteLength
    const start = m[1] ? parseInt(m[1], 10) : Math.max(0, size - parseInt(m[2], 10))
    const end = m[1] && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1
    return new Response(buf.slice(start, end + 1), {
      status: 206,
      headers: {
        'Content-Type': full.headers.get('Content-Type') || 'application/octet-stream',
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': String(end - start + 1),
        'Accept-Ranges': 'bytes',
      },
    })
  })
}

async function handle(request) {
  const cache = await caches.open(CACHE)
  const url = request.url
  const range = request.headers.get('range')

  const cached = await cache.match(url)
  if (cached) return range ? sliceRange(cached, range) : cached

  // Fetch with CORS so the response is readable (raw.githubusercontent allows *).
  if (!range) {
    const res = await fetch(url, { mode: 'cors' })
    if (res.ok) cache.put(url, res.clone())
    return res
  }

  // Ranged (video) request not cached yet: stream from network now, and in the
  // background cache the whole file if it is small enough.
  const net = fetch(request)
  fetch(url, { mode: 'cors' }).then(async (res) => {
    const len = Number(res.headers.get('content-length') || Infinity)
    if (res.ok && len <= MAX_VIDEO_BYTES) await cache.put(url, res)
  }).catch(() => {})
  return net
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.hostname !== 'raw.githubusercontent.com' || !MEDIA.test(url.pathname)) return
  event.respondWith(handle(request).catch(() => fetch(request)))
})
