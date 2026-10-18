import { Octokit } from '@octokit/core'

const REPO = import.meta.env.VITE_GITHUB_REPO || 'gnutnaux337/special-disco'
const BRANCH = 'publish'
const POSTS_PATH = 'posts'
const [OWNER, REPO_NAME] = REPO.split('/')

let _octokit: Octokit | null = null

export function initOctokit(token: string) {
  _octokit = new Octokit({ auth: token })
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
  content: string
}

export interface PostSummary {
  name: string
  path: string
  createdAt?: string
}

// The Contents API has no dates, so a file's creation time is the date of the
// oldest commit that touched it (last page of a per_page=1 commit listing).
async function getCreatedAt(path: string): Promise<string | undefined> {
  const base = `https://api.github.com/repos/${OWNER}/${REPO_NAME}/commits?sha=${BRANCH}&path=${encodeURIComponent(path)}&per_page=1`
  try {
    const first = await fetch(base)
    if (!first.ok) return undefined
    const last = first.headers.get('link')?.match(/[?&]page=(\d+)>; rel="last"/)?.[1]
    const res = last ? await fetch(`${base}&page=${last}`) : first
    if (!res.ok) return undefined
    const [commit] = await res.json()
    return commit?.commit?.committer?.date ?? commit?.commit?.author?.date
  } catch {
    return undefined
  }
}

// Reads are public (the repo is public), so no token is needed.
export async function listPosts(): Promise<PostSummary[]> {
  const res = await fetch(
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
    content: await res.text(),
  }
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
  content: string,
  message: string,
): Promise<void> {
  const octokit = getOctokit()
  const path = `${POSTS_PATH}/${filename}`

  await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
    owner: OWNER,
    repo: REPO_NAME,
    path,
    message,
    content: btoa(content),
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
  content: string,
  message: string,
): Promise<void> {
  const octokit = getOctokit()
  const sha = await getSha(path)

  await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
    owner: OWNER,
    repo: REPO_NAME,
    path,
    message,
    content: btoa(content),
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
export async function uploadMedia(name: string, blob: Blob): Promise<string> {
  const octokit = getOctokit()
  const path = `${POSTS_PATH}/images/${name}`

  await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
    owner: OWNER,
    repo: REPO_NAME,
    path,
    message: `Upload ${name}`,
    content: await blobToBase64(blob),
    branch: BRANCH,
  })

  return `https://raw.githubusercontent.com/${OWNER}/${REPO_NAME}/${BRANCH}/${path}`
}
