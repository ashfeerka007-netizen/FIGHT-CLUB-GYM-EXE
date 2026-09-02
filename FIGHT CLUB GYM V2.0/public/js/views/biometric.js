// Biometric Access Control & Hardware Management View — Fight Club Gym
// Real-time access event monitor, device adapters, member linking, decision simulator, Mantra MFS100 integration, and rules

import api from '../api.js';
import { showToast, showConfirm } from '../utils.js';
import mantraClient from '../libs/mantra-mfs100.js';

let liveLogInterval = null;

const BiometricView = {
  activeTab: 'overview',
  devices: [],
  members: [],
  enrollments: [],
  events: [],
  stats: {},
  rules: {},
  notifications: {},
  mantraStatus: { available: false, connected: false, info: null },

  render: async (container) => {
    // Clear any previous live log polling
    if (liveLogInterval) {
      clearInterval(liveLogInterval);
      liveLogInterval = null;
    }

    container.innerHTML = `
      <div class="biometric-wrapper">
        <!-- Header -->
        <div class="bio-header">
          <div class="bio-title-row">
            <div class="bio-icon-badge"><i data-lucide="fingerprint"></i></div>
            <div>
              <h1 class="bio-main-title">Biometric Access Control</h1>
              <p class="bio-subtitle">Hardware-agnostic turnstile, Mantra MFS100 USB sensor & WhatsApp notifications</p>
            </div>
          </div>
          <div class="bio-header-actions">
            <button class="btn btn-secondary" id="btn-open-kiosk">
              <i data-lucide="scan"></i> Live Desk Scanner
            </button>
            <button class="btn btn-primary" id="btn-quick-add-device">
              <i data-lucide="plus"></i> Add Device
            </button>
            <button class="btn btn-secondary" id="btn-open-simulator">
              <i data-lucide="play-circle"></i> Test Decision
            </button>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="bio-tabs">
          <button class="bio-tab active" data-tab="overview"><i data-lucide="layout-dashboard"></i> Overview</button>
          <button class="bio-tab" data-tab="mantra"><i data-lucide="scan"></i> Mantra MFS100</button>
          <button class="bio-tab" data-tab="devices"><i data-lucide="cpu"></i> Devices</button>
          <button class="bio-tab" data-tab="enrollment"><i data-lucide="user-check"></i> Member Linking</button>
          <button class="bio-tab" data-tab="logs"><i data-lucide="activity"></i> Live Access Logs</button>
          <button class="bio-tab" data-tab="simulator"><i data-lucide="sparkles"></i> Decision Simulator</button>
          <button class="bio-tab" data-tab="rules"><i data-lucide="shield-check"></i> Access Rules</button>
          <button class="bio-tab" data-tab="notifications"><i data-lucide="message-square"></i> WhatsApp Alerts</button>
          <button class="bio-tab" data-tab="retention"><i data-lucide="database"></i> Privacy & Retention</button>
        </div>

        <!-- Dynamic Tab Content -->
        <div id="bio-tab-content" class="bio-tab-content"></div>
      </div>

      <!-- Device Modal -->
      <div id="bio-device-modal" class="modal-overlay hidden">
        <div class="modal-card">
          <div class="modal-header">
            <h2 id="bio-device-modal-title">Add Biometric Device</h2>
            <button class="btn-close-modal" id="btn-close-device-modal"><i data-lucide="x"></i></button>
          </div>
          <form id="bio-device-form">
            <input type="hidden" id="dev-id" value="">
            <div class="modal-body">
              <div class="form-grid-2">
                <div class="form-group">
                  <label for="dev-name">Device Name *</label>
                  <input type="text" id="dev-name" required placeholder="e.g. Main Entrance Fingerprint Scanner">
                </div>
                <div class="form-group">
                  <label for="dev-vendor">Hardware Vendor</label>
                  <select id="dev-vendor">
                    <option value="Mantra">Mantra MFS100 (USB Optical)</option>
                    <option value="Generic">Generic REST / Webhook</option>
                    <option value="ZKTeco">ZKTeco Push / Webhook</option>
                    <option value="Hikvision">Hikvision Access</option>
                    <option value="Dahua">Dahua Access</option>
                    <option value="Suprema">Suprema BioStar</option>
                    <option value="Essl">eSSL Security</option>
                  </select>
                </div>
              </div>
              <div class="form-grid-2">
                <div class="form-group">
                  <label for="dev-model">Model / Specs</label>
                  <input type="text" id="dev-model" placeholder="e.g. MFS100 V54 / V54OTG">
                </div>
                <div class="form-group">
                  <label for="dev-serial">Serial Number</label>
                  <input type="text" id="dev-serial" placeholder="e.g. MFS100-USB-SCANNER">
                </div>
              </div>
              <div class="form-grid-2">
                <div class="form-group">
                  <label for="dev-conn">Connection Type</label>
                  <select id="dev-conn">
                    <option value="rest_api">Direct REST API / Local Web Service</option>
                    <option value="webhook">REST Webhook Callback</option>
                    <option value="sdk_push">Cloud Push Protocol</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="dev-status">Status</label>
                  <select id="dev-status">
                    <option value="Active">Active (Accept Scans)</option>
                    <option value="Inactive">Inactive (Disabled)</option>
                    <option value="Maintenance">Maintenance</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label for="dev-endpoint">Device Local IP / Web Service Endpoint</label>
                <input type="text" id="dev-endpoint" placeholder="e.g. http://127.0.0.1:8035">
              </div>
              <div class="form-group">
                <label for="dev-notes">Notes / Location Description</label>
                <textarea id="dev-notes" rows="2" placeholder="e.g. Reception desk USB optical sensor"></textarea>
              </div>
              <div id="dev-key-regen-box" class="hidden" style="margin-top: 10px; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 6px;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.9rem;">
                  <input type="checkbox" id="dev-regen-key"> <strong>Regenerate Device API Key</strong> (Invalidates existing key)
                </label>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="btn-cancel-device-modal">Cancel</button>
              <button type="submit" class="btn btn-primary" id="btn-save-device">Save Device</button>
            </div>
          </form>
        </div>
      </div>

      <!-- API Key Reveal Modal -->
      <div id="bio-key-modal" class="modal-overlay hidden">
        <div class="modal-card modal-sm">
          <div class="modal-header">
            <h2>Device API Key Generated</h2>
            <button class="btn-close-modal" id="btn-close-key-modal"><i data-lucide="x"></i></button>
          </div>
          <div class="modal-body">
            <div class="alert alert-warning" style="margin-bottom: 1rem;">
              <i data-lucide="alert-triangle"></i>
              <span>Copy this key now. It is stored hashed and will <strong>never be shown in plain text again</strong>.</span>
            </div>
            <div class="form-group">
              <label>Device API Key</label>
              <div style="display: flex; gap: 8px;">
                <input type="text" id="revealed-api-key" readonly style="font-family: monospace; font-size: 0.9rem; background: rgba(0,0,0,0.3); letter-spacing: 1px;">
                <button type="button" class="btn btn-secondary" id="btn-copy-api-key" title="Copy to clipboard">
                  <i data-lucide="copy"></i>
                </button>
              </div>
            </div>
            <div class="form-group" style="margin-top: 12px;">
              <label>Webhook Callback URL</label>
              <input type="text" id="revealed-callback-url" readonly style="font-family: monospace; font-size: 0.85rem; background: rgba(0,0,0,0.3);">
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-primary btn-block" id="btn-ack-key-modal">I Have Saved the Key</button>
          </div>
        </div>
      </div>

      <!-- Live Kiosk Modal -->
      <div id="bio-kiosk-modal" class="modal-overlay hidden">
        <div class="modal-card modal-md">
          <div class="modal-header">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div class="bio-icon-badge" style="width: 36px; height: 36px;"><i data-lucide="scan"></i></div>
              <div>
                <h2 style="font-size: 1.15rem; margin: 0;">Live Reception Desk Scanner</h2>
                <span class="text-xs text-muted">Mantra MFS100 Optical Fingerprint Sensor</span>
              </div>
            </div>
            <button class="btn-close-modal" id="btn-close-kiosk-modal"><i data-lucide="x"></i></button>
          </div>
          <div class="modal-body text-center" style="padding: 2rem 1.5rem;">
            <div id="kiosk-finger-icon" class="kiosk-sensor-ring">
              <i data-lucide="fingerprint" style="width: 64px; height: 64px;"></i>
            </div>
            <h3 id="kiosk-prompt-title" style="margin-top: 1.25rem; font-size: 1.3rem;">Place Finger on Mantra Sensor</h3>
            <p id="kiosk-prompt-desc" class="text-muted text-sm" style="margin-top: 4px;">Optical sensor is armed. Touch prism to scan and verify gym entry.</p>

            <div id="kiosk-result-card" class="hidden" style="margin-top: 1.5rem; padding: 1.25rem; border-radius: 8px;"></div>
          </div>
          <div class="modal-footer flex justify-between">
            <button type="button" class="btn btn-secondary" id="btn-stop-kiosk">Close Scanner</button>
            <button type="button" class="btn btn-primary" id="btn-trigger-kiosk-scan">
              <i data-lucide="play"></i> Scan Finger Now
            </button>
          </div>
        </div>
      </div>
    `;

    BiometricView.bindGlobalEvents(container);
    await BiometricView.renderTab(BiometricView.activeTab || 'overview', container.querySelector('#bio-tab-content'));
    lucide.createIcons();
  },

  bindGlobalEvents: (container) => {
    // Tab switching
    const tabs = container.querySelectorAll('.bio-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        BiometricView.activeTab = tab.dataset.tab;
        BiometricView.renderTab(tab.dataset.tab, container.querySelector('#bio-tab-content'));
      });
    });

    // Quick add device button in header
    container.querySelector('#btn-quick-add-device').addEventListener('click', () => {
      BiometricView.openDeviceModal();
    });

    // Open simulator button in header
    container.querySelector('#btn-open-simulator').addEventListener('click', () => {
      const simTab = container.querySelector('.bio-tab[data-tab="simulator"]');
      if (simTab) simTab.click();
    });

    // Open Kiosk Scanner button
    container.querySelector('#btn-open-kiosk').addEventListener('click', () => {
      BiometricView.openKioskModal();
    });

    // Device modal close events
    const devModal = container.querySelector('#bio-device-modal');
    container.querySelector('#btn-close-device-modal').addEventListener('click', () => devModal.classList.add('hidden'));
    container.querySelector('#btn-cancel-device-modal').addEventListener('click', () => devModal.classList.add('hidden'));

    // Key modal close events
    const keyModal = container.querySelector('#bio-key-modal');
    container.querySelector('#btn-close-key-modal').addEventListener('click', () => keyModal.classList.add('hidden'));
    container.querySelector('#btn-ack-key-modal').addEventListener('click', () => keyModal.classList.add('hidden'));

    // Kiosk modal close
    const kioskModal = container.querySelector('#bio-kiosk-modal');
    container.querySelector('#btn-close-kiosk-modal').addEventListener('click', () => kioskModal.classList.add('hidden'));
    container.querySelector('#btn-stop-kiosk').addEventListener('click', () => kioskModal.classList.add('hidden'));

    // Copy API key to clipboard
    container.querySelector('#btn-copy-api-key').addEventListener('click', () => {
      const input = container.querySelector('#revealed-api-key');
      input.select();
      navigator.clipboard.writeText(input.value);
      showToast('API Key copied to clipboard!', 'success');
    });

    // Device Form submission
    container.querySelector('#bio-device-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = container.querySelector('#dev-id').value;
      const data = {
        name: container.querySelector('#dev-name').value.trim(),
        vendor: container.querySelector('#dev-vendor').value,
        model: container.querySelector('#dev-model').value.trim(),
        serial_number: container.querySelector('#dev-serial').value.trim(),
        connection_type: container.querySelector('#dev-conn').value,
        status: container.querySelector('#dev-status').value,
        endpoint_url: container.querySelector('#dev-endpoint').value.trim(),
        notes: container.querySelector('#dev-notes').value.trim(),
        regenerate_api_key: container.querySelector('#dev-regen-key')?.checked || false
      };

      try {
        if (id) {
          const res = await api.put(`/api/biometric/devices/${id}`, data);
          devModal.classList.add('hidden');
          showToast(res.message || 'Device updated', 'success');
          if (res.apiKey) {
            BiometricView.showKeyModal(id, res.apiKey);
          }
        } else {
          const res = await api.post('/api/biometric/devices', data);
          devModal.classList.add('hidden');
          showToast('Biometric device registered!', 'success');
          if (res.apiKey) {
            BiometricView.showKeyModal(res.id, res.apiKey);
          }
        }
        await BiometricView.renderTab(BiometricView.activeTab, container.querySelector('#bio-tab-content'));
      } catch (err) {
        showToast(err.message || 'Failed to save device', 'error');
      }
    });

    // Trigger Kiosk Scan
    container.querySelector('#btn-trigger-kiosk-scan').addEventListener('click', async () => {
      const ring = container.querySelector('#kiosk-finger-icon');
      const title = container.querySelector('#kiosk-prompt-title');
      const desc = container.querySelector('#kiosk-prompt-desc');
      const resultCard = container.querySelector('#kiosk-result-card');

      ring.classList.add('scanning');
      title.textContent = 'Scanning Sensor...';
      desc.textContent = 'Please place your finger flat and firmly on the Mantra MFS100 optical prism.';
      resultCard.classList.add('hidden');

      try {
        const capture = await mantraClient.captureFingerprint({ quality: 50, timeout: 10 });
        ring.classList.remove('scanning');

        if (!capture.success) {
          title.textContent = 'Scan Incomplete';
          desc.textContent = capture.errorDescription || 'Could not capture fingerprint.';
          resultCard.className = 'alert alert-danger';
          resultCard.innerHTML = `<i data-lucide="alert-circle"></i><span>${capture.errorDescription}</span>`;
          resultCard.classList.remove('hidden');
          lucide.createIcons();
          return;
        }

        title.textContent = 'Matching Fingerprint in Database...';
        desc.textContent = `Fingerprint captured (${capture.quality}% quality). Identifying member...`;

        // Send to Mantra scan API with full ISO template
        const scanRes = await api.post('/api/biometric/mantra/scan', {
          quality: capture.quality,
          rawPayload: {
            ...capture.raw,
            IsoTemplate: capture.isoTemplate,
            AnsiTemplate: capture.ansiTemplate,
            BitmapData: capture.bitmapData,
            Quality: capture.quality
          }
        });

        const isGranted = scanRes.allowed;
        title.textContent = isGranted ? 'Access Granted! 🥊' : 'Access Denied';
        desc.textContent = scanRes.reason;

        const member = scanRes.member;
        const photoHtml = member?.photo_path 
          ? `<img src="${member.photo_path}" style="width: 54px; height: 54px; border-radius: 50%; object-fit: cover; border: 2px solid ${isGranted ? '#4caf50' : '#f44336'};">`
          : `<div style="width: 54px; height: 54px; border-radius: 50%; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 1.4rem; font-weight: 700; border: 2px solid ${isGranted ? '#4caf50' : '#f44336'};">${member ? member.name.substring(0, 2).toUpperCase() : '🥊'}</div>`;

        resultCard.className = isGranted ? 'sim-verdict-banner granted' : 'sim-verdict-banner denied';
        resultCard.innerHTML = `
          <div style="display: flex; align-items: center; gap: 14px; text-align: left; padding: 4px 0;">
            ${photoHtml}
            <div style="flex: 1;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong style="font-size: 1.15rem; color: #fff;">${member ? member.name : 'Unknown Scan'}</strong>
                ${member ? `<span class="badge" style="background: rgba(76,175,80,0.2); color: #4caf50; font-size: 0.72rem; font-weight: 700;">ID: ${member.code || member.id}</span>` : ''}
              </div>
              <div style="font-size: 0.8rem; margin-top: 4px; color: ${isGranted ? '#4caf50' : '#f44336'};">
                <i data-lucide="${isGranted ? 'check-circle-2' : 'x-circle'}" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle;"></i>
                ${scanRes.direction === 'check_out' ? '<strong>Check-Out Logged</strong>' : '<strong>Check-In Logged</strong>'} • ${scanRes.reason}
              </div>
            </div>
          </div>
        `;
        resultCard.classList.remove('hidden');
        lucide.createIcons();
        showToast(isGranted ? `Access Granted: Welcome ${member ? member.name : 'Fighter'}!` : `Access Denied: ${scanRes.reason}`, isGranted ? 'success' : 'warning');

        // Auto-reset kiosk after 5 seconds
        setTimeout(() => {
          if (!container.querySelector('#bio-kiosk-modal')?.classList.contains('hidden')) {
            title.textContent = 'Place Finger on Mantra Sensor';
            desc.textContent = 'Optical sensor is armed. Touch prism to scan and verify gym entry.';
            resultCard.classList.add('hidden');
          }
        }, 5000);

      } catch (err) {
        ring.classList.remove('scanning');
        title.textContent = 'Scan Error';
        desc.textContent = err.message || 'Error communicating with Mantra sensor.';
        resultCard.className = 'alert alert-danger';
        resultCard.innerHTML = `<span>${err.message}</span>`;
        resultCard.classList.remove('hidden');
      }
    });
  },

  openKioskModal: () => {
    const modal = document.querySelector('#bio-kiosk-modal');
    if (!modal) return;
    document.querySelector('#kiosk-result-card')?.classList.add('hidden');
    document.querySelector('#kiosk-prompt-title').textContent = 'Place Finger on Mantra Sensor';
    document.querySelector('#kiosk-prompt-desc').textContent = 'Optical sensor is armed. Touch prism to scan and verify gym entry.';
    modal.classList.remove('hidden');
    lucide.createIcons();
  },

  showKeyModal: (deviceId, apiKey) => {
    const keyModal = document.querySelector('#bio-key-modal');
    if (!keyModal) return;
    keyModal.querySelector('#revealed-api-key').value = apiKey;
    const origin = window.location.origin;
    keyModal.querySelector('#revealed-callback-url').value = `${origin}/api/device-events/${deviceId}`;
    keyModal.classList.remove('hidden');
    lucide.createIcons();
  },

  openDeviceModal: (device = null) => {
    const modal = document.querySelector('#bio-device-modal');
    if (!modal) return;
    const form = document.querySelector('#bio-device-form');
    form.reset();

    const title = document.querySelector('#bio-device-modal-title');
    const regenBox = document.querySelector('#dev-key-regen-box');

    if (device) {
      title.textContent = 'Edit Biometric Device';
      document.querySelector('#dev-id').value = device.id;
      document.querySelector('#dev-name').value = device.name || '';
      document.querySelector('#dev-vendor').value = device.vendor || 'Mantra';
      document.querySelector('#dev-model').value = device.model || '';
      document.querySelector('#dev-serial').value = device.serial_number || '';
      document.querySelector('#dev-conn').value = device.connection_type || 'rest_api';
      document.querySelector('#dev-status').value = device.status || 'Active';
      document.querySelector('#dev-endpoint').value = device.endpoint_url || '';
      document.querySelector('#dev-notes').value = device.notes || '';
      regenBox.classList.remove('hidden');
      document.querySelector('#dev-regen-key').checked = false;
    } else {
      title.textContent = 'Add Biometric Device';
      document.querySelector('#dev-id').value = '';
      document.querySelector('#dev-vendor').value = 'Mantra';
      document.querySelector('#dev-model').value = 'MFS100 V54 / V54OTG';
      document.querySelector('#dev-conn').value = 'rest_api';
      document.querySelector('#dev-endpoint').value = 'http://127.0.0.1:8035';
      regenBox.classList.add('hidden');
    }

    modal.classList.remove('hidden');
    document.querySelector('#dev-name').focus();
    lucide.createIcons();
  },

  renderTab: async (tab, content) => {
    if (liveLogInterval) {
      clearInterval(liveLogInterval);
      liveLogInterval = null;
    }

    content.innerHTML = '<div class="bio-loading"><div class="spinner"></div></div>';
    try {
      switch(tab) {
        case 'overview':     await BiometricView.renderOverview(content); break;
        case 'mantra':       await BiometricView.renderMantra(content); break;
        case 'devices':      await BiometricView.renderDevices(content); break;
        case 'enrollment':   await BiometricView.renderEnrollment(content); break;
        case 'logs':         await BiometricView.renderLogs(content); break;
        case 'simulator':    await BiometricView.renderSimulator(content); break;
        case 'rules':        await BiometricView.renderRules(content); break;
        case 'notifications':await BiometricView.renderNotifications(content); break;
        case 'retention':    await BiometricView.renderRetention(content); break;
        default:             await BiometricView.renderOverview(content);
      }
    } catch(err) {
      content.innerHTML = `<div class="empty-state"><i data-lucide="alert-triangle"></i><h2>Error</h2><p>${err.message}</p></div>`;
    }
    lucide.createIcons();
  },

  // ── 1. OVERVIEW TAB ─────────────────────────────────────────────────────────
  renderOverview: async (content) => {
    const [stats, devices, recentLogs] = await Promise.all([
      api.get('/api/biometric/stats'),
      api.get('/api/biometric/devices'),
      api.get('/api/biometric/events?limit=8')
    ]);

    BiometricView.stats = stats;
    BiometricView.devices = devices;

    content.innerHTML = `
      <div class="bio-overview">
        <!-- KPI Grid -->
        <div class="bio-stats-grid">
          <div class="bio-stat-card green">
            <div class="bio-stat-icon"><i data-lucide="cpu"></i></div>
            <div class="bio-stat-info">
              <div class="bio-stat-value">${stats.activeDevices}</div>
              <div class="bio-stat-label">Active Devices</div>
            </div>
          </div>
          <div class="bio-stat-card blue">
            <div class="bio-stat-icon"><i data-lucide="users"></i></div>
            <div class="bio-stat-info">
              <div class="bio-stat-value">${stats.enrolledMembers}</div>
              <div class="bio-stat-label">Enrolled Members</div>
            </div>
          </div>
          <div class="bio-stat-card yellow">
            <div class="bio-stat-icon"><i data-lucide="zap"></i></div>
            <div class="bio-stat-info">
              <div class="bio-stat-value">${stats.todayScans}</div>
              <div class="bio-stat-label">Today's Scans</div>
            </div>
          </div>
          <div class="bio-stat-card purple">
            <div class="bio-stat-icon"><i data-lucide="check-circle-2"></i></div>
            <div class="bio-stat-info">
              <div class="bio-stat-value">${stats.successRate}%</div>
              <div class="bio-stat-label">Granted Rate</div>
            </div>
          </div>
        </div>

        <!-- Mantra Banner Quick Link -->
        <div class="mantra-quick-banner" style="margin-bottom: 1.5rem;">
          <div class="mantra-quick-content">
            <div class="bio-icon-badge" style="background: rgba(255, 107, 0, 0.15); color: #ff6b00; border-color: rgba(255, 107, 0, 0.3);">
              <i data-lucide="scan"></i>
            </div>
            <div>
              <h3 style="margin: 0; font-size: 1.05rem;">Mantra MFS100 (v54 / v54OTG) USB Optical Scanner</h3>
              <p class="text-xs text-muted" style="margin: 2px 0 0 0;">Plug-and-play desktop biometric sensor integration on port 8035 with live optical capture.</p>
            </div>
          </div>
          <div class="flex gap-sm">
            <button class="btn btn-secondary btn-sm" id="btn-ov-mantra-setup">
              <i data-lucide="settings"></i> Configure MFS100
            </button>
            <button class="btn btn-primary btn-sm" id="btn-ov-mantra-kiosk">
              <i data-lucide="play"></i> Launch Scanner
            </button>
          </div>
        </div>

        <!-- Device Status Row -->
        <div class="bio-overview-grid">
          <div class="card glass-card">
            <div class="card-header flex justify-between items-center">
              <h3><i data-lucide="hard-drive"></i> Connected Biometric Devices</h3>
              <button class="btn btn-secondary btn-sm" id="btn-ov-add-device">
                <i data-lucide="plus"></i> Add Device
              </button>
            </div>
            <div class="card-body">
              ${devices.length === 0 ? `
                <div class="empty-state" style="padding: 2rem;">
                  <i data-lucide="cpu" style="width: 40px; height: 40px; color: var(--color-text-muted);"></i>
                  <h4>No biometric devices configured</h4>
                  <p>Add a fingerprint or face scanner to begin recording turnstile access.</p>
                </div>
              ` : `
                <div class="bio-device-list">
                  ${devices.map(d => `
                    <div class="bio-device-row">
                      <div class="bio-dev-main">
                        <div class="bio-status-indicator ${d.status === 'Active' ? 'online' : 'offline'}"></div>
                        <div>
                          <strong style="font-size: 1rem;">${d.name}</strong>
                          <div class="text-xs text-muted">
                            ${d.vendor} • ${d.connection_type.toUpperCase()} • ${d.enrolled_count || 0} enrolled
                          </div>
                        </div>
                      </div>
                      <div class="bio-dev-metrics">
                        <span class="badge" style="background: rgba(76,175,80,0.15); color: #4caf50;">
                          ${d.granted_scans || 0} Granted
                        </span>
                        <span class="badge" style="background: rgba(244,67,54,0.15); color: #f44336;">
                          ${d.denied_scans || 0} Denied
                        </span>
                        <button class="btn btn-secondary btn-sm btn-ping-device" data-id="${d.id}" title="Test Connection">
                          <i data-lucide="zap"></i> Ping
                        </button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>
          </div>

          <!-- Quick Access Activity Feed -->
          <div class="card glass-card">
            <div class="card-header flex justify-between items-center">
              <h3><i data-lucide="activity"></i> Recent Access Activity</h3>
              <button class="btn btn-text text-sm" id="btn-view-all-logs">View All</button>
            </div>
            <div class="card-body">
              ${recentLogs.events.length === 0 ? `
                <div class="empty-state" style="padding: 2rem;">
                  <i data-lucide="check-circle" style="width: 40px; height: 40px;"></i>
                  <h4>No recent access events</h4>
                  <p>Biometric scan events will stream here in real time.</p>
                </div>
              ` : `
                <div class="bio-mini-events">
                  ${recentLogs.events.map(ev => {
                    const isGranted = ev.access_result === 'Granted';
                    const timeStr = new Date(ev.event_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    return `
                      <div class="bio-event-row ${isGranted ? 'granted' : 'denied'}">
                        <div class="bio-event-badge ${isGranted ? 'granted' : 'denied'}">
                          <i data-lucide="${isGranted ? 'check' : 'x'}"></i>
                        </div>
                        <div class="bio-event-details">
                          <div class="flex justify-between">
                            <strong>${ev.member_name || `Unknown (${ev.device_user_id || 'ID'})`}</strong>
                            <span class="text-xs text-muted">${timeStr}</span>
                          </div>
                          <div class="text-xs text-muted">
                            ${ev.device_name || 'Device'} • <span style="color: ${isGranted ? '#4caf50' : '#f44336'};">${ev.reason}</span>
                          </div>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
            </div>
          </div>
        </div>
      </div>
    `;

    content.querySelector('#btn-ov-mantra-setup')?.addEventListener('click', () => {
      document.querySelector('.bio-tab[data-tab="mantra"]')?.click();
    });

    content.querySelector('#btn-ov-mantra-kiosk')?.addEventListener('click', () => {
      BiometricView.openKioskModal();
    });

    content.querySelector('#btn-ov-add-device')?.addEventListener('click', () => BiometricView.openDeviceModal());
    content.querySelector('#btn-view-all-logs')?.addEventListener('click', () => {
      document.querySelector('.bio-tab[data-tab="logs"]')?.click();
    });

    content.querySelectorAll('.btn-ping-device').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader"></i> ...';
        lucide.createIcons();
        try {
          const res = await api.post(`/api/biometric/devices/${id}/test`);
          showToast(res.message || 'Ping successful', 'success');
        } catch (err) {
          showToast(err.message || 'Ping failed', 'error');
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<i data-lucide="zap"></i> Ping';
          lucide.createIcons();
        }
      });
    });
  },

  // ── 2. MANTRA MFS100 SETUP & DIAGNOSTICS TAB ────────────────────────────────
  renderMantra: async (content) => {
    content.innerHTML = `
      <div class="mantra-layout">
        <!-- Sensor Live Status Banner -->
        <div class="card glass-card" id="mantra-status-card">
          <div class="card-body flex justify-between items-center flex-wrap gap-md">
            <div class="flex items-center gap-md">
              <div id="mantra-status-bulb" class="sensor-bulb probing"></div>
              <div>
                <h3 id="mantra-status-heading" style="margin: 0;">Probing Mantra MFS100 Sensor...</h3>
                <p id="mantra-status-text" class="text-xs text-muted" style="margin-top: 2px;">Testing connection on local web service port 8035...</p>
              </div>
            </div>
            <div class="flex gap-sm">
              <button class="btn btn-secondary btn-sm" id="btn-discover-mantra">
                <i data-lucide="refresh-cw"></i> Re-Discover Sensor
              </button>
              <button class="btn btn-primary btn-sm" id="btn-auto-register-mantra">
                <i data-lucide="plus-circle"></i> Sync in Database
              </button>
            </div>
          </div>
        </div>

        <div class="grid-2" style="margin-top: 1.5rem;">
          <!-- Left: Live Optical Test Scanner -->
          <div class="card glass-card">
            <div class="card-header flex justify-between items-center">
              <h3><i data-lucide="scan"></i> Live Optical Scanner Test</h3>
              <span class="badge" style="background: rgba(255, 107, 0, 0.15); color: #ff6b00;">v54 / v54OTG</span>
            </div>
            <div class="card-body text-center" style="padding: 2rem 1.5rem;">
              <div class="optical-scan-box" id="optical-preview-box">
                <i data-lucide="fingerprint" style="width: 72px; height: 72px; color: var(--color-text-muted);"></i>
              </div>
              
              <!-- Quality Gauge -->
              <div style="margin-top: 1.5rem;">
                <div class="flex justify-between text-xs text-muted" style="margin-bottom: 6px;">
                  <span>Fingerprint Quality Score</span>
                  <strong id="mantra-quality-val">0%</strong>
                </div>
                <div class="progress-bar-bg">
                  <div id="mantra-quality-bar" class="progress-bar-fill" style="width: 0%;"></div>
                </div>
              </div>

              <div id="mantra-test-message" class="text-xs text-muted" style="margin-top: 12px; min-height: 20px;">
                Ready to test. Click "Capture Test Fingerprint" and place finger onto optical prism.
              </div>

              <div class="flex gap-sm justify-center" style="margin-top: 1.5rem;">
                <button class="btn btn-primary" id="btn-capture-test-mantra" style="padding: 10px 24px;">
                  <i data-lucide="play"></i> Capture Test Fingerprint
                </button>
                <button class="btn btn-secondary" id="btn-launch-kiosk-from-mantra">
                  <i data-lucide="external-link"></i> Open Kiosk Mode
                </button>
              </div>
            </div>
          </div>

          <!-- Right: Hardware Specs & Driver Setup Guide -->
          <div class="card glass-card">
            <div class="card-header">
              <h3><i data-lucide="info"></i> Sensor Hardware Information</h3>
            </div>
            <div class="card-body">
              <div class="table-container">
                <table class="table-sm">
                  <tbody>
                    <tr><td><strong>Manufacturer</strong></td><td id="mfs-info-make">MANTRA SOFTECH</td></tr>
                    <tr><td><strong>Device Model</strong></td><td id="mfs-info-model">MFS100 (v54 / v54OTG)</td></tr>
                    <tr><td><strong>Serial Number</strong></td><td id="mfs-info-serial" style="font-family: monospace;">Detecting...</td></tr>
                    <tr><td><strong>Resolution / DPI</strong></td><td>500 DPI Optical Sensor</td></tr>
                    <tr><td><strong>Web Service Port</strong></td><td style="font-family: monospace;">http://127.0.0.1:8035</td></tr>
                    <tr><td><strong>Certification</strong></td><td>STQC / UIDAI / Aadhaar Certified</td></tr>
                  </tbody>
                </table>
              </div>

              <div class="alert alert-info" style="margin-top: 1.25rem;">
                <i data-lucide="help-circle"></i>
                <div class="text-xs" style="line-height: 1.6;">
                  <strong>MFS100 Windows Setup Checklist:</strong><br>
                  1. Install official <strong>Mantra MFS100 Driver</strong> (v9.2.x or latest).<br>
                  2. Install <strong>Mantra MFS100 Client Web Service / RD Service</strong>.<br>
                  3. Plug MFS100 into USB 2.0/3.0 or OTG port.<br>
                  4. Ensure Windows Service <code>Mantra MFS100 Client Service</code> status is <em>Running</em>.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Discovery Logic
    const probeMantra = async () => {
      const bulb = content.querySelector('#mantra-status-bulb');
      const heading = content.querySelector('#mantra-status-heading');
      const text = content.querySelector('#mantra-status-text');
      const serialEl = content.querySelector('#mfs-info-serial');
      const modelEl = content.querySelector('#mfs-info-model');
      const makeEl = content.querySelector('#mfs-info-make');

      bulb.className = 'sensor-bulb probing';
      heading.textContent = 'Probing Mantra Sensor...';
      text.textContent = 'Querying local service on port 8035...';

      const result = await mantraClient.discover();
      BiometricView.mantraStatus = result;

      if (result.connected) {
        bulb.className = 'sensor-bulb online';
        heading.textContent = 'Mantra MFS100 Sensor is ONLINE & Ready';
        text.textContent = `Connected on Port ${result.port}. Serial: ${result.info?.SerialNo || 'Active'}`;
        if (serialEl) serialEl.textContent = result.info?.SerialNo || 'MFS100-USB-CONNECTED';
        if (modelEl) modelEl.textContent = result.info?.Model || 'MFS100 V54/V54OTG';
        if (makeEl) makeEl.textContent = result.info?.Make || 'MANTRA';
      } else if (result.available) {
        bulb.className = 'sensor-bulb warning';
        heading.textContent = 'Mantra Service Running (Sensor Unplugged)';
        text.textContent = 'The Mantra Web Service is running on port ' + result.port + ', but the physical USB sensor is not detected. Please plug in the USB cable.';
        if (serialEl) serialEl.textContent = 'Unplugged';
      } else {
        bulb.className = 'sensor-bulb offline';
        heading.textContent = 'Mantra Service Not Detected';
        text.textContent = 'Cannot reach http://127.0.0.1:8035. Please verify Mantra MFS100 Driver & Client Web Service is installed and running.';
        if (serialEl) serialEl.textContent = 'Service Offline';
      }
      lucide.createIcons();
    };

    await probeMantra();

    // Re-discover button
    content.querySelector('#btn-discover-mantra')?.addEventListener('click', async () => {
      showToast('Re-scanning Mantra MFS100 sensor...', 'info');
      await probeMantra();
    });

    // Auto-Register in Gym Database
    content.querySelector('#btn-auto-register-mantra')?.addEventListener('click', async () => {
      try {
        const res = await api.post('/api/biometric/mantra/auto-setup');
        showToast(res.message || 'Mantra MFS100 registered in database!', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to auto-register', 'error');
      }
    });

    // Launch Kiosk
    content.querySelector('#btn-launch-kiosk-from-mantra')?.addEventListener('click', () => {
      BiometricView.openKioskModal();
    });

    // Test Capture Button
    content.querySelector('#btn-capture-test-mantra')?.addEventListener('click', async () => {
      const btn = content.querySelector('#btn-capture-test-mantra');
      const box = content.querySelector('#optical-preview-box');
      const qVal = content.querySelector('#mantra-quality-val');
      const qBar = content.querySelector('#mantra-quality-bar');
      const msg = content.querySelector('#mantra-test-message');

      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader"></i> Scanning...';
      box.classList.add('active-scanning');
      msg.textContent = 'Optical prism LED illuminated. Place finger flat onto sensor...';
      lucide.createIcons();

      try {
        const capture = await mantraClient.captureFingerprint({ quality: 50, timeout: 10 });
        box.classList.remove('active-scanning');

        if (capture.success) {
          const q = capture.quality;
          qVal.textContent = `${q}%`;
          qBar.style.width = `${q}%`;

          // Display live grayscale fingerprint image in box
          if (capture.bitmapData) {
            box.innerHTML = `<img src="data:image/bmp;base64,${capture.bitmapData}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 6px;" alt="Captured Fingerprint">`;
            box.style.border = '2px solid #4caf50';
            box.style.boxShadow = '0 0 15px rgba(76, 175, 80, 0.4)';
          }

          if (q >= 70) {
            qBar.style.background = '#4caf50';
            msg.innerHTML = `<strong style="color: #4caf50;">✓ Excellent Capture! Quality: ${q}% (NFIQ: ${capture.nfiq || 1}) • ISO Template Generated</strong>`;
          } else if (q >= 50) {
            qBar.style.background = 'var(--color-accent)';
            msg.innerHTML = `<strong style="color: var(--color-accent);">✓ Good Capture. Quality: ${q}% • Ready for Enrollment</strong>`;
          } else {
            qBar.style.background = '#f44336';
            msg.innerHTML = `<strong style="color: #f44336;">Low Quality (${q}%). Press finger firmly and flat.</strong>`;
          }

          showToast(`Fingerprint captured with ${q}% quality score!`, 'success');
        } else {
          qVal.textContent = '0%';
          qBar.style.width = '0%';
          msg.innerHTML = `<span style="color: #f44336;">⚠️ ${capture.errorDescription}</span>`;
          showToast(capture.errorDescription, 'error');
        }
      } catch (err) {
        box.classList.remove('active-scanning');
        msg.textContent = `Error: ${err.message}`;
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="play"></i> Capture Test Fingerprint';
        lucide.createIcons();
      }
    });
  },

  // ── 3. DEVICES TAB ──────────────────────────────────────────────────────────
  renderDevices: async (content) => {
    const devices = await api.get('/api/biometric/devices');
    BiometricView.devices = devices;

    content.innerHTML = `
      <div class="card glass-card">
        <div class="card-header flex justify-between items-center">
          <div>
            <h3><i data-lucide="cpu"></i> Hardware Devices & Adapters</h3>
            <p class="text-xs text-muted" style="margin-top: 4px;">Manage biometrics, turnstiles, and webhook endpoints</p>
          </div>
          <button class="btn btn-primary" id="btn-tab-add-device">
            <i data-lucide="plus"></i> Register Device
          </button>
        </div>
        <div class="card-body">
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Device Name</th>
                  <th>Vendor & Model</th>
                  <th>Connection</th>
                  <th>Status</th>
                  <th>Last Seen</th>
                  <th>Enrolled</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${devices.length === 0 ? `
                  <tr><td colspan="7" class="text-center text-muted" style="padding: 2.5rem;">No devices registered yet. Click "Register Device" to add your first biometric hardware.</td></tr>
                ` : devices.map(d => `
                  <tr>
                    <td>
                      <div class="flex items-center gap-sm">
                        <span class="bio-status-dot ${d.status === 'Active' ? 'active' : 'inactive'}"></span>
                        <div>
                          <strong>${d.name}</strong>
                          <div class="text-xs text-muted">ID: ${d.id} • SN: ${d.serial_number || 'N/A'}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div><strong>${d.vendor}</strong></div>
                      <div class="text-xs text-muted">${d.model || 'Standard'}</div>
                    </td>
                    <td>
                      <span class="badge" style="background: rgba(255,255,255,0.08); font-family: monospace;">
                        ${d.connection_type}
                      </span>
                    </td>
                    <td>
                      <span class="badge status-badge ${d.status === 'Active' ? 'status-active' : 'status-expired'}">
                        ${d.status}
                      </span>
                    </td>
                    <td>
                      <span class="text-xs text-muted">
                        ${d.last_seen_at ? new Date(d.last_seen_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Never'}
                      </span>
                    </td>
                    <td>
                      <strong>${d.enrolled_count || 0}</strong>
                    </td>
                    <td>
                      <div class="action-buttons flex gap-xs">
                        <button class="btn-icon btn-test-dev" data-id="${d.id}" title="Test Ping">
                          <i data-lucide="zap"></i>
                        </button>
                        <button class="btn-icon btn-info-dev" data-id="${d.id}" title="Show Webhook URL">
                          <i data-lucide="link"></i>
                        </button>
                        <button class="btn-icon btn-edit-dev" data-id="${d.id}" title="Edit Device">
                          <i data-lucide="edit-2"></i>
                        </button>
                        <button class="btn-icon text-danger btn-del-dev" data-id="${d.id}" title="Delete Device">
                          <i data-lucide="trash-2"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    content.querySelector('#btn-tab-add-device').addEventListener('click', () => BiometricView.openDeviceModal());

    content.querySelectorAll('.btn-test-dev').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const res = await api.post(`/api/biometric/devices/${btn.dataset.id}/test`);
          showToast(res.message, 'success');
        } catch (e) {
          showToast(e.message, 'error');
        }
      });
    });

    content.querySelectorAll('.btn-info-dev').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const origin = window.location.origin;
        showToast(`Webhook URL: ${origin}/api/device-events/${id}`, 'info');
      });
    });

    content.querySelectorAll('.btn-edit-dev').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = BiometricView.devices.find(x => x.id === parseInt(btn.dataset.id));
        if (d) BiometricView.openDeviceModal(d);
      });
    });

    content.querySelectorAll('.btn-del-dev').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const d = BiometricView.devices.find(x => x.id === parseInt(id));
        showConfirm({
          title: 'Delete Biometric Device',
          message: `Are you sure you want to remove "${d?.name || 'this device'}"? All associated biometric member mappings for this device will be removed.`,
          confirmText: 'Delete Device',
          isDanger: true,
          onConfirm: async () => {
            try {
              const res = await api.delete(`/api/biometric/devices/${id}`);
              showToast(res.message || 'Device deleted', 'success');
              await BiometricView.renderTab('devices', content);
            } catch (err) {
              showToast(err.message, 'error');
            }
          }
        });
      });
    });
  },

  // ── 4. MEMBER ENROLLMENT TAB ────────────────────────────────────────────────
  renderEnrollment: async (content) => {
    const [members, devices, enrollments] = await Promise.all([
      api.get('/api/members'),
      api.get('/api/biometric/devices'),
      api.get('/api/biometric/enrollments')
    ]);

    BiometricView.members = members;
    BiometricView.devices = devices;
    BiometricView.enrollments = enrollments;

    content.innerHTML = `
      <div class="bio-enrollment-layout grid-2">
        <!-- Left: Link Fighter Form -->
        <div class="card glass-card">
          <div class="card-header">
            <h3><i data-lucide="user-plus"></i> Biometric Enrollment & Fingerprint Capture</h3>
            <p class="text-xs text-muted">Scan member's fingerprint on Mantra MFS100 and store biometric ISO template.</p>
          </div>
          <div class="card-body">
            <form id="bio-enroll-form">
              <input type="hidden" id="enroll-iso-template">
              <input type="hidden" id="enroll-ansi-template">
              <input type="hidden" id="enroll-bitmap-data">
              <input type="hidden" id="enroll-quality-score" value="0">

              <div class="form-group">
                <label for="enroll-member">Select Gym Member *</label>
                <select id="enroll-member" required>
                  <option value="">-- Choose Fighter --</option>
                  ${members.map(m => `
                    <option value="${m.id}" data-code="${m.member_code}" data-name="${m.fullname}">
                      ${m.fullname} (${m.member_code} • ${m.status})
                    </option>
                  `).join('')}
                </select>
              </div>

              <div class="form-group">
                <label for="enroll-device">Biometric Device *</label>
                <select id="enroll-device" required>
                  <option value="">-- Choose Device --</option>
                  ${devices.map(d => `
                    <option value="${d.id}" ${d.vendor === 'Mantra' ? 'selected' : ''}>${d.name} (${d.vendor} • ${d.status})</option>
                  `).join('')}
                </select>
              </div>

              <!-- Optical Scanner Stage & Live Preview -->
              <div class="bio-scan-stage" style="background: rgba(0, 0, 0, 0.35); border: 1px dashed var(--color-border); border-radius: 8px; padding: 14px; margin-bottom: 1.25rem; display: flex; gap: 16px; align-items: center;">
                <div id="enroll-fingerprint-box" style="width: 90px; height: 110px; background: rgba(255,255,255,0.03); border: 2px dashed rgba(255,255,255,0.2); border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; position: relative;">
                  <img id="enroll-fingerprint-preview-img" src="" alt="Fingerprint Preview" style="width: 100%; height: 100%; object-fit: contain; display: none;">
                  <div id="enroll-fingerprint-placeholder" style="text-align: center; color: var(--color-text-muted);">
                    <i data-lucide="fingerprint" style="width: 36px; height: 36px; opacity: 0.5; margin-bottom: 4px;"></i>
                    <div style="font-size: 0.65rem;">No Scan</div>
                  </div>
                </div>

                <div style="flex: 1;">
                  <button type="button" class="btn btn-primary" id="btn-scan-enroll-mantra" style="width: 100%; padding: 10px 14px; font-weight: 700;">
                    <i data-lucide="scan"></i> Scan on Mantra MFS100
                  </button>
                  <div id="enroll-scan-status" style="font-size: 0.75rem; margin-top: 6px; color: var(--color-text-muted);">
                    Click to activate optical prism sensor
                  </div>
                  <div id="enroll-quality-badge-container" style="margin-top: 4px; display: none;">
                    <span id="enroll-quality-badge" class="badge" style="font-size: 0.75rem; font-weight: 700; background: rgba(76, 175, 80, 0.2); color: #4caf50; border: 1px solid rgba(76, 175, 80, 0.4);">
                      Quality: 0%
                    </span>
                  </div>
                </div>
              </div>

              <div class="form-group">
                <label for="enroll-dev-uid">Hardware User ID / Code *</label>
                <input type="text" id="enroll-dev-uid" required placeholder="e.g. 1001 or M1001" style="font-family: monospace; font-weight: 700;">
                <span class="text-xs text-muted" style="display: block; margin-top: 4px;">Unique ID linking member to hardware controller</span>
              </div>

              <div class="form-group">
                <label for="enroll-bio-type">Biometric Type</label>
                <select id="enroll-bio-type">
                  <option value="fingerprint" selected>Fingerprint Scan (Mantra MFS100)</option>
                  <option value="facial">Facial Recognition</option>
                  <option value="rfid_card">RFID Card / Keyfob</option>
                  <option value="palm">Palm Vein</option>
                </select>
              </div>

              <div class="form-group">
                <label for="enroll-notes">Notes</label>
                <input type="text" id="enroll-notes" placeholder="e.g. Right thumb optical scan on MFS100">
              </div>

              <button type="submit" class="btn btn-primary btn-block" style="margin-top: 1rem; padding: 12px;">
                <i data-lucide="link"></i> Save Biometric Enrollment
              </button>
            </form>
          </div>
        </div>

        <!-- Right: Active Enrollments Table -->
        <div class="card glass-card">
          <div class="card-header flex justify-between items-center">
            <h3><i data-lucide="list"></i> Enrolled Fighters (${enrollments.length})</h3>
            <div class="search-box-sm">
              <input type="text" id="search-enrollments" placeholder="Search linked fighters..." style="padding: 6px 12px; border-radius: 4px; border: 1px solid var(--color-border); font-size: 0.85rem; background: rgba(0,0,0,0.2);">
            </div>
          </div>
          <div class="card-body">
            <div class="table-container" style="max-height: 480px; overflow-y: auto;">
              <table>
                <thead>
                  <tr>
                    <th>Fighter</th>
                    <th>Biometric Data</th>
                    <th>Device / UID</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody id="enrollment-list-body">
                  ${BiometricView.renderEnrollmentRows(enrollments)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    // Auto-fill hardware ID from member code when member is selected
    content.querySelector('#enroll-member').addEventListener('change', (e) => {
      const selected = e.target.options[e.target.selectedIndex];
      const code = selected.dataset.code;
      if (code) {
        const numericPart = code.replace(/\D/g, '');
        content.querySelector('#enroll-dev-uid').value = numericPart || code;
      }
    });

    // One-Click Scan on MFS100
    content.querySelector('#btn-scan-enroll-mantra').addEventListener('click', async () => {
      const btn = content.querySelector('#btn-scan-enroll-mantra');
      const statusEl = content.querySelector('#enroll-scan-status');
      const memberSelect = content.querySelector('#enroll-member');
      const uidInput = content.querySelector('#enroll-dev-uid');
      const previewImg = content.querySelector('#enroll-fingerprint-preview-img');
      const placeholder = content.querySelector('#enroll-fingerprint-placeholder');
      const previewBox = content.querySelector('#enroll-fingerprint-box');
      const qualityBadge = content.querySelector('#enroll-quality-badge');
      const qualityContainer = content.querySelector('#enroll-quality-badge-container');

      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader"></i> Optical Prism Ready...';
      statusEl.innerHTML = '<span style="color: var(--color-accent); font-weight: 600;">🔴 Red light ON. Place member finger firmly on scanner...</span>';
      lucide.createIcons();

      try {
        const capture = await mantraClient.captureFingerprint({ quality: 50, timeout: 10 });
        if (capture.success) {
          // Store raw template and bitmap in hidden fields
          content.querySelector('#enroll-iso-template').value = capture.isoTemplate || '';
          content.querySelector('#enroll-ansi-template').value = capture.ansiTemplate || '';
          content.querySelector('#enroll-bitmap-data').value = capture.bitmapData || '';
          content.querySelector('#enroll-quality-score').value = capture.quality || 0;

          // Render BMP image preview
          if (capture.bitmapData) {
            previewImg.src = `data:image/bmp;base64,${capture.bitmapData}`;
            previewImg.style.display = 'block';
            placeholder.style.display = 'none';
            previewBox.style.borderColor = '#4caf50';
            previewBox.style.boxShadow = '0 0 10px rgba(76, 175, 80, 0.4)';
          }

          // Show quality score
          qualityBadge.textContent = `✓ Quality: ${capture.quality}% (NFIQ ${capture.nfiq || 1})`;
          qualityContainer.style.display = 'block';
          statusEl.innerHTML = `<span style="color: #4caf50; font-weight: 600;">✓ Scanned successfully! Ready to link.</span>`;

          // Auto-fill UID if empty
          if (!uidInput.value) {
            const memId = memberSelect.value;
            const selOption = memberSelect.options[memberSelect.selectedIndex];
            const code = selOption?.dataset?.code;
            uidInput.value = code || (memId ? `M${memId}` : `SCAN_${Date.now()}`);
          }

          showToast(`Fingerprint captured (${capture.quality}% quality)!`, 'success');
        } else {
          statusEl.innerHTML = `<span style="color: #f44336; font-weight: 600;">⚠️ ${capture.errorDescription}</span>`;
          showToast(capture.errorDescription, 'error');
        }
      } catch (err) {
        statusEl.innerHTML = `<span style="color: #f44336;">Scan error: ${err.message}</span>`;
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="scan"></i> Scan on Mantra MFS100';
        lucide.createIcons();
      }
    });

    // Form submit
    content.querySelector('#bio-enroll-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const memberId = parseInt(content.querySelector('#enroll-member').value, 10);
      const deviceId = parseInt(content.querySelector('#enroll-device').value, 10);
      const deviceUserId = content.querySelector('#enroll-dev-uid').value.trim();
      const bioType = content.querySelector('#enroll-bio-type').value;
      const notes = content.querySelector('#enroll-notes').value.trim();
      const isoTemplate = content.querySelector('#enroll-iso-template').value;
      const ansiTemplate = content.querySelector('#enroll-ansi-template').value;
      const bitmapData = content.querySelector('#enroll-bitmap-data').value;
      const qualityScore = parseInt(content.querySelector('#enroll-quality-score').value, 10) || 0;

      const data = {
        member_id: memberId,
        device_id: deviceId,
        device_user_id: deviceUserId,
        biometric_type: bioType,
        iso_template: isoTemplate,
        ansi_template: ansiTemplate,
        bitmap_data: bitmapData,
        quality_score: qualityScore,
        notes: notes
      };

      try {
        const res = await api.post('/api/biometric/enrollments', data);
        showToast(res.message || 'Fighter linked to biometric device!', 'success');
        await BiometricView.renderTab('enrollment', content);
      } catch (err) {
        showToast(err.message || 'Enrollment failed', 'error');
      }
    });

    // Search filter
    content.querySelector('#search-enrollments').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const filtered = BiometricView.enrollments.filter(x =>
        (x.member_name && x.member_name.toLowerCase().includes(q)) ||
        (x.member_code && x.member_code.toLowerCase().includes(q)) ||
        (x.device_user_id && x.device_user_id.toLowerCase().includes(q)) ||
        (x.device_name && x.device_name.toLowerCase().includes(q))
      );
      content.querySelector('#enrollment-list-body').innerHTML = BiometricView.renderEnrollmentRows(filtered);
      lucide.createIcons();
      BiometricView.bindUnenrollButtons(content);
    });

    // Bind unenroll buttons
    BiometricView.bindUnenrollButtons(content);
  },

  renderEnrollmentRows: (list) => {
    if (list.length === 0) {
      return `<tr><td colspan="5" class="text-center text-muted" style="padding: 2rem;">No biometric enrollments found. Select a member on the left to link fingerprint.</td></tr>`;
    }
    return list.map(en => {
      const hasImage = Boolean(en.bitmap_data || en.fingerprint_image);
      const imgSrc = en.bitmap_data ? `data:image/bmp;base64,${en.bitmap_data}` : (en.fingerprint_image || '');
      const quality = en.quality_score || 0;

      return `
        <tr>
          <td>
            <strong>${en.member_name || 'Member #' + en.member_id}</strong>
            <div class="text-xs text-muted">${en.member_code || ''} • ${en.member_status || 'Active'}</div>
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              ${hasImage ? `
                <img src="${imgSrc}" alt="Fingerprint" style="width: 32px; height: 38px; object-fit: contain; background: #000; border: 1px solid #4caf50; border-radius: 4px; padding: 1px; cursor: pointer;" title="Enrolled ISO Fingerprint">
              ` : `
                <div style="width: 32px; height: 38px; background: rgba(255,255,255,0.05); border: 1px dashed rgba(255,255,255,0.2); border-radius: 4px; display: flex; align-items: center; justify-content: center;">
                  <i data-lucide="fingerprint" style="width: 18px; height: 18px; opacity: 0.4;"></i>
                </div>
              `}
              <div>
                <span class="badge" style="font-size: 0.7rem; background: ${quality >= 60 ? 'rgba(76, 175, 80, 0.15)' : 'rgba(255, 193, 7, 0.15)'}; color: ${quality >= 60 ? '#4caf50' : '#ffc107'};">
                  ${quality > 0 ? `${quality}% Quality` : (en.iso_template ? 'ISO Template' : 'Linked UID')}
                </span>
                <div class="text-xs text-muted" style="text-transform: capitalize;">${en.biometric_type || 'fingerprint'}</div>
              </div>
            </div>
          </td>
          <td>
            <div>${en.device_name || 'Mantra MFS100'}</div>
            <span class="badge" style="background: rgba(255,215,0,0.15); color: var(--color-accent); font-family: monospace; font-weight: 700;">
              UID: ${en.device_user_id}
            </span>
          </td>
          <td>
            <span class="badge status-badge status-active">
              ${en.enrollment_status || 'Enrolled'}
            </span>
          </td>
          <td>
            <button class="btn-icon text-danger btn-unenroll" data-id="${en.id}" title="Unlink Biometric ID">
              <i data-lucide="unlink"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  bindUnenrollButtons: (content) => {
    content.querySelectorAll('.btn-unenroll').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        showConfirm({
          title: 'Unlink Biometric ID',
          message: 'Are you sure you want to remove this biometric hardware link? The member will no longer be identified by this device user ID.',
          confirmText: 'Unlink',
          isDanger: true,
          onConfirm: async () => {
            try {
              const res = await api.delete(`/api/biometric/enrollments/${id}`);
              showToast(res.message || 'Unlinked successfully', 'success');
              await BiometricView.renderTab('enrollment', content);
            } catch (err) {
              showToast(err.message, 'error');
            }
          }
        });
      });
    });
  },

  // ── 5. LIVE ACCESS LOGS TAB ─────────────────────────────────────────────────
  renderLogs: async (content) => {
    const devices = await api.get('/api/biometric/devices');
    const todayStr = new Date().toISOString().split('T')[0];

    content.innerHTML = `
      <div class="card glass-card">
        <div class="card-header flex justify-between items-center">
          <div>
            <h3><i data-lucide="activity"></i> Live Biometric Access Stream</h3>
            <p class="text-xs text-muted">Audited entry/exit verification logs and hardware callbacks</p>
          </div>
          <div class="flex gap-sm items-center">
            <label class="flex items-center gap-xs text-xs text-muted" style="cursor: pointer;">
              <input type="checkbox" id="chk-auto-refresh" checked> Auto-refresh (3s)
            </label>
            <button class="btn btn-secondary btn-sm" id="btn-refresh-logs">
              <i data-lucide="refresh-cw"></i> Refresh
            </button>
            <button class="btn btn-secondary btn-sm" id="btn-export-logs">
              <i data-lucide="download"></i> Export CSV
            </button>
          </div>
        </div>
        <div class="card-body">
          <!-- Filters Bar -->
          <div class="bio-filters-bar flex gap-sm flex-wrap" style="margin-bottom: 1.25rem;">
            <div class="form-group" style="min-width: 140px; margin: 0;">
              <label class="text-xs">Date From</label>
              <input type="date" id="log-date-from" value="${todayStr}">
            </div>
            <div class="form-group" style="min-width: 140px; margin: 0;">
              <label class="text-xs">Date To</label>
              <input type="date" id="log-date-to" value="${todayStr}">
            </div>
            <div class="form-group" style="min-width: 150px; margin: 0;">
              <label class="text-xs">Device</label>
              <select id="log-device-filter">
                <option value="">All Devices</option>
                ${devices.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="min-width: 130px; margin: 0;">
              <label class="text-xs">Result</label>
              <select id="log-result-filter">
                <option value="">All Results</option>
                <option value="Granted">Granted Only</option>
                <option value="Denied">Denied Only</option>
              </select>
            </div>
            <div class="form-group" style="flex-grow: 1; min-width: 180px; margin: 0;">
              <label class="text-xs">Search</label>
              <input type="text" id="log-search" placeholder="Search member, code, UID, reason...">
            </div>
          </div>

          <!-- Logs Table -->
          <div class="table-container" style="max-height: 520px; overflow-y: auto;">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Member / Fighter</th>
                  <th>Device</th>
                  <th>Hardware UID</th>
                  <th>Direction</th>
                  <th>Result</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody id="access-events-body">
                <tr><td colspan="7" class="text-center text-muted" style="padding: 2rem;">Loading access stream...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const fetchAndRenderLogs = async () => {
      const dateFrom = content.querySelector('#log-date-from')?.value || '';
      const dateTo = content.querySelector('#log-date-to')?.value || '';
      const deviceId = content.querySelector('#log-device-filter')?.value || '';
      const result = content.querySelector('#log-result-filter')?.value || '';
      const search = content.querySelector('#log-search')?.value || '';

      const query = new URLSearchParams();
      if (dateFrom) query.append('date_from', dateFrom);
      if (dateTo) query.append('date_to', dateTo);
      if (deviceId) query.append('device_id', deviceId);
      if (result) query.append('access_result', result);
      if (search) query.append('search', search);
      query.append('limit', '150');

      try {
        const data = await api.get(`/api/biometric/events?${query.toString()}`);
        BiometricView.events = data.events || [];
        const tbody = content.querySelector('#access-events-body');
        if (!tbody) return;

        if (BiometricView.events.length === 0) {
          tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 2.5rem;">No access events match current filters.</td></tr>`;
        } else {
          tbody.innerHTML = BiometricView.events.map(ev => {
            const isGranted = ev.access_result === 'Granted';
            const dt = new Date(ev.event_time);
            const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const dateStr = dt.toLocaleDateString([], { month: 'short', day: 'numeric' });

            return `
              <tr class="${isGranted ? '' : 'row-denied'}">
                <td>
                  <div style="font-family: monospace; font-size: 0.85rem;">${timeStr}</div>
                  <div class="text-xs text-muted">${dateStr}</div>
                </td>
                <td>
                  ${ev.member_name ? `
                    <strong>${ev.member_name}</strong>
                    <div class="text-xs text-muted">${ev.member_code || ''}</div>
                  ` : `
                    <span class="text-muted" style="font-style: italic;">Unrecognized User</span>
                  `}
                </td>
                <td>
                  <div>${ev.device_name || 'Gate'}</div>
                  <div class="text-xs text-muted">${ev.device_vendor || ''}</div>
                </td>
                <td>
                  <span class="badge" style="background: rgba(255,255,255,0.06); font-family: monospace;">
                    ${ev.device_user_id || '—'}
                  </span>
                </td>
                <td>
                  <span class="badge" style="background: rgba(0,0,0,0.2);">
                    ${ev.direction === 'check_out' ? 'Check-Out' : 'Check-In'}
                  </span>
                </td>
                <td>
                  <span class="badge status-badge ${isGranted ? 'status-active' : 'status-expired'}">
                    ${ev.access_result}
                  </span>
                </td>
                <td>
                  <span style="font-size: 0.85rem; color: ${isGranted ? 'var(--color-text-muted)' : '#f44336'};">
                    ${ev.reason}
                  </span>
                </td>
              </tr>
            `;
          }).join('');
        }
        lucide.createIcons();
      } catch (err) {
        console.error('Failed to stream access events:', err);
      }
    };

    await fetchAndRenderLogs();

    content.querySelector('#btn-refresh-logs')?.addEventListener('click', fetchAndRenderLogs);
    content.querySelectorAll('#log-date-from, #log-date-to, #log-device-filter, #log-result-filter').forEach(el => {
      el.addEventListener('change', fetchAndRenderLogs);
    });
    content.querySelector('#log-search')?.addEventListener('input', fetchAndRenderLogs);

    // CSV Export
    content.querySelector('#btn-export-logs')?.addEventListener('click', () => {
      if (!BiometricView.events || BiometricView.events.length === 0) {
        showToast('No logs to export', 'info');
        return;
      }
      const headers = ['ID', 'Timestamp', 'Member Name', 'Member Code', 'Device Name', 'Hardware UID', 'Direction', 'Result', 'Reason'];
      const rows = BiometricView.events.map(e => [
        e.id,
        `"${e.event_time}"`,
        `"${e.member_name || 'Unrecognized'}"`,
        `"${e.member_code || ''}"`,
        `"${e.device_name || ''}"`,
        `"${e.device_user_id || ''}"`,
        e.direction,
        e.access_result,
        `"${e.reason.replace(/"/g, '""')}"`
      ]);
      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FightClub_AccessLogs_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Access logs exported to CSV!', 'success');
    });

    liveLogInterval = setInterval(() => {
      const autoRefreshOn = content.querySelector('#chk-auto-refresh')?.checked;
      if (autoRefreshOn) {
        fetchAndRenderLogs();
      }
    }, 3000);
  },

  // ── 6. DECISION SIMULATOR TAB ───────────────────────────────────────────────
  renderSimulator: async (content) => {
    const [members, devices] = await Promise.all([
      api.get('/api/members'),
      api.get('/api/biometric/devices')
    ]);

    content.innerHTML = `
      <div class="bio-simulator-layout grid-2">
        <!-- Left: Input Simulator Config -->
        <div class="card glass-card">
          <div class="card-header">
            <h3><i data-lucide="sparkles"></i> Manual Access Decision Simulator</h3>
            <p class="text-xs text-muted">Test how the access-control engine evaluates an individual member's scan.</p>
          </div>
          <div class="card-body">
            <form id="bio-sim-form">
              <div class="form-group">
                <label for="sim-member">Select Member to Test *</label>
                <select id="sim-member" required>
                  <option value="">-- Choose Member --</option>
                  ${members.map(m => `
                    <option value="${m.id}">${m.fullname} (${m.member_code} • Status: ${m.status})</option>
                  `).join('')}
                </select>
              </div>

              <div class="form-group">
                <label for="sim-device">Target Device (Optional)</label>
                <select id="sim-device">
                  ${devices.map(d => `
                    <option value="${d.id}">${d.name} (${d.vendor})</option>
                  `).join('')}
                </select>
              </div>

              <button type="submit" class="btn btn-primary btn-block" style="padding: 12px; margin-top: 1.5rem;">
                <i data-lucide="play"></i> Simulate Biometric Scan & Evaluate
              </button>
            </form>
          </div>
        </div>

        <!-- Right: Diagnostic Output Report -->
        <div class="card glass-card">
          <div class="card-header">
            <h3><i data-lucide="clipboard-check"></i> Diagnostic Rule Breakdown</h3>
          </div>
          <div class="card-body" id="sim-result-container">
            <div class="empty-state" style="padding: 3rem 1rem;">
              <i data-lucide="cpu" style="width: 48px; height: 48px; color: var(--color-primary); opacity: 0.7;"></i>
              <h4>Ready to Evaluate</h4>
              <p>Select a member on the left and click "Simulate Biometric Scan" to inspect the exact decision pipeline.</p>
            </div>
          </div>
        </div>
      </div>
    `;

    content.querySelector('#bio-sim-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const memberId = content.querySelector('#sim-member').value;
      const deviceId = content.querySelector('#sim-device').value;
      const resultContainer = content.querySelector('#sim-result-container');

      resultContainer.innerHTML = '<div class="bio-loading"><div class="spinner"></div></div>';

      try {
        const report = await api.post('/api/biometric/access/check', {
          member_id: parseInt(memberId),
          device_id: deviceId ? parseInt(deviceId) : null
        });

        const d = report.decision;
        const isGranted = d.allowed;

        resultContainer.innerHTML = `
          <div class="sim-report">
            <!-- Verdict Banner -->
            <div class="sim-verdict-banner ${isGranted ? 'granted' : 'denied'}">
              <div class="sim-verdict-icon">
                <i data-lucide="${isGranted ? 'check-circle' : 'slash'}"></i>
              </div>
              <div>
                <h2 style="font-size: 1.4rem; font-weight: 800;">ACCESS ${d.accessResult.toUpperCase()}</h2>
                <div style="font-size: 0.95rem; margin-top: 2px;">${d.reason}</div>
              </div>
            </div>

            <!-- Detailed Diagnostic Checklist -->
            <div class="sim-checklist" style="margin-top: 1.5rem;">
              <div class="sim-check-item">
                <div class="sim-check-icon passed"><i data-lucide="check"></i></div>
                <div>
                  <strong>Device Authentication & Operational Check</strong>
                  <div class="text-xs text-muted">Device "${report.device.name}" is ${report.device.status}</div>
                </div>
              </div>

              <div class="sim-check-item">
                <div class="sim-check-icon ${report.enrollment ? 'passed' : 'warning'}">
                  <i data-lucide="${report.enrollment ? 'check' : 'alert-circle'}"></i>
                </div>
                <div>
                  <strong>Biometric Hardware Link Mapping</strong>
                  <div class="text-xs text-muted">
                    ${report.enrollment ? `Mapped to Device User ID "${report.enrollment.device_user_id}" (${report.enrollment.biometric_type})` : 'Using member code fallback identification'}
                  </div>
                </div>
              </div>

              <div class="sim-check-item">
                <div class="sim-check-icon ${d.ruleDetails.outsideHours ? 'failed' : 'passed'}">
                  <i data-lucide="${d.ruleDetails.outsideHours ? 'x' : 'check'}"></i>
                </div>
                <div>
                  <strong>Operating Gym Access Hours Check</strong>
                  <div class="text-xs text-muted">
                    ${d.ruleDetails.outsideHours ? 'Scan time is outside permitted hours' : 'Scan occurred within permitted gym hours (05:00 - 23:00)'}
                  </div>
                </div>
              </div>

              <div class="sim-check-item">
                <div class="sim-check-icon ${d.ruleDetails.statusDenied ? 'failed' : 'passed'}">
                  <i data-lucide="${d.ruleDetails.statusDenied ? 'x' : 'check'}"></i>
                </div>
                <div>
                  <strong>Member Account Status</strong>
                  <div class="text-xs text-muted">Status: <strong>${report.member.status}</strong></div>
                </div>
              </div>

              <div class="sim-check-item">
                <div class="sim-check-icon ${d.ruleDetails.expired ? 'failed' : (d.ruleDetails.graceActive ? 'warning' : 'passed')}">
                  <i data-lucide="${d.ruleDetails.expired ? 'x' : 'check'}"></i>
                </div>
                <div>
                  <strong>Subscription & Expiry Grace Period</strong>
                  <div class="text-xs text-muted">
                    Plan: ${d.ruleDetails.planName || 'N/A'} • Expiry: ${d.ruleDetails.expiryDate || 'N/A'}
                    ${d.warning ? `<span style="color: var(--color-accent);"> (${d.warning})</span>` : ''}
                  </div>
                </div>
              </div>

              <div class="sim-check-item">
                <div class="sim-check-icon ${d.ruleDetails.paymentDue ? 'failed' : 'passed'}">
                  <i data-lucide="${d.ruleDetails.paymentDue ? 'x' : 'check'}"></i>
                </div>
                <div>
                  <strong>Outstanding Balance / Due Fees Policy</strong>
                  <div class="text-xs text-muted">
                    ${d.ruleDetails.paymentDue ? `Overdue balance of ₹${d.ruleDetails.paymentDue} unpaid` : 'All dues clear / ₹0 outstanding balance'}
                  </div>
                </div>
              </div>

              <div class="sim-check-item">
                <div class="sim-check-icon ${d.ruleDetails.cooldownBlocked ? 'failed' : 'passed'}">
                  <i data-lucide="${d.ruleDetails.cooldownBlocked ? 'x' : 'check'}"></i>
                </div>
                <div>
                  <strong>Anti-Passback & Duplicate Scan Cooldown</strong>
                  <div class="text-xs text-muted">
                    ${d.ruleDetails.cooldownBlocked ? 'Scan blocked by recent scan cooldown' : 'Passed duplicate scan cooldown check'}
                  </div>
                </div>
              </div>
            </div>

            <div style="margin-top: 1rem; padding: 10px 14px; background: rgba(255,255,255,0.03); border-radius: 6px; font-size: 0.85rem;">
              <strong>Auto-Determined Direction:</strong> <span class="badge">${d.direction === 'check_out' ? 'Check-Out' : 'Check-In'}</span>
            </div>
          </div>
        `;
        lucide.createIcons();
      } catch (err) {
        resultContainer.innerHTML = `<div class="empty-state"><i data-lucide="alert-triangle"></i><h4>Simulation Failed</h4><p>${err.message}</p></div>`;
        lucide.createIcons();
      }
    });
  },

  // ── 7. ACCESS RULES TAB ─────────────────────────────────────────────────────
  renderRules: async (content) => {
    const rules = await api.get('/api/biometric/rules');
    BiometricView.rules = rules;

    const allowedStatuses = rules.allowed_member_statuses || ['Active'];

    content.innerHTML = `
      <div class="card glass-card" style="max-width: 800px; margin: 0 auto;">
        <div class="card-header">
          <h3><i data-lucide="shield-check"></i> Gym Access Control Policies</h3>
          <p class="text-xs text-muted">Configure automated entry/exit validation parameters and restrictions.</p>
        </div>
        <div class="card-body">
          <form id="bio-rules-form">
            <div class="form-group">
              <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                <input type="checkbox" id="rule-enabled" ${rules.enabled ? 'checked' : ''}>
                <strong>Enable Biometric Access Control Engine</strong>
              </label>
              <span class="text-xs text-muted" style="margin-left: 26px;">When disabled, all turnstile scan verification requests will be denied.</span>
            </div>

            <hr style="border: 0; border-top: 1px solid var(--color-border); margin: 1.5rem 0;">

            <div class="form-group">
              <label>Allowed Member Account Statuses</label>
              <div class="flex gap-md" style="margin-top: 8px;">
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                  <input type="checkbox" class="rule-status-chk" value="Active" ${allowedStatuses.includes('Active') ? 'checked' : ''}> Active
                </label>
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                  <input type="checkbox" class="rule-status-chk" value="Frozen" ${allowedStatuses.includes('Frozen') ? 'checked' : ''}> Frozen
                </label>
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                  <input type="checkbox" class="rule-status-chk" value="Expired" ${allowedStatuses.includes('Expired') ? 'checked' : ''}> Expired
                </label>
              </div>
            </div>

            <div class="form-grid-2" style="margin-top: 1rem;">
              <div class="form-group">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                  <input type="checkbox" id="rule-deny-expired" ${rules.deny_if_expired ? 'checked' : ''}>
                  <strong>Deny If Membership Expired</strong>
                </label>
              </div>
              <div class="form-group">
                <label for="rule-grace-days">Expiry Grace Period (Days)</label>
                <input type="number" id="rule-grace-days" min="0" max="30" value="${rules.grace_period_days || 0}">
                <span class="text-xs text-muted">Number of days a member can enter gym past their subscription expiry date.</span>
              </div>
            </div>

            <div class="form-group">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="rule-deny-payment" ${rules.deny_if_payment_due ? 'checked' : ''}>
                <strong>Deny Entry If Payment Balance Is Overdue</strong>
              </label>
              <span class="text-xs text-muted" style="margin-left: 26px;">Blocks turnstile access for members with unpaid invoices or pending fee balances.</span>
            </div>

            <div class="form-grid-2" style="margin-top: 1.25rem;">
              <div class="form-group">
                <label for="rule-start-time">Permitted Entry Start Time</label>
                <input type="time" id="rule-start-time" value="${rules.allowed_start_time || '05:00'}">
              </div>
              <div class="form-group">
                <label for="rule-end-time">Permitted Entry End Time</label>
                <input type="time" id="rule-end-time" value="${rules.allowed_end_time || '23:00'}">
              </div>
            </div>

            <div class="form-group" style="margin-top: 1rem;">
              <label for="rule-cooldown">Anti-Passback / Duplicate Scan Cooldown (Seconds)</label>
              <input type="number" id="rule-cooldown" min="0" max="300" value="${rules.cooldown_seconds !== undefined ? rules.cooldown_seconds : 45}">
              <span class="text-xs text-muted">Prevents duplicate scans or rapid double entry. Recommended: 30–60 seconds.</span>
            </div>

            <button type="submit" class="btn btn-primary" style="margin-top: 1.5rem; padding: 10px 24px;">
              <i data-lucide="save"></i> Save Access Rules
            </button>
          </form>
        </div>
      </div>
    `;

    content.querySelector('#bio-rules-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const statusBoxes = content.querySelectorAll('.rule-status-chk:checked');
      const allowed_member_statuses = Array.from(statusBoxes).map(b => b.value);

      const data = {
        enabled: content.querySelector('#rule-enabled').checked,
        allowed_member_statuses,
        deny_if_expired: content.querySelector('#rule-deny-expired').checked,
        grace_period_days: parseInt(content.querySelector('#rule-grace-days').value, 10),
        deny_if_payment_due: content.querySelector('#rule-deny-payment').checked,
        allowed_start_time: content.querySelector('#rule-start-time').value,
        allowed_end_time: content.querySelector('#rule-end-time').value,
        cooldown_seconds: parseInt(content.querySelector('#rule-cooldown').value, 10)
      };

      try {
        const res = await api.put('/api/biometric/rules', data);
        showToast(res.message || 'Access rules updated successfully!', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to update rules', 'error');
      }
    });
  },

  // ── 8. WHATSAPP ALERTS TAB ──────────────────────────────────────────────────
  renderNotifications: async (content) => {
    const notifs = await api.get('/api/biometric/notifications');
    BiometricView.notifications = notifs;

    content.innerHTML = `
      <div class="card glass-card" style="max-width: 800px; margin: 0 auto;">
        <div class="card-header">
          <h3><i data-lucide="message-square"></i> Biometric WhatsApp Notification Settings</h3>
          <p class="text-xs text-muted">Configure automated member alerts triggered by biometric entry/exit scans.</p>
        </div>
        <div class="card-body">
          <form id="bio-notif-form">
            <div class="form-group">
              <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                <input type="checkbox" id="notif-enabled" ${notifs.enabled ? 'checked' : ''}>
                <strong>Enable Biometric WhatsApp Notifications</strong>
              </label>
              <span class="text-xs text-muted" style="margin-left: 26px;">Sends instant WhatsApp messages to members when access events occur.</span>
            </div>

            <hr style="border: 0; border-top: 1px solid var(--color-border); margin: 1.5rem 0;">

            <div class="form-group">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="notif-checkin" ${notifs.notify_on_checkin ? 'checked' : ''}>
                <strong>Notify On Successful Check-In</strong>
              </label>
              <span class="text-xs text-muted" style="margin-left: 26px;">Sends confirmation message with timestamp and motivational quote.</span>
            </div>

            <div class="form-group">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="notif-checkout" ${notifs.notify_on_checkout ? 'checked' : ''}>
                <strong>Notify On Successful Check-Out</strong>
              </label>
              <span class="text-xs text-muted" style="margin-left: 26px;">Sends workout completion acknowledgement.</span>
            </div>

            <div class="form-group">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="notif-denied" ${notifs.notify_on_denied ? 'checked' : ''}>
                <strong>Notify On Denied Access (Expiry, Overdue, Inactive)</strong>
              </label>
              <span class="text-xs text-muted" style="margin-left: 26px;">Alerts member with specific reason and renewal instructions.</span>
            </div>

            <div class="form-group" style="margin-top: 1.25rem;">
              <label for="notif-cooldown">Per-Member Notification Cooldown (Minutes)</label>
              <input type="number" id="notif-cooldown" min="1" max="180" value="${notifs.cooldown_minutes !== undefined ? notifs.cooldown_minutes : 15}">
              <span class="text-xs text-muted">Prevents repeated notification spam if a member rescans within a short period.</span>
            </div>

            <div class="alert alert-info" style="margin-top: 1.5rem;">
              <i data-lucide="info"></i>
              <span>WhatsApp message templates (e.g. <code>biometric_checkin</code>, <code>biometric_denied_expired</code>) can be customized in <strong>WhatsApp &gt; Templates</strong>.</span>
            </div>

            <button type="submit" class="btn btn-primary" style="margin-top: 1.5rem; padding: 10px 24px;">
              <i data-lucide="save"></i> Save Notification Settings
            </button>
          </form>
        </div>
      </div>
    `;

    content.querySelector('#bio-notif-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        enabled: content.querySelector('#notif-enabled').checked,
        notify_on_checkin: content.querySelector('#notif-checkin').checked,
        notify_on_checkout: content.querySelector('#notif-checkout').checked,
        notify_on_denied: content.querySelector('#notif-denied').checked,
        cooldown_minutes: parseInt(content.querySelector('#notif-cooldown').value, 10)
      };

      try {
        const res = await api.put('/api/biometric/notifications', data);
        showToast(res.message || 'Notification settings saved!', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to update notification settings', 'error');
      }
    });
  },

  // ── 9. RETENTION & PRIVACY TAB ──────────────────────────────────────────────
  renderRetention: async (content) => {
    content.innerHTML = `
      <div class="bio-retention-layout" style="max-width: 800px; margin: 0 auto;">
        <!-- Privacy & Legal Notice -->
        <div class="card glass-card">
          <div class="card-header">
            <h3><i data-lucide="shield"></i> Biometric Data Privacy & Compliance Notice</h3>
          </div>
          <div class="card-body">
            <div class="alert alert-info" style="margin-bottom: 1.25rem;">
              <i data-lucide="lock"></i>
              <span><strong>Privacy-by-Design Architecture:</strong> This system does NOT store raw fingerprints, face photographs, facial embeddings, or biometric template hashes. Only hardware-generated ID mappings and entry timestamps are stored.</span>
            </div>
            <p class="text-sm text-muted" style="line-height: 1.7;">
              Gym operators are responsible for complying with applicable local data protection and biometric privacy laws. 
              Always obtain explicit written or digital consent from members prior to enrolling their biometric identifiers onto local scanners.
            </p>
          </div>
        </div>

        <!-- Retention Controls -->
        <div class="card glass-card" style="margin-top: 1.5rem;">
          <div class="card-header">
            <h3><i data-lucide="trash-2"></i> Access Logs Retention & Anonymization</h3>
            <p class="text-xs text-muted">Clean up or anonymize older entry/exit audit logs to maintain lean storage and privacy compliance.</p>
          </div>
          <div class="card-body">
            <form id="bio-retention-form">
              <div class="form-grid-2">
                <div class="form-group">
                  <label for="retention-days">Retention Window (Days)</label>
                  <select id="retention-days">
                    <option value="30">30 Days</option>
                    <option value="60">60 Days</option>
                    <option value="90" selected>90 Days (Recommended)</option>
                    <option value="180">180 Days (6 Months)</option>
                    <option value="365">365 Days (1 Year)</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="retention-mode">Cleanup Action</label>
                  <select id="retention-mode">
                    <option value="purge">Purge / Permanently Delete</option>
                    <option value="anonymize">Anonymize (Keep aggregates, remove member IDs)</option>
                  </select>
                </div>
              </div>

              <button type="submit" class="btn btn-secondary" style="margin-top: 1rem; color: var(--color-error); border-color: rgba(244,67,54,0.3);">
                <i data-lucide="trash"></i> Execute Retention Cleanup
              </button>
            </form>
          </div>
        </div>
      </div>
    `;

    content.querySelector('#bio-retention-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const retentionDays = parseInt(content.querySelector('#retention-days').value, 10);
      const mode = content.querySelector('#retention-mode').value;
      const anonymizeOnly = mode === 'anonymize';

      showConfirm({
        title: 'Execute Retention Cleanup',
        message: `Are you sure you want to ${anonymizeOnly ? 'anonymize' : 'permanently purge'} all biometric access events older than ${retentionDays} days?`,
        confirmText: 'Execute Cleanup',
        isDanger: true,
        onConfirm: async () => {
          try {
            const res = await api.post('/api/biometric/retention/cleanup', {
              retentionDays,
              anonymizeOnly
            });
            showToast(res.message || 'Retention cleanup executed', 'success');
          } catch (err) {
            showToast(err.message || 'Cleanup failed', 'error');
          }
        }
      });
    });
  }
};

export default BiometricView;
