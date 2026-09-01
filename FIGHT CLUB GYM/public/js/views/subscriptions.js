// Subscription Management View for Fight Club Gym
import api from '../api.js';
import { showToast, showConfirm, openWhatsAppWeb } from '../utils.js';

const SubscriptionsView = {
  subscriptions: [],
  members: [],
  plans: [],
  filters: {
    search: '',
    status: '',
    dateFrom: '',
    dateTo: ''
  },
  
  render: async (container) => {
    await SubscriptionsView.loadData();
    
    const currencySymbol = '₹';
    
    container.innerHTML = `
      <div class="subscriptions-layout grid-2">
        
        <!-- Left Column: Active Subscriptions Table -->
        <div class="card glass-card">
          <div class="flex justify-between align-center mb-md" style="flex-wrap:wrap; gap:8px;">
            <h3 style="font-size: 1.15rem; font-weight: 700; margin:0;">Active &amp; Expiring Subscriptions</h3>
            <span id="sub-count-badge" class="badge" style="background:var(--color-surface); font-size:0.75rem;">${SubscriptionsView.subscriptions.length} Subscriptions</span>
          </div>

          <!-- Filter & Search Toolbar for Subscriptions -->
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <div style="flex:1; min-width:180px; position:relative;">
                <input type="text" id="sub-table-search" class="form-control" placeholder="🔍 Search fighter, code, plan..." value="${SubscriptionsView.filters.search}" style="width:100%; padding:7px 10px; font-size:0.85rem; border-radius:var(--radius-sm); border:1px solid var(--color-border); background:var(--color-bg-card);">
              </div>
              <select id="sub-table-status" style="width:130px; padding:7px 8px; font-size:0.85rem; border-radius:var(--radius-sm); border:1px solid var(--color-border); background:var(--color-bg-card);">
                <option value="">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Expiring">Expiring (≤7d)</option>
                <option value="Frozen">Frozen</option>
                <option value="Expired">Expired</option>
              </select>
            </div>

            <!-- Date Range Filter for Subscriptions -->
            <div class="date-filter-bar">
              <span style="font-size:0.75rem; color:var(--color-text-muted); font-weight:600;"><i data-lucide="calendar" style="width:12px;height:12px;display:inline-block;vertical-align:middle;"></i> Expiry Date:</span>
              <input type="date" id="sub-filter-date-from" class="date-input-field" title="Expiry From Date" value="${SubscriptionsView.filters.dateFrom}">
              <span style="font-size:0.75rem; color:var(--color-text-muted);">to</span>
              <input type="date" id="sub-filter-date-to" class="date-input-field" title="Expiry To Date" value="${SubscriptionsView.filters.dateTo}">
              
              <button type="button" class="date-preset-pill" id="sub-preset-all">All</button>
              <button type="button" class="date-preset-pill" id="sub-preset-exp-30">Next 30 Days</button>
              <button type="button" class="date-preset-pill" id="sub-preset-clear" title="Clear Date Filter"><i data-lucide="x" style="width:11px;height:11px;"></i> Clear</button>
            </div>
          </div>
          
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
                <!-- Rendered dynamically via renderFilteredTable -->
              </tbody>
            </table>
          </div>
        </div>

        <!-- Right Column: Purchase / Renew Plan Form -->
        <div class="card glass-card" style="align-self: start;">
          <h3 class="mb-md" style="font-size: 1.15rem; font-weight: 700;">Purchase / Renew Subscription</h3>
          
          <form id="purchase-subscription-form">
            
            <!-- Searchable Member Selection -->
            <div class="form-group" style="position:relative;">
              <label for="sub-member-search-input">Select Member / Search Fighter *</label>
              
              <div class="searchable-select-wrap">
                <div class="searchable-input-box">
                  <i data-lucide="search" class="search-icon"></i>
                  <input type="text" id="sub-member-search-input" class="form-control" autocomplete="off" placeholder="Type name, ID (e.g. FC-1001), or mobile...">
                  <button type="button" id="sub-member-search-clear" class="clear-btn" title="Clear selection">✕</button>
                </div>
                
                <!-- Autocomplete Dropdown List -->
                <div id="sub-member-search-dropdown" class="search-results-dropdown">
                  <!-- Rendered dynamically -->
                </div>
              </div>

              <!-- Standard Dropdown (Kept in sync) -->
              <div style="margin-top:6px;">
                <select id="sub-member" required style="width:100%; font-size:0.85rem; padding:6px 8px;">
                  <option value="">Or choose from dropdown list...</option>
                  ${SubscriptionsView.members.map(m => `
                    <option value="${m.id}" data-admission-paid="${m.admission_fee_paid || 0}">${m.fullname} (${m.member_code} - ${m.status})</option>
                  `).join('')}
                </select>
              </div>

              <!-- Admission Fee Status & Toggle -->
              <div id="sub-admission-box" style="display:none; margin-top:8px; padding:10px 12px; border-radius:var(--radius-sm); border:1px solid var(--color-border); background:rgba(0,0,0,0.12);">
                <div id="sub-admission-badge" style="font-size:0.85rem; margin-bottom: 6px;"></div>
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.85rem; margin:0;">
                  <input type="checkbox" id="sub-admission-paid-chk" style="width:16px; height:16px;">
                  <span><strong>Admission Fee Already Paid</strong> (Reduce ₹1,500 from Admission Plan)</span>
                </label>
              </div>
            </div>

            <!-- Membership Plan Selection -->
            <div class="form-group">
              <label for="sub-plan">Select Membership Plan *</label>
              <select id="sub-plan" required>
                <option value="">Choose Plan...</option>
                ${SubscriptionsView.plans.filter(p => p.status === 'Active').map(p => {
                  const isAdm = p.id === 1 || p.name.toLowerCase().includes('admission') || p.price === 2500;
                  return `
                    <option value="${p.id}" data-amount="${p.final_amount}" data-is-admission="${isAdm ? 'true' : 'false'}">${p.name} - ${currencySymbol}${p.final_amount} (${p.duration_months} mo)</option>
                  `;
                }).join('')}
              </select>
            </div>

            <!-- Start Date with Date Picker & Presets -->
            <div class="form-row">
              <div class="form-group">
                <label for="sub-start-date">Subscription Start Date *</label>
                <div style="display:flex; gap:6px; align-items:center;">
                  <input type="date" id="sub-start-date" required class="date-input-field" style="flex:1;" value="${new Date().toISOString().split('T')[0]}">
                  <button type="button" class="date-preset-pill" id="sub-date-today" style="white-space:nowrap;">Today</button>
                </div>
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
                <label for="sub-discount-type">Additional Discount Type</label>
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

            <!-- Price Breakdown with Admission Fee Deduction -->
            <div class="price-breakdown-card mb-md" style="background: rgba(0,0,0,0.15); border:1px solid var(--color-border); border-radius:var(--radius-sm); padding:var(--spacing-md); display:none;" id="sub-price-breakdown">
              <div class="flex justify-between align-center mb-sm">
                <span style="color:var(--color-text-muted);">Standard Plan Price:</span>
                <span id="breakdown-base-amount" style="font-weight:600;">₹0.00</span>
              </div>
              <div class="flex justify-between align-center mb-sm" id="breakdown-admission-row" style="display:none !important;">
                <span style="color:var(--color-success); font-weight:600;">Admission Fee Paid (Waiver):</span>
                <span id="breakdown-admission-val" style="color:var(--color-success); font-weight:600;">-₹1,500</span>
              </div>
              <div class="flex justify-between align-center mb-sm" id="breakdown-discount-row" style="display:none !important;">
                <span style="color:var(--color-warning);">Additional Discount:</span>
                <span id="breakdown-discount-val" style="color:var(--color-warning); font-weight:600;">-₹0.00</span>
              </div>
              <div class="flex justify-between align-center" style="border-top:1px solid var(--color-border); padding-top:8px; margin-top:4px;">
                <span style="font-weight:700;">Final Payable:</span>
                <strong style="color:var(--color-success); font-size:1.25rem;" id="breakdown-amount">₹0.00</strong>
              </div>
            </div>

            <button type="submit" class="btn btn-primary btn-block">Activate Subscription</button>
          </form>
        </div>

      </div>
    `;

    SubscriptionsView.bindEvents();
    SubscriptionsView.renderFilteredTable();
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

  renderFilteredTable: () => {
    const tbody = document.getElementById('subscriptions-list-body');
    const countBadge = document.getElementById('sub-count-badge');
    if (!tbody) return;

    const currencySymbol = '₹';
    const sQuery = SubscriptionsView.filters.search.toLowerCase().trim();
    const statusFilter = SubscriptionsView.filters.status;
    const dateFrom = SubscriptionsView.filters.dateFrom;
    const dateTo = SubscriptionsView.filters.dateTo;

    const filtered = SubscriptionsView.subscriptions.filter(s => {
      // 1. Text Search match
      if (sQuery) {
        const mName = (s.member_name || '').toLowerCase();
        const mCode = (s.member_code || '').toLowerCase();
        const pName = (s.plan_name || '').toLowerCase();
        if (!mName.includes(sQuery) && !mCode.includes(sQuery) && !pName.includes(sQuery)) {
          return false;
        }
      }

      // 2. Status match
      if (statusFilter === 'Active' && s.status !== 'Active') return false;
      if (statusFilter === 'Frozen' && s.status !== 'Frozen') return false;
      if (statusFilter === 'Expired' && s.status !== 'Expired' && s.days_remaining >= 0) return false;
      if (statusFilter === 'Expiring' && (s.days_remaining < 0 || s.days_remaining > 7 || s.status === 'Frozen')) return false;

      // 3. Expiry Date Range match
      if (dateFrom && s.expiry_date && s.expiry_date < dateFrom) return false;
      if (dateTo && s.expiry_date && s.expiry_date > dateTo) return false;

      return true;
    });

    if (countBadge) {
      countBadge.textContent = `${filtered.length} of ${SubscriptionsView.subscriptions.length} Subscriptions`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-lg text-muted">No subscriptions found matching the selected filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(s => {
      let badgeClass = 'status-active';
      let statusText = 'Active';
      let daysRemainingText = `${Math.ceil(s.days_remaining)} days left`;
      
      if (s.status === 'Frozen') {
        badgeClass = 'status-frozen';
        statusText = 'Frozen';
        daysRemainingText = 'Frozen';
      } else if (s.days_remaining < 0) {
        badgeClass = 'status-expired';
        statusText = 'Expired';
        daysRemainingText = 'Expired';
      } else if (s.days_remaining <= 7) {
        badgeClass = 'status-frozen'; // Orange expiring soon badge
        statusText = 'Expiring Soon';
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
            <div style="font-size:0.75rem; color:var(--color-text-muted);">${currencySymbol}${s.final_amount} | Exp: ${s.expiry_date || 'N/A'}</div>
          </td>
          <td>
            <span class="text-sm font-semibold">${daysRemainingText}</span>
          </td>
          <td>
            <span class="status-badge ${badgeClass}">${statusText}</span>
          </td>
          <td>
            <div class="flex gap-xs" style="display:flex; gap:4px; align-items:center;">
              <button class="btn btn-success btn-sm btn-wa-sub" data-id="${s.id}" data-member-id="${s.member_id}" data-member-name="${s.member_name}" title="Send WhatsApp Message / Receipt"><i data-lucide="message-square" style="width:12px;height:12px;"></i></button>
              ${s.status !== 'Frozen' ? `
                <button class="btn btn-secondary btn-sm btn-freeze" data-id="${s.id}" title="Freeze Subscription"><i data-lucide="snowflake" style="width:12px;height:12px;"></i></button>
              ` : `
                <button class="btn btn-primary btn-sm btn-resume" data-id="${s.id}" title="Resume Subscription" style="padding:4px 8px;"><i data-lucide="play" style="width:12px;height:12px;"></i></button>
              `}
              <button class="btn btn-danger btn-sm btn-delete-sub" data-id="${s.id}" data-member-name="${s.member_name}" title="Erase Subscription Dates (Keeps Member Active)"><i data-lucide="trash-2" style="width:12px;height:12px;"></i> Erase Dates</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    SubscriptionsView.bindActionButtons();
    lucide.createIcons();
  },
  
  bindEvents: () => {
    const form = document.getElementById('purchase-subscription-form');
    const memberSelect = document.getElementById('sub-member');
    const memberSearchInput = document.getElementById('sub-member-search-input');
    const memberSearchClear = document.getElementById('sub-member-search-clear');
    const memberSearchDropdown = document.getElementById('sub-member-search-dropdown');
    
    const planSelect = document.getElementById('sub-plan');
    const startDateInput = document.getElementById('sub-start-date');
    const dateTodayBtn = document.getElementById('sub-date-today');
    
    const admissionBox = document.getElementById('sub-admission-box');
    const admissionBadge = document.getElementById('sub-admission-badge');
    const admissionPaidChk = document.getElementById('sub-admission-paid-chk');
    
    const breakdownCard = document.getElementById('sub-price-breakdown');
    const breakdownAmount = document.getElementById('breakdown-amount');
    const breakdownBase = document.getElementById('breakdown-base-amount');
    const breakdownAdmissionRow = document.getElementById('breakdown-admission-row');
    const breakdownDiscountRow = document.getElementById('breakdown-discount-row');
    const breakdownDiscountVal = document.getElementById('breakdown-discount-val');
    const discountTypeEl = document.getElementById('sub-discount-type');
    const discountValueEl = document.getElementById('sub-discount-value');

    // ----------------------------------------------------
    // SEARCHABLE MEMBER AUTOCOMPLETE LOGIC
    // ----------------------------------------------------
    function renderMemberSearchResults(query = '') {
      const q = query.toLowerCase().trim();
      const filteredMembers = SubscriptionsView.members.filter(m => {
        if (!q) return true;
        const name = (m.fullname || '').toLowerCase();
        const code = (m.member_code || '').toLowerCase();
        const phone = (m.mobile || '').toLowerCase();
        return name.includes(q) || code.includes(q) || phone.includes(q);
      }).slice(0, 10); // Show top 10 matches

      if (filteredMembers.length === 0) {
        memberSearchDropdown.innerHTML = `<div style="padding:12px; text-align:center; font-size:0.85rem; color:var(--color-text-muted);">No matching fighters found for "${query}".</div>`;
        memberSearchDropdown.style.display = 'block';
        return;
      }

      memberSearchDropdown.innerHTML = filteredMembers.map(m => {
        const isAdmPaid = m.admission_fee_paid === 1;
        const initials = (m.fullname || 'FC').substring(0, 2).toUpperCase();
        return `
          <div class="search-result-item" data-id="${m.id}">
            <div class="search-result-avatar" ${m.photo_path ? `style="background-image:url(${m.photo_path}); color:transparent;"` : ''}>${m.photo_path ? '' : initials}</div>
            <div class="search-result-info">
              <div class="search-result-name">${m.fullname}</div>
              <div class="search-result-meta">
                <span><strong>${m.member_code}</strong></span>
                <span>📞 ${m.mobile || 'No Phone'}</span>
              </div>
            </div>
            <div class="search-result-status">
              <span class="badge" style="font-size:0.68rem; background:${isAdmPaid ? 'rgba(34,197,94,0.15)' : 'rgba(234,179,8,0.15)'}; color:${isAdmPaid ? 'var(--color-success)' : 'var(--color-warning)'}; border:1px solid ${isAdmPaid ? 'rgba(34,197,94,0.3)' : 'rgba(234,179,8,0.3)'};">
                ${isAdmPaid ? 'Admission Paid' : 'Admission Due'}
              </span>
            </div>
          </div>
        `;
      }).join('');

      memberSearchDropdown.style.display = 'block';

      // Click to select
      memberSearchDropdown.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
          const id = item.getAttribute('data-id');
          selectMemberById(id);
          memberSearchDropdown.style.display = 'none';
        });
      });
    }

    function selectMemberById(id) {
      const member = SubscriptionsView.members.find(m => m.id == id);
      if (!member) return;

      memberSelect.value = member.id;
      memberSearchInput.value = `${member.fullname} (${member.member_code})`;
      memberSearchClear.style.display = 'block';
      
      updateMemberAdmissionStatus();
    }

    memberSearchInput.addEventListener('focus', () => {
      renderMemberSearchResults(memberSearchInput.value);
    });

    memberSearchInput.addEventListener('input', () => {
      const val = memberSearchInput.value;
      memberSearchClear.style.display = val ? 'block' : 'none';
      renderMemberSearchResults(val);
    });

    memberSearchClear.addEventListener('click', () => {
      memberSearchInput.value = '';
      memberSelect.value = '';
      memberSearchClear.style.display = 'none';
      memberSearchDropdown.style.display = 'none';
      updateMemberAdmissionStatus();
    });

    // Close search dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.searchable-select-wrap')) {
        memberSearchDropdown.style.display = 'none';
      }
    });

    // Sync from standard select dropdown
    memberSelect.addEventListener('change', () => {
      const selectedOpt = memberSelect.options[memberSelect.selectedIndex];
      if (selectedOpt && selectedOpt.value) {
        memberSearchInput.value = selectedOpt.text;
        memberSearchClear.style.display = 'block';
      } else {
        memberSearchInput.value = '';
        memberSearchClear.style.display = 'none';
      }
      updateMemberAdmissionStatus();
    });

    // Quick Date Today Preset
    if (dateTodayBtn) {
      dateTodayBtn.addEventListener('click', () => {
        startDateInput.value = new Date().toISOString().split('T')[0];
      });
    }

    // Helper: update member admission fee status
    function updateMemberAdmissionStatus() {
      const selectedMemberOpt = memberSelect.options[memberSelect.selectedIndex];
      if (!selectedMemberOpt || !selectedMemberOpt.value) {
        admissionBox.style.display = 'none';
        admissionPaidChk.checked = false;
        recalcPrice();
        return;
      }

      const isPaid = selectedMemberOpt.getAttribute('data-admission-paid') === '1';
      admissionBox.style.display = 'block';
      admissionPaidChk.checked = isPaid;

      if (isPaid) {
        admissionBadge.innerHTML = `<span style="color:var(--color-success); font-weight:600;">✓ Admission Fee (₹1,500) Already Paid</span>`;
      } else {
        admissionBadge.innerHTML = `<span style="color:var(--color-warning); font-weight:600;">⚠️ Admission Fee (₹1,500) Not Paid Yet (Applicable for new registration)</span>`;
      }
      recalcPrice();
    }

    // Helper: recalculate price with admission waiver and discounts
    function recalcPrice() {
      const selectedOption = planSelect.options[planSelect.selectedIndex];
      const baseAmount = parseFloat(selectedOption?.getAttribute('data-amount') || 0);
      if (!baseAmount) { breakdownCard.style.display = 'none'; return; }

      const isAdmissionPlan = selectedOption.getAttribute('data-is-admission') === 'true' || selectedOption.text.toLowerCase().includes('admission') || baseAmount === 2500;
      const isAdmissionPaid = admissionPaidChk.checked;

      let admissionDeduction = 0;
      if (isAdmissionPlan && isAdmissionPaid) {
        admissionDeduction = 1500;
        breakdownAdmissionRow.style.setProperty('display', 'flex', 'important');
      } else {
        breakdownAdmissionRow.style.setProperty('display', 'none', 'important');
      }

      const netBaseAmount = Math.max(0, baseAmount - admissionDeduction);

      const discType = discountTypeEl.value;
      const discVal = parseFloat(discountValueEl.value) || 0;
      let discountAmt = discType === 'percent'
        ? Math.min((netBaseAmount * discVal) / 100, netBaseAmount)
        : Math.min(discVal, netBaseAmount);
      discountAmt = Math.round(discountAmt * 100) / 100;
      const finalAmt = Math.max(0, netBaseAmount - discountAmt);

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

    // Subscriptions Table Filter Event Listeners
    const tableSearchInput = document.getElementById('sub-table-search');
    const tableStatusSelect = document.getElementById('sub-table-status');
    const dateFromInput = document.getElementById('sub-filter-date-from');
    const dateToInput = document.getElementById('sub-filter-date-to');
    
    if (tableSearchInput) {
      tableSearchInput.addEventListener('input', (e) => {
        SubscriptionsView.filters.search = e.target.value;
        SubscriptionsView.renderFilteredTable();
      });
    }

    if (tableStatusSelect) {
      tableStatusSelect.addEventListener('change', (e) => {
        SubscriptionsView.filters.status = e.target.value;
        SubscriptionsView.renderFilteredTable();
      });
    }

    if (dateFromInput) {
      dateFromInput.addEventListener('change', (e) => {
        SubscriptionsView.filters.dateFrom = e.target.value;
        SubscriptionsView.renderFilteredTable();
      });
    }

    if (dateToInput) {
      dateToInput.addEventListener('change', (e) => {
        SubscriptionsView.filters.dateTo = e.target.value;
        SubscriptionsView.renderFilteredTable();
      });
    }

    // Date presets
    const presetAllBtn = document.getElementById('sub-preset-all');
    const presetExp30Btn = document.getElementById('sub-preset-exp-30');
    const presetClearBtn = document.getElementById('sub-preset-clear');

    if (presetAllBtn) {
      presetAllBtn.addEventListener('click', () => {
        SubscriptionsView.filters.dateFrom = '';
        SubscriptionsView.filters.dateTo = '';
        SubscriptionsView.filters.status = '';
        if (dateFromInput) dateFromInput.value = '';
        if (dateToInput) dateToInput.value = '';
        if (tableStatusSelect) tableStatusSelect.value = '';
        SubscriptionsView.renderFilteredTable();
      });
    }

    if (presetExp30Btn) {
      presetExp30Btn.addEventListener('click', () => {
        const today = new Date();
        const next30 = new Date();
        next30.setDate(today.getDate() + 30);
        const fromStr = today.toISOString().split('T')[0];
        const toStr = next30.toISOString().split('T')[0];

        SubscriptionsView.filters.dateFrom = fromStr;
        SubscriptionsView.filters.dateTo = toStr;
        if (dateFromInput) dateFromInput.value = fromStr;
        if (dateToInput) dateToInput.value = toStr;
        SubscriptionsView.renderFilteredTable();
      });
    }

    if (presetClearBtn) {
      presetClearBtn.addEventListener('click', () => {
        SubscriptionsView.filters.dateFrom = '';
        SubscriptionsView.filters.dateTo = '';
        if (dateFromInput) dateFromInput.value = '';
        if (dateToInput) dateToInput.value = '';
        SubscriptionsView.renderFilteredTable();
      });
    }

    // Price calculation listeners
    admissionPaidChk.addEventListener('change', recalcPrice);
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
        discount_value: discountRaw,
        admission_fee_already_paid: admissionPaidChk.checked
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
  },

  bindActionButtons: () => {
    // Action buttons: WhatsApp
    document.querySelectorAll('.btn-wa-sub').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        const memberId = btn.getAttribute('data-member-id');
        const memberName = btn.getAttribute('data-member-name');
        
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

    // Action buttons: Delete / Erase Subscription Dates (Keeps member active)
    document.querySelectorAll('.btn-delete-sub').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        const memberName = btn.getAttribute('data-member-name') || 'this member';
        
        showConfirm(
          'Erase Subscription Dates',
          `Are you sure you want to erase subscription dates for ${memberName}? This will clear the start and expiry dates from the system. The fighter's membership profile will remain 100% active.`,
          async () => {
            try {
              const response = await api.delete(`/api/subscriptions/${id}`);
              showToast(response.message, 'success');
              const container = document.getElementById('view-container');
              await SubscriptionsView.render(container);
            } catch (e) {
              showToast(e.message, 'error');
            }
          },
          'Erase Dates',
          'btn-danger'
        );
      });
    });
  }
};

export default SubscriptionsView;

