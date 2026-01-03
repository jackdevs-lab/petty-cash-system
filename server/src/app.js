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
const app = express();
// Security middleware
app.use(helmet({
contentSecurityPolicy: {
directives: {
defaultSrc: ["'self'"],
styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
scriptSrc: ["'self'", "'unsafe-inline'"],
},
},
}));const limiter = rateLimit({
windowMs: 15 * 60 * 1000, // 15 minutes
max: 100, // Limit each IP to 100 requests per windowMs
message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);
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
app.use(express.static(path.join(__dirname, '../../client')));
// API Routes
app.use('/api/transactions', enforceOpenTransaction, transactionsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/system', systemRouter);
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
app.use((err, req, res, next) => {console.error('Server error:', err);
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