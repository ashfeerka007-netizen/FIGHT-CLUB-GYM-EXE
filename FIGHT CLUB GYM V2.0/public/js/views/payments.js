// Payments & Invoicing View for Fight Club Gym
import api from '../api.js';
import { showToast, showConfirm, openWhatsAppWeb, parseCSV, downloadCSV } from '../utils.js';

const PaymentsView = {
  payments: [],
  
  render: async (container) => {
    await PaymentsView.fetchPayments();
    
    const currencySymbol = '₹';
    
    container.innerHTML = `
      <div class="payments-view-container">
        
        <!-- Table Header and Action Area -->
        <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:15px;">
          <div class="table-header-actions" style="margin-bottom:0;">
            <div class="table-filters" style="flex:1; display:flex; gap:8px; flex-wrap:wrap;">
              <input type="text" id="search-payments" placeholder="🔍 Search invoice, member, code, method..." value="${PaymentsView.filters?.search || ''}" style="flex:1; min-width:200px;">
              <select id="filter-payment-method" style="width:140px; padding:7px 10px; border-radius:var(--radius-sm); border:1px solid var(--color-border); background:var(--color-bg-card); font-size:0.85rem;">
                <option value="">All Methods</option>
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Card">Card</option>
                <option value="Bank Transfer">Bank Transfer</option>
              </select>
            </div>
            <div class="flex gap-sm">
              <button class="btn btn-secondary" id="btn-export-payments-csv"><i data-lucide="download"></i> Export CSV</button>
              <button class="btn btn-secondary" id="btn-import-payments-csv"><i data-lucide="upload"></i> Import CSV</button>
            </div>
          </div>

          <!-- Date Filter Bar for Payments -->
          <div class="date-filter-bar" style="justify-content:space-between;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span style="font-size:0.8rem; color:var(--color-text-muted); font-weight:600;"><i data-lucide="calendar" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Payment Date Range:</span>
              <input type="date" id="payments-date-from" class="date-input-field" title="From Date" value="${PaymentsView.filters?.dateFrom || ''}">
              <span style="font-size:0.8rem; color:var(--color-text-muted);">to</span>
              <input type="date" id="payments-date-to" class="date-input-field" title="To Date" value="${PaymentsView.filters?.dateTo || ''}">
              
              <button type="button" class="date-preset-pill" id="pay-preset-all">All Time</button>
              <button type="button" class="date-preset-pill" id="pay-preset-today">Today</button>
              <button type="button" class="date-preset-pill" id="pay-preset-week">This Week</button>
              <button type="button" class="date-preset-pill" id="pay-preset-month">This Month</button>
              <button type="button" class="date-preset-pill" id="pay-preset-clear" title="Clear Date Filter"><i data-lucide="x" style="width:11px;height:11px;"></i> Clear</button>
            </div>
            <div id="payments-summary-metric" style="font-size:0.85rem; font-weight:700; color:var(--color-success); padding-right:6px;">
              <!-- Rendered dynamically -->
            </div>
          </div>
        </div>

        <!-- Payments Table -->
        <div class="table-container">
          <table id="payments-table">
            <thead>
              <tr>
                <th>Invoice Number</th>
                <th>Member</th>
                <th>Transaction Date</th>
                <th>Base Amount</th>
                <th>Discount</th>
                <th>GST / Tax</th>
                <th>Final Paid</th>
                <th>Method</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="payments-list-body">
              <!-- Rendered dynamically -->
            </tbody>
          </table>
        </div>
      </div>

      <!-- Invoice Modal Drawer -->
      <div id="invoice-detail-modal" class="modal-overlay hidden">
        <div class="modal-card" style="max-width: 650px;">
          <div class="modal-header">
            <h2>Fight Club Gym Invoice</h2>
            <button class="btn-close-modal"><i data-lucide="x"></i></button>
          </div>
          <div class="modal-body" id="invoice-modal-content">
            <!-- Rendered dynamically -->
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary btn-close-modal">Close</button>
            <button class="btn btn-success" id="btn-wa-modal-receipt" data-id=""><i data-lucide="message-square"></i> Send WhatsApp Receipt</button>
            <button class="btn btn-primary" id="btn-print-receipt"><i data-lucide="printer"></i> Print / Save PDF</button>
          </div>
        </div>
      </div>

      <!-- Edit Payment Modal -->
      <div id="edit-payment-modal" class="modal-overlay hidden">
        <div class="modal-card" style="max-width: 450px;">
          <div class="modal-header">
            <h2>Edit Payment Record</h2>
            <button class="btn-close-edit-modal"><i data-lucide="x"></i></button>
          </div>
          <form id="edit-payment-form">
            <input type="hidden" id="edit-payment-id">
            <div class="modal-body" style="display:flex; flex-direction:column; gap: var(--spacing-md); max-height: 480px; overflow-y: auto; padding-right: 5px;">
              <div class="form-group">
                <label for="edit-payment-invoice">Invoice Number</label>
                <input type="text" id="edit-payment-invoice" readonly disabled style="opacity: 0.6; background: var(--color-bg-card);">
              </div>
              <div class="form-group">
                <label for="edit-payment-date">Payment Date *</label>
                <input type="date" id="edit-payment-date" required class="form-control" style="width:100%; border:1px solid var(--color-border); padding:8px; border-radius:var(--radius-sm); background:var(--color-bg-card);">
              </div>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:var(--spacing-md);">
                <div class="form-group">
                  <label for="edit-payment-amount">Base Amount (₹) *</label>
                  <input type="number" id="edit-payment-amount" min="0" step="0.01" required style="width:100%; border:1px solid var(--color-border); padding:8px; border-radius:var(--radius-sm); background:var(--color-bg-card);">
                </div>
                <div class="form-group">
                  <label for="edit-payment-discount">Discount (%)</label>
                  <input type="number" id="edit-payment-discount" min="0" max="100" step="0.1" style="width:100%; border:1px solid var(--color-border); padding:8px; border-radius:var(--radius-sm); background:var(--color-bg-card);">
                </div>
              </div>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:var(--spacing-md);">
                <div class="form-group">
                  <label for="edit-payment-tax">GST / Tax (%)</label>
                  <input type="number" id="edit-payment-tax" min="0" max="100" step="0.1" style="width:100%; border:1px solid var(--color-border); padding:8px; border-radius:var(--radius-sm); background:var(--color-bg-card);">
                </div>
                <div class="form-group">
                  <label for="edit-payment-method">Method *</label>
                  <select id="edit-payment-method" required style="width:100%; border:1px solid var(--color-border); padding:8px; border-radius:var(--radius-sm); background:var(--color-bg-card);">
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Card">Card</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>
              </div>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:var(--spacing-md);">
                <div class="form-group">
                  <label for="edit-payment-paid">Final Paid (₹) *</label>
                  <input type="number" id="edit-payment-paid" min="0" step="0.01" required style="width:100%; border:1px solid var(--color-border); padding:8px; border-radius:var(--radius-sm); background:var(--color-bg-card);">
                </div>
                <div class="form-group">
                  <label for="edit-payment-balance">Balance (₹) *</label>
                  <input type="number" id="edit-payment-balance" min="0" step="0.01" required style="width:100%; border:1px solid var(--color-border); padding:8px; border-radius:var(--radius-sm); background:var(--color-bg-card);">
                </div>
              </div>
              <div class="form-group">
                <label for="edit-payment-remarks">Remarks</label>
                <textarea id="edit-payment-remarks" rows="2" style="width:100%; border:1px solid var(--color-border); padding:8px; border-radius:var(--radius-sm); background:var(--color-bg-card);"></textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary btn-close-edit-modal">Cancel</button>
              <button type="submit" class="btn btn-primary">Save Changes</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Payments CSV Import Modal -->
      <div id="payments-import-modal" class="modal-overlay hidden">
        <div class="modal-card" style="max-width: 680px;">
          <div class="modal-header">
            <h2><i data-lucide="upload" style="margin-right:8px;"></i> Import Payments from CSV</h2>
            <button class="btn-close-payments-import-modal"><i data-lucide="x"></i></button>
          </div>
          <div class="modal-body" style="display:flex; flex-direction:column; gap: var(--spacing-md); max-height: 520px; overflow-y: auto;">
            <div style="background: rgba(220,38,38,0.06); border: 2px dashed var(--color-border); border-radius: var(--radius-sm); padding: var(--spacing-lg); text-align: center;">
              <i data-lucide="file-spreadsheet" style="width: 40px; height: 40px; color: var(--color-primary); margin-bottom: 8px;"></i>
              <p style="margin-bottom: 12px; font-size: 0.95rem;">Select or drop a <strong>.CSV</strong> file containing payment transactions.</p>
              <input type="file" id="payments-csv-file" accept=".csv,text/csv" style="display:none;">
              <div class="flex justify-center gap-sm" style="flex-wrap:wrap;">
                <button type="button" class="btn btn-primary" id="btn-browse-payments-csv"><i data-lucide="folder-open"></i> Choose CSV File</button>
                <button type="button" class="btn btn-secondary" id="btn-download-payments-template"><i data-lucide="download"></i> Download CSV Template</button>
              </div>
              <div id="payments-csv-filename" style="margin-top: 10px; font-weight: 600; color: var(--color-primary); display: none;"></div>
            </div>

            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding: 4px 2px;">
              <span style="font-size:0.85rem; color:var(--color-text-muted);">Matches member by Member Code, Phone Number, or Full Name.</span>
              <span id="payments-import-row-count" style="font-size:0.85rem; color:var(--color-text-muted);"></span>
            </div>

            <!-- CSV Preview Section -->
            <div id="payments-import-preview-section" style="display:none;">
              <h4 style="font-size: 0.9rem; font-weight:700; margin-bottom: 6px;">Data Preview (First 5 Rows):</h4>
              <div class="table-container" style="max-height: 180px; overflow-y: auto;">
                <table style="font-size: 0.8rem;">
                  <thead>
                    <tr id="payments-preview-header"></tr>
                  </thead>
                  <tbody id="payments-preview-body"></tbody>
                </table>
              </div>
            </div>

            <!-- Import Status / Results -->
            <div id="payments-import-status" style="display:none; padding: 10px; border-radius: var(--radius-sm); font-size: 0.9rem;"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary btn-close-payments-import-modal">Cancel</button>
            <button type="button" class="btn btn-primary" id="btn-submit-payments-import" disabled><i data-lucide="check"></i> Start Import</button>
          </div>
        </div>
      </div>
    `;

    PaymentsView.renderPaymentsTable();
    PaymentsView.bindEvents();
    lucide.createIcons();
  },
  
  filters: {
    search: '',
    method: '',
    dateFrom: '',
    dateTo: ''
  },

  fetchPayments: async () => {
    try {
      PaymentsView.payments = await api.get('/api/payments');
    } catch (e) {
      showToast('Error loading payments: ' + e.message, 'error');
    }
  },

  renderPaymentsTable: () => {
    const tbody = document.getElementById('payments-list-body');
    const summaryMetric = document.getElementById('payments-summary-metric');
    if (!tbody) return;

    const currencySymbol = '₹';
    const sQuery = (PaymentsView.filters.search || '').toLowerCase().trim();
    const methodFilter = PaymentsView.filters.method;
    const dateFrom = PaymentsView.filters.dateFrom;
    const dateTo = PaymentsView.filters.dateTo;

    const filtered = PaymentsView.payments.filter(p => {
      // 1. Text Search
      if (sQuery) {
        const inv = (p.invoice_number || '').toLowerCase();
        const memName = (p.member_name || '').toLowerCase();
        const memCode = (p.member_code || '').toLowerCase();
        const method = (p.payment_method || '').toLowerCase();
        const remarks = (p.remarks || '').toLowerCase();
        if (!inv.includes(sQuery) && !memName.includes(sQuery) && !memCode.includes(sQuery) && !method.includes(sQuery) && !remarks.includes(sQuery)) {
          return false;
        }
      }

      // 2. Payment Method
      if (methodFilter && p.payment_method !== methodFilter) {
        return false;
      }

      // 3. Date Range
      if (dateFrom && p.payment_date && p.payment_date < dateFrom) {
        return false;
      }
      if (dateTo && p.payment_date && p.payment_date > dateTo) {
        return false;
      }

      return true;
    });

    // Calculate total collection for filtered
    const totalCollected = filtered.reduce((acc, p) => acc + (parseFloat(p.paid_amount) || 0), 0);

    if (summaryMetric) {
      summaryMetric.innerHTML = `<span>Filtered Total: <strong>${currencySymbol}${totalCollected.toLocaleString()}</strong> (${filtered.length} Invoices)</span>`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center py-lg text-muted">No payment records found matching the selected filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(p => `
      <tr>
        <td><strong>${p.invoice_number}</strong></td>
        <td>
          <strong>${p.member_name}</strong>
          <div style="font-size:0.75rem; color:var(--color-text-muted);">${p.member_code}</div>
        </td>
        <td>${p.payment_date}</td>
        <td>${currencySymbol}${p.amount}</td>
        <td>${p.discount}%</td>
        <td>${p.tax}%</td>
        <td style="color:var(--color-success); font-weight:600;">${currencySymbol}${p.paid_amount}</td>
        <td><span class="badge" style="background:var(--color-border);">${p.payment_method}</span></td>
        <td>
          <div class="flex gap-xs" style="display:flex; gap:4px;">
            <button class="btn btn-secondary btn-sm btn-view-invoice" data-id="${p.id}"><i data-lucide="eye" style="width:12px;height:12px;"></i> Pass</button>
            <button class="btn btn-success btn-sm btn-wa-receipt" data-id="${p.id}" title="Send WhatsApp Receipt"><i data-lucide="message-square" style="width:12px;height:12px;"></i> WhatsApp</button>
            <button class="btn btn-secondary btn-sm btn-edit-payment" data-id="${p.id}"><i data-lucide="edit-2" style="width:12px;height:12px;"></i> Edit</button>
            <button class="btn btn-danger btn-sm btn-delete-payment" data-id="${p.id}"><i data-lucide="trash-2" style="width:12px;height:12px;"></i> Remove</button>
          </div>
        </td>
      </tr>
    `).join('');

    PaymentsView.bindActionButtons();
    lucide.createIcons();
  },
  
  bindEvents: () => {
    // Search input
    const searchInput = document.getElementById('search-payments');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        PaymentsView.filters.search = e.target.value;
        PaymentsView.renderPaymentsTable();
      });
    }

    // Method filter
    const methodSelect = document.getElementById('filter-payment-method');
    if (methodSelect) {
      methodSelect.addEventListener('change', (e) => {
        PaymentsView.filters.method = e.target.value;
        PaymentsView.renderPaymentsTable();
      });
    }

    // Date inputs
    const dateFromInput = document.getElementById('payments-date-from');
    const dateToInput = document.getElementById('payments-date-to');
    if (dateFromInput) {
      dateFromInput.addEventListener('change', (e) => {
        PaymentsView.filters.dateFrom = e.target.value;
        PaymentsView.renderPaymentsTable();
      });
    }
    if (dateToInput) {
      dateToInput.addEventListener('change', (e) => {
        PaymentsView.filters.dateTo = e.target.value;
        PaymentsView.renderPaymentsTable();
      });
    }

    // Date presets
    const payPresetAll = document.getElementById('pay-preset-all');
    const payPresetToday = document.getElementById('pay-preset-today');
    const payPresetWeek = document.getElementById('pay-preset-week');
    const payPresetMonth = document.getElementById('pay-preset-month');
    const payPresetClear = document.getElementById('pay-preset-clear');

    if (payPresetAll) {
      payPresetAll.addEventListener('click', () => {
        PaymentsView.filters.dateFrom = '';
        PaymentsView.filters.dateTo = '';
        PaymentsView.filters.method = '';
        if (dateFromInput) dateFromInput.value = '';
        if (dateToInput) dateToInput.value = '';
        if (methodSelect) methodSelect.value = '';
        PaymentsView.renderPaymentsTable();
      });
    }

    if (payPresetToday) {
      payPresetToday.addEventListener('click', () => {
        const todayStr = new Date().toISOString().split('T')[0];
        PaymentsView.filters.dateFrom = todayStr;
        PaymentsView.filters.dateTo = todayStr;
        if (dateFromInput) dateFromInput.value = todayStr;
        if (dateToInput) dateToInput.value = todayStr;
        PaymentsView.renderPaymentsTable();
      });
    }

    if (payPresetWeek) {
      payPresetWeek.addEventListener('click', () => {
        const today = new Date();
        const weekAgo = new Date();
        weekAgo.setDate(today.getDate() - 7);
        const fromStr = weekAgo.toISOString().split('T')[0];
        const toStr = today.toISOString().split('T')[0];
        PaymentsView.filters.dateFrom = fromStr;
        PaymentsView.filters.dateTo = toStr;
        if (dateFromInput) dateFromInput.value = fromStr;
        if (dateToInput) dateToInput.value = toStr;
        PaymentsView.renderPaymentsTable();
      });
    }

    if (payPresetMonth) {
      payPresetMonth.addEventListener('click', () => {
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const fromStr = firstDay.toISOString().split('T')[0];
        const toStr = today.toISOString().split('T')[0];
        PaymentsView.filters.dateFrom = fromStr;
        PaymentsView.filters.dateTo = toStr;
        if (dateFromInput) dateFromInput.value = fromStr;
        if (dateToInput) dateToInput.value = toStr;
        PaymentsView.renderPaymentsTable();
      });
    }

    if (payPresetClear) {
      payPresetClear.addEventListener('click', () => {
        PaymentsView.filters.dateFrom = '';
        PaymentsView.filters.dateTo = '';
        if (dateFromInput) dateFromInput.value = '';
        if (dateToInput) dateToInput.value = '';
        PaymentsView.renderPaymentsTable();
      });
    }

    // ----------------------------------------------------
    // CSV EXPORT (Payments & Payment Status)
    // ----------------------------------------------------
    const exportPaymentsBtn = document.getElementById('btn-export-payments-csv');
    if (exportPaymentsBtn) {
      exportPaymentsBtn.addEventListener('click', () => {
        if (PaymentsView.payments.length === 0) {
          showToast('No payment transactions to export.', 'warning');
          return;
        }

        const headers = [
          'Invoice Number', 'Transaction Date', 'Member Code', 'Member Name',
          'Plan Name', 'Base Amount', 'Discount (%)', 'GST / Tax (%)',
          'Final Paid (INR)', 'Pending Balance (INR)', 'Payment Method', 'Remarks'
        ];

        const rows = PaymentsView.payments.map(p => [
          p.invoice_number || '',
          p.payment_date || '',
          p.member_code || '',
          p.member_name || '',
          p.plan_name || 'General',
          p.amount || 0,
          p.discount || 0,
          p.tax || 0,
          p.paid_amount || 0,
          p.balance || 0,
          p.payment_method || 'Cash',
          p.remarks || ''
        ]);

        const filename = `fightclub_payments_${new Date().toISOString().split('T')[0]}.csv`;
        downloadCSV(filename, headers, rows);
        showToast(`Exported ${rows.length} payment records to ${filename}`, 'success');
      });
    }

    // ----------------------------------------------------
    // CSV IMPORT (Payments & Payment Status)
    // ----------------------------------------------------
    const importModal = document.getElementById('payments-import-modal');
    const importBtn = document.getElementById('btn-import-payments-csv');
    const closeImportBtns = document.querySelectorAll('.btn-close-payments-import-modal');
    const browseFileBtn = document.getElementById('btn-browse-payments-csv');
    const csvFileInput = document.getElementById('payments-csv-file');
    const csvFilenameEl = document.getElementById('payments-csv-filename');
    const previewSection = document.getElementById('payments-import-preview-section');
    const previewHeader = document.getElementById('payments-preview-header');
    const previewBody = document.getElementById('payments-preview-body');
    const rowCountEl = document.getElementById('payments-import-row-count');
    const submitImportBtn = document.getElementById('btn-submit-payments-import');
    const templateBtn = document.getElementById('btn-download-payments-template');
    const importStatusEl = document.getElementById('payments-import-status');

    let parsedPaymentRows = [];

    if (importBtn) {
      importBtn.addEventListener('click', () => {
        parsedPaymentRows = [];
        csvFileInput.value = '';
        csvFilenameEl.style.display = 'none';
        previewSection.style.display = 'none';
        importStatusEl.style.display = 'none';
        rowCountEl.textContent = '';
        submitImportBtn.disabled = true;
        importModal.classList.remove('hidden');
        lucide.createIcons();
      });
    }

    closeImportBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        importModal.classList.add('hidden');
      });
    });

    if (browseFileBtn) {
      browseFileBtn.addEventListener('click', () => {
        csvFileInput.click();
      });
    }

    // Download Sample Template for Payments
    if (templateBtn) {
      templateBtn.addEventListener('click', () => {
        const sampleHeaders = [
          'Member Code', 'Member Name', 'Mobile', 'Payment Date',
          'Invoice Number', 'Plan Name', 'Base Amount', 'Discount',
          'Tax', 'Paid Amount', 'Balance', 'Payment Method', 'Remarks'
        ];
        const sampleRows = [
          [
            'FC-1001', 'Tyler Durden', '9876543210', '2026-03-01',
            'INV-2026-101', 'Pro Boxing Champion', '2500', '0',
            '0', '2500', '0', 'UPI', 'Monthly renewal fee'
          ],
          [
            'FC-1002', 'Robert Paulson', '9876543211', '2026-03-01',
            'INV-2026-102', 'Monthly Fighter', '1500', '10',
            '0', '1350', '0', 'Cash', 'Cash desk payment'
          ]
        ];
        downloadCSV('fightclub_payments_template.csv', sampleHeaders, sampleRows);
        showToast('Downloaded sample payments CSV template.', 'info');
      });
    }

    // File Selection & Parsing
    if (csvFileInput) {
      csvFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        csvFilenameEl.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        csvFilenameEl.style.display = 'block';

        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const csvText = event.target.result;
            const { headers, rows } = parseCSV(csvText);

            if (rows.length === 0) {
              showToast('The selected CSV file appears to be empty.', 'warning');
              submitImportBtn.disabled = true;
              return;
            }

            parsedPaymentRows = rows;
            rowCountEl.textContent = `Total transactions detected: ${rows.length}`;

            // Preview (up to 5 rows)
            const displayHeaders = headers.slice(0, 6);
            previewHeader.innerHTML = displayHeaders.map(h => `<th>${h}</th>`).join('');
            previewBody.innerHTML = rows.slice(0, 5).map(r => {
              return `<tr>${displayHeaders.map(h => `<td>${r[h] || '-'}</td>`).join('')}</tr>`;
            }).join('');

            previewSection.style.display = 'block';
            submitImportBtn.disabled = false;
            importStatusEl.style.display = 'none';
          } catch (err) {
            showToast('Failed to parse CSV file: ' + err.message, 'error');
            submitImportBtn.disabled = true;
          }
        };
        reader.readAsText(file);
      });
    }

    // Submit Payments Import
    if (submitImportBtn) {
      submitImportBtn.addEventListener('click', async () => {
        if (parsedPaymentRows.length === 0) return;

        submitImportBtn.disabled = true;
        submitImportBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Importing...';
        lucide.createIcons();

        try {
          const response = await api.post('/api/payments/import-csv', {
            payments: parsedPaymentRows
          });

          importStatusEl.style.display = 'block';
          importStatusEl.style.background = 'rgba(34, 197, 94, 0.15)';
          importStatusEl.style.border = '1px solid var(--color-success)';
          importStatusEl.style.color = 'var(--color-success)';

          let resultMsg = `✓ Successfully imported ${response.imported} of ${response.total} payments!`;
          if (response.errors && response.errors.length > 0) {
            resultMsg += ` (${response.errors.length} could not be matched with existing members)`;
          }
          importStatusEl.textContent = resultMsg;

          showToast(`Payments imported! Added ${response.imported} transactions.`, 'success');

          // Reload table
          const container = document.getElementById('view-container');
          await PaymentsView.render(container);

          setTimeout(() => {
            importModal.classList.add('hidden');
            submitImportBtn.innerHTML = '<i data-lucide="check"></i> Start Import';
            submitImportBtn.disabled = false;
          }, 1500);

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
    }
    
    // View receipt details button click
    document.querySelectorAll('.btn-view-invoice').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const payment = PaymentsView.payments.find(p => p.id == id);
        
        if (payment) {
          PaymentsView.showInvoiceModal(payment);
        }
      });
    });

    // WhatsApp receipt direct send from table row
    document.querySelectorAll('.btn-wa-receipt').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const payment = PaymentsView.payments.find(p => p.id == id);
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" style="width:12px;height:12px;"></i> Sending...';
        if (window.lucide) lucide.createIcons();
        try {
          const res = await api.post(`/api/whatsapp/send-payment-receipt/${id}`);
          const msgText = res.messageBody || '';
          if (payment && payment.member_phone) {
            openWhatsAppWeb({ mobile: payment.member_phone, message: msgText });
          } else {
            openWhatsAppWeb({ mobile: '', message: msgText });
          }
          showToast('Opening WhatsApp App / Web...', 'success');
        } catch (err) {
          showToast('WhatsApp error: ' + err.message, 'error');
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<i data-lucide="message-square" style="width:12px;height:12px;"></i> WhatsApp';
          if (window.lucide) lucide.createIcons();
        }
      });
    });

    // WhatsApp receipt send from modal button
    const modalWaBtn = document.getElementById('btn-wa-modal-receipt');
    if (modalWaBtn) {
      modalWaBtn.addEventListener('click', async () => {
        const id = modalWaBtn.getAttribute('data-id');
        if (!id) return;
        const payment = PaymentsView.payments.find(p => p.id == id);
        modalWaBtn.disabled = true;
        modalWaBtn.innerHTML = '<i data-lucide="loader"></i> Sending...';
        if (window.lucide) lucide.createIcons();
        try {
          const res = await api.post(`/api/whatsapp/send-payment-receipt/${id}`);
          const msgText = res.messageBody || '';
          if (payment && payment.member_phone) {
            openWhatsAppWeb({ mobile: payment.member_phone, message: msgText });
          } else {
            openWhatsAppWeb({ mobile: '', message: msgText });
          }
          showToast('Opening WhatsApp App / Web...', 'success');
        } catch (err) {
          showToast('WhatsApp error: ' + err.message, 'error');
        } finally {
          modalWaBtn.disabled = false;
          modalWaBtn.innerHTML = '<i data-lucide="message-square"></i> Send WhatsApp Receipt';
          if (window.lucide) lucide.createIcons();
        }
      });
    }
    
    // Modal controls
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('invoice-detail-modal').classList.add('hidden');
      });
    });
    
    // Print receipt
    const printBtn = document.getElementById('btn-print-receipt');
    printBtn.addEventListener('click', () => {
      const printContents = document.getElementById('invoice-modal-content').innerHTML;
      const originalContents = document.body.innerHTML;
      
      // Simple overlay print styling
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html>
        <head>
          <title>Invoice - ${new Date().toISOString().split('T')[0]}</title>
          <style>
            body { font-family: 'Plus Jakarta Sans', sans-serif; padding: 40px; color: #111; line-height:1.5; }
            h1 { font-family: 'Outfit', sans-serif; color: #d62828; margin: 0; }
            .flex { display: flex; justify-content: space-between; }
            .invoice-table { width: 100%; border-collapse: collapse; margin: 30px 0; }
            .invoice-table th, .invoice-table td { padding: 12px; border-bottom: 1px solid #ddd; text-align: left; }
            .text-right { text-align: right; }
            .bold { font-weight: bold; }
          </style>
        </head>
        <body>
          ${printContents}
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
    });

    // Delete payment button click
    document.querySelectorAll('.btn-delete-payment').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        const payment = PaymentsView.payments.find(p => p.id == id);
        if (!payment) return;
        
        showConfirm(
          'Delete Payment',
          `Are you sure you want to permanently delete payment receipt ${payment.invoice_number} (₹${payment.paid_amount})?`,
          async () => {
            try {
              const res = await api.delete(`/api/payments/${id}`);
              showToast(res.message, 'success');
              // Re-render the view
              const container = document.getElementById('view-container');
              await PaymentsView.render(container);
            } catch (err) {
              showToast(err.message, 'error');
            }
          }
        );
      });
    });

    // Edit payment button click
    document.querySelectorAll('.btn-edit-payment').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const payment = PaymentsView.payments.find(p => p.id == id);
        
        if (payment) {
          document.getElementById('edit-payment-id').value = payment.id;
          document.getElementById('edit-payment-invoice').value = payment.invoice_number;
          document.getElementById('edit-payment-date').value = payment.payment_date;
          document.getElementById('edit-payment-amount').value = payment.amount;
          document.getElementById('edit-payment-discount').value = payment.discount;
          document.getElementById('edit-payment-tax').value = payment.tax;
          document.getElementById('edit-payment-method').value = payment.payment_method;
          document.getElementById('edit-payment-paid').value = payment.paid_amount;
          document.getElementById('edit-payment-balance').value = payment.balance;
          document.getElementById('edit-payment-remarks').value = payment.remarks || '';
          
          document.getElementById('edit-payment-modal').classList.remove('hidden');
          lucide.createIcons();
        }
      });
    });

    // Close edit modal
    document.querySelectorAll('.btn-close-edit-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('edit-payment-modal').classList.add('hidden');
      });
    });

    // Edit Form Submit
    const editForm = document.getElementById('edit-payment-form');
    if (editForm) {
      editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-payment-id').value;
        const data = {
          payment_date: document.getElementById('edit-payment-date').value,
          amount: parseFloat(document.getElementById('edit-payment-amount').value) || 0,
          discount: parseFloat(document.getElementById('edit-payment-discount').value) || 0,
          tax: parseFloat(document.getElementById('edit-payment-tax').value) || 0,
          paid_amount: parseFloat(document.getElementById('edit-payment-paid').value) || 0,
          balance: parseFloat(document.getElementById('edit-payment-balance').value) || 0,
          payment_method: document.getElementById('edit-payment-method').value,
          remarks: document.getElementById('edit-payment-remarks').value
        };

        try {
          const res = await api.put(`/api/payments/${id}`, data);
          showToast(res.message, 'success');
          document.getElementById('edit-payment-modal').classList.add('hidden');
          const container = document.getElementById('view-container');
          await PaymentsView.render(container);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    // Auto-calculate on edit inputs
    const amountInput = document.getElementById('edit-payment-amount');
    const discountInput = document.getElementById('edit-payment-discount');
    const taxInput = document.getElementById('edit-payment-tax');
    const paidInput = document.getElementById('edit-payment-paid');
    const balanceInput = document.getElementById('edit-payment-balance');
    
    function recalculate() {
      const base = parseFloat(amountInput.value) || 0;
      const disc = parseFloat(discountInput.value) || 0;
      const tax = parseFloat(taxInput.value) || 0;
      
      const discAmount = base * (disc / 100);
      const taxAmount = (base - discAmount) * (tax / 100);
      const finalAmount = base - discAmount + taxAmount;
      
      paidInput.value = finalAmount.toFixed(2);
      balanceInput.value = '0.00';
    }
    
    if (amountInput && discountInput && taxInput) {
      amountInput.addEventListener('input', recalculate);
      discountInput.addEventListener('input', recalculate);
      taxInput.addEventListener('input', recalculate);
    }
  },
  
  showInvoiceModal: (p) => {
    const modalContent = document.getElementById('invoice-modal-content');
    const currencySymbol = '₹';
    const subtotal = p.amount;
    const discountAmount = subtotal * (p.discount / 100);
    const taxAmount = (subtotal - discountAmount) * (p.tax / 100);
    const total = p.paid_amount;
    
    modalContent.innerHTML = `
      <div class="invoice-box" style="padding:10px;">
        <div class="flex justify-between" style="border-bottom: 2px solid var(--color-border); padding-bottom: 20px;">
          <div>
            <h1 style="color:var(--color-primary); font-family:var(--font-secondary); font-weight:800; font-size:1.85rem; letter-spacing:-0.5px;">FIGHT CLUB GYM</h1>
            <p style="font-size:0.8rem; color:var(--color-text-muted);">Train Hard. Fight Smart. Live Strong.</p>
            <p style="font-size:0.75rem; color:var(--color-text-muted); margin-top:5px;">
              Basement Ring Road, Underground Block B<br>
              Phone: +1 (555) 019-9911 | GSTIN: 29AAAAA0000A1Z1
            </p>
          </div>
          <div style="text-align: right;">
            <h2 style="font-family:var(--font-secondary); font-size:1.5rem; font-weight:700;">INVOICE</h2>
            <div style="font-size:0.85rem; margin-top:8px;">
              Invoice No: <strong>${p.invoice_number}</strong><br>
              Date: <strong>${p.payment_date}</strong>
            </div>
          </div>
        </div>

        <div style="margin: 20px 0; font-size:0.875rem;">
          <div class="grid-2">
            <div>
              <span class="text-muted" style="font-size:0.8rem; text-transform:uppercase; display:block; margin-bottom:5px;">Billed To:</span>
              <strong>${p.member_name}</strong><br>
              Member Code: ${p.member_code}<br>
              Phone: ${p.member_phone || 'N/A'}
            </div>
            <div style="text-align: right;">
              <span class="text-muted" style="font-size:0.8rem; text-transform:uppercase; display:block; margin-bottom:5px;">Payment Details:</span>
              Method: <strong>${p.payment_method}</strong><br>
              Status: <span class="badge" style="background:var(--color-success); color:#fff; font-size:0.7rem; padding:2px 6px;">PAID</span>
            </div>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size:0.875rem;">
          <thead>
            <tr style="background: rgba(0,0,0,0.05);">
              <th style="padding:10px; border-bottom:1px solid var(--color-border);">Description</th>
              <th style="padding:10px; border-bottom:1px solid var(--color-border); text-align:right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:15px 10px; border-bottom:1px solid var(--color-border);">
                <strong>${p.plan_name} Membership Plan</strong><br>
                <span class="text-muted text-xs">Gym floor access and program training fees. Remarks: ${p.remarks || 'None'}</span>
              </td>
              <td style="padding:15px 10px; border-bottom:1px solid var(--color-border); text-align:right; font-weight:600;">
                ${currencySymbol}${subtotal.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>

        <div class="flex justify-between" style="margin-top: 20px; font-size:0.875rem;">
          <div style="width: 50%;"></div>
          <div style="width: 45%;">
            <div class="flex" style="padding:4px 0; border-bottom: 1px solid var(--color-border);">
              <span class="text-muted">Plan Base:</span>
              <span>${currencySymbol}${subtotal.toFixed(2)}</span>
            </div>
            <div class="flex" style="padding:4px 0; border-bottom: 1px solid var(--color-border);">
              <span class="text-muted">Discount (${p.discount}%):</span>
              <span>-${currencySymbol}${discountAmount.toFixed(2)}</span>
            </div>
            <div class="flex" style="padding:4px 0; border-bottom: 1px solid var(--color-border);">
              <span class="text-muted">GST / Tax (${p.tax}%):</span>
              <span>+${currencySymbol}${taxAmount.toFixed(2)}</span>
            </div>
            <div class="flex" style="padding:10px 0 0 0; font-size:1.15rem; font-weight:700;">
              <span style="color:var(--color-primary);">Grand Total:</span>
              <span style="color:var(--color-success);">${currencySymbol}${total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div style="margin-top: 40px; border-top: 1px solid var(--color-border); padding-top: 15px; text-align: center; font-size:0.75rem; color:var(--color-text-muted);">
          Thank you for training with us. Break the rules. Fight smart.
        </div>
      </div>
    `;
    
    const modalWaBtn = document.getElementById('btn-wa-modal-receipt');
    if (modalWaBtn) {
      modalWaBtn.setAttribute('data-id', p.id);
    }
    
    document.getElementById('invoice-detail-modal').classList.remove('hidden');
    lucide.createIcons();
  }
};

export default PaymentsView;
