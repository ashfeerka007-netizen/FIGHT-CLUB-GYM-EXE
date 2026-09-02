// Automated Test Suite for Biometric Access Control & WhatsApp Integration
// Fight Club Gym Management System

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const db = require('../server/db');
const biometricService = require('../server/biometric/service');
const { evaluateAccess, isWithinTimeWindow } = require('../server/biometric/access-rules');
const GenericWebhookAdapter = require('../server/biometric/adapters/generic-webhook');
const { generateDeviceApiKey, verifyDeviceApiKey, generateHmacSignature, verifyHmacSignature, encrypt, decrypt } = require('../server/security/crypto-vault');
const { hashPassword, hashPasswordSync, verifyPassword } = require('../server/security/passwords');
const { dispatchAccessNotification, notificationThrottleMap } = require('../server/biometric/notifications');

let passedTests = 0;
let failedTests = 0;

async function test(name, fn) {
  try {
    process.stdout.write(`  [TEST] ${name} ... `);
    await fn();
    console.log('\x1b[32mPASSED\x1b[0m');
    passedTests++;
  } catch (err) {
    console.log('\x1b[31mFAILED\x1b[0m');
    console.error('    Error:', err.message);
    failedTests++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🥊 FIGHT CLUB GYM: BIOMETRIC & SECURITY TEST SUITE 🥊');
  console.log('======================================================\n');

  // Wait for DB initialization
  await db.initPromise;

  // ── 1. CRYPTO & VAULT SECURITY TESTS ───────────────────────────────────────
  console.log('--- 1. Cryptography & Vault Security ---');

  await test('AES-256-CBC Encrypt and Decrypt roundtrip', () => {
    const plain = 'super_secret_whatsapp_token_999911';
    const cipher = encrypt(plain);
    assert(cipher.includes(':'), 'Encrypted output should contain IV:Data format');
    const decrypted = decrypt(cipher);
    assert.strictEqual(decrypted, plain, 'Decrypted text must match original plain text');
  });

  await test('Device API Key Generation & Verification', () => {
    const { apiKey, hash, masked } = generateDeviceApiKey('Main Turnstile');
    assert(apiKey.startsWith('fc_dev_'), 'API key must have fc_dev_ prefix');
    assert(hash.length === 64, 'Hash must be 64-character SHA-256 hex');
    assert.strictEqual(verifyDeviceApiKey(apiKey, hash), true, 'Valid API key must verify against hash');
    assert.strictEqual(verifyDeviceApiKey('fc_dev_invalid_key_123', hash), false, 'Invalid API key must fail');
  });

  await test('HMAC-SHA256 Payload Signature Verification', () => {
    const payload = JSON.stringify({ device_user_id: '1001', event_type: 'identification_success' });
    const secretKey = 'device_shared_secret_key_8822';
    const sig = generateHmacSignature(payload, secretKey);
    assert(sig.length === 64, 'Signature should be 64-char hex string');
    assert.strictEqual(verifyHmacSignature(payload, sig, secretKey), true, 'Valid signature must verify');
    assert.strictEqual(verifyHmacSignature(payload, 'bad_sig_hex_123', secretKey), false, 'Bad signature must reject');
  });

  // ── 2. PASSWORD HASHING & AUTO-MIGRATION TESTS ─────────────────────────────
  console.log('\n--- 2. Password Hashing & Transparent Migration ---');

  await test('Modern Salted scrypt Hashing & Verification', async () => {
    const rawPass = 'SecretFight123!';
    const hash = await hashPassword(rawPass);
    assert(hash.startsWith('$scrypt$'), 'Hash must start with $scrypt$ format');
    const result = await verifyPassword(rawPass, hash);
    assert.strictEqual(result.valid, true, 'Correct password must verify');
    assert.strictEqual(result.needsUpgrade, false, 'Modern scrypt hash does not need upgrade');

    const badResult = await verifyPassword('WrongPassword', hash);
    assert.strictEqual(badResult.valid, false, 'Wrong password must be rejected');
  });

  await test('Legacy SHA-256 Hash Verification & Upgrade Detection', async () => {
    const legacyPass = 'admin123';
    // SHA-256('admin123') = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9'
    const legacySha256Hash = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';

    const verifyRes = await verifyPassword(legacyPass, legacySha256Hash);
    assert.strictEqual(verifyRes.valid, true, 'Legacy SHA-256 hash must verify correctly');
    assert.strictEqual(verifyRes.needsUpgrade, true, 'Legacy hash must flag needsUpgrade = true');
    assert(verifyRes.newHash && verifyRes.newHash.startsWith('$scrypt$'), 'New upgrade hash must be in scrypt format');
  });

  // ── 3. DEVICE ADAPTER PARSER & VALIDATION TESTS ─────────────────────────────
  console.log('\n--- 3. Biometric Device Adapter Layer ---');

  const adapter = new GenericWebhookAdapter();
  const MantraAdapter = require('../server/biometric/adapters/mantra');
  const mantraAdapter = new MantraAdapter();

  await test('Generic Adapter Parses JSON Payload Accurately', () => {
    const raw = {
      device_user_id: '1001',
      event_type: 'pass',
      door_direction: 'in',
      mode: 'facial',
      time: '2026-09-01T08:30:00.000Z'
    };
    const parsed = adapter.parseEvent(raw, {});
    assert.strictEqual(parsed.deviceUserId, '1001');
    assert.strictEqual(parsed.eventType, 'identification_success');
    assert.strictEqual(parsed.direction, 'check_in');
    assert.strictEqual(parsed.biometricType, 'facial');
  });

  await test('Mantra MFS100 Adapter Parses Capture Payload with Quality & NFIQ', () => {
    const rawMantra = {
      ErrorCode: 0,
      ErrorDescription: 'Success',
      DeviceUserId: '1001',
      Quality: 88,
      Nfiq: 1,
      SerialNo: 'MFS100-998877',
      BitmapData: 'base64_img_sample',
      IsoTemplate: 'base64_iso_template_sample'
    };
    const parsed = mantraAdapter.parseEvent(rawMantra, {});
    assert.strictEqual(parsed.deviceUserId, '1001');
    assert.strictEqual(parsed.eventType, 'identification_success');
    assert.strictEqual(parsed.biometricType, 'fingerprint');
    assert.strictEqual(parsed.quality, 88);
    assert.strictEqual(parsed.nfiq, 1);
    assert.strictEqual(parsed.deviceStatus, 'ok');
  });

  await test('Mantra MFS100 Adapter Translates Device Error Codes Correctly', () => {
    const disconnectedRaw = {
      ErrorCode: 1001,
      ErrorDescription: 'Device not connected'
    };
    const parsedDisconnected = mantraAdapter.parseEvent(disconnectedRaw, {});
    assert.strictEqual(parsedDisconnected.eventType, 'identification_failed');
    assert.strictEqual(parsedDisconnected.deviceStatus, 'error');
    assert.strictEqual(parsedDisconnected.errorCode, 1001);

    const badPlacementRaw = {
      ErrorCode: -1307,
      ErrorDescription: 'Finger not placed properly'
    };
    const parsedBadPlacement = mantraAdapter.parseEvent(badPlacementRaw, {});
    assert.strictEqual(parsedBadPlacement.eventType, 'identification_failed');
    assert.strictEqual(parsedBadPlacement.errorCode, -1307);
  });

  await test('Generic Adapter Authenticates Device via API Key Header', () => {
    const { apiKey, hash } = generateDeviceApiKey('Test Gate');
    const mockDevice = { id: 99, status: 'Active', api_key_hash: hash };
    const valid = adapter.validateRequest({}, { 'x-device-api-key': apiKey }, mockDevice);
    assert.strictEqual(valid, true, 'Adapter should authenticate matching API Key header');

    const invalid = adapter.validateRequest({}, { 'x-device-api-key': 'fc_dev_wrong_key' }, mockDevice);
    assert.strictEqual(invalid, false, 'Adapter should reject mismatched API Key header');
  });

  await test('Mantra Auto-Setup Provisions Device in Database', async () => {
    const setup = await biometricService.autoSetupMantraDevice();
    assert(setup.success, 'Mantra setup should succeed');
    assert(setup.device && setup.device.vendor === 'Mantra', 'Device vendor must be Mantra');
    assert.strictEqual(setup.device.model, 'MFS100 V54/V54OTG');
  });

  // ── 4. ACCESS CONTROL ENGINE DECISION RULES ────────────────────────────────
  console.log('\n--- 4. Access Control Decision Engine ---');

  // Setup/ensure test device with known API Key
  const { apiKey: testDeviceApiKey, hash: testDeviceHash } = generateDeviceApiKey('Main Turnstile Test');
  await db.run(
    `INSERT OR REPLACE INTO biometric_devices (id, name, vendor, model, connection_type, api_key_hash, api_key_enc, status)
     VALUES (1, 'Main Turnstile Test', 'Generic', 'FC-Face-V1', 'webhook', ?, ?, 'Active')`,
    [testDeviceHash, encrypt(testDeviceApiKey)]
  );
  const testDevice = await db.get(`SELECT * FROM biometric_devices WHERE id = 1`);

  // Ensure test members exist:
  // Member 101: Active member with future subscription
  await db.run(
    `INSERT OR REPLACE INTO members (id, member_code, fullname, mobile, status)
     VALUES (101, 'FC-TEST-ACTIVE', 'Active Fighter', '9876543210', 'Active')`
  );
  await db.run(
    `INSERT OR REPLACE INTO subscriptions (id, member_id, plan_id, start_date, expiry_date, status)
     VALUES (101, 101, 1, '2026-01-01', '2027-12-31', 'Active')`
  );
  await biometricService.enrollMember({
    member_id: 101,
    device_id: testDevice.id,
    device_user_id: '101',
    biometric_type: 'fingerprint'
  });

  // Member 102: Expired member with past subscription
  await db.run(
    `INSERT OR REPLACE INTO members (id, member_code, fullname, mobile, status)
     VALUES (102, 'FC-TEST-EXPIRED', 'Expired Fighter', '9876543211', 'Expired')`
  );
  await db.run(
    `INSERT OR REPLACE INTO subscriptions (id, member_id, plan_id, start_date, expiry_date, status)
     VALUES (102, 102, 1, '2026-01-01', '2026-06-01', 'Expired')`
  );
  await biometricService.enrollMember({
    member_id: 102,
    device_id: testDevice.id,
    device_user_id: '102',
    biometric_type: 'facial'
  });

  // Member 103: Frozen member
  await db.run(
    `INSERT OR REPLACE INTO members (id, member_code, fullname, mobile, status)
     VALUES (103, 'FC-TEST-FROZEN', 'Frozen Fighter', '9876543212', 'Frozen')`
  );
  await db.run(
    `INSERT OR REPLACE INTO subscriptions (id, member_id, plan_id, start_date, expiry_date, status)
     VALUES (103, 103, 1, '2026-01-01', '2026-12-31', 'Frozen')`
  );
  await biometricService.enrollMember({
    member_id: 103,
    device_id: testDevice.id,
    device_user_id: '103',
    biometric_type: 'fingerprint'
  });

  // Member 104: Overdue payment member
  await db.run(
    `INSERT OR REPLACE INTO members (id, member_code, fullname, mobile, status)
     VALUES (104, 'FC-TEST-OVERDUE', 'Overdue Fighter', '9876543213', 'Active')`
  );
  await db.run(
    `INSERT OR REPLACE INTO subscriptions (id, member_id, plan_id, start_date, expiry_date, status)
     VALUES (104, 104, 1, '2026-01-01', '2027-12-31', 'Active')`
  );
  await db.run(
    `INSERT OR REPLACE INTO payments (id, invoice_number, payment_date, member_id, subscription_id, amount, paid_amount, balance)
     VALUES (9999, 'INV-TEST-DUE', '2026-08-01', 104, 104, 2500, 1000, 1500)`
  );
  await biometricService.enrollMember({
    member_id: 104,
    device_id: testDevice.id,
    device_user_id: '104',
    biometric_type: 'fingerprint'
  });

  await test('Valid Active Member Access -> GRANTED', async () => {
    await db.run(`DELETE FROM access_events WHERE member_id = 101`);
    await db.run(`UPDATE access_rules SET cooldown_seconds = 0, deny_if_expired = 1, deny_if_payment_due = 1 WHERE id = 1`);

    const parsedEvent = {
      deviceUserId: '101',
      eventType: 'identification_success',
      eventTime: new Date().toISOString(),
      direction: 'check_in',
      biometricType: 'fingerprint'
    };

    const decision = await evaluateAccess({ device: testDevice, parsedEvent });
    assert.strictEqual(decision.allowed, true, 'Active member should be granted access');
    assert.strictEqual(decision.accessResult, 'Granted');
    assert.strictEqual(decision.member.id, 101);
  });

  await test('Expired Member Access -> DENIED with Expired Reason', async () => {
    await db.run(`DELETE FROM access_events WHERE member_id = 102`);
    await db.run(`UPDATE access_rules SET deny_if_expired = 1, grace_period_days = 0 WHERE id = 1`);

    const parsedEvent = {
      deviceUserId: '102',
      eventType: 'identification_success',
      eventTime: new Date().toISOString(),
      direction: 'check_in',
      biometricType: 'facial'
    };

    const decision = await evaluateAccess({ device: testDevice, parsedEvent });
    assert.strictEqual(decision.allowed, false, 'Expired member should be denied access');
    assert.strictEqual(decision.accessResult, 'Denied');
    assert(decision.reason.includes('expired') || decision.reason.includes('Expired'), `Reason should mention expiry, got: ${decision.reason}`);
  });

  await test('Expired Member within Grace Period -> GRANTED with Warning', async () => {
    await db.run(`DELETE FROM access_events WHERE member_id = 102`);
    // Ensure member status allowed list includes Expired or Active, and give 365 days grace period for testing
    await db.run(`UPDATE access_rules SET allowed_member_statuses = '["Active", "Expired"]', deny_if_expired = 1, grace_period_days = 365 WHERE id = 1`);

    const parsedEvent = {
      deviceUserId: '102',
      eventType: 'identification_success',
      eventTime: new Date().toISOString(),
      direction: 'check_in',
      biometricType: 'facial'
    };

    const decision = await evaluateAccess({ device: testDevice, parsedEvent });
    assert.strictEqual(decision.allowed, true, 'Member within grace period should be allowed');
    assert(decision.warning && decision.warning.includes('Grace Period'), 'Should note active grace period');

    // Reset rules
    await db.run(`UPDATE access_rules SET allowed_member_statuses = '["Active"]', grace_period_days = 0 WHERE id = 1`);
  });

  await test('Frozen Member Access -> DENIED', async () => {
    await db.run(`DELETE FROM access_events WHERE member_id = 103`);

    const parsedEvent = {
      deviceUserId: '103',
      eventType: 'identification_success',
      eventTime: new Date().toISOString(),
      direction: 'check_in',
      biometricType: 'fingerprint'
    };

    const decision = await evaluateAccess({ device: testDevice, parsedEvent });
    assert.strictEqual(decision.allowed, false, 'Frozen member should be denied');
    assert(decision.reason.includes('Frozen'), `Reason should mention Frozen, got: ${decision.reason}`);
  });

  await test('Overdue Payment Member Access -> DENIED with Balance Due Reason', async () => {
    await db.run(`DELETE FROM access_events WHERE member_id = 104`);
    await db.run(`UPDATE access_rules SET deny_if_payment_due = 1 WHERE id = 1`);

    const parsedEvent = {
      deviceUserId: '104',
      eventType: 'identification_success',
      eventTime: new Date().toISOString(),
      direction: 'check_in',
      biometricType: 'fingerprint'
    };

    const decision = await evaluateAccess({ device: testDevice, parsedEvent });
    assert.strictEqual(decision.allowed, false, 'Overdue member should be denied');
    assert(decision.reason.includes('Overdue') || decision.reason.includes('balance'), `Reason should mention balance/overdue, got: ${decision.reason}`);
  });

  await test('Unrecognized Hardware User ID -> DENIED', async () => {
    const parsedEvent = {
      deviceUserId: '9999999_NON_EXISTENT',
      eventType: 'identification_success',
      eventTime: new Date().toISOString(),
      direction: 'check_in'
    };

    const decision = await evaluateAccess({ device: testDevice, parsedEvent });
    assert.strictEqual(decision.allowed, false, 'Unrecognized user should be denied');
    assert(decision.reason.includes('Unrecognized'), `Reason should mention Unrecognized, got: ${decision.reason}`);
  });

  await test('Duplicate Scan Cooldown Prevention (Anti-Passback)', async () => {
    await db.run(`DELETE FROM access_events WHERE member_id = 101`);
    await db.run(`UPDATE access_rules SET cooldown_seconds = 60 WHERE id = 1`);

    // First scan -> Allowed
    const parsedEvent1 = {
      deviceUserId: '101',
      eventType: 'identification_success',
      eventTime: new Date().toISOString(),
      direction: 'check_in'
    };
    const decision1 = await evaluateAccess({ device: testDevice, parsedEvent: parsedEvent1 });
    assert.strictEqual(decision1.allowed, true, 'First scan must be allowed');

    // Record granted event in access_events
    await db.run(
      `INSERT INTO access_events (member_id, device_id, device_user_id, event_type, access_result, reason, direction, event_time)
       VALUES (101, 1, '101', 'identification_success', 'Granted', 'Active Member', 'check_in', ?)`,
      [new Date().toISOString()]
    );

    // Second scan immediately after -> Denied by Cooldown
    const decision2 = await evaluateAccess({ device: testDevice, parsedEvent: parsedEvent1 });
    assert.strictEqual(decision2.allowed, false, 'Immediate second scan must be blocked by cooldown');
    assert(decision2.reason.includes('Cooldown'), `Reason should mention Cooldown, got: ${decision2.reason}`);

    // Reset cooldown
    await db.run(`UPDATE access_rules SET cooldown_seconds = 0 WHERE id = 1`);
  });

  await test('Operating Access Hours Validation Helper', () => {
    assert.strictEqual(isWithinTimeWindow('10:00', '05:00', '23:00'), true);
    assert.strictEqual(isWithinTimeWindow('04:00', '05:00', '23:00'), false);
    assert.strictEqual(isWithinTimeWindow('23:30', '05:00', '23:00'), false);
    // Overnight window (e.g. 21:00 to 05:00)
    assert.strictEqual(isWithinTimeWindow('23:00', '21:00', '05:00'), true);
    assert.strictEqual(isWithinTimeWindow('02:00', '21:00', '05:00'), true);
    assert.strictEqual(isWithinTimeWindow('12:00', '21:00', '05:00'), false);
  });

  // ── 5. WHATSAPP NOTIFICATION THROTTLING ─────────────────────────────────────
  console.log('\n--- 5. WhatsApp Notification Throttling ---');

  await test('Biometric WhatsApp Notification Cooldown Throttle', async () => {
    notificationThrottleMap.clear();

    const decision = {
      allowed: true,
      direction: 'check_in',
      reason: 'Active Member',
      member: {
        id: 101,
        fullname: 'Active Fighter',
        member_code: 'FC-TEST-ACTIVE',
        mobile: '9876543210',
        whatsapp: '9876543210'
      },
      ruleDetails: {}
    };

    // First trigger sets throttle
    const notif1 = await dispatchAccessNotification({ decision, device: testDevice });
    // Regardless of whether live WhatsApp API key is set, check that second dispatch is throttled
    const notif2 = await dispatchAccessNotification({ decision, device: testDevice });
    assert.strictEqual(notif2.sent, false, 'Immediate second notification must be throttled');
    assert(notif2.reason && notif2.reason.includes('throttled'), `Reason should mention throttled, got: ${notif2.reason}`);
  });

  // ── 6. FULL END-TO-END EVENT PROCESSING PIPELINE ────────────────────────────
  console.log('\n--- 6. End-to-End Device Event Ingestion Pipeline ---');

  await test('Full processDeviceEvent with Attendance Sync', async () => {
    await db.run(`DELETE FROM access_events WHERE member_id = 101`);
    await db.run(`UPDATE access_rules SET cooldown_seconds = 0 WHERE id = 1`);

    const result = await biometricService.processDeviceEvent({
      deviceId: 1,
      rawPayload: {
        device_user_id: '101',
        event_type: 'identification_success',
        direction: 'check_in'
      },
      headers: {
        'x-device-api-key': testDeviceApiKey
      }
    });

    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.response.allowed, true);
    assert.strictEqual(result.response.status, 'GRANTED');

    // Verify logged in access_events
    const eventLog = await db.get(
      `SELECT * FROM access_events WHERE member_id = 101 ORDER BY id DESC LIMIT 1`
    );
    assert(eventLog, 'Event must be logged in access_events');
    assert.strictEqual(eventLog.access_result, 'Granted');

    // Verify attendance record created
    const todayStr = new Date().toISOString().split('T')[0];
    const attLog = await db.get(
      `SELECT * FROM attendance WHERE member_id = 101 AND attendance_date = ? ORDER BY id DESC LIMIT 1`,
      [todayStr]
    );
    assert(attLog, 'Attendance record must be synchronized');
  });

  await test('Mantra processMantraScan Live Pipeline Verification', async () => {
    await db.run(`DELETE FROM access_events WHERE member_id = 101`);
    await db.run(`UPDATE access_rules SET cooldown_seconds = 0 WHERE id = 1`);

    // Enroll member 101 on Mantra device
    const mantraDev = await db.get(`SELECT * FROM biometric_devices WHERE vendor = 'Mantra' LIMIT 1`);
    await biometricService.enrollMember({
      member_id: 101,
      device_id: mantraDev.id,
      device_user_id: 'M101',
      biometric_type: 'fingerprint'
    });

    const scanResult = await biometricService.processMantraScan({
      member_id: 101,
      device_user_id: 'M101',
      quality: 85,
      rawPayload: {
        ErrorCode: 0,
        ErrorDescription: 'Success',
        SerialNo: 'MFS100-TEST'
      }
    });

    assert.strictEqual(scanResult.statusCode, 200);
    assert.strictEqual(scanResult.response.allowed, true);
    assert.strictEqual(scanResult.response.status, 'GRANTED');
  });

  // Clean up test records
  await db.run(`DELETE FROM access_events WHERE member_id IN (101, 102, 103, 104)`);
  await db.run(`DELETE FROM attendance WHERE member_id IN (101, 102, 103, 104)`);
  await db.run(`DELETE FROM biometric_enrollments WHERE member_id IN (101, 102, 103, 104)`);
  await db.run(`DELETE FROM payments WHERE member_id = 104`);
  await db.run(`DELETE FROM subscriptions WHERE member_id IN (101, 102, 103, 104)`);
  await db.run(`DELETE FROM members WHERE id IN (101, 102, 103, 104)`);

  console.log('\n======================================================');
  console.log(`TOTAL TESTS: ${passedTests + failedTests} | \x1b[32mPASSED: ${passedTests}\x1b[0m | \x1b[${failedTests === 0 ? '32' : '31'}mFAILED: ${failedTests}\x1b[0m`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
