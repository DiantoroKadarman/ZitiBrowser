import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  // === ZITI Identity Management ===
  handleEnrollment: (jwtContent, password) => ipcRenderer.invoke("handle-enrollment", { jwtContent, password }),
  handleIdentityUpload: (base64Data, password) => ipcRenderer.invoke("handle-identity-upload", base64Data, password),
  getZitiIdentityData: () => ipcRenderer.invoke("get-ziti-identity-data"),
  deleteIdentity: (identityId) => ipcRenderer.invoke("delete-identity", identityId),
  checkSession: () => ipcRenderer.invoke("check-session"),
  logout: () => ipcRenderer.invoke("logout"), 

  // === Session Events (dengan penyesuaian payload) ===
  onSessionRestored: (callback) => ipcRenderer.on("session-restored", (_, payload) => callback(payload)),
  onShowAuth: (callback) => ipcRenderer.on("show-auth", () => callback()),
  onProxyNotRunning: (callback) => ipcRenderer.on("proxy-not-running", () => callback()),

  // === Proxy Log Management (hanya baca file saat dibutuhkan) ===
  getProxyLogContent: () => ipcRenderer.invoke("proxy:get-log-content"),
});
