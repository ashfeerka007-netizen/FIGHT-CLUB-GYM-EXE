// Secure Password Hashing & Migration Engine
// Replaces insecure plain SHA-256 with salted key derivation (scrypt)
// Provides transparent zero-downtime auto-migration for existing users upon login

const crypto = require('crypto');

// Scrypt parameter configuration (N=16384, r=8, p=1, 64-byte key)
const SCRYPT_CONFIG = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
  keylen: 64,
  saltlen: 16
};

/**
 * Hash a plain text password with modern salted scrypt
 * Returns formatted string: $scrypt$N=16384,r=8,p=1$<saltHex>$<derivedHex>
 */
function hashPassword(password) {
  return new Promise((resolve, reject) => {
    if (!password || typeof password !== 'string') {
      return reject(new Error('Password must be a non-empty string'));
    }

    const salt = crypto.randomBytes(SCRYPT_CONFIG.saltlen);
    crypto.scrypt(
      password,
      salt,
      SCRYPT_CONFIG.keylen,
      { N: SCRYPT_CONFIG.N, r: SCRYPT_CONFIG.r, p: SCRYPT_CONFIG.p, maxmem: SCRYPT_CONFIG.maxmem },
      (err, derivedKey) => {
        if (err) return reject(err);
        const hashStr = `$scrypt$N=${SCRYPT_CONFIG.N},r=${SCRYPT_CONFIG.r},p=${SCRYPT_CONFIG.p}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
        resolve(hashStr);
      }
    );
  });
}

/**
 * Synchronous hash version for seed/test utilities
 */
function hashPasswordSync(password) {
  const salt = crypto.randomBytes(SCRYPT_CONFIG.saltlen);
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_CONFIG.keylen, {
    N: SCRYPT_CONFIG.N,
    r: SCRYPT_CONFIG.r,
    p: SCRYPT_CONFIG.p,
    maxmem: SCRYPT_CONFIG.maxmem
  });
  return `$scrypt$N=${SCRYPT_CONFIG.N},r=${SCRYPT_CONFIG.r},p=${SCRYPT_CONFIG.p}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

/**
 * Verify password against stored hash (handles modern scrypt & legacy SHA-256)
 * Returns { valid: boolean, needsUpgrade: boolean, newHash?: string }
 */
async function verifyPassword(password, storedHash) {
  if (!password || !storedHash) {
    return { valid: false, needsUpgrade: false };
  }

  // 1. Check if hash is in modern scrypt format
  if (storedHash.startsWith('$scrypt$')) {
    const parts = storedHash.split('$');
    // Expected format: ['', 'scrypt', 'N=16384,r=8,p=1', saltHex, keyHex]
    if (parts.length >= 5) {
      const params = {};
      parts[2].split(',').forEach(kv => {
        const [k, v] = kv.split('=');
        if (k && v) params[k] = parseInt(v, 10);
      });

      const salt = Buffer.from(parts[3], 'hex');
      const expectedKey = Buffer.from(parts[4], 'hex');

      return new Promise((resolve) => {
        crypto.scrypt(
          password,
          salt,
          expectedKey.length,
          {
            N: params.N || SCRYPT_CONFIG.N,
            r: params.r || SCRYPT_CONFIG.r,
            p: params.p || SCRYPT_CONFIG.p,
            maxmem: SCRYPT_CONFIG.maxmem
          },
          (err, derivedKey) => {
            if (err) return resolve({ valid: false, needsUpgrade: false });
            try {
              const valid = crypto.timingSafeEqual(expectedKey, derivedKey);
              resolve({ valid, needsUpgrade: false });
            } catch {
              resolve({ valid: false, needsUpgrade: false });
            }
          }
        );
      });
    }
  }

  // 2. Check if hash is legacy SHA-256 (64 hex characters)
  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    const legacySha256 = crypto.createHash('sha256').update(password).digest('hex');
    const valid = legacySha256.toLowerCase() === storedHash.toLowerCase();
    if (valid) {
      // Valid legacy hash -> generate upgraded scrypt hash for auto-migration
      const newHash = await hashPassword(password);
      return { valid: true, needsUpgrade: true, newHash };
    }
    return { valid: false, needsUpgrade: false };
  }

  // 3. Fallback direct comparison (for edge cases)
  return { valid: password === storedHash, needsUpgrade: true, newHash: await hashPassword(password) };
}

module.exports = {
  hashPassword,
  hashPasswordSync,
  verifyPassword
};
