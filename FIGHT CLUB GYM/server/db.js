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
    // 1. Ensure admission_fee_paid column exists in members table
    try {
      await dbHelper.run(`ALTER TABLE members ADD COLUMN admission_fee_paid INTEGER DEFAULT 0`);
    } catch (e) {
      // Column already exists
    }

    // 2. Ensure Admission Plan details are up-to-date
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
  } catch (err) {
    console.error('Migration note:', err.message);
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
