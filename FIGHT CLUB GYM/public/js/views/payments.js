// Payments & Invoicing View for Fight Club Gym
import api from '../api.js';
import { showToast, showConfirm } from '../utils.js';

const PaymentsView = {
  payments: [],
  
  render: async (container) => {
    await PaymentsView.fetchPayments();
    
    const currencySymbol = '₹';
    
    container.innerHTML = `
      <div class="payments-view-container">
        
        <!-- Table Header and Action Area -->
        <div class="table-header-actions">
          <div class="table-filters">
            <input type="text" id="search-payments" placeholder="Search invoice, member code, name...">
          </div>
          <div class="flex gap-sm">
            <span class="text-sm text-muted">Showing all historical transactions</span>
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
              ${PaymentsView.payments.length === 0 ? `
                <tr><td colspan="9" class="text-center">No payment history recorded.</td></tr>
              ` : PaymentsView.payments.map(p => `
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
                      <button class="btn btn-secondary btn-sm btn-edit-payment" data-id="${p.id}"><i data-lucide="edit-2" style="width:12px;height:12px;"></i> Edit</button>
                      <button class="btn btn-danger btn-sm btn-delete-payment" data-id="${p.id}"><i data-lucide="trash-2" style="width:12px;height:12px;"></i> Remove</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
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
    `;

    PaymentsView.bindEvents();
    lucide.createIcons();
  },
  
  fetchPayments: async () => {
    try {
      PaymentsView.payments = await api.get('/api/payments');
    } catch (e) {
      showToast('Error loading payments: ' + e.message, 'error');
    }
  },
  
  bindEvents: () => {
    // Search filter
    const searchInput = document.getElementById('search-payments');
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      const rows = document.querySelectorAll('#payments-list-body tr');
      
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        if (text.includes(query)) {
          row.classList.remove('hidden');
        } else {
          row.classList.add('hidden');
        }
      });
    });
    
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
    
    document.getElementById('invoice-detail-modal').classList.remove('hidden');
    lucide.createIcons();
  }
};

export default PaymentsView;
