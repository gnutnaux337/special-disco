// Password-based AES-256-GCM, done entirely in the browser.
//
// File layout:  "SDENC1" | salt(16) | ivPrefix(8) | chunkSize(u32) | chunk...
// The key comes from PBKDF2(password, salt). Data is encrypted in 1 MiB chunks
// so big videos can report progress; each chunk gets its own IV (prefix +
// counter) and is bound to its index and "is last" flag, so reordering or
// truncating chunks fails authentication.

const MAGIC = new TextEncoder().encode('SDENC1')
const SALT_LEN = 16
const PREFIX_LEN = 8
const CHUNK = 1 << 20
const TAG = 16
const HEADER = MAGIC.length + SALT_LEN + PREFIX_LEN + 4
const ITERATIONS = 250_000

export type Progress = (fraction: number) => void

export function isEncrypted(data: Uint8Array): boolean {
  return data.length > HEADER && MAGIC.every((b, i) => data[i] === b)
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function chunkParams(prefix: Uint8Array, index: number, last: boolean): AesGcmParams {
  const iv = new Uint8Array(12)
  iv.set(prefix)
  new DataView(iv.buffer).setUint32(8, index)
  const aad = new Uint8Array(5)
  new DataView(aad.buffer).setUint32(0, index)
  aad[4] = last ? 1 : 0
  return { name: 'AES-GCM', iv, additionalData: aad }
}

export async function encryptBytes(
  data: Uint8Array,
  password: string,
  onProgress?: Progress,
): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN))
  const prefix = crypto.getRandomValues(new Uint8Array(PREFIX_LEN))
  const key = await deriveKey(password, salt)
  const n = Math.max(1, Math.ceil(data.length / CHUNK))

  const out = new Uint8Array(HEADER + data.length + n * TAG)
  out.set(MAGIC, 0)
  out.set(salt, MAGIC.length)
  out.set(prefix, MAGIC.length + SALT_LEN)
  new DataView(out.buffer).setUint32(MAGIC.length + SALT_LEN + PREFIX_LEN, CHUNK)

  let pos = HEADER
  for (let i = 0; i < n; i++) {
    const slice = data.subarray(i * CHUNK, (i + 1) * CHUNK)
    const ct = new Uint8Array(
      await crypto.subtle.encrypt(chunkParams(prefix, i, i === n - 1), key, slice as BufferSource),
    )
    out.set(ct, pos)
    pos += ct.length
    onProgress?.((i + 1) / n)
  }
  return out
}

export async function decryptBytes(
  data: Uint8Array,
  password: string,
  onProgress?: Progress,
): Promise<Uint8Array> {
  if (!isEncrypted(data)) throw new Error('Not an encrypted file')
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const salt = data.slice(MAGIC.length, MAGIC.length + SALT_LEN)
  const prefix = data.slice(MAGIC.length + SALT_LEN, MAGIC.length + SALT_LEN + PREFIX_LEN)
  const chunk = view.getUint32(MAGIC.length + SALT_LEN + PREFIX_LEN)
  if (chunk < 1 || chunk > 16 << 20) throw new Error('Corrupted file')

  const stride = chunk + TAG
  const n = Math.max(1, Math.ceil((data.length - HEADER) / stride))
  const key = await deriveKey(password, salt)

  const parts: Uint8Array[] = []
  try {
    for (let i = 0; i < n; i++) {
      const start = HEADER + i * stride
      const ct = data.subarray(start, Math.min(start + stride, data.length))
      const pt = await crypto.subtle.decrypt(
        chunkParams(prefix, i, i === n - 1),
        key,
        ct as BufferSource,
      )
      parts.push(new Uint8Array(pt))
      onProgress?.((i + 1) / n)
    }
  } catch {
    throw new Error('Wrong password or corrupted file')
  }

  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0))
  let pos = 0
  for (const p of parts) {
    out.set(p, pos)
    pos += p.length
  }
  return out
}
