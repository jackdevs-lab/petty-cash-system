document.addEventListener('DOMContentLoaded', async function() {
// DOM Elements
const lockWarningEl = document.getElementById('lock-warning');
const systemStatusBadgeEl = document.getElementById('system-status-badge');
const totalExpensesEl = document.getElementById('total-expenses');
const totalTransactionsEl = document.getElementById('total-transactions');
const categoriesUsedEl = document.getElementById('categories-used');
const totalFeesEl = document.getElementById('total-fees');
const reportFromInput = document.getElementById('report-from');
const reportToInput = document.getElementById('report-to');
const btnGenerateReport = document.getElementById('btn-generate-report');
const reportBodyEl = document.getElementById('report-body');
const reportStartEl = document.getElementById('report-start');
const reportEndEl = document.getElementById('report-end');
const reportTotalEl = document.getElementById('report-total');
const reportPrevBtn = document.getElementById('report-prev');
const reportNextBtn = document.getElementById('report-next');
const btnExportCsv = document.getElementById('btn-export-csv');
const btnExportPdf = document.getElementById('btn-export-pdf');
const btnPrintReport = document.getElementById('btn-print-report');
    
    const detailModal = document.getElementById('detail-modal');
    const detailContentEl = document.getElementById('detail-content');
    
    // Chart instances
    let categoryChart = null;
    let trendChart = null;
    
    // State
    let systemStatus = null;
    let currentReport = null;
    let currentPage = 1;
    const pageSize = 10;
    
    // Date range (default: current month)
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // Initialize
    async function init() {
        // Set default date range
        if (reportFromInput) {
            reportFromInput.value = firstDayOfMonth.toISOString().split('T')[0];
        }
        if (reportToInput) {
            reportToInput.value = today.toISOString().split('T')[0];
        }
        
        // Load system status
        await loadSystemStatus();
        
        // Load initial report
        await generateReport();
        
        // Setup event listeners
        setupEventListeners();
        
        // Initialize charts
        initCharts();
    }
    
    // Load system status
    async function loadSystemStatus() {
        try {
            systemStatus = await api.getSystemStatus();
            // Update status badge
            if (systemStatusBadgeEl) {
                const isLocked = systemStatus.system_locked;
                systemStatusBadgeEl.textContent = isLocked ? 'Locked' : 'Active';
                systemStatusBadgeEl.className = isLocked 
                    ? 'px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 textyellow-800'
                    : 'px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800';
            }
            
            // Show/hide lock warning
            if (lockWarningEl) {
                if (systemStatus.system_locked) {
                    lockWarningEl.classList.remove('hidden');
                } else {
                    lockWarningEl.classList.add('hidden');
                }
            }
            
        } catch (error) {
            console.error('Failed to load system status:', error);
        }
    }
    
    // Generate report
    async function generateReport(page = 1) {
        const fromDate = reportFromInput ? reportFromInput.value : '';
        const toDate = reportToInput ? reportToInput.value : '';
        
        if (!fromDate || !toDate) {
            alert('Please select both start and end dates.');
            return;
        }
        
        if (new Date(fromDate) > new Date(toDate)) {
            alert('Start date cannot be after end date.');
            return;
        }
        
        try {
            // Show loading
            reportBodyEl.innerHTML = `
                <tr>
                    <td colspan="6" class="px-3 py-8 text-center">
                        <div class="text-gray-500">
                            <i class="fas fa-spinner fa-spin text-3xl mb-2"></i>
                            <p>Generating report...</p>
                        </div>
                    </td>
                </tr>
            `;
            
            // In a full implementation, this would call the report API
            // For now, we'll simulate with existing data
            await simulateReportData(fromDate, toDate, page);
            
        } catch (error) {
            console.error('Failed to generate report:', error);
            reportBodyEl.innerHTML = `
                <tr>
                    <td colspan="6" class="px-3 py-8 text-center text-red-500">
                        <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
                        <p>Failed to generate report: ${error.message}</p>
                    </td>
                </tr>
            `;
        }
    }
    
    // Simulate report data (in production, this would come from API)
    async function simulateReportData(fromDate, toDate, page) {
        // Get transactions
        const transactionsData = await api.getTransactions();
        const allTransactions = transactionsData.transactions || [];
        
        // Filter by date range and status (only LOCKED transactions)
        const filteredTransactions = allTransactions.filter(t => {
            const transactionDate = new Date(t.transaction_date).toISOString().split('T')[0];
            return transactionDate >= fromDate && 
                   transactionDate <= toDate &&
                   t.status === 'LOCKED';
        });
        
        // Paginate
        const startIndex = (page - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, filteredTransactions.length);
        const pageTransactions = filteredTransactions.slice(startIndex, endIndex);
        
        // Update summary statistics
        updateSummaryStats(filteredTransactions);
        // Update report table
        updateReportTable(pageTransactions, filteredTransactions.length, page);
        
        // Update charts
        updateCharts(filteredTransactions);
        
        // Store current report state
        currentReport = {
            fromDate,
            toDate,
            transactions: filteredTransactions,
            page,
            total: filteredTransactions.length
        };
    }
    
    // Update summary statistics
    function updateSummaryStats(transactions) {
        // Total expenses (sum of negative deltas)
        const totalExpenses = transactions
            .filter(t => t.delta < 0)
            .reduce((sum, t) => sum + Math.abs(t.delta), 0);
        
        // Total M-Pesa fees
        const totalFees = transactions
            .reduce((sum, t) => sum + (t.mpesa_fee || 0), 0);
        
        // Count unique categories (would need actual split data in production)
        const categoriesUsed = transactions.length > 0 ? 'Multiple' : '0';
        
        // Update DOM
        if (totalExpensesEl) {
            totalExpensesEl.textContent = api.formatCurrency(totalExpenses);
        }
        
        if (totalTransactionsEl) {
            totalTransactionsEl.textContent = transactions.length.toString();
        }
        
        if (categoriesUsedEl) {
            categoriesUsedEl.textContent = categoriesUsed;
        }
        
        if (totalFeesEl) {
            totalFeesEl.textContent = api.formatCurrency(totalFees);
        }
    }
    // Update report table
    function updateReportTable(transactions, total, page) {
        if (!reportBodyEl) return;
        
        reportBodyEl.innerHTML = '';
        
        if (transactions.length === 0) {
            reportBodyEl.innerHTML = `
                <tr>
                    <td colspan="6" class="px-3 py-8 text-center">
                        <div class="text-gray-500">
                            <i class="fas fa-inbox text-3xl mb-2"></i>
                            <p>No transactions found in selected date range.</p>
                        </div>
                    </td>
                </tr>
            `;
            
            // Update pagination
            updatePagination(0, 0, 0);
            return;
        }
        
        // Add rows for each transaction
        transactions.forEach(transaction => {
            const row = document.createElement('tr');
            const isPositive = transaction.delta > 0;
            const amountClass = isPositive ? 'text-green-600' : 'text-red-600';
            const amountSign = isPositive ? '+' : '';
            
            row.innerHTML = `
                <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${api.formatDate(transaction.transaction_date)}
                </td>
                <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                    ${transaction.mpesa_transaction_id}
                </td>
                <td class="px-3 py-4 whitespace-nowrap text-sm ${amountClass} font-medium">
                    ${amountSign}${api.formatCurrency(Math.abs(transaction.delta))}
                </td>
                <td class="px-3 py-4 text-sm text-gray-500">
                    ${transaction.mpesa_fee ? `Includes ${api.formatCurrency(transaction.mpesa_fee)} M-Pesa fee` : 'No fees'}
                </td>
                <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    <span class="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                        Classified
                    </span>
                </td>
                <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                    <button class="text-blue-600 hover:text-blue-900 view-detail" data-id="${transaction.id}">
                        <i class="fas fa-eye mr-1"></i> Details
                    </button>
                </td>
            `;
            
            reportBodyEl.appendChild(row);
        });
        
        // Update pagination
        const startIndex = (page - 1) * pageSize + 1;
        const endIndex = Math.min(startIndex + pageSize - 1, total);
        updatePagination(startIndex, endIndex, total);
        
        // Add event listeners to detail buttons
        document.querySelectorAll('.view-detail').forEach(button => {
            button.addEventListener('click', function() {
                const transactionId = this.getAttribute('data-id');
                showTransactionDetail(transactionId);
            });
        });
    }
    
    // Update pagination
    function updatePagination(start, end, total) {
        if (reportStartEl) reportStartEl.textContent = start;
        if (reportEndEl) reportEndEl.textContent = end;
        if (reportTotalEl) reportTotalEl.textContent = total;
        
        // Update button states
        if (reportPrevBtn) {
            reportPrevBtn.disabled = currentPage <= 1;
        }
        
        if (reportNextBtn) {
            reportNextBtn.disabled = end >= total;
        }
    }
    // Initialize charts
    function initCharts() {
        // Category distribution chart
        const categoryCtx = document.getElementById('category-chart');
        if (categoryCtx) {
            categoryChart = new Chart(categoryCtx.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['No data'],
                    datasets: [{
                        data: [100],
                        backgroundColor: ['#e5e7eb']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right'
                        },
                        title: {
                            display: true,
                            text: 'Expense Distribution'
                        }
                    }
                }
            });
        }
        
        // Trend chart
        const trendCtx = document.getElementById('trend-chart');
        if (trendCtx) {
            trendChart = new Chart(trendCtx.getContext('2d'), {
                type: 'line',
                data: {
                    labels: ['No data'],
                    datasets: [{
                        label: 'Expenses',
                        data: [0],
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.1
                    }]
                },
                options: {responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: 'Monthly Expense Trend'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return 'Ksh ' + value;
                                }
                            }
                        }
                    }
                }
            });
        }
    }
    
    // Update charts with data
    function updateCharts(transactions) {
        if (!transactions || transactions.length === 0) {
            // Reset charts to empty state
            if (categoryChart) {
                categoryChart.data.labels = ['No data'];
                categoryChart.data.datasets[0].data = [100];
                categoryChart.data.datasets[0].backgroundColor = ['#e5e7eb'];
                categoryChart.update();
            }
            
            if (trendChart) {
                trendChart.data.labels = ['No data'];
                trendChart.data.datasets[0].data = [0];
                trendChart.update();
            }
            
            return;
        }

        // Prepare category data (simulated - in production would use actual split data)
        const categoryData = {
            'Medical Supplies': 35,
            'Travel & Transport': 25,
            'Hospital Meals': 15,
            'Purchase of Medicine': 10,
            'Administrative': 10,
            'Other': 5
        };
        
        // Update category chart
        if (categoryChart) {
            categoryChart.data.labels = Object.keys(categoryData);
            categoryChart.data.datasets[0].data = Object.values(categoryData);
            categoryChart.data.datasets[0].backgroundColor = [
                '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280'
            ];
            categoryChart.update();
        }
        
        // Prepare trend data (group by month)
        const monthlyData = {};
        transactions.forEach(t => {
            const date = new Date(t.transaction_date);
            const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
            const monthName = date.toLocaleDateString('en-KE', { month: 'short', year: 'numeric' });
            
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = {
                    name: monthName,
                    total: 0
                };
            }
            
            if (t.delta < 0) { // Only expenses
                monthlyData[monthKey].total += Math.abs(t.delta);
            }
        });
        
        // Sort by date
        const sortedMonths = Object.keys(monthlyData).sort();
        const monthLabels = sortedMonths.map(key => monthlyData[key].name);
        const monthTotals = sortedMonths.map(key => monthlyData[key].total);
        
        // Update trend chart
        if (trendChart) {
            trendChart.data.labels = monthLabels;
            trendChart.data.datasets[0].data = monthTotals;
            trendChart.update();
            }
    }
    
    // Show transaction detail
    async function showTransactionDetail(transactionId) {
        try {
            // In production, this would fetch detailed transaction data
            // For now, we'll simulate
            const detailHtml = `
                <div class="space-y-6">
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <h4 class="font-medium text-gray-900 mb-2">Transaction Summar
y</h4>
                        <dl class="grid grid-cols-2 gap-4">
                            <div>
                                <dt class="text-sm text-gray-500">Transaction ID</dt>
                                <dd class="text-sm font-mono">TRX-${transactionId}-MP
ESA</dd>
                            </div>
                            <div>
                                <dt class="text-sm text-gray-500">Date</dt>
                                <dd class="text-sm">${new Date().toLocaleDateString
('en-KE')}</dd>
                            </div>
                            <div>
                                <dt class="text-sm text-gray-500">Total Amount</dt>
                                <dd class="text-sm font-bold">Ksh 2,000.00</dd>
                            </div>
                            <div>
                                <dt class="text-sm text-gray-500">M-Pesa Fee</dt>
                                <dd class="text-sm">Ksh 28.00</dd>
                            </div>
                        </dl>
                    </div>
                    
                    <div>
                        <h4 class="font-medium text-gray-900 mb-2">Category Allocatio
ns</h4>
                        <div class="overflow-x-auto">
                            <table class="min-w-full divide-y divide-gray-200">
                                <thead>
                                    <tr>
                                        <th class="px-3 py-2 text-left text-xs font-m
edium text-gray-500">Category</th>
                                        <th class="px-3 py-2 text-left text-xs font-m
edium text-gray-500">Amount</th>
                                        <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-200">
                                    <tr>
                                        <td class="px-3 py-2 text-sm">Medical Supplie
s</td>
                                        <td class="px-3 py-2 text-sm font-mono">Ksh 
1,200.00</td>
                                        <td class="px-3 py-2 text-sm">Bandages and gl
oves</td>
                                    </tr>
                                    <tr>
                                        <td class="px-3 py-2 text-sm">Travel & Transp
ort</td>
                                        <td class="px-3 py-2 text-sm font-mono">Ksh 5
00.00</td>
                                        <td class="px-3 py-2 text-sm">Fuel for ambula
nce</td>
                                    </tr>
                                    <tr>
                                        <td class="px-3 py-2 text-sm">M-Pesa Fees</td
>
                                        <td class="px-3 py-2 text-sm font-mono">Ksh 2
8.00</td>
                                        <td class="px-3 py-2 text-sm">Transaction cha
rge</td>
                                    </tr>
                                    <tr class="bg-gray-50">
                                        <td class="px-3 py-2 text-sm font-bold">Total
</td>
                                        <td class="px-3 py-2 text-sm font-bold font-m
ono">Ksh 1,728.00</td>
                                        <td class="px-3 py-2 text-sm"></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    <div class="text-sm text-gray-500">
                        <p><i class="fas fa-info-circle mr-1"></i> This is a simulate
d transaction detail view. In production, this would show actual transaction data.</p
>
                    </div>
                </div>
            `;
            detailContentEl.innerHTML = detailHtml;
            detailModal.classList.remove('hidden');
            
        } catch (error) {
            console.error('Failed to load transaction detail:', error);
            detailContentEl.innerHTML = `
                <div class="text-center py-8 text-red-500">
                    <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
                    <p>Failed to load transaction details.</p>
                </div>
            `;
            detailModal.classList.remove('hidden');
        }
    }
    
    // Setup event listeners
    function setupEventListeners() {
        // Generate report button
        if (btnGenerateReport) {
            btnGenerateReport.addEventListener('click', () => {
                currentPage = 1;
                generateReport(currentPage);
            });
        }
        
        // Pagination buttons
        if (reportPrevBtn) {
            reportPrevBtn.addEventListener('click', () => {
                if (currentPage > 1) {
                    currentPage--;
                    generateReport(currentPage);
                }
            });
        }
        
        if (reportNextBtn) {
            reportNextBtn.addEventListener('click', () => {
                if (currentReport && currentPage * pageSize < currentReport.total) {
                    currentPage++;
                    generateReport(currentPage);
                }
            });
        }
        
        // Export buttons
        if (btnExportCsv) {btnExportCsv.addEventListener('click', exportCSV);
        }
        
        if (btnExportPdf) {
            btnExportPdf.addEventListener('click', exportPDF);
        }
        
        if (btnPrintReport) {
            btnPrintReport.addEventListener('click', printReport);
        }
        
        // Modal close
        const modalCloseBtns = document.querySelectorAll('.modal-close');
        modalCloseBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                detailModal.classList.add('hidden');
            });
        });
        
        // Close modal on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                detailModal.classList.add('hidden');
            }
        });
        
        // Close modal on outside click
        if (detailModal) {
            detailModal.addEventListener('click', (e) => {
                if (e.target === detailModal) {
                    detailModal.classList.add('hidden');
                }
            });
        }
    }
    
    // Export to CSV
    function exportCSV() {
        if (!currentReport || currentReport.transactions.length === 0) {
            alert('No data to export. Please generate a report first.');
            return;
        }
        
        // Create CSV content
        const headers = ['Date', 'Transaction ID', 'Amount', 'M-Pesa Fee', 'Type', 'Status'];
        const rows = currentReport.transactions.map(t => [new Date(t.transaction_date).toLocaleDateString('en-KE'),
t.mpesa_transaction_id,
Math.abs(t.delta).toFixed(2),
(t.mpesa_fee || 0).toFixed(2),
t.delta > 0 ? 'Deposit' : 'Withdrawal',
'Classified'
]);
const csvContent = [
headers.join(','),
...rows.map(row => row.join(','))
].join('\n');
// Create download link
const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
const link = document.createElement('a');
const url = URL.createObjectURL(blob);
link.setAttribute('href', url);
link.setAttribute('download', `petty-cash-report-${currentReport.fromDate}-to-${currentReport.toDate}.csv`);
link.style.visibility = 'hidden';
document.body.appendChild(link);
link.click();
document.body.removeChild(link);
alert('CSV export started. Check your downloads folder.');
}
// Export to PDF (simulated)
function exportPDF() {
if (!currentReport || currentReport.transactions.length === 0) {
alert('No data to export. Please generate a report first.');
return;
}
// In production, this would use a PDF library
// For now, we'll simulate
alert('PDF export would generate here. In production, this would create a formatted PDF report.');
}
// Print report
function printReport() {
if (!currentReport || currentReport.transactions.length === 0) {
alert('No data to print. Please generate a report first.');
return;
        }
        
        // Create print-friendly version
        const printWindow = window.open('', '_blank');
        const fromDate = new Date(currentReport.fromDate).toLocaleDateString('en-KE');
        const toDate = new Date(currentReport.toDate).toLocaleDateString('en-KE');
        
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Petty Cash Report - ${fromDate} to ${toDate}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    h1 { color: #333; }
                    .header { margin-bottom: 30px; }
                    .summary { margin-bottom: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; 
}
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; 
}
                    th { background-color: #f5f5f5; }
                    .footer { margin-top: 30px; font-size: 12px; color: #666; }
                    @media print {
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Petty Cash Management System Report</h1>
                    <p>Hospital SME - Kenya</p>
                    <p>Period: ${fromDate} to ${toDate}</p>
                    <p>Generated: ${new Date().toLocaleString('en-KE')}</p>
                </div>
                
                <div class="summary">
                    <h3>Summary</h3>
                    <p>Total Transactions: ${currentReport.transactions.length}</p>
                    <p>Total Expenses: ${api.formatCurrency(currentReport.transactions.filter(t => t.delta < 0).reduce((sum, t) => sum + Math.abs(t.delta), 0))}</p>
                </div>
                
                <table>
                    <thead><tr>
                            <th>Date</th>
                            <th>Transaction ID</th>
                            <th>Amount</th>
                            <th>Type</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${currentReport.transactions.map(t => `
                            <tr>
                                <td>${new Date(t.transaction_date).toLocaleDateString
('en-KE')}</td>
                                <td>${t.mpesa_transaction_id}</td>
                                <td>${api.formatCurrency(Math.abs(t.delta))}</td>
                                <td>${t.delta > 0 ? 'Deposit' : 'Withdrawal'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                
                <div class="footer">
                    <p>This is an auditable financial report. All transactions are cl
assified and locked.</p>
                    <p>System: Petty Cash Management v1.0</p>
                </div>
                
                <div class="no-print">
                    <button onclick="window.print()">Print Report</button>
                    <button onclick="window.close()">Close</button>
                </div>
                
                <script>
                    window.onload = function() {
                        window.print();
                    };
                </script>
            </body>
            </html>
        `);
        
        printWindow.document.close();
    }
    
    // Initialize reports page
    init();
});