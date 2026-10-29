import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'
import { prepareImage } from './image.js'

const MAX_FILES = 10

export default function Upload({ session, onDone }) {
  const [files, setFiles] = useState([]) // {key, file, preview, caption, state, error}
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const input = useRef(null)
  const filesRef = useRef(files)
  filesRef.current = files

  useEffect(() => () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.preview)), [])

  function add(list) {
    const arr = Array.from(list).filter((f) => f.type.startsWith('image/'))
    setFiles((prev) => {
      const room = MAX_FILES - prev.length
      const next = arr.slice(0, Math.max(0, room)).map((file) => ({
        key: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        caption: '',
        state: 'ready',
      }))
      return [...prev, ...next]
    })
  }

  function patch(key, p) {
    setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, ...p } : f)))
  }

  function drop(key) {
    setFiles((prev) => {
      const f = prev.find((x) => x.key === key)
      if (f) URL.revokeObjectURL(f.preview)
      return prev.filter((x) => x.key !== key)
    })
  }

  async function send() {
    setBusy(true)
    const uid = session.user.id
    let ok = 0
    for (const f of filesRef.current) {
      if (f.state === 'done') continue
      patch(f.key, { state: 'working', error: '' })
      try {
        const blob = await prepareImage(f.file)
        const path = `${uid}/${crypto.randomUUID()}.jpg`
        const up = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' })
        if (up.error) throw up.error
        const { error } = await supabase
          .from('photos')
          .insert({ path, caption: f.caption.trim() || null })
        if (error) {
          await supabase.storage.from('photos').remove([path])
          throw error
        }
        patch(f.key, { state: 'done' })
        ok++
      } catch (e) {
        patch(f.key, { state: 'error', error: e.message || String(e) })
      }
    }
    setBusy(false)
    if (ok > 0 && filesRef.current.every((f) => f.state === 'done')) onDone()
  }

  const pending = files.filter((f) => f.state !== 'done').length

  return (
    <section className="upload">
      <div className="section-head">
        <div>
          <p className="tag">[INSERT TAPE]</p>
          <h1 className="big-title">
            사진 <em>올리기</em>
          </h1>
        </div>
      </div>

      <div
        className={'dropzone' + (drag ? ' over' : '')}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          add(e.dataTransfer.files)
        }}
      >
        <p className="tag">[DROP HERE]</p>
        <p>사진을 여기로 끌어 놓거나 버튼을 눌러 고르세요. (한 번에 {MAX_FILES}장까지)</p>
        <p className="dim small">긴 변 1600px 로 자동으로 줄이고, 5MB 이하로 맞춰서 올려요.</p>
        <button className="btn" onClick={() => input.current?.click()} disabled={busy || files.length >= MAX_FILES}>
          ＋ 사진 고르기
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            add(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="up-list">
          {files.map((f) => (
            <li key={f.key} className={'up-item ' + f.state}>
              <img src={f.preview} alt="" />
              <div className="up-fields">
                <input
                  value={f.caption}
                  onChange={(e) => patch(f.key, { caption: e.target.value })}
                  placeholder="한 줄 설명 (선택)"
                  maxLength={100}
                  disabled={busy || f.state === 'done'}
                />
                <p className="tag small">
                  {f.state === 'ready' && `[READY] ${(f.file.size / 1024 / 1024).toFixed(1)}MB`}
                  {f.state === 'working' && '[UPLOADING…]'}
                  {f.state === 'done' && '[DONE ✓]'}
                  {f.state === 'error' && <span className="error">[ERROR] {f.error}</span>}
                </p>
              </div>
              <button className="x" onClick={() => drop(f.key)} disabled={busy} aria-label="목록에서 빼기">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="row">
        <button className="btn primary" onClick={send} disabled={busy || pending === 0}>
          {busy ? '올리는 중…' : `▶ ${pending || ''}장 올리기`}
        </button>
        <button className="btn ghost" onClick={onDone} disabled={busy}>
          갤러리로
        </button>
      </div>
    </section>
  )
}
