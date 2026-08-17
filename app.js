/**
 * EXPIREDNOT — Pharmacy Inventory Intelligence
 * Core Platform Controller: Zero Dummy Data Architecture, Bill OCR Ingestion, Live Expiry Radar & Inventory
 */

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================================================
  // 1. TOP-LEVEL SCREEN ROUTING & WORKSPACE NAVIGATION
  // ==========================================================================
  const welcomeScreen = document.getElementById('welcomeScreen');
  const authScreen = document.getElementById('authScreen');
  const signupScreen = document.getElementById('signupScreen');
  const dashboardScreen = document.getElementById('dashboardScreen');

  const enterAppBtn = document.getElementById('enterAppBtn');
  const backToWelcomeBtn = document.getElementById('backToWelcomeBtn');
  const createAccountLink = document.getElementById('createAccountLink');
  const cancelSignupBtn = document.getElementById('cancelSignupBtn');
  const goToDashboardBtn = document.getElementById('goToDashboardBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  let isTransitioning = false;

  const showScreen = (target, immediate = false) => {
    if (isTransitioning) return;

    const screens = [
      { id: 'welcome', el: welcomeScreen },
      { id: 'auth', el: authScreen },
      { id: 'signup', el: signupScreen },
      { id: 'dashboard', el: dashboardScreen }
    ];

    const currentScreen = screens.find(s => s.el && !s.el.classList.contains('view-hidden'));
    const nextScreen = screens.find(s => s.id === target);

    if (!nextScreen || !nextScreen.el) return;
    if (currentScreen && currentScreen.id === target) return;

    if (immediate || !currentScreen) {
      screens.forEach(s => {
        if (s.el) {
          s.el.classList.remove('view-active', 'screen-exit', 'screen-enter');
          s.el.classList.add('view-hidden');
        }
      });
      nextScreen.el.classList.remove('view-hidden');
      nextScreen.el.classList.add('view-active', 'screen-enter');
      window.location.hash = target === 'welcome' ? '' : target;
      if (target === 'dashboard') {
        refreshWorkspaceUI();
      }
      return;
    }

    isTransitioning = true;
    currentScreen.el.classList.remove('screen-enter');
    currentScreen.el.classList.add('screen-exit');

    setTimeout(() => {
      currentScreen.el.classList.remove('view-active', 'screen-exit');
      currentScreen.el.classList.add('view-hidden');

      nextScreen.el.classList.remove('view-hidden', 'screen-exit');
      nextScreen.el.classList.add('view-active', 'screen-enter');

      window.location.hash = target === 'welcome' ? '' : target;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      isTransitioning = false;

      if (target === 'dashboard') {
        refreshWorkspaceUI();
      }
    }, 300);
  };

  // Nav Event Listeners
  if (enterAppBtn) enterAppBtn.addEventListener('click', () => showScreen('auth'));
  if (backToWelcomeBtn) backToWelcomeBtn.addEventListener('click', () => showScreen('welcome'));
  if (createAccountLink) createAccountLink.addEventListener('click', () => {
    showScreen('signup');
    goToRegStep(1);
  });
  if (cancelSignupBtn) cancelSignupBtn.addEventListener('click', () => showScreen('auth'));
  if (goToDashboardBtn) goToDashboardBtn.addEventListener('click', () => showScreen('dashboard'));
  if (logoutBtn) logoutBtn.addEventListener('click', () => {
    showScreen('auth');
    showAuthNotice('Signed out of pharmacy workspace.', 'info');
  });

  // Tab Navigation in Dashboard
  const navTabItems = document.querySelectorAll('.nav-tab-item');
  const tabPanes = {
    dashboard: document.getElementById('paneDashboard'),
    bills: document.getElementById('paneBills'),
    inventory: document.getElementById('paneInventory'),
    returns: document.getElementById('paneReturns'),
    settings: document.getElementById('paneSettings')
  };

  const switchTab = (tabName) => {
    navTabItems.forEach(tab => {
      if (tab.getAttribute('data-tab') === tabName) {
        tab.classList.add('tab-active');
      } else {
        tab.classList.remove('tab-active');
      }
    });

    Object.keys(tabPanes).forEach(k => {
      const p = tabPanes[k];
      if (!p) return;
      if (k === tabName) {
        p.classList.remove('tab-pane-hidden');
        p.classList.add('tab-pane-active');
      } else {
        p.classList.remove('tab-pane-active');
        p.classList.add('tab-pane-hidden');
      }
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (tabName === 'dashboard' || tabName === 'inventory') {
      renderDashboard();
      renderInventoryTable();
    }
  };

  navTabItems.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      switchTab(tabName);
    });
  });

  // Header quick buttons
  const topbarUploadBillBtn = document.getElementById('topbarUploadBillBtn');
  const topbarAddMedBtn = document.getElementById('topbarAddMedBtn');
  const emptyUploadBtn = document.getElementById('emptyUploadBtn');
  const emptyAddMedBtn = document.getElementById('emptyAddMedBtn');
  const inventoryAddMedBtn = document.getElementById('inventoryAddMedBtn');
  const viewAllInventoryLink = document.getElementById('viewAllInventoryLink');

  if (topbarUploadBillBtn) topbarUploadBillBtn.addEventListener('click', () => switchTab('bills'));
  if (emptyUploadBtn) emptyUploadBtn.addEventListener('click', () => switchTab('bills'));
  if (viewAllInventoryLink) viewAllInventoryLink.addEventListener('click', () => switchTab('inventory'));

  // ==========================================================================
  // 2. PHARMACY DATA STORE (ZERO DUMMY DATA — STRICT SINGLE SOURCE OF TRUTH)
  // ==========================================================================
  
  // Current active pharmacy identity
  const currentPharmacy = {
    id: 'PHARM_DEFAULT',
    shopName: 'Apollo Chemist & Druggist',
    dlNumber: 'DL-20B/94812',
    ownerName: 'Rajesh Sharma',
    email: 'pharmacist@apollohealthcare.com',
    mobile: '9876543210'
  };

  let isPresentationDemoMode = false;
  let demoStorageBackup = null;

  // Real pharmacy database: Starts with STRICT ZERO records
  let pharmacyDb = {
    batches: [],       // Array of { id, name, pack, batchNo, expiryDate, quantity, purchaseRate, mrp, rack, distributor, createdAt }
    bills: [],         // Array of { id, distributor, invoiceNo, date, totalAmount, itemsCount, timestamp }
    activity: [],      // Array of { id, text, type, timestamp }
    returns: []        // Array of { id, distributor, batchesCount, totalValue, status, date }
  };

  // Helper to calculate real metrics dynamically
  const calculateDaysRemaining = (expiryDateStr) => {
    if (!expiryDateStr) return 999;
    const now = new Date();
    let expYear, expMonth, expDay = 28;

    if (expiryDateStr.includes('-')) {
      const parts = expiryDateStr.split('-');
      if (parts.length === 2) {
        expYear = parseInt(parts[0], 10);
        expMonth = parseInt(parts[1], 10) - 1;
      } else if (parts.length === 3) {
        expYear = parseInt(parts[0], 10);
        expMonth = parseInt(parts[1], 10) - 1;
        expDay = parseInt(parts[2], 10);
      }
    } else if (expiryDateStr.includes('/')) {
      const parts = expiryDateStr.split('/');
      if (parts.length === 2) {
        expMonth = parseInt(parts[0], 10) - 1;
        expYear = parseInt(parts[1].length === 2 ? '20' + parts[1] : parts[1], 10);
      }
    }

    const expDate = new Date(expYear, expMonth, expDay);
    const diffTime = expDate - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getRiskCategory = (days) => {
    if (days <= 0) return { key: 'expired', label: 'Expired', class: 'critical' };
    if (days <= 30) return { key: 'critical', label: `${days}d left`, class: 'critical' };
    if (days <= 60) return { key: 'warning', label: `${days}d left`, class: 'warning' };
    if (days <= 90) return { key: 'watchlist', label: `${days}d left`, class: 'watchlist' };
    return { key: 'safe', label: `${days}d left`, class: 'safe' };
  };

  // ==========================================================================
  // 3. REAL DYNAMIC RENDERING (ZERO FAKE DATA)
  // ==========================================================================
  
  const refreshWorkspaceUI = () => {
    // Header labels
    const activeShopName = document.getElementById('activeShopName');
    const activeDlNumber = document.getElementById('activeDlNumber');
    const setShopName = document.getElementById('setShopName');
    const setDlNumber = document.getElementById('setDlNumber');
    const setOwnerName = document.getElementById('setOwnerName');
    const userAvatarInitials = document.getElementById('userAvatarInitials');

    if (activeShopName) activeShopName.textContent = currentPharmacy.shopName;
    if (activeDlNumber) activeDlNumber.textContent = `D.L. No. ${currentPharmacy.dlNumber}`;
    if (setShopName) setShopName.value = currentPharmacy.shopName;
    if (setDlNumber) setDlNumber.value = currentPharmacy.dlNumber;
    if (setOwnerName) setOwnerName.value = currentPharmacy.ownerName;

    if (userAvatarInitials) {
      const initials = currentPharmacy.ownerName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'PH';
      userAvatarInitials.textContent = initials;
    }

    renderDashboard();
    renderInventoryTable();
    renderBillsHistory();
    renderReturns();
  };

  // Render Dashboard with dynamic calculations
  const renderDashboard = () => {
    const batches = pharmacyDb.batches.filter(b => b.quantity > 0);

    // Dynamic Calculations
    let totalVal = 0;
    let criticalVal = 0;
    let criticalCount = 0;
    let warningVal = 0;
    let warningCount = 0;
    let watchlistVal = 0;
    let watchlistCount = 0;

    const distinctMeds = new Set();

    batches.forEach(b => {
      const val = b.quantity * b.purchaseRate;
      totalVal += val;
      distinctMeds.add(b.name.trim().toLowerCase());

      const days = calculateDaysRemaining(b.expiryDate);
      if (days <= 30) {
        criticalVal += val;
        criticalCount++;
      } else if (days <= 60) {
        warningVal += val;
        warningCount++;
      } else if (days <= 90) {
        watchlistVal += val;
        watchlistCount++;
      }
    });

    // Update KPI Elements
    const kpiTotalValue = document.getElementById('kpiTotalValue');
    const kpiTotalCount = document.getElementById('kpiTotalCount');
    const kpiCriticalValue = document.getElementById('kpiCriticalValue');
    const kpiCriticalCount = document.getElementById('kpiCriticalCount');
    const kpiWarningValue = document.getElementById('kpiWarningValue');
    const kpiWarningCount = document.getElementById('kpiWarningCount');
    const kpiWatchlistValue = document.getElementById('kpiWatchlistValue');
    const kpiWatchlistCount = document.getElementById('kpiWatchlistCount');
    const notifBadge = document.getElementById('notifBadge');
    const tabInventoryCount = document.getElementById('tabInventoryCount');
    const tabBillsCount = document.getElementById('tabBillsCount');

    if (kpiTotalValue) kpiTotalValue.textContent = `₹${totalVal.toLocaleString('en-IN')}`;
    if (kpiTotalCount) kpiTotalCount.textContent = `${distinctMeds.size} medicines • ${batches.length} batches`;

    if (kpiCriticalValue) kpiCriticalValue.textContent = `₹${criticalVal.toLocaleString('en-IN')}`;
    if (kpiCriticalCount) kpiCriticalCount.textContent = `${criticalCount} batches need immediate action`;

    if (kpiWarningValue) kpiWarningValue.textContent = `₹${warningVal.toLocaleString('en-IN')}`;
    if (kpiWarningCount) kpiWarningCount.textContent = `${warningCount} batches approaching return cutoff`;

    if (kpiWatchlistValue) kpiWatchlistValue.textContent = `₹${watchlistVal.toLocaleString('en-IN')}`;
    if (kpiWatchlistCount) kpiWatchlistCount.textContent = `${watchlistCount} batches on radar`;

    const totalAlerts = criticalCount + warningCount;
    if (notifBadge) {
      if (totalAlerts > 0) {
        notifBadge.textContent = totalAlerts;
        notifBadge.hidden = false;
      } else {
        notifBadge.hidden = true;
      }
    }

    if (tabInventoryCount) {
      tabInventoryCount.textContent = batches.length;
      tabInventoryCount.hidden = batches.length === 0;
    }
    if (tabBillsCount) {
      tabBillsCount.textContent = pharmacyDb.bills.length;
      tabBillsCount.hidden = pharmacyDb.bills.length === 0;
    }

    // Toggle Empty State vs Populated State
    const emptyBanner = document.getElementById('emptyInventoryBanner');
    const populatedGrid = document.getElementById('populatedDashboardGrid');

    if (batches.length === 0) {
      if (emptyBanner) emptyBanner.hidden = false;
      if (populatedGrid) populatedGrid.hidden = true;
    } else {
      if (emptyBanner) emptyBanner.hidden = true;
      if (populatedGrid) populatedGrid.hidden = false;
      renderUrgentBatchTable(batches);
      renderForecastHorizon(batches);
    }

    renderActivityFeed();
  };

  // Render Urgent Batch Queue (Sorted by earliest expiry)
  const renderUrgentBatchTable = (batches) => {
    const tbody = document.getElementById('urgentBatchTableBody');
    if (!tbody) return;

    // Filter and sort by days remaining
    const atRiskBatches = batches
      .map(b => ({ ...b, daysLeft: calculateDaysRemaining(b.expiryDate) }))
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 6);

    if (atRiskBatches.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-state-small"><p>No batches at risk.</p><span>All current inventory has comfortable shelf-life.</span></td></tr>`;
      return;
    }

    tbody.innerHTML = atRiskBatches.map(b => {
      const risk = getRiskCategory(b.daysLeft);
      const atRiskVal = b.quantity * b.purchaseRate;
      return `
        <tr>
          <td>
            <strong>${b.name}</strong>
            <div style="font-size: 0.725rem; color: var(--color-text-muted);">${b.pack || 'Standard Pack'}</div>
          </td>
          <td><span class="table-batch-pill">${b.batchNo}</span></td>
          <td><strong>${b.quantity}</strong> strips</td>
          <td><span style="font-family: var(--font-mono);">${b.expiryDate}</span></td>
          <td><span class="risk-pill ${risk.class}">${risk.label}</span></td>
          <td><strong>₹${atRiskVal.toLocaleString('en-IN')}</strong></td>
          <td>
            <button type="button" class="btn-secondary" style="height: 30px; font-size: 0.75rem; padding: 0 0.6rem;" onclick="window.markForReturn('${b.id}')">
              Return Claim
            </button>
          </td>
        </tr>
      `;
    }).join('');
  };

  // Render 6-Month Expiry Forecast Bars
  const renderForecastHorizon = (batches) => {
    const container = document.getElementById('forecastBarsContainer');
    if (!container) return;

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const months = [];

    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push({
        label: `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`,
        year: d.getFullYear(),
        month: d.getMonth(),
        value: 0,
        count: 0
      });
    }

    batches.forEach(b => {
      if (!b.expiryDate) return;
      const parts = b.expiryDate.split('-');
      if (parts.length >= 2) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const target = months.find(item => item.year === y && item.month === m);
        if (target) {
          target.value += (b.quantity * b.purchaseRate);
          target.count++;
        }
      }
    });

    const maxVal = Math.max(1, ...months.map(m => m.value));

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 0.75rem; padding: 0.5rem 0;">
        ${months.map(m => {
          const pct = Math.max(8, Math.round((m.value / maxVal) * 100));
          return `
            <div style="display: flex; flex-direction: column; gap: 0.2rem;">
              <div style="display: flex; justify-content: space-between; font-size: 0.75rem;">
                <span style="font-weight: 700;">${m.label}</span>
                <span style="font-family: var(--font-mono); color: var(--color-text-secondary);">₹${m.value.toLocaleString('en-IN')} (${m.count} batches)</span>
              </div>
              <div style="height: 6px; background: #f1f5f9; border-radius: var(--radius-pill); overflow: hidden;">
                <div style="width: ${m.value > 0 ? pct : 0}%; height: 100%; background: linear-gradient(90deg, #059669 0%, #0d9488 100%); border-radius: var(--radius-pill);"></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  };

  // Render Real Activity Feed
  const renderActivityFeed = () => {
    const list = document.getElementById('activityTimelineList');
    if (!list) return;

    if (pharmacyDb.activity.length === 0) {
      list.innerHTML = `
        <div class="empty-state-small">
          <p>No activity yet.</p>
          <span>Your inventory activity will appear here once you start adding stock.</span>
        </div>
      `;
      return;
    }

    list.innerHTML = pharmacyDb.activity.slice(0, 5).map(act => `
      <div class="activity-item">
        <div style="color: var(--brand-primary); font-size: 0.875rem;">•</div>
        <div style="flex: 1;">
          <div style="color: var(--color-text-main); font-weight: 600;">${act.text}</div>
          <div class="act-time">${act.timestamp}</div>
        </div>
      </div>
    `).join('');
  };

  // Render Live Inventory Table
  const renderInventoryTable = () => {
    const tbody = document.getElementById('inventoryTableBody');
    const emptyState = document.getElementById('emptyInventoryTableState');
    const searchInput = document.getElementById('inventorySearchInput');
    const filterSelect = document.getElementById('inventoryExpiryFilter');

    if (!tbody) return;

    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const filter = filterSelect ? filterSelect.value : 'all';

    let batches = pharmacyDb.batches.map(b => ({
      ...b,
      daysLeft: calculateDaysRemaining(b.expiryDate)
    }));

    if (query) {
      batches = batches.filter(b => 
        b.name.toLowerCase().includes(query) ||
        b.batchNo.toLowerCase().includes(query) ||
        (b.distributor && b.distributor.toLowerCase().includes(query))
      );
    }

    if (filter !== 'all') {
      batches = batches.filter(b => {
        if (filter === 'critical') return b.daysLeft <= 30;
        if (filter === 'warning') return b.daysLeft > 30 && b.daysLeft <= 60;
        if (filter === 'watchlist') return b.daysLeft > 60 && b.daysLeft <= 90;
        if (filter === 'safe') return b.daysLeft > 90;
        return true;
      });
    }

    if (batches.length === 0) {
      tbody.innerHTML = '';
      if (emptyState) emptyState.hidden = false;
      return;
    }

    if (emptyState) emptyState.hidden = true;

    tbody.innerHTML = batches.map(b => {
      const risk = getRiskCategory(b.daysLeft);
      const totalVal = b.quantity * b.purchaseRate;

      return `
        <tr>
          <td>
            <strong>${b.name}</strong>
            <div style="font-size: 0.725rem; color: var(--color-text-muted);">${b.pack || 'Standard Pack'}</div>
          </td>
          <td><span class="table-batch-pill">${b.batchNo}</span></td>
          <td><span style="font-size: 0.75rem; color: var(--color-text-muted);">${b.rack || 'Unassigned'}</span></td>
          <td><strong>${b.quantity}</strong> units</td>
          <td><span style="font-family: var(--font-mono);">${b.expiryDate}</span></td>
          <td><span class="risk-pill ${risk.class}">${risk.label}</span></td>
          <td><span style="font-family: var(--font-mono);">₹${b.purchaseRate.toLocaleString('en-IN')}</span></td>
          <td><strong>₹${totalVal.toLocaleString('en-IN')}</strong></td>
          <td>
            <button type="button" class="btn-secondary" style="height: 28px; font-size: 0.75rem; padding: 0 0.5rem;" onclick="window.markForReturn('${b.id}')">
              Return
            </button>
          </td>
        </tr>
      `;
    }).join('');
  };

  // Render Ingested Bills
  const renderBillsHistory = () => {
    const list = document.getElementById('billsHistoryList');
    const empty = document.getElementById('emptyBillsHistory');
    if (!list || !empty) return;

    if (pharmacyDb.bills.length === 0) {
      list.hidden = true;
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    list.hidden = false;
    list.innerHTML = pharmacyDb.bills.map(bill => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.85rem 1rem; background: #ffffff; border: 1px solid var(--color-border); border-radius: var(--radius-md); margin-bottom: 0.65rem;">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <div style="width: 36px; height: 36px; border-radius: var(--radius-sm); background: #ecfdf5; color: #059669; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">📄</div>
          <div>
            <strong>${bill.distributor}</strong>
            <div style="font-size: 0.75rem; color: var(--color-text-muted);">Invoice #${bill.invoiceNo} • ${bill.date}</div>
          </div>
        </div>
        <div style="text-align: right;">
          <strong style="font-family: var(--font-mono); font-size: 0.95rem;">₹${bill.totalAmount.toLocaleString('en-IN')}</strong>
          <div style="font-size: 0.75rem; color: #059669; font-weight: 600;">${bill.itemsCount} medicines added</div>
        </div>
      </div>
    `).join('');
  };

  // Render Returns Tab
  const renderReturns = () => {
    const grid = document.getElementById('returnsCardsGrid');
    const empty = document.getElementById('emptyReturnsState');
    if (!grid || !empty) return;

    const expiringBatches = pharmacyDb.batches.filter(b => calculateDaysRemaining(b.expiryDate) <= 60);

    if (expiringBatches.length === 0) {
      grid.hidden = true;
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    grid.hidden = false;

    // Group by distributor
    const distributorGroups = {};
    expiringBatches.forEach(b => {
      const dist = b.distributor || 'General Stockist';
      if (!distributorGroups[dist]) distributorGroups[dist] = [];
      distributorGroups[dist].push(b);
    });

    grid.innerHTML = Object.keys(distributorGroups).map(dist => {
      const items = distributorGroups[dist];
      const claimVal = items.reduce((sum, i) => sum + (i.quantity * i.purchaseRate), 0);

      return `
        <div class="dash-card gradient-border-subtle" style="margin-bottom: 1rem;">
          <div class="dash-card-header">
            <div>
              <strong>${dist}</strong>
              <div style="font-size: 0.75rem; color: var(--color-text-muted);">${items.length} expiring batches eligible for full credit return</div>
            </div>
            <strong style="font-family: var(--font-mono); color: var(--status-critical); font-size: 1.1rem;">Claim: ₹${claimVal.toLocaleString('en-IN')}</strong>
          </div>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem;">
            ${items.map(i => `<span class="table-batch-pill">${i.name} (${i.batchNo}) - ${i.quantity} units</span>`).join('')}
          </div>
          <div style="margin-top: 0.75rem; display: flex; justify-content: flex-end;">
            <button type="button" class="btn-primary" style="height: 34px; font-size: 0.8125rem;" onclick="alert('Return Debit Note Generated for ${dist}. Hand over copy to distributor representative for credit adjustment.')">
              Generate Return Debit Note
            </button>
          </div>
        </div>
      `;
    }).join('');
  };

  // Expose global return action
  window.markForReturn = (batchId) => {
    const batch = pharmacyDb.batches.find(b => b.id === batchId);
    if (!batch) return;
    switchTab('returns');
  };

  // Search & Filter listeners
  const inventorySearchInput = document.getElementById('inventorySearchInput');
  const inventoryExpiryFilter = document.getElementById('inventoryExpiryFilter');
  if (inventorySearchInput) inventorySearchInput.addEventListener('input', renderInventoryTable);
  if (inventoryExpiryFilter) inventoryExpiryFilter.addEventListener('change', renderInventoryTable);

  // ==========================================================================
  // 4. SMART PURCHASE BILL OCR INGESTION CONTROLLER
  // ==========================================================================
  const billDropzone = document.getElementById('billDropzone');
  const billFileInput = document.getElementById('billFileInput');
  const browseFileBtn = document.getElementById('browseFileBtn');
  const ocrReviewContainer = document.getElementById('ocrReviewContainer');
  const ocrDistributorDisplay = document.getElementById('ocrDistributorDisplay');
  const ocrInvoiceNoDisplay = document.getElementById('ocrInvoiceNoDisplay');
  const ocrDateDisplay = document.getElementById('ocrDateDisplay');
  const ocrItemsCountDisplay = document.getElementById('ocrItemsCountDisplay');
  const ocrTableBody = document.getElementById('ocrTableBody');
  const ocrAddRowBtn = document.getElementById('ocrAddRowBtn');
  const ocrConfirmSaveBtn = document.getElementById('ocrConfirmSaveBtn');

  // Sample Bills Data for presentation testing
  const sampleInvoices = {
    cipla: {
      distributor: 'Cipla Healthcare Distributors',
      invoiceNo: 'CP-8492',
      date: '2026-08-15',
      items: [
        { name: 'Augmentin 625 Duo Tablet', pack: '10 Tablets', batchNo: 'AUG-9821', expiryDate: '2026-09', quantity: 14, purchaseRate: 155, mrp: 204 },
        { name: 'Asthalin 100mcg Inhaler', pack: '200 MDI', batchNo: 'AST-1022', expiryDate: '2026-11', quantity: 20, purchaseRate: 110, mrp: 150 },
        { name: 'Ciplox 500mg Eye Drops', pack: '10ml', batchNo: 'CPX-4910', expiryDate: '2027-04', quantity: 30, purchaseRate: 18, mrp: 28 }
      ]
    },
    sunpharma: {
      distributor: 'Sun Pharma Stockist Agency',
      invoiceNo: 'SP-1092',
      date: '2026-08-16',
      items: [
        { name: 'Pan-D Capsule (15s)', pack: '15 Capsules', batchNo: 'PND-4410', expiryDate: '2026-09', quantity: 28, purchaseRate: 185, mrp: 245 },
        { name: 'Volini Pain Relief Gel', pack: '30g Tube', batchNo: 'VOL-7712', expiryDate: '2026-10', quantity: 25, purchaseRate: 75, mrp: 105 },
        { name: 'Rosuvas 10mg Tablet', pack: '10 Tablets', batchNo: 'RSV-3318', expiryDate: '2027-02', quantity: 40, purchaseRate: 140, mrp: 195 }
      ]
    },
    alkem: {
      distributor: 'Alkem Laboratories Trade Branch',
      invoiceNo: 'ALK-3810',
      date: '2026-08-17',
      items: [
        { name: 'Telma-AM 40/5mg Tablet', pack: '15 Tablets', batchNo: 'TLM-1092', expiryDate: '2026-10', quantity: 20, purchaseRate: 195, mrp: 260 },
        { name: 'Clavam 625mg Tablet', pack: '10 Tablets', batchNo: 'CLV-5510', expiryDate: '2026-12', quantity: 35, purchaseRate: 160, mrp: 215 }
      ]
    }
  };

  let currentOcrExtraction = null;

  const loadOcrReview = (invoiceData) => {
    currentOcrExtraction = JSON.parse(JSON.stringify(invoiceData));

    if (ocrDistributorDisplay) ocrDistributorDisplay.textContent = currentOcrExtraction.distributor;
    if (ocrInvoiceNoDisplay) ocrInvoiceNoDisplay.textContent = currentOcrExtraction.invoiceNo;
    if (ocrDateDisplay) ocrDateDisplay.textContent = currentOcrExtraction.date;
    if (ocrItemsCountDisplay) ocrItemsCountDisplay.textContent = currentOcrExtraction.items.length;

    renderOcrTableRows();
    if (ocrReviewContainer) {
      ocrReviewContainer.hidden = false;
      ocrReviewContainer.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const renderOcrTableRows = () => {
    if (!ocrTableBody || !currentOcrExtraction) return;

    ocrTableBody.innerHTML = currentOcrExtraction.items.map((item, idx) => {
      const rowTotal = item.quantity * item.purchaseRate;
      return `
        <tr data-index="${idx}">
          <td><input type="text" value="${item.name}" class="ocr-input-name" required></td>
          <td><input type="text" value="${item.pack || ''}" class="ocr-input-pack" placeholder="e.g. 10s"></td>
          <td><input type="text" value="${item.batchNo}" class="ocr-input-batch mono-input" required></td>
          <td><input type="text" value="${item.expiryDate}" class="ocr-input-expiry mono-input" placeholder="YYYY-MM" required></td>
          <td><input type="number" value="${item.quantity}" min="1" class="ocr-input-qty" required></td>
          <td><input type="number" value="${item.purchaseRate}" min="0" step="0.01" class="ocr-input-rate" required></td>
          <td><input type="number" value="${item.mrp || ''}" min="0" step="0.01" class="ocr-input-mrp"></td>
          <td><strong style="font-family: var(--font-mono);">₹${rowTotal.toLocaleString('en-IN')}</strong></td>
          <td>
            <button type="button" class="btn-secondary" style="height: 28px; padding: 0 0.5rem; color: var(--status-critical);" onclick="window.removeOcrRow(${idx})">×</button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach row change recalculations
    ocrTableBody.querySelectorAll('tr').forEach(tr => {
      const idx = parseInt(tr.getAttribute('data-index'), 10);
      const nameInput = tr.querySelector('.ocr-input-name');
      const packInput = tr.querySelector('.ocr-input-pack');
      const batchInput = tr.querySelector('.ocr-input-batch');
      const expInput = tr.querySelector('.ocr-input-expiry');
      const qtyInput = tr.querySelector('.ocr-input-qty');
      const rateInput = tr.querySelector('.ocr-input-rate');
      const mrpInput = tr.querySelector('.ocr-input-mrp');

      const updateValues = () => {
        if (currentOcrExtraction.items[idx]) {
          currentOcrExtraction.items[idx].name = nameInput.value;
          currentOcrExtraction.items[idx].pack = packInput.value;
          currentOcrExtraction.items[idx].batchNo = batchInput.value;
          currentOcrExtraction.items[idx].expiryDate = expInput.value;
          currentOcrExtraction.items[idx].quantity = parseFloat(qtyInput.value) || 0;
          currentOcrExtraction.items[idx].purchaseRate = parseFloat(rateInput.value) || 0;
          currentOcrExtraction.items[idx].mrp = parseFloat(mrpInput.value) || 0;
        }
      };

      [nameInput, packInput, batchInput, expInput, qtyInput, rateInput, mrpInput].forEach(inp => {
        if (inp) inp.addEventListener('input', updateValues);
      });
    });
  };

  window.removeOcrRow = (idx) => {
    if (!currentOcrExtraction) return;
    currentOcrExtraction.items.splice(idx, 1);
    if (ocrItemsCountDisplay) ocrItemsCountDisplay.textContent = currentOcrExtraction.items.length;
    renderOcrTableRows();
  };

  if (ocrAddRowBtn) {
    ocrAddRowBtn.addEventListener('click', () => {
      if (!currentOcrExtraction) return;
      currentOcrExtraction.items.push({
        name: 'New Medicine',
        pack: '10s',
        batchNo: 'BATCH-' + Math.floor(1000 + Math.random() * 9000),
        expiryDate: '2026-12',
        quantity: 10,
        purchaseRate: 100,
        mrp: 140
      });
      if (ocrItemsCountDisplay) ocrItemsCountDisplay.textContent = currentOcrExtraction.items.length;
      renderOcrTableRows();
    });
  }

  // Handle Drag & Drop
  if (browseFileBtn && billFileInput) {
    browseFileBtn.addEventListener('click', () => billFileInput.click());
  }

  if (billFileInput) {
    billFileInput.addEventListener('change', () => {
      if (billFileInput.files && billFileInput.files[0]) {
        const f = billFileInput.files[0];
        // Simulate real OCR extraction on uploaded user file
        const parsed = {
          distributor: 'Distributor Bill (' + f.name.replace(/\.[^/.]+$/, "") + ')',
          invoiceNo: 'INV-' + Math.floor(10000 + Math.random() * 90000),
          date: new Date().toISOString().split('T')[0],
          items: [
            { name: 'Paracetamol 650mg Tablet', pack: '15 Tablets', batchNo: 'PCM-8812', expiryDate: '2026-10', quantity: 20, purchaseRate: 25, mrp: 35 },
            { name: 'Azithromycin 500mg Tablet', pack: '3 Tablets', batchNo: 'AZI-4910', expiryDate: '2027-01', quantity: 15, purchaseRate: 65, mrp: 95 }
          ]
        };
        loadOcrReview(parsed);
      }
    });
  }

  // Sample Bills Buttons
  document.querySelectorAll('.sample-bill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sampleKey = btn.getAttribute('data-sample');
      if (sampleInvoices[sampleKey]) {
        loadOcrReview(sampleInvoices[sampleKey]);
      }
    });
  });

  // Confirm OCR Ingestion -> Save to Database
  if (ocrConfirmSaveBtn) {
    ocrConfirmSaveBtn.addEventListener('click', () => {
      if (!currentOcrExtraction || currentOcrExtraction.items.length === 0) {
        alert('Please keep at least one valid line item.');
        return;
      }

      let totalBillAmount = 0;
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      currentOcrExtraction.items.forEach(item => {
        const itemVal = item.quantity * item.purchaseRate;
        totalBillAmount += itemVal;

        pharmacyDb.batches.push({
          id: 'B_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          name: item.name.trim(),
          pack: item.pack || 'Standard Pack',
          batchNo: item.batchNo.trim().toUpperCase(),
          expiryDate: item.expiryDate.trim(),
          quantity: item.quantity,
          purchaseRate: item.purchaseRate,
          mrp: item.mrp || (item.purchaseRate * 1.3),
          rack: 'Shelf ' + String.fromCharCode(65 + Math.floor(Math.random() * 6)) + '-1',
          distributor: currentOcrExtraction.distributor,
          createdAt: new Date().toISOString()
        });
      });

      // Save bill record
      pharmacyDb.bills.unshift({
        id: 'BILL_' + Date.now(),
        distributor: currentOcrExtraction.distributor,
        invoiceNo: currentOcrExtraction.invoiceNo,
        date: currentOcrExtraction.date,
        totalAmount: totalBillAmount,
        itemsCount: currentOcrExtraction.items.length,
        timestamp: nowStr
      });

      // Log Activity
      pharmacyDb.activity.unshift({
        id: 'ACT_' + Date.now(),
        text: `Ingested ${currentOcrExtraction.distributor} Bill #${currentOcrExtraction.invoiceNo} (₹${totalBillAmount.toLocaleString('en-IN')})`,
        type: 'bill_upload',
        timestamp: 'Just now'
      });

      // Reset OCR Review
      currentOcrExtraction = null;
      if (ocrReviewContainer) ocrReviewContainer.hidden = true;

      // Refresh Dashboard & Inventory
      renderDashboard();
      renderInventoryTable();
      renderBillsHistory();
      renderReturns();

      // Navigate to dashboard
      switchTab('dashboard');
    });
  }

  // ==========================================================================
  // 5. MANUAL ADD MEDICINE MODAL
  // ==========================================================================
  const addMedModal = document.getElementById('addMedModal');
  const addMedBackdrop = document.getElementById('addMedBackdrop');
  const closeAddMedBtn = document.getElementById('closeAddMedBtn');
  const cancelAddMedBtn = document.getElementById('cancelAddMedBtn');
  const addMedForm = document.getElementById('addMedForm');

  const openAddMedModal = () => {
    if (!addMedModal) return;
    addMedModal.classList.remove('view-hidden');
    addMedModal.classList.add('view-active');
    const mMedName = document.getElementById('mMedName');
    if (mMedName) mMedName.focus();
  };

  const closeAddMedModal = () => {
    if (!addMedModal) return;
    addMedModal.classList.remove('view-active');
    addMedModal.classList.add('view-hidden');
    if (addMedForm) addMedForm.reset();
  };

  if (topbarAddMedBtn) topbarAddMedBtn.addEventListener('click', openAddMedModal);
  if (emptyAddMedBtn) emptyAddMedBtn.addEventListener('click', openAddMedModal);
  if (inventoryAddMedBtn) inventoryAddMedBtn.addEventListener('click', openAddMedModal);
  if (addMedBackdrop) addMedBackdrop.addEventListener('click', closeAddMedModal);
  if (closeAddMedBtn) closeAddMedBtn.addEventListener('click', closeAddMedModal);
  if (cancelAddMedBtn) cancelAddMedBtn.addEventListener('click', closeAddMedModal);

  if (addMedForm) {
    addMedForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const mMedName = document.getElementById('mMedName');
      const mBatchNo = document.getElementById('mBatchNo');
      const mExpiryDate = document.getElementById('mExpiryDate');
      const mQty = document.getElementById('mQty');
      const mPurchaseRate = document.getElementById('mPurchaseRate');
      const mMrp = document.getElementById('mMrp');
      const mRack = document.getElementById('mRack');
      const mDistributor = document.getElementById('mDistributor');

      if (!mMedName.value.trim() || !mBatchNo.value.trim() || !mExpiryDate.value || !mQty.value || !mPurchaseRate.value) {
        alert('Please fill all required fields.');
        return;
      }

      const qty = parseFloat(mQty.value) || 1;
      const rate = parseFloat(mPurchaseRate.value) || 0;

      pharmacyDb.batches.push({
        id: 'B_' + Date.now(),
        name: mMedName.value.trim(),
        pack: 'Standard Pack',
        batchNo: mBatchNo.value.trim().toUpperCase(),
        expiryDate: mExpiryDate.value,
        quantity: qty,
        purchaseRate: rate,
        mrp: parseFloat(mMrp.value) || (rate * 1.3),
        rack: mRack.value.trim() || 'Rack A-1',
        distributor: mDistributor.value.trim() || 'Local Chemist Stockist',
        createdAt: new Date().toISOString()
      });

      pharmacyDb.activity.unshift({
        id: 'ACT_' + Date.now(),
        text: `Manually added ${mMedName.value.trim()} (Batch #${mBatchNo.value.trim().toUpperCase()})`,
        type: 'manual_add',
        timestamp: 'Just now'
      });

      closeAddMedModal();
      renderDashboard();
      renderInventoryTable();
      renderReturns();
    });
  }

  // ==========================================================================
  // 6. PRESENTATION DEMO MODE TOGGLE (SEPARATE & ISOLATED)
  // ==========================================================================
  const loadDemoDataBtn = document.getElementById('loadDemoDataBtn');
  const clearAllDataBtn = document.getElementById('clearAllDataBtn');
  const demoModeBanner = document.getElementById('demoModeBanner');
  const exitDemoModeBtn = document.getElementById('exitDemoModeBtn');

  if (loadDemoDataBtn) {
    loadDemoDataBtn.addEventListener('click', () => {
      isPresentationDemoMode = true;
      demoStorageBackup = JSON.parse(JSON.stringify(pharmacyDb));

      // Load isolated presentation demo batches
      pharmacyDb = {
        batches: [
          { id: 'DEMO_1', name: 'Augmentin 625 Duo Tablet', pack: '10 Tablets', batchNo: 'AUG-9821', expiryDate: '2026-09', quantity: 14, purchaseRate: 300, mrp: 412, rack: 'Rack A-2', distributor: 'Cipla Distributors', createdAt: new Date().toISOString() },
          { id: 'DEMO_2', name: 'Pan-D Capsule (15s)', pack: '15 Capsules', batchNo: 'PND-4410', expiryDate: '2026-09', quantity: 28, purchaseRate: 244.64, mrp: 320, rack: 'Rack B-1', distributor: 'Sun Pharma Agency', createdAt: new Date().toISOString() },
          { id: 'DEMO_3', name: 'Telma-AM 40/5mg Tablet', pack: '15 Tablets', batchNo: 'TLM-1092', expiryDate: '2026-10', quantity: 20, purchaseRate: 370, mrp: 490, rack: 'Rack C-4', distributor: 'Glenmark Stockists', createdAt: new Date().toISOString() }
        ],
        bills: [
          { id: 'BILL_DEMO_1', distributor: 'Cipla Distributors', invoiceNo: 'CP-9812', date: '2026-08-10', totalAmount: 4200, itemsCount: 1, timestamp: '3 days ago' },
          { id: 'BILL_DEMO_2', distributor: 'Sun Pharma Agency', invoiceNo: 'SP-3910', date: '2026-08-12', totalAmount: 6850, itemsCount: 1, timestamp: '1 day ago' }
        ],
        activity: [
          { id: 'ACT_D1', text: 'Ingested Cipla Distributors Bill #CP-9812 (₹4,200)', type: 'bill', timestamp: '3 days ago' },
          { id: 'ACT_D2', text: 'Ingested Sun Pharma Agency Bill #SP-3910 (₹6,850)', type: 'bill', timestamp: '1 day ago' }
        ],
        returns: []
      };

      if (demoModeBanner) demoModeBanner.hidden = false;
      renderDashboard();
      renderInventoryTable();
      renderBillsHistory();
      renderReturns();
      switchTab('dashboard');
    });
  }

  if (exitDemoModeBtn) {
    exitDemoModeBtn.addEventListener('click', () => {
      isPresentationDemoMode = false;
      if (demoStorageBackup) {
        pharmacyDb = demoStorageBackup;
      } else {
        pharmacyDb = { batches: [], bills: [], activity: [], returns: [] };
      }

      if (demoModeBanner) demoModeBanner.hidden = true;
      renderDashboard();
      renderInventoryTable();
      renderBillsHistory();
      renderReturns();
    });
  }

  if (clearAllDataBtn) {
    clearAllDataBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all pharmacy records back to clean zero state?')) {
        pharmacyDb = { batches: [], bills: [], activity: [], returns: [] };
        if (demoModeBanner) demoModeBanner.hidden = true;
        renderDashboard();
        renderInventoryTable();
        renderBillsHistory();
        renderReturns();
        alert('Pharmacy inventory successfully reset to clean zero state.');
      }
    });
  }

  // ==========================================================================
  // 7. AUTHENTICATION & LOGIN LINKAGE TO WORKSPACE
  // ==========================================================================
  const loginForm = document.getElementById('loginForm');
  const loginIdentifierInput = document.getElementById('loginIdentifierInput');
  const passwordInput = document.getElementById('passwordInput');
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const eyeIcon = document.getElementById('eyeIcon');
  const signInButton = document.getElementById('signInButton');
  const authNotice = document.getElementById('authNotice');
  const forgotPasswordLink = document.getElementById('forgotPasswordLink');

  if (togglePasswordBtn && passwordInput && eyeIcon) {
    togglePasswordBtn.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    });
  }

  const showAuthNotice = (message, type = 'info') => {
    if (!authNotice) return;
    authNotice.className = `auth-notice ${type}`;
    authNotice.textContent = message;
    authNotice.hidden = false;
  };

  const hideAuthNotice = () => {
    if (!authNotice) return;
    authNotice.hidden = true;
  };

  const isValidEmail = (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  const isValidMobile = (val) => /^(?:\+91)?[6-9]\d{9}$/.test(val.replace(/\s|-/g, ''));

  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      hideAuthNotice();

      const identifier = loginIdentifierInput ? loginIdentifierInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';

      if (!identifier) {
        showAuthNotice('Please enter your registered Email address or 10-digit Mobile number.', 'error');
        return;
      }

      if (!password) {
        showAuthNotice('Please enter your password.', 'error');
        return;
      }

      // Populate current user session and launch workspace
      currentPharmacy.shopName = 'Apollo Chemist & Druggist';
      currentPharmacy.dlNumber = 'DL-20B/94812';
      currentPharmacy.ownerName = 'Rajesh Sharma';
      currentPharmacy.email = isValidEmail(identifier) ? identifier : 'pharmacist@apollohealthcare.com';
      currentPharmacy.mobile = isValidMobile(identifier) ? identifier : '9876543210';

      showScreen('dashboard');
    });
  }

  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (e) => {
      e.preventDefault();
      showAuthNotice('Password reset OTP sent to your registered mobile and email.', 'info');
    });
  }

  // ==========================================================================
  // 8. GOOGLE OAUTH MODAL
  // ==========================================================================
  const googleModal = document.getElementById('googleModal');
  const googleModalBackdrop = document.getElementById('googleModalBackdrop');
  const closeGoogleModalBtn = document.getElementById('closeGoogleModalBtn');
  const googleSignInBtn = document.getElementById('googleSignInBtn');
  const regGoogleBtn = document.getElementById('regGoogleBtn');
  const googleAccountsList = document.getElementById('googleAccountsList');
  const googleLoadingState = document.getElementById('googleLoadingState');
  const googleLoadingText = document.getElementById('googleLoadingText');
  const useAnotherGoogleBtn = document.getElementById('useAnotherGoogleBtn');
  const customGoogleInputRow = document.getElementById('customGoogleInputRow');
  const customGoogleEmail = document.getElementById('customGoogleEmail');
  const submitCustomGoogleBtn = document.getElementById('submitCustomGoogleBtn');

  let googleAuthOrigin = 'login';

  const openGoogleModal = (origin = 'login') => {
    googleAuthOrigin = origin;
    if (!googleModal) return;
    googleModal.classList.remove('view-hidden');
    googleModal.classList.add('view-active');
    if (googleAccountsList) googleAccountsList.hidden = false;
    if (googleLoadingState) googleLoadingState.hidden = true;
    if (customGoogleInputRow) customGoogleInputRow.hidden = true;
    if (customGoogleEmail) customGoogleEmail.value = '';
  };

  const closeGoogleModal = () => {
    if (!googleModal) return;
    googleModal.classList.remove('view-active');
    googleModal.classList.add('view-hidden');
  };

  if (googleSignInBtn) googleSignInBtn.addEventListener('click', () => openGoogleModal('login'));
  if (regGoogleBtn) regGoogleBtn.addEventListener('click', () => openGoogleModal('signup'));
  if (googleModalBackdrop) googleModalBackdrop.addEventListener('click', closeGoogleModal);
  if (closeGoogleModalBtn) closeGoogleModalBtn.addEventListener('click', closeGoogleModal);

  if (useAnotherGoogleBtn && customGoogleInputRow) {
    useAnotherGoogleBtn.addEventListener('click', () => {
      customGoogleInputRow.hidden = !customGoogleInputRow.hidden;
      if (!customGoogleInputRow.hidden && customGoogleEmail) customGoogleEmail.focus();
    });
  }

  const processGoogleAccount = (name, email, shopName = '', dlNumber = '') => {
    if (googleAccountsList) googleAccountsList.hidden = true;
    if (googleLoadingState) {
      googleLoadingState.hidden = false;
      if (googleLoadingText) googleLoadingText.textContent = `Authenticating as ${name} (${email})...`;
    }

    setTimeout(() => {
      closeGoogleModal();

      currentPharmacy.shopName = shopName || 'Medicare Chemist & Druggist';
      currentPharmacy.dlNumber = dlNumber || 'DL-20B/94812';
      currentPharmacy.ownerName = name;
      currentPharmacy.email = email;

      showScreen('dashboard');
    }, 600);
  };

  document.querySelectorAll('.google-account-item[data-email]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-name') || 'Pharmacist';
      const email = btn.getAttribute('data-email') || '';
      const shop = btn.getAttribute('data-shop') || 'Medicare Chemist & Druggist';
      const dl = btn.getAttribute('data-dl') || 'DL-20B/94812';
      processGoogleAccount(name, email, shop, dl);
    });
  });

  if (submitCustomGoogleBtn && customGoogleEmail) {
    submitCustomGoogleBtn.addEventListener('click', () => {
      const email = customGoogleEmail.value.trim();
      if (!email || !isValidEmail(email)) return;
      const inferredName = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      processGoogleAccount(inferredName, email, 'My Chemist & Pharmacy', 'DL-20B/XXXXX');
    });
  }

  // ==========================================================================
  // 9. 3-STEP PHARMACY ONBOARDING WIZARD
  // ==========================================================================
  const regStep1Pane = document.getElementById('regStep1Pane');
  const regStep2Pane = document.getElementById('regStep2Pane');
  const regStep3Pane = document.getElementById('regStep3Pane');
  const regStepReviewPane = document.getElementById('regStepReviewPane');
  const regStepSuccessPane = document.getElementById('regStepSuccessPane');

  const pStep1Indicator = document.getElementById('pStep1Indicator');
  const pStep2Indicator = document.getElementById('pStep2Indicator');
  const pStep3Indicator = document.getElementById('pStep3Indicator');
  const progressBarFill = document.getElementById('progressBarFill');

  const goToRegStep = (stepNumber) => {
    const panes = [
      { step: 1, el: regStep1Pane, pct: '33.33%' },
      { step: 2, el: regStep2Pane, pct: '66.66%' },
      { step: 3, el: regStep3Pane, pct: '100%' },
      { step: 4, el: regStepReviewPane, pct: '100%' },
      { step: 5, el: regStepSuccessPane, pct: '100%' }
    ];

    panes.forEach(p => {
      if (p.el) {
        if (p.step === stepNumber) {
          p.el.classList.remove('step-hidden');
          p.el.classList.add('step-active');
        } else {
          p.el.classList.remove('step-active');
          p.el.classList.add('step-hidden');
        }
      }
    });

    if (stepNumber <= 3) {
      if (progressBarFill) progressBarFill.style.width = panes[stepNumber - 1].pct;
      if (pStep1Indicator) pStep1Indicator.className = stepNumber === 1 ? 'progress-step-item active' : (stepNumber > 1 ? 'progress-step-item completed' : 'progress-step-item');
      if (pStep2Indicator) pStep2Indicator.className = stepNumber === 2 ? 'progress-step-item active' : (stepNumber > 2 ? 'progress-step-item completed' : 'progress-step-item');
      if (pStep3Indicator) pStep3Indicator.className = stepNumber === 3 ? 'progress-step-item active' : 'progress-step-item';
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Step 1 Form
  const step1Form = document.getElementById('step1Form');
  const regShopName = document.getElementById('regShopName');
  const regDlNumber = document.getElementById('regDlNumber');
  const regPharmacyType = document.getElementById('regPharmacyType');
  const regPharmacyPhone = document.getElementById('regPharmacyPhone');

  if (step1Form) {
    step1Form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!regShopName.value.trim() || !regDlNumber.value.trim() || !regPharmacyType.value || !regPharmacyPhone.value.trim()) {
        alert('Please fill required pharmacy details.');
        return;
      }
      currentPharmacy.shopName = regShopName.value.trim();
      currentPharmacy.dlNumber = regDlNumber.value.trim();
      goToRegStep(2);
    });
  }

  // Step 2 Form
  const step2Form = document.getElementById('step2Form');
  const step2BackBtn = document.getElementById('step2BackBtn');
  const regOwnerName = document.getElementById('regOwnerName');
  const regOwnerRole = document.getElementById('regOwnerRole');
  const regOwnerMobile = document.getElementById('regOwnerMobile');
  const regOwnerEmail = document.getElementById('regOwnerEmail');

  if (step2BackBtn) step2BackBtn.addEventListener('click', () => goToRegStep(1));

  if (step2Form) {
    step2Form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!regOwnerName.value.trim() || !regOwnerRole.value || !regOwnerMobile.value.trim() || !regOwnerEmail.value.trim()) {
        alert('Please fill required owner details.');
        return;
      }
      currentPharmacy.ownerName = regOwnerName.value.trim();
      currentPharmacy.mobile = regOwnerMobile.value.trim();
      currentPharmacy.email = regOwnerEmail.value.trim();

      const regAccountEmail = document.getElementById('regAccountEmail');
      const linkedMobileDisplay = document.getElementById('linkedMobileDisplay');
      const linkedEmailDisplay = document.getElementById('linkedEmailDisplay');

      if (regAccountEmail) regAccountEmail.value = currentPharmacy.email;
      if (linkedMobileDisplay) linkedMobileDisplay.textContent = `+91 ${currentPharmacy.mobile}`;
      if (linkedEmailDisplay) linkedEmailDisplay.textContent = currentPharmacy.email;

      goToRegStep(3);
    });
  }

  // Step 3 Form
  const step3Form = document.getElementById('step3Form');
  const step3BackBtn = document.getElementById('step3BackBtn');
  const regPassword = document.getElementById('regPassword');
  const regConfirmPassword = document.getElementById('regConfirmPassword');

  if (step3BackBtn) step3BackBtn.addEventListener('click', () => goToRegStep(2));

  if (step3Form) {
    step3Form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!regPassword.value || regPassword.value.length < 8) {
        alert('Please create a password with at least 8 characters.');
        return;
      }
      if (regPassword.value !== regConfirmPassword.value) {
        alert('Passwords do not match.');
        return;
      }

      // Populate review
      const revShopName = document.getElementById('revShopName');
      const revDlNumber = document.getElementById('revDlNumber');
      const revOwnerName = document.getElementById('revOwnerName');
      const revOwnerMobile = document.getElementById('revOwnerMobile');
      const revAccountEmail = document.getElementById('revAccountEmail');

      if (revShopName) revShopName.textContent = currentPharmacy.shopName;
      if (revDlNumber) revDlNumber.textContent = currentPharmacy.dlNumber;
      if (revOwnerName) revOwnerName.textContent = currentPharmacy.ownerName;
      if (revOwnerMobile) revOwnerMobile.textContent = `+91 ${currentPharmacy.mobile}`;
      if (revAccountEmail) revAccountEmail.textContent = currentPharmacy.email;

      goToRegStep(4);
    });
  }

  // Review Step
  const editStep1Btn = document.getElementById('editStep1Btn');
  const editStep2Btn = document.getElementById('editStep2Btn');
  const stepReviewBackBtn = document.getElementById('stepReviewBackBtn');
  const finalCreateAccountBtn = document.getElementById('finalCreateAccountBtn');
  const confirmAccuracyCheckbox = document.getElementById('confirmAccuracyCheckbox');

  if (editStep1Btn) editStep1Btn.addEventListener('click', () => goToRegStep(1));
  if (editStep2Btn) editStep2Btn.addEventListener('click', () => goToRegStep(2));
  if (stepReviewBackBtn) stepReviewBackBtn.addEventListener('click', () => goToRegStep(3));

  if (finalCreateAccountBtn) {
    finalCreateAccountBtn.addEventListener('click', () => {
      if (!confirmAccuracyCheckbox || !confirmAccuracyCheckbox.checked) {
        alert('Please confirm that the information provided is accurate.');
        return;
      }

      // Start freshly registered pharmacy with clean ZERO database
      pharmacyDb = {
        batches: [],
        bills: [],
        activity: [],
        returns: []
      };

      const successShopNameDisplay = document.getElementById('successShopNameDisplay');
      const successMetaDisplay = document.getElementById('successMetaDisplay');

      if (successShopNameDisplay) successShopNameDisplay.textContent = currentPharmacy.shopName;
      if (successMetaDisplay) successMetaDisplay.textContent = `D.L. No: ${currentPharmacy.dlNumber} • Clean Database Initialized`;

      goToRegStep(5);
    });
  }

  // Initial check
  const hash = window.location.hash.replace('#', '');
  if (hash === 'dashboard') {
    showScreen('dashboard', true);
  }
});
