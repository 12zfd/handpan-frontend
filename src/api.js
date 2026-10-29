const BASE = import.meta.env.VITE_API_BASE_URL || ''

const TOKEN_KEY = 'hsf_token'
const USER_KEY = 'hsf_user'

export const auth = {
  token: () => localStorage.getItem(TOKEN_KEY),
  user: () => localStorage.getItem(USER_KEY),
  save: (token, username) => {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, username || '')
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  },
}

async function req(path, opts = {}) {
  const headers = { ...(opts.headers || {}) }
  const token = auth.token()
  if (token) headers.Authorization = `Bearer ${token}`
  if (opts.body && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  let res
  try {
    res = await fetch(`${BASE}${path}`, { ...opts, headers })
  } catch (e) {
    throw new Error('连不上后端服务，请确认后端已启动')
  }

  if (res.status === 401) {
    auth.clear()
    window.dispatchEvent(new Event('hsf:logout'))
    throw new Error('登录已失效，请重新登录')
  }
  if (!res.ok) {
    let msg = `请求失败 (${res.status})`
    try {
      const body = await res.json()
      msg = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail || msg)
    } catch (_) {
      /* 保留默认文案 */
    }
    throw new Error(msg)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  login: (username, password) =>
    req('/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  upload: (files) => {
    const list = Array.isArray(files) ? files : [files]
    const fd = new FormData()
    list.forEach((f) => fd.append('files', f))
    return req('/upload', { method: 'POST', body: fd })
  },
  convert: (id) => req(`/convert/${id}`, { method: 'POST' }),
  history: () => req('/history'),
  detail: (id) => req(`/scores/${id}`),
  saveNotes: (id, json) =>
    req(`/scores/${id}/notes`, {
      method: 'PATCH',
      body: JSON.stringify({ midi_data_json: json }),
    }),
  setTempo: (id, bpm) =>
    req(`/scores/${id}/tempo`, { method: 'PATCH', body: JSON.stringify({ bpm }) }),
  rename: (id, title) =>
    req(`/scores/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  // 注意：这个 URL 不带鉴权，不能直接塞进 <a href>（会 401）。下载请用 downloadPdf。
  downloadUrl: (id) => `${BASE}/download/${id}`,
  // 带 token 取回 PDF 二进制，再用 blob 触发下载
  downloadPdf: async (id, fallbackName = 'score.pdf') => {
    const res = await fetch(`${BASE}/download/${id}`, {
      headers: { Authorization: `Bearer ${auth.token()}` },
    })
    if (!res.ok) {
      if (res.status === 401) {
        auth.clear()
        window.dispatchEvent(new Event('hsf:logout'))
        throw new Error('登录已失效，请重新登录')
      }
      if (res.status === 404) throw new Error('PDF 还没生成，请稍后再试')
      throw new Error(`下载失败 (${res.status})`)
    }

    const blob = await res.blob()
    if (!blob.size) throw new Error('下载到空文件，请重新出稿')

    let name = fallbackName
    const cd = res.headers.get('Content-Disposition') || ''
    const star = cd.match(/filename\*=UTF-8''([^;]+)/i)
    const plain = cd.match(/filename="?([^";]+)"?/i)
    try {
      if (star) name = decodeURIComponent(star[1])
      else if (plain) name = plain[1]
    } catch (_) {
      /* 名字解析失败就用兜底名 */
    }

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
    return name
  },
  // 原文件是带鉴权的接口，<img src> 发不了 header，所以取 blob 再转 objectURL
  originalBlob: async (id, index = 0) => {
    const res = await fetch(`${BASE}/files/${id}/original/${index}`, {
      headers: { Authorization: `Bearer ${auth.token()}` },
    })
    if (!res.ok) throw new Error('原文件读取失败')
    return URL.createObjectURL(await res.blob())
  },
}

export const statusMeta = {
  queued: { text: '排队中', cls: 'bg-ink-700 text-slate-400 border-ink-600' },
  extracting: { text: '提取中', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  mapping: { text: '映射中', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  rendering: { text: '出稿中', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  done: { text: '已完成', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  failed: { text: '失败', cls: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
}

export const sourceLabel = { video: '视频', image: '截图', midi: 'MIDI' }
