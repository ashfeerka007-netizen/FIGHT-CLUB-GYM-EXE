// Financial Reports & Analytics View for Fight Club Gym
import api from '../api.js';
import { showToast } from '../utils.js';

const ReportsView = {
  data: null,
  
  render: async (container) => {
    await ReportsView.fetchData();
    
    const currencySymbol = '₹';
    
    // Sum collections and expenses
    const totalRev = ReportsView.data.collections.reduce((sum, item) => sum + item.total, 0);
    const totalExp = ReportsView.data.expenses.reduce((sum, item) => sum + item.total, 0);
    const netProfit = totalRev - totalExp;
    const estTax = totalRev * 0.18; // 18% standard GST tax estimate
    
    container.innerHTML = `
      <div class="reports-view-container">
        
        <!-- Financial Summary Cards -->
        <div class="kpi-grid">
          
          <div class="card kpi-card glass-card">
            <div class="kpi-info">
              <h3>Total Collections</h3>
              <div class="value" style="color:var(--color-success);">${currencySymbol}${totalRev.toLocaleString()}</div>
              <span class="text-sm text-muted">All time revenue</span>
            </div>
            <div class="kpi-icon" style="background: rgba(76, 175, 80, 0.12); color: var(--color-success);">
              <i data-lucide="arrow-up-circle"></i>
            </div>
          </div>

          <div class="card kpi-card glass-card">
            <div class="kpi-info">
              <h3>Total Expenses</h3>
              <div class="value" style="color:var(--color-error);">${currencySymbol}${totalExp.toLocaleString()}</div>
              <span class="text-sm text-muted">Salaries & Overheads</span>
            </div>
            <div class="kpi-icon" style="background: rgba(244, 67, 54, 0.12); color: var(--color-error);">
              <i data-lucide="arrow-down-circle"></i>
            </div>
          </div>

          <div class="card kpi-card glass-card">
            <div class="kpi-info">
              <h3>Net Profit / Loss</h3>
              <div class="value" style="color: ${netProfit >= 0 ? 'var(--color-success)' : 'var(--color-error)'}">
                ${netProfit >= 0 ? '+' : ''}${currencySymbol}${netProfit.toLocaleString()}
              </div>
              <span class="text-sm text-muted">Profit margins</span>
            </div>
            <div class="kpi-icon" style="background: rgba(33, 150, 243, 0.12); color: var(--color-info);">
              <i data-lucide="percent"></i>
            </div>
          </div>

          <div class="card kpi-card glass-card">
            <div class="kpi-info">
              <h3>Estimated GST Liability</h3>
              <div class="value">${currencySymbol}${estTax.toLocaleString()}</div>
              <span class="text-sm text-muted">Estimated at 18% standard GST</span>
            </div>
            <div class="kpi-icon" style="background: rgba(255, 215, 0, 0.12); color: var(--color-accent);">
              <i data-lucide="briefcase"></i>
            </div>
          </div>

        </div>

        <!-- Detailed Breakdown Grids -->
        <div class="grid-2 mt-lg">
          
          <!-- Category Wise Overhead Expenses -->
          <div class="card glass-card">
            <h3 class="mb-md" style="font-size:1.1rem; font-weight:700;">Overhead Expenses by Category</h3>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Total Spent</th>
                  </tr>
                </thead>
                <tbody>
                  ${ReportsView.data.expensesByCategory.length === 0 ? `
                    <tr><td colspan="2" class="text-center text-muted">No expenses recorded.</td></tr>
                  ` : ReportsView.data.expensesByCategory.map(item => `
                    <tr>
                      <td><strong>${item.category}</strong></td>
                      <td style="color:var(--color-error); font-weight:600;">${currencySymbol}${item.total.toLocaleString()}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Membership Revenue Split up -->
          <div class="card glass-card">
            <h3 class="mb-md" style="font-size:1.1rem; font-weight:700;">Collections by Membership Plan</h3>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Plan Name</th>
                    <th>Plan Class</th>
                    <th>Total Received</th>
                  </tr>
                </thead>
                <tbody>
                  ${ReportsView.data.revenueByPlan.length === 0 ? `
                    <tr><td colspan="3" class="text-center text-muted">No plan collections recorded.</td></tr>
                  ` : ReportsView.data.revenueByPlan.map(item => `
                    <tr>
                      <td><strong>${item.plan_name}</strong></td>
                      <td><span class="badge" style="background-color: var(--color-border);">${item.category}</span></td>
                      <td style="color:var(--color-success); font-weight:600;">${currencySymbol}${item.total.toLocaleString()}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        <!-- Export Center -->
        <div class="card glass-card mt-lg text-center" style="padding: var(--spacing-xl);">
          <h3 class="mb-sm" style="font-size:1.2rem; font-weight:700;">Business Report Center</h3>
          <p class="text-sm text-muted mb-lg" style="max-width:500px; margin-left:auto; margin-right:auto;">
            Generate complete consolidated spreadsheet reports containing registrations, transaction ledgers, active passes, and expense details.
          </p>
          <div class="flex gap-md justify-center">
            <button class="btn btn-primary" id="btn-export-financials-csv"><i data-lucide="file-spreadsheet"></i> Export Ledger CSV</button>
            <button class="btn btn-secondary" onclick="window.print()"><i data-lucide="printer"></i> Print Audit Report</button>
          </div>
        </div>

      </div>
    `;

    ReportsView.bindEvents();
    lucide.createIcons();
  },
  
  fetchData: async () => {
    try {
      ReportsView.data = await api.get('/api/reports/financials');
    } catch (e) {
      showToast('Error loading financial reports: ' + e.message, 'error');
    }
  },
  
  bindEvents: () => {
    // Export Consolidated Ledger
    const exportBtn = document.getElementById('btn-export-financials-csv');
    exportBtn.addEventListener('click', () => {
      const currencySymbol = '₹';
      const headers = ['Financial Summary', 'Total Collections', 'Total Expenses', 'Net Profit'];
      const summaryRev = ReportsView.data.collections.reduce((sum, item) => sum + item.total, 0);
      const summaryExp = ReportsView.data.expenses.reduce((sum, item) => sum + item.total, 0);
      const profit = summaryRev - summaryExp;
      
      const rows = [
        ['Report Period: All Time Ledger', summaryRev, summaryExp, profit],
        [],
        ['Expenses By Category'],
        ...ReportsView.data.expensesByCategory.map(item => [item.category, item.total]),
        [],
        ['Collections By Membership Plan'],
        ...ReportsView.data.revenueByPlan.map(item => [item.plan_name, item.category, item.total])
      ];
      
      let csvContent = "data:text/csv;charset=utf-8," 
        + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `fightclub_financial_report_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast('Consolidated ledger exported.', 'success');
    });
  }
};

export default ReportsView;
