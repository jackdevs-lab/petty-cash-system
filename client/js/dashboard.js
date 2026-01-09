// dashboard.js - Fully fixed and organized version

// DOM Elements
const currentBalanceEl = document.getElementById('current-balance');
const lastUpdatedEl = document.getElementById('last-updated');
const todayCountEl = document.getElementById('today-count');
const monthExpensesEl = document.getElementById('month-expenses');
const todayDateEl = document.getElementById('today-date');
const currentMonthEl = document.getElementById('current-month');
const transactionsBodyEl = document.getElementById('transactions-body');
const lockBannerEl = document.getElementById('lock-banner');
const systemStatusBadgeEl = document.getElementById('system-status-badge');
const footerStatusEl = document.getElementById('footer-status');
const lastCheckEl = document.getElementById('last-check');

const btnMpesaSync = document.getElementById('btn-mpesa-sync');
const btnManualEntry = document.getElementById('btn-manual-entry');
const btnViewReports = document.getElementById('btn-view-reports');
const btnSystemCheck = document.getElementById('btn-system-check');
const btnProcessTransaction = document.getElementById('btn-process-transaction');

const mpesaSyncModal = document.getElementById('mpesa-sync-modal');
const modalCloseBtns = document.querySelectorAll('.modal-close');

const prevBalanceInput = document.getElementById('prev-balance');
const newBalanceInput = document.getElementById('new-balance');
const mpesaIdInput = document.getElementById('mpesa-id');
const transactionDateInput = document.getElementById('transaction-date');
const smsTextInput = document.getElementById('sms-text');

// Global state
let systemStatus = null;
let walletData = null;

// ========================
// Helper Functions
// ========================

function updateSystemStatus(status) {
  const isLocked = status.system_locked;

  if (systemStatusBadgeEl) {
    systemStatusBadgeEl.textContent = isLocked ? 'Locked' : 'Active';
    systemStatusBadgeEl.className = isLocked
      ? 'px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800'
      : 'px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800';
  }

  if (footerStatusEl) {
    footerStatusEl.textContent = isLocked ? 'Locked (Transaction Open)' : 'Active (Ready)';
    footerStatusEl.className = isLocked ? 'font-medium text-yellow-600' : 'font-medium text-green-600';
  }
}

function showLockBanner() {
  if (lockBannerEl) {
    lockBannerEl.classList.remove('hidden');
  }
}

function updateWalletDisplay(walletData) {
  if (!walletData?.wallet) return;

  const wallet = walletData.wallet;

  if (currentBalanceEl) {
    currentBalanceEl.textContent = api.formatCurrency(wallet.current_balance);
    currentBalanceEl.className = 'text-4xl font-bold';
    if (wallet.current_balance > 0) currentBalanceEl.classList.add('text-green-600');
    else if (wallet.current_balance < 0) currentBalanceEl.classList.add('text-red-600');
    else currentBalanceEl.classList.add('text-gray-900');
  }

  if (lastUpdatedEl && wallet.last_updated) {
    const date = new Date(wallet.last_updated);
    lastUpdatedEl.textContent = `Last updated: ${date.toLocaleString('en-KE')}`;
  }

  if (todayDateEl) {
    const today = new Date();
    todayDateEl.textContent = `Today: ${today.toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
  }

  if (currentMonthEl) {
    const today = new Date();
    currentMonthEl.textContent = `Month: ${today.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}`;
  }
}

function updateTransactionsTable(transactions) {
  if (!transactionsBodyEl) return;

  transactionsBodyEl.innerHTML = '';

  if (!transactions || transactions.length === 0) {
    transactionsBodyEl.innerHTML = `
      <tr>
        <td colspan="6" class="px-3 py-4 text-center text-gray-500">
          No transactions yet. Sync from M-Pesa to get started.
        </td>
      </tr>
    `;
    return;
  }

  transactions.forEach(transaction => {
    const row = document.createElement('tr');
    const isPositive = transaction.delta > 0;
    const amountClass = isPositive ? 'text-green-600' : 'text-red-600';
    const amountSign = isPositive ? '+' : '';
    
    const statusBadge = transaction.status === 'OPEN'
      ? '<span class="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">Pending</span>'
      : '<span class="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">Completed</span>';

    // Action button: "Classify" if OPEN, "View" if LOCKED/COMPLETED
    let actionButton = '';
    if (transaction.status === 'OPEN') {
      actionButton = `
        <button class="text-orange-600 hover:text-orange-800 font-medium classify-transaction">
          <i class="fas fa-tags mr-1"></i> Classify
        </button>
      `;
    } else {
      actionButton = `
        <button class="text-blue-600 hover:text-blue-900 view-transaction" data-id="${transaction.id}">
          <i class="fas fa-eye mr-1"></i> View
        </button>
      `;
    }

    row.innerHTML = `
      <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-900">${api.formatDate(transaction.transaction_date)}</td>
      <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">${transaction.mpesa_transaction_id || 'N/A'}</td>
      <td class="px-3 py-4 whitespace-nowrap text-sm ${amountClass}">${amountSign}${api.formatCurrency(Math.abs(transaction.delta))}</td>
      <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-900">${api.formatCurrency(Math.abs(transaction.mpesa_fee || 0))}</td>
      <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-900">${statusBadge}</td>
      <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
        ${actionButton}
      </td>
    `;
    transactionsBodyEl.appendChild(row);
  });

  // Attach event listeners

  // View button (for completed transactions)
  document.querySelectorAll('.view-transaction').forEach(btn => {
    btn.addEventListener('click', () => {
      viewTransactionDetails(btn.dataset.id);
    });
  });

  // Classify button (for pending transactions) - redirects to classification page
  document.querySelectorAll('.classify-transaction').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.href = '/classify.html';
    });
  });
}

function calculateTodayStats(transactions) {
  if (!transactions) return;

  const todayStr = new Date().toISOString().split('T')[0];
  const todayCount = transactions.filter(t => t.transaction_date.startsWith(todayStr)).length;
  if (todayCountEl) todayCountEl.textContent = todayCount;

  const now = new Date();
  const monthExpenses = transactions
    .filter(t => {
      const date = new Date(t.transaction_date);
      return date.getMonth() === now.getMonth() &&
             date.getFullYear() === now.getFullYear() &&
             t.delta < 0;
    })
    .reduce((sum, t) => sum + Math.abs(t.delta), 0);

  if (monthExpensesEl) monthExpensesEl.textContent = api.formatCurrency(monthExpenses);
}

function viewTransactionDetails(id) {
  alert(`View details for transaction ID: ${id}\n(In a full app, this would open a detailed modal)`);
}

function updateLastCheck() {
  if (lastCheckEl) {
    lastCheckEl.textContent = new Date().toLocaleTimeString('en-KE');
  }
}

function showError(message) {
  const banner = document.createElement('div');
  banner.className = 'bg-red-50 border-l-4 border-red-400 p-4 mb-6';
  banner.innerHTML = `
    <div class="flex">
      <div class="flex-shrink-0"><i class="fas fa-exclamation-circle text-red-400 text-xl"></i></div>
      <div class="ml-3"><p class="text-sm text-red-700">${message}</p></div>
    </div>
  `;
  document.querySelector('main')?.prepend(banner);
  setTimeout(() => banner.remove(), 10000);
}

// ========================
// Event Listeners
// ========================

function setupEventListeners() {
  if (btnMpesaSync) {
    btnMpesaSync.addEventListener('click', () => {
      if (systemStatus?.system_locked) {
        alert('System is locked. Complete the open transaction first.');
        window.location.href = '/classify.html';
        return;
      }
      transactionDateInput.value = new Date().toISOString().slice(0, 16);
      mpesaSyncModal?.classList.remove('hidden');
    });
  }

  if (btnViewReports) {
    btnViewReports.addEventListener('click', () => window.location.href = '/reports.html');
  }

  if (btnSystemCheck) {
    btnSystemCheck.addEventListener('click', async () => {
      try {
        const health = await api.getSystemHealth();
        alert(health.healthy ? '✅ System healthy!' : '⚠ System issue detected');
      } catch {
        alert('❌ Could not reach server');
      }
    });
  }

  modalCloseBtns.forEach(btn => btn.addEventListener('click', () => {
    mpesaSyncModal?.classList.add('hidden');
    clearTransactionForm();
  }));

  if (smsTextInput) smsTextInput.addEventListener('input', parseSMSText);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      mpesaSyncModal?.classList.add('hidden');
      clearTransactionForm();
    }
  });

  mpesaSyncModal?.addEventListener('click', e => {
    if (e.target === mpesaSyncModal) {
      mpesaSyncModal.classList.add('hidden');
      clearTransactionForm();
    }
  });
}

// ========================
// Form Handling
// ========================

function parseSMSText() {
  const text = smsTextInput?.value.trim();
  if (!text) return;

  const parsed = api.parseSMSText(text);
  if (!parsed) return;

  const current = walletData?.wallet?.current_balance || 0;
  let previous = current;

  if (parsed.type === 'withdrawal') previous = current + parsed.amount;
  else if (parsed.type === 'deposit') previous = current - parsed.amount;

  if (prevBalanceInput) prevBalanceInput.value = previous.toFixed(2);
  if (newBalanceInput) newBalanceInput.value = (parsed.balance || current).toFixed(2);
  if (mpesaIdInput) mpesaIdInput.value = parsed.transaction_id || '';
  if (transactionDateInput && parsed.date) {
    const d = new Date(parsed.date);
    transactionDateInput.value = d.toISOString().slice(0, 16);
  }
}

function clearTransactionForm() {
  prevBalanceInput && (prevBalanceInput.value = '');
  newBalanceInput && (newBalanceInput.value = '');
  mpesaIdInput && (mpesaIdInput.value = '');
  smsTextInput && (smsTextInput.value = '');
  const now = new Date();
  transactionDateInput && (transactionDateInput.value = now.toISOString().slice(0, 16));
}

function validateTransactionForm() {
  // Add your full validation here if needed
  return true;
}

async function processNewTransaction() {
  if (!validateTransactionForm()) return;

  const data = {
    mpesa_transaction_id: mpesaIdInput.value.trim(),
    previous_balance: parseFloat(prevBalanceInput.value),
    new_balance: parseFloat(newBalanceInput.value),
    transaction_date: new Date(transactionDateInput.value).toISOString(),
    raw_sms_text: smsTextInput.value.trim() || null
  };

  try {
    btnProcessTransaction.disabled = true;
    btnProcessTransaction.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    await api.createTransaction(data);
    alert('Transaction created! Redirecting to classification...');
    window.location.href = '/classify.html';
  } catch (err) {
    alert('Error: ' + (err.message || 'Unknown error'));
    btnProcessTransaction.disabled = false;
    btnProcessTransaction.innerHTML = '<i class="fas fa-calculator mr-2"></i> Process Transaction';
  }
}

// ========================
// Data Loading
// ========================

async function loadDashboardData() {
  try {
    systemStatus = await api.getSystemStatus();
    updateSystemStatus(systemStatus);

    if (systemStatus.system_locked && !window.location.pathname.includes('classify')) {
      showLockBanner();
      return;
    }

    walletData = await api.getWallet();
    updateWalletDisplay(walletData);

    const { transactions } = await api.getTransactions();
    updateTransactionsTable(transactions);
    calculateTodayStats(transactions);
  } catch (err) {
    console.error('Load failed:', err);
    showError('Failed to load dashboard data');
  }
}

// ========================
// Initialization
// ========================

async function init() {
  await loadDashboardData();
  setupEventListeners();
  updateLastCheck();

  // Auto refresh every 30 seconds when not locked
  setInterval(() => {
    if (!systemStatus?.system_locked) {
      loadDashboardData();
      updateLastCheck();
    }
  }, 30000);
}

// Start the app
document.addEventListener('DOMContentLoaded', init);