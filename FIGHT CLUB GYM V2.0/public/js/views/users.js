// System Users Management View for Fight Club Gym
import api from '../api.js';
import { showToast, showConfirm } from '../utils.js';

const UsersView = {
  users: [],
  roles: [],
  
  render: async (container) => {
    await UsersView.fetchData();
    
    container.innerHTML = `
      <div class="users-layout grid-2">
        
        <!-- Left: Users list -->
        <div class="card glass-card">
          <h3 class="mb-md" style="font-size: 1.15rem; font-weight: 700;">System Users</h3>
          
          <div class="users-list-wrapper" style="display:flex; flex-direction:column; gap:var(--spacing-md);">
            ${UsersView.users.length === 0 ? `
              <div class="empty-state"><p>No users found.</p></div>
            ` : UsersView.users.map(u => {
              return `
                <div class="user-item-card" style="border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--spacing-md); background: rgba(0,0,0,0.05); display:flex; gap:var(--spacing-md); align-items:center;">
                  <div class="user-avatar" style="width:50px; height:50px; border-radius:var(--radius-full); background: var(--color-bg-card-hover); display:flex; align-items:center; justify-content:center; font-weight:700;">
                    ${u.fullname.substring(0,2).toUpperCase()}
                  </div>
                  <div style="flex-grow:1;">
                    <div class="flex align-center gap-sm">
                      <strong style="font-size:1.05rem;">${u.fullname}</strong>
                      <span class="status-badge status-${(u.status || 'Active').toLowerCase()}" style="font-size:0.65rem; padding:1px 4px;">${u.status || 'Active'}</span>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--color-text-muted); margin-top:2px;">
                      Username: <strong>${u.username}</strong>
                    </div>
                    <div style="font-size: 0.8rem; color: var(--color-primary); font-weight:600; margin-top:4px;">
                      Role: <strong>${u.role_name || 'No Role Assigned'}</strong>
                    </div>
                  </div>
                  <div class="flex gap-sm" style="flex-shrink:0;">
                    <button class="btn btn-secondary btn-sm btn-edit-user" data-id="${u.id}" title="Edit User"><i data-lucide="edit-2" style="width:14px;height:14px;"></i></button>
                    ${u.id === 1 ? '' : `<button class="btn btn-danger btn-sm btn-delete-user" data-id="${u.id}" title="Delete"><i data-lucide="trash" style="width:14px;height:14px;"></i></button>`}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Right: Register User Form -->
        <div class="card glass-card" style="align-self: start;">
          <h3 class="mb-md" style="font-size: 1.15rem; font-weight: 700;" id="form-user-title">Add System User</h3>
          
          <form id="user-creation-form">
            <input type="hidden" id="edit-user-id">
            
            <div class="form-group">
              <label for="user-fullname">Full Name *</label>
              <input type="text" id="user-fullname" required placeholder="John Doe">
            </div>

            <div class="form-group">
              <label for="user-username">Username *</label>
              <input type="text" id="user-username" required placeholder="johndoe">
            </div>

            <div class="form-group">
              <label for="user-password">Password <span id="password-hint" style="font-size: 0.8em; color: var(--color-text-muted);">(Required for new users)</span></label>
              <input type="password" id="user-password" placeholder="••••••••">
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="user-role">Role</label>
                <select id="user-role">
                  <option value="">-- Select Role --</option>
                  ${UsersView.roles.map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
                </select>
              </div>

              <div class="form-group">
                <label for="user-status">Status</label>
                <select id="user-status">
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>

            <button type="submit" class="btn btn-primary btn-block">Create User</button>
          </form>
        </div>

      </div>
    `;

    container.querySelectorAll('.btn-edit-user').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        UsersView.editUser(id);
      });
    });

    container.querySelectorAll('.btn-delete-user').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        UsersView.deleteUser(id);
      });
    });

    UsersView.bindEvents();
    lucide.createIcons();
  },
  
  fetchData: async () => {
    try {
      UsersView.users = await api.get('/api/users');
      UsersView.roles = await api.get('/api/roles');
    } catch (e) {
      showToast('Error loading users: ' + e.message, 'error');
    }
  },
  
  bindEvents: () => {
    const form = document.getElementById('user-creation-form');
    const passwordInput = document.getElementById('user-password');
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const editId = document.getElementById('edit-user-id').value;
      const data = {
        fullname: document.getElementById('user-fullname').value,
        username: document.getElementById('user-username').value,
        role_id: document.getElementById('user-role').value || null,
        status: document.getElementById('user-status').value
      };
      
      const password = passwordInput.value;
      if (password) {
        data.password = password;
      }
      
      if (!editId && !password) {
        showToast('Password is required for new users.', 'error');
        return;
      }
      
      try {
        if (editId) {
          await api.put(`/api/users/${editId}`, data);
          showToast('User profile updated.', 'success');
          
          // If the user edited their own profile, update the session and sidebar immediately
          const currentUser = api.getCurrentUser();
          if (currentUser && currentUser.id == editId) {
             currentUser.fullname = data.fullname;
             currentUser.username = data.username;
             
             const selectedRole = UsersView.roles.find(r => r.id == data.role_id);
             if (selectedRole) {
               currentUser.role_name = selectedRole.name;
             }
             
             api.setCurrentUser(currentUser);
             
             // Update sidebar DOM directly
             const nameEl = document.getElementById('current-user-name');
             const roleEl = document.getElementById('current-user-role');
             const avatarEl = document.getElementById('current-user-avatar');
             
             if (nameEl) nameEl.textContent = currentUser.fullname;
             if (roleEl) roleEl.textContent = currentUser.role_name || 'System User';
             if (avatarEl) avatarEl.textContent = currentUser.fullname.substring(0, 2).toUpperCase();
          }
        } else {
          await api.post('/api/users', data);
          showToast('User created successfully.', 'success');
        }
        
        const container = document.getElementById('view-container');
        await UsersView.render(container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  },
  
  editUser: (id) => {
    const user = UsersView.users.find(u => u.id == id);
    if (!user) return;
    
    document.getElementById('form-user-title').textContent = 'Modify User Profile';
    document.getElementById('edit-user-id').value = user.id;
    document.getElementById('user-fullname').value = user.fullname;
    document.getElementById('user-username').value = user.username;
    
    // Clear password field and update hint
    document.getElementById('user-password').value = '';
    document.getElementById('password-hint').textContent = '(Leave blank to keep current password)';
    document.getElementById('user-password').removeAttribute('required');
    
    if (user.role_id) {
      document.getElementById('user-role').value = user.role_id;
    } else {
      document.getElementById('user-role').value = '';
    }
    
    document.getElementById('user-status').value = user.status || 'Active';
    
    const submitBtn = document.querySelector('#user-creation-form button[type="submit"]');
    if (submitBtn) {
      submitBtn.textContent = 'Save User Settings';
    }
  },
  
  deleteUser: (id) => {
    const user = UsersView.users.find(u => u.id == id);
    const userName = user ? user.username : 'this user';
    
    if (id == 1) {
      showToast('Cannot delete the primary administrator.', 'error');
      return;
    }
    
    showConfirm(
      'Confirm Deletion',
      `Are you sure you want to delete user ${userName}? They will no longer be able to log in.`,
      async () => {
        try {
          const response = await api.delete(`/api/users/${id}`);
          showToast(response.message || 'User deleted.', 'warning');
          
          const container = document.getElementById('view-container');
          await UsersView.render(container);
        } catch (e) {
          showToast(e.message, 'error');
        }
      }
    );
  }
};

export default UsersView;
