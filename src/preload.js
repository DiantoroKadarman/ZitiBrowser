import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld("electronAPI", {
    // 1. Cek status identity saat startup
    checkIdentityStatus: () => ipcRenderer.invoke("check-identity-status"),

    // 2. Enrollment (POST JWT, Simpan Identity Terenkripsi)
    handleEnrollment: (jwtContent) => ipcRenderer.invoke("handle-enrollment", jwtContent), 
    
    // 3. Re-Aktivasi (Dekripsi SafeStorage dan Muat Proxy)
    reactivateSavedIdentity: () => ipcRenderer.invoke("reactivate-saved-identity"), 
    
    // 4. Logout (Hentikan Proxy dan Reset Sesi)
    logout: () => ipcRenderer.invoke("logout"),
    
    // 5. Mengambil data Identity dan Services dari Proxy yang sedang berjalan
    getZitiIdentityData: () => ipcRenderer.invoke("get-ziti-identity-data"),
});
