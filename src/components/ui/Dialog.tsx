'use client'
import { useEffect, useState } from 'react'

// ── سیستمِ دیالوگِ داخلِ‌برنامه (جایگزینِ alert/confirm/prompt مرورگر) ──
type Kind = 'alert' | 'confirm' | 'prompt'
type DialogReq = {
  id: number
  kind: Kind
  message: string
  defaultValue?: string
  required?: boolean
  danger?: boolean
  okText?: string
  resolve: (v: any) => void
}

let queue: DialogReq[] = []
let listeners: Array<() => void> = []
let seq = 0
function emit() { listeners.forEach(l => l()) }
function push(req: Omit<DialogReq, 'id'>) {
  queue = [...queue, { ...req, id: ++seq }]
  emit()
}

export function uiAlert(message: string): Promise<void> {
  return new Promise(resolve => push({ kind: 'alert', message, resolve }))
}
export function uiConfirm(message: string, opts?: { danger?: boolean; okText?: string }): Promise<boolean> {
  return new Promise(resolve => push({ kind: 'confirm', message, danger: opts?.danger, okText: opts?.okText, resolve }))
}
export function uiPrompt(message: string, opts?: { defaultValue?: string; required?: boolean; okText?: string }): Promise<string | null> {
  return new Promise(resolve => push({ kind: 'prompt', message, defaultValue: opts?.defaultValue || '', required: opts?.required, okText: opts?.okText, resolve }))
}

export function DialogHost() {
  const [, force] = useState(0)
  const [val, setVal] = useState('')
  useEffect(() => {
    const l = () => force(x => x + 1)
    listeners.push(l)
    return () => { listeners = listeners.filter(x => x !== l) }
  }, [])

  const current = queue[0]
  useEffect(() => { if (current?.kind === 'prompt') setVal(current.defaultValue || '') }, [current?.id]) // eslint-disable-line

  if (!current) return null
  const close = (v: any) => { current.resolve(v); queue = queue.slice(1); emit() }
  const okLabel = current.okText || (current.kind === 'confirm' ? 'تأیید' : current.kind === 'prompt' ? 'ثبت' : 'باشه')

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" dir="rtl"
      onClick={e => { if (e.target === e.currentTarget && current.kind !== 'prompt') close(current.kind === 'confirm' ? false : undefined) }}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl">
        <p className="text-sm text-gray-800 leading-6 whitespace-pre-wrap mb-4">{current.message}</p>

        {current.kind === 'prompt' && (
          <textarea value={val} onChange={e => setVal(e.target.value)} rows={3} autoFocus
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-brand-400 resize-none mb-4" />
        )}

        <div className="flex gap-2">
          {current.kind !== 'alert' && (
            <button onClick={() => close(current.kind === 'confirm' ? false : null)}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50">انصراف</button>
          )}
          <button
            onClick={() => {
              if (current.kind === 'prompt') {
                if (current.required && !val.trim()) return
                close(val)
              } else if (current.kind === 'confirm') close(true)
              else close(undefined)
            }}
            disabled={current.kind === 'prompt' && current.required && !val.trim()}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-40 ${current.danger ? 'bg-red-500 hover:bg-red-600' : 'bg-brand-600 hover:bg-brand-700'}`}>
            {okLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
