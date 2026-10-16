import { create } from 'zustand'

export type ToastTone = 'success' | 'error'

interface ToastState {
  message: string | null
  tone: ToastTone
  /** Changes on every show, so the same message twice still restarts the timer. */
  id: number
  show: (message: string, tone?: ToastTone) => void
  dismiss: () => void
}

export const useToast = create<ToastState>()((set) => ({
  message: null,
  tone: 'success',
  id: 0,
  show: (message, tone = 'success') => set((s) => ({ message, tone, id: s.id + 1 })),
  dismiss: () => set({ message: null }),
}))
