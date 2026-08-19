// Overhead Expenses Tracking View for Fight Club Gym
import api from '../api.js';
import { showToast, showConfirm } from '../utils.js';

const ExpensesView = {
  expenses: [],
  
  render: async (container) => {
    await ExpensesView.fetchExpenses();
    
    const currencySymbol = '₹';
    
    // Calculate total expenses sum
    const totalSpent = ExpensesView.expenses.reduce((sum, exp) => sum + exp.amount, 0);
    
    container.innerHTML = `
      <div class="expenses-layout grid-2">
        
        <!-- Left: Expenses Log List -->
        <div class="card glass-card">
          <div class="flex justify-between align-center mb-md">
            <h3 style="font-size: 1.15rem; font-weight: 700;">Overhead Expenses Log</h3>
            <span class="badge badge-red" style="font-size:0.8rem; padding:4px 8px;">Total Spent: ${currencySymbol}${totalSpent.toLocaleString()}</span>
          </div>

          <div class="table-header-actions" style="margin-bottom:var(--spacing-md);">
            <div class="table-filters w-full">
              <input type="text" id="search-expenses" placeholder="Search vendor or description..." style="width:100%;">
            </div>
          </div>
          
          <div class="table-container" style="max-height:450px; overflow-y:auto;">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Vendor</th>
                  <th>Paid Via</th>
                  <th>Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="expenses-list-body">
                ${ExpensesView.expenses.length === 0 ? `
                  <tr><td colspan="6" class="text-center text-muted">No expenses recorded.</td></tr>
                ` : ExpensesView.expenses.map(e => `
                  <tr class="expense-row">
                    <td>${e.expense_date}</td>
                    <td><strong>${e.category}</strong></td>
                    <td>${e.vendor || '-'}</td>
                    <td><span class="badge" style="background:var(--color-border);">${e.payment_method}</span></td>
                    <td style="color:var(--color-error); font-weight:600;">${currencySymbol}${e.amount.toLocaleString()}</td>
                    <td>
                      <button class="btn btn-danger btn-sm btn-delete-expense" data-id="${e.id}"><i data-lucide="trash-2" style="width:12px;height:12px;"></i></button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Right: Record Expense Form -->
        <div class="card glass-card" style="align-self: start;">
          <h3 class="mb-md" style="font-size: 1.15rem; font-weight: 700;" id="btn-add-expense">Record Business Expense</h3>
          
          <form id="expense-record-form" enctype="multipart/form-data">
            <div class="form-group">
              <label for="exp-date">Expense Date *</label>
              <input type="date" id="exp-date" required value="${new Date().toISOString().split('T')[0]}">
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="exp-category">Category *</label>
                <select id="exp-category" required>
                  <option value="Rent">Rent</option>
                  <option value="Electricity">Electricity</option>
                  <option value="Internet">Internet</option>
                  <option value="Trainer Salary">Trainer Salary</option>
                  <option value="Staff Salary">Staff Salary</option>
                  <option value="Equipment Purchase">Equipment Purchase</option>
                  <option value="Equipment Repair">Equipment Repair</option>
                  <option value="Cleaning">Cleaning</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Marketing">Marketing</option>
                  <option value="Miscellaneous">Miscellaneous</option>
                </select>
              </div>

              <div class="form-group">
                <label for="exp-amount">Amount (INR) *</label>
                <input type="number" id="exp-amount" required min="1" placeholder="5000">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="exp-vendor">Vendor / Recipient</label>
                <input type="text" id="exp-vendor" placeholder="Delaware Corp">
              </div>

              <div class="form-group">
                <label for="exp-paymethod">Payment Method</label>
                <select id="exp-paymethod">
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Card">Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label for="exp-bill">Upload Bill / Receipt File</label>
              <input type="file" id="exp-bill">
            </div>

            <div class="form-group">
              <label for="exp-remarks">Remarks</label>
              <input type="text" id="exp-remarks" placeholder="Description of overhead cost">
            </div>

            <button type="submit" class="btn btn-primary btn-block">Record Expense</button>
          </form>
        </div>

      </div>
    `;

    ExpensesView.bindEvents();
    lucide.createIcons();
  },
  
  fetchExpenses: async () => {
    try {
      ExpensesView.expenses = await api.get('/api/expenses');
    } catch (e) {
      showToast('Error loading expenses: ' + e.message, 'error');
    }
  },
  
  bindEvents: () => {
    const form = document.getElementById('expense-record-form');
    
    // Record expense
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = new FormData();
      formData.append('expense_date', document.getElementById('exp-date').value);
      formData.append('category', document.getElementById('exp-category').value);
      formData.append('amount', parseFloat(document.getElementById('exp-amount').value));
      formData.append('vendor', document.getElementById('exp-vendor').value);
      formData.append('payment_method', document.getElementById('exp-paymethod').value);
      formData.append('remarks', document.getElementById('exp-remarks').value);
      
      const fileInput = document.getElementById('exp-bill').files[0];
      if (fileInput) {
        formData.append('bill', fileInput);
      }
      
      try {
        await api.post('/api/expenses', formData, true);
        showToast('Expense recorded successfully.', 'success');
        
        const container = document.getElementById('view-container');
        await ExpensesView.render(container);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    
    // Delete expense buttons
    document.querySelectorAll('.btn-delete-expense').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        
        showConfirm(
          'Confirm Deletion',
          'Are you sure you want to delete this expense record?',
          async () => {
            try {
              await api.delete(`/api/expenses/${id}`);
              showToast('Expense record deleted.', 'warning');
              
              const container = document.getElementById('view-container');
              await ExpensesView.render(container);
            } catch (e) {
              showToast(e.message, 'error');
            }
          }
        );
      });
    });
    
    // Search filter
    const searchInput = document.getElementById('search-expenses');
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      const rows = document.querySelectorAll('#expenses-list-body tr');
      
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        if (text.includes(query)) {
          row.classList.remove('hidden');
        } else {
          row.classList.add('hidden');
        }
      });
    });
  }
};

export default ExpensesView;
