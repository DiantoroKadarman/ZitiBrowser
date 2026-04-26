# Dokumentasi Teknis ZitiBrowser

Dokumen ini dibuat untuk membantu developer baru (atau orang awam) memahami bagaimana kode ZitiBrowser disusun, apa fungsi masing-masing file, dan bagaimana cara mereka saling berkomunikasi.

---

## 1. Arsitektur Dasar (ElectronJS)

ZitiBrowser dibangun menggunakan **ElectronJS**, yang secara alami memisahkan kode menjadi dua "dunia" utama:

1. **Main Process (`src/main/`)**: "Otak" di balik layar. Mengurus sistem operasi, akses file lokal (penyimpanan vault), menjalankan program eksternal (seperti `zitihttproxy.exe`), enkripsi, dan *networking* tingkat rendah. Dunia ini **tidak punya UI** (tidak bisa memanipulasi HTML/CSS).
2. **Renderer Process (`src/renderer/` & `index.html`)**: "Wajah" aplikasi. Ini adalah halaman web yang Anda lihat. Mengurus tampilan, tombol klik, animasi, sidebar, tab, dan *webview* (area untuk menampilkan website Ziti). Dunia ini **tidak punya akses langsung ke sistem operasi** demi keamanan.
3. **Preload Script (`src/preload.js`)**: "Jembatan" yang aman. Karena Renderer tidak boleh langsung mengakses sistem, Preload menyediakan jalur komunikasi (disebut **IPC** - Inter-Process Communication) agar Renderer bisa meminta tolong Main Process untuk melakukan hal-hal sistem.

---

## 2. Struktur Folder & Fungsi File

Setelah *refactoring*, kode yang dulunya digabung menjadi satu file besar kini sudah dipecah agar lebih rapi.

### A. Folder `src/main/` (Main Process)
Berisi logika *backend*.

*   **`main.js`**: Titik awal aplikasi jalan. Tugasnya hanya membuat jendela aplikasi (*browser window*) dan memanggil modul-modul lain untuk siap bekerja.
*   **`vault.js`**: Mengurus keamanan. Menyimpan identitas Ziti ke dalam file `ziti-vault.enc`, mengenkripsi dengan password, dan mendekripsi saat login.
*   **`proxy.js`**: Bertugas menghidupkan dan mematikan program pihak ketiga yaitu `zitihttproxy.exe`, serta menangani file log-nya.
*   **`api.js`**: Tempat menyimpan alamat URL (seperti `127.0.0.1:8081`) dan fungsi pembantu untuk menembak API HTTP ke `zitihttproxy.exe` (misalnya untuk *enroll* identitas).
*   **`ssl.js`**: Menangani error jika ada layanan Ziti yang menggunakan sertifikat "Self-Signed". Ia yang mengizinkan *bypass* jika pengguna menyetujuinya.
*   **`ipc-handlers.js`**: Resepsionis utama. Berisi daftar pendengar (pendengar *event*) dari UI. Misalnya jika UI bilang "Tolong hapus identitas X", file ini yang akan mendengar dan menyuruh `vault.js` untuk menghapusnya.
*   **`shared.js`**: Tempat menyimpan data yang dipakai bersama-sama antar file di folder `main/`, contohnya referensi ke jendela aplikasi utama (`mainWindow`).

### B. Folder `src/renderer/` (Renderer Process)
Berisi logika *frontend*.

*   **`renderer.js`**: Titik awal tampilan. Mengatur apa yang harus terjadi saat aplikasi pertama kali dibuka (mengecek apakah butuh *password*, atau langsung masuk ke daftar identitas).
*   **`state.js`**: Menyimpan data memori sementara selama aplikasi hidup (seperti: tab apa saja yang sedang buka, identitas apa yang aktif) dan menyimpan referensi elemen HTML agar file lain gampang mencarinya.
*   **`screens.js`**: Pengatur "Layar". Menyembunyikan dan menampilkan kotak auth, daftar identitas, atau area browser utama sesuai instruksi.
*   **`auth.js`**: Paling sibuk di awal. Mengurus form upload JSON/JWT, logika memilih identitas untuk di-login, dan penghapusan identitas.
*   **`password-prompt.js`**: Menampilkan pop-up peringatan jika pengguna harus memasukkan *password* baru atau membuka *password* vault lama.
*   **`browser-tabs.js`**: Mengurus logika tab browser standar (seperti tab di Google Chrome).
*   **`service-tabs.js`**: Mengurus logika daftar Ziti Service di *sidebar* kiri, dan membuatkan tab khusus untuk layanan Ziti.
*   **`webview.js`**: `webview` adalah semacam "browser di dalam browser" (iframe canggih) untuk menampilkan website dari Ziti. File ini mendengarkan kapan loading selesai, error, dll.
*   **`progress-bar.js`**: Mengurus animasi garis loading di atas layar saat webview sedang memuat halaman.
*   **`ssl-modal.js`**: Jika webview mendeteksi *Error Certificate*, file ini akan memunculkan pop-up merah bertuliskan "Sertifikat Tidak Aman".
*   **`identity-modal.js`**: Menampilkan daftar identitas aktif beserta tombol hapusnya (muncul jika tombol orang di pojok kanan atas di-klik saat mode browser).
*   **`log-modal.js`**: Menampilkan jendela hitam berisi *log* aktivitas proxy.

### C. File Konfigurasi & Styling (Root Directory)
*   **`index.html`**: Kerangka visual utama. Semua kotak, tombol, dan sidebar aslinya ada di sini namun disembunyikan pakai kode class `hidden`.
*   **`src/preload.js`**: Jembatan IPC (akan dijelaskan di bawah).
*   **`index.css`**: File styling utama tempat definisi *Tailwind CSS* dan beberapa kustomisasi CSS (seperti animasi spinner dan warna custom).
*   **`forge.config.js`**: Konfigurasi untuk mem-build aplikasi menjadi file `.exe` (Windows) atau format OS lainnya menggunakan *Electron Forge*. Disini juga diatur lokasi entry point aplikasi.
*   **`vite.*.config.mjs`**: File konfigurasi *Vite* yang memproses bundel kode Main, Renderer, dan Preload agar ukurannya kecil dan cepat dijalankan.
*   **`package.json`**: Daftar "KTP" aplikasi. Berisi nama aplikasi, versi, dan daftar *library/dependency* pihak ketiga yang digunakan (seperti `electron`, `vite`, dll).

---

## 3. Komunikasi Antar File (Bagaimana Mereka Ngobrol?)

### Di Dunia yang Sama (Contoh: Renderer ke Renderer)
Mereka mengobrol menggunakan sistem **Import / Export**.
*   Contoh: Jika `browser-tabs.js` ingin membuat *webview* baru, dia akan memanggil `createWebviewForTab()` yang di-*import* dari `webview.js`.
*   Mereka juga berbagi variabel lewat `state.js` agar datanya sinkron.

### Di Beda Dunia (Renderer ke Main Process)
Ini adalah bagian terpenting. Renderer **TIDAK BOLEH** langsung memanggil fungsi di Main Process. Harus lewat `preload.js` dengan sistem **IPC (Inter-Process Communication)**.

**Alurnya (Contoh: Mengambil isi Log Proxy):**

1. **User klik tombol Log di UI.**
2. `log-modal.js` (Renderer) memanggil fungsi di jembatan: 
   `window.electronAPI.getProxyLogContent()`
3. **Jembatan (`preload.js`)** menerima panggilan itu dan mengirimkan sinyal radio rahasia: 
   `ipcRenderer.invoke("proxy:get-log-content")`
4. **Resepsionis (`ipc-handlers.js` di Main)** mendengar sinyal tersebut (`ipcMain.handle("proxy:get-log-content", ...)`).
5. Resepsionis kemudian menyuruh `proxy.js` (Main) untuk membaca file log dari komputer pengguna.
6. Hasilnya dikirim balik melalui jalur yang sama, hingga akhirnya teks log muncul di layar pengguna.

### Sebaliknya (Main Process ke Renderer)
Kadang-kadang Main Process ingin memberi tahu UI sesuatu tanpa ditanya (misalnya: "Hei, ada error SSL!").
Main akan memancarkan sinyal: `mainWindow.webContents.send("ssl:certificate-error", data)`.
Preload menangkapnya dan meneruskannya ke Renderer untuk memunculkan modal.

---

## 4. Alur Hidup Aplikasi (Life Cycle)

1. **Start:** User klik icon aplikasi. `main/main.js` berjalan, membuka jendela, dan `proxy.js` menyalakan `zitihttproxy.exe`.
2. **Cek Kunci (Init):** UI terbuka. `renderer.js` meminta `checkSession()` ke Main. Main mengecek apakah file `ziti-vault.enc` ada.
   - *Kasus A:* File tidak ada. UI menampilkan form daftar/upload (`screens.js` -> `auth.js`).
   - *Kasus B:* File ada. UI memunculkan form pengisian password (`password-prompt.js`).
3. **Pilih Identitas:** Setelah password benar, UI menampilkan daftar nama. User menceklis dan klik Login. `auth.js` mengirim daftar itu ke proxy melalui API.
4. **Mode Browser:** Tampilan berubah menjadi browser. Sidebar muncul dari `service-tabs.js`. User bisa mengetik di address bar (`browser-tabs.js`) atau klik layanan di sidebar (`service-tabs.js`). Keduanya akan memuat website ke dalam `<webview>`.
5. **Selesai (Logout):** Saat user klik Logout, Preload membersihkan data sesi, menghapus cache webview, proxy api di-reset, dan layar kembali ke halaman pengisian password.
