import { Marked } from 'marked'
import DOMPurify from 'dompurify'

const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v)(?:[?#].*)?$/i

const marked = new Marked({
  renderer: {
    // `![caption](clip.mp4)` renders as a video player instead of an image.
    image({ href, title, text }) {
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
