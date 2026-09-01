// Members Directory View for Fight Club Gym
import api from '../api.js';
import { showToast, showConfirm, parseCSV, downloadCSV } from '../utils.js';

const MembersView = {
  members: [],
  filters: { search: '', status: '', sort: 'fullname', order: 'ASC', date_from: '', date_to: '', date_type: 'joining' },
  
  render: async (container) => {
    // 1. Fetch initial members list
    await MembersView.fetchMembers();
    
    // 2. Render initial structure
    container.innerHTML = `
      <div class="members-view-container">
        <!-- Table Actions & Filters -->
        <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:15px;">
          <div class="table-header-actions" style="margin-bottom:0;">
            <div class="table-filters" style="flex:1; display:flex; gap:8px; flex-wrap:wrap;">
              <input type="text" id="search-members" placeholder="🔍 Search name, code, phone, email..." value="${MembersView.filters.search}" style="flex:1; min-width:200px;">
              
              <select id="filter-status" style="width:130px;">
                <option value="">All Statuses</option>
                <option value="Active" ${MembersView.filters.status === 'Active' ? 'selected' : ''}>Active</option>
                <option value="Expired" ${MembersView.filters.status === 'Expired' ? 'selected' : ''}>Expired</option>
                <option value="Frozen" ${MembersView.filters.status === 'Frozen' ? 'selected' : ''}>Frozen</option>
              </select>
            </div>
            
            <div class="flex gap-sm">
              <button class="btn btn-secondary" id="btn-export-csv"><i data-lucide="download"></i> Export CSV</button>
              <button class="btn btn-secondary" id="btn-import-csv"><i data-lucide="upload"></i> Import CSV</button>
              <button class="btn btn-primary" id="btn-add-member"><i data-lucide="user-plus"></i> Register Member</button>
            </div>
          </div>

          <!-- Date Filter Bar for Members -->
          <div class="date-filter-bar" style="justify-content:space-between;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span style="font-size:0.8rem; color:var(--color-text-muted); font-weight:600;"><i data-lucide="calendar" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Date Filter:</span>
              <select id="filter-member-date-type" style="padding:4px 8px; font-size:0.8rem; border-radius:var(--radius-sm); border:1px solid var(--color-border); background:var(--color-bg-card);">
                <option value="joining" ${MembersView.filters.date_type === 'joining' ? 'selected' : ''}>Joining Date</option>
                <option value="expiry" ${MembersView.filters.date_type === 'expiry' ? 'selected' : ''}>Plan Expiry Date</option>
              </select>
              <input type="date" id="filter-member-date-from" class="date-input-field" title="From Date" value="${MembersView.filters.date_from || ''}">
              <span style="font-size:0.8rem; color:var(--color-text-muted);">to</span>
              <input type="date" id="filter-member-date-to" class="date-input-field" title="To Date" value="${MembersView.filters.date_to || ''}">

              <button type="button" class="date-preset-pill" id="mem-preset-all">All</button>
              <button type="button" class="date-preset-pill" id="mem-preset-this-month">This Month</button>
              <button type="button" class="date-preset-pill" id="mem-preset-exp-7">Expiring ≤7d</button>
              <button type="button" class="date-preset-pill" id="mem-preset-clear" title="Clear Date Filter"><i data-lucide="x" style="width:11px;height:11px;"></i> Clear</button>
            </div>
            <div id="members-count-metric" style="font-size:0.85rem; font-weight:700; color:var(--color-primary); padding-right:6px;">
              ${MembersView.members.length} Fighters
            </div>
          </div>
        </div>

        <!-- Members Table -->
        <div class="table-container">
          <table id="members-table">
            <thead>
              <tr>
                <th class="sortable" data-sort="member_code">Code <span class="sort-icon"></span></th>
                <th class="sortable" data-sort="fullname">Full Name <span class="sort-icon"></span></th>
                <th class="sortable" data-sort="mobile">Mobile <span class="sort-icon"></span></th>
                <th class="sortable" data-sort="status">Plan Status <span class="sort-icon"></span></th>
                <th class="sortable" data-sort="expiry_date">Expiry <span class="sort-icon"></span></th>
                <th class="sortable" data-sort="trainer_name">Assigned Trainer <span class="sort-icon"></span></th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="members-list-body">
              <!-- Rendered dynamically -->
            </tbody>
          </table>
        </div>
      </div>

      <!-- Registration Modal -->
      <div id="member-form-modal" class="modal-overlay hidden">
        <div class="modal-card modal-lg">
          <div class="modal-header">
            <h2 id="modal-form-title">Register New Fighter</h2>
            <button class="btn-close-modal"><i data-lucide="x"></i></button>
          </div>
          <div class="modal-body">
            <form id="member-registration-form" enctype="multipart/form-data">
              <input type="hidden" id="edit-member-id">
              
              <div class="grid-2">
                <div>
                  <div class="form-row">
                    <div class="form-group">
                      <label for="reg-member-code">Membership Number <span style="font-size:0.75rem;color:var(--color-text-muted);">(auto-assigned if blank)</span></label>
                      <input type="number" id="reg-member-code" min="0" max="99999999990" placeholder="e.g. 1001">
                    </div>
                    <div class="form-group">
                      <label for="reg-fullname">Full Name *</label>
                      <input type="text" id="reg-fullname" required placeholder="Jack Narrator">
                    </div>
                  </div>
                  
                  <div class="form-row">
                    <div class="form-group">
                      <label for="reg-gender">Gender</label>
                      <select id="reg-gender">
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    
                    <div class="form-group">
                      <label for="reg-dob">Date of Birth</label>
                      <input type="date" id="reg-dob">
                    </div>
                  </div>

                  <div class="form-row">
                    <div class="form-group">
                      <label for="reg-mobile">Mobile Number</label>
                      <input type="tel" id="reg-mobile" placeholder="9876543210">
                    </div>
                    <div class="form-group">
                      <label for="reg-whatsapp">WhatsApp Number</label>
                      <input type="tel" id="reg-whatsapp" placeholder="9876543210">
                    </div>
                  </div>
                  
                  <div class="form-group">
                    <label for="reg-email">Email Address</label>
                    <input type="email" id="reg-email" placeholder="jack@narrator.com">
                  </div>

                  <div class="form-group">
                    <label for="reg-address">Residential Address</label>
                    <textarea id="reg-address" rows="2" placeholder="512 Paper Street"></textarea>
                  </div>
                </div>

                <div>
                  <!-- Camera & Photo Capture Group -->
                  <div class="form-group text-center">
                    <label>Profile Picture</label>
                    <div class="photo-upload-box" style="margin: 10px auto; width: 120px; height: 120px; border-radius: var(--radius-full); border: 2px dashed var(--color-border); display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; background-size: cover; background-position: center;" id="profile-preview">
                      <i data-lucide="camera" style="width: 32px; height: 32px; opacity:0.5;"></i>
                    </div>
                    <div class="flex gap-sm justify-center">
                      <button type="button" class="btn btn-secondary btn-sm" id="btn-trigger-camera"><i data-lucide="video"></i> Capture</button>
                      <label for="reg-photo-file" class="btn btn-secondary btn-sm" style="cursor:pointer;"><i data-lucide="upload"></i> Upload</label>
                      <input type="file" id="reg-photo-file" class="hidden" accept="image/*">
                    </div>
                    <video id="webcam-preview" class="hidden" style="width: 100%; border-radius: var(--radius-md); margin-top: 10px;" autoplay></video>
                    <button type="button" class="btn btn-primary btn-sm hidden" id="btn-capture-photo" style="margin-top:5px;">Take Photo</button>
                  </div>

                  <div class="form-row">
                    <div class="form-group">
                      <label for="reg-blood">Blood Group</label>
                      <select id="reg-blood">
                        <option value="">Select</option>
                        <option value="A+">A+</option>
                        <option value="A-">A-</option>
                        <option value="B+">B+</option>
                        <option value="B-">B-</option>
                        <option value="O+">O+</option>
                        <option value="O-">O-</option>
                        <option value="AB+">AB+</option>
                        <option value="AB-">AB-</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label for="reg-joining">Joining Date</label>
                      <input type="date" id="reg-joining" value="${new Date().toISOString().split('T')[0]}">
                    </div>
                  </div>

                  <div class="form-row">
                    <div class="form-group">
                      <label for="reg-trainer">Assign Trainer</label>
                      <select id="reg-trainer">
                        <option value="">No Trainer Assigned</option>
                        <!-- Loaded dynamically -->
                      </select>
                    </div>
                    <div class="form-group">
                      <label for="reg-status">Status</label>
                      <select id="reg-status">
                        <option value="Active">Active</option>
                        <option value="Expired">Expired</option>
                        <option value="Frozen">Frozen</option>
                      </select>
                    </div>
                  </div>

                  <div class="form-group">
                    <label for="reg-medical">Medical Notes</label>
                    <input type="text" id="reg-medical" placeholder="Asthma, joint pain, etc.">
                  </div>

                  <div class="form-group" style="background: rgba(220,38,38,0.05); padding: 8px 12px; border-radius: var(--radius-sm); border: 1px dashed var(--color-border); margin-top: 10px;">
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.875rem; margin:0;">
                      <input type="checkbox" id="reg-admission-fee-paid" style="width:16px; height:16px;">
                      <span><strong>Admission Fee Paid (₹1,500)</strong> <span style="font-size:0.75rem; color:var(--color-text-muted);">(Waiver on Admission Plan)</span></span>
                    </label>
                  </div>
                </div>
              </div>

              <div class="form-group mt-md">
                <label for="reg-emergency">Emergency Contact (Name & Phone)</label>
                <input type="text" id="reg-emergency" placeholder="Marla Singer (+1 555 0123)">
              </div>
              
              <div class="form-group">
                <label for="reg-notes">Special Remarks / Notes</label>
                <textarea id="reg-notes" rows="2" placeholder="Member preferences..."></textarea>
              </div>

              <div class="modal-footer" style="padding: 10px 0 0 0; border: none;">
                <button type="button" class="btn btn-secondary btn-close-modal">Cancel</button>
                <button type="submit" class="btn btn-primary">Save Fighter</button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <!-- Member Details / Member Card Drawer -->
      <div id="member-details-drawer" class="modal-overlay hidden">
        <div class="modal-card modal-lg">
          <div class="modal-header">
            <h2>Fighter Profile</h2>
            <button class="btn-close-modal"><i data-lucide="x"></i></button>
          </div>
          <div class="modal-body" id="drawer-body-content">
            <!-- Loaded dynamically -->
          </div>
        </div>
      </div>

      <!-- Member CSV Import Modal -->
      <div id="member-import-modal" class="modal-overlay hidden">
        <div class="modal-card" style="max-width: 720px;">
          <div class="modal-header">
            <h2><i data-lucide="upload" style="margin-right:8px;"></i> Import Gym Data from CSV</h2>
            <button class="btn-close-import-modal"><i data-lucide="x"></i></button>
          </div>
          <div class="modal-body" style="display:flex; flex-direction:column; gap: var(--spacing-md); max-height: 540px; overflow-y: auto;">
            
            <div id="member-csv-dropzone" style="background: rgba(220,38,38,0.05); border: 2px dashed var(--color-border); border-radius: var(--radius-md); padding: var(--spacing-lg); text-align: center; cursor: pointer; transition: border-color 0.2s;">
              <i data-lucide="file-spreadsheet" style="width: 44px; height: 44px; color: var(--color-primary); margin-bottom: 8px;"></i>
              <p style="margin-bottom: 12px; font-size: 0.95rem; font-weight: 500;">Select or drag & drop your <strong>.CSV</strong> file here</p>
              <input type="file" id="member-csv-file" accept=".csv,text/csv" style="display:none;">
              <div class="flex justify-center gap-sm" style="flex-wrap:wrap;">
                <button type="button" class="btn btn-primary" id="btn-browse-member-csv"><i data-lucide="folder-open"></i> Browse CSV File</button>
                <button type="button" class="btn btn-secondary" id="btn-download-member-template"><i data-lucide="download"></i> Download Full CSV Template</button>
              </div>
              <div id="member-csv-filename" style="margin-top: 12px; font-weight: 600; color: var(--color-primary); display: none;"></div>
            </div>

            <!-- Import Options -->
            <div style="background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 12px; display: flex; flex-direction: column; gap: 8px;">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.875rem;">
                <input type="checkbox" id="chk-update-existing-members" checked style="width:16px; height:16px;">
                <span><strong>Update existing members</strong> if Member Code or Mobile number matches</span>
              </label>
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.875rem;">
                <input type="checkbox" id="chk-create-subs-payments" checked style="width:16px; height:16px;">
                <span><strong>Auto-create Subscriptions & Payments</strong> if Plan, Expiry Date, or Paid Amount columns are present</span>
              </label>
            </div>

            <div style="display:flex; align-items:center; justify-content:space-between; padding: 2px;">
              <div id="member-detected-badges" style="display:flex; flex-wrap:wrap; gap:4px;"></div>
              <span id="member-import-row-count" style="font-size:0.85rem; color:var(--color-text-muted); font-weight:600;"></span>
            </div>

            <!-- CSV Preview Section -->
            <div id="member-import-preview-section" style="display:none;">
              <h4 style="font-size: 0.9rem; font-weight:700; margin-bottom: 6px;">Data Preview (First 5 Rows):</h4>
              <div class="table-container" style="max-height: 180px; overflow-y: auto;">
                <table style="font-size: 0.8rem;">
                  <thead>
                    <tr id="member-preview-header"></tr>
                  </thead>
                  <tbody id="member-preview-body"></tbody>
                </table>
              </div>
            </div>

            <!-- Import Status / Results -->
            <div id="member-import-status" style="display:none; padding: 12px; border-radius: var(--radius-sm); font-size: 0.9rem; line-height: 1.5;"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary btn-close-import-modal">Cancel</button>
            <button type="button" class="btn btn-primary" id="btn-submit-member-import" disabled><i data-lucide="check"></i> Start Import</button>
          </div>
        </div>
      </div>
    `;
    
    // Bind Event Listeners
    MembersView.bindEvents();
    MembersView.renderList();
    MembersView.loadTrainersDropdown();
    lucide.createIcons();
  },
  
  fetchMembers: async () => {
    try {
      const q = new URLSearchParams(MembersView.filters).toString();
      const res = await api.get(`/api/members?${q}`);
      MembersView.members = Array.isArray(res) ? res : [];
    } catch (e) {
      MembersView.members = [];
      showToast('Error loading members: ' + e.message, 'error');
    }
  },
  
  loadTrainersDropdown: async () => {
    try {
      const trainers = await api.get('/api/trainers');
      const select = document.getElementById('reg-trainer');
      if (select && Array.isArray(trainers)) {
        select.innerHTML = '<option value="">No Trainer Assigned</option>' + 
          trainers.map(t => `<option value="${t.id}">${t.fullname} (${t.specialization})</option>`).join('');
      }
    } catch (e) {
      console.error('Failed to load trainers for dropdown:', e);
    }
  },
  
  renderList: () => {
    const listBody = document.getElementById('members-list-body');
    if (!listBody) return;
    
    if (!Array.isArray(MembersView.members) || MembersView.members.length === 0) {
      listBody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center">
            <div class="empty-state">
              <i data-lucide="users" style="width:40px;height:40px;"></i>
              <p>No members match your criteria. Recruit some fighters!</p>
            </div>
          </td>
        </tr>
      `;
      lucide.createIcons();
      MembersView.updateSortIndicators();
      return;
    }
    
    listBody.innerHTML = MembersView.members.map(m => `
      <tr class="member-row" data-id="${m.id}" style="cursor:pointer;">
        <td><strong>${m.member_code}</strong></td>
        <td>
          <div class="member-cell">
            <div class="member-photo-mini" style="${m.photo_path ? `background-image:url(${m.photo_path})` : ''}">
              ${m.photo_path ? '' : m.fullname.substring(0,2).toUpperCase()}
            </div>
            <div>
              <strong>${m.fullname}</strong>
              <div style="font-size:0.75rem; color:var(--color-text-muted);">${m.email || 'No Email'}</div>
            </div>
          </div>
        </td>
        <td>${m.mobile || 'N/A'}</td>
        <td><span class="status-badge status-${m.status.toLowerCase()}">${m.status}</span></td>
        <td><span class="text-sm font-semibold">${m.expiry_date || 'No Active Plan'}</span></td>
        <td>${m.trainer_name || '<span class="text-muted">None</span>'}</td>
        <td class="action-buttons-td">
          <div class="flex gap-sm">
            <button class="btn btn-secondary btn-sm btn-edit-member" data-id="${m.id}" title="Edit Profile"><i data-lucide="edit-2" style="width:14px;height:14px;"></i></button>
            <button class="btn btn-danger btn-sm btn-delete-member" data-id="${m.id}" title="Delete"><i data-lucide="trash" style="width:14px;height:14px;"></i></button>
          </div>
        </td>
      </tr>
    `).join('');
    
    // Bind table row and buttons events
    listBody.querySelectorAll('.member-row').forEach(row => {
      row.addEventListener('click', () => {
        MembersView.showMemberDetails(row.getAttribute('data-id'));
      });
    });
    
    listBody.querySelectorAll('.btn-edit-member').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        MembersView.showEditForm(btn.getAttribute('data-id'));
      });
    });
    
    listBody.querySelectorAll('.btn-delete-member').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        MembersView.deleteMember(btn.getAttribute('data-id'));
      });
    });
    
    lucide.createIcons();
    MembersView.updateSortIndicators();
  },

  updateSortIndicators: () => {
    const { sort: activeSort, order } = MembersView.filters;
    document.querySelectorAll('#members-table th.sortable').forEach(th => {
      const col = th.getAttribute('data-sort');
      const icon = th.querySelector('.sort-icon');
      if (!icon) return;
      if (col === activeSort) {
        icon.textContent = order === 'ASC' ? ' ↑' : ' ↓';
        th.style.color = 'var(--color-primary)';
      } else {
        icon.textContent = ' ⇅';
        th.style.color = '';
      }
    });
  },
  
  bindEvents: () => {
    // Search & Filter
    const searchInput = document.getElementById('search-members');
    const filterStatus = document.getElementById('filter-status');
    
    // Debounce search
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(async () => {
        MembersView.filters.search = e.target.value;
        await MembersView.fetchMembers();
        MembersView.renderList();
      }, 300);
    });
    
    filterStatus.addEventListener('change', async (e) => {
      MembersView.filters.status = e.target.value;
      await MembersView.fetchMembers();
      MembersView.renderList();
    });

    // Date Filter Listeners
    const dateTypeSelect = document.getElementById('filter-member-date-type');
    const dateFromInput = document.getElementById('filter-member-date-from');
    const dateToInput = document.getElementById('filter-member-date-to');

    if (dateTypeSelect) {
      dateTypeSelect.addEventListener('change', async (e) => {
        MembersView.filters.date_type = e.target.value;
        if (MembersView.filters.date_from || MembersView.filters.date_to) {
          await MembersView.fetchMembers();
          MembersView.renderList();
        }
      });
    }

    if (dateFromInput) {
      dateFromInput.addEventListener('change', async (e) => {
        MembersView.filters.date_from = e.target.value;
        await MembersView.fetchMembers();
        MembersView.renderList();
      });
    }

    if (dateToInput) {
      dateToInput.addEventListener('change', async (e) => {
        MembersView.filters.date_to = e.target.value;
        await MembersView.fetchMembers();
        MembersView.renderList();
      });
    }

    // Date Presets
    const memPresetAll = document.getElementById('mem-preset-all');
    const memPresetThisMonth = document.getElementById('mem-preset-this-month');
    const memPresetExp7 = document.getElementById('mem-preset-exp-7');
    const memPresetClear = document.getElementById('mem-preset-clear');

    if (memPresetAll) {
      memPresetAll.addEventListener('click', async () => {
        MembersView.filters.date_from = '';
        MembersView.filters.date_to = '';
        MembersView.filters.status = '';
        if (dateFromInput) dateFromInput.value = '';
        if (dateToInput) dateToInput.value = '';
        if (filterStatus) filterStatus.value = '';
        await MembersView.fetchMembers();
        MembersView.renderList();
      });
    }

    if (memPresetThisMonth) {
      memPresetThisMonth.addEventListener('click', async () => {
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const fromStr = firstDay.toISOString().split('T')[0];
        const toStr = today.toISOString().split('T')[0];
        
        MembersView.filters.date_type = 'joining';
        MembersView.filters.date_from = fromStr;
        MembersView.filters.date_to = toStr;
        if (dateTypeSelect) dateTypeSelect.value = 'joining';
        if (dateFromInput) dateFromInput.value = fromStr;
        if (dateToInput) dateToInput.value = toStr;

        await MembersView.fetchMembers();
        MembersView.renderList();
      });
    }

    if (memPresetExp7) {
      memPresetExp7.addEventListener('click', async () => {
        const today = new Date();
        const next7 = new Date();
        next7.setDate(today.getDate() + 7);
        const fromStr = today.toISOString().split('T')[0];
        const toStr = next7.toISOString().split('T')[0];

        MembersView.filters.date_type = 'expiry';
        MembersView.filters.date_from = fromStr;
        MembersView.filters.date_to = toStr;
        if (dateTypeSelect) dateTypeSelect.value = 'expiry';
        if (dateFromInput) dateFromInput.value = fromStr;
        if (dateToInput) dateToInput.value = toStr;

        await MembersView.fetchMembers();
        MembersView.renderList();
      });
    }

    if (memPresetClear) {
      memPresetClear.addEventListener('click', async () => {
        MembersView.filters.date_from = '';
        MembersView.filters.date_to = '';
        if (dateFromInput) dateFromInput.value = '';
        if (dateToInput) dateToInput.value = '';
        await MembersView.fetchMembers();
        MembersView.renderList();
      });
    }
    
    // Sorting
    document.querySelectorAll('#members-table th.sortable').forEach(th => {
      th.addEventListener('click', async () => {
        const sortField = th.getAttribute('data-sort');
        const isAsc = MembersView.filters.order === 'ASC';
        MembersView.filters.sort = sortField;
        MembersView.filters.order = isAsc ? 'DESC' : 'ASC';
        await MembersView.fetchMembers();
        MembersView.renderList();
      });
    });
    
    // Add Member Modal
    const addBtn = document.getElementById('btn-add-member');
    const formModal = document.getElementById('member-form-modal');
    
    addBtn.addEventListener('click', () => {
      document.getElementById('modal-form-title').textContent = 'Register New Fighter';
      document.getElementById('member-registration-form').reset();
      document.getElementById('edit-member-id').value = '';
      document.getElementById('profile-preview').style.backgroundImage = 'none';
      document.getElementById('profile-preview').innerHTML = '<i data-lucide="camera" style="width: 32px; height: 32px; opacity:0.5;"></i>';
      lucide.createIcons();
      formModal.classList.remove('hidden');
    });
    
    // Close Modals
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(modal => {
          modal.classList.add('hidden');
        });
        MembersView.stopWebcam();
      });
    });
    
    // Photo upload file preview
    const photoInput = document.getElementById('reg-photo-file');
    const profilePreview = document.getElementById('profile-preview');
    
    photoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          profilePreview.style.backgroundImage = `url(${e.target.result})`;
          profilePreview.innerHTML = '';
        };
        reader.readAsDataURL(file);
      }
    });
    
    // Webcam trigger
    const video = document.getElementById('webcam-preview');
    const captureBtn = document.getElementById('btn-capture-photo');
    const triggerCamBtn = document.getElementById('btn-trigger-camera');
    let stream;
    
    triggerCamBtn.addEventListener('click', async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        video.classList.remove('hidden');
        captureBtn.classList.remove('hidden');
      } catch (err) {
        showToast('Camera access denied or unavailable.', 'error');
      }
    });
    
    captureBtn.addEventListener('click', () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob((blob) => {
        const file = new File([blob], "webcam_photo.jpg", { type: "image/jpeg" });
        
        // Put in file input
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        photoInput.files = dataTransfer.files;
        
        // Show preview
        profilePreview.style.backgroundImage = `url(${URL.createObjectURL(file)})`;
        profilePreview.innerHTML = '';
        
        MembersView.stopWebcam();
      }, 'image/jpeg');
    });
    
    // Form Submit (Save / Edit)
    const form = document.getElementById('member-registration-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const editId = document.getElementById('edit-member-id').value;
      const formData = new FormData();
      
      const memberCodeInput = document.getElementById('reg-member-code');
      const memberCode = memberCodeInput ? memberCodeInput.value.trim().toUpperCase() : '';
      if (memberCode) {
        formData.append('member_code', memberCode);
      }
      
      formData.append('fullname', document.getElementById('reg-fullname')?.value || '');
      formData.append('gender', document.getElementById('reg-gender')?.value || 'Male');
      formData.append('dob', document.getElementById('reg-dob')?.value || '');
      formData.append('mobile', document.getElementById('reg-mobile')?.value || '');
      formData.append('whatsapp', document.getElementById('reg-whatsapp')?.value || '');
      formData.append('email', document.getElementById('reg-email')?.value || '');
      formData.append('address', document.getElementById('reg-address')?.value || '');
      formData.append('blood_group', document.getElementById('reg-blood')?.value || '');
      formData.append('joining_date', document.getElementById('reg-joining')?.value || '');
      formData.append('trainer_id', document.getElementById('reg-trainer')?.value || '');
      formData.append('status', document.getElementById('reg-status')?.value || 'Active');
      formData.append('medical_notes', document.getElementById('reg-medical')?.value || '');
      formData.append('emergency_contact', document.getElementById('reg-emergency')?.value || '');
      formData.append('notes', document.getElementById('reg-notes')?.value || '');
      formData.append('admission_fee_paid', document.getElementById('reg-admission-fee-paid')?.checked ? '1' : '0');
      
      if (photoInput.files[0]) {
        formData.append('photo', photoInput.files[0]);
      }
      
      try {
        if (editId) {
          await api.put(`/api/members/${editId}`, formData, true);
          showToast('Fighter profile updated.', 'success');
        } else {
          await api.post('/api/members', formData, true);
          showToast('New fighter registered. Let\'s fight!', 'success');
        }
        
        formModal.classList.add('hidden');
        MembersView.stopWebcam();
        await MembersView.fetchMembers();
        MembersView.renderList();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    
    // ----------------------------------------------------
    // CSV EXPORT (Full Member Attributes)
    // ----------------------------------------------------
    const exportBtn = document.getElementById('btn-export-csv');
    exportBtn.addEventListener('click', () => {
      if (MembersView.members.length === 0) {
        showToast('No member records to export.', 'warning');
        return;
      }
      
      const headers = [
        'Member Code', 'Full Name', 'Gender', 'Date of Birth', 'Mobile',
        'WhatsApp', 'Email', 'Blood Group', 'Address', 'Emergency Contact',
        'Joining Date', 'Plan Name', 'Plan Expiry', 'Trainer', 'Status',
        'Medical Notes', 'Notes'
      ];
      
      const rows = MembersView.members.map(m => [
        m.member_code || '',
        m.fullname || '',
        m.gender || '',
        m.dob || '',
        m.mobile || '',
        m.whatsapp || '',
        m.email || '',
        m.blood_group || '',
        m.address || '',
        m.emergency_contact || '',
        m.joining_date || '',
        m.plan_name || 'No Plan',
        m.expiry_date || 'N/A',
        m.trainer_name || 'None',
        m.status || 'Active',
        m.medical_notes || '',
        m.notes || ''
      ]);
      
      const filename = `fightclub_members_${new Date().toISOString().split('T')[0]}.csv`;
      downloadCSV(filename, headers, rows);
      showToast(`Exported ${rows.length} member records to ${filename}`, 'success');
    });

    // ----------------------------------------------------
    // CSV IMPORT MODAL & PARSING
    // ----------------------------------------------------
    const importModal = document.getElementById('member-import-modal');
    const importBtn = document.getElementById('btn-import-csv');
    const closeImportBtns = document.querySelectorAll('.btn-close-import-modal');
    const browseFileBtn = document.getElementById('btn-browse-member-csv');
    const csvFileInput = document.getElementById('member-csv-file');
    const csvFilenameEl = document.getElementById('member-csv-filename');
    const previewSection = document.getElementById('member-import-preview-section');
    const previewHeader = document.getElementById('member-preview-header');
    const previewBody = document.getElementById('member-preview-body');
    const rowCountEl = document.getElementById('member-import-row-count');
    const submitImportBtn = document.getElementById('btn-submit-member-import');
    const templateBtn = document.getElementById('btn-download-member-template');
    const importStatusEl = document.getElementById('member-import-status');

    let parsedMemberRows = [];

    // Open Modal
    importBtn.addEventListener('click', () => {
      parsedMemberRows = [];
      csvFileInput.value = '';
      csvFilenameEl.style.display = 'none';
      previewSection.style.display = 'none';
      importStatusEl.style.display = 'none';
      rowCountEl.textContent = '';
      submitImportBtn.disabled = true;
      importModal.classList.remove('hidden');
      lucide.createIcons();
    });

    // Close Modal
    closeImportBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        importModal.classList.add('hidden');
      });
    });

    // Browse Button
    browseFileBtn.addEventListener('click', () => {
      csvFileInput.click();
    });

    const dropzone = document.getElementById('member-csv-dropzone');
    const detectedBadgesEl = document.getElementById('member-detected-badges');

    // Drag and Drop support
    if (dropzone) {
      ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.style.borderColor = 'var(--color-primary)';
          dropzone.style.background = 'rgba(220,38,38,0.12)';
        });
      });
      ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.style.borderColor = 'var(--color-border)';
          dropzone.style.background = 'rgba(220,38,38,0.05)';
        });
      });
      dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
          csvFileInput.files = files;
          handleCSVFile(files[0]);
        }
      });
      dropzone.addEventListener('click', (e) => {
        if (e.target.id !== 'btn-download-member-template' && !e.target.closest('#btn-download-member-template')) {
          csvFileInput.click();
        }
      });
    }

    // Download Sample Template with all supported columns
    templateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const sampleHeaders = [
        'Member Code', 'Full Name', 'Mobile', 'WhatsApp', 'Gender', 'Date of Birth',
        'Email', 'Address', 'Blood Group', 'Joining Date', 'Plan', 'Plan Start Date',
        'Expiry Date', 'Paid Amount', 'Payment Method', 'Trainer', 'Status', 'Medical Notes', 'Notes'
      ];
      const sampleRows = [
        [
          'FC-1001', 'Rahul Sharma', '9876543210', '9876543210', 'Male', '1995-04-12',
          'rahul@gym.com', '123 MG Road, Bangalore', 'O+', '2026-01-10', '1 Year Package', '2026-01-10',
          '2027-01-09', '8500', 'UPI', 'Tyler Durden', 'Active', 'No medical issues', 'Regular morning batch'
        ],
        [
          'FC-1002', 'Priya Patel', '9876543211', '9876543211', 'Female', '1998-08-22',
          'priya@gym.com', '45 Park Street, Mumbai', 'B+', '2026-02-01', '3 Month Package', '2026-02-01',
          '2026-05-01', '4200', 'Cash', 'Marla Singer', 'Active', 'Mild back pain', 'Evening batch'
        ],
        [
          'FC-1003', 'Vikram Singh', '9876543212', '9876543212', 'Male', '1992-11-05',
          'vikram@gym.com', '78 Ring Road, Delhi', 'A+', '2026-03-15', 'Monthly Package', '2026-03-15',
          '2026-04-15', '1000', 'Card', 'Robert Paulson', 'Active', 'None', 'Weight training focus'
        ]
      ];
      downloadCSV('fight_club_gym_members_template.csv', sampleHeaders, sampleRows);
      showToast('Downloaded sample CSV template with all fields.', 'info');
    });

    function handleCSVFile(file) {
      if (!file) return;

      csvFilenameEl.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      csvFilenameEl.style.display = 'block';

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const csvText = event.target.result;
          const { headers, rows } = parseCSV(csvText);

          if (rows.length === 0) {
            showToast('The selected CSV file appears to be empty or invalid.', 'warning');
            submitImportBtn.disabled = true;
            return;
          }

          parsedMemberRows = rows;
          rowCountEl.textContent = `Total rows: ${rows.length}`;

          // Detect column features
          const lowerHeaders = headers.map(h => h.toLowerCase());
          const detected = [];
          if (lowerHeaders.some(h => h.includes('name'))) detected.push('✓ Name');
          if (lowerHeaders.some(h => h.includes('mobile') || h.includes('phone') || h.includes('contact'))) detected.push('✓ Phone');
          if (lowerHeaders.some(h => h.includes('plan') || h.includes('package'))) detected.push('✓ Plan/Package');
          if (lowerHeaders.some(h => h.includes('expiry') || h.includes('till') || h.includes('due') || h.includes('end'))) detected.push('✓ Expiry Date');
          if (lowerHeaders.some(h => h.includes('amount') || h.includes('paid') || h.includes('fee') || h.includes('price'))) detected.push('✓ Fee / Amount');
          if (lowerHeaders.some(h => h.includes('code') || h.includes('id') || h.includes('no'))) detected.push('✓ Member ID');

          if (detectedBadgesEl) {
            detectedBadgesEl.innerHTML = detected.map(d => `<span style="font-size:0.75rem; background:rgba(34,197,94,0.15); color:var(--color-success); padding:2px 8px; border-radius:4px; border:1px solid rgba(34,197,94,0.3); font-weight:600;">${d}</span>`).join(' ');
          }

          // Display preview (up to 5 rows)
          const displayHeaders = headers.slice(0, 7);
          previewHeader.innerHTML = displayHeaders.map(h => `<th>${h}</th>`).join('');
          previewBody.innerHTML = rows.slice(0, 5).map(r => {
            return `<tr>${displayHeaders.map(h => `<td>${r[h] || '-'}</td>`).join('')}</tr>`;
          }).join('');

          previewSection.style.display = 'block';
          submitImportBtn.disabled = false;
          importStatusEl.style.display = 'none';
          lucide.createIcons();
        } catch (err) {
          showToast('Failed to parse CSV file: ' + err.message, 'error');
          submitImportBtn.disabled = true;
        }
      };
      reader.readAsText(file);
    }

    // File Selection & Parsing via File input
    csvFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      handleCSVFile(file);
    });

    // Submit Import
    submitImportBtn.addEventListener('click', async () => {
      if (parsedMemberRows.length === 0) return;

      submitImportBtn.disabled = true;
      submitImportBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Importing Gym Data...';
      lucide.createIcons();

      const updateExisting = document.getElementById('chk-update-existing-members').checked;
      const createSubscriptions = document.getElementById('chk-create-subs-payments').checked;

      try {
        const response = await api.post('/api/members/import-csv', {
          members: parsedMemberRows,
          updateExisting,
          createSubscriptions
        });

        importStatusEl.style.display = 'block';
        importStatusEl.style.background = 'rgba(34, 197, 94, 0.15)';
        importStatusEl.style.border = '1px solid var(--color-success)';
        importStatusEl.style.color = 'var(--color-success)';
        
        let resultMsg = `<strong>✓ Import Complete!</strong><br>`;
        resultMsg += `• Members: <strong>${response.imported} added</strong>, <strong>${response.updated} updated</strong> (Total ${response.total} rows)<br>`;
        if (response.subscriptions_created > 0) {
          resultMsg += `• Subscriptions Generated: <strong>${response.subscriptions_created}</strong><br>`;
        }
        if (response.payments_recorded > 0) {
          resultMsg += `• Payment Records Created: <strong>${response.payments_recorded}</strong><br>`;
        }
        if (response.plans_created > 0) {
          resultMsg += `• New Packages Created: <strong>${response.plans_created}</strong><br>`;
        }
        if (response.errors && response.errors.length > 0) {
          resultMsg += `• Skipped Rows: <strong>${response.errors.length}</strong>`;
        }
        importStatusEl.innerHTML = resultMsg;

        showToast(`Successfully imported ${response.imported} members & ${response.subscriptions_created || 0} subscriptions!`, 'success');

        // Reload table
        await MembersView.fetchMembers();
        MembersView.renderList();

        setTimeout(() => {
          importModal.classList.add('hidden');
          submitImportBtn.innerHTML = '<i data-lucide="check"></i> Start Import';
          submitImportBtn.disabled = false;
        }, 2200);

      } catch (err) {
        importStatusEl.style.display = 'block';
        importStatusEl.style.background = 'rgba(239, 68, 68, 0.15)';
        importStatusEl.style.border = '1px solid var(--color-danger)';
        importStatusEl.style.color = 'var(--color-danger)';
        importStatusEl.textContent = 'Import failed: ' + err.message;
        showToast(err.message, 'error');
        submitImportBtn.disabled = false;
        submitImportBtn.innerHTML = '<i data-lucide="check"></i> Retry Import';
      }
      lucide.createIcons();
    });
  },
  
  stopWebcam: () => {
    const video = document.getElementById('webcam-preview');
    const captureBtn = document.getElementById('btn-capture-photo');
    if (video && video.srcObject) {
      video.srcObject.getTracks().forEach(track => track.stop());
      video.classList.add('hidden');
      captureBtn.classList.add('hidden');
    }
  },
  
  showEditForm: async (id) => {
    const details = await api.get(`/api/members/${id}`);
    const m = details.member;
    
    document.getElementById('modal-form-title').textContent = 'Modify Fighter Details';
    document.getElementById('edit-member-id').value = m.id;
    document.getElementById('reg-member-code').value = m.member_code;
    document.getElementById('reg-fullname').value = m.fullname;
    document.getElementById('reg-gender').value = m.gender;
    document.getElementById('reg-dob').value = m.dob || '';
    document.getElementById('reg-mobile').value = m.mobile || '';
    document.getElementById('reg-whatsapp').value = m.whatsapp || '';
    document.getElementById('reg-email').value = m.email || '';
    document.getElementById('reg-address').value = m.address || '';
    document.getElementById('reg-blood').value = m.blood_group || '';
    document.getElementById('reg-joining').value = m.joining_date || '';
    document.getElementById('reg-trainer').value = m.trainer_id || '';
    document.getElementById('reg-status').value = m.status;
    document.getElementById('reg-medical').value = m.medical_notes || '';
    document.getElementById('reg-emergency').value = m.emergency_contact || '';
    document.getElementById('reg-notes').value = m.notes || '';
    const admPaidChk = document.getElementById('reg-admission-fee-paid');
    if (admPaidChk) {
      admPaidChk.checked = Boolean(m.admission_fee_paid === 1);
    }
    
    const preview = document.getElementById('profile-preview');
    if (m.photo_path) {
      preview.style.backgroundImage = `url(${m.photo_path})`;
      preview.innerHTML = '';
    } else {
      preview.style.backgroundImage = 'none';
      preview.innerHTML = '<i data-lucide="camera" style="width: 32px; height: 32px; opacity:0.5;"></i>';
    }
    
    lucide.createIcons();
    document.getElementById('member-form-modal').classList.remove('hidden');
  },
  
  deleteMember: (id) => {
    const member = MembersView.members.find(m => m.id == id);
    const memberName = member ? member.fullname : 'this member';
    
    showConfirm(
      'Confirm Deletion',
      `Are you sure you want to delete ${memberName}?`,
      async () => {
        try {
          const response = await api.delete(`/api/members/${id}`);
          showToast(response.message, 'warning');
          
          // Implement Undo toast button!
          const undoToast = document.createElement('div');
          undoToast.className = 'toast info';
          undoToast.style.transform = 'translateX(0)';
          undoToast.innerHTML = `
            <i data-lucide="refresh-ccw"></i>
            <div class="toast-message">Deleted ${memberName}.</div>
            <button class="btn btn-secondary btn-sm" id="btn-undo-delete" style="padding:2px 6px;">Undo</button>
          `;
          document.getElementById('toast-container').appendChild(undoToast);
          lucide.createIcons();
          
          undoToast.querySelector('#btn-undo-delete').addEventListener('click', async () => {
            try {
              await api.post(`/api/members/${id}/undo`);
              showToast('Member restored!', 'success');
              undoToast.remove();
              await MembersView.fetchMembers();
              MembersView.renderList();
            } catch (e) {
              showToast(e.message, 'error');
            }
          });
          
          setTimeout(() => undoToast.remove(), 7000);
          
          await MembersView.fetchMembers();
          MembersView.renderList();
        } catch (e) {
          showToast(e.message, 'error');
        }
      }
    );
  },
  
  showMemberDetails: async (id) => {
    try {
      const details = await api.get(`/api/members/${id}`);
      const { member: m, subscriptions, payments, attendance } = details;
      const drawer = document.getElementById('drawer-body-content');
      
      const currencySymbol = '₹';
      
      drawer.innerHTML = `
        <div class="member-details-layout">
          <div class="grid-2">
            <!-- Left: Personal & Contact Card -->
            <div class="card glass-card">
              <div class="flex align-center gap-md mb-lg">
                <div class="profile-photo-large" style="width: 80px; height: 80px; border-radius: var(--radius-full); background-color: var(--color-bg-card-hover); background-size: cover; background-position: center; display: flex; align-items: center; justify-content: center; font-size: 2.25rem; font-weight: 700; color: var(--color-text-muted); ${m.photo_path ? `background-image:url(${m.photo_path})` : ''}">
                  ${m.photo_path ? '' : m.fullname.substring(0,2).toUpperCase()}
                </div>
                <div>
                  <h3 style="font-size: 1.5rem; font-family: var(--font-secondary);">${m.fullname}</h3>
                  <span class="status-badge status-${m.status.toLowerCase()}">${m.status}</span>
                  <div style="font-size: 0.85rem; color: var(--color-text-muted); margin-top:2px;">Member Code: <strong>${m.member_code}</strong></div>
                </div>
              </div>
              
              <div class="details-list" style="display:flex; flex-direction:column; gap:var(--spacing-sm); font-size:0.875rem;">
                <div><span class="text-muted">Gender:</span> <strong>${m.gender || 'N/A'}</strong></div>
                <div><span class="text-muted">Date of Birth:</span> <strong>${m.dob || 'N/A'}</strong></div>
                <div><span class="text-muted">Phone:</span> <strong>${m.mobile || 'N/A'}</strong></div>
                <div><span class="text-muted">WhatsApp:</span> <strong>${m.whatsapp || 'N/A'}</strong></div>
                <div><span class="text-muted">Email:</span> <strong>${m.email || 'N/A'}</strong></div>
                <div><span class="text-muted">Emergency Contact:</span> <strong>${m.emergency_contact || 'N/A'}</strong></div>
                <div><span class="text-muted">Blood Group:</span> <strong>${m.blood_group || 'N/A'}</strong></div>
                <div><span class="text-muted">Joining Date:</span> <strong>${m.joining_date || 'N/A'}</strong></div>
                <div><span class="text-muted">Admission Fee:</span> <strong style="color:${m.admission_fee_paid ? 'var(--color-success)' : 'var(--color-warning)'};">${m.admission_fee_paid ? '✓ Paid (₹1,500)' : '⚠️ Unpaid (₹1,500 due on admission)'}</strong></div>
                <div><span class="text-muted">Trainer Assigned:</span> <strong>${m.trainer_name || 'None'}</strong></div>
                <div><span class="text-muted">Medical Notes:</span> <strong style="color:var(--color-primary);">${m.medical_notes || 'None'}</strong></div>
              </div>
            </div>
            
            <!-- Right: Identity Member Card & QR/Barcode -->
            <div class="card glass-card text-center" style="display:flex; flex-direction:column; justify-content:center; align-items:center;">
              <h3 class="mb-md" style="font-size:1rem; font-weight:600;">Member Pass Card</h3>
              <div class="id-card-render" style="width: 320px; height: 180px; background: linear-gradient(135deg, #111, #222); border: 2px solid var(--color-primary); border-radius: var(--radius-md); position: relative; padding: var(--spacing-md); text-align: left; color:#fff; box-shadow: var(--shadow-glow);">
                <div style="font-family: var(--font-secondary); font-weight:800; font-size:1.15rem; color:var(--color-primary); display:flex; justify-content:between;">
                  FIGHT CLUB
                  <span style="font-size:0.6rem; color:#ffd700; border:1px solid #ffd700; padding:1px 4px; border-radius:3px;">PASS</span>
                </div>
                <div style="font-size:0.65rem; text-transform:uppercase; letter-spacing:0.5px; margin-bottom: 10px; color:#aaa;">Train Hard. Fight Smart.</div>
                
                <div class="flex gap-md align-center" style="margin-top:15px;">
                  <div style="width: 50px; height: 50px; border-radius: 5px; background: #333; background-size:cover; background-position:center; ${m.photo_path ? `background-image:url(${m.photo_path})` : ''}"></div>
                  <div>
                    <div style="font-weight:700; font-size:0.95rem;">${m.fullname}</div>
                    <div style="font-size:0.75rem; color:#aaa;">ID: ${m.member_code}</div>
                  </div>
                </div>
                
                <!-- Barcode & QR integration -->
                <div style="position: absolute; bottom: 10px; right: 10px; width: 50px; height: 50px; background: #fff; padding: 2px; border-radius: 3px;">
                  <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${m.member_code}" style="width:100%; height:100%;" alt="QR ID">
                </div>
              </div>
              <p class="text-sm text-muted mt-md">Scanning this card checks the member in/out instantly.</p>
            </div>
          </div>

          <!-- Subscription History -->
          <div class="card glass-card mt-lg">
            <h3 class="mb-md" style="font-size:1.1rem; font-weight:700;">Subscription History</h3>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Membership Plan</th>
                    <th>Start Date</th>
                    <th>Expiry Date</th>
                    <th>Cost</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${subscriptions.length === 0 ? `<tr><td colspan="5" class="text-center">No subscriptions registered</td></tr>` : 
                    subscriptions.map(s => `
                      <tr>
                        <td><strong>${s.plan_name}</strong></td>
                        <td>${s.start_date}</td>
                        <td>${s.expiry_date}</td>
                        <td>${currencySymbol}${s.final_amount}</td>
                        <td><span class="status-badge status-${s.status.toLowerCase()}">${s.status}</span></td>
                      </tr>
                    `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Payments History -->
          <div class="card glass-card mt-lg">
            <h3 class="mb-md" style="font-size:1.1rem; font-weight:700;">Payment History</h3>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Invoice Number</th>
                    <th>Payment Date</th>
                    <th>Amount</th>
                    <th>Payment Method</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  ${payments.length === 0 ? `<tr><td colspan="5" class="text-center">No payment transactions</td></tr>` : 
                    payments.map(p => `
                      <tr>
                        <td><strong>${p.invoice_number}</strong></td>
                        <td>${p.payment_date}</td>
                        <td style="color:var(--color-success); font-weight:600;">${currencySymbol}${p.paid_amount}</td>
                        <td><span class="badge" style="background:var(--color-border);">${p.payment_method}</span></td>
                        <td>${p.remarks || '-'}</td>
                      </tr>
                    `).join('')}
                </tbody>
              </table>
            </div>
          </div>
          
          <!-- Attendance Log -->
          <div class="card glass-card mt-lg">
            <h3 class="mb-md" style="font-size:1.1rem; font-weight:700;">Recent Check-ins (Last 30 Days)</h3>
            <div class="attendance-timeline" style="display:flex; flex-direction:column; gap:var(--spacing-sm); max-height:220px; overflow-y:auto; padding:5px;">
              ${attendance.length === 0 ? `<p class="text-muted">No attendance checks recorded.</p>` : 
                attendance.map(a => `
                  <div class="flex justify-between align-center" style="border-bottom:1px solid var(--color-border); padding-bottom:6px;">
                    <div>
                      <i data-lucide="check-circle-2" style="color:var(--color-success); width:16px; height:16px; display:inline-block; vertical-align:middle; margin-right:5px;"></i>
                      <strong>Checked In:</strong> ${new Date(a.check_in).toLocaleTimeString()} on ${a.attendance_date}
                    </div>
                    <div class="text-muted text-sm">
                      <strong>Checked Out:</strong> ${a.check_out ? new Date(a.check_out).toLocaleTimeString() : '<span style="color:var(--color-warning);">Present</span>'}
                    </div>
                  </div>
                `).join('')}
            </div>
          </div>

        </div>
      `;
      
      lucide.createIcons();
      document.getElementById('member-details-drawer').classList.remove('hidden');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }
};

export default MembersView;
