-- Migration 001: Biometric Access Control & WhatsApp Notifications
-- Fight Club Gym Management System

-- 1. Biometric Devices Table
CREATE TABLE IF NOT EXISTS biometric_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    vendor TEXT NOT NULL DEFAULT 'Generic',
    model TEXT DEFAULT '',
    serial_number TEXT DEFAULT '',
    connection_type TEXT DEFAULT 'webhook', -- 'webhook', 'rest_api', 'sdk_push'
    endpoint_url TEXT DEFAULT '',
    api_key_hash TEXT DEFAULT '',
    api_key_enc TEXT DEFAULT '',
    status TEXT DEFAULT 'Active', -- 'Active', 'Inactive', 'Maintenance'
    last_seen_at TEXT DEFAULT NULL,
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Biometric Enrollments Table (Mapping gym members to hardware device user IDs)
CREATE TABLE IF NOT EXISTS biometric_enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    device_id INTEGER NOT NULL,
    device_user_id TEXT NOT NULL,
    biometric_type TEXT DEFAULT 'fingerprint', -- 'fingerprint', 'facial', 'rfid_card', 'palm'
    enrollment_status TEXT DEFAULT 'Enrolled', -- 'Enrolled', 'Pending_Sync', 'Unenrolled', 'Suspended'
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    synced_at TIMESTAMP DEFAULT NULL,
    notes TEXT DEFAULT '',
    FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY(device_id) REFERENCES biometric_devices(id) ON DELETE CASCADE,
    UNIQUE(device_id, device_user_id)
);

-- 3. Access Events Table (Comprehensive log of all biometric entry/exit attempts)
CREATE TABLE IF NOT EXISTS access_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NULL,
    device_id INTEGER NOT NULL,
    device_user_id TEXT NULL,
    event_type TEXT NOT NULL, -- 'identification_success', 'identification_failed', 'check_in', 'check_out', 'tamper', 'heartbeat', 'unknown'
    access_result TEXT NOT NULL, -- 'Granted', 'Denied'
    reason TEXT NOT NULL, -- Detailed reason code / description
    direction TEXT DEFAULT 'check_in', -- 'check_in', 'check_out'
    event_time TEXT NOT NULL,
    raw_reference TEXT NULL, -- Transaction ID or device reference
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE SET NULL,
    FOREIGN KEY(device_id) REFERENCES biometric_devices(id) ON DELETE SET NULL
);

-- 4. Access Rules Table (Access policies and business rules)
CREATE TABLE IF NOT EXISTS access_rules (
    id INTEGER PRIMARY KEY DEFAULT 1,
    name TEXT DEFAULT 'Standard Gym Access Policy',
    enabled INTEGER DEFAULT 1,
    allowed_member_statuses TEXT DEFAULT '["Active"]', -- JSON array of allowed statuses
    deny_if_expired INTEGER DEFAULT 1,
    deny_if_payment_due INTEGER DEFAULT 1,
    grace_period_days INTEGER DEFAULT 0,
    allowed_start_time TEXT DEFAULT '05:00',
    allowed_end_time TEXT DEFAULT '23:00',
    cooldown_seconds INTEGER DEFAULT 45,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO access_rules (id, name, enabled, allowed_member_statuses, deny_if_expired, deny_if_payment_due, grace_period_days, allowed_start_time, allowed_end_time, cooldown_seconds)
VALUES (1, 'Standard Gym Access Policy', 1, '["Active"]', 1, 1, 0, '05:00', '23:00', 45);

-- 5. Access Notification Settings Table
CREATE TABLE IF NOT EXISTS access_notification_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    enabled INTEGER DEFAULT 1,
    notify_on_checkin INTEGER DEFAULT 1,
    notify_on_checkout INTEGER DEFAULT 0,
    notify_on_denied INTEGER DEFAULT 1,
    notify_on_expiry_warning INTEGER DEFAULT 1,
    notify_on_due_warning INTEGER DEFAULT 1,
    template_checkin TEXT DEFAULT 'biometric_checkin',
    template_checkout TEXT DEFAULT 'biometric_checkout',
    template_denied_expired TEXT DEFAULT 'biometric_denied_expired',
    template_denied_overdue TEXT DEFAULT 'biometric_denied_overdue',
    template_denied_inactive TEXT DEFAULT 'biometric_denied_inactive',
    template_unknown_user TEXT DEFAULT 'biometric_unknown_user',
    cooldown_minutes INTEGER DEFAULT 15,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO access_notification_settings (
    id, enabled, notify_on_checkin, notify_on_checkout, notify_on_denied, notify_on_expiry_warning, notify_on_due_warning,
    template_checkin, template_checkout, template_denied_expired, template_denied_overdue, template_denied_inactive, template_unknown_user, cooldown_minutes
) VALUES (
    1, 1, 1, 0, 1, 1, 1,
    'biometric_checkin', 'biometric_checkout', 'biometric_denied_expired', 'biometric_denied_overdue', 'biometric_denied_inactive', 'biometric_unknown_user', 15
);

-- 6. Performance & Search Indexes
CREATE INDEX IF NOT EXISTS idx_biometric_enrollments_member ON biometric_enrollments(member_id);
CREATE INDEX IF NOT EXISTS idx_biometric_enrollments_dev_user ON biometric_enrollments(device_id, device_user_id);
CREATE INDEX IF NOT EXISTS idx_access_events_member ON access_events(member_id);
CREATE INDEX IF NOT EXISTS idx_access_events_device ON access_events(device_id);
CREATE INDEX IF NOT EXISTS idx_access_events_time ON access_events(event_time);
CREATE INDEX IF NOT EXISTS idx_access_events_created ON access_events(created_at);

-- 7. WhatsApp Templates for Biometrics
INSERT OR IGNORE INTO whatsapp_templates (key, name, category, body) VALUES
('biometric_checkin', 'Biometric Check-In Confirmation', 'Biometrics',
'Hello {{MemberName}}! 🥊

✅ *Check-In Verified* at {{GymName}}
*Time:* {{EventTime}}
*Access Point:* {{DeviceName}}

Have a powerful workout session! Train hard, stay focused.

— {{GymName}}'),

('biometric_checkout', 'Biometric Check-Out Confirmation', 'Biometrics',
'Hello {{MemberName}}! 🥊

👋 *Check-Out Recorded* at {{GymName}}
*Time:* {{EventTime}}
*Access Point:* {{DeviceName}}

Great job putting in the work today! Rest, recover, and come back stronger.

— {{GymName}}'),

('biometric_denied_expired', 'Biometric Access Denied - Expired', 'Biometrics',
'Hello {{MemberName}},

⚠️ *Gym Access Denied* at {{GymName}}
*Time:* {{EventTime}}
*Reason:* Your membership plan expired on *{{ExpiryDate}}*.

Please visit the front desk or contact us to renew your membership and restore instant access:
📞 {{ContactNumber}}

— {{GymName}}'),

('biometric_denied_overdue', 'Biometric Access Denied - Payment Overdue', 'Biometrics',
'Hello {{MemberName}},

🔴 *Gym Access Denied* at {{GymName}}
*Time:* {{EventTime}}
*Reason:* Outstanding membership dues of *₹{{Amount}}*.

Please clear your pending balance at the desk to reactivate your biometric entry.
📞 {{ContactNumber}}

— {{GymName}}'),

('biometric_denied_inactive', 'Biometric Access Denied - Account Inactive/Frozen', 'Biometrics',
'Hello {{MemberName}},

⚠️ *Gym Access Denied* at {{GymName}}
*Time:* {{EventTime}}
*Reason:* Your account is currently *{{Status}}*.

If you requested a temporary freeze or need assistance, please contact the front desk:
📞 {{ContactNumber}}

— {{GymName}}'),

('biometric_unknown_user', 'Unrecognized Biometric Attempt', 'Biometrics',
'Hello,

⚠️ An unrecognized biometric scan occurred at *{{DeviceName}}* at *{{EventTime}}*.
If you are a registered member, please ask the front desk to link your biometric ID.

— {{GymName}}'),

('biometric_daily_summary', 'Daily Attendance Summary', 'Biometrics',
'Hello {{MemberName}},

📊 *Daily Fitness Activity Summary*
*Date:* {{EventDate}}
*First Check-In:* {{CheckInTime}}
*Last Check-Out:* {{CheckOutTime}}
*Total Gym Duration:* {{Duration}}

Consistency is key to victory. Keep up the dedication! 🥊

— {{GymName}}');
