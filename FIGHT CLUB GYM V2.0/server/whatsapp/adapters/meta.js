// WhatsApp Adapter — Meta (Facebook) Cloud API
const https = require('https');

async function send({ mobile, message, token, phoneNumberId, apiEndpoint }) {
  const url = apiEndpoint ||
    `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
  const body = JSON.stringify({
    messaging_product: 'whatsapp',
    to: mobile,
    type: 'text',
    text: { body: message }
  });
  return httpPost(url, body, { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
}

async function test({ token, phoneNumberId, apiEndpoint }) {
  const url = apiEndpoint ||
    `https://graph.facebook.com/v18.0/${phoneNumberId}`;
  return httpGet(url, { Authorization: `Bearer ${token}` });
}

function httpPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = { hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(body) } };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpGet(url, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = { hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: 'GET', headers };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch { resolve(data); }
        } else {
          reject(new Error(`Meta API Error ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = { send, test };
