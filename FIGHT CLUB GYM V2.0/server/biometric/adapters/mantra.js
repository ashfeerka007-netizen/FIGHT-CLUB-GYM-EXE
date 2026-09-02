// Mantra MFS100 (v54 / v54OTG) Optical Fingerprint Sensor Adapter
// Connects Mantra Web Service (Port 8035 / RD Service) with Fight Club Gym Access Engine

const BaseDeviceAdapter = require('./base');
const http = require('http');
const { verifyDeviceApiKey, verifyHmacSignature } = require('../../security/crypto-vault');

class MantraAdapter extends BaseDeviceAdapter {
  constructor(deviceConfig = {}) {
    super(deviceConfig);
  }

  get name() {
    return 'Mantra MFS100 (v54/v54OTG)';
  }

  /**
   * Parse Mantra MFS100 event payload into normalized access event
   */
  parseEvent(rawPayload = {}, headers = {}) {
    const p = rawPayload || {};

    // Check Mantra Error Codes
    const errorCode = parseInt(p.ErrorCode !== undefined ? p.ErrorCode : (p.error_code || 0), 10);
    const errorDesc = p.ErrorDescription || p.error_description || p.message || '';

    // Standard device user ID / member reference
    const deviceUserId = String(
      p.device_user_id || 
      p.DeviceUserId || 
      p.member_id || 
      p.MemberId || 
      p.SerialNo || 
      p.serial_number || 
      ''
    ).trim();

    // Event type translation
    let eventType = 'identification_success';
    if (errorCode !== 0) {
      eventType = 'identification_failed';
    } else if (p.event_type) {
      eventType = p.event_type;
    }

    // Direction (check_in / check_out / auto)
    let direction = 'auto';
    const rawDir = (p.direction || p.Direction || p.door_direction || '').toLowerCase();
    if (rawDir === 'in' || rawDir === 'entry' || rawDir === 'check_in') {
      direction = 'check_in';
    } else if (rawDir === 'out' || rawDir === 'exit' || rawDir === 'check_out') {
      direction = 'check_out';
    }

    // Quality metrics
    const quality = p.Quality !== undefined ? parseInt(p.Quality, 10) : (p.quality || 0);
    const nfiq = p.Nfiq !== undefined ? parseInt(p.Nfiq, 10) : (p.nfiq || null);
    const isoTemplate = p.IsoTemplate || p.iso_template || p.isoTemplate || '';
    const ansiTemplate = p.AnsiTemplate || p.ansi_template || p.ansiTemplate || '';
    const bitmapData = p.BitmapData || p.bitmap_data || p.bitmapData || '';

    return {
      deviceUserId,
      eventType,
      eventTime: p.time || p.event_time || new Date().toISOString(),
      direction,
      rawReference: p.raw_reference || (p.SerialNo ? `mfs_${p.SerialNo}_${Date.now()}` : null),
      biometricType: 'fingerprint',
      deviceStatus: errorCode === 0 ? 'ok' : 'error',
      quality,
      nfiq,
      errorCode,
      errorDescription: errorDesc,
      isoTemplate,
      ansiTemplate,
      bitmapData
    };
  }

  /**
   * Validate authentication for incoming Mantra callbacks / API requests
   */
  validateRequest(rawPayload, headers = {}, device) {
    if (!device) return false;

    // If device status is Inactive or Maintenance
    if (device.status !== 'Active') return false;

    // If no API key hash is registered on the device, allow local requests
    if (!device.api_key_hash) return true;

    // 1. Check API Key header
    const apiKey = headers['x-device-api-key'] || headers['x-api-key'] || '';
    if (apiKey && verifyDeviceApiKey(apiKey, device.api_key_hash)) {
      return true;
    }

    // 2. Check Bearer Token
    const authHeader = headers['authorization'] || '';
    if (authHeader.startsWith('Bearer ')) {
      const bearerKey = authHeader.substring(7).trim();
      if (verifyDeviceApiKey(bearerKey, device.api_key_hash)) {
        return true;
      }
    }

    // 3. Check HMAC Signature
    const sig = headers['x-signature-sha256'] || headers['x-hub-signature-256'] || '';
    if (sig && device.api_key_enc) {
      const bodyString = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
      if (verifyHmacSignature(bodyString, sig, device.api_key_enc)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate Mantra-specific response format
   */
  generateResponse(decision) {
    return {
      success: decision.allowed,
      allowed: decision.allowed,
      status: decision.allowed ? 'GRANTED' : 'DENIED',
      access_result: decision.accessResult,
      reason: decision.reason,
      direction: decision.direction,
      ErrorCode: decision.allowed ? 0 : 1,
      ErrorDescription: decision.reason,
      AccessGranted: decision.allowed,
      Direction: decision.direction,
      member: decision.member ? {
        id: decision.member.id,
        name: decision.member.fullname,
        code: decision.member.member_code,
        status: decision.member.status
      } : null,
      Member: decision.member ? {
        Id: decision.member.id,
        Name: decision.member.fullname,
        Code: decision.member.member_code,
        Status: decision.member.status
      } : null,
      Timestamp: new Date().toISOString()
    };
  }

  /**
   * Test connection to Mantra local web service (default port 8004 / 8035)
   */
  async testConnection(device) {
    const defaultEndpoint = device?.endpoint_url || 'http://127.0.0.1:8004';
    const candidateEndpoints = [defaultEndpoint, 'http://127.0.0.1:8004', 'http://127.0.0.1:8035'];
    const uniqueEndpoints = [...new Set(candidateEndpoints)];

    for (const endpoint of uniqueEndpoints) {
      const res = await new Promise((resolve) => {
        try {
          const url = new URL('/mfs100/info', endpoint);
          const req = http.get(url.toString(), { timeout: 2000 }, (res) => {
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => {
              try {
                const info = JSON.parse(data);
                if (info.ErrorCode === 0 || info.ErrorCode === '0' || info.DeviceInfo) {
                  resolve({
                    success: true,
                    message: `Mantra MFS100 sensor online. Model: ${info.DeviceInfo?.Model || 'MFS100'}, Serial: ${info.DeviceInfo?.SerialNo || 'Connected'} on ${endpoint}`,
                    details: info
                  });
                } else {
                  resolve({
                    success: false,
                    message: `Mantra MFS100 service responded with code ${info.ErrorCode}: ${info.ErrorDescription || 'Unknown error'}`
                  });
                }
              } catch {
                resolve({
                  success: true,
                  message: `Mantra MFS100 web service reachable on ${endpoint}.`
                });
              }
            });
          });

          req.on('error', (err) => {
            resolve({
              success: false,
              message: `Mantra service not reachable on ${endpoint}: ${err.message}`
            });
          });

          req.on('timeout', () => {
            req.destroy();
            resolve({
              success: false,
              message: `Connection timed out connecting to Mantra MFS100 on ${endpoint}.`
            });
          });
        } catch (err) {
          resolve({
            success: false,
            message: `Invalid Mantra endpoint URL "${endpoint}": ${err.message}`
          });
        }
      });

      if (res.success) {
        return res;
      }
    }

    return {
      success: false,
      message: 'Mantra MFS100 service not reachable on http://127.0.0.1:8004 or 8035. Please ensure Mantra MFS100 Client Service is running.'
    };
  }
}

module.exports = MantraAdapter;
