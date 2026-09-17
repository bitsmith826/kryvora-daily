# ⚡ Kryvora Daily Task Claimer & Auto Check-in (EVM)

Script otomatisasi multi-wallet berbasis **Node.js** dan **Ethers.js (v6)** untuk menyelesaikan task harian dan onboarding di platform **[Kryvora Network](https://tasks.kryvora.network)** secara aman dan instan.

---

## ⚠️ Disclaimer Edukasi & Penggunaan

> Proyek ini dibuat semata-mata untuk tujuan **riset teknis Web3**, pembelajaran arsitektur autentikasi terdesentralisasi (EVM *EIP-191 / personal_sign*), dan eksplorasi interaksi dApp Layer-2. Gunakan secara bertanggung jawab sesuai syarat dan ketentuan platform. Pengembang tidak bertanggung jawab atas tindakan pemblokiran, perubahan aturan, maupun kerugian akibat penggunaan script ini.

---

## 🚀 Fitur Utama

- **Multi-Wallet Support:** Mendukung pemrosesan belasan hingga ratusan akun EVM secara berurutan dalam satu kali eksekusi (`pk.txt`).
- **Autentikasi Otomatis EVM:** Mengambil challenge nonce unik dari Kryvora, menandatangani pesan secara lokal menggunakan private key (`personal_sign`), dan menukarkannya dengan sesi Bearer JWT.
- **Auto Onboarding Quests (Instan +250 Poin untuk Akun Baru):**
  - `quest-wallet` (**+100 Poin**): Verifikasi dan klaim task sambung wallet.
  - `quest-add-network` (**+150 Poin**): Verifikasi penambahan RPC Kryvora (`0x4668b2c`) dan klaim instan.
- **Daily Check-in Otomatis (`quest-daily-gm`):**
  - Klaim reward harian **+50 Poin** setiap hari.
  - Mempertahankan dan meningkatkan *Daily Streak* serta Level akun.
  - Cerdas: Otomatis mendeteksi jika akun sudah klaim hari ini untuk menghindari request mubazir.
- **Sweep Claimable Quests:** Otomatis mendeteksi dan mengklaim semua quest tertunda yang sudah siap di-claim (`claimableQuestIds`).
- **Auto Gacha Reveal:** Otomatis memeriksa kotak gacha dan me-reveal token jika tersedia.
- **🛡️ 100% Aman & Terisolasi:** Private key tidak pernah dikirim ke internet; seluruh tanda tangan digital dibuat murni secara kriptografis di komputer lokal Anda. File `pk.txt` sudah diabaikan oleh `.gitignore`.
- **Tampilan Terminal Berwarna & Rekapitulasi Rapi:** Dilengkapi log interaktif dan tabel rekapitulasi poin awal, poin akhir, streak, level, rank, serta status eksekusi.

---

## 📋 Persyaratan Sistem

- **Node.js** (Versi 18 ke atas)
- **Git** (Opsional, untuk manajemen repositori)

---

## 🛠️ Panduan Instalasi & Penggunaan

### 1. Buka Folder Proyek
Buka terminal (PowerShell / Command Prompt / Git Bash) di folder proyek:
```bash
cd D:\Coding\kryvora-daily
```

### 2. Pasang Dependencies
```bash
npm install
```

### 3. Siapkan Private Key EVM
Salin template contoh:
```bash
copy pk.example.txt pk.txt
```
*(atau di Linux/Mac: `cp pk.example.txt pk.txt`)*

Buka file `pk.txt` menggunakan text editor (Notepad / VS Code), lalu masukkan private key EVM akun Anda (satu baris per private key):
```text
0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
```
*(Catatan: Anda dapat memasukkan format diawali `0x` maupun tanpa `0x`)*.

### 4. (Opsional) Sesuaikan Pengaturan `.env`
Salin template konfigurasi:
```bash
copy .env.example .env
```
Anda dapat menyesuaikan:
- `DEFAULT_REFERRAL_CODE`: Kode referral utama Anda (semua sub-wallet baru akan otomatis menggunakan kode ini).
- `DELAY_BETWEEN_WALLETS_SEC`: Waktu jeda antar akun dalam detik (default: `3`).
- `AUTO_ONBOARDING`: Otomatis klaim task onboarding akun baru (default: `true`).

### 5. Jalankan Bot
Cukup jalankan:
```bash
npm start
```

---

## ⏰ Jadwal Eksekusi Harian

- Server Kryvora Network melakukan reset harian setiap pukul **00:00 UTC** (pukul **07:00 pagi WIB**).
- Jalankan bot **setiap hari sekali setelah pukul 07:00 WIB** untuk panen poin harian dan menjaga rentetan *Daily Streak*.

---

## 📁 Struktur Direktori

```text
kryvora-daily/
├── .gitignore          # Mengamankan pk.txt & .env agar tidak bocor ke Git
├── .env.example        # Template konfigurasi bot
├── pk.example.txt      # Template format private key
├── package.json        # Pengaturan dependensi & script start
├── signer.js           # Modul pembuat wallet & penandatangan EIP-191
├── api.js              # Modul pemanggil endpoint REST API Kryvora
├── index.js            # Runner multi-wallet & tabel rekapitulasi CLI
└── README.md           # Dokumentasi lengkap
```

---

## 📄 Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE).
