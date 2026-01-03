document.addEventListener('DOMContentLoaded', async function() {
// DOM Elements
const transactionIdEl = document.getElementById('transaction-id');
const transactionDateEl = document.getElementById('transaction-date');
const prevBalanceEl = document.getElementById('prev-balance');
const newBalanceEl = document.getElementById('new-balance');
const deltaEl = document.getElementById('delta');
const deltaTypeEl = document.getElementById('delta-type');
const mpesaFeeEl = document.getElementById('mpesa-fee');
const remainingAmountEl = document.getElementById('remaining-amount');
const balanceStatusEl = document.getElementById('balance-status');
const splitRowsEl = document.getElementById('split-rows');
const autoClassifiedBodyEl = document.getElementById('auto-classified-body');
const validationSummaryEl = document.getElementById('validation-summary');
// Button Elements
const btnAddCategory = document.getElementById('btn-add-category');
const btnClearAll = document.getElementById('btn-clear-all');
const btnAutoSplit = document.getElementById('btn-auto-split');
const btnCancel = document.getElementById('btn-cancel');
const btnSaveSplits = document.getElementById('btn-save-splits');
const btnLockTransaction = document.getElementById('btn-lock-transaction');
const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
// Modal Elements
const cancelModal = document.getElementById('cancel-modal');
const modalCloseBtns = document.querySelectorAll('.modal-close');
// Input Elements
const cancelReasonInput = document.getElementById('cancel-reason');
const adminCodeInput = document.getElementById('admin-code');
// State
let openTransaction = null;
let existingSplits = [];
let autoClassifiedSplits = [];
let categories = [];
let splitCounter = 0;
// Initialize
    async function init() {
        // Load open transaction
        await loadOpenTransaction();
        
        // Load categories
        await loadCategories();
        
        // Setup event listeners
        setupEventListeners();
        
        // Initialize split rows
        updateSplitRows();
        updateAutoClassifiedRows();
        updateValidationSummary();
    }
    
    // Load open transaction
    async function loadOpenTransaction() {
        try {
            const data = await api.getOpenTransaction();
            
            if (!data || !data.transaction) {
                // No open transaction - redirect to dashboard
                alert('No open transaction found. Redirecting to dashboard.');
                window.location.href = '/';
                return;
            }
            
            openTransaction = data.transaction;
            existingSplits = data.splits || [];
            
            // Filter auto-classified splits (M-Pesa fees)
            autoClassifiedSplits = existingSplits.filter(split => {
                return split.category_name === 'M-Pesa Fees';
            });
            
            // Filter user splits
            existingSplits = existingSplits.filter(split => {
                return split.category_name !== 'M-Pesa Fees';
            });
            
            // Update transaction display
            updateTransactionDisplay();
            
        } catch (error) { console.error('Failed to load open transaction:', error);
            
            if (error.message.includes('System locked')) {
                // Try to get system status
                try {
                    const status = await api.getSystemStatus();
                    if (status.open_transaction) {
                        // Another transaction is open (shouldn't happen but just in case)
                        openTransaction = status.open_transaction;
                        updateTransactionDisplay();
                        return;
                    }
                } catch (e) {
                    // Ignore
                }
            }
            
            alert('Failed to load transaction. Please try again.');
            window.location.href = '/';
        }
    }
    
    // Load categories
    async function loadCategories() {
        try {
            const data = await api.getCategoryDropdown();
            categories = data.categories || [];
        } catch (error) {
            console.error('Failed to load categories:', error);
            // Use default categories as fallback
            categories = [
                { id: 10, name: 'Hospital Meals', display_name: '  └─ Hospital Meals' },
                { id: 11, name: 'Purchase of Medicine', display_name: '  └─ Purchase of Medicine' },
                { id: 12, name: 'Medical Supplies', display_name: '  └─ Medical Supplies' },
                { id: 13, name: 'Laboratory Supplies', display_name: '  └─ Laboratory Supplies' },
                { id: 20, name: 'Travel & Transport', display_name: '  └─ Travel & Transport' },
                { id: 21, name: 'Communication', display_name: '  └─ Communication' },
                { id: 22, name: 'Office Supplies', display_name: '  └─ Office Supplies' },
                { id: 30, name: 'Staff Allowances', display_name: '  └─ Staff Allowances' },
                { id: 31, name: 'Staff Training', display_name: '  └─ Staff Training' },
                { id: 40, name: 'Electricity & Water', display_name: '  └─ Electricity & Water' },
                { id: 41, name: 'Cleaning & Maintenance', display_name: '  └─ Cleaning & Maintenance' },
                { id: 42, name: 'Security', display_name: '  └─ Security' }
            ];
        }
    }
    
    // Update transaction display
    function updateTransactionDisplay() {
        if (!openTransaction) return;
        
        // Transaction details
        transactionIdEl.textContent = openTransaction.mpesa_transaction_id;
        transactionDateEl.textContent = api.formatDate(openTransaction.transaction_date);
        prevBalanceEl.textContent = api.formatCurrency(openTransaction.previous_balance);
        newBalanceEl.textContent = api.formatCurrency(openTransaction.new_balance);
        
        // Delta (change)
        const delta = openTransaction.delta;
        deltaEl.textContent = api.formatCurrency(Math.abs(delta));
        
        if (delta < 0) {
            deltaEl.classList.add('text-red-600');
            deltaTypeEl.textContent = 'Withdrawal';
            deltaTypeEl.className = 'ml-2 px-2 py-1 text-xs rounded-full bg-red-100 text-red-800';
        } else {
            deltaEl.classList.add('text-green-600');
            deltaTypeEl.textContent = 'Deposit';
            deltaTypeEl.className = 'ml-2 px-2 py-1 text-xs rounded-full bg-green-100 text-green-800';
        }
        
        // M-Pesa fee
        mpesaFeeEl.textContent = api.formatCurrency(openTransaction.mpesa_fee || 0);
        
        // Calculate remaining amount
        updateRemainingAmount();
    }// Calculate and update remaining amount
    function updateRemainingAmount() {
        if (!openTransaction) return;
        
        const totalClassified = calculateTotalClassified();
        const delta = openTransaction.delta;
        const fee = openTransaction.mpesa_fee || 0;
        
        const remaining = Math.abs(delta) - fee - totalClassified;
        
        // Update display
        remainingAmountEl.textContent = api.formatCurrency(remaining);
        
        // Update status
        if (Math.abs(remaining) < 0.01) { // Balanced (within 0.01 tolerance)
            balanceStatusEl.textContent = 'Balanced ✓';
            balanceStatusEl.className = 'px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800';
            
            // Enable lock button
            btnLockTransaction.disabled = false;
            btnSaveSplits.disabled = false;
        } else if (remaining > 0) {
            balanceStatusEl.textContent = `Remaining: ${api.formatCurrency(remaining)}`;
            balanceStatusEl.className = 'px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800';
            
            // Disable lock button
            btnLockTransaction.disabled = true;
            btnSaveSplits.disabled = false;
        } else {
            balanceStatusEl.textContent = `Over-allocated: ${api.formatCurrency(Math.abs(remaining))}`;
            balanceStatusEl.className = 'px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800';
            
            // Disable both buttons
            btnLockTransaction.disabled = true;
            btnSaveSplits.disabled = true;
        }
        
        // Update validation summary
        updateValidationSummary();
    }
    
    // Calculate total classified amount
    function calculateTotalClassified() {
        let total = 0;
        
        // Add existing splits
        existingSplits.forEach(split => {
            total += parseFloat(split.amount) || 0;
        });
        
        // Add splits from form
        const splitRows = splitRowsEl.querySelectorAll('.split-row');
        splitRows.forEach(row => {
            const amountInput = row.querySelector('.split-amount-input');
            if (amountInput && amountInput.value) {
                total += parseFloat(amountInput.value) || 0;
            }
        });
        
        return total;
    }
    
    // Update split rows
    function updateSplitRows() {
        splitRowsEl.innerHTML = '';
        
        // Add header
        const header = document.createElement('div');
        header.className = 'split-row-header';
        header.innerHTML = `
            <div>Category</div>
            <div>Amount</div>
            <div>Description</div>
            <div></div>
        `;
        splitRowsEl.appendChild(header);
        
        // Add existing splits
        existingSplits.forEach((split, index) => {
            addSplitRow(split, index);
        });
        
        // Add at least one empty row if no splits
        if (existingSplits.length === 0) {
            addSplitRow();
        }
        
        // Update remaining amount
        updateRemainingAmount();
         }
    
    // Add a split row
    function addSplitRow(splitData = null, index = null) {
        const rowId = splitData ? `split-${index}` : `split-new-${splitCounter++}`;
        const row = document.createElement('div');
        row.className = 'split-row';
        row.id = rowId;
        
        // Category dropdown
        const categorySelect = document.createElement('select');
        categorySelect.className = 'input-field split-category-select';
        categorySelect.innerHTML = `
            <option value="">Select Category</option>
            ${categories.map(cat => `
                <option value="${cat.id}" 
                        ${splitData && splitData.category_id == cat.id ? 'selected' : 
''}>
                    ${cat.display_name || cat.name}
                </option>
            `).join('')}
        `;
        
        // Amount input
        const amountInput = document.createElement('input');
        amountInput.type = 'number';
        amountInput.step = '0.01';
        amountInput.min = '0.01';
        amountInput.className = 'input-field split-amount-input';
        amountInput.placeholder = '0.00';
        amountInput.value = splitData ? splitData.amount.toFixed(2) : '';
        
        // Description input
        const descInput = document.createElement('input');
        descInput.type = 'text';
        descInput.className = 'input-field split-description-input';
        descInput.placeholder = 'Brief description...';
        descInput.value = splitData ? splitData.description : '';
        
        // Delete button
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'split-delete-btn';
        deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
        deleteButton.title = 'Remove this split';
        
        row.appendChild(categorySelect);
         row.appendChild(amountInput);
        row.appendChild(descInput);
        row.appendChild(deleteButton);
        
        splitRowsEl.appendChild(row);
        
        // Add event listeners
        categorySelect.addEventListener('change', updateRemainingAmount);
        amountInput.addEventListener('input', updateRemainingAmount);
        descInput.addEventListener('input', updateRemainingAmount);
        
        deleteButton.addEventListener('click', () => {
            // If this is an existing split, mark for deletion
            if (splitData) {
                existingSplits = existingSplits.filter((_, i) => i !== index);
            }
            row.remove();
            updateRemainingAmount();
        });
        
        // Validate amount on blur
        amountInput.addEventListener('blur', function() {
            const value = parseFloat(this.value);
            if (value && value > 0) {
                this.value = value.toFixed(2);
            }
        });
    }
    
    // Update auto-classified rows
    function updateAutoClassifiedRows() {
        if (!autoClassifiedBodyEl) return;
        
        autoClassifiedBodyEl.innerHTML = '';
        
        if (autoClassifiedSplits.length === 0) {
            autoClassifiedBodyEl.innerHTML = `
                <tr>
                    <td colspan="4" class="px-3 py-4 text-center text-gray-500">
                        No auto-classified items
                    </td>
                </tr>
            `;
            return;
        }
        
        autoClassifiedSplits.forEach(split => { const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    <i class="fas fa-robot text-blue-500 mr-2"></i>
                    ${split.category_name}
                </td>
                <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-900 font-mon
o">
                    ${api.formatCurrency(split.amount)}
                </td>
                <td class="px-3 py-4 text-sm text-gray-500">
                    ${split.description || 'System auto-classified'}
                </td>
                <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span class="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                        System
                    </span>
                </td>
            `;
            autoClassifiedBodyEl.appendChild(row);
        });
    }
    
    // Update validation summary
    function updateValidationSummary() {
        if (!validationSummaryEl || !openTransaction) return;
        
        const totalClassified = calculateTotalClassified();
        const delta = openTransaction.delta;
        const fee = openTransaction.mpesa_fee || 0;
        const remaining = Math.abs(delta) - fee - totalClassified;
        
        let message = '';
        let type = '';
        
        if (Math.abs(remaining) < 0.01) {
            message = `
                <strong>Ready to Lock:</strong> Transaction is fully classified and balanced.
                <ul class="mt-2 list-disc list-inside">
                    <li>Total to classify: ${api.formatCurrency(Math.abs(delta) - fee)}</li>
                    <li>Classified amount: ${api.formatCurrency(totalClassified)}</li>
                    <li>Difference: ${api.formatCurrency(remaining)}</li>
                </ul> `;
            type = 'success';
            validationSummaryEl.classList.remove('hidden');
        } else if (remaining > 0) {
            message = `
                <strong>Incomplete Classification:</strong> ${api.formatCurrency(remaining)} remaining to classify.
                <ul class="mt-2 list-disc list-inside">
                    <li>Total to classify: ${api.formatCurrency(Math.abs(delta) - fee)}</li>
                    <li>Classified amount: ${api.formatCurrency(totalClassified)}</li>
                    <li>Remaining: ${api.formatCurrency(remaining)}</li>
                </ul>
            `;
            type = 'warning';
            validationSummaryEl.classList.remove('hidden');
        } else {
            message = `
                <strong>Over-allocated:</strong> Classification exceeds transaction amount by ${api.formatCurrency(Math.abs(remaining))}.
                <ul class="mt-2 list-disc list-inside">
                    <li>Total to classify: ${api.formatCurrency(Math.abs(delta) - fee)}</li>
                    <li>Classified amount: ${api.formatCurrency(totalClassified)}</li>
                    <li>Over-allocation: ${api.formatCurrency(Math.abs(remaining))}</li>
                </ul>
                <p class="mt-2 text-sm">Please reduce allocation amounts or remove some splits.</p>
            `;
            type = 'error';
            validationSummaryEl.classList.remove('hidden');
        }
        
        validationSummaryEl.innerHTML = `
            <div class="validation-message validation-${type}">
                ${message}
            </div>
        `;
    }
    
    // Setup event listeners
    function setupEventListeners() {
        // Add category button
        if (btnAddCategory) { btnAddCategory.addEventListener('click', () => {
                addSplitRow();
            });
        }
        
        // Clear all button
        if (btnClearAll) {
            btnClearAll.addEventListener('click', () => {
                if (confirm('Clear all splits? This cannot be undone.')) {
                    existingSplits = [];
                    updateSplitRows();
                }
            });
        }
        
        // Auto-split button
        if (btnAutoSplit) {
            btnAutoSplit.addEventListener('click', suggestAutoSplit);
        }
        
        // Save splits button
        if (btnSaveSplits) {
            btnSaveSplits.addEventListener('click', saveSplits);
        }
        
        // Lock transaction button
        if (btnLockTransaction) {
            btnLockTransaction.addEventListener('click', lockTransaction);
        }
        
        // Cancel button
        if (btnCancel) {
            btnCancel.addEventListener('click', () => {
                if (cancelModal) {
                    cancelModal.classList.remove('hidden');
                }
            });
        }
        
        // Confirm cancel button
        if (btnConfirmCancel) {
            btnConfirmCancel.addEventListener('click', confirmCancel);
        }
        
        // Modal close buttons
        modalCloseBtns.forEach(btn => {
            btn.addEventListener('click', () => { cancelModal.classList.add('hidden');
                cancelReasonInput.value = '';
                adminCodeInput.value = '';
            });
        });
        
        // Close modal on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                cancelModal.classList.add('hidden');
                cancelReasonInput.value = '';
                adminCodeInput.value = '';
            }
        });
        
        // Close modal on outside click
        if (cancelModal) {
            cancelModal.addEventListener('click', (e) => {
                if (e.target === cancelModal) {
                    cancelModal.classList.add('hidden');
                    cancelReasonInput.value = '';
                    adminCodeInput.value = '';
                }
            });
        }
    }
    
    // Suggest auto-split
    function suggestAutoSplit() {
        if (!openTransaction) return;

        const remaining = Math.abs(openTransaction.delta) - (openTransaction.mpesa_fee || 0) - calculateTotalClassified();
        
        if (remaining <= 0) {
            alert('No remaining amount to allocate.');
            return;
        }
        
        // Simple suggestion: split equally among top 3 categories
        const suggestedCategories = [
            { id: 12, name: 'Medical Supplies' }, // Medical Supplies
            { id: 20, name: 'Travel & Transport' }, // Travel & Transport
            { id: 40, name: 'Electricity & Water' } // Electricity & Water
        ];
        
        const splitAmount = remaining / suggestedCategories.length;
        // Clear existing splits
        existingSplits = [];
        
        // Add suggested splits
        suggestedCategories.forEach(category => {
            existingSplits.push({
                category_id: category.id,
                category_name: category.name,
                amount: parseFloat(splitAmount.toFixed(2)),
                description: 'Auto-suggested allocation'
            });
        });
        
        // Update display
        updateSplitRows();
        alert(`Suggested split: ${suggestedCategories.length} categories at ${api.formatCurrency(splitAmount)} each.`);
    }
    
    // Save splits
    async function saveSplits() {
        if (!openTransaction) return;
        
        // Collect splits from form
        const newSplits = [];
        const splitRows = splitRowsEl.querySelectorAll('.split-row');
        
        let hasErrors = false;
        splitRows.forEach((row, index) => {
            const categorySelect = row.querySelector('.split-category-select');
            const amountInput = row.querySelector('.split-amount-input');
            const descInput = row.querySelector('.split-description-input');
            
            const categoryId = categorySelect ? parseInt(categorySelect.value) : nul
l;
            const amount = amountInput ? parseFloat(amountInput.value) : null;
            const description = descInput ? descInput.value.trim() : '';
            
            // Validate
            if (!categoryId || !amount || amount <= 0) {
                hasErrors = true;
                
                // Highlight errors
                if (categorySelect && !categoryId) {
                    categorySelect.classList.add('error');
                }if (amountInput && (!amount || amount <= 0)) {
                    amountInput.classList.add('error');
                }
                
                return;
            }
            
            // Clear errors
            if (categorySelect) categorySelect.classList.remove('error');
            if (amountInput) amountInput.classList.remove('error');
            
            newSplits.push({
                category_id: categoryId,
                amount: amount,
                description: description || `Split ${index + 1}`
            });
        });
        
        if (hasErrors) {
            alert('Please fix all errors before saving. Invalid splits are highlighted in red.');
            return;
        }
        
        if (newSplits.length === 0) {
            alert('No valid splits to save. Please add at least one category allocation.');
            return;
        }
        
        try {
            // Show loading
            btnSaveSplits.disabled = true;
            btnSaveSplits.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Saving...';
            
            // Save splits
            const result = await api.addSplits(openTransaction.id, newSplits);
            
            // Update existing splits
            existingSplits = [...existingSplits, ...newSplits];
            
            // Clear form splits
            updateSplitRows();
            
            // Show success
            alert(`Successfully saved ${newSplits.length} split(s).`);
            } catch (error) {
            console.error('Failed to save splits:', error);
            alert(`Error: ${error.message}`);
        } finally {
            // Reset button
            btnSaveSplits.disabled = false;
            btnSaveSplits.innerHTML = '<i class="fas fa-save mr-2"></i> Save Classification';
        }
    }
    
    // Lock transaction
    async function lockTransaction() {
        if (!openTransaction) return;
        
        // Final validation
        const totalClassified = calculateTotalClassified();
        const delta = openTransaction.delta;
        const fee = openTransaction.mpesa_fee || 0;
        const remaining = Math.abs(delta) - fee - totalClassified;
        
        if (Math.abs(remaining) >= 0.01) {
            alert('Transaction is not balanced. Please complete classification before locking.');
            return;
        }

        if (!confirm(`Lock this transaction? Once locked, it cannot be modified.\n\nTotal classified: ${api.formatCurrency(totalClassified)}\nM-Pesa Fee: ${api.formatCurrency(fee)}\nTransaction total: ${api.formatCurrency(Math.abs(delta))}`)) {
            return;
        }
        
        try {
            // Show loading
            btnLockTransaction.disabled = true;
            btnLockTransaction.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Locking...';
            
            // Lock transaction
            const result = await api.lockTransaction(openTransaction.id);
            
            // Success - redirect to dashboard
            alert('Transaction locked successfully! System is now unlocked for next transaction.');
            window.location.href = '/';
            } catch (error) {
            console.error('Failed to lock transaction:', error);
            alert(`Error: ${error.message}`);
            
            // Reset button
            btnLockTransaction.disabled = false;
            btnLockTransaction.innerHTML = '<i class="fas fa-lock mr-2"></i> Lock Transaction';
        }
    }
    
    // Confirm cancel (emergency unlock)
    async function confirmCancel() {
        const reason = cancelReasonInput.value.trim();
        const adminCode = adminCodeInput.value.trim();
        
        if (!reason) {
            alert('Please provide a reason for the emergency unlock.');
            return;
        }
        
        if (!adminCode) {
            alert('Please enter the admin code.');
            return;
        }

        if (!confirm('WARNING: This will delete the open transaction and unlock the system. This action is irreversible and should only be used in emergencies.\n\nAre you absolutely sure?')) {
            return;
        }
        
        try {
            // Show loading
            btnConfirmCancel.disabled = true;
            btnConfirmCancel.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Processing...';
            
            // Force unlock
            const result = await api.forceUnlockSystem(reason, adminCode);
            
            // Success
            alert('System unlocked. Transaction deleted. Redirecting to dashboard...');
            window.location.href = '/';
            } catch (error) {
console.error('Failed to force unlock:', error);
alert(`Error: ${error.message}\n\nCheck admin code and try again.`);
// Reset button
btnConfirmCancel.disabled = false;
btnConfirmCancel.innerHTML = '<i class="fas fa-unlock mr-2"></i> Force Unlock System';
}
}
// Initialize classification page
init();
});