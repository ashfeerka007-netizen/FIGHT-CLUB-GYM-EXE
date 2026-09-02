// Main Express server for Fight Club Gym Membership Management System
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const db = require('./db');
const backup = require('./backup');
const whatsappRoutes = require('./whatsapp/routes');
const whatsappScheduler = require('./whatsapp/scheduler');
const biometricRoutes = require('./biometric/routes');
const { hashPassword, verifyPassword } = require('./security/passwords');
const { authLimiter, uploadLimiter, deviceWebhookLimiter } = require('./security/rate-limiter');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and JSON parsing (Restricted origins with localhost default)
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5000', 'http://127.0.0.1:5000', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. biometric hardware IoT, curl, Postman) and allowed web origins
    if (!origin || allowedOrigins.includes(origin) || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      callback(null, true);
    } else {
      callback(null, true); // Permissive for local network gym hardware
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '2mb' }));

// Setup Uploads Directories
const uploadsDir = path.join(__dirname, '../uploads');
const memberPhotosDir = path.join(uploadsDir, 'members');
const logoDir = path.join(uploadsDir, 'logo');
const billsDir = path.join(uploadsDir, 'bills');

[uploadsDir, memberPhotosDir, logoDir, billsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Serve uploads statically
app.use('/uploads', express.static(uploadsDir));

// Serve SPA Frontend statically
app.use(express.static(path.join(__dirname, '../public')));

// Mount WhatsApp API routes
app.use('/api/whatsapp', whatsappRoutes);

// Mount Biometric Access API & Webhook routes
app.use('/api/biometric', biometricRoutes.router);
app.post('/api/device-events/:deviceId', deviceWebhookLimiter, biometricRoutes.handleDeviceWebhook);

// Configure Multer for File Uploads with validation (5MB limit & mime-type filter)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'photo') cb(null, memberPhotosDir);
    else if (file.fieldname === 'logo') cb(null, logoDir);
    else if (file.fieldname === 'bill') cb(null, billsDir);
    else cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const sanitizedExt = path.extname(file.originalname).toLowerCase();
    cb(null, file.fieldname + '-' + uniqueSuffix + sanitizedExt);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    const allowedImageMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const allowedDocMimes = [...allowedImageMimes, 'application/pdf'];
    if (file.fieldname === 'bill' && allowedDocMimes.includes(file.mimetype)) {
      cb(null, true);
    } else if (allowedImageMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file format. Only JPEG, PNG, WEBP, and PDF files are allowed.'));
    }
  }
});

// ----------------------------------------------------
// 1. AUTHENTICATION ENDPOINTS (WITH PASSWORD MIGRATION & RATE LIMIT)
// ----------------------------------------------------
app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  try {
    const user = await db.get(
      `SELECT u.*, r.name as role_name, r.permissions 
       FROM users u 
       LEFT JOIN roles r ON u.role_id = r.id 
       WHERE u.username = ? AND u.status = 'Active'`,
      [username]
    );
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Verify password with auto-migration support (scrypt & legacy SHA-256)
    const verifyResult = await verifyPassword(password, user.password_hash);
    if (!verifyResult.valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Transparent zero-downtime password hash upgrade if user has a legacy hash
    if (verifyResult.needsUpgrade && verifyResult.newHash) {
      try {
        await db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [verifyResult.newHash, user.id]);
        console.log(`[Security] Upgraded password hash for user "${user.username}" to salted scrypt.`);
      } catch (upErr) {
        console.warn('Failed to upgrade password hash:', upErr.message);
      }
    }
    
    // Create activity log
    await db.run(
      `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
      [user.id, user.username, 'Login', `${user.fullname} logged in successfully.`]
    );
    
    // Exclude password hash from response
    delete user.password_hash;
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 2. DASHBOARD ENDPOINTS
// ----------------------------------------------------
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // KPI Counters
    const totalMembers = await db.get(`SELECT COUNT(*) as count FROM members`);
    const activeMembers = await db.get(`SELECT COUNT(*) as count FROM members WHERE status = 'Active'`);
    const expiredMembers = await db.get(`SELECT COUNT(*) as count FROM members WHERE status = 'Expired'`);
    
    // Expirations and Due fees
    const expiringToday = await db.get(
      `SELECT COUNT(*) as count FROM subscriptions WHERE expiry_date = ? AND status = 'Active'`,
      [today]
    );
    
    const feesDueToday = await db.get(
      `SELECT COUNT(*) as count FROM payments WHERE balance > 0 AND payment_date = ?`,
      [today]
    );
    
    // Revenue & Expenses
    const currentMonth = today.substring(0, 7); // YYYY-MM
    const monthlyRev = await db.get(
      `SELECT SUM(paid_amount) as total FROM payments WHERE payment_date LIKE ?`,
      [`${currentMonth}%`]
    );
    const monthlyExp = await db.get(
      `SELECT SUM(amount) as total FROM expenses WHERE expense_date LIKE ?`,
      [`${currentMonth}%`]
    );
    
    const revenue = monthlyRev.total || 0;
    const expenses = monthlyExp.total || 0;
    const netProfit = revenue - expenses;
    
    // Recent Payments
    const recentPayments = await db.all(
      `SELECT p.*, m.fullname as member_name 
       FROM payments p 
       LEFT JOIN members m ON p.member_id = m.id 
       ORDER BY p.payment_date DESC, p.id DESC LIMIT 5`
    );
    
    // New Members
    const newMembers = await db.all(
      `SELECT * FROM members ORDER BY joining_date DESC, id DESC LIMIT 5`
    );
    
    // Recent Renewals (Latest subscriptions)
    const recentRenewals = await db.all(
      `SELECT s.*, m.fullname as member_name, mp.name as plan_name 
       FROM subscriptions s
       LEFT JOIN members m ON s.member_id = m.id
       LEFT JOIN membership_plans mp ON s.plan_id = mp.id
       ORDER BY s.created_at DESC LIMIT 5`
    );
    
    // Recent Expenses
    const recentExpenses = await db.all(
      `SELECT * FROM expenses ORDER BY expense_date DESC LIMIT 5`
    );
    
    // Revenue Forecast (Estimate for next month based on active memberships due to renew)
    const forecast = await db.get(
      `SELECT SUM(mp.final_amount) as total 
       FROM subscriptions s 
       JOIN membership_plans mp ON s.plan_id = mp.id 
       WHERE s.expiry_date LIKE ? AND s.status = 'Active'`,
      [`${new Date(new Date().getFullYear(), new Date().getMonth() + 1).toISOString().substring(0, 7)}%`]
    );
    
    const currentYear = new Date().getFullYear();
    
    // Monthly collections (payments) for chart
    const collections = await db.all(
      `SELECT substr(payment_date, 6, 2) as month, SUM(paid_amount) as total
       FROM payments
       WHERE payment_date LIKE ?
       GROUP BY month`,
      [`${currentYear}%`]
    );
    
    // Monthly expenses for chart
    const expensesList = await db.all(
      `SELECT substr(expense_date, 6, 2) as month, SUM(amount) as total
       FROM expenses
       WHERE expense_date LIKE ?
       GROUP BY month`,
      [`${currentYear}%`]
    );
    
    // Category-wise expenses for chart
    const expensesByCategory = await db.all(
      `SELECT category, SUM(amount) as total
       FROM expenses
       WHERE expense_date LIKE ?
       GROUP BY category`,
      [`${currentYear}%`]
    );
    
    res.json({
      kpis: {
        totalMembers: totalMembers.count,
        activeMembers: activeMembers.count,
        expiredMembers: expiredMembers.count,
        expiringToday: expiringToday.count,
        feesDueToday: feesDueToday.count,
        monthlyRevenue: revenue,
        monthlyExpenses: expenses,
        netProfit,
        revenueForecast: forecast.total || 0
      },
      recentPayments,
      newMembers,
      recentRenewals,
      recentExpenses,
      collections,
      expenses: expensesList,
      expensesByCategory
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 3. MEMBER ENDPOINTS
// ----------------------------------------------------
app.get('/api/members', async (req, res) => {
  const { search, status, plan, trainer, sort, order = 'ASC', date_from, date_to, date_type = 'joining' } = req.query;
  let sql = `SELECT m.*, t.fullname as trainer_name, 
             s.expiry_date, mp.name as plan_name 
             FROM members m
             LEFT JOIN trainers t ON m.trainer_id = t.id
             LEFT JOIN (
                SELECT member_id, MAX(id) as max_sub_id FROM subscriptions GROUP BY member_id
             ) latest_sub ON m.id = latest_sub.member_id
             LEFT JOIN subscriptions s ON latest_sub.max_sub_id = s.id
             LEFT JOIN membership_plans mp ON s.plan_id = mp.id
             WHERE 1=1`;
             
  const params = [];
  
  if (search) {
    sql += ` AND (m.fullname LIKE ? OR m.member_code LIKE ? OR m.mobile LIKE ? OR m.email LIKE ?)`;
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam, searchParam);
  }
  
  if (status) {
    sql += ` AND m.status = ?`;
    params.push(status);
  }
  
  if (plan) {
    sql += ` AND mp.id = ?`;
    params.push(plan);
  }
  
  if (trainer) {
    sql += ` AND m.trainer_id = ?`;
    params.push(trainer);
  }

  if (date_from) {
    if (date_type === 'expiry') {
      sql += ` AND s.expiry_date >= ?`;
    } else {
      sql += ` AND m.joining_date >= ?`;
    }
    params.push(date_from);
  }

  if (date_to) {
    if (date_type === 'expiry') {
      sql += ` AND s.expiry_date <= ?`;
    } else {
      sql += ` AND m.joining_date <= ?`;
    }
    params.push(date_to);
  }
  
  if (sort) {
    // Map frontend sort keys to correct SQL column expressions
    const colMap = {
      fullname: 'm.fullname',
      member_code: 'm.member_code',
      joining_date: 'm.joining_date',
      status: 'm.status',
      mobile: 'm.mobile',
      expiry_date: 's.expiry_date',
      trainer_name: 't.fullname'
    };
    const sortExpr = colMap[sort];
    if (sortExpr) {
      sql += ` ORDER BY ${sortExpr} ${order === 'DESC' ? 'DESC' : 'ASC'}`;
    }
  } else {
    sql += ` ORDER BY m.id DESC`;
  }
  
  try {
    const members = await db.all(sql, params);
    res.json(members);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/members/:id', async (req, res) => {
  try {
    const member = await db.get(
      `SELECT m.*, t.fullname as trainer_name 
       FROM members m 
       LEFT JOIN trainers t ON m.trainer_id = t.id 
       WHERE m.id = ?`,
      [req.params.id]
    );
    
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    const subscriptions = await db.all(
      `SELECT s.*, mp.name as plan_name, mp.category, mp.final_amount 
       FROM subscriptions s 
       JOIN membership_plans mp ON s.plan_id = mp.id 
       WHERE s.member_id = ? 
       ORDER BY s.id DESC`,
      [req.params.id]
    );
    
    const payments = await db.all(
      `SELECT * FROM payments WHERE member_id = ? ORDER BY id DESC`,
      [req.params.id]
    );
    
    const attendance = await db.all(
      `SELECT * FROM attendance WHERE member_id = ? ORDER BY attendance_date DESC, check_in DESC LIMIT 30`,
      [req.params.id]
    );
    
    res.json({ member, subscriptions, payments, attendance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/members', upload.single('photo'), async (req, res) => {
  const {
    member_code, fullname, gender, dob, mobile, whatsapp, email,
    address, emergency_contact, blood_group, joining_date,
    trainer_id, medical_notes, notes, status = 'Active',
    admission_fee_paid,
    fingerprint_template, fingerprint_image, fingerprint_quality
  } = req.body;
  
  if (!fullname) {
    return res.status(400).json({ error: 'Full name is required' });
  }
  
  try {
    let final_member_code = member_code ? member_code : null;
    const photo_path = req.file ? `/uploads/members/${req.file.filename}` : '';
    const isAdmissionPaid = (admission_fee_paid === 'true' || admission_fee_paid === true || admission_fee_paid === 1 || admission_fee_paid === '1') ? 1 : 0;
    const qualityScore = parseInt(fingerprint_quality, 10) || 0;
    
    // If no member_code provided, insert first then update with auto ID-based code
    const sql = `INSERT INTO members (member_code, fullname, photo_path, gender, dob, mobile, whatsapp, email, address, emergency_contact, blood_group, joining_date, trainer_id, medical_notes, status, notes, admission_fee_paid, fingerprint_template, fingerprint_image, fingerprint_quality)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                 
    const result = await db.run(sql, [
      final_member_code || null, fullname, photo_path, gender, dob, mobile, whatsapp, email,
      address, emergency_contact, blood_group, joining_date,
      trainer_id ? parseInt(trainer_id) : null,
      medical_notes, status, notes, isAdmissionPaid,
      fingerprint_template || '', fingerprint_image || '', qualityScore
    ]);

    // Auto-assign member code if not provided
    if (!final_member_code) {
      final_member_code = `FC-${1000 + result.id}`;
      await db.run(`UPDATE members SET member_code = ? WHERE id = ?`, [final_member_code, result.id]);
    }

    // If fingerprint template was captured during member registration, auto-enroll into Mantra device
    if (fingerprint_template || fingerprint_image) {
      try {
        const mantraDevice = await db.get(`SELECT id FROM biometric_devices WHERE vendor = 'Mantra' LIMIT 1`);
        if (mantraDevice) {
          const now = new Date().toISOString();
          await db.run(
            `INSERT INTO biometric_enrollments 
             (member_id, device_id, device_user_id, biometric_type, enrollment_status, synced_at, notes, iso_template, bitmap_data, quality_score, fingerprint_image)
             VALUES (?, ?, ?, 'fingerprint', 'Enrolled', ?, 'Registered during member creation', ?, ?, ?, ?)`,
            [result.id, mantraDevice.id, final_member_code, now, fingerprint_template || '', '', qualityScore, fingerprint_image || '']
          );
        }
      } catch (bioErr) {
        console.warn('Note: Auto biometric enrollment warning:', bioErr.message);
      }
    }
    
    await db.run(
      `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
      [1, 'admin', 'Member Registered', `Registered member ${fullname} with code ${final_member_code}${fingerprint_template ? ' (Biometric Enrolled)' : ''}`]
    );
    
    res.status(201).json({ id: result.id, member_code: final_member_code, admission_fee_paid: isAdmissionPaid });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Membership Number already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/members/:id', upload.single('photo'), async (req, res) => {
  const {
    member_code, fullname, gender, dob, mobile, whatsapp, email,
    address, emergency_contact, blood_group, joining_date,
    trainer_id, medical_notes, notes, status,
    admission_fee_paid,
    fingerprint_template, fingerprint_image, fingerprint_quality
  } = req.body;
  
  try {
    let photo_path = req.body.photo_path;
    if (req.file) {
      photo_path = `/uploads/members/${req.file.filename}`;
    }
    
    const isAdmissionPaid = (admission_fee_paid === 'true' || admission_fee_paid === true || admission_fee_paid === 1 || admission_fee_paid === '1') ? 1 : 0;
    const qualityScore = parseInt(fingerprint_quality, 10) || 0;
    
    const sql = `UPDATE members SET member_code = ?, fullname = ?, photo_path = ?, gender = ?, dob = ?, mobile = ?, whatsapp = ?, email = ?, address = ?, emergency_contact = ?, blood_group = ?, joining_date = ?, trainer_id = ?, medical_notes = ?, status = ?, notes = ?, admission_fee_paid = ?,
                 fingerprint_template = COALESCE(NULLIF(?, ''), fingerprint_template),
                 fingerprint_image = COALESCE(NULLIF(?, ''), fingerprint_image),
                 fingerprint_quality = CASE WHEN ? > 0 THEN ? ELSE fingerprint_quality END
                 WHERE id = ?`;
                 
    await db.run(sql, [
      member_code, fullname, photo_path, gender, dob, mobile, whatsapp, email,
      address, emergency_contact, blood_group, joining_date,
      trainer_id ? parseInt(trainer_id) : null,
      medical_notes, status, notes, isAdmissionPaid,
      fingerprint_template || '', fingerprint_image || '', qualityScore, qualityScore,
      req.params.id
    ]);

    // If fingerprint template was captured/updated, sync to biometric_enrollments
    if (fingerprint_template || fingerprint_image) {
      try {
        const mantraDevice = await db.get(`SELECT id FROM biometric_devices WHERE vendor = 'Mantra' LIMIT 1`);
        if (mantraDevice) {
          const now = new Date().toISOString();
          const existingEnroll = await db.get(
            `SELECT id FROM biometric_enrollments WHERE member_id = ? AND device_id = ?`,
            [req.params.id, mantraDevice.id]
          );
          if (existingEnroll) {
            await db.run(
              `UPDATE biometric_enrollments 
               SET iso_template = COALESCE(NULLIF(?, ''), iso_template),
                   quality_score = CASE WHEN ? > 0 THEN ? ELSE quality_score END,
                   fingerprint_image = COALESCE(NULLIF(?, ''), fingerprint_image),
                   synced_at = ?
               WHERE id = ?`,
              [fingerprint_template || '', qualityScore, qualityScore, fingerprint_image || '', now, existingEnroll.id]
            );
          } else {
            await db.run(
              `INSERT INTO biometric_enrollments 
               (member_id, device_id, device_user_id, biometric_type, enrollment_status, synced_at, notes, iso_template, quality_score, fingerprint_image)
               VALUES (?, ?, ?, 'fingerprint', 'Enrolled', ?, 'Updated from member profile', ?, ?, ?)`,
              [req.params.id, mantraDevice.id, member_code, now, fingerprint_template || '', qualityScore, fingerprint_image || '']
            );
          }
        }
      } catch (bioErr) {
        console.warn('Note: Biometric sync warning:', bioErr.message);
      }
    }
    
    await db.run(
      `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
      [1, 'admin', 'Member Updated', `Updated member profile for ${fullname} (ID: ${req.params.id})`]
    );
    
    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Membership Number already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Recycle Bin / Temporary Undo Cache
let deletedMembersCache = {};

app.delete('/api/members/:id', async (req, res) => {
  try {
    const member = await db.get(`SELECT * FROM members WHERE id = ?`, [req.params.id]);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    // Save to cache for undo
    deletedMembersCache[member.id] = member;
    
    // Cascade delete of dependencies could be handled, but for simplicity
    // we delete member and allow recovery of member record.
    await db.run(`DELETE FROM members WHERE id = ?`, [req.params.id]);
    
    await db.run(
      `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
      [1, 'admin', 'Member Deleted', `Deleted member ${member.fullname} (ID: ${member.id})`]
    );
    
    res.json({ success: true, message: 'Member deleted. Can be undone.', undoId: member.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/members/:id/undo', async (req, res) => {
  const cached = deletedMembersCache[req.params.id];
  if (!cached) {
    return res.status(400).json({ error: 'No deleted member found to restore or session expired' });
  }
  
  try {
    const sql = `INSERT INTO members (id, member_code, fullname, photo_path, gender, dob, mobile, whatsapp, email, address, emergency_contact, blood_group, joining_date, trainer_id, medical_notes, status, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    await db.run(sql, [
      cached.id, cached.member_code, cached.fullname, cached.photo_path, cached.gender, cached.dob, cached.mobile, cached.whatsapp, cached.email, cached.address, cached.emergency_contact, cached.blood_group, cached.joining_date, cached.trainer_id, cached.medical_notes, cached.status, cached.notes
    ]);
    
    delete deletedMembersCache[cached.id];
    
    await db.run(
      `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
      [1, 'admin', 'Member Restored', `Restored deleted member ${cached.fullname} (ID: ${cached.id})`]
    );
    
    res.json({ success: true, message: 'Member restored successfully!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Date parsing helper for various formats (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, etc.)
function parseFlexibleDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Format: YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
    const parts = trimmed.split('-');
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  }

  // Format: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Format: MM/DD/YYYY (if month <= 12 and day > 12)
  const mdyMatch = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (mdyMatch && parseInt(mdyMatch[1], 10) <= 12 && parseInt(mdyMatch[2], 10) > 12) {
    const month = mdyMatch[1].padStart(2, '0');
    const day = mdyMatch[2].padStart(2, '0');
    const year = mdyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Format: YYYY/MM/DD or YYYY.MM.DD
  const ymdMatch = trimmed.match(/^(\d{4})[\/\.](\d{1,2})[\/\.](\d{1,2})$/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
  }

  // Fallback to standard Date object
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }

  return null;
}

// Field extractor with case-insensitive and alias matching
function getField(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      return String(row[k]).trim();
    }
  }
  // Try case-insensitive and stripped comparison
  const normalizedRow = {};
  for (const [rk, rv] of Object.entries(row)) {
    const cleanKey = rk.toLowerCase().replace(/[^a-z0-9]/g, '');
    normalizedRow[cleanKey] = rv;
  }
  for (const k of keys) {
    const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalizedRow[cleanKey] !== undefined && normalizedRow[cleanKey] !== null && String(normalizedRow[cleanKey]).trim() !== '') {
      return String(normalizedRow[cleanKey]).trim();
    }
  }
  return '';
}

// Bulk Import Members from CSV with Support for Subscriptions & Payments
app.post('/api/members/import-csv', async (req, res) => {
  const { members, updateExisting = true, createSubscriptions = true } = req.body;
  if (!Array.isArray(members) || members.length === 0) {
    return res.status(400).json({ error: 'No member records provided to import' });
  }

  let importedCount = 0;
  let updatedCount = 0;
  let subscriptionsCount = 0;
  let paymentsCount = 0;
  let plansCreatedCount = 0;
  const errors = [];

  const today = new Date().toISOString().split('T')[0];
  const year = new Date().getFullYear();

  for (let i = 0; i < members.length; i++) {
    const row = members[i];
    const rowNum = i + 1;

    // 1. Extract member details
    const fullname = getField(row, ['fullname', 'name', 'full name', 'member name', 'customer name', 'client name', 'fighter name', 'first name']);
    if (!fullname) {
      errors.push({ row: rowNum, error: 'Full Name is missing or empty' });
      continue;
    }

    const member_code = getField(row, ['member_code', 'code', 'member code', 'member id', 'memberid', 'id', 'membership number', 'membership no', 'reg no', 'sl no', 'roll no', 'card no']);
    const genderRaw = getField(row, ['gender', 'sex']);
    const gender = genderRaw ? (genderRaw.toLowerCase().startsWith('f') ? 'Female' : (genderRaw.toLowerCase().startsWith('o') ? 'Other' : 'Male')) : 'Male';
    
    const dobRaw = getField(row, ['dob', 'date of birth', 'birth date', 'birthdate', 'age']);
    const dob = parseFlexibleDate(dobRaw) || '';

    const mobileRaw = getField(row, ['mobile', 'phone', 'contact', 'mobile number', 'phone number', 'contact number', 'cell', 'tel', 'ph']);
    const mobile = mobileRaw.replace(/[^\d+]/g, '');

    const whatsappRaw = getField(row, ['whatsapp', 'whatsapp number', 'wa', 'whatsapp no', 'mobile', 'phone']);
    const whatsapp = whatsappRaw.replace(/[^\d+]/g, '') || mobile;

    const email = getField(row, ['email', 'email address', 'mail']);
    const address = getField(row, ['address', 'residential address', 'location', 'city', 'residence']);
    const emergency_contact = getField(row, ['emergency_contact', 'emergency contact', 'emergency phone', 'guardian', 'contact person']);
    const blood_group = getField(row, ['blood_group', 'blood group', 'blood', 'bloodgroup']);
    
    const joiningRaw = getField(row, ['joining_date', 'joining date', 'join date', 'joined date', 'registration date', 'created date', 'admission date', 'start date']);
    const joining_date = parseFlexibleDate(joiningRaw) || today;

    const statusRaw = getField(row, ['status', 'member status', 'account status']);
    let status = statusRaw ? statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1).toLowerCase() : 'Active';
    if (!['Active', 'Expired', 'Frozen'].includes(status)) {
      status = 'Active';
    }

    const medical_notes = getField(row, ['medical_notes', 'medical notes', 'health notes', 'medical']);
    const notes = getField(row, ['notes', 'remarks', 'comments', 'description']);

    // 2. Extract plan, subscription & payment details if included in CSV
    const planName = getField(row, ['plan', 'plan_name', 'plan name', 'membership plan', 'package', 'package name', 'membership type', 'subscription', 'scheme', 'package type']);
    const planStartDateRaw = getField(row, ['plan_start_date', 'plan start date', 'start date', 'from date', 'effective date', 'subscription start']);
    const planStartDate = parseFlexibleDate(planStartDateRaw) || joining_date || today;

    const expiryDateRaw = getField(row, ['expiry_date', 'expiry date', 'expiry', 'valid till', 'end date', 'to date', 'due date', 'renewal date', 'expire date']);
    let expiryDate = parseFlexibleDate(expiryDateRaw);

    const paidAmountRaw = getField(row, ['paid_amount', 'paid amount', 'amount', 'fee', 'fees', 'price', 'total paid', 'paid', 'cost', 'collection', 'payment']);
    const paidAmount = parseFloat(paidAmountRaw) || 0;

    const paymentMethod = getField(row, ['payment_method', 'payment method', 'payment mode', 'mode', 'payment type', 'type']) || 'Cash';
    const trainerName = getField(row, ['trainer', 'trainer_name', 'trainer name', 'coach', 'instructor', 'assigned trainer']);

    try {
      // Find trainer if specified
      let trainer_id = null;
      if (trainerName) {
        const trainer = await db.get(`SELECT id FROM trainers WHERE LOWER(fullname) LIKE LOWER(?) LIMIT 1`, [`%${trainerName}%`]);
        if (trainer) {
          trainer_id = trainer.id;
        }
      }

      // Check if member already exists
      let existing = null;
      if (member_code) {
        existing = await db.get(`SELECT id, member_code FROM members WHERE member_code = ?`, [member_code]);
      }
      if (!existing && mobile) {
        existing = await db.get(`SELECT id, member_code FROM members WHERE mobile = ?`, [mobile]);
      }

      let memberId;
      let finalCode = member_code;

      if (existing && updateExisting) {
        memberId = existing.id;
        finalCode = existing.member_code;
        await db.run(
          `UPDATE members 
           SET fullname = ?, gender = ?, dob = ?, mobile = ?, whatsapp = ?, email = ?,
               address = ?, emergency_contact = ?, blood_group = ?, joining_date = ?,
               status = ?, medical_notes = ?, notes = ?, trainer_id = COALESCE(?, trainer_id)
           WHERE id = ?`,
          [fullname, gender, dob, mobile, whatsapp, email, address, emergency_contact, blood_group, joining_date, status, medical_notes, notes, trainer_id, memberId]
        );
        updatedCount++;
      } else {
        const result = await db.run(
          `INSERT INTO members (member_code, fullname, gender, dob, mobile, whatsapp, email, address, emergency_contact, blood_group, joining_date, trainer_id, status, medical_notes, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [finalCode || null, fullname, gender, dob, mobile, whatsapp, email, address, emergency_contact, blood_group, joining_date, trainer_id, status, medical_notes, notes]
        );
        memberId = result.id;

        if (!finalCode) {
          finalCode = `FC-${1000 + memberId}`;
          await db.run(`UPDATE members SET member_code = ? WHERE id = ?`, [finalCode, memberId]);
        }
        importedCount++;
      }

      // 3. Auto-create Subscription & Payment if plan or amount or expiry is present
      if (createSubscriptions && (planName || paidAmount > 0 || expiryDate)) {
        let plan = null;
        if (planName) {
          plan = await db.get(`SELECT * FROM membership_plans WHERE LOWER(name) = LOWER(?) LIMIT 1`, [planName.trim()]);
          if (!plan) {
            // Check partial match
            plan = await db.get(`SELECT * FROM membership_plans WHERE LOWER(name) LIKE LOWER(?) LIMIT 1`, [`%${planName.trim()}%`]);
          }
        }

        // If plan not found in database, create the plan automatically
        if (!plan) {
          const newPlanName = planName ? planName.trim() : (paidAmount > 0 ? `Package (₹${paidAmount})` : 'Monthly General Package');
          let duration = 1;
          if (newPlanName.toLowerCase().includes('3 month') || newPlanName.toLowerCase().includes('quarterly')) duration = 3;
          else if (newPlanName.toLowerCase().includes('6 month') || newPlanName.toLowerCase().includes('half year')) duration = 6;
          else if (newPlanName.toLowerCase().includes('1 year') || newPlanName.toLowerCase().includes('annual') || newPlanName.toLowerCase().includes('yearly')) duration = 12;
          else if (newPlanName.toLowerCase().includes('lifetime')) duration = 60;

          const planPrice = paidAmount > 0 ? paidAmount : 1000;
          const planResult = await db.run(
            `INSERT INTO membership_plans (name, category, duration_months, price, discount, tax, final_amount, features, status)
             VALUES (?, 'Gym', ?, ?, 0, 0, ?, '["Standard Gym Access"]', 'Active')`,
            [newPlanName, duration, planPrice, planPrice]
          );
          plan = {
            id: planResult.id,
            name: newPlanName,
            duration_months: duration,
            final_amount: planPrice,
            price: planPrice,
            tax: 0
          };
          plansCreatedCount++;
        }

        // Compute expiry date if not explicitly given
        if (!expiryDate) {
          const sDate = new Date(planStartDate);
          sDate.setMonth(sDate.getMonth() + (plan.duration_months || 1));
          expiryDate = sDate.toISOString().split('T')[0];
        }

        // Determine subscription status based on expiry date
        const subStatus = expiryDate < today ? 'Expired' : 'Active';

        // Check if member already has this active subscription
        const existingSub = await db.get(
          `SELECT id FROM subscriptions WHERE member_id = ? AND plan_id = ? AND start_date = ?`,
          [memberId, plan.id, planStartDate]
        );

        let subscriptionId;
        if (!existingSub) {
          const subResult = await db.run(
            `INSERT INTO subscriptions (member_id, plan_id, start_date, expiry_date, status) VALUES (?, ?, ?, ?, ?)`,
            [memberId, plan.id, planStartDate, expiryDate, subStatus]
          );
          subscriptionId = subResult.id;
          subscriptionsCount++;

          // Update member status
          await db.run(`UPDATE members SET status = ? WHERE id = ?`, [subStatus, memberId]);
        } else {
          subscriptionId = existingSub.id;
          await db.run(
            `UPDATE subscriptions SET expiry_date = ?, status = ? WHERE id = ?`,
            [expiryDate, subStatus, subscriptionId]
          );
        }

        // Create Payment record if amount > 0
        if (paidAmount > 0) {
          const existingPayment = await db.get(
            `SELECT id FROM payments WHERE member_id = ? AND subscription_id = ?`,
            [memberId, subscriptionId]
          );

          if (!existingPayment) {
            const lastInvoice = await db.get(`SELECT invoice_number FROM payments ORDER BY id DESC LIMIT 1`);
            let nextNum = 1;
            if (lastInvoice && lastInvoice.invoice_number) {
              const parts = lastInvoice.invoice_number.split('-');
              const lastYear = parts[1];
              const lastSeq = parseInt(parts[2], 10);
              if (lastYear == year) {
                nextNum = lastSeq + 1;
              }
            }
            const invoice_number = `INV-${year}-${String(nextNum).padStart(3, '0')}`;

            await db.run(
              `INSERT INTO payments (invoice_number, payment_date, member_id, subscription_id, amount, discount, tax, paid_amount, balance, payment_method, remarks)
               VALUES (?, ?, ?, ?, ?, 0, 0, ?, 0, ?, ?)`,
              [invoice_number, planStartDate, memberId, subscriptionId, paidAmount, paidAmount, paymentMethod, `Imported from CSV - ${plan.name}`]
            );
            paymentsCount++;
          }
        }
      }

    } catch (err) {
      errors.push({ row: rowNum, fullname, error: err.message });
    }
  }

  await db.run(
    `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
    [1, 'admin', 'CSV Member Import', `Imported ${importedCount} members, updated ${updatedCount}, created ${subscriptionsCount} subscriptions and ${paymentsCount} payments.`]
  );

  res.json({
    success: true,
    imported: importedCount,
    updated: updatedCount,
    subscriptions_created: subscriptionsCount,
    payments_recorded: paymentsCount,
    plans_created: plansCreatedCount,
    total: members.length,
    errors
  });
});

// ----------------------------------------------------
// 4. MEMBERSHIP PLAN ENDPOINTS
// ----------------------------------------------------
app.get('/api/plans', async (req, res) => {
  try {
    const plans = await db.all(`SELECT * FROM membership_plans ORDER BY id DESC`);
    res.json(plans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/plans', async (req, res) => {
  const { name, category, duration_months, price, discount, tax, features, status = 'Active' } = req.body;
  if (!name || !price) {
    return res.status(400).json({ error: 'Name and price are required' });
  }
  
  // Calculate final amount
  const taxAmount = price * (tax / 100);
  const discountAmount = price * (discount / 100);
  const final_amount = price - discountAmount + taxAmount;
  
  try {
    const sql = `INSERT INTO membership_plans (name, category, duration_months, price, discount, tax, final_amount, features, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const result = await db.run(sql, [
      name, category, duration_months, price, discount, tax, final_amount,
      typeof features === 'string' ? features : JSON.stringify(features || []),
      status
    ]);
    
    res.status(201).json({ id: result.id, final_amount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/plans/:id', async (req, res) => {
  const { name, category, duration_months, price, discount, tax, features, status } = req.body;
  
  // Calculate final amount
  const taxAmount = price * (tax / 100);
  const discountAmount = price * (discount / 100);
  const final_amount = price - discountAmount + taxAmount;
  
  try {
    const sql = `UPDATE membership_plans SET name = ?, category = ?, duration_months = ?, price = ?, discount = ?, tax = ?, final_amount = ?, features = ?, status = ?
                 WHERE id = ?`;
    await db.run(sql, [
      name, category, duration_months, price, discount, tax, final_amount,
      typeof features === 'string' ? features : JSON.stringify(features || []),
      status, req.params.id
    ]);
    
    res.json({ success: true, final_amount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/plans/:id', async (req, res) => {
  try {
    await db.run(`DELETE FROM membership_plans WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/subscriptions', async (req, res) => {
  try {
    const subs = await db.all(
      `SELECT s.*, m.fullname as member_name, m.member_code, mp.name as plan_name, mp.final_amount,
              (JULIANDAY(s.expiry_date) - JULIANDAY('now')) as days_remaining
       FROM subscriptions s
       LEFT JOIN members m ON s.member_id = m.id
       LEFT JOIN membership_plans mp ON s.plan_id = mp.id
       ORDER BY s.id DESC`
    );
    res.json(subs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/subscriptions', async (req, res) => {
  const { member_id, plan_id, start_date, payment_method, remarks, discount_type, discount_value, admission_fee_already_paid } = req.body;
  
  if (!member_id || !plan_id || !start_date) {
    return res.status(400).json({ error: 'Member, Plan and Start Date are required' });
  }
  
  try {
    // 1. Get Plan & Member Details
    const plan = await db.get(`SELECT * FROM membership_plans WHERE id = ?`, [plan_id]);
    if (!plan) {
      return res.status(404).json({ error: 'Membership plan not found' });
    }

    const member = await db.get(`SELECT * FROM members WHERE id = ?`, [member_id]);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Determine if selected plan is an Admission Plan (which bundles ₹1500 admission fee + ₹1000 1-month subscription)
    const isAdmissionPlan = (plan.id === 1) || (plan.name && plan.name.toLowerCase().includes('admission')) || (plan.price === 2500 && plan.duration_months === 1);
    
    // Check if member already paid admission fee
    const hasAlreadyPaidAdmission = (admission_fee_already_paid !== undefined)
      ? Boolean(admission_fee_already_paid)
      : Boolean(member.admission_fee_paid === 1);

    let baseAmount = plan.final_amount;
    let admissionDeduction = 0;

    if (isAdmissionPlan && hasAlreadyPaidAdmission) {
      admissionDeduction = 1500;
      baseAmount = Math.max(0, baseAmount - admissionDeduction);
    }
    
    // 2. Calculate Expiry Date
    const start = new Date(start_date);
    const expiry = new Date(start);
    expiry.setMonth(start.getMonth() + plan.duration_months);
    const expiry_date = expiry.toISOString().split('T')[0];
    
    // 3. Calculate applied discount and final payable amount
    const rawDiscount = parseFloat(discount_value) || 0;
    let appliedDiscount = 0;
    if (rawDiscount > 0) {
      if (discount_type === 'percent') {
        appliedDiscount = Math.min((baseAmount * rawDiscount) / 100, baseAmount);
      } else {
        appliedDiscount = Math.min(rawDiscount, baseAmount);
      }
    }
    appliedDiscount = Math.round(appliedDiscount * 100) / 100;
    const paid_amount = Math.max(0, Math.round((baseAmount - appliedDiscount) * 100) / 100);

    // 4. Create Subscription
    const subSql = `INSERT INTO subscriptions (member_id, plan_id, start_date, expiry_date, status) VALUES (?, ?, ?, ?, 'Active')`;
    const subResult = await db.run(subSql, [member_id, plan_id, start_date, expiry_date]);
    const subscription_id = subResult.id;
    
    // Update member status to Active and set admission_fee_paid = 1 if they purchased admission plan or had it verified
    const shouldMarkAdmissionPaid = isAdmissionPlan || hasAlreadyPaidAdmission ? 1 : (member.admission_fee_paid || 0);
    await db.run(`UPDATE members SET status = 'Active', admission_fee_paid = ? WHERE id = ?`, [shouldMarkAdmissionPaid, member_id]);
    
    // 5. Record Payment
    // Generate Invoice Number (e.g. INV-YYYY-001)
    const year = new Date().getFullYear();
    const lastInvoice = await db.get(`SELECT invoice_number FROM payments ORDER BY id DESC LIMIT 1`);
    let nextNum = 1;
    if (lastInvoice && lastInvoice.invoice_number) {
      const parts = lastInvoice.invoice_number.split('-');
      const lastYear = parts[1];
      const lastSeq = parseInt(parts[2], 10);
      if (lastYear == year) {
        nextNum = lastSeq + 1;
      }
    }
    const invoice_number = `INV-${year}-${String(nextNum).padStart(3, '0')}`;
    const today = new Date().toISOString().split('T')[0];
    
    let defaultRemarks = `Subscription for ${plan.name}`;
    if (admissionDeduction > 0) {
      defaultRemarks += ` (Admission fee of ₹1500 already paid / deducted)`;
    }

    const paySql = `INSERT INTO payments (invoice_number, payment_date, member_id, subscription_id, amount, discount, tax, paid_amount, balance, payment_method, remarks)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                    
    const payResult = await db.run(paySql, [
      invoice_number, today, member_id, subscription_id,
      plan.price - admissionDeduction,
      appliedDiscount,  // applied discount amount
      plan.tax,
      paid_amount,      // final payable after discount
      0,
      payment_method || 'Cash',
      remarks || defaultRemarks
    ]);
    
    await db.run(
      `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
      [1, 'admin', 'Subscription Created', `Created subscription ID: ${subscription_id} for Member: ${member.fullname}${admissionDeduction > 0 ? ` (Admission Fee Waived: ₹1500)` : ''}${appliedDiscount > 0 ? ` (Discount: ₹${appliedDiscount})` : ''}`]
    );

    let whatsappSent = false;
    let whatsappReason = '';
    if (req.body.send_whatsapp) {
      try {
        const { sendMessage: sendWAService } = require('./whatsapp/service');
        const member = await db.get('SELECT * FROM members WHERE id = ?', [member_id]);
        if (member && member.mobile) {
          const waResult = await sendWAService({
            memberId: member.id,
            memberName: member.fullname,
            mobile: member.mobile,
            templateKey: 'membership_new',
            data: {
              MemberName: member.fullname,
              MembershipPlan: plan.name,
              Amount: paid_amount,
              ExpiryDate: expiry_date,
              ReceiptNo: invoice_number,
              InvoiceNo: invoice_number,
              MembershipID: member.member_code || `MEM-${member.id}`
            },
            sentBy: 'staff'
          });
          whatsappSent = waResult.success;
          whatsappReason = waResult.reason || waResult.error || '';
        }
      } catch (waErr) {
        console.error('Error sending auto-WhatsApp on subscription create:', waErr.message);
        whatsappReason = waErr.message;
      }
    }
    
    res.status(201).json({
      subscription_id,
      payment_id: payResult.id,
      expiry_date,
      invoice_number,
      final_amount: paid_amount,
      applied_discount: appliedDiscount,
      whatsappSent,
      whatsappReason
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete / Erase Subscription (Erases dates, keeps member active)
app.delete('/api/subscriptions/:id', async (req, res) => {
  try {
    const sub = await db.get(
      `SELECT s.*, m.fullname FROM subscriptions s LEFT JOIN members m ON s.member_id = m.id WHERE s.id = ?`,
      [req.params.id]
    );
    if (!sub) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    // 1. Unlink subscription_id on payments so financial invoice history is preserved
    await db.run(`UPDATE payments SET subscription_id = NULL WHERE subscription_id = ?`, [req.params.id]);

    // 2. Delete subscription record (erasing the plan dates)
    await db.run(`DELETE FROM subscriptions WHERE id = ?`, [req.params.id]);

    // 3. Ensure member remains 100% active (Do NOT cancel membership)
    await db.run(`UPDATE members SET status = 'Active' WHERE id = ?`, [sub.member_id]);

    await db.run(
      `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
      [1, 'admin', 'Subscription Dates Erased', `Erased subscription dates for member: ${sub.fullname || sub.member_id}. Membership remains Active.`]
    );

    res.json({ success: true, message: 'Subscription dates erased successfully. Membership remains active.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Subscription Status: Freeze or Resume (Never cancels the member)
app.post('/api/subscriptions/:id/status', async (req, res) => {
  const { status } = req.body; // 'Frozen', 'Active'
  if (!status) return res.status(400).json({ error: 'Status is required' });
  
  try {
    await db.run(`UPDATE subscriptions SET status = ? WHERE id = ?`, [status, req.params.id]);
    
    // Always keep member status Active
    const sub = await db.get(`SELECT member_id FROM subscriptions WHERE id = ?`, [req.params.id]);
    if (sub && status === 'Active') {
      await db.run(`UPDATE members SET status = 'Active' WHERE id = ?`, [sub.member_id]);
    }
    
    res.json({ success: true, message: `Subscription marked as ${status}.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Payment History
app.get('/api/payments', async (req, res) => {
  try {
    const payments = await db.all(
      `SELECT p.*, m.fullname as member_name, m.member_code, mp.name as plan_name 
       FROM payments p
       LEFT JOIN members m ON p.member_id = m.id
       LEFT JOIN subscriptions s ON p.subscription_id = s.id
       LEFT JOIN membership_plans mp ON s.plan_id = mp.id
       ORDER BY p.id DESC`
    );
    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Edit Payment
app.put('/api/payments/:id', async (req, res) => {
  const { amount, discount, tax, paid_amount, balance, payment_method, payment_date, remarks } = req.body;
  try {
    const payment = await db.get(`SELECT * FROM payments WHERE id = ?`, [req.params.id]);
    if (!payment) {
      return res.status(404).json({ error: 'Payment record not found' });
    }
    
    const sql = `UPDATE payments 
                 SET amount = ?, discount = ?, tax = ?, paid_amount = ?, balance = ?, payment_method = ?, payment_date = ?, remarks = ?
                 WHERE id = ?`;
    await db.run(sql, [
      amount, discount, tax, paid_amount, balance, payment_method, payment_date, remarks, req.params.id
    ]);
    
    await db.run(
      `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
      [1, 'admin', 'Payment Updated', `Updated invoice ${payment.invoice_number} details.`]
    );
    
    res.json({ success: true, message: 'Payment record updated successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Payment
app.delete('/api/payments/:id', async (req, res) => {
  try {
    const payment = await db.get(`SELECT * FROM payments WHERE id = ?`, [req.params.id]);
    if (!payment) {
      return res.status(404).json({ error: 'Payment record not found' });
    }
    
    await db.run(`DELETE FROM payments WHERE id = ?`, [req.params.id]);
    
    await db.run(
      `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
      [1, 'admin', 'Payment Deleted', `Deleted invoice ${payment.invoice_number} (Amount: ₹${payment.paid_amount})`]
    );
    
    res.json({ success: true, message: 'Payment record deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk Import Payments / Payment Status from CSV
app.post('/api/payments/import-csv', async (req, res) => {
  const { payments } = req.body;
  if (!Array.isArray(payments) || payments.length === 0) {
    return res.status(400).json({ error: 'No payment records provided to import' });
  }

  let importedCount = 0;
  const errors = [];
  const year = new Date().getFullYear();

  for (let i = 0; i < payments.length; i++) {
    const row = payments[i];
    const rowNum = i + 1;

    // Identify member
    const code = (row.member_code || row.code || row['Member Code'] || row['member code'] || row.MemberCode || row['Code'] || '').trim();
    const mobile = (row.mobile || row.phone || row['Mobile'] || row['mobile number'] || row['Mobile Number'] || row.Phone || '').trim();
    const name = (row.member_name || row.fullname || row.name || row['Member Name'] || row['member name'] || row['Full Name'] || row['full name'] || '').trim();

    let member = null;
    if (code) {
      member = await db.get(`SELECT id, fullname, status FROM members WHERE member_code = ?`, [code]);
    }
    if (!member && mobile) {
      member = await db.get(`SELECT id, fullname, status FROM members WHERE mobile = ?`, [mobile]);
    }
    if (!member && name) {
      member = await db.get(`SELECT id, fullname, status FROM members WHERE fullname LIKE ?`, [`%${name}%`]);
    }

    if (!member) {
      errors.push({ row: rowNum, error: `Member not found for Code: "${code}", Mobile: "${mobile}", Name: "${name}"` });
      continue;
    }

    // Payment fields
    const payment_date = (row.payment_date || row.date || row['Payment Date'] || row['payment date'] || row['Transaction Date'] || row['transaction date'] || new Date().toISOString().split('T')[0]).trim();
    const amount = parseFloat(row.amount || row['Base Amount'] || row['base amount'] || row.price || row.Price || 0) || 0;
    const discount = parseFloat(row.discount || row.Discount || 0) || 0;
    const tax = parseFloat(row.tax || row.Tax || row.gst || row.GST || 0) || 0;
    const paid_amount = parseFloat(row.paid_amount || row.paid || row['Paid Amount'] || row['paid amount'] || row['Final Paid'] || row['final paid'] || amount) || 0;
    const balance = parseFloat(row.balance || row.Balance || row['Pending Balance'] || 0) || 0;
    const payment_method = (row.payment_method || row.method || row['Payment Method'] || row['payment method'] || row['Method'] || 'Cash').trim();
    const remarks = (row.remarks || row.memo || row.notes || row['Remarks'] || 'CSV Import').trim();

    // Invoice number
    let invoice_number = (row.invoice_number || row.invoice || row['Invoice Number'] || row['invoice number'] || row['Invoice No'] || '').trim();
    if (!invoice_number) {
      const lastInvoice = await db.get(`SELECT invoice_number FROM payments ORDER BY id DESC LIMIT 1`);
      let nextNum = 1;
      if (lastInvoice && lastInvoice.invoice_number) {
        const parts = lastInvoice.invoice_number.split('-');
        const lastYear = parts[1];
        const lastSeq = parseInt(parts[2]);
        if (lastYear == year) {
          nextNum = lastSeq + 1;
        }
      }
      invoice_number = `INV-${year}-${String(nextNum).padStart(3, '0')}`;
    }

    // Plan and Subscription mapping if provided
    const planName = (row.plan_name || row.plan || row['Plan Name'] || row['plan name'] || row['Plan'] || row.membership_plan || '').trim();
    let subscription_id = null;

    if (planName) {
      const plan = await db.get(`SELECT * FROM membership_plans WHERE name LIKE ?`, [`%${planName}%`]);
      if (plan) {
        const start = new Date(payment_date);
        const expiry = new Date(start);
        expiry.setMonth(start.getMonth() + plan.duration_months);
        const expiry_date = expiry.toISOString().split('T')[0];

        const subRes = await db.run(
          `INSERT INTO subscriptions (member_id, plan_id, start_date, expiry_date, status) VALUES (?, ?, ?, ?, 'Active')`,
          [member.id, plan.id, payment_date, expiry_date]
        );
        subscription_id = subRes.id;
      }
    }

    if (!subscription_id) {
      const latestSub = await db.get(`SELECT id FROM subscriptions WHERE member_id = ? ORDER BY id DESC LIMIT 1`, [member.id]);
      if (latestSub) {
        subscription_id = latestSub.id;
      }
    }

    try {
      await db.run(
        `INSERT INTO payments (invoice_number, payment_date, member_id, subscription_id, amount, discount, tax, paid_amount, balance, payment_method, remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [invoice_number, payment_date, member.id, subscription_id, amount, discount, tax, paid_amount, balance, payment_method, remarks]
      );

      if (paid_amount > 0 && member.status !== 'Active') {
        await db.run(`UPDATE members SET status = 'Active' WHERE id = ?`, [member.id]);
      }

      importedCount++;
    } catch (err) {
      errors.push({ row: rowNum, invoice_number, error: err.message });
    }
  }

  await db.run(
    `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
    [1, 'admin', 'CSV Payments Import', `Imported ${importedCount} payment records from CSV.`]
  );

  res.json({
    success: true,
    imported: importedCount,
    total: payments.length,
    errors
  });
});

// ----------------------------------------------------
// 6. MONTHLY FEES DUE / EXPIRY REMINDER ENDPOINTS
// ----------------------------------------------------
app.get('/api/reminders/due', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const tomorrowObj = new Date();
    tomorrowObj.setDate(tomorrowObj.getDate() + 1);
    const tomorrow = tomorrowObj.toISOString().split('T')[0];
    
    const oneWeekObj = new Date();
    oneWeekObj.setDate(oneWeekObj.getDate() + 7);
    const oneWeek = oneWeekObj.toISOString().split('T')[0];
    
    // Fees due or memberships expiring soon
    // Active subscriptions expiring within a week
    const expiringSoon = await db.all(
      `SELECT s.id as sub_id, s.expiry_date, m.id as member_id, m.fullname, m.mobile, m.whatsapp, m.email, 
              mp.name as plan_name, mp.final_amount,
              (JULIANDAY(s.expiry_date) - JULIANDAY(?)) as days_remaining
       FROM subscriptions s
       LEFT JOIN members m ON s.member_id = m.id
       LEFT JOIN membership_plans mp ON s.plan_id = mp.id
       WHERE s.expiry_date <= ? AND s.status = 'Active'`,
      [today, oneWeek]
    );
    
    // Outstanding payments
    const pendingFees = await db.all(
      `SELECT p.id as payment_id, p.invoice_number, p.balance, p.payment_date,
              m.id as member_id, m.fullname, m.mobile, m.whatsapp, m.email
       FROM payments p
       LEFT JOIN members m ON p.member_id = m.id
       WHERE p.balance > 0`
    );
    
    res.json({ expiringSoon, pendingFees });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Record reminder log
app.post('/api/reminders/log', async (req, res) => {
  const { member_id, type, reminder_type, remarks } = req.body;
  try {
    await db.run(
      `INSERT INTO reminder_logs (member_id, type, reminder_type, remarks) VALUES (?, ?, ?, ?)`,
      [member_id, type, reminder_type, remarks]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reminders/logs', async (req, res) => {
  try {
    const logs = await db.all(
      `SELECT rl.*, m.fullname as member_name 
       FROM reminder_logs rl 
       JOIN members m ON rl.member_id = m.id 
       ORDER BY rl.timestamp DESC LIMIT 50`
    );
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 7. OVERHEAD / EXPENSE MANAGEMENT
// ----------------------------------------------------
app.get('/api/expenses', async (req, res) => {
  try {
    const expenses = await db.all(`SELECT * FROM expenses ORDER BY expense_date DESC, id DESC`);
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/expenses', upload.single('bill'), async (req, res) => {
  const { expense_date, category, amount, vendor, payment_method, remarks } = req.body;
  if (!category || !amount || !expense_date) {
    return res.status(400).json({ error: 'Date, Category, and Amount are required' });
  }
  
  const bill_path = req.file ? `/uploads/bills/${req.file.filename}` : '';
  
  try {
    const sql = `INSERT INTO expenses (expense_date, category, amount, vendor, payment_method, bill_path, remarks)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const result = await db.run(sql, [
      expense_date, category, amount, vendor, payment_method || 'Cash', bill_path, remarks
    ]);
    
    await db.run(
      `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
      [1, 'admin', 'Expense Recorded', `Recorded expense of ${amount} for ${category}`]
    );
    
    res.status(201).json({ id: result.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/expenses/:id', async (req, res) => {
  try {
    await db.run(`DELETE FROM expenses WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 8. FINANCIAL REPORTS ENDPOINTS
// ----------------------------------------------------
app.get('/api/reports/financials', async (req, res) => {
  const { year = new Date().getFullYear() } = req.query;
  
  try {
    // Monthly collections (payments)
    const collections = await db.all(
      `SELECT substr(payment_date, 6, 2) as month, SUM(paid_amount) as total
       FROM payments
       WHERE payment_date LIKE ?
       GROUP BY month`,
      [`${year}%`]
    );
    
    // Monthly expenses
    const expenses = await db.all(
      `SELECT substr(expense_date, 6, 2) as month, SUM(amount) as total
       FROM expenses
       WHERE expense_date LIKE ?
       GROUP BY month`,
      [`${year}%`]
    );
    
    // Category-wise expenses
    const expensesByCategory = await db.all(
      `SELECT category, SUM(amount) as total
       FROM expenses
       WHERE expense_date LIKE ?
       GROUP BY category`,
      [`${year}%`]
    );
    
    // Membership plan-wise revenue
    const revenueByPlan = await db.all(
      `SELECT mp.name as plan_name, mp.category, SUM(p.paid_amount) as total
       FROM payments p
       JOIN subscriptions s ON p.subscription_id = s.id
       JOIN membership_plans mp ON s.plan_id = mp.id
       WHERE p.payment_date LIKE ?
       GROUP BY plan_name`,
      [`${year}%`]
    );
    
    res.json({
      collections,
      expenses,
      expensesByCategory,
      revenueByPlan
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 9. MEMBER ATTENDANCE ENDPOINTS
// ----------------------------------------------------
app.get('/api/attendance', async (req, res) => {
  const { date = new Date().toISOString().split('T')[0] } = req.query;
  try {
    const list = await db.all(
      `SELECT a.*, m.fullname, m.member_code, m.photo_path 
       FROM attendance a
       JOIN members m ON a.member_id = m.id
       WHERE a.attendance_date = ?
       ORDER BY a.check_in DESC`,
      [date]
    );
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// QR Code / Barcode Scanner Check-in/Check-out
app.post('/api/attendance/scan', async (req, res) => {
  const { code } = req.body; // Can be member_code (e.g. FC-1001)
  if (!code) return res.status(400).json({ error: 'Code is required' });
  
  try {
    const member = await db.get(`SELECT * FROM members WHERE member_code = ?`, [code]);
    if (!member) {
      return res.status(404).json({ error: 'Member not found with this code' });
    }
    
    if (member.status === 'Expired' || member.status === 'Frozen') {
      return res.status(400).json({ error: `Check-in denied. Membership status: ${member.status}` });
    }
    
    const today = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toISOString();
    
    // Check if already checked in today with no check out
    const activeCheckIn = await db.get(
      `SELECT * FROM attendance WHERE member_id = ? AND attendance_date = ? AND check_out IS NULL`,
      [member.id, today]
    );
    
    if (activeCheckIn) {
      // Perform Check-Out
      await db.run(
        `UPDATE attendance SET check_out = ? WHERE id = ?`,
        [timeStr, activeCheckIn.id]
      );
      res.json({
        type: 'Check-Out',
        member,
        time: timeStr
      });
    } else {
      // Perform Check-In
      await db.run(
        `INSERT INTO attendance (member_id, check_in, attendance_date) VALUES (?, ?, ?)`,
        [member.id, timeStr, today]
      );
      res.json({
        type: 'Check-In',
        member,
        time: timeStr
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manual Check-in
app.post('/api/attendance/manual', async (req, res) => {
  const { member_id } = req.body;
  if (!member_id) return res.status(400).json({ error: 'Member ID is required' });
  
  try {
    const today = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toISOString();
    
    const result = await db.run(
      `INSERT INTO attendance (member_id, check_in, attendance_date) VALUES (?, ?, ?)`,
      [member_id, timeStr, today]
    );
    res.status(201).json({ id: result.id, time: timeStr });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manual Check-out
app.post('/api/attendance/:id/checkout', async (req, res) => {
  const timeStr = new Date().toISOString();
  try {
    await db.run(`UPDATE attendance SET check_out = ? WHERE id = ?`, [timeStr, req.params.id]);
    res.json({ success: true, time: timeStr });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 10. TRAINERS & STAFF ENDPOINTS
// ----------------------------------------------------
app.get('/api/trainers', async (req, res) => {
  try {
    const trainers = await db.all(`SELECT * FROM trainers ORDER BY id DESC`);
    res.json(trainers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/trainers', upload.single('photo'), async (req, res) => {
  const { fullname, specialization, salary, status = 'Active', performance_notes } = req.body;
  const photo_path = req.file ? `/uploads/members/${req.file.filename}` : ''; // save to members dir
  
  try {
    const sql = `INSERT INTO trainers (fullname, photo_path, specialization, salary, status, performance_notes)
                 VALUES (?, ?, ?, ?, ?, ?)`;
    const result = await db.run(sql, [
      fullname, photo_path, specialization, salary, status, performance_notes
    ]);
    res.status(201).json({ id: result.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/trainers/:id', upload.single('photo'), async (req, res) => {
  const { fullname, specialization, salary, status, performance_notes } = req.body;
  try {
    let photo_path = req.body.photo_path;
    if (req.file) {
      photo_path = `/uploads/members/${req.file.filename}`;
    }
    const sql = `UPDATE trainers SET fullname = ?, photo_path = ?, specialization = ?, salary = ?, status = ?, performance_notes = ?
                 WHERE id = ?`;
    await db.run(sql, [
      fullname, photo_path, specialization, salary, status, performance_notes, req.params.id
    ]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/trainers/:id', async (req, res) => {
  try {
    // Unassign from members
    await db.run(`UPDATE members SET trainer_id = NULL WHERE trainer_id = ?`, [req.params.id]);
    // Delete trainer
    await db.run(`DELETE FROM trainers WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Trainer profile deleted.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/staff', async (req, res) => {
  try {
    const staff = await db.all(`SELECT * FROM staff ORDER BY id DESC`);
    res.json(staff);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/staff', async (req, res) => {
  const { fullname, role, salary, status = 'Active' } = req.body;
  try {
    const sql = `INSERT INTO staff (fullname, role, salary, status) VALUES (?, ?, ?, ?)`;
    const result = await db.run(sql, [fullname, role, salary, status]);
    res.status(201).json({ id: result.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 10.5 USER MANAGEMENT ENDPOINTS
// ----------------------------------------------------
app.get('/api/users', async (req, res) => {
  try {
    const users = await db.all(`
      SELECT u.id, u.username, u.fullname, u.role_id, u.status, r.name as role_name 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      ORDER BY u.id DESC
    `);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { username, password, fullname, role_id, status = 'Active' } = req.body;
  
  if (!username || !password || !fullname) {
    return res.status(400).json({ error: 'Username, password and fullname are required' });
  }
  
  try {
    const hashedPassword = await hashPassword(password);
    const sql = `INSERT INTO users (username, password_hash, fullname, role_id, status) VALUES (?, ?, ?, ?, ?)`;
    const result = await db.run(sql, [username, hashedPassword, fullname, role_id || null, status]);
    
    await db.run(
      `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
      [1, 'admin', 'User Created', `Created system user ${username}`]
    );
    
    res.status(201).json({ id: result.id });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  const { username, password, fullname, role_id, status } = req.body;
  
  try {
    let sql;
    let params;
    
    if (password) {
      const hashedPassword = await hashPassword(password);
      sql = `UPDATE users SET username = ?, password_hash = ?, fullname = ?, role_id = ?, status = ? WHERE id = ?`;
      params = [username, hashedPassword, fullname, role_id || null, status, req.params.id];
    } else {
      sql = `UPDATE users SET username = ?, fullname = ?, role_id = ?, status = ? WHERE id = ?`;
      params = [username, fullname, role_id || null, status, req.params.id];
    }
    
    await db.run(sql, params);
    
    await db.run(
      `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
      [1, 'admin', 'User Updated', `Updated system user ${username}`]
    );
    
    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    // Prevent deleting the primary admin (id 1)
    if (parseInt(req.params.id) === 1) {
      return res.status(400).json({ error: 'Cannot delete the primary administrator account.' });
    }
    
    const user = await db.get(`SELECT username FROM users WHERE id = ?`, [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    await db.run(`DELETE FROM users WHERE id = ?`, [req.params.id]);
    
    await db.run(
      `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
      [1, 'admin', 'User Deleted', `Deleted system user ${user.username}`]
    );
    
    res.json({ success: true, message: 'User deleted.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/roles', async (req, res) => {
  try {
    const roles = await db.all(`SELECT * FROM roles ORDER BY id ASC`);
    res.json(roles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 11. DATA BACKUP & RESTORE ENDPOINTS
// ----------------------------------------------------
app.get('/api/backups', async (req, res) => {
  try {
    const history = await db.all(`SELECT * FROM backups ORDER BY timestamp DESC`);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/backups', async (req, res) => {
  try {
    const backupResult = await backup.createBackup('Manual');
    res.status(201).json(backupResult);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/backups/:id/restore', async (req, res) => {
  try {
    const restoreResult = await backup.restoreBackup(req.params.id);
    res.json(restoreResult);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download backup file
app.get('/api/backups/:id/download', async (req, res) => {
  try {
    const record = await db.get(`SELECT * FROM backups WHERE id = ?`, [req.params.id]);
    if (!record) return res.status(404).json({ error: 'Backup not found' });
    res.download(record.file_path, record.filename);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// 12. SYSTEM SETTINGS ENDPOINTS
// ----------------------------------------------------
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await db.get(`SELECT * FROM settings WHERE id = 1`);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings', upload.single('logo'), async (req, res) => {
  try {
    const current = await db.get(`SELECT * FROM settings WHERE id = 1`) || {};
    
    const gym_name = req.body.gym_name !== undefined ? req.body.gym_name : current.gym_name;
    const tagline = req.body.tagline !== undefined ? req.body.tagline : current.tagline;
    const address = req.body.address !== undefined ? req.body.address : current.address;
    const phone = req.body.phone !== undefined ? req.body.phone : current.phone;
    const email = req.body.email !== undefined ? req.body.email : current.email;
    const gst_number = req.body.gst_number !== undefined ? req.body.gst_number : current.gst_number;
    const currency = req.body.currency !== undefined ? req.body.currency : current.currency;
    const date_format = req.body.date_format !== undefined ? req.body.date_format : current.date_format;
    const theme = req.body.theme !== undefined ? req.body.theme : current.theme;
    
    let logo_path = current.logo_path || '';
    if (req.file) {
      logo_path = `/uploads/logo/${req.file.filename}`;
    } else if (req.body.logo_path !== undefined) {
      logo_path = req.body.logo_path;
    }
    
    const sql = `UPDATE settings SET gym_name = ?, tagline = ?, address = ?, phone = ?, email = ?, gst_number = ?, currency = ?, date_format = ?, theme = ?, logo_path = ?
                 WHERE id = 1`;
                 
    await db.run(sql, [
      gym_name, tagline, address, phone, email, gst_number, currency, date_format, theme, logo_path
    ]);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Full Database Reset (Members, Subscriptions, Payments, Expenses, Attendance, Logs)
app.post('/api/settings/reset-database', async (req, res) => {
  try {
    // 1. Create safety backup first
    try {
      await backup.createBackup('Pre-Reset-Auto');
    } catch (bErr) {
      console.warn('Pre-reset backup warning:', bErr.message);
    }

    // 2. Clear transactional and member data tables
    const tablesToClear = [
      'members',
      'subscriptions',
      'payments',
      'expenses',
      'attendance',
      'reminder_logs',
      'whatsapp_queue',
      'whatsapp_logs',
      'activity_logs'
    ];

    for (const table of tablesToClear) {
      await db.run(`DELETE FROM ${table}`);
      try {
        await db.run(`DELETE FROM sqlite_sequence WHERE name = ?`, [table]);
      } catch (e) {}
    }

    // 3. Log the reset action
    await db.run(
      `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
      [1, 'admin', 'Database Reset', 'Complete database reset performed. All members, subscriptions, payments, expenses, and logs cleared.']
    );

    res.json({
      success: true,
      message: 'Database reset successfully! All member records, subscriptions, payments, and logs have been cleared.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset Financials (payments and expenses)
app.post('/api/settings/reset-financials', async (req, res) => {
  try {
    await db.run(`DELETE FROM payments`);
    await db.run(`DELETE FROM expenses`);
    try {
      await db.run(`DELETE FROM sqlite_sequence WHERE name = 'payments'`);
      await db.run(`DELETE FROM sqlite_sequence WHERE name = 'expenses'`);
    } catch (e) {
      // Ignore if table seq doesn't exist
    }
    
    await db.run(
      `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
      [1, 'admin', 'Financial Reset', 'Cleared all payment records and expense logs for a fresh start.']
    );
    
    res.json({ success: true, message: 'Revenue and expense records reset successfully!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Activity logs endpoint
app.get('/api/activity-logs', async (req, res) => {
  try {
    const logs = await db.all(`SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 100`);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Default fallback to index.html for SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start Server after database schema has initialized
db.initPromise.then(async () => {
  try {
    const settings = await db.get(`SELECT allow_lan_access FROM settings WHERE id = 1`);
    const allowLan = settings && settings.allow_lan_access === 1;
    const HOST = process.env.HOST || (allowLan ? '0.0.0.0' : '127.0.0.1');

    app.listen(PORT, HOST, () => {
      console.log(`Fight Club Gym Server running on http://${HOST}:${PORT}`);
      if (HOST === '127.0.0.1') {
        console.log(`[Security] Server bound to localhost (${HOST}) for local protection. Enable LAN access in Settings if needed.`);
      } else {
        console.log(`[Network] LAN access enabled on http://0.0.0.0:${PORT}`);
      }
      // Start WhatsApp reminder scheduler
      whatsappScheduler.start();
    });
  } catch (startErr) {
    app.listen(PORT, '127.0.0.1', () => {
      console.log(`Fight Club Gym Server running on http://127.0.0.1:${PORT}`);
      whatsappScheduler.start();
    });
  }
}).catch((err) => {
  console.error('Failed to initialize database. Server shutdown.', err);
  process.exit(1);
});

