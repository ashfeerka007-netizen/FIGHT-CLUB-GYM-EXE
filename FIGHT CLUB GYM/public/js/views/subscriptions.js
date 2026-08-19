// Subscription Management View for Fight Club Gym
import api from '../api.js';
import { showToast, showConfirm, openWhatsAppWeb } from '../utils.js';

const SubscriptionsView = {
  subscriptions: [],
  members: [],
  plans: [],
  
  render: async (container) => {
    await SubscriptionsView.loadData();
    
    const currencySymbol = '₹';
    
    container.innerHTML = `
      <div class="subscriptions-layout grid-2">
        
        <!-- Left Column: Active Subscriptions Table -->
        <div class="card glass-card">
          <h3 class="mb-md" style="font-size: 1.15rem; font-weight: 700;">Active & Expiring Subscriptions</h3>
          
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Fighter</th>
                  <th>Plan</th>
                  <th>Remaining Days</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="subscriptions-list-body">
                ${SubscriptionsView.subscriptions.length === 0 ? `
                  <tr><td colspan="5" class="text-center">No subscriptions recorded.</td></tr>
                ` : SubscriptionsView.subscriptions.map(s => {
                  let badgeClass = 'status-active';
                  let daysRemainingText = `${Math.ceil(s.days_remaining)} days`;
                  
                  if (s.status === 'Frozen') {
                    badgeClass = 'status-frozen';
                    daysRemainingText = 'Frozen';
                  } else if (s.days_remaining < 0) {
                    badgeClass = 'status-expired';
                    daysRemainingText = 'Expired';
                  } else if (s.days_remaining <= 7) {
                    badgeClass = 'status-frozen'; // orange color badge
                    daysRemainingText = `${Math.ceil(s.days_remaining)} days left`;
                  }
                  
                  return `
                    <tr>
                      <td>
                        <strong>${s.member_name}</strong>
                        <div style="font-size:0.75rem; color:var(--color-text-muted);">${s.member_code}</div>
                      </td>
                      <td>
                        <strong>${s.plan_name}</strong>
                        <div style="font-size:0.75rem; color:var(--color-text-muted);">${currencySymbol}${s.final_amount}</div>
                      </td>
                      <td>
                        <span class="text-sm font-semibold">${daysRemainingText}</span>
                      </td>
                      <td>
                        <span class="status-badge ${badgeClass}">${s.status}</span>
                      </td>
                      <td>
                        <div class="flex gap-sm">
                          <button class="btn btn-success btn-sm btn-wa-sub" data-id="${s.id}" data-member-id="${s.member_id}" data-member-name="${s.member_name}" title="Send WhatsApp Message / Receipt"><i data-lucide="message-square" style="width:12px;height:12px;"></i></button>
                          ${s.status === 'Active' ? `
                            <button class="btn btn-secondary btn-sm btn-freeze" data-id="${s.id}" title="Freeze Membership"><i data-lucide="snowflake" style="width:12px;height:12px;"></i></button>
                            <button class="btn btn-danger btn-sm btn-cancel" data-id="${s.id}" title="Cancel Membership"><i data-lucide="trash-2" style="width:12px;height:12px;"></i></button>
                          ` : ''}
                          ${s.status === 'Frozen' ? `
                            <button class="btn btn-primary btn-sm btn-resume" data-id="${s.id}" title="Resume Membership" style="padding:4px;"><i data-lucide="play" style="width:12px;height:12px;"></i></button>
                          ` : ''}
                          ${s.status === 'Expired' ? `
                            <span class="text-xs text-muted">Expired</span>
                          ` : ''}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Right Column: Purchase / Renew Plan Form -->
        <div class="card glass-card" style="align-self: start;">
          <h3 class="mb-md" style="font-size: 1.15rem; font-weight: 700;">Purchase / Renew Subscription</h3>
          
          <form id="purchase-subscription-form">
            <div class="form-group">
              <label for="sub-member">Select Member *</label>
              <select id="sub-member" required>
                <option value="">Choose Fighter...</option>
                ${SubscriptionsView.members.map(m => `
                  <option value="${m.id}">${m.fullname} (${m.member_code} - ${m.status})</option>
                `).join('')}
              </select>
            </div>

            <div class="form-group">
              <label for="sub-plan">Select Membership Plan *</label>
              <select id="sub-plan" required>
                <option value="">Choose Plan...</option>
                ${SubscriptionsView.plans.filter(p => p.status === 'Active').map(p => `
                  <option value="${p.id}" data-amount="${p.final_amount}">${p.name} - ${currencySymbol}${p.final_amount} (${p.duration_months} mo)</option>
                `).join('')}
              </select>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="sub-start-date">Start Date *</label>
                <input type="date" id="sub-start-date" required value="${new Date().toISOString().split('T')[0]}">
              </div>

              <div class="form-group">
                <label for="sub-paymethod">Payment Method</label>
                <select id="sub-paymethod">
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Card">Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>
            </div>

            <!-- Discount Section -->
            <div class="form-row" style="align-items:flex-end;">
              <div class="form-group" style="flex:1;">
                <label for="sub-discount-type">Discount Type</label>
                <select id="sub-discount-type">
                  <option value="amount">Fixed Amount (₹)</option>
                  <option value="percent">Percentage (%)</option>
                </select>
              </div>
              <div class="form-group" style="flex:1;">
                <label for="sub-discount-value">Discount Value</label>
                <input type="number" id="sub-discount-value" min="0" step="1" value="0" placeholder="0">
              </div>
            </div>

            <div class="form-group">
              <label for="sub-remarks">Remarks / Invoice Memo</label>
              <input type="text" id="sub-remarks" placeholder="Optional notes for receipt">
            </div>

            <div class="form-group" style="margin-top: 10px;">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.875rem;">
                <input type="checkbox" id="sub-send-whatsapp" checked style="width:16px; height:16px;">
                <span>Send WhatsApp Receipt &amp; Confirmation to Fighter</span>
              </label>
            </div>

            <div class="price-breakdown-card mb-md" style="background: rgba(0,0,0,0.1); border:1px solid var(--color-border); border-radius:var(--radius-sm); padding:var(--spacing-md); display:none;" id="sub-price-breakdown">
              <div class="flex justify-between align-center mb-sm">
                <span style="color:var(--color-text-muted);">Plan Price:</span>
                <span id="breakdown-base-amount" style="font-weight:600;">₹0.00</span>
              </div>
              <div class="flex justify-between align-center mb-sm" id="breakdown-discount-row" style="display:none !important;">
                <span style="color:var(--color-warning);">Discount:</span>
                <span id="breakdown-discount-val" style="color:var(--color-warning); font-weight:600;">-₹0.00</span>
              </div>
              <div class="flex justify-between align-center" style="border-top:1px solid var(--color-border); padding-top:8px; margin-top:4px;">
                <span style="font-weight:700;">Final Payable:</span>
                <strong style="color:var(--color-success); font-size:1.2rem;" id="breakdown-amount">₹0.00</strong>
              </div>
            </div>

            <button type="submit" class="btn btn-primary btn-block">Activate Subscription</button>
          </form>
        </div>

      </div>
    `;

    SubscriptionsView.bindEvents();
    lucide.createIcons();
  },
  
  loadData: async () => {
    try {
      const subs = await api.get('/api/subscriptions');
      const mems = await api.get('/api/members');
      const pls = await api.get('/api/plans');
      SubscriptionsView.subscriptions = Array.isArray(subs) ? subs : [];
      SubscriptionsView.members = Array.isArray(mems) ? mems : [];
      SubscriptionsView.plans = Array.isArray(pls) ? pls : [];
    } catch (e) {
      SubscriptionsView.subscriptions = Array.isArray(SubscriptionsView.subscriptions) ? SubscriptionsView.subscriptions : [];
      SubscriptionsView.members = Array.isArray(SubscriptionsView.members) ? SubscriptionsView.members : [];
      SubscriptionsView.plans = Array.isArray(SubscriptionsView.plans) ? SubscriptionsView.plans : [];
      showToast('Error loading subscription lists: ' + e.message, 'error');
    }
  },
  
  bindEvents: () => {
    const form = document.getElementById('purchase-subscription-form');
    const planSelect = document.getElementById('sub-plan');
    const breakdownCard = document.getElementById('sub-price-breakdown');
    const breakdownAmount = document.getElementById('breakdown-amount');
    const breakdownBase = document.getElementById('breakdown-base-amount');
    const breakdownDiscountRow = document.getElementById('breakdown-discount-row');
    const breakdownDiscountVal = document.getElementById('breakdown-discount-val');
    const discountTypeEl = document.getElementById('sub-discount-type');
    const discountValueEl = document.getElementById('sub-discount-value');

    // Helper: recalculate price with discount
    function recalcPrice() {
      const selectedOption = planSelect.options[planSelect.selectedIndex];
      const baseAmount = parseFloat(selectedOption.getAttribute('data-amount') || 0);
      if (!baseAmount) { breakdownCard.style.display = 'none'; return; }

      const discType = discountTypeEl.value;
      const discVal = parseFloat(discountValueEl.value) || 0;
      let discountAmt = discType === 'percent'
        ? Math.min((baseAmount * discVal) / 100, baseAmount)
        : Math.min(discVal, baseAmount);
      discountAmt = Math.round(discountAmt * 100) / 100;
      const finalAmt = Math.max(0, baseAmount - discountAmt);

      breakdownBase.textContent = `₹${baseAmount.toLocaleString()}`;
      if (discountAmt > 0) {
        breakdownDiscountRow.style.setProperty('display', 'flex', 'important');
        breakdownDiscountVal.textContent = `-₹${discountAmt.toLocaleString()}`;
      } else {
        breakdownDiscountRow.style.setProperty('display', 'none', 'important');
      }
      breakdownAmount.textContent = `₹${finalAmt.toLocaleString()}`;
      breakdownCard.style.display = 'block';
    }

    // Show breakdown on plan select
    planSelect.addEventListener('change', recalcPrice);
    discountTypeEl.addEventListener('change', recalcPrice);
    discountValueEl.addEventListener('input', recalcPrice);
    
    // Form submission
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const discountType = discountTypeEl.value;
      const discountRaw = parseFloat(discountValueEl.value) || 0;

      const payload = {
        member_id: parseInt(document.getElementById('sub-member').value),
        plan_id: parseInt(document.getElementById('sub-plan').value),
        start_date: document.getElementById('sub-start-date').value,
        payment_method: document.getElementById('sub-paymethod').value,
        remarks: document.getElementById('sub-remarks').value,
        send_whatsapp: document.getElementById('sub-send-whatsapp').checked,
        discount_type: discountType,
        discount_value: discountRaw
      };
      
      try {
        const response = await api.post('/api/subscriptions', payload);
        let msg = `Subscription activated! Invoice ${response.invoice_number} generated.`;
        if (payload.send_whatsapp && response.payment_id) {
          try {
            const receiptRes = await api.post(`/api/whatsapp/send-payment-receipt/${response.payment_id}`);
            const member = SubscriptionsView.members.find(m => m.id == payload.member_id);
            openWhatsAppWeb({ mobile: member?.mobile || '', message: receiptRes.messageBody || '' });
            msg += ` Opening WhatsApp...`;
          } catch (waErr) {
            console.error(waErr);
          }
        }
        showToast(msg, 'success');
        
        // Reload SPA view
        const container = document.getElementById('view-container');
        await SubscriptionsView.render(container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Action buttons: WhatsApp
    document.querySelectorAll('.btn-wa-sub').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        const memberId = btn.getAttribute('data-member-id');
        const memberName = btn.getAttribute('data-member-name');
        const subId = btn.getAttribute('data-id');
        
        const member = SubscriptionsView.members.find(m => m.id == memberId);
        const mobile = member ? member.mobile : '';

        import('./whatsapp.js').then(module => {
          module.openWASendModal({
            memberId,
            memberName,
            mobile,
            prefillTemplate: 'membership_new'
          });
        }).catch(err => {
          showToast('Failed to open WhatsApp dialog: ' + err.message, 'error');
        });
      });
    });
    
    // Action buttons: Freeze
    document.querySelectorAll('.btn-freeze').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        
        showConfirm(
          'Freeze Subscription',
          'Freeze this membership? Expiry days count will pause.',
          async () => {
            try {
              await api.post(`/api/subscriptions/${id}/status`, { status: 'Frozen' });
              showToast('Membership frozen.', 'info');
              const container = document.getElementById('view-container');
              await SubscriptionsView.render(container);
            } catch (e) {
              showToast(e.message, 'error');
            }
          },
          'Freeze',
          'btn-primary'
        );
      });
    });

    // Action buttons: Resume
    document.querySelectorAll('.btn-resume').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          await api.post(`/api/subscriptions/${id}/status`, { status: 'Active' });
          showToast('Membership resumed.', 'success');
          const container = document.getElementById('view-container');
          await SubscriptionsView.render(container);
        } catch (e) {
          showToast(e.message, 'error');
        }
      });
    });

    // Action buttons: Cancel
    document.querySelectorAll('.btn-cancel').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        
        showConfirm(
          'Cancel Subscription',
          'Cancel this membership? Fighter will lose gym access.',
          async () => {
            try {
              await api.post(`/api/subscriptions/${id}/status`, { status: 'Expired' });
              showToast('Membership cancelled/expired.', 'warning');
              const container = document.getElementById('view-container');
              await SubscriptionsView.render(container);
            } catch (e) {
              showToast(e.message, 'error');
            }
          },
          'Cancel Membership',
          'btn-danger'
        );
      });
    });
  }
};

export default SubscriptionsView;
