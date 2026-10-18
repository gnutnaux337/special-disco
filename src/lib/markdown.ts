import { Marked } from 'marked'
import DOMPurify from 'dompurify'

const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v)(?:[?#].*)?$/i

// `photo.jpg.enc` / `clip.mp4.enc`: encrypted media. The real type is the
// extension before `.enc`; the page decrypts it into a blob URL after render.
const ENC_EXT = /\.(\w+)\.enc(?:[?#].*)?$/i

const marked = new Marked({
  renderer: {
    // `![caption](clip.mp4)` renders as a video player instead of an image.
    image({ href, title, text }) {
      const enc = ENC_EXT.exec(href)
      if (enc) {
        const alt = text.replace(/"/g, '&quot;')
        return VIDEO_EXT.test(`.${enc[1]}`)
          ? `<video data-enc-src="${href}" controls preload="metadata" playsinline></video>`
          : `<img data-enc-src="${href}" alt="${alt}">`
      }
      if (VIDEO_EXT.test(href)) {
        const attrs = title ? ` title="${title.replace(/"/g, '&quot;')}"` : ''
        return `<video src="${href}" controls preload="metadata" playsinline${attrs}>${text}</video>`
      }
      return false
    },
  },
})

export function renderMarkdown(src: string): string {
  return DOMPurify.sanitize(marked.parse(src) as string, {
    ADD_TAGS: ['video', 'source'],
    ADD_ATTR: ['controls', 'preload', 'playsinline'],
  })
}
