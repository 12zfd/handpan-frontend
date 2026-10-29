import { useCallback, useEffect, useRef, useState } from 'react'
import { api, sourceLabel, statusMeta } from '../api'
import PanLogo from '../components/PanLogo'
import ScorePreview from '../components/ScorePreview'

const ACTIVE = ['queued', 'extracting', 'mapping', 'rendering']
const MAX_FILES = 5
const IMAGE_EXT = /\.(jpe?g|png)$/i

export default function Workbench({ user, onLogout }) {
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [pending, setPending] = useState([])   // 已选待上传（点「开始转换」才真正上传）
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    try {
      setRows(await api.history())
    } catch (e) {
      setNotice({ type: 'err', text: e.message })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // 深链接：/?score=12 直接打开某份谱（便于把谱子链接发给搭档）
  useEffect(() => {
    const sid = Number(new URLSearchParams(window.location.search).get('score'))
    if (sid) setOpenId(sid)
  }, [])

  useEffect(() => {
    if (!rows.some((r) => ACTIVE.includes(r.status))) return undefined
    const timer = setInterval(load, 2500)
    return () => clearInterval(timer)
  }, [rows, load])

  // 只入队，不上传：允许用户一张一张往里挑，挑够了再点「开始转换」
  function addFiles(list) {
    const arr = Array.from(list || []).filter(Boolean)
    if (fileRef.current) fileRef.current.value = ''
    if (!arr.length) return

    const next = [...pending, ...arr]
    if (next.length > MAX_FILES) {
      setNotice({ type: 'err', text: `最多 ${MAX_FILES} 张，现在已经 ${next.length} 张` })
      return
    }
    if (next.length > 1 && !next.every((f) => IMAGE_EXT.test(f.name))) {
      setNotice({ type: 'err', text: '只有图片可以多张合并；视频 / MIDI 一次只能传一个' })
      return
    }
    setNotice(null)
    setPending(next)
  }

  function removePending(idx) {
    setPending((prev) => prev.filter((_, i) => i !== idx))
  }

  async function startConvert() {
    if (!pending.length || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const { score_id, files } = await api.upload(pending)
      await api.convert(score_id)
      const n = files
      setPending([])
      await load()
      setNotice({
        type: 'ok',
        text:
          n > 1
            ? `已把 ${n} 张图按顺序合并成一份谱，正在识别`
            : '已进入转换队列，完成后会自动刷新',
      })
    } catch (e) {
      setNotice({ type: 'err', text: e.message })
    } finally {
      setBusy(false)
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  async function retry(id) {
    try {
      await api.convert(id)
      load()
    } catch (e) {
      setNotice({ type: 'err', text: e.message })
    }
  }

  async function download(row) {
    const base = (row.title || `score-${row.id}`).replace(/[\\/:*?"<>|]/g, '_')
    try {
      const name = await api.downloadPdf(row.id, `${base}_D Kurd 9音.pdf`)
      setNotice({ type: 'ok', text: `已开始下载：${name}` })
    } catch (e) {
      setNotice({ type: 'err', text: e.message })
    }
  }

  const activeCount = rows.filter((r) => ACTIVE.includes(r.status)).length

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 flex h-[58px] items-center justify-between border-b border-ink-700 bg-ink-850/80 px-5 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <PanLogo size={26} />
          <span className="text-[13.5px] font-semibold">手碟谱面统一转换</span>
          <span className="ml-1.5 border-l border-ink-600 pl-2.5 text-[11.5px] text-slate-600">
            D Kurd 9音
          </span>
        </div>
        <div className="flex items-center gap-3.5 text-sm text-slate-500">
          {activeCount > 0 && (
            <span className="flex items-center gap-1.5 text-[11.5px] text-amber-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              {activeCount} 个任务处理中
            </span>
          )}
          <span className="grid h-6 w-6 place-items-center rounded-full border border-ink-600 bg-ink-700 text-[11px] text-slate-300">
            {user.slice(0, 1).toUpperCase()}
          </span>
          <span className="text-xs text-slate-400">{user}</span>
          <button onClick={onLogout} className="text-xs text-slate-500 hover:text-slate-200">
            退出
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[940px] px-5 pb-16 pt-6">
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`cursor-pointer rounded-2xl border border-dashed px-5 py-9 text-center transition ${
            dragging
              ? 'border-sheet-blue bg-blue-500/5'
              : 'border-ink-500 bg-gradient-to-b from-ink-850 to-ink-900 hover:border-ink-500/80'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".mp4,.mov,.webm,.jpg,.jpeg,.png,.mid,.midi"
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
          <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-[10px] bg-ink-700 text-lg text-slate-400">
            +
          </div>
          <h3 className="text-sm font-medium">
            {busy
              ? '上传中…'
              : pending.length
                ? `继续添加（已选 ${pending.length} 张）`
                : '点击选择，或把文件拖进来'}
          </h3>
          <p className="mt-1.5 text-xs text-slate-600">
            选好文件后会先排在下面，确认无误再点「开始转换」· 图片最多 5 张按顺序合并 · 视频 / MIDI 一次一个
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {['MP4', 'MOV', 'JPG', 'PNG', 'MID', '≤ 200MB'].map((t) => (
              <span
                key={t}
                className="rounded border border-ink-600 bg-ink-800 px-1.5 py-0.5 text-[11px] text-slate-500"
              >
                {t}
              </span>
            ))}
          </div>

          <div
            className="mx-auto mt-4 max-w-[460px] rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11.5px] font-medium text-amber-300">截图技巧（决定识别率）</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-slate-400">
              用 App 的放大模式，<span className="text-slate-200">一屏只截一行谱</span>，字够大识别率接近 100%。
              整屏截图字只有 20 像素高，实测约 14% 的格子会漏读，得手工补。
            </p>
          </div>
        </div>

        {pending.length > 0 && (
          <div className="fade-up mt-3 rounded-xl border border-ink-600 bg-ink-850 p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-[12.5px] text-slate-300">
                待转换 <span className="text-slate-500">{pending.length} 个文件</span>
                {pending.length > 1 && (
                  <span className="ml-2 text-[11.5px] text-slate-500">将按下面顺序合并成一份谱</span>
                )}
              </p>
              <button
                onClick={() => setPending([])}
                className="text-[11.5px] text-slate-500 hover:text-slate-300"
              >
                清空
              </button>
            </div>

            <ul className="mb-3 space-y-1">
              {pending.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-2 rounded-lg bg-ink-800 px-2.5 py-1.5"
                >
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-ink-700 text-[11px] text-slate-400">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-300">
                    {f.name}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-600">
                    {(f.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                  <button
                    onClick={() => removePending(i)}
                    className="shrink-0 text-[11.5px] text-slate-500 hover:text-rose-300"
                  >
                    移除
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={pending.length >= MAX_FILES}
                className="rounded-lg border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-ink-700 disabled:opacity-40"
              >
                + 再加一张
              </button>
              <button
                onClick={startConvert}
                disabled={busy}
                className="rounded-lg bg-sheet-blue px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
              >
                {busy ? '上传中…' : `开始转换（${pending.length}）`}
              </button>
            </div>
          </div>
        )}

        {notice && (
          <p
            className={`mt-3 rounded-lg border px-3 py-2 text-[12.5px] ${
              notice.type === 'err'
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
            }`}
          >
            {notice.text}
          </p>
        )}

        <div className="mb-2.5 mt-7 flex items-center gap-2 text-xs text-slate-500">
          历史任务
          <span className="h-px flex-1 bg-ink-700" />
          <span className="text-slate-600">共 {rows.length} 条</span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-850">
          {rows.length === 0 && (
            <p className="px-4 py-12 text-center text-sm text-slate-600">
              还没有任务，先上传一个
            </p>
          )}

          {rows.map((r) => {
            const s = statusMeta[r.status] || statusMeta.queued
            return (
              <div
                key={r.id}
                className="flex items-center gap-3 border-b border-ink-700/70 px-4 py-3 last:border-b-0 hover:bg-ink-800/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] text-slate-200">
                    {r.title || `任务 ${r.id}`}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-slate-600">
                    {sourceLabel[r.source_type] || '文件'} ·{' '}
                    {new Date(r.created_at).toLocaleString('zh-CN')}
                    {r.error_message ? ` · ${r.error_message}` : ''}
                  </p>
                </div>

                <span className={`rounded-full border px-2.5 py-1 text-[11.5px] ${s.cls}`}>
                  {s.text}
                </span>

                {r.status === 'done' && (
                  <>
                    <button
                      onClick={() => setOpenId(r.id)}
                      className="rounded-lg border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs text-slate-300 hover:border-ink-500 hover:bg-ink-700"
                    >
                      预览 / 校对
                    </button>
                    <button
                      onClick={() => download(r)}
                      className="rounded-lg border border-blue-500/40 bg-blue-500/15 px-3 py-1.5 text-xs text-blue-200 hover:bg-blue-500/25"
                    >
                      下载 PDF
                    </button>
                  </>
                )}

                {(r.status === 'failed' || r.status === 'queued') && (
                  <button
                    onClick={() => retry(r.id)}
                    className="rounded-lg border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs text-slate-300 hover:border-ink-500 hover:bg-ink-700"
                  >
                    {r.status === 'failed' ? '重试' : '开始转换'}
                  </button>
                )}

                {ACTIVE.includes(r.status) && r.status !== 'queued' && (
                  <span className="px-3 py-1.5 text-xs text-slate-600">处理中…</span>
                )}
              </div>
            )
          })}
        </div>
      </main>

      {openId && (
        <ScorePreview
          scoreId={openId}
          onClose={() => {
            setOpenId(null)
            load()
          }}
        />
      )}
    </div>
  )
}
