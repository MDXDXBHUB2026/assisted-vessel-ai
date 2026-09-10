import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-hull-950/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`max-h-[88vh] w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} overflow-y-auto rounded-lg border border-panel-border bg-panel shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-panel-border bg-panel px-4 py-3">
          <h2 className="text-sm font-semibold text-ink-000">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-ink-500 hover:bg-hull-700 hover:text-ink-100">
            <X size={16} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
