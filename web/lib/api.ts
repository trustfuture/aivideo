// Default to FastAPI dev server with API prefix
// Backend (main.py) listens on 8080 by default and exposes routes under /api
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8080/api'

type FetchOptions = RequestInit & { searchParams?: Record<string, string | number | boolean | undefined> }

function withQuery(url: string, searchParams?: FetchOptions['searchParams']) {
  if (!searchParams) return url
  const usp = new URLSearchParams()
  Object.entries(searchParams).forEach(([k, v]) => {
    if (v !== undefined) usp.set(k, String(v))
  })
  const q = usp.toString()
  return q ? `${url}?${q}` : url
}

export function request(path: string, opts: FetchOptions = {}) {
  const url = `${API_BASE}${path}`
  const finalUrl = withQuery(url, opts.searchParams)
  return fetch(finalUrl, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      ...(opts.headers || {})
    },
    cache: 'no-store'
  })
}

export const get = (path: string, opts?: Omit<FetchOptions, 'method' | 'body'>) => request(path, { ...opts, method: 'GET' })
export const post = (path: string, body?: any, opts?: Omit<FetchOptions, 'method' | 'body'>) =>
  request(path, { ...opts, method: 'POST', body: body ? JSON.stringify(body) : undefined })
