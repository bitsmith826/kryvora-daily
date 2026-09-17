/**
 * Kryvora Daily - Multi-Wallet Automation Runner
 * Automates daily check-ins, onboarding quests, and reward claims for Kryvora Network.
 */

const fs = require('fs');
const path = require('path');
const { getWallet, signLoginMessage } = require('./signer');
const {
  fetchNonce,
  verifyWallet,
  getProfile,
  verifyQuest,
  claimQuest,
  getGachaStatus,
  revealGacha
} = require('./api');

// Simple ANSI color palette for professional terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

/**
 * Parses simple .env file without requiring external dependencies.
 */
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  const config = {
    DEFAULT_REFERRAL_CODE: '651A7DCB2E',
    DELAY_BETWEEN_WALLETS_SEC: 3,
    AUTO_ONBOARDING: true,
    AUTO_GACHA_REVEAL: true
  };

  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...rest] = trimmed.split('=');
      const val = rest.join('=').trim();
      if (key && val) {
        if (key === 'DEFAULT_REFERRAL_CODE') config.DEFAULT_REFERRAL_CODE = val;
        if (key === 'DELAY_BETWEEN_WALLETS_SEC') config.DELAY_BETWEEN_WALLETS_SEC = parseInt(val, 10) || 3;
        if (key === 'AUTO_ONBOARDING') config.AUTO_ONBOARDING = val.toLowerCase() === 'true';
        if (key === 'AUTO_GACHA_REVEAL') config.AUTO_GACHA_REVEAL = val.toLowerCase() === 'true';
      }
    }
  }
  return config;
}

/**
 * Formats a wallet address for display (e.g. 0x1234...5678).
 */
function maskAddress(addr) {
  if (!addr || addr.length < 10) return addr || '-';
  return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
}

/**
 * Returns formatted local timestamp string [HH:MM:SS].
 */
function getTimestamp() {
  const d = new Date();
  return `${colors.dim}[${d.toTimeString().split(' ')[0]}]${colors.reset}`;
}

/**
 * Asynchronous sleep helper.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Reads and validates private keys from pk.txt.
 */
function loadPrivateKeys() {
  const pkPath = path.join(__dirname, 'pk.txt');
  if (!fs.existsSync(pkPath)) {
    console.log(`\n${colors.red}${colors.bold}[!] File pk.txt tidak ditemukan.${colors.reset}`);
    console.log(`${colors.yellow}Petunjuk:${colors.reset}`);
    console.log(`1. Salin template: cp pk.example.txt pk.txt`);
    console.log(`2. Buka pk.txt dan masukkan private key EVM Anda (1 per baris).`);
    console.log(`3. Jalankan kembali dengan: npm start\n`);
    process.exit(1);
  }

  const content = fs.readFileSync(pkPath, 'utf8');
  const keys = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));

  if (keys.length === 0) {
    console.log(`\n${colors.red}${colors.bold}[!] File pk.txt kosong atau semua baris berupa komentar.${colors.reset}`);
    console.log(`Silakan isi minimal 1 private key EVM di dalam pk.txt.\n`);
    process.exit(1);
  }

  return keys;
}

/**
 * Main application runner.
 */
async function main() {
  console.clear();
  console.log(`${colors.cyan}${colors.bold}`);
  console.log(`╔══════════════════════════════════════════════════════════╗`);
  console.log(`║               KRYVORA NETWORK DAILY BOT                  ║`);
  console.log(`║     Multi-Wallet EVM Task Claimer & Daily Check-in       ║`);
  console.log(`╚══════════════════════════════════════════════════════════╝${colors.reset}`);

  const config = loadEnv();
  const privateKeys = loadPrivateKeys();

  console.log(`${getTimestamp()} ${colors.green}Total wallet terdeteksi:${colors.reset} ${colors.bold}${privateKeys.length}${colors.reset} akun`);
  console.log(`${getTimestamp()} ${colors.cyan}Referral Code bawaan :${colors.reset} ${config.DEFAULT_REFERRAL_CODE}`);
  console.log(`${getTimestamp()} ${colors.cyan}Auto Onboarding      :${colors.reset} ${config.AUTO_ONBOARDING ? 'AKTIF' : 'NONAKTIF'}`);
  console.log(`${getTimestamp()} ${colors.cyan}Jeda antar wallet    :${colors.reset} ${config.DELAY_BETWEEN_WALLETS_SEC} detik`);
  console.log(`${colors.dim}------------------------------------------------------------${colors.reset}\n`);

  const summary = [];

  for (let i = 0; i < privateKeys.length; i++) {
    const rawKey = privateKeys[i];
    const accountIndex = i + 1;
    let wallet = null;

    try {
      wallet = getWallet(rawKey);
    } catch (err) {
      console.log(`${getTimestamp()} ${colors.red}[Akun ${accountIndex}/${privateKeys.length}] Private Key tidak valid: ${err.message}${colors.reset}`);
      summary.push({
        index: accountIndex,
        address: 'INVALID_KEY',
        initialPoints: 0,
        finalPoints: 0,
        streak: 0,
        level: 0,
        rank: '-',
        status: `${colors.red}Key Error${colors.reset}`
      });
      continue;
    }

    const addr = wallet.address;
    console.log(`${getTimestamp()} ${colors.bold}${colors.blue}=== [Akun ${accountIndex}/${privateKeys.length}] ${addr} ===${colors.reset}`);

    let record = {
      index: accountIndex,
      address: addr,
      initialPoints: 0,
      finalPoints: 0,
      streak: 0,
      level: 1,
      rank: '-',
      status: 'Menunggu'
    };

    try {
      // 1. Auth Flow
      process.stdout.write(`${getTimestamp()} [1/5] Meminta challenge nonce... `);
      const nonceData = await fetchNonce(addr, config.DEFAULT_REFERRAL_CODE);
      console.log(`${colors.green}OK${colors.reset}`);

      process.stdout.write(`${getTimestamp()} [2/5] Menandatangani pesan login (EVM personal_sign)... `);
      const signature = await signLoginMessage(wallet, nonceData.message);
      console.log(`${colors.green}OK${colors.reset}`);

      process.stdout.write(`${getTimestamp()} [3/5] Memverifikasi signature & membuat sesi token... `);
      const verifyRes = await verifyWallet(addr, signature);
      const token = verifyRes.token;
      let user = verifyRes.user;
      console.log(`${colors.green}Sukses!${colors.reset}`);

      record.initialPoints = user.points || 0;
      record.streak = user.dailyStreak || 0;
      record.level = user.level || 1;
      record.rank = user.rank || '-';

      console.log(
        `${getTimestamp()}       ${colors.dim}Poin Awal: ${colors.bold}${user.points || 0}${colors.reset} | ` +
        `Streak: ${colors.yellow}${user.dailyStreak || 0} hari${colors.reset} | ` +
        `Level: ${user.level || 1} | Rank: #${user.rank || '-'}`
      );

      // 2. Onboarding Quests (Wallet Connect & Add Network)
      if (config.AUTO_ONBOARDING) {
        const completed = new Set(user.completedQuestIds || []);

        // Task: Connect Wallet (+100 pts)
        if (!completed.has('quest-wallet')) {
          try {
            process.stdout.write(`${getTimestamp()} [ONBOARD] Memverifikasi Quest Connect Wallet... `);
            const vRes = await verifyQuest(token, 'quest-wallet');
            if (vRes.claimable) {
              const cRes = await claimQuest(token, 'quest-wallet');
              console.log(`${colors.green}BERHASIL (+${cRes.pointsAwarded || 100} Poin)${colors.reset}`);
              if (cRes.user) user = cRes.user;
            } else {
              console.log(`${colors.yellow}Belum siap claim${colors.reset}`);
            }
          } catch (qErr) {
            console.log(`${colors.yellow}Gagal: ${qErr.message}${colors.reset}`);
          }
        }

        // Task: Add Network (+150 pts)
        if (!completed.has('quest-add-network')) {
          try {
            process.stdout.write(`${getTimestamp()} [ONBOARD] Memverifikasi Quest Add Network... `);
            const vRes = await verifyQuest(token, 'quest-add-network', { chainIdHex: '0x4668b2c' });
            if (vRes.claimable) {
              const cRes = await claimQuest(token, 'quest-add-network');
              console.log(`${colors.green}BERHASIL (+${cRes.pointsAwarded || 150} Poin)${colors.reset}`);
              if (cRes.user) user = cRes.user;
            } else {
              console.log(`${colors.yellow}Belum siap claim${colors.reset}`);
            }
          } catch (qErr) {
            console.log(`${colors.yellow}Gagal: ${qErr.message}${colors.reset}`);
          }
        }
      }

      // 3. Daily GM Check-in (+50 pts)
      const claimedDaily = new Set(user.claimedDailyQuestIds || []);
      const todayUTC = new Date().toISOString().split('T')[0];
      const alreadyClaimedToday =
        claimedDaily.has('quest-daily-gm') || user.lastDailyClaim === todayUTC;

      if (!alreadyClaimedToday) {
        process.stdout.write(`${getTimestamp()} [4/5] Mengklaim Daily Check-in (quest-daily-gm)... `);
        try {
          const gmClaim = await claimQuest(token, 'quest-daily-gm');
          if (gmClaim.claimed) {
            console.log(`${colors.green}${colors.bold}BERHASIL (+${gmClaim.pointsAwarded || 50} Poin)!${colors.reset}`);
            record.status = `${colors.green}[ KLAIM SUKSES ]${colors.reset}`;
            if (gmClaim.user) user = gmClaim.user;
          } else {
            console.log(`${colors.yellow}Respon tidak terduga${colors.reset}`);
            record.status = `${colors.yellow}[ Cek Manual ]${colors.reset}`;
          }
        } catch (gmErr) {
          console.log(`${colors.red}Gagal: ${gmErr.message}${colors.reset}`);
          record.status = `${colors.red}[ Gagal ]${colors.reset}`;
        }
      } else {
        console.log(`${getTimestamp()} [4/5] Daily Check-in: ${colors.cyan}Sudah diklaim hari ini.${colors.reset}`);
        record.status = `${colors.cyan}[ SUDAH KLAIM ]${colors.reset}`;
      }

      // 4. Sweep any other claimable quests
      if (Array.isArray(user.claimableQuestIds) && user.claimableQuestIds.length > 0) {
        for (const qId of user.claimableQuestIds) {
          try {
            console.log(`${getTimestamp()} [SWEEP] Mengklaim quest tertunda: ${qId}...`);
            const sClaim = await claimQuest(token, qId);
            if (sClaim.user) user = sClaim.user;
            console.log(`${colors.green}  -> Sukses klaim ${qId} (+${sClaim.pointsAwarded || 0} Poin)${colors.reset}`);
          } catch (sErr) {
            console.log(`${colors.yellow}  -> Lewati ${qId}: ${sErr.message}${colors.reset}`);
          }
        }
      }

      // 5. Gacha check & reveal
      if (config.AUTO_GACHA_REVEAL) {
        try {
          const gacha = await getGachaStatus(token);
          if (gacha.unrevealedCount > 0 && Array.isArray(gacha.tokens)) {
            console.log(`${getTimestamp()} [GACHA] Ditemukan ${gacha.unrevealedCount} token belum di-reveal.`);
            for (const t of gacha.tokens) {
              if (!t.revealed) {
                const rRes = await revealGacha(token, t.tokenId);
                console.log(`${colors.magenta}  -> Reveal tokenId ${t.tokenId} sukses! Multiplier: ${rRes.multiplier || '-'}${colors.reset}`);
              }
            }
          }
        } catch (_) {
          // Gacha check is optional; ignore if not active for this account
        }
      }

      // 6. Refresh final profile
      try {
        const profileRes = await getProfile(token);
        if (profileRes.user) {
          user = profileRes.user;
        }
      } catch (_) {}

      record.finalPoints = user.points || 0;
      record.streak = user.dailyStreak || record.streak;
      record.level = user.level || record.level;
      record.rank = user.rank || record.rank;

      const earned = record.finalPoints - record.initialPoints;
      console.log(
        `${getTimestamp()} [5/5] Selesai! Poin Akhir: ${colors.bold}${colors.green}${record.finalPoints}${colors.reset} ` +
        `(${earned >= 0 ? '+' : ''}${earned} poin) | Streak: ${colors.yellow}${record.streak} hari${colors.reset}`
      );
    } catch (err) {
      console.log(`${getTimestamp()} ${colors.red}[!] Error saat memproses wallet: ${err.message}${colors.reset}`);
      record.status = `${colors.red}[ Error ]${colors.reset}`;
    }

    summary.push(record);

    // Sleep between wallets to behave naturally
    if (i < privateKeys.length - 1 && config.DELAY_BETWEEN_WALLETS_SEC > 0) {
      console.log(`${getTimestamp()} ${colors.dim}Menunggu ${config.DELAY_BETWEEN_WALLETS_SEC} detik sebelum wallet berikutnya...${colors.reset}\n`);
      await sleep(config.DELAY_BETWEEN_WALLETS_SEC * 1000);
    } else {
      console.log('');
    }
  }

  // Final Summary Table
  console.log(`\n${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}                      REKAPITULASI HASIL HARIAN                         ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}`);
  console.log(
    `No.  | Address              | Poin Awal | Poin Akhir | (+/-)  | Streak | Level | Rank    | Status Daily`
  );
  console.log(`------------------------------------------------------------------------------------------------`);

  let totalInitial = 0;
  let totalFinal = 0;

  for (const row of summary) {
    totalInitial += row.initialPoints;
    totalFinal += row.finalPoints;
    const diff = row.finalPoints - row.initialPoints;
    const diffStr = diff > 0 ? `+${diff}` : `${diff}`;

    const pad = (str, len) => String(str).padEnd(len);
    const rpad = (str, len) => String(str).padStart(len);

    console.log(
      `${pad(row.index, 4)} | ` +
      `${pad(maskAddress(row.address), 20)} | ` +
      `${rpad(row.initialPoints, 9)} | ` +
      `${rpad(row.finalPoints, 10)} | ` +
      `${rpad(diffStr, 6)} | ` +
      `${rpad(row.streak + 'd', 6)} | ` +
      `${rpad(row.level, 5)} | ` +
      `${rpad('#' + row.rank, 7)} | ` +
      `${row.status}`
    );
  }

  console.log(`------------------------------------------------------------------------------------------------`);
  console.log(
    `TOTAL SEMUA AKUN: Poin Awal = ${totalInitial.toLocaleString()} | Poin Akhir = ${totalFinal.toLocaleString()} (+${(totalFinal - totalInitial).toLocaleString()} Poin)`
  );
  console.log(`${colors.bold}${colors.cyan}========================================================================${colors.reset}\n`);
  console.log(`${getTimestamp()} ${colors.green}${colors.bold}Semua tugas selesai dengan sukses! Sampai jumpa besok hari!${colors.reset}\n`);
}

main().catch(err => {
  console.error(`\n${colors.red}[FATAL ERROR] ${err.message}${colors.reset}`);
  process.exit(1);
});
