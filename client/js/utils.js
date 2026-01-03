const Utils = {
/**
* Format date for display
*/
formatDate: function(dateString, includeTime = true) {
const date = new Date(dateString);
if (includeTime) {
return date.toLocaleString('en-KE', {
year: 'numeric',
month: 'short',
day: 'numeric',
hour: '2-digit',
minute: '2-digit'
});
} else {
return date.toLocaleDateString('en-KE', {
year: 'numeric',
month: 'short',
day: 'numeric'
});
}
},
/**
* Format currency for display (Kenyan Shillings)
*/
formatCurrency: function(amount) {
if (amount === null || amount === undefined) {
return 'Ksh 0.00';
}
// Handle negative amounts
const absAmount = Math.abs(amount);
const sign = amount < 0 ? '-' : '';
return `${sign}Ksh ${absAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, 
',')}`;
}, /**
     * Parse amount from string/number
     */
    parseAmount: function(value) {
        if (typeof value === 'number') {
            return value;
        }
        
        if (typeof value === 'string') {
            // Remove currency symbols and commas
            const clean = value.replace(/[^0-9.-]/g, '');
            const parsed = parseFloat(clean);
            
            return isNaN(parsed) ? 0 : parsed;
        }
        
        return 0;
    },
    /**
     * Validate amount (positive, max 2 decimal places)
     */
    validateAmount: function(amount) {
        if (typeof amount !== 'number') {
            return false;
        }
        
        if (amount <= 0) {
            return false;
        }
        
        // Check decimal places
        const decimalPlaces = (amount.toString().split('.')[1] || '').length;
        if (decimalPlaces > 2) {
            return false;
        }
        
        return true;
    },
    /**
     * Calculate remaining amount
     */
    calculateRemaining: function(delta, mpesaFee, classifiedTotal) {
        const totalToClassify = Math.abs(delta) - (mpesaFee || 0);
        return totalToClassify - classifiedTotal;
        },
    /**
     * Check if transaction is balanced
     */
    isBalanced: function(delta, mpesaFee, classifiedTotal, tolerance = 0.01) {
        const remaining = this.calculateRemaining(delta, mpesaFee, classifiedTotal);
        return Math.abs(remaining) < tolerance;
    },
    /**
     * Debounce function for performance
     */
    debounce: function(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    /**
     * Show notification/toast
     */
    showNotification: function(message, type = 'info') {
        // Remove existing notifications
        const existing = document.querySelector('.notification');
        if (existing) {
            existing.remove();
        }
        
        // Create notification
        const notification = document.createElement('div');
        notification.className = `notification fixed top-4 right-4 z-50 px-4 py-3 rou
nded-md shadow-lg ${
            type === 'success' ? 'bg-green-500 text-white' :
            type === 'error' ? 'bg-red-500 text-white' :
            type === 'warning' ? 'bg-yellow-500 text-white' :
            'bg-blue-500 text-white'
        }`;
        
        notification.innerHTML = `
            <div class="flex items-center">
            <i class="fas ${
                    type === 'success' ? 'fa-check-circle' :
                    type === 'error' ? 'fa-exclamation-circle' :
                    type === 'warning' ? 'fa-exclamation-triangle' :
                    'fa-info-circle'
                } mr-2"></i>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
    },
    /**
     * Confirm action with custom message
     */
    confirmAction: function(message) {
        return new Promise((resolve) => {
            // Create modal
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content max-w-md">
                    <div class="modal-header">
                        <h3 class="text-lg font-medium text-gray-900">
                            <i class="fas fa-question-circle text-blue-500 mr-2"></i>
                            Confirm Action
                        </h3>
                    </div>
                    <div class="modal-body">
                        <p class="text-gray-700">${message}</p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn-secondary" id="confirm-cance
l">
                            Cancel
                        </button>
                        <button type="button" class="btn-primary" id="confirm-ok">
                            OK
                        </button>
                    </div>
                </div>
                `;
            
            document.body.appendChild(modal);
            
            // Add event listeners
            modal.querySelector('#confirm-cancel').addEventListener('click', () => {
                modal.remove();
                resolve(false);
            });
            
            modal.querySelector('#confirm-ok').addEventListener('click', () => {
                modal.remove();
                resolve(true);
            });
            
            // Close on escape
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    modal.remove();
                    document.removeEventListener('keydown', handleEscape);
                    resolve(false);
                }
            };
            
            document.addEventListener('keydown', handleEscape);
            
            // Close on outside click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                    document.removeEventListener('keydown', handleEscape);
                    resolve(false);
                }
            });
        });
    },
    /**
     * Generate random ID for temporary use
     */
    generateId: function() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },
    /**
     * Deep clone object
     */
    clone: function(obj) {
        return JSON.parse(JSON.stringify(obj));
    },
    /**
     * Get current date in YYYY-MM-DD format
     */
    getTodayDate: function() {
        const today = new Date();
        return today.toISOString().split('T')[0];
    },
    /**
     * Get first day of current month
     */
    getFirstDayOfMonth: function() {
        const today = new Date();
        return new Date(today.getFullYear(), today.getMonth(), 1)
            .toISOString()
            .split('T')[0];
    },
    /**
     * Format date for input[type="date"]
     */
    formatDateForInput: function(dateString) {
        const date = new Date(dateString);
        return date.toISOString().split('T')[0];
    },
    /**
     * Parse M-Pesa SMS (common patterns in Kenya)
     */
    parseMpesaSMS: function(smsText) {
        const patterns = [
            // Withdrawal: MK1234567 Confirmed. Ksh500.00 paid to JOHN DOE. on 15/12/2023 14:30 New balance Ksh4,500.00
{
    regex: /MK([A-Z0-9]+)\s+Confirmed\.\s+Ksh([\d,]+\.?\d*)\s+paid to ([^\.]+)\.\s+on (\d+\/\d+\/\d+\s+\d+:\d+)\s+New balance Ksh([\d,]+\.?\d*)/,
    type: 'withdrawal',
    parse: (match) => ({
        transactionId: match[1],
        amount: parseFloat(match[2].replace(/,/g, '')),
        recipient: match[3],
        date: match[4],
        newBalance: parseFloat(match[5].replace(/,/g, ''))})
},
// Deposit: QWERTY123 Confirmed. You have received Ksh1,000.00 from JANE DOE on 15/12/2023 14:30 New balance Ksh5,500.00
{
regex: /([A-Z0-9]+)\s+Confirmed\.\s+You have received Ksh([\d,]+\.?\d*)\s+from ([^\.]+)\s+on (\d+\/\d+\/\d+\s+\d+:\d+)\s+New balance Ksh([\d,]+\.?\d*)/,
type: 'deposit',
parse: (match) => ({
transactionId: match[1],
amount: parseFloat(match[2].replace(/,/g, '')),
sender: match[3],
date: match[4],
newBalance: parseFloat(match[5].replace(/,/g, ''))
})
},
// Purchase: RF123456 Confirmed. Ksh250.00 paid to SHOP NAME. on 15/12/2023 14:30 New balance Ksh4,250.00
{
regex: /([A-Z0-9]+)\s+Confirmed\.\s+Ksh([\d,]+\.?\d*)\s+paid to ([^\.]+)\.\s+on (\d+\/\d+\/\d+\s+\d+:\d+)\s+New balance Ksh([\d,]+\.?\d*)/,
type: 'purchase',
parse: (match) => ({
transactionId: match[1],
amount: parseFloat(match[2].replace(/,/g, '')),
merchant: match[3],
date: match[4],
newBalance: parseFloat(match[5].replace(/,/g, ''))
})
}
];
for (const pattern of patterns) {
const match = smsText.match(pattern.regex);
if (match) {
try {
const result = pattern.parse(match);
result.type = pattern.type;
result.rawSMS = smsText;
// Convert date to ISO format
const dateParts = result.date.split(/[/\s:]/);
if (dateParts.length >= 5) {
const day = parseInt(dateParts[0]);
const month = parseInt(dateParts[1]) - 1;
const year = parseInt(dateParts[2]);
const hour = parseInt(dateParts[3]);
const minute = parseInt(dateParts[4]);
                        
                        result.isoDate = new Date(year, month, day, hour, minute).toI
SOString();
                    }
                    
                    return result;
                } catch (error) {
                    console.error('Error parsing SMS:', error);
                    return null;
                }
            }
        }
        return null;
    },
    /**
     * Calculate M-Pesa fee based on Kenyan rates
     */
    calculateMpesaFee: function(amount) {
        const absAmount = Math.abs(amount);
        let fee = 0;
        
        // Standard M-Pesa withdrawal fees (Kenya, as of 2024)
        if (absAmount <= 100) fee = 7;
        else if (absAmount <= 500) fee = 13;
        else if (absAmount <= 1000) fee = 25;
        else if (absAmount <= 1500) fee = 33;
        else if (absAmount <= 2500) fee = 48;
        else if (absAmount <= 3500) fee = 60;
        else if (absAmount <= 5000) fee = 75;
        else if (absAmount <= 7500) fee = 87;
        else if (absAmount <= 10000) fee = 99;
        else if (absAmount <= 15000) fee = 110;
        else if (absAmount <= 20000) fee = 121;
        else fee = 165; // For amounts over 20,000
        
        return fee;
    },
    /**
     * Generate audit trail entry
     */
    createAuditEntry: function(action, details, userId = 'system') {
        return {
            id: this.generateId(),
            timestamp: new Date().toISOString(),
            action: action,
            details: details,
            userId: userId,
            userAgent: navigator.userAgent,
            ip: 'localhost' // In production, get from request
        };
    },
    /**
     * Validate email (for potential future use)
     */
    isValidEmail: function(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },
    /**
     * Sanitize input (basic XSS protection)
     */
    sanitizeInput: function(input) {
        if (typeof input !== 'string') return input;
        
        return input
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    },
    /**
     * Truncate text with ellipsis
     */
    truncateText: function(text, maxLength = 100) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    },
    /**
     * Get file size in readable format
     */
    formatFileSize: function(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    /**
     * Delay function (for async operations)
     */
    delay: function(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    /**
     * Copy text to clipboard
     */
    copyToClipboard: function(text) {
        return new Promise((resolve, reject) => {
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text)
                    .then(resolve)
                    .catch(reject);
            } else {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                
                try {
                    document.execCommand('copy');
                    resolve();
                } catch (err) {
                    reject(err);
                }
                
                textArea.remove();
            }
        });
    }
};
if (typeof window !== 'undefined') {
window.Utils = Utils;
}
// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
module.exports = Utils;
}