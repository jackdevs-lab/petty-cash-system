document.addEventListener('DOMContentLoaded', async function() {
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
// Modal Elements
const mpesaSyncModal = document.getElementById('mpesa-sync-modal');
const modalCloseBtns = document.querySelectorAll('.modal-close');
// Input Elements
const prevBalanceInput = document.getElementById('prev-balance');
const newBalanceInput = document.getElementById('new-balance');
const mpesaIdInput = document.getElementById('mpesa-id');
const transactionDateInput = document.getElementById('transaction-date');
const smsTextInput = document.getElementById('sms-text');
// State
let systemStatus = null;
let walletData = null;
// Initialize
async function init() {
await loadDashboardData();
setupEventListeners();
updateLastCheck();
}
// Load dashboard data
async function loadDashboardData() {
try {
// Get system status first
systemStatus = await api.getSystemStatus();
updateSystemStatus(systemStatus);
// If system is locked, show banner and redirect
if (systemStatus.system_locked && window.location.pathname !== '/classify.html') {
showLockBanner(systemStatus.open_transaction);
return;
}
// Load wallet data
walletData = await api.getWallet();
updateWalletDisplay(walletData);// Load recent transactions
const transactionsData = await api.getTransactions();
updateTransactionsTable(transactionsData.transactions);
// Calculate today's statistics
calculateTodayStats(transactionsData.transactions);
} catch (error) {
console.error('Failed to load dashboard data:', error);
showError('Failed to load dashboard data. Please refresh the page.');
}

// Update system status display
function updateSystemStatus(status) {
const isLocked = status.system_locked;
// Update status badge
if (systemStatusBadgeEl) {
systemStatusBadgeEl.textContent = isLocked ? 'Locked' : 'Active';
systemStatusBadgeEl.className = isLocked 
? 'px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800'
: 'px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800';
}
// Update footer status
if (footerStatusEl) {
footerStatusEl.textContent = isLocked ? 'Locked (Transaction Open)' : 'Active (Ready)';
footerStatusEl.className = isLocked ? 'font-medium text-yellow-600' : 'font-medium text-green-600';
}
}

// Show lock banner
function showLockBanner(openTransaction) {
if (lockBannerEl) {
lockBannerEl.classList.remove('hidden');
}
}

// Update wallet display
function updateWalletDisplay(walletData) {
if (!walletData) return;const wallet = walletData.wallet;
// Update current balance
if (currentBalanceEl) {
currentBalanceEl.textContent = api.formatCurrency(wallet.current_balance);
// Color code based on balance
if (wallet.current_balance === 0) {
currentBalanceEl.classList.add('text-gray-900');
} else if (wallet.current_balance > 0) {
currentBalanceEl.classList.add('text-green-600');
} else {
currentBalanceEl.classList.add('text-red-600');
}
}
// Update last updated
if (lastUpdatedEl && wallet.last_updated) {
const date = new Date(wallet.last_updated);
lastUpdatedEl.textContent = `Last updated: ${date.toLocaleString('en-KE')}`;
}
// Update today's date
if (todayDateEl) {
const today = new Date();
todayDateEl.textContent = `Today: ${today.toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
}
// Update current month
if (currentMonthEl) {
const today = new Date();
currentMonthEl.textContent = `Month: ${today.toLocaleDateString('en-KE', 
{ month: 'long', year: 'numeric' })}`;
}
}

// Update transactions table
function updateTransactionsTable(transactions) {
if (!transactionsBodyEl || !transactions) return;
transactionsBodyEl.innerHTML = '';
if (transactions.length === 0) {transactionsBodyEl.innerHTML = `
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
row.innerHTML = `
<td class="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
${api.formatDate(transaction.transaction_date)}
</td>
<td class="px-3 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
${transaction.mpesa_transaction_id}
</td>
<td class="px-3 py-4 whitespace-nowrap text-sm ${amountClass}">
${amountSign}${api.formatCurrency(Math.abs(transaction.delta))}
</td>
<td class="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
${api.formatCurrency(Math.abs(transaction.delta))}
</td>
<td class="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
${statusBadge}
</td>
<td class="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
<button class="text-blue-600 hover:text-blue-900 view-transaction" data-id="${transaction.id}">
<i class="fas fa-eye mr-1"></i> View
</button>
</td>
`;
transactionsBodyEl.appendChild(row);
});
// Add event listeners to view buttons
document.querySelectorAll('.view-transaction').forEach(button => {
button.addEventListener('click', function() {
const transactionId = this.getAttribute('data-id');
viewTransactionDetails(transactionId);
});
});
}
// Calculate today's statistics
function calculateTodayStats(transactions) {
const today = new Date().toISOString().split('T')[0];
// Count transactions today
const todayTransactions = transactions.filter(t => 
t.transaction_date.startsWith(today)
);
if (todayCountEl) {
todayCountEl.textContent = todayTransactions.length;
}
// Calculate month expenses
const currentMonth = new Date().getMonth();
const currentYear = new Date().getFullYear();
const monthTransactions = transactions.filter(t => {
const transactionDate = new Date(t.transaction_date);
return transactionDate.getMonth() === currentMonth && 
transactionDate.getFullYear() === currentYear &&
t.delta < 0; // Only expenses (negative delta)
});
const monthExpenses = monthTransactions.reduce((sum, t) => sum + Math.abs(t.delta), 0);
if (monthExpensesEl) {
monthExpensesEl.textContent = api.formatCurrency(monthExpenses);
}
}

// Show transaction details
async function viewTransactionDetails(transactionId) {
// In a full implementation, this would open a modal with transaction details
alert(`Viewing transaction ${transactionId}. This feature would show full details in a modal.`);
}
// Setup event listeners
function setupEventListeners() {
// M-Pesa Sync button
if (btnMpesaSync) {
btnMpesaSync.addEventListener('click', () => {
// Check if system is already locked
if (systemStatus && systemStatus.system_locked) {
alert('System is locked. Please complete the open transaction classification first.');
window.location.href = '/classify.html';
return;
}
// Set default date to now
if (transactionDateInput) {
const now = new Date();
now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
transactionDateInput.value = now.toISOString().slice(0, 16);
}
// Show modal
if (mpesaSyncModal) {
mpesaSyncModal.classList.remove('hidden');
}
});
}
// Manual Entry button
if (btnManualEntry) {
btnManualEntry.addEventListener('click', () => {
if (systemStatus && systemStatus.system_locked) {
alert('System is locked. Please complete the open transaction classification first.');
window.location.href = '/classify.html';
return;
}
alert('Manual entry would open a form here. For now, use the M-Pesa sync modal.');
});
}
// View Reports button
if (btnViewReports) { btnViewReports.addEventListener('click', () => {
                window.location.href = '/reports.html';
            });
        }
        // System Check button
        if (btnSystemCheck) {
            btnSystemCheck.addEventListener('click', async () => {
                try {
                    const health = await api.getSystemHealth();
                    if (health.healthy) {
                        alert('✅ System is healthy and running normally.');
                    } else {
                        alert('⚠ System check failed. Check console for details.');
                        console.log('System health:', health);
                    }
                } catch (error) {
                    alert('❌ Failed to check system health.');
                }
            });
        }
        // Process Transaction button
        if (btnProcessTransaction) {
            btnProcessTransaction.addEventListener('click', async () => {
                await processNewTransaction();
            });
        }
        // Modal close buttons
        modalCloseBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                mpesaSyncModal.classList.add('hidden');
                clearTransactionForm();
            });
        });
        // SMS text parsing
        if (smsTextInput) {
            smsTextInput.addEventListener('input', () => {
                parseSMSText();
            });
        }
        // Close modal on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { mpesaSyncModal.classList.add('hidden');
                clearTransactionForm();
            }
        });
        // Close modal on outside click
        if (mpesaSyncModal) {
            mpesaSyncModal.addEventListener('click', (e) => {
                if (e.target === mpesaSyncModal) {
                    mpesaSyncModal.classList.add('hidden');
                    clearTransactionForm();
                }
            });
        }
    }
    // Parse SMS text and auto-fill form
    function parseSMSText() {
        const smsText = smsTextInput.value.trim();
        if (!smsText) return;
        const parsed = api.parseSMSText(smsText);
        if (!parsed) return;
        // Auto-fill form based on parsed SMS
        if (parsed.type === 'withdrawal') {
            if (walletData && walletData.wallet) {
                const currentBalance = walletData.wallet.current_balance;
                const newBalance = parsed.new_balance;
                const previousBalance = currentBalance + parsed.amount; // Reverse calculate
                
                if (prevBalanceInput) prevBalanceInput.value = previousBalance.toFixed(2);
                if (newBalanceInput) newBalanceInput.value = newBalance.toFixed(2);
            }
            
            if (mpesaIdInput) mpesaIdInput.value = parsed.mpesa_transaction_id;
            if (transactionDateInput) {
                const date = new Date(parsed.date);
                date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
                transactionDateInput.value = date.toISOString().slice(0, 16);
            }
        } else if (parsed.type === 'deposit') {
            if (walletData && walletData.wallet) {
                const currentBalance = walletData.wallet.current_balance;
                const newBalance = parsed.new_balance;const previousBalance = currentBalance - parsed.amount; // Reverse calculate
                
                if (prevBalanceInput) prevBalanceInput.value = previousBalance.toFixed(2);
                if (newBalanceInput) newBalanceInput.value = newBalance.toFixed(2);
            }
            
            if (mpesaIdInput) mpesaIdInput.value = parsed.mpesa_transaction_id;
            if (transactionDateInput) {
                const date = new Date(parsed.date);
                date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
                transactionDateInput.value = date.toISOString().slice(0, 16);
            }
        }
    }
    // Process new transaction
    async function processNewTransaction() {
        // Validate form
        if (!validateTransactionForm()) {
            return;
        }
        // Prepare transaction data
        const transactionData = {
            mpesa_transaction_id: mpesaIdInput.value.trim(),
            mpesa_reference: mpesaIdInput.value.trim(),
            previous_balance: parseFloat(prevBalanceInput.value),
            new_balance: parseFloat(newBalanceInput.value),
            transaction_date: new Date(transactionDateInput.value).toISOString(),
            raw_sms_text: smsTextInput.value.trim() || null
        };
        try {
            // Show loading state
            btnProcessTransaction.disabled = true;
            btnProcessTransaction.innerHTML = '<i class="fas fa-spinner fa-spin mr2"></i> Processing...';
        // Create transaction
        const result = await api.createTransaction(transactionData);
        
        // Success - redirect to classification
        alert('Transaction created successfully. Redirecting to classification...');
        window.location.href = '/classify.html';
    } catch (error) {
        console.error('Failed to create transaction:', error);
        alert(`Error: ${error.message}`);
        // Reset button
        btnProcessTransaction.disabled = false;
        btnProcessTransaction.innerHTML = '<i class="fas fa-calculator mr-2"></i> Process Transaction';
    }
}
}
// Validate transaction form
function validateTransactionForm() {
let isValid = true;
let errorMessage = '';
// Clear previous errors
[prevBalanceInput, newBalanceInput, mpesaIdInput, transactionDateInput].forEa
ch(input => {
if (input) input.classList.remove('error');
});
// Validate required fields
if (!prevBalanceInput.value.trim()) {
prevBalanceInput.classList.add('error');
errorMessage += '• Previous balance is required\n';
isValid = false;
}
if (!newBalanceInput.value.trim()) {
newBalanceInput.classList.add('error');
errorMessage += '• New balance is required\n';
isValid = false;
}
if (!mpesaIdInput.value.trim()) {
mpesaIdInput.classList.add('error');
errorMessage += '• M-Pesa Transaction ID is required\n';
isValid = false;
}
if (!transactionDateInput.value) {
transactionDateInput.classList.add('error');
errorMessage += '• Transaction date is required\n';
isValid = false;
}// Validate numeric values
const prevBalance = parseFloat(prevBalanceInput.value);
const newBalance = parseFloat(newBalanceInput.value);
if (isNaN(prevBalance) || prevBalance < 0) {
prevBalanceInput.classList.add('error');
errorMessage += '• Previous balance must be a positive number\n';
isValid = false;
}
if (isNaN(newBalance) || newBalance < 0) {
newBalanceInput.classList.add('error');
errorMessage += '• New balance must be a positive number\n';
isValid = false;
}
// Validate date is not in future
const transactionDate = new Date(transactionDateInput.value);
const now = new Date();
if (transactionDate > now) {
transactionDateInput.classList.add('error');
errorMessage += '• Transaction date cannot be in the future\n';
isValid = false;
}
if (!isValid) {
alert('Please fix the following errors:\n\n' + errorMessage);
}
return isValid;
}
// Clear transaction form
function clearTransactionForm() {
if (prevBalanceInput) prevBalanceInput.value = '';
if (newBalanceInput) newBalanceInput.value = '';
if (mpesaIdInput) mpesaIdInput.value = '';
if (transactionDateInput) {
const now = new Date();
now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
transactionDateInput.value = now.toISOString().slice(0, 16);
}
if (smsTextInput) smsTextInput.value = '';
}
// Update last check time
function updateLastCheck() {
        if (lastCheckEl) {
            lastCheckEl.textContent = new Date().toLocaleTimeString('en-KE');
        }
    }
    // Show error message
    function showError(message) {
        // Create error banner
        const errorBanner = document.createElement('div');
        errorBanner.className = 'bg-red-50 border-l-4 border-red-400 p-4 mb-6';
        errorBanner.innerHTML = `
            <div class="flex">
                <div class="flex-shrink-0">
                    <i class="fas fa-exclamation-circle text-red-400"></i>
                </div>
                <div class="ml-3">
                    <p class="text-sm text-red-700">${message}</p>
                </div>
            </div>
        `;
        
        // Insert at top of main content
        const main = document.querySelector('main');
        if (main) {
            main.insertBefore(errorBanner, main.firstChild);
            
            // Remove after 10 seconds
            setTimeout(() => {
                errorBanner.remove();
            }, 10000);
        }
    }
    // Auto-refresh every 30 seconds if not locked
    setInterval(() => {
        if (systemStatus && !systemStatus.system_locked) {
            loadDashboardData();
            updateLastCheck();
        }
    }, 30000);
    // Initialize dashboard
    init();
});