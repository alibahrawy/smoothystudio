import { createStore } from 'zustand/vanilla'
import { persist, createJSONStorage } from 'zustand/middleware'
import Store from 'electron-store'
import { INITIAL_STATE, type AppState } from '@shared/state'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const disk = new Store({ name: 'app-state' }) as any

// StateStorage adapter — main-side, synchronous, backed by electron-store
const diskStorage = {
  getItem: (k: string): string | null => (disk.get(k) as string | undefined) ?? null,
  setItem: (k: string, v: string): void => {
    disk.set(k, v)
  },
  removeItem: (k: string): void => {
    disk.delete(k)
  },
}

export const store = createStore<AppState>()(
  persist(() => INITIAL_STATE, {
    name: 'app',
    storage: createJSONStorage(() => diskStorage),
    // Only persist user preferences. Auth state and runtime status are rehydrated on launch.
    partialize: (s) => ({ theme: s.theme }) as unknown as AppState,
  }),
)
