// Shared UI Utilities for Fight Club Gym
// Extracted here to avoid circular imports between app.js and view modules

if (typeof window !== 'undefined' && typeof window.lucide === 'undefined') {
  window.lucide = { createIcons: () => {} };
}

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

// ----------------------------------------------------
// OFFLINE QR CODE GENERATOR
// ----------------------------------------------------
export function generateQRCodeDataUrl(text, cellSize = 4, margin = 2) {
  try {
    if (typeof window !== 'undefined' && typeof window.qrcode === 'function') {
      const qr = window.qrcode(0, 'M');
      qr.addData(text || '');
      qr.make();
      return qr.createDataURL(cellSize, margin);
    }
  } catch (err) {
    console.warn('QR code generation error:', err);
  }
  return '';
}

// ----------------------------------------------------
// WHATSAPP REDIRECT HELPER (wa.me / WhatsApp Web)
// ----------------------------------------------------
export function openWhatsAppWeb({ mobile, message, defaultCountryCode = '91' }) {
  let digits = (mobile || '').replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) {
    // Already has 91 country code
  } else if (digits.length === 10) {
    digits = defaultCountryCode + digits;
  }
  const url = `https://wa.me/${digits}${message ? '?text=' + encodeURIComponent(message) : ''}`;
  
  // Use anchor click to ensure popup blockers don't block opening WhatsApp tab/app
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ----------------------------------------------------
// CSV PARSING & EXPORT UTILITIES (RFC 4180 compliant)
// ----------------------------------------------------
export function parseCSV(text) {
  const lines = [];
  let row = [];
  let inQuotes = false;
  let currentVal = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentVal += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n
      }
      row.push(currentVal.trim());
      if (row.some(val => val !== '')) {
        lines.push(row);
      }
      row = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  if (currentVal.length > 0 || row.length > 0) {
    row.push(currentVal.trim());
    if (row.some(val => val !== '')) {
      lines.push(row);
    }
  }

  if (lines.length === 0) return { headers: [], rows: [], rawLines: [] };
  const headers = lines[0].map(h => h.trim());
  const rows = lines.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] !== undefined ? r[idx] : '';
    });
    return obj;
  });

  return { headers, rows, rawLines: lines };
}

export function downloadCSV(filename, headers, rows) {
  const escapeCell = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvRows = [];
  if (headers && headers.length > 0) {
    csvRows.push(headers.map(escapeCell).join(','));
  }
  rows.forEach(r => {
    if (Array.isArray(r)) {
      csvRows.push(r.map(escapeCell).join(','));
    } else if (typeof r === 'object' && r !== null) {
      csvRows.push(headers.map(h => escapeCell(r[h])).join(','));
    }
  });

  const csvString = '\uFEFF' + csvRows.join('\r\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
