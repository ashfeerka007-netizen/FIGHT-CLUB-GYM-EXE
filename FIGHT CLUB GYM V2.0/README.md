# 🥊 Fight Club Gym Management System — Biometric Access Control & WhatsApp Integration

A secure, hardware-agnostic Biometric Access Control and automated WhatsApp notification module integrated into the Fight Club Gym Management System.

---

## 🌟 Key Features

1. **Hardware-Agnostic Biometric Integration & Mantra MFS100 (v54 / v54OTG)**
   - Specialized **Mantra MFS100 Optical USB Fingerprint Sensor** adapter and client integration communicating over local web service port `8035` / RD service.
   - Live browser-to-sensor optical fingerprint capture with real-time Quality & NFIQ scoring.
   - Dedicated **Live Reception Kiosk / Desk Scanner** mode where members place a finger on the Mantra sensor to instantly check in/out and receive WhatsApp notifications.
   - One-click member enrollment with the "Scan on MFS100" button in the Member Linking tab.
   - Device-adapter layer supporting fingerprint, facial recognition, palm vein, and RFID turnstile devices.
   - **Zero Biometric Raw Data in Database**: Raw templates, biometric matching data, and face images are never stored in the gym database. Only device IDs, vendor device user IDs, member mappings, sync state, and timestamped event records are saved.
   - Dedicated authenticated device callback webhook receiver (`/api/device-events/:deviceId` and `/api/biometric/webhook/:deviceId`).
   - Request authentication using per-device API keys or HMAC-SHA256 signatures.

2. **Access Control Decision Engine (`server/biometric/access-rules.js`)**
   - Multi-factor evaluation pipeline:
     - Device verification & operational status.
     - Hardware user ID to member mapping.
     - Anti-passback & duplicate scan cooldown window (configurable: 30–60s).
     - Permitted gym operating hours enforcement (e.g. 05:00 to 23:00).
     - Member account status (Active vs. Frozen vs. Expired).
     - Subscription validity check with configurable expiry grace period (days).
     - Overdue payment fee check.
     - Automatic Check-In vs. Check-Out state tracking based on today's attendance.
   - Fail-closed error handling (never crashes or opens turnstile if database or config is unavailable).

3. **WhatsApp Notification Integration**
   - Real-time WhatsApp messages for:
     - Successful Check-In (`biometric_checkin`)
     - Successful Check-Out (`biometric_checkout`)
     - Denied Entry - Membership Expired (`biometric_denied_expired`)
     - Denied Entry - Overdue Payment (`biometric_denied_overdue`)
     - Denied Entry - Account Frozen/Inactive (`biometric_denied_inactive`)
     - Unrecognized Device User Scan (`biometric_unknown_user`)
     - Daily Attendance Activity Summary (`biometric_daily_summary`)
   - Per-member notification cooldown throttling (e.g. 15 mins) to prevent notification spam from rapid scans.
   - Respects gym quiet hours, daily quotas, and delivery retry policies.

4. **Security & Privacy Hardening**
   - Salted key-derivation password hashing (`scrypt`) with transparent zero-downtime auto-upgrade for legacy SHA-256 password hashes upon login.
   - Role-Based Access Control (RBAC) middleware for sensitive administrative endpoints.
   - Rate limiting on authentication, device callbacks, and uploads.
   - File upload validation (5MB max size, mime-type enforcement).
   - Encrypted device credentials and WhatsApp access tokens using environment-managed AES-256 keys.
   - Server bound to localhost (`127.0.0.1`) by default for local desktop security, with configurable LAN access toggle in settings.
   - Data retention & anonymization cleanup workflows for access event logs.

5. **Admin UI (`#biometric`)**
   - Real-time Overview & KPI monitor.
   - Device Management (add, edit, test ping, API key generation).
   - Member Biometric Linking & hardware UID sync.
   - Live streaming access log table with multi-parameter filtering & CSV export.
   - Manual "Test Access Decision" simulation tool with comprehensive visual diagnostic breakdown.
   - Configurable access rule policies & WhatsApp notification toggles.
   - Legal privacy compliance notice.

---

## 🛠️ API Reference

### Biometric Device Management
- `GET /api/biometric/devices` — List registered devices with connection & scan counters
- `GET /api/biometric/devices/:id` — Get single device details
- `POST /api/biometric/devices` — Register new device (Generates API key)
- `PUT /api/biometric/devices/:id` — Update device parameters or regenerate API key
- `DELETE /api/biometric/devices/:id` — Delete device & remove member hardware links
- `POST /api/biometric/devices/:id/test` — Test device connection / heartbeat ping

### Member Enrollment & Hardware Linking
- `GET /api/biometric/enrollments` — List biometric enrollments (supports `?search=`, `?device_id=`, `?member_id=`)
- `GET /api/biometric/enrollments/member/:memberId` — Get enrollments for specific member
- `POST /api/biometric/enrollments` — Link member to device user ID (`{ member_id, device_id, device_user_id, biometric_type, notes }`)
- `DELETE /api/biometric/enrollments/:id` — Remove biometric hardware link

### Access Control & Event Logs
- `POST /api/device-events/:deviceId` — Authenticated device webhook receiver (Hardware callback)
- `POST /api/biometric/webhook/:deviceId` — Alias webhook route
- `GET /api/biometric/events` — Query access logs (`?date_from=`, `?date_to=`, `?device_id=`, `?member_id=`, `?access_result=`, `?search=`)
- `GET /api/biometric/stats` — KPI analytics (Active devices, enrolled fighters, scans today, granted rate)
- `POST /api/biometric/access/check` — Manual Access Decision Simulator (`{ member_id, device_id }`)

### Rules & Notification Configuration
- `GET /api/biometric/rules` — Get access rules
- `PUT /api/biometric/rules` — Update access rules (grace period, permitted hours, cooldown, dues policy)
- `GET /api/biometric/notifications` — Get WhatsApp biometric notification settings
- `PUT /api/biometric/notifications` — Update notification toggles and cooldown timer
- `POST /api/biometric/retention/cleanup` — Execute data retention cleanup / anonymization

---

## 📡 Sample Device Webhook Payload

### Request:
```http
POST /api/device-events/1 HTTP/1.1
Host: 127.0.0.1:5000
Content-Type: application/json
X-Device-Api-Key: fc_dev_your_device_api_key_here

{
  "device_user_id": "1001",
  "event_type": "identification_success",
  "direction": "auto",
  "biometric_type": "fingerprint",
  "time": "2026-09-01T08:30:00.000Z",
  "raw_reference": "scan_tx_88192"
}
```

### Response (Access Granted):
```json
{
  "status": "GRANTED",
  "allowed": true,
  "access_result": "Granted",
  "reason": "Access Granted: Active Member",
  "direction": "check_in",
  "timestamp": "2026-09-01T08:30:00.120Z",
  "member": {
    "id": 1,
    "name": "David Fincher",
    "member_code": "FC-1001",
    "status": "Active"
  }
}
```

### Response (Access Denied - Expired):
```json
{
  "status": "DENIED",
  "allowed": false,
  "access_result": "Denied",
  "reason": "Membership expired on 2026-06-01 (92 days past expiry)",
  "direction": "check_in",
  "timestamp": "2026-09-01T08:30:00.120Z",
  "member": {
    "id": 6,
    "name": "Jared Leto",
    "member_code": "FC-1006",
    "status": "Expired"
  }
}
```

---

## 🔒 Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Server listening port | `5000` |
| `HOST` | Server host binding (`127.0.0.1` for local, `0.0.0.0` for LAN) | `127.0.0.1` |
| `APP_SECRET` / `BIOMETRIC_SECRET` | Master 32-byte secret for vault encryption & HMAC | Auto-generated in `.vault_secret` |
| `WA_SECRET` | WhatsApp credentials encryption key | Auto-generated in `.vault_secret` |
| `ALLOWED_ORIGINS` | Comma-separated allowed CORS browser origins | `http://localhost:5000,http://127.0.0.1:5000` |

---

## 🧪 Running Automated Tests

Run the full automated test suite covering crypto, password migration, device authentication, rules engine, anti-passback cooldown, WhatsApp throttle, and event pipelines:

```powershell
.\node.exe test/biometric.test.js
```

Or via npm:
```powershell
npm test
```

---

## 📱 Mock Biometric Device CLI Simulator

Simulate a device scan directly from the command line:

```powershell
.\node.exe server/biometric/mock-device.js <deviceId> <deviceUserId> <apiKey>
```

Example:
```powershell
.\node.exe server/biometric/mock-device.js 1 1001 fc_dev_your_api_key
```

---

## 🔍 Mantra MFS100 (v54 / v54OTG) Setup Guide

To connect and use the **Mantra MFS100 Optical Fingerprint Sensor**:

1. **Install Mantra Drivers & RD Service on Windows**:
   - Download & install **MFS100 Driver** (v9.2.0.0 or latest) from [Mantra Softech Official Portal](https://download.mantratecapp.com/).
   - Download & install **MFS100 Client Web Service / RD Service**.
2. **Connect Hardware**:
   - Plug the Mantra MFS100 sensor into a USB 2.0/3.0 port or via an OTG adapter.
3. **Verify Windows Service Status**:
   - Open Windows Services (`services.msc`) and verify that `Mantra MFS100 Client Service` (or `MFS100 RD Service`) is **Running** on `http://127.0.0.1:8035`.
4. **Open Gym Management System**:
   - Navigate to **Biometric Access > Mantra MFS100**.
   - The status bulb will turn 🟢 **ONLINE & Ready**.
   - Click **"Capture Test Fingerprint"** to verify optical scan and quality meter.
5. **Member Enrollment**:
   - Go to **Member Linking** tab.
   - Select a fighter and click **"Scan on MFS100"**.
   - Place member's finger on sensor prism to capture and link in one click.
6. **Reception Desk / Kiosk Mode**:
   - Click **"Live Desk Scanner"** in the top header or in the Mantra tab.
   - When members place their finger on the sensor, the system instantly evaluates active subscriptions, grace periods, and overdue fees, registers attendance, and triggers automated WhatsApp entry/exit messages!

---

## ⚖️ Legal & Biometric Privacy Disclaimer

> **Operator Responsibility**: Biometric raw templates, images, and matching data are never collected, processed, or stored in this application. The gym operator remains strictly responsible for obtaining explicit member consent, adhering to local data privacy regulations (e.g. GDPR, CCPA, BIPA, Indian DPDP Act), and maintaining physical hardware compliance.
