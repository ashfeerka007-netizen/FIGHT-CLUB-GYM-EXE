// Shared UI Utilities for Fight Club Gym
// Extracted here to avoid circular imports between app.js and view modules

// ----------------------------------------------------
// TOAST NOTIFICATIONS MANAGER
// ----------------------------------------------------
export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'info';
  if (type === 'success') icon = 'check-circle';
  if (type === 'error') icon = 'alert-triangle';
  if (type === 'warning') icon = 'alert-circle';
  
  toast.innerHTML = `
    <i data-lucide="${icon}"></i>
    <div class="toast-message">${message}</div>
    <div class="toast-close"><i data-lucide="x"></i></div>
  `;
  
  container.appendChild(toast);
  lucide.createIcons();
  
  setTimeout(() => {
    toast.style.transform = 'translateX(0)';
  }, 10);
  
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => {
    toast.style.transform = 'translateX(120%)';
    setTimeout(() => toast.remove(), 300);
  });
  
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.transform = 'translateX(120%)';
      setTimeout(() => toast.remove(), 300);
    }
  }, 4000);
}

// ----------------------------------------------------
// CUSTOM CONFIRMATION MODAL
// ----------------------------------------------------
export function showConfirm(title, message, onConfirm, confirmText = 'Delete', btnClass = 'btn-danger') {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.zIndex = '9999';
  modal.innerHTML = `
    <div class="modal-card" style="max-width: 400px; text-align: center; padding: var(--spacing-xl);">
      <div class="modal-header" style="justify-content: center; border-bottom: none; padding-bottom: 0;">
        <h2 style="font-size: 1.25rem; font-family: var(--font-secondary); font-weight: 700; color: var(--color-primary);">${title}</h2>
      </div>
      <div class="modal-body" style="padding: var(--spacing-lg) 0;">
        <p style="color: var(--color-text-muted); font-size: 0.95rem; line-height: 1.5; margin: 0;">${message}</p>
      </div>
      <div style="display: flex; justify-content: center; gap: var(--spacing-md); margin-top: var(--spacing-md); width: 100%;">
        <button class="btn btn-secondary btn-confirm-cancel" style="flex: 1; max-width: 120px; justify-content: center;">Cancel</button>
        <button class="btn ${btnClass} btn-confirm-proceed" style="flex: 1; max-width: 120px; justify-content: center;">${confirmText}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  const closeModal = () => {
    modal.classList.add('hidden');
    modal.remove();
  };
  
  modal.querySelector('.btn-confirm-cancel').addEventListener('click', () => {
    closeModal();
  });
  
  modal.querySelector('.btn-confirm-proceed').addEventListener('click', async () => {
    closeModal();
    await onConfirm();
  });
}
