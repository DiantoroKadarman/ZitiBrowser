// preload.js
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // --- Enroll: kirim string JWT, dapatkan status & pesan
  handleEnrollment: (jwtContent) => ipcRenderer.invoke('handle-enrollment', jwtContent),

  // --- Upload: kirim konten file terenkripsi (Base64 string)
  handleIdentityUpload: (encryptedFileContentBase64) =>
    ipcRenderer.invoke('handle-identity-upload', encryptedFileContentBase64),

  // --- Logout
  logout: () => ipcRenderer.invoke('logout'),

  // --- Ambil data identitas aktif (hanya bisa dipanggil setelah login)
  getZitiIdentityData: () => ipcRenderer.invoke('get-ziti-identity-data'),
});