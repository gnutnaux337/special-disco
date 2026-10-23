import { Marked } from 'marked'
import DOMPurify from 'dompurify'

const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v)(?:[?#].*)?$/i

// Sound files (voice memos, mp3s) get an audio player. `.weba` is recorded
// audio/webm; `.ogg` stays video because it was already used for clips.
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|oga|flac|opus|weba)(?:[?#].*)?$/i

// `photo.jpg.enc` / `clip.mp4.enc`: encrypted media. The real type is the
// extension before `.enc`; the page decrypts it into a blob URL after render.
const ENC_EXT = /\.(\w+)\.enc(?:[?#].*)?$/i

const marked = new Marked({
  renderer: {
    // `![caption](clip.mp4)` renders as a video player and `![memo](memo.mp3)`
    // as an audio player instead of a broken image.
    image({ href, title, text }) {
      const enc = ENC_EXT.exec(href)
      if (enc) {
        const ext = `.${enc[1]}`
        const alt = text.replace(/"/g, '&quot;')
        if (AUDIO_EXT.test(ext)) {
          return `<audio data-enc-src="${href}" controls preload="metadata"${alt ? ` title="${alt}"` : ''}></audio>`
        }
        return VIDEO_EXT.test(ext)
          ? `<video data-enc-src="${href}" controls preload="metadata" playsinline></video>`
          : `<img data-enc-src="${href}" alt="${alt}">`
      }
      const attrs = title ? ` title="${title.replace(/"/g, '&quot;')}"` : ''
      if (AUDIO_EXT.test(href)) {
        return `<audio src="${href}" controls preload="metadata"${attrs}${text ? ` title="${text.replace(/"/g, '&quot;')}"` : ''}></audio>`
      }
      if (VIDEO_EXT.test(href)) {
        return `<video src="${href}" controls preload="metadata" playsinline${attrs}>${text}</video>`
      }
      return false
    },
  },
})

export function renderMarkdown(src: string): string {
  return DOMPurify.sanitize(marked.parse(src) as string, {
    ADD_TAGS: ['video', 'audio', 'source'],
    ADD_ATTR: ['controls', 'preload', 'playsinline'],
  })
}
