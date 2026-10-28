import { fetchBytes, uploadMedia, MEDIA_URL_PREFIX } from '@/lib/github'
import { encryptBytes } from '@/lib/crypto'
import { parseFrontmatter, setFrontmatter } from '@/lib/postMeta'

export type StepProgress = (label: string, fraction: number) => void

// Media uploaded while encryption was off is public. Before saving an
// encrypted post, re-upload every such repo image/video/audio as an encrypted
// `.enc` copy and point the post at it. (The original file is left in the repo;
// it must be deleted by hand, and stays in git history.)
export async function encryptEmbeddedMedia(
  content: string,
  password: string,
  onProgress: StepProgress,
): Promise<string> {
  const re = /!\[[^\]]*\]\((\S+?)\)/g
  const urls = [
    ...new Set(
      [...content.matchAll(re)]
        .map((m) => m[1]!)
        .filter((u) => u.startsWith(MEDIA_URL_PREFIX) && !/\.enc(?:[?#].*)?$/i.test(u)),
    ),
  ]

  // Frontmatter music is not a markdown embed, so it needs its own pass.
  const music = parseFrontmatter(content).meta.music
  const musicUrl =
    music && music.startsWith(MEDIA_URL_PREFIX) && !/\.enc(?:[?#].*)?$/i.test(music) ? music : null
  const total = urls.length + (musicUrl ? 1 : 0)

  let out = content
  const encryptOne = async (url: string, index: number): Promise<string> => {
    const label = `Encrypting media ${index + 1}/${total}`
    const step = (part: number) => (f: number) => onProgress(label, (index + part + f / 3) / total)
    const plain = await fetchBytes(url, step(0))
    const enc = await encryptBytes(plain, password, step(1 / 3))
    const base = decodeURIComponent(url.slice(MEDIA_URL_PREFIX.length))
    return uploadMedia(`${Date.now()}-${base}.enc`, new Blob([enc as BlobPart]), step(2 / 3))
  }

  for (let i = 0; i < urls.length; i++) {
    const encUrl = await encryptOne(urls[i]!, i)
    out = out.split(urls[i]!).join(encUrl)
  }
  if (musicUrl) {
    out = setFrontmatter(out, { music: await encryptOne(musicUrl, urls.length) })
  }
  return out
}
