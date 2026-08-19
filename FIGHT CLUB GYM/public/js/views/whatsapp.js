// WhatsApp Notification & Reminder System View — Fight Club Gym
import api from '../api.js';
import { showToast, showConfirm } from '../utils.js';

const PLACEHOLDERS = [
  'MemberName','MembershipPlan','Amount','DueDate','ExpiryDate',
  'ReceiptNo','InvoiceNo','MembershipID','GymName','TrainerName',
  'PaymentLink','ContactNumber','StartDate','FreezeDays'
];

const WhatsAppView = {
  activeTab: 'overview',

  render: async (container) => {
    container.innerHTML = `
      <div class="wa-wrapper">
        <div class="wa-header">
          <div class="wa-title-row">
            <div class="wa-icon-badge"><i data-lucide="message-circle"></i></div>
            <div>
              <h1 class="wa-main-title">WhatsApp Notifications</h1>
              <p class="wa-subtitle">Automated member communication & reminder system</p>
            </div>
          </div>
          <div class="wa-status-badge" id="wa-status-badge">
            <span class="status-dot disabled"></span><span>Not Configured</span>
          </div>
        </div>
        <div class="wa-tabs">
          <button class="wa-tab active" data-tab="overview"><i data-lucide="layout-dashboard"></i> Overview</button>
          <button class="wa-tab" data-tab="templates"><i data-lucide="file-text"></i> Templates</button>
          <button class="wa-tab" data-tab="bulk"><i data-lucide="send"></i> Bulk Send</button>
          <button class="wa-tab" data-tab="logs"><i data-lucide="list"></i> Logs</button>
          <button class="wa-tab" data-tab="reminders"><i data-lucide="clock"></i> Reminders</button>
          <button class="wa-tab" data-tab="settings"><i data-lucide="settings"></i> Settings</button>
        </div>
        <div id="wa-tab-content" class="wa-tab-content"></div>
      </div>`;

    const tabs = container.querySelectorAll('.wa-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        WhatsAppView.activeTab = tab.dataset.tab;
        WhatsAppView.renderTab(tab.dataset.tab, container.querySelector('#wa-tab-content'));
      });
    });
    try {
      const settings = await api.get('/api/whatsapp/settings');
      const badge = container.querySelector('#wa-status-badge');
      if (settings.enabled) {
        badge.innerHTML = '<span class="status-dot active"></span><span>Active</span>';
        badge.className = 'wa-status-badge enabled';
      }
    } catch {}
    WhatsAppView.renderTab(WhatsAppView.activeTab || 'overview', container.querySelector('#wa-tab-content'));
    lucide.createIcons();
  },

  renderTab: async (tab, content) => {
    content.innerHTML = '<div class="wa-loading"><div class="spinner"></div></div>';
    try {
      switch(tab) {
        case 'overview':  await WhatsAppView.renderOverview(content); break;
        case 'templates': await WhatsAppView.renderTemplates(content); break;
        case 'bulk':      await WhatsAppView.renderBulk(content); break;
        case 'logs':      await WhatsAppView.renderLogs(content); break;
        case 'reminders': await WhatsAppView.renderReminders(content); break;
        case 'settings':  await WhatsAppView.renderSettings(content); break;
      }
    } catch(err) {
      content.innerHTML = `<div class="empty-state"><i data-lucide="alert-triangle"></i><h2>Error</h2><p>${err.message}</p></div>`;
    }
    lucide.createIcons();
  },

  renderOverview: async (content) => {
    const stats = await api.get('/api/whatsapp/stats');
    content.innerHTML = `
      <div class="wa-overview">
        <div class="wa-stats-grid">
          <div class="wa-stat-card green"><div class="wa-stat-icon"><i data-lucide="send"></i></div><div class="wa-stat-info"><div class="wa-stat-value">${stats.sentToday}</div><div class="wa-stat-label">Sent Today</div></div></div>
          <div class="wa-stat-card yellow"><div class="wa-stat-icon"><i data-lucide="clock"></i></div><div class="wa-stat-info"><div class="wa-stat-value">${stats.pending}</div><div class="wa-stat-label">Pending Queue</div></div></div>
          <div class="wa-stat-card red"><div class="wa-stat-icon"><i data-lucide="alert-triangle"></i></div><div class="wa-stat-info"><div class="wa-stat-value">${stats.failedToday}</div><div class="wa-stat-label">Failed Today</div></div></div>
          <div class="wa-stat-card blue"><div class="wa-stat-icon"><i data-lucide="trending-up"></i></div><div class="wa-stat-info"><div class="wa-stat-value">${stats.successRate}%</div><div class="wa-stat-label">Success Rate</div></div></div>
        </div>
        <div class="wa-overview-panels">
          <div class="card glass-card">
            <div class="card-header"><h3><i data-lucide="activity"></i> Total Messages</h3></div>
            <div class="card-body">
              <div class="wa-totals">
                <div class="wa-total-row"><span>Total Sent</span><strong class="text-success">${stats.totalSent}</strong></div>
                <div class="wa-total-row"><span>Total Messages</span><strong>${stats.totalAll}</strong></div>
                <div class="wa-total-row"><span>Overall Success Rate</span><strong>${stats.successRate}%</strong></div>
              </div>
              <div class="wa-progress-bar"><div class="wa-progress-fill" style="width:${stats.successRate}%"></div></div>
            </div>
          </div>
          <div class="card glass-card">
            <div class="card-header"><h3><i data-lucide="info"></i> Quick Guide</h3></div>
            <div class="card-body">
              <div class="wa-guide-list">
                <div class="wa-guide-item"><span class="wa-guide-num">1</span><span>Go to <strong>Settings</strong> tab and enter your API credentials</span></div>
                <div class="wa-guide-item"><span class="wa-guide-num">2</span><span>Click <strong>Test Connection</strong> to verify setup</span></div>
                <div class="wa-guide-item"><span class="wa-guide-num">3</span><span>Edit <strong>Templates</strong> to customize messages</span></div>
                <div class="wa-guide-item"><span class="wa-guide-num">4</span><span>Configure <strong>Reminders</strong> schedule</span></div>
                <div class="wa-guide-item"><span class="wa-guide-num">5</span><span>Enable WhatsApp in Settings to start auto-sending</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  },

  templateCard: (t) => `
    <div class="wa-template-card card glass-card ${t.is_active ? '' : 'inactive'}" data-category="${t.category}">
      <div class="wa-template-header">
        <div>
          <span class="wa-cat-badge wa-cat-${t.category.toLowerCase()}">${t.category}</span>
          <h4 class="wa-template-name">${t.name}</h4>
          <code class="wa-template-key">${t.key}</code>
        </div>
        <div class="wa-template-actions">
          <button class="btn btn-icon btn-secondary btn-edit-template" data-id="${t.id}" title="Edit"><i data-lucide="pencil"></i></button>
          <button class="btn btn-icon ${t.is_active ? 'btn-warning' : 'btn-success'} btn-toggle-template" data-id="${t.id}" title="${t.is_active ? 'Disable' : 'Enable'}"><i data-lucide="${t.is_active ? 'pause-circle' : 'play-circle'}"></i></button>
          <button class="btn btn-icon btn-danger btn-delete-template" data-id="${t.id}" title="Delete"><i data-lucide="trash-2"></i></button>
        </div>
      </div>
      <div class="wa-template-preview">${t.body.substring(0,120)}${t.body.length > 120 ? '...' : ''}</div>
    </div>`,

  renderTemplates: async (content) => {
    const templates = await api.get('/api/whatsapp/templates');
    const categories = [...new Set(templates.map(t => t.category))];
    content.innerHTML = `
      <div class="wa-templates">
        <div class="wa-templates-toolbar">
          <div class="wa-cat-filters">
            <button class="btn btn-sm btn-secondary wa-cat-btn active" data-cat="all">All</button>
            ${categories.map(c => `<button class="btn btn-sm btn-secondary wa-cat-btn" data-cat="${c}">${c}</button>`).join('')}
          </div>
          <button class="btn btn-primary btn-sm" id="btn-add-template"><i data-lucide="plus"></i> New Template</button>
        </div>
        <div class="wa-templates-grid" id="wa-templates-grid">
          ${templates.map(t => WhatsAppView.templateCard(t)).join('')}
        </div>
      </div>`;

    content.querySelectorAll('.wa-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        content.querySelectorAll('.wa-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const cat = btn.dataset.cat;
        content.querySelectorAll('.wa-template-card').forEach(card => {
          card.style.display = (cat === 'all' || card.dataset.category === cat) ? '' : 'none';
        });
      });
    });
    content.querySelector('#btn-add-template').addEventListener('click', () => WhatsAppView.openTemplateModal(null, content));
    content.querySelectorAll('.btn-edit-template').forEach(btn => {
      const t = templates.find(t => t.id == btn.dataset.id);
      btn.addEventListener('click', () => WhatsAppView.openTemplateModal(t, content));
    });
    content.querySelectorAll('.btn-toggle-template').forEach(btn => {
      btn.addEventListener('click', async () => {
        const t = templates.find(t => t.id == btn.dataset.id);
        await api.put(`/api/whatsapp/templates/${t.id}`, { ...t, is_active: t.is_active ? 0 : 1 });
        showToast('Template updated');
        WhatsAppView.renderTab('templates', content);
      });
    });
    content.querySelectorAll('.btn-delete-template').forEach(btn => {
      btn.addEventListener('click', () => {
        showConfirm('Delete Template', 'This template will be permanently deleted.', async () => {
          await api.delete(`/api/whatsapp/templates/${btn.dataset.id}`);
          showToast('Template deleted');
          WhatsAppView.renderTab('templates', content);
        });
      });
    });
    lucide.createIcons();
  },

  openTemplateModal: (template, content) => {
    const isEdit = !!template;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-card" style="max-width:700px;width:95vw;">
        <div class="modal-header">
          <h2>${isEdit ? 'Edit Template' : 'New Template'}</h2>
          <button class="btn btn-icon btn-secondary" id="close-tpl-modal"><i data-lucide="x"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-grid-2">
            <div class="form-group"><label>Template Name *</label><input type="text" id="tpl-name" value="${template?.name || ''}" placeholder="e.g. Expiry Reminder"></div>
            <div class="form-group"><label>Category</label>
              <select id="tpl-category">${['Membership','Payment','General'].map(c => `<option ${template?.category===c?'selected':''}>${c}</option>`).join('')}</select>
            </div>
          </div>
          ${!isEdit ? '<div class="form-group"><label>Template Key *</label><input type="text" id="tpl-key" placeholder="e.g. my_custom_reminder"></div>' : ''}
          <div class="form-group">
            <label>Message Body *</label>
            <div class="wa-placeholder-chips">${PLACEHOLDERS.map(p => `<button type="button" class="wa-chip" data-ph="${p}">{{${p}}}</button>`).join('')}</div>
            <textarea id="tpl-body" rows="8" placeholder="Write message...">${template?.body || ''}</textarea>
          </div>
          <div class="wa-preview-box"><div class="wa-preview-label"><i data-lucide="eye"></i> Preview</div>
            <div class="wa-preview-bubble" id="tpl-preview-text">${(template?.body||'').replace(/\n/g,'<br>')}</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="cancel-tpl">Cancel</button>
          <button class="btn btn-primary" id="save-tpl">${isEdit ? 'Save Changes' : 'Create Template'}</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    lucide.createIcons();
    const textarea = modal.querySelector('#tpl-body');
    const preview = modal.querySelector('#tpl-preview-text');
    textarea.addEventListener('input', () => { preview.innerHTML = textarea.value.replace(/\n/g,'<br>'); });
    modal.querySelectorAll('.wa-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const pos = textarea.selectionStart;
        const insert = `{{${chip.dataset.ph}}}`;
        textarea.value = textarea.value.slice(0,pos) + insert + textarea.value.slice(pos);
        textarea.focus(); textarea.setSelectionRange(pos+insert.length,pos+insert.length);
        preview.innerHTML = textarea.value.replace(/\n/g,'<br>');
      });
    });
    const close = () => modal.remove();
    modal.querySelector('#close-tpl-modal').addEventListener('click', close);
    modal.querySelector('#cancel-tpl').addEventListener('click', close);
    modal.querySelector('#save-tpl').addEventListener('click', async () => {
      const name = modal.querySelector('#tpl-name').value.trim();
      const body = textarea.value.trim();
      const category = modal.querySelector('#tpl-category').value;
      if (!name||!body) return showToast('Name and body required','error');
      try {
        if (isEdit) {
          await api.put(`/api/whatsapp/templates/${template.id}`, { name, category, body, is_active: template.is_active });
          showToast('Template updated');
        } else {
          const key = modal.querySelector('#tpl-key').value.trim().replace(/\s+/g,'_');
          if (!key) return showToast('Template key required','error');
          await api.post('/api/whatsapp/templates', { key, name, category, body });
          showToast('Template created');
        }
        close(); WhatsAppView.renderTab('templates', content);
      } catch(e) { showToast(e.message,'error'); }
    });
  },

  renderBulk: async (content) => {
    const [templates, meta] = await Promise.all([api.get('/api/whatsapp/templates'), api.get('/api/whatsapp/members')]);
    const activeTemplates = templates.filter(t => t.is_active);
    content.innerHTML = `
      <div class="wa-bulk">
        <div class="card glass-card">
          <div class="card-header"><h3><i data-lucide="users"></i> Bulk WhatsApp Message</h3></div>
          <div class="card-body">
            <div class="form-grid-2">
              <div class="form-group"><label>Audience *</label>
                <select id="bulk-audience">
                  <option value="all">All Members</option>
                  <option value="active">Active Members</option>
                  <option value="expired">Expired Members</option>
                  <option value="overdue">Members with Outstanding Fees</option>
                  ${meta.plans.map(p => `<option value="plan:${p.id}">Plan: ${p.name}</option>`).join('')}
                  ${meta.trainers.map(t => `<option value="trainer:${t.id}">Trainer: ${t.fullname}</option>`).join('')}
                </select>
              </div>
              <div class="form-group"><label>Message Template *</label>
                <select id="bulk-template">${activeTemplates.map(t => `<option value="${t.key}" data-body="${encodeURIComponent(t.body)}">${t.name}</option>`).join('')}</select>
              </div>
            </div>
            <div class="form-group"><label>Message Preview</label>
              <div class="wa-preview-box"><div class="wa-preview-bubble" id="bulk-preview-text"></div></div>
            </div>
            <div class="wa-bulk-note"><i data-lucide="info"></i>
              <span>Placeholders like <code>{{MemberName}}</code> will be replaced with each member's data.</span>
            </div>
            <div class="wa-bulk-actions">
              <button class="btn btn-primary btn-lg" id="btn-bulk-send"><i data-lucide="send"></i> Send to Selected Audience</button>
            </div>
          </div>
        </div>
      </div>`;
    const templateSelect = content.querySelector('#bulk-template');
    const previewText = content.querySelector('#bulk-preview-text');
    const updatePreview = () => {
      const selected = templateSelect.options[templateSelect.selectedIndex];
      previewText.innerHTML = selected ? decodeURIComponent(selected.dataset.body||'').replace(/\n/g,'<br>') : '';
    };
    templateSelect.addEventListener('change', updatePreview);
    updatePreview();
    content.querySelector('#btn-bulk-send').addEventListener('click', () => {
      const audience = content.querySelector('#bulk-audience').value;
      const templateKey = templateSelect.value;
      const audienceLabel = content.querySelector('#bulk-audience').options[content.querySelector('#bulk-audience').selectedIndex].text;
      showConfirm('Confirm Bulk Send',
        `Send to: <strong>${audienceLabel}</strong>?<br>Template: <strong>${templateSelect.options[templateSelect.selectedIndex].text}</strong>`,
        async () => {
          try {
            const result = await api.post('/api/whatsapp/send-bulk', { audience, templateKey });
            showToast(result.message, 'success');
          } catch(e) { showToast(e.message,'error'); }
        }, 'Send Now', 'btn-primary');
    });
    lucide.createIcons();
  },

  renderLogs: async (content) => {
    const logs = await api.get('/api/whatsapp/logs?limit=200');
    content.innerHTML = `
      <div class="wa-logs">
        <div class="wa-logs-toolbar">
          <div class="wa-logs-filters">
            <input type="text" id="log-search" class="search-box" placeholder="Search member...">
            <select id="log-status-filter"><option value="">All Status</option><option value="sent">Sent</option><option value="failed">Failed</option></select>
            <input type="date" id="log-from" class="date-input">
            <input type="date" id="log-to" class="date-input">
            <button class="btn btn-secondary btn-sm" id="btn-filter-logs">Filter</button>
          </div>
          <button class="btn btn-secondary btn-sm" id="btn-export-logs"><i data-lucide="download"></i> Export CSV</button>
        </div>
        <div class="table-container">
          <table class="data-table">
            <thead><tr><th>Date & Time</th><th>Member</th><th>Mobile</th><th>Type</th><th>Template</th><th>Status</th><th>Sent By</th><th>Actions</th></tr></thead>
            <tbody id="logs-tbody">
              ${logs.length===0 ? '<tr><td colspan="8" class="text-center text-muted">No logs yet</td></tr>'
                : logs.map(log => `<tr>
                    <td>${new Date(log.sent_at).toLocaleString()}</td>
                    <td>${log.member_name||'—'}</td><td>${log.mobile}</td>
                    <td>${log.notification_type||'—'}</td>
                    <td><code>${log.template_key||'—'}</code></td>
                    <td><span class="badge badge-${log.status==='sent'||log.status==='delivered'?'success':'danger'}">${log.status}</span></td>
                    <td>${log.sent_by||'system'}</td>
                    <td>
                      ${log.status==='failed'?`<button class="btn btn-icon btn-secondary btn-resend" data-id="${log.id}" title="Resend"><i data-lucide="refresh-cw"></i></button>`:''}
                      <button class="btn btn-icon btn-secondary btn-view-log" data-msg="${encodeURIComponent(log.message_body||'')}" title="View"><i data-lucide="eye"></i></button>
                    </td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    content.querySelector('#btn-filter-logs').addEventListener('click', async () => {
      const p = new URLSearchParams({ limit: 200 });
      const s = content.querySelector('#log-search').value; if(s) p.set('member',s);
      const st = content.querySelector('#log-status-filter').value; if(st) p.set('status',st);
      const fr = content.querySelector('#log-from').value; if(fr) p.set('from',fr);
      const to = content.querySelector('#log-to').value; if(to) p.set('to',to);
      try {
        const filtered = await api.get(`/api/whatsapp/logs?${p.toString()}`);
        content.querySelector('#logs-tbody').innerHTML = filtered.length===0
          ? '<tr><td colspan="8" class="text-center text-muted">No matching logs</td></tr>'
          : filtered.map(log => `<tr>
              <td>${new Date(log.sent_at).toLocaleString()}</td>
              <td>${log.member_name||'—'}</td><td>${log.mobile}</td>
              <td>${log.notification_type||'—'}</td>
              <td><code>${log.template_key||'—'}</code></td>
              <td><span class="badge badge-${log.status==='sent'?'success':'danger'}">${log.status}</span></td>
              <td>${log.sent_by||'system'}</td>
              <td>
                ${log.status==='failed'?`<button class="btn btn-icon btn-secondary btn-resend" data-id="${log.id}"><i data-lucide="refresh-cw"></i></button>`:''}
                <button class="btn btn-icon btn-secondary btn-view-log" data-msg="${encodeURIComponent(log.message_body||'')}"><i data-lucide="eye"></i></button>
              </td></tr>`).join('');
        lucide.createIcons(); WhatsAppView.bindLogActions(content);
      } catch(e) { showToast(e.message,'error'); }
    });
    content.querySelector('#btn-export-logs').addEventListener('click', () => {
      const rows = [['Date','Member','Mobile','Type','Template','Status','SentBy']];
      content.querySelectorAll('#logs-tbody tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        if(cells.length>=7) rows.push([...cells].slice(0,7).map(c => `"${c.textContent.trim()}"`));
      });
      const csv = rows.map(r=>r.join(',')).join('\n');
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
      a.download = `wa_logs_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    });
    WhatsAppView.bindLogActions(content); lucide.createIcons();
  },

  bindLogActions: (content) => {
    content.querySelectorAll('.btn-resend').forEach(btn => {
      btn.addEventListener('click', async () => {
        try { await api.post(`/api/whatsapp/resend/${btn.dataset.id}`); showToast('Resent'); WhatsAppView.renderTab('logs',content); }
        catch(e) { showToast(e.message,'error'); }
      });
    });
    content.querySelectorAll('.btn-view-log').forEach(btn => {
      btn.addEventListener('click', () => {
        const msg = decodeURIComponent(btn.dataset.msg||'');
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `<div class="modal-card" style="max-width:500px;"><div class="modal-header"><h2>Message Body</h2><button class="btn btn-icon btn-secondary" id="close-msg"><i data-lucide="x"></i></button></div><div class="modal-body"><div class="wa-preview-box"><div class="wa-preview-bubble">${msg.replace(/\n/g,'<br>')}</div></div></div></div>`;
        document.body.appendChild(modal); lucide.createIcons();
        modal.querySelector('#close-msg').addEventListener('click', ()=>modal.remove());
        modal.addEventListener('click', e=>{ if(e.target===modal) modal.remove(); });
      });
    });
  },

  reminderRow: (r, templates) => {
    const tpl = templates.find(t => t.key===r.template_key);
    const when = r.days_offset < 0 ? `${Math.abs(r.days_offset)} days before` : r.days_offset===0 ? 'On the day' : `${r.days_offset} days after`;
    return `<tr>
      <td>${r.label}</td>
      <td><span class="badge badge-${r.days_offset<=0?'warning':'danger'}">${when}</span></td>
      <td>${tpl?tpl.name:r.template_key}</td>
      <td><button class="btn btn-icon ${r.is_active?'btn-success':'btn-secondary'} btn-toggle-reminder" data-id="${r.id}"><i data-lucide="${r.is_active?'check-circle':'circle'}"></i></button></td>
      <td><button class="btn btn-icon btn-danger btn-delete-reminder" data-id="${r.id}"><i data-lucide="trash-2"></i></button></td>
    </tr>`;
  },

  renderReminders: async (content) => {
    const [reminders, templates] = await Promise.all([api.get('/api/whatsapp/reminders'), api.get('/api/whatsapp/templates')]);
    content.innerHTML = `
      <div class="wa-reminders">
        <div class="wa-reminder-section">
          <div class="wa-reminder-header"><h3><i data-lucide="calendar-clock"></i> Membership Expiry Reminders</h3>
            <button class="btn btn-primary btn-sm" id="btn-add-expiry"><i data-lucide="plus"></i> Add</button>
          </div>
          <div class="table-container"><table class="data-table">
            <thead><tr><th>Label</th><th>When</th><th>Template</th><th>Active</th><th>Delete</th></tr></thead>
            <tbody>${reminders.filter(r=>r.type==='expiry').map(r=>WhatsAppView.reminderRow(r,templates)).join('')}</tbody>
          </table></div>
          <div id="expiry-form-area"></div>
        </div>
        <div class="wa-reminder-section">
          <div class="wa-reminder-header"><h3><i data-lucide="credit-card"></i> Fee Due Reminders</h3>
            <button class="btn btn-primary btn-sm" id="btn-add-fee"><i data-lucide="plus"></i> Add</button>
          </div>
          <div class="table-container"><table class="data-table">
            <thead><tr><th>Label</th><th>When</th><th>Template</th><th>Active</th><th>Delete</th></tr></thead>
            <tbody>${reminders.filter(r=>r.type==='fee_due').map(r=>WhatsAppView.reminderRow(r,templates)).join('')}</tbody>
          </table></div>
          <div id="fee-form-area"></div>
        </div>
      </div>`;

    const showForm = (areaId, type) => {
      const area = content.querySelector(`#${areaId}`);
      const templateOpts = templates.map(t=>`<option value="${t.key}">${t.name}</option>`).join('');
      area.innerHTML = `<div class="card glass-card" style="margin-top:12px;padding:16px;">
        <div class="form-grid-3">
          <div class="form-group"><label>Days Offset</label><input type="number" id="new-days" placeholder="-7 before, +3 after"></div>
          <div class="form-group"><label>Label</label><input type="text" id="new-label" placeholder="e.g. 7 days before expiry"></div>
          <div class="form-group"><label>Template</label><select id="new-tpl">${templateOpts}</select></div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-secondary btn-sm" id="cancel-r">Cancel</button>
          <button class="btn btn-primary btn-sm" id="save-r">Save</button>
        </div>
      </div>`;
      area.querySelector('#cancel-r').addEventListener('click',()=>area.innerHTML='');
      area.querySelector('#save-r').addEventListener('click', async()=>{
        const days_offset = parseInt(area.querySelector('#new-days').value);
        const label = area.querySelector('#new-label').value.trim();
        const template_key = area.querySelector('#new-tpl').value;
        if(isNaN(days_offset)||!label) return showToast('Days and label required','error');
        await api.post('/api/whatsapp/reminders',{type,days_offset,label,template_key,is_active:1});
        showToast('Reminder added'); WhatsAppView.renderTab('reminders',content);
      });
    };
    content.querySelector('#btn-add-expiry').addEventListener('click',()=>showForm('expiry-form-area','expiry'));
    content.querySelector('#btn-add-fee').addEventListener('click',()=>showForm('fee-form-area','fee_due'));
    content.querySelectorAll('.btn-delete-reminder').forEach(btn=>{
      btn.addEventListener('click',()=>showConfirm('Delete Reminder','Remove this reminder?', async()=>{
        await api.delete(`/api/whatsapp/reminders/${btn.dataset.id}`); showToast('Removed');
        WhatsAppView.renderTab('reminders',content);
      }));
    });
    content.querySelectorAll('.btn-toggle-reminder').forEach(btn=>{
      btn.addEventListener('click', async()=>{
        const r = reminders.find(r=>r.id==btn.dataset.id);
        await api.put(`/api/whatsapp/reminders/${r.id}`,{...r,is_active:r.is_active?0:1});
        showToast('Updated'); WhatsAppView.renderTab('reminders',content);
      });
    });
    lucide.createIcons();
  },

  renderSettings: async (content) => {
    const settings = await api.get('/api/whatsapp/settings');
    content.innerHTML = `
      <div class="wa-settings">
        <div class="card glass-card">
          <div class="card-header">
            <h3><i data-lucide="settings"></i> WhatsApp API Configuration</h3>
            <div class="wa-enable-toggle">
              <label class="toggle-label">Enable Notifications</label>
              <label class="toggle-switch"><input type="checkbox" id="wa-enabled" ${settings.enabled?'checked':''}><span class="toggle-slider"></span></label>
            </div>
          </div>
          <div class="card-body">
            <div class="form-group"><label>API Provider</label>
              <select id="wa-provider">
                <option value="meta" ${settings.provider==='meta'?'selected':''}>Meta WhatsApp Cloud API (Official)</option>
                <option value="wati" ${settings.provider==='wati'?'selected':''}>WATI (wati.io)</option>
                <option value="interakt" ${settings.provider==='interakt'?'selected':''}>Interakt</option>
                <option value="twilio" ${settings.provider==='twilio'?'selected':''}>Twilio</option>
              </select>
            </div>
            <div id="wa-provider-fields"></div>
            <div class="form-grid-2">
              <div class="form-group"><label>Default Country Code</label><input type="text" id="wa-country-code" value="${settings.default_country_code||'+91'}"></div>
              <div class="form-group"><label>Message Delay (ms)</label><input type="number" id="wa-delay" value="${settings.message_delay_ms||1000}" min="200"></div>
            </div>
            <div class="form-grid-2">
              <div class="form-group"><label>Retry Attempts</label><input type="number" id="wa-retry" value="${settings.retry_attempts||3}" min="0"></div>
              <div class="form-group"><label>Daily Sending Limit</label><input type="number" id="wa-daily-limit" value="${settings.daily_limit||500}"></div>
            </div>
            <div class="form-grid-2">
              <div class="form-group"><label>Quiet Hours Start</label><input type="time" id="wa-quiet-start" value="${settings.quiet_hours_start||'22:00'}"></div>
              <div class="form-group"><label>Quiet Hours End</label><input type="time" id="wa-quiet-end" value="${settings.quiet_hours_end||'08:00'}"></div>
            </div>
            <div class="wa-settings-actions">
              <button class="btn btn-secondary" id="btn-test-conn"><i data-lucide="zap"></i> Test Connection</button>
              <button class="btn btn-primary" id="btn-save-wa"><i data-lucide="save"></i> Save Settings</button>
            </div>
            <div id="wa-test-result" class="wa-test-result" style="display:none;margin-top:12px;"></div>
          </div>
        </div>
        <div class="card glass-card wa-security-note">
          <div class="card-body"><div class="wa-security-row">
            <i data-lucide="shield"></i>
            <div><strong>Security</strong><p>API tokens are encrypted with AES-256 before storage. They are never exposed in responses.</p></div>
          </div></div>
        </div>
      </div>`;

    const renderProviderFields = (provider) => {
      const hasToken = !!settings.access_token_enc;
      const fields = {
        meta: `<div class="form-group"><label>API Endpoint (leave blank for default)</label><input type="text" id="wa-endpoint" value="${settings.api_endpoint||''}" placeholder="https://graph.facebook.com/v18.0/..."></div>
          <div class="form-group"><label>Access Token *</label><input type="password" id="wa-token" value="${hasToken?'????????????????':''}" placeholder="Meta access token" autocomplete="off"></div>
          <div class="form-grid-2"><div class="form-group"><label>Phone Number ID *</label><input type="text" id="wa-phone-id" value="${settings.phone_number_id||''}"></div>
          <div class="form-group"><label>Business Account ID</label><input type="text" id="wa-biz-id" value="${settings.business_account_id||''}"></div></div>`,
        wati: `<div class="form-group"><label>WATI API Endpoint *</label><input type="text" id="wa-endpoint" value="${settings.api_endpoint||''}" placeholder="https://live-server.wati.io"></div>
          <div class="form-group"><label>WATI Access Token *</label><input type="password" id="wa-token" value="${hasToken?'????????????????':''}" placeholder="WATI token" autocomplete="off"></div>
          <div class="form-group"><label>Phone Number</label><input type="text" id="wa-phone-id" value="${settings.phone_number_id||''}"></div>
          <input type="hidden" id="wa-biz-id" value="">`,
        interakt: `<div class="form-group"><label>Interakt API Key *</label><input type="password" id="wa-token" value="${hasToken?'????????????????':''}" placeholder="Interakt API key" autocomplete="off"></div>
          <input type="hidden" id="wa-endpoint" value="${settings.api_endpoint||''}">
          <input type="hidden" id="wa-phone-id" value="${settings.phone_number_id||''}">
          <input type="hidden" id="wa-biz-id" value="">`,
        twilio: `<div class="form-group"><label>Twilio Credentials (AccountSID:AuthToken)</label><input type="password" id="wa-token" value="${hasToken?'????????????????':''}" placeholder="ACxxxxxxxx:auth_token" autocomplete="off"></div>
          <div class="form-group"><label>Twilio WhatsApp Number</label><input type="text" id="wa-phone-id" value="${settings.phone_number_id||''}" placeholder="+14155238886"></div>
          <input type="hidden" id="wa-endpoint" value=""><input type="hidden" id="wa-biz-id" value="">`,
      };
      content.querySelector('#wa-provider-fields').innerHTML = fields[provider]||fields.meta;
      lucide.createIcons();
    };
    const providerSelect = content.querySelector('#wa-provider');
    renderProviderFields(providerSelect.value);
    providerSelect.addEventListener('change',()=>renderProviderFields(providerSelect.value));

    content.querySelector('#btn-save-wa').addEventListener('click', async()=>{
      const payload = {
        provider: providerSelect.value,
        api_endpoint: content.querySelector('#wa-endpoint')?.value||'',
        access_token: content.querySelector('#wa-token')?.value||'',
        phone_number_id: content.querySelector('#wa-phone-id')?.value||'',
        business_account_id: content.querySelector('#wa-biz-id')?.value||'',
        enabled: content.querySelector('#wa-enabled').checked?1:0,
        default_country_code: content.querySelector('#wa-country-code').value||'+91',
        message_delay_ms: parseInt(content.querySelector('#wa-delay').value)||1000,
        retry_attempts: parseInt(content.querySelector('#wa-retry').value)||3,
        daily_limit: parseInt(content.querySelector('#wa-daily-limit').value)||500,
        quiet_hours_start: content.querySelector('#wa-quiet-start').value||'22:00',
        quiet_hours_end: content.querySelector('#wa-quiet-end').value||'08:00',
      };
      try { await api.post('/api/whatsapp/settings',payload); showToast('Settings saved'); WhatsAppView.renderTab('settings',content); }
      catch(e) { showToast(e.message,'error'); }
    });

    content.querySelector('#btn-test-conn').addEventListener('click', async()=>{
      const btn = content.querySelector('#btn-test-conn');
      const resultEl = content.querySelector('#wa-test-result');
      btn.disabled=true; btn.innerHTML='<i data-lucide="loader"></i> Testing...'; lucide.createIcons();
      resultEl.style.display='none';
      try {
        const result = await api.post('/api/whatsapp/test');
        resultEl.className = 'wa-test-result ' + (result.success?'success':'error');
        resultEl.innerHTML = result.success ? '<i data-lucide="check-circle"></i> Connection successful!' : `<i data-lucide="x-circle"></i> ${result.error||'Failed'}`;
        resultEl.style.display='flex'; lucide.createIcons();
      } catch(e) {
        resultEl.className='wa-test-result error';
        resultEl.innerHTML=`<i data-lucide="x-circle"></i> ${e.message}`;
        resultEl.style.display='flex'; lucide.createIcons();
      }
      btn.disabled=false; btn.innerHTML='<i data-lucide="zap"></i> Test Connection'; lucide.createIcons();
    });
    lucide.createIcons();
  }
};

export function openWASendModal({ memberId, memberName, mobile, prefillTemplate=null }) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.zIndex = '9999';
  modal.innerHTML = `
    <div class="modal-card" style="max-width:600px;">
      <div class="modal-header">
        <h2 style="display:flex;align-items:center;gap:8px;"><span style="color:#25d366;font-size:1.4rem;">&#9679;</span> Send WhatsApp — ${memberName}</h2>
        <button class="btn btn-icon btn-secondary" id="close-wa-modal"><i data-lucide="x"></i></button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label>Mobile Number</label><input type="text" id="wa-send-mobile" value="${mobile||''}" placeholder="+91 9999999999"></div>
        <div class="form-group"><label>Template</label><select id="wa-send-template"><option>Loading...</option></select></div>
        <div class="form-group"><label>Preview</label>
          <div class="wa-preview-box"><div class="wa-preview-bubble" id="wa-send-preview">Select template...</div></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cancel-wa-send">Cancel</button>
        <button class="btn btn-success" id="confirm-wa-send"><i data-lucide="send"></i> Send WhatsApp</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  lucide.createIcons();
  const close = () => modal.remove();
  modal.querySelector('#close-wa-modal').addEventListener('click',close);
  modal.querySelector('#cancel-wa-send').addEventListener('click',close);
  modal.addEventListener('click', e=>{ if(e.target===modal) close(); });
  api.get('/api/whatsapp/templates').then(templates=>{
    const select = modal.querySelector('#wa-send-template');
    select.innerHTML = templates.filter(t=>t.is_active).map(t=>`<option value="${t.key}" data-body="${encodeURIComponent(t.body)}" ${prefillTemplate===t.key?'selected':''}>${t.name}</option>`).join('');
    const preview = modal.querySelector('#wa-send-preview');
    const updatePreview = () => {
      const opt = select.options[select.selectedIndex];
      preview.innerHTML = opt ? decodeURIComponent(opt.dataset.body).replace(/\n/g,'<br>') : '';
    };
    select.addEventListener('change',updatePreview); updatePreview();
  });
  modal.querySelector('#confirm-wa-send').addEventListener('click', async()=>{
    const mobile = modal.querySelector('#wa-send-mobile').value.trim();
    const templateKey = modal.querySelector('#wa-send-template').value;
    if(!mobile||!templateKey) return showToast('Mobile and template required','error');
    try {
      const result = await api.post('/api/whatsapp/send',{ memberId, memberName, mobile, templateKey, data:{MemberName:memberName}, sentBy:'staff' });
      if(result.success) { showToast('WhatsApp sent!','success'); close(); }
      else showToast(result.error||'Send failed','error');
    } catch(e) { showToast(e.message,'error'); }
  });
}

export default WhatsAppView;
