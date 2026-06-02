import { create } from 'zustand'

type Page = 'dashboard' | 'add' | 'list' | 'stats' | 'annual' | 'categories' | 'import' | 'investment'

interface AppState {
  currentPage: Page
  setPage: (page: Page) => void
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'dashboard',
  setPage: (page) => set({ currentPage: page })
}))
