# Ziti Browser: Fitur dan Alur Aplikasi

Dokumen ini menjelaskan fitur-fitur yang tersedia di Ziti Browser beserta alur kerja (flow) pengguna saat menggunakan aplikasi. Ziti Browser didesain dengan konsep **Strict Whitelist Mode** yang sangat aman.

---

## 1. Fitur Utama

### A. Sistem Vault Keamanan (Ziti Vault)
- Seluruh identitas Ziti yang diunggah ke dalam aplikasi akan dienkripsi dan disimpan di dalam sebuah file bernama `ziti-vault.enc`.
- Pengguna wajib membuat dan memasukkan **Password Vault** (minimal 8 karakter) untuk membuka, mengenkripsi, maupun menghapus identitas dari vault.

### B. Multi-Identity Login
- Pengguna dapat mengelola (menambah dan menghapus) banyak identitas Ziti di dalam satu aplikasi.
- Saat login, pengguna dapat mencentang **satu atau lebih identitas sekaligus** untuk diaktifkan secara paralel.

### C. Strict Whitelist Server Mode
- **Tanpa Address Bar Bebas:** Tidak seperti browser konvensional (Chrome/Firefox), Ziti Browser tidak mengizinkan pengguna untuk mengetik sembarang alamat website.
- **Navigasi Sidebar:** Pengguna hanya dapat mengakses layanan (*services*) yang terdaftar di identitas Ziti mereka (atau melalui *Dev Shortcuts* jika dikonfigurasi). 
- **Proteksi window.open:** Jika layanan mencoba membuka tab atau *pop-up* baru, sistem akan mengecek apakah URL tersebut berada di dalam domain layanan yang diizinkan. Jika tidak, permintaan akan diblokir.

### D. UI/UX Dinamis
- **Loading Skeleton & Progress Bar:** Saat memuat layanan Ziti, pengguna akan melihat animasi garis *loading* di bagian atas layar beserta *skeleton overlay* (kerangka bayangan) untuk memberikan respon visual instan.
- **Log Proxy:** Terdapat menu "Log Ziti Proxy" yang memungkinkan pengguna melihat *output log* langsung dari `zitihttproxy.exe` (sangat berguna untuk keperluan diagnostik).
- **Theme Toggle:** Aplikasi mendukung pengubahan tema tampilan (Light/Dark mode).
- **Error Handling Visual:** Menampilkan halaman error khusus yang ramah bagi pengguna jika koneksi gagal (misalnya 404, 500, atau koneksi timeout).

---

## 2. Alur Kerja Pengguna (User Flow)

### 1. Inisialisasi Pertama Kali (Belum ada Vault)
1. Buka aplikasi. Sistem mengecek file `ziti-vault.enc`. Jika tidak ada, pengguna akan dibawa ke layar awal.
2. Pengguna dapat memilih untuk **Enroll dari JWT** atau **Upload dari JSON**.
3. Sistem akan meminta pengguna membuat **Password Vault**.
4. Setelah file berhasil diproses (enroll ke jaringan Ziti atau ekstrak JSON), identitas akan disimpan di vault, di-login-kan secara otomatis, dan masuk ke **Mode Layanan**.

### 2. Login dengan Vault yang Sudah Ada
1. Buka aplikasi. Sistem mendeteksi `ziti-vault.enc`.
2. Tampil pop-up "Masukkan Password Vault". Pengguna memasukkan password.
3. Setelah terbuka, pengguna melihat **Daftar Identitas**.
4. Pengguna mencentang identitas mana saja yang ingin diaktifkan, lalu klik tombol **Login**.
5. Sistem menyuntikkan identitas ke *Ziti HTTP Proxy*.
6. Masuk ke **Mode Layanan**.

### 3. Mode Layanan (Strict Whitelist Navigasi)
1. Setelah login, pengguna melihat *Sidebar* di sebelah kiri.
2. *Sidebar* akan menampilkan identitas yang aktif beserta layanan (URL) yang diizinkannya (termasuk *Dev Shortcuts* jika ada).
3. Pengguna mengklik salah satu layanan.
4. *Loading Skeleton* muncul secara instan, dan aplikasi mulai memuat alamat tersebut (melalui protokol yang otomatis dideteksi HTTP/HTTPS) menggunakan `<webview>`.
5. Progress bar akan berjalan. Jika berhasil, *Skeleton* hilang dan halaman ditampilkan. Jika gagal (misal server down), layar error muncul.
6. *Address bar* di bagian atas hanya bersifat sebagai indikator (*read-only*) dan pengguna hanya dapat menggunakan tombol navigasi (*Back*, *Forward*, *Reload*).

### 4. Manajemen Identitas (Menambah dan Menghapus)
- **Menambah Identitas Baru:** Saat pengguna berada di layar *Daftar Identitas*, mereka dapat mengklik tombol "Tambah Identitas", memilih file JSON/JWT baru, dan sistem akan menggabungkannya ke vault.
- **Menghapus Identitas:** Saat berada di Mode Layanan, pengguna dapat mengklik ikon Profil (Pojok Kanan Atas) untuk membuka modal Manajemen Identitas. Pengguna dapat mencentang identitas yang ingin dihapus dari sistem (memerlukan password vault).
- **Logout:** Menghapus sesi sementara dari *proxy*, menutup semua tab layanan yang aktif, dan mengembalikan pengguna ke layar daftar identitas.
