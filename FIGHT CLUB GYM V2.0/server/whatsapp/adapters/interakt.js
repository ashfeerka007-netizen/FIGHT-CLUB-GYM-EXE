// WhatsApp Adapter — Interakt
const https = require('https');

async function send({ mobile, message, token }) {
  const url = 'https://api.interakt.ai/v1/public/message/';
  const body = JSON.stringify({
    countryCode: '+91',
    phoneNumber: mobile.replace('+91','').replace(/\D/g,''),
    type: 'Text',
    data: { message }
  });
  return httpPost(url, body, { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' });
}

async function test({ token }) {
  return { status: 'ok', provider: 'interakt', note: 'Token validation not available — send a test message to verify.' };
}

function httpPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = { hostname: parsed.hostname, path: parsed.pathname, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(body) } };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) { try { resolve(JSON.parse(data)); } catch { resolve(data); } }
        else { reject(new Error(`Interakt API Error ${res.statusCode}: ${data}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { send, test };
