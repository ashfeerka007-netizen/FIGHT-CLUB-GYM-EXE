// Mantra MFS100 (v54 / v54OTG) Client Library — Fight Club Gym
// Communicates with local Mantra Web Service & RD Service over HTTP/HTTPS (Port 8035 / RD ports)

const DEFAULT_MANTRA_PORT = 8004;
const CANDIDATE_PORTS = [8004, 8035, 8003, 8036, 11100, 11101, 11102];

class MantraMFS100Client {
  constructor() {
    this.activePort = DEFAULT_MANTRA_PORT;
    this.activeProtocol = 'http';
    this.deviceInfo = null;
    this.isServiceAvailable = false;
    this.isConnected = false;
  }

  get baseUrl() {
    return `${this.activeProtocol}://127.0.0.1:${this.activePort}`;
  }

  /**
   * Auto-discover local Mantra MFS100 Web Service across common ports (8004, 8035, etc.)
   * @returns {Promise<{ available: boolean, connected: boolean, port: number, info: any, error?: string }>}
   */
  async discover() {
    for (const port of CANDIDATE_PORTS) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);

        const url = `http://127.0.0.1:${port}/mfs100/info`;
        const res = await fetch(url, {
          method: 'GET',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          this.activePort = port;
          this.activeProtocol = 'http';
          this.isServiceAvailable = true;
          this.deviceInfo = data.DeviceInfo || data;
          this.isConnected = data.ErrorCode === 0 || data.ErrorCode === '0';

          return {
            available: true,
            connected: this.isConnected,
            port,
            info: this.deviceInfo,
            errorCode: data.ErrorCode,
            errorDescription: data.ErrorDescription
          };
        }
      } catch {
        // Continue probing next port
      }
    }

    this.isServiceAvailable = false;
    this.isConnected = false;
    return {
      available: false,
      connected: false,
      port: DEFAULT_MANTRA_PORT,
      error: 'Mantra MFS100 Web Service is not running on 127.0.0.1:8004 or 8035. Please verify Mantra MFS100 Client Service is installed and running.'
    };
  }

  /**
   * Fetch device information from connected Mantra sensor
   */
  /**
   * Fetch device information from connected Mantra sensor
   */
  async getDeviceInfo() {
    try {
      if (!this.isServiceAvailable) {
        await this.discover();
      }
      const res = await fetch(`${this.baseUrl}/mfs100/info`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.deviceInfo = data.DeviceInfo || data;
      const isOk = parseInt(data.ErrorCode, 10) === 0 || data.ErrorCode === 0 || data.ErrorCode === '0';
      this.isConnected = isOk;
      return {
        success: isOk,
        errorCode: data.ErrorCode,
        errorDescription: this.getFriendlyErrorMessage(data.ErrorCode) || data.ErrorDescription,
        deviceInfo: this.deviceInfo
      };
    } catch (err) {
      return {
        success: false,
        errorCode: -1,
        errorDescription: `Cannot connect to Mantra Web Service: ${err.message}`
      };
    }
  }

  /**
   * Trigger optical scan on physical Mantra MFS100 sensor
   * @param {Object} options
   * @param {number} [options.quality=50] - Minimum acceptable quality percentage (0-100)
   * @param {number} [options.timeout=10] - Scan timeout in seconds
   * @returns {Promise<Object>}
   */
  async captureFingerprint({ quality = 50, timeout = 10 } = {}) {
    try {
      if (!this.isServiceAvailable) {
        await this.discover();
      }

      const payload = {
        Quality: quality,
        TimeOut: timeout
      };

      const res = await fetch(`${this.baseUrl}/mfs100/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Mantra Web Service returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const codeNum = parseInt(data.ErrorCode, 10);
      const isSuccess = codeNum === 0 || data.ErrorCode === 0 || data.ErrorCode === '0';

      if (isSuccess) {
        const qScore = parseInt(data.Quality, 10) || parseInt(data.Nfiq, 10) ? Math.min(100, Math.max(10, (6 - parseInt(data.Nfiq, 10)) * 20)) : 75;
        return {
          success: true,
          errorCode: 0,
          quality: qScore,
          nfiq: data.Nfiq || null,
          bitmapData: data.BitmapData || '',
          isoTemplate: data.IsoTemplate || '',
          ansiTemplate: data.AnsiTemplate || '',
          wsqImage: data.WsqImage || '',
          raw: data
        };
      } else {
        return {
          success: false,
          errorCode: data.ErrorCode,
          errorDescription: this.getFriendlyErrorMessage(data.ErrorCode) || data.ErrorDescription || 'Scan failed or timed out.',
          quality: parseInt(data.Quality, 10) || 0,
          raw: data
        };
      }
    } catch (err) {
      return {
        success: false,
        errorCode: -1,
        errorDescription: `Mantra scan failed: ${err.message}. Ensure Mantra MFS100 USB sensor is connected.`
      };
    }
  }

  /**
   * Friendly error message resolver for Mantra error codes
   */
  getFriendlyErrorMessage(code) {
    const num = parseInt(code, 10);
    switch (num) {
      case 0:
        return 'Success';
      case 1001:
        return 'Mantra device not connected. Please plug the USB sensor into your computer.';
      case 1002:
        return 'Capture timeout. Please place your finger onto the sensor before time expires.';
      case 1003:
        return 'Fingerprint quality is too low. Clean the optical prism and press finger firmly.';
      case -1307:
      case -1140:
        return 'Scan timed out or finger was not placed. Place finger firmly flat onto the red illuminated glass.';
      case -1308:
        return 'Device is busy. Please wait a moment and try again.';
      case -1:
        return 'Mantra Web Service not reachable. Please ensure Mantra MFS100 Client Service is running.';
      default:
        return null;
    }
  }
}

// Export singleton instance
const mantraClient = new MantraMFS100Client();
export default mantraClient;
export { MantraMFS100Client };
