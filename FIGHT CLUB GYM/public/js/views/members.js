// Members Directory View for Fight Club Gym
import api from '../api.js';
import { showToast, showConfirm } from '../utils.js';

const MembersView = {
  members: [],
  filters: { search: '', status: '', sort: 'fullname', order: 'ASC' },
  
  render: async (container) => {
    // 1. Fetch initial members list
    await MembersView.fetchMembers();
    
    // 2. Render initial structure
    container.innerHTML = `
      <div class="members-view-container">
        <!-- Table Actions & Filters -->
        <div class="table-header-actions">
          <div class="table-filters">
            <input type="text" id="search-members" placeholder="Search name, code, phone..." value="${MembersView.filters.search}">
            
            <select id="filter-status">
              <option value="">All Statuses</option>
              <option value="Active" ${MembersView.filters.status === 'Active' ? 'selected' : ''}>Active</option>
              <option value="Expired" ${MembersView.filters.status === 'Expired' ? 'selected' : ''}>Expired</option>
              <option value="Frozen" ${MembersView.filters.status === 'Frozen' ? 'selected' : ''}>Frozen</option>
            </select>
          </div>
          
          <div class="flex gap-sm">
            <button class="btn btn-secondary" id="btn-export-csv"><i data-lucide="download"></i> Export CSV</button>
            <button class="btn btn-primary" id="btn-add-member"><i data-lucide="user-plus"></i> Register Member</button>
          </div>
        </div>

        <!-- Members Table -->
        <div class="table-container">
          <table id="members-table">
            <thead>
              <tr>
                <th class="sortable" data-sort="member_code">Code</th>
                <th class="sortable" data-sort="fullname">Full Name</th>
                <th>Mobile</th>
                <th>Plan Status</th>
                <th>Expiry</th>
                <th>Assigned Trainer</th>
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
                      <label for="reg-member-code">Membership Number *</label>
                      <input type="number" id="reg-member-code" min="0" max="99999999990" required placeholder="e.g. 1001">
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
      MembersView.members = await api.get(`/api/members?${q}`);
    } catch (e) {
      showToast('Error loading members: ' + e.message, 'error');
    }
  },
  
  loadTrainersDropdown: async () => {
    try {
      const trainers = await api.get('/api/trainers');
      const select = document.getElementById('reg-trainer');
      select.innerHTML = '<option value="">No Trainer Assigned</option>' + 
        trainers.map(t => `<option value="${t.id}">${t.fullname} (${t.specialization})</option>`).join('');
    } catch (e) {
      console.error(e);
    }
  },
  
  renderList: () => {
    const listBody = document.getElementById('members-list-body');
    
    if (MembersView.members.length === 0) {
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
      
      formData.append('member_code', document.getElementById('reg-member-code').value.toUpperCase());
      formData.append('fullname', document.getElementById('reg-fullname').value);
      formData.append('gender', document.getElementById('reg-gender').value);
      formData.append('dob', document.getElementById('reg-dob').value);
      formData.append('mobile', document.getElementById('reg-mobile').value);
      formData.append('whatsapp', document.getElementById('reg-whatsapp').value);
      formData.append('email', document.getElementById('reg-email').value);
      formData.append('address', document.getElementById('reg-address').value);
      formData.append('blood_group', document.getElementById('reg-blood').value);
      formData.append('joining_date', document.getElementById('reg-joining').value);
      formData.append('trainer_id', document.getElementById('reg-trainer').value);
      formData.append('status', document.getElementById('reg-status').value);
      formData.append('medical_notes', document.getElementById('reg-medical').value);
      formData.append('emergency_contact', document.getElementById('reg-emergency').value);
      formData.append('notes', document.getElementById('reg-notes').value);
      
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
    
    // Export CSV
    const exportBtn = document.getElementById('btn-export-csv');
    exportBtn.addEventListener('click', () => {
      if (MembersView.members.length === 0) return;
      
      const headers = ['Code', 'Full Name', 'Gender', 'Mobile', 'Email', 'Joining Date', 'Status'];
      const rows = MembersView.members.map(m => [
        m.member_code,
        m.fullname,
        m.gender,
        m.mobile,
        m.email,
        m.joining_date,
        m.status
      ]);
      
      let csvContent = "data:text/csv;charset=utf-8," 
        + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `fightclub_members_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast('Members exported successfully.', 'success');
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
