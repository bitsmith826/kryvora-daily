/**
 * Kryvora Daily - EVM Signer Module
 * Handles Ethereum wallet creation and cryptographic message signing (EIP-191 / personal_sign).
 */

const { ethers } = require('ethers');

/**
 * Normalizes and validates an EVM private key hex string.
 * @param {string} rawKey - The raw private key input.
 * @returns {string} - Formatted hex string starting with '0x'.
 */
function normalizePrivateKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') {
    throw new Error('Private key cannot be empty.');
  }

  let cleanKey = rawKey.trim();
  if (!cleanKey.startsWith('0x')) {
    cleanKey = `0x${cleanKey}`;
  }

  // 0x + 64 hex characters = 66 characters
  if (!/^0x[0-9a-fA-F]{64}$/.test(cleanKey)) {
    throw new Error(
      `Invalid private key length (${cleanKey.length} chars). Expected 64 hex characters.`
    );
  }

  return cleanKey;
}

/**
 * Creates an ethers.Wallet instance from a private key.
 * @param {string} privateKey - EVM private key.
 * @returns {ethers.Wallet} - The initialized wallet instance.
 */
function getWallet(privateKey) {
  const formattedKey = normalizePrivateKey(privateKey);
  return new ethers.Wallet(formattedKey);
}

/**
 * Signs a plain text login challenge using EVM standard personal_sign (EIP-191).
 * @param {ethers.Wallet} wallet - The signer wallet instance.
 * @param {string} message - The plaintext message returned by Kryvora nonce endpoint.
 * @returns {Promise<string>} - The 65-byte hex signature (0x...).
 */
async function signLoginMessage(wallet, message) {
  if (!wallet || !message) {
    throw new Error('Wallet and message are required for signing.');
  }
  return await wallet.signMessage(message);
}

module.exports = {
  normalizePrivateKey,
  getWallet,
  signLoginMessage
};
