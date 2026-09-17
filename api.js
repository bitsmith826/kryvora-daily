/**
 * Kryvora Daily - API Handler Module
 * Manages HTTP communications with Kryvora Network endpoints.
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

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(null, referer),
    body: JSON.stringify({
      address,
      referralCode: referralCode || undefined
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Nonce request failed with status ${response.status}`);
  }

  return data;
}

/**
 * Submits the signed message to verify wallet and retrieve JWT Bearer token.
 * @param {string} address - EVM wallet address.
 * @param {string} signature - Signed message hex string.
 * @returns {Promise<object>} - { token, user }
 */
async function verifyWallet(address, signature) {
  const url = `${BASE_URL}/api/auth/wallet/verify`;

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      address,
      signature
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Verification failed with status ${response.status}`);
  }

  return data;
}

/**
 * Retrieves the current authenticated user profile, points, and quest statuses.
 * @param {string} token - JWT bearer token.
 * @returns {Promise<object>} - { user }
 */
async function getProfile(token) {
  const url = `${BASE_URL}/api/portal/me`;

  const response = await fetch(url, {
    method: 'GET',
    headers: getHeaders(token)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Failed to fetch profile: HTTP ${response.status}`);
  }

  return data;
}

/**
 * Retrieves the global list of available quests.
 * @param {string} token - Optional JWT bearer token.
 * @returns {Promise<object>} - { quests: [...] }
 */
async function getQuests(token = null) {
  const url = `${BASE_URL}/api/portal/quests`;

  const response = await fetch(url, {
    method: 'GET',
    headers: getHeaders(token)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Failed to fetch quests: HTTP ${response.status}`);
  }

  return data;
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

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Quest verify failed: HTTP ${response.status}`);
  }

  return data;
}

/**
 * Claims reward for an eligible quest.
 * @param {string} token - JWT bearer token.
 * @param {string} questId - ID of the quest.
 * @returns {Promise<object>} - { claimed, alreadyClaimed, pointsAwarded, user }
 */
async function claimQuest(token, questId) {
  const url = `${BASE_URL}/api/portal/quests/${encodeURIComponent(questId)}/claim`;

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(token),
    body: '{}'
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Quest claim failed: HTTP ${response.status}`);
  }

  return data;
}

/**
 * Checks gacha status and unrevealed node tokens.
 * @param {string} token - JWT bearer token.
 * @returns {Promise<object>} - { ownsNode, totalNodes, unrevealedCount, tokens }
 */
async function getGachaStatus(token) {
  const url = `${BASE_URL}/api/portal/gacha/status`;

  const response = await fetch(url, {
    method: 'GET',
    headers: getHeaders(token)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Failed to fetch gacha status: HTTP ${response.status}`);
  }

  return data;
}

/**
 * Reveals an unrevealed gacha token.
 * @param {string} token - JWT bearer token.
 * @param {string|number} tokenId - ID of the token to reveal.
 * @returns {Promise<object>} - Reveal result data.
 */
async function revealGacha(token, tokenId) {
  const url = `${BASE_URL}/api/portal/gacha/reveal`;

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ tokenId })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Gacha reveal failed: HTTP ${response.status}`);
  }

  return data;
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
