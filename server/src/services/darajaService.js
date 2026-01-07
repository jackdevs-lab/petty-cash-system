const axios = require('axios');
const crypto = require('crypto');
const db = require('../db/database');
class DarajaService {
constructor() {
this.consumerKey = process.env.MPESA_CONSUMER_KEY;
this.consumerSecret = process.env.MPESA_CONSUMER_SECRET;
this.baseURL = process.env.MPESA_BASE_URL || 'https://sandbox.safaricom.co.ke';
this.initiatorName = process.env.MPESA_INITIATOR_NAME;
this.securityCredential = process.env.MPESA_SECURITY_CREDENTIAL;
this.shortCode = process.env.MPESA_SHORT_CODE;
}
/**
* Generate access token for Daraja API
*/
async getAccessToken() {
try {
const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
            
            const response = await axios.get(`${this.baseURL}/oauth/v1/generate?grant_type=client_credentials`, {
                headers: {
                    'Authorization': `Basic ${auth}`
                }
            });
            
            return response.data.access_token;
        } catch (error) {
            console.error('Error getting Daraja access token:', error.response?.data || error.message);
            throw new Error('Failed to authenticate with M-Pesa Daraja API');
        }
    }
    /**
     * Get account balance from M-Pesa
     */
    async getAccountBalance() {
        try {
            const accessToken = await this.getAccessToken();
            const timestamp = this.getTimestamp();
            const password = this.generatePassword(timestamp);
            
            const response = await axios.post(
                `${this.baseURL}/mpesa/accountbalance/v1/query`,
                {
                    Initiator: this.initiatorName,
                    SecurityCredential: this.securityCredential,
                    CommandID: 'AccountBalance',
                    PartyA: this.shortCode,
                    IdentifierType: '4',
                    Remarks: 'Petty Cash Balance Check',
                    QueueTimeOutURL: `${process.env.BASE_URL}/api/daraja/balance-timeout`,
                    ResultURL: `${process.env.BASE_URL}/api/daraja/balance-result`,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            ); return response.data;
        } catch (error) {
            console.error('Error getting account balance:', error.response?.data || error.message);
            throw new Error('Failed to fetch M-Pesa balance');
        }
    }
    /**
     * Query transaction status
     */
    async queryTransaction(transactionId) {
        try {
            const accessToken = await this.getAccessToken();
            const timestamp = this.getTimestamp();
            const password = this.generatePassword(timestamp);
            
            const response = await axios.post(
                `${this.baseURL}/mpesa/transactionstatus/v1/query`,
                {
                    Initiator: this.initiatorName,
                    SecurityCredential: this.securityCredential,
                    CommandID: 'TransactionStatusQuery',
                    TransactionID: transactionId,
                    PartyA: this.shortCode,
                    IdentifierType: '4',
                    ResultURL: `${process.env.BASE_URL}/api/daraja/transaction-result`,
                    QueueTimeOutURL: `${process.env.BASE_URL}/api/daraja/transactiontimeout`,
                    Remarks: 'Petty Cash Transaction Verification',
                    Occasion: 'TransactionQuery'
                },
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            return response.data;
        } catch (error) {
            console.error('Error querying transaction:', error.response?.data || error.message);
            throw new Error('Failed to query transaction status');
        } }
    /**
     * Process Daraja callback (simplified for this system)
     * In production, this would handle callbacks from M-Pesa
     */
    async processCallback(payload) {
        try {
            // Parse Daraja callback
            const result = payload.Result;
            const resultCode = result.ResultCode;
            
            if (resultCode !== 0) {
                console.error('Daraja callback error:', result.ResultDesc);
                return { success: false, error: result.ResultDesc };
            }
            
            // Extract transaction details
            const transaction = {
                mpesa_transaction_id: result.TransactionID,
                mpesa_reference: result.MpesaReceiptNumber || result.TransactionID,
                amount: parseFloat(result.TransactionAmount),
                phone_number: result.PhoneNumber,
                transaction_date: new Date(result.TransactionDate).toISOString(),
                raw_daraja_json: JSON.stringify(payload)
            };
            
            // Get current wallet balance
            const wallet = await db.get('SELECT current_balance FROM wallet WHERE id = 1');
            const currentBalance = wallet ? parseFloat(wallet.current_balance) : 0;
            
            // Calculate new balance
            let newBalance = currentBalance;
            let delta = 0;
            
            if (result.ResultType === 'Withdrawal') {
                newBalance = currentBalance - transaction.amount;
                delta = -transaction.amount;
            } else if (result.ResultType === 'Deposit') {
                newBalance = currentBalance + transaction.amount;
                delta = transaction.amount;
            }
            
            // Return transaction data for processing
            return {
                success: true,transaction: {
...transaction,
previous_balance: currentBalance,
new_balance: newBalance,
delta: delta
}
};
} catch (error) {
console.error('Error processing Daraja callback:', error);
return { success: false, error: error.message };
}
}
/**
* Parse SMS text for M-Pesa transactions
* Common Kenyan M-Pesa SMS formats
*/
parseSMSText(smsText) {
const patterns = [
// Withdrawal pattern
{
regex: /MK([A-Z0-9]+)\s+Confirmed\.\s+Ksh(\d+\.?\d*)\s+paid to ([^\.]+)\.\s+on (\d+\/\d+\/\d+\s+\d+:\d+)\s+([^\.]+)\.\s+Balance Ksh(\d+\.?\d*)/,
type: 'withdrawal',
groups: ['transaction_id', 'amount', 'recipient', 'date', 'account', 'balance']
},
// Deposit pattern
{
regex: /([A-Z0-9]+)\s+Confirmed\.\s+You have received Ksh(\d+\.?\d*)\s+from ([^\.]+)\.\s+on (\d+\/\d+\/\d+\s+\d+:\d+)\s+([^\.]+)\.\s+Balance Ksh(\d+\.?\d*)/,
type: 'deposit',
groups: ['transaction_id', 'amount', 'sender', 'date', 'account', 'balance']
}
];
for (const pattern of patterns) {
const match = smsText.match(pattern.regex);
if (match) {
const result = { type: pattern.type };
pattern.groups.forEach((group, index) => {
result[group] = match[index + 1];
});
return result;}
}
return null;
}
/**
* Helper: Generate timestamp in Daraja format
*/
getTimestamp() {
const now = new Date();
return now.getFullYear().toString() +
(now.getMonth() + 1).toString().padStart(2, '0') +
now.getDate().toString().padStart(2, '0') +
now.getHours().toString().padStart(2, '0') +
now.getMinutes().toString().padStart(2, '0') +
now.getSeconds().toString().padStart(2, '0');
}
/**
* Helper: Generate Daraja API password
*/
generatePassword(timestamp) {
const data = this.shortCode + process.env.MPESA_PASSKEY + timestamp;
return crypto.createHash('sha256').update(data).digest('hex');
}
}
module.exports = new DarajaService();