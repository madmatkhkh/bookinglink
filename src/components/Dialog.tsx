'use client'
// دیالوگ‌های درون‌برنامه‌ای به‌جای alert/confirm مرورگر (میراثِ DialogHost)
import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

type DialogState =
  | { kind: 'alert'; message: string; resolve: () => void }
  | { kind: 'confirm'; message: string; resolve: (ok: boolean) => void }
  | null

const DialogCtx = createContext<{
  uiAlert: (msg: string) => Promise<void>
  uiConfirm: (msg: string) => Promise<boolean>
}>({ uiAlert: async () => {}, uiConfirm: async () => false })

export const useDialog = () => useContext(DialogCtx)

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dlg, setDlg] = useState<DialogState>(null)

  const uiAlert = useCallback((message: string) =>
    new Promise<void>(resolve => setDlg({ kind: 'alert', message, resolve })), [])
  const uiConfirm = useCallback((message: string) =>
    new Promise<boolean>(resolve => setDlg({ kind: 'confirm', message, resolve })), [])

  function close(ok: boolean) {
    if (!dlg) return
    if (dlg.kind === 'alert') dlg.resolve()
    else dlg.resolve(ok)
    setDlg(null)
  }

  return (
    <DialogCtx.Provider value={{ uiAlert, uiConfirm }}>
      {children}
      {dlg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl">
            <p className="text-sm leading-relaxed whitespace-pre-line">{dlg.message}</p>
            <div className="flex gap-2 mt-5">
              {dlg.kind === 'confirm' && (
                <button onClick={() => close(false)}
                  className="flex-1 py-2.5 rounded-xl border border-sand text-sm text-soot hover:bg-gray-50">
                  انصراف
                </button>
              )}
              <button onClick={() => close(true)}
                className="flex-1 py-2.5 rounded-xl bg-ink text-white text-sm font-medium hover:bg-ink/90">
                {dlg.kind === 'confirm' ? 'تایید' : 'باشه'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogCtx.Provider>
  )
}
