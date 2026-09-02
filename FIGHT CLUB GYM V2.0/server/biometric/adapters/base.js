// Base Biometric Device Adapter Interface
// All vendor-specific adapters (Generic, ZKTeco, Hikvision, Dahua, Suprema) extend this class

class BaseDeviceAdapter {
  constructor(deviceConfig = {}) {
    this.deviceConfig = deviceConfig;
  }

  /**
   * Adapter Name
   */
  get name() {
    return 'BaseAdapter';
  }

  /**
   * Parse incoming raw device request/webhook payload into a normalized biometric event object.
   *
   * Normalized Event Object Schema:
   * {
   *   deviceUserId: string,      // The hardware ID of the user (e.g. "1001" or "M1001")
   *   eventType: string,         // "identification_success", "identification_failed", "check_in", "check_out", "heartbeat", "tamper"
   *   eventTime: string,         // ISO 8601 timestamp string (e.g. "2026-09-01T08:30:00.000Z")
   *   direction?: 'check_in' | 'check_out' | 'auto', // Explicit direction if provided by device
   *   rawReference?: string,     // Transaction ID, log index, or raw ticket reference
   *   biometricType?: string,    // "fingerprint" | "facial" | "rfid_card" | "palm"
   *   deviceStatus?: string      // "ok" | "door_opened" | "tamper_alarm" | "battery_low"
   * }
   *
   * @param {Object} rawPayload - Express req.body
   * @param {Object} headers - Express req.headers
   * @returns {Object} Normalized event object
   */
  parseEvent(rawPayload, headers = {}) {
    throw new Error('Adapter must implement parseEvent(rawPayload, headers)');
  }

  /**
   * Validate authentication / signature for the device callback
   *
   * @param {Object} rawPayload - Express req.body or raw body string
   * @param {Object} headers - Express req.headers
   * @param {Object} device - Stored device record from database
   * @returns {boolean} True if authentic, False otherwise
   */
  validateRequest(rawPayload, headers = {}, device) {
    throw new Error('Adapter must implement validateRequest(rawPayload, headers, device)');
  }

  /**
   * Generate vendor-specific device response for allow/deny decisions
   *
   * @param {Object} decision - The access engine decision
   * @param {boolean} decision.allowed - true / false
   * @param {string} decision.accessResult - "Granted" | "Denied"
   * @param {string} decision.reason - Description
   * @param {string} decision.direction - "check_in" | "check_out"
   * @param {Object} [decision.member] - Gym member details
   * @returns {Object} HTTP response payload formatted for this vendor device
   */
  generateResponse(decision) {
    return {
      success: decision.allowed,
      code: decision.allowed ? 0 : 1,
      message: decision.reason,
      access_result: decision.accessResult,
      direction: decision.direction,
      member: decision.member ? {
        id: decision.member.id,
        name: decision.member.fullname,
        code: decision.member.member_code
      } : null
    };
  }

  /**
   * Test device connection / heartbeat ping
   *
   * @param {Object} device - Database device record
   * @returns {Promise<{ success: boolean, message: string, details?: any }>}
   */
  async testConnection(device) {
    return {
      success: true,
      message: `Adapter ${this.name} connection test simulated successfully for device "${device.name}".`
    };
  }
}

module.exports = BaseDeviceAdapter;
