// --- Shared State untuk Renderer Process ---
// Semua modul import `state` dan mutate langsung.

export const state = {
  tabs: [],
  currentTabIndex: 0,
  activeIdentities: [],
  enabledIdentityIds: new Set(),
  activeServiceTabId: null,
  serviceTabs: new Map(),
  currentScreen: "no-vault",
  sessionVaultPassword: null,
  selectedIdentities: new Set(),
};
