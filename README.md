# Ziti Browser

**Ziti Browser** adalah aplikasi peramban aman berbasis **ElectronJS** yang mengimplementasikan **Zero Trust Architecture (ZTA)**. Aplikasi ini dirancang untuk mengakses layanan internal ("dark services") melalui jaringan overlay OpenZiti tanpa mengekspos layanan tersebut ke internet publik.

Aplikasi ini dikembangkan untuk mengatasi keterbatasan keamanan perimeter tradisional (VPN) dengan memindahkan fokus pertahanan ke **identitas pengguna**.

**Konsep Teknis:**
Ziti Browser bekerja dengan mengintegrasikan [Ziti HTTP Proxy](https://github.com/fandigunawan/zitihttproxy) **Ziti HTTP Proxy** (berbasis Golang SDK). Sistem ini menggunakan pendekatan *dual-port architecture* pada sisi klien:
* **Port 8080 (Proxy Server):** Menangani *traffic* data terenkripsi menuju jaringan OpenZiti.
* **Port 8081 (API Server):** Digunakan oleh aplikasi Electron untuk manajemen identitas (Enrollment, List Services, Delete Identity).

Seluruh komunikasi layanan internal dibungkus dalam *overlay network*, sehingga server tidak perlu membuka *inbound port* pada firewall dan tidak terlihat dari internet.

---

## ⚠️ Prasyarat (Prerequisites)

Sebelum menjalankan aplikasi, pastikan lingkungan klien telah dikonfigurasi agar dapat berkomunikasi dengan Ziti Controller.

### Konfigurasi Host Mapping
Pastikan komputer klien dapat me-resolve alamat Ziti Controller. Jika tidak menggunakan DNS server terpusat, tambahkan pemetaan host secara manual:

**Windows (`C:\Windows\System32\drivers\etc\hosts`)**
```bash
<IP_CONTROLLER>    <DOMAIN_CONTROLLER>
# Contoh:
192.168.1.10       ctrl.ziti.local
```

**Linux/macOs (`/etc/hosts`)**
```bash
sudo nano /etc/hosts
# Tambahkan baris berikut:
192.168.1.10       ctrl.ziti.local
```

## Fitur Utama

### 1. Manajemen Identitas & Secure Vault
* **Identity-Centric:** Akses tidak berbasis IP, melainkan validasi file identitas (JWT/JSON).
* **Local Secure Vault:** Identitas yang diunggah akan dienkripsi menggunakan *password-based encryption* dan disimpan secara lokal. Identitas hanya didekripsi saat sesi login aktif.
* **Multi-Identity Support:** Mendukung penggunaan dan pengelolaan banyak identitas dalam satu aplikasi.

### 2. Sidebar Terintegrasi
* **Service Tabs:** Sidebar aplikasi secara dinamis menampilkan daftar layanan (Services) privat yang diizinkan untuk identitas yang sedang aktif.
* **Browser Tabs:** Tab Browser Untuk *browsing* internet publik biasa.

### 3. Logs
* **Ziti Proxy Log:** Fitur untuk memantau aktivitas *handshake* dan status koneksi proxy secara *real-time* guna keperluan *troubleshooting*.

---

## Teknologi yang Digunakan

* **Frontend/Runtime:** [ElectronJS](https://www.electronjs.org/) (Node.js + Chromium).
* **Backend/Networking:** [OpenZiti SDK (Golang)](https://openziti.io/) & Ziti HTTP Proxy.
* **Build Tool:** Vite.
* **Security:** JWT Enrollment, X.509 Certificates, AES Encryption (Vault).

---

## Cara Penggunaan (User Guide)

Berdasarkan alur kerja aplikasi, berikut adalah langkah-langkah penggunaan Ziti Browser:

### Tahap 1: Inisialisasi & Enrollment (Pengguna Baru)
1.  Buka aplikasi Ziti Browser.
2.  Jika belum ada identitas tersimpan, Anda akan diarahkan ke halaman **Upload Identitas**.
3.  Klik **"Unggah File Identitas (.jwt)"** dan pilih file token enrollment yang valid.
4.  **Set Password:** Masukkan *password* baru. Password ini digunakan untuk mengenkripsi identitas Anda ke dalam *Secure Vault* lokal.
5.  Klik **Enroll & Simpan Identitas**.

### Tahap 2: Login (Dekripsi Identitas)
1.  Jika identitas sudah tersimpan, aplikasi akan meminta password saat dibuka.
2.  Masukkan password yang telah dibuat sebelumnya untuk mendekripsi *vault*.
3.  Pilih identitas yang ingin digunakan dari daftar yang tersedia, lalu klik **Login**.

### Tahap 3: Mengakses Layanan (Browsing)
1.  Setelah login berhasil, Anda akan masuk ke **Dashboard Utama**.
2.  **Akses Layanan Internal:** Lihat *Sidebar* (sebelah kiri). Daftar layanan (misal: `wazuh-dashboard`) akan muncul otomatis. Klik layanan tersebut untuk membukanya di tab aman.
3.  **Akses Internet:** Gunakan *Address Bar* di bagian atas untuk memasukkan URL publik (google.com, dll).

### Tahap 4: Manajemen & Logout
1.  **Cek Koneksi:** Buka menu **Ziti Proxy Log** untuk melihat status koneksi jaringan.
2.  **Ganti Identitas:** Buka menu **Detail Identitas** untuk mematikan/menyalakan identitas tertentu.
3.  **Logout:** Klik tombol **Logout** atau **Kunci Vault**. Ini akan membersihkan sesi proxy dan mengembalikan aplikasi ke status terkunci.

---

## Instalasi & Menjalankan (Development)

Pastikan Anda telah menginstal **Node.js (v22)**  dan **Git**.

```bash
# 1. Clone Repository
git clone https://github.com/DiantoroKadarman/ZitiBrowser
cd ZitiBrowser

# 2. Install Dependencies
npm install

# 3. Jalankan Aplikasi
npm start