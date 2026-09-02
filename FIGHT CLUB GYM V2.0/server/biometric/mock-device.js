// Mock Biometric Hardware Device Simulator
// Generates realistic device webhook callbacks for testing turnstiles and biometric access

const http = require('http');
const { generateHmacSignature } = require('../security/crypto-vault');

/**
 * Send simulated webhook event to local or remote gym server
 */
function sendMockEvent({
  host = '127.0.0.1',
  port = 5000,
  deviceId = 1,
  apiKey = '',
  secretKey = '',
  deviceUserId = '1001',
  eventType = 'identification_success',
  direction = 'auto',
  biometricType = 'fingerprint',
  rawReference = `sim_scan_${Date.now()}`
}) {
  return new Promise((resolve, reject) => {
    const payload = {
      device_user_id: deviceUserId,
      event_type: eventType,
      direction,
      biometric_type: biometricType,
      time: new Date().toISOString(),
      raw_reference: rawReference
    };

    const payloadString = JSON.stringify(payload);

    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payloadString)
    };

    if (apiKey) {
      headers['X-Device-Api-Key'] = apiKey;
    }

    if (secretKey) {
      headers['X-Signature-SHA256'] = generateHmacSignature(payloadString, secretKey);
    }

    const options = {
      hostname: host,
      port,
      path: `/api/device-events/${deviceId}`,
      method: 'POST',
      headers
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ statusCode: res.statusCode, body: json });
        } catch {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(payloadString);
    req.end();
  });
}

// CLI Interactive Runner when executed directly: node server/biometric/mock-device.js
if (require.main === module) {
  const args = process.argv.slice(2);
  const deviceId = parseInt(args[0] || '1', 10);
  const deviceUserId = args[1] || '1001';
  const apiKey = args[2] || '';

  console.log(`[Mock Device] Simulating biometric scan for Device ${deviceId}, User ID ${deviceUserId}...`);

  sendMockEvent({ deviceId, deviceUserId, apiKey })
    .then((res) => {
      console.log(`[Mock Device] Response Status: ${res.statusCode}`);
      console.log('[Mock Device] Response Body:', JSON.stringify(res.body, null, 2));
    })
    .catch((err) => {
      console.error('[Mock Device] Failed to send event:', err.message);
    });
}

module.exports = {
  sendMockEvent
};
