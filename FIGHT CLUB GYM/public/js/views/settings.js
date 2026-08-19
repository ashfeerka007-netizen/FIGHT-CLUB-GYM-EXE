// System Settings & Database Backups View for Fight Club Gym
import api from '../api.js';
import { showToast, showConfirm } from '../utils.js';

const SettingsView = {
  settings: null,
  backups: [],
  
  render: async (container) => {
    await SettingsView.fetchData();
    
    const s = SettingsView.settings;
    
    container.innerHTML = `
      <div class="settings-layout grid-2">
        
        <!-- Left: Gym Information Settings Form -->
        <div class="card glass-card">
          <h3 class="mb-md" style="font-size: 1.15rem; font-weight: 700;">Club Configuration</h3>
          
          <form id="settings-config-form" enctype="multipart/form-data">
            <div class="form-group">
              <label for="set-gymname">Gym Name *</label>
              <input type="text" id="set-gymname" required value="${s.gym_name || 'Fight Club'}">
            </div>

            <div class="form-group">
              <label for="set-tagline">Tagline / Motto</label>
              <input type="text" id="set-tagline" value="${s.tagline || ''}">
            </div>

            <div class="form-group">
              <label for="set-address">Business Address</label>
              <textarea id="set-address" rows="2">${s.address || ''}</textarea>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="set-phone">Phone Number</label>
                <input type="text" id="set-phone" value="${s.phone || ''}">
              </div>

              <div class="form-group">
                <label for="set-email">Email Address</label>
                <input type="email" id="set-email" value="${s.email || ''}">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="set-gst">GST Number</label>
                <input type="text" id="set-gst" value="${s.gst_number || ''}">
              </div>

              <div class="form-group">
                <label for="set-currency">Currency Mode</label>
                <select id="set-currency">
                  <option value="INR" ${s.currency === 'INR' ? 'selected' : ''}>INR (₹)</option>
                  <option value="USD" ${s.currency === 'USD' ? 'selected' : ''}>USD ($)</option>
                  <option value="EUR" ${s.currency === 'EUR' ? 'selected' : ''}>EUR (€)</option>
                </select>
              </div>
            </div>

            <!-- Logo Upload -->
            <div class="form-group">
              <label for="set-logo">Upload Brand Logo</label>
              <input type="file" id="set-logo" accept="image/*">
              ${s.logo_path ? `<div style="font-size:0.75rem; color:var(--color-success); margin-top:5px;">Active Logo: <a href="${s.logo_path}" target="_blank">${s.logo_path.split('/').pop()}</a></div>` : ''}
            </div>

            <button type="submit" class="btn btn-primary btn-block">Save Club Settings</button>
          </form>
        </div>

        <!-- Right Column Wrapper -->
        <div style="display:flex; flex-direction:column; gap: var(--spacing-lg); align-self: start;">
          
          <!-- Database Backup Card -->
          <div class="card glass-card" style="width:100%;">
            <div class="flex justify-between align-center mb-md">
              <h3 style="font-size: 1.15rem; font-weight: 700;">Database Backup & Recovery</h3>
              <button class="btn btn-primary btn-sm" id="btn-create-backup-now"><i data-lucide="shield-alert"></i> Backup Now</button>
            </div>
            
            <p class="text-sm text-muted mb-md">
              Create AES-256 encrypted backups of your entire member base, payments, attendance and plans. Backups are stored locally in the <code>/backups</code> folder.
            </p>

            <!-- Backups List -->
            <h4 class="mb-sm" style="font-weight:600; font-size:0.9rem; text-transform:uppercase; color:var(--color-text-muted);">Backup Archive</h4>
            
            <div class="table-container" style="max-height: 300px; overflow-y: auto;">
              <table>
                <thead>
                  <tr>
                    <th>Filename</th>
                    <th>Created At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="backups-list-body">
                  ${SettingsView.backups.length === 0 ? `
                    <tr><td colspan="3" class="text-center text-muted">No backup logs found.</td></tr>
                  ` : SettingsView.backups.map(b => `
                    <tr>
                      <td>
                        <span style="font-family: monospace; font-size: 0.8rem;" title="${b.filename}">${b.filename.substring(0,22)}...</span>
                        <div style="font-size:0.65rem; color:var(--color-text-muted);">${b.type} | ${b.status}</div>
                      </td>
                      <td class="text-xs">${new Date(b.timestamp).toLocaleString()}</td>
                      <td>
                        <div class="flex gap-sm">
                          <a href="/api/backups/${b.id}/download" class="btn btn-secondary btn-sm" title="Download backup"><i data-lucide="download" style="width:12px;height:12px;"></i></a>
                          <button class="btn btn-danger btn-sm btn-restore-backup" data-id="${b.id}" title="Restore DB to this state"><i data-lucide="rotate-ccw" style="width:12px;height:12px;"></i></button>
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Danger Zone: Reset Financials -->
          <div class="card glass-card" style="width:100%; border-left: 4px solid var(--color-error); background: rgba(244, 67, 54, 0.02);">
            <h3 class="mb-md" style="font-size: 1.15rem; font-weight: 700; color: var(--color-error); display: flex; align-items: center; gap: 8px;">
              <i data-lucide="alert-triangle"></i> Danger Zone
            </h3>
            <p class="text-sm text-muted mb-md">
              Permanently delete all gym revenue (payments) and expense records to give the system a fresh start. This action is irreversible. We recommend taking a backup first.
            </p>
            <button class="btn btn-danger btn-block" id="btn-reset-financials" style="width: 100%; display: flex; justify-content: center; gap: 8px; align-items: center;">
              <i data-lucide="trash-2" style="width:16px; height:16px;"></i> Reset Revenue & Expenses
            </button>
          </div>

        </div>

      </div>
    `;

    SettingsView.bindEvents();
    lucide.createIcons();
  },
  
  fetchData: async () => {
    try {
      SettingsView.settings = await api.get('/api/settings');
      SettingsView.backups = await api.get('/api/backups');
    } catch (e) {
      showToast('Error loading settings/backups: ' + e.message, 'error');
    }
  },
  
  bindEvents: () => {
    const configForm = document.getElementById('settings-config-form');
    const backupBtn = document.getElementById('btn-create-backup-now');
    
    // Save configurations
    configForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = new FormData();
      formData.append('gym_name', document.getElementById('set-gymname').value);
      formData.append('tagline', document.getElementById('set-tagline').value);
      formData.append('address', document.getElementById('set-address').value);
      formData.append('phone', document.getElementById('set-phone').value);
      formData.append('email', document.getElementById('set-email').value);
      formData.append('gst_number', document.getElementById('set-gst').value);
      formData.append('currency', document.getElementById('set-currency').value);
      
      const logoFile = document.getElementById('set-logo').files[0];
      if (logoFile) {
        formData.append('logo', logoFile);
      }
      
      try {
        await api.post('/api/settings', formData, true);
        showToast('Settings saved. Refreshing brand configurations.', 'success');
        
        // Reload Settings details and apply logo/names instantly
        const freshSettings = await api.get('/api/settings');
        // Apply settings changes immediately in global topbars
        document.querySelector('.logo-text h2').textContent = freshSettings.gym_name;
        document.querySelector('.gym-tagline').textContent = freshSettings.tagline;
        
        const logoBox = document.querySelector('.logo-icon');
        if (freshSettings.logo_path && logoBox) {
          logoBox.style.backgroundImage = `url(${freshSettings.logo_path})`;
          logoBox.style.backgroundSize = 'cover';
          logoBox.style.backgroundPosition = 'center';
          logoBox.style.backgroundColor = 'transparent';
          logoBox.style.borderRadius = '50%';
          logoBox.style.boxShadow = 'none';
          logoBox.textContent = '';
        }
        
        const container = document.getElementById('view-container');
        await SettingsView.render(container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    
    // Create backup manual trigger
    backupBtn.addEventListener('click', async () => {
      try {
        const result = await api.post('/api/backups', {});
        showToast(`Encrypted backup created: ${result.filename}`, 'success');
        
        const container = document.getElementById('view-container');
        await SettingsView.render(container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    
    // Restore backup click
    document.querySelectorAll('.btn-restore-backup').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        
        showConfirm(
          'Restore Backup',
          'CAUTION: Restoring database will overwrite current state. Unsaved data will be lost. Proceed?',
          async () => {
            try {
              const response = await api.post(`/api/backups/${id}/restore`, {});
              showToast(response.message, 'success');
              
              // Force reload page to refresh sqlite states
              setTimeout(() => {
                window.location.reload();
              }, 1500);
            } catch (e) {
              showToast(e.message, 'error');
            }
          }
        );
      });
    });

    // Reset financials click
    const resetBtn = document.getElementById('btn-reset-financials');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        showConfirm(
          'Reset Financial Records',
          'WARNING: This will permanently delete all payment records and expense logs, resetting your financial data for a fresh start. This action is irreversible. Proceed?',
          async () => {
            try {
              const response = await api.post('/api/settings/reset-financials', {});
              showToast(response.message, 'success');
              // Force reload page to refresh dashboard and other views
              setTimeout(() => {
                window.location.reload();
              }, 1500);
            } catch (err) {
              showToast(err.message, 'error');
            }
          }
        );
      });
    }
  }
};

export default SettingsView;
