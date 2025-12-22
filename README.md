# Ziti Browser  
*A Secure, Zero-Trust Web Browser for OpenZiti Networks*
Ziti Browser adalah browser berbasis Electron yang memungkinkan pengguna mengakses layanan privat melalui jaringan [OpenZiti](https://openziti.io/) tanpa perlu konfigurasi jaringan manual. Didesain untuk keamanan tinggi dan pengalaman pengguna yang lancar, Ziti Browser mengelola identitas digital (JWT/JSON) dalam vault terenkripsi, serta menyediakan antarmuka yang modern, responsif, dan aman.

---

## 🔑 Fitur Utama

- ✅ **Zero-Trust Access**  
  Akses layanan privat melalui OpenZiti Proxy SDK tanpa tergantung pada alamat IP atau port terbuka.

- 🔒 **Vault Terenkripsi**  
  Identitas (JWT/JSON) disimpan dalam vault lokal yang dilindungi password. Enkripsi dilakukan *on-the-fly* saat ditambahkan, tanpa menyimpan password di renderer.

- 🧩 **Multi-Identity Support**  
  Tambahkan beberapa identitas sekaligus (*multi-upload*), tanpa perlu *restart* atau *re-login*.

- 🌐 **Protokol Otomatis**  
  Deteksi otomatis HTTP/HTTPS berdasarkan service config tidak perlu input manual.

- 🎨 **Antarmuka Modern & Responsif**  
  Desain clean dengan animasi loading, error handling visual (custom error page HTML/CSS/JS), tombol interaktif (Reload/Kembali), dan feedback UX yang intuitif.

- 📁 **File Handling Cerdas**  
  Upload identitas (JWT/JSON), simpan tanpa ekstensi `.json`, dan integrasi langsung ke vault.

- 🚫 **Tanpa Tombol "Lupa Password"**  
  Sesuai prinsip keamanan: password sengaja tidak bisa di-*reset*, pengguna harus mengingatnya.

---

## 🛠️ Cara Instalasi

### Prasyarat
- [Node.js](https://nodejs.org/) v18+  
- [npm](https://www.npmjs.com/) atau [yarn](https://yarnpkg.com/)

### Instalasi dari Source

```bash
git clone https://github.com/DiantoroKadarman/ZitiBrowser.git
cd ZitiBrowser
npm install
npm start          # Jalankan dalam mode dev (Electron + Vite)
```

