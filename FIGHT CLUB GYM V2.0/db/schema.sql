-- Database Schema for Fight Club Gym Membership Management System

-- Settings Table
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    gym_name TEXT DEFAULT 'FIGHT CLUB',
    tagline TEXT DEFAULT 'A JASIR FITNESS ACADEMY',
    address TEXT DEFAULT '1st Floor, Basement Box, Underground Area',
    phone TEXT DEFAULT '+1 (555) 019-9911',
    email TEXT DEFAULT 'contact@fightclub.gym',
    gst_number TEXT DEFAULT '29AAAAA0000A1Z1',
    currency TEXT DEFAULT 'INR',
    date_format TEXT DEFAULT 'YYYY-MM-DD',
    language TEXT DEFAULT 'en',
    theme TEXT DEFAULT 'dark',
    backup_frequency TEXT DEFAULT 'Daily',
    reminder_settings TEXT DEFAULT '{"due_days_before":[1,3,7],"notify_dashboard":true}',
    invoice_template TEXT DEFAULT 'Standard',
    receipt_template TEXT DEFAULT 'Standard',
    logo_path TEXT DEFAULT ''
);

-- Initialize settings if not exists
INSERT OR IGNORE INTO settings (id, gym_name) VALUES (1, 'FIGHT CLUB');

-- Roles Table
CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    permissions TEXT -- JSON array of permissions
);

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    fullname TEXT,
    role_id INTEGER,
    status TEXT DEFAULT 'Active',
    FOREIGN KEY(role_id) REFERENCES roles(id)
);

-- Trainers Table
CREATE TABLE IF NOT EXISTS trainers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fullname TEXT NOT NULL,
    photo_path TEXT DEFAULT '',
    specialization TEXT,
    salary REAL DEFAULT 0,
    status TEXT DEFAULT 'Active',
    performance_notes TEXT
);

-- Staff Table
CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fullname TEXT NOT NULL,
    role TEXT DEFAULT 'Receptionist', -- Receptionist, Manager, Cleaner, Trainer, Admin
    permissions TEXT, -- JSON array of permissions override
    salary REAL DEFAULT 0,
    status TEXT DEFAULT 'Active'
);

-- Members Table
CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_code TEXT UNIQUE,
    fullname TEXT NOT NULL,
    photo_path TEXT DEFAULT '',
    gender TEXT,
    dob TEXT,
    mobile TEXT,
    whatsapp TEXT,
    email TEXT,
    address TEXT,
    emergency_contact TEXT,
    blood_group TEXT,
    joining_date TEXT,
    trainer_id INTEGER,
    medical_notes TEXT,
    admission_fee_paid INTEGER DEFAULT 0, -- 1 if admission fee of Rs 1500 already paid
    status TEXT DEFAULT 'Active', -- Active, Expired, Frozen
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(trainer_id) REFERENCES trainers(id)
);

-- Membership Plans Table
CREATE TABLE IF NOT EXISTS membership_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'Gym', -- Gym, Boxing, Yoga
    duration_months INTEGER DEFAULT 1,
    price REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    tax REAL DEFAULT 0,
    final_amount REAL DEFAULT 0,
    features TEXT, -- JSON array of features included
    status TEXT DEFAULT 'Active' -- Active, Inactive
);

-- Subscriptions Table
CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    plan_id INTEGER,
    start_date TEXT,
    expiry_date TEXT,
    status TEXT DEFAULT 'Active', -- Active, Expired, Frozen
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(member_id) REFERENCES members(id),
    FOREIGN KEY(plan_id) REFERENCES membership_plans(id)
);

-- Payments Table
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT UNIQUE,
    payment_date TEXT,
    member_id INTEGER,
    subscription_id INTEGER,
    amount REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    tax REAL DEFAULT 0,
    paid_amount REAL DEFAULT 0,
    balance REAL DEFAULT 0,
    payment_method TEXT DEFAULT 'Cash', -- Cash, UPI, Card, Bank Transfer
    remarks TEXT,
    FOREIGN KEY(member_id) REFERENCES members(id),
    FOREIGN KEY(subscription_id) REFERENCES subscriptions(id)
);

-- Expenses Table
CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_date TEXT,
    category TEXT, -- Rent, Electricity, Internet, Trainer Salary, Staff Salary, Equipment Purchase, Equipment Repair, Cleaning, Maintenance, Marketing, Miscellaneous
    amount REAL DEFAULT 0,
    vendor TEXT,
    payment_method TEXT DEFAULT 'Cash',
    bill_path TEXT DEFAULT '',
    remarks TEXT
);

-- Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    check_in TEXT, -- ISO string or HH:MM:SS
    check_out TEXT, -- ISO string or HH:MM:SS
    attendance_date TEXT, -- YYYY-MM-DD
    FOREIGN KEY(member_id) REFERENCES members(id)
);

-- Activity Logs (Audit Logs)
CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER,
    username TEXT,
    action TEXT,
    details TEXT
);

-- Reminder Logs
CREATE TABLE IF NOT EXISTS reminder_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    member_id INTEGER,
    type TEXT, -- Call, WhatsApp, SMS, Email
    reminder_type TEXT, -- Expiry, Overdue
    status TEXT DEFAULT 'Sent',
    remarks TEXT,
    FOREIGN KEY(member_id) REFERENCES members(id)
);

-- Backups Table
CREATE TABLE IF NOT EXISTS backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    filename TEXT,
    file_path TEXT,
    type TEXT DEFAULT 'Manual', -- Manual, Auto, Scheduled
    status TEXT DEFAULT 'Verified'
);

-- ============================================================
-- WHATSAPP NOTIFICATION MODULE TABLES
-- ============================================================

-- WhatsApp API Provider Settings (tokens stored AES-256 encrypted)
CREATE TABLE IF NOT EXISTS whatsapp_settings (
    id INTEGER PRIMARY KEY,
    provider TEXT DEFAULT 'meta',
    api_endpoint TEXT DEFAULT '',
    access_token_enc TEXT DEFAULT '',
    phone_number_id TEXT DEFAULT '',
    business_account_id TEXT DEFAULT '',
    webhook_verify_token TEXT DEFAULT '',
    enabled INTEGER DEFAULT 1,
    default_country_code TEXT DEFAULT '+91',
    message_delay_ms INTEGER DEFAULT 1000,
    retry_attempts INTEGER DEFAULT 3,
    daily_limit INTEGER DEFAULT 500,
    quiet_hours_start TEXT DEFAULT '22:00',
    quiet_hours_end TEXT DEFAULT '08:00',
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO whatsapp_settings (id) VALUES (1);

-- WhatsApp Message Templates
CREATE TABLE IF NOT EXISTS whatsapp_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    body TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Seed default templates
INSERT OR IGNORE INTO whatsapp_templates (key, name, category, body) VALUES
('welcome_new_member', 'Welcome Message', 'General',
'Hello {{MemberName}}! 🥊

Welcome to *Fight Club Gym* — where champions are made!

Your membership has been activated successfully.

*Membership ID:* {{MembershipID}}
*Plan:* {{MembershipPlan}}
*Start Date:* {{StartDate}}
*Expiry Date:* {{ExpiryDate}}

We are excited to have you with us. Train hard, stay focused!

— {{GymName}}'),

('membership_new', 'New Membership Confirmation', 'Membership',
'Hello {{MemberName}},

Your *Fight Club* membership has been confirmed! 💪

*Plan:* {{MembershipPlan}}
*Amount Paid:* ₹{{Amount}}
*Valid Till:* {{ExpiryDate}}
*Receipt No:* {{ReceiptNo}}

Thank you for joining us. See you on the floor!

— {{GymName}}'),

('membership_renewal', 'Membership Renewal Confirmation', 'Membership',
'Hello {{MemberName}},

Your *Fight Club* membership has been successfully renewed! ✅

*Plan:* {{MembershipPlan}}
*Amount Paid:* ₹{{Amount}}
*New Expiry Date:* {{ExpiryDate}}
*Receipt No:* {{ReceiptNo}}

Keep up the great work. Train hard!

— {{GymName}}'),

('membership_expiry_reminder', 'Membership Expiry Reminder', 'Membership',
'Hello {{MemberName}},

⚠️ Your *Fight Club* membership is expiring soon!

*Plan:* {{MembershipPlan}}
*Expiry Date:* {{ExpiryDate}}

Please renew your membership to continue your training without interruption.

*Renewal Fee:* ₹{{Amount}}

Contact us to renew:
📞 {{ContactNumber}}

— {{GymName}}'),

('membership_expired', 'Membership Expired', 'Membership',
'Hello {{MemberName}},

❌ Your *Fight Club* membership has expired.

*Plan:* {{MembershipPlan}}
*Expired On:* {{ExpiryDate}}

Please renew immediately to regain access to the gym.

Contact us:
📞 {{ContactNumber}}

— {{GymName}}'),

('membership_freeze', 'Membership Freeze Confirmation', 'Membership',
'Hello {{MemberName}},

Your *Fight Club* membership has been frozen as requested. 🧊

*Frozen For:* {{FreezeDays}} days
*Plan:* {{MembershipPlan}}

Your membership will resume automatically when the freeze period ends.

— {{GymName}}'),

('membership_resume', 'Membership Resumed', 'Membership',
'Hello {{MemberName}},

Great news! 🎉 Your *Fight Club* membership is now active again!

*Plan:* {{MembershipPlan}}
*New Expiry Date:* {{ExpiryDate}}

Welcome back to the ring. Train hard!

— {{GymName}}'),

('payment_received', 'Payment Received', 'Payment',
'Hello {{MemberName}},

✅ We have successfully received your payment!

*Amount Paid:* ₹{{Amount}}
*Receipt No:* {{ReceiptNo}}
*Plan:* {{MembershipPlan}}
*Date:* {{DueDate}}

Thank you for your payment.

— {{GymName}}'),

('payment_receipt', 'Payment Receipt', 'Payment',
'Hello {{MemberName}},

Here is your payment receipt from *Fight Club*:

*Receipt No:* {{ReceiptNo}}
*Invoice No:* {{InvoiceNo}}
*Amount:* ₹{{Amount}}
*Plan:* {{MembershipPlan}}
*Date:* {{DueDate}}

Keep this for your records.

— {{GymName}}'),

('fee_due_reminder', 'Monthly Fee Due Reminder', 'Payment',
'Hello {{MemberName}},

💰 Your *Fight Club* monthly fee is due soon.

*Amount Due:* ₹{{Amount}}
*Due Date:* {{DueDate}}
*Plan:* {{MembershipPlan}}

Please make the payment to avoid interruption of your membership.

📞 {{ContactNumber}}

— {{GymName}}'),

('fee_overdue', 'Overdue Payment Reminder', 'Payment',
'Hello {{MemberName}},

🔴 Your *Fight Club* membership fee is *overdue*.

*Amount Due:* ₹{{Amount}}
*Due Date:* {{DueDate}}

Please clear your dues immediately to continue using the gym facilities.

📞 {{ContactNumber}}

— {{GymName}}'),

('fee_partial', 'Partial Payment Reminder', 'Payment',
'Hello {{MemberName}},

Your *Fight Club* account shows a partial payment.

*Amount Paid:* ₹{{Amount}}
*Balance Due:* Please contact the desk

Kindly clear the remaining balance at your earliest convenience.

📞 {{ContactNumber}}

— {{GymName}}'),

('birthday_wish', 'Birthday Wishes', 'General',
'Happy Birthday {{MemberName}}! 🎂🎉

The entire *Fight Club* team wishes you a fantastic birthday!

May this year bring you strength, health, and all your fitness goals!

Keep punching! 🥊

— {{GymName}}'),

('gym_closure', 'Gym Closure Notice', 'General',
'Hello {{MemberName}},

🚪 Please note that *Fight Club Gym* will be *closed* on the following date(s):

*Date:* {{DueDate}}
*Reason:* Please contact us for details.

We apologize for any inconvenience. Your membership will be extended accordingly.

📞 {{ContactNumber}}

— {{GymName}}'),

('new_offer', 'New Offer / Promotion', 'General',
'Hello {{MemberName}}! 🎯

*Fight Club* has an exciting offer for you!

We are running a special promotion on our membership plans. 

Contact us to know more:
📞 {{ContactNumber}}

Limited time offer — act now!

— {{GymName}}');

-- Configurable Reminder Schedule
CREATE TABLE IF NOT EXISTS whatsapp_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,           -- 'expiry' | 'fee_due'
    days_offset INTEGER NOT NULL, -- negative = before, positive = after
    label TEXT NOT NULL,
    template_key TEXT NOT NULL,
    is_active INTEGER DEFAULT 1
);

-- Seed default reminder schedule
INSERT OR IGNORE INTO whatsapp_reminders (id, type, days_offset, label, template_key, is_active) VALUES
(1, 'expiry', -7, '7 days before expiry', 'membership_expiry_reminder', 1),
(2, 'expiry', -3, '3 days before expiry', 'membership_expiry_reminder', 1),
(3, 'expiry', -1, '1 day before expiry', 'membership_expiry_reminder', 1),
(4, 'expiry',  0, 'On expiry date', 'membership_expired', 1),
(5, 'expiry',  3, '3 days after expiry', 'membership_expired', 1),
(6, 'fee_due', -5, '5 days before due date', 'fee_due_reminder', 1),
(7, 'fee_due', -2, '2 days before due date', 'fee_due_reminder', 1),
(8, 'fee_due',  0, 'On due date', 'fee_due_reminder', 1),
(9, 'fee_due',  3, '3 days after due date', 'fee_overdue', 1),
(10, 'fee_due', 6, '6 days after due date', 'fee_overdue', 1);

-- WhatsApp Message Queue
CREATE TABLE IF NOT EXISTS whatsapp_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    mobile TEXT NOT NULL,
    template_key TEXT NOT NULL,
    payload TEXT DEFAULT '{}',
    scheduled_at TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(member_id) REFERENCES members(id)
);

-- WhatsApp Delivery Logs
CREATE TABLE IF NOT EXISTS whatsapp_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER,
    member_name TEXT DEFAULT '',
    mobile TEXT NOT NULL,
    notification_type TEXT DEFAULT '',
    template_key TEXT DEFAULT '',
    message_body TEXT DEFAULT '',
    status TEXT DEFAULT 'sent',
    api_response TEXT DEFAULT '',
    sent_by TEXT DEFAULT 'system',
    retry_count INTEGER DEFAULT 0,
    error_message TEXT DEFAULT '',
    sent_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(member_id) REFERENCES members(id)
);

-- ============================================================
-- BIOMETRIC ACCESS CONTROL MODULE TABLES
-- ============================================================

-- Biometric Devices Table
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

-- Biometric Enrollments Table (Mapping gym members to hardware device user IDs)
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

-- Access Events Table (Comprehensive log of all biometric entry/exit attempts)
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

-- Access Rules Table (Access policies and business rules)
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

-- Access Notification Settings Table
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

-- Performance & Search Indexes
CREATE INDEX IF NOT EXISTS idx_biometric_enrollments_member ON biometric_enrollments(member_id);
CREATE INDEX IF NOT EXISTS idx_biometric_enrollments_dev_user ON biometric_enrollments(device_id, device_user_id);
CREATE INDEX IF NOT EXISTS idx_access_events_member ON access_events(member_id);
CREATE INDEX IF NOT EXISTS idx_access_events_device ON access_events(device_id);
CREATE INDEX IF NOT EXISTS idx_access_events_time ON access_events(event_time);
CREATE INDEX IF NOT EXISTS idx_access_events_created ON access_events(created_at);

-- WhatsApp Templates for Biometrics
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


