const { contextBridge, ipcRenderer } = require('electron');

/**
 * Preload Script ini bertindak sebagai jembatan yang aman (sandbox)
 * antara Renderer Process (webview) dan Main Process (Node.js).
 * * Kita mengekspos fungsi 'getIdentityPath' ke jendela global
 * agar renderer dapat memanggilnya tanpa mengakses modul Node.js
 * secara langsung.
 */

// Mengekspos API yang aman ke Renderer Process (melalui window.electronAPI)
contextBridge.exposeInMainWorld('electronAPI', {
    /**
     * Memanggil fungsi di Main Process untuk mendapatkan path absolut
     * ke file 'identity_list.html'.
     * @returns {Promise<string>} Path absolut (misalnya, file:///C:/...)
     */
    getIdentityPath: () => ipcRenderer.invoke('get-identity-path'),
});
