/**
 * Kryvora Daily - API Handler Module
 * Manages HTTP communications with Kryvora Network endpoints,
 * with built-in automatic retry on HTTP 429 (Rate Limit / Too many requests).
 */

const BASE_URL = 'https://tasks.kryvora.network';

/**
 * Default browser-like headers to ensure smooth interaction and avoid Cloudflare issues.
 */
function getHeaders(token = null, customReferer = null) {
  const headers = {
    'accept': '*/*',
    'accept-language': 'en,en-US;q=0.9,id;q=0.8',
    'content-type': 'application/json',
    'origin': BASE_URL,
    'referer': customReferer || `${BASE_URL}/`,
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36'
  };

  if (token) {
    headers['authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Executes a fetch request with automatic exponential backoff retry on HTTP 429 Rate Limit.
 * @param {string} url - Target URL.
 * @param {object} options - Fetch options.
 * @param {number} maxRetries - Maximum retry attempts (default: 3).
 * @returns {Promise<object>} - Parsed JSON response.
 */
async function requestWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    // Detect Rate Limit (HTTP 429 or "Too many requests" error message)
    if (response.status === 429 || (data.error && String(data.error).toLowerCase().includes('too many requests'))) {
      if (attempt < maxRetries) {
        const retryAfter = response.headers.get('retry-after');
        const waitSec = retryAfter ? parseInt(retryAfter, 10) : attempt * 6; // 6s, 12s, 18s
        console.log(
          `\n    ⚠️  [Rate Limit] Server meminta jeda. Menunggu ${waitSec}s sebelum mencoba ulang (Percobaan ${attempt}/${maxRetries})...`
        );
        await new Promise(r => setTimeout(r, waitSec * 1000));
        continue;
      }
    }

    if (!response.ok) {
      throw new Error(data.error || `Request failed with status ${response.status}`);
    }

    return data;
  }
}

/**
 * Requests a nonce login message from Kryvora backend.
 * @param {string} address - EVM wallet address.
 * @param {string} referralCode - Referral code (optional).
 * @returns {Promise<object>} - { address, message, expiresInSeconds }
 */
async function fetchNonce(address, referralCode = '651A7DCB2E') {
  const url = `${BASE_URL}/api/auth/wallet/nonce`;
  const referer = referralCode
    ? `${BASE_URL}/?ref=${referralCode}`
    : `${BASE_URL}/`;

  return await requestWithRetry(url, {
    method: 'POST',
    headers: getHeaders(null, referer),
    body: JSON.stringify({
      address,
      referralCode: referralCode || undefined
    })
  });
}

/**
 * Submits the signed message to verify wallet and retrieve JWT Bearer token.
 * @param {string} address - EVM wallet address.
 * @param {string} signature - Signed message hex string.
 * @returns {Promise<object>} - { token, user }
 */
async function verifyWallet(address, signature) {
  const url = `${BASE_URL}/api/auth/wallet/verify`;

  return await requestWithRetry(url, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      address,
      signature
    })
  });
}

/**
 * Retrieves the current authenticated user profile, points, and quest statuses.
 * @param {string} token - JWT bearer token.
 * @returns {Promise<object>} - { user }
 */
async function getProfile(token) {
  const url = `${BASE_URL}/api/portal/me`;

  return await requestWithRetry(url, {
    method: 'GET',
    headers: getHeaders(token)
  });
}

/**
 * Retrieves the global list of available quests.
 * @param {string} token - Optional JWT bearer token.
 * @returns {Promise<object>} - { quests: [...] }
 */
async function getQuests(token = null) {
  const url = `${BASE_URL}/api/portal/quests`;

  return await requestWithRetry(url, {
    method: 'GET',
    headers: getHeaders(token)
  });
}

/**
 * Triggers verification check for a specific quest.
 * @param {string} token - JWT bearer token.
 * @param {string} questId - ID of the quest.
 * @param {object} payload - Optional payload (e.g. { chainIdHex: '0x4668b2c' }).
 * @returns {Promise<object>} - { verified, claimable, questId, ... }
 */
async function verifyQuest(token, questId, payload = {}) {
  const url = `${BASE_URL}/api/portal/quests/${encodeURIComponent(questId)}/verify`;

  return await requestWithRetry(url, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });
}

/**
 * Claims reward for an eligible quest.
 * @param {string} token - JWT bearer token.
 * @param {string} questId - ID of the quest.
 * @returns {Promise<object>} - { claimed, alreadyClaimed, pointsAwarded, user }
 */
async function claimQuest(token, questId) {
  const url = `${BASE_URL}/api/portal/quests/${encodeURIComponent(questId)}/claim`;

  return await requestWithRetry(url, {
    method: 'POST',
    headers: getHeaders(token),
    body: '{}'
  });
}

/**
 * Checks gacha status and unrevealed node tokens.
 * @param {string} token - JWT bearer token.
 * @returns {Promise<object>} - { ownsNode, totalNodes, unrevealedCount, tokens }
 */
async function getGachaStatus(token) {
  const url = `${BASE_URL}/api/portal/gacha/status`;

  return await requestWithRetry(url, {
    method: 'GET',
    headers: getHeaders(token)
  });
}

/**
 * Reveals an unrevealed gacha token.
 * @param {string} token - JWT bearer token.
 * @param {string|number} tokenId - ID of the token to reveal.
 * @returns {Promise<object>} - Reveal result data.
 */
async function revealGacha(token, tokenId) {
  const url = `${BASE_URL}/api/portal/gacha/reveal`;

  return await requestWithRetry(url, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ tokenId })
  });
}

module.exports = {
  fetchNonce,
  verifyWallet,
  getProfile,
  getQuests,
  verifyQuest,
  claimQuest,
  getGachaStatus,
  revealGacha
};
