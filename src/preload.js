import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    // Fungsi untuk memanggil handler IPC di Main Process: 'get-ziti-identity-data'
    getZitiIdentityData: () => ipcRenderer.invoke('get-ziti-identity-data'),
});
