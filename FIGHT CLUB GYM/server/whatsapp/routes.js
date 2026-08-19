// WhatsApp API Routes — Fight Club Gym
// Mounted at /api/whatsapp in server/index.js

const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendMessage, sendBulk, testConnection, encrypt, decrypt } = require('./service');

// ── GET /api/whatsapp/settings ───────────────────────────────────────────────
router.get('/settings', async (req, res) => {
  try {
    const s = await db.get('SELECT * FROM whatsapp_settings WHERE id = 1');
    if (!s) return res.json({});
    // Mask token
    const masked = { ...s, access_token_enc: s.access_token_enc ? '••••••••••••••••' : '' };
    res.json(masked);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/whatsapp/settings ──────────────────────────────────────────────
router.post('/settings', async (req, res) => {
  try {
    const current = await db.get('SELECT * FROM whatsapp_settings WHERE id = 1') || {};
    const {
      provider, api_endpoint, access_token, phone_number_id,
      business_account_id, webhook_verify_token, enabled,
      default_country_code, message_delay_ms, retry_attempts,
      daily_limit, quiet_hours_start, quiet_hours_end
    } = req.body;

    // Only re-encrypt token if a new one was provided (not masked)
    let access_token_enc = current.access_token_enc || '';
    if (access_token && !access_token.includes('•')) {
      access_token_enc = encrypt(access_token);
    }

    await db.run(
      `INSERT OR REPLACE INTO whatsapp_settings
       (id, provider, api_endpoint, access_token_enc, phone_number_id, business_account_id,
        webhook_verify_token, enabled, default_country_code, message_delay_ms,
        retry_attempts, daily_limit, quiet_hours_start, quiet_hours_end, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        provider || current.provider || 'meta',
        api_endpoint !== undefined ? api_endpoint : current.api_endpoint,
        access_token_enc,
        phone_number_id !== undefined ? phone_number_id : current.phone_number_id,
        business_account_id !== undefined ? business_account_id : current.business_account_id,
        webhook_verify_token !== undefined ? webhook_verify_token : current.webhook_verify_token,
        enabled !== undefined ? (enabled ? 1 : 0) : current.enabled,
        default_country_code || current.default_country_code || '+91',
        message_delay_ms || current.message_delay_ms || 1000,
        retry_attempts || current.retry_attempts || 3,
        daily_limit || current.daily_limit || 500,
        quiet_hours_start || current.quiet_hours_start || '22:00',
        quiet_hours_end || current.quiet_hours_end || '08:00',
      ]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/whatsapp/test ──────────────────────────────────────────────────
router.post('/test', async (req, res) => {
  try {
    const result = await testConnection();
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/whatsapp/templates ──────────────────────────────────────────────
router.get('/templates', async (req, res) => {
  try {
    const templates = await db.all('SELECT * FROM whatsapp_templates ORDER BY category, name');
    res.json(templates);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/whatsapp/templates ─────────────────────────────────────────────
router.post('/templates', async (req, res) => {
  try {
    const { key, name, category, body } = req.body;
    if (!key || !name || !body) return res.status(400).json({ error: 'key, name, body are required' });
    const result = await db.run(
      `INSERT INTO whatsapp_templates (key, name, category, body) VALUES (?, ?, ?, ?)`,
      [key, name, category || 'General', body]
    );
    res.json({ success: true, id: result.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /api/whatsapp/templates/:id ─────────────────────────────────────────
router.put('/templates/:id', async (req, res) => {
  try {
    const { name, category, body, is_active } = req.body;
    await db.run(
      `UPDATE whatsapp_templates SET name=?, category=?, body=?, is_active=?, updated_at=datetime('now') WHERE id=?`,
      [name, category, body, is_active !== undefined ? (is_active ? 1 : 0) : 1, req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/whatsapp/templates/:id ──────────────────────────────────────
router.delete('/templates/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM whatsapp_templates WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/whatsapp/logs ───────────────────────────────────────────────────
router.get('/logs', async (req, res) => {
  try {
    const { status, type, member, from, to, limit = 100 } = req.query;
    let sql = 'SELECT * FROM whatsapp_logs WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (type)   { sql += ' AND notification_type LIKE ?'; params.push(`%${type}%`); }
    if (member) { sql += ' AND member_name LIKE ?'; params.push(`%${member}%`); }
    if (from)   { sql += ' AND DATE(sent_at) >= ?'; params.push(from); }
    if (to)     { sql += ' AND DATE(sent_at) <= ?'; params.push(to); }
    sql += ' ORDER BY sent_at DESC LIMIT ?';
    params.push(parseInt(limit));
    const logs = await db.all(sql, params);
    res.json(logs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/whatsapp/stats ──────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const sentToday = await db.get(`SELECT COUNT(*) as c FROM whatsapp_logs WHERE DATE(sent_at)=? AND status='sent'`, [today]);
    const failedToday = await db.get(`SELECT COUNT(*) as c FROM whatsapp_logs WHERE DATE(sent_at)=? AND status='failed'`, [today]);
    const pending = await db.get(`SELECT COUNT(*) as c FROM whatsapp_queue WHERE status='pending'`);
    const totalSent = await db.get(`SELECT COUNT(*) as c FROM whatsapp_logs WHERE status='sent'`);
    const totalAll = await db.get(`SELECT COUNT(*) as c FROM whatsapp_logs`);
    const successRate = totalAll.c > 0 ? Math.round((totalSent.c / totalAll.c) * 100) : 0;
    res.json({
      sentToday: sentToday.c,
      failedToday: failedToday.c,
      pending: pending.c,
      successRate,
      totalSent: totalSent.c,
      totalAll: totalAll.c
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/whatsapp/send ──────────────────────────────────────────────────
router.post('/send', async (req, res) => {
  try {
    const { memberId, mobile, memberName, templateKey, customMessage, data } = req.body;
    if (!mobile) return res.status(400).json({ error: 'mobile is required' });

    if (customMessage) {
      // Direct custom message — log it manually
      const settings = await db.get('SELECT * FROM whatsapp_settings WHERE id = 1');
      if (!settings || !settings.enabled) return res.status(400).json({ error: 'WhatsApp notifications are disabled' });
      const { sendMessage: svc } = require('./service');
      // Insert fake template temporarily
      const result = await svc({
        memberId, memberName, mobile,
        templateKey: templateKey || 'custom',
        data: { ...data, _customMessage: customMessage },
        sentBy: req.body.sentBy || 'staff',
      });
      return res.json(result);
    }

    const result = await sendMessage({
      memberId, memberName, mobile, templateKey,
      data: data || {},
      sentBy: req.body.sentBy || 'staff',
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/whatsapp/send-bulk ─────────────────────────────────────────────
router.post('/send-bulk', async (req, res) => {
  try {
    const { audience, templateKey, data } = req.body;
    if (!templateKey) return res.status(400).json({ error: 'templateKey required' });

    // Build member list based on audience
    let members = [];
    if (audience === 'all') {
      members = await db.all(`SELECT id, fullname, mobile FROM members WHERE mobile IS NOT NULL AND mobile != ''`);
    } else if (audience === 'active') {
      members = await db.all(`SELECT m.id, m.fullname, m.mobile FROM members m WHERE m.status='Active' AND m.mobile IS NOT NULL AND m.mobile != ''`);
    } else if (audience === 'expired') {
      members = await db.all(`SELECT m.id, m.fullname, m.mobile FROM members m WHERE m.status='Expired' AND m.mobile IS NOT NULL AND m.mobile != ''`);
    } else if (audience === 'overdue') {
      members = await db.all(`SELECT DISTINCT m.id, m.fullname, m.mobile FROM members m JOIN payments p ON p.member_id=m.id WHERE p.balance>0 AND m.mobile IS NOT NULL AND m.mobile != ''`);
    } else if (audience && audience.startsWith('plan:')) {
      const planId = audience.split(':')[1];
      members = await db.all(`SELECT DISTINCT m.id, m.fullname, m.mobile FROM members m JOIN subscriptions s ON s.member_id=m.id WHERE s.plan_id=? AND s.status='Active' AND m.mobile IS NOT NULL AND m.mobile != ''`, [planId]);
    } else if (audience && audience.startsWith('trainer:')) {
      const trainerId = audience.split(':')[1];
      members = await db.all(`SELECT m.id, m.fullname, m.mobile FROM members m WHERE m.trainer_id=? AND m.mobile IS NOT NULL AND m.mobile != ''`, [trainerId]);
    } else {
      members = await db.all(`SELECT id, fullname, mobile FROM members WHERE mobile IS NOT NULL AND mobile != ''`);
    }

    res.json({ queued: members.length, message: `Sending to ${members.length} members...` });

    // Send asynchronously after response
    sendBulk({ members, templateKey, data: data || {}, sentBy: 'staff' })
      .then(results => console.log(`[Bulk Send] Completed: ${results.length} messages`))
      .catch(err => console.error('[Bulk Send] Error:', err.message));

  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/whatsapp/resend/:logId ────────────────────────────────────────
router.post('/resend/:logId', async (req, res) => {
  try {
    const log = await db.get('SELECT * FROM whatsapp_logs WHERE id=?', [req.params.logId]);
    if (!log) return res.status(404).json({ error: 'Log entry not found' });
    const result = await sendMessage({
      memberId: log.member_id, memberName: log.member_name,
      mobile: log.mobile, templateKey: log.template_key,
      data: {}, sentBy: 'staff',
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/whatsapp/reminders ──────────────────────────────────────────────
router.get('/reminders', async (req, res) => {
  try {
    const reminders = await db.all('SELECT * FROM whatsapp_reminders ORDER BY type, days_offset');
    res.json(reminders);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/whatsapp/reminders ─────────────────────────────────────────────
router.post('/reminders', async (req, res) => {
  try {
    const { type, days_offset, label, template_key, is_active } = req.body;
    const result = await db.run(
      `INSERT INTO whatsapp_reminders (type, days_offset, label, template_key, is_active) VALUES (?, ?, ?, ?, ?)`,
      [type, days_offset, label, template_key, is_active !== undefined ? (is_active ? 1 : 0) : 1]
    );
    res.json({ success: true, id: result.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /api/whatsapp/reminders/:id ─────────────────────────────────────────
router.put('/reminders/:id', async (req, res) => {
  try {
    const { type, days_offset, label, template_key, is_active } = req.body;
    await db.run(
      `UPDATE whatsapp_reminders SET type=?, days_offset=?, label=?, template_key=?, is_active=? WHERE id=?`,
      [type, days_offset, label, template_key, is_active ? 1 : 0, req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/whatsapp/reminders/:id ──────────────────────────────────────
router.delete('/reminders/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM whatsapp_reminders WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/whatsapp/members (for bulk audience selection) ─────────────────
router.get('/members', async (req, res) => {
  try {
    const plans = await db.all('SELECT id, name FROM membership_plans ORDER BY name');
    const trainers = await db.all('SELECT id, fullname FROM trainers WHERE status="Active" ORDER BY fullname');
    res.json({ plans, trainers });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
