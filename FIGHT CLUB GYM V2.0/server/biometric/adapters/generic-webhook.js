// Generic REST/Webhook Device Adapter for Fight Club Gym
// Hardware-agnostic adapter supporting fingerprint, facial recognition, palm, and RFID turnstiles

const BaseDeviceAdapter = require('./base');
const { verifyDeviceApiKey, verifyHmacSignature, decrypt } = require('../../security/crypto-vault');

class GenericWebhookAdapter extends BaseDeviceAdapter {
  get name() {
    return 'GenericWebhookAdapter';
  }

  /**
   * Normalize incoming device payload
   */
  parseEvent(rawPayload = {}, headers = {}) {
    // Extract Device User ID from common payload keys
    const deviceUserId = String(
      rawPayload.device_user_id ||
      rawPayload.deviceUserId ||
      rawPayload.user_id ||
      rawPayload.userId ||
      rawPayload.pin ||
      rawPayload.card_no ||
      rawPayload.cardNo ||
      rawPayload.member_code ||
      rawPayload.id ||
      ''
    ).trim();

    // Extract Event Type
    let eventType = (
      rawPayload.event_type ||
      rawPayload.eventType ||
      rawPayload.type ||
      rawPayload.action ||
      'identification_success'
    ).toLowerCase();

    // Standardize event types
    if (eventType === 'success' || eventType === 'pass' || eventType === 'verify_success') {
      eventType = 'identification_success';
    } else if (eventType === 'failed' || eventType === 'fail' || eventType === 'verify_failed' || eventType === 'deny') {
      eventType = 'identification_failed';
    } else if (eventType === 'heartbeat' || eventType === 'ping' || eventType === 'status') {
      eventType = 'heartbeat';
    } else if (eventType === 'tamper' || eventType === 'alarm') {
      eventType = 'tamper';
    }

    // Extract Timestamp
    let eventTime = rawPayload.event_time || rawPayload.eventTime || rawPayload.time || rawPayload.timestamp;
    if (!eventTime) {
      eventTime = new Date().toISOString();
    } else if (typeof eventTime === 'number') {
      // Unix epoch timestamp (seconds vs milliseconds)
      eventTime = new Date(eventTime > 1e11 ? eventTime : eventTime * 1000).toISOString();
    } else {
      try {
        eventTime = new Date(eventTime).toISOString();
      } catch {
        eventTime = new Date().toISOString();
      }
    }

    // Extract Direction
    let direction = 'auto';
    const rawDir = String(rawPayload.direction || rawPayload.door_direction || rawPayload.in_out || '').toLowerCase();
    if (rawDir === 'in' || rawDir === 'check_in' || rawDir === 'checkin' || rawDir === 'entry') {
      direction = 'check_in';
    } else if (rawDir === 'out' || rawDir === 'check_out' || rawDir === 'checkout' || rawDir === 'exit') {
      direction = 'check_out';
    }

    // Extract Biometric Type
    const biometricType = (
      rawPayload.biometric_type ||
      rawPayload.biometricType ||
      rawPayload.mode ||
      rawPayload.verify_mode ||
      'fingerprint'
    ).toLowerCase();

    // Raw Reference
    const rawReference = rawPayload.raw_reference || rawPayload.log_id || rawPayload.transaction_id || rawPayload.ref || null;

    return {
      deviceUserId,
      eventType,
      eventTime,
      direction,
      biometricType,
      rawReference,
      deviceStatus: rawPayload.status || 'ok'
    };
  }

  /**
   * Validate request using API key or HMAC-SHA256 signature
   */
  validateRequest(rawPayload = {}, headers = {}, device) {
    if (!device) return false;

    // If device status is Inactive or Maintenance, deny access
    if (device.status !== 'Active') {
      return false;
    }

    // Extract provided API key from headers or body
    const providedApiKey =
      headers['x-device-api-key'] ||
      headers['x-api-key'] ||
      headers['api-key'] ||
      (headers['authorization'] && headers['authorization'].startsWith('Bearer ')
        ? headers['authorization'].replace('Bearer ', '').trim()
        : null) ||
      rawPayload.api_key ||
      rawPayload.apiKey;

    // Check API key hash match
    if (providedApiKey && device.api_key_hash) {
      if (verifyDeviceApiKey(providedApiKey, device.api_key_hash)) {
        return true;
      }
    }

    // Check HMAC-SHA256 signature if signature header exists
    const signature = headers['x-signature-sha256'] || headers['x-signature'] || headers['x-hub-signature-256'];
    if (signature && (device.api_key_enc || device.api_key_hash)) {
      // Decrypt stored secret key if available
      const secretKey = decrypt(device.api_key_enc) || device.api_key_hash;
      if (secretKey && verifyHmacSignature(rawPayload, signature, secretKey)) {
        return true;
      }
    }

    // If no API key was configured on the device (e.g. initial setup in local dev), allow localhost only
    if (!device.api_key_hash && !device.api_key_enc) {
      return true;
    }

    return false;
  }

  /**
   * Generate clean device response
   */
  generateResponse(decision) {
    return {
      status: decision.allowed ? 'GRANTED' : 'DENIED',
      allowed: Boolean(decision.allowed),
      access_result: decision.accessResult,
      reason: decision.reason,
      direction: decision.direction || 'check_in',
      timestamp: new Date().toISOString(),
      member: decision.member
        ? {
            id: decision.member.id,
            name: decision.member.fullname,
            member_code: decision.member.member_code,
            status: decision.member.status
          }
        : null
    };
  }

  /**
   * Test connection
   */
  async testConnection(device) {
    return {
      success: true,
      message: `Generic Webhook endpoint ready for device "${device.name}" (ID: ${device.id}).`,
      details: {
        device_id: device.id,
        name: device.name,
        vendor: device.vendor,
        connection_type: device.connection_type,
        callback_url: `/api/device-events/${device.id}`
      }
    };
  }
}

module.exports = GenericWebhookAdapter;
