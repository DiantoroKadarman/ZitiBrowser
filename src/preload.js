import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  // Enroll: kirim JWT + password
  handleEnrollment: (jwtContent, password) => ipcRenderer.invoke("handle-enrollment", { jwtContent, password }),
  // Upload: kirim path file + password (bukan konten base64)
  
  handleIdentityUpload: (base64Data, password) =>ipcRenderer.invoke("handle-identity-upload", base64Data, password),
  
  logout: () => ipcRenderer.invoke("logout"),
  getZitiIdentityData: () => ipcRenderer.invoke("get-ziti-identity-data"),
  onSessionRestored: (callback) => ipcRenderer.on("session-restored", callback),
  onShowAuth: (callback) => ipcRenderer.on("show-auth", callback),
  onProxyNotRunning: (callback) => ipcRenderer.on("proxy-not-running", callback),
  deleteIdentity: (identityId) => ipcRenderer.invoke("delete-identity", identityId),
  checkSession: () => ipcRenderer.invoke("check-session"),
});
