import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  // === Vault Management ===
  checkVaultExists: () => ipcRenderer.invoke("vault:check-exists"),
  unlockVault: (password) => ipcRenderer.invoke("vault:unlock", password),
  getVaultIdentities: () => ipcRenderer.invoke("vault:get-identities"),
  loginSelected: (idStrings) =>
    ipcRenderer.invoke("vault:login-selected", idStrings),

  // === Identity Management ===
  handleEnrollment: (payload) =>
    ipcRenderer.invoke("handle-enrollment", payload),
  handleIdentityUpload: (payload) =>
    ipcRenderer.invoke("handle-identity-upload", payload),
  deleteIdentity: (identityId) =>
    ipcRenderer.invoke("delete-identity", identityId),
  getZitiIdentityData: () => ipcRenderer.invoke("get-ziti-identity-data"),
  removeIdentityFromVault: (idString, password) =>
    ipcRenderer.invoke("vault:remove-identity", idString, password),

  // === Session Management ===
  checkSession: () => ipcRenderer.invoke("check-session"),
  logout: () => ipcRenderer.invoke("logout"),
  detectServiceProtocol: (serviceName) =>
    ipcRenderer.invoke("detect-service-protocol", serviceName),
  getActiveIdentitiesFromProxy: () =>
    ipcRenderer.invoke("proxy:get-active-identities"),

  // === VAULT STATE EVENTS (baru & wajib) ===
  onVaultUpdated: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("vault-updated", handler);
    return () => ipcRenderer.off("vault-updated", handler);
  },
  onVaultLocked: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on("vault-locked", handler);
    return () => ipcRenderer.off("vault-locked", handler);
  },

  // === Proxy Logging ===
  getProxyLogContent: () => ipcRenderer.invoke("proxy:get-log-content"),
  onProxyLogUpdate: (callback) => {
    const handler = (_, message) => callback(message);
    ipcRenderer.on("proxy-log-update", handler);
    return () => ipcRenderer.off("proxy-log-update", handler);
  },

  onNewTabRequest: (callback) => {
    const handler = (_, url) => callback(url);
    ipcRenderer.on("app:new-browser-tab", handler);
    return () => ipcRenderer.off("app:new-browser-tab", handler);
  },
});
