import { useState } from 'react'
import { api, auth } from '../api'
import PanLogo from '../components/PanLogo'

export default function Login({ onDone }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!username.trim() || !password) {
      setErr('请输入账号与密码')
      return
    }
    setErr('')
    setBusy(true)
    try {
      const res = await api.login(username.trim(), password)
      auth.save(res.access_token, res.username)
      onDone(res.username)
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-16">
      <form onSubmit={submit} className="fade-up w-full max-w-[392px]">
        <div className="mb-7 flex items-center gap-3">
          <PanLogo size={44} />
          <div>
            <h1 className="text-base font-semibold tracking-wide">手碟谱面统一转换</h1>
            <p className="mt-0.5 text-xs text-slate-500">D Kurd 9音 · 输出格式恒定</p>
          </div>
        </div>

        <label className="mb-1.5 block text-xs text-slate-500">账号</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          className="mb-4 h-11 w-full rounded-[10px] border border-ink-600 bg-ink-900 px-3.5 text-sm outline-none transition focus:border-ink-500 focus:bg-ink-850"
        />

        <label className="mb-1.5 block text-xs text-slate-500">密码</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="h-11 w-full rounded-[10px] border border-ink-600 bg-ink-900 px-3.5 text-sm outline-none transition focus:border-ink-500 focus:bg-ink-850"
        />

        {err && <p className="mt-3 text-[12.5px] text-rose-400">{err}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 h-11 w-full rounded-[10px] bg-sheet-blue text-sm font-medium text-white transition hover:bg-blue-600 disabled:opacity-50"
        >
          {busy ? '登录中…' : '登录'}
        </button>

        <p className="mt-5 text-center text-xs leading-relaxed text-slate-600">
          仅限 2 个授权账号 · 不开放注册
          <br />
          账号由管理员用 seed_users 脚本创建
        </p>
      </form>
    </div>
  )
}
