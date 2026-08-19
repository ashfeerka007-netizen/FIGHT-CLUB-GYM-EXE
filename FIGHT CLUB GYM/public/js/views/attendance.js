// Attendance Check-in & Logs View for Fight Club Gym
import api from '../api.js';
import { showToast } from '../utils.js';

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
          
          <!-- Scan / Keyboard Entry Box -->
          <div class="scan-entry-box text-center" style="padding: var(--spacing-lg); border: 2px dashed var(--color-border); border-radius: var(--radius-md); background: rgba(0,0,0,0.1); margin-bottom: var(--spacing-lg);">
            <i class="mb-md animate-pulse" data-lucide="scan-face" style="width: 48px; height: 48px; color: var(--color-primary); opacity: 0.85;"></i>
            
            <form id="attendance-scan-form">
              <div class="form-group">
                <label for="scan-code-input" style="font-size: 0.95rem; font-weight:700;">Scan Member Card (QR / Barcode) or Type Code</label>
                <input type="text" id="scan-code-input" required placeholder="Type Member Code (e.g. FC-1001) and hit Enter" style="font-family:var(--font-secondary); text-align:center; font-size:1.15rem; letter-spacing:1px; margin-top:8px;">
              </div>
              <button type="submit" class="btn btn-primary btn-block">Trigger Check-In / Check-Out</button>
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
    
    // Barcode/QR input submit
    scanForm.addEventListener('submit', async (e) => {
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
