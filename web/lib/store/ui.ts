import { create } from 'zustand'

type UiState = {
  busy: boolean
  setBusy: (v: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  busy: false,
  setBusy: (v: boolean) => set({ busy: v })
}))

