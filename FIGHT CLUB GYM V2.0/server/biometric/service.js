const db = require('../db');
const GenericWebhookAdapter = require('./adapters/generic-webhook');
const MantraAdapter = require('./adapters/mantra');
const { evaluateAccess } = require('./access-rules');
const { dispatchAccessNotification } = require('./notifications');
const { generateDeviceApiKey, encrypt, decrypt } = require('../security/crypto-vault');

// Registry of device adapters
const mantraAdapterInstance = new MantraAdapter();
const genericAdapterInstance = new GenericWebhookAdapter();

const adapterRegistry = {
  webhook: genericAdapterInstance,
  generic: genericAdapterInstance,
  rest_api: genericAdapterInstance,
  mantra: mantraAdapterInstance,
  mantra_mfs100: mantraAdapterInstance,
  mfs100: mantraAdapterInstance
};

function getAdapter(connectionType = 'webhook', vendor = '') {
  const vendorKey = (vendor || '').toLowerCase().trim();
  if (vendorKey.includes('mantra') || vendorKey.includes('mfs100')) {
    return mantraAdapterInstance;
  }
  return adapterRegistry[(connectionType || 'webhook').toLowerCase()] || genericAdapterInstance;
}

// ----------------------------------------------------
// 1. DEVICE MANAGEMENT
// ----------------------------------------------------
async function listDevices() {
  const devices = await db.all(`
    SELECT d.id, d.name, d.vendor, d.model, d.serial_number, d.connection_type, 
           d.endpoint_url, d.status, d.last_seen_at, d.notes, d.created_at, d.updated_at,
           COUNT(DISTINCT be.id) as enrolled_count
    FROM biometric_devices d
    LEFT JOIN biometric_enrollments be ON d.id = be.device_id AND be.enrollment_status = 'Enrolled'
    GROUP BY d.id
    ORDER BY d.id ASC
  `);

  // Calculate today's scans per device
  const today = new Date().toISOString().split('T')[0];
  const scanCounts = await db.all(`
    SELECT device_id, COUNT(*) as today_scans,
           SUM(CASE WHEN access_result = 'Granted' THEN 1 ELSE 0 END) as granted_scans,
           SUM(CASE WHEN access_result = 'Denied' THEN 1 ELSE 0 END) as denied_scans
    FROM access_events
    WHERE event_time LIKE ?
    GROUP BY device_id
  `, [`${today}%`]);

  const countMap = new Map();
  scanCounts.forEach(sc => countMap.set(sc.device_id, sc));

  return devices.map(dev => {
    const counts = countMap.get(dev.id) || { today_scans: 0, granted_scans: 0, denied_scans: 0 };
    return {
      ...dev,
      today_scans: counts.today_scans,
      granted_scans: counts.granted_scans,
      denied_scans: counts.denied_scans,
      has_api_key: Boolean(dev.api_key_hash)
    };
  });
}

async function getDevice(id) {
  const device = await db.get(`SELECT * FROM biometric_devices WHERE id = ?`, [id]);
  if (!device) return null;
  // Never expose raw api_key_hash or enc in general responses
  delete device.api_key_hash;
  delete device.api_key_enc;
  return device;
}

async function createDevice(data, adminUser = { id: 1, username: 'admin' }) {
  const { name, vendor = 'Generic', model = '', serial_number = '', connection_type = 'webhook', endpoint_url = '', notes = '' } = data;
  if (!name) throw new Error('Device name is required');

  // Generate secure device API key
  const { apiKey, hash } = generateDeviceApiKey(name);
  const encKey = encrypt(apiKey);

  const result = await db.run(
    `INSERT INTO biometric_devices 
     (name, vendor, model, serial_number, connection_type, endpoint_url, api_key_hash, api_key_enc, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?)`,
    [name, vendor, model, serial_number, connection_type, endpoint_url, hash, encKey, notes]
  );

  // Log activity
  await db.run(
    `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
    [adminUser.id || 1, adminUser.username || 'admin', 'Biometric Device Created', `Created biometric device "${name}" (ID: ${result.id})`]
  );

  return {
    id: result.id,
    name,
    vendor,
    apiKey, // Return once upon creation
    message: 'Device created successfully. Save the generated API Key now; it will not be displayed again in plain text.'
  };
}

async function updateDevice(id, data, adminUser = { id: 1, username: 'admin' }) {
  const current = await db.get(`SELECT * FROM biometric_devices WHERE id = ?`, [id]);
  if (!current) throw new Error('Device not found');

  const name = data.name !== undefined ? data.name : current.name;
  const vendor = data.vendor !== undefined ? data.vendor : current.vendor;
  const model = data.model !== undefined ? data.model : current.model;
  const serial_number = data.serial_number !== undefined ? data.serial_number : current.serial_number;
  const connection_type = data.connection_type !== undefined ? data.connection_type : current.connection_type;
  const endpoint_url = data.endpoint_url !== undefined ? data.endpoint_url : current.endpoint_url;
  const status = data.status !== undefined ? data.status : current.status;
  const notes = data.notes !== undefined ? data.notes : current.notes;

  let newApiKey = null;
  let apiKeyHash = current.api_key_hash;
  let apiKeyEnc = current.api_key_enc;

  if (data.regenerate_api_key) {
    const gen = generateDeviceApiKey(name);
    newApiKey = gen.apiKey;
    apiKeyHash = gen.hash;
    apiKeyEnc = encrypt(newApiKey);
  }

  await db.run(
    `UPDATE biometric_devices 
     SET name = ?, vendor = ?, model = ?, serial_number = ?, connection_type = ?, 
         endpoint_url = ?, status = ?, notes = ?, api_key_hash = ?, api_key_enc = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [name, vendor, model, serial_number, connection_type, endpoint_url, status, notes, apiKeyHash, apiKeyEnc, id]
  );

  await db.run(
    `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
    [adminUser.id || 1, adminUser.username || 'admin', 'Biometric Device Updated', `Updated device "${name}" (ID: ${id})${newApiKey ? ' [API Key Regenerated]' : ''}`]
  );

  return {
    success: true,
    apiKey: newApiKey,
    message: newApiKey ? 'Device updated and new API Key generated.' : 'Device updated successfully.'
  };
}

async function deleteDevice(id, adminUser = { id: 1, username: 'admin' }) {
  const current = await db.get(`SELECT * FROM biometric_devices WHERE id = ?`, [id]);
  if (!current) throw new Error('Device not found');

  await db.run(`DELETE FROM biometric_enrollments WHERE device_id = ?`, [id]);
  await db.run(`DELETE FROM biometric_devices WHERE id = ?`, [id]);

  await db.run(
    `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
    [adminUser.id || 1, adminUser.username || 'admin', 'Biometric Device Deleted', `Deleted device "${current.name}" (ID: ${id})`]
  );

  return { success: true, message: `Device "${current.name}" deleted successfully.` };
}

async function testDevice(id) {
  const adapter = getAdapter(device.connection_type, device.vendor);
  const testResult = await adapter.testConnection(device);

  // Update last seen timestamp
  await db.run(`UPDATE biometric_devices SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);

  return testResult;
}

// ----------------------------------------------------
// 2. MEMBER ENROLLMENT & LINKING
// ----------------------------------------------------
async function listEnrollments(filter = {}) {
  let sql = `
    SELECT be.*, m.fullname as member_name, m.member_code, m.mobile, m.status as member_status, m.photo_path,
           d.name as device_name, d.vendor as device_vendor, d.status as device_status
    FROM biometric_enrollments be
    JOIN members m ON be.member_id = m.id
    JOIN biometric_devices d ON be.device_id = d.id
    WHERE 1=1
  `;
  const params = [];

  if (filter.device_id) {
    sql += ` AND be.device_id = ?`;
    params.push(filter.device_id);
  }
  if (filter.member_id) {
    sql += ` AND be.member_id = ?`;
    params.push(filter.member_id);
  }
  if (filter.search) {
    sql += ` AND (m.fullname LIKE ? OR m.member_code LIKE ? OR be.device_user_id LIKE ?)`;
    const s = `%${filter.search}%`;
    params.push(s, s, s);
  }

  sql += ` ORDER BY be.id DESC`;
  return await db.all(sql, params);
}

async function getMemberEnrollments(memberId) {
  return await db.all(`
    SELECT be.*, d.name as device_name, d.vendor, d.status as device_status
    FROM biometric_enrollments be
    JOIN biometric_devices d ON be.device_id = d.id
    WHERE be.member_id = ?
  `, [memberId]);
}

async function enrollMember(data, adminUser = { id: 1, username: 'admin' }) {
  const {
    member_id,
    device_id,
    device_user_id,
    biometric_type = 'fingerprint',
    iso_template = '',
    ansi_template = '',
    bitmap_data = '',
    quality_score = 0,
    fingerprint_image = '',
    notes = ''
  } = data;

  if (!member_id || !device_id || !device_user_id) {
    throw new Error('member_id, device_id, and device_user_id are required');
  }

  const member = await db.get(`SELECT * FROM members WHERE id = ?`, [member_id]);
  if (!member) throw new Error('Member not found');

  const device = await db.get(`SELECT * FROM biometric_devices WHERE id = ?`, [device_id]);
  if (!device) throw new Error('Biometric device not found');

  // Check if device_user_id is already assigned to a DIFFERENT member on this device
  const existing = await db.get(
    `SELECT * FROM biometric_enrollments WHERE device_id = ? AND device_user_id = ?`,
    [device_id, String(device_user_id).trim()]
  );

  if (existing && existing.member_id !== parseInt(member_id)) {
    throw new Error(`Device User ID "${device_user_id}" is already linked to another member on this device.`);
  }

  let resultId;
  const now = new Date().toISOString();

  if (existing) {
    // Update existing record
    await db.run(
      `UPDATE biometric_enrollments 
       SET biometric_type = ?, enrollment_status = 'Enrolled', synced_at = ?, notes = ?,
           iso_template = COALESCE(NULLIF(?, ''), iso_template),
           ansi_template = COALESCE(NULLIF(?, ''), ansi_template),
           bitmap_data = COALESCE(NULLIF(?, ''), bitmap_data),
           quality_score = CASE WHEN ? > 0 THEN ? ELSE quality_score END,
           fingerprint_image = COALESCE(NULLIF(?, ''), fingerprint_image)
       WHERE id = ?`,
      [
        biometric_type, now, notes,
        iso_template, ansi_template, bitmap_data,
        parseInt(quality_score, 10) || 0, parseInt(quality_score, 10) || 0,
        fingerprint_image, existing.id
      ]
    );
    resultId = existing.id;
  } else {
    // Insert new enrollment
    const ins = await db.run(
      `INSERT INTO biometric_enrollments 
       (member_id, device_id, device_user_id, biometric_type, enrollment_status, synced_at, notes, iso_template, ansi_template, bitmap_data, quality_score, fingerprint_image)
       VALUES (?, ?, ?, ?, 'Enrolled', ?, ?, ?, ?, ?, ?, ?)`,
      [
        member_id, device_id, String(device_user_id).trim(), biometric_type, now, notes,
        iso_template, ansi_template, bitmap_data, parseInt(quality_score, 10) || 0, fingerprint_image
      ]
    );
    resultId = ins.id;
  }

  // Also update member record with fingerprint template & quality if provided
  if (iso_template || bitmap_data) {
    try {
      await db.run(
        `UPDATE members 
         SET fingerprint_template = COALESCE(NULLIF(?, ''), fingerprint_template),
             fingerprint_image = COALESCE(NULLIF(?, ''), fingerprint_image),
             fingerprint_quality = CASE WHEN ? > 0 THEN ? ELSE fingerprint_quality END
         WHERE id = ?`,
        [iso_template, fingerprint_image || (bitmap_data ? `data:image/bmp;base64,${bitmap_data}` : ''), parseInt(quality_score, 10) || 0, parseInt(quality_score, 10) || 0, member.id]
      );
    } catch (mErr) {
      console.warn('Note: Could not update member fingerprint columns:', mErr.message);
    }
  }

  await db.run(
    `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
    [adminUser.id || 1, adminUser.username || 'admin', 'Biometric Enrolled', `Linked member ${member.fullname} (${member.member_code}) to device "${device.name}" with User ID "${device_user_id}" (${biometric_type}${quality_score ? `, Quality: ${quality_score}%` : ''})`]
  );

  return {
    success: true,
    id: resultId,
    message: `Member ${member.fullname} successfully linked to ${device.name} with fingerprint template.`
  };
}

async function unenrollMember(enrollmentId, adminUser = { id: 1, username: 'admin' }) {
  const enrollment = await db.get(`
    SELECT be.*, m.fullname, d.name as device_name 
    FROM biometric_enrollments be
    JOIN members m ON be.member_id = m.id
    JOIN biometric_devices d ON be.device_id = d.id
    WHERE be.id = ?
  `, [enrollmentId]);

  if (!enrollment) throw new Error('Enrollment not found');

  await db.run(`DELETE FROM biometric_enrollments WHERE id = ?`, [enrollmentId]);

  await db.run(
    `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
    [adminUser.id || 1, adminUser.username || 'admin', 'Biometric Unenrolled', `Unlinked member ${enrollment.fullname} from device "${enrollment.device_name}" (User ID: ${enrollment.device_user_id})`]
  );

  return { success: true, message: `Biometric link removed for ${enrollment.fullname}.` };
}

// ----------------------------------------------------
// 3. DEVICE EVENT INGESTION & PROCESSING
// ----------------------------------------------------
async function processDeviceEvent({ deviceId, rawPayload, headers }) {
  const device = await db.get(`SELECT * FROM biometric_devices WHERE id = ?`, [deviceId]);
  if (!device) {
    return {
      statusCode: 404,
      response: { status: 'DENIED', allowed: false, reason: `Biometric device with ID ${deviceId} not found` }
    };
  }

  const adapter = getAdapter(device.connection_type, device.vendor);

  // Authenticate device request
  const isAuthenticated = adapter.validateRequest(rawPayload, headers, device);
  if (!isAuthenticated) {
    return {
      statusCode: 401,
      response: { status: 'DENIED', allowed: false, reason: 'Invalid or missing Device API Key / Signature' }
    };
  }

  // Update device heartbeat/last seen
  await db.run(`UPDATE biometric_devices SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?`, [device.id]);

  // Parse raw device event
  const parsedEvent = adapter.parseEvent(rawPayload, headers);

  // Evaluate multi-factor access decision
  const decision = await evaluateAccess({ device, parsedEvent });

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const timeStr = now.toISOString();

  // Log to access_events table (stores ALL attempts, granted and denied)
  try {
    await db.run(
      `INSERT INTO access_events 
       (member_id, device_id, device_user_id, event_type, access_result, reason, direction, event_time, raw_reference)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        decision.member ? decision.member.id : null,
        device.id,
        parsedEvent.deviceUserId || null,
        parsedEvent.eventType,
        decision.accessResult,
        decision.reason,
        decision.direction,
        decision.eventTime || timeStr,
        parsedEvent.rawReference
      ]
    );
  } catch (logErr) {
    console.error('Failed to write access_events log:', logErr);
  }

  // If Granted: automatically update gym Attendance table
  if (decision.allowed && decision.member) {
    try {
      if (decision.direction === 'check_out') {
        const activeCheckIn = await db.get(
          `SELECT id FROM attendance WHERE member_id = ? AND attendance_date = ? AND check_out IS NULL ORDER BY id DESC LIMIT 1`,
          [decision.member.id, todayStr]
        );
        if (activeCheckIn) {
          await db.run(`UPDATE attendance SET check_out = ? WHERE id = ?`, [timeStr, activeCheckIn.id]);
        } else {
          // Record checkout entry
          await db.run(
            `INSERT INTO attendance (member_id, check_in, check_out, attendance_date) VALUES (?, ?, ?, ?)`,
            [decision.member.id, timeStr, timeStr, todayStr]
          );
        }
      } else {
        // Check-In
        await db.run(
          `INSERT INTO attendance (member_id, check_in, attendance_date) VALUES (?, ?, ?)`,
          [decision.member.id, timeStr, todayStr]
        );
      }
    } catch (attErr) {
      console.error('Failed to sync biometric scan to attendance table:', attErr);
    }
  }

  // Asynchronously trigger WhatsApp Notification (does not block device turnaround time)
  dispatchAccessNotification({ decision, device }).catch(err => {
    console.error('Asynchronous WhatsApp notification error:', err);
  });

  return {
    statusCode: decision.allowed ? 200 : 200, // Return 200 with structured JSON for hardware controllers
    response: adapter.generateResponse(decision)
  };
}

// ----------------------------------------------------
// 4. MANUAL ACCESS DECISION TEST TOOL
// ----------------------------------------------------
async function checkAccessManual({ member_id, device_id }) {
  const member = await db.get(`SELECT * FROM members WHERE id = ?`, [member_id]);
  if (!member) throw new Error('Member not found');

  let device = null;
  if (device_id) {
    device = await db.get(`SELECT * FROM biometric_devices WHERE id = ?`, [device_id]);
  }
  if (!device) {
    device = (await db.get(`SELECT * FROM biometric_devices WHERE status = 'Active' LIMIT 1`)) || {
      id: 1,
      name: 'Simulated Gate',
      status: 'Active',
      connection_type: 'webhook'
    };
  }

  // Fetch enrollment if exists
  const enrollment = await db.get(
    `SELECT * FROM biometric_enrollments WHERE member_id = ? AND device_id = ?`,
    [member.id, device.id]
  ) || await db.get(`SELECT * FROM biometric_enrollments WHERE member_id = ? LIMIT 1`, [member.id]);

  const deviceUserId = enrollment ? enrollment.device_user_id : member.member_code || String(member.id);

  const parsedEvent = {
    deviceUserId,
    eventType: 'identification_success',
    eventTime: new Date().toISOString(),
    direction: 'auto',
    biometricType: enrollment?.biometric_type || 'fingerprint',
    rawReference: 'manual_test_simulator'
  };

  const decision = await evaluateAccess({ device, parsedEvent });

  return {
    member: {
      id: member.id,
      fullname: member.fullname,
      member_code: member.member_code,
      status: member.status,
      mobile: member.mobile
    },
    device: {
      id: device.id,
      name: device.name,
      status: device.status
    },
    enrollment: enrollment ? {
      device_user_id: enrollment.device_user_id,
      biometric_type: enrollment.biometric_type,
      status: enrollment.enrollment_status
    } : null,
    decision
  };
}

// ----------------------------------------------------
// 5. ACCESS EVENTS QUERY & KPIS
// ----------------------------------------------------
async function listEvents(query = {}) {
  const { date_from, date_to, device_id, member_id, access_result, search, limit = 100, offset = 0 } = query;

  let sql = `
    SELECT ae.*, m.fullname as member_name, m.member_code, m.photo_path,
           d.name as device_name, d.vendor as device_vendor
    FROM access_events ae
    LEFT JOIN members m ON ae.member_id = m.id
    LEFT JOIN biometric_devices d ON ae.device_id = d.id
    WHERE 1=1
  `;
  const params = [];

  if (date_from) {
    sql += ` AND ae.event_time >= ?`;
    params.push(`${date_from} 00:00:00`);
  }
  if (date_to) {
    sql += ` AND ae.event_time <= ?`;
    params.push(`${date_to} 23:59:59`);
  }
  if (device_id) {
    sql += ` AND ae.device_id = ?`;
    params.push(device_id);
  }
  if (member_id) {
    sql += ` AND ae.member_id = ?`;
    params.push(member_id);
  }
  if (access_result) {
    sql += ` AND ae.access_result = ?`;
    params.push(access_result);
  }
  if (search) {
    sql += ` AND (m.fullname LIKE ? OR m.member_code LIKE ? OR ae.device_user_id LIKE ? OR ae.reason LIKE ?)`;
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  sql += ` ORDER BY ae.id DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  const events = await db.all(sql, params);
  const totalCount = await db.get(`SELECT COUNT(*) as total FROM access_events`);

  return {
    events,
    total: totalCount?.total || 0
  };
}

async function getStats() {
  const today = new Date().toISOString().split('T')[0];

  const totalDevices = await db.get(`SELECT COUNT(*) as c FROM biometric_devices WHERE status = 'Active'`);
  const totalEnrolled = await db.get(`SELECT COUNT(DISTINCT member_id) as c FROM biometric_enrollments WHERE enrollment_status = 'Enrolled'`);

  const todayStats = await db.get(`
    SELECT COUNT(*) as total_today,
           SUM(CASE WHEN access_result = 'Granted' THEN 1 ELSE 0 END) as granted_today,
           SUM(CASE WHEN access_result = 'Denied' THEN 1 ELSE 0 END) as denied_today
    FROM access_events
    WHERE event_time LIKE ?
  `, [`${today}%`]);

  const totalToday = todayStats?.total_today || 0;
  const grantedToday = todayStats?.granted_today || 0;
  const deniedToday = todayStats?.denied_today || 0;
  const successRate = totalToday > 0 ? Math.round((grantedToday / totalToday) * 100) : 100;

  return {
    activeDevices: totalDevices?.c || 0,
    enrolledMembers: totalEnrolled?.c || 0,
    todayScans: totalToday,
    todayGranted: grantedToday,
    todayDenied: deniedToday,
    successRate
  };
}

// ----------------------------------------------------
// 6. RULES & NOTIFICATION CONFIGURATION
// ----------------------------------------------------
async function getRules() {
  const rules = await db.get(`SELECT * FROM access_rules WHERE id = 1`);
  if (!rules) return {};
  try {
    rules.allowed_member_statuses = JSON.parse(rules.allowed_member_statuses || '["Active"]');
  } catch {
    rules.allowed_member_statuses = ['Active'];
  }
  return rules;
}

async function updateRules(data, adminUser = { id: 1, username: 'admin' }) {
  const current = await getRules();

  const enabled = data.enabled !== undefined ? (data.enabled ? 1 : 0) : current.enabled;
  const allowed_member_statuses = data.allowed_member_statuses ? JSON.stringify(data.allowed_member_statuses) : JSON.stringify(current.allowed_member_statuses);
  const deny_if_expired = data.deny_if_expired !== undefined ? (data.deny_if_expired ? 1 : 0) : current.deny_if_expired;
  const deny_if_payment_due = data.deny_if_payment_due !== undefined ? (data.deny_if_payment_due ? 1 : 0) : current.deny_if_payment_due;
  const grace_period_days = data.grace_period_days !== undefined ? parseInt(data.grace_period_days, 10) : current.grace_period_days;
  const allowed_start_time = data.allowed_start_time !== undefined ? data.allowed_start_time : current.allowed_start_time;
  const allowed_end_time = data.allowed_end_time !== undefined ? data.allowed_end_time : current.allowed_end_time;
  const cooldown_seconds = data.cooldown_seconds !== undefined ? parseInt(data.cooldown_seconds, 10) : current.cooldown_seconds;

  await db.run(
    `UPDATE access_rules 
     SET enabled = ?, allowed_member_statuses = ?, deny_if_expired = ?, deny_if_payment_due = ?, 
         grace_period_days = ?, allowed_start_time = ?, allowed_end_time = ?, cooldown_seconds = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`,
    [enabled, allowed_member_statuses, deny_if_expired, deny_if_payment_due, grace_period_days, allowed_start_time, allowed_end_time, cooldown_seconds]
  );

  await db.run(
    `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
    [adminUser.id || 1, adminUser.username || 'admin', 'Biometric Rules Updated', `Updated access rules (Grace: ${grace_period_days}d, Hours: ${allowed_start_time}-${allowed_end_time}, Cooldown: ${cooldown_seconds}s)`]
  );

  return { success: true, message: 'Access rules updated successfully.' };
}

async function getNotificationSettings() {
  return await db.get(`SELECT * FROM access_notification_settings WHERE id = 1`) || {};
}

async function updateNotificationSettings(data, adminUser = { id: 1, username: 'admin' }) {
  const current = await getNotificationSettings();

  const enabled = data.enabled !== undefined ? (data.enabled ? 1 : 0) : current.enabled;
  const notify_on_checkin = data.notify_on_checkin !== undefined ? (data.notify_on_checkin ? 1 : 0) : current.notify_on_checkin;
  const notify_on_checkout = data.notify_on_checkout !== undefined ? (data.notify_on_checkout ? 1 : 0) : current.notify_on_checkout;
  const notify_on_denied = data.notify_on_denied !== undefined ? (data.notify_on_denied ? 1 : 0) : current.notify_on_denied;
  const notify_on_expiry_warning = data.notify_on_expiry_warning !== undefined ? (data.notify_on_expiry_warning ? 1 : 0) : current.notify_on_expiry_warning;
  const notify_on_due_warning = data.notify_on_due_warning !== undefined ? (data.notify_on_due_warning ? 1 : 0) : current.notify_on_due_warning;
  const cooldown_minutes = data.cooldown_minutes !== undefined ? parseInt(data.cooldown_minutes, 10) : current.cooldown_minutes;

  await db.run(
    `UPDATE access_notification_settings 
     SET enabled = ?, notify_on_checkin = ?, notify_on_checkout = ?, notify_on_denied = ?, 
         notify_on_expiry_warning = ?, notify_on_due_warning = ?, cooldown_minutes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = 1`,
    [enabled, notify_on_checkin, notify_on_checkout, notify_on_denied, notify_on_expiry_warning, notify_on_due_warning, cooldown_minutes]
  );

  await db.run(
    `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
    [adminUser.id || 1, adminUser.username || 'admin', 'Biometric Notifications Updated', 'Updated WhatsApp biometric notification settings.']
  );

  return { success: true, message: 'Notification settings updated.' };
}

// ----------------------------------------------------
// 7. DATA RETENTION & ANONYMIZATION
// ----------------------------------------------------
async function cleanupRetention({ retentionDays = 90, anonymizeOnly = false }, adminUser = { id: 1, username: 'admin' }) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - parseInt(retentionDays, 10));
  const cutoffStr = cutoffDate.toISOString();

  let result;
  if (anonymizeOnly) {
    result = await db.run(
      `UPDATE access_events 
       SET member_id = NULL, device_user_id = 'ANONYMIZED', raw_reference = NULL 
       WHERE event_time < ? AND member_id IS NOT NULL`,
      [cutoffStr]
    );
  } else {
    result = await db.run(`DELETE FROM access_events WHERE event_time < ?`, [cutoffStr]);
  }

  await db.run(
    `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
    [adminUser.id || 1, adminUser.username || 'admin', 'Biometric Retention Cleanup', `${anonymizeOnly ? 'Anonymized' : 'Purged'} ${result.changes} access event records older than ${retentionDays} days.`]
  );

  return {
    success: true,
    affectedRecords: result.changes,
    message: `Retention policy applied. ${result.changes} event records ${anonymizeOnly ? 'anonymized' : 'removed'}.`
  };
}

// ----------------------------------------------------
// 9. MANTRA MFS100 SPECIFIC HELPERS
// ----------------------------------------------------
async function autoSetupMantraDevice(adminUser = { id: 1, username: 'admin' }) {
  // Check if Mantra MFS100 device already exists
  let device = await db.get(`SELECT * FROM biometric_devices WHERE vendor = 'Mantra' LIMIT 1`);
  if (device) {
    if (device.model !== 'MFS100 V54/V54OTG' || device.endpoint_url === 'http://127.0.0.1:8035') {
      await db.run(`UPDATE biometric_devices SET model = 'MFS100 V54/V54OTG', endpoint_url = 'http://127.0.0.1:8004' WHERE id = ?`, [device.id]);
      device.model = 'MFS100 V54/V54OTG';
      device.endpoint_url = 'http://127.0.0.1:8004';
    }
    return { success: true, created: false, device, message: 'Mantra MFS100 is already configured.' };
  }

  const { apiKey, hash } = generateDeviceApiKey('Mantra MFS100 USB');
  const encKey = encrypt(apiKey);

  const res = await db.run(
    `INSERT INTO biometric_devices 
     (name, vendor, model, serial_number, connection_type, endpoint_url, api_key_hash, api_key_enc, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'Mantra MFS100 (USB Optical)',
      'Mantra',
      'MFS100 V54/V54OTG',
      '4815115',
      'rest_api',
      'http://127.0.0.1:8004',
      hash,
      encKey,
      'Active',
      'Mantra MFS100 Optical Fingerprint Sensor connected via USB.'
    ]
  );

  device = await db.get(`SELECT * FROM biometric_devices WHERE id = ?`, [res.id]);

  await db.run(
    `INSERT INTO activity_logs (user_id, username, action, details) VALUES (?, ?, ?, ?)`,
    [adminUser.id || 1, adminUser.username || 'admin', 'Biometric Device Created', `Auto-configured Mantra MFS100 optical fingerprint device (ID: ${res.id})`]
  );

  return {
    success: true,
    created: true,
    device,
    apiKey,
    message: 'Mantra MFS100 USB device registered successfully.'
  };
}

async function processMantraScan({ member_id, device_user_id, quality, rawPayload = {} }) {
  // Locate or auto-create Mantra device
  let device = await db.get(`SELECT * FROM biometric_devices WHERE vendor = 'Mantra' AND status = 'Active' LIMIT 1`);
  if (!device) {
    device = await db.get(`SELECT * FROM biometric_devices WHERE vendor = 'Mantra' LIMIT 1`);
  }
  if (!device) {
    const setup = await autoSetupMantraDevice();
    device = setup.device;
  }

  const payload = {
    ...rawPayload,
    IsoTemplate: rawPayload.IsoTemplate || rawPayload.iso_template || rawPayload.isoTemplate || '',
    AnsiTemplate: rawPayload.AnsiTemplate || rawPayload.ansi_template || rawPayload.ansiTemplate || '',
    BitmapData: rawPayload.BitmapData || rawPayload.bitmap_data || rawPayload.bitmapData || '',
    device_user_id: device_user_id || String(member_id || rawPayload.device_user_id || ''),
    Quality: quality || rawPayload.Quality || 70,
    time: new Date().toISOString()
  };

  const headers = {};
  if (device.api_key_enc) {
    headers['x-device-api-key'] = decrypt(device.api_key_enc);
  }

  return await processDeviceEvent({
    deviceId: device.id,
    rawPayload: payload,
    headers
  });
}

module.exports = {
  listDevices,
  getDevice,
  createDevice,
  updateDevice,
  deleteDevice,
  testDevice,
  listEnrollments,
  getMemberEnrollments,
  enrollMember,
  unenrollMember,
  processDeviceEvent,
  checkAccessManual,
  listEvents,
  getStats,
  getRules,
  updateRules,
  getNotificationSettings,
  updateNotificationSettings,
  cleanupRetention,
  autoSetupMantraDevice,
  processMantraScan
};
