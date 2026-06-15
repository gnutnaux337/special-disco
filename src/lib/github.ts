import { Octokit } from '@octokit/core'

const REPO = import.meta.env.VITE_GITHUB_REPO || 'gnutnaux337/special-disco'
const BRANCH = 'publish'
const POSTS_PATH = 'posts'

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
  sha: string
  content: string
  updatedAt: string
}

export interface PostSummary {
  name: string
  path: string
  sha: string
  updatedAt: string
}

export async function listPosts(): Promise<PostSummary[]> {
  const octokit = getOctokit()
  const [owner, repo] = REPO.split('/')
  const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
    owner,
    repo,
    path: POSTS_PATH,
    ref: BRANCH,
    headers: { 'If-None-Match': '' },
  })

  if (!Array.isArray(data)) {
    return []
  }

  return data
    .filter((item) => item.type === 'file')
    .map((item) => ({
      name: item.name,
      path: item.path,
      sha: item.sha,
      updatedAt: new Date().toISOString(),
    }))
}

export async function getPost(path: string): Promise<Post> {
  const octokit = getOctokit()
  const [owner, repo] = REPO.split('/')
  const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
    owner,
    repo,
    path,
    ref: BRANCH,
    headers: { 'If-None-Match': '' },
  })

  if (Array.isArray(data) || data.type !== 'file') {
    throw new Error('Expected a file, got a directory or symlink')
  }

  return {
    name: data.name,
    path: data.path,
    sha: data.sha,
    content: atob(data.content),
    updatedAt: new Date().toISOString(),
  }
}

export async function createPost(
  filename: string,
  content: string,
  message: string,
): Promise<void> {
  const octokit = getOctokit()
  const [owner, repo] = REPO.split('/')
  const path = `${POSTS_PATH}/${filename}`

  await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
    owner,
    repo,
    path,
    message,
    content: btoa(content),
    branch: BRANCH,
  })
}

export async function deletePost(
  path: string,
  sha: string,
  message: string,
): Promise<void> {
  const octokit = getOctokit()
  const [owner, repo] = REPO.split('/')

  await octokit.request('DELETE /repos/{owner}/{repo}/contents/{path}', {
    owner,
    repo,
    path,
    message,
    sha,
    branch: BRANCH,
  })
}

export async function updatePost(
  path: string,
  sha: string,
  content: string,
  message: string,
): Promise<void> {
  const octokit = getOctokit()
  const [owner, repo] = REPO.split('/')

  await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
    owner,
    repo,
    path,
    message,
    content: btoa(content),
    sha,
    branch: BRANCH,
  })
}
