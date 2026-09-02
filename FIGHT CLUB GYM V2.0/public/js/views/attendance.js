// Attendance Check-in & Logs View for Fight Club Gym
import api from '../api.js';
import { showToast } from '../utils.js';
import mantraClient from '../libs/mantra-mfs100.js';

const AttendanceView = {
  attendance: [],
  members: [],
  
  render: async (container) => {
    await AttendanceView.fetchData();
    
    container.innerHTML = `
      <div class="attendance-layout grid-2">
        
        <!-- Left: Check-in / Scan Interface -->
        <div class="card glass-card">
          <h3 class="mb-md" style="font-size: 1.15rem; font-weight: 700;">Daily Check-In Ring</h3>

          <!-- Mantra Optical Biometric Punch Box -->
          <div class="bio-punch-box text-center" style="padding: 18px; border-radius: var(--radius-md); background: linear-gradient(135deg, rgba(255,107,0,0.12), rgba(214,40,40,0.08)); border: 1px solid rgba(255,107,0,0.3); margin-bottom: 1.25rem;">
            <button type="button" id="btn-att-scan-mantra" class="btn btn-primary btn-block" style="font-size: 1.1rem; padding: 12px; font-weight: 700; background: linear-gradient(135deg, #ff6b00, #d62828); border: none; box-shadow: 0 0 15px rgba(255, 107, 0, 0.35);">
              <i data-lucide="fingerprint" style="width: 22px; height: 22px; margin-right: 8px; vertical-align: middle;"></i> Scan Mantra Fingerprint
            </button>
            <div id="att-mantra-status" class="text-xs text-muted" style="margin-top: 8px;">
              Touch optical sensor to punch in/out and match against database
            </div>
          </div>
          
          <!-- Scan / Keyboard Entry Box -->
          <div class="scan-entry-box text-center" style="padding: var(--spacing-lg); border: 2px dashed var(--color-border); border-radius: var(--radius-md); background: rgba(0,0,0,0.1); margin-bottom: var(--spacing-lg);">
            <i class="mb-md animate-pulse" data-lucide="scan-face" style="width: 48px; height: 48px; color: var(--color-primary); opacity: 0.85;"></i>
            
            <form id="attendance-scan-form">
              <div class="form-group">
                <label for="scan-code-input" style="font-size: 0.95rem; font-weight:700;">Scan Member Card (QR / Barcode) or Type Code</label>
                <input type="text" id="scan-code-input" required placeholder="Type Member Code (e.g. FC-1001) and hit Enter" style="font-family:var(--font-secondary); text-align:center; font-size:1.15rem; letter-spacing:1px; margin-top:8px;">
              </div>
              <button type="submit" class="btn btn-secondary btn-block">Trigger Check-In / Check-Out</button>
            </form>
          </div>

          <!-- Manual Member Dropdown Check-In -->
          <div class="manual-checkin-box">
            <h4 class="mb-sm" style="font-weight:600;">Manual Check-In</h4>
            <form id="attendance-manual-form" class="flex gap-sm">
              <select id="attendance-manual-select" required style="width:100%; border:1px solid var(--color-border); padding:8px; border-radius:var(--radius-sm); background:var(--color-bg-card);">
                <option value="">Select Fighter to Check In...</option>
                ${AttendanceView.members.filter(m => m.status === 'Active').map(m => `
                  <option value="${m.id}">${m.fullname} (${m.member_code})</option>
                `).join('')}
              </select>
              <button type="submit" class="btn btn-secondary" style="flex-shrink:0;">Check In</button>
            </form>
          </div>
        </div>

        <!-- Right: Daily Attendance Logs list -->
        <div class="card glass-card">
          <h3 class="mb-md" style="font-size: 1.15rem; font-weight: 700;">Attendance Log (Today)</h3>
          
          <div class="table-container" style="max-height: 400px; overflow-y: auto;">
            <table>
              <thead>
                <tr>
                  <th>Fighter</th>
                  <th>Check In</th>
                  <th>Check Out</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="attendance-list-body">
                ${AttendanceView.attendance.length === 0 ? `
                  <tr><td colspan="4" class="text-center text-muted">No attendance logs for today yet.</td></tr>
                ` : AttendanceView.attendance.map(a => {
                  const checkInTime = new Date(a.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const checkOutTime = a.check_out ? new Date(a.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
                  
                  return `
                    <tr>
                      <td>
                        <strong>${a.fullname}</strong>
                        <div style="font-size:0.75rem; color:var(--color-text-muted);">${a.member_code}</div>
                      </td>
                      <td><span class="badge" style="background: rgba(76, 175, 80, 0.1); color: var(--color-success); font-weight:600;">${checkInTime}</span></td>
                      <td>
                        ${checkOutTime ? `
                          <span class="badge" style="background: rgba(0,0,0,0.1); color: var(--color-text-muted);">${checkOutTime}</span>
                        ` : `
                          <span class="badge status-badge status-frozen">Present</span>
                        `}
                      </td>
                      <td>
                        ${!a.check_out ? `
                          <button class="btn btn-secondary btn-sm btn-manual-checkout" data-id="${a.id}">Check Out</button>
                        ` : `
                          <span class="text-xs text-muted">Completed</span>
                        `}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    `;

    AttendanceView.bindEvents();
    lucide.createIcons();
  },
  
  fetchData: async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      AttendanceView.attendance = await api.get(`/api/attendance?date=${today}`);
      AttendanceView.members = await api.get('/api/members');
    } catch (e) {
      showToast('Error loading attendance logs: ' + e.message, 'error');
    }
  },
  
  bindEvents: () => {
    const scanForm = document.getElementById('attendance-scan-form');
    const manualForm = document.getElementById('attendance-manual-form');
    const btnMantra = document.getElementById('btn-att-scan-mantra');
    const statusMantra = document.getElementById('att-mantra-status');

    // Mantra MFS100 Optical Biometric Scan
    if (btnMantra) {
      btnMantra.addEventListener('click', async () => {
        btnMantra.disabled = true;
        btnMantra.innerHTML = '<i data-lucide="loader"></i> Scanning Sensor...';
        if (statusMantra) {
          statusMantra.innerHTML = '<span style="color: var(--color-accent); font-weight: 600;">🔴 Red light ON. Place finger flat on Mantra scanner...</span>';
        }
        lucide.createIcons();

        try {
          const capture = await mantraClient.captureFingerprint({ quality: 50, timeout: 10 });
          if (!capture.success) {
            showToast(capture.errorDescription || 'Fingerprint capture failed.', 'error');
            if (statusMantra) statusMantra.textContent = 'Touch optical sensor to punch in/out and match against database';
            return;
          }

          if (statusMantra) {
            statusMantra.innerHTML = '<span style="color: #4caf50;">Matching fingerprint in database...</span>';
          }

          const response = await api.post('/api/biometric/mantra/scan', {
            quality: capture.quality,
            rawPayload: {
              ...capture.raw,
              IsoTemplate: capture.isoTemplate,
              AnsiTemplate: capture.ansiTemplate,
              BitmapData: capture.bitmapData,
              Quality: capture.quality
            }
          });

          const isGranted = response.allowed;
          showToast(
            isGranted 
              ? `${response.direction === 'check_out' ? 'Check-Out' : 'Check-In'} logged for ${response.member?.name || 'Member'}!`
              : `Access Denied: ${response.reason}`,
            isGranted ? 'success' : 'warning'
          );

          // Reload layout to reflect new attendance log
          const container = document.getElementById('view-container');
          await AttendanceView.render(container);

        } catch (err) {
          showToast(err.message || 'Error communicating with Mantra sensor.', 'error');
        } finally {
          btnMantra.disabled = false;
          btnMantra.innerHTML = '<i data-lucide="fingerprint" style="width: 22px; height: 22px; margin-right: 8px; vertical-align: middle;"></i> Scan Mantra Fingerprint';
          lucide.createIcons();
        }
      });
    }
    
    // Barcode/QR input submit
    scanForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = document.getElementById('scan-code-input').value.trim();
      
      try {
        const response = await api.post('/api/attendance/scan', { code });
        showToast(`${response.type} successful for ${response.member.fullname}!`, 'success');
        
        // Reload layout
        const container = document.getElementById('view-container');
        await AttendanceView.render(container);
      } catch (err) {
        showToast(err.message || 'Scan verification failed.', 'error');
      }
    });
    
    // Manual dropdown submit
    manualForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const member_id = parseInt(document.getElementById('attendance-manual-select').value);
      
      try {
        await api.post('/api/attendance/manual', { member_id });
        showToast('Fighter checked in manually.', 'success');
        
        const container = document.getElementById('view-container');
        await AttendanceView.render(container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    
    // Checkout action buttons
    document.querySelectorAll('.btn-manual-checkout').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          await api.post(`/api/attendance/${id}/checkout`);
          showToast('Fighter checked out.', 'info');
          
          const container = document.getElementById('view-container');
          await AttendanceView.render(container);
        } catch (e) {
          showToast(e.message, 'error');
        }
      });
    });
  }
};

export default AttendanceView;
