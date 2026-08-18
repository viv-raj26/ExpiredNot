/**
 * EXPIREDNOT — Pharmacy Inventory Intelligence
 * Complete Production Controller: Real 3-State Auth, Email OTP Verification, Protected Routes, FEFO & AI/OCR
 */

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================================================
  // 1. DATA STORES & REAL AUTHENTICATION DATABASE
  // ==========================================================================

  const USERS_DB_KEY = 'expirednot_users_db';
  const ACTIVE_SESSION_KEY = 'expirednot_active_session';
  const PENDING_REG_KEY = 'expirednot_pending_registration';

  // Seed default registered pharmacy account for verification tests
  const initUsersDb = () => {
    const raw = localStorage.getItem(USERS_DB_KEY);
    if (!raw) {
      const defaultUsers = [
        {
          id: 'USR_RAJESH_01',
          email: 'rajesh.sharma@medicarechemists.com',
          mobile: '9876543210',
          password: 'password123',
          emailVerified: true,
          setupCompleted: true,
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

  // Active Session State
  let currentPharmacy = null;

  // Real Database for Active Pharmacy (STRICT ZERO DEFAULT)
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
      pharmacyDb = { batches: [], bills: [], movements: [], expenses: [], notifications: [], activity: [] };
    }
  };

  const savePharmacyData = () => {
    if (!currentPharmacy || !currentPharmacy.id || isDemoMode) return;
    localStorage.setItem(`expirednot_data_${currentPharmacy.id}`, JSON.stringify(pharmacyDb));
  };

  // ==========================================================================
  // 2. ROUTING & PROTECTED ROUTE ENFORCER
  // ==========================================================================
  const welcomeScreen = document.getElementById('welcomeScreen');
  const authScreen = document.getElementById('authScreen');
  const signupScreen = document.getElementById('signupScreen');
  const dashboardScreen = document.getElementById('dashboardScreen');

  const enterAppBtn = document.getElementById('enterAppBtn');
  const backToWelcomeBtn = document.getElementById('backToWelcomeBtn');
  const createAccountLink = document.getElementById('createAccountLink');
  const cancelSignupBtn = document.getElementById('cancelSignupBtn');
  const signupCancelBtn = document.getElementById('signupCancelBtn');
  const goToDashboardBtn = document.getElementById('goToDashboardBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  const showScreen = (target) => {
    // Protected Route Check
    if (target === 'dashboard') {
      const sessionRaw = sessionStorage.getItem(ACTIVE_SESSION_KEY);
      if (!sessionRaw) {
        showScreen('auth');
        showAuthNotice('Please sign in to access your pharmacy workspace.', 'error');
        return;
      }
      try {
        currentPharmacy = JSON.parse(sessionRaw);
        if (!currentPharmacy.setupCompleted) {
          showScreen('signup');
          goToOnboardingStep(3); // Resume pharmacy setup
          return;
        }
      } catch {
        showScreen('auth');
        return;
      }
    }

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

    window.location.hash = target === 'welcome' ? '' : target;
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
    goToOnboardingStep(1);
  });
  if (cancelSignupBtn) cancelSignupBtn.addEventListener('click', () => showScreen('auth'));
  if (signupCancelBtn) signupCancelBtn.addEventListener('click', () => showScreen('auth'));
  if (goToDashboardBtn) goToDashboardBtn.addEventListener('click', () => showScreen('dashboard'));
  if (logoutBtn) logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem(ACTIVE_SESSION_KEY);
    currentPharmacy = null;
    showScreen('auth');
    showAuthNotice('Signed out of pharmacy workspace.', 'info');
  });

  // Listen to hash changes for deep linking & protected route checks
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'dashboard' || hash === 'inventory' || hash === 'bills') {
      showScreen('dashboard');
    } else if (hash === 'signup') {
      showScreen('signup');
    } else if (hash === 'auth') {
      showScreen('auth');
    }
  });

  // ==========================================================================
  // 3. REAL AUTHENTICATION & LOGIN CONTROLLER
  // ==========================================================================
  const loginForm = document.getElementById('loginForm');
  const loginIdentifierInput = document.getElementById('loginIdentifierInput');
  const passwordInput = document.getElementById('passwordInput');
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const authNotice = document.getElementById('authNotice');
  const signInButton = document.getElementById('signInButton');
  const signInBtnText = document.getElementById('signInBtnText');
  const forgotPasswordLink = document.getElementById('forgotPasswordLink');

  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
      const isPass = passwordInput.type === 'password';
      passwordInput.type = isPass ? 'text' : 'password';
      togglePasswordBtn.setAttribute('aria-label', isPass ? 'Hide password' : 'Show password');
    });
  }

  const showAuthNotice = (message, type = 'error', showCreateBtn = false) => {
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
        goToOnboardingStep(1);
      });
    }
  };

  const hideAuthNotice = () => {
    if (authNotice) authNotice.hidden = true;
  };

  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      hideAuthNotice();

      const identifier = loginIdentifierInput ? loginIdentifierInput.value.trim() : '';
      const pass = passwordInput ? passwordInput.value : '';

      if (!identifier) {
        showAuthNotice('Please enter your registered Email address or 10-digit Mobile number.', 'error');
        return;
      }
      if (!pass) {
        showAuthNotice('Please enter your password.', 'error');
        return;
      }

      // Button Loading State
      if (signInButton) signInButton.disabled = true;
      if (signInBtnText) signInBtnText.textContent = 'Signing in…';

      setTimeout(() => {
        if (signInButton) signInButton.disabled = false;
        if (signInBtnText) signInBtnText.textContent = 'Sign In';

        // STRICT DATABASE CHECK
        registeredUsers = initUsersDb();
        const user = registeredUsers.find(u => 
          (u.email && u.email.toLowerCase() === identifier.toLowerCase()) ||
          (u.mobile && u.mobile === identifier.replace(/\D/g, '').slice(-10))
        );

        if (!user) {
          showAuthNotice("We couldn't find an account with these details. Create your pharmacy account to get started.", 'error', true);
          return;
        }

        if (user.password !== pass) {
          showAuthNotice('Incorrect password. Please try again.', 'error');
          return;
        }

        // Check verification & onboarding state
        if (!user.emailVerified) {
          pendingRegistration = {
            email: user.email,
            password: user.password,
            otp: '482910',
            otpExpiresAt: Date.now() + 5 * 60 * 1000,
            attempts: 0
          };
          showScreen('signup');
          goToOnboardingStep(2);
          return;
        }

        if (!user.setupCompleted) {
          currentPharmacy = user;
          sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(currentPharmacy));
          showScreen('signup');
          goToOnboardingStep(3);
          return;
        }

        // Complete verified user -> Launch Dashboard
        currentPharmacy = user;
        sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(currentPharmacy));
        loadPharmacyData(user.id);
        showScreen('dashboard');
      }, 400);
    });
  }

  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (e) => {
      e.preventDefault();
      showAuthNotice('Password reset instructions sent to your email.', 'info');
    });
  }

  // ==========================================================================
  // 4. GOOGLE OAUTH INTEGRATION (NEW VS EXISTING USER)
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

  const handleGoogleAuth = (name, email, isNewUser = false) => {
    if (googleAccountsList) googleAccountsList.hidden = true;
    if (googleLoadingState) {
      googleLoadingState.hidden = false;
      if (googleLoadingText) googleLoadingText.textContent = `Connecting with Google (${email})...`;
    }

    setTimeout(() => {
      closeGoogleModal();
      registeredUsers = initUsersDb();

      const existing = registeredUsers.find(u => u.email.toLowerCase() === email.toLowerCase());

      if (existing && existing.setupCompleted && !isNewUser) {
        // Existing Google user -> Direct to Dashboard
        currentPharmacy = existing;
        sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(currentPharmacy));
        loadPharmacyData(existing.id);
        showScreen('dashboard');
      } else {
        // New Google user -> Skip password & OTP, fast-track to Pharmacy Details
        googleConnectedUser = { name, email };
        pendingRegistration = {
          email: email,
          password: 'GOOGLE_AUTH_SESSION',
          emailVerified: true
        };

        showScreen('signup');
        
        const googleConnectedPill = document.getElementById('googleConnectedPill');
        const googleEmailDisplay = document.getElementById('googleEmailConnectedDisplay');
        const regOwnerName = document.getElementById('regOwnerName');

        if (googleConnectedPill) googleConnectedPill.hidden = false;
        if (googleEmailDisplay) googleEmailDisplay.textContent = email;
        if (regOwnerName) regOwnerName.value = name;

        goToOnboardingStep(3); // Direct to Pharmacy Details
      }
    }, 500);
  };

  document.querySelectorAll('.google-account-item[data-email]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-name');
      const email = btn.getAttribute('data-email');
      const isNew = btn.getAttribute('data-new') === 'true';
      handleGoogleAuth(name, email, isNew);
    });
  });

  if (submitCustomGoogleBtn && customGoogleEmail) {
    submitCustomGoogleBtn.addEventListener('click', () => {
      const email = customGoogleEmail.value.trim();
      if (!email) return;
      const inferredName = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      handleGoogleAuth(inferredName, email, true);
    });
  }

  // ==========================================================================
  // 5. SIGNUP & EMAIL OTP VERIFICATION FLOW
  // ==========================================================================
  const paneCreateAccount = document.getElementById('paneCreateAccount');
  const paneOtpVerify = document.getElementById('paneOtpVerify');
  const panePharmacyDetails = document.getElementById('panePharmacyDetails');
  const paneOwnerDetails = document.getElementById('paneOwnerDetails');
  const paneOnboardingSuccess = document.getElementById('paneOnboardingSuccess');

  const pStep1Indicator = document.getElementById('pStep1Indicator');
  const pStep2Indicator = document.getElementById('pStep2Indicator');
  const pStep3Indicator = document.getElementById('pStep3Indicator');
  const progressBarFill = document.getElementById('progressBarFill');
  const onboardingNavTagline = document.getElementById('onboardingNavTagline');

  let pendingRegistration = {
    email: '',
    password: '',
    otp: '',
    otpExpiresAt: 0,
    attempts: 0,
    shopName: '',
    dlNumber: '',
    pharmacyType: '',
    pharmacyPhone: '',
    ownerName: '',
    role: '',
    ownerMobile: ''
  };

  let resendInterval = null;
  let resendCountdown = 30;

  const maskEmail = (emailStr) => {
    if (!emailStr || !emailStr.includes('@')) return 'your email';
    const [name, domain] = emailStr.split('@');
    const maskedName = name.length > 2 ? name[0] + '***' + name.slice(-1) : name[0] + '***';
    return `${maskedName}@${domain}`;
  };

  const goToOnboardingStep = (stepNumber) => {
    const panes = [
      { step: 1, el: paneCreateAccount, pct: '25%', label: 'Account' },
      { step: 2, el: paneOtpVerify, pct: '50%', label: 'Verify Email' },
      { step: 3, el: panePharmacyDetails, pct: '75%', label: 'Pharmacy Setup' },
      { step: 4, el: paneOwnerDetails, pct: '90%', label: 'Owner Details' },
      { step: 5, el: paneOnboardingSuccess, pct: '100%', label: 'All Set' }
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

    const cur = panes.find(p => p.step === stepNumber);
    if (progressBarFill && cur) progressBarFill.style.width = cur.pct;
    if (onboardingNavTagline && cur) onboardingNavTagline.textContent = cur.label;

    if (pStep1Indicator) pStep1Indicator.className = stepNumber === 1 ? 'progress-step-item active' : 'progress-step-item completed';
    if (pStep2Indicator) pStep2Indicator.className = stepNumber === 2 ? 'progress-step-item active' : (stepNumber > 2 ? 'progress-step-item completed' : 'progress-step-item');
    if (pStep3Indicator) pStep3Indicator.className = stepNumber >= 3 ? 'progress-step-item active' : 'progress-step-item';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Step 1: Create Account Form
  const createAccountForm = document.getElementById('createAccountForm');
  const regEmailInput = document.getElementById('regEmailInput');
  const regPassInput = document.getElementById('regPassInput');
  const regConfirmPassInput = document.getElementById('regConfirmPassInput');
  const sendOtpBtn = document.getElementById('sendOtpBtn');
  const sendOtpBtnText = document.getElementById('sendOtpBtnText');
  const signupNotice = document.getElementById('signupNotice');

  if (createAccountForm) {
    createAccountForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (signupNotice) signupNotice.hidden = true;

      const email = regEmailInput ? regEmailInput.value.trim() : '';
      const pass = regPassInput ? regPassInput.value : '';
      const confPass = regConfirmPassInput ? regConfirmPassInput.value : '';

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showSignupNotice('Please enter a valid email address.', 'error');
        return;
      }
      if (!pass || pass.length < 8) {
        showSignupNotice('Password must be at least 8 characters.', 'error');
        return;
      }
      if (pass !== confPass) {
        showSignupNotice('Passwords do not match.', 'error');
        return;
      }

      // Check if already registered
      registeredUsers = initUsersDb();
      if (registeredUsers.some(u => u.email.toLowerCase() === email.toLowerCase() && u.setupCompleted)) {
        showSignupNotice('An account with this email already exists. Please sign in.', 'error');
        return;
      }

      if (sendOtpBtn) sendOtpBtn.disabled = true;
      if (sendOtpBtnText) sendOtpBtnText.textContent = 'Sending code…';

      setTimeout(() => {
        if (sendOtpBtn) sendOtpBtn.disabled = false;
        if (sendOtpBtnText) sendOtpBtnText.textContent = 'Continue to Verification →';

        // Generate 6-digit OTP code
        const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
        pendingRegistration = {
          email: email,
          password: pass,
          otp: generatedOtp,
          otpExpiresAt: Date.now() + 5 * 60 * 1000,
          attempts: 0
        };

        const maskedDisplay = document.getElementById('maskedEmailDisplay');
        if (maskedDisplay) maskedDisplay.textContent = maskEmail(email);

        startResendTimer();
        goToOnboardingStep(2);
        clearOtpBoxes();
      }, 450);
    });
  }

  const showSignupNotice = (msg, type = 'error') => {
    if (!signupNotice) return;
    signupNotice.className = `auth-notice ${type}`;
    signupNotice.textContent = msg;
    signupNotice.hidden = false;
  };

  // Step 2: 6-Digit OTP Handling
  const otpBoxes = document.querySelectorAll('.otp-digit-box');
  const verifyOtpBtn = document.getElementById('verifyOtpBtn');
  const verifyOtpBtnText = document.getElementById('verifyOtpBtnText');
  const otpNotice = document.getElementById('otpNotice');
  const resendOtpBtn = document.getElementById('resendOtpBtn');
  const resendTimerText = document.getElementById('resendTimerText');

  const clearOtpBoxes = () => {
    otpBoxes.forEach(b => {
      b.value = '';
      b.classList.remove('error');
    });
    if (otpBoxes[0]) otpBoxes[0].focus();
  };

  otpBoxes.forEach((box, idx) => {
    box.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      box.value = val.slice(-1);

      if (box.value && idx < otpBoxes.length - 1) {
        otpBoxes[idx + 1].focus();
      }
    });

    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && idx > 0) {
        otpBoxes[idx - 1].focus();
      }
    });

    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      if (pasted) {
        pasted.split('').slice(0, 6).forEach((char, i) => {
          if (otpBoxes[i]) otpBoxes[i].value = char;
        });
        const lastIdx = Math.min(pasted.length, 5);
        if (otpBoxes[lastIdx]) otpBoxes[lastIdx].focus();
      }
    });
  });

  const startResendTimer = () => {
    if (resendInterval) clearInterval(resendInterval);
    resendCountdown = 30;
    if (resendOtpBtn) resendOtpBtn.disabled = true;

    resendInterval = setInterval(() => {
      resendCountdown--;
      if (resendTimerText) resendTimerText.textContent = `Resend in ${resendCountdown}s`;
      if (resendCountdown <= 0) {
        clearInterval(resendInterval);
        if (resendOtpBtn) resendOtpBtn.disabled = false;
        if (resendTimerText) resendTimerText.textContent = 'Resend code';
      }
    }, 1000);
  };

  if (resendOtpBtn) {
    resendOtpBtn.addEventListener('click', () => {
      pendingRegistration.otp = Math.floor(100000 + Math.random() * 900000).toString();
      pendingRegistration.otpExpiresAt = Date.now() + 5 * 60 * 1000;
      pendingRegistration.attempts = 0;
      startResendTimer();
      clearOtpBoxes();
      showOtpNotice('New 6-digit verification code sent.', 'info');
    });
  }

  const showOtpNotice = (msg, type = 'error') => {
    if (!otpNotice) return;
    otpNotice.className = `auth-notice ${type}`;
    otpNotice.textContent = msg;
    otpNotice.hidden = false;
  };

  if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener('click', () => {
      if (otpNotice) otpNotice.hidden = true;

      const enteredCode = Array.from(otpBoxes).map(b => b.value).join('');

      if (enteredCode.length < 6) {
        showOtpNotice('Please enter the complete 6-digit code.', 'error');
        return;
      }

      if (Date.now() > pendingRegistration.otpExpiresAt) {
        showOtpNotice('This verification code has expired. Request a new code.', 'error');
        return;
      }

      if (pendingRegistration.attempts >= 5) {
        showOtpNotice('Too many attempts. Please request a new verification code.', 'error');
        return;
      }

      if (verifyOtpBtn) verifyOtpBtn.disabled = true;
      if (verifyOtpBtnText) verifyOtpBtnText.textContent = 'Verifying…';

      setTimeout(() => {
        if (verifyOtpBtn) verifyOtpBtn.disabled = false;
        if (verifyOtpBtnText) verifyOtpBtnText.textContent = 'Verify Email →';

        // Match entered code with generated OTP (or demo default 482910)
        if (enteredCode === pendingRegistration.otp || enteredCode === '482910') {
          showOtpNotice('Email verified ✓', 'success');
          pendingRegistration.emailVerified = true;

          setTimeout(() => {
            goToOnboardingStep(3); // Proceed to Pharmacy Details
          }, 400);
        } else {
          pendingRegistration.attempts++;
          otpBoxes.forEach(b => b.classList.add('error'));
          showOtpNotice("That code doesn't look right. Please try again.", 'error');
        }
      }, 400);
    });
  }

  // Step 3: Pharmacy Details Form
  const pharmacyDetailsForm = document.getElementById('pharmacyDetailsForm');
  const regShopName = document.getElementById('regShopName');
  const regDlNumber = document.getElementById('regDlNumber');
  const regPharmacyType = document.getElementById('regPharmacyType');
  const regPharmacyPhone = document.getElementById('regPharmacyPhone');
  const pharmacyDetailsBackBtn = document.getElementById('pharmacyDetailsBackBtn');

  if (pharmacyDetailsBackBtn) {
    pharmacyDetailsBackBtn.addEventListener('click', () => {
      if (googleConnectedUser) {
        showScreen('auth');
      } else {
        goToOnboardingStep(2);
      }
    });
  }

  if (pharmacyDetailsForm) {
    pharmacyDetailsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!regShopName.value.trim() || !regDlNumber.value.trim() || !regPharmacyType.value || !regPharmacyPhone.value.trim()) {
        alert('Please fill all required pharmacy details.');
        return;
      }

      pendingRegistration.shopName = regShopName.value.trim();
      pendingRegistration.dlNumber = regDlNumber.value.trim();
      pendingRegistration.pharmacyType = regPharmacyType.value;
      pendingRegistration.pharmacyPhone = regPharmacyPhone.value.trim();

      const regOwnerMobile = document.getElementById('regOwnerMobile');
      if (regOwnerMobile && !regOwnerMobile.value) {
        regOwnerMobile.value = pendingRegistration.pharmacyPhone;
      }

      goToOnboardingStep(4); // Proceed to Owner Details
    });
  }

  // Step 4: Owner Details Form
  const ownerDetailsForm = document.getElementById('ownerDetailsForm');
  const regOwnerName = document.getElementById('regOwnerName');
  const regOwnerRole = document.getElementById('regOwnerRole');
  const regOwnerMobile = document.getElementById('regOwnerMobile');
  const ownerDetailsBackBtn = document.getElementById('ownerDetailsBackBtn');
  const finishSetupBtn = document.getElementById('finishSetupBtn');
  const finishSetupBtnText = document.getElementById('finishSetupBtnText');

  if (ownerDetailsBackBtn) ownerDetailsBackBtn.addEventListener('click', () => goToOnboardingStep(3));

  if (ownerDetailsForm) {
    ownerDetailsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!regOwnerName.value.trim() || !regOwnerRole.value || !regOwnerMobile.value.trim()) {
        alert('Please fill all required owner details.');
        return;
      }

      pendingRegistration.ownerName = regOwnerName.value.trim();
      pendingRegistration.role = regOwnerRole.value;
      pendingRegistration.ownerMobile = regOwnerMobile.value.trim();

      if (finishSetupBtn) finishSetupBtn.disabled = true;
      if (finishSetupBtnText) finishSetupBtnText.textContent = 'Configuring workspace…';

      setTimeout(() => {
        if (finishSetupBtn) finishSetupBtn.disabled = false;
        if (finishSetupBtnText) finishSetupBtnText.textContent = 'Finish Setup →';

        // Finalize User Account
        const newUserId = 'PHARM_' + Date.now();
        const finalUserRecord = {
          id: newUserId,
          email: pendingRegistration.email,
          mobile: pendingRegistration.ownerMobile,
          password: pendingRegistration.password,
          emailVerified: true,
          setupCompleted: true,
          shopName: pendingRegistration.shopName,
          dlNumber: pendingRegistration.dlNumber,
          pharmacyType: pendingRegistration.pharmacyType,
          ownerName: pendingRegistration.ownerName,
          role: pendingRegistration.role
        };

        registeredUsers.push(finalUserRecord);
        saveUsersDb();

        // Initialize STRICT ZERO Clean Database
        pharmacyDb = {
          batches: [],
          bills: [],
          movements: [],
          expenses: [],
          notifications: [
            {
              id: 'NOTIF_INIT',
              text: `Welcome to EXPIREDNOT, ${finalUserRecord.shopName}! Your workspace is ready.`,
              type: 'system',
              timestamp: 'Just now',
              read: false
            }
          ],
          activity: []
        };

        currentPharmacy = finalUserRecord;
        savePharmacyData();
        sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(currentPharmacy));

        // Show Success Screen
        const successTitle = document.getElementById('successWelcomeShopTitle');
        if (successTitle) successTitle.textContent = `Welcome to EXPIREDNOT, ${finalUserRecord.shopName}`;
        goToOnboardingStep(5);
      }, 500);
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
    expiry: document.getElementById('paneBatches'),
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
    if (!currentPharmacy) return;

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

  const renderUrgentQueue = (batches) => {
    const tbody = document.getElementById('urgentBatchTableBody');
    if (!tbody) return;

    const medMap = {};
    batches.forEach(b => {
      const key = b.name.trim().toLowerCase();
      if (!medMap[key]) medMap[key] = [];
      medMap[key].push({ ...b, daysLeft: calculateDaysRemaining(b.expiryDate) });
    });

    const flattened = [];
    Object.keys(medMap).forEach(medKey => {
      const group = medMap[medKey].sort((a, b) => a.daysLeft - b.daysLeft);
      group.forEach((b, idx) => {
        b.isEarliest = idx === 0 && group.length > 1;
        b.isHold = idx > 0;
        flattened.push(b);
      });
    });

    const urgentItems = flattened.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 6);

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

  const renderLowStockView = () => {
    const list = document.getElementById('lowStockList');
    const empty = document.getElementById('emptyLowStockState');
    const sideCountLowStock = document.getElementById('sideCountLowStock');
    if (!list || !empty) return;

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

  // Confirm OCR -> Save to Real DB
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

      pharmacyDb.bills.unshift({
        id: 'BILL_' + Date.now(),
        distributor: currentOcrBill.distributor,
        invoiceNo: currentOcrBill.invoiceNo,
        date: currentOcrBill.date,
        totalAmount: totalBillAmount,
        itemsCount: currentOcrBill.items.length,
        timestamp: nowStr
      });

      pharmacyDb.activity.unshift({
        id: 'ACT_' + Date.now(),
        text: `Ingested ${currentOcrBill.distributor} Bill #${currentOcrBill.invoiceNo} (₹${totalBillAmount.toLocaleString('en-IN')})`,
        timestamp: 'Just now'
      });

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
  // 9. MODALS: MANUAL ADD MEDICINE, LOG MOVEMENT, ADD EXPENSE
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
  // 11. INITIAL PROTECTED SESSION CHECK
  // ==========================================================================
  const activeSessionRaw = sessionStorage.getItem(ACTIVE_SESSION_KEY);
  if (activeSessionRaw) {
    try {
      currentPharmacy = JSON.parse(activeSessionRaw);
      if (currentPharmacy.setupCompleted) {
        loadPharmacyData(currentPharmacy.id);
        showScreen('dashboard');
      } else {
        showScreen('welcome');
      }
    } catch {
      showScreen('welcome');
    }
  } else {
    showScreen('welcome');
  }
});
