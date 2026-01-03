const app = require('./app');
const db = require('./db/database');
const PORT = process.env.PORT || 3000;
// Initialize database
db.initializeDatabase().then(() => {
console.log('Database initialized successfully');app.listen(PORT, () => {
console.log(`Petty Cash System running on port ${PORT}`);
console.log(`Access frontend at: http://localhost:${PORT}`);
});
}).catch(err => {
console.error('Failed to initialize database:', err);
process.exit(1);
});
// Graceful shutdown
process.on('SIGTERM', () => {
console.log('SIGTERM received. Closing server...');
db.close();
process.exit(0);
});