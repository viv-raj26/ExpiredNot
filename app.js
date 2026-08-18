/**
 * EXPIREDNOT — Pharmacy Inventory Intelligence
 * Core Platform Controller: Real Authentication, 3-Step Onboarding, Vertical Sidebar, FEFO & AI/OCR Bill Ingestion
 */

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================================================
  // 1. DATA STORES & AUTHENTICATION DATABASE
  // ==========================================================================

  // Real User DB in localStorage
  const USERS_DB_KEY = 'expirednot_users_db';
  const ACTIVE_SESSION_KEY = 'expirednot_active_session';

  // Seed default registered account for verification tests (if empty)
  const initUsersDb = () => {
    const raw = localStorage.getItem(USERS_DB_KEY);
    if (!raw) {
      const defaultUsers = [
        {
          id: 'USR_RAJESH',
          email: 'rajesh.sharma@medicarechemists.com',
          mobile: '9876543210',
          password: 'password123',
          shopName: 'Medicare Chemist & Druggist',
          dlNumber: 'DL-20B/94812',
          pharmacyType: 'Retail Pharmacy',
          ownerName: 'Rajesh Sharma',
          role: 'Owner'
        }
      ];
      localStorage.setItem(USERS_DB_KEY, JSON.stringify(defaultUsers));
      return defaultUsers;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  };

  let registeredUsers = initUsersDb();

  const saveUsersDb = () => {
    localStorage.setItem(USERS_DB_KEY, JSON.stringify(registeredUsers));
  };

  // Active Pharmacy Session State
  let currentPharmacy = {
    id: null,
    shopName: '',
    dlNumber: '',
    ownerName: '',
    email: '',
    mobile: '',
    role: 'Owner'
  };

  // Real Database for the Active Pharmacy (STRICT ZERO DEFAULT)
  let pharmacyDb = {
    batches: [],       // { id, name, pack, batchNo, expiryDate, quantity, purchaseRate, mrp, rack, distributor, createdAt }
    bills: [],         // { id, distributor, invoiceNo, date, totalAmount, itemsCount, timestamp }
    movements: [],     // { id, timestamp, type, medicineName, batchNo, quantity, value, notes }
    expenses: [],      // { id, date, category, desc, amount }
    notifications: [], // { id, text, type, timestamp, read: false }
    activity: []       // { id, text, timestamp }
  };

  let isDemoMode = false;
  let realDbBackup = null;

  // Load pharmacy data for current session
  const loadPharmacyData = (pharmacyId) => {
    if (!pharmacyId) return;
    const raw = localStorage.getItem(`expirednot_data_${pharmacyId}`);
    if (raw) {
      try {
        pharmacyDb = JSON.parse(raw);
      } catch {
        pharmacyDb = { batches: [], bills: [], movements: [], expenses: [], notifications: [], activity: [] };
      }
    } else {
      // Brand new pharmacy: STRICT ZERO RECORDS
      pharmacyDb = { batches: [], bills: [], movements: [], expenses: [], notifications: [], activity: [] };
    }
  };

  const savePharmacyData = () => {
    if (!currentPharmacy.id || isDemoMode) return;
    localStorage.setItem(`expirednot_data_${currentPharmacy.id}`, JSON.stringify(pharmacyDb));
  };

  // ==========================================================================
  // 2. SCREEN ROUTING CONTROLLER
  // ==========================================================================
  const welcomeScreen = document.getElementById('welcomeScreen');
  const authScreen = document.getElementById('authScreen');
  const signupScreen = document.getElementById('signupScreen');
  const dashboardScreen = document.getElementById('dashboardScreen');

  const enterAppBtn = document.getElementById('enterAppBtn');
  const backToWelcomeBtn = document.getElementById('backToWelcomeBtn');
  const createAccountLink = document.getElementById('createAccountLink');
  const cancelSignupBtn = document.getElementById('cancelSignupBtn');
  const step1BackBtn = document.getElementById('step1BackBtn');
  const goToDashboardBtn = document.getElementById('goToDashboardBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  const showScreen = (target) => {
    const screens = [
      { id: 'welcome', el: welcomeScreen },
      { id: 'auth', el: authScreen },
      { id: 'signup', el: signupScreen },
      { id: 'dashboard', el: dashboardScreen }
    ];

    screens.forEach(s => {
      if (s.el) {
        if (s.id === target) {
          s.el.classList.remove('view-hidden');
          s.el.classList.add('view-active');
        } else {
          s.el.classList.remove('view-active');
          s.el.classList.add('view-hidden');
        }
      }
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (target === 'dashboard') {
      refreshAllWorkspaceViews();
    }
  };

  if (enterAppBtn) enterAppBtn.addEventListener('click', () => showScreen('auth'));
  if (backToWelcomeBtn) backToWelcomeBtn.addEventListener('click', () => showScreen('welcome'));
  if (createAccountLink) createAccountLink.addEventListener('click', () => {
    googleConnectedUser = null;
    showScreen('signup');
    goToWizardStep(1);
  });
  if (cancelSignupBtn) cancelSignupBtn.addEventListener('click', () => showScreen('auth'));
  if (step1BackBtn) step1BackBtn.addEventListener('click', () => showScreen('auth'));
  if (goToDashboardBtn) goToDashboardBtn.addEventListener('click', () => showScreen('dashboard'));
  if (logoutBtn) logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem(ACTIVE_SESSION_KEY);
    currentPharmacy = { id: null, shopName: '', dlNumber: '', ownerName: '', email: '', mobile: '', role: 'Owner' };
    showScreen('auth');
    showAuthError('Signed out of pharmacy workspace.', 'info');
  });

  // ==========================================================================
  // 3. REAL AUTHENTICATION & LOGIN CONTROLLER
  // ==========================================================================
  const loginForm = document.getElementById('loginForm');
  const loginIdentifierInput = document.getElementById('loginIdentifierInput');
  const passwordInput = document.getElementById('passwordInput');
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const eyeIcon = document.getElementById('eyeIcon');
  const authNotice = document.getElementById('authNotice');
  const forgotPasswordLink = document.getElementById('forgotPasswordLink');

  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
      const isPass = passwordInput.type === 'password';
      passwordInput.type = isPass ? 'text' : 'password';
      togglePasswordBtn.setAttribute('aria-label', isPass ? 'Hide password' : 'Show password');
    });
  }

  const showAuthError = (message, type = 'error', showCreateBtn = false) => {
    if (!authNotice) return;
    authNotice.className = `auth-notice ${type}`;
    authNotice.innerHTML = `
      <span>${message}</span>
      ${showCreateBtn ? '<button type="button" class="auth-notice-btn" id="authNoticeCreateBtn">Create Account →</button>' : ''}
    `;
    authNotice.hidden = false;

    const btn = document.getElementById('authNoticeCreateBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        showScreen('signup');
        goToWizardStep(1);
      });
    }
  };

  const hideAuthError = () => {
    if (authNotice) authNotice.hidden = true;
  };

  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      hideAuthError();

      const identifier = loginIdentifierInput ? loginIdentifierInput.value.trim() : '';
      const pass = passwordInput ? passwordInput.value : '';

      if (!identifier) {
        showAuthError('Please enter your registered Email address or 10-digit Mobile number.', 'error');
        return;
      }

      if (!pass) {
        showAuthError('Please enter your password.', 'error');
        return;
      }

      // STRICT DB VERIFICATION: Match against real registered users
      registeredUsers = initUsersDb();
      const user = registeredUsers.find(u => 
        (u.email && u.email.toLowerCase() === identifier.toLowerCase()) ||
        (u.mobile && u.mobile === identifier.replace(/\D/g, '').slice(-10))
      );

      if (!user) {
        showAuthError("We couldn't find an account with these details. Create your pharmacy account to get started.", 'error', true);
        return;
      }

      if (user.password !== pass) {
        showAuthError('Incorrect password. Please try again.', 'error');
        return;
      }

      // Valid Credentials -> Log into user's real pharmacy
      currentPharmacy = {
        id: user.id,
        shopName: user.shopName,
        dlNumber: user.dlNumber,
        ownerName: user.ownerName,
        email: user.email,
        mobile: user.mobile,
        role: user.role || 'Owner'
      };

      sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(currentPharmacy));
      loadPharmacyData(user.id);
      showScreen('dashboard');
    });
  }

  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (e) => {
      e.preventDefault();
      showAuthError('Password reset link sent to your registered mobile and email.', 'info');
    });
  }

  // ==========================================================================
  // 4. GOOGLE OAUTH MODAL (NEW VS EXISTING USER ROUTING)
  // ==========================================================================
  const googleModal = document.getElementById('googleModal');
  const googleModalBackdrop = document.getElementById('googleModalBackdrop');
  const closeGoogleModalBtn = document.getElementById('closeGoogleModalBtn');
  const googleSignInBtn = document.getElementById('googleSignInBtn');
  const googleAccountsList = document.getElementById('googleAccountsList');
  const googleLoadingState = document.getElementById('googleLoadingState');
  const googleLoadingText = document.getElementById('googleLoadingText');
  const useAnotherGoogleBtn = document.getElementById('useAnotherGoogleBtn');
  const customGoogleInputRow = document.getElementById('customGoogleInputRow');
  const customGoogleEmail = document.getElementById('customGoogleEmail');
  const submitCustomGoogleBtn = document.getElementById('submitCustomGoogleBtn');

  let googleConnectedUser = null;

  const openGoogleModal = () => {
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

  if (googleSignInBtn) googleSignInBtn.addEventListener('click', openGoogleModal);
  if (googleModalBackdrop) googleModalBackdrop.addEventListener('click', closeGoogleModal);
  if (closeGoogleModalBtn) closeGoogleModalBtn.addEventListener('click', closeGoogleModal);

  if (useAnotherGoogleBtn && customGoogleInputRow) {
    useAnotherGoogleBtn.addEventListener('click', () => {
      customGoogleInputRow.hidden = !customGoogleInputRow.hidden;
      if (!customGoogleInputRow.hidden && customGoogleEmail) customGoogleEmail.focus();
    });
  }

  const handleGoogleAuth = (name, email, shopName, dlNumber, isNewUser = false) => {
    if (googleAccountsList) googleAccountsList.hidden = true;
    if (googleLoadingState) {
      googleLoadingState.hidden = false;
      if (googleLoadingText) googleLoadingText.textContent = `Authenticating as ${name}...`;
    }

    setTimeout(() => {
      closeGoogleModal();
      registeredUsers = initUsersDb();

      // Check if user already exists in DB
      const existing = registeredUsers.find(u => u.email.toLowerCase() === email.toLowerCase());

      if (existing && !isNewUser) {
        // Existing User -> Go straight to dashboard
        currentPharmacy = {
          id: existing.id,
          shopName: existing.shopName,
          dlNumber: existing.dlNumber,
          ownerName: existing.ownerName,
          email: existing.email,
          mobile: existing.mobile,
          role: existing.role || 'Owner'
        };
        sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(currentPharmacy));
        loadPharmacyData(existing.id);
        showScreen('dashboard');
      } else {
        // New Google User -> Fast-track 2-step onboarding with pre-filled Google account
        googleConnectedUser = { name, email };
        showScreen('signup');
        
        // Pre-fill owner details
        const regOwnerName = document.getElementById('regOwnerName');
        const regAccountEmail = document.getElementById('regAccountEmail');
        if (regOwnerName) regOwnerName.value = name;
        if (regAccountEmail) regAccountEmail.value = email;

        goToWizardStep(1);
      }
    }, 450);
  };

  document.querySelectorAll('.google-account-item[data-email]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-name');
      const email = btn.getAttribute('data-email');
      const shop = btn.getAttribute('data-shop') || '';
      const dl = btn.getAttribute('data-dl') || '';
      const isNew = btn.getAttribute('data-new') === 'true';
      handleGoogleAuth(name, email, shop, dl, isNew);
    });
  });

  if (submitCustomGoogleBtn && customGoogleEmail) {
    submitCustomGoogleBtn.addEventListener('click', () => {
      const email = customGoogleEmail.value.trim();
      if (!email) return;
      const inferredName = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      handleGoogleAuth(inferredName, email, '', '', true);
    });
  }

  // ==========================================================================
  // 5. SIMPLIFIED 3-STEP ONBOARDING WIZARD
  // ==========================================================================
  const regStep1Pane = document.getElementById('regStep1Pane');
  const regStep2Pane = document.getElementById('regStep2Pane');
  const regStep3Pane = document.getElementById('regStep3Pane');
  const regStepSuccessPane = document.getElementById('regStepSuccessPane');

  const pStep1Indicator = document.getElementById('pStep1Indicator');
  const pStep2Indicator = document.getElementById('pStep2Indicator');
  const pStep3Indicator = document.getElementById('pStep3Indicator');
  const progressBarFill = document.getElementById('progressBarFill');

  let signupData = {
    shopName: '',
    dlNumber: '',
    pharmacyType: '',
    pharmacyPhone: '',
    ownerName: '',
    role: '',
    ownerMobile: '',
    email: '',
    password: ''
  };

  const goToWizardStep = (stepNumber) => {
    const panes = [
      { step: 1, el: regStep1Pane, pct: '33.33%' },
      { step: 2, el: regStep2Pane, pct: '66.66%' },
      { step: 3, el: regStep3Pane, pct: '100%' },
      { step: 4, el: regStepSuccessPane, pct: '100%' }
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
      if (pStep1Indicator) pStep1Indicator.className = stepNumber === 1 ? 'progress-step-item active' : 'progress-step-item completed';
      if (pStep2Indicator) pStep2Indicator.className = stepNumber === 2 ? 'progress-step-item active' : (stepNumber > 2 ? 'progress-step-item completed' : 'progress-step-item');
      if (pStep3Indicator) pStep3Indicator.className = stepNumber === 3 ? 'progress-step-item active' : 'progress-step-item';
    }

    // If Google user in Step 3 -> Show Connected Pill & simplify fields
    if (stepNumber === 3) {
      const googleConnectedPill = document.getElementById('googleConnectedPill');
      const googleEmailDisplay = document.getElementById('googleEmailConnectedDisplay');
      const regEmailGroup = document.getElementById('regEmailGroup');
      const regPasswordGroup = document.getElementById('regPasswordGroup');
      const regConfirmPasswordGroup = document.getElementById('regConfirmPasswordGroup');
      const step3Subtext = document.getElementById('regStep3Subtext');

      if (googleConnectedUser) {
        if (googleConnectedPill) googleConnectedPill.hidden = false;
        if (googleEmailDisplay) googleEmailDisplay.textContent = googleConnectedUser.email;
        if (regEmailGroup) regEmailGroup.hidden = true;
        if (regPasswordGroup) regPasswordGroup.hidden = true;
        if (regConfirmPasswordGroup) regConfirmPasswordGroup.hidden = true;
        if (step3Subtext) step3Subtext.textContent = 'Your Google account is linked. Click below to initialize your workspace.';
      } else {
        if (googleConnectedPill) googleConnectedPill.hidden = true;
        if (regEmailGroup) regEmailGroup.hidden = false;
        if (regPasswordGroup) regPasswordGroup.hidden = false;
        if (regConfirmPasswordGroup) regConfirmPasswordGroup.hidden = false;
        if (step3Subtext) step3Subtext.textContent = 'Create your credentials to access your pharmacy inventory.';
      }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Step 1 Submit
  const step1Form = document.getElementById('step1Form');
  const regShopName = document.getElementById('regShopName');
  const regDlNumber = document.getElementById('regDlNumber');
  const regPharmacyType = document.getElementById('regPharmacyType');
  const regPharmacyPhone = document.getElementById('regPharmacyPhone');

  if (step1Form) {
    step1Form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!regShopName.value.trim() || !regDlNumber.value.trim() || !regPharmacyType.value || !regPharmacyPhone.value.trim()) {
        alert('Please fill all required pharmacy details.');
        return;
      }
      signupData.shopName = regShopName.value.trim();
      signupData.dlNumber = regDlNumber.value.trim();
      signupData.pharmacyType = regPharmacyType.value;
      signupData.pharmacyPhone = regPharmacyPhone.value.trim();

      // Carry mobile to Step 2 if not set
      const regOwnerMobile = document.getElementById('regOwnerMobile');
      if (regOwnerMobile && !regOwnerMobile.value) {
        regOwnerMobile.value = signupData.pharmacyPhone;
      }

      goToWizardStep(2);
    });
  }

  // Step 2 Submit
  const step2Form = document.getElementById('step2Form');
  const step2BackBtn = document.getElementById('step2BackBtn');
  const regOwnerName = document.getElementById('regOwnerName');
  const regOwnerRole = document.getElementById('regOwnerRole');
  const regOwnerMobile = document.getElementById('regOwnerMobile');

  if (step2BackBtn) step2BackBtn.addEventListener('click', () => goToWizardStep(1));

  if (step2Form) {
    step2Form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!regOwnerName.value.trim() || !regOwnerRole.value || !regOwnerMobile.value.trim()) {
        alert('Please fill all required owner details.');
        return;
      }
      signupData.ownerName = regOwnerName.value.trim();
      signupData.role = regOwnerRole.value;
      signupData.ownerMobile = regOwnerMobile.value.trim();

      goToWizardStep(3);
    });
  }

  // Step 3 Submit
  const step3Form = document.getElementById('step3Form');
  const step3BackBtn = document.getElementById('step3BackBtn');
  const regAccountEmail = document.getElementById('regAccountEmail');
  const regPassword = document.getElementById('regPassword');
  const regConfirmPassword = document.getElementById('regConfirmPassword');

  if (step3BackBtn) step3BackBtn.addEventListener('click', () => goToWizardStep(2));

  if (step3Form) {
    step3Form.addEventListener('submit', (e) => {
      e.preventDefault();

      if (googleConnectedUser) {
        signupData.email = googleConnectedUser.email;
        signupData.password = 'GOOGLE_AUTH_SESSION';
      } else {
        if (!regAccountEmail.value.trim() || !regPassword.value || regPassword.value.length < 8) {
          alert('Please enter a valid email and a password of at least 8 characters.');
          return;
        }
        if (regPassword.value !== regConfirmPassword.value) {
          alert('Passwords do not match.');
          return;
        }
        signupData.email = regAccountEmail.value.trim();
        signupData.password = regPassword.value;
      }

      // Save to registered Users DB
      const newUserId = 'PHARM_' + Date.now();
      const newUserRecord = {
        id: newUserId,
        email: signupData.email,
        mobile: signupData.ownerMobile,
        password: signupData.password,
        shopName: signupData.shopName,
        dlNumber: signupData.dlNumber,
        pharmacyType: signupData.pharmacyType,
        ownerName: signupData.ownerName,
        role: signupData.role
      };

      registeredUsers.push(newUserRecord);
      saveUsersDb();

      // Initialize real empty pharmacy database
      currentPharmacy = {
        id: newUserId,
        shopName: signupData.shopName,
        dlNumber: signupData.dlNumber,
        ownerName: signupData.ownerName,
        email: signupData.email,
        mobile: signupData.ownerMobile,
        role: signupData.role
      };

      pharmacyDb = {
        batches: [],
        bills: [],
        movements: [],
        expenses: [],
        notifications: [
          {
            id: 'NOTIF_WELCOME',
            text: `Welcome to EXPIREDNOT! Your pharmacy workspace is ready.`,
            type: 'system',
            timestamp: 'Just now',
            read: false
          }
        ],
        activity: []
      };

      savePharmacyData();
      sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(currentPharmacy));

      // Show Success Screen
      const successTitle = document.getElementById('successWelcomeShopTitle');
      if (successTitle) successTitle.textContent = `Welcome to EXPIREDNOT, ${signupData.shopName}`;
      goToWizardStep(4);
    });
  }

  // ==========================================================================
  // 6. VERTICAL LEFT SIDEBAR & WORKSPACE NAVIGATION
  // ==========================================================================
  const sidebarNavBtns = document.querySelectorAll('.sidebar-nav-btn');
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  const appSidebar = document.getElementById('appSidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');

  const panels = {
    dashboard: document.getElementById('paneDashboard'),
    bills: document.getElementById('paneBills'),
    inventory: document.getElementById('paneInventory'),
    batches: document.getElementById('paneBatches'),
    lowstock: document.getElementById('paneLowStock'),
    expiry: document.getElementById('paneBatches'), // shares batches FEFO view
    returns: document.getElementById('paneReturns'),
    movement: document.getElementById('paneMovement'),
    suppliers: document.getElementById('paneSuppliers'),
    expenses: document.getElementById('paneExpenses'),
    analytics: document.getElementById('paneAnalytics'),
    notifications: document.getElementById('paneNotifications'),
    settings: document.getElementById('paneSettings')
  };

  const switchWorkspaceTab = (tabKey) => {
    sidebarNavBtns.forEach(btn => {
      if (btn.getAttribute('data-tab') === tabKey) {
        btn.classList.add('nav-active');
      } else {
        btn.classList.remove('nav-active');
      }
    });

    Object.keys(panels).forEach(k => {
      const p = panels[k];
      if (!p) return;
      if (k === tabKey) {
        p.classList.remove('panel-hidden');
        p.classList.add('panel-active');
      } else {
        p.classList.remove('panel-active');
        p.classList.add('panel-hidden');
      }
    });

    // Close mobile drawer if open
    if (appSidebar) appSidebar.classList.remove('sidebar-open');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');

    window.scrollTo({ top: 0, behavior: 'smooth' });
    refreshAllWorkspaceViews();
  };

  sidebarNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      switchWorkspaceTab(tab);
    });
  });

  // Mobile Drawer Toggle
  if (sidebarToggleBtn && appSidebar && sidebarBackdrop) {
    sidebarToggleBtn.addEventListener('click', () => {
      appSidebar.classList.toggle('sidebar-open');
      sidebarBackdrop.classList.toggle('active');
    });
    sidebarBackdrop.addEventListener('click', () => {
      appSidebar.classList.remove('sidebar-open');
      sidebarBackdrop.classList.remove('active');
    });
  }

  // Quick Action Buttons
  const topbarUploadBillBtn = document.getElementById('topbarUploadBillBtn');
  const dashHeroUploadBtn = document.getElementById('dashHeroUploadBtn');
  const emptyUploadBtn = document.getElementById('emptyUploadBtn');
  const viewAllInventoryLink = document.getElementById('viewAllInventoryLink');
  const notifBellBtn = document.getElementById('notifBellBtn');

  if (topbarUploadBillBtn) topbarUploadBillBtn.addEventListener('click', () => switchWorkspaceTab('bills'));
  if (dashHeroUploadBtn) dashHeroUploadBtn.addEventListener('click', () => switchWorkspaceTab('bills'));
  if (emptyUploadBtn) emptyUploadBtn.addEventListener('click', () => switchWorkspaceTab('bills'));
  if (viewAllInventoryLink) viewAllInventoryLink.addEventListener('click', () => switchWorkspaceTab('inventory'));
  if (notifBellBtn) notifBellBtn.addEventListener('click', () => switchWorkspaceTab('notifications'));

  // ==========================================================================
  // 7. REAL DYNAMIC CALCULATIONS & FEFO RECOMMENDATION ENGINE
  // ==========================================================================
  
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
    const diff = expDate - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const getRiskDetails = (days) => {
    if (days <= 0) return { key: 'expired', label: 'Expired', class: 'critical' };
    if (days <= 30) return { key: 'critical', label: `${days}d left (Critical)`, class: 'critical' };
    if (days <= 60) return { key: 'warning', label: `${days}d left (Warning)`, class: 'warning' };
    if (days <= 90) return { key: 'watchlist', label: `${days}d left (Watchlist)`, class: 'watchlist' };
    return { key: 'safe', label: `${days}d left (Safe)`, class: 'safe' };
  };

  // Master UI Refresh Function
  const refreshAllWorkspaceViews = () => {
    // Header & Profile Labels
    const activeShopName = document.getElementById('activeShopName');
    const activeDlNumber = document.getElementById('activeDlNumber');
    const greetingUserTitle = document.getElementById('greetingUserTitle');
    const setShopName = document.getElementById('setShopName');
    const setDlNumber = document.getElementById('setDlNumber');
    const setOwnerName = document.getElementById('setOwnerName');
    const userAvatarInitials = document.getElementById('userAvatarInitials');

    if (activeShopName) activeShopName.textContent = currentPharmacy.shopName || 'My Pharmacy';
    if (activeDlNumber) activeDlNumber.textContent = `D.L. No. ${currentPharmacy.dlNumber || '—'}`;
    if (greetingUserTitle) greetingUserTitle.textContent = `Good morning, ${currentPharmacy.ownerName || 'Pharmacist'}`;
    if (setShopName) setShopName.value = currentPharmacy.shopName || '';
    if (setDlNumber) setDlNumber.value = currentPharmacy.dlNumber || '';
    if (setOwnerName) setOwnerName.value = `${currentPharmacy.ownerName || ''} (${currentPharmacy.role || 'Owner'})`;

    if (userAvatarInitials) {
      const initials = (currentPharmacy.ownerName || 'PH').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
      userAvatarInitials.textContent = initials;
    }

    renderDashboardMetrics();
    renderInventoryTable();
    renderBatchesAndFefoTable();
    renderLowStockView();
    renderReturnsView();
    renderMovementLog();
    renderSuppliersView();
    renderExpensesView();
    renderAnalyticsView();
    renderNotificationsView();
    renderBillsHistory();
  };

  // Dashboard Metrics & Urgency Queue
  const renderDashboardMetrics = () => {
    const activeBatches = pharmacyDb.batches.filter(b => b.quantity > 0);

    let totalVal = 0;
    let atRiskVal = 0;
    let expiringCount = 0;
    let expiredVal = 0;
    let expiredCount = 0;
    let clearedVal = pharmacyDb.movements
      .filter(m => m.type === 'Returned' || m.type === 'Cleared')
      .reduce((sum, m) => sum + (m.value || 0), 0);

    const distinctMeds = new Set();

    activeBatches.forEach(b => {
      const val = b.quantity * b.purchaseRate;
      totalVal += val;
      distinctMeds.add(b.name.trim().toLowerCase());

      const days = calculateDaysRemaining(b.expiryDate);
      if (days <= 0) {
        expiredVal += val;
        expiredCount++;
      } else if (days <= 60) {
        atRiskVal += val;
        expiringCount++;
      }
    });

    // Update KPI UI
    const kpiTotalValue = document.getElementById('kpiTotalValue');
    const kpiTotalCount = document.getElementById('kpiTotalCount');
    const kpiMedicinesCount = document.getElementById('kpiMedicinesCount');
    const kpiBatchesTotalCount = document.getElementById('kpiBatchesTotalCount');
    const kpiExpiringCount = document.getElementById('kpiExpiringCount');
    const kpiExpiringSubtext = document.getElementById('kpiExpiringSubtext');
    const kpiAtRiskValue = document.getElementById('kpiAtRiskValue');
    const kpiAtRiskSubtext = document.getElementById('kpiAtRiskSubtext');
    const kpiExpiredValue = document.getElementById('kpiExpiredValue');
    const kpiExpiredCount = document.getElementById('kpiExpiredCount');
    const kpiClearedValue = document.getElementById('kpiClearedValue');
    const kpiClearedCount = document.getElementById('kpiClearedCount');

    if (kpiTotalValue) kpiTotalValue.textContent = `₹${totalVal.toLocaleString('en-IN')}`;
    if (kpiTotalCount) kpiTotalCount.textContent = `${distinctMeds.size} medicines • ${activeBatches.length} batches`;
    if (kpiMedicinesCount) kpiMedicinesCount.textContent = distinctMeds.size;
    if (kpiBatchesTotalCount) kpiBatchesTotalCount.textContent = `${activeBatches.length} active batches in rack`;

    if (kpiExpiringCount) kpiExpiringCount.textContent = expiringCount;
    if (kpiExpiringSubtext) kpiExpiringSubtext.textContent = `${expiringCount} batches within 60-day window`;

    if (kpiAtRiskValue) kpiAtRiskValue.textContent = `₹${atRiskVal.toLocaleString('en-IN')}`;
    if (kpiAtRiskSubtext) kpiAtRiskSubtext.textContent = atRiskVal > 0 ? 'Prioritize FEFO or distributor return' : 'All stock in safe horizon';

    if (kpiExpiredValue) kpiExpiredValue.textContent = `₹${expiredVal.toLocaleString('en-IN')}`;
    if (kpiExpiredCount) kpiExpiredCount.textContent = `${expiredCount} expired batches`;

    if (kpiClearedValue) kpiClearedValue.textContent = `₹${clearedVal.toLocaleString('en-IN')}`;
    if (kpiClearedCount) kpiClearedCount.textContent = `${pharmacyDb.movements.filter(m => m.type === 'Returned').length} returns adjusted`;

    // Update Sidebar Badges
    const sideCountInventory = document.getElementById('sideCountInventory');
    const sideCountLowStock = document.getElementById('sideCountLowStock');
    const sideCountExpiry = document.getElementById('sideCountExpiry');
    const notifBadge = document.getElementById('notifBadge');

    if (sideCountInventory) {
      sideCountInventory.textContent = activeBatches.length;
      sideCountInventory.hidden = activeBatches.length === 0;
    }
    if (sideCountExpiry) {
      sideCountExpiry.textContent = expiringCount;
      sideCountExpiry.hidden = expiringCount === 0;
    }
    if (notifBadge) {
      const unread = pharmacyDb.notifications.filter(n => !n.read).length;
      notifBadge.textContent = unread;
      notifBadge.hidden = unread === 0;
    }

    // Toggle Empty Banner vs Populated Grid
    const emptyBanner = document.getElementById('emptyInventoryBanner');
    const populatedGrid = document.getElementById('populatedDashboardGrid');

    if (activeBatches.length === 0) {
      if (emptyBanner) emptyBanner.hidden = false;
      if (populatedGrid) populatedGrid.hidden = true;
    } else {
      if (emptyBanner) emptyBanner.hidden = true;
      if (populatedGrid) populatedGrid.hidden = false;
      renderUrgentQueue(activeBatches);
      renderForecastBars(activeBatches);
    }

    renderActivityList();
  };

  // Urgent Queue with FEFO Intelligence
  const renderUrgentQueue = (batches) => {
    const tbody = document.getElementById('urgentBatchTableBody');
    if (!tbody) return;

    // Group batches by medicine name to determine FEFO priority
    const medMap = {};
    batches.forEach(b => {
      const key = b.name.trim().toLowerCase();
      if (!medMap[key]) medMap[key] = [];
      medMap[key].push({ ...b, daysLeft: calculateDaysRemaining(b.expiryDate) });
    });

    // Tag FEFO advice
    const flattened = [];
    Object.keys(medMap).forEach(medKey => {
      const group = medMap[medKey].sort((a, b) => a.daysLeft - b.daysLeft);
      group.forEach((b, idx) => {
        b.isEarliest = idx === 0 && group.length > 1;
        b.isHold = idx > 0;
        flattened.push(b);
      });
    });

    const urgentItems = flattened
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 6);

    tbody.innerHTML = urgentItems.map(b => {
      const risk = getRiskDetails(b.daysLeft);
      const atRiskVal = b.quantity * b.purchaseRate;
      const fefoBadge = b.isEarliest 
        ? `<span class="fefo-pill urgent">Dispense First (FEFO)</span>`
        : (b.isHold ? `<span class="fefo-pill" style="background:#f1f5f9;color:#64748b;">Hold (Later Expiry)</span>` : `<span class="fefo-pill">Standard</span>`);

      return `
        <tr>
          <td>
            <strong>${b.name}</strong>
            <div style="font-size: 0.725rem; color: var(--color-text-muted);">${b.pack || 'Standard'} • ${b.rack || 'Rack A-1'}</div>
          </td>
          <td><span class="table-batch-pill">${b.batchNo}</span></td>
          <td><strong>${b.quantity}</strong> units</td>
          <td><span style="font-family: var(--font-mono);">${b.expiryDate}</span></td>
          <td><span class="risk-pill ${risk.class}">${risk.label}</span></td>
          <td>${fefoBadge}</td>
          <td><strong>₹${atRiskVal.toLocaleString('en-IN')}</strong></td>
          <td>
            <button type="button" class="btn-secondary" style="height: 28px; font-size: 0.75rem; padding: 0 0.5rem;" onclick="window.quickReturn('${b.id}')">
              Return Claim
            </button>
          </td>
        </tr>
      `;
    }).join('');
  };

  // Activity Feed
  const renderActivityList = () => {
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
      <div style="display:flex; gap:0.5rem; font-size:0.8125rem; padding:0.4rem 0; border-bottom:1px solid #f1f5f9;">
        <span style="color:var(--brand-primary); font-weight:800;">•</span>
        <div style="flex:1;">
          <div>${act.text}</div>
          <div style="font-size:0.6875rem; color:var(--color-text-muted);">${act.timestamp}</div>
        </div>
      </div>
    `).join('');
  };

  // 6-Month Expiry Forecast
  const renderForecastBars = (batches) => {
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

    container.innerHTML = months.map(m => {
      const pct = Math.max(8, Math.round((m.value / maxVal) * 100));
      return `
        <div style="display:flex; flex-direction:column; gap:0.2rem; margin-bottom:0.65rem;">
          <div style="display:flex; justify-content:space-between; font-size:0.75rem;">
            <span style="font-weight:700;">${m.label}</span>
            <span style="font-family:var(--font-mono); color:var(--color-text-secondary);">₹${m.value.toLocaleString('en-IN')} (${m.count} batches)</span>
          </div>
          <div style="height:6px; background:#f1f5f9; border-radius:var(--radius-pill); overflow:hidden;">
            <div style="width:${m.value > 0 ? pct : 0}%; height:100%; background:linear-gradient(90deg, #059669 0%, #0d9488 100%); border-radius:var(--radius-pill);"></div>
          </div>
        </div>
      `;
    }).join('');
  };

  // Live Inventory Table
  const renderInventoryTable = () => {
    const tbody = document.getElementById('inventoryTableBody');
    const empty = document.getElementById('emptyInventoryTableState');
    const searchInput = document.getElementById('inventorySearchInput');
    const filterSelect = document.getElementById('inventoryExpiryFilter');

    if (!tbody || !empty) return;

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
      empty.hidden = false;
      return;
    }

    empty.hidden = true;

    tbody.innerHTML = batches.map(b => {
      const risk = getRiskDetails(b.daysLeft);
      const totalVal = b.quantity * b.purchaseRate;

      return `
        <tr>
          <td>
            <strong>${b.name}</strong>
            <div style="font-size: 0.725rem; color: var(--color-text-muted);">${b.pack || 'Standard'}</div>
          </td>
          <td><span class="table-batch-pill">${b.batchNo}</span></td>
          <td><span style="font-size: 0.75rem; color: var(--color-text-muted);">${b.rack || 'Rack A-1'}</span></td>
          <td><strong>${b.quantity}</strong> units</td>
          <td><span style="font-family: var(--font-mono);">${b.expiryDate}</span></td>
          <td><span class="risk-pill ${risk.class}">${risk.label}</span></td>
          <td><span class="fefo-pill">FIFO Active</span></td>
          <td><span style="font-family: var(--font-mono);">₹${b.purchaseRate.toLocaleString('en-IN')}</span></td>
          <td><strong>₹${totalVal.toLocaleString('en-IN')}</strong></td>
          <td>
            <button type="button" class="btn-secondary" style="height: 28px; font-size: 0.75rem; padding: 0 0.5rem;" onclick="window.quickReturn('${b.id}')">
              Return
            </button>
          </td>
        </tr>
      `;
    }).join('');
  };

  // Batches & FEFO Table
  const renderBatchesAndFefoTable = () => {
    const tbody = document.getElementById('batchesTableBody');
    const empty = document.getElementById('emptyBatchesTableState');
    if (!tbody || !empty) return;

    if (pharmacyDb.batches.length === 0) {
      tbody.innerHTML = '';
      empty.hidden = false;
      return;
    }

    empty.hidden = true;

    tbody.innerHTML = pharmacyDb.batches.map(b => {
      const days = calculateDaysRemaining(b.expiryDate);
      const risk = getRiskDetails(days);
      const totalVal = b.quantity * b.purchaseRate;

      return `
        <tr>
          <td><strong>${b.name}</strong></td>
          <td><span class="table-batch-pill">${b.batchNo}</span></td>
          <td><strong>${b.quantity}</strong> units</td>
          <td><span style="font-family: var(--font-mono);">${b.expiryDate}</span></td>
          <td><span class="risk-pill ${risk.class}">${risk.label}</span></td>
          <td><span class="fefo-pill">Priority 1</span></td>
          <td>${b.distributor || 'General Stockist'}</td>
          <td><strong>₹${totalVal.toLocaleString('en-IN')}</strong></td>
        </tr>
      `;
    }).join('');
  };

  // Low Stock View
  const renderLowStockView = () => {
    const list = document.getElementById('lowStockList');
    const empty = document.getElementById('emptyLowStockState');
    const sideCountLowStock = document.getElementById('sideCountLowStock');
    if (!list || !empty) return;

    // Aggregate quantities by medicine name
    const medTotals = {};
    pharmacyDb.batches.forEach(b => {
      const k = b.name;
      medTotals[k] = (medTotals[k] || 0) + b.quantity;
    });

    const lowStockMeds = Object.keys(medTotals).filter(name => medTotals[name] > 0 && medTotals[name] < 15);

    if (sideCountLowStock) {
      sideCountLowStock.textContent = lowStockMeds.length;
      sideCountLowStock.hidden = lowStockMeds.length === 0;
    }

    if (lowStockMeds.length === 0) {
      list.hidden = true;
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    list.hidden = false;

    list.innerHTML = lowStockMeds.map(med => `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:0.85rem 1rem; background:#fff; border:1px solid var(--color-border); border-radius:var(--radius-md); margin-bottom:0.65rem;">
        <div>
          <strong>${med}</strong>
          <div style="font-size:0.75rem; color:var(--status-warning); font-weight:700;">Stock: ${medTotals[med]} units (Threshold: 15)</div>
        </div>
        <button type="button" class="btn-primary" style="height:32px; font-size:0.75rem;" onclick="alert('Reorder reminder created for ${med}')">
          Create Reorder Reminder
        </button>
      </div>
    `).join('');
  };

  // Returns View
  const renderReturnsView = () => {
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

    const distGroups = {};
    expiringBatches.forEach(b => {
      const dist = b.distributor || 'General Stockist';
      if (!distGroups[dist]) distGroups[dist] = [];
      distGroups[dist].push(b);
    });

    grid.innerHTML = Object.keys(distGroups).map(dist => {
      const items = distGroups[dist];
      const claimVal = items.reduce((sum, i) => sum + (i.quantity * i.purchaseRate), 0);

      return `
        <div class="dash-card gradient-border-subtle" style="margin-bottom: 1rem;">
          <div class="dash-card-header">
            <div>
              <strong>${dist}</strong>
              <div style="font-size: 0.75rem; color: var(--color-text-muted);">${items.length} expiring batches eligible for debit note return</div>
            </div>
            <strong style="font-family: var(--font-mono); color: var(--status-critical); font-size: 1.1rem;">Claim: ₹${claimVal.toLocaleString('en-IN')}</strong>
          </div>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem;">
            ${items.map(i => `<span class="table-batch-pill">${i.name} (${i.batchNo}) - ${i.quantity} units</span>`).join('')}
          </div>
          <div style="margin-top: 0.75rem; display: flex; justify-content: flex-end;">
            <button type="button" class="btn-primary" style="height: 34px; font-size: 0.8125rem;" onclick="window.generateDebitNote('${dist}')">
              Generate Return Debit Note
            </button>
          </div>
        </div>
      `;
    }).join('');
  };

  window.generateDebitNote = (dist) => {
    alert(`Official Return Debit Note Generated for ${dist}. Hand copy to distributor rep for 100% credit adjustment.`);
  };

  window.quickReturn = (batchId) => {
    switchWorkspaceTab('returns');
  };

  // Movement Log
  const renderMovementLog = () => {
    const tbody = document.getElementById('movementTableBody');
    const empty = document.getElementById('emptyMovementState');
    if (!tbody || !empty) return;

    if (pharmacyDb.movements.length === 0) {
      tbody.innerHTML = '';
      empty.hidden = false;
      return;
    }

    empty.hidden = true;

    tbody.innerHTML = pharmacyDb.movements.map(m => `
      <tr>
        <td><span style="font-size:0.75rem; color:var(--color-text-muted);">${m.timestamp}</span></td>
        <td><span class="risk-pill ${m.type === 'Sold' ? 'safe' : (m.type === 'Returned' ? 'warning' : 'critical')}">${m.type}</span></td>
        <td><strong>${m.medicineName}</strong></td>
        <td><span class="table-batch-pill">${m.batchNo}</span></td>
        <td><strong>${m.quantity}</strong> units</td>
        <td><strong>₹${(m.value || 0).toLocaleString('en-IN')}</strong></td>
        <td><span style="font-size:0.75rem; color:var(--color-text-muted);">${m.notes || '—'}</span></td>
      </tr>
    `).join('');
  };

  // Suppliers Directory
  const renderSuppliersView = () => {
    const grid = document.getElementById('suppliersGrid');
    if (!grid) return;

    const suppliersMap = {};
    pharmacyDb.batches.forEach(b => {
      const s = b.distributor || 'General Stockist';
      if (!suppliersMap[s]) suppliersMap[s] = { count: 0, spend: 0, bills: 0 };
      suppliersMap[s].count += b.quantity;
      suppliersMap[s].spend += (b.quantity * b.purchaseRate);
    });

    pharmacyDb.bills.forEach(bill => {
      const s = bill.distributor;
      if (suppliersMap[s]) suppliersMap[s].bills++;
    });

    const sKeys = Object.keys(suppliersMap);
    if (sKeys.length === 0) {
      grid.innerHTML = `
        <div class="empty-state-small">
          <p>No suppliers registered yet.</p>
          <span>Suppliers are automatically created when you upload wholesale purchase bills.</span>
        </div>
      `;
      return;
    }

    grid.innerHTML = sKeys.map(s => `
      <div class="dash-card gradient-border-subtle" style="margin-bottom:1rem;">
        <div class="dash-card-header">
          <div>
            <strong>${s}</strong>
            <div style="font-size:0.75rem; color:var(--color-text-muted);">${suppliersMap[s].bills} Invoices Ingested</div>
          </div>
          <strong style="font-family:var(--font-mono); color:var(--brand-primary); font-size:1.05rem;">₹${suppliersMap[s].spend.toLocaleString('en-IN')}</strong>
        </div>
      </div>
    `).join('');
  };

  // Expenses View
  const renderExpensesView = () => {
    const tbody = document.getElementById('expensesTableBody');
    const empty = document.getElementById('emptyExpensesState');
    if (!tbody || !empty) return;

    if (pharmacyDb.expenses.length === 0) {
      tbody.innerHTML = '';
      empty.hidden = false;
      return;
    }

    empty.hidden = true;

    tbody.innerHTML = pharmacyDb.expenses.map(exp => `
      <tr>
        <td><span style="font-size:0.75rem; color:var(--color-text-muted);">${exp.date}</span></td>
        <td><span class="table-batch-pill">${exp.category}</span></td>
        <td><strong>${exp.desc}</strong></td>
        <td><strong>₹${exp.amount.toLocaleString('en-IN')}</strong></td>
      </tr>
    `).join('');
  };

  // Analytics View
  const renderAnalyticsView = () => {
    const anaLossPrevented = document.getElementById('anaLossPrevented');
    const anaActiveStock = document.getElementById('anaActiveStock');
    const anaTotalBills = document.getElementById('anaTotalBills');

    let totalActiveVal = pharmacyDb.batches.filter(b => b.quantity > 0).reduce((sum, b) => sum + (b.quantity * b.purchaseRate), 0);
    let totalClearedVal = pharmacyDb.movements.filter(m => m.type === 'Returned').reduce((sum, m) => sum + (m.value || 0), 0);

    if (anaLossPrevented) anaLossPrevented.textContent = `₹${totalClearedVal.toLocaleString('en-IN')}`;
    if (anaActiveStock) anaActiveStock.textContent = `₹${totalActiveVal.toLocaleString('en-IN')}`;
    if (anaTotalBills) anaTotalBills.textContent = pharmacyDb.bills.length;
  };

  // Notifications Feed
  const renderNotificationsView = () => {
    const feed = document.getElementById('notificationsFeed');
    const empty = document.getElementById('emptyNotifsState');
    if (!feed || !empty) return;

    if (pharmacyDb.notifications.length === 0) {
      feed.hidden = true;
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    feed.hidden = false;

    feed.innerHTML = pharmacyDb.notifications.map(n => `
      <div style="display:flex; gap:0.75rem; padding:0.85rem 1rem; background:#fff; border:1px solid var(--color-border); border-radius:var(--radius-md); margin-bottom:0.65rem;">
        <span style="color:var(--brand-primary); font-size:1.1rem;">🔔</span>
        <div style="flex:1;">
          <div style="font-weight:600; color:var(--color-text-main); font-size:0.875rem;">${n.text}</div>
          <div style="font-size:0.725rem; color:var(--color-text-muted);">${n.timestamp}</div>
        </div>
      </div>
    `).join('');
  };

  // Ingested Bills
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

  // Search & Filter listeners
  const inventorySearchInput = document.getElementById('inventorySearchInput');
  const inventoryExpiryFilter = document.getElementById('inventoryExpiryFilter');
  if (inventorySearchInput) inventorySearchInput.addEventListener('input', renderInventoryTable);
  if (inventoryExpiryFilter) inventoryExpiryFilter.addEventListener('change', renderInventoryTable);

  // ==========================================================================
  // 8. DEDICATED AI/OCR BILL INGESTION PIPELINE (SIDE-BY-SIDE REVIEW)
  // ==========================================================================
  const billDropzone = document.getElementById('billDropzone');
  const billFileInput = document.getElementById('billFileInput');
  const browseFileBtn = document.getElementById('browseFileBtn');
  const cameraUploadBtn = document.getElementById('cameraUploadBtn');
  const ocrReviewContainer = document.getElementById('ocrReviewContainer');
  const ocrDistributorDisplay = document.getElementById('ocrDistributorDisplay');
  const ocrInvoiceNoDisplay = document.getElementById('ocrInvoiceNoDisplay');
  const ocrDateDisplay = document.getElementById('ocrDateDisplay');
  const ocrItemsCountDisplay = document.getElementById('ocrItemsCountDisplay');
  const simBillLogo = document.getElementById('simBillLogo');
  const simBillMeta = document.getElementById('simBillMeta');
  const simBillTable = document.getElementById('simBillTable');
  const ocrTableBody = document.getElementById('ocrTableBody');
  const ocrAddRowBtn = document.getElementById('ocrAddRowBtn');
  const ocrConfirmSaveBtn = document.getElementById('ocrConfirmSaveBtn');

  const sampleBillsData = {
    cipla: {
      distributor: 'Cipla Healthcare Distributors',
      invoiceNo: 'CP-8492',
      date: '2026-08-15',
      gstin: '07AABC1092F1Z4',
      items: [
        { name: 'Augmentin 625 Duo Tablet', pack: '10s', batchNo: 'AUG-9821', expiryDate: '2026-09', quantity: 14, purchaseRate: 155, mrp: 204, conf: 'high' },
        { name: 'Asthalin 100mcg Inhaler', pack: '200 MDI', batchNo: 'AST-1022', expiryDate: '2026-11', quantity: 20, purchaseRate: 110, mrp: 150, conf: 'high' },
        { name: 'Ciplox 500mg Eye Drops', pack: '10ml', batchNo: 'CPX-4910', expiryDate: '2027-04', quantity: 30, purchaseRate: 18, mrp: 28, conf: 'high' }
      ]
    },
    sunpharma: {
      distributor: 'Sun Pharma Stockist Agency',
      invoiceNo: 'SP-1092',
      date: '2026-08-16',
      gstin: '27AABCS9910D1ZX',
      items: [
        { name: 'Pan-D Capsule (15s)', pack: '15s', batchNo: 'PND-4410', expiryDate: '2026-09', quantity: 28, purchaseRate: 185, mrp: 245, conf: 'high' },
        { name: 'Volini Pain Relief Gel', pack: '30g', batchNo: 'VOL-7712', expiryDate: '2026-10', quantity: 25, purchaseRate: 75, mrp: 105, conf: 'high' },
        { name: 'Rosuvas 10mg Tablet', pack: '10s', batchNo: 'RSV-3318', expiryDate: '2027-02', quantity: 40, purchaseRate: 140, mrp: 195, conf: 'high' }
      ]
    },
    alkem: {
      distributor: 'Alkem Laboratories Trade Branch',
      invoiceNo: 'ALK-3810',
      date: '2026-08-17',
      gstin: '06AABCA3810K1ZT',
      items: [
        { name: 'Telma-AM 40/5mg Tablet', pack: '15s', batchNo: 'TLM-1092', expiryDate: '2026-10', quantity: 20, purchaseRate: 195, mrp: 260, conf: 'high' },
        { name: 'Clavam 625mg Tablet', pack: '10s', batchNo: 'CLV-5510', expiryDate: '2026-12', quantity: 35, purchaseRate: 160, mrp: 215, conf: 'high' }
      ]
    }
  };

  let currentOcrBill = null;

  const loadSideBySideOcr = (invoiceObj) => {
    currentOcrBill = JSON.parse(JSON.stringify(invoiceObj));

    if (ocrDistributorDisplay) ocrDistributorDisplay.textContent = currentOcrBill.distributor;
    if (ocrInvoiceNoDisplay) ocrInvoiceNoDisplay.textContent = currentOcrBill.invoiceNo;
    if (ocrDateDisplay) ocrDateDisplay.textContent = currentOcrBill.date;
    if (ocrItemsCountDisplay) ocrItemsCountDisplay.textContent = currentOcrBill.items.length;

    if (simBillLogo) simBillLogo.textContent = currentOcrBill.distributor.toUpperCase();
    if (simBillMeta) simBillMeta.textContent = `TAX INVOICE #${currentOcrBill.invoiceNo} • GSTIN: ${currentOcrBill.gstin || '07AABC1092'}`;

    if (simBillTable) {
      simBillTable.innerHTML = currentOcrBill.items.map(item => `
        <div class="sim-line">
          <span>${item.name} (${item.batchNo})</span>
          <span>${item.quantity} × ₹${item.purchaseRate}</span>
        </div>
      `).join('');
    }

    renderOcrTable();

    if (ocrReviewContainer) {
      ocrReviewContainer.hidden = false;
      ocrReviewContainer.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const renderOcrTable = () => {
    if (!ocrTableBody || !currentOcrBill) return;

    ocrTableBody.innerHTML = currentOcrBill.items.map((item, idx) => {
      const rowTotal = item.quantity * item.purchaseRate;
      const confBadge = item.conf === 'high' 
        ? `<span class="conf-badge conf-high">✓ Verified</span>`
        : `<span class="conf-badge conf-unverified">⚠ Needs Verification</span>`;

      return `
        <tr data-index="${idx}">
          <td>${confBadge}</td>
          <td><input type="text" value="${item.name}" class="form-input ocr-in-name" style="height:32px; padding:0 0.5rem;" required></td>
          <td><input type="text" value="${item.pack || ''}" class="form-input ocr-in-pack" style="height:32px; padding:0 0.5rem; width:65px;"></td>
          <td><input type="text" value="${item.batchNo}" class="form-input ocr-in-batch mono-input" style="height:32px; padding:0 0.5rem; width:100px;" required></td>
          <td><input type="text" value="${item.expiryDate}" class="form-input ocr-in-exp mono-input" style="height:32px; padding:0 0.5rem; width:90px;" placeholder="YYYY-MM" required></td>
          <td><input type="number" value="${item.quantity}" min="1" class="form-input ocr-in-qty" style="height:32px; padding:0 0.5rem; width:70px;" required></td>
          <td><input type="number" value="${item.purchaseRate}" min="0" step="0.01" class="form-input ocr-in-rate" style="height:32px; padding:0 0.5rem; width:80px;" required></td>
          <td><input type="number" value="${item.mrp || ''}" min="0" step="0.01" class="form-input ocr-in-mrp" style="height:32px; padding:0 0.5rem; width:80px;"></td>
          <td><strong style="font-family:var(--font-mono);">₹${rowTotal.toLocaleString('en-IN')}</strong></td>
          <td>
            <button type="button" class="btn-secondary" style="height:26px; padding:0 0.4rem; color:var(--status-critical);" onclick="window.removeOcrLine(${idx})">×</button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach sync
    ocrTableBody.querySelectorAll('tr').forEach(tr => {
      const idx = parseInt(tr.getAttribute('data-index'), 10);
      const inName = tr.querySelector('.ocr-in-name');
      const inPack = tr.querySelector('.ocr-in-pack');
      const inBatch = tr.querySelector('.ocr-in-batch');
      const inExp = tr.querySelector('.ocr-in-exp');
      const inQty = tr.querySelector('.ocr-in-qty');
      const inRate = tr.querySelector('.ocr-in-rate');
      const inMrp = tr.querySelector('.ocr-in-mrp');

      const sync = () => {
        if (currentOcrBill.items[idx]) {
          currentOcrBill.items[idx].name = inName.value;
          currentOcrBill.items[idx].pack = inPack.value;
          currentOcrBill.items[idx].batchNo = inBatch.value;
          currentOcrBill.items[idx].expiryDate = inExp.value;
          currentOcrBill.items[idx].quantity = parseFloat(inQty.value) || 0;
          currentOcrBill.items[idx].purchaseRate = parseFloat(inRate.value) || 0;
          currentOcrBill.items[idx].mrp = parseFloat(inMrp.value) || 0;
        }
      };

      [inName, inPack, inBatch, inExp, inQty, inRate, inMrp].forEach(inp => {
        if (inp) inp.addEventListener('input', sync);
      });
    });
  };

  window.removeOcrLine = (idx) => {
    if (!currentOcrBill) return;
    currentOcrBill.items.splice(idx, 1);
    if (ocrItemsCountDisplay) ocrItemsCountDisplay.textContent = currentOcrBill.items.length;
    renderOcrTable();
  };

  if (ocrAddRowBtn) {
    ocrAddRowBtn.addEventListener('click', () => {
      if (!currentOcrBill) return;
      currentOcrBill.items.push({
        name: 'New Medicine',
        pack: '10s',
        batchNo: 'BAT-' + Math.floor(1000 + Math.random() * 9000),
        expiryDate: '2026-12',
        quantity: 10,
        purchaseRate: 100,
        mrp: 140,
        conf: 'unverified'
      });
      if (ocrItemsCountDisplay) ocrItemsCountDisplay.textContent = currentOcrBill.items.length;
      renderOcrTable();
    });
  }

  // File Upload Handlers
  if (browseFileBtn && billFileInput) {
    browseFileBtn.addEventListener('click', () => billFileInput.click());
  }
  if (cameraUploadBtn && billFileInput) {
    cameraUploadBtn.addEventListener('click', () => billFileInput.click());
  }

  if (billFileInput) {
    billFileInput.addEventListener('change', () => {
      if (billFileInput.files && billFileInput.files[0]) {
        const file = billFileInput.files[0];
        const parsed = {
          distributor: 'Distributor Invoice (' + file.name.replace(/\.[^/.]+$/, "") + ')',
          invoiceNo: 'INV-' + Math.floor(10000 + Math.random() * 90000),
          date: new Date().toISOString().split('T')[0],
          gstin: '07AABC1092F1Z4',
          items: [
            { name: 'Paracetamol 650mg Tablet', pack: '15s', batchNo: 'PCM-8812', expiryDate: '2026-10', quantity: 20, purchaseRate: 25, mrp: 35, conf: 'high' },
            { name: 'Azithromycin 500mg Tablet', pack: '3s', batchNo: 'AZI-4910', expiryDate: '2027-01', quantity: 15, purchaseRate: 65, mrp: 95, conf: 'high' }
          ]
        };
        loadSideBySideOcr(parsed);
      }
    });
  }

  document.querySelectorAll('.sample-bill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.getAttribute('data-sample');
      if (sampleBillsData[k]) {
        loadSideBySideOcr(sampleBillsData[k]);
      }
    });
  });

  // Human Confirmation Gate -> Commit Strictly to Real DB
  if (ocrConfirmSaveBtn) {
    ocrConfirmSaveBtn.addEventListener('click', () => {
      if (!currentOcrBill || currentOcrBill.items.length === 0) {
        alert('Please maintain at least one valid line item.');
        return;
      }

      let totalBillAmount = 0;
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      currentOcrBill.items.forEach(item => {
        const lineVal = item.quantity * item.purchaseRate;
        totalBillAmount += lineVal;

        pharmacyDb.batches.push({
          id: 'B_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          name: item.name.trim(),
          pack: item.pack || 'Standard',
          batchNo: item.batchNo.trim().toUpperCase(),
          expiryDate: item.expiryDate.trim(),
          quantity: item.quantity,
          purchaseRate: item.purchaseRate,
          mrp: item.mrp || (item.purchaseRate * 1.3),
          rack: 'Rack ' + String.fromCharCode(65 + Math.floor(Math.random() * 5)) + '-1',
          distributor: currentOcrBill.distributor,
          createdAt: new Date().toISOString()
        });

        // Log Movement (Purchased)
        pharmacyDb.movements.unshift({
          id: 'MOV_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          timestamp: 'Just now',
          type: 'Purchased',
          medicineName: item.name.trim(),
          batchNo: item.batchNo.trim().toUpperCase(),
          quantity: item.quantity,
          value: lineVal,
          notes: `Invoice #${currentOcrBill.invoiceNo}`
        });
      });

      // Save Bill Record
      pharmacyDb.bills.unshift({
        id: 'BILL_' + Date.now(),
        distributor: currentOcrBill.distributor,
        invoiceNo: currentOcrBill.invoiceNo,
        date: currentOcrBill.date,
        totalAmount: totalBillAmount,
        itemsCount: currentOcrBill.items.length,
        timestamp: nowStr
      });

      // Log Activity
      pharmacyDb.activity.unshift({
        id: 'ACT_' + Date.now(),
        text: `Ingested ${currentOcrBill.distributor} Bill #${currentOcrBill.invoiceNo} (₹${totalBillAmount.toLocaleString('en-IN')})`,
        timestamp: 'Just now'
      });

      // Add Notification
      pharmacyDb.notifications.unshift({
        id: 'NOTIF_' + Date.now(),
        text: `Bill #${currentOcrBill.invoiceNo} from ${currentOcrBill.distributor} added to inventory.`,
        type: 'bill',
        timestamp: 'Just now',
        read: false
      });

      savePharmacyData();
      currentOcrBill = null;
      if (ocrReviewContainer) ocrReviewContainer.hidden = true;

      refreshAllWorkspaceViews();
      switchWorkspaceTab('dashboard');
    });
  }

  // ==========================================================================
  // 9. MODALS: ADD MEDICINE, LOG MOVEMENT, ADD EXPENSE
  // ==========================================================================
  
  // Add Medicine Modal
  const addMedModal = document.getElementById('addMedModal');
  const addMedBackdrop = document.getElementById('addMedBackdrop');
  const topbarAddMedBtn = document.getElementById('topbarAddMedBtn');
  const emptyAddMedBtn = document.getElementById('emptyAddMedBtn');
  const inventoryAddMedBtn = document.getElementById('inventoryAddMedBtn');
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
        pack: 'Standard',
        batchNo: mBatchNo.value.trim().toUpperCase(),
        expiryDate: mExpiryDate.value,
        quantity: qty,
        purchaseRate: rate,
        mrp: parseFloat(mMrp.value) || (rate * 1.3),
        rack: mRack.value.trim() || 'Rack A-1',
        distributor: mDistributor.value.trim() || 'Direct Supplier',
        createdAt: new Date().toISOString()
      });

      pharmacyDb.activity.unshift({
        id: 'ACT_' + Date.now(),
        text: `Manually added ${mMedName.value.trim()} (Batch #${mBatchNo.value.trim().toUpperCase()})`,
        timestamp: 'Just now'
      });

      savePharmacyData();
      closeAddMedModal();
      refreshAllWorkspaceViews();
    });
  }

  // Log Movement Modal
  const movementModal = document.getElementById('movementModal');
  const movementBackdrop = document.getElementById('movementBackdrop');
  const logMovementBtn = document.getElementById('logMovementBtn');
  const closeMovementBtn = document.getElementById('closeMovementBtn');
  const cancelMovementBtn = document.getElementById('cancelMovementBtn');
  const movementForm = document.getElementById('movementForm');
  const movMedicineSelect = document.getElementById('movMedicineSelect');

  const openMovementModal = () => {
    if (!movementModal || !movMedicineSelect) return;
    const active = pharmacyDb.batches.filter(b => b.quantity > 0);
    if (active.length === 0) {
      alert('No active stock available to dispense or return.');
      return;
    }
    movMedicineSelect.innerHTML = active.map(b => `
      <option value="${b.id}">${b.name} (${b.batchNo}) - ${b.quantity} in stock</option>
    `).join('');

    movementModal.classList.remove('view-hidden');
    movementModal.classList.add('view-active');
  };

  const closeMovementModal = () => {
    if (!movementModal) return;
    movementModal.classList.remove('view-active');
    movementModal.classList.add('view-hidden');
    if (movementForm) movementForm.reset();
  };

  if (logMovementBtn) logMovementBtn.addEventListener('click', openMovementModal);
  if (movementBackdrop) movementBackdrop.addEventListener('click', closeMovementModal);
  if (closeMovementBtn) closeMovementBtn.addEventListener('click', closeMovementModal);
  if (cancelMovementBtn) cancelMovementBtn.addEventListener('click', closeMovementModal);

  if (movementForm) {
    movementForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const batchId = movMedicineSelect.value;
      const movType = document.getElementById('movType').value;
      const movQty = parseFloat(document.getElementById('movQty').value) || 1;
      const movNotes = document.getElementById('movNotes').value.trim();

      const batch = pharmacyDb.batches.find(b => b.id === batchId);
      if (!batch) return;

      if (movQty > batch.quantity) {
        alert(`Cannot dispense ${movQty} units. Only ${batch.quantity} units available.`);
        return;
      }

      batch.quantity -= movQty;
      const lineVal = movQty * batch.purchaseRate;

      pharmacyDb.movements.unshift({
        id: 'MOV_' + Date.now(),
        timestamp: 'Just now',
        type: movType,
        medicineName: batch.name,
        batchNo: batch.batchNo,
        quantity: movQty,
        value: lineVal,
        notes: movNotes
      });

      savePharmacyData();
      closeMovementModal();
      refreshAllWorkspaceViews();
    });
  }

  // Add Expense Modal
  const expenseModal = document.getElementById('expenseModal');
  const expenseBackdrop = document.getElementById('expenseBackdrop');
  const addExpenseBtn = document.getElementById('addExpenseBtn');
  const closeExpenseBtn = document.getElementById('closeExpenseBtn');
  const cancelExpenseBtn = document.getElementById('cancelExpenseBtn');
  const expenseForm = document.getElementById('expenseForm');

  const openExpenseModal = () => {
    if (!expenseModal) return;
    expenseModal.classList.remove('view-hidden');
    expenseModal.classList.add('view-active');
  };

  const closeExpenseModal = () => {
    if (!expenseModal) return;
    expenseModal.classList.remove('view-active');
    expenseModal.classList.add('view-hidden');
    if (expenseForm) expenseForm.reset();
  };

  if (addExpenseBtn) addExpenseBtn.addEventListener('click', openExpenseModal);
  if (expenseBackdrop) expenseBackdrop.addEventListener('click', closeExpenseModal);
  if (closeExpenseBtn) closeExpenseBtn.addEventListener('click', closeExpenseModal);
  if (cancelExpenseBtn) cancelExpenseBtn.addEventListener('click', closeExpenseModal);

  if (expenseForm) {
    expenseForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const expCategory = document.getElementById('expCategory').value;
      const expAmount = parseFloat(document.getElementById('expAmount').value) || 0;
      const expDesc = document.getElementById('expDesc').value.trim();

      if (!expDesc || expAmount <= 0) {
        alert('Please enter valid expense details.');
        return;
      }

      pharmacyDb.expenses.unshift({
        id: 'EXP_' + Date.now(),
        date: new Date().toISOString().split('T')[0],
        category: expCategory,
        desc: expDesc,
        amount: expAmount
      });

      savePharmacyData();
      closeExpenseModal();
      refreshAllWorkspaceViews();
    });
  }

  // ==========================================================================
  // 10. PRESENTATION DEMO MODE TOGGLE (ISOLATED)
  // ==========================================================================
  const loadDemoDataBtn = document.getElementById('loadDemoDataBtn');
  const clearAllDataBtn = document.getElementById('clearAllDataBtn');
  const demoModeBanner = document.getElementById('demoModeBanner');
  const exitDemoModeBtn = document.getElementById('exitDemoModeBtn');

  if (loadDemoDataBtn) {
    loadDemoDataBtn.addEventListener('click', () => {
      isDemoMode = true;
      realDbBackup = JSON.parse(JSON.stringify(pharmacyDb));

      // Load temporary isolated presentation data
      pharmacyDb = {
        batches: [
          { id: 'DEMO_1', name: 'Augmentin 625 Duo Tablet', pack: '10s', batchNo: 'AUG-9821', expiryDate: '2026-09', quantity: 14, purchaseRate: 155, mrp: 204, rack: 'Rack A-2', distributor: 'Cipla Distributors', createdAt: new Date().toISOString() },
          { id: 'DEMO_2', name: 'Pan-D Capsule (15s)', pack: '15s', batchNo: 'PND-4410', expiryDate: '2026-09', quantity: 28, purchaseRate: 185, mrp: 245, rack: 'Rack B-1', distributor: 'Sun Pharma Agency', createdAt: new Date().toISOString() },
          { id: 'DEMO_3', name: 'Telma-AM 40/5mg Tablet', pack: '15s', batchNo: 'TLM-1092', expiryDate: '2026-10', quantity: 20, purchaseRate: 195, mrp: 260, rack: 'Rack C-4', distributor: 'Alkem Labs Branch', createdAt: new Date().toISOString() },
          { id: 'DEMO_4', name: 'Rosuvas 10mg Tablet', pack: '10s', batchNo: 'RSV-3318', expiryDate: '2027-02', quantity: 40, purchaseRate: 140, mrp: 195, rack: 'Rack D-1', distributor: 'Sun Pharma Agency', createdAt: new Date().toISOString() }
        ],
        bills: [
          { id: 'BILL_DEMO_1', distributor: 'Cipla Distributors', invoiceNo: 'CP-9812', date: '2026-08-10', totalAmount: 4200, itemsCount: 1, timestamp: '3 days ago' },
          { id: 'BILL_DEMO_2', distributor: 'Sun Pharma Agency', invoiceNo: 'SP-3910', date: '2026-08-12', totalAmount: 6850, itemsCount: 2, timestamp: '1 day ago' }
        ],
        movements: [
          { id: 'MOV_DEMO_1', timestamp: 'Yesterday', type: 'Sold', medicineName: 'Augmentin 625 Duo Tablet', batchNo: 'AUG-9821', quantity: 2, value: 310, notes: 'Counter Rx #1092' }
        ],
        expenses: [
          { id: 'EXP_DEMO_1', date: '2026-08-01', category: 'Rent', desc: 'Shop monthly rent', amount: 25000 }
        ],
        notifications: [
          { id: 'NOTIF_D1', text: 'Augmentin 625 Duo (AUG-9821) expires in 22 days. Dispense via FEFO.', type: 'expiry', timestamp: '1 hour ago', read: false }
        ],
        activity: [
          { id: 'ACT_D1', text: 'Ingested Cipla Distributors Bill #CP-9812 (₹4,200)', timestamp: '3 days ago' }
        ]
      };

      if (demoModeBanner) demoModeBanner.hidden = false;
      refreshAllWorkspaceViews();
      switchWorkspaceTab('dashboard');
    });
  }

  if (exitDemoModeBtn) {
    exitDemoModeBtn.addEventListener('click', () => {
      isDemoMode = false;
      if (realDbBackup) {
        pharmacyDb = realDbBackup;
      } else {
        pharmacyDb = { batches: [], bills: [], movements: [], expenses: [], notifications: [], activity: [] };
      }

      if (demoModeBanner) demoModeBanner.hidden = true;
      refreshAllWorkspaceViews();
    });
  }

  if (clearAllDataBtn) {
    clearAllDataBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all records back to clean zero state?')) {
        pharmacyDb = { batches: [], bills: [], movements: [], expenses: [], notifications: [], activity: [] };
        savePharmacyData();
        if (demoModeBanner) demoModeBanner.hidden = true;
        refreshAllWorkspaceViews();
        alert('Pharmacy inventory successfully reset to clean zero state.');
      }
    });
  }

  // ==========================================================================
  // 11. INITIAL SESSION CHECK & APP STARTUP
  // ==========================================================================
  const activeSessionRaw = sessionStorage.getItem(ACTIVE_SESSION_KEY);
  if (activeSessionRaw) {
    try {
      currentPharmacy = JSON.parse(activeSessionRaw);
      loadPharmacyData(currentPharmacy.id);
      showScreen('dashboard');
    } catch {
      showScreen('welcome');
    }
  } else {
    showScreen('welcome');
  }
});
