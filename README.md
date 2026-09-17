# ⚡ Kryvora Daily Task Claimer & Auto Check-in (EVM)

> ⚠️ **DISCLAIMER HUKUM & PANDUAN EDUKASI (RESEARCH ONLY)**
>
> Proyek ini dibuat dan didistribusikan semata-mata untuk **tujuan edukasi**, **riset teknis arsitektur Web3**, dan pembelajaran implementasi standar tanda tangan kriptografis **Ethereum EIP-191 (`personal_sign`)**. 
>
> Pengembang tidak berafiliasi dengan Kryvora Network dan tidak bertanggung jawab atas tindakan pemblokiran, perubahan aturan ekosistem, maupun konsekuensi apa pun akibat penggunaan script ini. Segala bentuk interaksi otomatisasi menjadi tanggung jawab penuh masing-masing pengguna. Gunakan secara bijak dan etis.

---

## 📖 Ringkasan Proyek

**`kryvora-daily`** adalah script otomatisasi multi-wallet berbasis **Node.js** dan **Ethers.js (v6)** yang dirancang untuk mempermudah partisipasi pengguna dalam ekosistem testnet **[Kryvora Network](https://tasks.kryvora.network)**. 

Script ini secara cerdas menyelesaikan tugas onboarding satu kali (+250 Poin) dan melakukan check-in harian (+50 Poin) untuk mempertahankan *Daily Streak* serta meningkatkan level akun secara otomatis.

---

## 🚀 Fitur Unggulan

- **Multi-Wallet Support:** Mampu memproses puluhan akun EVM secara berurutan dalam satu kali jalan (`pk.txt`).
- **Autentikasi Mandiri EIP-191:** Mengambil challenge nonce unik dari server Kryvora dan menandatanganinya secara lokal menggunakan private key Anda via `ethers.Wallet.signMessage()`.
- **⚡ Session Caching 24 Jam (`sessions.json`):** Token sesi JWT disimpan aman di komputer lokal Anda selama 24 jam. Pada running kedua dan seterusnya, script langsung memakai token tersimpan tanpa perlu menunggu proses login server (**proses harian berjalan instan < 1 detik per akun**).
- **🎁 Auto Onboarding Quests (+250 Poin untuk Akun Baru):**
  - `quest-wallet` (**+100 Poin**): Verifikasi koneksi wallet.
  - `quest-add-network` (**+150 Poin**): Verifikasi penambahan Kryvora Chain ID (`0x4668b2c`).
- **☀️ Daily GM Check-in Otomatis (`quest-daily-gm`, +50 Poin):**
  - Klaim reward harian otomatis setiap hari.
  - Menjaga dan melipatgandakan rentetan *Daily Streak* serta menaikkan Level akun.
  - Cerdas: Langsung mendeteksi jika akun sudah diklaim hari ini sehingga tidak membuang kuota request.
- **✨ Auto-Sweep Claimable Quests:** Otomatis mendeteksi dan mengklaim semua quest tertunda yang sudah siap di-claim (`claimableQuestIds`).
- **🎲 Auto Gacha Reveal:** Otomatis membuka node token gacha yang belum di-reveal jika tersedia.
- **🛡️ Keamanan Kriptografis Terjamin:**
  - Seluruh penandatanganan dilakukan murni di komputer Anda (kriptografi offline). Private key **tidak pernah dikirim ke jaringan**.
  - File `pk.txt`, `.env`, dan `sessions.json` telah **100% diabaikan oleh `.gitignore`**, sehingga tidak akan pernah bocor ke Git atau GitHub.
- **📊 Tampilan Terminal Rapi & Presisi:** Dilengkapi box border Unicode seragam (`┌─┬─┐`), timer progres interaktif, dan tabel rekapitulasi poin akhir.

---

## 📋 Prasyarat Sistem

Sebelum mulai, pastikan komputer Anda telah terpasang:
- **Node.js** (Versi 18.0.0 ke atas disarankan) — [Unduh di nodejs.org](https://nodejs.org/)
- **Git** (Opsional, untuk clone dan update repositori)

---

## 🛠️ Tutorial Penggunaan Lengkap (Langkah demi Langkah)

### 1. Masuk ke Direktori Proyek
Buka terminal (Command Prompt, PowerShell, atau Terminal VS Code):
```bash
cd D:\Coding\kryvora-daily
```

### 2. Pasang Dependensi
Instal pustaka `ethers.js` yang dibutuhkan:
```bash
npm install
```

### 3. Siapkan File Private Key (`pk.txt`)
Salin template contoh menjadi file `pk.txt`:
* **Windows (PowerShell / CMD):**
  ```bash
  copy pk.example.txt pk.txt
  ```
* **Linux / macOS:**
  ```bash
  cp pk.example.txt pk.txt
  ```

Buka file `pk.txt` menggunakan text editor (Notepad, VS Code, dll.), lalu masukkan daftar private key akun EVM Anda (satu baris untuk setiap akun):
```text
0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
```
*(Catatan: Anda bebas memasukkan format dengan awalan `0x` ataupun tanpa `0x`, bot akan menormalkannya secara otomatis).*

### 4. (Opsional) Pengaturan Konfigurasi (`.env`)
Salin file template konfigurasi:
```bash
copy .env.example .env
```
Anda dapat menyesuaikan isi file `.env` sesuai kebutuhan:
```env
# Kode referral default Anda (agar sub-wallet baru otomatis menggunakan referral akun utama Anda)
DEFAULT_REFERRAL_CODE=651A7DCB2E

# Jeda waktu (detik) antar akun
DELAY_BETWEEN_WALLETS_SEC=1

# Selesaikan otomatis onboarding (Connect Wallet + Add Network) untuk akun baru
AUTO_ONBOARDING=true

# Otomatis buka gacha box jika ada token yang belum di-reveal
AUTO_GACHA_REVEAL=true
```

### 5. Jalankan Bot
Cukup ketik perintah:
```bash
npm start
```

---

## ⏰ Jadwal Reset & Eksekusi Harian

* **Waktu Reset Server:** Server Kryvora Network melakukan pergantian hari (*daily reset*) pada pukul **00:00 UTC** (pukul **07:00 pagi WIB**).
* **Rekomendasi Waktu Pemakaian:** Jalankan script **setiap hari sekali setelah jam 07:00 WIB** untuk memanen reward check-in harian dan mempertahankan rentetan *Daily Streak*.

---

## ❓ Tanya Jawab (FAQ) & Troubleshooting

#### 1. Mengapa saat verifikasi login akun baru membutuhkan waktu ~20-25 detik?
Server Kryvora melakukan validasi on-chain yang cukup mendalam (pengecekan riwayat smart contract, RPC balance, ANS, dan database) sebelum mengembalikan token JWT. Karena script ini memiliki **Session Caching 24 Jam**, Anda hanya perlu menunggu verifikasi ini **sekali saja**. Pada eksekusi berikutnya, bot langsung menggunakan token lokal dan selesai dalam **< 1 detik**.

#### 2. Mengapa akun saya mendapatkan +0 Poin?
Task **Daily Check-in (`quest-daily-gm`)** hanya bisa diklaim **1 kali dalam sehari**. Jika di terminal tertulis `Sudah diklaim hari ini`, artinya akun tersebut sudah mengambil jatah hari ini (baik secara manual di web atau running sebelumnya). Jatah baru akan terbuka kembali besok pagi setelah jam 07:00 WIB.

#### 3. Apakah private key saya aman?
**Sangat aman.**
1. Kriptografi penandatanganan pesan dilakukan murni di memori RAM lokal komputer Anda.
2. File `pk.txt`, `sessions.json`, dan `.env` sudah terdaftar di `.gitignore`. File tersebut tidak akan pernah terunggah ke Git ataupun GitHub publik.

---

## 📁 Struktur Direktori

```text
kryvora-daily/
├── .gitignore          # 🛡️ Mengabaikan pk.txt, .env, sessions.json, node_modules
├── .env.example        # Template konfigurasi bot
├── pk.example.txt      # Template format pengisian private key
├── pk.txt              # File lokal private key asli Anda (Aman & Diabaikan Git)
├── sessions.json       # Cache sesi JWT 24 jam lokal (Dibuat otomatis saat running)
├── package.json        # Dependensi & start script
├── signer.js           # Modul EVM Signer EIP-191 offline
├── api.js              # Modul pemanggil REST API Kryvora
├── index.js            # Runner utama, auto-claim, & tabel rekapitulasi presisi
├── README.md           # Panduan lengkap, edukasi, & tutorial
└── LICENSE             # Lisensi Open Source MIT
```

---

## 📄 Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE).
Bebas dipelajari, dimodifikasi, dan dikembangkan untuk kepentingan riset Web3.
