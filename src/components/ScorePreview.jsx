import { useEffect, useState } from 'react'
import { api } from '../api'

const MIDI = { 1: 50, 2: 57, 3: 58, 4: 60, 5: 62, 6: 64, 7: 65, 8: 67, 9: 69 }
const DEFAULT_CELLS = 12
const SYS_H = 70      // 行高，按 PDF 20.1mm 等比
const MID_TOP = 35    // 中线
const SYS_GAP = 67    // 行距 - 行高

const colorOf = (pos) => (Number(pos) <= 2 ? '#2563EB' : '#E8862A')

export default function ScorePreview({ scoreId, onClose }) {
  const [data, setData] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [bpm, setBpm] = useState(0)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState(null) // {barIdx, slot, hand, pos}
  const [sourceType, setSourceType] = useState('')
  const [imgUrls, setImgUrls] = useState([])
  const [fileCount, setFileCount] = useState(1)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [bulkFrom, setBulkFrom] = useState('')
  const [bulkTo, setBulkTo] = useState('')
  const [snapshot, setSnapshot] = useState(null)
  const [bulkMsg, setBulkMsg] = useState('')

  useEffect(() => {
    api
      .detail(scoreId)
      .then((d) => {
        setData(d.midi_data_json)
        setBpm(Number(d.midi_data_json?.tempo?.bpm) || 120)
        setSourceType(d.source_type || '')
        setFileCount(Math.max(1, Number(d.files) || 1))
      })
      .catch((e) => setErr(e.message))
  }, [scoreId])

  // 截图/照片类任务：把原谱取回来对照，多图任务全部取回
  useEffect(() => {
    if (sourceType !== 'image') return undefined
    let dead = false
    let made = []
    Promise.all(
      Array.from({ length: fileCount }, (_, i) =>
        api.originalBlob(scoreId, i).catch(() => null),
      ),
    ).then((list) => {
      made = list.filter(Boolean)
      if (dead) made.forEach((u) => URL.revokeObjectURL(u))
      else setImgUrls(made)
    })
    return () => {
      dead = true
      made.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [scoreId, sourceType, fileCount])

  async function refreshUntilDone(tries = 25) {
    for (let i = 0; i < tries; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const d = await api.detail(scoreId)
      if (d.status === 'done' || d.status === 'failed') {
        setData(d.midi_data_json)
        return d
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 800))
    }
    return null
  }

  function openPicker(barIdx, slot, hand) {
    const bar = data?.bars?.[barIdx]
    const ev = bar?.events?.find((e) => e.slot === slot)
    const note = ev?.notes?.find((n) => n.hand === hand)
    setPicker({ barIdx, slot, hand, pos: note?.pos ?? null })
  }

  function applyPos(pos) {
    if (!picker) return
    const { barIdx, slot, hand } = picker
    const next = JSON.parse(JSON.stringify(data))
    const bar = next.bars[barIdx]
    let ev = bar.events.find((e) => e.slot === slot)

    if (!ev) {
      if (!pos) {
        setPicker(null)
        return
      }
      ev = { slot, notes: [] }
      bar.events.push(ev)
      bar.events.sort((a, b) => a.slot - b.slot)
    }

    ev.notes = ev.notes.filter((n) => n.hand !== hand)
    if (pos) {
      ev.notes.push({
        pos,
        midi: MIDI[pos],
        color: Number(pos) <= 2 ? 'blue' : 'orange',
        hand,
        approx: false,
      })
    }
    if (!ev.notes.length) bar.events = bar.events.filter((e) => e !== ev)

    setData(next)
    setDirty(true)
    setPicker(null)
  }

  async function save() {
    setBusy(true)
    setErr('')
    try {
      await api.saveNotes(scoreId, data)
      const d = await refreshUntilDone()
      if (d?.status === 'failed') setErr(d.error_message || '出稿失败')
      setDirty(false)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  // 全谱批量改记号：把某一类记号一次性替换 / 删除（只改数据，不改排版）
  function makeNote(hand, to) {
    const color = hand === 'lower' ? 'blue' : 'orange'
    if (to === 'S') return { pos: 0, midi: 0, label: 'S', kind: 'stroke', hand, color, approx: false }
    if (to === 'D') return { pos: 1, midi: 50, label: 'D', kind: 'ding', hand, color, approx: false }
    const pos = Number(to)
    return { pos, midi: MIDI[pos], hand, color, approx: false }
  }

  function applyBulk() {
    if (!bulkFrom || !bulkTo) {
      setBulkMsg('先选「原记号」和「目标」')
      return
    }
    const snap = JSON.parse(JSON.stringify(data))
    const next = JSON.parse(JSON.stringify(data))
    let hit = 0

    for (const bar of next.bars || []) {
      for (const ev of bar.events || []) {
        const out = []
        for (const n of ev.notes || []) {
          if ((n.label || String(n.pos)) !== bulkFrom) {
            out.push(n)
            continue
          }
          hit += 1
          if (bulkTo === 'DEL') continue
          const m = makeNote(n.hand, bulkTo)
          if (!out.some((x) => x.pos === m.pos && (x.label || '') === (m.label || ''))) out.push(m)
        }
        ev.notes = out
      }
      bar.events = (bar.events || []).filter((e) => (e.notes || []).length > 0)
    }

    if (!hit) {
      setBulkMsg(`全谱没有找到「${bulkFrom}」`)
      return
    }
    setSnapshot(snap)
    setData(next)
    setDirty(true)
    setBulkMsg(
      `已把 ${hit} 处「${bulkFrom}」改为「${bulkTo === 'DEL' ? '删除' : bulkTo}」，点「保存并重新出稿」生效`,
    )
  }

  function undoBulk() {
    if (!snapshot) return
    setData(snapshot)
    setDirty(true)
    setSnapshot(null)
    setBulkMsg('已撤销上一次批量修改')
  }

  async function downloadPdf() {
    const base = (data?.title || `score-${scoreId}`).replace(/[\\/:*?"<>|]/g, '_')
    try {
      await api.downloadPdf(scoreId, `${base}_D Kurd 9音.pdf`)
    } catch (e) {
      setErr(e.message)
    }
  }

  function beginEditTitle() {
    setTitleDraft(data?.title || '')
    setEditingTitle(true)
  }

  async function saveTitle() {
    const v = titleDraft.trim()
    setEditingTitle(false)
    if (!v || v === (data?.title || '')) return
    setBusy(true)
    setErr('')
    try {
      await api.rename(scoreId, v)
      const d = await refreshUntilDone()
      if (d?.status === 'failed') setErr(d.error_message || '重新出稿失败')
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function applyTempo() {
    const v = Number(bpm)
    if (!(v >= 40 && v <= 240)) {
      setErr('BPM 应在 40–240 之间')
      return
    }
    if (data?.tempo?.bpm && Math.abs(v - Number(data.tempo.bpm)) < 0.01) return
    setBusy(true)
    setErr('')
    try {
      setDirty(false)
      await api.setTempo(scoreId, v)
      const d = await refreshUntilDone()
      if (d?.status === 'failed') setErr(d.error_message || '重排失败')
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const cells = Number(data?.grid?.cells) || DEFAULT_CELLS
  const bars = data?.bars || []
  const systems = []

  // 全谱出现过的记号，用于批量修改下拉
  const ORDER = ['S', 'D', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  const tokenSet = new Set()
  for (const b of bars) {
    for (const e of b.events || []) {
      for (const n of e.notes || []) tokenSet.add(n.label || String(n.pos))
    }
  }
  const tokenList = ORDER.filter((t) => tokenSet.has(t))
  const bulkCount = bulkFrom
    ? bars
        .flatMap((b) => b.events || [])
        .flatMap((e) => e.notes || [])
        .filter((n) => (n.label || String(n.pos)) === bulkFrom).length
    : 0
  for (let i = 0; i < bars.length; i += 2) systems.push({ idx: i / 2 + 1, bars: bars.slice(i, i + 2) })

  return (
    <div className="fixed inset-0 z-40 overflow-auto bg-black/70 px-4 py-7 backdrop-blur-sm">
      <div className="fade-up mx-auto max-w-[900px] overflow-hidden rounded-2xl border border-ink-700 bg-ink-850">
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-ink-700 bg-ink-850 px-4 py-3">
          <div className="min-w-0">
            {editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle()
                  if (e.key === 'Escape') setEditingTitle(false)
                }}
                placeholder="输入歌曲名"
                className="h-7 w-[240px] rounded-md border border-blue-500/60 bg-ink-900 px-2 text-[13.5px] outline-none"
              />
            ) : (
              <button
                onClick={beginEditTitle}
                title="点击修改歌曲名，PDF 大标题会同步"
                className="group flex max-w-[320px] items-center gap-1.5 text-[13.5px] font-semibold"
              >
                <span className="truncate">{data?.title || 'D Kurd 9音'}</span>
                <span className="shrink-0 rounded border border-ink-600 px-1 text-[10px] font-normal text-slate-500 group-hover:border-blue-500/50 group-hover:text-blue-300">
                  改歌名
                </span>
              </button>
            )}
            <p className="mt-0.5 text-[11.5px] text-slate-500">
              ♩ = {data?.tempo?.bpm ?? '-'} · {data?.stats?.total_notes ?? 0} 个音
              {data?.stats?.taps ? ` + ${data.stats.taps} 个S` : ''} · {systems.length} 行
            </p>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-slate-500">♩ =</span>
            <input
              type="number"
              min={40}
              max={240}
              value={bpm}
              onChange={(e) => setBpm(e.target.value)}
              className="h-7 w-[58px] rounded-lg border border-ink-600 bg-ink-900 text-center text-xs outline-none focus:border-ink-500"
            />
            <button
              onClick={applyTempo}
              disabled={busy}
              className="rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-1.5 text-[11.5px] text-slate-300 hover:border-ink-500 disabled:opacity-40"
            >
              整首重排
            </button>
          </div>

          <div className="flex items-center gap-2 border-l border-ink-700 pl-3">
            <button
              onClick={onClose}
              className="rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-1.5 text-[11.5px] text-slate-400 hover:bg-ink-700"
            >
              关闭
            </button>
            <button
              onClick={save}
              disabled={!dirty || busy}
              className="rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-1.5 text-[11.5px] text-slate-200 hover:bg-ink-700 disabled:opacity-40"
            >
              {busy ? '处理中…' : '保存并重新出稿'}
            </button>
            <button
              onClick={downloadPdf}
              className="rounded-lg border border-blue-500/40 bg-blue-500/20 px-2.5 py-1.5 text-[11.5px] text-blue-200 hover:bg-blue-500/30"
            >
              下载 PDF
            </button>
          </div>
        </div>

        {err && (
          <p className="border-b border-rose-500/20 bg-rose-500/10 px-4 py-2 text-[12px] text-rose-300">
            {err}
          </p>
        )}

        {imgUrls.length > 0 && (
          <div className="mx-4 mt-4 rounded-lg border border-ink-700 bg-ink-900 p-2">
            <div className="flex items-start gap-2 overflow-x-auto">
              {imgUrls.map((u, i) => (
                <a
                  key={u}
                  href={u}
                  target="_blank"
                  rel="noreferrer"
                  className="relative shrink-0"
                  title={`第 ${i + 1} 张原谱`}
                >
                  <img
                    src={u}
                    alt={`原谱 ${i + 1}`}
                    className="h-24 w-auto rounded border border-ink-700"
                  />
                  <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">
                    {i + 1}
                  </span>
                </a>
              ))}
            </div>
            <p className="mt-1.5 px-1 text-[11.5px] leading-relaxed text-slate-500">
              原谱（点开看大图）· 下面谱面的数字可以逐个点开改成正确音位
              {imgUrls.length > 1 && ` · 共 ${imgUrls.length} 张已按顺序拼接`}
              <br />
              X / T / S 统一显示为 S：无音高敲击，只示节奏不指音位
            </p>
          </div>
        )}

        <div className="mx-4 mt-3 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-slate-400">全谱批量修改</span>
            <select
              value={bulkFrom}
              onChange={(e) => {
                setBulkFrom(e.target.value)
                setBulkMsg('')
              }}
              className="h-7 rounded-md border border-ink-600 bg-ink-800 px-2 text-[12px] text-slate-200 outline-none"
            >
              <option value="">选择原记号</option>
              {tokenList.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <span className="text-slate-500">全部换成</span>
            <select
              value={bulkTo}
              onChange={(e) => setBulkTo(e.target.value)}
              className="h-7 rounded-md border border-ink-600 bg-ink-800 px-2 text-[12px] text-slate-200 outline-none"
            >
              <option value="">目标</option>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((t) => (
                <option key={t} value={t}>
                  音位 {t}
                </option>
              ))}
              <option value="S">S（敲击）</option>
              <option value="D">D（叮）</option>
              <option value="DEL">删除</option>
            </select>
            <button
              onClick={applyBulk}
              disabled={!bulkFrom || !bulkTo}
              className="rounded-md border border-blue-500/40 bg-blue-500/15 px-2.5 py-1 text-[11.5px] text-blue-200 hover:bg-blue-500/25 disabled:opacity-40"
            >
              应用到全谱
            </button>
            {snapshot && (
              <button
                onClick={undoBulk}
                className="rounded-md border border-ink-600 bg-ink-800 px-2.5 py-1 text-[11.5px] text-slate-300 hover:bg-ink-700"
              >
                撤销
              </button>
            )}
            {bulkFrom && <span className="text-slate-500">当前全谱命中 {bulkCount} 处</span>}
          </div>
          {bulkMsg && <p className="mt-1 text-[11.5px] text-amber-300">{bulkMsg}</p>}
        </div>

        <div className="m-4 rounded-lg bg-white px-8 pb-6 pt-8">
          {data?.title && data.title !== 'D Kurd 9音' ? (
            <>
              <p className="text-center text-[19px] font-semibold tracking-wide text-gray-900">
                {data.title}
              </p>
              <p className="mt-1 text-center text-[11px] text-gray-500">D Kurd 9音</p>
            </>
          ) : (
            <p className="text-center text-[19px] font-semibold tracking-wide text-gray-900">
              D Kurd 9音
            </p>
          )}
          <p className="mt-2 text-xs text-gray-600">♩ = {data?.tempo?.bpm ?? '-'}</p>

          {systems.map((sys) => (
            <div key={sys.idx} className="relative" style={{ marginTop: SYS_GAP }}>
              <span className="absolute -left-4 -top-3 text-[10px] text-gray-500">
                {sys.idx * 2 - 1}
              </span>
              <span className="absolute left-1/2 -top-3 -translate-x-1/2 text-[10px] text-gray-500">
                {sys.idx * 2}
              </span>
              <div className="relative flex" style={{ height: SYS_H }}>
                <div
                  className="pointer-events-none absolute left-0 right-0 h-px bg-[#B8B8B8]"
                  style={{ top: MID_TOP }}
                />
                {sys.bars.map((bar, bi) => (
                  <div key={bar.index} className="relative flex-1">
                    {Array.from({ length: cells + 1 }).map((_, i) => {
                      const isBar = i === 0 || i === cells // 大节：粗线，全长
                      const isSub = i % 4 === 0 // 小节：长线
                      const inset = isSub ? SYS_H * 0.09 : SYS_H * 0.27
                      return (
                        <span
                          key={i}
                          className="pointer-events-none absolute w-px"
                          style={{
                            left: `${(i * 100) / cells}%`,
                            top: inset,
                            bottom: inset,
                            width: isBar ? 2 : 1,
                            background: isBar ? '#0A0A0A' : isSub ? '#8C8C8C' : '#B0B0B0',
                          }}
                        />
                      )
                    })}
                    <div
                      className="relative grid h-full"
                      style={{ gridTemplateColumns: `repeat(${cells}, minmax(0,1fr))` }}
                    >
                      {Array.from({ length: cells }).map((_, slot) => {
                        const globalBar = bars.findIndex((b) => b.index === bar.index)
                        const ev = bar.events?.find((e) => e.slot === slot)
                        const up = ev?.notes?.find((n) => n.hand === 'upper')
                        const low = ev?.notes?.find((n) => n.hand === 'lower')
                        const tap = ev?.notes?.find(
                          (n) => n.kind === 'tap' || n.hand === 'mid',
                        )
                        return (
                          <div
                            key={slot}
                            className="relative"
                          >
                            <CellNote
                              note={up}
                              hand="upper"
                              onClick={() => openPicker(globalBar, slot, 'upper')}
                            />
                            <CellNote
                              note={low}
                              hand="lower"
                              onClick={() => openPicker(globalBar, slot, 'lower')}
                            />
                            {tap && (
                              <span
                                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[11px] leading-none text-gray-400"
                                title="无音高敲击（X / T）"
                              >
                                {tap.label || 'S'}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {bars.length === 0 && (
            <p className="py-10 text-center text-sm text-gray-400">这份谱还没有小节</p>
          )}
        </div>

        <div className="mx-4 mb-4 flex flex-wrap gap-2 text-[11.5px] text-gray-600">
          {[
            ['上档 = 橙', '#E8912D'],
            ['下档 = 蓝', '#34589E'],
            ['单音放上档，双音上高下低', null],
            ['S = 无音高敲击 · D = 叮', null],
            ['粗线 = 大节 · 长线 = 小节 · 短线 = 格', null],
          ].map(([label, c]) => (
            <span
              key={label}
              className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-600"
            >
              {c && (
                <i className="mr-1 not-italic font-semibold" style={{ color: c }}>
                  ●
                </i>
              )}
              {label}
            </span>
          ))}
        </div>

        {data?.warnings?.length > 0 && (
          <div className="mx-4 mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            {data.warnings.map((w, i) => (
              <p key={i}>· {w}</p>
            ))}
          </div>
        )}
      </div>

      {picker && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          onClick={() => setPicker(null)}
        >
          <div
            className="fade-up w-[248px] rounded-xl border border-ink-600 bg-ink-850 p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 px-1 text-[11.5px] text-slate-500">
              {picker.hand === 'upper' ? '上手（中线上方）' : '下手（中线下方）'} · 第{' '}
              {picker.slot + 1} 格
            </p>
            <div className="grid grid-cols-5 gap-1">
              {Array.from({ length: 9 }).map((_, i) => {
                const n = i + 1
                return (
                  <button
                    key={n}
                    onClick={() => applyPos(n)}
                    className={`h-8 rounded-md border text-[13px] font-semibold transition ${
                      picker.pos === n
                        ? 'border-ink-500 bg-ink-700'
                        : 'border-ink-600 bg-ink-800 hover:bg-ink-700'
                    }`}
                    style={{ color: colorOf(n) }}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => applyPos(null)}
              className="mt-2 h-7 w-full rounded-md border border-rose-500/30 bg-rose-500/10 text-[11.5px] text-rose-300 hover:bg-rose-500/20"
            >
              删除此音
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function CellNote({ note, hand, onClick }) {
  const isUpper = hand === 'upper'
  return (
    <button
      onClick={onClick}
      className={`group absolute left-0 right-0 flex items-center justify-center transition ${
        isUpper ? 'top-0' : 'bottom-0'
      }`}
      style={{ height: isUpper ? MID_TOP : SYS_H - MID_TOP }}
    >
      {note ? (
        <span
          className="leading-none"
          style={{
            color: isUpper ? '#E8912D' : '#34589E',
            fontSize: isUpper ? 15 : 13,
            transform: isUpper ? 'translateY(2px)' : 'translateY(-2px)',
          }}
        >
          {note.label || note.pos}
        </span>
      ) : (
        <span className="text-[11px] leading-none text-gray-300 opacity-0 transition group-hover:opacity-100">
          +
        </span>
      )}
    </button>
  )
}
