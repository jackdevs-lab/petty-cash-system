/**
* API Client for Petty Cash System
*/
const API_BASE_URL = 'http://localhost:3000/api';
class ApiClient {
constructor() {
this.baseUrl = API_BASE_URL;
}
/**
* Generic request method
*/
async request(endpoint, options = {}) {
const url = `${this.baseUrl}${endpoint}`;
const defaultOptions = {
headers: {
'Content-Type': 'application/json',
},
credentials: 'include',
};
const config = { ...defaultOptions, ...options };
try {
const response = await fetch(url, config);
// Handle redirects (system lock)
if (response.status === 423 && window.location.pathname !== '/classify.html') {
const data = await response.json();
if (data.redirect_to) {
window.location.href = data.redirect_to;
}
throw new Error('System locked for classification');
}
const data = await response.json();
if (!response.ok) {
throw new Error(data.error || `API error: ${response.status}`);
}
return data;
} catch (error) { console.error('API Request failed:', error);
            throw error;
        }
    }
    /**
     * System Status
     */
    async getSystemStatus() {
        return this.request('/system/status');
    }
    async getSystemHealth() {
        return this.request('/system/health');
    }
    async forceUnlockSystem(reason, adminCode) {
        return this.request('/system/force-unlock', {
            method: 'POST',
            body: JSON.stringify({ reason, admin_code: adminCode })
        });
    }
    /**
     * Wallet Operations
     */
    async getWallet() {
        return this.request('/wallet');
    }
    async syncWalletBalance(newBalance) {
        return this.request('/wallet/sync', {
            method: 'POST',
            body: JSON.stringify({ new_balance: newBalance })
        });
    }
    async getWalletHistory() {
        return this.request('/wallet/history');
    }
    /**
     * Transaction Operations
     */
    async getTransactions() {
        return this.request('/transactions');
    }async getOpenTransaction() {
        return this.request('/transactions/open');
    }
    async createTransaction(transactionData) {
        return this.request('/transactions', {
            method: 'POST',
            body: JSON.stringify(transactionData)
        });
    }
    async addSplits(transactionId, splits) {
        return this.request(`/transactions/${transactionId}/splits`, {
            method: 'POST',
            body: JSON.stringify(splits)
        });
    }
    async lockTransaction(transactionId) {
        return this.request(`/transactions/${transactionId}/lock`, {
            method: 'POST'
        });
    }
    async deleteSplit(splitId) {
        return this.request(`/transactions/splits/${splitId}`, {
            method: 'DELETE'
        });
    }
    /**
     * Category Operations
     */
    async getCategories() {
        return this.request('/categories');
    }
    async getCategoryDropdown() {
        return this.request('/categories/dropdown');
    }
    async getCategoryStats() {
        return this.request('/categories/stats');
    }
    /*** Report Operations
*/
async getTransactionReport(startDate, endDate, page = 1, limit = 10) {
const params = new URLSearchParams({
start_date: startDate,
end_date: endDate,
page: page.toString(),
limit: limit.toString()
});
return this.request(`/transactions/report?${params}`);
}
async getExpenseSummary(startDate, endDate) {
const params = new URLSearchParams({
start_date: startDate,
end_date: endDate
});
return this.request(`/transactions/summary?${params}`);
}
/**
* Helper: Parse SMS and suggest transaction
*/
parseSMSText(smsText) {
// Common M-Pesa SMS patterns in Kenya
const patterns = [
// Withdrawal: MK1234567 Confirmed. Ksh500.00 paid to JOHN DOE. on 15/12/2023 14:30 New balance Ksh4,500.00
{
regex: /MK([A-Z0-9]+)\s+Confirmed\.\s+Ksh([\d,]+\.?\d*)\s+paid to ([^\.]+)\.\s+on (\d+\/\d+\/\d+\s+\d+:\d+)\s+New balance Ksh([\d,]+\.?\d*)/,
type: 'withdrawal',
parse: (match) => ({
mpesa_transaction_id: match[1],
amount: parseFloat(match[2].replace(/,/g, '')),
recipient: match[3],
date: this.parseSMSTime(match[4]),
new_balance: parseFloat(match[5].replace(/,/g, ''))
})
},
// Deposit: QWERTY123 Confirmed. You have received Ksh1,000.00 from JANE DOE on 15/12/2023 14:30 New balance Ksh5,500.00
{
regex: /([A-Z0-9]+)\s+Confirmed\.\s+You have received Ksh([\d,]+\.?\d*)\s+from ([^\.]+)\s+on (\d+\/\d+\/\d+\s+\d+:\d+)\s+New balance Ksh([\d,]+\.?\d*)/, type: 'deposit',
                parse: (match) => ({
                    mpesa_transaction_id: match[1],
                    amount: parseFloat(match[2].replace(/,/g, '')),
                    sender: match[3],
                    date: this.parseSMSTime(match[4]),
                    new_balance: parseFloat(match[5].replace(/,/g, ''))
                })
            }
        ];
        for (const pattern of patterns) {
            const match = smsText.match(pattern.regex);
            if (match) {
                const result = pattern.parse(match);
                result.type = pattern.type;
                result.raw_sms_text = smsText;
                return result;
            }
        }
        return null;
    }
    parseSMSTime(timeStr) {
        // Convert SMS time format (DD/MM/YYYY HH:MM) to ISO
        const parts = timeStr.split(' ');
        const dateParts = parts[0].split('/');
        const timeParts = parts[1].split(':');
        
        return new Date(
            parseInt(dateParts[2]),
            parseInt(dateParts[1]) - 1,
            parseInt(dateParts[0]),
            parseInt(timeParts[0]),
            parseInt(timeParts[1])
        ).toISOString();
    }
    /**
     * Helper: Format currency for display
     */
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-KE', {
            style: 'currency',
            currency: 'KES',
            minimumFractionDigits: 2}).format(amount);
}
/**
* Helper: Format date for display
*/
formatDate(dateString) {
return new Date(dateString).toLocaleString('en-KE', {
year: 'numeric',
month: 'short',
day: 'numeric',
hour: '2-digit',
minute: '2-digit'
});
}
}
// Create singleton instance
const api = new ApiClient();
// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
module.exports = api;
}