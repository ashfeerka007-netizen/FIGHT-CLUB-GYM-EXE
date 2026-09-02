// Main Application Entry & Controller for Fight Club Gym
if (typeof window !== 'undefined' && typeof window.lucide === 'undefined') {
  window.lucide = { createIcons: () => {} };
}
import api from './api.js';
import { showToast as _showToast } from './utils.js';
export { showToast, showConfirm } from './utils.js';
import mantraClient from './libs/mantra-mfs100.js';

// Import Views
import DashboardView from './views/dashboard.js?v=1.4.0';
import MembersView from './views/members.js?v=1.4.0';
import SubscriptionsView from './views/subscriptions.js?v=1.4.0';
import PlansView from './views/plans.js?v=1.4.0';
import PaymentsView from './views/payments.js?v=1.4.0';
import AttendanceView from './views/attendance.js?v=1.4.0';
import BiometricView from './views/biometric.js?v=1.4.0';
import TrainersView from './views/trainers.js?v=1.4.0';
import ExpensesView from './views/expenses.js?v=1.4.0';
import ReportsView from './views/reports.js?v=1.4.0';
import SettingsView from './views/settings.js?v=1.4.0';
import WhatsAppView from './views/whatsapp.js?v=1.4.0';
import UsersView from './views/users.js?v=1.4.0';

// Map hash routes to view modules
const routes = {
  '#dashboard': DashboardView,
  '#members': MembersView,
  '#subscriptions': SubscriptionsView,
  '#plans': PlansView,
  '#payments': PaymentsView,
  '#attendance': AttendanceView,
  '#biometric': BiometricView,
  '#trainers': TrainersView,
  '#expenses': ExpensesView,
  '#reports': ReportsView,
  '#settings': SettingsView,
  '#whatsapp': WhatsAppView,
  '#users': UsersView
};

// Application State
export const state = {
  settings: null,
  notifications: [],
  currentView: null
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  setupAuth();
  setupTheme();
  setupGlobalEvents();
  setupHotkeys();
  
  // Load public settings for logo & branding regardless of auth
  try {
    state.settings = await api.get('/api/settings');
    applySettings(state.settings);
  } catch (err) {
    console.error('Failed to load initial settings:', err);
  }
  
  if (api.isAuthenticated()) {
    await bootApp();
  }
});

// ----------------------------------------------------
// AUTHENTICATION CONTROLLER
// ----------------------------------------------------
function setupAuth() {
  const loginContainer = document.getElementById('login-container');
  const appWrapper = document.getElementById('app-wrapper');
  const loginForm = document.getElementById('login-form');
  const togglePassword = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('password');
  
  if (togglePassword && passwordInput) {
    togglePassword.addEventListener('click', () => {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      
      // Update Lucide icon
      if (type === 'text') {
        togglePassword.innerHTML = '<i data-lucide="eye-off"></i>';
      } else {
        togglePassword.innerHTML = '<i data-lucide="eye"></i>';
      }
      lucide.createIcons();
    });
  }
  
  if (!api.isAuthenticated()) {
    loginContainer.classList.remove('hidden');
    appWrapper.classList.add('hidden');
  } else {
    loginContainer.classList.add('hidden');
    appWrapper.classList.remove('hidden');
  }
  
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = e.target.username.value.trim();
    const password = e.target.password.value;
    
    try {
      const response = await api.post('/api/auth/login', { username, password });
      api.setCurrentUser(response.user);
      
      showToast('Welcome back, comrade. Focus on the fight.', 'success');
      
      loginContainer.classList.add('hidden');
      appWrapper.classList.remove('hidden');
      
      await bootApp();
    } catch (error) {
      showToast(error.message || 'Access Denied', 'error');
    }
  });
  
  document.getElementById('btn-logout').addEventListener('click', () => {
    api.setCurrentUser(null);
    loginContainer.classList.remove('hidden');
    appWrapper.classList.add('hidden');
    window.location.hash = '#dashboard';
    showToast('Logged out. Keep training in the shadows.', 'info');
  });
  
  // --- KIOSK LOGIC ---
  const btnShowKiosk = document.getElementById('btn-show-kiosk');
  const btnHideKiosk = document.getElementById('btn-hide-kiosk');
  const kioskContainer = document.getElementById('kiosk-container');
  const kioskForm = document.getElementById('kiosk-form');
  const kioskFeedback = document.getElementById('kiosk-feedback');
  const btnKioskFp = document.getElementById('btn-kiosk-fingerprint-scan');
  const kioskFpStatus = document.getElementById('kiosk-fingerprint-status');
  
  if (btnShowKiosk && kioskContainer) {
    btnShowKiosk.addEventListener('click', () => {
      loginContainer.classList.add('hidden');
      kioskContainer.classList.remove('hidden');
      document.getElementById('kiosk-member-code')?.focus();
      kioskContainer.scrollTo({ top: 0, behavior: 'smooth' });
    });
    
    btnHideKiosk.addEventListener('click', () => {
      kioskContainer.classList.add('hidden');
      loginContainer.classList.remove('hidden');
    });

    if (btnKioskFp) {
      btnKioskFp.addEventListener('click', async () => {
        btnKioskFp.disabled = true;
        btnKioskFp.innerHTML = '<i data-lucide="loader"></i> <span>Scanning Sensor...</span>';
        if (kioskFpStatus) {
          kioskFpStatus.innerHTML = '<span style="color: var(--color-accent); font-weight: 600;">🔴 Red light ON. Place finger flat on Mantra scanner...</span>';
        }
        kioskFeedback.style.display = 'none';
        lucide.createIcons();

        try {
          const capture = await mantraClient.captureFingerprint({ quality: 50, timeout: 10 });
          if (!capture.success) {
            kioskFeedback.style.display = 'block';
            kioskFeedback.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
            kioskFeedback.style.color = '#ef4444';
            kioskFeedback.style.border = '1px solid #ef4444';
            kioskFeedback.innerHTML = `<div style="display: flex; align-items: center; gap: 10px;"><i data-lucide="alert-circle" style="width: 22px; height: 22px; flex-shrink: 0;"></i><span>${capture.errorDescription}</span></div>`;
            if (kioskFpStatus) kioskFpStatus.textContent = 'Place finger firmly on Mantra MFS100 scanner';
            lucide.createIcons();
            kioskFeedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
          }

          if (kioskFpStatus) {
            kioskFpStatus.innerHTML = '<span style="color: #4caf50;">Matching fingerprint in database...</span>';
          }

          const response = await api.post('/api/biometric/mantra/scan', {
            quality: capture.quality,
            rawPayload: {
              ...capture.raw,
              IsoTemplate: capture.isoTemplate,
              AnsiTemplate: capture.ansiTemplate,
              BitmapData: capture.bitmapData,
              Quality: capture.quality
            }
          });

          const isGranted = response.allowed;
          const member = response.member;

          kioskFeedback.style.display = 'block';
          kioskFeedback.style.backgroundColor = isGranted ? 'rgba(16, 185, 129, 0.18)' : 'rgba(239, 68, 68, 0.18)';
          kioskFeedback.style.color = isGranted ? '#10b981' : '#f87171';
          kioskFeedback.style.border = isGranted ? '1px solid #10b981' : '1px solid #ef4444';
          kioskFeedback.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: 12px;">
              <div style="font-size: 1.8rem; color: ${isGranted ? '#10b981' : '#ef4444'}; flex-shrink: 0; line-height: 1; margin-top: 2px;">
                <i data-lucide="${isGranted ? 'check-circle-2' : 'alert-triangle'}"></i>
              </div>
              <div style="flex: 1;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">
                  <strong style="font-size: 1.2rem; color: #fff;">${member ? member.name : 'Unknown Scan'}</strong>
                  ${member ? `<span class="badge" style="background: rgba(255,255,255,0.15); font-family: monospace; font-size: 0.75rem; color: #fff;">ID: ${member.code || member.id}</span>` : ''}
                </div>
                <div style="font-size: 0.95rem; font-weight: 700; margin-top: 4px; color: ${isGranted ? '#10b981' : '#f87171'};">
                  ${isGranted ? (response.direction === 'check_out' ? '✓ CHECK-OUT RECORDED' : '✓ CHECK-IN RECORDED') : '✕ ACCESS DENIED'}
                </div>
                <div style="font-size: 0.85rem; color: rgba(255,255,255,0.85); margin-top: 2px;">
                  ${response.reason}
                </div>
              </div>
            </div>
          `;

          if (kioskFpStatus) {
            kioskFpStatus.textContent = isGranted ? '✓ Punch recorded successfully!' : `⚠️ ${response.reason}`;
          }

          lucide.createIcons();
          kioskFeedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

          setTimeout(() => {
            kioskFeedback.style.display = 'none';
            if (kioskFpStatus) kioskFpStatus.textContent = 'Place finger firmly on Mantra MFS100 scanner';
          }, 6000);

        } catch (err) {
          kioskFeedback.style.display = 'block';
          kioskFeedback.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
          kioskFeedback.style.color = '#ef4444';
          kioskFeedback.style.border = '1px solid #ef4444';
          kioskFeedback.innerHTML = `<div style="display: flex; align-items: center; gap: 10px;"><i data-lucide="alert-circle" style="width: 22px; height: 22px; flex-shrink: 0;"></i><span>${err.message}</span></div>`;
          lucide.createIcons();
          kioskFeedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } finally {
          btnKioskFp.disabled = false;
          btnKioskFp.innerHTML = '<i data-lucide="fingerprint" style="width: 24px; height: 24px;"></i><span>Touch Mantra Sensor to Punch</span>';
          lucide.createIcons();
        }
      });
    }
    
    kioskForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const codeInput = document.getElementById('kiosk-member-code');
      const code = codeInput.value.trim().toUpperCase();
      if (!code) return;
      
      kioskFeedback.style.display = 'none';
      kioskFeedback.className = 'kiosk-feedback-box';
      
      try {
        const response = await api.post('/api/attendance/scan', { code });
        
        kioskFeedback.style.display = 'block';
        kioskFeedback.style.backgroundColor = 'rgba(16, 185, 129, 0.18)';
        kioskFeedback.style.color = '#10b981';
        kioskFeedback.style.border = '1px solid #10b981';
        kioskFeedback.innerHTML = `
          <div style="display: flex; align-items: flex-start; gap: 12px;">
            <div style="font-size: 1.8rem; color: #10b981; flex-shrink: 0; line-height: 1; margin-top: 2px;">
              <i data-lucide="check-circle-2"></i>
            </div>
            <div style="flex: 1;">
              <strong style="font-size: 1.2rem; color: #fff;">${response.member.fullname}</strong>
              <div style="font-size: 0.95rem; font-weight: 700; margin-top: 4px; color: #10b981;">
                ✓ ${response.type.toUpperCase()} SUCCESSFUL
              </div>
            </div>
          </div>
        `;
        
        lucide.createIcons();
        kioskFeedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        setTimeout(() => {
          kioskFeedback.style.display = 'none';
        }, 5000);
        
      } catch (err) {
        kioskFeedback.style.display = 'block';
        kioskFeedback.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
        kioskFeedback.style.color = '#ef4444';
        kioskFeedback.style.border = '1px solid #ef4444';
        kioskFeedback.innerHTML = `<div style="display: flex; align-items: center; gap: 10px;"><i data-lucide="alert-circle" style="width: 22px; height: 22px; flex-shrink: 0;"></i><span>${err.message}</span></div>`;
        lucide.createIcons();
        kioskFeedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      
      codeInput.value = '';
      codeInput.focus();
    });
  }
}

// ----------------------------------------------------
// APPLICATION BOOTSTRAPPING
// ----------------------------------------------------
async function bootApp() {
  // 1. Set current user identity in UI
  const user = api.getCurrentUser();
  if (user) {
    document.getElementById('current-user-name').textContent = user.fullname;
    document.getElementById('current-user-role').textContent = user.role_name;
    document.getElementById('current-user-avatar').textContent = user.fullname.substring(0, 2).toUpperCase();
  }
  
  // 2. Fetch business settings
  try {
    state.settings = await api.get('/api/settings');
    applySettings(state.settings);
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  
  // 3. Setup router and route to current hash
  window.addEventListener('hashchange', router);
  
  // Initial route — always call router() directly so dashboard always loads
  if (!window.location.hash || window.location.hash === '#') {
    window.location.hash = '#dashboard';
    // hashchange will fire and call router()
  } else {
    // Already has a hash, call router() directly since hashchange won't fire
    await router();
  }
  
  // 4. Initialize notifications and start poller
  await loadNotifications();
  setInterval(loadNotifications, 60000); // Check every minute
}

// Apply settings to layout (theme, currency symbols, gym name etc.)
function applySettings(settings) {
  if (!settings) return;
  
  // Gym Title
  const logoTextH2 = document.querySelector('.logo-text h2');
  if (logoTextH2) logoTextH2.textContent = settings.gym_name;
  
  const logoTextSpan = document.querySelector('.gym-tagline');
  if (logoTextSpan) logoTextSpan.textContent = settings.tagline;
  
  // Custom logo image if uploaded
  const logoBox = document.querySelector('.logo-icon');
  if (settings.logo_path && logoBox) {
    logoBox.style.backgroundImage = `url(${settings.logo_path})`;
    logoBox.style.backgroundSize = 'cover';
    logoBox.style.backgroundPosition = 'center';
    logoBox.style.backgroundColor = 'transparent';
    logoBox.style.borderRadius = '50%';
    logoBox.style.boxShadow = 'none';
    logoBox.textContent = '';
  }
  
  // Custom login brand logo if uploaded
  const loginLogo = document.querySelector('.login-brand .logo-placeholder');
  if (settings.logo_path && loginLogo) {
    loginLogo.style.backgroundImage = `url(${settings.logo_path})`;
    loginLogo.style.backgroundSize = 'cover';
    loginLogo.style.backgroundPosition = 'center';
    loginLogo.style.backgroundColor = 'transparent';
    loginLogo.style.borderRadius = '50%';
    loginLogo.style.boxShadow = 'none';
    loginLogo.textContent = '';
  }
  
  // Set theme
  const theme = settings.theme || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
}

// SPA Router
async function router() {
  const hash = window.location.hash || '#dashboard';
  const view = routes[hash];
  
  const container = document.getElementById('view-container');
  const titleEl = document.getElementById('page-title');
  
  if (!view) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="alert-triangle"></i>
        <h2>Page Not Found</h2>
        <p>This room does not exist in Fight Club. Go back to the rings.</p>
        <a href="#dashboard" class="btn btn-primary">Go to Dashboard</a>
      </div>
    `;
    lucide.createIcons();
    return;
  }
  
  // Highlight active sidebar navigation link
  document.querySelectorAll('.sidebar-nav a').forEach(link => {
    if (link.getAttribute('href') === hash) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
  
  // Update Header Title
  const cleanTitle = hash.substring(1).charAt(0).toUpperCase() + hash.substring(2);
  titleEl.textContent = cleanTitle;
  
  // Show Loading Spinner
  container.innerHTML = `
    <div style="display: flex; justify-content: center; align-items: center; height: 50vh;">
      <div class="spinner"></div>
    </div>
  `;
  
  try {
    state.currentView = view;
    await view.render(container);
    // Re-bind Lucide icons for dynamically loaded content
    lucide.createIcons();
  } catch (error) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="frown" style="color: var(--color-error);"></i>
        <h2>Failed to Load View</h2>
        <p>${error.message}</p>
        <button class="btn btn-secondary" onclick="window.location.reload()">Retry Load</button>
      </div>
    `;
    lucide.createIcons();
  }
}

// ----------------------------------------------------
// THEME SWITCHER
// ----------------------------------------------------
function setupTheme() {
  const toggleBtn = document.getElementById('theme-toggle');
  
  toggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('fc_theme', newTheme);
    
    // Dispatch event to update dynamic charts
    window.dispatchEvent(new Event('themechanged'));
    
    // Save to settings silently in backend
    api.post('/api/settings', { theme: newTheme }).catch(console.error);
  });
  
  const savedTheme = localStorage.getItem('fc_theme');
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }
}

// ----------------------------------------------------
// GLOBAL NOTIFICATIONS
// ----------------------------------------------------
async function loadNotifications() {
  if (!api.isAuthenticated()) return;
  
  try {
    const response = await api.get('/api/reminders/due');
    const expiringSoon = response.expiringSoon || [];
    const pendingFees = response.pendingFees || [];
    
    const notifications = [];
    
    expiringSoon.forEach(sub => {
      notifications.push({
        id: `exp-${sub.sub_id}`,
        title: 'Membership Expiring',
        desc: `${sub.fullname}'s ${sub.plan_name} expires in ${Math.round(sub.days_remaining)} days (${sub.expiry_date}).`,
        type: 'warning',
        icon: 'clock'
      });
    });
    
    pendingFees.forEach(fee => {
      notifications.push({
        id: `fee-${fee.payment_id}`,
        title: 'Fees Due',
        desc: `${fee.fullname} owes ${fee.balance} INR since ${fee.payment_date}.`,
        type: 'danger',
        icon: 'dollar-sign'
      });
    });
    
    state.notifications = notifications;
    renderNotificationsDropdown();
  } catch (error) {
    console.error('Failed to load notifications:', error);
  }
}

function renderNotificationsDropdown() {
  const bell = document.getElementById('notification-bell');
  const badge = document.getElementById('notify-badge');
  const list = document.getElementById('notification-list');
  const count = state.notifications.length;
  
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
    
    list.innerHTML = state.notifications.map(item => `
      <div class="dropdown-item" data-id="${item.id}">
        <div class="dropdown-item-icon" style="background-color: var(--color-${item.type === 'danger' ? 'error' : item.type}-rgb); background: rgba(var(--color-${item.type === 'danger' ? 'error' : item.type}-rgb), 0.15); color: var(--color-${item.type === 'danger' ? 'error' : item.type});">
          <i data-lucide="${item.icon === 'dollar-sign' ? 'dollar-sign' : 'clock'}" style="width:16px;height:16px;"></i>
        </div>
        <div class="dropdown-item-details">
          <h4>${item.title}</h4>
          <p>${item.desc}</p>
        </div>
      </div>
    `).join('');
  } else {
    badge.classList.add('hidden');
    list.innerHTML = '<div class="empty-state">No notifications. All clear!</div>';
  }
  
  lucide.createIcons();
}

// ----------------------------------------------------
// TOAST NOTIFICATIONS MANAGER  (implemented in utils.js)
// ----------------------------------------------------
function showToast(message, type = 'success') { _showToast(message, type); }


// ----------------------------------------------------
// GLOBAL EVENTS & QUICK ACTIONS
// ----------------------------------------------------
function setupGlobalEvents() {
  const toggleBtn = document.getElementById('toggle-sidebar');
  const sidebar = document.querySelector('.sidebar');
  const bell = document.getElementById('notification-bell');
  const notifyDropdown = document.getElementById('notification-content');
  const clearBtn = document.getElementById('btn-clear-notifications');
  const quickActionBtn = document.getElementById('btn-quick-action');
  const quickActionModal = document.getElementById('quick-action-modal');
  
  // Mobile sidebar toggle
  toggleBtn.addEventListener('click', () => {
    const nav = document.querySelector('.sidebar-nav');
    nav.classList.toggle('active');
  });
  
  // Notification bell click
  bell.addEventListener('click', (e) => {
    e.stopPropagation();
    notifyDropdown.classList.toggle('hidden');
  });
  
  document.addEventListener('click', () => {
    notifyDropdown.classList.add('hidden');
  });
  
  clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    state.notifications = [];
    renderNotificationsDropdown();
    showToast('Notifications cleared', 'info');
  });
  
  // Quick Action Modals
  quickActionBtn.addEventListener('click', () => {
    quickActionModal.classList.remove('hidden');
    lucide.createIcons();
  });
  
  quickActionModal.querySelector('.btn-close-modal').addEventListener('click', () => {
    quickActionModal.classList.add('hidden');
  });
  
  // Quick Action Buttons click
  quickActionModal.querySelectorAll('.qa-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      quickActionModal.classList.add('hidden');
      
      if (action === 'add-member') {
        window.location.hash = '#members';
        // Wait for members view load and open creation form
        setTimeout(() => {
          const addBtn = document.getElementById('btn-add-member');
          if (addBtn) addBtn.click();
        }, 100);
      } else if (action === 'renew-subscription') {
        window.location.hash = '#subscriptions';
      } else if (action === 'checkin-member') {
        window.location.hash = '#attendance';
      } else if (action === 'add-expense') {
        window.location.hash = '#expenses';
        setTimeout(() => {
          const addBtn = document.getElementById('btn-add-expense');
          if (addBtn) addBtn.click();
        }, 100);
      }
    });
  });
}

// ----------------------------------------------------
// HOTKEY SYSTEM / KEYBOARD SHORTCUTS
// ----------------------------------------------------
function setupHotkeys() {
  document.addEventListener('keydown', (e) => {
    // '/' -> focus global search
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      const searchInput = document.getElementById('global-search');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    }
    
    // Alt + N -> Quick Action modal
    if (e.altKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      document.getElementById('btn-quick-action').click();
    }
    
    // Esc -> close open modals
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.classList.add('hidden');
      });
    }
  });
  
  // Global search input handling
  const globSearch = document.getElementById('global-search');
  globSearch.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const query = globSearch.value.trim();
      if (query) {
        window.location.hash = '#members';
        setTimeout(() => {
          const searchInput = document.getElementById('search-members');
          if (searchInput) {
            searchInput.value = query;
            searchInput.dispatchEvent(new Event('input'));
          }
        }, 200);
      }
    }
  });
}

// showConfirm is now exported via utils.js re-export at top of file
