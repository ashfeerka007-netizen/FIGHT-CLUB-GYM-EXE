// Security & Cryptography Vault for Fight Club Gym
// Hardware credentials, WhatsApp tokens, HMAC signatures, and API key management

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Master Secret Resolution:
// 1. Check process.env.APP_SECRET, process.env.BIOMETRIC_SECRET, process.env.WA_SECRET
// 2. Or load/generate persistent local secret key file (avoiding hardcoded secrets in repository)
function getMasterSecret() {
  const envSecret = process.env.APP_SECRET || process.env.BIOMETRIC_SECRET || process.env.WA_SECRET;
  if (envSecret && envSecret.trim().length >= 16) {
    return envSecret.trim();
  }

  // Persistent local key file fallback
  const secretKeyPath = path.join(__dirname, '../../.vault_secret');
  try {
    if (fs.existsSync(secretKeyPath)) {
      const stored = fs.readFileSync(secretKeyPath, 'utf8').trim();
      if (stored && stored.length >= 32) return stored;
    }
  } catch (e) {
    // Ignore read error
  }

  // Generate new 32-byte cryptographically secure random secret
  const newSecret = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(secretKeyPath, newSecret, { mode: 0o600 });
  } catch (e) {
    // If writing fails (e.g. read-only filesystem), we still have the runtime secret
  }
  return newSecret;
}

const MASTER_SECRET = getMasterSecret();
const MASTER_KEY_BUFFER = crypto.createHash('sha256').update(MASTER_SECRET).digest();

/**
 * Encrypt sensitive plain text using AES-256-CBC (compatible with existing WhatsApp tokens)
 * Output format: iv_hex:ciphertext_hex
 */
function encrypt(text) {
  if (!text || typeof text !== 'string') return '';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', MASTER_KEY_BUFFER, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

/**
 * Decrypt ciphertext
 */
function decrypt(encryptedText) {
  if (!encryptedText || !encryptedText.includes(':')) return '';
  try {
    const [ivHex, dataHex] = encryptedText.split(':');
    if (!ivHex || !dataHex) return '';
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', MASTER_KEY_BUFFER, iv);
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    return '';
  }
}

/**
 * Generate a cryptographically secure random device API key
 * Returns { apiKey: "fc_dev_...", hash: "...", prefix: "fc_dev_..." }
 */
function generateDeviceApiKey(deviceName = '') {
  const randomHex = crypto.randomBytes(24).toString('hex');
  const apiKey = `fc_dev_${randomHex}`;
  const hash = hashDeviceApiKey(apiKey);
  const masked = `fc_dev_${randomHex.substring(0, 4)}...${randomHex.substring(randomHex.length - 4)}`;
  return { apiKey, hash, masked };
}

/**
 * Hash device API key with SHA-256 for secure DB storage
 */
function hashDeviceApiKey(apiKey) {
  if (!apiKey) return '';
  return crypto.createHash('sha256').update(apiKey.trim()).digest('hex');
}

/**
 * Constant-time comparison for API key verification
 */
function verifyDeviceApiKey(providedKey, storedHash) {
  if (!providedKey || !storedHash) return false;
  const computedHash = hashDeviceApiKey(providedKey);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computedHash, 'hex'),
      Buffer.from(storedHash, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Generate HMAC-SHA256 signature for payload verification
 */
function generateHmacSignature(payloadString, secretKey) {
  return crypto
    .createHmac('sha256', secretKey)
    .update(typeof payloadString === 'string' ? payloadString : JSON.stringify(payloadString))
    .digest('hex');
}

/**
 * Verify HMAC-SHA256 signature in constant time
 */
function verifyHmacSignature(payloadString, signature, secretKey) {
  if (!payloadString || !signature || !secretKey) return false;
  const computedSig = generateHmacSignature(payloadString, secretKey);
  try {
    const a = Buffer.from(signature.replace(/^sha256=/, ''), 'hex');
    const b = Buffer.from(computedSig, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

module.exports = {
  encrypt,
  decrypt,
  generateDeviceApiKey,
  hashDeviceApiKey,
  verifyDeviceApiKey,
  generateHmacSignature,
  verifyHmacSignature,
  getMasterSecret
};
