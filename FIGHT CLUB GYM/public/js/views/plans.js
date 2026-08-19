// Membership Plans Management View for Fight Club Gym
import api from '../api.js';
import { showToast, showConfirm } from '../utils.js';

const PlansView = {
  plans: [],
  
  render: async (container) => {
    await PlansView.fetchPlans();
    
    const currencySymbol = '₹';
    
    container.innerHTML = `
      <div class="plans-layout grid-2">
        
        <!-- Left: Plans List Grid grouped by category -->
        <div class="card glass-card">
          <h3 class="mb-md" style="font-size: 1.15rem; font-weight: 700;">Existing Membership Plans</h3>
          
          <div class="plans-list-wrapper" style="display:flex; flex-direction:column; gap:var(--spacing-md);">
            ${PlansView.plans.length === 0 ? `
              <div class="empty-state"><p>No membership plans created yet.</p></div>
            ` : PlansView.plans.map(p => `
              <div class="plan-item-card" style="border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--spacing-md); background: rgba(0,0,0,0.05); display:flex; justify-content:between; align-items:center;">
                <div>
                  <div class="flex align-center gap-sm">
                    <span class="badge" style="background-color: var(--color-primary); color:#fff; font-size:0.65rem;">${p.category}</span>
                    <strong style="font-size:1.05rem;">${p.name}</strong>
                  </div>
                  <div style="font-size: 0.85rem; color: var(--color-text-muted); margin-top:4px;">
                    Duration: <strong>${p.duration_months} Months</strong> | 
                    Price: <strong>${currencySymbol}${p.price}</strong> | 
                    Discount: <strong>${p.discount}%</strong> | 
                    Tax: <strong>${p.tax}%</strong>
                  </div>
                  <div class="plan-features-list text-xs text-muted" style="margin-top:6px;">
                    Features: ${JSON.parse(p.features || '[]').join(', ') || 'None'}
                  </div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:1.25rem; font-family:var(--font-secondary); font-weight:700; color:var(--color-success);">
                    ${currencySymbol}${p.final_amount}
                  </div>
                  <div class="flex gap-sm justify-end mt-sm">
                    <button class="btn btn-secondary btn-sm btn-edit-plan" data-id="${p.id}" title="Edit Plan"><i data-lucide="edit" style="width:12px;height:12px;"></i></button>
                    <button class="btn btn-danger btn-sm btn-delete-plan" data-id="${p.id}" title="Delete Plan"><i data-lucide="trash" style="width:12px;height:12px;"></i></button>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Right: Create / Modify Plan Form -->
        <div class="card glass-card" style="align-self: start;">
          <h3 class="mb-md" style="font-size: 1.15rem; font-weight: 700;" id="form-plan-title">Create Membership Plan</h3>
          
          <form id="plan-creation-form">
            <input type="hidden" id="edit-plan-id">
            
            <div class="form-group">
              <label for="plan-name">Plan Name *</label>
              <input type="text" id="plan-name" required placeholder="Gym Annual Elite">
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="plan-category">Category *</label>
                <select id="plan-category" required>
                  <option value="Gym">Gymnasium</option>
                  <option value="Boxing">Boxing Training</option>
                  <option value="Yoga">Yoga Training</option>
                </select>
              </div>

              <div class="form-group">
                <label for="plan-duration">Duration (Months) *</label>
                <input type="number" id="plan-duration" required min="1" max="60" value="1">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="plan-price">Base Price (INR) *</label>
                <input type="number" id="plan-price" required min="0" value="1000">
              </div>

              <div class="form-group">
                <label for="plan-discount">Discount (%)</label>
                <input type="number" id="plan-discount" min="0" max="100" value="0">
              </div>

              <div class="form-group">
                <label for="plan-tax">Tax / GST (%)</label>
                <input type="number" id="plan-tax" min="0" max="100" value="18">
              </div>
            </div>

            <div class="form-group">
              <label for="plan-features">Features Included (Comma separated list)</label>
              <input type="text" id="plan-features" placeholder="Access to cardio room, 1 Personal trainer session, Free lockers">
            </div>

            <div class="modal-footer" style="padding: 10px 0 0 0; border: none; justify-content: space-between;">
              <button type="button" class="btn btn-secondary hidden" id="btn-cancel-plan-edit">Cancel Edit</button>
              <button type="submit" class="btn btn-primary" style="margin-left:auto;">Save Plan</button>
            </div>
          </form>
        </div>

      </div>
    `;

    PlansView.bindEvents();
    lucide.createIcons();
  },
  
  fetchPlans: async () => {
    try {
      PlansView.plans = await api.get('/api/plans');
    } catch (e) {
      showToast('Error loading plans: ' + e.message, 'error');
    }
  },
  
  bindEvents: () => {
    const form = document.getElementById('plan-creation-form');
    const cancelEditBtn = document.getElementById('btn-cancel-plan-edit');
    const formTitle = document.getElementById('form-plan-title');
    
    // Save Plan handler
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const editId = document.getElementById('edit-plan-id').value;
      const featuresRaw = document.getElementById('plan-features').value;
      const features = featuresRaw ? featuresRaw.split(',').map(f => f.trim()) : [];
      
      const payload = {
        name: document.getElementById('plan-name').value,
        category: document.getElementById('plan-category').value,
        duration_months: parseInt(document.getElementById('plan-duration').value),
        price: parseFloat(document.getElementById('plan-price').value),
        discount: parseFloat(document.getElementById('plan-discount').value || 0),
        tax: parseFloat(document.getElementById('plan-tax').value || 0),
        features
      };
      
      try {
        if (editId) {
          await api.put(`/api/plans/${editId}`, payload);
          showToast('Membership plan modified successfully.', 'success');
        } else {
          await api.post('/api/plans', payload);
          showToast('New membership plan created.', 'success');
        }
        
        const container = document.getElementById('view-container');
        await PlansView.render(container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    
    // Edit buttons
    document.querySelectorAll('.btn-edit-plan').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        const plan = PlansView.plans.find(p => p.id == id);
        
        if (plan) {
          formTitle.textContent = 'Edit Membership Plan';
          document.getElementById('edit-plan-id').value = plan.id;
          document.getElementById('plan-name').value = plan.name;
          document.getElementById('plan-category').value = plan.category;
          document.getElementById('plan-duration').value = plan.duration_months;
          document.getElementById('plan-price').value = plan.price;
          document.getElementById('plan-discount').value = plan.discount;
          document.getElementById('plan-tax').value = plan.tax;
          document.getElementById('plan-features').value = JSON.parse(plan.features || '[]').join(', ');
          
          cancelEditBtn.classList.remove('hidden');
        }
      });
    });
    
    // Cancel Edit
    cancelEditBtn.addEventListener('click', () => {
      formTitle.textContent = 'Create Membership Plan';
      form.reset();
      document.getElementById('edit-plan-id').value = '';
      cancelEditBtn.classList.add('hidden');
    });
    
    // Delete plan buttons
    document.querySelectorAll('.btn-delete-plan').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        
        showConfirm(
          'Confirm Deletion',
          'Are you sure you want to delete this plan? Subscribed members will remain active but no new subscriptions can be sold for this plan.',
          async () => {
            try {
              await api.delete(`/api/plans/${id}`);
              showToast('Membership plan deleted.', 'warning');
              const container = document.getElementById('view-container');
              await PlansView.render(container);
            } catch (e) {
              showToast(e.message, 'error');
            }
          }
        );
      });
    });
  }
};

export default PlansView;
