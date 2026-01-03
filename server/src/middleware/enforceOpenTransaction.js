const db = require('../db/database');
/**
* Middleware to enforce single open transaction rule
* Blocks access to certain routes if system is locked
*/
module.exports = (req, res, next) => {
// Allow GET requests to always pass through
if (req.method === 'GET') {
return next();
}
// For POST/PUT/DELETE, check system state
db.get('SELECT open_transaction_id FROM system_state WHERE id = 1')
.then(systemState => {
if (systemState && systemState.open_transaction_id) {
// System is locked with an open transaction
// Only allow actions on that specific transaction
if (req.params.id && parseInt(req.params.id) === systemState.open_transaction_id) {
return next(); // Allow operations on the open transaction
}// Block all other modifications
return res.status(423).json({
error: 'System locked for transaction classification',
message: 'Please complete the open transaction classification first',
error: 'System locked for transaction classification'
});
}
// System is not locked, allow the request
return next();
})
.catch(err => {
console.error('Error checking system state:', err);
res.status(500).json({ error: 'Internal server error' });
});
};