import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload Script ini bertindak sebagai jembatan yang aman (sandbox)
 * antara Renderer Process dan Main Process.
 * Kita mengekspos fungsi untuk:
 * 1. Mendapatkan path file lokal (getIdentityPath)
 * 2. Mengambil data identitas Ziti dari API Golang (getZitiIdentityData)
 */

contextBridge.exposeInMainWorld('electronAPI', {
    // Fungsi untuk memanggil handler IPC di Main Process: 'get-ziti-identity-data'
    // Perhatikan nama handler ini harus sama persis dengan yang ada di main.js
    getZitiIdentityData: () => ipcRenderer.invoke('get-ziti-identity-data'),
    
    // Jika Anda masih butuh handler untuk mendapatkan path file lokal (untuk tombol Identity)
    // getIdentityPath: () => ipcRenderer.invoke('get-identity-path'),
});
