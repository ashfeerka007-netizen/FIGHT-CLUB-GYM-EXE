// Dashboard View for Fight Club Gym System
import api from '../api.js';

let revChartInstance = null;
let expChartInstance = null;
let currentStats = null;

window.addEventListener('themechanged', () => {
  if (currentStats && document.getElementById('revenueExpensesChart') && document.getElementById('expensesBreakdownChart')) {
    renderCharts(currentStats.collections || [], currentStats.expenses || [], currentStats.expensesByCategory || []);
  }
});

const DashboardView = {
  render: async (container) => {
    try {
      const stats = await api.get('/api/dashboard/stats');
      const { kpis, recentPayments, newMembers, recentRenewals, recentExpenses } = stats;

      const currencySymbol = '₹';

      container.innerHTML = `
        <div class="dashboard-view-wrapper">
          <!-- KPI Cards Grid -->
          <div class="kpi-grid">
            
            <div class="card kpi-card glass-card">
              <div class="kpi-info">
                <h3>Active Members</h3>
                <div class="value">${kpis.activeMembers}</div>
                <span class="text-sm text-muted">Total: ${kpis.totalMembers}</span>
              </div>
              <div class="kpi-icon" style="background: rgba(76, 175, 80, 0.12); color: var(--color-success);">
                <i data-lucide="users"></i>
              </div>
            </div>

            <div class="card kpi-card glass-card">
              <div class="kpi-info">
                <h3>Expired / Frozen</h3>
                <div class="value">${kpis.expiredMembers}</div>
                <span class="text-sm text-muted">Action needed</span>
              </div>
              <div class="kpi-icon" style="background: rgba(244, 67, 54, 0.12); color: var(--color-error);">
                <i data-lucide="user-x"></i>
              </div>
            </div>

            <div class="card kpi-card glass-card">
              <div class="kpi-info">
                <h3>Monthly Revenue</h3>
                <div class="value">${currencySymbol}${kpis.monthlyRevenue.toLocaleString()}</div>
                <span class="text-sm text-muted">This month</span>
              </div>
              <div class="kpi-icon" style="background: rgba(255, 215, 0, 0.12); color: var(--color-accent);">
                <i data-lucide="arrow-up-right"></i>
              </div>
            </div>

            <div class="card kpi-card glass-card">
              <div class="kpi-info">
                <h3>Net Profit</h3>
                <div class="value" style="color: ${kpis.netProfit >= 0 ? 'var(--color-success)' : 'var(--color-error)'}">
                  ${kpis.netProfit >= 0 ? '+' : ''}${currencySymbol}${kpis.netProfit.toLocaleString()}
                </div>
                <span class="text-sm text-muted">Expenses: ${currencySymbol}${kpis.monthlyExpenses.toLocaleString()}</span>
              </div>
              <div class="kpi-icon" style="background: rgba(33, 150, 243, 0.12); color: var(--color-info);">
                <i data-lucide="wallet"></i>
              </div>
            </div>

          </div>

          <!-- Alert Cards for dues/expiries -->
          <div class="grid-2 mb-lg">
            ${kpis.expiringToday > 0 || kpis.feesDueToday > 0 ? `
              <div class="card glass-card" style="border-left: 4px solid var(--color-primary); background: rgba(214, 40, 40, 0.05);">
                <div class="flex align-center gap-md">
                  <i data-lucide="alert-octagon" style="color: var(--color-primary); width:32px; height:32px;"></i>
                  <div>
                    <h3 style="font-weight:700; font-size:1.1rem; color: var(--color-text-main);">Daily Action Alerts</h3>
                    <p style="font-size:0.9rem; color: var(--color-text-muted);">
                      There are <strong>${kpis.expiringToday}</strong> memberships expiring today and 
                      <strong>${kpis.feesDueToday}</strong> payments due today. Check the Reminders & Subscriptions panel.
                    </p>
                  </div>
                </div>
              </div>
            ` : ''}
            
            <div class="card glass-card" style="border-left: 4px solid var(--color-accent); background: rgba(255, 215, 0, 0.05);">
              <div class="flex align-center gap-md">
                <i data-lucide="calendar" style="color: var(--color-accent); width:32px; height:32px;"></i>
                <div>
                  <h3 style="font-weight:700; font-size:1.1rem; color: var(--color-text-main);">Revenue Forecast</h3>
                  <p style="font-size:0.9rem; color: var(--color-text-muted);">
                    Projected collection from upcoming renewals next month is <strong>${currencySymbol}${kpis.revenueForecast.toLocaleString()}</strong>.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Charts Section -->
          <div class="grid-2 mb-lg">
            <div class="card glass-card">
              <h3 class="mb-md" style="font-size:1rem; font-weight:600;">Monthly Revenue vs Expenses</h3>
              <div style="position: relative; height: 260px; width: 100%;">
                <canvas id="revenueExpensesChart"></canvas>
              </div>
            </div>
            
            <div class="card glass-card">
              <h3 class="mb-md" style="font-size:1rem; font-weight:600;">Expense Breakdown</h3>
              <div style="position: relative; height: 260px; width: 100%;">
                <canvas id="expensesBreakdownChart"></canvas>
              </div>
            </div>
          </div>

          <!-- Activity logs & quick lists -->
          <div class="grid-2">
            
            <!-- Recent Payments -->
            <div class="card glass-card">
              <div class="flex justify-between align-center mb-md">
                <h3 style="font-size:1.1rem; font-weight:700;">Recent Payments</h3>
                <a href="#payments" class="btn btn-secondary btn-sm">View All</a>
              </div>
              
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Method</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${recentPayments.length === 0 ? `<tr><td colspan="3" class="text-center">No recent payments</td></tr>` : 
                      recentPayments.map(p => `
                        <tr>
                          <td><strong>${p.member_name}</strong></td>
                          <td><span class="badge" style="background: var(--color-border);">${p.payment_method}</span></td>
                          <td style="color:var(--color-success); font-weight:600;">${currencySymbol}${p.paid_amount}</td>
                        </tr>
                      `).join('')}
                  </tbody>
                </table>
              </div>
            </div>

            <!-- New Members -->
            <div class="card glass-card">
              <div class="flex justify-between align-center mb-md">
                <h3 style="font-size:1.1rem; font-weight:700;">New Members</h3>
                <a href="#members" class="btn btn-secondary btn-sm">View All</a>
              </div>
              
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Joining Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${newMembers.length === 0 ? `<tr><td colspan="3" class="text-center">No members yet</td></tr>` : 
                      newMembers.map(m => `
                        <tr>
                          <td>
                            <div class="member-cell">
                              <div class="member-photo-mini">${m.fullname.substring(0,2).toUpperCase()}</div>
                              <div>
                                <strong>${m.fullname}</strong>
                                <div style="font-size:0.75rem; color:var(--color-text-muted);">${m.member_code}</div>
                              </div>
                            </div>
                          </td>
                          <td>${m.joining_date}</td>
                          <td><span class="status-badge status-${m.status.toLowerCase()}">${m.status}</span></td>
                        </tr>
                      `).join('')}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

        </div>
      `;

      currentStats = stats;
      // Render Charts
      renderCharts(stats.collections || [], stats.expenses || [], stats.expensesByCategory || []);
      
    } catch (error) {
      console.error(error);
      container.innerHTML = `<div class="empty-state"><h3>Error loading dashboard</h3><p>${error.message}</p></div>`;
    }
  }
};

function renderCharts(collections, expenses, expensesByCategory) {
  // Get theme colors dynamically
  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--color-text-main').trim() || '#f3f4f6';
  const textMutedColor = getComputedStyle(document.documentElement).getPropertyValue('--color-text-muted').trim() || '#9ca3af';
  const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim() || 'rgba(255, 255, 255, 0.05)';

  // 1. Revenue vs Expenses Chart
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentMonthIdx = new Date().getMonth();
  
  const revData = Array(12).fill(0);
  const expData = Array(12).fill(0);
  
  if (collections && collections.length > 0) {
    collections.forEach(c => {
      const idx = parseInt(c.month, 10) - 1;
      if (idx >= 0 && idx < 12) {
        revData[idx] = c.total || 0;
      }
    });
  }
  
  if (expenses && expenses.length > 0) {
    expenses.forEach(e => {
      const idx = parseInt(e.month, 10) - 1;
      if (idx >= 0 && idx < 12) {
        expData[idx] = e.total || 0;
      }
    });
  }
  
  const revCanvas = document.getElementById('revenueExpensesChart');
  if (revCanvas) {
    const revCtx = revCanvas.getContext('2d');
    if (revChartInstance) {
      revChartInstance.destroy();
    }
    revChartInstance = new Chart(revCtx, {
      type: 'line',
      data: {
        labels: months.slice(0, currentMonthIdx + 1),
        datasets: [
          {
            label: 'Revenue (INR)',
            data: revData.slice(0, currentMonthIdx + 1),
            borderColor: '#ffd700',
            backgroundColor: 'rgba(255, 215, 0, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
          },
          {
            label: 'Expenses (INR)',
            data: expData.slice(0, currentMonthIdx + 1),
            borderColor: '#d62828',
            backgroundColor: 'rgba(214, 40, 40, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            grid: { color: gridColor },
            ticks: { color: textMutedColor }
          },
          x: {
            grid: { display: false },
            ticks: { color: textMutedColor }
          }
        },
        plugins: {
          legend: { labels: { color: textColor } }
        }
      }
    });
  }

  // 2. Expense Category Breakdown Chart
  let expCategories = [];
  let expValues = [];
  let expColors = [];
  
  const baseColors = [
    '#d62828', '#ff9800', '#ffd700', '#2196f3', '#4caf50', 
    '#9c27b0', '#795548', '#00bcd4', '#e91e63', '#009688', '#607d8b'
  ];

  const hasExpenses = expensesByCategory && expensesByCategory.length > 0;

  if (hasExpenses) {
    expensesByCategory.forEach((item, index) => {
      expCategories.push(item.category);
      expValues.push(item.total || 0);
      expColors.push(baseColors[index % baseColors.length]);
    });
  } else {
    expCategories = ['No Expenses'];
    expValues = [1];
    expColors = [textMutedColor];
  }
  
  const expCanvas = document.getElementById('expensesBreakdownChart');
  if (expCanvas) {
    const expCtx = expCanvas.getContext('2d');
    if (expChartInstance) {
      expChartInstance.destroy();
    }
    expChartInstance = new Chart(expCtx, {
      type: 'doughnut',
      data: {
        labels: expCategories,
        datasets: [{
          data: expValues,
          backgroundColor: expColors,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: textColor, font: { size: 10 } }
          },
          tooltip: {
            enabled: hasExpenses
          }
        }
      }
    });
  }
}

export default DashboardView;
