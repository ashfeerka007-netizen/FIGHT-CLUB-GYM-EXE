// Database connection and initialization helper for Fight Club Gym
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '../db');
const dbPath = path.join(dbDir, 'fight_club.db');

// Ensure db directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbExists = fs.existsSync(dbPath);
let db;

function connect() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
        reject(err);
      } else {
        console.log('Connected to Fight Club SQLite database.');
        resolve();
      }
    });
  });
}

// Initial connection
const initPromise = (async () => {
  try {
    await connect();
    if (!dbExists) {
      console.log('Database file not found. Creating schema and seeding initial data...');
      await initializeDatabase();
    } else {
      await runSchemaOnly();
    }
  } catch (err) {
    console.error('Failed to connect to database on startup:', err);
    throw err;
  }
})();

// Helper to execute SQL scripts
function executeSqlFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, sql) => {
      if (err) {
        return reject(err);
      }
      
      // sqlite3 doesn't support executing multiple statements in db.run in one go easily,
      // unless using db.exec. db.exec executes SQL command string.
      db.exec(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  });
}

async function initializeDatabase() {
  try {
    const schemaPath = path.join(dbDir, 'schema.sql');
    const seedPath = path.join(dbDir, 'seed.sql');
    
    console.log('Loading schema...');
    await executeSqlFile(schemaPath);
    console.log('Schema loaded successfully.');
    
    console.log('Loading seed data...');
    await executeSqlFile(seedPath);
    console.log('Seed data loaded successfully.');

    await applyMigrations();
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

async function runSchemaOnly() {
  try {
    const schemaPath = path.join(dbDir, 'schema.sql');
    await executeSqlFile(schemaPath);
    await applyMigrations();
  } catch (error) {
    console.error('Error executing schema check:', error);
  }
}

async function applyMigrations() {
  try {
    // 0. Perform safety backup before running migrations if database exists
    try {
      const backupModule = require('./backup');
      await backupModule.createBackup('Pre-Migration-Auto');
      console.log('Automated safety backup created before applying migrations.');
    } catch (bErr) {
      console.warn('Pre-migration auto-backup note:', bErr.message);
    }

    // 1. Ensure admission_fee_paid column exists in members table
    try {
      await dbHelper.run(`ALTER TABLE members ADD COLUMN admission_fee_paid INTEGER DEFAULT 0`);
    } catch (e) {
      // Column already exists
    }

    // 2. Ensure allow_lan_access column exists in settings table
    try {
      await dbHelper.run(`ALTER TABLE settings ADD COLUMN allow_lan_access INTEGER DEFAULT 0`);
    } catch (e) {
      // Column already exists
    }

    // 2b. Ensure fingerprint columns exist in biometric_enrollments
    const enrollmentCols = [
      'iso_template TEXT DEFAULT ""',
      'ansi_template TEXT DEFAULT ""',
      'bitmap_data TEXT DEFAULT ""',
      'quality_score INTEGER DEFAULT 0',
      'fingerprint_image TEXT DEFAULT ""'
    ];
    for (const colDef of enrollmentCols) {
      const colName = colDef.split(' ')[0];
      try {
        await dbHelper.run(`ALTER TABLE biometric_enrollments ADD COLUMN ${colDef}`);
      } catch (e) {
        // Column already exists
      }
    }

    // 2c. Ensure fingerprint columns exist in members table
    const memberCols = [
      'fingerprint_template TEXT DEFAULT ""',
      'fingerprint_image TEXT DEFAULT ""',
      'fingerprint_quality INTEGER DEFAULT 0'
    ];
    for (const colDef of memberCols) {
      try {
        await dbHelper.run(`ALTER TABLE members ADD COLUMN ${colDef}`);
      } catch (e) {
        // Column already exists
      }
    }

    // 3. Ensure Admission Plan details are up-to-date
    const admissionPlan = await dbHelper.get(`SELECT id FROM membership_plans WHERE id = 1 OR LOWER(name) LIKE '%admission%' LIMIT 1`);
    if (admissionPlan) {
      await dbHelper.run(
        `UPDATE membership_plans 
         SET name = 'Admission Plan (₹1500 Admission + 1 Month ₹1000)',
             duration_months = 1,
             price = 2500,
             discount = 0,
             tax = 0,
             final_amount = 2500,
             features = '["One-time ₹1500 Admission Fee Included", "1 Month Gym Subscription Included (₹1000)", "Registration and ID Card", "Locker activation"]'
         WHERE id = ?`,
        [admissionPlan.id]
      );
    }

    // 4. Run SQL migration scripts from db/migrations directory
    const migrationsDir = path.join(dbDir, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
      for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        console.log(`Applying migration: ${file}...`);
        await executeSqlFile(filePath);
        console.log(`Migration ${file} applied successfully.`);
      }
    }
  } catch (err) {
    console.error('Migration execution error/note:', err.message);
  }
}

// Promisified DB helpers
const dbHelper = {
  get: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  
  all: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  },
  
  run: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  },
  
  exec: (sql) => {
    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },
  
  close: () => {
    return new Promise((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },
  
  reconnect: connect,
  dbPath,
  initPromise
};

module.exports = dbHelper;
