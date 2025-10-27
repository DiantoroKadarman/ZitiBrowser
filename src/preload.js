import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  handleEnrollment: (jwtContent) =>
    ipcRenderer.invoke("handle-enrollment", jwtContent),
  handleIdentityUpload: (encryptedFileContentBase64) =>
    ipcRenderer.invoke("handle-identity-upload", encryptedFileContentBase64),

  logout: () => ipcRenderer.invoke("logout"),

  getZitiIdentityData: () => ipcRenderer.invoke("get-ziti-identity-data"),

  onSessionRestored: (callback) => ipcRenderer.on("session-restored", callback),
  onShowAuth: (callback) => ipcRenderer.on("show-auth", callback),
  onProxyNotRunning: (callback) =>
    ipcRenderer.on("proxy-not-running", callback),

  deleteIdentity: (identityId) =>
    ipcRenderer.invoke("delete-identity", identityId),
  checkSession: () => ipcRenderer.invoke('check-session'),
});
