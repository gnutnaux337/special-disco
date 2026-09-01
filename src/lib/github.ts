import { Octokit } from '@octokit/core'

const REPO = import.meta.env.VITE_GITHUB_REPO || 'gnutnaux337/special-disco'
const BRANCH = 'publish'
const POSTS_PATH = 'posts'
const [OWNER, REPO_NAME] = REPO.split('/')

let _octokit: Octokit | null = null

export function initOctokit(token: string) {
  _octokit = new Octokit({ auth: token })
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
}

// Reads are public (the repo is public), so no token is needed.
export async function listPosts(): Promise<PostSummary[]> {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO_NAME}/contents/${POSTS_PATH}?ref=${BRANCH}`,
  )
  if (!res.ok) throw new Error(`Failed to list posts (${res.status})`)
  const data = await res.json()
  if (!Array.isArray(data)) return []
  return data
    .filter((item: { type?: string }) => item.type === 'file')
    .map((item: { name: string; path: string }) => ({ name: item.name, path: item.path }))
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

// Commit an image into posts/images/ and return its public raw URL.
export async function uploadImage(name: string, blob: Blob): Promise<string> {
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
