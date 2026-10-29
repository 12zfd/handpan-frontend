import { useEffect, useState } from 'react'
import { auth } from './api'
import Login from './pages/Login'
import Workbench from './pages/Workbench'

const BASE = import.meta.env.VITE_API_BASE_URL || ''

export default function App() {
  const [user, setUser] = useState(auth.user())
  const [stale, setStale] = useState(false)

  useEffect(() => {
    const onLogout = () => setUser(null)
    window.addEventListener('hsf:logout', onLogout)
    return () => window.removeEventListener('hsf:logout', onLogout)
  }, [])

  // 轮询构建号：后端换了新前端就提示刷新，避免一直跑着旧代码还以为没修
  useEffect(() => {
    let base = null
    let stopped = false

    const tick = async () => {
      try {
        const res = await fetch(`${BASE}/version`)
        if (!res.ok) return
        const { build } = await res.json()
        if (!build || stopped) return
        if (!base) base = build
        else if (build !== base) setStale(true)
      } catch (_) {
        /* 网络抖动忽略 */
      }
    }

    tick()
    const timer = setInterval(tick, 15000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [])

  const logout = () => {
    auth.clear()
    setUser(null)
  }

  return (
    <>
      {!user ? <Login onDone={(name) => setUser(name)} /> : <Workbench user={user} onLogout={logout} />}

      {stale && (
        <div className="fixed bottom-5 left-1/2 z-[90] -translate-x-1/2">
          <button
            onClick={() => window.location.reload()}
            className="rounded-full border border-blue-400/40 bg-blue-500/90 px-4 py-2 text-[12.5px] text-white shadow-lg hover:bg-blue-500"
          >
            有新版本，点这里刷新
          </button>
        </div>
      )}
    </>
  )
}
