/**
 * Kryvora Daily - Multi-Wallet Automation Runner (Parallel Edition)
 * Automates daily check-ins, onboarding quests, and reward claims for Kryvora Network
 * with concurrent worker pool support and 24-hour session caching.
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

// Professional ANSI color palette
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

const LAYOUT_WIDTH = 111;
const SESSIONS_PATH = path.join(__dirname, 'sessions.json');

/**
 * Removes ANSI escape codes to calculate true visual character length.
 */
function stripAnsi(str) {
  return String(str || '').replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Pads a string according to visible terminal length (supports ANSI colors).
 */
function padVisible(str, len, align = 'left') {
  const s = String(str === undefined || str === null ? '' : str);
  const visibleLength = stripAnsi(s).length;
  const paddingNeeded = Math.max(0, len - visibleLength);

  if (align === 'right') {
    return ' '.repeat(paddingNeeded) + s;
  }
  if (align === 'center') {
    const leftPad = Math.floor(paddingNeeded / 2);
    const rightPad = paddingNeeded - leftPad;
    return ' '.repeat(leftPad) + s + ' '.repeat(rightPad);
  }
  return s + ' '.repeat(paddingNeeded);
}

/**
 * Formats a number with thousand separators (Indonesian locale).
 */
function formatNumber(num) {
  if (num === null || num === undefined || isNaN(Number(num))) return '-';
  return Number(num).toLocaleString('id-ID');
}

/**
 * Masks an Ethereum address (e.g. 0x728F...De7F).
 */
function maskAddress(addr) {
  if (!addr || addr.length < 12) return addr || '-';
  return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
}

/**
 * Returns a clean [HH:MM:SS] timestamp.
 */
function getTimestamp() {
  const d = new Date();
  const time = d.toTimeString().split(' ')[0];
  return `${colors.dim}[${time}]${colors.reset}`;
}

/**
 * Promisified sleep helper.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * In-memory session cache with thread-safe file persistence.
 */
let memorySessions = {};
function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_PATH)) {
      memorySessions = JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf8'));
      return memorySessions;
    }
  } catch (_) {}
  memorySessions = {};
  return memorySessions;
}

function saveSession(address, token) {
  try {
    let expiresAt = Date.now() + 20 * 3600 * 1000;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString('utf8'));
      if (payload.expiresAt) expiresAt = payload.expiresAt;
    } catch (_) {}

    memorySessions[address.toLowerCase()] = {
      token,
      expiresAt,
      savedAt: Date.now()
    };
    fs.writeFileSync(SESSIONS_PATH, JSON.stringify(memorySessions, null, 2));
  } catch (_) {}
}

/**
 * Loads configuration from .env if present.
 */
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  const config = {
    CONCURRENCY: 5,
    DEFAULT_REFERRAL_CODE: '651A7DCB2E',
    DELAY_BETWEEN_WALLETS_SEC: 2,
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
        if (key === 'CONCURRENCY') config.CONCURRENCY = Math.max(1, parseInt(val, 10) || 5);
        if (key === 'DEFAULT_REFERRAL_CODE') config.DEFAULT_REFERRAL_CODE = val;
        if (key === 'DELAY_BETWEEN_WALLETS_SEC') config.DELAY_BETWEEN_WALLETS_SEC = parseInt(val, 10) || 2;
        if (key === 'AUTO_ONBOARDING') config.AUTO_ONBOARDING = val.toLowerCase() === 'true';
        if (key === 'AUTO_GACHA_REVEAL') config.AUTO_GACHA_REVEAL = val.toLowerCase() === 'true';
      }
    }
  }
  return config;
}

/**
 * Reads private keys from pk.txt.
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
 * Prints the main header banner with precise borders.
 */
function printBanner(config, totalWallets) {
  const innerWidth = LAYOUT_WIDTH - 2;
  console.log(`\n${colors.cyan}${colors.bold}╔${'═'.repeat(innerWidth)}╗`);
  console.log(`║${padVisible('KRYVORA NETWORK DAILY BOT (PARALEL)', innerWidth, 'center')}║`);
  console.log(`║${padVisible('Multi-Wallet EVM Task Claimer & Auto Check-in', innerWidth, 'center')}║`);
  console.log(`╚${'═'.repeat(innerWidth)}╝${colors.reset}`);

  console.log(`  ${getTimestamp()} ${colors.green}Total Wallet Terdeteksi :${colors.reset} ${colors.bold}${totalWallets}${colors.reset} akun`);
  console.log(`  ${getTimestamp()} ${colors.magenta}${colors.bold}Mode Eksekusi Paralel   :${colors.reset} ${colors.bold}${config.CONCURRENCY} akun berjalan bersamaan${colors.reset}`);
  console.log(`  ${getTimestamp()} ${colors.cyan}Referral Code Bawaan    :${colors.reset} ${config.DEFAULT_REFERRAL_CODE}`);
  console.log(`  ${getTimestamp()} ${colors.cyan}Auto Onboarding Tasks   :${colors.reset} ${config.AUTO_ONBOARDING ? colors.green + 'AKTIF (+250 Poin)' : colors.yellow + 'NONAKTIF'}${colors.reset}`);
  console.log(`  ${getTimestamp()} ${colors.cyan}Session Token Caching   :${colors.reset} ${colors.green}AKTIF (Sesi disimpan 24 jam untuk klaim instan)${colors.reset}`);
  console.log(`${colors.dim}  ${'─'.repeat(LAYOUT_WIDTH - 4)}${colors.reset}\n`);
}

/**
 * Processes a single wallet account.
 */
async function processWallet(rawKey, accountIndex, totalAccounts, config) {
  const tag = `[Akun ${String(accountIndex).padStart(2, '0')}/${totalAccounts}]`;
  let wallet = null;

  try {
    wallet = getWallet(rawKey);
  } catch (err) {
    console.log(`  ${getTimestamp()} ${colors.red}${tag} Key Error: ${err.message}${colors.reset}`);
    return {
      index: accountIndex,
      address: 'INVALID_KEY',
      initialPoints: 0,
      finalPoints: 0,
      streak: 0,
      level: 0,
      rank: '-',
      status: `${colors.red}Key Error${colors.reset}`
    };
  }

  const addr = wallet.address;
  const masked = maskAddress(addr);
  const addrKey = addr.toLowerCase();

  let record = {
    index: accountIndex,
    address: addr,
    initialPoints: 0,
    finalPoints: 0,
    streak: 0,
    level: 1,
    rank: '-',
    status: `${colors.yellow}[ Menunggu ]${colors.reset}`
  };

  try {
    let token = null;
    let user = null;

    // 1. Check Session Cache (24-Hour Token)
    const cached = memorySessions[addrKey];
    if (cached && cached.token && cached.expiresAt && cached.expiresAt > Date.now() + 60000) {
      try {
        const profileCheck = await getProfile(cached.token);
        if (profileCheck && profileCheck.user) {
          token = cached.token;
          user = profileCheck.user;
          console.log(`  ${getTimestamp()} ⚡ ${colors.cyan}${tag} ${masked}:${colors.reset} Sesi 24 jam aktif (Cache) | Poin: ${formatNumber(user.points)}`);
        }
      } catch (_) {}
    }

    // 2. Fresh Authentication if no valid cached token
    if (!token || !user) {
      console.log(`  ${getTimestamp()} 🔑 ${colors.blue}${tag} ${masked}:${colors.reset} Meminta nonce & menandatangani pesan...`);
      const nonceData = await fetchNonce(addr, config.DEFAULT_REFERRAL_CODE);
      const signature = await signLoginMessage(wallet, nonceData.message);

      console.log(`  ${getTimestamp()} ⋯ ${colors.yellow}${tag} ${masked}:${colors.reset} Verifikasi server Kryvora (sedang memproses)...`);
      const verifyRes = await verifyWallet(addr, signature);
      token = verifyRes.token;
      user = verifyRes.user || {};
      saveSession(addr, token);
      console.log(`  ${getTimestamp()} ✔ ${colors.green}${tag} ${masked}:${colors.reset} Login berhasil | Poin Awal: ${formatNumber(user.points)}`);
    }

    record.initialPoints = user.points || 0;
    record.streak = user.dailyStreak || 0;
    record.level = user.level || 1;
    record.rank = user.rank || '-';

    // 3. Auto Onboarding Tasks (Connect Wallet + Add Network)
    if (config.AUTO_ONBOARDING) {
      const completed = new Set(user.completedQuestIds || []);

      if (!completed.has('quest-wallet')) {
        try {
          const vRes = await verifyQuest(token, 'quest-wallet');
          if (vRes.claimable) {
            const cRes = await claimQuest(token, 'quest-wallet');
            if (cRes.user) user = cRes.user;
            console.log(`  ${getTimestamp()} 🎁 ${colors.green}${tag} ${masked}:${colors.reset} Quest Connect Wallet BERHASIL (+100 Poin)`);
          }
        } catch (_) {}
      }

      if (!completed.has('quest-add-network')) {
        try {
          const vRes = await verifyQuest(token, 'quest-add-network', { chainIdHex: '0x4668b2c' });
          if (vRes.claimable) {
            const cRes = await claimQuest(token, 'quest-add-network');
            if (cRes.user) user = cRes.user;
            console.log(`  ${getTimestamp()} 🎁 ${colors.green}${tag} ${masked}:${colors.reset} Quest Add Network BERHASIL (+150 Poin)`);
          }
        } catch (_) {}
      }
    }

    // 4. Daily GM Check-in (quest-daily-gm, +50 Poin)
    const claimedDaily = new Set(user.claimedDailyQuestIds || []);
    const todayUTC = new Date().toISOString().split('T')[0];
    const alreadyClaimedToday =
      claimedDaily.has('quest-daily-gm') || user.lastDailyClaim === todayUTC;

    if (!alreadyClaimedToday) {
      try {
        const gmClaim = await claimQuest(token, 'quest-daily-gm');
        if (gmClaim.claimed) {
          record.status = `${colors.green}[ KLAIM SUKSES ]${colors.reset}`;
          if (gmClaim.user) user = gmClaim.user;
          console.log(`  ${getTimestamp()} ☀️ ${colors.green}${tag} ${masked}:${colors.bold} Daily GM BERHASIL (+${gmClaim.pointsAwarded || 50} Poin)!${colors.reset} Streak: ${user.dailyStreak || 1} hari`);
        } else {
          record.status = `${colors.yellow}[ Cek Manual ]${colors.reset}`;
        }
      } catch (gmErr) {
        console.log(`  ${getTimestamp()} ✖ ${colors.red}${tag} ${masked}: Daily GM Gagal (${gmErr.message})${colors.reset}`);
        record.status = `${colors.red}[ Gagal ]${colors.reset}`;
      }
    } else {
      console.log(`  ${getTimestamp()} 💤 ${colors.cyan}${tag} ${masked}: Daily GM sudah diklaim hari ini (${user.lastDailyClaim || todayUTC}). Reset pkl 07:00 WIB.${colors.reset}`);
      record.status = `${colors.cyan}[ SUDAH KLAIM ]${colors.reset}`;
    }

    // 5. Sweep pending claimable quests
    if (Array.isArray(user.claimableQuestIds) && user.claimableQuestIds.length > 0) {
      for (const qId of user.claimableQuestIds) {
        try {
          const sClaim = await claimQuest(token, qId);
          if (sClaim.user) user = sClaim.user;
          console.log(`  ${getTimestamp()} ✨ ${colors.magenta}${tag} ${masked}: Klaim quest tertunda ${qId} (+${sClaim.pointsAwarded || 0} Poin)${colors.reset}`);
        } catch (_) {}
      }
    }

    // 6. Gacha Reveal
    if (config.AUTO_GACHA_REVEAL) {
      try {
        const gacha = await getGachaStatus(token);
        if (gacha.unrevealedCount > 0 && Array.isArray(gacha.tokens)) {
          for (const t of gacha.tokens) {
            if (!t.revealed) {
              const rRes = await revealGacha(token, t.tokenId);
              console.log(`  ${getTimestamp()} 🎲 ${colors.magenta}${tag} ${masked}: Gacha reveal #${t.tokenId} sukses! Multiplier: ${rRes.multiplier || '-'}${colors.reset}`);
            }
          }
        }
      } catch (_) {}
    }

    // 7. Refresh Final Profile
    try {
      const refreshed = await getProfile(token);
      if (refreshed.user) user = refreshed.user;
    } catch (_) {}

    record.finalPoints = user.points || record.initialPoints;
    record.streak = user.dailyStreak || record.streak;
    record.level = user.level || record.level;
    record.rank = user.rank || record.rank;

    const earned = record.finalPoints - record.initialPoints;
    const earnedFormatted = earned > 0 ? `+${formatNumber(earned)}` : formatNumber(earned);

    console.log(
      `  ${getTimestamp()} 🏁 ${colors.green}${tag} ${masked}: Selesai! Poin Akhir: ${colors.bold}${formatNumber(record.finalPoints)}${colors.reset} ` +
      `(${colors.bold}${earnedFormatted} Poin${colors.reset}) | Streak: ${colors.yellow}${record.streak}d${colors.reset}`
    );
  } catch (err) {
    console.log(`  ${getTimestamp()} ${colors.red}${tag} ${masked} Error: ${err.message}${colors.reset}`);
    record.status = `${colors.red}[ Error ]${colors.reset}`;
  }

  return record;
}

/**
 * Worker pool to process items concurrently.
 */
async function runParallelPool(items, concurrency, workerFn) {
  const results = new Array(items.length);
  let currentIndex = 0;

  const workers = Array.from({ length: concurrency }, async (_, workerId) => {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await workerFn(items[idx], idx + 1, items.length);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Main application logic.
 */
async function main() {
  const config = loadEnv();
  const privateKeys = loadPrivateKeys();
  loadSessions();

  printBanner(config, privateKeys.length);

  const startTime = Date.now();

  // Run all wallets concurrently with configured concurrency limit
  const summary = await runParallelPool(
    privateKeys,
    config.CONCURRENCY,
    async (key, index, total) => {
      return await processWallet(key, index, total, config);
    }
  );

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

  // Print Precision Summary Table
  printSummaryTable(summary, totalDuration);
}

/**
 * Renders the precision summary table using pure Unicode box characters.
 */
function printSummaryTable(summary, totalDuration) {
  const cols = [
    { key: 'no', label: 'No', width: 3, align: 'center' },
    { key: 'address', label: 'Wallet Address', width: 15, align: 'left' },
    { key: 'initial', label: 'Poin Awal', width: 10, align: 'right' },
    { key: 'final', label: 'Poin Akhir', width: 11, align: 'right' },
    { key: 'diff', label: '(+/-)', width: 7, align: 'right' },
    { key: 'streak', label: 'Streak', width: 7, align: 'center' },
    { key: 'level', label: 'Level', width: 6, align: 'center' },
    { key: 'rank', label: 'Rank', width: 8, align: 'right' },
    { key: 'status', label: 'Status Daily', width: 16, align: 'center' }
  ];

  const topBorder = '┌' + cols.map(c => '─'.repeat(c.width + 2)).join('┬') + '┐';
  const midBorder = '├' + cols.map(c => '─'.repeat(c.width + 2)).join('┼') + '┤';
  const botBorder = '└' + cols.map(c => '─'.repeat(c.width + 2)).join('┴') + '┘';

  console.log(`\n${colors.cyan}${colors.bold}`);
  console.log(`╔${'═'.repeat(LAYOUT_WIDTH - 2)}╗`);
  console.log(`║${padVisible('REKAPITULASI HASIL HARIAN (KRYVORA NETWORK)', LAYOUT_WIDTH - 2, 'center')}║`);
  console.log(`╚${'═'.repeat(LAYOUT_WIDTH - 2)}╝${colors.reset}`);

  console.log(topBorder);

  // Table Header
  const headerCells = cols.map(c => ` ${padVisible(colors.bold + c.label + colors.reset, c.width, 'center')} `);
  console.log(`│${headerCells.join('│')}│`);
  console.log(midBorder);

  let totalInitial = 0;
  let totalFinal = 0;
  let successCount = 0;

  // Table Rows (sorted by index)
  for (const row of summary) {
    totalInitial += row.initialPoints || 0;
    totalFinal += row.finalPoints || 0;
    if (stripAnsi(row.status).includes('KLAIM') || stripAnsi(row.status).includes('SUKSES')) {
      successCount++;
    }

    const diff = (row.finalPoints || 0) - (row.initialPoints || 0);
    const diffStr = diff > 0 ? `+${formatNumber(diff)}` : formatNumber(diff);

    const rowData = {
      no: row.index,
      address: maskAddress(row.address),
      initial: formatNumber(row.initialPoints),
      final: formatNumber(row.finalPoints),
      diff: diffStr,
      streak: `${row.streak || 0}d`,
      level: `Lv.${row.level || 1}`,
      rank: row.rank ? `#${formatNumber(row.rank)}` : '-',
      status: row.status
    };

    const cells = cols.map(c => ` ${padVisible(rowData[c.key], c.width, c.align)} `);
    console.log(`│${cells.join('│')}│`);
  }

  console.log(midBorder);

  // Table Summary / Total Row
  const totalDiff = totalFinal - totalInitial;
  const totalDiffStr = totalDiff > 0 ? `+${formatNumber(totalDiff)}` : formatNumber(totalDiff);
  const totalStatus = `${successCount}/${summary.length} Sukses`;

  const totalRowData = {
    no: 'TOT',
    address: `${summary.length} Akun`,
    initial: formatNumber(totalInitial),
    final: formatNumber(totalFinal),
    diff: totalDiffStr,
    streak: '-',
    level: '-',
    rank: '-',
    status: totalStatus
  };

  const totalCells = cols.map(c => ` ${padVisible(colors.bold + totalRowData[c.key] + colors.reset, c.width, c.align)} `);
  console.log(`│${totalCells.join('│')}│`);
  console.log(botBorder);

  console.log(
    `\n  ${getTimestamp()} ${colors.green}${colors.bold}Semua tugas selesai!${colors.reset} ` +
    `Total Poin Diperoleh: ${colors.bold}${colors.green}+${formatNumber(totalDiff)} Poin${colors.reset} | ` +
    `Waktu Eksekusi: ${colors.cyan}${totalDuration} detik${colors.reset}\n`
  );
}

main().catch(err => {
  console.error(`\n${colors.red}[FATAL ERROR] ${err.message}${colors.reset}`);
  process.exit(1);
});
