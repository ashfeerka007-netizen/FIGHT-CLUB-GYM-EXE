// Biometric API & Hardware Webhook Routes for Fight Club Gym
// Mounted at /api/biometric (and /api/device-events)

const express = require('express');
const router = express.Router();
const biometricService = require('./service');
const { authenticateUser, requireRole } = require('../security/auth-middleware');
const { deviceWebhookLimiter } = require('../security/rate-limiter');

// ── 1. HARDWARE DEVICE CALLBACK WEBHOOK ───────────────────────────────────────
// Hardware biometric devices POST their verification/scan callbacks here
async function handleDeviceWebhook(req, res) {
  const { deviceId } = req.params;
  try {
    const result = await biometricService.processDeviceEvent({
      deviceId,
      rawPayload: req.body,
      headers: req.headers
    });
    return res.status(result.statusCode).json(result.response);
  } catch (error) {
    console.error(`Hardware callback error for device ${deviceId}:`, error);
    return res.status(500).json({
      status: 'DENIED',
      allowed: false,
      reason: 'Server internal error during biometric processing'
    });
  }
}

// Device Webhook endpoints (rate-limited, protected by per-device API key/signature)
router.post('/webhook/:deviceId', deviceWebhookLimiter, handleDeviceWebhook);
router.post('/events/:deviceId', deviceWebhookLimiter, handleDeviceWebhook);

// ── 2. DEVICE MANAGEMENT (ADMIN) ──────────────────────────────────────────────
router.get('/devices', authenticateUser, async (req, res) => {
  try {
    const devices = await biometricService.listDevices();
    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/devices/:id', authenticateUser, async (req, res) => {
  try {
    const device = await biometricService.getDevice(req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    res.json(device);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/devices', authenticateUser, requireRole(['Super Admin', 'Admin']), async (req, res) => {
  try {
    const result = await biometricService.createDevice(req.body, req.user);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/devices/:id', authenticateUser, requireRole(['Super Admin', 'Admin']), async (req, res) => {
  try {
    const result = await biometricService.updateDevice(req.params.id, req.body, req.user);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/devices/:id', authenticateUser, requireRole(['Super Admin', 'Admin']), async (req, res) => {
  try {
    const result = await biometricService.deleteDevice(req.params.id, req.user);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/devices/:id/test', authenticateUser, async (req, res) => {
  try {
    const result = await biometricService.testDevice(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ── 3. MEMBER ENROLLMENT & LINKING ────────────────────────────────────────────
router.get('/enrollments', authenticateUser, async (req, res) => {
  try {
    const enrollments = await biometricService.listEnrollments(req.query);
    res.json(enrollments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/enrollments/member/:memberId', authenticateUser, async (req, res) => {
  try {
    const list = await biometricService.getMemberEnrollments(req.params.memberId);
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/enrollments', authenticateUser, requireRole(['Super Admin', 'Admin', 'Receptionist']), async (req, res) => {
  try {
    const result = await biometricService.enrollMember(req.body, req.user);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/enrollments/:id', authenticateUser, requireRole(['Super Admin', 'Admin', 'Receptionist']), async (req, res) => {
  try {
    const result = await biometricService.unenrollMember(req.params.id, req.user);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ── 4. ACCESS DECISION SIMULATOR & TEST ───────────────────────────────────────
router.post('/access/check', authenticateUser, async (req, res) => {
  const { member_id, device_id } = req.body;
  if (!member_id) return res.status(400).json({ error: 'member_id is required' });
  try {
    const report = await biometricService.checkAccessManual({ member_id, device_id });
    res.json(report);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ── 5. ACCESS EVENTS & KPIS ──────────────────────────────────────────────────
router.get('/events', authenticateUser, async (req, res) => {
  try {
    const data = await biometricService.listEvents(req.query);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', authenticateUser, async (req, res) => {
  try {
    const stats = await biometricService.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── 6. ACCESS RULES ──────────────────────────────────────────────────────────
router.get('/rules', authenticateUser, async (req, res) => {
  try {
    const rules = await biometricService.getRules();
    res.json(rules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/rules', authenticateUser, requireRole(['Super Admin', 'Admin']), async (req, res) => {
  try {
    const result = await biometricService.updateRules(req.body, req.user);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ── 7. NOTIFICATION SETTINGS ─────────────────────────────────────────────────
router.get('/notifications', authenticateUser, async (req, res) => {
  try {
    const settings = await biometricService.getNotificationSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/notifications', authenticateUser, requireRole(['Super Admin', 'Admin']), async (req, res) => {
  try {
    const result = await biometricService.updateNotificationSettings(req.body, req.user);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ── 8. DATA RETENTION CLEANUP ────────────────────────────────────────────────
router.post('/retention/cleanup', authenticateUser, requireRole(['Super Admin', 'Admin']), async (req, res) => {
  try {
    const { retentionDays = 90, anonymizeOnly = false } = req.body;
    const result = await biometricService.cleanupRetention({ retentionDays, anonymizeOnly }, req.user);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ── 9. MANTRA MFS100 SPECIFIC ENDPOINTS ──────────────────────────────────────
router.post('/mantra/auto-setup', authenticateUser, requireRole(['Super Admin', 'Admin']), async (req, res) => {
  try {
    const result = await biometricService.autoSetupMantraDevice(req.user);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/mantra/scan', authenticateUser, async (req, res) => {
  try {
    const { member_id, device_user_id, quality, rawPayload } = req.body;
    const result = await biometricService.processMantraScan({
      member_id,
      device_user_id,
      quality,
      rawPayload
    });
    res.status(result.statusCode).json(result.response);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = {
  router,
  handleDeviceWebhook
};
