const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const transactionsRouter = require('./routes/transactions');
const categoriesRouter = require('./routes/categories');
const walletRouter = require('./routes/wallet');
const systemRouter = require('./routes/system');
const enforceOpenTransaction = require('./middleware/enforceOpenTransaction');
const darajaService = require('./services/darajaService');
const transactionService = require('./services/transactionService');
const app = express();
require('dotenv').config();
// Security middleware
app.use(helmet({
  contentSecurityPolicy: false  // Temporarily disable CSP to test styles
}));
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increase to 1000 (or more) for development
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
//app.use('/api/', limiter);
// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
// CORS (for local development)
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:5500', 
  'http://127.0.0.1:5500'],
  credentials: true
}));
// Serve static files from client directory
app.use(express.static(path.join(__dirname, '..', '..', 'client')));
// API Routes
app.use('/api/transactions', enforceOpenTransaction, transactionsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/system', systemRouter);

// Daraja Callback Routes
app.post('/api/daraja/confirmation', async (req, res) => {
  try {
    await darajaService.processC2BConfirmation(req.body);
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    console.error('Confirmation error:', error);
    res.status(500).json({ ResultCode: 1, ResultDesc: 'Error' });
  }
});

app.post('/api/daraja/validation', async (req, res) => {
  try {
    // Optional validation logic (e.g., check BillRefNumber)
    await darajaService.processC2BValidation(req.body);
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    res.json({ ResultCode: 'C2B00011', ResultDesc: 'Rejected' });
  }
});

app.post('/api/daraja/pull-result', async (req, res) => {
  try {
    await darajaService.processPullResult(req.body);
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    console.error('Pull result error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/daraja/pull-timeout', (req, res) => {
  console.log('Pull timeout:', req.body);
  res.status(200).send();
});

app.post('/api/daraja/balance-result', async (req, res) => {
  try {
    await darajaService.processBalanceResult(req.body);
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    console.error('Balance result error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/daraja/balance-timeout', (req, res) => {
  console.log('Balance timeout:', req.body);
  res.status(200).send();
});

app.post('/api/daraja/transaction-result', async (req, res) => {
  try {
    await darajaService.processTransactionResult(req.body);
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    console.error('Transaction result error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.post('/api/daraja/transaction-timeout', (req, res) => {
  console.log('Transaction timeout:', req.body);
  res.status(200).send();
});

// Setup Routes for Testing
app.post('/api/daraja/register', async (req, res) => {
  try {
    const result = await darajaService.registerC2BUrls();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/daraja/simulate', async (req, res) => {
  const { amount, phone, billRef } = req.body;
  try {
    const result = await darajaService.simulateC2BTransaction(amount || 100, phone || '254708374149', billRef || 'test');
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/daraja/pull', async (req, res) => {
  const { startDate, endDate, offset } = req.body;
  try {
    const result = await darajaService.pullTransactions(startDate, endDate, offset || 0);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve HTML files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../client/index.html'));
});
app.get('/classify', (req, res) => {
  res.sendFile(path.join(__dirname, '../../client/classify.html'));
});
app.get('/reports', (req, res) => {
  res.sendFile(path.join(__dirname, '../../client/reports.html'));
});
// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});
// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  res.status(err.status || 500).json({ 
    error: process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message 
  });
});
module.exports = app;