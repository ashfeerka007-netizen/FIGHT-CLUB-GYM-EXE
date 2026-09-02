const crypto = require('crypto');
const db = require('../db');
const { encrypt, decrypt } = require('../security/crypto-vault');

// ── Placeholder resolution ────────────────────────────────────────────────────
function resolvePlaceholders(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || `{{${key}}}`);
}

// ── Adapter factory ───────────────────────────────────────────────────────────
function getAdapter(settings) {
  const provider = (settings.provider || 'meta').toLowerCase();
  const adapters = {
    meta:      require('./adapters/meta'),
    twilio:    require('./adapters/twilio'),
    wati:      require('./adapters/wati'),
    interakt:  require('./adapters/interakt'),
  };
  return adapters[provider] || adapters.meta;
}

// ── Core send function ────────────────────────────────────────────────────────
async function sendMessage({ memberId, memberName, mobile, templateKey, customMessage, data = {}, sentBy = 'system' }) {
  const settings = await db.get('SELECT * FROM whatsapp_settings WHERE id = 1');
  if (!settings || !settings.enabled) {
    return { success: false, reason: 'WhatsApp notifications are disabled' };
  }

  // Check quiet hours
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const qs = settings.quiet_hours_start || '22:00';
  const qe = settings.quiet_hours_end   || '08:00';
  if (isInQuietHours(hhmm, qs, qe)) {
    return { success: false, reason: `Quiet hours (${qs} – ${qe})` };
  }

  let messageBody = '';
  let notificationType = 'Custom Message';
  let tplKey = templateKey || 'custom';

  const gymSettings = await db.get('SELECT * FROM settings WHERE id = 1');
  const mergedData = {
    GymName: gymSettings?.gym_name || 'Fight Club',
    ContactNumber: gymSettings?.phone || '',
    MemberName: memberName || 'Member',
    ...data
  };

  if (customMessage) {
    messageBody = resolvePlaceholders(customMessage, mergedData);
    notificationType = 'Direct Custom Message';
  } else {
    // Load template
    const tpl = await db.get('SELECT * FROM whatsapp_templates WHERE key = ? AND is_active = 1', [templateKey]);
    if (!tpl) return { success: false, reason: `Template "${templateKey}" not found or inactive` };
    notificationType = tpl.name;
    messageBody = resolvePlaceholders(tpl.body, mergedData);
  }

  // Format mobile with country code
  const countryCode = settings.default_country_code || '+91';
  const formattedMobile = formatMobile(mobile, countryCode);

  // Decrypt token and get adapter
  const token = decrypt(settings.access_token_enc);
  const adapter = getAdapter(settings);

  let status = 'sent';
  let apiResponse = '';
  let errorMessage = '';

  try {
    const result = await adapter.send({
      mobile: formattedMobile,
      message: messageBody,
      token,
      phoneNumberId: settings.phone_number_id,
      businessAccountId: settings.business_account_id,
      apiEndpoint: settings.api_endpoint,
    });
    apiResponse = JSON.stringify(result);
  } catch (err) {
    status = 'failed';
    errorMessage = err.message;
  }

  // Write log
  await db.run(
    `INSERT INTO whatsapp_logs
     (member_id, member_name, mobile, notification_type, template_key, message_body, status, api_response, sent_by, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [memberId || null, memberName || '', formattedMobile, notificationType, tplKey, messageBody, status, apiResponse, sentBy, errorMessage]
  );

  return { success: status === 'sent', messageBody, status, error: errorMessage };
}

// ── Bulk send ────────────────────────────────────────────────────────────────
async function sendBulk({ members, templateKey, data = {}, sentBy = 'staff' }) {
  const settings = await db.get('SELECT * FROM whatsapp_settings WHERE id = 1');
  const delay = settings?.message_delay_ms || 1000;
  const results = [];
  for (const member of members) {
    const result = await sendMessage({
      memberId: member.id,
      memberName: member.fullname,
      mobile: member.mobile,
      templateKey,
      data: { MemberName: member.fullname, ...data },
      sentBy,
    });
    results.push({ member: member.fullname, ...result });
    await sleep(delay);
  }
  return results;
}

// ── Test connection ──────────────────────────────────────────────────────────
async function testConnection() {
  const settings = await db.get('SELECT * FROM whatsapp_settings WHERE id = 1');
  if (!settings) return { success: false, error: 'No settings found' };
  const token = decrypt(settings.access_token_enc);
  if (!token) return { success: false, error: 'No API token configured' };
  const adapter = getAdapter(settings);
  try {
    const result = await adapter.test({ token, phoneNumberId: settings.phone_number_id, apiEndpoint: settings.api_endpoint });
    return { success: true, result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Utilities ────────────────────────────────────────────────────────────────
function formatMobile(mobile, countryCode) {
  if (!mobile) return '';
  const digits = mobile.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `${countryCode}${digits}`;
  return mobile.startsWith('+') ? mobile : `+${digits}`;
}

function isInQuietHours(now, start, end) {
  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end; // crosses midnight
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { sendMessage, sendBulk, testConnection, encrypt, decrypt, resolvePlaceholders };
