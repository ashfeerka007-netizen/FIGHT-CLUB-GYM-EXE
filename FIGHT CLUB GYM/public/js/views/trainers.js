// Trainers & Staff Management View for Fight Club Gym
import api from '../api.js';
import { showToast, showConfirm } from '../utils.js';

const TrainersView = {
  trainers: [],
  members: [],
  
  render: async (container) => {
    await TrainersView.fetchData();
    
    const currencySymbol = '₹';
    
    container.innerHTML = `
      <div class="trainers-layout grid-2">
        
        <!-- Left: Trainers list -->
        <div class="card glass-card">
          <h3 class="mb-md" style="font-size: 1.15rem; font-weight: 700;">Trainers & Instructors</h3>
          
          <div class="trainers-list-wrapper" style="display:flex; flex-direction:column; gap:var(--spacing-md);">
            ${TrainersView.trainers.length === 0 ? `
              <div class="empty-state"><p>No trainers registered yet.</p></div>
            ` : TrainersView.trainers.map(t => {
              // Count assigned members
              const assignedCount = TrainersView.members.filter(m => m.trainer_id === t.id).length;
              
              return `
                <div class="trainer-item-card" style="border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--spacing-md); background: rgba(0,0,0,0.05); display:flex; gap:var(--spacing-md); align-items:center;">
                  <div class="trainer-avatar" style="width:50px; height:50px; border-radius:var(--radius-full); background: var(--color-bg-card-hover); background-size:cover; background-position:center; display:flex; align-items:center; justify-content:center; font-weight:700; ${t.photo_path ? `background-image:url(${t.photo_path})` : ''}">
                    ${t.photo_path ? '' : t.fullname.substring(0,2).toUpperCase()}
                  </div>
                  <div style="flex-grow:1;">
                    <div class="flex align-center gap-sm">
                      <strong style="font-size:1.05rem;">${t.fullname}</strong>
                      <span class="status-badge status-${t.status.toLowerCase()}" style="font-size:0.65rem; padding:1px 4px;">${t.status}</span>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--color-text-muted); margin-top:2px;">
                      Specialization: <strong>${t.specialization || 'General Trainer'}</strong> | 
                      Salary: <strong>${currencySymbol}${t.salary.toLocaleString()}</strong>
                    </div>
                    <div style="font-size: 0.8rem; color: var(--color-primary); font-weight:600; margin-top:4px;">
                      Assigned Fighters: <strong>${assignedCount} Active</strong>
                    </div>
                    <p style="font-size:0.75rem; color:var(--color-text-muted); margin-top:4px; font-style:italic;">
                      Notes: ${t.performance_notes || 'None'}
                    </p>
                  </div>
                  <div class="flex gap-sm" style="flex-shrink:0;">
                    <button class="btn btn-secondary btn-sm btn-edit-trainer" data-id="${t.id}" title="Edit Profile"><i data-lucide="edit-2" style="width:14px;height:14px;"></i></button>
                    <button class="btn btn-danger btn-sm btn-delete-trainer" data-id="${t.id}" title="Delete"><i data-lucide="trash" style="width:14px;height:14px;"></i></button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Right: Register Trainer Form -->
        <div class="card glass-card" style="align-self: start;">
          <h3 class="mb-md" style="font-size: 1.15rem; font-weight: 700;" id="form-trainer-title">Add Trainer Profile</h3>
          
          <form id="trainer-creation-form" enctype="multipart/form-data">
            <input type="hidden" id="edit-trainer-id">
            
            <div class="form-group">
              <label for="trainer-name">Full Name *</label>
              <input type="text" id="trainer-name" required placeholder="Robert Paulson">
            </div>

            <div class="form-group">
              <label for="trainer-special">Specialization *</label>
              <input type="text" id="trainer-special" required placeholder="Heavyweight / Bodybuilding / Yoga">
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="trainer-salary">Monthly Salary (INR) *</label>
                <input type="number" id="trainer-salary" required min="0" value="30000">
              </div>

              <div class="form-group">
                <label for="trainer-status">Status</label>
                <select id="trainer-status">
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>

            <!-- Profile Photo Upload -->
            <div class="form-group">
              <label for="trainer-photo">Profile Photo</label>
              <input type="file" id="trainer-photo" accept="image/*">
            </div>

            <div class="form-group">
              <label for="trainer-notes">Performance Notes / Qualifications</label>
              <textarea id="trainer-notes" rows="2" placeholder="Experience details or medical credentials..."></textarea>
            </div>

            <button type="submit" class="btn btn-primary btn-block">Register Trainer</button>
          </form>
        </div>

      </div>
    `;

    container.querySelectorAll('.btn-edit-trainer').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        TrainersView.editTrainer(id);
      });
    });

    container.querySelectorAll('.btn-delete-trainer').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        TrainersView.deleteTrainer(id);
      });
    });

    TrainersView.bindEvents();
    lucide.createIcons();
  },
  
  fetchData: async () => {
    try {
      TrainersView.trainers = await api.get('/api/trainers');
      TrainersView.members = await api.get('/api/members');
    } catch (e) {
      showToast('Error loading trainers: ' + e.message, 'error');
    }
  },
  
  bindEvents: () => {
    const form = document.getElementById('trainer-creation-form');
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const editId = document.getElementById('edit-trainer-id').value;
      const formData = new FormData();
      formData.append('fullname', document.getElementById('trainer-name').value);
      formData.append('specialization', document.getElementById('trainer-special').value);
      formData.append('salary', parseFloat(document.getElementById('trainer-salary').value));
      formData.append('status', document.getElementById('trainer-status').value);
      formData.append('performance_notes', document.getElementById('trainer-notes').value);
      
      const photoFile = document.getElementById('trainer-photo').files[0];
      if (photoFile) {
        formData.append('photo', photoFile);
      }
      
      try {
        if (editId) {
          await api.put(`/api/trainers/${editId}`, formData, true);
          showToast('Trainer profile updated.', 'success');
        } else {
          await api.post('/api/trainers', formData, true);
          showToast('Trainer registered successfully.', 'success');
        }
        
        const container = document.getElementById('view-container');
        await TrainersView.render(container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  },
  
  editTrainer: (id) => {
    const trainer = TrainersView.trainers.find(t => t.id == id);
    if (!trainer) return;
    
    document.getElementById('form-trainer-title').textContent = 'Modify Trainer Profile';
    document.getElementById('edit-trainer-id').value = trainer.id;
    document.getElementById('trainer-name').value = trainer.fullname;
    document.getElementById('trainer-special').value = trainer.specialization;
    document.getElementById('trainer-salary').value = trainer.salary;
    document.getElementById('trainer-status').value = trainer.status;
    document.getElementById('trainer-notes').value = trainer.performance_notes || '';
    
    const submitBtn = document.querySelector('#trainer-creation-form button[type="submit"]');
    if (submitBtn) {
      submitBtn.textContent = 'Save Trainer Settings';
    }
  },
  
  deleteTrainer: (id) => {
    const trainer = TrainersView.trainers.find(t => t.id == id);
    const trainerName = trainer ? trainer.fullname : 'this trainer';
    
    showConfirm(
      'Confirm Deletion',
      `Are you sure you want to delete ${trainerName}? This will also unassign them from all assigned fighters.`,
      async () => {
        try {
          const response = await api.delete(`/api/trainers/${id}`);
          showToast(response.message || 'Trainer profile deleted.', 'warning');
          
          const container = document.getElementById('view-container');
          await TrainersView.render(container);
        } catch (e) {
          showToast(e.message, 'error');
        }
      }
    );
  }
};

export default TrainersView;
