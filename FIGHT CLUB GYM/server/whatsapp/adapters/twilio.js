// WhatsApp Adapter — Twilio
const https = require('https');

async function send({ mobile, message, token, phoneNumberId }) {
  // token format: "accountSid:authToken"
  const [accountSid, authToken] = (token || ':').split(':');
  const from = `whatsapp:${phoneNumberId}`;
  const to = `whatsapp:${mobile}`;
  const body = new URLSearchParams({ From: from, To: to, Body: message }).toString();
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  return httpPost(url, body, { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' });
}

async function test({ token, phoneNumberId }) {
  const [accountSid, authToken] = (token || ':').split(':');
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`;
  return httpGet(url, { Authorization: `Basic ${auth}` });
}

function httpPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = { hostname: parsed.hostname, path: parsed.pathname, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(body) } };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpGet(url, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = { hostname: parsed.hostname, path: parsed.pathname, method: 'GET', headers };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) { try { resolve(JSON.parse(data)); } catch { resolve(data); } }
        else { reject(new Error(`Twilio API Error ${res.statusCode}: ${data}`)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = { send, test };
