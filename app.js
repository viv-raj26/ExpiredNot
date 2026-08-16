/**
 * EXPIREDNOT — Pharmacy Inventory Intelligence
 * Complete Onboarding Flow: Welcome Screen, Dual Login (Email/Mobile), 3-Step Registration & Google Workspace SSO Modal
 */

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================================================
  // 1. TOP-LEVEL SCREEN ROUTING & NAVIGATION
  // ==========================================================================
  const welcomeScreen = document.getElementById('welcomeScreen');
  const authScreen = document.getElementById('authScreen');
  const signupScreen = document.getElementById('signupScreen');

  const enterAppBtn = document.getElementById('enterAppBtn');
  const backToWelcomeBtn = document.getElementById('backToWelcomeBtn');
  const createAccountLink = document.getElementById('createAccountLink');
  const cancelSignupBtn = document.getElementById('cancelSignupBtn');

  let isTransitioning = false;

  const showScreen = (target, immediate = false) => {
    if (isTransitioning) return;

    const screens = [
      { id: 'welcome', el: welcomeScreen },
      { id: 'auth', el: authScreen },
      { id: 'signup', el: signupScreen }
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

  // Hash change routing
  const handleRouting = () => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'signup' || hash === 'register') {
      showScreen('signup', true);
    } else if (hash === 'auth' || hash === 'login') {
      showScreen('auth', true);
    } else {
      showScreen('welcome', true);
    }
  };

  window.addEventListener('popstate', handleRouting);
  if (window.location.hash) {
    handleRouting();
  }

  // ==========================================================================
  // 2. LOGIN FORM WITH DUAL IDENTIFIER (EMAIL OR MOBILE NUMBER)
  // ==========================================================================
  const loginForm = document.getElementById('loginForm');
  const loginIdentifierInput = document.getElementById('loginIdentifierInput');
  const passwordInput = document.getElementById('passwordInput');
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const eyeIcon = document.getElementById('eyeIcon');
  const signInButton = document.getElementById('signInButton');
  const authNotice = document.getElementById('authNotice');
  const forgotPasswordLink = document.getElementById('forgotPasswordLink');

  // Toggle Password for Login
  if (togglePasswordBtn && passwordInput && eyeIcon) {
    togglePasswordBtn.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      
      eyeIcon.innerHTML = isPassword ? `
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      ` : `
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      `;
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
    authNotice.textContent = '';
  };

  // Helper validation for Email or Mobile
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
        if (loginIdentifierInput) loginIdentifierInput.focus();
        return;
      }

      const isEmail = isValidEmail(identifier);
      const isMobile = isValidMobile(identifier);

      if (!isEmail && !isMobile) {
        showAuthNotice('Please enter a valid email address (e.g. name@pharmacy.com) or 10-digit mobile number.', 'error');
        if (loginIdentifierInput) loginIdentifierInput.focus();
        return;
      }

      if (!password) {
        showAuthNotice('Please enter your password.', 'error');
        if (passwordInput) passwordInput.focus();
        return;
      }

      const originalText = signInButton.innerHTML;
      signInButton.disabled = true;
      signInButton.style.opacity = '0.85';
      signInButton.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
          <path d="M12 2a10 10 0 0 1 10 10"></path>
        </svg>
        <span>Signing in to pharmacy workspace...</span>
      `;

      if (!document.getElementById('spinAnimation')) {
        const style = document.createElement('style');
        style.id = 'spinAnimation';
        style.textContent = '@keyframes spin { 100% { transform: rotate(360deg); } }';
        document.head.appendChild(style);
      }

      setTimeout(() => {
        signInButton.disabled = false;
        signInButton.style.opacity = '1';
        signInButton.innerHTML = originalText;
        
        // Populate and go to dashboard success view
        regData.pharmacy.shopName = 'Apollo Chemist & Healthcare';
        regData.pharmacy.dlNumber = 'DL-20B/94812';
        regData.owner.mobile = isMobile ? identifier : '9876543210';
        regData.account.email = isEmail ? identifier : 'pharmacist@apollohealthcare.com';

        if (successShopNameDisplay) successShopNameDisplay.textContent = regData.pharmacy.shopName;
        if (successMetaDisplay) {
          successMetaDisplay.textContent = `D.L. No: ${regData.pharmacy.dlNumber} • Verified Session (${identifier})`;
        }

        showScreen('signup');
        goToRegStep(5);
      }, 700);
    });
  }

  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (e) => {
      e.preventDefault();
      showAuthNotice('Password reset OTP sent to your registered mobile and email.', 'info');
    });
  }

  // ==========================================================================
  // 3. GOOGLE WORKSPACE SSO MODAL CONTROLLER
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

  let googleAuthOrigin = 'login'; // 'login' or 'signup'

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

  // Toggle custom google input
  if (useAnotherGoogleBtn && customGoogleInputRow) {
    useAnotherGoogleBtn.addEventListener('click', () => {
      customGoogleInputRow.hidden = !customGoogleInputRow.hidden;
      if (!customGoogleInputRow.hidden && customGoogleEmail) {
        customGoogleEmail.focus();
      }
    });
  }

  // Handle Account Selection in Google Modal
  const processGoogleAccount = (name, email, shopName = '', dlNumber = '') => {
    if (googleAccountsList) googleAccountsList.hidden = true;
    if (googleLoadingState) {
      googleLoadingState.hidden = false;
      if (googleLoadingText) {
        googleLoadingText.textContent = `Authenticating as ${name} (${email})...`;
      }
    }

    setTimeout(() => {
      closeGoogleModal();

      if (googleAuthOrigin === 'signup') {
        // Fast fill registration fields
        if (regShopName && !regShopName.value && shopName) regShopName.value = shopName;
        if (regDlNumber && !regDlNumber.value && dlNumber) regDlNumber.value = dlNumber;
        if (regOwnerName) regOwnerName.value = name;
        if (regOwnerEmail) regOwnerEmail.value = email;
        if (regAccountEmail) regAccountEmail.value = email;
        regData.owner.name = name;
        regData.owner.email = email;
        regData.account.email = email;

        // Show fast fill notice
        showScreen('signup');
        goToRegStep(1);
      } else {
        // Directly sign in to pharmacy workspace
        regData.pharmacy.shopName = shopName || 'Medicare Pharmacy & Health';
        regData.pharmacy.dlNumber = dlNumber || 'DL-20B/94812';
        regData.owner.name = name;
        regData.owner.email = email;
        regData.owner.mobile = '9876543210';
        regData.account.email = email;

        if (successShopNameDisplay) successShopNameDisplay.textContent = regData.pharmacy.shopName;
        if (successMetaDisplay) {
          successMetaDisplay.textContent = `D.L. No: ${regData.pharmacy.dlNumber} • Google Workspace Verified (${email})`;
        }

        showScreen('signup');
        goToRegStep(5);
      }
    }, 700);
  };

  // Attach to Google account items
  const accountButtons = document.querySelectorAll('.google-account-item[data-email]');
  accountButtons.forEach(btn => {
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
      if (!email || !isValidEmail(email)) {
        customGoogleEmail.style.borderColor = 'var(--status-critical)';
        return;
      }
      const inferredName = email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      processGoogleAccount(inferredName, email, 'My Chemist & Pharmacy', 'DL-20B/XXXXX');
    });
  }

  // ==========================================================================
  // 4. 3-STEP PHARMACY ONBOARDING CONTROLLER
  // ==========================================================================
  
  // Registration Form Data Store
  const regData = {
    pharmacy: {
      shopName: '',
      dlNumber: '',
      pharmacyType: '',
      phone: '',
      email: '',
      addressLine: '',
      city: '',
      state: '',
      pinCode: '',
      gstin: '',
      pharmacyRegNo: '',
      altPhone: ''
    },
    owner: {
      name: '',
      role: '',
      mobile: '',
      email: ''
    },
    account: {
      email: '',
      password: '',
      confirmed: false
    }
  };

  // Step Elements
  const pStep1Indicator = document.getElementById('pStep1Indicator');
  const pStep2Indicator = document.getElementById('pStep2Indicator');
  const pStep3Indicator = document.getElementById('pStep3Indicator');
  const progressBarFill = document.getElementById('progressBarFill');

  const regStep1Pane = document.getElementById('regStep1Pane');
  const regStep2Pane = document.getElementById('regStep2Pane');
  const regStep3Pane = document.getElementById('regStep3Pane');
  const regStepReviewPane = document.getElementById('regStepReviewPane');
  const regStepSuccessPane = document.getElementById('regStepSuccessPane');

  // Step 1 Inputs
  const regShopName = document.getElementById('regShopName');
  const regDlNumber = document.getElementById('regDlNumber');
  const regPharmacyType = document.getElementById('regPharmacyType');
  const regPharmacyPhone = document.getElementById('regPharmacyPhone');
  const regPharmacyEmail = document.getElementById('regPharmacyEmail');
  const regAddressLine = document.getElementById('regAddressLine');
  const regCity = document.getElementById('regCity');
  const regState = document.getElementById('regState');
  const regPinCode = document.getElementById('regPinCode');
  const regGstin = document.getElementById('regGstin');
  const regPharmacyRegNo = document.getElementById('regPharmacyRegNo');
  const regAltPhone = document.getElementById('regAltPhone');

  // Step 2 Inputs
  const regOwnerName = document.getElementById('regOwnerName');
  const regOwnerRole = document.getElementById('regOwnerRole');
  const regOwnerMobile = document.getElementById('regOwnerMobile');
  const regOwnerEmail = document.getElementById('regOwnerEmail');

  // Step 3 Inputs
  const regAccountEmail = document.getElementById('regAccountEmail');
  const regPassword = document.getElementById('regPassword');
  const regConfirmPassword = document.getElementById('regConfirmPassword');
  const linkedMobileDisplay = document.getElementById('linkedMobileDisplay');
  const linkedEmailDisplay = document.getElementById('linkedEmailDisplay');
  const strengthBarFill = document.getElementById('strengthBarFill');
  const strengthLabelText = document.getElementById('strengthLabelText');

  const reqLen = document.getElementById('reqLen');
  const reqUpper = document.getElementById('reqUpper');
  const reqNum = document.getElementById('reqNum');
  const reqSpecial = document.getElementById('reqSpecial');

  // Review Elements
  const revShopName = document.getElementById('revShopName');
  const revDlNumber = document.getElementById('revDlNumber');
  const revPharmacyType = document.getElementById('revPharmacyType');
  const revPharmacyPhone = document.getElementById('revPharmacyPhone');
  const revAddressRow = document.getElementById('revAddressRow');
  const revAddress = document.getElementById('revAddress');
  const revOwnerName = document.getElementById('revOwnerName');
  const revOwnerRole = document.getElementById('revOwnerRole');
  const revOwnerMobile = document.getElementById('revOwnerMobile');
  const revAccountEmail = document.getElementById('revAccountEmail');
  const confirmAccuracyCheckbox = document.getElementById('confirmAccuracyCheckbox');

  // Success Elements
  const successShopNameDisplay = document.getElementById('successShopNameDisplay');
  const successMetaDisplay = document.getElementById('successMetaDisplay');
  const goToDashboardBtn = document.getElementById('goToDashboardBtn');
  const dashboardNotice = document.getElementById('dashboardNotice');

  // Helper function to switch steps
  const goToRegStep = (stepNumber) => {
    const panes = [
      { step: 1, el: regStep1Pane, indicator: pStep1Indicator, pct: '33.33%' },
      { step: 2, el: regStep2Pane, indicator: pStep2Indicator, pct: '66.66%' },
      { step: 3, el: regStep3Pane, indicator: pStep3Indicator, pct: '100%' },
      { step: 4, el: regStepReviewPane, indicator: null, pct: '100%' },
      { step: 5, el: regStepSuccessPane, indicator: null, pct: '100%' }
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

    // Update Progress Indicator
    if (stepNumber <= 3) {
      if (progressBarFill) progressBarFill.style.width = panes[stepNumber - 1].pct;

      if (pStep1Indicator) {
        pStep1Indicator.className = stepNumber === 1 ? 'progress-step-item active' : (stepNumber > 1 ? 'progress-step-item completed' : 'progress-step-item');
      }
      if (pStep2Indicator) {
        pStep2Indicator.className = stepNumber === 2 ? 'progress-step-item active' : (stepNumber > 2 ? 'progress-step-item completed' : 'progress-step-item');
      }
      if (pStep3Indicator) {
        pStep3Indicator.className = stepNumber === 3 ? 'progress-step-item active' : 'progress-step-item';
      }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Accordion Toggles in Step 1
  const toggleAddressBtn = document.getElementById('toggleAddressBtn');
  const addressContent = document.getElementById('addressContent');
  if (toggleAddressBtn && addressContent) {
    toggleAddressBtn.addEventListener('click', () => {
      const isHidden = addressContent.hidden;
      addressContent.hidden = !isHidden;
      toggleAddressBtn.setAttribute('aria-expanded', String(isHidden));
      const chevron = toggleAddressBtn.querySelector('.accordion-chevron');
      if (chevron) chevron.textContent = isHidden ? '−' : '+';
    });
  }

  const toggleBusinessBtn = document.getElementById('toggleBusinessBtn');
  const businessContent = document.getElementById('businessContent');
  if (toggleBusinessBtn && businessContent) {
    toggleBusinessBtn.addEventListener('click', () => {
      const isHidden = businessContent.hidden;
      businessContent.hidden = !isHidden;
      toggleBusinessBtn.setAttribute('aria-expanded', String(isHidden));
      const chevron = toggleBusinessBtn.querySelector('.accordion-chevron');
      if (chevron) chevron.textContent = isHidden ? '−' : '+';
    });
  }

  // --- STEP 1 SUBMIT & VALIDATION ---
  const step1Form = document.getElementById('step1Form');
  const step1BackBtn = document.getElementById('step1BackBtn');

  if (step1BackBtn) {
    step1BackBtn.addEventListener('click', () => showScreen('auth'));
  }

  const setFieldError = (errId, inputEl, show, msg = '') => {
    const errEl = document.getElementById(errId);
    if (errEl) {
      if (msg) errEl.textContent = msg;
      errEl.hidden = !show;
    }
    if (inputEl) {
      if (show) {
        inputEl.style.borderColor = 'var(--status-critical)';
      } else {
        inputEl.style.borderColor = '';
      }
    }
  };

  if (step1Form) {
    step1Form.addEventListener('submit', (e) => {
      e.preventDefault();
      let isValid = true;

      // Validate Shop Name
      const shopName = regShopName ? regShopName.value.trim() : '';
      if (!shopName) {
        setFieldError('errRegShopName', regShopName, true, 'Please enter your pharmacy or chemist shop name.');
        isValid = false;
      } else {
        setFieldError('errRegShopName', regShopName, false);
      }

      // Validate D.L. No.
      const dlNumber = regDlNumber ? regDlNumber.value.trim() : '';
      if (!dlNumber) {
        setFieldError('errRegDlNumber', regDlNumber, true, 'Please enter your Drug Licence Number.');
        isValid = false;
      } else {
        setFieldError('errRegDlNumber', regDlNumber, false);
      }

      // Validate Pharmacy Type
      const pharmacyType = regPharmacyType ? regPharmacyType.value : '';
      if (!pharmacyType) {
        setFieldError('errRegPharmacyType', regPharmacyType, true, 'Please select your pharmacy type.');
        isValid = false;
      } else {
        setFieldError('errRegPharmacyType', regPharmacyType, false);
      }

      // Validate Pharmacy Phone
      const phone = regPharmacyPhone ? regPharmacyPhone.value.trim() : '';
      if (!phone || !isValidMobile(phone)) {
        setFieldError('errRegPharmacyPhone', regPharmacyPhone, true, 'Please enter a valid 10-digit contact number.');
        isValid = false;
      } else {
        setFieldError('errRegPharmacyPhone', regPharmacyPhone, false);
      }

      if (!isValid) return;

      // Save Step 1 Data
      regData.pharmacy.shopName = shopName;
      regData.pharmacy.dlNumber = dlNumber;
      regData.pharmacy.pharmacyType = pharmacyType;
      regData.pharmacy.phone = phone;
      regData.pharmacy.email = regPharmacyEmail ? regPharmacyEmail.value.trim() : '';
      regData.pharmacy.addressLine = regAddressLine ? regAddressLine.value.trim() : '';
      regData.pharmacy.city = regCity ? regCity.value.trim() : '';
      regData.pharmacy.state = regState ? regState.value.trim() : '';
      regData.pharmacy.pinCode = regPinCode ? regPinCode.value.trim() : '';
      regData.pharmacy.gstin = regGstin ? regGstin.value.trim() : '';
      regData.pharmacy.pharmacyRegNo = regPharmacyRegNo ? regPharmacyRegNo.value.trim() : '';
      regData.pharmacy.altPhone = regAltPhone ? regAltPhone.value.trim() : '';

      goToRegStep(2);
    });
  }

  // --- STEP 2 SUBMIT & VALIDATION ---
  const step2Form = document.getElementById('step2Form');
  const step2BackBtn = document.getElementById('step2BackBtn');

  if (step2BackBtn) {
    step2BackBtn.addEventListener('click', () => goToRegStep(1));
  }

  if (step2Form) {
    step2Form.addEventListener('submit', (e) => {
      e.preventDefault();
      let isValid = true;

      // Validate Owner Name
      const name = regOwnerName ? regOwnerName.value.trim() : '';
      if (!name) {
        setFieldError('errRegOwnerName', regOwnerName, true, 'Please enter the full name.');
        isValid = false;
      } else {
        setFieldError('errRegOwnerName', regOwnerName, false);
      }

      // Validate Professional Role
      const role = regOwnerRole ? regOwnerRole.value : '';
      if (!role) {
        setFieldError('errRegOwnerRole', regOwnerRole, true, 'Please select your professional role.');
        isValid = false;
      } else {
        setFieldError('errRegOwnerRole', regOwnerRole, false);
      }

      // Validate Mobile Number
      const mobile = regOwnerMobile ? regOwnerMobile.value.trim() : '';
      if (!mobile || !isValidMobile(mobile)) {
        setFieldError('errRegOwnerMobile', regOwnerMobile, true, 'Please enter a valid 10-digit mobile number.');
        isValid = false;
      } else {
        setFieldError('errRegOwnerMobile', regOwnerMobile, false);
      }

      // Validate Email
      const email = regOwnerEmail ? regOwnerEmail.value.trim() : '';
      if (!email || !isValidEmail(email)) {
        setFieldError('errRegOwnerEmail', regOwnerEmail, true, 'Please enter a valid email address.');
        isValid = false;
      } else {
        setFieldError('errRegOwnerEmail', regOwnerEmail, false);
      }

      if (!isValid) return;

      // Save Step 2 Data
      regData.owner.name = name;
      regData.owner.role = role;
      regData.owner.mobile = mobile;
      regData.owner.email = email;

      // Sync to Step 3 linked badges & prefill email
      if (linkedMobileDisplay) linkedMobileDisplay.textContent = `+91 ${mobile}`;
      if (linkedEmailDisplay) linkedEmailDisplay.textContent = email;
      if (regAccountEmail && (!regAccountEmail.value || regAccountEmail.value === regData.account.email)) {
        regAccountEmail.value = email;
        regData.account.email = email;
      }

      goToRegStep(3);
    });
  }

  // --- STEP 3 PASSWORD VALIDATION & STRENGTH METER ---
  const step3Form = document.getElementById('step3Form');
  const step3BackBtn = document.getElementById('step3BackBtn');
  const toggleRegPasswordBtn = document.getElementById('toggleRegPasswordBtn');
  const toggleRegConfirmPasswordBtn = document.getElementById('toggleRegConfirmPasswordBtn');

  // Toggle Password for Step 3
  const setupToggle = (btnEl, inputEl) => {
    if (!btnEl || !inputEl) return;
    btnEl.addEventListener('click', () => {
      const isPwd = inputEl.type === 'password';
      inputEl.type = isPwd ? 'text' : 'password';
      btnEl.setAttribute('aria-label', isPwd ? 'Hide password' : 'Show password');
    });
  };

  setupToggle(toggleRegPasswordBtn, regPassword);
  setupToggle(toggleRegConfirmPasswordBtn, regConfirmPassword);

  const calculatePasswordStrength = (pwd) => {
    let score = 0;
    const hasLen = pwd.length >= 8;
    const hasUpper = /[A-Z]/.test(pwd);
    const hasNum = /[0-9]/.test(pwd);
    const hasSpecial = /[^A-Za-z0-9]/.test(pwd);

    if (reqLen) reqLen.className = hasLen ? 'req-item valid' : 'req-item';
    if (reqUpper) reqUpper.className = hasUpper ? 'req-item valid' : 'req-item';
    if (reqNum) reqNum.className = hasNum ? 'req-item valid' : 'req-item';
    if (reqSpecial) reqSpecial.className = hasSpecial ? 'req-item valid' : 'req-item';

    if (hasLen) score += 1;
    if (hasUpper) score += 1;
    if (hasNum) score += 1;
    if (hasSpecial) score += 1;

    return { score, allMet: hasLen && hasUpper && hasNum && hasSpecial };
  };

  if (regPassword) {
    regPassword.addEventListener('input', () => {
      const val = regPassword.value;
      if (!val) {
        if (strengthBarFill) {
          strengthBarFill.style.width = '0%';
          strengthBarFill.style.backgroundColor = 'transparent';
        }
        if (strengthLabelText) strengthLabelText.textContent = 'Password strength: —';
        return;
      }

      const { score } = calculatePasswordStrength(val);
      const strengthMap = [
        { label: 'Weak', width: '25%', color: '#e11d48' },
        { label: 'Fair', width: '50%', color: '#d97706' },
        { label: 'Good', width: '75%', color: '#0284c7' },
        { label: 'Strong', width: '100%', color: '#059669' }
      ];

      const current = strengthMap[Math.max(0, score - 1)];
      if (strengthBarFill) {
        strengthBarFill.style.width = current.width;
        strengthBarFill.style.backgroundColor = current.color;
      }
      if (strengthLabelText) {
        strengthLabelText.textContent = `Password strength: ${current.label}`;
        strengthLabelText.style.color = current.color;
      }
    });
  }

  if (step3BackBtn) {
    step3BackBtn.addEventListener('click', () => goToRegStep(2));
  }

  if (step3Form) {
    step3Form.addEventListener('submit', (e) => {
      e.preventDefault();
      let isValid = true;

      // Validate Account Email
      const accountEmail = regAccountEmail ? regAccountEmail.value.trim() : '';
      if (!accountEmail || !isValidEmail(accountEmail)) {
        setFieldError('errRegAccountEmail', regAccountEmail, true, 'Please enter a valid email address for login.');
        isValid = false;
      } else {
        setFieldError('errRegAccountEmail', regAccountEmail, false);
      }

      // Validate Password
      const pwd = regPassword ? regPassword.value : '';
      const { allMet } = calculatePasswordStrength(pwd);
      if (!pwd || !allMet) {
        setFieldError('errRegPassword', regPassword, true, 'Please create a password that meets all 4 requirements.');
        isValid = false;
      } else {
        setFieldError('errRegPassword', regPassword, false);
      }

      // Validate Confirm Password
      const confirmPwd = regConfirmPassword ? regConfirmPassword.value : '';
      if (!confirmPwd || confirmPwd !== pwd) {
        setFieldError('errRegConfirmPassword', regConfirmPassword, true, 'Passwords do not match.');
        isValid = false;
      } else {
        setFieldError('errRegConfirmPassword', regConfirmPassword, false);
      }

      if (!isValid) return;

      regData.account.email = accountEmail;
      regData.account.password = pwd;

      // Populate Review Screen
      if (revShopName) revShopName.textContent = regData.pharmacy.shopName;
      if (revDlNumber) revDlNumber.textContent = regData.pharmacy.dlNumber;
      if (revPharmacyType) revPharmacyType.textContent = regData.pharmacy.pharmacyType;
      if (revPharmacyPhone) revPharmacyPhone.textContent = `+91 ${regData.pharmacy.phone}`;

      const addrParts = [regData.pharmacy.addressLine, regData.pharmacy.city, regData.pharmacy.state, regData.pharmacy.pinCode].filter(Boolean);
      if (revAddressRow && revAddress) {
        if (addrParts.length > 0) {
          revAddress.textContent = addrParts.join(', ');
          revAddressRow.hidden = false;
        } else {
          revAddressRow.hidden = true;
        }
      }

      if (revOwnerName) revOwnerName.textContent = regData.owner.name;
      if (revOwnerRole) revOwnerRole.textContent = regData.owner.role;
      if (revOwnerMobile) revOwnerMobile.textContent = `+91 ${regData.owner.mobile}`;
      if (revAccountEmail) revAccountEmail.textContent = regData.account.email;

      goToRegStep(4);
    });
  }

  // --- STEP 4: REVIEW PROFILE & CONFIRMATION ---
  const editStep1Btn = document.getElementById('editStep1Btn');
  const editStep2Btn = document.getElementById('editStep2Btn');
  const stepReviewBackBtn = document.getElementById('stepReviewBackBtn');
  const finalCreateAccountBtn = document.getElementById('finalCreateAccountBtn');
  const errConfirmAccuracy = document.getElementById('errConfirmAccuracy');

  if (editStep1Btn) editStep1Btn.addEventListener('click', () => goToRegStep(1));
  if (editStep2Btn) editStep2Btn.addEventListener('click', () => goToRegStep(2));
  if (stepReviewBackBtn) stepReviewBackBtn.addEventListener('click', () => goToRegStep(3));

  if (finalCreateAccountBtn) {
    finalCreateAccountBtn.addEventListener('click', () => {
      if (!confirmAccuracyCheckbox || !confirmAccuracyCheckbox.checked) {
        if (errConfirmAccuracy) errConfirmAccuracy.hidden = false;
        return;
      }
      if (errConfirmAccuracy) errConfirmAccuracy.hidden = true;

      // Simulate account creation & show success screen
      const originalText = finalCreateAccountBtn.innerHTML;
      finalCreateAccountBtn.disabled = true;
      finalCreateAccountBtn.style.opacity = '0.85';
      finalCreateAccountBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
          <path d="M12 2a10 10 0 0 1 10 10"></path>
        </svg>
        <span>Creating pharmacy profile...</span>
      `;

      setTimeout(() => {
        finalCreateAccountBtn.disabled = false;
        finalCreateAccountBtn.style.opacity = '1';
        finalCreateAccountBtn.innerHTML = originalText;

        if (successShopNameDisplay) successShopNameDisplay.textContent = regData.pharmacy.shopName;
        if (successMetaDisplay) {
          successMetaDisplay.textContent = `D.L. No: ${regData.pharmacy.dlNumber} • Dual Sign-In Active (+91 ${regData.owner.mobile} / ${regData.account.email})`;
        }

        goToRegStep(5);
      }, 800);
    });
  }

  // --- STEP 5: SUCCESS SCREEN ---
  if (goToDashboardBtn) {
    goToDashboardBtn.addEventListener('click', () => {
      if (dashboardNotice) {
        dashboardNotice.className = 'auth-notice info';
        dashboardNotice.textContent = `Pharmacy account successfully initialized for "${regData.pharmacy.shopName}". Inventory dashboard and bill ingestion modules are ready for integration.`;
        dashboardNotice.hidden = false;
      }
    });
  }
});
