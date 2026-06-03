document.addEventListener('DOMContentLoaded', () => {
  // Show Form Modal Function - Creates and displays a form modal
  function showFormModal(options) {
    return new Promise((resolve) => {
      const {
        title = 'Form',
        description = '',
        submitText = 'Save',
        fields = [],
        onSubmit = null
      } = options;

      const modalEl = document.getElementById('entityFormModal');
      const titleEl = document.getElementById('entityFormTitle');
      const fieldsEl = document.getElementById('entityFormFields');
      const submitBtn = document.getElementById('entityFormSubmitBtn');
      const formEl = document.getElementById('entityForm');

      if (!modalEl || !titleEl || !fieldsEl || !submitBtn || !formEl) {
        resolve(null);
        return;
      }

      // Set title
      titleEl.textContent = title;

      // Clear and build fields
      fieldsEl.innerHTML = '';

      // Add description if provided
      if (description) {
        const descEl = document.createElement('div');
        descEl.className = 'col-12 modal-description';
        descEl.textContent = description;
        fieldsEl.appendChild(descEl);
      }

      fields.forEach((field) => {
        const col = document.createElement('div');
        col.className = field.colClass || 'col-12';

        const label = document.createElement('label');
        label.className = 'form-label';
        label.htmlFor = `field-${field.name}`;
        label.textContent = field.label;
        if (field.required) {
          label.innerHTML += ' <span class="text-danger">*</span>';
        }

        let input;

        if (field.type === 'select') {
          input = document.createElement('select');
          input.className = 'form-select';
          input.id = `field-${field.name}`;
          input.name = field.name;
          if (field.required) input.required = true;

          if (field.options && Array.isArray(field.options)) {
            field.options.forEach((opt) => {
              const optionEl = document.createElement('option');
              optionEl.value = opt.value;
              optionEl.textContent = opt.label;
              if (field.value === opt.value) {
                optionEl.selected = true;
              }
              input.appendChild(optionEl);
            });
          }
        } else if (field.type === 'textarea') {
          input = document.createElement('textarea');
          input.className = 'form-control';
          input.id = `field-${field.name}`;
          input.name = field.name;
          input.value = field.value || '';
          input.rows = Number(field.rows || 4);
          if (field.required) input.required = true;
          if (field.placeholder) input.placeholder = field.placeholder;
        } else {
          input = document.createElement('input');
          input.type = field.type || 'text';
          input.className = 'form-control';
          input.id = `field-${field.name}`;
          input.name = field.name;
          input.value = field.value || '';

          if (field.required) input.required = true;
          if (field.placeholder) input.placeholder = field.placeholder;
          if (field.min) input.min = field.min;
          if (field.max) input.max = field.max;
        }

        col.appendChild(label);
        col.appendChild(input);
        fieldsEl.appendChild(col);
      });

      // Set submit button text
      submitBtn.textContent = submitText;

      // Resolve only after the modal is fully hidden.
      // This avoids race conditions when showing multiple modals back-to-back.
      let resolved = false;
      let submittedValues = null;

      const handleSubmit = (e) => {
        e.preventDefault();

        if (resolved) return;

        const values = {};

        fields.forEach((field) => {
          const input = formEl.querySelector(`[name="${field.name}"]`);
          if (input) {
            values[field.name] = input.value;
          }
        });

        if (onSubmit) {
          onSubmit(values);
        }

        submittedValues = values;
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) {
          modalInstance.hide();
        }
      };

      const handleModalHidden = () => {
        formEl.removeEventListener('submit', handleSubmit);
        if (document.activeElement instanceof HTMLElement && modalEl.contains(document.activeElement)) {
          document.activeElement.blur();
        }
        if (resolved) return;
        resolved = true;
        resolve(submittedValues);
        modalEl.removeEventListener('hidden.bs.modal', handleModalHidden);
      };

      formEl.addEventListener('submit', handleSubmit);
      modalEl.addEventListener('hidden.bs.modal', handleModalHidden, { once: true });

      // Show modal
      const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
      modal.show();
    });
  }

  const loginPage = document.getElementById('login-page');
  const appShell = document.getElementById('app-shell');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const loginLoading = document.getElementById('login-loading');
  const togglePasswordBtn = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('password');

  const themeToggleBtn = document.getElementById('theme-toggle');
  const notificationBtn = document.getElementById('notification-btn');
  const notificationCountEl = document.getElementById('notification-count');
  const sidebar = document.getElementById('sidebar');
  const appHeader = document.getElementById('app-header');
  const mainContent = document.getElementById('main-content');
  const breadcrumbCurrent = document.getElementById('breadcrumb-current');
  const pageSections = document.querySelectorAll('.page-section');
  const navLinks = sidebar ? sidebar.querySelectorAll('.nav-link[data-nav]') : [];
  const currentDatetimeEl = document.getElementById('current-datetime');
  const sidebarBackdrop = document.getElementById('sidebar-backdrop');
  const toastEl = document.getElementById('app-toast');
  const toastMessageEl = document.getElementById('toast-message');
  const appToast = toastEl ? new bootstrap.Toast(toastEl, { delay: 2500 }) : null;
  const installPromptEl = document.getElementById('app-install-prompt');
  const installNowBtn = document.getElementById('app-install-now-btn');
  const installLaterBtn = document.getElementById('app-install-later-btn');
  const installCloseBtn = document.getElementById('app-install-close-btn');
  const installSubtextEl = document.getElementById('app-install-subtext');
  const installIosHelpEl = document.getElementById('app-install-ios-help');

  let currentUser = null;
  let currentRole = null;
  let currentPage = 'dashboard';
  let activeAttendanceSessionId = null;
  let activeAttendanceOtpCode = '';
  let facultyActiveSessionId = null;
  const DEFAULT_AVATAR = 'assets/img/avatar-placeholder.svg';
  const DEFAULT_COLLEGE_LOGO = 'assets/img/logo-placeholder.svg';
  const FACE_MODEL_URL = 'assets/models';
  let faceModelsReady = false;
  let faceSsdReady = false;
  const OTP_SUCCESS_DISPLAY_MS = 600;
  let superAdminColleges = [];
  let superAdminUsers = [];
  let superAdminCollegesActiveList = null;
  let superAdminCollegesAllList = null;
  let superAdminDepartments = [];
  let superAdminStudents = [];
  let superAdminFaculty = [];
  let selectedCollegeIdForSuperAdmin = 0;
  let collegeAdminStudentsCache = [];
  let collegeAdminFacultyCache = [];
  let collegeNoticesCache = [];
  let superAdminRoleFilter = 'all';
  let showArchivedColleges = false;
  let maintenanceMessage = '';
  let maintenancePollId = null;
  let studentFaceRegistered = null;
  let studentFaceProfile = null;
  let pendingCredentialsCopyText = '';
  let deferredInstallPrompt = null;
  const INSTALL_PROMPT_DISMISS_KEY = 'ams_install_prompt_dismissed_at_v1';
  const INSTALL_PROMPT_COOLDOWN_MS = 72 * 60 * 60 * 1000;
  const APP_NAME = 'Attendance Management System';
  const LOGIN_ROUTE_KEY = 'login';
  const ROUTE_ALIAS_MAP = {
    'attendance-marking': 'mark-attendance'
  };
  const ROUTE_SECTION_MAP = {
    'profile': 'profile-page',
    'notices': 'notices-page',
    'face-registration': 'face-registration',
    'mark-attendance': 'attendance-marking',
    'attendance-history': 'attendance-history-page',
    'student-attendance-history': 'attendance-history-page',
    'timetable': 'timetable-page',
    'colleges-mgmt': 'colleges-mgmt-page',
    'sa-departments': 'sa-departments-page',
    'sa-students': 'sa-students-page',
    'sa-faculty': 'sa-faculty-page',
    'users-overview': 'users-overview-page',
    'platform-analytics': 'platform-analytics-page',
    'subscription': 'subscription-page',
    'audit-logs': 'audit-logs-page',
    'settings': 'settings-page',
    'students-mgmt': 'students-mgmt-page',
    'faculty-mgmt': 'faculty-mgmt-page',
    'departments-courses': 'departments-courses-page',
    'timetable-mgmt': 'timetable-mgmt-page',
    'college-archive': 'college-archive-page',
    'attendance-reports': 'attendance-reports-page',
    'college-settings': 'college-settings-page',
    'my-classes': 'my-classes-page',
    'dept-students': 'dept-students-page',
    'start-attendance': 'start-attendance-page',
    'generate-otp': 'generate-otp-page'
  };
  const ROUTE_TITLE_MAP = {
    'dashboard': 'Dashboard',
    'unauthorized': 'Unauthorized',
    'profile': 'Profile',
    'notices': 'Notices',
    'face-registration': 'Face Registration',
    'mark-attendance': 'Mark Attendance',
    'attendance-history': 'Attendance History',
    'student-attendance-history': 'My Attendance History',
    'timetable': 'Timetable',
    'colleges-mgmt': 'College List',
    'sa-departments': 'Department Data',
    'sa-students': 'Student Records',
    'sa-faculty': 'Faculty Records',
    'users-overview': 'Users Overview',
    'platform-analytics': 'Platform Analytics',
    'subscription': 'Subscription / Licensing',
    'audit-logs': 'Audit Logs',
    'settings': 'Settings',
    'students-mgmt': 'Students Management',
    'faculty-mgmt': 'Faculty Management',
    'departments-courses': 'Departments & Courses',
    'timetable-mgmt': 'Timetable Management',
    'college-archive': 'Archive',
    'attendance-reports': 'Attendance Reports',
    'college-settings': 'College Settings',
    'my-classes': 'My Classes',
    'dept-students': 'Department Students',
    'start-attendance': 'Start Attendance Session',
    'generate-otp': 'Generate OTP'
  };
  let pendingRouteAfterLogin = null;
  let routeSyncFrame = null;

  function formatRole(rawRole) {
    return String(rawRole || '').replace(/-/g, '_');
  }

  function createUserContext(user) {
    const role = formatRole(user.role);
    return {
      id: user.unique_id || '',
      name: user.name || user.unique_id || 'User',
      email: user.email || '',
      last_login: user.last_login || '',
      role,
      college: user.college_name || 'N/A',
      college_logo_url: user.college_logo_url || '',
      profile_photo_url: user.profile_photo_url || ''
    };
  }

  function normalizeRouteKey(rawKey) {
    const key = String(rawKey || '').trim().toLowerCase();
    return ROUTE_ALIAS_MAP[key] || key;
  }

  function getResolvedNavKey(rawKey, role = currentRole) {
    const normalized = normalizeRouteKey(rawKey);
    return resolveRouteForRole(normalized, role) || normalized;
  }

  function getRouteHash(rawKey, role = currentRole) {
    const key = getResolvedNavKey(rawKey, role);
    if (!key || key === LOGIN_ROUTE_KEY) {
      return '#/login';
    }
    return `#/${key}`;
  }

  function readRouteFromLocation() {
    const rawHash = String(window.location.hash || '').trim();
    const cleaned = rawHash.replace(/^#\/?/, '').replace(/^\/+/, '').split(/[?#]/)[0];
    if (!cleaned) return null;
    return normalizeRouteKey(cleaned);
  }

  function syncUrlForRoute(pageKey, { replaceHistory = false } = {}) {
    const nextHash = getRouteHash(pageKey);
    if (window.location.hash === nextHash) return;
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    window.history[replaceHistory ? 'replaceState' : 'pushState'](
      { pageKey: normalizeRouteKey(pageKey) },
      '',
      nextUrl
    );
  }

  function getDefaultRouteForRole(role = currentRole) {
    if (role === 'student') {
      return studentFaceRegistered === true ? 'mark-attendance' : 'face-registration';
    }
    return 'dashboard';
  }

  function resolveRouteForRole(rawPageKey, role = currentRole) {
    const pageKey = normalizeRouteKey(rawPageKey);
    if (!pageKey || pageKey === LOGIN_ROUTE_KEY) return null;
    if (pageKey === 'dashboard') return 'dashboard';
    if (role === 'college_admin' && pageKey === 'timetable') {
      return 'timetable-mgmt';
    }

    const sectionId = ROUTE_SECTION_MAP[pageKey];
    if (!sectionId) return null;

    const section = document.getElementById(sectionId);
    if (!section) return null;

    const rolesAttr = section.getAttribute('data-roles') || '';
    if (!rolesAttr) return pageKey;

    const roles = rolesAttr.split(',');
    return roles.includes(role) ? pageKey : null;
  }

  function setDocumentTitle(pageKey) {
    const normalized = normalizeRouteKey(pageKey);
    const title = normalized === LOGIN_ROUTE_KEY ? 'Login' : sectionTitleFromKey(normalized);
    document.title = title && title !== 'Page' ? `${title} | ${APP_NAME}` : APP_NAME;
  }

  function hydrateSpaNavLinks(role = currentRole) {
    document.querySelectorAll('a[data-nav]').forEach((link) => {
      const target = link.getAttribute('data-nav');
      if (!target) return;
      link.setAttribute('href', getRouteHash(target, role));
    });
  }

  function scheduleRouteSyncFromLocation() {
    if (routeSyncFrame !== null) {
      window.cancelAnimationFrame(routeSyncFrame);
    }

    routeSyncFrame = window.requestAnimationFrame(() => {
      routeSyncFrame = null;
      const requestedRoute = readRouteFromLocation();

      if (!currentUser || !currentRole) {
        pendingRouteAfterLogin = requestedRoute && requestedRoute !== LOGIN_ROUTE_KEY ? requestedRoute : pendingRouteAfterLogin;
        setDocumentTitle(LOGIN_ROUTE_KEY);
        return;
      }

      if (!requestedRoute || requestedRoute === LOGIN_ROUTE_KEY) {
        routeAfterAuth(null, { replaceHistory: true })
          .catch(() => navigateTo(getDefaultRouteForRole(), { syncHistory: true, replaceHistory: true }));
        return;
      }

      const resolvedRoute = resolveRouteForRole(requestedRoute, currentRole);
      if (!resolvedRoute) {
        showToast('This page is not available for your role', 'warning');
        navigateTo(getDefaultRouteForRole(), { syncHistory: true, replaceHistory: true });
        return;
      }

      if (resolvedRoute === currentPage) {
        setDocumentTitle(resolvedRoute);
        return;
      }

      navigateTo(resolvedRoute, { syncHistory: false });
    });
  }

  function handleAuthRequired() {
    pendingRouteAfterLogin = currentPage || readRouteFromLocation();
    currentUser = null;
    currentRole = null;
    studentFaceRegistered = null;
    studentFaceProfile = null;
    activeAttendanceSessionId = null;
    activeAttendanceOtpCode = '';
    facultyActiveSessionId = null;
    if (maintenancePollId) {
      clearInterval(maintenancePollId);
      maintenancePollId = null;
    }
    document.body.classList.remove('sidebar-open-mobile');
    appShell.classList.add('d-none');
    loginPage.classList.remove('d-none');
    syncUrlForRoute(LOGIN_ROUTE_KEY, { replaceHistory: true });
    setDocumentTitle(LOGIN_ROUTE_KEY);
    const sessionModalEl = document.getElementById('sessionExpiredModal');
    if (sessionModalEl) {
      bootstrap.Modal.getOrCreateInstance(sessionModalEl).show();
    } else {
      showToast('Session expired. Please login again.', 'warning');
    }
  }

  async function apiRequest(action, method = 'GET', payload = null) {
    const options = {
      method,
      credentials: 'include'
    };
    if (payload !== null) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(payload);
    }

    const actionText = String(action || '');
    const queryStart = actionText.indexOf('&');
    const rawAction = queryStart === -1 ? actionText : actionText.slice(0, queryStart);
    const rawQuery = queryStart === -1 ? '' : actionText.slice(queryStart + 1);
    const params = new URLSearchParams();
    params.set('action', rawAction);
    if (rawQuery) {
      const extra = new URLSearchParams(rawQuery);
      for (const [k, v] of extra.entries()) {
        params.append(k, v);
      }
    }

    const res = await fetch(`backend/public/api.php?${params.toString()}`, options);
    const raw = await res.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (_) {
      data = {};
    }
    const sessionErrorMessages = new Set([
      'Authentication required',
      'Your college is inactive or removed. Contact the platform administrator.',
      'Your college account is no longer available. Contact the platform administrator.',
      'Unable to validate college access. Please login again.'
    ]);
    if (res.status === 401 || sessionErrorMessages.has(String(data.error || ''))) {
      handleAuthRequired();
    }
    if (!res.ok || data.success === false) {
      const fallback = raw && raw.trim() ? raw.slice(0, 180) : '';
      const err = new Error(data.error || fallback || `Request failed (HTTP ${res.status})`);
      err.status = res.status;
      err.details = data;
      throw err;
    }
    return data;
  }

  // Make apiRequest globally accessible for modules
  window.apiRequest = apiRequest;

  async function resolveStudentFaceRegistrationStatus() {
    if (currentRole !== 'student') return;
    try {
      const profile = await apiRequest('face_profile');
      studentFaceProfile = profile || null;
      studentFaceRegistered = !!profile.face_registered;
    } catch (_) {
      if (studentFaceRegistered === null) {
        studentFaceRegistered = false;
      }
      if (studentFaceProfile === null) {
        studentFaceProfile = {
          face_registered: false,
          monthly_update_limit: 2,
          updates_used_this_month: 0,
          updates_remaining_this_month: 2,
          can_update_face: true
        };
      }
    }
    updateFaceUpdateLimitUi();
    filterSidebarByRole();
    applySidebarOrderByRole();
  }

  async function routeAfterAuth(preferredRoute = null, options = {}) {
    const { replaceHistory = true } = options;

    if (currentRole === 'student') {
      await resolveStudentFaceRegistrationStatus();
    }

    const requestedRoute = preferredRoute || pendingRouteAfterLogin || readRouteFromLocation();
    pendingRouteAfterLogin = null;

    const resolvedRoute = resolveRouteForRole(requestedRoute, currentRole);
    const fallbackRoute = getDefaultRouteForRole(currentRole);

    navigateTo(resolvedRoute || fallbackRoute, { syncHistory: true, replaceHistory });
  }

  function applyAuthenticatedState(user, toastMessage = null, options = {}) {
    const { preferredRoute = null, replaceHistory = true } = options;
    if (!user) {
      console.error('applyAuthenticatedState called with null/undefined user', user);
      throw new Error('User object is required for authentication');
    }
    currentUser = createUserContext(user);
    currentRole = currentUser.role;
    studentFaceRegistered = (currentRole === 'student') ? null : studentFaceRegistered;
    studentFaceProfile = (currentRole === 'student') ? null : studentFaceProfile;
    setupUserContext();

    refreshMaintenanceNotice().catch(() => null);
    if (maintenancePollId) {
      clearInterval(maintenancePollId);
    }
    maintenancePollId = setInterval(() => {
      if (!currentUser) return;
      refreshMaintenanceNotice().catch(() => null);
    }, 60000);
    loginPage.classList.add('d-none');
    appShell.classList.remove('d-none');
    scheduleAppHeaderOffsetSync();
    routeAfterAuth(preferredRoute, { replaceHistory })
      .catch(() => navigateTo(getDefaultRouteForRole(currentRole), { syncHistory: true, replaceHistory: true }));
    if (toastMessage) {
      // Show premium college welcome popup instead of plain toast
      const cName = currentUser.college && currentUser.college !== 'N/A' ? currentUser.college : '';
      const uName = currentUser.name || '';
      if (cName) {
        showCollegeWelcomePopup(cName, uName);
      } else {
        showToast(toastMessage, 'success');
      }
    }
  }

  const otpClassSelect = document.getElementById('otp-class-select');
  const generateOtpBtn = document.getElementById('generate-otp-btn');
  const generateOtpExtraBtn = document.getElementById('generate-otp-extra-btn');
  const liveSessionHintEl = document.getElementById('live-session-hint');
  const generatedOtpWrapper = document.getElementById('generated-otp-wrapper');
  const generatedOtp = document.getElementById('generated-otp');
  const startSessionClassSelect = document.getElementById('start-session-class-select');
  const startSessionBtn = document.getElementById('start-session-btn');
  const startSessionExtraBtn = document.getElementById('start-session-extra-btn');
  const generatePageClassSelect = document.getElementById('generate-page-class-select');
  const generatePageOtpBtn = document.getElementById('generate-page-otp-btn');
  const generatePageOtpExtraBtn = document.getElementById('generate-page-otp-extra-btn');
  const generatePageOtpWrapper = document.getElementById('generate-page-otp-wrapper');
  const generatePageOtp = document.getElementById('generate-page-otp');
  const todayClassesList = document.getElementById('today-classes');
  const facultyClassesTable = document.getElementById('faculty-classes-table');
  const facultyNameEl = document.getElementById('faculty-name');
  const facultyDeptEl = document.getElementById('faculty-dept');
  const facultyNextSubjectEl = document.getElementById('faculty-next-subject');
  const facultyNextSlotEl = document.getElementById('faculty-next-slot');
  const facultyNextTimeEl = document.getElementById('faculty-next-time');
  const activeSubjectEl = document.getElementById('active-subject');
  const activeSlotEl = document.getElementById('active-slot');
  const activeOtpEl = document.getElementById('active-otp');
  const presentCountEl = document.getElementById('present-count');
  const absentCountEl = document.getElementById('absent-count');
  const recentSessionsBody = document.getElementById('recent-sessions');
  const facultyStudentsDeptLabelEl = document.getElementById('faculty-students-dept-label');
  const facultyStudentsSearchEl = document.getElementById('faculty-students-search');
  const facultyStudentsYearEl = document.getElementById('faculty-students-year');
  const facultyStudentsSemesterEl = document.getElementById('faculty-students-semester');
  const facultyStudentsSectionEl = document.getElementById('faculty-students-section');
  const facultyStudentsRefreshBtn = document.getElementById('faculty-students-refresh-btn');
  const facultyStudentsTableBodyEl = document.getElementById('faculty-students-table-body');
  const studentProfileModalEl = document.getElementById('studentProfileModal');
  const studentProfilePhotoEl = document.getElementById('student-profile-photo');
  const studentProfileNameEl = document.getElementById('student-profile-name');
  const studentProfileUniqueIdEl = document.getElementById('student-profile-unique-id');
  const studentProfileEmailEl = document.getElementById('student-profile-email');
  const studentProfileStatusEl = document.getElementById('student-profile-status');
  const studentProfileDeptEl = document.getElementById('student-profile-dept');
  const studentProfileCourseEl = document.getElementById('student-profile-course');
  const studentProfileYearEl = document.getElementById('student-profile-year');
  const studentProfileSemesterEl = document.getElementById('student-profile-semester');
  const studentProfileSectionEl = document.getElementById('student-profile-section');
  const studentProfileFaceEl = document.getElementById('student-profile-face');
  const facultyActiveSessionBox = document.getElementById('faculty-active-session');
  const noFacultyActiveSessionBox = document.getElementById('no-faculty-active-session');
  const studentNameEl = document.getElementById('student-name');
  const studentIdEl = document.getElementById('student-id');
  const studentMetaEl = document.getElementById('student-meta');
  const attendancePercentEl = document.getElementById('attendance-percent');
  const attendanceStatusBadgeEl = document.getElementById('attendance-status-badge');
  const attendanceProgressBarEl = document.getElementById('attendance-progress-bar');
  const activeClassBox = document.getElementById('active-class');
  const noActiveClassBox = document.getElementById('no-active-class');
  const upcomingClassesList = document.getElementById('upcoming-classes');
  const recentAttendanceBody = document.getElementById('recent-attendance');
  const totalStudentsEl = document.getElementById('total-students');
  const totalFacultyEl = document.getElementById('total-faculty');
  const departmentsCountEl = document.getElementById('departments-count');
  const avgAttendanceEl = document.getElementById('avg-attendance');
  const dailyAttendanceEl = document.getElementById('daily-attendance');
  const lowAttendanceCountEl = document.getElementById('low-attendance-count');
  const collegeRecentActivityEl = document.getElementById('college-recent-activity');
  const lowAttendanceStudentsEl = document.getElementById('low-attendance-students');
  const totalCollegesEl = document.getElementById('total-colleges');
  const activeUsersEl = document.getElementById('active-users');
  const platformSessionsEl = document.getElementById('platform-sessions');
  const uptimeEl = document.getElementById('uptime');
  const mrrEl = document.getElementById('mrr');
  const activeSubscriptionsEl = document.getElementById('active-subscriptions');
  const systemActivitiesEl = document.getElementById('system-activities');
  const collegeAttendanceChartEl = document.getElementById('collegeAdminAttendanceChart');
  const collegeMonthlyReportChartEl = document.getElementById('collegeAdminMonthlyReportChart');
  const superAdminUsageChartEl = document.getElementById('superAdminUsageChart');
  const superAdminRevenueChartEl = document.getElementById('superAdminRevenueChart');

  // Global chart instances to destroy before re-rendering
  const chartInstances = {
    collegeAttendance: null,
    collegeMonthlyReport: null,
    superAdminUsage: null,
    superAdminRevenue: null
  };
  const collegeLogoEl = document.getElementById('college-logo');
  const headerAvatarEl = document.getElementById('header-avatar');
  const profileAvatarEl = document.getElementById('profile-avatar');
  const profilePhotoBtn = document.getElementById('profile-photo-btn');
  const profilePhotoInput = document.getElementById('profile-photo-input');
  const attendanceFilterForm = document.getElementById('attendance-filter-form');
  const filterRangeEl = document.getElementById('filter-range');
  const filterFromEl = document.getElementById('filter-from');
  const filterToEl = document.getElementById('filter-to');
  const adminAttendanceFilterForm = document.getElementById('admin-attendance-filter-form');
  const adminFilterRangeEl = document.getElementById('admin-filter-range');
  const adminFilterFromEl = document.getElementById('admin-filter-from');
  const adminFilterToEl = document.getElementById('admin-filter-to');
  const adminFilterDeptEl = document.getElementById('admin-filter-dept');
  const adminFilterYearEl = document.getElementById('admin-filter-year');
  const adminFilterSemesterEl = document.getElementById('admin-filter-semester');
  const adminFilterSectionEl = document.getElementById('admin-filter-section');
  const adminExportPdfBtn = document.getElementById('admin-export-pdf-btn');
  const adminExportCsvBtn = document.getElementById('admin-export-csv-btn');
  const exportAttendanceBtn = document.getElementById('export-attendance-btn');
  const adminReportsBody = document.getElementById('attendance-reports-table');
  const noAdminReports = document.getElementById('no-admin-reports');
  const adminPresentCountEl = document.getElementById('admin-present-count');
  const adminAbsentCountEl = document.getElementById('admin-absent-count');
  const adminTotalCountEl = document.getElementById('admin-total-count');
  const usersOverviewTable = document.getElementById('users-overview-table');
  const saUsersSearchEl = document.getElementById('sa-users-search');
  const saUsersCollegeFilterEl = document.getElementById('sa-users-college-filter');
  const saUsersSortByEl = document.getElementById('sa-users-sort-by');
  const saUsersStudentsCountEl = document.getElementById('sa-users-students-count');
  const saUsersFacultyCountEl = document.getElementById('sa-users-faculty-count');
  const saUsersCollegeAdminsCountEl = document.getElementById('sa-users-college-admins-count');
  const saUsersSuperAdminsCountEl = document.getElementById('sa-users-super-admins-count');
  const studentsMgmtTable = document.getElementById('students-mgmt-table');
  const facultyMgmtTable = document.getElementById('faculty-mgmt-table');
  const collegesTableBody = document.getElementById('colleges-table-body');
  const saCollegeDetailEmptyEl = document.getElementById('sa-college-detail-empty');
  const saCollegeDetailWrapEl = document.getElementById('sa-college-detail-wrap');
  const saCollegeTotalUsersEl = document.getElementById('sa-college-total-users');
  const saCollegeStudentsEl = document.getElementById('sa-college-students');
  const saCollegeFacultyEl = document.getElementById('sa-college-faculty');
  const saCollegeAdminsEl = document.getElementById('sa-college-admins');
  const saCollegeDepartmentsEl = document.getElementById('sa-college-departments');
  const saCollegeCoursesEl = document.getElementById('sa-college-courses');
  const saCollegeUsersBodyEl = document.getElementById('sa-college-users-body');
  const saCollegeForm = document.getElementById('sa-college-form');
  const saCollegeModalEl = document.getElementById('saCollegeModal');
  const saCollegeModalTitleEl = document.getElementById('saCollegeModalTitle');
  const saCollegeIdEl = document.getElementById('sa-college-id');
  const saCollegeNameEl = document.getElementById('sa-college-name');
  const saCollegeShortCodeEl = document.getElementById('sa-college-short-code');
  const saCollegeStatusEl = document.getElementById('sa-college-status');
  const saCollegeEmailEl = document.getElementById('sa-college-email');
  const saCollegePhoneEl = document.getElementById('sa-college-phone');
  const saCollegeAdminFieldsEl = document.getElementById('sa-college-admin-fields');
  const saCollegeAdminIdEl = document.getElementById('sa-college-admin-id');
  const saCollegeAdminPasswordEl = document.getElementById('sa-college-admin-password');
  const saCollegeAdminNameEl = document.getElementById('sa-college-admin-name');
  const saCollegeAdminEmailEl = document.getElementById('sa-college-admin-email');
  const saCollegeLogoInputEl = document.getElementById('sa-college-logo-input');
  const saCollegeLogoPreviewEl = document.getElementById('sa-college-logo-preview');
  const saCollegeSubmitBtnEl = document.getElementById('sa-college-submit-btn');
  const auditFilterFromEl = document.getElementById('audit-filter-from');
  const auditFilterToEl = document.getElementById('audit-filter-to');
  const auditFilterActionEl = document.getElementById('audit-filter-action');
  const auditFilterRoleEl = document.getElementById('audit-filter-role');
  const auditFilterApplyEl = document.getElementById('audit-filter-apply');
  const auditLogsBodyEl = document.getElementById('audit-logs-body');
  const addCollegeBtn = document.getElementById('add-college-btn');
  const toggleCollegeArchiveBtn = document.getElementById('toggle-college-archive-btn');
  const createCollegeAdminBtn = document.getElementById('create-college-admin-btn');
  const saDeptCollegeFilterEl = document.getElementById('sa-dept-college-filter');
  const saDeptSearchEl = document.getElementById('sa-dept-search');
  const saDeptIncludeRemovedEl = document.getElementById('sa-dept-include-removed');
  const saDeptRefreshBtn = document.getElementById('sa-dept-refresh-btn');
  const saDepartmentsTableBodyEl = document.getElementById('sa-departments-table-body');
  const saStudentsCollegeFilterEl = document.getElementById('sa-students-college-filter');
  const saStudentsSearchEl = document.getElementById('sa-students-search');
  const saStudentsIncludeArchivedEl = document.getElementById('sa-students-include-archived');
  const saStudentsIncludeRemovedEl = document.getElementById('sa-students-include-removed');
  const saStudentsRefreshBtn = document.getElementById('sa-students-refresh-btn');
  const saStudentsTableBodyEl = document.getElementById('sa-students-table-body');
  const saFacultyCollegeFilterEl = document.getElementById('sa-faculty-college-filter');
  const saFacultySearchEl = document.getElementById('sa-faculty-search');
  const saFacultyIncludeArchivedEl = document.getElementById('sa-faculty-include-archived');
  const saFacultyIncludeRemovedEl = document.getElementById('sa-faculty-include-removed');
  const saFacultyRefreshBtn = document.getElementById('sa-faculty-refresh-btn');
  const saFacultyTableBodyEl = document.getElementById('sa-faculty-table-body');
  const credentialsModalEl = document.getElementById('credentialsModal');
  const credentialsModalTitleEl = document.getElementById('credentialsModalTitle');
  const credUserIdEl = document.getElementById('cred-userid');
  const credPasswordEl = document.getElementById('cred-password');
  const credCopyBtn = document.getElementById('cred-copy-btn');
  const addStudentBtn = document.getElementById('add-student-btn');
  const downloadStudentSampleBtn = document.getElementById('download-student-sample-btn');
  const uploadStudentCsvBtn = document.getElementById('upload-student-csv-btn');
  const studentCsvUploadInput = document.getElementById('student-csv-upload-input');
  const addFacultyBtn = document.getElementById('add-faculty-btn');
  const quickAddStudentBtn = document.getElementById('quick-add-student-btn');
  const quickUploadTimetableBtn = document.getElementById('quick-upload-timetable-btn');
  const platformSettingsForm = document.getElementById('platform-settings-form');
  const collegeSettingsForm = document.getElementById('college-settings-form');
  const collegeSettingsLatEl = document.getElementById('college-settings-lat');
  const collegeSettingsLngEl = document.getElementById('college-settings-lng');
  const collegeSettingsRadiusEl = document.getElementById('college-settings-radius');
  const collegeSettingsUseLocationBtn = document.getElementById('college-settings-use-location-btn');
  const noticesAdminFiltersEl = document.getElementById('notices-admin-filters');
  const noticesIncludeArchivedEl = document.getElementById('notices-include-archived');
  const noticesIncludeExpiredEl = document.getElementById('notices-include-expired');
  const createNoticeBtn = document.getElementById('create-notice-btn');
  const refreshNoticesBtn = document.getElementById('refresh-notices-btn');
  const noticesTableBodyEl = document.getElementById('notices-table-body');
  const timetableMgmtTable = document.getElementById('timetable-mgmt-table');
  const timetableMgmtEmptyState = document.querySelector('#timetable-mgmt-page [data-empty-state]');
  const archiveUsersTable = document.getElementById('archive-users-table');
  const archiveDeptsTable = document.getElementById('archive-depts-table');
  const downloadTimetableSampleBtn = document.getElementById('download-timetable-sample-btn');
  const uploadTimetableBtn = document.getElementById('upload-timetable-btn');
  const uploadTimetableInput = document.getElementById('timetable-upload-input');
  const addTimetableBtn = document.getElementById('add-timetable-btn');
  const timetableFilterDept = document.getElementById('tt-filter-dept');
  const timetableFilterYear = document.getElementById('tt-filter-year');
  const timetableFilterSemester = document.getElementById('tt-filter-semester');
  const timetableFilterSection = document.getElementById('tt-filter-section');
  const addDeptCourseBtn = document.getElementById('add-dept-course-btn');
  const departmentsList = document.getElementById('departments-list');
  const coursesList = document.getElementById('courses-list');
  const subjectsList = document.getElementById('subjects-list');
  const subjectsTitle = document.getElementById('subjects-title');
  const addSubjectBtn = document.getElementById('add-subject-btn');
  const timetableGrid = document.getElementById('timetable-grid');
  const timetableAccordion = document.getElementById('timetableAccordion');
  const timetableLegend = document.getElementById('timetable-legend');
  let facultyClassOptionsCache = [];
  let todaySlotsByCourseId = new Map();
  let liveFacultyCourseIds = new Set();
  let selectedDeptIdForCourses = 0;
  let selectedCourseIdForSubjects = 0;
  let selectedCourseLabelForSubjects = '';
  let adminCriteriaRowsCache = [];
  let facultyDeptStudentsCache = [];
  let facultyDeptInfoCache = null;

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(file);
    });
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to read image'));
      };
      img.src = objectUrl;
    });
  }

  async function imageFileToOptimizedDataUrl(file, {
    maxDimension = 512,
    outputType = 'image/webp',
    quality = 0.86
  } = {}) {
    if (!(file instanceof File)) {
      throw new Error('Image file is required');
    }
    const img = await loadImageFromFile(file);
    const width = Math.max(1, Number(img.naturalWidth || img.width || 0));
    const height = Math.max(1, Number(img.naturalHeight || img.height || 0));
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return fileToDataUrl(file);
    }
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    return canvas.toDataURL(outputType, quality);
  }

  function formatFacultyClassLabel(row) {
    const semText = row.semester ? ` Sem ${row.semester}` : '';
    const subjectText = row.default_subject ? ` • ${row.default_subject}` : '';
    const base = `${row.course_name} • Year ${row.year}${semText}${row.section ? `-${row.section}` : ''}${subjectText}`;
    const slots = todaySlotsByCourseId.get(String(row.id)) || [];
    if (!slots.length) return `${base} • Today: No slot`;
    const slotText = slots
      .map((slot) => `${slot.start_time}-${slot.end_time}${slot.isLiveNow ? ' (Live)' : ''}`)
      .join(', ');
    return `${base} • Today: ${slotText}`;
  }

  function buildSelectOptions(selectEl, classes) {
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">Select class</option>';
    classes.forEach((row) => {
      const option = document.createElement('option');
      option.value = String(row.id);
      option.textContent = formatFacultyClassLabel(row);
      option.dataset.subject = row.default_subject || row.course_name || '';
      selectEl.appendChild(option);
    });
  }

  function renderFacultyClassSelectOptions() {
    const selectedOtp = otpClassSelect ? String(otpClassSelect.value || '') : '';
    const selectedStart = startSessionClassSelect ? String(startSessionClassSelect.value || '') : '';
    const selectedGenerate = generatePageClassSelect ? String(generatePageClassSelect.value || '') : '';
    
    // Default options (from faculty_class_options)
    buildSelectOptions(otpClassSelect, facultyClassOptionsCache);
    buildSelectOptions(generatePageClassSelect, facultyClassOptionsCache);
    
    // For "Start Session", try to show today's slots if available
    if (startSessionClassSelect) {
        startSessionClassSelect.innerHTML = '<option value="">Select class slot</option>';
        facultyClassOptionsCache.forEach(c => {
            const slots = todaySlotsByCourseId ? todaySlotsByCourseId.get(String(c.id)) : null;
            if (slots && slots.length) {
                slots.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = c.id;
                    const timeRange = `${String(s.start_time).substring(0,5)}-${String(s.end_time).substring(0,5)}`;
                    opt.textContent = `${timeRange} • ${c.default_subject || c.course_name} (Year ${c.year}${c.semester ? ` Sem ${c.semester}` : ''}-${c.section})`;
                    startSessionClassSelect.appendChild(opt);
                });
            } else {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = `${c.default_subject || c.course_name} (Year ${c.year}${c.semester ? ` Sem ${c.semester}` : ''}-${c.section})`;
                startSessionClassSelect.appendChild(opt);
            }
        });
    }

    if (otpClassSelect && selectedOtp) otpClassSelect.value = selectedOtp;
    if (startSessionClassSelect && selectedStart) startSessionClassSelect.value = selectedStart;
    if (generatePageClassSelect && selectedGenerate) generatePageClassSelect.value = selectedGenerate;
    updateFacultyLiveControls();
  }

  function selectedCourseIsLive(selectEl) {
    if (!selectEl || !selectEl.value) return false;
    return liveFacultyCourseIds.has(String(selectEl.value));
  }

  function updateFacultyLiveControls() {
    const setLiveState = (btn, selectEl) => {
      if (!btn || !selectEl) return;
      btn.disabled = !selectEl.value || !selectedCourseIsLive(selectEl);
    };
    const setExtraState = (btn, selectEl) => {
      if (!btn || !selectEl) return;
      btn.disabled = !selectEl.value;
    };

    setLiveState(generateOtpBtn, otpClassSelect);
    setLiveState(startSessionBtn, startSessionClassSelect);
    setLiveState(generatePageOtpBtn, generatePageClassSelect);
    setExtraState(generateOtpExtraBtn, otpClassSelect);
    setExtraState(startSessionExtraBtn, startSessionClassSelect);
    setExtraState(generatePageOtpExtraBtn, generatePageClassSelect);

    if (!liveSessionHintEl) return;
    if (liveFacultyCourseIds.size > 0) {
      liveSessionHintEl.textContent = 'Live timetable slot active. You can click Live class from Today Classes or use Live Session button.';
    } else {
      liveSessionHintEl.textContent = 'No live timetable class right now. OTP can be generated only during scheduled class time.';
    }
  }

  let facultyOtpCountdownTimer = null;
  function startFacultyOtpCountdown(expiryTime) {
    if (facultyOtpCountdownTimer) clearInterval(facultyOtpCountdownTimer);
    const timerEl = document.getElementById('faculty-otp-timer');
    if (!timerEl) return;

    function update() {
      const now = new Date().getTime();
      const end = new Date(expiryTime).getTime();
      const diff = end - now;
      if (diff <= 0) {
        timerEl.textContent = '00:00';
        timerEl.classList.remove('bg-danger');
        timerEl.classList.add('bg-secondary');
        clearInterval(facultyOtpCountdownTimer);
        showToast('OTP expired. Please refresh session.', 'warning');
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      if (mins < 2) {
        timerEl.classList.add('animate-pulse');
      } else {
        timerEl.classList.remove('animate-pulse');
      }
    }
    update();
    facultyOtpCountdownTimer = setInterval(update, 1000);
  }

  function renderFacultyActiveSession(session) {
    if (!facultyActiveSessionBox || !noFacultyActiveSessionBox) return;
    if (!session) {
      facultyActiveSessionId = null;
      if (facultyOtpCountdownTimer) clearInterval(facultyOtpCountdownTimer);
      if (presentCountEl) presentCountEl.textContent = '0';
      if (absentCountEl) absentCountEl.textContent = '0';
      facultyActiveSessionBox.classList.add('d-none');
      noFacultyActiveSessionBox.classList.remove('d-none');
      return;
    }

    facultyActiveSessionId = Number(session.id);
    const isExtra = Number(session.is_extra_class || 0) === 1;
    activeSubjectEl.textContent = session.subject || '-';
    
    // Extra Reason display
    const extraReasonWrap = document.getElementById('active-extra-reason-wrap');
    const extraReasonEl = document.getElementById('active-extra-reason');
    if (extraReasonWrap && extraReasonEl) {
      if (isExtra && session.extra_reason) {
        extraReasonEl.textContent = session.extra_reason;
        extraReasonWrap.classList.remove('d-none');
      } else {
        extraReasonWrap.classList.add('d-none');
      }
    }

    const activeSem = session.semester ? ` Sem ${session.semester}` : '';
    const slotText = (session.slot_start_time && session.slot_end_time)
      ? ` • Slot ${session.slot_start_time}-${session.slot_end_time}`
      : '';
    const modeText = isExtra ? ' • Extra Class' : ' • Timetable Class';
    activeSlotEl.textContent = `${session.course_name || '-'} • Year ${session.year || '-'}${activeSem}${session.section ? `-${session.section}` : ''}${slotText}${modeText}`;
    activeOtpEl.textContent = session.otp_code || '------';
    
    if (session.otp_expiry) {
        startFacultyOtpCountdown(session.otp_expiry);
    }

    if (presentCountEl) presentCountEl.textContent = String(Number(session.present_count || 0));
    if (absentCountEl) absentCountEl.textContent = String(Number(session.absent_count || 0));
    facultyActiveSessionBox.classList.remove('d-none');
    noFacultyActiveSessionBox.classList.add('d-none');
  }

  async function collectExtraClassReason() {
    const values = await showFormModal({
      title: 'Extra Class Reason',
      description: 'Extra class session ke liye reason required hai.',
      submitText: 'Continue',
      fields: [
        {
          type: 'select',
          name: 'reason_type',
          label: 'Reason Type',
          required: true,
          options: [
            { value: '', label: 'Select reason' },
            { value: 'Faculty on leave cover', label: 'Faculty on leave cover' },
            { value: 'Revision', label: 'Revision' },
            { value: 'Syllabus backlog', label: 'Syllabus backlog' },
            { value: 'Lab replacement', label: 'Lab replacement' },
            { value: 'Other', label: 'Other' },
          ],
        },
        {
          type: 'text',
          name: 'reason_note',
          label: 'Details (optional)',
          required: false,
          placeholder: 'Example: BCS 3rd year VI sem Python cover class',
        },
      ],
    });

    if (!values) return null;
    const type = String(values.reason_type || '').trim();
    const note = String(values.reason_note || '').trim();
    if (!type) {
      throw new Error('Extra class reason is required');
    }
    let reason = '';
    if (type === 'Other') {
      reason = note;
    } else {
      reason = note ? `${type}: ${note}` : type;
    }
    reason = reason.trim();
    if (!reason) {
      throw new Error('Please add reason details for extra class');
    }
    return reason.slice(0, 255);
  }

  async function loadFacultyClassOptions() {
    const [data, timetableData] = await Promise.all([
      apiRequest('faculty_class_options'),
      apiRequest('faculty_timetable_weekly')
    ]);
    const classes = data.classes || [];
    const timetableRows = (timetableData.rows || []).filter(r => Number(r.is_mine) === 1);
    
    facultyClassOptionsCache = classes;
    renderFacultyClassSelectOptions();
    
    if (facultyNameEl) {
      facultyNameEl.textContent = currentUser?.name || '-';
    }
    if (facultyDeptEl) {
      facultyDeptEl.textContent = classes[0]?.dept_name ? `Department of ${classes[0].dept_name}` : 'Department not assigned';
    }

    if (facultyClassesTable) {
      facultyClassesTable.innerHTML = '';
      if (!timetableRows.length) {
        facultyClassesTable.innerHTML = '<tr><td colspan="5" class="text-muted">No scheduled classes found.</td></tr>';
      } else {
        const days = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        timetableRows.forEach((row) => {
          const tr = document.createElement('tr');
          const startTime = String(row.start_time).substring(0, 5);
          const endTime = String(row.end_time).substring(0, 5);
          tr.innerHTML = `
              <td class="fw-semibold">${days[row.day_of_week] || row.day_of_week}</td>
              <td>${startTime} - ${endTime}</td>
              <td>${row.subject || '-'}</td>
              <td>Year ${row.year || '-'} • Sem ${row.semester || '-'}${row.section ? `-${row.section}` : ''}</td>
              <td class="text-muted small">N/A</td>
            `;
          facultyClassesTable.appendChild(tr);
        });
      }
    }
  }

  async function loadFacultyTodayClasses() {
    if (!todayClassesList) return;
    try {
      const data = await apiRequest('faculty_classes_today');
      const classes = data.classes || [];
      const activeCourseIds = new Set();
      const slotsByCourse = new Map();
      const now = new Date();
      const nowMinutes = (now.getHours() * 60) + now.getMinutes();
      todayClassesList.innerHTML = '';
      if (!classes.length) {
        todaySlotsByCourseId = slotsByCourse;
        liveFacultyCourseIds = activeCourseIds;
        renderFacultyClassSelectOptions();
        updateFacultyLiveControls();
        todayClassesList.innerHTML = '<div class="text-muted small">No classes scheduled for today.</div>';
        updateFacultyNextClass([]);
        return;
      }

      classes.forEach((row) => {
        const start = timeStringToMinutes(row.start_time);
        const end = timeStringToMinutes(row.end_time);
        const buffer = 10;
        const isLiveNow = start !== null && end !== null && (nowMinutes >= (start - buffer)) && (nowMinutes <= (end + buffer));
        const cid = row.course_id || row.id;
        if (cid) {
            if (!slotsByCourse.has(String(cid))) slotsByCourse.set(String(cid), []);
            slotsByCourse.get(String(cid)).push(row);
        }
        if (isLiveNow && cid) {
          activeCourseIds.add(String(cid));
        }
        if (cid !== undefined && cid !== null) {
          const key = String(cid);
          const existing = slotsByCourse.get(key) || [];
          existing.push({
            start_time: row.start_time,
            end_time: row.end_time,
            isLiveNow,
            subject: row.subject || row.course_name || '',
          });
          slotsByCourse.set(key, existing);
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'list-group-item list-group-item-action d-flex justify-content-between';
        btn.dataset.action = 'start-live-from-today';
        btn.dataset.courseId = String(cid || '');
        btn.dataset.subject = String(row.subject || row.course_name || '');
        btn.dataset.isLive = isLiveNow ? '1' : '0';
        const liveBadge = isLiveNow ? ' <span class="badge bg-success-subtle text-success-emphasis ms-1">Live</span>' : '';
        const semText = row.semester ? ` Sem ${row.semester}` : '';
        btn.innerHTML = `<span>${row.subject || row.course_name}${liveBadge}<div class="small text-muted">Year ${row.year || '-'}${semText}${row.section ? `-${row.section}` : ''}</div></span><span class="text-muted">${row.start_time} - ${row.end_time}</span>`;
        todayClassesList.appendChild(btn);
      });
      todaySlotsByCourseId = slotsByCourse;
      liveFacultyCourseIds = activeCourseIds;
      renderFacultyClassSelectOptions();
      updateFacultyLiveControls();
      updateFacultyNextClass(classes);
    } catch (_) {
      todaySlotsByCourseId = new Map();
      liveFacultyCourseIds = new Set();
      renderFacultyClassSelectOptions();
      updateFacultyLiveControls();
      todayClassesList.innerHTML = '<div class="text-muted small">Could not load classes.</div>';
      updateFacultyNextClass([]);
    }
  }

  function timeStringToMinutes(timeText) {
    if (!timeText) return null;
    const parts = String(timeText).split(':');
    if (parts.length < 2) return null;
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return (h * 60) + m;
  }

  function updateFacultyNextClass(classes) {
    if (!facultyNextSubjectEl || !facultyNextSlotEl || !facultyNextTimeEl) return;
    if (!Array.isArray(classes) || !classes.length) {
      facultyNextSubjectEl.textContent = 'No upcoming class today';
      facultyNextSlotEl.textContent = '-';
      facultyNextTimeEl.textContent = '-';
      return;
    }

    const now = new Date();
    const nowMinutes = (now.getHours() * 60) + now.getMinutes();
    let ongoing = null;
    let upcoming = null;

    classes.forEach((row) => {
      const start = timeStringToMinutes(row.start_time);
      const end = timeStringToMinutes(row.end_time);
      if (start === null || end === null) return;
      if (start <= nowMinutes && nowMinutes <= end && !ongoing) {
        ongoing = row;
        return;
      }
      if (start > nowMinutes && !upcoming) {
        upcoming = row;
      }
    });

    const target = ongoing || upcoming;
    if (!target) {
      facultyNextSubjectEl.textContent = 'No upcoming class today';
      facultyNextSlotEl.textContent = 'Today schedule completed';
      facultyNextTimeEl.textContent = '-';
      return;
    }

    const status = ongoing ? 'Ongoing now' : 'Upcoming';
    facultyNextSubjectEl.textContent = `${target.subject || target.course_name || '-'} (${status})`;
    const nextSem = target.semester ? ` Sem ${target.semester}` : '';
    facultyNextSlotEl.textContent = `${target.course_name || '-'} • Year ${target.year || '-'}${nextSem}${target.section ? `-${target.section}` : ''}`;
    facultyNextTimeEl.textContent = `${target.start_time || '-'} - ${target.end_time || '-'}`;
  }

  async function loadFacultyActiveSession() {
    const data = await apiRequest('faculty_active_session');
    renderFacultyActiveSession(data.session || null);
  }

  function formatShortDate(value) {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value || '-';
    return dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
  }

  async function loadFacultyRecentSessions() {
    if (!recentSessionsBody) return;
    const data = await apiRequest('faculty_recent_sessions');
    const rows = data.sessions || [];
    recentSessionsBody.innerHTML = '';

    if (!rows.length) {
      recentSessionsBody.innerHTML = '<tr><td colspan="4" class="text-muted">No recent sessions.</td></tr>';
      return;
    }

    rows.forEach((row) => {
      const tr = document.createElement('tr');
      const reason = row.extra_reason ? `<div class="small text-muted">Extra: ${row.extra_reason}</div>` : '';
      tr.innerHTML = `
          <td>${formatShortDate(row.start_time)}</td>
          <td>${row.subject || row.course_name || '-'}${reason}</td>
          <td>${Number(row.present_count || 0)}</td>
          <td>${Number(row.absent_count || 0)}</td>
        `;
      recentSessionsBody.appendChild(tr);
    });
  }

  function renderFacultyDepartmentStudents() {
    if (!facultyStudentsTableBodyEl) return;
    const q = String(facultyStudentsSearchEl?.value || '').trim().toLowerCase();
    const yearFilter = String(facultyStudentsYearEl?.value || '');
    const semesterFilter = String(facultyStudentsSemesterEl?.value || '');
    const sectionFilter = String(facultyStudentsSectionEl?.value || '');

    const rows = (Array.isArray(facultyDeptStudentsCache) ? facultyDeptStudentsCache : []).filter((row) => {
      if (yearFilter && String(row.year || '') !== yearFilter) return false;
      if (semesterFilter && String(row.semester || '') !== semesterFilter) return false;
      if (sectionFilter && String(row.section || '') !== sectionFilter) return false;
      if (q) {
        const hay = `${row.name || ''} ${row.unique_user_id || ''} ${row.email || ''} ${row.course || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    facultyStudentsTableBodyEl.innerHTML = '';
    if (!rows.length) {
      facultyStudentsTableBodyEl.innerHTML = '<tr><td colspan="7" class="text-muted">No students found.</td></tr>';
      return;
    }

    rows.forEach((s) => {
      const tr = document.createElement('tr');

      const tdStudent = document.createElement('td');
      const nameDiv = document.createElement('div');
      nameDiv.className = 'fw-semibold';
      nameDiv.textContent = s.name || '-';
      const idDiv = document.createElement('div');
      idDiv.className = 'small text-muted';
      idDiv.textContent = s.unique_user_id || '-';
      tdStudent.appendChild(nameDiv);
      tdStudent.appendChild(idDiv);

      const tdEmail = document.createElement('td');
      tdEmail.textContent = s.email || '-';

      const tdCourse = document.createElement('td');
      tdCourse.textContent = s.course || '-';

      const tdYearSem = document.createElement('td');
      tdYearSem.textContent = `Y${s.year || '-'} / Sem ${s.semester || '-'}`;

      const tdSection = document.createElement('td');
      tdSection.textContent = s.section || '-';

      const tdFace = document.createElement('td');
      const faceBadge = document.createElement('span');
      const faceRegistered = Number(s.face_registered || 0) === 1;
      faceBadge.className = `badge ${faceRegistered ? 'bg-success-subtle text-success-emphasis' : 'bg-secondary-subtle text-secondary-emphasis'}`;
      faceBadge.textContent = faceRegistered ? 'Registered' : 'Not registered';
      tdFace.appendChild(faceBadge);

      const tdActions = document.createElement('td');
      tdActions.className = 'text-nowrap';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline-primary btn-sm';
      btn.textContent = 'Profile';
      btn.dataset.action = 'faculty-student-profile';
      btn.dataset.userId = String(s.user_id || '');
      tdActions.appendChild(btn);

      tr.appendChild(tdStudent);
      tr.appendChild(tdEmail);
      tr.appendChild(tdCourse);
      tr.appendChild(tdYearSem);
      tr.appendChild(tdSection);
      tr.appendChild(tdFace);
      tr.appendChild(tdActions);
      facultyStudentsTableBodyEl.appendChild(tr);
    });
  }

  async function loadFacultyDepartmentStudents() {
    if (!facultyStudentsTableBodyEl) return;
    facultyStudentsTableBodyEl.innerHTML = '<tr><td colspan="7" class="text-muted">Loading students...</td></tr>';
    const data = await apiRequest('faculty_department_students_list');
    facultyDeptStudentsCache = Array.isArray(data.students) ? data.students : [];
    facultyDeptInfoCache = data.department || null;

    if (facultyStudentsDeptLabelEl) {
      const deptName = facultyDeptInfoCache && facultyDeptInfoCache.name ? String(facultyDeptInfoCache.name) : '';
      facultyStudentsDeptLabelEl.textContent = deptName ? `Department: ${deptName}` : '';
    }

    setSelectFromValues(facultyStudentsYearEl, facultyDeptStudentsCache.map((r) => r.year), 'All Years');
    setSelectFromValues(facultyStudentsSemesterEl, facultyDeptStudentsCache.map((r) => r.semester), 'All Semesters');
    setSelectFromValues(facultyStudentsSectionEl, facultyDeptStudentsCache.map((r) => r.section), 'All Sections');
    renderFacultyDepartmentStudents();
  }

  async function showFacultyStudentProfile(studentUserId) {
    if (!studentProfileModalEl) return;
    const uid = Number(studentUserId || 0);
    if (!uid) throw new Error('Invalid student');
    const data = await apiRequest(`faculty_student_profile_get&user_id=${encodeURIComponent(String(uid))}`);
    const s = data.student || {};

    if (studentProfilePhotoEl) {
      studentProfilePhotoEl.src = s.profile_photo_url || 'assets/img/avatar-placeholder.svg';
    }
    if (studentProfileNameEl) studentProfileNameEl.textContent = s.name || '-';
    if (studentProfileUniqueIdEl) studentProfileUniqueIdEl.textContent = s.unique_user_id || '-';
    if (studentProfileEmailEl) studentProfileEmailEl.textContent = s.email || '-';
    if (studentProfileStatusEl) studentProfileStatusEl.textContent = s.status || '-';
    if (studentProfileDeptEl) studentProfileDeptEl.textContent = s.dept_name || '-';
    if (studentProfileCourseEl) studentProfileCourseEl.textContent = s.course || '-';
    if (studentProfileYearEl) studentProfileYearEl.textContent = String(s.year || '-');
    if (studentProfileSemesterEl) studentProfileSemesterEl.textContent = String(s.semester || '-');
    if (studentProfileSectionEl) studentProfileSectionEl.textContent = s.section || '-';
    if (studentProfileFaceEl) studentProfileFaceEl.textContent = Number(s.face_registered || 0) === 1 ? 'Yes' : 'No';

    bootstrap.Modal.getOrCreateInstance(studentProfileModalEl).show();
  }

  async function startFacultySessionByCourseId(courseId, subject, opts = {}) {
    const extraClass = !!opts.extraClass;
    const extraReason = String(opts.extraReason || '').trim();
    const cid = Number(courseId || 0);
    if (!cid) {
      throw new Error('Select a class first');
    }
    const data = await apiRequest('start_session_quick', 'POST', {
      course_id: cid,
      subject,
      extra_class: extraClass,
      extra_reason: extraClass ? extraReason : null,
    });

    const session = data.session || null;
    if (session) {
      renderFacultyActiveSession(session);
      if (generatedOtpWrapper && generatedOtp) {
        generatedOtpWrapper.classList.remove('d-none');
        generatedOtp.textContent = session.otp_code;
      }
      if (generatePageOtpWrapper && generatePageOtp) {
        generatePageOtpWrapper.classList.remove('d-none');
        generatePageOtp.textContent = session.otp_code;
      }
    }
    showToast('OTP generated and session started', 'success');
  }

  async function startFacultySessionFrom(selectEl, opts = {}) {
    const extraClass = !!opts.extraClass;
    const extraReason = String(opts.extraReason || '').trim();
    if (!selectEl || !selectEl.value) {
      showToast('Select a class first', 'warning');
      return;
    }
    if (!extraClass && !selectedCourseIsLive(selectEl)) {
      throw new Error('Selected class is not in a live slot. OTP can be generated only during scheduled class time.');
    }
    if (extraClass && !extraReason) {
      throw new Error('Extra class reason is required');
    }
    const subject = selectEl.options[selectEl.selectedIndex]?.dataset?.subject || '';
    await startFacultySessionByCourseId(selectEl.value, subject, { extraClass, extraReason });
  }

  async function bootstrapFacultyData() {
    try {
      await Promise.all([
        loadFacultyClassOptions(),
        loadFacultyTodayClasses(),
        loadFacultyActiveSession(),
        loadFacultyRecentSessions()
      ]);
    } catch (err) {
      showToast(err.message || 'Failed to load faculty data', 'danger');
    }
  }

  function formatDisplayDate(value) {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value || '-';
    return dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
  }

  function attendanceTone(percent) {
    if (percent >= 85) return { label: 'Excellent', badge: 'bg-success-subtle text-success-emphasis', bar: 'bg-success' };
    if (percent >= 75) return { label: 'Good', badge: 'bg-primary-subtle text-primary-emphasis', bar: 'bg-primary' };
    return { label: 'Low', badge: 'bg-warning text-dark', bar: 'bg-warning' };
  }

  function formatResetDateForFace(raw) {
    const value = String(raw || '').trim();
    if (!value) return 'next month';
    const normalized = value.replace(' ', 'T');
    const dt = new Date(normalized);
    if (Number.isNaN(dt.getTime())) {
      return value;
    }
    return dt.toLocaleDateString([], { day: '2-digit', month: 'short' });
  }

  function buildFaceUpdateInfoText(profile) {
    const limit = Math.max(1, Number(profile && profile.monthly_update_limit ? profile.monthly_update_limit : 2));
    if (!profile || !profile.face_registered) {
      return `First registration free. Face update limit: ${limit} times/month.`;
    }

    const used = Math.max(0, Number(profile.updates_used_this_month || 0));
    const remaining = Math.max(0, Number(profile.updates_remaining_this_month || 0));
    if (remaining > 0) {
      return `Face updates left this month: ${remaining}/${limit} (used: ${used}).`;
    }

    const resetText = formatResetDateForFace(profile.next_reset_at);
    return `Monthly face update limit reached (${used}/${limit}). Reset on ${resetText}.`;
  }

  function updateFaceUpdateLimitUi(profile = studentFaceProfile) {
    const infoText = buildFaceUpdateInfoText(profile);
    const cardInfoEl = document.getElementById('face-update-card-info');
    const pageInfoEl = document.getElementById('face-update-limit-info');
    if (cardInfoEl) cardInfoEl.textContent = infoText;
    if (pageInfoEl) pageInfoEl.textContent = infoText;
  }

  async function loadStudentDashboard() {
    const data = await apiRequest('student_dashboard_summary');
    const student = data.student || {};
    const attendance = data.attendance || {};
    const currentClass = data.current_class || null;
    const upcomingClasses = data.upcoming_classes || [];
    const recentAttendance = data.recent_attendance || [];

    if (studentNameEl) studentNameEl.textContent = student.name || currentUser?.name || '-';
    if (studentIdEl) studentIdEl.textContent = student.unique_user_id || currentUser?.id || '-';
    if (studentMetaEl) {
      const meta = `${student.dept_name || '-'} / ${student.course || '-'} / Year ${student.year || '-'} / Sem ${student.semester || '-'} / ${student.section || '-'}`;
      studentMetaEl.textContent = meta;
    }

    const percent = Number(attendance.percent || 0);
    const tone = attendanceTone(percent);
    if (attendancePercentEl) attendancePercentEl.textContent = `${Math.round(percent)}%`;
    if (attendanceStatusBadgeEl) {
      attendanceStatusBadgeEl.textContent = tone.label;
      attendanceStatusBadgeEl.className = `badge small ${tone.badge}`;
    }
    if (attendanceProgressBarEl) {
      attendanceProgressBarEl.style.width = `${Math.max(0, Math.min(100, percent))}%`;
      attendanceProgressBarEl.className = `progress-bar ${tone.bar}`;
    }

    const faceBadgeEl = document.getElementById('face-status-badge');
    const faceRegStatusEl = document.getElementById('face-registration-status');
    const isFaceRegistered = !!student.face_registered;
    if (faceBadgeEl) {
      faceBadgeEl.textContent = isFaceRegistered ? 'Registered' : 'Not Registered';
      faceBadgeEl.className = `badge ${isFaceRegistered ? 'bg-success-subtle text-success-emphasis' : 'bg-warning text-dark'}`;
    }
    if (faceRegStatusEl) {
      faceRegStatusEl.textContent = isFaceRegistered ? 'Registered' : 'Not Registered';
      faceRegStatusEl.className = `badge ${isFaceRegistered ? 'bg-success-subtle text-success-emphasis' : 'bg-warning text-dark'}`;
    }
    updateFaceUpdateLimitUi();

    if (activeClassBox && noActiveClassBox) {
      if (currentClass) {
        activeClassBox.classList.remove('d-none');
        noActiveClassBox.classList.add('d-none');
        activeClassBox.innerHTML = `
            <p class="mb-1 fw-semibold">${currentClass.subject || '-'}</p>
            <p class="small text-muted mb-2">${currentClass.start_time} - ${currentClass.end_time}</p>
            <span class="badge bg-success-subtle text-success-emphasis mb-3">Ongoing</span>
            <button class="btn btn-primary w-100 mb-2" data-nav="attendance-marking">Mark Attendance Now</button>
          `;
      } else {
        activeClassBox.classList.add('d-none');
        noActiveClassBox.classList.remove('d-none');
      }
    }

    if (upcomingClassesList) {
      upcomingClassesList.innerHTML = '';
      if (!upcomingClasses.length) {
        upcomingClassesList.innerHTML = '<li class="list-group-item px-0 text-muted">No upcoming classes today.</li>';
      } else {
        upcomingClasses.forEach((row) => {
          const li = document.createElement('li');
          li.className = 'list-group-item px-0 d-flex justify-content-between';
          li.innerHTML = `
              <div>
                <div class="fw-semibold">${row.subject || '-'}</div>
                <div class="text-muted">${row.start_time} - ${row.end_time}</div>
              </div>
              <span class="badge bg-primary-subtle text-primary-emphasis align-self-start">Today</span>
            `;
          upcomingClassesList.appendChild(li);
        });
      }
    }

    if (recentAttendanceBody) {
      recentAttendanceBody.innerHTML = '';
      if (!recentAttendance.length) {
        recentAttendanceBody.innerHTML = '<tr><td colspan="4" class="text-muted">No attendance records.</td></tr>';
      } else {
        recentAttendance.forEach((row) => {
          const tr = document.createElement('tr');
          const score = row.match_score === null ? '--' : `${Math.round(Number(row.match_score || 0))}%`;
          tr.innerHTML = `
              <td>${formatDisplayDate(row.timestamp)}</td>
              <td>${row.subject || '-'}</td>
              <td><span class="badge ${statusBadge(row.status)}">${row.status}</span></td>
              <td>${score}</td>
            `;
          recentAttendanceBody.appendChild(tr);
        });
      }
    }
  }

  async function loadCollegeAdminDashboard() {
    const data = await apiRequest('college_admin_dashboard_summary');
    const stats = data.stats || {};
    const charts = data.charts || {};
    const activity = data.recent_activity || [];
    const lowAttendanceStudents = data.low_attendance_students || [];

    if (totalStudentsEl) totalStudentsEl.textContent = String(Number(stats.total_students || 0));
    if (totalFacultyEl) totalFacultyEl.textContent = String(Number(stats.total_faculty || 0));
    if (departmentsCountEl) departmentsCountEl.textContent = String(Number(stats.departments_count || 0));
    if (avgAttendanceEl) avgAttendanceEl.textContent = `${Math.round(Number(stats.avg_attendance || 0))}%`;
    if (dailyAttendanceEl) dailyAttendanceEl.textContent = `${Math.round(Number(stats.daily_attendance_pct || 0))}%`;
    if (lowAttendanceCountEl) lowAttendanceCountEl.textContent = String(Number(stats.low_attendance_count || 0));

    // Render Daily Attendance Trend Chart
    if (collegeAttendanceChartEl && charts.daily_attendance_trend) {
      if (chartInstances.collegeAttendance) {
        chartInstances.collegeAttendance.destroy();
      }

      const labels = charts.daily_attendance_trend.map((t) => t.date);
      const points = charts.daily_attendance_trend.map((t) => Number(t.percent || 0));

      chartInstances.collegeAttendance = new Chart(collegeAttendanceChartEl, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Attendance %',
            data: points,
            borderColor: '#4e73df',
            backgroundColor: 'rgba(78, 115, 223, 0.05)',
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: '#4e73df'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { mode: 'index', intersect: false }
          },
          scales: {
            x: { grid: { display: false } },
            y: {
              beginAtZero: true,
              max: 100,
              ticks: {
                callback: (value) => `${value}%`
              }
            }
          }
        }
      });
    }

    if (collegeMonthlyReportChartEl && charts.monthly_report) {
      if (chartInstances.collegeMonthlyReport) {
        chartInstances.collegeMonthlyReport.destroy();
      }

      const labels = charts.monthly_report.map((row) => row.month);
      const points = charts.monthly_report.map((row) => Number(row.percent || 0));

      chartInstances.collegeMonthlyReport = new Chart(collegeMonthlyReportChartEl, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Monthly Attendance %',
            data: points,
            backgroundColor: '#1cc88a',
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: { grid: { display: false } },
            y: {
              beginAtZero: true,
              max: 100,
              ticks: {
                callback: (value) => `${value}%`
              }
            }
          }
        }
      });
    }

    if (lowAttendanceStudentsEl) {
      lowAttendanceStudentsEl.innerHTML = '';
      if (!lowAttendanceStudents.length) {
        lowAttendanceStudentsEl.innerHTML = '<tr><td colspan="5" class="text-muted">No low attendance students found.</td></tr>';
      } else {
        lowAttendanceStudents.forEach((student) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>
              <div class="fw-semibold">${student.name || '-'}</div>
              <div class="text-muted small">${student.unique_user_id || '-'}</div>
            </td>
            <td>${student.dept_name || '-'}</td>
            <td>Y${Number(student.year || 0)} / S${Number(student.semester || 0)} / ${student.section || '-'}</td>
            <td>${Number(student.present_count || 0)}/${Number(student.total_sessions || 0)}</td>
            <td><span class="badge bg-danger-subtle text-danger-emphasis">${Number(student.attendance_percent || 0).toFixed(1)}%</span></td>
          `;
          lowAttendanceStudentsEl.appendChild(tr);
        });
      }
    }

    if (collegeRecentActivityEl) {
      collegeRecentActivityEl.innerHTML = '';
      if (!activity.length) {
        collegeRecentActivityEl.innerHTML = '<li class="list-group-item px-0 text-muted">No recent activity.</li>';
      } else {
        activity.forEach((row) => {
          const li = document.createElement('li');
          li.className = 'list-group-item px-0';
          li.textContent = `${formatDisplayDate(row.timestamp)} • ${row.action}${row.name ? ` (${row.name})` : ''}`;
          collegeRecentActivityEl.appendChild(li);
        });
      }
    }
  }

  async function loadSuperAdminDashboard() {
    const data = await apiRequest('super_admin_dashboard_summary');
    const stats = data.stats || {};
    const charts = data.charts || {};
    const activity = data.recent_activity || [];

    if (totalCollegesEl) totalCollegesEl.textContent = String(Number(stats.total_colleges || 0));
    if (activeUsersEl) activeUsersEl.textContent = String(Number(stats.active_users || 0));
    if (platformSessionsEl) platformSessionsEl.textContent = String(Number(stats.monthly_sessions || 0));
    if (uptimeEl) uptimeEl.textContent = stats.uptime || '99.9%';
    if (mrrEl) mrrEl.textContent = stats.mrr === null ? '--' : `$${Number(stats.mrr).toLocaleString()}`;
    if (activeSubscriptionsEl) activeSubscriptionsEl.textContent = String(Number(stats.active_subscriptions || 0));

    // Render Platform Usage Trend Chart
    if (superAdminUsageChartEl && charts.usage_trend) {
      if (chartInstances.superAdminUsage) {
        chartInstances.superAdminUsage.destroy();
      }
      const labels = charts.usage_trend.map(t => t.date);
      const points = charts.usage_trend.map(t => t.count);
      chartInstances.superAdminUsage = new Chart(superAdminUsageChartEl, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Attendance Sessions',
            data: points,
            backgroundColor: '#4e73df',
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true, ticks: { precision: 0 } }
          }
        }
      });
    }

    // Render Revenue Trend Chart
    if (superAdminRevenueChartEl && charts.revenue_trend) {
      if (chartInstances.superAdminRevenue) {
        chartInstances.superAdminRevenue.destroy();
      }
      const labels = charts.revenue_trend.map(t => t.month);
      const points = charts.revenue_trend.map(t => t.amount);
      chartInstances.superAdminRevenue = new Chart(superAdminRevenueChartEl, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Monthly Revenue',
            data: points,
            borderColor: '#1cc88a',
            backgroundColor: 'rgba(28, 200, 138, 0.05)',
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              beginAtZero: true, ticks: {
                callback: value => '$' + value.toLocaleString()
              }
            }
          }
        }
      });
    }

    if (systemActivitiesEl) {
      systemActivitiesEl.innerHTML = '';
      if (!activity.length) {
        systemActivitiesEl.innerHTML = '<li class="list-group-item px-0 text-muted">No recent system activity.</li>';
      } else {
        activity.forEach((row) => {
          const li = document.createElement('li');
          li.className = 'list-group-item px-0';
          li.textContent = `${formatDisplayDate(row.timestamp)} • ${row.action}${row.name ? ` (${row.name})` : ''}`;
          systemActivitiesEl.appendChild(li);
        });
      }
    }
  }

  function roleLabel(role) {
    const mapping = {
      super_admin: 'Super Admin',
      college_admin: 'College Admin',
      faculty: 'Faculty',
      student: 'Student'
    };
    return mapping[role] || role;
  }

  function hasRole(allowedRoles) {
    return Array.isArray(allowedRoles) && allowedRoles.includes(currentRole);
  }

  function statusBadgeClass(status) {
    if (status === 'active') return 'bg-success-subtle text-success-emphasis';
    if (status === 'suspended') return 'bg-danger-subtle text-danger-emphasis';
    return 'bg-warning text-dark';
  }

  function getUserLastLoginTs(user) {
    const v = user && user.last_login ? Date.parse(String(user.last_login).replace(' ', 'T')) : NaN;
    return Number.isFinite(v) ? v : 0;
  }

  function updateSuperAdminUserCounters(users) {
    if (!Array.isArray(users)) return;
    const counts = {
      student: 0,
      faculty: 0,
      college_admin: 0,
      super_admin: 0
    };
    users.forEach((u) => {
      if (counts[u.role] !== undefined) counts[u.role] += 1;
    });
    if (saUsersStudentsCountEl) saUsersStudentsCountEl.textContent = String(counts.student);
    if (saUsersFacultyCountEl) saUsersFacultyCountEl.textContent = String(counts.faculty);
    if (saUsersCollegeAdminsCountEl) saUsersCollegeAdminsCountEl.textContent = String(counts.college_admin);
    if (saUsersSuperAdminsCountEl) saUsersSuperAdminsCountEl.textContent = String(counts.super_admin);
  }

  function getFilteredSuperAdminUsers() {
    const collegeFilter = saUsersCollegeFilterEl ? String(saUsersCollegeFilterEl.value || '') : '';
    const search = saUsersSearchEl ? String(saUsersSearchEl.value || '').trim().toLowerCase() : '';
    const sortBy = saUsersSortByEl ? String(saUsersSortByEl.value || 'college_asc') : 'college_asc';

    let rows = superAdminUsers.slice();
    if (superAdminRoleFilter !== 'all') {
      rows = rows.filter((u) => String(u.role) === superAdminRoleFilter);
    }
    if (collegeFilter) {
      rows = rows.filter((u) => String(u.college_id || '') === collegeFilter);
    }
    if (search) {
      rows = rows.filter((u) => {
        const hay = `${u.name || ''} ${u.unique_user_id || ''} ${u.email || ''} ${u.college_name || ''}`.toLowerCase();
        return hay.includes(search);
      });
    }

    const cmpText = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
    rows.sort((a, b) => {
      const collegeA = String(a.college_name || 'ZZZ');
      const collegeB = String(b.college_name || 'ZZZ');
      const nameA = String(a.name || '');
      const nameB = String(b.name || '');
      if (sortBy === 'college_desc') return cmpText(collegeB, collegeA) || cmpText(nameA, nameB);
      if (sortBy === 'name_asc') return cmpText(nameA, nameB);
      if (sortBy === 'name_desc') return cmpText(nameB, nameA);
      if (sortBy === 'recent_login') return getUserLastLoginTs(b) - getUserLastLoginTs(a);
      return cmpText(collegeA, collegeB) || cmpText(nameA, nameB);
    });
    return rows;
  }

  function renderSuperAdminUsersTable() {
    if (!usersOverviewTable) return;
    const users = getFilteredSuperAdminUsers();
    usersOverviewTable.innerHTML = '';
    if (!users.length) {
      usersOverviewTable.innerHTML = '<tr><td colspan="8" class="text-muted">No users found for selected filters.</td></tr>';
      return;
    }

    users.forEach((user) => {
      const roleSelectId = `sa-role-${user.id}`;
      const statusSelectId = `sa-status-${user.id}`;
      const collegeSelectId = `sa-college-${user.id}`;
      const isSelf = user.unique_user_id === currentUser.id;
      const tr = document.createElement('tr');
      const collegeOptions = ['<option value="">Select college</option>']
        .concat(superAdminColleges.map((college) => {
          const selected = Number(user.college_id) === Number(college.id) ? 'selected' : '';
          return `<option value="${college.id}" ${selected}>${college.name}</option>`;
        }))
        .join('');

      tr.innerHTML = `
          <td>
            <div class="fw-semibold">${user.name || '-'}</div>
            <div class="text-muted">${user.unique_user_id || '-'}</div>
          </td>
          <td>${user.email || '-'}</td>
          <td>
            <select class="form-select form-select-sm" id="${roleSelectId}" ${isSelf ? 'disabled' : ''}>
              <option value="super_admin" ${user.role === 'super_admin' ? 'selected' : ''}>Super Admin</option>
              <option value="college_admin" ${user.role === 'college_admin' ? 'selected' : ''}>College Admin</option>
              <option value="faculty" ${user.role === 'faculty' ? 'selected' : ''}>Faculty</option>
              <option value="student" ${user.role === 'student' ? 'selected' : ''}>Student</option>
            </select>
          </td>
          <td>${user.college_name || '-'}</td>
          <td>${user.last_login || '-'}</td>
          <td>
            <select class="form-select form-select-sm" id="${statusSelectId}" ${isSelf ? 'disabled' : ''}>
              <option value="active" ${user.status === 'active' ? 'selected' : ''}>active</option>
              <option value="suspended" ${user.status === 'suspended' ? 'selected' : ''}>suspended</option>
              <option value="pending" ${user.status === 'pending' ? 'selected' : ''}>pending</option>
            </select>
          </td>
          <td>
            <select class="form-select form-select-sm" id="${collegeSelectId}" ${isSelf ? 'disabled' : ''}>
              ${collegeOptions}
            </select>
          </td>
          <td class="text-nowrap">
            <button class="btn btn-outline-primary btn-sm me-1" data-action="sa-user-save" data-user-id="${user.id}" ${isSelf ? 'disabled' : ''}>Save</button>
            <button class="btn btn-outline-danger btn-sm" data-action="sa-user-delete" data-user-id="${user.id}" ${isSelf ? 'disabled' : ''}>Remove</button>
          </td>
        `;
      usersOverviewTable.appendChild(tr);

      const roleEl = document.getElementById(roleSelectId);
      const collegeEl = document.getElementById(collegeSelectId);
      const syncCollegeFieldState = () => {
        if (!roleEl || !collegeEl) return;
        if (roleEl.value === 'super_admin') {
          collegeEl.value = '';
          collegeEl.disabled = true;
        } else {
          collegeEl.disabled = isSelf;
        }
      };
      if (roleEl) roleEl.addEventListener('change', syncCollegeFieldState);
      syncCollegeFieldState();
    });
  }

  async function loadSuperAdminUsers() {
    if (!usersOverviewTable) return;
    const [userData, collegesData] = await Promise.all([
      apiRequest('users_list'),
      apiRequest('colleges_list')
    ]);
    const allUsers = userData.users || [];
    superAdminUsers = allUsers.filter((u) => !u.deleted_at);
    superAdminColleges = collegesData.colleges || [];

    if (saUsersCollegeFilterEl) {
      const prev = String(saUsersCollegeFilterEl.value || '');
      saUsersCollegeFilterEl.innerHTML = '<option value="">All Colleges</option>';
      superAdminColleges.forEach((college) => {
        const opt = document.createElement('option');
        opt.value = String(college.id);
        opt.textContent = String(college.name || `College ${college.id}`);
        saUsersCollegeFilterEl.appendChild(opt);
      });
      if (prev) saUsersCollegeFilterEl.value = prev;
    }

    updateSuperAdminUserCounters(superAdminUsers);
    renderSuperAdminUsersTable();
  }

  async function loadCollegeDetail(collegeId) {
    if (!collegeId) return;
    selectedCollegeIdForSuperAdmin = Number(collegeId) || 0;
    const data = await apiRequest(`college_detail&college_id=${encodeURIComponent(String(collegeId))}`);
    const stats = data.stats || {};
    const users = data.users || [];
    if (saCollegeDetailEmptyEl) saCollegeDetailEmptyEl.classList.add('d-none');
    if (saCollegeDetailWrapEl) saCollegeDetailWrapEl.classList.remove('d-none');
    if (saCollegeTotalUsersEl) saCollegeTotalUsersEl.textContent = String(Number(stats.total_users || 0));
    if (saCollegeStudentsEl) saCollegeStudentsEl.textContent = String(Number(stats.students_count || 0));
    if (saCollegeFacultyEl) saCollegeFacultyEl.textContent = String(Number(stats.faculty_count || 0));
    if (saCollegeAdminsEl) saCollegeAdminsEl.textContent = String(Number(stats.college_admins_count || 0));
    if (saCollegeDepartmentsEl) saCollegeDepartmentsEl.textContent = String(Number(stats.departments_count || 0));
    if (saCollegeCoursesEl) saCollegeCoursesEl.textContent = String(Number(stats.courses_count || 0));
    if (saCollegeUsersBodyEl) {
      saCollegeUsersBodyEl.innerHTML = '';
      if (!users.length) {
        saCollegeUsersBodyEl.innerHTML = '<tr><td colspan="6" class="text-muted">No users found.</td></tr>';
      } else {
        users.forEach((u) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
              <td>${u.unique_user_id || '-'}</td>
              <td>${u.name || '-'}</td>
              <td>${u.email || '-'}</td>
              <td>${roleLabel(u.role)}</td>
              <td><span class="badge ${statusBadgeClass(u.status)}">${u.status || '-'}</span></td>
              <td>${u.last_login || '-'}</td>
            `;
          saCollegeUsersBodyEl.appendChild(tr);
        });
      }
    }
  }

  async function loadCollegesManagement() {
    if (!collegesTableBody) return;
    if (toggleCollegeArchiveBtn) {
      toggleCollegeArchiveBtn.innerHTML = showArchivedColleges
        ? '<i class="bi bi-arrow-left me-1"></i>Back to Active'
        : '<i class="bi bi-archive me-1"></i>View Removed';
    }

    const data = await apiRequest(showArchivedColleges ? 'colleges_archive_list' : 'colleges_list');
    const colleges = data.colleges || [];
    superAdminColleges = colleges;
    if (saCollegeDetailEmptyEl) saCollegeDetailEmptyEl.classList.remove('d-none');
    if (saCollegeDetailWrapEl) saCollegeDetailWrapEl.classList.add('d-none');
    collegesTableBody.innerHTML = '';
    if (!colleges.length) {
      collegesTableBody.innerHTML = showArchivedColleges
        ? '<tr><td colspan="8" class="text-muted">No removed colleges found.</td></tr>'
        : '<tr><td colspan="8" class="text-muted">No colleges found.</td></tr>';
      return;
    }

    colleges.forEach((college) => {
      const tr = document.createElement('tr');
      const isRemoved = String(college.status || '') === 'removed' || Boolean(college.archived_at);
      const statusClass = isRemoved
        ? 'bg-danger-subtle text-danger-emphasis'
        : (college.status === 'active'
          ? 'bg-success-subtle text-success-emphasis'
          : 'bg-secondary-subtle text-secondary-emphasis');
      const statusLabel = isRemoved ? 'Removed' : (college.status === 'active' ? 'Active' : 'Inactive');

      const actionsHtml = showArchivedColleges
        ? `<button class="btn btn-outline-secondary btn-sm me-1" data-action="sa-college-view" data-college-id="${college.id}" title="View"><i class="bi bi-eye"></i></button>
             <button class="btn btn-outline-success btn-sm" data-action="sa-college-restore" data-college-id="${college.id}" title="Restore"><i class="bi bi-arrow-counterclockwise me-1"></i>Restore</button>`
        : `<button class="btn btn-outline-secondary btn-sm me-1" data-action="sa-college-view" data-college-id="${college.id}" title="View"><i class="bi bi-eye"></i></button>
             <button class="btn btn-outline-primary btn-sm me-1" data-action="sa-college-edit" data-college-id="${college.id}" title="Edit"><i class="bi bi-pencil"></i></button>
             <button class="btn btn-outline-danger btn-sm" data-action="sa-college-remove" data-college-id="${college.id}" title="Remove"><i class="bi bi-trash"></i></button>`;

      tr.innerHTML = `
          <td class="fw-semibold">${college.name || '-'}</td>
          <td><span class="badge bg-secondary-subtle text-secondary-emphasis">${college.short_code || '-'}</span></td>
          <td class="d-none d-md-table-cell">${college.contact_email || college.contact || '-'}</td>
          <td class="d-none d-lg-table-cell">${college.contact_phone || '-'}</td>
          <td class="d-none d-sm-table-cell text-center">${Number(college.students_count || 0)}</td>
          <td class="d-none d-sm-table-cell text-center">${Number(college.faculty_count || 0)}</td>
          <td><span class="badge ${statusClass}">${statusLabel}</span></td>
          <td class="text-nowrap">${actionsHtml}</td>
        `;
      collegesTableBody.appendChild(tr);
    });
  }

  async function getSuperAdminCollegesForFilters(includeRemoved = false) {
    if (includeRemoved && Array.isArray(superAdminCollegesAllList)) return superAdminCollegesAllList;
    if (!includeRemoved && Array.isArray(superAdminCollegesActiveList)) return superAdminCollegesActiveList;

    const active = await apiRequest('colleges_list');
    let colleges = active.colleges || [];
    if (includeRemoved) {
      const archived = await apiRequest('colleges_archive_list');
      colleges = colleges.concat(archived.colleges || []);
    }

    const byId = new Map();
    colleges.forEach((college) => {
      if (!college || college.id === undefined || college.id === null) return;
      byId.set(String(college.id), college);
    });
    const result = Array.from(byId.values());
    if (includeRemoved) {
      superAdminCollegesAllList = result;
    } else {
      superAdminCollegesActiveList = result;
    }
    return result;
  }

  function populateCollegeFilterSelect(selectEl, colleges, options = {}) {
    if (!selectEl) return;
    const includeAll = options.includeAll !== false;
    const prev = String(selectEl.value || '');
    selectEl.innerHTML = includeAll ? '<option value="">All Colleges</option>' : '<option value="">Select college</option>';
    (colleges || []).forEach((college) => {
      const opt = document.createElement('option');
      opt.value = String(college.id);
      const isRemoved = String(college.status || '') === 'removed' || Boolean(college.archived_at);
      opt.textContent = `${college.name || `College ${college.id}`}${isRemoved ? ' (removed)' : ''}`;
      selectEl.appendChild(opt);
    });
    if (prev) selectEl.value = prev;
  }

  function departmentStatusBadgeClass(status) {
    return status === 'active'
      ? 'bg-success-subtle text-success-emphasis'
      : 'bg-secondary-subtle text-secondary-emphasis';
  }

  function formatCollegeCell(row) {
    const name = row && row.college_name ? String(row.college_name) : '-';
    const isRemoved = String(row.college_status || '') === 'removed' || Boolean(row.college_archived_at);
    return isRemoved
      ? `${name} <span class="badge bg-danger-subtle text-danger-emphasis ms-1">removed</span>`
      : name;
  }

  function renderSuperAdminDepartmentsTable() {
    if (!saDepartmentsTableBodyEl) return;
    const collegeFilter = saDeptCollegeFilterEl ? String(saDeptCollegeFilterEl.value || '') : '';
    const search = saDeptSearchEl ? String(saDeptSearchEl.value || '').trim().toLowerCase() : '';

    let rows = Array.isArray(superAdminDepartments) ? superAdminDepartments.slice() : [];
    if (collegeFilter) {
      rows = rows.filter((r) => String(r.college_id) === collegeFilter);
    }
    if (search) {
      rows = rows.filter((r) => {
        const dept = String(r.name || '').toLowerCase();
        const college = String(r.college_name || '').toLowerCase();
        return dept.includes(search) || college.includes(search);
      });
    }

    saDepartmentsTableBodyEl.innerHTML = '';
    if (!rows.length) {
      saDepartmentsTableBodyEl.innerHTML = '<tr><td colspan="6" class="text-muted">No departments found.</td></tr>';
      return;
    }

    rows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
          <td>${formatCollegeCell(row)}</td>
          <td>${row.name || '-'}</td>
          <td><span class="badge ${departmentStatusBadgeClass(row.status)}">${row.status || '-'}</span></td>
          <td>${Number(row.courses_count || 0)}</td>
          <td>${Number(row.students_count || 0)}</td>
          <td>${Number(row.faculty_count || 0)}</td>
        `;
      saDepartmentsTableBodyEl.appendChild(tr);
    });
  }

  async function loadSuperAdminDepartments() {
    if (!saDepartmentsTableBodyEl) return;
    const includeRemoved = !!(saDeptIncludeRemovedEl && saDeptIncludeRemovedEl.checked);
    const colleges = await getSuperAdminCollegesForFilters(includeRemoved);
    populateCollegeFilterSelect(saDeptCollegeFilterEl, colleges, { includeAll: true });

    const action = includeRemoved ? 'sa_departments_list&include_removed=1' : 'sa_departments_list';
    const data = await apiRequest(action);
    superAdminDepartments = data.departments || [];
    renderSuperAdminDepartmentsTable();
  }

  function renderSuperAdminStudentsTable() {
    if (!saStudentsTableBodyEl) return;
    const collegeFilter = saStudentsCollegeFilterEl ? String(saStudentsCollegeFilterEl.value || '') : '';
    const search = saStudentsSearchEl ? String(saStudentsSearchEl.value || '').trim().toLowerCase() : '';

    let rows = Array.isArray(superAdminStudents) ? superAdminStudents.slice() : [];
    if (collegeFilter) {
      rows = rows.filter((r) => String(r.college_id) === collegeFilter);
    }
    if (search) {
      rows = rows.filter((r) => {
        const haystack = [
          r.unique_user_id,
          r.name,
          r.email,
          r.dept_name,
          r.college_name
        ].map((v) => String(v || '').toLowerCase()).join(' ');
        return haystack.includes(search);
      });
    }

    saStudentsTableBodyEl.innerHTML = '';
    if (!rows.length) {
      saStudentsTableBodyEl.innerHTML = '<tr><td colspan="10" class="text-muted">No students found.</td></tr>';
      return;
    }

    rows.forEach((row) => {
      const archivedBadge = row.deleted_at
        ? '<span class="badge bg-secondary-subtle text-secondary-emphasis">yes</span>'
        : '<span class="badge bg-success-subtle text-success-emphasis">no</span>';
      const tr = document.createElement('tr');
      tr.innerHTML = `
          <td>${formatCollegeCell(row)}</td>
          <td>${row.unique_user_id || '-'}</td>
          <td>${row.name || '-'}</td>
          <td>${row.email || '-'}</td>
          <td>${row.dept_name || '-'}</td>
          <td>${row.year || '-'}</td>
          <td>${row.semester || '-'}</td>
          <td>${row.section || '-'}</td>
          <td><span class="badge ${statusBadgeClass(row.status)}">${row.status || '-'}</span></td>
          <td>${archivedBadge}</td>
        `;
      saStudentsTableBodyEl.appendChild(tr);
    });
  }

  async function loadSuperAdminStudents() {
    if (!saStudentsTableBodyEl) return;
    const includeArchived = !!(saStudentsIncludeArchivedEl && saStudentsIncludeArchivedEl.checked);
    const includeRemoved = !!(saStudentsIncludeRemovedEl && saStudentsIncludeRemovedEl.checked);
    const colleges = await getSuperAdminCollegesForFilters(includeRemoved);
    populateCollegeFilterSelect(saStudentsCollegeFilterEl, colleges, { includeAll: true });

    const params = new URLSearchParams();
    if (includeArchived) params.set('include_archived', '1');
    if (includeRemoved) params.set('include_removed', '1');
    const action = params.toString() ? `sa_students_list&${params.toString()}` : 'sa_students_list';
    const data = await apiRequest(action);
    superAdminStudents = data.students || [];
    renderSuperAdminStudentsTable();
  }

  function renderSuperAdminFacultyTable() {
    if (!saFacultyTableBodyEl) return;
    const collegeFilter = saFacultyCollegeFilterEl ? String(saFacultyCollegeFilterEl.value || '') : '';
    const search = saFacultySearchEl ? String(saFacultySearchEl.value || '').trim().toLowerCase() : '';

    let rows = Array.isArray(superAdminFaculty) ? superAdminFaculty.slice() : [];
    if (collegeFilter) {
      rows = rows.filter((r) => String(r.college_id) === collegeFilter);
    }
    if (search) {
      rows = rows.filter((r) => {
        const haystack = [
          r.unique_user_id,
          r.name,
          r.email,
          r.dept_name,
          r.designation,
          r.college_name
        ].map((v) => String(v || '').toLowerCase()).join(' ');
        return haystack.includes(search);
      });
    }

    saFacultyTableBodyEl.innerHTML = '';
    if (!rows.length) {
      saFacultyTableBodyEl.innerHTML = '<tr><td colspan="8" class="text-muted">No faculty found.</td></tr>';
      return;
    }

    rows.forEach((row) => {
      const archivedBadge = row.deleted_at
        ? '<span class="badge bg-secondary-subtle text-secondary-emphasis">yes</span>'
        : '<span class="badge bg-success-subtle text-success-emphasis">no</span>';
      const tr = document.createElement('tr');
      tr.innerHTML = `
          <td>${formatCollegeCell(row)}</td>
          <td>${row.unique_user_id || '-'}</td>
          <td>${row.name || '-'}</td>
          <td>${row.email || '-'}</td>
          <td>${row.dept_name || '-'}</td>
          <td>${row.designation || '-'}</td>
          <td><span class="badge ${statusBadgeClass(row.status)}">${row.status || '-'}</span></td>
          <td>${archivedBadge}</td>
        `;
      saFacultyTableBodyEl.appendChild(tr);
    });
  }

  async function loadSuperAdminFaculty() {
    if (!saFacultyTableBodyEl) return;
    const includeArchived = !!(saFacultyIncludeArchivedEl && saFacultyIncludeArchivedEl.checked);
    const includeRemoved = !!(saFacultyIncludeRemovedEl && saFacultyIncludeRemovedEl.checked);
    const colleges = await getSuperAdminCollegesForFilters(includeRemoved);
    populateCollegeFilterSelect(saFacultyCollegeFilterEl, colleges, { includeAll: true });

    const params = new URLSearchParams();
    if (includeArchived) params.set('include_archived', '1');
    if (includeRemoved) params.set('include_removed', '1');
    const action = params.toString() ? `sa_faculty_list&${params.toString()}` : 'sa_faculty_list';
    const data = await apiRequest(action);
    superAdminFaculty = data.faculty || [];
    renderSuperAdminFacultyTable();
  }

  function showCredentialsModal(payload) {
    if (!credentialsModalEl) return;
    const title = payload && payload.title ? String(payload.title) : 'Credentials';
    const userId = payload && payload.userId ? String(payload.userId) : '';
    const password = payload && payload.password ? String(payload.password) : '';

    if (credentialsModalTitleEl) credentialsModalTitleEl.textContent = title;
    if (credUserIdEl) credUserIdEl.textContent = userId || '-';
    if (credPasswordEl) credPasswordEl.textContent = password || '-';

    pendingCredentialsCopyText = `Login ID: ${userId}\nPassword: ${password}`;
    bootstrap.Modal.getOrCreateInstance(credentialsModalEl).show();
  }

  async function prefillSuperAdminCollegeAdminCredentials() {
    if (!saCollegeAdminIdEl || !saCollegeAdminPasswordEl) return;
    const [idData, pwdData] = await Promise.all([
      apiRequest('generate_unique_id', 'POST', { role: 'college_admin' }),
      apiRequest('generate_password', 'POST')
    ]);
    saCollegeAdminIdEl.value = String(idData.unique_id || '');
    saCollegeAdminPasswordEl.value = String(pwdData.password || '');
  }

  async function openSuperAdminCollegeModal(college = null) {
    if (!saCollegeModalEl || !saCollegeForm) return;
    const isEdit = !!(college && Number(college.id));
    if (saCollegeForm) saCollegeForm.reset();
    if (saCollegeIdEl) saCollegeIdEl.value = college ? String(college.id || '') : '';
    if (saCollegeNameEl) saCollegeNameEl.value = college ? (college.name || '') : '';
    if (saCollegeShortCodeEl) saCollegeShortCodeEl.value = college ? (college.short_code || '') : '';
    if (saCollegeStatusEl) saCollegeStatusEl.value = college ? (college.status || 'active') : 'active';
    if (saCollegeEmailEl) saCollegeEmailEl.value = college ? (college.contact_email || college.contact || '') : '';
    if (saCollegePhoneEl) saCollegePhoneEl.value = college ? (college.contact_phone || '') : '';
    if (saCollegeAdminIdEl) saCollegeAdminIdEl.value = '';
    if (saCollegeAdminPasswordEl) saCollegeAdminPasswordEl.value = '';
    if (saCollegeAdminNameEl) saCollegeAdminNameEl.value = '';
    if (saCollegeAdminEmailEl) saCollegeAdminEmailEl.value = '';
    if (saCollegeAdminFieldsEl) saCollegeAdminFieldsEl.classList.toggle('d-none', isEdit);
    if (saCollegeLogoInputEl) saCollegeLogoInputEl.value = '';
    if (saCollegeLogoPreviewEl) saCollegeLogoPreviewEl.src = (college && college.logo) ? college.logo : DEFAULT_COLLEGE_LOGO;
    if (saCollegeModalTitleEl) saCollegeModalTitleEl.innerHTML = isEdit
      ? '<i class="bi bi-pencil-square me-2"></i>Edit College'
      : '<i class="bi bi-building-add me-2"></i>Add College';
    if (saCollegeSubmitBtnEl) saCollegeSubmitBtnEl.innerHTML = isEdit
      ? '<i class="bi bi-floppy me-1"></i>Save Changes'
      : '<i class="bi bi-check2-circle me-1"></i>Save College &amp; Admin';
    const modal = bootstrap.Modal.getOrCreateInstance(saCollegeModalEl);
    modal.show();

    if (!isEdit) {
      const regenBtn = document.getElementById('sa-college-admin-regen-btn');
      if (regenBtn) {
        regenBtn.onclick = async () => {
          regenBtn.disabled = true;
          regenBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Generating...';
          try {
            await prefillSuperAdminCollegeAdminCredentials();
          } catch (err) {
            showToast(err.message || 'Failed to regenerate credentials', 'danger');
          } finally {
            regenBtn.disabled = false;
            regenBtn.innerHTML = '<i class="bi bi-arrow-clockwise me-1"></i>Regenerate';
          }
        };
      }
      if (saCollegeAdminIdEl) {
        saCollegeAdminIdEl.placeholder = 'Generating...';
        saCollegeAdminPasswordEl.placeholder = 'Generating...';
      }
      try {
        await prefillSuperAdminCollegeAdminCredentials();
      } catch (err) {
        showToast(err.message || 'Failed to generate College Admin credentials', 'danger');
      }
      // Restore placeholder after auto-fill
      if (saCollegeAdminIdEl) saCollegeAdminIdEl.placeholder = 'Auto-generated or type manually';
      if (saCollegeAdminPasswordEl) saCollegeAdminPasswordEl.placeholder = 'Auto-generated or type manually';
    }
  }

  async function loadCollegeAdminStudents() {
    if (!studentsMgmtTable) return;
    const data = await apiRequest('college_admin_students_list');
    const students = data.students || [];
    collegeAdminStudentsCache = Array.isArray(students) ? students : [];
    studentsMgmtTable.innerHTML = '';
    if (!students.length) {
      studentsMgmtTable.innerHTML = '<tr><td colspan="8" class="text-muted">No students found.</td></tr>';
      return;
    }

    students.forEach((row) => {
      const statusSelectId = `ca-student-status-${row.id}`;
      const tr = document.createElement('tr');
      tr.innerHTML = `
          <td>${row.unique_user_id || '-'}</td>
          <td>${row.name || '-'}</td>
          <td>${row.dept_name || '-'}</td>
          <td>${row.year || '-'}</td>
          <td>${row.semester || '-'}</td>
          <td>${row.section || '-'}</td>
          <td>
            <select class="form-select form-select-sm" id="${statusSelectId}">
              <option value="active" ${row.status === 'active' ? 'selected' : ''}>active</option>
              <option value="suspended" ${row.status === 'suspended' ? 'selected' : ''}>suspended</option>
              <option value="pending" ${row.status === 'pending' ? 'selected' : ''}>pending</option>
            </select>
          </td>
          <td class="text-nowrap">
            <button class="btn btn-outline-secondary btn-sm me-1" data-action="ca-student-edit" data-user-id="${row.id}">Edit</button>
            <button class="btn btn-outline-primary btn-sm me-1" data-action="ca-user-save" data-role-target="student" data-user-id="${row.id}">Save</button>
            <button class="btn btn-outline-danger btn-sm" data-action="ca-user-delete" data-role-target="student" data-user-id="${row.id}">Remove</button>
          </td>
        `;
      studentsMgmtTable.appendChild(tr);
    });
  }

  async function loadCollegeAdminFaculty() {
    if (!facultyMgmtTable) return;
    const data = await apiRequest('college_admin_faculty_list');
    const faculty = data.faculty || [];
    collegeAdminFacultyCache = Array.isArray(faculty) ? faculty : [];
    facultyMgmtTable.innerHTML = '';
    if (!faculty.length) {
      facultyMgmtTable.innerHTML = '<tr><td colspan="6" class="text-muted">No faculty found.</td></tr>';
      return;
    }

    faculty.forEach((row) => {
      const statusSelectId = `ca-faculty-status-${row.id}`;
      const tr = document.createElement('tr');
      tr.innerHTML = `
          <td>${row.unique_user_id || '-'}</td>
          <td>${row.name || '-'}</td>
          <td>${row.dept_name || '-'}</td>
          <td>${row.email || '-'}</td>
          <td>
            <select class="form-select form-select-sm" id="${statusSelectId}">
              <option value="active" ${row.status === 'active' ? 'selected' : ''}>active</option>
              <option value="suspended" ${row.status === 'suspended' ? 'selected' : ''}>suspended</option>
              <option value="pending" ${row.status === 'pending' ? 'selected' : ''}>pending</option>
            </select>
          </td>
          <td class="text-nowrap">
            <button class="btn btn-outline-secondary btn-sm me-1" data-action="ca-faculty-edit" data-user-id="${row.id}">Edit</button>
            <button class="btn btn-outline-primary btn-sm me-1" data-action="ca-user-save" data-role-target="faculty" data-user-id="${row.id}">Save</button>
            <button class="btn btn-outline-danger btn-sm" data-action="ca-user-delete" data-role-target="faculty" data-user-id="${row.id}">Remove</button>
          </td>
        `;
      facultyMgmtTable.appendChild(tr);
    });
  }

  async function loadPlatformSettings() {
    if (!platformSettingsForm) return;
    const data = await apiRequest('platform_settings_get');
    const settings = data.settings || {};
    const timezoneEl = document.getElementById('platform-timezone');
    const timeoutEl = document.getElementById('platform-session-timeout');
    const attemptsEl = document.getElementById('platform-max-attempts');
    const maintenanceEl = document.getElementById('platform-maintenance-message');
    if (timezoneEl && settings.timezone) timezoneEl.value = settings.timezone;
    if (timeoutEl && settings.session_timeout) timeoutEl.value = settings.session_timeout;
    if (attemptsEl && settings.max_login_attempts) attemptsEl.value = settings.max_login_attempts;
    if (maintenanceEl && settings.maintenance_message !== undefined) maintenanceEl.value = settings.maintenance_message;
  }

  async function refreshMaintenanceNotice() {
    if (!currentUser) return;
    try {
      const data = await apiRequest('platform_notice_get');
      maintenanceMessage = String(data.maintenance_message || '').trim();
    } catch (_) {
      maintenanceMessage = '';
    }
    setNotificationCount(maintenanceMessage ? 1 : 0);
  }

  async function loadAuditLogs() {
    if (!auditLogsBodyEl) return;
    const params = new URLSearchParams();
    if (auditFilterFromEl && auditFilterFromEl.value) params.set('from', `${auditFilterFromEl.value} 00:00:00`);
    if (auditFilterToEl && auditFilterToEl.value) params.set('to', `${auditFilterToEl.value} 23:59:59`);
    if (auditFilterActionEl && auditFilterActionEl.value.trim()) params.set('action', auditFilterActionEl.value.trim());
    if (auditFilterRoleEl && auditFilterRoleEl.value) params.set('role', auditFilterRoleEl.value);

    const query = params.toString();
    const action = query ? `audit_logs_list&${query}` : 'audit_logs_list';
    const data = await apiRequest(action);
    const rows = data.logs || [];
    auditLogsBodyEl.innerHTML = '';
    if (!rows.length) {
      auditLogsBodyEl.innerHTML = '<tr><td colspan="5" class="text-muted">No audit logs found.</td></tr>';
      return;
    }

    rows.forEach((row) => {
      const tr = document.createElement('tr');
      let metadata = '-';
      if (row.metadata !== null && row.metadata !== undefined) {
        if (typeof row.metadata === 'string') {
          metadata = row.metadata;
        } else {
          try {
            metadata = JSON.stringify(row.metadata);
          } catch (_) {
            metadata = String(row.metadata);
          }
        }
      }
      tr.innerHTML = `
          <td>${row.timestamp || '-'}</td>
          <td>${row.name || row.unique_user_id || '-'}</td>
          <td>${roleLabel(row.role || '-')}</td>
          <td>${row.action || '-'}</td>
          <td class="text-break">${metadata}</td>
        `;
      auditLogsBodyEl.appendChild(tr);
    });
  }

  async function loadCollegeSettings() {
    if (!collegeSettingsForm) return;
    const data = await apiRequest('college_settings_get');
    const college = data.college || {};
    document.getElementById('college-settings-name').value = college.name || '';
    document.getElementById('college-settings-short-code').value = college.short_code || '';
    document.getElementById('college-settings-email').value = college.contact_email || college.contact || '';
    document.getElementById('college-settings-phone').value = college.contact_phone || '';
    const logoPreviewEl = document.getElementById('college-settings-logo-preview');
    const logoInputEl = document.getElementById('college-settings-logo-input');
    const logoSrc = college.logo || DEFAULT_COLLEGE_LOGO;
    if (logoPreviewEl) logoPreviewEl.src = logoSrc;
    if (logoInputEl) logoInputEl.value = '';
    if (collegeSettingsLatEl && collegeSettingsLngEl && collegeSettingsRadiusEl) {
      const lat = college.latitude;
      const lng = college.longitude;
      const hasLatLng = lat !== null && lat !== undefined && String(lat) !== '' && lng !== null && lng !== undefined && String(lng) !== '';
      if (hasLatLng) {
        collegeSettingsLatEl.value = String(lat);
        collegeSettingsLngEl.value = String(lng);
        collegeSettingsRadiusEl.value = String(Number(college.radius_meters || 200));
      } else {
        collegeSettingsLatEl.value = '';
        collegeSettingsLngEl.value = '';
        collegeSettingsRadiusEl.value = '';
      }
    }
    if (currentUser) {
      currentUser.college = college.name || currentUser.college;
      currentUser.college_logo_url = college.logo || currentUser.college_logo_url || '';
      setupUserContext();
    }
  }

  function noticeAudienceLabel(audience) {
    if (audience === 'students') return 'Students';
    if (audience === 'faculty') return 'Faculty';
    return 'All';
  }

  function noticeAudienceBadgeClass(audience) {
    if (audience === 'students') return 'bg-success-subtle text-success-emphasis';
    if (audience === 'faculty') return 'bg-warning text-dark';
    return 'bg-primary-subtle text-primary-emphasis';
  }

  function renderCollegeNotices() {
    if (!noticesTableBodyEl) return;
    const notices = Array.isArray(collegeNoticesCache) ? collegeNoticesCache : [];
    noticesTableBodyEl.innerHTML = '';

    if (!notices.length) {
      noticesTableBodyEl.innerHTML = '<tr><td colspan="7" class="text-muted">No notices found.</td></tr>';
      return;
    }

    const isAdmin = currentRole === 'college_admin';

    notices.forEach((n) => {
      const tr = document.createElement('tr');

      const tdDate = document.createElement('td');
      tdDate.textContent = formatDisplayDate(n.created_at || '');

      const tdTitle = document.createElement('td');
      tdTitle.textContent = n.title || '-';

      const tdAudience = document.createElement('td');
      const audBadge = document.createElement('span');
      audBadge.className = `badge ${noticeAudienceBadgeClass(n.audience)}`;
      audBadge.textContent = noticeAudienceLabel(n.audience);
      tdAudience.appendChild(audBadge);
      if (n.archived_at) {
        const archivedBadge = document.createElement('span');
        archivedBadge.className = 'badge bg-secondary-subtle text-secondary-emphasis ms-1';
        archivedBadge.textContent = 'archived';
        tdAudience.appendChild(archivedBadge);
      }

      const tdMsg = document.createElement('td');
      tdMsg.className = 'text-break';
      tdMsg.textContent = n.message || '-';

      const tdExpires = document.createElement('td');
      tdExpires.textContent = n.expires_at || '-';

      const tdFrom = document.createElement('td');
      tdFrom.textContent = n.created_by_name || '-';

      const tdActions = document.createElement('td');
      tdActions.className = 'text-nowrap';
      if (isAdmin && !n.archived_at) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-outline-danger btn-sm';
        btn.textContent = 'Archive';
        btn.dataset.action = 'notice-archive';
        btn.dataset.noticeId = String(n.id || '');
        tdActions.appendChild(btn);
      } else {
        tdActions.textContent = '-';
      }

      tr.appendChild(tdDate);
      tr.appendChild(tdTitle);
      tr.appendChild(tdAudience);
      tr.appendChild(tdMsg);
      tr.appendChild(tdExpires);
      tr.appendChild(tdFrom);
      tr.appendChild(tdActions);
      noticesTableBodyEl.appendChild(tr);
    });
  }

  async function loadCollegeNotices() {
    if (!noticesTableBodyEl) return;
    const params = new URLSearchParams();
    if (currentRole === 'college_admin' && noticesIncludeArchivedEl?.checked) params.set('include_archived', '1');
    if (currentRole === 'college_admin' && noticesIncludeExpiredEl?.checked) params.set('include_expired', '1');
    const query = params.toString();
    const action = query ? `college_notices_list&${query}` : 'college_notices_list';
    const data = await apiRequest(action);
    collegeNoticesCache = data.notices || [];
    renderCollegeNotices();
  }

  function dayLabel(dayNumber) {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return days[(Number(dayNumber) || 1) - 1] || '-';
  }

  function setSelectOptions(selectEl, values, includeAllLabel) {
    if (!selectEl) return;
    const current = String(selectEl.value || '');
    const unique = Array.from(new Set(values.map((v) => String(v || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    selectEl.innerHTML = '';
    const allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = includeAllLabel;
    selectEl.appendChild(allOpt);
    unique.forEach((value) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      selectEl.appendChild(opt);
    });
    if (unique.includes(current)) {
      selectEl.value = current;
    } else {
      selectEl.value = '';
    }
  }

  function parseCsvText(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '"') {
        if (inQuotes && text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (ch === ',' && !inQuotes) {
        row.push(cell);
        cell = '';
        continue;
      }

      if ((ch === '\n' || ch === '\r') && !inQuotes) {
        if (ch === '\r' && text[i + 1] === '\n') {
          i += 1;
        }
        row.push(cell);
        if (row.some((value) => String(value || '').trim() !== '')) {
          rows.push(row);
        }
        row = [];
        cell = '';
        continue;
      }

      cell += ch;
    }

    row.push(cell);
    if (row.some((value) => String(value || '').trim() !== '')) {
      rows.push(row);
    }
    return rows;
  }

  function normalizeCsvHeader(header) {
    return String(header || '')
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
  }

  function parseTimetableCsv(text) {
    const matrix = parseCsvText(String(text || ''));
    if (matrix.length < 2) {
      throw new Error('CSV is empty');
    }

    const aliases = {
      dept: 'dept_name',
      department: 'dept_name',
      department_name: 'dept_name',
      dept_name: 'dept_name',
      course: 'course_name',
      course_name: 'course_name',
      year: 'year',
      semester: 'semester',
      sem: 'semester',
      section: 'section',
      faculty_id: 'faculty_unique_id',
      faculty_uid: 'faculty_unique_id',
      faculty_code: 'faculty_unique_id',
      faculty_unique_id: 'faculty_unique_id',
      faculty_uniqueid: 'faculty_unique_id',
      day: 'day_of_week',
      day_of_week: 'day_of_week',
      start: 'start_time',
      start_time: 'start_time',
      end: 'end_time',
      end_time: 'end_time',
      subject: 'subject',
      subject_name: 'subject',
    };

    const headerMap = {};
    matrix[0].forEach((value, index) => {
      const normalized = normalizeCsvHeader(value);
      const canonical = aliases[normalized] || normalized;
      if (!(canonical in headerMap)) {
        headerMap[canonical] = index;
      }
    });

    const requiredHeaders = [
      'dept_name',
      'course_name',
      'year',
      'section',
      'faculty_unique_id',
      'day_of_week',
      'start_time',
      'end_time',
    ];
    const missing = requiredHeaders.filter((key) => !(key in headerMap));
    if (missing.length) {
      throw new Error(`Missing CSV column(s): ${missing.join(', ')}`);
    }

    const readCell = (row, key) => {
      const index = headerMap[key];
      if (typeof index !== 'number') return '';
      return String(row[index] ?? '').trim();
    };

    const rows = [];
    for (let i = 1; i < matrix.length; i += 1) {
      const rawRow = matrix[i];
      if (!rawRow.some((value) => String(value || '').trim() !== '')) continue;
      rows.push({
        row_number: i + 1,
        dept_name: readCell(rawRow, 'dept_name'),
        course_name: readCell(rawRow, 'course_name'),
        year: readCell(rawRow, 'year'),
        semester: readCell(rawRow, 'semester'),
        section: readCell(rawRow, 'section'),
        faculty_unique_id: readCell(rawRow, 'faculty_unique_id'),
        day_of_week: readCell(rawRow, 'day_of_week'),
        start_time: readCell(rawRow, 'start_time'),
        end_time: readCell(rawRow, 'end_time'),
        subject: readCell(rawRow, 'subject'),
      });
    }

    if (!rows.length) {
      throw new Error('CSV has no data rows');
    }
    return rows;
  }

  function parseStudentCsv(text) {
    const matrix = parseCsvText(String(text || ''));
    if (matrix.length < 2) {
      throw new Error('CSV is empty');
    }

    const aliases = {
      name: 'name',
      student_name: 'name',
      full_name: 'name',
      student_id: 'student_id',
      unique_user_id: 'student_id',
      login_id: 'student_id',
      id: 'student_id',
      roll_no: 'student_id',
      roll_number: 'student_id',
      enrollment_no: 'student_id',
      email: 'email',
      student_email: 'email',
      mail: 'email',
      dept: 'department',
      dept_name: 'department',
      department: 'department',
      department_name: 'department',
      course: 'course_name',
      course_name: 'course_name',
      programme: 'course_name',
      program: 'course_name',
      year: 'year',
      semester: 'semester',
      sem: 'semester',
      section: 'section',
      sec: 'section',
      password: 'password',
      pwd: 'password',
      phone: 'phone',
      mobile: 'phone',
      phone_number: 'phone',
    };

    const headerMap = {};
    matrix[0].forEach((value, index) => {
      const normalized = normalizeCsvHeader(value);
      const canonical = aliases[normalized] || normalized;
      if (!(canonical in headerMap)) {
        headerMap[canonical] = index;
      }
    });

    if (!('name' in headerMap)) {
      throw new Error('Missing required CSV column: name (or student_name, full_name)');
    }

    const readCell = (row, key) => {
      const index = headerMap[key];
      if (typeof index !== 'number') return '';
      return String(row[index] ?? '').trim();
    };

    const rows = [];
    for (let i = 1; i < matrix.length; i += 1) {
      const rawRow = matrix[i];
      if (!rawRow.some((value) => String(value || '').trim() !== '')) continue;
      rows.push({
        row_number: i + 1,
        name: readCell(rawRow, 'name'),
        student_id: readCell(rawRow, 'student_id'),
        email: readCell(rawRow, 'email'),
        department: readCell(rawRow, 'department'),
        course_name: readCell(rawRow, 'course_name'),
        year: readCell(rawRow, 'year'),
        semester: readCell(rawRow, 'semester'),
        section: readCell(rawRow, 'section'),
        password: readCell(rawRow, 'password'),
      });
    }

    if (!rows.length) {
      throw new Error('CSV has no data rows');
    }
    return rows;
  }

  function filterTimetableRows(rows) {
    const dept = String(timetableFilterDept?.value || '');
    const year = String(timetableFilterYear?.value || '');
    const sem = String(timetableFilterSemester?.value || '');
    const section = String(timetableFilterSection?.value || '');
    return rows.filter((row) => {
      if (dept && String(row.dept_name || '') !== dept) return false;
      if (year && String(row.year || '') !== year) return false;
      if (sem && String(row.semester || '') !== sem) return false;
      if (section && String(row.section || '') !== section) return false;
      return true;
    });
  }

  async function loadTimetableManagement() {
    if (!timetableMgmtTable) return;
    const data = await apiRequest('timetable_list');
    const allRows = data.rows || [];
    setSelectOptions(timetableFilterDept, allRows.map((r) => r.dept_name), 'All Departments');
    setSelectOptions(timetableFilterYear, allRows.map((r) => r.year), 'All Years');
    setSelectOptions(timetableFilterSemester, allRows.map((r) => r.semester), 'All Semesters');
    setSelectOptions(timetableFilterSection, allRows.map((r) => r.section), 'All Sections');
    const rows = filterTimetableRows(allRows);
    timetableMgmtTable.innerHTML = '';
    if (timetableMgmtEmptyState) {
      timetableMgmtEmptyState.classList.toggle('d-none', allRows.length > 0);
    }
    if (!rows.length) {
      if (allRows.length > 0) {
        timetableMgmtTable.innerHTML = '<tr><td colspan="7" class="text-muted">No timetable rows match the current filters.</td></tr>';
      }
      return;
    }
    // Group timetable rows by department/course/year/semester/section
    const groups = new Map();
    rows.forEach((row) => {
      const key = [
        String(row.dept_name || ''),
        String(row.course_name || ''),
        String(row.year || ''),
        String(row.semester || ''),
        String(row.section || '')
      ].join('|');
      if (!groups.has(key)) {
        groups.set(key, {
          header: {
            dept_name: row.dept_name || '',
            course_name: row.course_name || '',
            year: row.year,
            semester: row.semester,
            section: row.section
          },
          rows: []
        });
      }
      groups.get(key).rows.push(row);
    });

    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
      const [ad, ac, ay, as, asec] = a.split('|');
      const [bd, bc, by, bs, bsec] = b.split('|');
      const deptCmp = ad.localeCompare(bd);
      if (deptCmp !== 0) return deptCmp;
      const yearCmp = Number(ay || 0) - Number(by || 0);
      if (yearCmp !== 0) return yearCmp;
      const semCmp = Number(as || 0) - Number(bs || 0);
      if (semCmp !== 0) return semCmp;
      const secCmp = asec.localeCompare(bsec);
      if (secCmp !== 0) return secCmp;
      return ac.localeCompare(bc);
    });

    sortedKeys.forEach((key) => {
      const group = groups.get(key);
      const h = group.header;
      const headerTr = document.createElement('tr');
      headerTr.className = 'table-active';
      const semText = h.semester ? ` • Sem ${h.semester}` : '';
      const sectionText = h.section ? `-${h.section}` : '';
      headerTr.innerHTML = `
          <td colspan="7">
            <strong>${h.dept_name || '-'}</strong>
            <span class="text-muted ms-1">${h.course_name || ''}</span>
            <span class="text-muted ms-2">Year ${h.year || '-'}${semText}${sectionText}</span>
          </td>
        `;
      timetableMgmtTable.appendChild(headerTr);

      // Create grid for this group
      const gridTr = document.createElement('tr');
      const gridTd = document.createElement('td');
      gridTd.colSpan = 7;
      gridTd.innerHTML = createTimetableGrid(group.rows);
      gridTr.appendChild(gridTd);
      timetableMgmtTable.appendChild(gridTr);
    });
  }

  function createTimetableGrid(rows) {
    // Collect unique time slots
    const timeSlots = new Set();
    rows.forEach(row => {
      timeSlots.add(`${row.start_time}-${row.end_time}`);
    });
    const sortedTimeSlots = Array.from(timeSlots).sort();

    // Days: 1=Monday to 6=Saturday
    const days = [1, 2, 3, 4, 5, 6];
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    let html = '<div class="table-responsive"><table class="table table-bordered align-middle small"><thead class="table-light"><tr><th style="width:10%;">Time</th>';
    dayLabels.forEach(label => {
      html += `<th>${label}</th>`;
    });
    html += '</tr></thead><tbody>';

    sortedTimeSlots.forEach(timeSlot => {
      html += `<tr><td>${timeSlot.replace('-', ' - ')}</td>`;
      days.forEach(day => {
        const cellRows = rows.filter((r) => Number(r.day_of_week || 0) === day && `${r.start_time}-${r.end_time}` === timeSlot);
        if (cellRows.length) {
          html += `<td class="timetable-cell">${cellRows.map((row) => `
            <div class="mb-2 pb-2 border-bottom">
              <div class="fw-semibold">${row.subject || '-'}</div>
              <div class="text-muted small">${row.faculty_name || '-'} (${row.faculty_unique_id || '-'})</div>
              <div class="mt-1">
                <button class="btn btn-outline-primary btn-sm me-1"
                        data-action="tt-row-edit"
                        data-tt-id="${row.id}"
                        data-day="${row.day_of_week}"
                        data-start="${row.start_time}"
                        data-end="${row.end_time}"
                        data-subject="${row.subject || ''}"
                        data-course-name="${row.course_name || ''}"
                        data-dept-name="${row.dept_name || ''}"
                        data-year="${row.year || ''}"
                        data-semester="${row.semester || ''}"
                        data-section="${row.section || ''}"
                        data-faculty-uid="${row.faculty_unique_id || ''}"
                        data-faculty-name="${row.faculty_name || ''}">Edit</button>
                <button class="btn btn-outline-danger btn-sm"
                        data-action="tt-row-delete"
                        data-tt-id="${row.id}">Delete</button>
              </div>
            </div>
          `).join('')}</td>`;
        } else {
          html += '<td></td>';
        }
      });
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    return html;
  }

  async function loadCollegeArchive() {
    if (!archiveUsersTable || !archiveDeptsTable) return;
    const data = await apiRequest('college_admin_archive_list');
    const archivedUsers = data.archived_users || [];
    const archivedDepts = data.archived_departments || [];

    archiveUsersTable.innerHTML = '';
    if (!archivedUsers.length) {
      archiveUsersTable.innerHTML = '<tr><td colspan="6" class="text-muted">No archived users.</td></tr>';
    } else {
      archivedUsers.forEach((u) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${u.unique_user_id || '-'}</td>
            <td>${u.name || '-'}</td>
            <td>${roleLabel(u.role || '-')}</td>
            <td>${u.email || '-'}</td>
            <td>${u.deleted_at || '-'}</td>
            <td class="text-nowrap">
              <button class="btn btn-outline-success btn-sm"
                      data-action="archive-restore-user"
                      data-user-id="${u.id}"
                      data-role-target="${u.role}">Restore</button>
              <button class="btn btn-outline-danger btn-sm ms-1"
                      data-action="archive-purge-user"
                      data-user-id="${u.id}"
                      data-role-target="${u.role}">Delete</button>
            </td>
          `;
        archiveUsersTable.appendChild(tr);
      });
    }

    archiveDeptsTable.innerHTML = '';
    if (!archivedDepts.length) {
      archiveDeptsTable.innerHTML = '<tr><td colspan="4" class="text-muted">No archived departments.</td></tr>';
    } else {
      archivedDepts.forEach((d) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${d.id}</td>
            <td>${d.name || '-'}</td>
            <td><span class="badge bg-secondary-subtle text-secondary-emphasis">${d.status || 'inactive'}</span></td>
            <td class="text-nowrap">
              <button class="btn btn-outline-success btn-sm"
                      data-action="archive-restore-dept"
                      data-dept-id="${d.id}"
                      data-dept-name="${d.name || ''}">Restore</button>
            </td>
          `;
        archiveDeptsTable.appendChild(tr);
      });
    }
  }

  async function loadDepartmentsAndCourses() {
    if (!departmentsList || !coursesList) return;
    const depRes = await apiRequest('departments_list');
    const departments = depRes.departments || [];
    departmentsList.innerHTML = '';
    if (!departments.length) {
      selectedDeptIdForCourses = 0;
      selectedCourseIdForSubjects = 0;
      selectedCourseLabelForSubjects = '';
      departmentsList.innerHTML = '<li class="list-group-item px-0 text-muted">No departments found.</li>';
      coursesList.innerHTML = '<li class="list-group-item px-0 text-muted">No courses found.</li>';
      if (subjectsList) subjectsList.innerHTML = '<li class="list-group-item px-0 text-muted">Select a course to view subjects.</li>';
      if (subjectsTitle) subjectsTitle.textContent = 'Subjects';
      if (addSubjectBtn) addSubjectBtn.disabled = true;
      return;
    }

    departments.forEach((dept) => {
      const li = document.createElement('li');
      li.className = 'list-group-item px-0 d-flex justify-content-between align-items-center';
      li.innerHTML = `
          <span>${dept.name}</span>
          <div class="d-flex gap-1">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-action="load-dept-courses" data-dept-id="${dept.id}">View</button>
            <button type="button" class="btn btn-outline-primary btn-sm" data-action="edit-dept" data-dept-id="${dept.id}" data-dept-name="${dept.name || ''}">Edit</button>
            <button type="button" class="btn btn-outline-danger btn-sm" data-action="delete-dept" data-dept-id="${dept.id}" data-dept-name="${dept.name || ''}">Remove</button>
          </div>
        `;
      departmentsList.appendChild(li);
    });

    const preferredDeptId = selectedDeptIdForCourses
      && departments.some((d) => Number(d.id) === Number(selectedDeptIdForCourses))
      ? Number(selectedDeptIdForCourses)
      : Number(departments[0].id);
    await loadCoursesForDepartment(preferredDeptId);
  }

  async function loadCoursesForDepartment(deptId) {
    const resolvedDeptId = Number(deptId || 0);
    if (!resolvedDeptId) return;
    selectedDeptIdForCourses = resolvedDeptId;
    const courseRes = await apiRequest(`courses_list&dept_id=${resolvedDeptId}`);
    renderCourses(courseRes.courses || [], resolvedDeptId);
    if (subjectsList) subjectsList.innerHTML = '<li class="list-group-item px-0 text-muted">Select a course to view subjects.</li>';
    if (subjectsTitle) subjectsTitle.textContent = 'Subjects';
    if (addSubjectBtn) addSubjectBtn.disabled = true;
    selectedCourseIdForSubjects = 0;
    selectedCourseLabelForSubjects = '';
  }

  function renderCourses(courses, deptId) {
    if (!coursesList) return;
    const sortedCourses = (Array.isArray(courses) ? courses.slice() : []).sort((a, b) => {
      const ay = Number(a.year || 0);
      const by = Number(b.year || 0);
      if (ay !== by) return ay - by;
      const as = Number(a.semester || 0);
      const bs = Number(b.semester || 0);
      if (as !== bs) return as - bs;
      const asec = String(a.section || '').localeCompare(String(b.section || ''));
      if (asec !== 0) return asec;
      return String(a.course_name || '').localeCompare(String(b.course_name || ''));
    });
    coursesList.innerHTML = '';
    if (!sortedCourses.length) {
      coursesList.innerHTML = '<li class="list-group-item px-0 text-muted">No courses found for selected department.</li>';
      return;
    }
    sortedCourses.forEach((course) => {
      const li = document.createElement('li');
      li.className = 'list-group-item px-0 d-flex justify-content-between align-items-center';

      const courseName = String(course.course_name || '');
      const courseYear = Number(course.year || 0);
      const courseSemester = Number(course.semester || 0);
      const courseSection = String(course.section || '');
      const courseId = Number(course.id || 0);

      const span = document.createElement('span');
      span.textContent = `${courseName} • Year ${courseYear} • Sem ${courseSemester || '-'}-${courseSection}`;

      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'btn btn-outline-secondary btn-sm';
      viewBtn.setAttribute('data-action', 'view-course-subjects');
      viewBtn.setAttribute('data-course-id', String(courseId));
      viewBtn.setAttribute('data-course-label', `${courseName} • Year ${courseYear} • Sem ${courseSemester || '-'}-${courseSection}`);
      viewBtn.textContent = 'View Subjects';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-outline-primary btn-sm';
      editBtn.setAttribute('data-action', 'edit-course');
      editBtn.setAttribute('data-course-id', String(courseId));
      editBtn.setAttribute('data-dept-id', String(deptId));
      editBtn.setAttribute('data-course-name', courseName);
      editBtn.setAttribute('data-year', String(courseYear));
      editBtn.setAttribute('data-semester', String(courseSemester));
      editBtn.setAttribute('data-section', courseSection);
      editBtn.textContent = 'Edit';

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-outline-danger btn-sm';
      deleteBtn.setAttribute('data-action', 'delete-course');
      deleteBtn.setAttribute('data-course-id', String(courseId));
      deleteBtn.setAttribute('data-dept-id', String(deptId));
      deleteBtn.setAttribute('data-course-name', courseName);
      deleteBtn.textContent = 'Remove';

      const btnDiv = document.createElement('div');
      btnDiv.className = 'd-flex gap-1';
      btnDiv.appendChild(viewBtn);
      btnDiv.appendChild(editBtn);
      btnDiv.appendChild(deleteBtn);

      li.appendChild(span);
      li.appendChild(btnDiv);
      coursesList.appendChild(li);
    });
  }

  async function loadCourseSubjects(courseId, courseLabel) {
    if (!subjectsList) return;
    const cid = Number(courseId || 0);
    if (!cid) return;
    selectedCourseIdForSubjects = cid;
    selectedCourseLabelForSubjects = String(courseLabel || 'Course');
    if (subjectsTitle) subjectsTitle.textContent = `Subjects (${selectedCourseLabelForSubjects})`;
    if (addSubjectBtn) addSubjectBtn.disabled = false;

    const data = await apiRequest(`course_subjects_list&course_id=${cid}`);
    const subjects = data.subjects || [];
    subjectsList.innerHTML = '';
    if (!subjects.length) {
      subjectsList.innerHTML = '<li class="list-group-item px-0 text-muted">No subjects found for this course-year.</li>';
      return;
    }
    subjects.forEach((subject) => {
      const li = document.createElement('li');
      li.className = 'list-group-item px-0 d-flex justify-content-between align-items-center';

      const subjectId = Number(subject.id || 0);
      const subjectName = String(subject.subject_name || '');
      const subjectCode = String(subject.subject_code || '');

      const span = document.createElement('span');
      const nameText = document.createTextNode(subjectName + ' ');
      const codeSpan = document.createElement('span');
      codeSpan.className = 'text-muted';
      codeSpan.textContent = `(${subjectCode})`;
      span.appendChild(nameText);
      span.appendChild(codeSpan);

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-outline-primary btn-sm';
      editBtn.setAttribute('data-action', 'edit-course-subject');
      editBtn.setAttribute('data-subject-id', String(subjectId));
      editBtn.setAttribute('data-subject-name', subjectName);
      editBtn.setAttribute('data-subject-code', subjectCode);
      editBtn.textContent = 'Edit';

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-outline-danger btn-sm';
      deleteBtn.setAttribute('data-action', 'delete-course-subject');
      deleteBtn.setAttribute('data-subject-id', String(subjectId));
      deleteBtn.setAttribute('data-subject-name', subjectName);
      deleteBtn.textContent = 'Remove';

      const btnDiv = document.createElement('div');
      btnDiv.className = 'd-flex gap-1';
      btnDiv.appendChild(editBtn);
      btnDiv.appendChild(deleteBtn);

      li.appendChild(span);
      li.appendChild(btnDiv);
      subjectsList.appendChild(li);
    });
  }

  function normalizeTimeLabel(value) {
    if (!value) return '--:--';
    const text = String(value);
    if (/^\d{2}:\d{2}:\d{2}$/.test(text)) return text.slice(0, 5);
    if (/^\d{2}:\d{2}$/.test(text)) return text;
    const dt = new Date(`1970-01-01T${text}`);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    return text;
  }

  function dayFullName(day) {
    const map = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday' };
    return map[Number(day)] || `Day ${day}`;
  }

  function dayShortName(day) {
    const map = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };
    return map[Number(day)] || `D${day}`;
  }

  function renderFacultyWeeklyTimetable(rows, departmentName) {
    const rowsSafe = Array.isArray(rows) ? rows : [];
    const visibleDays = [1, 2, 3, 4, 5, 6];

    if (timetableLegend) {
      timetableLegend.innerHTML = `
          <span class="badge bg-success-subtle text-success-emphasis me-1">Your class</span>
          <span class="badge bg-danger-subtle text-danger-emphasis me-1 ms-2">Other faculty</span>
          <span class="text-muted ms-2">${departmentName ? `Department: ${departmentName}` : ''}</span>
        `;
    }

    const slotsMap = new Map();
    rowsSafe.forEach((row) => {
      const day = Number(row.day_of_week || 0);
      if (!visibleDays.includes(day)) return;
      const start = normalizeTimeLabel(row.start_time);
      const end = normalizeTimeLabel(row.end_time);
      const key = `${start}-${end}`;
      if (!slotsMap.has(key)) {
        slotsMap.set(key, { start, end, byDay: new Map() });
      }
      const slot = slotsMap.get(key);
      if (!slot.byDay.has(day)) slot.byDay.set(day, []);
      slot.byDay.get(day).push(row);
    });

    const orderedSlots = Array.from(slotsMap.values()).sort((a, b) => a.start.localeCompare(b.start));

    if (timetableGrid) {
      timetableGrid.innerHTML = '';
      if (!orderedSlots.length) {
        timetableGrid.innerHTML = '<tr><td colspan="7" class="text-muted">No timetable rows found for your department.</td></tr>';
      } else {
        orderedSlots.forEach((slot) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td>${slot.start}-${slot.end}</td>`;
          visibleDays.forEach((day) => {
            const items = slot.byDay.get(day) || [];
            const td = document.createElement('td');
            td.className = 'timetable-cell';
            if (!items.length) {
              td.innerHTML = '<span class="text-muted">--</span>';
            } else {
              td.innerHTML = items.map((item) => {
                const mine = Number(item.is_mine || 0) === 1;
                const cls = mine ? 'tt-entry tt-entry-mine' : 'tt-entry tt-entry-other';
                return `
                    <div class="${cls}">
                      <div class="fw-semibold">${item.subject || item.course_name || '-'}</div>
                      <div class="small">${item.course_name || '-'} • Year ${item.year || '-'} • Sem ${item.semester || '-'}-${item.section || '-'}</div>
                      <div class="small">${mine ? 'You' : (item.faculty_name || 'Other faculty')}</div>
                    </div>
                  `;
              }).join('');
            }
            tr.appendChild(td);
          });
          timetableGrid.appendChild(tr);
        });
      }
    }

    if (timetableAccordion) {
      timetableAccordion.innerHTML = '';
      visibleDays.forEach((day) => {
        const dayRows = rowsSafe
          .filter((row) => Number(row.day_of_week) === day)
          .sort((a, b) => normalizeTimeLabel(a.start_time).localeCompare(normalizeTimeLabel(b.start_time)));

        const item = document.createElement('div');
        item.className = 'accordion-item';
        const headingId = `ttDayHead${day}`;
        const collapseId = `ttDayBody${day}`;
        item.innerHTML = `
            <h2 class="accordion-header" id="${headingId}">
              <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
                ${dayFullName(day)}
              </button>
            </h2>
            <div id="${collapseId}" class="accordion-collapse collapse" data-bs-parent="#timetableAccordion">
              <div class="accordion-body p-2"></div>
            </div>
          `;
        const body = item.querySelector('.accordion-body');
        if (!dayRows.length) {
          body.innerHTML = '<div class="text-muted small">No classes.</div>';
        } else {
          body.innerHTML = dayRows.map((row) => {
            const mine = Number(row.is_mine || 0) === 1;
            const badgeCls = mine ? 'bg-success-subtle text-success-emphasis' : 'bg-danger-subtle text-danger-emphasis';
            return `
                <div class="mb-2">
                  <div class="fw-semibold">${normalizeTimeLabel(row.start_time)}-${normalizeTimeLabel(row.end_time)} • ${row.subject || row.course_name || '-'}</div>
                  <div class="small text-muted">${row.course_name || '-'} • Year ${row.year || '-'} • Sem ${row.semester || '-'}-${row.section || '-'} • ${mine ? 'You' : (row.faculty_name || 'Other')}</div>
                  <span class="badge ${badgeCls}">${mine ? 'Your class' : 'Other faculty'}</span>
                </div>
              `;
          }).join('');
        }
        timetableAccordion.appendChild(item);
      });
    }
  }

  async function loadFacultyWeeklyTimetable() {
    if (!timetableGrid && !timetableAccordion) return;
    const data = await apiRequest('faculty_timetable_weekly');
    const rows = data.rows || [];
    const deptName = data.department?.name || '';
    renderFacultyWeeklyTimetable(rows, deptName);
  }

  function renderStudentWeeklyTimetable(rows, classInfo) {
    const rowsSafe = Array.isArray(rows) ? rows : [];
    const visibleDays = [1, 2, 3, 4, 5, 6];

    if (timetableLegend) {
      const dept = classInfo?.department || '-';
      const year = classInfo?.year || '-';
      const section = classInfo?.section || '-';
      timetableLegend.innerHTML = `
          <span class="badge bg-primary-subtle text-primary-emphasis me-1">Your class schedule</span>
          <span class="text-muted ms-2">${dept} • Year ${year} • Sem ${classInfo?.semester || '-'}-${section}</span>
        `;
    }

    const slotsMap = new Map();
    rowsSafe.forEach((row) => {
      const day = Number(row.day_of_week || 0);
      if (!visibleDays.includes(day)) return;
      const start = normalizeTimeLabel(row.start_time);
      const end = normalizeTimeLabel(row.end_time);
      const key = `${start}-${end}`;
      if (!slotsMap.has(key)) {
        slotsMap.set(key, { start, end, byDay: new Map() });
      }
      const slot = slotsMap.get(key);
      if (!slot.byDay.has(day)) slot.byDay.set(day, []);
      slot.byDay.get(day).push(row);
    });

    const orderedSlots = Array.from(slotsMap.values()).sort((a, b) => a.start.localeCompare(b.start));

    if (timetableGrid) {
      timetableGrid.innerHTML = '';
      if (!orderedSlots.length) {
        timetableGrid.innerHTML = '<tr><td colspan="7" class="text-muted">No timetable rows found for your class.</td></tr>';
      } else {
        orderedSlots.forEach((slot) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td>${slot.start}-${slot.end}</td>`;
          visibleDays.forEach((day) => {
            const items = slot.byDay.get(day) || [];
            const td = document.createElement('td');
            td.className = 'timetable-cell';
            if (!items.length) {
              td.innerHTML = '<span class="text-muted">--</span>';
            } else {
              td.innerHTML = items.map((item) => `
                  <div class="tt-entry">
                    <div class="fw-semibold">${item.subject || item.course_name || '-'}</div>
                    <div class="small text-muted">${item.course_name || '-'} • ${item.faculty_name || 'Faculty TBD'}</div>
                  </div>
                `).join('');
            }
            tr.appendChild(td);
          });
          timetableGrid.appendChild(tr);
        });
      }
    }

    if (timetableAccordion) {
      timetableAccordion.innerHTML = '';
      visibleDays.forEach((day) => {
        const dayRows = rowsSafe
          .filter((row) => Number(row.day_of_week) === day)
          .sort((a, b) => normalizeTimeLabel(a.start_time).localeCompare(normalizeTimeLabel(b.start_time)));

        const item = document.createElement('div');
        item.className = 'accordion-item';
        const headingId = `stTtDayHead${day}`;
        const collapseId = `stTtDayBody${day}`;
        item.innerHTML = `
            <h2 class="accordion-header" id="${headingId}">
              <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
                ${dayFullName(day)}
              </button>
            </h2>
            <div id="${collapseId}" class="accordion-collapse collapse" data-bs-parent="#timetableAccordion">
              <div class="accordion-body p-2"></div>
            </div>
          `;
        const body = item.querySelector('.accordion-body');
        if (!dayRows.length) {
          body.innerHTML = '<div class="text-muted small">No classes.</div>';
        } else {
          body.innerHTML = dayRows.map((row) => `
              <div class="mb-2">
                <div class="fw-semibold">${normalizeTimeLabel(row.start_time)}-${normalizeTimeLabel(row.end_time)} • ${row.subject || row.course_name || '-'}</div>
                <div class="small text-muted">${row.course_name || '-'} • ${row.faculty_name || 'Faculty TBD'}</div>
              </div>
            `).join('');
        }
        timetableAccordion.appendChild(item);
      });
    }
  }

  async function loadStudentWeeklyTimetable() {
    if (!timetableGrid && !timetableAccordion) return;
    const data = await apiRequest('student_timetable_weekly');
    renderStudentWeeklyTimetable(data.rows || [], data.class || null);
  }

  async function ensureFaceModelsLoaded() {
    if (!window.faceapi) {
      throw new Error('Face model library not loaded');
    }
    if (faceModelsReady) {
      return;
    }

    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL)
    ]);
    faceModelsReady = true;
  }

  async function ensureSsdFaceModelLoaded() {
    if (!window.faceapi) {
      throw new Error('Face model library not loaded');
    }
    if (faceSsdReady) return;
    // Load base models first (landmarks + recognition are needed for descriptors).
    await ensureFaceModelsLoaded();
    await faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_MODEL_URL);
    faceSsdReady = true;
  }

  function averagePoint(points) {
    if (!Array.isArray(points) || !points.length) {
      return { x: 0, y: 0 };
    }
    let sx = 0;
    let sy = 0;
    points.forEach((p) => {
      sx += Number(p.x || 0);
      sy += Number(p.y || 0);
    });
    return { x: sx / points.length, y: sy / points.length };
  }

  function classifyFacePose(landmarks) {
    if (!landmarks) return 'front';
    const leftEye = averagePoint(landmarks.getLeftEye ? landmarks.getLeftEye() : []);
    const rightEye = averagePoint(landmarks.getRightEye ? landmarks.getRightEye() : []);
    const nose = averagePoint(landmarks.getNose ? landmarks.getNose() : []);
    const mouth = averagePoint(landmarks.getMouth ? landmarks.getMouth() : []);

    const eyeCenterX = (leftEye.x + rightEye.x) / 2;
    const eyeCenterY = (leftEye.y + rightEye.y) / 2;
    const eyeDistance = Math.max(1, Math.abs(rightEye.x - leftEye.x));
    const faceHeight = Math.max(1, Math.abs(mouth.y - eyeCenterY));

    const yaw = (nose.x - eyeCenterX) / eyeDistance;
    const pitch = (nose.y - eyeCenterY) / faceHeight;

    if (pitch > 0.7) return 'down';
    if (pitch < 0.43) return 'up';
    if (yaw > 0.12) return 'left';
    if (yaw < -0.12) return 'right';
    return 'front';
  }

  let frameQualityCanvas = null;
  let frameQualityCtx = null;

  function computeFrameQuality(videoElement, sampleSize = 160) {
    const sourceWidth = Math.max(1, Number(videoElement.videoWidth || 0));
    const sourceHeight = Math.max(1, Number(videoElement.videoHeight || 0));
    const scale = Math.min(1, sampleSize / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    if (!frameQualityCanvas) {
      frameQualityCanvas = document.createElement('canvas');
    }
    if (frameQualityCanvas.width !== width) frameQualityCanvas.width = width;
    if (frameQualityCanvas.height !== height) frameQualityCanvas.height = height;
    if (!frameQualityCtx) {
      frameQualityCtx = frameQualityCanvas.getContext('2d', { willReadFrequently: true });
    }
    const ctx = frameQualityCtx;
    if (!ctx) {
      return { brightness: 0, sharpness: 0 };
    }
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(videoElement, 0, 0, width, height);
    const frame = ctx.getImageData(0, 0, width, height).data;

    let brightnessSum = 0;
    let sharpnessSum = 0;
    let sharpnessCount = 0;
    const lum = new Float32Array(width * height);
    for (let i = 0, p = 0; i < frame.length; i += 4, p += 1) {
      const y = (0.2126 * frame[i]) + (0.7152 * frame[i + 1]) + (0.0722 * frame[i + 2]);
      lum[p] = y;
      brightnessSum += y;
    }
    for (let y = 0; y < height - 1; y += 1) {
      for (let x = 0; x < width - 1; x += 1) {
        const idx = y * width + x;
        const gx = Math.abs(lum[idx] - lum[idx + 1]);
        const gy = Math.abs(lum[idx] - lum[idx + width]);
        sharpnessSum += (gx + gy) * 0.5;
        sharpnessCount += 1;
      }
    }
    return {
      brightness: brightnessSum / (width * height),
      sharpness: sharpnessCount ? (sharpnessSum / sharpnessCount) : 0
    };
  }

  function averageEmbeddings(embeddings) {
    if (!embeddings.length) return [];
    const dim = embeddings[0].length;
    const avg = new Array(dim).fill(0);
    embeddings.forEach((vec) => {
      for (let i = 0; i < dim; i += 1) {
        avg[i] += Number(vec[i] || 0);
      }
    });
    for (let i = 0; i < dim; i += 1) {
      avg[i] /= embeddings.length;
    }
    return avg;
  }

  async function detectFaceData(videoElement, options = {}) {
    await ensureFaceModelsLoaded();
    if (!videoElement) {
      throw new Error('Camera stream not available');
    }

    const detector = String(options.detector || 'tiny').toLowerCase();
    const inputSize = Number(options.inputSize || 224);
    const scoreThreshold = Number(options.scoreThreshold || 0.25);
    const ssdMinConfidence = Number(options.ssdMinConfidence || 0.4);
    const qualitySampleSize = Number(options.qualitySampleSize || 160);
    let detection;
    if (detector === 'ssd') {
      await ensureSsdFaceModelLoaded();
      detection = await faceapi
        .detectSingleFace(videoElement, new faceapi.SsdMobilenetv1Options({ minConfidence: ssdMinConfidence }))
        .withFaceLandmarks()
        .withFaceDescriptor();
    } else {
      detection = await faceapi
        .detectSingleFace(
          videoElement,
          new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold })
        )
        .withFaceLandmarks()
        .withFaceDescriptor();
    }

    if (!detection || !detection.descriptor) {
      throw new Error('No clear face detected. Look at camera and try again.');
    }

    const quality = computeFrameQuality(videoElement, qualitySampleSize);

    // Extract face structure features for structural matching
    const faceStructure = extractFaceStructure(detection.landmarks);

    return {
      descriptor: Array.from(detection.descriptor),
      confidence: Number(detection.detection?.score || 0),
      pose: classifyFacePose(detection.landmarks),
      brightness: quality.brightness,
      sharpness: quality.sharpness,
      faceStructure: faceStructure, // Face landmarks for structural comparison
      detection: detection // Store full detection for advanced analysis
    };
  }

  // Extract key facial structure features for face structure matching
  function extractFaceStructure(landmarks) {
    if (!landmarks || !landmarks.positions) {
      return null;
    }

    const pts = landmarks.positions;

    // Key facial points for structure comparison
    return {
      // Eye distances and angles
      leftEyePos: pts[36] ? { x: pts[36].x, y: pts[36].y } : null,
      rightEyePos: pts[45] ? { x: pts[45].x, y: pts[45].y } : null,
      eyeDistance: pts[36] && pts[45] ? Math.hypot(pts[45].x - pts[36].x, pts[45].y - pts[36].y) : 0,

      // Nose to eyes ratio
      nosePos: pts[30] ? { x: pts[30].x, y: pts[30].y } : null,

      // Mouth width
      mouthLeft: pts[48] ? { x: pts[48].x, y: pts[48].y } : null,
      mouthRight: pts[54] ? { x: pts[54].x, y: pts[54].y } : null,
      mouthWidth: pts[48] && pts[54] ? Math.hypot(pts[54].x - pts[48].x, pts[54].y - pts[48].y) : 0,

      // Face width (cheekbone distance)
      faceLeft: pts[0] ? { x: pts[0].x, y: pts[0].y } : null,
      faceRight: pts[16] ? { x: pts[16].x, y: pts[16].y } : null,
      faceWidth: pts[0] && pts[16] ? Math.hypot(pts[16].x - pts[0].x, pts[16].y - pts[0].y) : 0,

      // Face height
      faceTop: pts[27] ? { x: pts[27].x, y: pts[27].y } : null,
      faceBottom: pts[8] ? { x: pts[8].x, y: pts[8].y } : null,
      faceHeight: pts[27] && pts[8] ? Math.hypot(pts[8].x - pts[27].x, pts[8].y - pts[27].y) : 0,

      // Chin position
      chinPos: pts[8] ? { x: pts[8].x, y: pts[8].y } : null
    };
  }

  // Compare face structures for better accuracy
  function compareFaceStructures(struct1, struct2) {
    if (!struct1 || !struct2) return 0;

    const measurements = [
      { v1: struct1.eyeDistance, v2: struct2.eyeDistance },
      { v1: struct1.mouthWidth, v2: struct2.mouthWidth },
      { v1: struct1.faceWidth, v2: struct2.faceWidth },
      { v1: struct1.faceHeight, v2: struct2.faceHeight }
    ];

    let totalSimilarity = 0;
    let validMeasurements = 0;

    for (const m of measurements) {
      if (m.v1 > 0 && m.v2 > 0) {
        // Calculate ratio-based similarity (0-1)
        const ratio = Math.min(m.v1, m.v2) / Math.max(m.v1, m.v2);
        totalSimilarity += ratio;
        validMeasurements += 1;
      }
    }

    return validMeasurements ? (totalSimilarity / validMeasurements) : 0;
  }

  async function detectFaceDescriptor(videoElement, options = {}) {
    const data = await detectFaceData(videoElement, options);
    return data;
  }

  async function detectStableFaceDescriptor(videoElement, requiredSamples = 3, options = {}) {
    const samples = [];
    const faceStructures = [];
    const maxAttempts = Math.max(4, requiredSamples * 3);
    const sampleDelayMs = Math.max(60, Number(options.sampleDelayMs || 150));
    const minConfidence = Number(options.minConfidence || 0.55);
    const minBrightness = Number(options.minBrightness || 35);
    const maxBrightness = Number(options.maxBrightness || 240);
    const minSharpness = Number(options.minSharpness || 7);
    const allowLowQualityFallback = options.allowLowQualityFallback === true;
    let attempts = 0;
    let lastError = '';
    let bestAny = null;

    while (samples.length < requiredSamples && attempts < maxAttempts) {
      attempts += 1;
      try {
        const faceData = await detectFaceDescriptor(videoElement, options);
        if (!bestAny || faceData.confidence > bestAny.confidence) {
          bestAny = faceData;
        }
        // Quality gate for attendance verification to improve accuracy
        if (faceData.confidence < minConfidence) {
          throw new Error('Face not clear enough. Center your face and try again.');
        }
        if (faceData.brightness < minBrightness || faceData.brightness > maxBrightness) {
          throw new Error('Lighting is not good. Use bright, even light and try again.');
        }
        if (faceData.sharpness < minSharpness) {
          throw new Error('Image is blurry. Hold still and try again.');
        }
        samples.push(faceData.descriptor);
        if (faceData.faceStructure) {
          faceStructures.push(faceData.faceStructure);
        }
      } catch (err) {
        // Ignore noisy frame and retry.
        lastError = err?.message || lastError;
      }
      if (samples.length < requiredSamples) {
        await new Promise((resolve) => setTimeout(resolve, sampleDelayMs));
      }
    }

    if (!samples.length) {
      if (allowLowQualityFallback && bestAny && bestAny.descriptor && bestAny.descriptor.length) {
        // Proceed with best-effort descriptor. Backend thresholds + OTP + liveness still apply.
        return bestAny.descriptor;
      }
      throw new Error(lastError || 'No clear face detected. Look at camera and try again.');
    }

    // Store face structure for verification
    window.currentFaceStructure = faceStructures.length > 0 ? faceStructures[0] : null;

    return samples.length === 1 ? samples[0] : averageEmbeddings(samples);
  }

  window.detectStableFaceDescriptor = detectStableFaceDescriptor;

  function calculateMatchScore(registeredVector, currentVector) {
    // Embedding-based distance score
    const distance = faceapi.euclideanDistance(registeredVector, currentVector);
    // Logistic mapping gives a more realistic score spread for face-api distances.
    const embeddingScore = 100 / (1 + Math.exp((distance - 0.55) / 0.09));

    // Face structure matching score (if available)
    let structureScore = 50; // Default to neutral if structure not available
    if (window.registeredFaceStructure && window.currentFaceStructure) {
      const structureSimilarity = compareFaceStructures(window.registeredFaceStructure, window.currentFaceStructure);
      // Convert 0-1 similarity to 0-100 score, with boost for good matches
      structureScore = Math.round(structureSimilarity * 100);
    }

    // Combine scores: 70% from embedding, 30% from structure
    const combinedScore = (embeddingScore * 0.7) + (structureScore * 0.3);

    return Math.max(0, Math.min(100, Math.round(combinedScore)));
  }

  function showToast(message, variant = 'primary') {
    if (!toastEl) return;
    toastEl.className = `toast align-items-center text-bg-${variant} border-0`;
    toastMessageEl.textContent = message;
    appToast.show();
  }

  // Make showToast globally accessible for modules
  window.showToast = showToast;

  // ---- College Welcome Popup (shown on fresh login) ----
  let cwpDismissTimer = null;
  let cwpAnimFrame = null;

  function showCollegeWelcomePopup(collegeName, userName) {
    const popup = document.getElementById('college-welcome-popup');
    const collegeText = document.getElementById('cwp-college-text');
    const userText = document.getElementById('cwp-user-text');
    const progressBar = document.getElementById('cwp-progress-bar');
    const closeBtn = document.getElementById('cwp-close-btn');
    if (!popup || !collegeText || !progressBar) return;

    // Clean up any previous popup
    dismissCollegeWelcomePopup(true);

    // Populate content
    collegeText.textContent = collegeName || 'Your College';
    if (userText) {
      userText.textContent = userName ? `Welcome, ${userName}` : '';
    }

    // Reset progress bar
    progressBar.style.transition = 'none';
    progressBar.style.width = '100%';

    // Show popup with slight delay for DOM paint
    requestAnimationFrame(() => {
      popup.classList.remove('cwp-dismissing');
      popup.classList.add('cwp-visible');

      // Start progress bar animation (4 seconds)
      const DURATION_MS = 7000;
      requestAnimationFrame(() => {
        progressBar.style.transition = `width ${DURATION_MS}ms linear`;
        progressBar.style.width = '0%';
      });

      // Auto-dismiss after duration
      cwpDismissTimer = setTimeout(() => {
        dismissCollegeWelcomePopup();
      }, DURATION_MS);
    });

    // Manual close
    if (closeBtn) {
      closeBtn.onclick = () => dismissCollegeWelcomePopup();
    }
  }

  function dismissCollegeWelcomePopup(instant) {
    const popup = document.getElementById('college-welcome-popup');
    if (!popup) return;

    if (cwpDismissTimer) {
      clearTimeout(cwpDismissTimer);
      cwpDismissTimer = null;
    }

    if (instant) {
      popup.classList.remove('cwp-visible', 'cwp-dismissing');
      return;
    }

    // Slide-out animation
    popup.classList.add('cwp-dismissing');
    // After animation ends, fully remove
    setTimeout(() => {
      popup.classList.remove('cwp-visible', 'cwp-dismissing');
    }, 400);
  }

  function isMobileViewport() {
    return window.matchMedia('(max-width: 767.98px)').matches;
  }

  function updateAppHeaderOffset() {
    if (!appHeader) return;
    const measuredHeight = Math.ceil(appHeader.getBoundingClientRect().height || 0);
    const minimumHeight = isMobileViewport() ? 54 : 58;
    // Desktop must keep a stable header height to avoid layout "jumping" when
    // dynamic content (college name, images) changes or wraps.
    // Mobile can grow based on content so the full college name can be shown.
    const nextOffset = isMobileViewport()
      ? Math.max(measuredHeight, minimumHeight)
      : minimumHeight;
    document.documentElement.style.setProperty('--app-header-offset', `${nextOffset}px`);
  }

  function scheduleAppHeaderOffsetSync() {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(updateAppHeaderOffset);
    });
  }

  function syncSidebarBackdropState() {
    if (!sidebar || !sidebarBackdrop) return;
    const isSidebarOpen = isMobileViewport() && sidebar.classList.contains('show');
    document.body.classList.toggle('sidebar-open-mobile', isSidebarOpen);
    sidebarBackdrop.setAttribute('aria-hidden', isSidebarOpen ? 'false' : 'true');
  }

  function isStandaloneAppMode() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function isIosDevice() {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function wasInstallPromptDismissedRecently() {
    try {
      const raw = localStorage.getItem(INSTALL_PROMPT_DISMISS_KEY);
      if (!raw) return false;
      const ts = Number(raw);
      if (!Number.isFinite(ts)) return false;
      return (Date.now() - ts) < INSTALL_PROMPT_COOLDOWN_MS;
    } catch (_) {
      return false;
    }
  }

  function rememberInstallPromptDismissal() {
    try {
      localStorage.setItem(INSTALL_PROMPT_DISMISS_KEY, String(Date.now()));
    } catch (_) {
      // Ignore storage errors.
    }
  }

  function clearInstallPromptDismissal() {
    try {
      localStorage.removeItem(INSTALL_PROMPT_DISMISS_KEY);
    } catch (_) {
      // Ignore storage errors.
    }
  }

  function hideInstallPrompt(rememberDismiss = false) {
    if (rememberDismiss) {
      rememberInstallPromptDismissal();
    }
    if (!installPromptEl) return;
    installPromptEl.classList.add('d-none');
    installPromptEl.setAttribute('aria-hidden', 'true');
  }

  function showInstallPrompt(mode = 'native') {
    if (!installPromptEl) return;
    if (isStandaloneAppMode() || wasInstallPromptDismissedRecently()) return;

    const isIosManualMode = mode === 'ios';
    if (installSubtextEl) {
      installSubtextEl.textContent = isIosManualMode
        ? 'iPhone/iPad par app install karke direct home screen se open karein.'
        : 'Home screen par add karke faster open karein aur app-like experience paayen.';
    }
    if (installIosHelpEl) {
      installIosHelpEl.classList.toggle('d-none', !isIosManualMode);
    }
    if (installNowBtn) {
      if (isIosManualMode) {
        installNowBtn.classList.add('d-none');
      } else {
        installNowBtn.classList.remove('d-none');
        installNowBtn.disabled = false;
      }
    }

    installPromptEl.classList.remove('d-none');
    installPromptEl.setAttribute('aria-hidden', 'false');
  }

  function setNotificationCount(count) {
    const n = Math.max(0, Number(count || 0));
    if (!notificationBtn || !notificationCountEl) return;
    notificationCountEl.textContent = String(n);
    notificationCountEl.classList.toggle('d-none', n <= 0);
    notificationBtn.classList.toggle('d-none', n <= 0);
  }

  function setTheme(mode) {
    const html = document.documentElement;
    html.setAttribute('data-theme', mode);
    if (themeToggleBtn) {
      const icon = themeToggleBtn.querySelector('i');
      if (icon) {
        if (mode === 'dark') {
          icon.classList.remove('bi-moon');
          icon.classList.add('bi-sun');
        } else {
          icon.classList.remove('bi-sun');
          icon.classList.add('bi-moon');
        }
      }
    }
    localStorage.setItem('ams-theme', mode);
  }

  // Initialize theme from storage
  (function initTheme() {
    const saved = localStorage.getItem('ams-theme') || 'light';
    setTheme(saved);
  })();

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const html = document.documentElement;
      const current = html.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      setTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  // Hide notifications button until there are actual unread notifications.
  setNotificationCount(0);
  if (notificationBtn) {
    notificationBtn.addEventListener('click', () => {
      if (!maintenanceMessage) {
        showToast('No new notifications', 'secondary');
        return;
      }
      showToast(`Maintenance Notice: ${maintenanceMessage}`, 'warning');
    });
  }

  if (sidebar && sidebarBackdrop) {
    sidebar.addEventListener('shown.bs.collapse', syncSidebarBackdropState);
    sidebar.addEventListener('hidden.bs.collapse', syncSidebarBackdropState);
    window.addEventListener('resize', syncSidebarBackdropState);
    sidebarBackdrop.addEventListener('click', () => {
      const bsCollapse = bootstrap.Collapse.getOrCreateInstance(sidebar);
      bsCollapse.hide();
    });
    syncSidebarBackdropState();
  }

  window.addEventListener('resize', scheduleAppHeaderOffsetSync);
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => scheduleAppHeaderOffsetSync()).catch(() => null);
  }
  scheduleAppHeaderOffsetSync();

  if (installLaterBtn) {
    installLaterBtn.addEventListener('click', () => hideInstallPrompt(true));
  }
  if (installCloseBtn) {
    installCloseBtn.addEventListener('click', () => hideInstallPrompt(true));
  }
  if (installNowBtn) {
    installNowBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) {
        hideInstallPrompt(true);
        return;
      }
      installNowBtn.disabled = true;
      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      try {
        promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (!choice || choice.outcome !== 'accepted') {
          rememberInstallPromptDismissal();
        } else {
          clearInstallPromptDismissal();
        }
      } catch (_) {
        rememberInstallPromptDismissal();
      } finally {
        hideInstallPrompt(false);
        installNowBtn.disabled = false;
      }
    });
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    showInstallPrompt('native');
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    clearInstallPromptDismissal();
    hideInstallPrompt(false);
    showToast('AttendSmart app installed successfully', 'success');
  });

  if (isIosDevice() && !isStandaloneAppMode() && !wasInstallPromptDismissedRecently()) {
    window.setTimeout(() => {
      showInstallPrompt('ios');
    }, 1200);
  }

  // Toggle password visibility
  togglePasswordBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    const icon = togglePasswordBtn.querySelector('i');
    icon.classList.toggle('bi-eye');
    icon.classList.toggle('bi-eye-slash');
  });



  // Real login via backend API
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const userId = document.getElementById('userId').value.trim();
    const pwd = passwordInput.value.trim();

    if (!userId || !pwd) {
      if (loginError) {
        loginError.textContent = 'User ID and password are required.';
      }
      loginLoading.classList.add('d-none');
      loginError.classList.remove('d-none');
      return;
    }

    // Show loading spinner
    loginLoading.classList.remove('d-none');
    loginError.classList.add('d-none');

    apiRequest('login', 'POST', { userId, password: pwd })
      .then((data) => {
        loginLoading.classList.add('d-none');
        if (!data.user) {
          // Login succeeded on server but session cookie was not returned
          // (can happen in PWA standalone if SameSite/Secure mismatch)
          if (loginError) {
            loginError.textContent = 'Session could not be created. Please ensure the app is served over HTTPS.';
          }
          loginError.classList.remove('d-none');
          return;
        }
        applyAuthenticatedState(data.user, 'Logged in successfully');
      })
      .catch((err) => {
        loginLoading.classList.add('d-none');
        if (loginError) {
          loginError.textContent = err?.message || 'Login failed. Please try again.';
        }
        loginError.classList.remove('d-none');
      });
  });

  function setupUserContext() {
    if (!currentUser) {
      console.error('setupUserContext called but currentUser is null');
      return;
    }

    const avatarSrc = currentUser.profile_photo_url || DEFAULT_AVATAR;
    if (headerAvatarEl) {
      headerAvatarEl.src = avatarSrc;
    }
    if (profileAvatarEl) {
      profileAvatarEl.src = avatarSrc;
    }
    if (collegeLogoEl) {
      collegeLogoEl.src = currentUser.college_logo_url || DEFAULT_COLLEGE_LOGO;
    }

    // Header user info
    const userNameEl = document.getElementById('user-name');
    if (userNameEl) userNameEl.textContent = currentUser.name;

    const userIdLabelEl = document.getElementById('user-id-label');
    if (userIdLabelEl) userIdLabelEl.textContent = currentUser.id;

    const collegeNameEl = document.getElementById('college-name');
    if (collegeNameEl) {
      const collegeText = currentUser.college || '';
      collegeNameEl.textContent = collegeText;
      collegeNameEl.title = collegeText;
      // Adjust font size based on length for mobile
      const length = collegeText.length;
      if (window.innerWidth < 768) {
        if (length > 25) {
          collegeNameEl.style.fontSize = '0.65rem';
        } else if (length > 15) {
          collegeNameEl.style.fontSize = '0.75rem';
        } else {
          collegeNameEl.style.fontSize = '0.85rem';
        }
      } else {
        collegeNameEl.style.fontSize = '0.85rem';
      }
    }

    const roleLabelMap = {
      'student': 'Student',
      'faculty': 'Faculty',
      'college_admin': 'College Admin',
      'super_admin': 'Super Admin'
    };
    const badge = document.getElementById('user-role-badge');
    if (badge) badge.textContent = roleLabelMap[currentUser.role] || currentUser.role;

    // Profile defaults
    const profileNameEl = document.getElementById('profile-name');
    if (profileNameEl) profileNameEl.textContent = currentUser.name;

    const profileNameInput = document.getElementById('profile-name-input');
    if (profileNameInput) {
      profileNameInput.value = currentUser.name;
      if (currentRole === 'student') {
        profileNameInput.setAttribute('disabled', 'disabled');
        profileNameInput.setAttribute('title', 'Students cannot change name');
      } else {
        profileNameInput.removeAttribute('disabled');
        profileNameInput.removeAttribute('title');
      }
    }

    const profileIdInput = document.getElementById('profile-id-input');
    if (profileIdInput) profileIdInput.value = currentUser.id;

    const profileEmailInput = document.getElementById('profile-email-input');
    if (profileEmailInput) profileEmailInput.value = currentUser.email || '';

    const profileCollegeEl = document.getElementById('profile-college');
    if (profileCollegeEl) profileCollegeEl.textContent = currentUser.college;

    const profileCollegeInput = document.getElementById('profile-college-input');
    if (profileCollegeInput) profileCollegeInput.value = currentUser.college;

    const profileRoleBadge = document.getElementById('profile-role-badge');
    if (profileRoleBadge) profileRoleBadge.textContent = roleLabelMap[currentUser.role] || currentUser.role;

    const lastLoginEl = document.getElementById('profile-last-login');
    if (lastLoginEl) {
      lastLoginEl.textContent = currentUser.last_login || '-';
    }
    if (profilePhotoBtn) {
      profilePhotoBtn.classList.toggle('d-none', currentRole !== 'student');
    }

    if (createNoticeBtn) {
      createNoticeBtn.classList.toggle('d-none', currentRole !== 'college_admin');
    }
    if (noticesAdminFiltersEl) {
      noticesAdminFiltersEl.classList.toggle('d-none', currentRole !== 'college_admin');
    }

    filterSidebarByRole();
    applySidebarOrderByRole();
    filterSectionsByRole();
    hydrateSpaNavLinks(currentRole);
    scheduleAppHeaderOffsetSync();
  }

  function filterSidebarByRole() {
    if (!sidebar) return;
    const links = sidebar.querySelectorAll('.nav-link[data-roles]');
    links.forEach(link => {
      const roles = link.getAttribute('data-roles').split(',');
      if (roles.includes(currentRole)) {
        link.classList.remove('d-none');
      } else {
        link.classList.add('d-none');
      }
    });
  }

  function applySidebarOrderByRole() {
    if (!sidebar) return;
    const navItems = sidebar.querySelectorAll('.nav-item');
    navItems.forEach((item) => {
      item.style.order = '';
    });

    const profileItem = sidebar.querySelector('.sidebar-profile-link');
    if (profileItem) {
      profileItem.style.order = '999';
    }

    if (currentRole === 'student') {
      const preferredOrder = [
        'mark-attendance',
        'timetable',
        'student-attendance-history',
        'dashboard'
      ];

      preferredOrder.forEach((navKey, idx) => {
        const link = sidebar.querySelector(`.nav-link[data-nav="${navKey}"]`);
        const item = link ? link.closest('.nav-item') : null;
        if (item) {
          item.style.order = String(idx + 1);
        }
      });
    }
  }

  function filterSectionsByRole() {
    pageSections.forEach(sec => {
      const secRoles = sec.getAttribute('data-roles');
      if (!secRoles) return;
      const roles = secRoles.split(',');
      if (roles.includes(currentRole)) {
        // keep available, actual visibility is via navigateTo
      }
    });
  }

  function navigateTo(pageKey, options = {}) {
    const { syncHistory = true, replaceHistory = false } = options;
    const resolvedPageKey = resolveRouteForRole(pageKey, currentRole) || normalizeRouteKey(pageKey) || 'dashboard';
    currentPage = resolvedPageKey;

    const revealSection = (section) => {
      if (!section) return;
      section.classList.remove('d-none', 'page-hidden');
      section.classList.add('page-visible');
    };

    // Update sidebar active state
    navLinks.forEach(link => {
      const linkRoute = getResolvedNavKey(link.dataset.nav, currentRole);
      const allowedRoles = (link.getAttribute('data-roles') || '').split(',');
      if (linkRoute === resolvedPageKey && !link.classList.contains('d-none') && allowedRoles.includes(currentRole)) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // Show relevant section
    pageSections.forEach(sec => {
      sec.classList.add('d-none', 'page-hidden');
      sec.classList.remove('page-visible');
    });

    // Dashboard is role-specific
    if (resolvedPageKey === 'dashboard') {
      if (currentRole === 'student') {
        const studentDash = document.getElementById('student-dashboard');
        revealSection(studentDash);
        loadStudentDashboard().catch((err) => showToast(err.message || 'Failed to load student dashboard', 'danger'));
      } else if (currentRole === 'faculty') {
        const facultyDash = document.getElementById('faculty-dashboard');
        revealSection(facultyDash);
        bootstrapFacultyData();
      } else if (currentRole === 'college_admin') {
        const collegeAdminDash = document.getElementById('college_admin-dashboard');
        revealSection(collegeAdminDash);
        loadCollegeAdminDashboard().catch((err) => showToast(err.message || 'Failed to load college dashboard', 'danger'));
      } else if (currentRole === 'super_admin') {
        const superAdminDash = document.getElementById('super_admin-dashboard');
        revealSection(superAdminDash);
        loadSuperAdminDashboard().catch((err) => showToast(err.message || 'Failed to load super admin dashboard', 'danger'));
      }
      if (breadcrumbCurrent) breadcrumbCurrent.textContent = 'Dashboard';
      if (syncHistory) {
        syncUrlForRoute('dashboard', { replaceHistory });
      }
      setDocumentTitle('dashboard');
      if (mainContent) {
        mainContent.scrollTo({ top: 0, behavior: 'auto' });
      }
      return;
    }

    const sectionId = ROUTE_SECTION_MAP[resolvedPageKey];
    if (!sectionId) {
      if (currentRole && resolvedPageKey !== 'dashboard') {
        showToast('This page is not available for your role', 'warning');
        navigateTo(getDefaultRouteForRole(), { syncHistory: true, replaceHistory: true });
        return;
      }
      revealSection(document.getElementById('unauthorized-page'));
      if (breadcrumbCurrent) breadcrumbCurrent.textContent = 'Unauthorized';
      setDocumentTitle('unauthorized');
      return;
    }

    const section = document.getElementById(sectionId);
    if (!section) return;

    const roles = (section.getAttribute('data-roles') || '').split(',');
    if (roles.length && !roles.includes(currentRole)) {
      if (resolvedPageKey !== 'dashboard') {
        showToast('You are not allowed to access this page', 'warning');
        navigateTo(getDefaultRouteForRole(), { syncHistory: true, replaceHistory: true });
        return;
      }
      revealSection(document.getElementById('unauthorized-page'));
      if (breadcrumbCurrent) breadcrumbCurrent.textContent = 'Unauthorized';
      setDocumentTitle('unauthorized');
      return;
    }

    revealSection(section);
    if (breadcrumbCurrent) breadcrumbCurrent.textContent = sectionTitleFromKey(resolvedPageKey);
    if (syncHistory) {
      syncUrlForRoute(resolvedPageKey, { replaceHistory });
    }
    setDocumentTitle(resolvedPageKey);
    if (mainContent) {
      mainContent.scrollTo({ top: 0, behavior: 'auto' });
    }

    if (resolvedPageKey === 'profile') {
      loadProfileDetails().catch((err) => showToast(err.message || 'Failed to load profile', 'danger'));
    }

    if ((resolvedPageKey === 'attendance-history' || resolvedPageKey === 'student-attendance-history') && currentRole === 'student') {
      loadAttendanceHistory();
    }
    if (resolvedPageKey === 'attendance-history' && currentRole === 'faculty') {
      applyRangeDefaults(filterRangeEl, filterFromEl, filterToEl);
      loadFacultyAttendanceHistoryView().catch((err) => showToast(err.message || 'Failed to load attendance history', 'danger'));
    }
    if (currentRole === 'faculty' && (resolvedPageKey === 'dashboard' || resolvedPageKey === 'my-classes' || resolvedPageKey === 'start-attendance' || resolvedPageKey === 'generate-otp')) {
      bootstrapFacultyData();
    }
    if (currentRole === 'faculty' && resolvedPageKey === 'dept-students') {
      loadFacultyDepartmentStudents().catch((err) => showToast(err.message || 'Failed to load students', 'danger'));
    }
    if (currentRole === 'super_admin' && resolvedPageKey === 'users-overview') {
      loadSuperAdminUsers().catch((err) => showToast(err.message || 'Failed to load users', 'danger'));
    }
    if (currentRole === 'super_admin' && resolvedPageKey === 'colleges-mgmt') {
      loadCollegesManagement().catch((err) => showToast(err.message || 'Failed to load colleges', 'danger'));
    }
    if (currentRole === 'super_admin' && resolvedPageKey === 'sa-departments') {
      loadSuperAdminDepartments().catch((err) => showToast(err.message || 'Failed to load departments', 'danger'));
    }
    if (currentRole === 'super_admin' && resolvedPageKey === 'sa-students') {
      loadSuperAdminStudents().catch((err) => showToast(err.message || 'Failed to load students', 'danger'));
    }
    if (currentRole === 'super_admin' && resolvedPageKey === 'sa-faculty') {
      loadSuperAdminFaculty().catch((err) => showToast(err.message || 'Failed to load faculty', 'danger'));
    }
    if (currentRole === 'super_admin' && resolvedPageKey === 'settings') {
      loadPlatformSettings().catch((err) => showToast(err.message || 'Failed to load settings', 'danger'));
    }
    if (currentRole === 'super_admin' && resolvedPageKey === 'audit-logs') {
      loadAuditLogs().catch((err) => showToast(err.message || 'Failed to load audit logs', 'danger'));
    }
    if (currentRole === 'college_admin' && resolvedPageKey === 'students-mgmt') {
      loadCollegeAdminStudents().catch((err) => showToast(err.message || 'Failed to load students', 'danger'));
    }
    if (currentRole === 'college_admin' && resolvedPageKey === 'faculty-mgmt') {
      loadCollegeAdminFaculty().catch((err) => showToast(err.message || 'Failed to load faculty', 'danger'));
    }
    if (currentRole === 'college_admin' && resolvedPageKey === 'college-archive') {
      loadCollegeArchive().catch((err) => showToast(err.message || 'Failed to load archive', 'danger'));
    }
    if (currentRole === 'college_admin' && resolvedPageKey === 'college-settings') {
      loadCollegeSettings().catch((err) => showToast(err.message || 'Failed to load college settings', 'danger'));
    }
    if ((currentRole === 'college_admin' || currentRole === 'faculty' || currentRole === 'student') && resolvedPageKey === 'notices') {
      loadCollegeNotices().catch((err) => showToast(err.message || 'Failed to load notices', 'danger'));
    }
    if (currentRole === 'college_admin' && resolvedPageKey === 'timetable-mgmt') {
      loadTimetableManagement().catch((err) => showToast(err.message || 'Failed to load timetable', 'danger'));
    }
    if (currentRole === 'college_admin' && resolvedPageKey === 'attendance-reports') {
      applyRangeDefaults(adminFilterRangeEl, adminFilterFromEl, adminFilterToEl);
      loadAdminCriteriaFilters()
        .then(() => loadCollegeAdminAttendanceReports())
        .catch((err) => showToast(err.message || 'Failed to load attendance reports', 'danger'));
    }
    if (currentRole === 'college_admin' && resolvedPageKey === 'departments-courses') {
      loadDepartmentsAndCourses().catch((err) => showToast(err.message || 'Failed to load departments/courses', 'danger'));
    }
    if (currentRole === 'faculty' && resolvedPageKey === 'timetable') {
      loadFacultyWeeklyTimetable().catch((err) => showToast(err.message || 'Failed to load weekly timetable', 'danger'));
    }
    if (currentRole === 'student' && resolvedPageKey === 'timetable') {
      loadStudentWeeklyTimetable().catch((err) => showToast(err.message || 'Failed to load weekly timetable', 'danger'));
    }
    if (currentRole === 'student' && resolvedPageKey === 'face-registration') {
      resolveStudentFaceRegistrationStatus().catch(() => null);
    }
  }

  // Make navigateTo globally accessible for modules
  window.navigateTo = navigateTo;

  function sectionTitleFromKey(key) {
    return ROUTE_TITLE_MAP[normalizeRouteKey(key)] || 'Page';
  }

  hydrateSpaNavLinks();
  pendingRouteAfterLogin = readRouteFromLocation();
  setDocumentTitle(LOGIN_ROUTE_KEY);
  window.addEventListener('hashchange', scheduleRouteSyncFromLocation);
  window.addEventListener('popstate', scheduleRouteSyncFromLocation);

  // Prevent sidebar collapse toggles (like nested menus) from jumping to top.
  document.addEventListener('click', (e) => {
    const collapseToggle = e.target.closest('[data-bs-toggle="collapse"]');
    if (!collapseToggle) return;
    if (sidebar && sidebar.contains(collapseToggle)) {
      e.preventDefault();
    }
  });

  // Nav click handling (sidebar + in-page buttons/links with data-nav)
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-nav]');
    if (!link) return;
    e.preventDefault();
    const target = link.dataset.nav;
    if (!target) return;
    const resolvedTarget = getResolvedNavKey(target, currentRole);
    const allowedRolesAttr = link.getAttribute('data-roles') || '';
    if (allowedRolesAttr && currentRole) {
      const allowedRoles = allowedRolesAttr.split(',');
      if (!allowedRoles.includes(currentRole)) {
        showToast('You are not allowed to access this page', 'warning');
        return;
      }
    }
    navigateTo(resolvedTarget || target);
    if (window.innerWidth < 768) {
      const collapseEl = document.getElementById('sidebar');
      const bsCollapse = bootstrap.Collapse.getOrCreateInstance(collapseEl);
      bsCollapse.hide();
    }
  });

  // Logout (call backend then reset UI)
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      apiRequest('logout', 'POST').catch(() => null).finally(() => {
        pendingRouteAfterLogin = null;
        currentUser = null;
        currentRole = null;
        studentFaceRegistered = null;
        studentFaceProfile = null;
        maintenanceMessage = '';
        setNotificationCount(0);
        if (maintenancePollId) {
          clearInterval(maintenancePollId);
          maintenancePollId = null;
        }
        if (window.dateTimeIntervalId) {
          clearInterval(window.dateTimeIntervalId);
          window.dateTimeIntervalId = null;
        }
        activeAttendanceSessionId = null;
        facultyActiveSessionId = null;
        loginForm.reset();
        document.body.classList.remove('sidebar-open-mobile');
        appShell.classList.add('d-none');
        loginPage.classList.remove('d-none');
        syncUrlForRoute(LOGIN_ROUTE_KEY, { replaceHistory: true });
        setDocumentTitle(LOGIN_ROUTE_KEY);
        showToast('Logged out', 'secondary');
      });
    });
  }

  if (generateOtpBtn) {
    generateOtpBtn.addEventListener('click', async () => {
      generateOtpBtn.disabled = true;
      try {
        await startFacultySessionFrom(otpClassSelect, { extraClass: false });
      } catch (err) {
        showToast(err.message || 'Failed to generate OTP', 'danger');
      } finally {
        updateFacultyLiveControls();
      }
    });
  }

  if (generateOtpExtraBtn) {
    generateOtpExtraBtn.addEventListener('click', async () => {
      generateOtpExtraBtn.disabled = true;
      try {
        const extraReason = await collectExtraClassReason();
        if (!extraReason) return;
        await startFacultySessionFrom(otpClassSelect, { extraClass: true, extraReason });
      } catch (err) {
        showToast(err.message || 'Failed to generate extra class OTP', 'danger');
      } finally {
        updateFacultyLiveControls();
      }
    });
  }

  if (startSessionBtn) {
    startSessionBtn.addEventListener('click', async () => {
      startSessionBtn.disabled = true;
      try {
        await startFacultySessionFrom(startSessionClassSelect, { extraClass: false });
      } catch (err) {
        showToast(err.message || 'Failed to start session', 'danger');
      } finally {
        updateFacultyLiveControls();
      }
    });
  }

  if (startSessionExtraBtn) {
    startSessionExtraBtn.addEventListener('click', async () => {
      startSessionExtraBtn.disabled = true;
      try {
        const extraReason = await collectExtraClassReason();
        if (!extraReason) return;
        await startFacultySessionFrom(startSessionClassSelect, { extraClass: true, extraReason });
      } catch (err) {
        showToast(err.message || 'Failed to start extra class session', 'danger');
      } finally {
        updateFacultyLiveControls();
      }
    });
  }

  if (generatePageOtpBtn) {
    generatePageOtpBtn.addEventListener('click', async () => {
      generatePageOtpBtn.disabled = true;
      try {
        await startFacultySessionFrom(generatePageClassSelect, { extraClass: false });
      } catch (err) {
        showToast(err.message || 'Failed to generate OTP', 'danger');
      } finally {
        updateFacultyLiveControls();
      }
    });
  }

  if (generatePageOtpExtraBtn) {
    generatePageOtpExtraBtn.addEventListener('click', async () => {
      generatePageOtpExtraBtn.disabled = true;
      try {
        const extraReason = await collectExtraClassReason();
        if (!extraReason) return;
        await startFacultySessionFrom(generatePageClassSelect, { extraClass: true, extraReason });
      } catch (err) {
        showToast(err.message || 'Failed to generate extra class OTP', 'danger');
      } finally {
        updateFacultyLiveControls();
      }
    });
  }

  [otpClassSelect, startSessionClassSelect, generatePageClassSelect].forEach((selectEl) => {
    if (!selectEl) return;
    selectEl.addEventListener('change', () => updateFacultyLiveControls());
  });
  updateFacultyLiveControls();

  if (facultyStudentsRefreshBtn) {
    facultyStudentsRefreshBtn.addEventListener('click', () => {
      if (!hasRole(['faculty'])) return;
      loadFacultyDepartmentStudents().catch((err) => showToast(err.message || 'Failed to load students', 'danger'));
    });
  }
  if (facultyStudentsSearchEl) {
    facultyStudentsSearchEl.addEventListener('input', () => renderFacultyDepartmentStudents());
  }
  [facultyStudentsYearEl, facultyStudentsSemesterEl, facultyStudentsSectionEl].filter(Boolean).forEach((selectEl) => {
    selectEl.addEventListener('change', () => renderFacultyDepartmentStudents());
  });

  document.querySelectorAll('[data-sa-role-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      superAdminRoleFilter = String(btn.dataset.saRoleFilter || 'all');
      document.querySelectorAll('[data-sa-role-filter]').forEach((item) => {
        if (item.dataset.saRoleFilter === superAdminRoleFilter) {
          item.classList.add('btn-primary');
          item.classList.remove('btn-outline-secondary');
        } else {
          item.classList.remove('btn-primary');
          item.classList.add('btn-outline-secondary');
        }
      });
      renderSuperAdminUsersTable();
    });
  });
  document.querySelectorAll('[data-sa-role-filter]').forEach((item) => {
    if (item.dataset.saRoleFilter === 'all') {
      item.classList.add('btn-primary');
      item.classList.remove('btn-outline-secondary');
    }
  });

  if (saUsersSearchEl) {
    saUsersSearchEl.addEventListener('input', () => renderSuperAdminUsersTable());
  }
  if (saUsersCollegeFilterEl) {
    saUsersCollegeFilterEl.addEventListener('change', () => renderSuperAdminUsersTable());
  }
  if (saUsersSortByEl) {
    saUsersSortByEl.addEventListener('change', () => renderSuperAdminUsersTable());
  }
  if (auditFilterApplyEl) {
    auditFilterApplyEl.addEventListener('click', () => {
      loadAuditLogs().catch((err) => showToast(err.message || 'Failed to load audit logs', 'danger'));
    });
  }

  if (refreshNoticesBtn) {
    refreshNoticesBtn.addEventListener('click', () => {
      loadCollegeNotices().catch((err) => showToast(err.message || 'Failed to load notices', 'danger'));
    });
  }
  [noticesIncludeArchivedEl, noticesIncludeExpiredEl].filter(Boolean).forEach((el) => {
    el.addEventListener('change', () => {
      loadCollegeNotices().catch((err) => showToast(err.message || 'Failed to load notices', 'danger'));
    });
  });
  if (createNoticeBtn) {
    createNoticeBtn.addEventListener('click', async () => {
      if (!hasRole(['college_admin'])) {
        showToast('Only college admin can send notices', 'danger');
        return;
      }
      const values = await showFormModal({
        title: 'Send Notice',
        description: 'Send an announcement to students and/or faculty in your college.',
        submitText: 'Send',
        fields: [
          { name: 'title', label: 'Title', required: true, value: '', colClass: 'col-12' },
          {
            name: 'audience',
            label: 'Audience',
            type: 'select',
            required: true,
            value: 'all',
            colClass: 'col-12 col-md-6',
            options: [
              { value: 'all', label: 'All' },
              { value: 'students', label: 'Students' },
              { value: 'faculty', label: 'Faculty' },
            ],
          },
          { name: 'expires_at', label: 'Expires At (optional)', type: 'datetime-local', value: '', colClass: 'col-12 col-md-6' },
          { name: 'message', label: 'Message', type: 'textarea', rows: 5, required: true, value: '', colClass: 'col-12' },
        ],
      });
      if (!values) return;

      try {
        await apiRequest('college_admin_notice_create', 'POST', {
          title: String(values.title || '').trim(),
          audience: String(values.audience || 'all'),
          expires_at: String(values.expires_at || '').trim(),
          message: String(values.message || '').trim(),
        });
        showToast('Notice sent', 'success');
        await loadCollegeNotices();
      } catch (err) {
        showToast(err.message || 'Failed to send notice', 'danger');
      }
    });
  }

  if (addCollegeBtn) {
    addCollegeBtn.addEventListener('click', async () => {
      if (!hasRole(['super_admin'])) {
        showToast('You are not allowed to add colleges', 'danger');
        return;
      }
      await openSuperAdminCollegeModal(null);
    });
  }

  if (toggleCollegeArchiveBtn) {
    toggleCollegeArchiveBtn.addEventListener('click', async () => {
      if (!hasRole(['super_admin'])) {
        showToast('Only super admin can view archived colleges', 'danger');
        return;
      }
      showArchivedColleges = !showArchivedColleges;
      try {
        await loadCollegesManagement();
      } catch (err) {
        showToast(err.message || 'Failed to load colleges', 'danger');
      }
    });
  }

  if (createCollegeAdminBtn) {
    createCollegeAdminBtn.addEventListener('click', async () => {
      if (!hasRole(['super_admin'])) {
        showToast('Only super admin can create college admins', 'danger');
        return;
      }

      try {
        const colleges = await getSuperAdminCollegesForFilters(false);
        if (!colleges.length) {
          showToast('No active colleges found', 'warning');
          return;
        }

        const [idData, pwdData] = await Promise.all([
          apiRequest('generate_unique_id', 'POST', { role: 'college_admin' }),
          apiRequest('generate_password', 'POST')
        ]);
        const generatedId = String(idData.unique_id || '');
        const generatedPwd = String(pwdData.password || '');

        const collegeOptions = [{ value: '', label: 'Select college' }].concat(
          colleges.map((c) => ({ value: String(c.id), label: String(c.name || `College ${c.id}`) }))
        );

        const defaultCollegeId = colleges.some((c) => Number(c.id) === Number(selectedCollegeIdForSuperAdmin))
          ? String(selectedCollegeIdForSuperAdmin)
          : String(colleges[0].id);

        const values = await showFormModal({
          title: 'Create College Admin',
          description: 'Generate login ID and password for a College Admin.',
          submitText: 'Create Admin',
          fields: [
            { name: 'college_id', label: 'College', type: 'select', required: true, options: collegeOptions, value: defaultCollegeId, colClass: 'col-12' },
            { name: 'unique_user_id', label: 'Login ID', required: true, value: generatedId, colClass: 'col-12 col-md-6' },
            { name: 'password', label: 'Password', required: true, value: generatedPwd, colClass: 'col-12 col-md-6' },
            { name: 'name', label: 'Admin Name', required: true, value: '', colClass: 'col-12 col-md-6' },
            { name: 'email', label: 'Admin Email (optional)', type: 'email', value: '', colClass: 'col-12 col-md-6' }
          ]
        });
        if (!values) return;

        const collegeId = Number(values.college_id || 0);
        const uniqueUserId = String(values.unique_user_id || '').trim();
        const name = String(values.name || '').trim();
        const email = String(values.email || '').trim();
        const password = String(values.password || '');
        if (!collegeId || !uniqueUserId || !name || !password) {
          showToast('Please fill all required fields', 'danger');
          return;
        }

        const created = await apiRequest('superadmin_create_college_admin', 'POST', {
          college_id: collegeId,
          unique_user_id: uniqueUserId,
          name,
          email,
          password
        });

        showToast('College admin created', 'success');
        showCredentialsModal({
          title: 'College Admin Credentials',
          userId: created.unique_user_id || uniqueUserId,
          password: created.password || password
        });
        superAdminUsers = [];
        if (currentRole === 'super_admin') {
          loadSuperAdminUsers().catch(() => null);
        }
      } catch (err) {
        showToast(err.message || 'Failed to create college admin', 'danger');
      }
    });
  }

  if (saDeptSearchEl) {
    saDeptSearchEl.addEventListener('input', () => renderSuperAdminDepartmentsTable());
  }
  if (saDeptCollegeFilterEl) {
    saDeptCollegeFilterEl.addEventListener('change', () => renderSuperAdminDepartmentsTable());
  }
  if (saDeptIncludeRemovedEl) {
    saDeptIncludeRemovedEl.addEventListener('change', () => {
      loadSuperAdminDepartments().catch((err) => showToast(err.message || 'Failed to load departments', 'danger'));
    });
  }
  if (saDeptRefreshBtn) {
    saDeptRefreshBtn.addEventListener('click', () => {
      loadSuperAdminDepartments().catch((err) => showToast(err.message || 'Failed to load departments', 'danger'));
    });
  }

  if (saStudentsSearchEl) {
    saStudentsSearchEl.addEventListener('input', () => renderSuperAdminStudentsTable());
  }
  if (saStudentsCollegeFilterEl) {
    saStudentsCollegeFilterEl.addEventListener('change', () => renderSuperAdminStudentsTable());
  }
  [saStudentsIncludeArchivedEl, saStudentsIncludeRemovedEl].filter(Boolean).forEach((el) => {
    el.addEventListener('change', () => {
      loadSuperAdminStudents().catch((err) => showToast(err.message || 'Failed to load students', 'danger'));
    });
  });
  if (saStudentsRefreshBtn) {
    saStudentsRefreshBtn.addEventListener('click', () => {
      loadSuperAdminStudents().catch((err) => showToast(err.message || 'Failed to load students', 'danger'));
    });
  }

  if (saFacultySearchEl) {
    saFacultySearchEl.addEventListener('input', () => renderSuperAdminFacultyTable());
  }
  if (saFacultyCollegeFilterEl) {
    saFacultyCollegeFilterEl.addEventListener('change', () => renderSuperAdminFacultyTable());
  }
  [saFacultyIncludeArchivedEl, saFacultyIncludeRemovedEl].filter(Boolean).forEach((el) => {
    el.addEventListener('change', () => {
      loadSuperAdminFaculty().catch((err) => showToast(err.message || 'Failed to load faculty', 'danger'));
    });
  });
  if (saFacultyRefreshBtn) {
    saFacultyRefreshBtn.addEventListener('click', () => {
      loadSuperAdminFaculty().catch((err) => showToast(err.message || 'Failed to load faculty', 'danger'));
    });
  }

  if (credCopyBtn) {
    credCopyBtn.addEventListener('click', async () => {
      if (!pendingCredentialsCopyText) {
        showToast('Nothing to copy', 'warning');
        return;
      }
      try {
        await navigator.clipboard.writeText(pendingCredentialsCopyText);
        showToast('Credentials copied to clipboard', 'success');
      } catch (_) {
        showToast('Copy failed. Please copy manually.', 'danger');
      }
    });
  }

  if (credentialsModalEl) {
    credentialsModalEl.addEventListener('hidden.bs.modal', () => {
      pendingCredentialsCopyText = '';
      if (credUserIdEl) credUserIdEl.textContent = '-';
      if (credPasswordEl) credPasswordEl.textContent = '-';
    });
  }

  if (saCollegeLogoInputEl && saCollegeLogoPreviewEl) {
    saCollegeLogoInputEl.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
        showToast('Use PNG, JPG, or WEBP image for logo', 'danger');
        saCollegeLogoInputEl.value = '';
        return;
      }
      try {
        const dataUrl = await fileToDataUrl(file);
        saCollegeLogoPreviewEl.src = dataUrl;
      } catch (err) {
        showToast(err.message || 'Failed to read logo image', 'danger');
      }
    });
  }

  if (saCollegeForm) {
    saCollegeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!hasRole(['super_admin'])) {
        showToast('Only super admin can save college details', 'danger');
        return;
      }
      const collegeId = saCollegeIdEl ? Number(saCollegeIdEl.value || 0) : 0;
      const isEdit = collegeId > 0;
      const name = saCollegeNameEl ? String(saCollegeNameEl.value || '').trim() : '';
      if (!name) {
        showToast('College name is required', 'danger');
        return;
      }
      try {
        let logoData = '';
        const logoFile = saCollegeLogoInputEl?.files && saCollegeLogoInputEl.files[0] ? saCollegeLogoInputEl.files[0] : null;
        if (logoFile) {
          logoData = await imageFileToOptimizedDataUrl(logoFile, { maxDimension: 512 });
        }
        const saved = await apiRequest('colleges_save', 'POST', {
          id: collegeId,
          name,
          short_code: saCollegeShortCodeEl?.value || '',
          status: saCollegeStatusEl?.value || 'active',
          contact_email: saCollegeEmailEl?.value || '',
          contact_phone: saCollegePhoneEl?.value || '',
          logo_image_data: logoData,
          create_admin: !isEdit,
          admin_name: saCollegeAdminNameEl?.value || '',
          admin_email: saCollegeAdminEmailEl?.value || '',
          admin_unique_user_id: saCollegeAdminIdEl?.value || '',
          admin_password: saCollegeAdminPasswordEl?.value || ''
        });

        // Capture credentials from form BEFORE hiding modal (fields get cleared on hide)
        const capturedAdminId = saCollegeAdminIdEl?.value || '';
        const capturedAdminPwd = saCollegeAdminPasswordEl?.value || '';

        bootstrap.Modal.getOrCreateInstance(saCollegeModalEl).hide();
        showToast(isEdit ? 'College saved' : 'College and College Admin created', 'success');
        superAdminCollegesActiveList = null;
        superAdminCollegesAllList = null;
        await loadCollegesManagement();
        await loadSuperAdminUsers();

        // Always show credentials for new college — use backend response if available, else fallback to form values
        if (!isEdit) {
          const adminUserId = (saved && saved.college_admin && saved.college_admin.unique_user_id) || capturedAdminId;
          const adminPwd = (saved && saved.college_admin && saved.college_admin.password) || capturedAdminPwd;
          if (adminUserId || adminPwd) {
            showCredentialsModal({
              title: 'College Admin Credentials',
              userId: adminUserId,
              password: adminPwd
            });
          }
        }
      } catch (err) {
        showToast(err.message || 'Failed to save college', 'danger');
      }
    });
  }

  if (addStudentBtn) {
    addStudentBtn.addEventListener('click', async () => {
      if (!hasRole(['college_admin'])) {
        showToast('You are not allowed to add students', 'danger');
        return;
      }
      let suggestedId = '';
      let suggestedPwd = 'Student@123';
      try {
        const [idData, pwdData] = await Promise.all([
          apiRequest('college_admin_generate_unique_id', 'POST', { role: 'student' }),
          apiRequest('generate_password', 'POST')
        ]);
        suggestedId = String(idData.unique_id || '');
        suggestedPwd = String(pwdData.password || suggestedPwd);
      } catch (_) {
        // Allow manual entry if generation fails
      }
      // Fetch departments and courses for dropdowns
      let departments = [];
      let courses = [];
      try {
        const deptRes = await apiRequest('departments_list');
        departments = deptRes.departments || [];
        if (departments.length > 0) {
          const courseRes = await apiRequest(`courses_list&dept_id=${departments[0].id}`);
          courses = courseRes.courses || [];
        }
      } catch (_) {
        // Use defaults if API fails
      }

      const defaultDept = departments.length > 0 ? String(departments[0].name) : 'CSE';
      const defaultCourse = courses.length > 0 ? String(courses[0].course_name) : 'BTech CSE';

      const values = await showFormModal({
        title: 'Add New Student',
        description: 'Create a student account (Login ID and password can be edited before saving).',
        submitText: 'Create Student',
        fields: [
          { name: 'unique_user_id', label: 'Login ID', value: suggestedId, colClass: 'col-12 col-md-6' },
          { name: 'name', label: 'Student Name', required: true, colClass: 'col-12 col-md-6' },
          { name: 'email', label: 'Student Email (optional)', type: 'email', value: '', colClass: 'col-12 col-md-6' },
          departments.length > 0
            ? { name: 'dept_name', label: 'Department', type: 'select', required: true, value: defaultDept, colClass: 'col-12 col-md-6', options: departments.map(d => ({ value: d.name, label: d.name })) }
            : { name: 'dept_name', label: 'Department', value: defaultDept, required: true, colClass: 'col-12 col-md-6' },
          courses.length > 0
            ? { name: 'course_name', label: 'Course', type: 'select', required: true, value: defaultCourse, colClass: 'col-12 col-md-6', options: courses.map(c => ({ value: c.course_name, label: c.course_name })) }
            : { name: 'course_name', label: 'Course', value: defaultCourse, required: true, colClass: 'col-12 col-md-6' },
          { name: 'year', label: 'Year', type: 'number', min: 1, max: 4, value: '1', required: true, colClass: 'col-6 col-md-3' },
          { name: 'semester', label: 'Semester', type: 'number', min: 1, max: 8, value: '1', required: true, colClass: 'col-6 col-md-3' },
          { name: 'section', label: 'Section', value: 'A', required: true, colClass: 'col-6 col-md-3' },
          { name: 'password', label: 'Password', type: 'text', value: suggestedPwd, required: true, colClass: 'col-12 col-md-6' }
        ]
      });
      if (!values) return;

      const year = Number(values.year || 1);
      try {
        const created = await apiRequest('college_admin_student_create', 'POST', {
          unique_user_id: values.unique_user_id.trim(),
          name: values.name.trim(),
          email: values.email.trim(),
          dept_name: values.dept_name.trim(),
          course_name: values.course_name.trim(),
          year,
          semester: Number(values.semester || ((year * 2) - 1)),
          section: values.section.trim(),
          password: values.password
        });
        const generatedId = created.unique_user_id || values.unique_user_id.trim();
        showToast(`Student added: ${generatedId}`, 'success');
        showCredentialsModal({
          title: 'Student Credentials',
          userId: generatedId,
          password: String(values.password || '')
        });
        await loadCollegeAdminStudents();
      } catch (err) {
        showToast(err.message || 'Failed to add student', 'danger');
      }
    });
  }

  if (addFacultyBtn) {
    addFacultyBtn.addEventListener('click', async () => {
      if (!hasRole(['college_admin'])) {
        showToast('You are not allowed to add faculty', 'danger');
        return;
      }

      try {
        const deptRes = await apiRequest('departments_list');
        const departments = deptRes.departments || [];
        if (!departments.length) {
          showToast('Add a department first', 'warning');
          return;
        }

        let suggestedId = '';
        let suggestedPwd = 'Faculty@123';
        try {
          const [idData, pwdData] = await Promise.all([
            apiRequest('college_admin_generate_unique_id', 'POST', { role: 'faculty' }),
            apiRequest('generate_password', 'POST')
          ]);
          suggestedId = String(idData.unique_id || '');
          suggestedPwd = String(pwdData.password || suggestedPwd);
        } catch (_) {
          // Allow backend auto-generation if needed.
        }

        const values = await showFormModal({
          title: 'Add New Faculty',
          description: 'Create a faculty account (Login ID and password can be edited before saving).',
          submitText: 'Create Faculty',
          fields: [
            { name: 'unique_user_id', label: 'Login ID', value: suggestedId, colClass: 'col-12 col-md-6' },
            { name: 'name', label: 'Faculty Name', value: '', required: true, colClass: 'col-12 col-md-6' },
            { name: 'email', label: 'Faculty Email (optional)', type: 'email', value: '', colClass: 'col-12 col-md-6' },
            {
              name: 'dept_name',
              label: 'Department',
              type: 'select',
              value: String(departments[0].name || ''),
              required: true,
              colClass: 'col-12 col-md-6',
              options: departments.map((d) => ({ value: d.name, label: d.name })),
            },
            { name: 'designation', label: 'Designation', value: 'Assistant Professor', required: true, colClass: 'col-12 col-md-6' },
            { name: 'password', label: 'Password', type: 'text', value: suggestedPwd, required: true, colClass: 'col-12 col-md-6' }
          ]
        });
        if (!values) return;

        const created = await apiRequest('college_admin_faculty_create', 'POST', {
          unique_user_id: String(values.unique_user_id || '').trim(),
          name: String(values.name || '').trim(),
          email: String(values.email || '').trim(),
          dept_name: String(values.dept_name || '').trim(),
          designation: String(values.designation || '').trim(),
          password: values.password
        });

        const generatedId = created.unique_user_id || String(values.unique_user_id || '').trim();
        showToast(`Faculty added: ${generatedId}`, 'success');
        showCredentialsModal({
          title: 'Faculty Credentials',
          userId: generatedId,
          password: String(values.password || '')
        });
        await loadCollegeAdminFaculty();
      } catch (err) {
        showToast(err.message || 'Failed to add faculty', 'danger');
      }
    });
  }

  // Quick Action: Add Student from college admin dashboard
  if (quickAddStudentBtn) {
    quickAddStudentBtn.addEventListener('click', async () => {
      if (!hasRole(['college_admin'])) {
        showToast('You are not allowed to add students', 'danger');
        return;
      }
      // Trigger the same add student flow as the main button
      if (addStudentBtn) {
        addStudentBtn.click();
      }
    });
  }

  // Quick Action: Upload Timetable from college admin dashboard
  if (quickUploadTimetableBtn) {
    quickUploadTimetableBtn.addEventListener('click', async () => {
      if (!hasRole(['college_admin'])) {
        showToast('You are not allowed to upload timetable', 'danger');
        return;
      }
      // Navigate to timetable management page
      navigateTo('timetable-mgmt');
    });
  }

  if (platformSettingsForm) {
    platformSettingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!hasRole(['super_admin'])) {
        showToast('You are not allowed to update platform settings', 'danger');
        return;
      }
      try {
        await apiRequest('platform_settings_save', 'POST', {
          timezone: document.getElementById('platform-timezone')?.value || 'UTC',
          session_timeout: Number(document.getElementById('platform-session-timeout')?.value || 30),
          max_login_attempts: Number(document.getElementById('platform-max-attempts')?.value || 5),
          maintenance_message: document.getElementById('platform-maintenance-message')?.value || ''
        });
        await refreshMaintenanceNotice();
        showToast('Platform settings saved', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to save settings', 'danger');
      }
    });
  }

  if (collegeSettingsUseLocationBtn) {
    collegeSettingsUseLocationBtn.addEventListener('click', () => {
      if (!hasRole(['college_admin'])) return;
      if (!collegeSettingsLatEl || !collegeSettingsLngEl) {
        showToast('Location fields are missing', 'danger');
        return;
      }
      if (!navigator.geolocation) {
        showToast('Geolocation not supported in this browser', 'danger');
        return;
      }

      collegeSettingsUseLocationBtn.disabled = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude);
          const lng = Number(pos.coords.longitude);
          collegeSettingsLatEl.value = Number.isFinite(lat) ? String(lat.toFixed(6)) : '';
          collegeSettingsLngEl.value = Number.isFinite(lng) ? String(lng.toFixed(6)) : '';
          if (collegeSettingsRadiusEl && !String(collegeSettingsRadiusEl.value || '').trim()) {
            collegeSettingsRadiusEl.value = '200';
          }
          showToast('Location filled from device', 'success');
          collegeSettingsUseLocationBtn.disabled = false;
        },
        (err) => {
          const msg = err && err.message ? err.message : 'Failed to get current location';
          showToast(msg, 'danger');
          collegeSettingsUseLocationBtn.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000 }
      );
    });
  }

  if (collegeSettingsForm) {
    collegeSettingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!hasRole(['college_admin'])) {
        showToast('You are not allowed to update college settings', 'danger');
        return;
      }
      try {
        const logoInput = document.getElementById('college-settings-logo-input');
        let logoImageData = '';
        const logoFile = logoInput?.files && logoInput.files[0] ? logoInput.files[0] : null;
        if (logoFile) {
          if (!/^image\/(png|jpeg|webp)$/.test(logoFile.type)) {
            throw new Error('Use PNG, JPG, or WEBP image for logo');
          }
          logoImageData = await imageFileToOptimizedDataUrl(logoFile, { maxDimension: 512 });
        }

        const nextName = document.getElementById('college-settings-name')?.value || '';
        const saved = await apiRequest('college_settings_save', 'POST', {
          name: nextName,
          short_code: document.getElementById('college-settings-short-code')?.value || '',
          contact_email: document.getElementById('college-settings-email')?.value || '',
          contact_phone: document.getElementById('college-settings-phone')?.value || '',
          logo_image_data: logoImageData,
          latitude: collegeSettingsLatEl ? String(collegeSettingsLatEl.value || '').trim() : '',
          longitude: collegeSettingsLngEl ? String(collegeSettingsLngEl.value || '').trim() : '',
          radius_meters: collegeSettingsRadiusEl ? String(collegeSettingsRadiusEl.value || '').trim() : ''
        });
        currentUser.college = nextName || currentUser.college;
        currentUser.college_logo_url = saved?.college?.logo || currentUser.college_logo_url;
        setupUserContext();
        showToast('College settings saved', 'success');
        if (currentRole === 'college_admin') {
          await loadCollegeSettings();
        }
      } catch (err) {
        showToast(err.message || 'Failed to save college settings', 'danger');
      }
    });
  }

  async function loadProfileDetails() {
    if (!currentUser) return;
    const data = await apiRequest('profile_get');
    const profile = data.profile || {};

    const profileNameEl = document.getElementById('profile-name');
    if (profileNameEl) profileNameEl.textContent = profile.name || currentUser.name || '-';

    const profileNameInput = document.getElementById('profile-name-input');
    if (profileNameInput) profileNameInput.value = profile.name || currentUser.name || '';

    const profileIdInput = document.getElementById('profile-id-input');
    if (profileIdInput) profileIdInput.value = profile.unique_user_id || currentUser.id || '';

    const profileEmailInput = document.getElementById('profile-email-input');
    if (profileEmailInput) profileEmailInput.value = profile.email || '';

    const profilePhoneInput = document.getElementById('profile-phone-input');
    if (profilePhoneInput) profilePhoneInput.value = profile.phone || '';

    const profileCollegeEl = document.getElementById('profile-college');
    if (profileCollegeEl) profileCollegeEl.textContent = profile.college_name || currentUser.college || 'N/A';

    const profileCollegeInput = document.getElementById('profile-college-input');
    if (profileCollegeInput) profileCollegeInput.value = profile.college_name || currentUser.college || '';

    const profileStatusEl = document.getElementById('profile-status');
    if (profileStatusEl) {
      const rawStatus = String(profile.status || 'active');
      profileStatusEl.textContent = rawStatus ? (rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1)) : '-';
      profileStatusEl.className = `badge ${statusBadgeClass(rawStatus)}`;
    }

    const lastLoginEl = document.getElementById('profile-last-login');
    if (lastLoginEl) lastLoginEl.textContent = profile.last_login || '-';

    const nextAvatar = profile.profile_photo_url || currentUser.profile_photo_url || DEFAULT_AVATAR;
    if (profileAvatarEl) profileAvatarEl.src = nextAvatar;
    if (headerAvatarEl) headerAvatarEl.src = nextAvatar;

    const studentFieldsWrap = document.getElementById('profile-student-fields');
    if (studentFieldsWrap) {
      studentFieldsWrap.classList.toggle('d-none', currentRole !== 'student');
    }

    const deptInput = document.getElementById('profile-dept-input');
    if (deptInput) deptInput.value = profile.dept_name || '';

    const courseInput = document.getElementById('profile-course-input');
    if (courseInput) courseInput.value = profile.course || '';

    const yearInput = document.getElementById('profile-year-input');
    if (yearInput) yearInput.value = (profile.year !== null && profile.year !== undefined) ? String(profile.year) : '';

    const semesterInput = document.getElementById('profile-semester-input');
    if (semesterInput) semesterInput.value = (profile.semester !== null && profile.semester !== undefined) ? String(profile.semester) : '';

    const sectionInput = document.getElementById('profile-section-input');
    if (sectionInput) sectionInput.value = profile.section || '';

    const hobbiesInput = document.getElementById('profile-hobbies-input');
    if (hobbiesInput) hobbiesInput.value = profile.hobbies || '';

    const deptInfoInput = document.getElementById('profile-department-info-input');
    if (deptInfoInput) deptInfoInput.value = profile.department_info || '';
  }

  const profileCancelBtn = document.getElementById('profile-cancel-btn');
  if (profileCancelBtn) {
    profileCancelBtn.addEventListener('click', () => {
      loadProfileDetails().catch((err) => showToast(err.message || 'Failed to reset profile form', 'danger'));
    });
  }

  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const payload = {
          name: document.getElementById('profile-name-input')?.value || '',
          email: document.getElementById('profile-email-input')?.value || '',
          phone: document.getElementById('profile-phone-input')?.value || ''
        };
        if (currentRole === 'student') {
          payload.hobbies = document.getElementById('profile-hobbies-input')?.value || '';
          payload.department_info = document.getElementById('profile-department-info-input')?.value || '';
        }
        await apiRequest('profile_update', 'POST', payload);
        showToast('Profile updated', 'success');
        await refreshCurrentUser();
        await loadProfileDetails();
      } catch (err) {
        showToast(err.message || 'Failed to update profile', 'danger');
      }
    });
  }

  if (profilePhotoBtn && profilePhotoInput) {
    profilePhotoBtn.addEventListener('click', () => {
      if (currentRole !== 'student') return;
      profilePhotoInput.click();
    });

    profilePhotoInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      profilePhotoInput.value = '';
      if (!file) return;
      if (currentRole !== 'student') {
        showToast('Only students can update profile photo', 'warning');
        return;
      }
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
        showToast('Use PNG, JPG, or WEBP image', 'danger');
        return;
      }

      try {
        const imageData = await fileToDataUrl(file);
        const res = await apiRequest('profile_photo_upload', 'POST', { image_data: imageData });
        const nextAvatar = res.profile_photo_url || DEFAULT_AVATAR;
        currentUser.profile_photo_url = nextAvatar;
        if (headerAvatarEl) headerAvatarEl.src = nextAvatar;
        if (profileAvatarEl) profileAvatarEl.src = nextAvatar;
        showToast('Profile photo updated', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to upload photo', 'danger');
      }
    });
  }

  const collegeSettingsLogoInput = document.getElementById('college-settings-logo-input');
  const collegeSettingsLogoPreview = document.getElementById('college-settings-logo-preview');
  if (collegeSettingsLogoInput && collegeSettingsLogoPreview) {
    collegeSettingsLogoInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
        showToast('Use PNG, JPG, or WEBP image for logo', 'danger');
        collegeSettingsLogoInput.value = '';
        return;
      }
      try {
        const imageData = await fileToDataUrl(file);
        collegeSettingsLogoPreview.src = imageData;
      } catch (err) {
        showToast(err.message || 'Failed to read logo image', 'danger');
        collegeSettingsLogoInput.value = '';
      }
    });
  }

  const changePasswordForm = document.getElementById('change-password-form');
  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = document.getElementById('current-password')?.value || '';
      const newPassword = document.getElementById('new-password')?.value || '';
      const confirmPassword = document.getElementById('confirm-password')?.value || '';
      if (newPassword !== confirmPassword) {
        showToast('New password and confirm password do not match', 'danger');
        return;
      }
      try {
        await apiRequest('change_password', 'POST', { currentPassword, newPassword });
        showToast('Password updated', 'success');
        changePasswordForm.reset();
      } catch (err) {
        showToast(err.message || 'Failed to change password', 'danger');
      }
    });
  }

  if (addTimetableBtn) {
    addTimetableBtn.addEventListener('click', async () => {
      if (!hasRole(['college_admin'])) {
        showToast('You are not allowed to manage timetable', 'danger');
        return;
      }
      try {
        const facultyRes = await apiRequest('college_admin_faculty_list');
        const facultyRows = (facultyRes.faculty || []).slice().sort((a, b) => {
          const da = String(a.dept_name || '');
          const db = String(b.dept_name || '');
          if (da !== db) return da.localeCompare(db, undefined, { sensitivity: 'base' });
          return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
        });
        if (!facultyRows.length) {
          showToast('Add faculty first', 'warning');
          return;
        }

        const facultyPick = await showFormModal({
          title: 'Add Timetable Row',
          description: 'Step 1: Select faculty (department auto-matched).',
          submitText: 'Continue',
          fields: [
            {
              name: 'faculty_unique_id',
              label: 'Faculty',
              type: 'select',
              value: String(facultyRows[0].unique_user_id || ''),
              required: true,
              options: facultyRows.map((f) => ({
                value: String(f.unique_user_id || ''),
                label: `${f.name || 'Faculty'} (${f.unique_user_id || '-'}) • ${f.dept_name || 'No Department'}`,
              })),
            },
          ],
        });
        if (!facultyPick) return;
        const facultyUniqueId = String(facultyPick.faculty_unique_id || '').trim();
        const selectedFaculty = facultyRows.find((f) => String(f.unique_user_id || '') === facultyUniqueId);
        if (!selectedFaculty) {
          showToast('Invalid faculty selected', 'danger');
          return;
        }
        const deptId = Number(selectedFaculty.dept_id || 0);
        if (!deptId) {
          showToast('Selected faculty has no department assigned', 'danger');
          return;
        }

        const courseRes = await apiRequest(`courses_list&dept_id=${deptId}`);
        const courses = (courseRes.courses || []).slice().sort((a, b) => {
          const ay = Number(a.year || 0);
          const by = Number(b.year || 0);
          if (ay !== by) return ay - by;
          const as = Number(a.semester || 0);
          const bs = Number(b.semester || 0);
          if (as !== bs) return as - bs;
          const asec = String(a.section || '').localeCompare(String(b.section || ''));
          if (asec !== 0) return asec;
          return String(a.course_name || '').localeCompare(String(b.course_name || ''));
        });
        if (!courses.length) {
          showToast('No course found in selected department', 'warning');
          return;
        }

        const defaultCourse = courses[0];
        const rowValues = await showFormModal({
          title: 'Add Timetable Row',
          description: `Step 2: ${selectedFaculty.dept_name || 'Department'} courses (year-wise sorted).`,
          submitText: 'Add Row',
          fields: [
            {
              name: 'course_id',
              label: 'Course (Year-wise sorted)',
              type: 'select',
              value: String(defaultCourse.id),
              required: true,
              options: courses.map((course) => ({
                value: String(course.id),
                label: `${course.course_name} • Year ${course.year} • Sem ${course.semester || '-'}-${course.section || '-'}`,
              })),
              colClass: 'col-12',
            },
            { name: 'day_of_week', label: 'Day of Week (1-7)', type: 'number', min: 1, max: 7, value: '1', required: true, colClass: 'col-6 col-md-3' },
            { name: 'start_time', label: 'Start Time (HH:MM:SS)', value: '09:00:00', required: true, colClass: 'col-6 col-md-3' },
            { name: 'end_time', label: 'End Time (HH:MM:SS)', value: '10:00:00', required: true, colClass: 'col-6 col-md-3' },
            { name: 'subject', label: 'Subject', value: defaultCourse.course_name || '', required: true, colClass: 'col-6 col-md-3' },
          ],
        });
        if (!rowValues) return;

        const selectedCourse = courses.find((c) => Number(c.id) === Number(rowValues.course_id || 0));
        if (!selectedCourse) {
          showToast('Invalid course selected', 'danger');
          return;
        }

        await apiRequest('timetable_create_manual', 'POST', {
          dept_name: String(selectedFaculty.dept_name || '').trim(),
          course_name: String(selectedCourse.course_name || '').trim(),
          year: Number(selectedCourse.year || 1),
          semester: Number(selectedCourse.semester || ((Number(selectedCourse.year || 1) * 2) - 1)),
          section: String(selectedCourse.section || '').trim(),
          faculty_unique_id: facultyUniqueId,
          day_of_week: Number(rowValues.day_of_week || 1),
          start_time: String(rowValues.start_time || '').trim(),
          end_time: String(rowValues.end_time || '').trim(),
          subject: String(rowValues.subject || selectedCourse.course_name || '').trim(),
        });
        showToast('Timetable row added', 'success');
        await loadTimetableManagement();
      } catch (err) {
        showToast(err.message || 'Failed to add timetable row', 'danger');
      }
    });
  }

  if (downloadTimetableSampleBtn) {
    downloadTimetableSampleBtn.addEventListener('click', () => {
      downloadCSV(
        'Timetable_Sample',
        ['dept_name', 'course_name', 'year', 'semester', 'section', 'faculty_unique_id', 'day_of_week', 'start_time', 'end_time', 'subject'],
        [
          ['CSE', 'B.Tech CSE', 1, 1, 'A', 'FAC001', 'Monday', '09:00', '10:00', 'Programming Fundamentals'],
          ['CSE', 'B.Tech CSE', 1, 1, 'A', 'FAC002', 'Monday', '10:00', '11:00', 'Mathematics I'],
          ['ECE', 'B.Tech ECE', 2, 3, 'B', 'FAC010', '3', '11:00', '12:00', 'Signals and Systems'],
        ]
      );
    });
  }

  if (uploadTimetableBtn && uploadTimetableInput) {
    uploadTimetableBtn.addEventListener('click', () => uploadTimetableInput.click());
    uploadTimetableInput.addEventListener('change', async (e) => {
      if (!hasRole(['college_admin'])) {
        showToast('You are not allowed to upload timetable', 'danger');
        return;
      }
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const rows = parseTimetableCsv(text);
        const result = await apiRequest('timetable_bulk_import', 'POST', {
          rows,
          replace_existing_classes: true,
        });
        const summaryParts = [
          `${result.rows_processed || rows.length} slot(s) synced`,
          `${result.classes_updated || 0} class(es) updated`,
        ];
        if (Number(result.deleted_count || 0) > 0) {
          summaryParts.push(`${result.deleted_count} old slot(s) removed`);
        }
        showToast(`Timetable upload complete: ${summaryParts.join(' • ')}`, 'success');
        await loadTimetableManagement();
      } catch (err) {
        const rowErrors = err?.details?.row_errors || [];
        const firstError = rowErrors[0]?.error || '';
        const message = firstError ? `${err.message} ${firstError}` : (err.message || 'Failed to upload timetable CSV');
        showToast(message, 'danger');
      } finally {
        uploadTimetableInput.value = '';
      }
    });
  }

  if (downloadStudentSampleBtn) {
    downloadStudentSampleBtn.addEventListener('click', () => {
      downloadCSV(
        'Students_Sample',
        ['name', 'student_id', 'email', 'department', 'course_name', 'year', 'semester', 'section', 'password'],
        [
          ['Rahul Kumar', 'STU001', 'rahul@example.com', 'CSE', 'B.Tech CSE', 1, 1, 'A', ''],
          ['Priya Sharma', 'STU002', 'priya@example.com', 'CSE', 'B.Tech CSE', 1, 1, 'A', ''],
          ['Amit Singh', '', 'amit@example.com', 'ECE', 'B.Tech ECE', 2, 3, 'B', 'MyPassword@1'],
          ['Neha Gupta', '', '', 'ME', 'B.Tech ME', 3, 5, 'A', ''],
        ]
      );
    });
  }

  if (uploadStudentCsvBtn && studentCsvUploadInput) {
    uploadStudentCsvBtn.addEventListener('click', () => studentCsvUploadInput.click());
    studentCsvUploadInput.addEventListener('change', async (e) => {
      if (!hasRole(['college_admin'])) {
        showToast('You are not allowed to import students', 'danger');
        return;
      }
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const rows = parseStudentCsv(text);

        const confirmed = await confirmAction({
          title: 'Import Students',
          body: `Found ${rows.length} student(s) in CSV. All will be created with default password (Student@123) unless specified in CSV. Continue?`
        });
        if (!confirmed) {
          studentCsvUploadInput.value = '';
          return;
        }

        const result = await apiRequest('college_admin_student_bulk_import', 'POST', { rows });
        const parts = [`${result.inserted_count || 0} student(s) imported`];
        if (Number(result.skipped_count || 0) > 0) {
          parts.push(`${result.skipped_count} skipped (duplicates)`);
        }
        showToast(`Import complete: ${parts.join(' \u2022 ')}`, 'success');

        // Auto-download credentials CSV if students were created
        const creds = result.credentials || [];
        if (creds.length > 0) {
          const credHeaders = ['Login ID', 'Name', 'Password'];
          const credRows = creds.map(c => [c.unique_user_id, c.name, c.password]);
          downloadCSV('Imported_Students_Credentials', credHeaders, credRows);
          showToast('Credentials CSV downloaded automatically', 'info');
        }

        await loadCollegeAdminStudents();
      } catch (err) {
        const rowErrors = err?.details?.row_errors || [];
        const firstError = rowErrors[0]?.error || '';
        const message = firstError ? `${err.message} ${firstError}` : (err.message || 'Failed to import students CSV');
        showToast(message, 'danger');
      } finally {
        studentCsvUploadInput.value = '';
      }
    });
  }

  [timetableFilterDept, timetableFilterYear, timetableFilterSemester, timetableFilterSection]
    .filter(Boolean)
    .forEach((selectEl) => {
      selectEl.addEventListener('change', () => {
        loadTimetableManagement().catch((err) => showToast(err.message || 'Failed to load timetable', 'danger'));
      });
    });

  if (addDeptCourseBtn) {
    addDeptCourseBtn.addEventListener('click', async () => {
      if (!hasRole(['college_admin'])) {
        showToast('You are not allowed to manage departments/courses', 'danger');
        return;
      }
      try {
        const modeValues = await showFormModal({
          title: 'Add Department or Course',
          description: 'Choose what you want to create.',
          submitText: 'Continue',
          fields: [
            {
              name: 'mode',
              label: 'Type',
              type: 'select',
              value: 'd',
              options: [
                { value: 'd', label: 'Department' },
                { value: 'c', label: 'Course' }
              ]
            }
          ]
        });
        if (!modeValues) return;

        if (modeValues.mode === 'd') {
          const deptValues = await showFormModal({
            title: 'Add Department',
            description: 'Enter department name.',
            submitText: 'Add Department',
            fields: [
              { name: 'dept_name', label: 'Department Name', value: '', required: true }
            ]
          });
          if (!deptValues) {
            showToast('Department form cancelled', 'info');
            return;
          }
          if (!deptValues.dept_name || !deptValues.dept_name.trim()) {
            showToast('Department name cannot be empty', 'warning');
            return;
          }
          try {
            await apiRequest('departments_save', 'POST', { name: deptValues.dept_name.trim() });
            showToast('Department added successfully!', 'success');
            await loadDepartmentsAndCourses();
          } catch (err) {
            throw err;
          }
        } else if (modeValues.mode === 'c') {
          const depRes = await apiRequest('departments_list');
          const departments = depRes.departments || [];
          if (!departments.length) {
            showToast('Add a department first', 'warning');
            return;
          }
          const courseValues = await showFormModal({
            title: 'Add Course',
            description: 'Select department and enter course details.',
            submitText: 'Add Course',
            fields: [
              {
                name: 'dept_id',
                label: 'Department',
                type: 'select',
                value: String(departments[0].id),
                required: true,
                options: departments.map((dept) => ({ value: String(dept.id), label: dept.name })),
                colClass: 'col-12 col-md-6'
              },
              { name: 'course_name', label: 'Course Name', value: 'BTech CSE', required: true, colClass: 'col-12 col-md-6' },
              { name: 'year', label: 'Year', type: 'number', min: 1, max: 4, value: '1', required: true, colClass: 'col-6 col-md-3' },
              { name: 'semester', label: 'Semester', type: 'number', min: 1, max: 8, value: '1', required: true, colClass: 'col-6 col-md-3' },
              { name: 'section', label: 'Section', value: 'A', required: true, colClass: 'col-6 col-md-3' }
            ]
          });
          if (!courseValues) {
            showToast('Course form cancelled', 'info');
            return;
          }
          if (!courseValues.course_name || !courseValues.course_name.trim()) {
            showToast('Course name cannot be empty', 'warning');
            return;
          }

          const deptId = Number(courseValues.dept_id || 0);
          const year = Number(courseValues.year || 1);
          if (deptId <= 0) {
            showToast('Please select a valid department', 'warning');
            return;
          }
          try {
            await apiRequest('courses_save', 'POST', {
              dept_id: deptId,
              course_name: courseValues.course_name.trim(),
              year,
              semester: Number(courseValues.semester || ((year * 2) - 1)),
              section: courseValues.section.trim()
            });
            showToast('Course added successfully!', 'success');
            await loadCoursesForDepartment(deptId);
          } catch (err) {
            throw err;
          }
        }
      } catch (err) {
        showToast(err.message || 'Failed to save department/course', 'danger');
      }
    });
  }

  if (addSubjectBtn) {
    addSubjectBtn.disabled = true;
    addSubjectBtn.addEventListener('click', async () => {
      if (!hasRole(['college_admin'])) {
        showToast('You are not allowed to manage subjects', 'danger');
        return;
      }
      if (!selectedCourseIdForSubjects) {
        showToast('Select a course first', 'warning');
        return;
      }
      try {
        const values = await showFormModal({
          title: 'Add Subject',
          description: `Course: ${selectedCourseLabelForSubjects || '-'}`,
          submitText: 'Add Subject',
          fields: [
            { name: 'subject_name', label: 'Subject Name', value: '', required: true, colClass: 'col-12' },
            { name: 'subject_code', label: 'Subject Code', value: '', required: true, colClass: 'col-12 col-md-6' },
          ],
        });
        if (!values) {
          showToast('Subject form cancelled', 'info');
          return;
        }
        console.log('Subject Values:', values);
        if (!values.subject_name || !values.subject_name.trim()) {
          showToast('Subject name cannot be empty', 'warning');
          return;
        }
        if (!values.subject_code || !values.subject_code.trim()) {
          showToast('Subject code cannot be empty', 'warning');
          return;
        }
        const result = await apiRequest('course_subjects_save', 'POST', {
          course_id: selectedCourseIdForSubjects,
          subject_name: String(values.subject_name || '').trim(),
          subject_code: String(values.subject_code || '').trim().toUpperCase(),
        });
        console.log('Subject Save Result:', result);
        showToast('Subject added successfully!', 'success');
        await loadCourseSubjects(selectedCourseIdForSubjects, selectedCourseLabelForSubjects);
      } catch (err) {
        console.error('Subject Add Error:', err);
        showToast(err.message || 'Failed to add subject', 'danger');
      }
    });
  }

  document.addEventListener('click', async (e) => {
    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;
    e.preventDefault();

    const action = actionBtn.dataset.action;
    const userId = Number(actionBtn.dataset.userId || 0);
    const roleTarget = actionBtn.dataset.roleTarget || '';
    if (!action) return;

    actionBtn.disabled = true;
    try {
      if (action === 'sa-college-view') {
        const collegeId = Number(actionBtn.dataset.collegeId || 0);
        if (!collegeId) return;
        if (!hasRole(['super_admin'])) {
          throw new Error('Only super admin can view college data');
        }
        await loadCollegeDetail(collegeId);
      } else if (action === 'sa-college-edit') {
        const collegeId = Number(actionBtn.dataset.collegeId || 0);
        if (!collegeId) return;
        if (!hasRole(['super_admin'])) {
          throw new Error('Only super admin can edit college');
        }
        const college = superAdminColleges.find((row) => Number(row.id) === collegeId);
        if (!college) {
          throw new Error('College not found');
        }
        await openSuperAdminCollegeModal(college);
      } else if (action === 'sa-college-remove') {
        const collegeId = Number(actionBtn.dataset.collegeId || 0);
        if (!collegeId) return;
        if (!hasRole(['super_admin'])) {
          throw new Error('Only super admin can remove colleges');
        }
        const confirmed = await confirmAction({
          title: 'Remove College',
          body: 'This will disable logins for this college and move it to the archive. Continue?'
        });
        if (!confirmed) return;
        await apiRequest('colleges_remove', 'POST', { college_id: collegeId });
        showToast('College removed', 'success');
        superAdminCollegesActiveList = null;
        superAdminCollegesAllList = null;
        showArchivedColleges = true;
        await loadCollegesManagement();
        await loadSuperAdminUsers();
      } else if (action === 'sa-college-restore') {
        const collegeId = Number(actionBtn.dataset.collegeId || 0);
        if (!collegeId) return;
        if (!hasRole(['super_admin'])) {
          throw new Error('Only super admin can restore colleges');
        }
        const confirmed = await confirmAction({
          title: 'Restore College',
          body: 'Restore this college back to the platform? (It will be restored as inactive by default.)'
        });
        if (!confirmed) return;
        await apiRequest('colleges_restore', 'POST', { college_id: collegeId, status: 'inactive' });
        showToast('College restored', 'success');
        superAdminCollegesActiveList = null;
        superAdminCollegesAllList = null;
        showArchivedColleges = false;
        await loadCollegesManagement();
        await loadSuperAdminUsers();
      } else if (action === 'sa-user-save') {
        if (!userId) return;
        if (!hasRole(['super_admin'])) {
          throw new Error('Only super admin can update users');
        }
        const roleEl = document.getElementById(`sa-role-${userId}`);
        const statusEl = document.getElementById(`sa-status-${userId}`);
        const collegeEl = document.getElementById(`sa-college-${userId}`);
        await apiRequest('users_update', 'POST', {
          user_id: userId,
          role: roleEl ? roleEl.value : '',
          status: statusEl ? statusEl.value : '',
          college_id: collegeEl ? collegeEl.value : ''
        });
        showToast('User updated', 'success');
        await loadSuperAdminUsers();
      } else if (action === 'sa-user-delete') {
        if (!userId) return;
        if (!hasRole(['super_admin'])) {
          throw new Error('Only super admin can remove users');
        }
        const confirmed = await confirmAction({
          title: 'Remove User',
          body: 'Are you sure you want to remove this user account?'
        });
        if (!confirmed) return;
        await apiRequest('users_delete', 'POST', { user_id: userId });
        showToast('User removed', 'success');
        await loadSuperAdminUsers();
      } else if (action === 'ca-user-save') {
        if (!userId) return;
        if (!hasRole(['college_admin'])) {
          throw new Error('Only college admin can update this user');
        }
        const statusElId = roleTarget === 'faculty' ? `ca-faculty-status-${userId}` : `ca-student-status-${userId}`;
        const statusEl = document.getElementById(statusElId);
        await apiRequest('college_admin_user_update', 'POST', {
          user_id: userId,
          role: roleTarget,
          status: statusEl ? statusEl.value : ''
        });
        showToast('User updated', 'success');
        if (roleTarget === 'faculty') {
          await loadCollegeAdminFaculty();
        } else {
          await loadCollegeAdminStudents();
        }
      } else if (action === 'ca-user-delete') {
        if (!userId) return;
        if (!hasRole(['college_admin'])) {
          throw new Error('Only college admin can remove this user');
        }
        const confirmed = await confirmAction({
          title: 'Remove User',
          body: 'Are you sure you want to remove this user account?'
        });
        if (!confirmed) return;
        await apiRequest('college_admin_user_delete', 'POST', {
          user_id: userId,
          role: roleTarget
        });
        showToast('User removed', 'success');
        if (roleTarget === 'faculty') {
          await loadCollegeAdminFaculty();
        } else {
          await loadCollegeAdminStudents();
        }
      } else if (action === 'ca-student-edit') {
        if (!userId) return;
        if (!hasRole(['college_admin'])) {
          throw new Error('Only college admin can edit students');
        }
        const row = (collegeAdminStudentsCache || []).find((r) => Number(r.id) === userId);
        if (!row) {
          throw new Error('Student not found');
        }

        const values = await showFormModal({
          title: 'Edit Student',
          description: `ID: ${row.unique_user_id || '-'}`,
          submitText: 'Save Student',
          fields: [
            { name: 'name', label: 'Student Name', required: true, value: String(row.name || ''), colClass: 'col-12 col-md-6' },
            { name: 'email', label: 'Student Email (optional)', type: 'email', value: String(row.email || ''), colClass: 'col-12 col-md-6' },
            { name: 'dept_name', label: 'Department', required: true, value: String(row.dept_name || 'General'), colClass: 'col-12 col-md-6' },
            { name: 'course_name', label: 'Course', required: true, value: String(row.course || 'General'), colClass: 'col-12 col-md-6' },
            { name: 'year', label: 'Year', type: 'number', min: 1, max: 6, required: true, value: String(row.year || 1), colClass: 'col-6 col-md-3' },
            { name: 'semester', label: 'Semester', type: 'number', min: 1, max: 12, required: true, value: String(row.semester || ((Number(row.year || 1) * 2) - 1)), colClass: 'col-6 col-md-3' },
            { name: 'section', label: 'Section', required: true, value: String(row.section || 'A'), colClass: 'col-6 col-md-3' },
            {
              name: 'status',
              label: 'Status',
              type: 'select',
              required: true,
              value: String(row.status || 'active'),
              colClass: 'col-6 col-md-3',
              options: [
                { value: 'active', label: 'active' },
                { value: 'pending', label: 'pending' },
                { value: 'suspended', label: 'suspended' },
              ],
            },
          ],
        });
        if (!values) return;

        await apiRequest('college_admin_student_update', 'POST', {
          user_id: userId,
          name: String(values.name || '').trim(),
          email: String(values.email || '').trim(),
          dept_name: String(values.dept_name || '').trim(),
          course_name: String(values.course_name || '').trim(),
          year: Number(values.year || 1),
          semester: Number(values.semester || 1),
          section: String(values.section || '').trim(),
          status: String(values.status || '').trim(),
        });
        showToast('Student updated', 'success');
        await loadCollegeAdminStudents();
      } else if (action === 'ca-faculty-edit') {
        if (!userId) return;
        if (!hasRole(['college_admin'])) {
          throw new Error('Only college admin can edit faculty');
        }
        const row = (collegeAdminFacultyCache || []).find((r) => Number(r.id) === userId);
        if (!row) {
          throw new Error('Faculty not found');
        }

        let deptOptions = [];
        try {
          const deptRes = await apiRequest('departments_list');
          const depts = deptRes.departments || [];
          deptOptions = depts.map((d) => ({ value: String(d.name || ''), label: String(d.name || '') }));
        } catch (_) {
          deptOptions = [];
        }
        const defaultDept = row.dept_name || (deptOptions[0] ? deptOptions[0].value : 'General');

        const values = await showFormModal({
          title: 'Edit Faculty',
          description: `ID: ${row.unique_user_id || '-'}`,
          submitText: 'Save Faculty',
          fields: [
            { name: 'name', label: 'Faculty Name', required: true, value: String(row.name || ''), colClass: 'col-12 col-md-6' },
            { name: 'email', label: 'Faculty Email (optional)', type: 'email', value: String(row.email || ''), colClass: 'col-12 col-md-6' },
            deptOptions.length
              ? {
                name: 'dept_name',
                label: 'Department',
                type: 'select',
                required: true,
                value: String(defaultDept),
                options: deptOptions,
                colClass: 'col-12 col-md-6',
              }
              : { name: 'dept_name', label: 'Department', required: true, value: String(defaultDept), colClass: 'col-12 col-md-6' },
            { name: 'designation', label: 'Designation', value: String(row.designation || ''), colClass: 'col-12 col-md-6' },
            {
              name: 'status',
              label: 'Status',
              type: 'select',
              required: true,
              value: String(row.status || 'active'),
              colClass: 'col-12 col-md-6',
              options: [
                { value: 'active', label: 'active' },
                { value: 'pending', label: 'pending' },
                { value: 'suspended', label: 'suspended' },
              ],
            },
          ],
        });
        if (!values) return;

        await apiRequest('college_admin_faculty_update', 'POST', {
          user_id: userId,
          name: String(values.name || '').trim(),
          email: String(values.email || '').trim(),
          dept_name: String(values.dept_name || '').trim(),
          designation: String(values.designation || '').trim(),
          status: String(values.status || '').trim(),
        });
        showToast('Faculty updated', 'success');
        await loadCollegeAdminFaculty();
      } else if (action === 'archive-restore-user') {
        if (!userId) return;
        if (!hasRole(['college_admin'])) {
          throw new Error('Only college admin can restore users');
        }
        await apiRequest('college_admin_user_update', 'POST', { user_id: userId, role: roleTarget, status: 'active' });
        showToast('User restored', 'success');
        await loadCollegeArchive();
      } else if (action === 'archive-purge-user') {
        if (!userId) return;
        if (!hasRole(['college_admin'])) {
          throw new Error('Only college admin can delete users');
        }
        const confirmed = await confirmAction({
          title: 'Delete User',
          body: 'This will permanently delete the user and related records. Continue?'
        });
        if (!confirmed) return;
        await apiRequest('college_admin_user_purge', 'POST', { user_id: userId, role: roleTarget });
        showToast('User deleted', 'success');
        await loadCollegeArchive();
      } else if (action === 'archive-restore-dept') {
        if (!hasRole(['college_admin'])) {
          throw new Error('Only college admin can restore departments');
        }
        const deptId = Number(actionBtn.dataset.deptId || 0);
        const deptName = String(actionBtn.dataset.deptName || '').trim();
        if (!deptId || !deptName) return;
        await apiRequest('departments_save', 'POST', { id: deptId, name: deptName });
        showToast('Department restored', 'success');
        await loadCollegeArchive();
      } else if (action === 'notice-archive') {
        if (!hasRole(['college_admin'])) {
          throw new Error('Only college admin can archive notices');
        }
        const noticeId = Number(actionBtn.dataset.noticeId || 0);
        if (!noticeId) return;
        const confirmed = await confirmAction({
          title: 'Archive Notice',
          body: 'Archive this notice? It will no longer be visible to students/faculty.'
        });
        if (!confirmed) return;
        await apiRequest('college_admin_notice_archive', 'POST', { notice_id: noticeId });
        showToast('Notice archived', 'success');
        await loadCollegeNotices();
      } else if (action === 'faculty-student-profile') {
        if (!hasRole(['faculty'])) {
          throw new Error('Only faculty can view student profiles');
        }
        if (!userId) return;
        await showFacultyStudentProfile(userId);
      } else if (action === 'start-live-from-today') {
        if (!hasRole(['faculty'])) {
          throw new Error('Only faculty can start live session');
        }
        const isLive = String(actionBtn.dataset.isLive || '') === '1';
        if (!isLive) {
          throw new Error('Selected class is not live right now');
        }
        const courseId = Number(actionBtn.dataset.courseId || 0);
        const subject = String(actionBtn.dataset.subject || '');
        await startFacultySessionByCourseId(courseId, subject, { extraClass: false });
        await Promise.all([
          loadFacultyActiveSession().catch(() => null),
          loadFacultyTodayClasses().catch(() => null),
          loadFacultyRecentSessions().catch(() => null),
        ]);
      } else if (action === 'load-dept-courses') {
        if (!hasRole(['college_admin'])) {
          throw new Error('Only college admin can view courses');
        }
        const deptId = Number(actionBtn.dataset.deptId || 0);
        if (!deptId) return;
        await loadCoursesForDepartment(deptId);
      } else if (action === 'view-course-subjects') {
        if (!hasRole(['college_admin'])) {
          throw new Error('Only college admin can view subjects');
        }
        const courseId = Number(actionBtn.dataset.courseId || 0);
        const courseLabel = String(actionBtn.dataset.courseLabel || 'Course');
        if (!courseId) return;
        await loadCourseSubjects(courseId, courseLabel);
      } else if (action === 'edit-course-subject') {
        if (!hasRole(['college_admin'])) {
          throw new Error('Only college admin can edit subjects');
        }
        if (!selectedCourseIdForSubjects) {
          throw new Error('Select a course first');
        }
        const subjectId = Number(actionBtn.dataset.subjectId || 0);
        if (!subjectId) return;
        const values = await showFormModal({
          title: 'Edit Subject',
          description: `Course: ${selectedCourseLabelForSubjects || '-'}`,
          submitText: 'Save Subject',
          fields: [
            { name: 'subject_name', label: 'Subject Name', value: actionBtn.dataset.subjectName || '', required: true, colClass: 'col-12' },
            { name: 'subject_code', label: 'Subject Code', value: actionBtn.dataset.subjectCode || '', required: true, colClass: 'col-12 col-md-6' },
          ],
        });
        if (!values) return;
        await apiRequest('course_subjects_save', 'POST', {
          id: subjectId,
          course_id: selectedCourseIdForSubjects,
          subject_name: String(values.subject_name || '').trim(),
          subject_code: String(values.subject_code || '').trim().toUpperCase(),
        });
        showToast('Subject updated', 'success');
        await loadCourseSubjects(selectedCourseIdForSubjects, selectedCourseLabelForSubjects);
      } else if (action === 'delete-course-subject') {
        if (!hasRole(['college_admin'])) {
          throw new Error('Only college admin can remove subjects');
        }
        const subjectId = Number(actionBtn.dataset.subjectId || 0);
        if (!subjectId) return;
        const subjectName = String(actionBtn.dataset.subjectName || 'this subject');
        const confirmed = await confirmAction({
          title: 'Remove Subject',
          body: `Are you sure you want to remove ${subjectName}?`,
        });
        if (!confirmed) return;
        await apiRequest('course_subjects_delete', 'POST', { id: subjectId });
        showToast('Subject removed', 'success');
        if (selectedCourseIdForSubjects) {
          await loadCourseSubjects(selectedCourseIdForSubjects, selectedCourseLabelForSubjects);
        }
      } else if (action === 'edit-dept') {
        if (!hasRole(['college_admin'])) {
          throw new Error('Only college admin can edit departments');
        }
        const deptId = Number(actionBtn.dataset.deptId || 0);
        if (!deptId) return;
        const values = await showFormModal({
          title: 'Edit Department',
          description: 'Update department name.',
          submitText: 'Save Department',
          fields: [
            { name: 'dept_name', label: 'Department Name', value: actionBtn.dataset.deptName || '', required: true }
          ]
        });
        if (!values) return;
        await apiRequest('departments_save', 'POST', {
          id: deptId,
          name: String(values.dept_name || '').trim()
        });
        showToast('Department updated', 'success');
        await loadDepartmentsAndCourses();
      } else if (action === 'delete-dept') {
        if (!hasRole(['college_admin'])) {
          throw new Error('Only college admin can remove departments');
        }
        const deptId = Number(actionBtn.dataset.deptId || 0);
        if (!deptId) return;
        const deptName = String(actionBtn.dataset.deptName || 'this department');
        const confirmed = await confirmAction({
          title: 'Remove Department',
          body: `Are you sure you want to remove ${deptName}?`
        });
        if (!confirmed) return;
        await apiRequest('departments_delete', 'POST', { id: deptId });
        showToast('Department removed', 'success');
        selectedDeptIdForCourses = 0;
        await loadDepartmentsAndCourses();
      } else if (action === 'edit-course') {
        if (!hasRole(['college_admin'])) {
          throw new Error('Only college admin can edit courses');
        }
        const courseId = Number(actionBtn.dataset.courseId || 0);
        const deptId = Number(actionBtn.dataset.deptId || 0);
        if (!courseId || !deptId) return;
        const values = await showFormModal({
          title: 'Edit Course',
          description: 'Update course details.',
          submitText: 'Save Course',
          fields: [
            { name: 'course_name', label: 'Course Name', value: actionBtn.dataset.courseName || '', required: true, colClass: 'col-12 col-md-6' },
            { name: 'year', label: 'Year', type: 'number', min: 1, max: 4, value: actionBtn.dataset.year || '1', required: true, colClass: 'col-6 col-md-3' },
            { name: 'semester', label: 'Semester', type: 'number', min: 1, max: 8, value: actionBtn.dataset.semester || '1', required: true, colClass: 'col-6 col-md-3' },
            { name: 'section', label: 'Section', value: actionBtn.dataset.section || 'A', required: true, colClass: 'col-6 col-md-3' }
          ]
        });
        if (!values) return;
        await apiRequest('courses_save', 'POST', {
          id: courseId,
          dept_id: deptId,
          course_name: String(values.course_name || '').trim(),
          year: Number(values.year || 1),
          semester: Number(values.semester || ((Number(values.year || 1) * 2) - 1)),
          section: String(values.section || '').trim()
        });
        showToast('Course updated', 'success');
        await loadCoursesForDepartment(deptId);
      } else if (action === 'delete-course') {
        if (!hasRole(['college_admin'])) {
          throw new Error('Only college admin can remove courses');
        }
        const courseId = Number(actionBtn.dataset.courseId || 0);
        const deptId = Number(actionBtn.dataset.deptId || 0);
        if (!courseId || !deptId) return;
        const courseName = String(actionBtn.dataset.courseName || 'this course');
        const confirmed = await confirmAction({
          title: 'Remove Course',
          body: `Are you sure you want to remove ${courseName}?`
        });
        if (!confirmed) return;
        await apiRequest('courses_delete', 'POST', { id: courseId });
        showToast('Course removed', 'success');
        await loadCoursesForDepartment(deptId);
      } else if (action === 'tt-row-edit') {
        if (!hasRole(['college_admin'])) {
          throw new Error('Only college admin can edit timetable');
        }
        const timetableId = Number(actionBtn.dataset.ttId || 0);
        if (!timetableId) return;
        const facultyRes = await apiRequest('college_admin_faculty_list');
        const facultyRows = (facultyRes.faculty || []).slice().sort((a, b) => {
          const da = String(a.dept_name || '');
          const db = String(b.dept_name || '');
          if (da !== db) return da.localeCompare(db, undefined, { sensitivity: 'base' });
          return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
        });
        if (!facultyRows.length) {
          throw new Error('No faculty found for this college');
        }

        const currentCourseName = actionBtn.dataset.courseName || '';
        const currentDeptName = actionBtn.dataset.deptName || 'CSE';
        const currentYear = Number(actionBtn.dataset.year || 1);
        const currentSemester = Number(actionBtn.dataset.semester || ((currentYear * 2) - 1));
        const currentSection = actionBtn.dataset.section || 'A';
        const currentFacultyUid = actionBtn.dataset.facultyUid || '';
        const currentSubject = actionBtn.dataset.subject || currentCourseName;
        const currentDay = Number(actionBtn.dataset.day || 1);
        const currentStart = actionBtn.dataset.start || '09:00:00';
        const currentEnd = actionBtn.dataset.end || '10:00:00';
        const values = await showFormModal({
          title: 'Edit Timetable Row',
          description: 'Update timetable details.',
          submitText: 'Save Row',
          fields: [
            { name: 'dept_name', label: 'Department Name', value: currentDeptName, required: true, colClass: 'col-12 col-md-6' },
            { name: 'course_name', label: 'Course Name', value: currentCourseName || 'General', required: true, colClass: 'col-12 col-md-6' },
            { name: 'year', label: 'Year', type: 'number', min: 1, max: 4, value: String(currentYear || 1), required: true, colClass: 'col-6 col-md-3' },
            { name: 'semester', label: 'Semester', type: 'number', min: 1, max: 8, value: String(currentSemester || 1), required: true, colClass: 'col-6 col-md-3' },
            { name: 'section', label: 'Section', value: currentSection || 'A', required: true, colClass: 'col-6 col-md-3' },
            {
              name: 'faculty_unique_id',
              label: 'Faculty',
              type: 'select',
              value: currentFacultyUid,
              required: true,
              colClass: 'col-12 col-md-6',
              options: facultyRows.map((f) => ({
                value: String(f.unique_user_id || ''),
                label: `${f.name || 'Faculty'} (${f.unique_user_id || '-'}) • ${f.dept_name || 'No Department'}`,
              })),
            },
            { name: 'day_of_week', label: 'Day of Week (1-7)', type: 'number', min: 1, max: 7, value: String(currentDay || 1), required: true, colClass: 'col-6 col-md-3' },
            { name: 'start_time', label: 'Start Time (HH:MM:SS)', value: currentStart, required: true, colClass: 'col-6 col-md-3' },
            { name: 'end_time', label: 'End Time (HH:MM:SS)', value: currentEnd, required: true, colClass: 'col-6 col-md-3' },
            { name: 'subject', label: 'Subject', value: currentSubject || currentCourseName || 'General', required: true, colClass: 'col-6 col-md-3' }
          ]
        });
        if (!values) return;

        await apiRequest('timetable_update_manual', 'POST', {
          timetable_id: timetableId,
          dept_name: String(values.dept_name || '').trim(),
          course_name: String(values.course_name || '').trim(),
          year: Number(values.year || 1),
          semester: Number(values.semester || ((Number(values.year || 1) * 2) - 1)),
          section: String(values.section || '').trim(),
          faculty_unique_id: String(values.faculty_unique_id || '').trim(),
          day_of_week: Number(values.day_of_week || 1),
          start_time: String(values.start_time || '').trim(),
          end_time: String(values.end_time || '').trim(),
          subject: String(values.subject || '').trim()
        });
        showToast('Timetable row updated', 'success');
        await loadTimetableManagement();
      } else if (action === 'tt-row-delete') {
        if (!hasRole(['college_admin'])) {
          throw new Error('Only college admin can delete timetable');
        }
        const timetableId = Number(actionBtn.dataset.ttId || 0);
        if (!timetableId) return;
        const confirmed = await confirmAction({
          title: 'Delete Timetable Row',
          body: 'Are you sure you want to delete this timetable row?'
        });
        if (!confirmed) return;
        await apiRequest('timetable_delete', 'POST', { timetable_id: timetableId });
        showToast('Timetable row deleted', 'success');
        await loadTimetableManagement();
      }
    } catch (err) {
      showToast(err.message || 'Action failed', 'danger');
    } finally {
      actionBtn.disabled = false;
    }
  });

  // Simple date-time updater
  if (currentDatetimeEl && !window.dateTimeIntervalId) {
    const updateDateTime = () => {
      const now = new Date();
      currentDatetimeEl.textContent = now.toLocaleString();
    };
    updateDateTime();
    window.dateTimeIntervalId = setInterval(updateDateTime, 1000);
  }

  // Header height monitoring
  if (appHeader) {
    window.addEventListener('resize', scheduleAppHeaderOffsetSync);
  }

  // Fullscreen camera overlay (Face Registration + Attendance)
  const cameraFullscreenOverlay = document.getElementById('camera-fullscreen-overlay');
  const cameraFullscreenBody = document.getElementById('camera-fullscreen-body');
  const cameraFullscreenFooter = document.getElementById('camera-fullscreen-footer');
  const cameraFullscreenTitle = document.getElementById('camera-fullscreen-title');
  const cameraFullscreenCloseBtn = document.getElementById('camera-fullscreen-close-btn');
  const fullscreenState = {
    element: null,
    parent: null,
    nextSibling: null,
    companion: null,
    companionParent: null,
    companionNextSibling: null
  };

  function restoreFullscreenNode(element, parent, nextSibling) {
    if (!element || !parent) return;
    if (nextSibling && nextSibling.parentNode === parent) {
      parent.insertBefore(element, nextSibling);
    } else {
      parent.appendChild(element);
    }
  }

  function openCameraFullscreen(targetEl, title = 'Camera', companionEl = null) {
    if (!cameraFullscreenOverlay || !cameraFullscreenBody || !targetEl) return;
    if (fullscreenState.element && fullscreenState.element !== targetEl) {
      restoreFullscreenNode(fullscreenState.element, fullscreenState.parent, fullscreenState.nextSibling);
      fullscreenState.element = null;
      fullscreenState.parent = null;
      fullscreenState.nextSibling = null;
    }
    if (!fullscreenState.element) {
      fullscreenState.element = targetEl;
      fullscreenState.parent = targetEl.parentNode;
      fullscreenState.nextSibling = targetEl.nextSibling;
    }
    if (cameraFullscreenTitle) cameraFullscreenTitle.textContent = title;
    cameraFullscreenBody.appendChild(targetEl);

    if (cameraFullscreenFooter) {
      if (companionEl) {
        if (fullscreenState.companion && fullscreenState.companion !== companionEl) {
          restoreFullscreenNode(fullscreenState.companion, fullscreenState.companionParent, fullscreenState.companionNextSibling);
          fullscreenState.companion = null;
          fullscreenState.companionParent = null;
          fullscreenState.companionNextSibling = null;
        }
        if (!fullscreenState.companion) {
          fullscreenState.companion = companionEl;
          fullscreenState.companionParent = companionEl.parentNode;
          fullscreenState.companionNextSibling = companionEl.nextSibling;
        }
        cameraFullscreenFooter.classList.remove('d-none');
        cameraFullscreenFooter.appendChild(companionEl);
        cameraFullscreenFooter.scrollTop = 0;
      } else {
        if (fullscreenState.companion) {
          restoreFullscreenNode(fullscreenState.companion, fullscreenState.companionParent, fullscreenState.companionNextSibling);
          fullscreenState.companion = null;
          fullscreenState.companionParent = null;
          fullscreenState.companionNextSibling = null;
        }
        cameraFullscreenFooter.classList.add('d-none');
      }
    }

    cameraFullscreenOverlay.classList.remove('d-none');
    cameraFullscreenOverlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('camera-fullscreen-lock');
  }

  function closeCameraFullscreen() {
    if (!cameraFullscreenOverlay || !fullscreenState.element || !fullscreenState.parent) return;
    const {
      element,
      parent,
      nextSibling,
      companion,
      companionParent,
      companionNextSibling
    } = fullscreenState;
    restoreFullscreenNode(element, parent, nextSibling);
    restoreFullscreenNode(companion, companionParent, companionNextSibling);

    if (cameraFullscreenFooter) {
      cameraFullscreenFooter.classList.add('d-none');
    }

    cameraFullscreenOverlay.classList.add('d-none');
    cameraFullscreenOverlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('camera-fullscreen-lock');
    fullscreenState.element = null;
    fullscreenState.parent = null;
    fullscreenState.nextSibling = null;
    fullscreenState.companion = null;
    fullscreenState.companionParent = null;
    fullscreenState.companionNextSibling = null;
  }

  // Make camera fullscreen functions globally accessible for modules
  window.openCameraFullscreen = openCameraFullscreen;
  window.closeCameraFullscreen = closeCameraFullscreen;

  if (cameraFullscreenCloseBtn) {
    cameraFullscreenCloseBtn.addEventListener('click', closeCameraFullscreen);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && fullscreenState.element) {
      closeCameraFullscreen();
    }
  });

  // ========== Face Registration Setup ==========
  // Initialize face registration module and handle UI interactions
  function setupFaceRegistration() {
    const startFaceRegBtn = document.getElementById('start-face-registration-btn');
    const registrationContainer = document.getElementById('registration-container');
    const registrationCameraSection = document.getElementById('registration-camera-section');
    const registrationCameraWrap = document.getElementById('registration-camera-wrap');
    const registrationCameraControls = document.getElementById('registration-camera-controls');

    async function ensureFaceRegistrationReady() {
      const profile = await apiRequest('face_profile');
      studentFaceProfile = profile || null;
      studentFaceRegistered = !!(profile && profile.face_registered);
      updateFaceUpdateLimitUi(studentFaceProfile);

      if (studentFaceRegistered && profile && profile.can_update_face === false) {
        const resetText = formatResetDateForFace(profile.next_reset_at);
        throw new Error(`Monthly face update limit reached. Try again after ${resetText}.`);
      }

      return profile;
    }

    // Initialize face registration module only once
    if (!window.faceRegistrationModule && window.FaceRegistrationModule) {
      window.faceRegistrationModule = new FaceRegistrationModule();
    }

    // Handle start registration button
    if (startFaceRegBtn) {
      startFaceRegBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        try {
          await ensureFaceRegistrationReady();

          // Hide main button, show camera section
          if (registrationContainer) registrationContainer.classList.add('d-none');
          if (registrationCameraSection) registrationCameraSection.classList.remove('d-none');

          // Move camera to fullscreen, with controls in the footer
          if (registrationCameraWrap && window.openCameraFullscreen) {
            window.openCameraFullscreen(registrationCameraWrap, 'Face Registration', registrationCameraControls);
          }

          // Start registration
          if (window.faceRegistrationModule) {
            await window.faceRegistrationModule.startRegistration();
          }
        } catch (error) {
          console.error('Failed to start face registration:', error);
          if (registrationContainer) registrationContainer.classList.remove('d-none');
          if (registrationCameraSection) registrationCameraSection.classList.add('d-none');
          showToast('Failed to start face registration: ' + error.message, 'danger');
        }
      });
    }

    // Define global callback for face registration completion
    window.faceRegistrationCallback = async function (success) {
      if (window.closeCameraFullscreen) {
        window.closeCameraFullscreen();
      }

      if (registrationContainer) registrationContainer.classList.remove('d-none');
      if (registrationCameraSection) registrationCameraSection.classList.add('d-none');

      if (success) {
        studentFaceRegistered = true;
        try {
          await resolveStudentFaceRegistrationStatus();
        } catch (_) {
          studentFaceProfile = {
            ...(studentFaceProfile || {}),
            face_registered: true
          };
          updateFaceUpdateLimitUi(studentFaceProfile);
        }
        showToast('Face registered successfully! You can now mark attendance.', 'success');
        // Navigate to mark attendance after a short delay
        setTimeout(() => {
          if (currentRole === 'student') {
            navigateTo('mark-attendance');
          }
        }, 500);
      } else {
        showToast('Face registration cancelled', 'info');
      }
    };
  }

  // ========== Face Verification Setup ==========
  // Initialize face verification module
  function setupFaceVerification() {
    if (!window.faceVerificationModule && window.FaceVerificationModule) {
      window.faceVerificationModule = new FaceVerificationModule();
    }
  }

  setupFaceRegistration();
  setupFaceVerification();


  // ========== Sequential Attendance Verification Flow ==========
  // Each stage (OTP → Location → Liveness → Face → Result) auto-advances.

  const otpForm = document.getElementById('otp-form');
  const otpInput = document.getElementById('otp-input');
  const otpError = document.getElementById('otp-error');
  const otpSessionPreview = document.getElementById('otp-session-preview');
  const otpPreviewClass = document.getElementById('otp-preview-class');
  const otpPreviewProfessor = document.getElementById('otp-preview-professor');
  const otpPreviewTiming = document.getElementById('otp-preview-timing');
  const attendanceResult = document.getElementById('attendance-result');

  function formatSessionTimeRange(startAt, endAt) {
    const start = new Date(startAt);
    const end = new Date(endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return `${startAt || '-'} to ${endAt || '-'}`;
    }
    return `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} to ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  // Stage elements
  const attStageOtp = document.getElementById('att-stage-otp');
  const attStageLocation = document.getElementById('att-stage-location');
  const attStageFace = document.getElementById('att-stage-face');
  const attStageResult = document.getElementById('att-stage-result');
  const locationSpinner = document.getElementById('location-spinner');
  const locationDoneIcon = document.getElementById('location-done-icon');
  const locationStageTitle = document.getElementById('location-stage-title');
  const locationStageMessage = document.getElementById('location-stage-message');
  const locationStageDetail = document.getElementById('location-stage-detail');
  const resultTitle = document.getElementById('result-title');
  const resultSuccessIcon = document.getElementById('result-success-icon');
  const resultFailIcon = document.getElementById('result-fail-icon');
  const resultDetails = document.getElementById('result-details');
  const resultMatchScore = document.getElementById('result-match-score');
  const resultLocation = document.getElementById('result-location');
  const resultTime = document.getElementById('result-time');
  const attRestartBtn = document.getElementById('att-restart-btn');

  let faceVerificationInProgress = false;
  let otpPreviewTimer = null;
  let maxAttendanceAttempts = 3;
  let studentOtpCountdownInterval = null;

  function startStudentOtpCountdown(expiryTime) {
    if (studentOtpCountdownInterval) clearInterval(studentOtpCountdownInterval);
    const timerEl = document.getElementById('student-otp-timer');
    if (!timerEl) return;

    function update() {
      const now = new Date().getTime();
      const end = new Date(expiryTime).getTime();
      const diff = end - now;
      if (diff <= 0) {
        timerEl.textContent = '00:00';
        clearInterval(studentOtpCountdownInterval);
        hideOtpPreview();
        showOtpError('OTP has expired.');
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    update();
    studentOtpCountdownInterval = setInterval(update, 1000);
  }

  const ALL_ATT_STAGES = [attStageOtp, attStageLocation, attStageFace, attStageResult];
  const VSTEP_NAMES = ['otp', 'location', 'face'];

  // --- Stage management ---
  function showAttStage(stageEl) {
    ALL_ATT_STAGES.forEach(s => { if (s) s.classList.add('d-none'); });
    if (stageEl) {
      stageEl.classList.remove('d-none');
      stageEl.style.animation = 'none';
      void stageEl.offsetHeight;
      stageEl.style.animation = '';
    }
  }

  function setVStepState(stepName, state) {
    const stepEl = document.querySelector(`.verification-step[data-vstep="${stepName}"]`);
    if (!stepEl) return;
    stepEl.classList.remove('vstep-active', 'vstep-completed', 'vstep-failed');
    if (state === 'active') stepEl.classList.add('vstep-active');
    else if (state === 'completed') stepEl.classList.add('vstep-completed');
    else if (state === 'failed') stepEl.classList.add('vstep-failed');
  }

  function setVStepLineDone(afterStepName) {
    const stepEl = document.querySelector(`.verification-step[data-vstep="${afterStepName}"]`);
    if (!stepEl) return;
    const line = stepEl.nextElementSibling;
    if (line && line.classList.contains('vstep-line')) {
      line.classList.add('vstep-line-done');
    }
  }

  function resetAllVSteps() {
    VSTEP_NAMES.forEach(name => setVStepState(name, 'pending'));
    document.querySelectorAll('.vstep-line').forEach(l => l.classList.remove('vstep-line-done'));
  }

  function resetAttendanceFlow() {
    resetAllVSteps();
    setVStepState('otp', 'active');
    showAttStage(attStageOtp);
    activeAttendanceSessionId = null;
    activeAttendanceOtpCode = '';
    faceVerificationInProgress = false;
    if (otpInput) otpInput.value = '';
    if (otpError) otpError.classList.add('d-none');
    hideOtpPreview();
    if (window.faceVerificationModule && typeof window.faceVerificationModule.stopAndClose === 'function') {
      window.faceVerificationModule.stopAndClose();
    }
  }

  if (attStageOtp) {
    setVStepState('otp', 'active');
  }

  function formatCampusDistanceText(details) {
    if (!details) return '';
    const distance = details.distance === null || details.distance === undefined ? null : Number(details.distance);
    const radius = details.radius === null || details.radius === undefined ? null : Number(details.radius);
    if (!Number.isFinite(distance) || !Number.isFinite(radius)) return '';
    return ` (Distance: ${Math.round(distance)}m, Allowed: ${Math.round(radius)}m)`;
  }

  function showOtpError(message) {
    if (otpError) {
      otpError.textContent = message;
      otpError.classList.remove('d-none');
    }
  }

  function hideOtpPreview() {
    if (otpSessionPreview) otpSessionPreview.classList.add('d-none');
  }

  async function loadOtpPreview(otpCode) {
    try {
      activeAttendanceOtpCode = otpCode; // Track current previewed code
      const data = await apiRequest(`otp_preview&otp=${otpCode}`, 'GET');
      if (!data || !data.session) { 
        hideOtpPreview(); 
        showOtpError('Invalid or expired OTP code.');
        return; 
      }
      const session = data.session;
      
      const otpPreviewExtraBadge = document.getElementById('otp-preview-extra-badge');
      const otpPreviewReasonWrap = document.getElementById('otp-preview-reason-wrap');
      const otpPreviewReason = document.getElementById('otp-preview-reason');
      const otpConfirmBtn = document.getElementById('otp-confirm-btn');

      if (otpPreviewClass) {
        const year = session.year ? `Year ${session.year}` : '';
        const semester = session.semester ? ` Sem ${session.semester}` : '';
        const section = session.section ? `-${session.section}` : '';
        otpPreviewClass.textContent = `${session.subject || session.course_name || '-'} (${session.course_name || '-'} ${year}${semester}${section})`;
      }
      
      if (otpPreviewProfessor) otpPreviewProfessor.textContent = session.faculty_name || '-';
      
      if (otpPreviewTiming) {
        if (session.scheduled_start && session.scheduled_end) {
            otpPreviewTiming.textContent = `${session.scheduled_start} to ${session.scheduled_end}`;
        } else {
            otpPreviewTiming.textContent = 'N/A (Extra Class)';
        }
      }

      // Extra Class Info
      if (otpPreviewExtraBadge && otpPreviewReasonWrap && otpPreviewReason) {
        if (session.extra_reason) {
            otpPreviewExtraBadge.classList.remove('d-none');
            otpPreviewReasonWrap.classList.remove('d-none');
            otpPreviewReason.textContent = session.extra_reason;
        } else {
            otpPreviewExtraBadge.classList.add('d-none');
            otpPreviewReasonWrap.classList.add('d-none');
        }
      }

      if (session.otp_expiry) {
        startStudentOtpCountdown(session.otp_expiry);
      }

      if (otpSessionPreview) otpSessionPreview.classList.remove('d-none');

      // Confirmation button logic
      if (otpConfirmBtn) {
        const newBtn = otpConfirmBtn.cloneNode(true);
        otpConfirmBtn.parentNode.replaceChild(newBtn, otpConfirmBtn);
        newBtn.addEventListener('click', async () => {
            newBtn.disabled = true;
            try {
                const submitData = await apiRequest('submit_otp', 'POST', { otp: otpCode });
                if (submitData.already_marked) {
                    showOtpError(submitData.message || 'Already marked.');
                    showToast(submitData.message || 'Already marked', 'warning');
                    return;
                }
                activeAttendanceSessionId = submitData.session_id;
                activeAttendanceOtpCode = otpCode;
                const maxAttempts = Number(submitData.max_attempts);
                maxAttendanceAttempts = (Number.isFinite(maxAttempts) && maxAttempts >= 1) ? Math.max(1, Math.floor(maxAttempts)) : 3;
                
                if (window.faceVerificationModule && typeof window.faceVerificationModule.setVerificationConfig === 'function') {
                    window.faceVerificationModule.setVerificationConfig(submitData);
                }
                
                showToast('✅ Verification starting', 'success');
                if (studentOtpCountdownInterval) clearInterval(studentOtpCountdownInterval);
                await runSequentialVerification();
            } catch (err) {
                showOtpError(err.message || 'Verification failed.');
            } finally {
                newBtn.disabled = false;
            }
        });
      }

    } catch (err) { 
        hideOtpPreview(); 
        showOtpError(err.message || 'Failed to fetch class info.');
    }
  }

  function getCurrentLocation(options = {}) {
    if (!navigator.geolocation) return Promise.reject(new Error('Geolocation not supported'));
    const geoOpts = { enableHighAccuracy: true, timeout: 30000, maximumAge: 60000, ...options };
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = Number(pos.coords.latitude), lng = Number(pos.coords.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) { reject(new Error('Invalid location data')); return; }
          resolve({ latitude: lat, longitude: lng, accuracy: Number(pos.coords.accuracy || 0) });
        },
        (err) => reject(new Error(`${err.name || 'GeolocationError'}: ${err.message || 'Unable to access location'}`)),
        geoOpts
      );
    });
  }

  async function verifySessionLocation(sessionId) {
    try {
      const loc = await getCurrentLocation();
      const res = await apiRequest('verify_location', 'POST', { session_id: sessionId, latitude: loc.latitude, longitude: loc.longitude });
      return { latitude: loc.latitude, longitude: loc.longitude, accuracy: loc.accuracy, distance: res?.distance != null ? Number(res.distance) : null, radius: res?.radius != null ? Number(res.radius) : null };
    } catch (err) {
      const raw = err?.message || '';
      const extra = formatCampusDistanceText(err?.details);
      let msg = raw || 'Location verification failed.';
      if (raw.includes('NotAllowedError') || raw.toLowerCase().includes('permission denied')) msg = 'Location permission denied.';
      else if (extra) msg = `${raw}${extra}`;
      const e = new Error(msg); e.code = 'LOCATION_FAILED'; e.details = err?.details; throw e;
    }
  }

  async function finalizeAttendanceWithLocation(sessionId, loc) {
    return apiRequest('mark_attendance', 'POST', { session_id: sessionId, latitude: loc.latitude, longitude: loc.longitude });
  }

  function formatAttendanceScore(score) {
    const value = Number(score);
    return Number.isFinite(value) ? `${Math.round(value)}%` : '--';
  }

  function formatAttendanceLocationStatus(locationResult) {
    if (!locationResult || typeof locationResult !== 'object') return '--';
    if (Number.isFinite(locationResult.distance) && Number.isFinite(locationResult.radius)) {
      return `${Math.round(locationResult.distance)}m from campus (within ${Math.round(locationResult.radius)}m)`;
    }
    return 'Verified ✓';
  }

  // ===================== FULL SEQUENTIAL VERIFICATION =====================
  async function runSequentialVerification() {
    if (faceVerificationInProgress) return;
    faceVerificationInProgress = true;
    const sessionId = activeAttendanceSessionId;
    try {
      // === Location ===
      setVStepState('otp', 'completed'); setVStepLineDone('otp');
      setVStepState('location', 'active');
      showAttStage(attStageLocation);
      if (locationSpinner) locationSpinner.classList.remove('d-none');
      if (locationDoneIcon) locationDoneIcon.classList.add('d-none');
      if (locationStageTitle) locationStageTitle.textContent = 'Verifying Location...';
      if (locationStageMessage) locationStageMessage.textContent = 'Checking GPS against campus boundaries';

      let verifiedLocation;
      try {
        verifiedLocation = await verifySessionLocation(sessionId);
      } catch (err) {
        setVStepState('location', 'failed');
        if (locationSpinner) locationSpinner.classList.add('d-none');
        if (locationDoneIcon) {
          locationDoneIcon.classList.remove('d-none');
          locationDoneIcon.className = 'bi bi-x-circle-fill text-danger';
          locationDoneIcon.style.fontSize = '2.5rem';
        }
        if (locationStageTitle) locationStageTitle.textContent = 'Location Failed';
        if (locationStageMessage) locationStageMessage.textContent = err.message;
        showToast('Location verification failed', 'danger');
        faceVerificationInProgress = false;
        return;
      }

      const distNote = (Number.isFinite(verifiedLocation.distance) && Number.isFinite(verifiedLocation.radius))
        ? `${Math.round(verifiedLocation.distance)}m from campus (within ${Math.round(verifiedLocation.radius)}m)` : 'Location verified';

      if (locationSpinner) locationSpinner.classList.add('d-none');
      if (locationDoneIcon) {
        locationDoneIcon.classList.remove('d-none');
        locationDoneIcon.className = 'bi bi-geo-alt-fill text-success';
        locationDoneIcon.style.fontSize = '2.5rem';
      }
      if (locationStageTitle) locationStageTitle.textContent = 'Location Verified ✓';
      if (locationStageMessage) locationStageMessage.textContent = distNote;
      await new Promise(r => setTimeout(r, 800));

      // === Face Verification ===
      setVStepState('location', 'completed'); setVStepLineDone('location');
      setVStepState('face', 'active');
      showAttStage(attStageFace);

      if (window.faceVerificationModule) {
        await window.faceVerificationModule.startVerification(sessionId, currentUser?.id, {
          max_attempts: maxAttendanceAttempts,
          onSuccess: async (faceResult) => {
            try {
              const marked = await finalizeAttendanceWithLocation(sessionId, verifiedLocation);
              setVStepState('face', 'completed'); setVStepLineDone('face');
              const score = formatAttendanceScore(marked?.match_score ?? faceResult?.match_score);
              const loc = marked.location_configured ? (marked.location_verified ? 'Verified ✓' : 'Not verified') : 'Not configured';
              showSuccessResult(score, loc);
              showToast('Attendance marked!', 'success');
              activeAttendanceSessionId = null;
              activeAttendanceOtpCode = '';
              loadAttendanceHistory();
            } catch (err) {
              showFailResult(
                `Face verified, but attendance could not be finalized. ${err.message || 'Failed to finalize attendance.'}`,
                {
                  titleText: 'Attendance Finalization Failed',
                  scoreText: formatAttendanceScore(faceResult?.match_score),
                  locationText: formatAttendanceLocationStatus(verifiedLocation),
                }
              );
            } finally {
              if (window.faceVerificationModule && typeof window.faceVerificationModule.stopAndClose === 'function') {
                window.faceVerificationModule.stopAndClose();
              }
              faceVerificationInProgress = false;
            }
          },
          onFailure: (err) => {
            setVStepState('face', 'failed');
            showFailResult(
              err.message || (err.type === 'LOCKED'
                ? 'Maximum attempts reached. Attendance locked.'
                : 'Face verification failed.'),
              {
                scoreText: formatAttendanceScore(err?.result?.match_score ?? err?.match_score),
                locationText: formatAttendanceLocationStatus(verifiedLocation),
              }
            );
            activeAttendanceSessionId = null;
            activeAttendanceOtpCode = '';
            if (window.faceVerificationModule && typeof window.faceVerificationModule.stopAndClose === 'function') {
              window.faceVerificationModule.stopAndClose();
            }
            faceVerificationInProgress = false;
          }
        });
        return;
      }

      // Legacy fallback (should ideally be unreachable)
      throw new Error('Face verification module not initialized.');

    } catch (err) {
      setVStepState('face', 'failed');
      showFailResult(err.message || 'Verification failed.');
      showToast('Verification failed', 'danger');
      activeAttendanceSessionId = null;
      activeAttendanceOtpCode = '';
    } finally {
      // This is handled in the callbacks if module exists, 
      // but if an error happens before that (e.g. in location), we need it here.
      if (!window.faceVerificationModule) {
        faceVerificationInProgress = false;
      }
    }
  }

  function showSuccessResult(scoreText, locationText) {
    showAttStage(attStageResult);
    if (resultSuccessIcon) resultSuccessIcon.classList.remove('d-none');
    if (resultFailIcon) resultFailIcon.classList.add('d-none');
    if (resultTitle) resultTitle.textContent = 'Attendance Marked Successfully';
    if (attendanceResult) { attendanceResult.textContent = 'Your attendance has been recorded.'; attendanceResult.className = 'small mb-3 text-success'; }
    if (resultDetails) resultDetails.classList.remove('d-none');
    if (resultMatchScore) resultMatchScore.textContent = scoreText || '--';
    if (resultLocation) resultLocation.textContent = locationText || '--';
    if (resultTime) resultTime.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function showFailResult(message, details = null) {
    showAttStage(attStageResult);
    if (resultSuccessIcon) resultSuccessIcon.classList.add('d-none');
    if (resultFailIcon) resultFailIcon.classList.remove('d-none');
    if (resultTitle) resultTitle.textContent = details?.titleText || 'Verification Failed';
    if (attendanceResult) { attendanceResult.textContent = message; attendanceResult.className = 'small mb-3 text-danger'; }
    const scoreText = typeof details?.scoreText === 'string' ? details.scoreText : '--';
    const locationText = typeof details?.locationText === 'string' ? details.locationText : '--';
    const timeText = typeof details?.timeText === 'string' ? details.timeText : '--';
    const hasDetails = scoreText !== '--' || locationText !== '--' || timeText !== '--';
    if (resultDetails) {
      resultDetails.classList.toggle('d-none', !hasDetails);
    }
    if (resultMatchScore) resultMatchScore.textContent = scoreText;
    if (resultLocation) resultLocation.textContent = locationText;
    if (resultTime) resultTime.textContent = timeText;
  }

  // ===================== EVENT LISTENERS =====================
  if (otpInput) {
    otpInput.addEventListener('input', () => {
      const v = otpInput.value.trim();
      if (otpPreviewTimer) { clearTimeout(otpPreviewTimer); otpPreviewTimer = null; }
      if (!/^\d{6}$/.test(v)) { hideOtpPreview(); return; }
      otpPreviewTimer = setTimeout(() => loadOtpPreview(v), 200);
    });
  }

  if (otpForm) {
    otpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (otpError) otpError.classList.add('d-none');
      
      const value = otpInput ? otpInput.value.trim() : '';
      if (value.length !== 6) { showOtpError('Please enter a valid 6-digit OTP.'); return; }
      if (isNaN(Number(value))) { showOtpError('OTP must be numeric.'); return; }

      // If preview is already visible for THIS otp, just trigger the confirmation
      if (otpSessionPreview && !otpSessionPreview.classList.contains('d-none') && activeAttendanceOtpCode === value) {
        const confirmBtn = document.getElementById('otp-confirm-btn');
        if (confirmBtn) {
            confirmBtn.click();
            return;
        }
      }

      const btn = otpForm.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      try {
        await loadOtpPreview(value);
        activeAttendanceOtpCode = value; // Store it here so we know the preview is for this code
      } catch (err) { 
        showOtpError(err.message || 'Failed to validate OTP.'); 
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  if (attRestartBtn) {
    attRestartBtn.addEventListener('click', () => resetAttendanceFlow());
  }

  // Session expired demo (not wired to real auth)
  const sessionReloginBtn = document.getElementById('session-relogin-btn');
  if (sessionReloginBtn) {
    sessionReloginBtn.addEventListener('click', () => {
      const modal = bootstrap.Modal.getInstance(document.getElementById('sessionExpiredModal'));
      modal && modal.hide();
      currentUser = null;
      currentRole = null;
      appShell.classList.add('d-none');
      loginPage.classList.remove('d-none');
      syncUrlForRoute(LOGIN_ROUTE_KEY, { replaceHistory: true });
      setDocumentTitle(LOGIN_ROUTE_KEY);
    });
  }

  // Confirm dialog helper
  const confirmModalEl = document.getElementById('confirmModal');
  const confirmTitleEl = document.getElementById('confirmModalTitle');
  const confirmBodyEl = document.getElementById('confirmModalBody');
  const confirmBtn = document.getElementById('confirmModalConfirmBtn');
  const confirmModal = confirmModalEl ? new bootstrap.Modal(confirmModalEl) : null;

  function showConfirm(options) {
    if (!confirmModal || !options) return;
    const { title, body, onConfirm } = options;
    confirmAction({ title, body }).then((ok) => {
      if (ok && typeof onConfirm === 'function') {
        onConfirm(true);
      }
    });
  }

  function confirmAction(options) {
    if (!confirmModal || !confirmModalEl || !confirmBtn) {
      return Promise.resolve(false);
    }
    const title = options && options.title ? options.title : 'Confirm Action';
    const body = options && options.body ? options.body : 'Are you sure you want to proceed?';
    confirmTitleEl.textContent = title;
    confirmBodyEl.textContent = body;

    return new Promise((resolve) => {
      let confirmed = false;
      const cleanup = () => {
        confirmBtn.removeEventListener('click', onConfirmClick);
        confirmModalEl.removeEventListener('hidden.bs.modal', onHidden);
      };
      const onConfirmClick = () => {
        confirmed = true;
        cleanup();
        confirmModal.hide();
        resolve(true);
      };
      const onHidden = () => {
        if (document.activeElement instanceof HTMLElement && confirmModalEl.contains(document.activeElement)) {
          document.activeElement.blur();
        }
        cleanup();
        if (!confirmed) {
          resolve(false);
        }
      };
      confirmBtn.addEventListener('click', onConfirmClick);
      confirmModalEl.addEventListener('hidden.bs.modal', onHidden);
      confirmModal.show();
    });
  }

  // Use confirm dialog for ending an active faculty session
  const endSessionBtn = document.getElementById('end-session-btn');
  if (endSessionBtn) {
    endSessionBtn.addEventListener('click', () => {
      showConfirm({
        title: 'End Attendance Session',
        body: 'Are you sure you want to end the current attendance session? Students will no longer be able to mark attendance.',
        onConfirm: async () => {
          if (!facultyActiveSessionId) {
            showToast('No active session found', 'warning');
            return;
          }
          try {
            await apiRequest('end_session', 'POST', { session_id: facultyActiveSessionId });
            facultyActiveSessionId = null;
            renderFacultyActiveSession(null);
            showToast('Session ended', 'success');
          } catch (err) {
            showToast(err.message || 'Failed to end session', 'danger');
          }
        }
      });
    });
  }

  if (filterRangeEl) {
    filterRangeEl.addEventListener('change', () => applyRangeDefaults(filterRangeEl, filterFromEl, filterToEl));
  }
  if (adminFilterRangeEl) {
    adminFilterRangeEl.addEventListener('change', () => applyRangeDefaults(adminFilterRangeEl, adminFilterFromEl, adminFilterToEl));
  }
  [adminFilterDeptEl, adminFilterYearEl, adminFilterSemesterEl].filter(Boolean).forEach((selectEl) => {
    selectEl.addEventListener('change', () => {
      loadAdminCriteriaFilters()
        .then(() => loadCollegeAdminAttendanceReports())
        .catch((err) => showToast(err.message || 'Failed to load attendance reports', 'danger'));
    });
  });
  if (adminFilterSectionEl) {
    adminFilterSectionEl.addEventListener('change', () => {
      loadCollegeAdminAttendanceReports().catch((err) => showToast(err.message || 'Failed to load attendance reports', 'danger'));
    });
  }
  if (adminExportPdfBtn) {
    adminExportPdfBtn.addEventListener('click', (e) => {
      e.preventDefault();
      exportAdminCriteriaPdf();
    });
  }
  if (attendanceFilterForm) {
    attendanceFilterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (currentRole === 'faculty') {
        await loadFacultyAttendanceHistoryView().catch((err) => showToast(err.message || 'Failed to load attendance history', 'danger'));
      } else if (currentRole === 'student') {
        loadAttendanceHistory();
      }
    });
  }
  if (adminAttendanceFilterForm) {
    adminAttendanceFilterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await loadCollegeAdminAttendanceReports().catch((err) => showToast(err.message || 'Failed to load attendance reports', 'danger'));
    });
  }

  // Student attendance history rendering
  const historyTableBody = document.getElementById('attendance-history-table');
  const noHistoryState = document.getElementById('no-history');

  function statusBadge(status) {
    if (status === 'present') {
      return 'bg-success-subtle text-success-emphasis';
    }
    if (status === 'rejected') {
      return 'bg-danger-subtle text-danger-emphasis';
    }
    return 'bg-secondary-subtle text-secondary-emphasis';
  }

  function loadAttendanceHistory() {
    if (!historyTableBody || !noHistoryState || currentRole !== 'student') {
      return;
    }
    const tableHead = historyTableBody.closest('table')?.querySelector('thead tr');
    if (tableHead) {
      tableHead.innerHTML = `
	          <th>Date</th>
	          <th>Subject / Class</th>
	          <th>Status</th>
	          <th>Match Score</th>
	          <th>Location</th>
	        `;
    }

    apiRequest('attendance_history')
      .then((data) => {
        const records = data.records || [];
        historyTableBody.innerHTML = '';

        if (!records.length) {
          noHistoryState.classList.remove('d-none');
          return;
        }

        noHistoryState.classList.add('d-none');
        records.forEach((record) => {
          const row = document.createElement('tr');
          const when = new Date(record.timestamp);
          const matchScore = record.match_score === null ? '--' : `${Math.round(Number(record.match_score))}%`;
          let locationText = '-';
          if (String(record.status || '').toLowerCase() === 'present') {
            const configured = Number(record.location_configured || 0) === 1;
            const verified = Number(record.location_verified || 0) === 1;
            locationText = verified ? 'Verified' : (configured ? 'Not verified' : 'Not configured');
          }
          row.innerHTML = `
	              <td>${Number.isNaN(when.getTime()) ? record.timestamp : when.toLocaleDateString()}</td>
	              <td>${record.subject || '-'}</td>
	              <td><span class="badge ${statusBadge(record.status)}">${record.status}</span></td>
	              <td>${matchScore}</td>
	              <td>${locationText}</td>
	            `;
          historyTableBody.appendChild(row);
        });
      })
      .catch(() => {
        historyTableBody.innerHTML = '';
        noHistoryState.classList.remove('d-none');
      });
  }

  function applyRangeDefaults(rangeEl, fromEl, toEl) {
    if (!rangeEl || !fromEl || !toEl) return;
    const today = new Date();
    const toDate = today.toISOString().slice(0, 10);
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const yDate = y.toISOString().slice(0, 10);
    if (rangeEl.value === 'yesterday') {
      fromEl.value = yDate;
      toEl.value = yDate;
    } else if (rangeEl.value === 'today') {
      fromEl.value = toDate;
      toEl.value = toDate;
    } else if (rangeEl.value === 'all') {
      fromEl.value = '';
      toEl.value = '';
    }
  }

  function renderStaffAttendanceRows(rows) {
    if (!historyTableBody || !noHistoryState) return;
    const tableHead = historyTableBody.closest('table')?.querySelector('thead tr');
    if (tableHead) {
      tableHead.innerHTML = `
          <th>Date</th>
          <th>Time</th>
          <th>Class</th>
          <th>Student</th>
          <th>Status</th>
          <th>Face Match</th>
          <th>Location</th>
          <th>Faculty</th>
        `;
    }

    historyTableBody.innerHTML = '';
    if (!rows.length) {
      noHistoryState.classList.remove('d-none');
      return;
    }
    noHistoryState.classList.add('d-none');
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      const dateText = row.session_date || '-';
      let timeText = '-';
      if (row.attendance_timestamp) {
        const rawTs = String(row.attendance_timestamp);
        const parts = rawTs.split(' ');
        timeText = parts.length > 1 ? (parts[1] || rawTs) : rawTs;
      }
      const reasonText = row.extra_reason ? ` [Extra: ${row.extra_reason}]` : '';
      const cls = `${row.subject || row.course_name || '-'}${reasonText} (${row.course_name || '-'} • Y${row.year || '-'}-S${row.semester || '-'}-${row.section || '-'})`;
      const student = `${row.student_name || '-'} (${row.student_unique_id || '-'})`;
      const status = row.attendance_status === 'present' ? 'present' : 'absent';
      const score = row.match_score === null ? '--' : `${Math.round(Number(row.match_score || 0))}%`;
      let locationText = '-';
      if (status === 'present') {
        const lv = row.location_verified;
        locationText = (Number(lv || 0) === 1) ? 'Verified' : 'Not verified';
      }
      tr.innerHTML = `
          <td>${dateText}</td>
          <td>${timeText}</td>
          <td>${cls}</td>
          <td>${student}</td>
          <td><span class="badge ${status === 'present' ? 'bg-success-subtle text-success-emphasis' : 'bg-danger-subtle text-danger-emphasis'}">${status}</span></td>
          <td>${score}</td>
          <td>${locationText}</td>
          <td>${row.faculty_name || '-'}</td>
        `;
      historyTableBody.appendChild(tr);
    });
  }

  async function loadFacultyAttendanceHistoryView() {
    if (currentRole !== 'faculty') return;
    const mode = filterRangeEl?.value || 'today';
    const params = new URLSearchParams({ mode });
    if (filterFromEl?.value) params.set('from', filterFromEl.value);
    if (filterToEl?.value) params.set('to', filterToEl.value);
    const data = await apiRequest(`attendance_records_view&${params.toString()}`);
    renderStaffAttendanceRows(data.rows || []);
  }

  async function loadCollegeAdminAttendanceReports() {
    if (currentRole !== 'college_admin' || !adminReportsBody) return;
    const mode = adminFilterRangeEl?.value || 'today';
    const params = new URLSearchParams({ mode });
    if (adminFilterFromEl?.value) params.set('from', adminFilterFromEl.value);
    if (adminFilterToEl?.value) params.set('to', adminFilterToEl.value);
    if (adminFilterDeptEl?.value) params.set('dept_id', adminFilterDeptEl.value);
    if (adminFilterYearEl?.value) params.set('year', adminFilterYearEl.value);
    if (adminFilterSemesterEl?.value) params.set('semester', adminFilterSemesterEl.value);
    if (adminFilterSectionEl?.value) params.set('section', adminFilterSectionEl.value);

    const data = await apiRequest(`attendance_semester_criteria&${params.toString()}`);
    const rows = data.rows || [];
    adminCriteriaRowsCache = rows;
    adminReportsBody.innerHTML = '';
    if (!rows.length) {
      if (noAdminReports) noAdminReports.classList.remove('d-none');
    } else {
      if (noAdminReports) noAdminReports.classList.add('d-none');
    }
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      const student = `${row.student_name || '-'} (${row.student_unique_id || '-'})`;
      const cls = `${row.dept_name || '-'} Class`;
      const p = Number(row.percent || 0);
      const badge = p >= 75
        ? '<span class="badge bg-success-subtle text-success-emphasis">75%+ (Eligible)</span>'
        : '<span class="badge bg-danger-subtle text-danger-emphasis">Below 75%</span>';
      tr.innerHTML = `
          <td>${student}</td>
          <td>${cls}</td>
          <td>${Number(row.present_count || 0)}/${Number(row.total_sessions || 0)}</td>
          <td>${Math.round(p)}%</td>
          <td>${badge}</td>
          <td>${row.dept_name || '-'}</td>
          <td>Y${row.year || '-'} / Sem ${row.semester || '-'}</td>
          <td>${row.section || '-'}</td>
        `;
      adminReportsBody.appendChild(tr);
    });
    const summary = data.summary || {};
    if (adminPresentCountEl) adminPresentCountEl.textContent = String(Number(summary.eligible_count || 0));
    if (adminAbsentCountEl) adminAbsentCountEl.textContent = String(Number(summary.below_75_count || 0));
    if (adminTotalCountEl) adminTotalCountEl.textContent = String(Number(summary.total_students || 0));
  }

  if (adminExportCsvBtn) {
    adminExportCsvBtn.addEventListener('click', () => {
      if (!adminCriteriaRowsCache || !adminCriteriaRowsCache.length) {
        showToast('No data to export', 'warning');
        return;
      }
      const headers = ['Student Name', 'Student ID', 'Department', 'Year', 'Semester', 'Section', 'Present', 'Total', 'Percent', 'Status'];
      const csvRows = adminCriteriaRowsCache.map(row => [
        row.student_name,
        row.student_unique_id,
        row.dept_name,
        row.year,
        row.semester,
        row.section,
        row.present_count,
        row.total_sessions,
        Math.fround(row.percent).toFixed(2) + '%',
        row.percent >= 75 ? 'Eligible' : 'Low Attendance'
      ]);
      downloadCSV('Attendance_Report', headers, csvRows);
    });
  }

  if (exportAttendanceBtn) {
    exportAttendanceBtn.addEventListener('click', async () => {
      const mode = filterRangeEl?.value || 'all';
      const params = new URLSearchParams({ mode });
      if (filterFromEl?.value) params.set('from', filterFromEl.value);
      if (filterToEl?.value) params.set('to', filterToEl.value);

      const data = await apiRequest(`attendance_records_view&${params.toString()}`);
      const rows = data.rows || [];
      if (!rows.length) {
        showToast('No records found to export', 'info');
        return;
      }
      const headers = ['Date', 'Time', 'Subject/Class', 'Student', 'Status', 'Face Match', 'Location', 'Faculty'];
      const csvRows = rows.map(row => [
        row.session_date,
        row.attendance_timestamp ? row.attendance_timestamp.split(' ').pop() : '-',
        `${row.subject || row.course_name} (Y${row.year}-S${row.semester}-${row.section})`,
        `${row.student_name} (${row.student_unique_id})`,
        row.attendance_status,
        row.match_score ? Math.round(row.match_score) + '%' : '--',
        row.location_verified == 1 ? 'Verified' : 'Not verified',
        row.faculty_name
      ]);
      downloadCSV('Attendance_History', headers, csvRows);
    });
  }

  function downloadCSV(filename, headers, rows) {
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  function setSelectFromValues(selectEl, values, allLabel) {
    if (!selectEl) return;
    const current = String(selectEl.value || '');
    const unique = Array.from(new Set((values || []).map((v) => String(v || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    selectEl.innerHTML = '';
    const allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = allLabel;
    selectEl.appendChild(allOpt);
    unique.forEach((value) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      selectEl.appendChild(opt);
    });
    if (unique.includes(current)) {
      selectEl.value = current;
    }
  }

  async function loadAdminCriteriaFilters() {
    if (currentRole !== 'college_admin') return;
    const params = new URLSearchParams();
    if (adminFilterDeptEl?.value) params.set('dept_id', adminFilterDeptEl.value);
    if (adminFilterYearEl?.value) params.set('year', adminFilterYearEl.value);
    if (adminFilterSemesterEl?.value) params.set('semester', adminFilterSemesterEl.value);
    const qs = params.toString();
    const data = await apiRequest(qs ? `attendance_criteria_filters&${qs}` : 'attendance_criteria_filters');
    const filters = data.filters || {};
    if (adminFilterDeptEl) {
      const current = String(adminFilterDeptEl.value || '');
      adminFilterDeptEl.innerHTML = '<option value="">All Departments</option>';
      (filters.departments || []).forEach((dept) => {
        const opt = document.createElement('option');
        opt.value = String(dept.id);
        opt.textContent = dept.name || `Department ${dept.id}`;
        adminFilterDeptEl.appendChild(opt);
      });
      if (current) adminFilterDeptEl.value = current;
    }
    setSelectFromValues(adminFilterYearEl, filters.years || [], 'All Years');
    setSelectFromValues(adminFilterSemesterEl, filters.semesters || [], 'All Semesters');
    setSelectFromValues(adminFilterSectionEl, filters.sections || [], 'All Sections');
  }

  function exportAdminCriteriaPdf() {
    if (!adminCriteriaRowsCache.length) {
      showToast('No report data to export', 'warning');
      return;
    }
    const htmlRows = adminCriteriaRowsCache.map((row) => {
      const p = Number(row.percent || 0);
      const label = p >= 75 ? 'Eligible (>=75%)' : 'Below 75%';
      return `
          <tr>
            <td>${row.student_name || '-'}</td>
            <td>${row.student_unique_id || '-'}</td>
            <td>${row.dept_name || '-'}</td>
            <td>${row.year || '-'}</td>
            <td>${row.semester || '-'}</td>
            <td>${row.section || '-'}</td>
            <td>${row.present_count || 0}/${row.total_sessions || 0}</td>
            <td>${Math.round(p)}%</td>
            <td>${label}</td>
          </tr>
        `;
    }).join('');

    const win = window.open('', '_blank');
    if (!win) {
      showToast('Popup blocked. Allow popups to export PDF.', 'warning');
      return;
    }
    win.document.write(`
        <html>
          <head>
            <title>Attendance Criteria Report</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 16px; }
              h2 { margin: 0 0 12px; }
              table { width: 100%; border-collapse: collapse; font-size: 12px; }
              th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }
              th { background: #f3f3f3; }
            </style>
          </head>
          <body>
            <h2>Attendance Criteria Report</h2>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Student ID</th>
                  <th>Department</th>
                  <th>Year</th>
                  <th>Semester</th>
                  <th>Section</th>
                  <th>Present/Total</th>
                  <th>Percent</th>
                  <th>Label</th>
                </tr>
              </thead>
              <tbody>${htmlRows}</tbody>
            </table>
          </body>
        </html>
      `);
    win.document.close();
    win.focus();
    win.print();
  }

  async function restoreSession() {
    try {
      const data = await apiRequest('me');
      if (data.authenticated && data.user) {
        applyAuthenticatedState(data.user, null, { replaceHistory: true });
      } else {
        pendingRouteAfterLogin = readRouteFromLocation();
        setDocumentTitle(LOGIN_ROUTE_KEY);
      }
    } catch (_) {
      setDocumentTitle(LOGIN_ROUTE_KEY);
    }
  }

  async function refreshCurrentUser() {
    try {
      const data = await apiRequest('me');
      if (data.authenticated && data.user) {
        currentUser = createUserContext(data.user);
        currentRole = currentUser.role;
        setupUserContext();
      }
    } catch (_) {
      // Session may have expired; handleAuthRequired() is called inside apiRequest automatically
    }
  }

  restoreSession();

  // ===== RESPONSIVE SIDEBAR HANDLING =====
  const sidebarNav = document.getElementById('sidebar-nav');

  // Close sidebar when a nav link is clicked on mobile
  if (sidebarNav && window.innerWidth < 768) {
    sidebarNav.addEventListener('click', (e) => {
      if (e.target.closest('.nav-link') && sidebar && sidebar.classList.contains('show')) {
        // Use Bootstrap's collapse instance to close
        const bsCollapse = new bootstrap.Collapse(sidebar, { toggle: false });
        bsCollapse.hide();
      }
    });
  }

  // Close sidebar when clicking outside on mobile
  document.addEventListener('click', (e) => {
    if (window.innerWidth < 768 && sidebar && sidebar.classList.contains('show')) {
      // Don't close if clicking on the toggle button or inside sidebar
      if (!e.target.closest('#sidebar') && !e.target.closest('#sidebar-toggle-btn')) {
        const bsCollapse = new bootstrap.Collapse(sidebar, { toggle: false });
        bsCollapse.hide();
      }
    }
  });

  // Handle window resize - close sidebar on larger screens
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.innerWidth >= 768 && sidebar && sidebar.classList.contains('show')) {
        const bsCollapse = new bootstrap.Collapse(sidebar, { toggle: false });
        bsCollapse.hide();
      }
    }, 250);
  });

  // Adjust header layout on very small screens
  function adjustHeaderLayout() {
    if (appHeader) {
      const containerFluid = appHeader.querySelector('.container-fluid');
      if (window.innerWidth < 400) {
        containerFluid?.style.setProperty('gap', '0.1rem', 'important');
      } else if (window.innerWidth < 576) {
        containerFluid?.style.setProperty('gap', '0.15rem', 'important');
      }
    }
  }

  adjustHeaderLayout();
  window.addEventListener('resize', adjustHeaderLayout);
});
