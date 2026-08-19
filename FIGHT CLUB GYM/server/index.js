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

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

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

// Configure Multer for File Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'photo') cb(null, memberPhotosDir);
    else if (file.fieldname === 'logo') cb(null, logoDir);
    else if (file.fieldname === 'bill') cb(null, billsDir);
    else cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Helper to hash password with SHA-256 (matches seed database)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// ----------------------------------------------------
// 1. AUTHENTICATION ENDPOINTS
// ----------------------------------------------------
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  try {
    const hashedPassword = hashPassword(password);
    const user = await db.get(
      `SELECT u.*, r.name as role_name, r.permissions 
       FROM users u 
       LEFT JOIN roles r ON u.role_id = r.id 
       WHERE u.username = ? AND u.password_hash = ? AND u.status = 'Active'`,
      [username, hashedPassword]
    );
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
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
  const { search, status, plan, trainer, sort, order = 'ASC' } = req.query;
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
    trainer_id, medical_notes, notes, status = 'Active'
  } = req.body;
  
  if (!fullname) {
    return res.status(400).json({ error: 'Full name is required' });
  }
  
  try {
    let final_member_code = member_code ? member_code : null;
    const photo_path = req.file ? `/uploads/members/${req.file.filename}` : '';
    
    // If no member_code provided, insert first then update with auto ID-based code
    const sql = `INSERT INTO members (member_code, fullname, photo_path, gender, dob, mobile, whatsapp, email, address, emergency_contact, blood_group, joining_date, trainer_id, medical_notes, status, notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                 
    const result = await db.run(sql, [
      final_member_code || null, fullname, photo_path, gender, dob, mobile, whatsapp, email,
      address, emergency_contact, blood_group, joining_date,
      trainer_id ? parseInt(trainer_id) : null,
      medical_notes, status, notes
    ]);

    // Auto-assign member code if not provided
    if (!final_member_code) {
      final_member_code = `FC-${1000 + result.id}`;
      await db.run(`UPDATE members SET member_code = ? WHERE id = ?`, [final_member_code, result.id]);
    }
    
    await db.run(
      `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
      [1, 'admin', 'Member Registered', `Registered member ${fullname} with code ${final_member_code}`]
    );
    
    res.status(201).json({ id: result.id, member_code: final_member_code });
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
    trainer_id, medical_notes, notes, status
  } = req.body;
  
  try {
    let photo_path = req.body.photo_path;
    if (req.file) {
      photo_path = `/uploads/members/${req.file.filename}`;
    }
    
    const sql = `UPDATE members SET member_code = ?, fullname = ?, photo_path = ?, gender = ?, dob = ?, mobile = ?, whatsapp = ?, email = ?, address = ?, emergency_contact = ?, blood_group = ?, joining_date = ?, trainer_id = ?, medical_notes = ?, status = ?, notes = ?
                 WHERE id = ?`;
                 
    await db.run(sql, [
      member_code, fullname, photo_path, gender, dob, mobile, whatsapp, email,
      address, emergency_contact, blood_group, joining_date,
      trainer_id ? parseInt(trainer_id) : null,
      medical_notes, status, notes, req.params.id
    ]);
    
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
  const { member_id, plan_id, start_date, payment_method, remarks, discount_type, discount_value } = req.body;
  
  if (!member_id || !plan_id || !start_date) {
    return res.status(400).json({ error: 'Member, Plan and Start Date are required' });
  }
  
  try {
    // 1. Get Plan Details
    const plan = await db.get(`SELECT * FROM membership_plans WHERE id = ?`, [plan_id]);
    if (!plan) {
      return res.status(404).json({ error: 'Membership plan not found' });
    }
    
    // 2. Calculate Expiry Date
    const start = new Date(start_date);
    const expiry = new Date(start);
    expiry.setMonth(start.getMonth() + plan.duration_months);
    const expiry_date = expiry.toISOString().split('T')[0];
    
    // 3. Calculate applied discount and final payable amount
    const baseAmount = plan.final_amount;
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
    
    // Update member status to Active
    await db.run(`UPDATE members SET status = 'Active' WHERE id = ?`, [member_id]);
    
    // 5. Record Payment
    // Generate Invoice Number (e.g. INV-YYYY-001)
    const year = new Date().getFullYear();
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
    const invoice_number = `INV-${year}-${String(nextNum).padStart(3, '0')}`;
    const today = new Date().toISOString().split('T')[0];
    
    const paySql = `INSERT INTO payments (invoice_number, payment_date, member_id, subscription_id, amount, discount, tax, paid_amount, balance, payment_method, remarks)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                    
    const payResult = await db.run(paySql, [
      invoice_number, today, member_id, subscription_id,
      plan.price,
      appliedDiscount,  // applied discount amount
      plan.tax,
      paid_amount,      // final payable after discount
      0,
      payment_method || 'Cash',
      remarks || `Subscription for ${plan.name}`
    ]);
    
    await db.run(
      `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
      [1, 'admin', 'Subscription Created', `Created subscription ID: ${subscription_id} for Member ID: ${member_id}${appliedDiscount > 0 ? ` (Discount: ₹${appliedDiscount})` : ''}`]
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

// Update Subscription: Cancel, Freeze, Resume
app.post('/api/subscriptions/:id/status', async (req, res) => {
  const { status } = req.body; // 'Frozen', 'Active', 'Expired'
  if (!status) return res.status(400).json({ error: 'Status is required' });
  
  try {
    await db.run(`UPDATE subscriptions SET status = ? WHERE id = ?`, [status, req.params.id]);
    
    const sub = await db.get(`SELECT member_id FROM subscriptions WHERE id = ?`, [req.params.id]);
    if (sub) {
      await db.run(`UPDATE members SET status = ? WHERE id = ?`, [status, sub.member_id]);
    }
    
    res.json({ success: true });
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
    const hashedPassword = hashPassword(password);
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
      const hashedPassword = hashPassword(password);
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
db.initPromise.then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Fight Club Gym Server running on http://0.0.0.0:${PORT}`);
    console.log(`Local network URL: http://192.168.220.6:${PORT}`);
    // Start WhatsApp reminder scheduler
    whatsappScheduler.start();
  });
}).catch((err) => {
  console.error('Failed to initialize database. Server shutdown.', err);
  process.exit(1);
});

