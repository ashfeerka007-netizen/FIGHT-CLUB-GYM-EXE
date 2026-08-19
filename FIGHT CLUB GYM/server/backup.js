// Backup and Restore Management Utility for Fight Club Gym
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const backupDir = path.join(__dirname, '../backups');

// Ensure backups directory exists
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// Encryption settings
const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = crypto.scryptSync('fight-club-secret-key-2026', 'salt', 32); // 32 bytes key
const IV_LENGTH = 16; // AES block size

// Encrypt file buffer
function encrypt(buffer) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([iv, cipher.update(buffer), cipher.final()]);
  return encrypted;
}

// Decrypt file buffer
function decrypt(buffer) {
  const iv = buffer.slice(0, IV_LENGTH);
  const encryptedText = buffer.slice(IV_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  return decrypted;
}

/**
 * Creates an encrypted backup of the current database.
 * @param {string} type - 'Manual', 'Auto', or 'Scheduled'
 */
async function createBackup(type = 'Manual') {
  try {
    // 1. Generate filename
    const dateStr = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
    const filename = `fightclub_backup_${dateStr}.enc`;
    const destPath = path.join(backupDir, filename);

    // 2. Read database file
    // Note: sqlite database should ideally be locked or read carefully.
    // For local development, copy-on-read is fine.
    const dbFileBuffer = fs.readFileSync(db.dbPath);

    // 3. Encrypt buffer
    const encryptedData = encrypt(dbFileBuffer);

    // 4. Save to destination
    fs.writeFileSync(destPath, encryptedData);

    // 5. Insert backup record in DB
    const sql = `INSERT INTO backups (filename, file_path, type, status) VALUES (?, ?, ?, ?)`;
    const result = await db.run(sql, [filename, destPath, type, 'Verified']);

    // Log this activity
    await db.run(
      `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
      [1, 'system', 'Backup Created', `Created encrypted backup file: ${filename}`]
    );

    return {
      id: result.id,
      filename,
      filePath: destPath,
      type,
      status: 'Verified',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Backup creation failed:', error);
    throw error;
  }
}

/**
 * Restores database from an encrypted backup file.
 * @param {number} backupId - ID of backup record in DB
 */
async function restoreBackup(backupId) {
  // 1. Get backup metadata from DB
  const backup = await db.get(`SELECT * FROM backups WHERE id = ?`, [backupId]);
  if (!backup) {
    throw new Error('Backup record not found.');
  }

  const backupFilePath = backup.file_path;
  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`Backup file does not exist on disk: ${backupFilePath}`);
  }

  try {
    // 2. Close active DB connection to allow file overwrite
    await db.close();

    // 3. Read and decrypt file
    const encryptedBuffer = fs.readFileSync(backupFilePath);
    const decryptedBuffer = decrypt(encryptedBuffer);

    // 4. Write decrypted database file
    fs.writeFileSync(db.dbPath, decryptedBuffer);

    // 5. Reconnect to the database using the new helper method
    await db.reconnect();
    console.log('Database reconnected successfully after restore.');
    
    return {
      status: 'Success',
      message: `Database restored to state from ${backup.filename}.`
    };
  } catch (error) {
    console.error('Backup restore failed:', error);
    throw error;
  }
}

module.exports = {
  createBackup,
  restoreBackup,
  backupDir
};
