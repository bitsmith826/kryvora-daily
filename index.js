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
 * Loads cached session tokens from sessions.json.
 */
function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_PATH)) {
      return JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf8'));
    }
  } catch (_) {}
  return {};
}

/**
 * Saves or updates a session token in sessions.json.
 */
function saveSession(address, token) {
  try {
    const sessions = loadSessions();
    let expiresAt = Date.now() + 20 * 3600 * 1000;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString('utf8'));
      if (payload.expiresAt) expiresAt = payload.expiresAt;
    } catch (_) {}

    sessions[address.toLowerCase()] = {
      token,
      expiresAt,
      savedAt: Date.now()
    };
    fs.writeFileSync(SESSIONS_PATH, JSON.stringify(sessions, null, 2));
  } catch (_) {}
}

/**
 * Executes an async task while showing an animated timer/progress in the terminal.
 */
async function runWithTimer(label, taskFn) {
  const isTTY = Boolean(process.stdout.isTTY);
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIdx = 0;
  const startTime = Date.now();

  let timer = null;
  if (isTTY) {
    timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const icon = `${colors.cyan}${frames[frameIdx++ % frames.length]}${colors.reset}`;
      process.stdout.write(`\r  ${getTimestamp()} ${icon} ${label} ${colors.dim}(menunggu server: ${elapsed}s)...${colors.reset}`);
    }, 120);
  } else {
    process.stdout.write(`  ${getTimestamp()} ${colors.cyan}⋯${colors.reset} ${label}... `);
  }

  try {
    const result = await taskFn();
    if (timer) clearInterval(timer);
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (isTTY) {
      process.stdout.write(
        `\r  ${getTimestamp()} ${colors.green}✔${colors.reset} ${label} ${colors.green}OK${colors.reset} ${colors.dim}(${totalDuration}s)${colors.reset}               \n`
      );
    } else {
      console.log(`${colors.green}OK${colors.reset} ${colors.dim}(${totalDuration}s)${colors.reset}`);
    }
    return result;
  } catch (err) {
    if (timer) clearInterval(timer);
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

    if (isTTY) {
      process.stdout.write(
        `\r  ${getTimestamp()} ${colors.red}✖${colors.reset} ${label} ${colors.red}GAGAL${colors.reset} ${colors.dim}(${totalDuration}s)${colors.reset}               \n`
      );
    } else {
      console.log(`${colors.red}GAGAL${colors.reset} ${colors.dim}(${totalDuration}s)${colors.reset}`);
    }
    throw err;
  }
}

/**
 * Loads configuration from .env if present.
 */
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  const config = {
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
  console.log(`║${padVisible('KRYVORA NETWORK DAILY BOT', innerWidth, 'center')}║`);
  console.log(`║${padVisible('Multi-Wallet EVM Task Claimer & Auto Check-in', innerWidth, 'center')}║`);
  console.log(`╚${'═'.repeat(innerWidth)}╝${colors.reset}`);

  console.log(`  ${getTimestamp()} ${colors.green}Total Wallet Terdeteksi :${colors.reset} ${colors.bold}${totalWallets}${colors.reset} akun`);
  console.log(`  ${getTimestamp()} ${colors.cyan}Referral Code Bawaan    :${colors.reset} ${config.DEFAULT_REFERRAL_CODE}`);
  console.log(`  ${getTimestamp()} ${colors.cyan}Auto Onboarding Tasks   :${colors.reset} ${config.AUTO_ONBOARDING ? colors.green + 'AKTIF (+250 Poin)' : colors.yellow + 'NONAKTIF'}${colors.reset}`);
  console.log(`  ${getTimestamp()} ${colors.cyan}Jeda Antar Akun         :${colors.reset} ${config.DELAY_BETWEEN_WALLETS_SEC} detik`);
  console.log(`  ${getTimestamp()} ${colors.cyan}Session Token Caching   :${colors.reset} ${colors.green}AKTIF (Sesi disimpan 24 jam untuk klaim instan)${colors.reset}`);
  console.log(`${colors.dim}  ${'─'.repeat(LAYOUT_WIDTH - 4)}${colors.reset}\n`);
}

/**
 * Prints the account card header.
 */
function printAccountHeader(index, total, address) {
  const cardContent = ` [Akun ${index}/${total}] ${address} `;
  const remaining = LAYOUT_WIDTH - cardContent.length - 2;
  console.log(`${colors.blue}${colors.bold}┌─${cardContent}${'─'.repeat(Math.max(0, remaining))}┐${colors.reset}`);
}

/**
 * Prints the account card footer.
 */
function printAccountFooter() {
  console.log(`${colors.blue}└${'─'.repeat(LAYOUT_WIDTH - 2)}┘${colors.reset}\n`);
}

/**
 * Main application logic.
 */
async function main() {
  const config = loadEnv();
  const privateKeys = loadPrivateKeys();
  const sessions = loadSessions();

  printBanner(config, privateKeys.length);

  const summary = [];

  for (let i = 0; i < privateKeys.length; i++) {
    const rawKey = privateKeys[i];
    const accountIndex = i + 1;
    let wallet = null;

    try {
      wallet = getWallet(rawKey);
    } catch (err) {
      console.log(`  ${getTimestamp()} ${colors.red}[!] Private Key Akun #${accountIndex} tidak valid: ${err.message}${colors.reset}\n`);
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
    const addrKey = addr.toLowerCase();
    printAccountHeader(accountIndex, privateKeys.length, addr);

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

      // Check if we have a valid cached session token (valid for 24h)
      const cached = sessions[addrKey];
      if (cached && cached.token && cached.expiresAt && cached.expiresAt > Date.now() + 60000) {
        try {
          const profileCheck = await runWithTimer('[1/5] Verifikasi Sesi Tersimpan (Cache)', async () => {
            return await getProfile(cached.token);
          });
          if (profileCheck && profileCheck.user) {
            token = cached.token;
            user = profileCheck.user;
            console.log(`  ${getTimestamp()}       ${colors.green}└─ Sesi 24 jam masih aktif! Melewati proses login server.${colors.reset}`);
          }
        } catch (_) {
          // Token expired or invalid on server, fall back to fresh login
        }
      }

      // If no valid cached token, perform fresh authentication
      if (!token || !user) {
        const nonceData = await runWithTimer('[1/5] Request Challenge Nonce', async () => {
          return await fetchNonce(addr, config.DEFAULT_REFERRAL_CODE);
        });

        const signature = await runWithTimer('[2/5] Sign Login Message (EIP-191 personal_sign)', async () => {
          return await signLoginMessage(wallet, nonceData.message);
        });

        const verifyRes = await runWithTimer('[3/5] Verifikasi Signature ke Server Kryvora', async () => {
          return await verifyWallet(addr, signature);
        });

        token = verifyRes.token;
        user = verifyRes.user || {};
        saveSession(addr, token);
      }

      record.initialPoints = user.points || 0;
      record.streak = user.dailyStreak || 0;
      record.level = user.level || 1;
      record.rank = user.rank || '-';

      console.log(
        `  ${getTimestamp()}       ${colors.dim}└─ Profil Awal : ${colors.bold}${formatNumber(user.points)} Poin${colors.reset} | ` +
        `Streak: ${colors.yellow}${user.dailyStreak || 0} hari${colors.reset} | ` +
        `Level: Lv.${user.level || 1} | Rank: #${formatNumber(user.rank)}`
      );

      // Auto Onboarding Tasks
      if (config.AUTO_ONBOARDING) {
        const completed = new Set(user.completedQuestIds || []);

        // Task: Connect Wallet (+100 Poin)
        if (!completed.has('quest-wallet')) {
          try {
            await runWithTimer('[ONBOARD] Verifikasi Quest Connect Wallet', async () => {
              const vRes = await verifyQuest(token, 'quest-wallet');
              if (vRes.claimable) {
                const cRes = await claimQuest(token, 'quest-wallet');
                if (cRes.user) user = cRes.user;
              }
            });
            console.log(`  ${getTimestamp()}       ${colors.green}└─ Quest Connect Wallet BERHASIL (+100 Poin)${colors.reset}`);
          } catch (qErr) {
            console.log(`  ${getTimestamp()}       ${colors.yellow}└─ Quest Connect Wallet: ${qErr.message}${colors.reset}`);
          }
        }

        // Task: Add Network (+150 Poin)
        if (!completed.has('quest-add-network')) {
          try {
            await runWithTimer('[ONBOARD] Verifikasi Quest Add Kryvora Network', async () => {
              const vRes = await verifyQuest(token, 'quest-add-network', { chainIdHex: '0x4668b2c' });
              if (vRes.claimable) {
                const cRes = await claimQuest(token, 'quest-add-network');
                if (cRes.user) user = cRes.user;
              }
            });
            console.log(`  ${getTimestamp()}       ${colors.green}└─ Quest Add Network BERHASIL (+150 Poin)${colors.reset}`);
          } catch (qErr) {
            console.log(`  ${getTimestamp()}       ${colors.yellow}└─ Quest Add Network: ${qErr.message}${colors.reset}`);
          }
        }
      }

      // Daily Check-in (quest-daily-gm, +50 Poin)
      const claimedDaily = new Set(user.claimedDailyQuestIds || []);
      const todayUTC = new Date().toISOString().split('T')[0];
      const alreadyClaimedToday =
        claimedDaily.has('quest-daily-gm') || user.lastDailyClaim === todayUTC;

      if (!alreadyClaimedToday) {
        try {
          const gmClaim = await runWithTimer('[4/5] Klaim Daily Check-in (quest-daily-gm)', async () => {
            return await claimQuest(token, 'quest-daily-gm');
          });

          if (gmClaim.claimed) {
            record.status = `${colors.green}[ KLAIM SUKSES ]${colors.reset}`;
            if (gmClaim.user) user = gmClaim.user;
            console.log(`  ${getTimestamp()}       ${colors.green}└─ Daily Check-in BERHASIL (+${gmClaim.pointsAwarded || 50} Poin)! Streak sekarang: ${user.dailyStreak || 1} hari${colors.reset}`);
          } else {
            record.status = `${colors.yellow}[ Cek Manual ]${colors.reset}`;
          }
        } catch (gmErr) {
          console.log(`  ${getTimestamp()}       ${colors.red}└─ Daily Check-in Gagal: ${gmErr.message}${colors.reset}`);
          record.status = `${colors.red}[ Gagal ]${colors.reset}`;
        }
      } else {
        console.log(`  ${getTimestamp()} ${colors.cyan}[4/5] Daily Check-in : Sudah diklaim hari ini (${user.lastDailyClaim || todayUTC}). Reset pkl 07:00 WIB.${colors.reset}`);
        record.status = `${colors.cyan}[ SUDAH KLAIM ]${colors.reset}`;
      }

      // Sweep pending claimable quests
      if (Array.isArray(user.claimableQuestIds) && user.claimableQuestIds.length > 0) {
        for (const qId of user.claimableQuestIds) {
          try {
            await runWithTimer(`[SWEEP] Klaim Quest Tertunda (${qId})`, async () => {
              const sClaim = await claimQuest(token, qId);
              if (sClaim.user) user = sClaim.user;
            });
          } catch (_) {}
        }
      }

      // Gacha check & reveal
      if (config.AUTO_GACHA_REVEAL) {
        try {
          const gacha = await getGachaStatus(token);
          if (gacha.unrevealedCount > 0 && Array.isArray(gacha.tokens)) {
            for (const t of gacha.tokens) {
              if (!t.revealed) {
                await runWithTimer(`[GACHA] Reveal Node Token #${t.tokenId}`, async () => {
                  return await revealGacha(token, t.tokenId);
                });
              }
            }
          }
        } catch (_) {}
      }

      // Final profile refresh
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
        `  ${getTimestamp()} ${colors.green}[5/5] Selesai Akun #${accountIndex}!${colors.reset} Poin Akhir: ${colors.bold}${colors.green}${formatNumber(record.finalPoints)}${colors.reset} ` +
        `(${colors.bold}${earnedFormatted} Poin${colors.reset}) | Streak: ${colors.yellow}${record.streak} hari${colors.reset}`
      );
    } catch (err) {
      console.log(`  ${getTimestamp()} ${colors.red}[!] Error Akun #${accountIndex}: ${err.message}${colors.reset}`);
      record.status = `${colors.red}[ Error ]${colors.reset}`;
    }

    printAccountFooter();
    summary.push(record);

    // Sleep between wallets
    if (i < privateKeys.length - 1 && config.DELAY_BETWEEN_WALLETS_SEC > 0) {
      console.log(`  ${getTimestamp()} ${colors.dim}Menunggu jeda ${config.DELAY_BETWEEN_WALLETS_SEC} detik sebelum akun berikutnya...${colors.reset}\n`);
      await sleep(config.DELAY_BETWEEN_WALLETS_SEC * 1000);
    }
  }

  // Print Summary Table with Precision Box Borders
  printSummaryTable(summary);
}

/**
 * Renders the precision summary table using pure Unicode box characters.
 */
function printSummaryTable(summary) {
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

  console.log(`${colors.cyan}${colors.bold}`);
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

  // Table Rows
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

  console.log(`\n  ${getTimestamp()} ${colors.green}${colors.bold}Semua tugas selesai dengan sukses! Sampai jumpa besok hari!${colors.reset}\n`);
}

main().catch(err => {
  console.error(`\n${colors.red}[FATAL ERROR] ${err.message}${colors.reset}`);
  process.exit(1);
});
