import { fetchBytes, uploadMedia, MEDIA_URL_PREFIX } from '@/lib/github'
import { encryptBytes } from '@/lib/crypto'

export type StepProgress = (label: string, fraction: number) => void

// Media uploaded while encryption was off is public. Before saving an
// encrypted post, re-upload every such repo image/video as an encrypted `.enc`
// copy and point the post at it. (The original file is left in the repo; it
// must be deleted by hand, and stays in git history.)
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

  let out = content
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]!
    const label = `Encrypting media ${i + 1}/${urls.length}`
    const step = (part: number) => (f: number) => onProgress(label, (i + part + f / 3) / urls.length)
    const plain = await fetchBytes(url, step(0))
    const enc = await encryptBytes(plain, password, step(1 / 3))
    const base = decodeURIComponent(url.slice(MEDIA_URL_PREFIX.length))
    const encUrl = await uploadMedia(`${Date.now()}-${base}.enc`, new Blob([enc as BlobPart]), step(2 / 3))
    out = out.split(url).join(encUrl)
  }
  return out
}
