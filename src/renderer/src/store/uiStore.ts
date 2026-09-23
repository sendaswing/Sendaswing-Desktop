import { create } from 'zustand'
import type { AppRoute } from '../components/layout/Sidebar'

interface UiStore {
  /** Which screen is showing. Lives in a store so capture/hotkeys can navigate. */
  route: AppRoute
  setRoute: (r: AppRoute) => void
  /** Short status message shown in the corner (e.g. "Swing 5 saved"). */
  toast: { text: string; kind: 'info' | 'error' } | null
  showToast: (text: string, kind?: 'info' | 'error') => void
}

let toastTimer: ReturnType<typeof setTimeout> | null = null

export const useUiStore = create<UiStore>()((set) => ({
  route: 'capture',
  setRoute: (route) => set({ route }),
  toast: null,
  showToast: (text, kind = 'info') => {
    if (toastTimer) clearTimeout(toastTimer)
    set({ toast: { text, kind } })
    toastTimer = setTimeout(() => set({ toast: null }), kind === 'error' ? 6000 : 2500)
  }
}))
