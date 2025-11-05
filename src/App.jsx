/* App.jsx — 裝備查詢系統（Web/React，自動載入）
 * - 結果列表 1~3 欄自適應（grid-cols-1 sm:grid-cols-2 xl:grid-cols-3）
 * - 結果卡片改直向排版；基本效果一行一個
 * - Skill+ 篩選移除（仍顯示在卡片與詳情；沒有就顯示「無」）
 * - 觸發條件合一欄：第一排屬性（火/水/木/光/暗）、第二排類型（智慧型/敏捷型/力量型），固定 OR
 * - 自動載入 public/ 裡的 JSON 與圖片（gear_icon/<裝備ID>_icon.png）
 */

import React, { useEffect, useMemo, useState } from 'react'

// ---------- helpers ----------
const BASE = import.meta.env.BASE_URL || '/'
const ATTR_OPTIONS = ['火', '水', '木', '光', '暗']
const TYPECLASS_OPTIONS = ['智慧型', '敏捷型', '力量型']

function cx(...xs) { return xs.filter(Boolean).join(' ') }

async function fetchJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`${path} ${res.status}`)
  return res.json()
}

function normalizeRangeText(s) {
  if (typeof s !== 'string') return ''
  return s.replace(/～/g, '~').replace(/\s+/g, '').replace(/~\s*|\s*~/g, '~')
}

function extractSkillPhrase(triggerStr) {
  if (typeof triggerStr !== 'string') return ''
  const m = triggerStr.match(/「([^」]+)」/)
  if (m) return m[1]
  return triggerStr.replace(/持有技能|的Ranger|Ranger|：/g, '').trim()
}

function matchCategoryValue(value, selectedSet, mode) {
  if (selectedSet.size === 0) return true
  if (mode === 'OR') return selectedSet.has(value)
  // AND 模式下，這個欄位視為單選；選了就要相符
  return selectedSet.size === 1 && selectedSet.has(value)
}

function matchEffectKeys(equipKeys, selectedSet, mode) {
  if (selectedSet.size === 0) return true
  const inter = new Set([...selectedSet].filter((k) => equipKeys.has(k)))
  return mode === 'AND' ? inter.size === selectedSet.size : inter.size > 0
}

function pickTriggerTags(triggerStr) {
  const attrs = new Set()
  const tps = new Set()
  if (typeof triggerStr === 'string') {
    ATTR_OPTIONS.forEach((a) => { if (triggerStr.includes(a + '屬性')) attrs.add(a) })
    TYPECLASS_OPTIONS.forEach((t) => { if (triggerStr.includes(t)) tps.add(t) })
  }
  return { attrs, types: tps }
}

// ---------- ui atoms ----------
function AndOrSwitch({ value, onChange }) {
  return (
    <>
      {/* 你原本的全域字級控制嵌在這個元件中，保留 */}
      <style>{`html{font-size:18px}
@media (min-width:768px){html{font-size:19px}}
@media (min-width:1280px){html{font-size:20px}}`}</style>
      <div className="inline-flex rounded-lg overflow-hidden border border-zinc-700">
        {(['OR', 'AND']).map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={cx(
              'px-3 py-1 text-xs font-semibold',
              value === opt ? 'bg-zinc-700 text-white' : 'bg-transparent text-zinc-300 hover:bg-zinc-800'
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </>
  )
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 py-1 select-none">
      <input type="checkbox" className="size-4 accent-indigo-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm text-zinc-200">{label}</span>
    </label>
  )
}

function Pill({ children }) {
  return <span className="inline-block px-2 py-0.5 text-[11px] rounded border border-zinc-700 text-zinc-300">{children}</span>
}

// ---------- main ----------
export default function App() {
  const [equipJson, setEquipJson] = useState(null)
  const [idDict, setIdDict] = useState({})
  const [loadErr, setLoadErr] = useState('')

  // 4 組條件（星數／類型／基礎效果／觸發條件）
  const [starSelected, setStarSelected] = useState(new Set())
  const [typeSelected, setTypeSelected] = useState(new Set())
  const [basicSelected, setBasicSelected] = useState(new Set())
  const [basicMode, setBasicMode] = useState('OR')
  const [trigAttrSelected, setTrigAttrSelected] = useState(new Set())
  const [trigTypeSelected, setTrigTypeSelected] = useState(new Set())
  
  const [showMax, setShowMax] = useState(false)
  const [results, setResults] = useState([])
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    (async () => {
      try {
        const equips = await fetchJSON(`${BASE}裝備資料庫.json`)
        const ids = await fetchJSON(`${BASE}id_dict.json`)
        setEquipJson(equips)
        setIdDict(ids)
      } catch (e) {
        console.error(e)
        setLoadErr(String(e))
      }
    })()
  }, [])

  // 動態收集所有「基礎效果」鍵
  const basicKeys = useMemo(() => {
    const s = new Set()
    ;(equipJson || []).forEach((eq) => {
      const b = eq['基本效果']
      if (b && typeof b === 'object') Object.keys(b).forEach((k) => s.add(k))
    })
    return [...s].sort()
  }, [equipJson])

  function getThumbUrl(eq) {
    const name = String(eq['裝備名稱'] || '')
    const id = idDict ? idDict[name] : undefined
    if (!id) return null
    return `${BASE}gear_icon/${id}_icon.png`
  }

  function summarizeTrigger(eq) {
    const adv = eq['高級效果']
    const t = adv && typeof adv === 'object' ? adv['觸發條件'] : undefined
    return typeof t === 'string' && t.trim() ? t.trim() : '無'
  }

  function summarizeSkillPlus(eq) {
    const sp = eq['Skill+']
    if (!sp) return '無'
    if (typeof sp === 'object') {
      const trig  = sp['觸發條件'] || sp['條件'] || sp['目標']
      const mag   = sp['強化幅度'] || sp['幅度'] || sp['加成'] || sp['效果']
      const skill = extractSkillPhrase(trig)
      const magN  = normalizeRangeText(mag || '')
      const parts = []
      if (skill) parts.push(skill)
      if (magN)  parts.push('+' + magN)
      return parts.length ? parts.join(' ') : '無'
    }
    if (typeof sp === 'string') return sp.trim() || '無'
    return '無'
  }

  function doSearch() {
    const S_star = new Set(starSelected)
    const S_type = new Set(typeSelected)
    const S_basic = new Set(basicSelected)
    const S_attr = new Set(trigAttrSelected)
    const S_tcls = new Set(trigTypeSelected)

    const out = (equipJson || []).filter((eq) => {
      const star = Number(eq['裝備星級'] || 0)
      const ok1 = matchCategoryValue(star, S_star, 'OR')

      const typeVal = String(eq['裝備種類'] || '')
      const ok2 = matchCategoryValue(typeVal, S_type, 'OR')

      const b = eq['基本效果']
      const eqBasicKeys = new Set(b && typeof b === 'object' ? Object.keys(b) : [])
      const ok3 = matchEffectKeys(eqBasicKeys, S_basic, basicMode)

      // 觸發條件（合併：屬性 + 類型，固定 OR）
      const adv = eq['高級效果']
      const trigStr = adv && typeof adv === 'object' ? adv['觸發條件'] : ''
      const { attrs, types } = pickTriggerTags(trigStr || '')
      const eqTags = new Set([...attrs, ...types])
      const selectedTags = new Set([...S_attr, ...S_tcls])
      const ok4 = matchEffectKeys(eqTags, selectedTags, 'OR')

      return ok1 && ok2 && ok3 && ok4
    })

    out.sort((a, b) => {
      const s = Number(b['裝備星級'] || 0) - Number(a['裝備星級'] || 0)
      if (s !== 0) return s
      const t = String(a['裝備種類'] || '').localeCompare(String(b['裝備種類'] || ''))
      if (t !== 0) return t
      return String(a['裝備名稱'] || '').localeCompare(String(b['裝備名稱'] || ''))
    })

    setResults(out)
  }

  function clearAll() {
    setStarSelected(new Set())
    setTypeSelected(new Set())
    setBasicSelected(new Set())
    setTrigAttrSelected(new Set())
    setTrigTypeSelected(new Set())
    setResults([])
  }

  // render helpers
  const typeBoxes = ['武器', '防具', '飾品'].map((t) => (
    <Checkbox key={t} label={t} checked={typeSelected.has(t)} onChange={(v) => {
      const next = new Set(typeSelected); v ? next.add(t) : next.delete(t); setTypeSelected(next)
    }} />
  ))

  const basicBoxes = basicKeys.map((k) => (
    <Checkbox key={k} label={k} checked={basicSelected.has(k)} onChange={(v) => {
      const next = new Set(basicSelected); v ? next.add(k) : next.delete(k); setBasicSelected(next)
    }} />
  ))

  const attrBoxes = ATTR_OPTIONS.map((a) => (
    <Checkbox key={a} label={a} checked={trigAttrSelected.has(a)} onChange={(v) => {
      const next = new Set(trigAttrSelected); v ? next.add(a) : next.delete(a); setTrigAttrSelected(next)
    }} />
  ))

  const typeClassBoxes = TYPECLASS_OPTIONS.map((t) => (
    <Checkbox key={t} label={t} checked={trigTypeSelected.has(t)} onChange={(v) => {
      const next = new Set(trigTypeSelected); v ? next.add(t) : next.delete(t); setTrigTypeSelected(next)
    }} />
  ))

  // 結果卡片（直向版；基本效果一行一個）
  function ResultCard({ eq, showMax }) {
    const thumb = getThumbUrl(eq)
    const name = String(eq['裝備名稱'] || '（未命名）')
    const starStr = `${eq['裝備星級'] || 0}★`
    const kind = String(eq['裝備種類'] || '')
    const basic = eq['基本效果'] || {}
    const triggerText = summarizeTrigger(eq)
    const skillPlusText = summarizeSkillPlus(eq)

    return (
      <div className="rounded-xl border border-zinc-800 p-3 bg-zinc-900/40">
        {/* 圖片 + 按鈕 */}
        <div className="flex flex-col items-center">
          <div className="w-24 h-24 rounded-lg bg-zinc-800 flex items-center justify-center overflow-hidden">
            {thumb ? (
              <img src={thumb} alt="eq" className="w-20 h-20 object-contain" />
            ) : (
              <span className="text-[10px] text-zinc-400">無圖</span>
            )}
          </div>
          <button
            className="mt-2 text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700"
            onClick={() => setDetail(eq)}
          >
            查看詳情
          </button>
        </div>

        {/* 名稱、星數與種類 */}
        <div className="mt-3">
          <div className="text-base md:text-lg font-bold truncate text-center">{name}</div>
          <div className="text-sm text-zinc-300 mt-0.5 text-center">
            {starStr} <span className="mx-1">|</span> {kind}
          </div>
        </div>

        {/* 基本效果：一行一個 */}
        <div className="mt-3 text-sm">
          <div className="text-zinc-400">基本效果：</div>
          {Object.keys(basic).length ? (
            <ul className="mt-1 space-y-1">
              {Object.entries(basic).map(([k, v]) => (
                <li key={k}>{k}: {showMax ? scaleNumbersInText(v, 6) : String(v)}</li>
              ))}
            </ul>
          ) : (
            <div className="mt-1 text-zinc-400">（無）</div>
          )}
        </div>

        {/* 高級效果觸發條件 */}
        <div className="mt-3 text-sm">
          <div className="text-zinc-400">高級效果觸發條件：</div>
          <div className="mt-1">{triggerText}</div>
        </div>

        {/* Skill+ */}
        <div className="mt-3 text-sm">
          <div className="text-zinc-400">Skill+：</div>
          <div className="mt-1">{skillPlusText}</div>
        </div>
      </div>
    )
  }

  // 詳情 Dialog（基本效果一行一個）
  function DetailDialog({ eq, onClose, showMax }) {
    if (!eq) return null
    const url = getThumbUrl(eq)

    // Skill+ 組裝（沒有就「無」）
    const sp = eq['Skill+']
    let spLine = '無'
    if (sp) {
      if (typeof sp === 'object') {
        const trig  = sp['觸發條件'] || sp['條件'] || sp['目標']
        const mag   = sp['強化幅度'] || sp['幅度'] || sp['加成'] || sp['效果']
        const skill = extractSkillPhrase(trig)
        const magN  = normalizeRangeText(mag || '')
        const parts = []
        if (skill) parts.push(skill)
        if (magN)  parts.push('+' + magN)
        spLine = parts.length ? parts.join(' ') : '無'
      } else if (typeof sp === 'string') spLine = sp.trim() || '無'
      else spLine = '無'
    }

    const b = eq['基本效果'] || {}
    const adv = eq['高級效果'] || {}

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
        <div className="bg-zinc-900 text-zinc-100 w-full max-w-3xl rounded-2xl shadow-xl" onClick={(e) => e.stopPropagation()}>
          {/* 標頭：圖片 + 名稱 + 星數/類型 */}
          <div className="flex gap-4 p-4 border-b border-zinc-800">
            <div className="flex flex-col items-center">
              <div className="w-36 h-36 bg-zinc-800 rounded-xl flex items-center justify-center overflow-hidden">
                {url ? (<img src={url} alt="eq" className="w-32 h-32 object-contain" />) : (<span className="text-xs text-zinc-400">無圖</span>)}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-lg font-bold truncate">{eq['裝備名稱'] || '（未命名）'}</div>
              <div className="mt-1 text-sm text-zinc-300">
                <Pill>{`${eq['裝備星級'] || 0}★`}</Pill>
                <span className="mx-2">|</span>
                <Pill>{eq['裝備種類'] || ''}</Pill>
              </div>
            </div>
            <button className="px-3 py-1 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg" onClick={onClose}>關閉</button>
          </div>

          {/* 內容：左欄 基本效果 +（永遠顯示）Skill+；右欄 高級效果 */}
          <div className="max-h-[60vh] overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 左欄 */}
            <section>
              <div className="font-semibold mb-2">基本效果</div>
              {Object.keys(b).length ? (
                <ul className="space-y-1">
                  {Object.entries(b).map(([k, v]) => (
                    <li key={k} className="text-sm">
                      <span className="text-zinc-400">{k}：</span>{showMax ? scaleNumbersInText(v, 6) : String(v)}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-zinc-400">（無）</div>
              )}

              {/* Skill+ 區塊：永遠顯示；沒有時 spLine = 「無」 */}
              <div className="mt-4">
                <div className="font-semibold mb-2">Skill+</div>
                <div className="text-sm">{spLine}</div>
              </div>
            </section>

            {/* 右欄 高級效果（維持不變） */}
            <section>
              <div className="font-semibold mb-2">高級效果</div>
              {Object.keys(adv).length ? (
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-zinc-400">觸發條件：</span>
                    {adv['觸發條件'] || '（無）'}
                  </div>
                  {adv['可切換的效果'] && (
                    <div>
                      <div className="text-zinc-400">可切換的效果：</div>
                      <ul className="mt-1 space-y-1">
                        {Object.entries(adv['可切換的效果']).map(([k, v]) => (
                          <li key={k}>・{k}：{String(v)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-zinc-400">（無高級效果）</div>
              )}
            </section>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/60 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="text-lg font-bold">裝備查詢系統（Web/React，自動載入）</div>
          <div className="ml-auto text-xs text-zinc-400">四組 AND/OR（星數/類型/基礎效果/觸發條件）</div>
        </div>
      </header>

      {loadErr && (
        <div className="max-w-7xl mx-auto px-4 pt-4">
          <div className="rounded-xl border border-red-800 bg-red-900/20 p-3 text-sm text-red-200">
            自動載入失敗，請確認 public/ 內是否包含「裝備資料庫.json」「id_dict.json」與「gear_icon/」。<br />
            錯誤：{loadErr}
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-[18rem,1fr] gap-6">
        {/* 左側：篩選 */}
        <aside className="space-y-4">
          {/* 星數 */}
          <div className="rounded-2xl border border-zinc-800 p-3 bg-zinc-900/40">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">星數</div>
            </div>
            <div className="mt-1 grid grid-cols-4 gap-x-2">
              {Array.from({ length: 8 }, (_, i) => i + 1).map((s) => (
                <Checkbox
                  key={s}
                  label={`${s}★`}
                  checked={starSelected.has(s)}
                  onChange={(v) => {
                    const next = new Set(starSelected); v ? next.add(s) : next.delete(s); setStarSelected(next)
                  }}
                />
              ))}
            </div>
          </div>

          {/* 類型 */}
          <div className="rounded-2xl border border-zinc-800 p-3 bg-zinc-900/40">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">類型</div>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-x-2">{typeBoxes}</div>
          </div>

          {/* 基礎效果：響應式（最多一行 5 個） */}
          <div className="rounded-2xl border border-zinc-800 p-3 bg-zinc-900/40 max-h-64 overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">基礎效果</div>
              <AndOrSwitch value={basicMode} onChange={setBasicMode} />
            </div>
            <div className="mt-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-3">
              {basicBoxes}
            </div>
          </div>

          {/* 觸發條件：合一欄（第一排屬性、第二排類型；固定 OR） */}
          <div className="rounded-2xl border border-zinc-800 p-3 bg-zinc-900/40">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">觸發條件</div>
            </div>
            <div className="mt-1 grid grid-cols-5 gap-x-2">{attrBoxes}</div>
            <div className="mt-1 grid grid-cols-3 gap-x-2">{typeClassBoxes}</div>
          </div>

          {/* 動作 */}
          <div className="flex gap-2">
            <button className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500" onClick={doSearch} disabled={!equipJson}>搜尋</button>
            <button className="flex-1 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700" onClick={clearAll}>全部清空</button>
          </div>
        
          {/* 額外設置 */}
          <div className="rounded-2xl border border-zinc-800 p-3 bg-zinc-900/40">
            <div className="text-sm font-semibold">額外設置</div>
            <div className="mt-1">
              <Checkbox label="顯示滿等數值" checked={showMax} onChange={(v) => setShowMax(v)} />
            </div>
          </div>
</aside>

        {/* 右側：結果列表（1~3 欄） */}
        <section>
          <div className="mb-3 text-sm text-zinc-300">
            {!equipJson ? '正在載入資料…' : (results.length ? `符合條件的裝備：${results.length} 件` : '請設定條件後按「搜尋」。')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {results.map((eq, i) => (<ResultCard key={i} eq={eq} showMax={showMax} />))}
          </div>
        </section>
      </main>

      {detail && <DetailDialog eq={detail} showMax={showMax} onClose={() => setDetail(null)} />}
    </div>
  )
}

// 將數值 * factor；若為字串，會把其中所有數字放大（保留原小數位數長度）
function scaleNumbersInText(val, factor) {
  // Always show 1 decimal place after scaling for both numbers and numbers inside strings.
  const toFixed1 = (x) => {
    const n = Number(x)
    if (!Number.isFinite(n)) return String(x)
    return n.toFixed(1)
  }
  if (val == null) return ''
  if (typeof val === 'number') {
    return toFixed1(val * factor)
  }
  const s = String(val)
  // 會把字串中的每個數字都乘上 factor，並固定到 1 位小數（保留 %, ~, +, 等符號）
  return s.replace(/-?\d+(?:\.\d+)?/g, (m) => {
    const num = parseFloat(m)
    if (Number.isNaN(num)) return m
    return toFixed1(num * factor)
  })
}
