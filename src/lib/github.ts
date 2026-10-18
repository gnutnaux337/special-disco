import { Octokit } from '@octokit/core'

const REPO = import.meta.env.VITE_GITHUB_REPO || 'gnutnaux337/special-disco'
const BRANCH = 'publish'
const POSTS_PATH = 'posts'
const [OWNER, REPO_NAME] = REPO.split('/')

let _octokit: Octokit | null = null

let _token: string | null = null

export function initOctokit(token: string) {
  _token = token
  _octokit = new Octokit({ auth: token })
}

// The sign-in token is persisted by the auth store, so reads made before
// initOctokit runs (e.g. on first render) can still be authenticated.
function getToken(): string | null {
  if (_token) return _token
  try {
    return JSON.parse(localStorage.getItem('sb-auth') || 'null')?.provider_token ?? null
  } catch {
    return null
  }
}

// Authenticated GitHub API read (5000 req/h instead of 60). Falls back to an
// anonymous request if the stored token is expired or revoked.
async function apiFetch(url: string): Promise<Response> {
  const token = getToken()
  if (token) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status !== 401) return res
  }
  return fetch(url)
}

// Only users with push access to the repo may create, edit or delete posts.
export async function canWriteRepo(): Promise<boolean> {
  try {
    const { data } = await getOctokit().request('GET /repos/{owner}/{repo}', {
      owner: OWNER,
      repo: REPO_NAME,
    })
    return !!(data.permissions?.push || data.permissions?.admin)
  } catch {
    return false
  }
}

function getOctokit(): Octokit {
  if (!_octokit) throw new Error('Octokit not initialized. Sign in first.')
  return _octokit
}

export interface Post {
  name: string
  path: string
  bytes: Uint8Array
}

export interface PostSummary {
  name: string
  path: string
  createdAt?: string
}

// The Contents API has no dates, so a file's creation time is the date of the
// oldest commit that touched it (last page of a per_page=1 commit listing).
async function getCreatedAt(path: string): Promise<string | undefined> {
  // A creation date never changes, so remember it to save API calls.
  const cacheKey = `sd-created:${path}`
  try {
    const hit = localStorage.getItem(cacheKey)
    if (hit) return hit
  } catch {}
  const base = `https://api.github.com/repos/${OWNER}/${REPO_NAME}/commits?sha=${BRANCH}&path=${encodeURIComponent(path)}&per_page=1`
  try {
    const first = await apiFetch(base)
    if (!first.ok) return undefined
    const last = first.headers.get('link')?.match(/[?&]page=(\d+)>; rel="last"/)?.[1]
    const res = last ? await apiFetch(`${base}&page=${last}`) : first
    if (!res.ok) return undefined
    const [commit] = await res.json()
    const date: string | undefined = commit?.commit?.committer?.date ?? commit?.commit?.author?.date
    if (date) {
      try {
        localStorage.setItem(cacheKey, date)
      } catch {}
    }
    return date
  } catch {
    return undefined
  }
}

// Reads are public (the repo is public), so no token is needed.
export async function listPosts(): Promise<PostSummary[]> {
  const res = await apiFetch(
    `https://api.github.com/repos/${OWNER}/${REPO_NAME}/contents/${POSTS_PATH}?ref=${BRANCH}`,
  )
  if (!res.ok) throw new Error(`Failed to list posts (${res.status})`)
  const data = await res.json()
  if (!Array.isArray(data)) return []
  const files: PostSummary[] = data
    .filter((item: { type?: string }) => item.type === 'file')
    .map((item: { name: string; path: string }) => ({ name: item.name, path: item.path }))
  await Promise.all(
    files.map(async (f) => {
      f.createdAt = await getCreatedAt(f.path)
    }),
  )
  // Newest first; posts without a known date go last.
  return files.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
}

// raw.githubusercontent: plain text (no base64 inflation) and browser-cacheable,
// unlike the Contents API.
export async function getPost(path: string): Promise<Post> {
  const url = `https://raw.githubusercontent.com/${OWNER}/${REPO_NAME}/${BRANCH}/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Post not found: ${path}`)
  return {
    name: path.split('/').pop() ?? path,
    path,
    bytes: new Uint8Array(await res.arrayBuffer()),
  }
}

// Download a file, reporting progress when the server sends a length.
export async function fetchBytes(
  url: string,
  onProgress?: (fraction: number) => void,
): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download (${res.status})`)
  const total = Number(res.headers.get('content-length') || 0)
  if (!res.body || !total || !onProgress) return new Uint8Array(await res.arrayBuffer())

  const reader = res.body.getReader()
  const out = new Uint8Array(total)
  let got = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (got + value.length > out.length) throw new Error('Download size mismatch')
    out.set(value, got)
    got += value.length
    onProgress(got / total)
  }
  return out.subarray(0, got)
}

async function getSha(path: string): Promise<string> {
  const { data } = await getOctokit().request('GET /repos/{owner}/{repo}/contents/{path}', {
    owner: OWNER,
    repo: REPO_NAME,
    path,
    ref: BRANCH,
  })
  if (Array.isArray(data) || data.type !== 'file') throw new Error(`Not a file: ${path}`)
  return data.sha
}

export async function createPost(
  filename: string,
  content: string | Uint8Array,
  message: string,
): Promise<void> {
  const octokit = getOctokit()
  const path = `${POSTS_PATH}/${filename}`

  await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
    owner: OWNER,
    repo: REPO_NAME,
    path,
    message,
    content: await blobToBase64(new Blob([content as BlobPart])),
    branch: BRANCH,
  })
}

export async function deletePost(path: string, message: string): Promise<void> {
  const octokit = getOctokit()
  const sha = await getSha(path)

  await octokit.request('DELETE /repos/{owner}/{repo}/contents/{path}', {
    owner: OWNER,
    repo: REPO_NAME,
    path,
    message,
    sha,
    branch: BRANCH,
  })
}

export async function updatePost(
  path: string,
  content: string | Uint8Array,
  message: string,
): Promise<void> {
  const octokit = getOctokit()
  const sha = await getSha(path)

  await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
    owner: OWNER,
    repo: REPO_NAME,
    path,
    message,
    content: await blobToBase64(new Blob([content as BlobPart])),
    sha,
    branch: BRANCH,
  })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

// Commit an image or video into posts/images/ and return its public raw URL.
// Uses XHR (not fetch) because only XHR reports upload progress.
export async function uploadMedia(
  name: string,
  blob: Blob,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const token = getToken()
  if (!token) throw new Error('Sign in first.')
  const path = `${POSTS_PATH}/images/${name}`
  const body = JSON.stringify({
    message: `Upload ${name}`,
    content: await blobToBase64(blob),
    branch: BRANCH,
  })

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(
      'PUT',
      `https://api.github.com/repos/${OWNER}/${REPO_NAME}/contents/${path
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`,
    )
    xhr.setRequestHeader('Accept', 'application/vnd.github+json')
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      let msg = `Upload failed (${xhr.status})`
      try {
        msg = JSON.parse(xhr.responseText).message ?? msg
      } catch {}
      reject(new Error(msg))
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(body)
  })

  return `https://raw.githubusercontent.com/${OWNER}/${REPO_NAME}/${BRANCH}/${path}`
}
