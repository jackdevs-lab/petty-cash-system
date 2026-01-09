const axios = require('axios');
const crypto = require('crypto');
const db = require('../db/database');
const Decimal = require('decimal.js');
const transactionService = require('./transactionService'); // Assuming path

class DarajaService {
  constructor() {
    this.consumerKey = process.env.MPESA_CONSUMER_KEY;
    this.consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    this.baseURL = process.env.MPESA_BASE_URL || 'https://sandbox.safaricom.co.ke';
    this.initiatorName = process.env.MPESA_INITIATOR_NAME;
    this.securityCredential = process.env.MPESA_SECURITY_CREDENTIAL; // Sandbox uses plain text
    this.shortCode = process.env.MPESA_SHORT_CODE;
    this.passkey = process.env.MPESA_PASSKEY;
  }

  /**
   * Generate access token for Daraja API
   */
  async getAccessToken() {
  try {
    // Trim any whitespace from env vars
    const key = (this.consumerKey || '').trim();
    const secret = (this.consumerSecret || '').trim();

    if (!key || !secret) {
      throw new Error('Missing MPESA_CONSUMER_KEY or MPESA_CONSUMER_SECRET in environment');
    }

    const credentials = `${key}:${secret}`;
    const auth = Buffer.from(credentials).toString('base64');

    console.log('Attempting auth with base64:', auth); // Temporary debug line

    const response = await axios.get(
      `${this.baseURL}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      }
    );

    console.log('Access token received:', response.data.access_token ? 'Success' : 'Failed');
    return response.data.access_token;
  } catch (error) {
    console.error('Access token error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    throw new Error('Failed to authenticate with M-Pesa Daraja API');
  }
}  async registerC2BUrls() {
    try {
      const accessToken = await this.getAccessToken();
      const response = await axios.post(
        `${this.baseURL}/mpesa/c2b/v1/registerurl`,
        {
          ShortCode: this.shortCode,
          ResponseType: 'Completed',
          ConfirmationURL: `${process.env.BASE_URL}/api/daraja/confirmation`,
          ValidationURL: `${process.env.BASE_URL}/api/daraja/validation`,
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
      console.error('Error registering C2B URLs:', error.response?.data || error.message);
      throw new Error('Failed to register C2B URLs');
    }
  }

  /**
   * Simulate C2B transaction for testing
   */
  async simulateC2BTransaction(amount, phoneNumber, billRef = 'test') {
    try {
      const accessToken = await this.getAccessToken();
      const response = await axios.post(
        `${this.baseURL}/mpesa/c2b/v1/simulate`,
        {
          ShortCode: this.shortCode,
          CommandID: 'CustomerPayBillOnline',
          Amount: amount,
          Msisdn: phoneNumber,
          BillRefNumber: billRef,
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
      console.error('Error simulating transaction:', error.response?.data || error.message);
      throw new Error('Failed to simulate transaction');
    }
  }

  /**
   * Process C2B validation callback (optional validation)
   */
  async processC2BValidation(payload) {
    // Add custom validation if needed, e.g., check BillRefNumber
    // For now, just log
    console.log('C2B Validation:', payload);
    // Return true to accept, false to reject
    return true;
  }

  /**
   * Process C2B confirmation callback and create transaction
   */
  async processC2BConfirmation(payload) {
    try {
      const transTime = payload.TransTime;
      const transactionDate = `${transTime.substring(0,4)}-${transTime.substring(4,6)}-${transTime.substring(6,8)}T${transTime.substring(8,10)}:${transTime.substring(10,12)}:${transTime.substring(12,14)}.000Z`;

      const transaction = {
        mpesa_transaction_id: payload.TransID,
        mpesa_reference: payload.BillRefNumber || payload.InvoiceNumber,
        amount: parseFloat(payload.TransAmount),
        phone_number: payload.MSISDN,
        transaction_date: transactionDate,
        raw_daraja_json: JSON.stringify(payload)
      };

      const wallet = await db.get('SELECT current_balance FROM wallet WHERE id = 1');
      const currentBalance = wallet ? parseFloat(wallet.current_balance) : 0;

      const delta = transaction.amount; // Deposit
      const newBalance = currentBalance + delta;

      const data = {
        ...transaction,
        previous_balance: currentBalance,
        new_balance: newBalance,
        delta: delta
      };

      // Validate and create using TransactionService (add createTransaction if not present)
      await transactionService.createTransaction(data); // You'll need to implement this in TransactionService

      return { success: true };
    } catch (error) {
      console.error('Error processing C2B confirmation:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Pull transactions
   */
  async pullTransactions(startDate, endDate, offset = 0) {
    try {
      const accessToken = await this.getAccessToken();
      const response = await axios.post(
        `${this.baseURL}/pulltransactions/v1/query`,
        {
          ShortCode: this.shortCode,
          StartDate: startDate, // YYYYMMDDHHmmss
          EndDate: endDate,
          OffSet: offset.toString(),
          TimeoutURL: `${process.env.BASE_URL}/api/daraja/pull-timeout`,
          ResultURL: `${process.env.BASE_URL}/api/daraja/pull-result`,
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
      console.error('Error pulling transactions:', error.response?.data || error.message);
      throw new Error('Failed to pull transactions');
    }
  }

  /**
   * Process pull result callback
   */
  async processPullResult(payload) {
    try {
      if (payload.Result.ResultCode !== 0) {
        console.error('Pull error:', payload.Result.ResultDesc);
        return { success: false };
      }

      const resultParams = payload.Result.ResultParameters.ResultParameter;
      const transactionListParam = resultParams.find(param => param.Key === 'TransactionList');
      if (!transactionListParam) return { success: false };

      const transactions = JSON.parse(transactionListParam.Value);

      for (const txn of transactions) {
        // Process each as C2B confirmation
        await this.processC2BConfirmation(txn);
      }

      return { success: true };
    } catch (error) {
      console.error('Error processing pull result:', error);
      return { success: false };
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
      );
      return response.data;
    } catch (error) {
      console.error('Error getting account balance:', error.response?.data || error.message);
      throw new Error('Failed to fetch M-Pesa balance');
    }
  }

  /**
   * Process balance result callback
   */
  async processBalanceResult(payload) {
    try {
      if (payload.Result.ResultCode !== 0) {
        console.error('Balance error:', payload.Result.ResultDesc);
        return { success: false };
      }

      const resultParams = payload.Result.ResultParameters.ResultParameter;
      const balanceParam = resultParams.find(param => param.Key === 'AccountBalance');
      if (!balanceParam) return { success: false };

      // Parse balance string, e.g., find Utility Account or relevant
      const balances = balanceParam.Value.split('&');
      const utilityBalance = balances.find(b => b.startsWith('Utility Account'));
      if (utilityBalance) {
        const parts = utilityBalance.split('|');
        const availableBalance = parseFloat(parts[2]);

        // Update wallet
        await db.run('UPDATE wallet SET current_balance = ? WHERE id = 1', [availableBalance]);
      }

      return { success: true };
    } catch (error) {
      console.error('Error processing balance result:', error);
      return { success: false };
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
          QueueTimeOutURL: `${process.env.BASE_URL}/api/daraja/transaction-timeout`,
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
    }
  }

  /**
   * Process transaction status result
   */
  async processTransactionResult(payload) {
    console.log('Transaction status result:', payload);
    // Add logic to update transaction status in DB if needed
    return { success: true };
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
        return result;
      }
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
   * Helper: Generate Daraja API password (base64 for STK/B2C)
   */
  generatePassword(timestamp) {
    const data = this.shortCode + this.passkey + timestamp;
    return Buffer.from(data).toString('base64');
  }
}
module.exports = new DarajaService();