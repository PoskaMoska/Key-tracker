(function () {
  'use strict';
  const API_BASE = '';

  // Вспомогательная функция для показа临时ных уведомлений
  function showToast(message, duration = 2000) {
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #333;
      color: #fff;
      padding: 12px 24px;
      border-radius: 8px;
      z-index: 10000;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      opacity: 0;
      transition: opacity 0.3s ease;
    `;
    document.body.appendChild(toast);

    // Плавное появление
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  const btnLogin = document.getElementById('btn-login'); // Кнопка "Войти" в форме
  const btnLogout = document.getElementById('btn-logout'); // Кнопка "Выйти" в шапке (если добавишь)
  const loginScreen = document.getElementById('login-screen'); // Оверлей входа
  const loginNameInput = document.getElementById('login-name');
   const loginPasswordInput = document.getElementById('login-password');

   const addressSearch = document.getElementById('address-search');
   const addressSearchResults = document.getElementById('address-search-results');
   const zoneSelect = document.getElementById('zone-select');
   const bundleList = document.getElementById('bundle-list');
   const personNameSelect = document.getElementById('person-name');
   const btnTake = document.getElementById('btn-take');
   const selectedBundlesList = document.getElementById('selected-bundles');
   const historySection = document.getElementById('history-section');
   const toggleHistoryBtn = document.getElementById('toggle-history-btn');

  // Current logged in user
  let currentUser = null;
  // Не зберігаємо токен в localStorage - потрібно входити при кожному оновленні
  let authToken = null;
  let zones = [];
  let state = {};
  let people = [];
  let history = [];
  const selectedBundleIds = new Set();
   let currentActivity = 'keys';
   let currentZoneNum = null;

   const zoneAccessData = {}; // zoneNum -> array of addresses
   const zoneDisplayNames = {
    1: '\uD83E\uDDED1 \u0417\u043E\u043D\u0430 -> \u042E\u0433\u043E-\u0437\u0430\u043F\u0430\u0434',
    2: '\uD83D\uDEE52 \u0417\u043E\u043D\u0430 -> \u041C\u0438\u0442\u043D\u0438\u0446\u044F',
    3: '\uD83D\uDEE53 \u0417\u043E\u043D\u0430 -> \u041C\u0438\u0442\u043D\u0438\u0446\u044F',
    4: '\uD83E\uDDED4 \u0417\u043E\u043D\u0430 -> \u042E\u0433\u043E-\u0437\u0430\u043F\u0430\u0434',
    5: '\uD83E\uDDED5 \u0417\u043E\u043D\u0430 -> \u042E\u0433\u043E-\u0437\u0430\u043F\u0430\u0434',
    6: '\u2708\uFE0F6 \u0417\u043E\u043D\u0430 -> \u0421\u0430\u043C\u043E\u043B\u0451\u0442',
    7: '\uD83C\uDFDB7 \u0417\u043E\u043D\u0430 -> \u0426\u0435\u043D\u0442\u0440',
    8: '\uD83C\uDFDB8 \u0417\u043E\u043D\u0430 -> \u0426\u0435\u043D\u0442\u0440',
    9: '\u2693\uFE0F9 \u0417\u043E\u043D\u0430 -> \u0420\u0438\u0447\u043F\u043E\u0440\u0442-\u0421\u0435\u0434\u043E\u0432\u0430',
    10: '\u2693\uFE0F10 \u0417\u043E\u043D\u0430 -> \u0420\u0438\u0447\u043F\u043E\u0440\u0442-\u0421\u0435\u0434\u043E\u0432\u0430',
    11: '\uD83C\uDFED11 \u0417\u043E\u043D\u0430 -> \u0420\u0430\u0439\u043D\u043E \u0414',
    12: '\uD83C\uDF3212 \u0417\u043E\u043D\u0430 -> \u041A\u0430\u0437\u0431\u0435\u0442',
    15: '\uD83D\uDE8915 \u0417\u043E\u043D\u0430 -> \u0412\u043E\u043A\u0437\u0430\u043B',
    16: '\uD83C\uDF3316 \u0417\u043E\u043D\u0430 -> \u0417\u0435\u043B\u0435\u043D\u0430',
    17: '\uD83D\uDCA717 \u0417\u043E\u043D\u0430 -> \u0412\u043E\u0434\u043E\u043A\u0430\u043D\u0430\u043B',
    18: '\uD83E\uDDEA18 \u0417\u043E\u043D\u0430 -> \u0425\u0438\u043C\u043F\u0430\u0441'
  };

   // Store current form mode for cancel functionality
   let currentFormMode = { addNew: false, editIdx: -1 };

   // Address/TKD search state
   let addressSearchQuery = '';
   let accessAddressSearchQuery = '';

  const NO_DATA_TEXT = 'Пока ничего нет';
  const ACCESS_AUDIT_SCOPE = 'access-admin-log-v2';
  let accessAdminLogOpen = false;

  // ========================================
  // LocalStorage - Сохранение данных зон
  // ========================================
  function loadZoneAccessData() {
    try {
      const saved = localStorage.getItem('zoneAccessData');
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.assign(zoneAccessData, parsed);
        console.log('Zone access data loaded from localStorage:', zoneAccessData);
      }
    } catch (e) {
      console.error('Error loading zone access data:', e);
    }
  }

  async function loadZoneAccessDataFromServer() {
    if (!authToken) {
      return;
    }

    try {
      const response = await fetch(API_BASE + '/api/zone-access/full', {
        headers: { 'Authorization': 'Bearer ' + authToken },
      });

      if (!response.ok) {
        throw new Error('Failed to load zone access data');
      }

      const data = await response.json();
      Object.keys(zoneAccessData).forEach((key) => delete zoneAccessData[key]);
      Object.assign(zoneAccessData, data || {});
      localStorage.setItem('zoneAccessData', JSON.stringify(zoneAccessData));
      console.log('Zone access data loaded from server:', zoneAccessData);
    } catch (error) {
      console.error('Error loading zone access data from server:', error);
    }
  }

  function saveZoneAccessData() {
    try {
      localStorage.setItem('zoneAccessData', JSON.stringify(zoneAccessData));
      console.log('Zone access data saved to localStorage');
    } catch (e) {
      console.error('Error saving zone access data:', e);
    }

    if (authToken) {
      fetch(API_BASE + '/api/zone-access', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken,
        },
        body: JSON.stringify(zoneAccessData),
      }).catch((error) => {
        console.error('Error saving zone access data to server:', error);
      });
    }

    renderAccessAdminLog();
  }

  function exportZoneAccessData() {
    try {
      const snapshot = JSON.parse(JSON.stringify(zoneAccessData || {}));
      const hasAnyEntries = Object.values(snapshot).some((entries) => Array.isArray(entries) && entries.length > 0);

      if (!hasAnyEntries) {
        showToast('Нет данных для экспорта');
        return;
      }

      const now = new Date();
      const pad = (value) => String(value).padStart(2, '0');
      const fileName = `zone-access-export-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.json`;
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Экспорт доступов начался');
    } catch (error) {
      console.error('Error exporting zone access data:', error);
      showToast('Не удалось экспортировать доступы');
    }
  }

  function buildAuthJsonHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers.Authorization = 'Bearer ' + authToken;
    }
    return headers;
  }

  function getZoneDisplayName(zoneNum) {
    return zoneDisplayNames[zoneNum] || ('\u0417\u043e\u043d\u0430 ' + zoneNum);
  }

  function getShortZoneName(zone) {
    const zoneNumber = zone && zone.name ? getZoneOrderNumber(zone.name) : NaN;
    return Number.isFinite(zoneNumber) ? `Зона ${zoneNumber}` : (zone && zone.name ? zone.name : 'Зона');
  }

  function normalizePeopleResponse(payload) {
    if (Array.isArray(payload)) {
      return payload;
    }

    if (payload && Array.isArray(payload.users)) {
      return payload.users;
    }

    console.error('Unexpected people payload:', payload);
    return [];
  }

  function normalizePersonNameForCompare(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  function closeEmployeeCreatedModal() {
    const modal = document.getElementById('employee-created-modal');
    const details = document.getElementById('employee-created-details');
    if (details) details.innerHTML = '';
    if (modal) modal.style.display = 'none';
  }

  function showEmployeeCreatedModal(name, role, password) {
    const modal = document.getElementById('employee-created-modal');
    const details = document.getElementById('employee-created-details');
    if (!modal || !details) return;

    details.innerHTML = `
      <p><strong>Логин:</strong> ${escapeHtml(name)}</p>
      <p><strong>Роль:</strong> ${escapeHtml(role)}</p>
      <p><strong>Пароль:</strong> ${escapeHtml(password)}</p>
    `;

    modal.style.display = 'flex';
  }

  async function login(name, password) {
    try {
      console.log('Attempting login for:', name);
      const res = await fetch(API_BASE + '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
      });
      const data = await res.json();
      console.log('Login response:', res.status, data);
      if (!res.ok) {
        alert(data.error || 'Ошибка входа');
        return false;
      }
      authToken = data.token;
      currentUser = data.user;
      if (window.api) window.api.token = data.token;
      // Save persistent token if returned (after 2+ logins)
      if (data.persistentToken) {
        localStorage.setItem('persistentToken', data.persistentToken);
      }
      updateUI();
      return true;
    } catch (e) {
      console.error('Login error:', e);
      alert('Ошибка соединения с сервером: ' + e.message);
      return false;
    }
  }

  async function tryAutoLogin() {
    const persistentToken = localStorage.getItem('persistentToken');
    if (!persistentToken) return false;
    try {
      const res = await fetch(API_BASE + '/api/try-auto-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persistentToken }),
      });
      if (!res.ok) {
        localStorage.removeItem('persistentToken');
        return false;
      }
      const data = await res.json();
      authToken = data.token;
      currentUser = data.user;
      if (window.api) window.api.token = data.token;
      updateUI();
      initPushNotifications();
      return true;
    } catch (e) {
      console.error('Auto-login error:', e);
      localStorage.removeItem('persistentToken');
      return false;
    }
  }

  function logout() {
    authToken = null;
    currentUser = null;
    if (window.api) window.api.token = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('persistentToken');
    updateUI();
    location.reload(); // Перезагрузка для очистки состояния
  }

  // checkAuth теперь вызывается только при необходимости
  async function checkAuth() {
    if (!authToken) {
      updateUI();
      return;
    }
    try {
      const res = await fetch(API_BASE + '/api/whoami', {
        headers: { 'Authorization': 'Bearer ' + authToken },
      });
      if (!res.ok) throw new Error();
      currentUser = await res.json();
      updateUI();
    } catch (e) {
      logout();
    }
  }
function updateUI() {
    if (!loginScreen) return;
    
    // Update current user label (for admin modal)
    const userLabel = document.getElementById('current-user-label');
    if (userLabel) {
      userLabel.textContent = currentUser ? currentUser.name || currentUser.login || '' : '';
    }

    // Update header profile actions
    const headerProfileActions = document.getElementById('header-profile-actions');
    if (headerProfileActions) {
      if (currentUser) {
        headerProfileActions.style.display = 'flex';
        const headerUserLabel = document.getElementById('header-current-user-label');
        if (headerUserLabel) {
          headerUserLabel.textContent = currentUser.name || currentUser.login || '';
        }
      } else {
        headerProfileActions.style.display = 'none';
      }
    }
    
    // Если пользователь вошел - скрываем экран входа
    if (currentUser) {
      if (loginScreen.style.display !== 'none') {
        loginScreen.style.display = 'none';
      }
    } else {
      // Если не вошел — показываем экран логина
      if (loginScreen.style.display !== 'flex') {
        loginScreen.style.display = 'flex';
      }
    }
  }

  async function initPushNotifications() {
    if (!currentUser || !('Notification' in window) || !('serviceWorker' in navigator)) return;

    if (Notification.permission === 'denied') return;

    if (Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
    }

    try {
      const vapidRes = await fetch(API_BASE + '/api/push/vapid-key');
      if (!vapidRes.ok) return;
      const { publicKey } = await vapidRes.json();

      const registration = await navigator.serviceWorker.register('/sw.js');
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await existing.unsubscribe();
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await fetch(API_BASE + '/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken,
        },
        body: JSON.stringify({ subscription }),
      });
    } catch (e) {
      console.error('Push notification init error:', e);
    }
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
  }

  if (btnLogin) {
    btnLogin.addEventListener('click', async () => {
      const name = loginNameInput.value.trim();
      const password = loginPasswordInput.value;

      if (!name || !password) {
        alert('Заполните все поля');
        return;
      }

      const success = await login(name, password);
      if (success) {
        console.log('Авторизация успешна');
        load();
        renderPeopleSelect();
        initPushNotifications();
      }
    });
  }

  // Activity switching (dropdown menu)
  document.querySelectorAll('.activity-menu-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const activity = btn.dataset.activity;
      currentActivity = activity;
      
      document.querySelectorAll('.activity-menu-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const searchSection = document.querySelector('.search-section');
      const actionsSection = document.querySelector('.actions-section');
      const historySectionEl = document.getElementById('history-section');
      const accessSection = document.getElementById('access-section');
      const peopleSection = document.getElementById('people-section');
      const zoneAccessModal = document.getElementById('zone-access-modal');
      
      if (activity === 'keys') {
        if (searchSection) searchSection.style.display = 'block';
        if (actionsSection) actionsSection.style.display = 'block';
        if (peopleSection) peopleSection.style.display = 'block';
        if (historySectionEl && historySectionEl.style.display === 'block') historySectionEl.style.display = 'block';
        if (accessSection) accessSection.style.display = 'none';
        // Close zone modal when switching to keys
        if (zoneAccessModal) zoneAccessModal.style.display = 'none';
        
        // Update header
        const headerMain = document.querySelector('.header-main');
        const logo = headerMain.querySelector('.logo');
        const tagline = headerMain.querySelector('.tagline');
        logo.textContent = 'Учёт ключей';
        tagline.textContent = 'Киевстар — ключи от оборудования';
      } else {
        if (searchSection) searchSection.style.display = 'none';
        if (actionsSection) actionsSection.style.display = 'none';
        if (peopleSection) peopleSection.style.display = 'none';
        if (historySectionEl) historySectionEl.style.display = 'none';
        if (accessSection) accessSection.style.display = 'block';
        
        // Update header
        const headerMain = document.querySelector('.header-main');
        const logo = headerMain.querySelector('.logo');
        const tagline = headerMain.querySelector('.tagline');
        logo.textContent = 'Доступ к зонам';
        tagline.textContent = 'Киевстар — управление доступом';
      }
      
      // Close menu after selection
      closeActivityMenu();
    });
  });

  // Mobile menu toggle
  function toggleActivityMenu() {
    const menu = document.getElementById('activity-menu');
    menu.classList.toggle('show');
  }

  function closeActivityMenu() {
    const menu = document.getElementById('activity-menu');
    menu.classList.remove('show');
  }

  document.getElementById('mobile-menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleActivityMenu();
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('activity-menu');
    const btn = document.getElementById('mobile-menu-btn');
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
      closeActivityMenu();
    }
  });

  // Zone buttons in access section
  document.querySelectorAll('.zone-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      currentZoneNum = parseInt(btn.dataset.zone, 10);
      showZoneAccessView();
    });
  });

  // Функция для форматирования адреса с запятой между улицей и номером дома
  function formatAddress(address) {
    if (!address) return '';
    
    // Ищем паттерн: название улицы (буквы) followed by номер дома (цифры)
    // Например: "Парковая 107" -> "Парковая, 107"
    const match = String(address).match(/^(.+?)\s+(\d+.*)$/);
    if (match) {
      const street = match[1].trim();
      const building = match[2].trim();
      return street + ', ' + building;
    }
    return address;
  }

  function entranceToCircled(entrance) {
    const n = parseInt(String(entrance ?? '').trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > 20) {
      return String(entrance ?? '').trim();
    }
    return String.fromCharCode(0x245f + n);
  }

    function getDisplayTkdEntries(addr) {
      const raw = addr && Array.isArray(addr.tkdEntries) ? addr.tkdEntries : [];
      return raw.filter((entry) => {
        const entrance = String(entry && entry.entrance || '').trim();
        return !!entrance;
      });
    }

   function formatTkdLineHtml(entrance, tkd, place) {
     const entranceNum = parseInt(String(entrance || '').trim(), 10);
     const tkdPart = escapeHtml(String(tkd || '').trim());
     const placePart = escapeHtml(String(place || '').trim());

     // Номер подъезда в стилизованном кружке
     let entranceDisplay = '';
     if (Number.isFinite(entranceNum) && entranceNum >= 1 && entranceNum <= 99) {
       entranceDisplay = `<span class="entrance-circle">${entranceNum}</span>`;
     } else if (entrance) {
       const txt = escapeHtml(String(entrance).trim());
       entranceDisplay = `<span class="entrance-circle">${txt}</span>`;
     }

     const textPart = tkdPart ? `<span class="tkd-code">${tkdPart}</span>` : '';
     const placeText = placePart ? `<span class="tkd-place"> — ${placePart}</span>` : '';
     const pdText = `<span class="tkd-text">пд.</span>`;

     return `${entranceDisplay}${pdText}${textPart ? ' ' + textPart : ''}${placeText}`;
   }

   function getAddressAccessItems(addr) {
     const entries = getDisplayTkdEntries(addr);
     const entryTkdCodes = new Set(
       entries
         .map((entry) => String(entry.tkd || '').trim().toLowerCase())
         .filter(Boolean)
     );
     const items = [];
     const seen = new Set();

     const pushItem = (value) => {
       const text = String(value || '').trim();
       if (!text) return;
       const normalized = text.toLowerCase();
       if (seen.has(normalized)) return;
       seen.add(normalized);
       items.push(text);
     };

     pushItem(addr && addr.code);

     if (addr && Array.isArray(addr.notes)) {
       addr.notes.forEach((note) => {
         const text = String(note || '').trim();
         if (!text) return;

         const normalizedText = text.toLowerCase();
         for (const tkdCode of entryTkdCodes) {
           if (normalizedText.includes(tkdCode)) {
             return;
           }
         }

         pushItem(text);
       });
     }

     return items;
   }

   function buildAddressCardTkdDetails(addr) {
      const entries = getDisplayTkdEntries(addr);
      if (!entries.length) {
        return '<div class="address-card__tkd-empty">Нет данных ТКД — добавьте в форме редактирования (✎).</div>';
      }
      const sorted = [...entries].sort((a, b) => {
        const an = parseInt(String(a.entrance || '').trim(), 10);
        const bn = parseInt(String(b.entrance || '').trim(), 10);
        if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
        if (Number.isFinite(an)) return -1;
        if (Number.isFinite(bn)) return 1;
        return String(a.entrance || '').localeCompare(String(b.entrance || ''));
      });
      let html = '<div class="address-card__tkd-list">';
      sorted.forEach((e, idx) => {
        html += `<div class="address-card__tkd-item">${formatTkdLineHtml(e.entrance, e.tkd, e.place)}</div>`;
        if (idx < sorted.length - 1) {
          html += '<div class="address-card__tkd-separator"></div>';
        }
      });
      html += '</div>';
      return html;
    }

   function buildAddressCardAccessHtml(addr) {
     const accessItems = getAddressAccessItems(addr);
     if (!accessItems.length) return '';

     return accessItems.map((item) => `
       <div class="address-card__access-item address-card__phone" data-code="${escapeHtml(item)}">
         <span class="address-card__access-icon">🔑</span>
         <span class="address-card__access-text">${escapeHtml(item)}</span>
       </div>
     `).join('');
   }

   function getCurrentAuditActor() {
     const name = currentUser && typeof currentUser.name === 'string' ? currentUser.name.trim() : '';
     return name || 'Неизвестно';
   }

   function normalizeAuditInfo(audit) {
     const safeAudit = audit && typeof audit === 'object' ? audit : {};
     const createdAt = Number(safeAudit.createdAt);
     const updatedAt = Number(safeAudit.updatedAt);

     return {
       scope: String(safeAudit.scope || '').trim(),
       createdBy: String(safeAudit.createdBy || '').trim(),
       createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : null,
       updatedBy: String(safeAudit.updatedBy || '').trim(),
       updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : null
     };
   }

   function stampAddressAudit(existingAudit, { isNew = false } = {}) {
     const now = Date.now();
     const actor = getCurrentAuditActor();
     const normalized = normalizeAuditInfo(existingAudit);

     if (isNew || !normalized.createdAt) {
       return {
         scope: ACCESS_AUDIT_SCOPE,
         createdBy: actor,
         createdAt: now,
         updatedBy: actor,
         updatedAt: now
       };
     }

     return {
       scope: normalized.scope || ACCESS_AUDIT_SCOPE,
       createdBy: normalized.createdBy || actor,
       createdAt: normalized.createdAt,
       updatedBy: actor,
       updatedAt: now
     };
   }

   function formatAuditTimestamp(timestamp) {
     const value = Number(timestamp);
     if (!Number.isFinite(value) || value <= 0) return 'Неизвестно';

     try {
       return new Date(value).toLocaleString('ru-RU', {
         day: '2-digit',
         month: '2-digit',
         year: 'numeric',
         hour: '2-digit',
         minute: '2-digit'
       });
     } catch (error) {
       return 'Неизвестно';
     }
   }

   function buildAccessAuditInfoText(zoneNum, addr) {
     const parts = [];
     const addressText = String(addr && addr.address || '').trim();
     const accessItems = getAddressAccessItems(addr);
     const tkdEntries = getDisplayTkdEntries(addr);
     const notes = Array.isArray(addr && addr.notes) ? addr.notes.map((note) => String(note || '').trim()).filter(Boolean) : [];

     parts.push(`Зона ${zoneNum}`);

     if (addressText) {
       parts.push(`Адрес: ${addressText}`);
     }

     if (accessItems.length) {
       parts.push(`Доступ: ${accessItems.join(', ')}`);
     }

     if (tkdEntries.length) {
       const tkdText = tkdEntries
         .map((entry) => {
           const subparts = [];
           if (String(entry.entrance || '').trim()) subparts.push(`пд. ${String(entry.entrance).trim()}`);
           if (String(entry.tkd || '').trim()) subparts.push(String(entry.tkd).trim());
           if (String(entry.place || '').trim()) subparts.push(String(entry.place).trim());
           return subparts.join(' / ');
         })
         .filter(Boolean)
         .join('; ');

       if (tkdText) {
         parts.push(`ТКД: ${tkdText}`);
       }
     }

     if (notes.length) {
       parts.push(`Дополнительно: ${notes.join(', ')}`);
     }

     return parts.join(' | ');
   }

function getAccessAuditLogItems() {
      const items = [];

      Object.keys(zoneAccessData || {}).forEach((zoneNum) => {
        const addresses = Array.isArray(zoneAccessData[zoneNum]) ? zoneAccessData[zoneNum] : [];
        addresses.forEach((addr) => {
          const audit = normalizeAuditInfo(addr && addr.audit);
          const hasAudit = audit.scope === ACCESS_AUDIT_SCOPE && Boolean(
            audit.createdAt ||
            audit.updatedAt ||
            audit.createdBy ||
            audit.updatedBy
          );

          if (!hasAudit) {
            return;
          }

          const timestamp = audit.updatedAt || audit.createdAt || 0;

          items.push({
            zoneNum: String(zoneNum),
            infoText: buildAccessAuditInfoText(zoneNum, addr),
            createdBy: audit.createdBy || 'Неизвестно',
            createdAt: audit.createdAt,
            updatedBy: audit.updatedBy || '',
            updatedAt: audit.updatedAt,
            sortTimestamp: timestamp
          });
        });
      });

      items.sort((a, b) => b.sortTimestamp - a.sortTimestamp);
      return items;
    }

   function renderAccessAdminLog() {
     const listEl = document.getElementById('access-admin-log-list');
     const wrapperEl = document.getElementById('access-admin-log');
     if (!listEl || !wrapperEl) return;

     if (!isAdmin()) {
       listEl.innerHTML = '';
       return;
     }

     const items = getAccessAuditLogItems();
     if (!items.length) {
       listEl.innerHTML = `
         <div class="access-admin-log__empty">
           Пока нет добавленных записей
         </div>
       `;
       return;
     }

     listEl.innerHTML = items.map((item) => {
       const userText = item.updatedAt && item.updatedAt !== item.createdAt
         ? `${item.createdBy} (обновил: ${item.updatedBy || item.createdBy}, ${formatAuditTimestamp(item.updatedAt)})`
         : `${item.createdBy} (${formatAuditTimestamp(item.createdAt)})`;

       return `
         <div class="access-admin-log__row">
           <div class="access-admin-log__col access-admin-log__col--info">${escapeHtml(item.infoText)}</div>
           <div class="access-admin-log__col access-admin-log__col--user">${escapeHtml(userText)}</div>
         </div>
       `;
     }).join('');
   }

  function updateAccessAdminLogVisibility(forceVisible = null) {
     const wrapperEl = document.getElementById('access-admin-log');
     const toggleBtn = document.getElementById('toggle-access-admin-log');
     if (!wrapperEl || !toggleBtn) return;

     if (!isAdmin()) {
       accessAdminLogOpen = false;
       wrapperEl.hidden = true;
       toggleBtn.classList.remove('active');
       toggleBtn.textContent = 'Список';
       return;
     }

     const shouldShow = forceVisible === null
       ? !accessAdminLogOpen
       : Boolean(forceVisible);

     accessAdminLogOpen = shouldShow;
     wrapperEl.hidden = !shouldShow;
     toggleBtn.classList.toggle('active', shouldShow);
     toggleBtn.textContent = 'Список';
   }

   function createTkdFormRowEl(entry, showLabels = true) {
     const row = document.createElement('div');
     row.className = 'tkd-form-row';
     if (showLabels) row.classList.add('tkd-form-row--labeled');
     const en = escapeHtml(String(entry.entrance ?? ''));
     const tkd = escapeHtml(String(entry.tkd ?? ''));
     const pl = escapeHtml(String(entry.place ?? ''));
     const entranceLabel = showLabels ? '<label class="tkd-form-label">Подъезд</label>' : '';
     const tkdLabel = showLabels ? '<label class="tkd-form-label">Номер ТКД</label>' : '';
     const placeLabel = showLabels ? '<label class="tkd-form-label">Расположение</label>' : '';
     row.innerHTML = `
       <div class="tkd-form-cell">
         ${entranceLabel}
         <input type="text" class="zone-input tkd-form-entrance" placeholder="1" value="${en}" />
       </div>
       <div class="tkd-form-cell">
         ${tkdLabel}
         <input type="text" class="zone-input tkd-form-tkd" placeholder="1_1031" value="${tkd}" />
       </div>
       <div class="tkd-form-cell">
         ${placeLabel}
         <input type="text" class="zone-input tkd-form-place" placeholder="Техповерх" value="${pl}" />
       </div>
       <button type="button" class="btn-tkd-row-remove" title="Убрать строку">×</button>
     `;
     row.querySelector('.btn-tkd-row-remove').addEventListener('click', () => {
       const parent = row.parentNode;
       if (parent && parent.querySelectorAll('.tkd-form-row').length > 1) {
         row.remove();
       }
     });
     return row;
   }

   function mountTkdFormRows(container, entries) {
     container.innerHTML = '';
     const list = entries && entries.length ? entries : [{}];
     list.forEach((e, idx) => container.appendChild(createTkdFormRowEl(e, idx === 0)));
   }

   function validateTkdForm() {
     const container = document.getElementById('tkd-entries-container');
     if (!container) return { valid: true, errors: [] };

     const rows = container.querySelectorAll('.tkd-form-row');
     const errors = [];

     rows.forEach((row, idx) => {
       const rowNum = idx + 1;
       const entranceInput = row.querySelector('.tkd-form-entrance');
       const tkdInput = row.querySelector('.tkd-form-tkd');
       const placeInput = row.querySelector('.tkd-form-place');

       const entrance = entranceInput?.value.trim() ?? '';
       const tkd = tkdInput?.value.trim() ?? '';
       const place = placeInput?.value.trim() ?? '';

       const hasEntrance = !!entrance;
       const hasTkd = !!tkd;
       const hasPlace = !!place;
       const rowHasData = hasEntrance || hasTkd || hasPlace;

       // Сброс классов ошибки
       if (entranceInput) entranceInput.classList.remove('input-error');
       if (tkdInput) tkdInput.classList.remove('input-error');
       if (placeInput) placeInput.classList.remove('input-error');

       // Если строка заполнена частично — требовать все три поля
       if (rowHasData && !(hasEntrance && hasTkd && hasPlace)) {
         if (!hasEntrance) {
           errors.push(`Строка ${rowNum}: не указан подъезд`);
           if (entranceInput) entranceInput.classList.add('input-error');
         }
         if (!hasTkd) {
           errors.push(`Строка ${rowNum}: не указан номер ТКД`);
           if (tkdInput) tkdInput.classList.add('input-error');
         }
         if (!hasPlace) {
           errors.push(`Строка ${rowNum}: не указано, где стоит`);
           if (placeInput) placeInput.classList.add('input-error');
         }
       }
     });

     return {
       valid: errors.length === 0,
       errors: errors
     };
   }

   function collectTkdEntriesFromForm() {
     const container = document.getElementById('tkd-entries-container');
     if (!container) return [];
     const rows = container.querySelectorAll('.tkd-form-row');
     const out = [];

     rows.forEach((row) => {
       const entrance = row.querySelector('.tkd-form-entrance')?.value.trim() ?? '';
       const tkd = row.querySelector('.tkd-form-tkd')?.value.trim() ?? '';
       const place = row.querySelector('.tkd-form-place')?.value.trim() ?? '';

       // Добавляем только полностью заполненные строки
       if (entrance && tkd && place) {
         out.push({ entrance, tkd, place });
       }
     });

      return out;
    }

    // Валидация TKD-записей
   function validateTkdEntries(tkdEntries, zoneNum, excludeAddressIdx) {
     const errors = [];
     const zoneData = zoneAccessData[zoneNum] || [];
     const seenInForm = new Set();

     // Собираем все существующие TKD из других адресов этой зоны
     const existingMap = new Map(); // tkd -> address string
     zoneData.forEach((addr, idx) => {
       if (idx === excludeAddressIdx) return;
       if (addr.tkdEntries) {
         addr.tkdEntries.forEach(entry => {
           const tkd = String(entry.tkd || '').trim();
           if (tkd) {
             existingMap.set(tkd, addr.address);
           }
         });
       }
     });

     // Проверяем каждую запись
     tkdEntries.forEach((entry, idx) => {
       const tkd = String(entry.tkd || '').trim();
       if (!tkd) return;

       // Проверка префикса зоны
       const expectedPrefix = String(zoneNum) + '_';
       if (!tkd.startsWith(expectedPrefix)) {
         errors.push({
           message: `ТКД "${tkd}" должен начинаться с "${expectedPrefix}" (номер зоны)`,
           type: 'prefix'
         });
       }

       // Дубли в самой форме
       if (seenInForm.has(tkd)) {
         errors.push({
           message: `ТКД "${tkd}" дублируется в этом же адресе`,
           type: 'duplicate-form'
         });
       } else {
         seenInForm.add(tkd);
       }

       // Дубли в других адресах
       if (existingMap.has(tkd)) {
         const existingAddr = existingMap.get(tkd);
         errors.push({
           message: `ТКД "${tkd}" уже используется по адресу: ${existingAddr}`,
           type: 'duplicate-zone',
           address: existingAddr
         });
       }
     });

     return errors;
   }

    // Filter bundles by search query across all zones (for keys activity)
    function filterAddressesBySearch() {
      const results = [];
      const q = addressSearchQuery.trim().toLowerCase();

      if (!q) return results;

      const allBundles = getAllBundles();

      allBundles.forEach(bundle => {
        if (bundleMatchesSearch(bundle, q)) {
          const zoneNumber = getZoneNumberFromZoneId(bundle.zoneId);
          const bundleState = state[bundle.bundleId];
          results.push({
            zoneNumber,
            tkdRange: bundle.tkdRange,
            bundleId: bundle.bundleId,
            bundleState: bundleState || null,
          });
        }
      });

      return results;
    }

    // Render address/TKD search results
    function renderAddressSearchResults() {
      if (!addressSearchResults) return;

      const list = filterAddressesBySearch();
      addressSearchResults.innerHTML = '';

      if (!list.length) {
        addressSearchResults.innerHTML = '<p class="search-no-results">Ничего не найдено</p>';
        addressSearchResults.style.display = '';
        return;
      }

      list.forEach(item => {
        const el = document.createElement('div');
        el.className = 'search-result-item';

        const displayId = `${item.zoneNumber}_${item.tkdRange}`;

        let statusHtml;
        if (item.bundleState?.personName) {
          const personName = escapeHtml(item.bundleState.personName);
          statusHtml = `<span class="bundle-status taken">занята — ${personName}</span>`;
        } else {
          statusHtml = `<span class="bundle-status free">Свободна</span>`;
        }

        el.innerHTML = `
          <div class="bundle-search-info">
            <span class="bundle-search-id">${escapeHtml(displayId)}</span>
            ${statusHtml}
          </div>
        `;

        // Click opens zone
        el.addEventListener('click', () => {
          currentZoneNum = parseInt(item.zoneNumber, 10);
          const zoneSelectEl = document.getElementById('zone-select');
          if (zoneSelectEl) {
            zoneSelectEl.value = item.zoneNumber;
            showZoneAccessView();
          }
          addressSearchResults.style.display = 'none';
          addressSearch.value = '';
          addressSearchQuery = '';
        });

        addressSearchResults.appendChild(el);
      });

      addressSearchResults.style.display = '';
    }

    // Показать модальное окно с ошибками валидации
function showValidationErrors(errors, options = {}) {
     const modal = document.getElementById('validation-modal');
     const listEl = document.getElementById('validation-error-list');
     const titleEl = modal ? modal.querySelector('.validation-error-title') : null;
     const variant = options.variant === 'warning' ? 'warning' : 'error';
     const title = options.title || (variant === 'warning' ? 'Предупреждение' : 'Ошибка');

     if (!modal || !listEl) return;

     modal.classList.toggle('validation-modal--warning', variant === 'warning');
     if (titleEl) titleEl.textContent = title;

     // Очищаем предыдущие ошибки
     listEl.innerHTML = '';

     // Добавляем каждую ошибку
     errors.forEach(err => {
       const message = typeof err === 'string' ? err : err.message;
       const item = document.createElement('div');
       item.className = 'validation-error-item' + (variant === 'warning' ? ' validation-error-item--warning' : '');
       item.innerHTML = `
       <span class="error-icon">⚠️</span>
         <span>${escapeHtml(message)}</span>
       `;
       listEl.appendChild(item);
     });

      // Показываем модальное окно
      modal.style.display = 'flex';
    }

   let pendingDeleteAction = null;

   function closeConfirmDeleteModal() {
     const modal = document.getElementById('confirm-delete-modal');
     const messageEl = document.getElementById('confirm-delete-message');
     pendingDeleteAction = null;
     if (messageEl) {
       messageEl.textContent = '';
     }
     if (modal) {
       modal.style.display = 'none';
     }
   }

   function openAddressDeleteModal(addressIdx) {
     const modal = document.getElementById('confirm-delete-modal');
     const messageEl = document.getElementById('confirm-delete-message');
     const addresses = zoneAccessData[currentZoneNum] || [];
     const address = addresses[addressIdx];

     if (!modal || !messageEl || !address) return;

     pendingDeleteAction = { type: 'address', addressIdx };
     messageEl.textContent = '\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u044d\u0442\u043e\u0442 \u0430\u0434\u0440\u0435\u0441?';
     modal.style.display = 'flex';
   }

   function openPersonDeleteModal(person) {
     const modal = document.getElementById('confirm-delete-modal');
     const messageEl = document.getElementById('confirm-delete-message');

     if (!modal || !messageEl || !person) return;

     pendingDeleteAction = { type: 'person', personId: person.id };
     messageEl.textContent = `Удалить сотрудника ${person.name}?`;
     modal.style.display = 'flex';
   }

   function isAppleMobileDevice() {
     const ua = String((navigator && navigator.userAgent) || '');
     const platform = String((navigator && navigator.platform) || '');
     const maxTouchPoints = Number((navigator && navigator.maxTouchPoints) || 0);
     return /iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
   }

   function navigateToMapUrl(url, popupWindow) {
     if (popupWindow && !popupWindow.closed) {
       popupWindow.location.href = url;
       return;
     }

     try {
       window.location.href = url;
     } catch (error) {
       window.open(url, '_blank');
     }
   }

    function openAddressMap(address) {
      if (!address) {
        alert('Адрес не найден');
        return;
      }

      const ua = String((navigator && navigator.userAgent) || '');
      const isAppleMobile = /iPhone|iPad|iPod/i.test(ua);

      if (isAppleMobile) {
        const appleMapsUrl = `https://maps.apple.com/?daddr=${encodeURIComponent(address)}&dirflg=d`;
        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
        let appSwitched = false;
        let fallbackTimer = null;

        const markSwitched = () => { appSwitched = true; };
        const cleanupFallback = () => {
          if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
          window.removeEventListener('pagehide', markSwitched);
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
        const handleVisibilityChange = () => {
          if (document.visibilityState === 'hidden') { markSwitched(); cleanupFallback(); }
        };

        window.addEventListener('pagehide', markSwitched, { once: true });
        document.addEventListener('visibilitychange', handleVisibilityChange);

        fallbackTimer = setTimeout(() => {
          if (!appSwitched && document.visibilityState === 'visible') {
            cleanupFallback();
            window.location.href = googleMapsUrl;
            return;
          }
          cleanupFallback();
        }, 1400);

        window.location.href = appleMapsUrl;
        return;
      }

      const isAndroid = /Android/i.test(ua);

      const openSearchUrl = () => {
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
        window.location.href = mapsUrl;
      };

      const openDirections = (lat, lng) => {
        if (isAndroid) {
          const fallbackUrl = encodeURIComponent(`https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${encodeURIComponent(address)}&dir_action=navigate`);
          window.location.href = `intent://maps.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${encodeURIComponent(address)}&dir_action=navigate#Intent;scheme=https;action=android.intent.action.VIEW;package=com.google.android.apps.maps;S.browser_fallback_url=${fallbackUrl};end`;
        } else {
          window.open(`https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${encodeURIComponent(address)}&dir_action=navigate`, '_blank');
        }
      };

      if (!navigator.geolocation) {
        openSearchUrl();
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          openDirections(position.coords.latitude, position.coords.longitude);
        },
        () => {
          console.warn('Геолокация не доступна');
          openSearchUrl();
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
      );
    }

    function showZoneAccessView() {
     const addresses = zoneAccessData[currentZoneNum] || [];
    
    const titleEl = document.getElementById('zone-access-title');
    if (titleEl) titleEl.textContent = getZoneDisplayName(currentZoneNum);
    
    const addressesEl = document.getElementById('zone-addresses');
    
    try {
      if (addresses.length === 0) {
        addressesEl.innerHTML = `
          <div class="zone-empty">
            <div class="zone-empty-icon">🏠</div>
            <div class="zone-empty-text">Пока ничего нет</div>
            <div class="zone-empty-hint">Нажмите "Добавить адрес"</div>
          </div>
        `;
      } else {
        addressesEl.innerHTML = addresses.map((addr, idx) => {
          const accessHtml = buildAddressCardAccessHtml(addr);

          return `
          <div class="address-card" data-idx="${idx}">
            <div class="address-card__header">
              <div class="address-card__info">
                <span class="address-card__index">${idx + 1}.</span>
                <span class="address-card__pin">📌</span>
                <span class="address-card__street">${escapeHtml(formatAddress(addr.address))}</span>
              </div>
              ${accessHtml ? `<div class="address-card__access">${accessHtml}</div>` : ''}
              <div class="address-card__actions">
                <button class="address-card__edit-btn" data-edit-idx="${idx}" title="Редактировать">✎</button>
                <button class="address-card__delete-btn" data-delete-idx="${idx}" title="Удалить">🗑</button>
                <button class="address-card__map-btn-accent">🗺️</button>
                <button class="address-card__expand-btn" data-expand="${idx}" title="Подробнее">▲</button>
              </div>
             </div>
             <div class="address-card__details">
               ${buildAddressCardTkdDetails(addr)}
             </div>
          </div>
        `;
        }).join('');
        
        addressesEl.querySelectorAll('.address-card__edit-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            showZoneAccessEdit(false, parseInt(btn.dataset.editIdx, 10));
          });
        });
        
        addressesEl.querySelectorAll('.address-card__delete-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openAddressDeleteModal(parseInt(btn.dataset.deleteIdx, 10));
          });
        });

        addressesEl.querySelectorAll('.address-card__expand-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.expand, 10);
            const card = addressesEl.querySelector(`.address-card[data-idx="${idx}"]`);
            if (card) {
              card.classList.toggle('expanded');
              btn.classList.toggle('collapsed');
            }
          });
        });

        addressesEl.querySelectorAll('.address-card__phone').forEach(el => {
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            const code = el.dataset.code;
            if (!code) return;

            // Проверяем, является ли код телефонным номером
            const phoneMatch = code.match(/(?:\+?\d[\d\s()-]{7,}\d)|(?:\b\d{9,}\b)/);
            const phoneNumber = phoneMatch ? phoneMatch[0].replace(/[^\d+]/g, '') : '';
            const digitsOnly = phoneNumber.replace(/\D/g, '');
            const isPhone = digitsOnly.length >= 9;

            if (isPhone) {
              // Если это телефон, предлагаем позвонить
              if (confirm(`Позвонить по номеру ${code}?`)) {
                window.location.href = `tel:${phoneNumber}`;
              }
            } else {
              // Иначе копируем в буфер обмена
              const copyToClipboard = (text) => {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(text).then(() => {
                    showToast(`Код "${text}" скопирован`);
                  }).catch(() => {
                    fallbackCopyTextToClipboard(text);
                  });
                } else {
                  fallbackCopyTextToClipboard(text);
                }
              };

              const fallbackCopyTextToClipboard = (text) => {
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.top = '0';
                textArea.style.left = '0';
                textArea.style.width = '2em';
                textArea.style.height = '2em';
                textArea.style.padding = '0';
                textArea.style.border = 'none';
                textArea.style.outline = 'none';
                textArea.style.boxShadow = 'none';
                textArea.style.background = 'transparent';
                document.body.appendChild(textArea);
                textArea.select();
                try {
                  document.execCommand('copy');
                  showToast(`Код "${text}" скопирован`);
                } catch (err) {
                  showToast('Не удалось скопировать код');
                }
                document.body.removeChild(textArea);
              };

              copyToClipboard(code);
            }
          });
        });

        // Обработчик для кнопки карты
        addressesEl.querySelectorAll('.address-card__map-btn-accent').forEach((btn, btnIdx) => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Найдем адрес этой карточки
            const card = btn.closest('.address-card');
            const streetSpan = card ? card.querySelector('.address-card__street') : null;
            const address = streetSpan ? streetSpan.textContent.trim() : null;
            
            if (!address) {
              alert('Адрес не найден');
              return;
            }
            openAddressMap(address);
          });
        });
      }
    } catch (e) {
      console.error('Error showing zone access view:', e);
    }

    const editForm = document.getElementById('zone-edit-form');
    const zoneModal = document.getElementById('zone-access-modal');
    const addressListEl = document.getElementById('zone-addresses');
    const fabBtnInZone = document.getElementById('btn-add-address-in-zone');

     if (editForm) editForm.style.display = 'none';
     if (addressListEl) addressListEl.style.display = 'block';
     if (zoneModal) zoneModal.style.display = 'flex';
     // Show FAB button when showing address list
     if (fabBtnInZone) fabBtnInZone.style.display = '';
     // Show footer when showing address list
     const zoneFooter = document.querySelector('.zone-modal-footer');
     if (zoneFooter) zoneFooter.style.display = 'flex';
  }

   function showZoneAccessEdit(addNew = false, editIdx = -1) {
     // Save current mode for cancel button
     currentFormMode = { addNew, editIdx };

     // Clear error states
     const addressInput = document.getElementById('access-form-address');
     const codeInput = document.getElementById('access-form-code');
     if (addressInput) addressInput.classList.remove('input-error');
     if (codeInput) codeInput.classList.remove('input-error');
     const tkdContainer = document.getElementById('tkd-entries-container');
     if (tkdContainer) {
       tkdContainer.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
     }

const addresses = zoneAccessData[currentZoneNum] || [];
      const addr = editIdx >= 0 ? addresses[editIdx] : null;

      const titleEl = document.getElementById('zone-access-title');
      const addrInputEl = document.getElementById('access-form-address');
      const codeInputEl = document.getElementById('access-form-code');
      const idxInputEl = document.getElementById('edit-address-idx');
      const editFormEl = document.getElementById('zone-edit-form');
      const addressListEl = document.getElementById('zone-addresses');
      const tkdFieldEl = document.getElementById('zone-tkd-field');
      const zoneFormVoiceBtnEl = document.getElementById('voice-input-zone-form');

      if (titleEl) titleEl.textContent = addNew ? 'Добавить адрес' : 'Редактировать';
      if (addrInputEl) addrInputEl.value = addr ? addr.address : '';
      if (codeInputEl) {
        const codeValue = addr ? (addr.code || '') : '';
        const notesValue = (addr && Array.isArray(addr.notes) && addr.notes.length > 0) ? addr.notes[0] : '';
        codeInputEl.value = codeValue || notesValue || '';
      }
     if (idxInputEl) idxInputEl.value = editIdx >= 0 ? editIdx : '';

     // Показываем блок ТКД только при редактировании существующего адреса
     if (tkdFieldEl) {
       tkdFieldEl.style.display = editIdx >= 0 ? 'flex' : 'none';
     }
     if (zoneFormVoiceBtnEl) {
       zoneFormVoiceBtnEl.style.display = editIdx >= 0 ? 'none' : 'inline-flex';
     }

     // Заполняем ТКД-поля только если редактируем существующий адрес
     if (editIdx >= 0 && addr && addr.tkdEntries) {
       if (tkdContainer) {
         mountTkdFormRows(tkdContainer, addr.tkdEntries);
       }
     } else {
       // Очищаем форму ТКД при добавлении нового
       if (tkdContainer) {
         mountTkdFormRows(tkdContainer, []);
       }
     }

if (editFormEl) editFormEl.style.display = 'flex';
      if (addressListEl) addressListEl.style.display = 'none';
      // Hide FAB button when form is shown
      const addBtnInZone = document.getElementById('btn-add-address-in-zone');
      if (addBtnInZone) addBtnInZone.style.display = 'none';
      // Hide footer when form is shown
      const zoneFooter = document.querySelector('.zone-modal-footer');
      if (zoneFooter) zoneFooter.style.display = 'none';
}

   const btnCancelEdit = document.getElementById('btn-cancel-edit');
   if (btnCancelEdit) {
     btnCancelEdit.addEventListener('click', () => {
       showZoneAccessView();
     });
   }

   const btnAddTkdRow = document.getElementById('btn-add-tkd-row');
   if (btnAddTkdRow) {
     btnAddTkdRow.addEventListener('click', () => {
       const container = document.getElementById('tkd-entries-container');
       if (container) container.appendChild(createTkdFormRowEl({}, false));
     });
   }

   // Auto-remove error styling on input
   function setupFormErrorListeners() {
     const addressInput = document.getElementById('access-form-address');
     const codeInput = document.getElementById('access-form-code');
     const tkdContainer = document.getElementById('tkd-entries-container');

     if (addressInput) {
       addressInput.addEventListener('input', () => addressInput.classList.remove('input-error'));
     }
     if (codeInput) {
       codeInput.addEventListener('input', () => codeInput.classList.remove('input-error'));
     }
     if (tkdContainer) {
       tkdContainer.addEventListener('input', (e) => {
         if (e.target && (
           e.target.classList.contains('tkd-form-entrance') ||
           e.target.classList.contains('tkd-form-tkd') ||
           e.target.classList.contains('tkd-form-place')
         )) {
           e.target.classList.remove('input-error');
         }
       });
     }
   }

   // Initialize listeners after DOM load
   // Will be called at the end of script


   // Save access
   const btnSaveAccess = document.getElementById('btn-save-access');
   if (btnSaveAccess) {
     btnSaveAccess.addEventListener('click', () => {
     const addressInputEl = document.getElementById('access-form-address');
     const codeInputEl = document.getElementById('access-form-code');
     const editIdxEl = document.getElementById('edit-address-idx');

     if (!addressInputEl || !codeInputEl || !editIdxEl) {
       console.error('Form elements not found');
       return;
     }

      const address = addressInputEl.value.trim();
      const code = codeInputEl.value.trim();
      const editIdx = editIdxEl.value;

      // Нормализация адреса: добавить запятую между названием улицы и номером дома
      let normalizedAddress = address;
      if (editIdx === '' && address) {
        const hasCommaBeforeNumber = /,\s*\d/.test(address);
        if (!hasCommaBeforeNumber) {
          const match = address.match(/^([\p{L}\s]+?)\s+(\d+[\p{L}a-zа-яёіїє'’ʼ]?)\s*$/iu);
          if (match) {
            let street = match[1].trim();
            street = street.replace(/,+$/, '').trim();
            normalizedAddress = street + ', ' + match[2];
          }
        }
      }

      // Сброс ошибок
      addressInputEl.classList.remove('input-error');
      codeInputEl.classList.remove('input-error');

      // Проверка заполнения обязательных полей
      let hasError = false;
      if (!address) {
        addressInputEl.classList.add('input-error');
        hasError = true;
      }

      if (hasError) {
        return;
      }

     // Initialize array if not exists
     if (!zoneAccessData[currentZoneNum]) {
       zoneAccessData[currentZoneNum] = [];
     }

      // Собираем и валидируем TKD-entries только при редактировании
      let tkdEntries = [];
      if (editIdx !== '') {
        // Проверка заполненности всех полей в форме
        const formValidation = validateTkdForm();
        if (!formValidation.valid) {
          // Просто подсвечиваем поля красным, не показываем модальное окно
          return;
        }

        // Сбор данных (только полные строки)
        tkdEntries = collectTkdEntriesFromForm();

        // Проверка уникальности и префиксов (показываем модальное окно)
        const validationErrors = validateTkdEntries(tkdEntries, currentZoneNum, parseInt(editIdx, 10));
        if (validationErrors.length > 0) {
          showValidationErrors(validationErrors);
          return;
        }
      } else {
        tkdEntries = [];
      }

const existingAddress = editIdx !== '' ? zoneAccessData[currentZoneNum][parseInt(editIdx, 10)] : null;
      const addrData = {
        address: normalizedAddress,
        code,
        tkdEntries,
        audit: stampAddressAudit(existingAddress && existingAddress.audit, { isNew: editIdx === '' })
      };

     // Update or add
     if (editIdx !== '') {
       zoneAccessData[currentZoneNum][parseInt(editIdx, 10)] = addrData;
     } else {
       zoneAccessData[currentZoneNum].push(addrData);
     }

     // Save to localStorage
saveZoneAccessData();

        showToast('Сохранено');

      // Return to address list after save
      showZoneAccessView();
        });
      }

   // Validation modal handlers
   const validationModal = document.getElementById('validation-modal');
   const closeValidationModalBtn = document.getElementById('close-validation-modal');
   const closeValidationBtn = document.getElementById('close-validation-btn');
   const employeeCreatedModal = document.getElementById('employee-created-modal');
   const closeEmployeeCreatedModalBtn = document.getElementById('close-employee-created-modal');
   const employeeCreatedOkBtn = document.getElementById('employee-created-ok');
   const confirmDeleteModal = document.getElementById('confirm-delete-modal');
   const closeConfirmDeleteModalBtn = document.getElementById('close-confirm-delete-modal');
   const confirmDeleteCancelBtn = document.getElementById('confirm-delete-cancel');
   const confirmDeleteOkBtn = document.getElementById('confirm-delete-ok');

   if (closeValidationModalBtn) {
     closeValidationModalBtn.addEventListener('click', () => {
       validationModal.style.display = 'none';
     });
   }

   if (closeValidationBtn) {
     closeValidationBtn.addEventListener('click', () => {
       validationModal.style.display = 'none';
     });
   }

   if (closeEmployeeCreatedModalBtn) {
     closeEmployeeCreatedModalBtn.addEventListener('click', closeEmployeeCreatedModal);
   }

   if (employeeCreatedOkBtn) {
     employeeCreatedOkBtn.addEventListener('click', closeEmployeeCreatedModal);
   }

   if (employeeCreatedModal) {
     employeeCreatedModal.addEventListener('click', (e) => {
       if (e.target === employeeCreatedModal) {
         closeEmployeeCreatedModal();
       }
     });
   }

    // Close modal by clicking on overlay
    if (validationModal) {
      validationModal.addEventListener('click', (e) => {
        if (e.target === validationModal) {
          validationModal.style.display = 'none';
        }
      });
    }

   if (closeConfirmDeleteModalBtn) {
     closeConfirmDeleteModalBtn.addEventListener('click', closeConfirmDeleteModal);
   }

   if (confirmDeleteCancelBtn) {
     confirmDeleteCancelBtn.addEventListener('click', closeConfirmDeleteModal);
   }

   if (confirmDeleteOkBtn) {
     confirmDeleteOkBtn.addEventListener('click', async () => {
       if (!pendingDeleteAction) return;

       if (pendingDeleteAction.type === 'address') {
         const addresses = zoneAccessData[currentZoneNum] || [];
         const { addressIdx } = pendingDeleteAction;
         if (addressIdx < 0 || addressIdx >= addresses.length) {
           closeConfirmDeleteModal();
           return;
         }

         addresses.splice(addressIdx, 1);
         saveZoneAccessData();
         closeConfirmDeleteModal();
         showZoneAccessView();
         return;
       }

       if (pendingDeleteAction.type === 'person') {
         const { personId } = pendingDeleteAction;
         closeConfirmDeleteModal();
         await deletePerson(personId);
       }
     });
   }

   if (confirmDeleteModal) {
     confirmDeleteModal.addEventListener('click', (e) => {
       if (e.target === confirmDeleteModal) {
         closeConfirmDeleteModal();
       }
     });
   }

   // Setup form error handling
   setupFormErrorListeners();

   // Close zone access modal
  const closeZoneAccessModalBtn = document.getElementById('close-zone-access-modal');
  const zoneAccessModalEl = document.getElementById('zone-access-modal');
  
  if (closeZoneAccessModalBtn && zoneAccessModalEl) {
    closeZoneAccessModalBtn.addEventListener('click', () => {
      zoneAccessModalEl.style.display = 'none';
    });
  }

  if (zoneAccessModalEl) {
    zoneAccessModalEl.addEventListener('click', (e) => {
      if (e.target.id === 'zone-access-modal') {
        e.target.style.display = 'none';
      }
    });
  }

  // Позволяем входить по нажатию Enter в поле пароля
  if (loginPasswordInput) {
    loginPasswordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btnLogin.click();
    });
  }
  // Функция проверки - является ли выбранный сотрудник админом
  function isAdmin() {
    return currentUser && currentUser.role === 'ADMIN';
  }

  // Обновить класс body для отображения админ-элементов
  function updateAdminMode() {
    if (isAdmin()) {
      document.body.classList.add('admin-mode');
    } else {
      document.body.classList.remove('admin-mode');
    }
    updatePersonSelectVisibility();
    renderAccessAdminLog();
    updateAccessAdminLogVisibility(accessAdminLogOpen);
  }

  // Дані приходять з сервера: список зон і поточний стан
  
  // Auth state
  
  // SSE for real-time updates
  let eventSource = null;

  function connectSSE() {
    if (eventSource) {
      eventSource.close();
    }
    eventSource = new EventSource(API_BASE + '/api/events');
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      zones = data.zones || [];
      state = data.state || {};
      render();
    };
  }

  // Подключаем SSE при загрузке
  connectSSE();

  // Auth functions


  function getBundleId(zoneId, tkdRange) {
    return zoneId + '_' + tkdRange;
  }

  function getZoneOrderNumber(name) {
    const match = name.match(/\d+/);
    return match ? parseInt(match[0], 10) : 999;
  }

  function getZonesSorted() {
    return [...zones].sort((a, b) => {
      const numA = getZoneOrderNumber(a.name);
      const numB = getZoneOrderNumber(b.name);
      if (numA !== numB) return numA - numB;
      return a.name.localeCompare(b.name, 'uk', { numeric: true });
    });
  }

  async function load() {
    // Проверяем авторизацию перед загрузкой данных
    if (!authToken) {
      updateUI();
      return;
    }
    
    // Проверяем валидность токена
    try {
      const res = await fetch(API_BASE + '/api/whoami', {
        headers: { 'Authorization': 'Bearer ' + authToken },
      });
      if (!res.ok) {
        logout();
        return;
      }
      currentUser = await res.json();
    } catch (e) {
      logout();
      return;
    }

    // Скрываем экран входа если пользователь авторизован
    updateUI();

    try {
      const res = await fetch(API_BASE + '/api/state', {
        headers: { 'Authorization': 'Bearer ' + authToken },
      });
      const data = await res.json();
      zones = data.zones || [];
      state = data.state || {};
      
      // Загрузка людей и истории
      const pRes = await fetch(API_BASE + '/api/people', {
        headers: { 'Authorization': 'Bearer ' + authToken },
      });
      people = normalizePeopleResponse(await pRes.json());
      
      // Загружаем историю
      try {
        const hRes = await fetch(API_BASE + '/api/history', {
          headers: { 'Authorization': 'Bearer ' + authToken },
        });
        if (hRes.ok) {
          history = await hRes.json();
        }
      } catch (he) {
        console.error('History load error', he);
        history = [];
      }

      await loadZoneAccessDataFromServer();
      
      render();
      renderAccessAdminLog();
      renderPeopleSelect(); // Обновляем список сотрудников после загрузки данных
    } catch (e) {
      console.error('Data load error', e);
    }
  }

  async function loadHistory() {
    try {
      const res = await fetch(API_BASE + '/api/history', {
        headers: { 'Authorization': 'Bearer ' + authToken },
      });
      if (!res.ok) throw new Error('Failed to load history');
      history = await res.json();
      renderHistory();
    } catch (e) {
      console.error('Ошибка загрузки истории', e);
      history = [];
    }
  }

  async function loadPeople() {
    try {
      const res = await fetch(API_BASE + '/api/people', {
        headers: { 'Authorization': 'Bearer ' + authToken },
      });
      if (!res.ok) throw new Error('Failed to load people');
      people = normalizePeopleResponse(await res.json());
      renderPeopleSelect();
      updateAdminMode();
    } catch (e) {
      console.error('Ошибка загрузки людей', e);
      people = [];
    }
  }

  async function takeKey(bundleId, personName, reload = true, quiet = false) {
    const name = (personName || '').trim();
    if (!bundleId || !name) return;
    try {
      const res = await fetch(API_BASE + '/api/take', {
        method: 'POST',
        headers: buildAuthJsonHeaders(),
        body: JSON.stringify({ bundleId, personName: name }),
      });
      if (!res.ok) throw new Error('Failed take');
      if (reload) await load();
    } catch (e) {
      console.error('Ошибка "взять"', e);
      if (!quiet) {
        alert('Не удалось сохранить на сервере. Попробуй еще раз.');
      }
      throw e;
    }
  }

  function getSelectedBundleIds() {
    return Array.from(selectedBundleIds);
  }

  async function takeKeys(bundleIds, personName) {
    if (!bundleIds || !bundleIds.length) return;
    const name = (personName || '').trim();
    if (!name) return;

    const promises = bundleIds.map((bundleId) => takeKey(bundleId, name, false, true));
    const results = await Promise.allSettled(promises);

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length) {
      console.error('Ошибка при взятии связки', failed);
      alert('Некоторые связки не удалось взять. Попробуй еще раз.');
    }

    // Удаляем успешно взятые связки из выбора
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        selectedBundleIds.delete(bundleIds[idx]);
      }
    });

    updateSelectedBundlesDisplay();
    await load();

    const anySuccess = results.some(r => r.status === 'fulfilled');
    if (anySuccess) {
      triggerTakeGlow();
    }
  }

  function triggerTakeGlow() {
    const existing = document.getElementById('take-glow-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'take-glow-overlay';
    document.body.appendChild(overlay);

    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.remove();
      }
    }, 2500);
  }

  function triggerReturnGlow() {
    const existing = document.getElementById('return-glow-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'return-glow-overlay';
    document.body.appendChild(overlay);

    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.remove();
      }
    }, 2500);
  }

  async function returnKeys(bundleIds) {
    if (!bundleIds || !bundleIds.length) return;

    const promises = bundleIds.map((bundleId) => returnKey(bundleId, false, true));
    const results = await Promise.allSettled(promises);

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length) {
      console.error('Ошибка при возврате связок', failed);
      alert('Некоторые связки не удалось вернуть. Попробуй еще раз.');
    }

    // Удаляем успешно возвращенные связки из выбора
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        selectedBundleIds.delete(bundleIds[idx]);
      }
    });

    updateSelectedBundlesDisplay();
    await load();

    const anySuccess = results.some(r => r.status === 'fulfilled');
    if (anySuccess) {
      triggerReturnGlow();
    }
  }

  async function returnKey(bundleId, reload = true, quiet = false) {
    if (!bundleId) return;
    try {
      const res = await fetch(API_BASE + '/api/return', {
        method: 'POST',
        headers: buildAuthJsonHeaders(),
        body: JSON.stringify({ bundleId }),
      });
      if (!res.ok) throw new Error('Failed return');
      if (reload) await load();
    } catch (e) {
      console.error('Ошибка "вернуть"', e);
      if (!quiet) {
        alert('Не удалось сохранить на сервере. Попробуй еще раз.');
      }
      throw e;
    }
  }

  async function saveComment(bundleId, comment) {
    if (!bundleId) return;
    try {
      const res = await fetch(API_BASE + '/api/comment', {
        method: 'POST',
        headers: buildAuthJsonHeaders(),
        body: JSON.stringify({ bundleId, comment }),
      });
      if (!res.ok) throw new Error('Failed to save comment');
      await load();
    } catch (e) {
      console.error('Ошибка сохранения комментария', e);
      alert('Не удалось сохранить комментарий на сервере.');
    }
  }

  async function addPerson(name, phone, isAdminValue = false, password = null) {
    const n = (name || '').trim();
    const p = (phone || '').trim();
    const pw = password || '';
    if (!n) return;
    try {
      console.log('Adding person:', n, 'with token:', authToken ? authToken.substring(0, 20) + '...' : 'none');
      const res = await fetch(API_BASE + '/api/people/add', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken
        },
        body: JSON.stringify({ name: n, phone: p, isAdmin: isAdminValue, password: pw }),
      });
      const data = await res.json();
      console.log('Response status:', res.status, 'Response data:', data);
      if (!res.ok && data && typeof data.error === 'string' && data.error.includes('Сотрудник с таким именем уже существует')) {
        showValidationErrors([
          `Сотрудник "${n}" уже существует. Используйте другое имя или отредактируйте текущую запись.`
        ], {
          title: 'Предупреждение',
          variant: 'warning'
        });
        return;
      }
      if (!res.ok) {
        alert(data.error || 'Не удалось добавить сотрудника');
        return;
      }
      showEmployeeCreatedModal(n, isAdminValue ? 'ADMIN' : 'USER', pw);
      await loadPeople();
      renderPeopleManageList();
      return;
      // Show success message
      alert(`Сотрудник создан!\n\nЛогин: ${n}\n\nРоль: ${isAdminValue ? 'ADMIN' : 'USER'}\n\nПароль: ${pw}`);
      await loadPeople();
      renderPeopleManageList();
    } catch (e) {
      console.error('Ошибка добавления сотрудника', e);
      alert('Не удалось добавить сотрудника: ' + e.message);
    }
  }

  async function updatePerson(id, name, phone, isAdminValue) {
    const n = (name || '').trim();
    const p = (phone || '').trim();
    if (!n) return;
    try {
      const res = await fetch(API_BASE + '/api/people/update', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken
        },
        body: JSON.stringify({ id, name: n, phone: p, isAdmin: isAdminValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Не удалось обновить сотрудника');
        return;
      }
      await loadPeople();
      renderPeopleManageList();
      renderViewPanel();
    } catch (e) {
      console.error('Ошибка обновления сотрудника', e);
      alert('Не удалось обновить сотрудника.');
    }
  }

  async function deletePerson(id) {
    try {
      const res = await fetch(API_BASE + '/api/people/delete', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken
        },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Не удалось удалить сотрудника');
        return;
      }
      await loadPeople();
      renderPeopleManageList();
    } catch (e) {
      console.error('Ошибка удаления сотрудника', e);
      alert('Не удалось удалить сотрудника.');
    }
  }

  async function changePassword(id, newPassword) {
    if (!newPassword || newPassword.length < 4) {
      alert('Пароль должен быть не менее 4 символов');
      return;
    }
    try {
      const res = await fetch(API_BASE + '/api/change-password', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + authToken
        },
        body: JSON.stringify({ id, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Не удалось изменить пароль');
        return;
      }
      alert('Пароль успешно изменен');
    } catch (e) {
      console.error('Ошибка изменения пароля', e);
      alert('Не удалось изменить пароль.');
    }
  }

  async function getPersonPassword(id) {
    try {
      const res = await fetch(API_BASE + '/api/people/' + id + '/password', {
        headers: { 
          'Authorization': 'Bearer ' + authToken
        },
      });
      if (!res.ok) throw new Error('Failed to get password');
      const data = await res.json();
      return data.password;
    } catch (e) {
      console.error('Ошибка получения пароля', e);
      return null;
    }
  }

  function getAllBundles() {
    const list = [];
    getZonesSorted().forEach((z) => {
      z.bundles.forEach((range) => {
        list.push({ zoneId: z.id, zoneName: getShortZoneName(z), tkdRange: range, bundleId: getBundleId(z.id, range) });
      });
    });
    return list;
  }

  // DOM
  //const keySearch = document.getElementById('key-search');
  //const btnSearch = document.getElementById('btn-search');
  //const searchResults = document.getElementById('search-results');
  const bundleSearch = document.getElementById('bundle-search');
  //const zoneSelect = document.getElementById('zone-select');
  //const bundleList = document.getElementById('bundle-list');
  const quickBundleSelect = document.getElementById('quick-bundle-select');
  const btnQuickSelect = document.getElementById('btn-quick-select');
  const personName = document.getElementById('person-name');
  //const btnTake = document.getElementById('btn-take');
  const peopleList = document.getElementById('people-list');
  const viewPanel = document.getElementById('view-panel');
  const viewPersonName = document.getElementById('view-person-name');
  const viewPersonPhone = document.getElementById('view-person-phone');
  const viewKeysInfo = document.getElementById('view-keys-info');
  const viewBundles = document.getElementById('view-bundles');
  const viewButtons = document.getElementById('view-buttons');
  
  // People modal elements
  const peopleModal = document.getElementById('people-modal');
  const btnManagePeople = document.getElementById('btn-manage-people');
  const closePeopleModal = document.getElementById('close-people-modal');
  const newPersonName = document.getElementById('new-person-name');
  const newPersonPhone = document.getElementById('new-person-phone');
  const newPersonPassword = document.getElementById('new-person-password');
  const newPersonRole = document.getElementById('new-person-role');
  const btnAddPerson = document.getElementById('btn-add-person');
  const peopleManageList = document.getElementById('people-manage-list');
  const historyList = document.getElementById('history-list');
  //const historySection = document.getElementById('history-section');
  //const toggleHistoryBtn = document.getElementById('toggle-history-btn');
  const toggleHistoryHideBtn = document.getElementById('toggle-history');
  const historyPersonFilter = document.getElementById('history-person-filter');

  let historyFilterPerson = '';
  let historyFilterBundle = '';
  let selectedPerson = null;
  let searchQuery = '';
  let bundleSearchQuery = '';

  // Текущий «корзина» выбранных связок (чтобы можно было выбрать из разных зон подряд)
  //const selectedBundleIds = new Set();
  //const selectedBundlesList = document.getElementById('selected-bundles');

  // Выбор связок для возврата в панели просмотра пользователя
  let selectedReturnBundleIds = new Set();

  function getPeopleWithKeys() {
    const set = new Set();
    Object.values(state).forEach((v) => {
      if (v && v.personName) set.add(v.personName);
    });
    return Array.from(set).sort();
  }

  function getZoneNumberFromZoneId(zoneId) {
    const match = String(zoneId || '').match(/^zone_(\d+)$/i);
    return match ? match[1] : '';
  }

  function parseBundleRange(range) {
    const [start = '', end = ''] = String(range || '').split('-');
    return {
      start,
      end,
      startNum: Number.parseInt(start, 10),
      endNum: Number.parseInt(end, 10),
      groupPrefix: start.length > 1 ? start.slice(0, -1) : start,
    };
  }

  function bundleContainsKey(range, keyValue) {
    const key = String(keyValue || '').trim();
    if (!/^\d+$/.test(key)) {
      return false;
    }

    const keyVariants = [key];
    if (key.length >= 5 && key[1] === '0') {
      keyVariants.push(key[0] + key.slice(2));
    }

    const { start, end, startNum, endNum } = parseBundleRange(range);

    if (!start) {
      return false;
    }

    if (!end) {
      return key === start;
    }

    if (!Number.isFinite(startNum) || !Number.isFinite(endNum)) {
      return false;
    }

    return keyVariants.some((candidate) => {
      const candidateNum = Number.parseInt(candidate, 10);

      if (start.length === end.length) {
        return Number.isFinite(candidateNum) && candidateNum >= startNum && candidateNum <= endNum;
      }

      if (end.length === start.length + 1 && end.startsWith(start)) {
        const basePrefix = start.slice(0, -1);
        const startLastDigit = Number.parseInt(start.slice(-1), 10);
        const endSuffix = Number.parseInt(end.slice(start.length), 10);

        if (!Number.isFinite(startLastDigit) || !Number.isFinite(endSuffix)) {
          return false;
        }

        if (candidate.length === start.length && basePrefix && candidate.startsWith(basePrefix)) {
          const candidateLastDigit = Number.parseInt(candidate.slice(-1), 10);
          return Number.isFinite(candidateLastDigit) && candidateLastDigit >= startLastDigit && candidateLastDigit <= 9;
        }

        if (candidate.length === end.length && candidate.startsWith(start)) {
          const candidateSuffix = Number.parseInt(candidate.slice(start.length), 10);
          return Number.isFinite(candidateSuffix) && candidateSuffix >= 0 && candidateSuffix <= endSuffix;
        }

        return false;
      }

      return Number.isFinite(candidateNum) && candidateNum >= startNum && candidateNum <= endNum;
    });
  }

  function bundleMatchesSearch(bundle, rawQuery) {
    const query = String(rawQuery || '').trim().toLowerCase();
    if (!query) return true;

    const zoneNumber = getZoneNumberFromZoneId(bundle.zoneId);
    const zoneName = String(bundle.zoneName || '').toLowerCase();
    const tkdRange = String(bundle.tkdRange || '').toLowerCase();
    const bundleId = String(bundle.bundleId || '').toLowerCase();
    const displayBundleId = zoneNumber ? `${zoneNumber}_${tkdRange}` : tkdRange;
    const { start: rangeStart, end: rangeEnd } = parseBundleRange(tkdRange);

    const zonePrefixedMatch = query.match(/^(\d+)[_-](.*)$/);
    if (zonePrefixedMatch) {
      const [, queryZone, queryTermRaw] = zonePrefixedMatch;
      const queryTerm = String(queryTermRaw || '').trim().toLowerCase();
      if (!queryZone || zoneNumber !== queryZone) {
        return false;
      }
      if (!queryTerm) {
        return true;
      }
      if (queryTerm.includes('-')) {
        return tkdRange.startsWith(queryTerm) || displayBundleId === `${queryZone}_${queryTerm}`;
      }
      if (bundleContainsKey(tkdRange, queryTerm)) {
        return true;
      }
      return rangeStart.startsWith(queryTerm) ||
        rangeStart === queryTerm ||
        rangeEnd === queryTerm;
    }

    return zoneName.includes(query) || tkdRange.includes(query) || bundleId.includes(query) || displayBundleId.includes(query);
  }

  function filterBundlesBySearch() {
    let list = getAllBundles();
    if (searchQuery) {
      const q = searchQuery.trim();
      const qLower = q.toLowerCase();

      // Check if search is a number (zone number)
      const isZoneNumber = /^\d+$/.test(q);

      list = list.filter((b) => {
        return bundleMatchesSearch(b, qLower);
      });

      // If searching by zone number, sort to show that zone first
      if (isZoneNumber) {
        list.sort((a, b) => {
          const aZoneNum = parseInt(a.zoneName.replace('Зона ', '')) || 0;
          const bZoneNum = parseInt(b.zoneName.replace('Зона ', '')) || 0;
          const searchNum = parseInt(q);

          // Exact zone match first
          if (aZoneNum === searchNum && bZoneNum !== searchNum) return -1;
          if (bZoneNum === searchNum && aZoneNum !== searchNum) return 1;

          // Then sort by zone number
          return aZoneNum - bZoneNum || a.tkdRange.localeCompare(b.tkdRange);
        });
      }
    }
    return list;
  }

  function formatTime(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function updateSelectedBundlesDisplay() {
    if (!selectedBundlesList) return;
    const listEl = selectedBundlesList.querySelector('.selected-bundles__list');
    if (!listEl) return;

    listEl.innerHTML = '';
    if (!selectedBundleIds.size) {
      // Скрываем весь блок если нет выбранных связок
      selectedBundlesList.classList.remove('selected-bundles--visible');
      return;
    }

    // Показываем блок если есть выбранные связки
    selectedBundlesList.classList.add('selected-bundles--visible');

    selectedBundleIds.forEach((bundleId) => {
      const parts = bundleId.split('_');
      const zoneId = parts.slice(0, 2).join('_');
      const tkdRange = parts.slice(2).join('_');
      const zone = zones.find((z) => z.id === zoneId);
      const zoneName = zone ? getShortZoneName(zone) : 'Зона неизвестна';
      const item = document.createElement('div');
      item.className = 'selected-bundles__item';
      item.innerHTML =
        `<span class="bundle-label">${escapeHtml(zoneName)} — <span class="tkd-label">ТКД ${escapeHtml(tkdRange)}</span></span>` +
        '<button type="button" class="selected-bundles__remove" aria-label="Убрать">×</button>';
      const removeBtn = item.querySelector('.selected-bundles__remove');
      removeBtn.addEventListener('click', () => {
        selectedBundleIds.delete(bundleId);
        updateSelectedBundlesDisplay();
        renderBundleSelect();
      });
      listEl.appendChild(item);
    });
  }

  function createBundleCommentEditor(bundleId, currentComment, options = {}) {
    const showCancel = options.showCancel !== false;
    const editor = document.createElement('div');
    editor.className = 'bundle-comment-editor';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'bundle-comment-editor__input';
    input.placeholder = 'Комментарий к связке';
    input.value = currentComment || '';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'bundle-comment-editor__save';
    saveBtn.textContent = 'Сохранить';

    saveBtn.addEventListener('click', async () => {
      const nextComment = input.value.trim();
      await saveComment(bundleId, nextComment);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveBtn.click();
      }
      if (showCancel && e.key === 'Escape') {
        e.preventDefault();
        cancelBtn.click();
      }
    });

    editor.appendChild(input);
    editor.appendChild(saveBtn);

    let cancelBtn = null;
    if (showCancel) {
      cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'bundle-comment-editor__cancel';
      cancelBtn.textContent = 'Отмена';
      cancelBtn.addEventListener('click', () => {
        input.value = currentComment || '';
      });
      editor.appendChild(cancelBtn);
    }

    return editor;
  }

   function renderZoneSelect() {
     if (!zoneSelect) return;
     zoneSelect.innerHTML = '<option value="">— Зона —</option>';
     getZonesSorted().forEach((z) => {
       const opt = document.createElement('option');
       opt.value = z.id;
       opt.textContent = getShortZoneName(z);
       zoneSelect.appendChild(opt);
     });
   }

   function populateModalZoneSelect() {
     const modalZoneSelect = document.getElementById('modal-add-zone');
     if (!modalZoneSelect) return;
     modalZoneSelect.value = '';
   }

  function renderHistory() {
    if (!historyList) return;
    if (history.length === 0) {
      historyList.innerHTML = '<p class="empty-message">История пуста</p>';
      return;
    }
    historyList.innerHTML = '';
    
    // Filter by bundle and person
    let filteredHistory = history;
    if (historyFilterBundle) {
      filteredHistory = filteredHistory.filter(h => h.bundleId && h.bundleId.includes(historyFilterBundle));
    }
    if (historyFilterPerson) {
      filteredHistory = filteredHistory.filter(h => h.personName === historyFilterPerson);
    }
    
    // Сортируем историю по времени: новые события вверху
    filteredHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    filteredHistory.forEach(h => {
      const item = document.createElement('div');
      item.className = 'history-item';
      const date = new Date(h.timestamp);
      const dateStr = date.toLocaleDateString('uk-UA');
      const timeStr = date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

      // Format bundle ID: zone_1_101-105 -> 1_101-105
      let bundleDisplay = h.bundleId || '';
      if (bundleDisplay.startsWith('zone_')) {
        const parts = bundleDisplay.replace('zone_', '').split('_');
        if (parts.length >= 2) {
          const zoneNum = parts[0];
          const tkdRange = parts.slice(1).join('_');
          bundleDisplay = `${zoneNum}_${tkdRange}`;
        }
      }

      const actionText = h.action === 'take' ? 'Взял' : 'Вернул';
      const actionClass = h.action === 'take' ? 'action-take' : 'action-return';
      item.innerHTML = `
        <span class="history-person">${escapeHtml(h.personName || 'Неизвестно')}</span>
        <span class="history-action ${actionClass}">${actionText}</span>
        <span class="history-bundle">${escapeHtml(bundleDisplay)}</span>
        <span class="history-time">${dateStr} ${timeStr}</span>
      `;
      historyList.appendChild(item);
    });
  }

  function renderPeopleSelect() {
    if (!personName) return;
    if (!Array.isArray(people)) people = [];
    const currentValue = personName.value;
    
    // Определяем, каких сотрудников показывать
    let peopleToShow = people;
    if (!isAdmin()) {
      // USER видит только себя
      if (currentUser) {
        peopleToShow = people.filter(p => p.name === currentUser.name);
      } else {
        peopleToShow = [];
      }
    }
    
    // Add disabled placeholder option
    const placeholderOpt = document.createElement('option');
    placeholderOpt.value = '';
    placeholderOpt.disabled = true;
    placeholderOpt.hidden = true;
    placeholderOpt.selected = !currentValue;
    placeholderOpt.textContent = 'Выбери сотрудника';
    personName.innerHTML = '';
    personName.appendChild(placeholderOpt);
    
    peopleToShow.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = p.name;
      // Store phone in dataset for easy access
      opt.dataset.phone = p.phone || '';
      personName.appendChild(opt);
    });
    
    // Restore selection if still valid
    if (currentValue && peopleToShow.some(p => p.name === currentValue)) {
      placeholderOpt.selected = false;
      personName.value = currentValue;
    } else if (!isAdmin() && currentUser && currentUser.name) {
      placeholderOpt.selected = false;
      personName.value = currentUser.name;
    }

    updatePersonSelectVisibility();
  }

  function updatePersonSelectVisibility() {
    if (!personName) return;
    const field = personName.closest('.field');
    if (!field) return;

    if (isAdmin()) {
      field.style.display = '';
      return;
    }

    field.style.display = 'none';
  }

  function renderPeopleManageList() {
    if (!peopleManageList) return;
    if (!Array.isArray(people)) people = [];
    peopleManageList.innerHTML = '';
    if (people.length === 0) {
      peopleManageList.innerHTML = '<p class="empty-message">Список сотрудников пуст</p>';
      return;
    }
    const isCurrentUserAdmin = isAdmin();
    people.forEach((p) => {
      const item = document.createElement('div');
      item.className = 'person-manage-item';
      item.innerHTML = `
        <div class="person-manage-header">
          <span class="person-manage-name">${escapeHtml(p.name)}</span>
          <span class="person-manage-role">${p.isAdmin ? '👑 ADMIN' : '👤 USER'}</span>
        </div>
        <div class="person-manage-details">
          <span class="person-manage-phone">${p.phone ? escapeHtml(p.phone) : '—'}</span>
        </div>
        ${isCurrentUserAdmin ? `
        <label class="admin-checkbox">
          <input type="checkbox" data-id="${p.id}" ${p.isAdmin ? 'checked' : ''}> Админ
        </label>
        ` : ''}
        ${isCurrentUserAdmin ? `
        <div class="person-manage-actions">
          <button type="button" class="btn-edit" data-id="${p.id}" data-name="${escapeHtml(p.name)}" data-admin="${p.isAdmin || false}" title="Редактировать">✏️</button>
          <button type="button" class="btn-change-password" data-id="${p.id}" title="Сменить пароль">🔑</button>
          <button type="button" class="btn-delete" data-id="${p.id}" title="Удалить">🗑️</button>
        </div>
        ` : ''}
      `;
      peopleManageList.appendChild(item);
    });
    // Add event listeners
    peopleManageList.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!isAdmin()) return;
        const id = parseInt(btn.dataset.id);
        const person = people.find(p => p.id === id);
        if (!person) return;
        
        // Show edit person modal
        openEditPersonModal(person);
      });
    });
    // Add password change button handler - open modal
    peopleManageList.querySelectorAll('.btn-change-password').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!isAdmin()) return;
        const id = parseInt(btn.dataset.id);
        const person = people.find(p => p.id === id);
        if (!person) return;
        
        // Show password change modal
        openPasswordModal(person);
      });
    });
    
    // Password modal elements
    const passwordModal = document.getElementById('password-modal');
    const closePasswordModal = document.getElementById('close-password-modal');
    const passwordModalCurrent = document.getElementById('password-modal-current');
    const passwordModalNew = document.getElementById('password-modal-new');
    const passwordModalCancel = document.getElementById('password-modal-cancel');
    const passwordModalSave = document.getElementById('password-modal-save');
    
     // Edit person modal elements
     const editPersonModal = document.getElementById('edit-person-modal');
     const closeEditPersonModal = document.getElementById('close-edit-person-modal');
     const editPersonModalName = document.getElementById('edit-person-modal-name');
     const editPersonModalPhone = document.getElementById('edit-person-modal-phone');
     const editPersonModalRole = document.getElementById('edit-person-modal-role');
     const editPersonModalCancel = document.getElementById('edit-person-modal-cancel');
     const editPersonModalSave = document.getElementById('edit-person-modal-save');
    
    let currentEditPersonId = null;
    
    function openPasswordModal(person) {
      currentEditPersonId = person.id;
      passwordModalCurrent.textContent = '••••••••';
      passwordModalNew.value = '';
      passwordModal.style.display = 'flex';
    }
    
    // Add event listener for show password button
    const btnShowPassword = document.getElementById('btn-show-password');
    if (btnShowPassword) {
      btnShowPassword.addEventListener('click', async () => {
        if (passwordModalCurrent.textContent === '••••••••') {
          // Show real password
          if (currentEditPersonId !== null) {
            const realPassword = await getPersonPassword(currentEditPersonId);
            if (realPassword) {
              passwordModalCurrent.textContent = realPassword;
              btnShowPassword.textContent = '🙈';
              btnShowPassword.title = 'Скрыть пароль';
            } else {
              alert('Не удалось получить пароль сотрудника');
            }
          }
        } else {
          // Hide password
          passwordModalCurrent.textContent = '••••••••';
          btnShowPassword.textContent = '👁️';
          btnShowPassword.title = 'Показать пароль';
        }
      });
    }
    
    function closePasswordModalFn() {
      passwordModal.style.display = 'none';
      currentEditPersonId = null;
    }
    
    if (closePasswordModal) {
      closePasswordModal.addEventListener('click', closePasswordModalFn);
    }
    
    if (passwordModalCancel) {
      passwordModalCancel.addEventListener('click', closePasswordModalFn);
    }
    
    if (passwordModal) {
      passwordModal.addEventListener('click', (e) => {
        if (e.target === passwordModal) {
          closePasswordModalFn();
        }
      });
    }
    
    if (passwordModalSave) {
      passwordModalSave.addEventListener('click', async () => {
        const newPassword = passwordModalNew.value;
        
        if (!newPassword || newPassword.length < 4) {
          alert('Пароль должен быть не менее 4 символов');
          return;
        }
        
        if (currentEditPersonId !== null) {
          await changePassword(currentEditPersonId, newPassword);
          closePasswordModalFn();
        }
      });
    }
    
    // Enter key in password field
    if (passwordModalNew) {
      passwordModalNew.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          passwordModalSave.click();
        }
      });
    }
    
    function openEditPersonModal(person) {
      currentEditPersonId = person.id;
      editPersonModalName.value = person.name;
      editPersonModalPhone.value = person.phone || '';
      if (editPersonModalRole) editPersonModalRole.value = person.isAdmin ? 'ADMIN' : 'USER';
      editPersonModal.style.display = 'flex';
    }
    
      // Очистка формы без закрытия окна (для кнопки "Отмена")
      function clearEditPersonForm() {
        if (editPersonModalName) editPersonModalName.value = '';
        if (editPersonModalPhone) editPersonModalPhone.value = '';
        if (editPersonModalRole) editPersonModalRole.value = '';
        // Снимаем классы ошибок
        if (editPersonModalName) editPersonModalName.classList.remove('input-error');
        if (editPersonModalPhone) editPersonModalPhone.classList.remove('input-error');
        if (editPersonModalRole) editPersonModalRole.classList.remove('input-error');
      }

      // Закрытие модального окна с очисткой (для крестика и клика по overlay)
      function closeEditPersonModalFn() {
        editPersonModal.style.display = 'none';
        clearEditPersonForm();
        currentEditPersonId = null;
      }

      if (closeEditPersonModal) {
        closeEditPersonModal.addEventListener('click', closeEditPersonModalFn);
      }

      if (editPersonModal) {
       editPersonModal.addEventListener('click', (e) => {
         if (e.target === editPersonModal) {
           closeEditPersonModalFn();
         }
       });
     }
    
      if (editPersonModalSave) {
        editPersonModalSave.addEventListener('click', async () => {
          const name = editPersonModalName.value.trim();
          const phone = editPersonModalPhone.value.trim();

          if (!name) {
            alert('Введите ФИО сотрудника');
            return;
          }

          if (currentEditPersonId !== null) {
            const isAdminValue = editPersonModalRole ? editPersonModalRole.value === 'ADMIN' : null;
            await updatePerson(currentEditPersonId, name, phone, isAdminValue);
            await loadPeople();
            renderPeopleManageList();
            closeEditPersonModalFn();
          }
        });
      }

      if (editPersonModalCancel) {
        editPersonModalCancel.addEventListener('click', clearEditPersonForm);
      }
    
    // Enter key in phone field
    if (editPersonModalPhone) {
      editPersonModalPhone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          editPersonModalSave.click();
        }
      });
    }
    peopleManageList.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!isAdmin()) return;
        const id = parseInt(btn.dataset.id);
        if (confirm('Удалить сотрудника ' + btn.closest('.person-manage-item').querySelector('.person-manage-name').textContent + '?')) {
          deletePerson(id);
        }
      });
    });
    // Replace delete buttons so the native confirm dialog is not used
    peopleManageList.querySelectorAll('.btn-delete').forEach(btn => {
      const replacement = btn.cloneNode(true);
      btn.replaceWith(replacement);
      replacement.addEventListener('click', () => {
        if (!isAdmin()) return;
        const id = parseInt(replacement.dataset.id);
        const person = people.find(p => p.id === id);
        if (!person) return;
        openPersonDeleteModal(person);
      });
    });

    // Admin checkbox handler
    peopleManageList.querySelectorAll('.admin-checkbox input').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        if (!isAdmin()) return;
        const id = parseInt(checkbox.dataset.id);
        const person = people.find(p => p.id === id);
        if (person) {
          updatePerson(id, person.name, person.phone, checkbox.checked);
        }
      });
    });
  }

  function renderBundleSelect() {
    const zoneId = zoneSelect ? zoneSelect.value : '';
    if (!bundleList) return;

    bundleList.innerHTML = '';

    const bundles = zoneId
      ? (zones.find((z) => z.id === zoneId)?.bundles || []).map((range) => ({
          zoneId,
          zoneName: getShortZoneName(zones.find((z) => z.id === zoneId)) || `Зона ${zoneId.split('_')[1] || 'неизвестна'}`,
          tkdRange: range,
          bundleId: getBundleId(zoneId, range),
        }))
      : getAllBundles();

    const sortedBundles = [...bundles].sort((a, b) => {
      const zoneCmp = a.zoneName.localeCompare(b.zoneName, 'uk', { numeric: true });
      if (zoneCmp !== 0) return zoneCmp;
      return a.tkdRange.localeCompare(b.tkdRange, 'uk', { numeric: true });
    });

    const filteredBundles = bundleSearchQuery
      ? sortedBundles.filter((b) => bundleMatchesSearch(b, bundleSearchQuery))
      : sortedBundles;

    if (!filteredBundles.length) {
      const empty = document.createElement('div');
      empty.className = 'bundle-empty';
      empty.textContent = zoneId ? 'В этой зоне нет связок.' : 'Нет связок для показа.';
      bundleList.appendChild(empty);
      return;
    }

    filteredBundles.forEach((b) => {
      const taken = Boolean(state[b.bundleId]?.personName);
      const bundleState = state[b.bundleId];
      const label = document.createElement('label');
      label.className = 'bundle-item';
      if (selectedBundleIds.has(b.bundleId)) label.classList.add('bundle-item--selected');
      if (taken) label.classList.add('bundle-item--taken');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = b.bundleId;
      checkbox.checked = selectedBundleIds.has(b.bundleId);
      // Отключаем checkbox для взятых связок
      if (taken) checkbox.disabled = true;

      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          selectedBundleIds.add(b.bundleId);
          label.classList.add('bundle-item--selected');
        } else {
          selectedBundleIds.delete(b.bundleId);
          label.classList.remove('bundle-item--selected');
        }
        updateSelectedBundlesDisplay();
      });

      let textContent = zoneId ? `ТКД ${b.tkdRange}` : `${b.zoneName} — ТКД ${b.tkdRange}`;
      // Показываем кто взял связку
      if (taken && bundleState && bundleState.personName) {
        textContent += ` (у ${bundleState.personName})`;
      }

      const text = document.createElement('span');
      text.textContent = textContent;

      label.appendChild(checkbox);
      label.appendChild(text);

      // Show comment if exists (even for returned keys)
      if (bundleState && bundleState.comment) {
        const commentSpan = document.createElement('span');
        commentSpan.className = 'bundle-comment';
        commentSpan.textContent = bundleState.comment;
        label.appendChild(commentSpan);
      }

      bundleList.appendChild(label);
    });
  }

  function renderPeople() {
    updateAdminMode();
    let people = getPeopleWithKeys();
    
    // Обычные пользователи теперь видят всех, кто взял ключи
    // if (!isAdmin() && currentUser) {
    //   people = people.filter(name => name === currentUser.name);
    // }
    
    peopleList.innerHTML = '';
    
    // Скрываем секцию если нет людей с ключами или не в Учёт ключей
    if (peopleSection) {
      peopleSection.style.display = (currentActivity === 'keys' && people.length) ? '' : 'none';
    }
    
    people.forEach((name) => {
      const count = Object.values(state).filter((v) => v && v.personName === name).length;
      const personDiv = document.createElement('div');
      personDiv.className = 'person-item';
      const chip = document.createElement('span');
      chip.className = 'person-chip' + (selectedPerson === name ? ' active' : '');
      chip.innerHTML = `<span class="person-chip-icon"><svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="22" fill="#DBEAFE"/><ellipse cx="24" cy="43" rx="12" ry="10" fill="#374151"/><circle cx="24" cy="17" r="10" fill="#FDE68A"/><path d="M15 11c0-4 4-7 9-7s9 3 9 7-4 7-9 7-9-3-9-7z" fill="#A16207"/></svg></span><span class="person-chip-name">${escapeHtml(name)}</span><span class="person-chip-count">${count}</span>`;
      chip.addEventListener('click', () => {
        selectedPerson = selectedPerson === name ? null : name;
        renderPeople();
        renderViewPanel();
      });
      personDiv.appendChild(chip);
      peopleList.appendChild(personDiv);
    });
  }

  function renderViewPanel() {
    if (!viewPanel || !viewPersonName || !viewKeysInfo || !viewBundles || !viewButtons) return;

    if (!selectedPerson) {
      viewPanel.style.display = 'none';
      return;
    }

    // Обычные пользователи могут просматривать ключи других, но не могут возвращать
    // if (!isAdmin() && currentUser && selectedPerson !== currentUser.name) {
    //   viewPanel.style.display = 'none';
    //   return;
    // }

    viewPanel.style.display = '';
    viewPersonName.textContent = `Ключи у: ${selectedPerson}`;

    // Get person's phone and set link
    const person = people.find(p => p.name === selectedPerson);
    if (person) {
      if (person.phone) {
        viewPersonPhone.textContent = person.phone;
        viewPersonPhone.href = `tel:${person.phone}`;
        viewPersonPhone.style.display = '';
        viewPersonPhone.title = 'Нажмите для звонка';
      } else {
        viewPersonPhone.textContent = '+ Добавить телефон';
        viewPersonPhone.href = '#';
        viewPersonPhone.style.display = '';
        viewPersonPhone.title = 'Нажмите для добавления телефона';
      }
    } else {
      viewPersonPhone.style.display = 'none';
    }

    // Add click handler for phone to edit/add (ADMIN only)
    if (isAdmin()) {
      viewPersonPhone.onclick = (e) => {
        e.preventDefault();
        if (!person) return;
        const newPhone = prompt('Введите номер телефона:', person.phone || '');
        if (newPhone !== null) {
          updatePerson(person.id, person.name, newPhone.trim(), person.isAdmin);
        }
      };
    }
    // Note: Non-admin users can still see and click the phone link to make a call

    // Get person's bundles
    const personBundles = Object.entries(state)
      .filter(([_, data]) => data && data.personName === selectedPerson)
      .map(([bundleId, data]) => {
        const parts = bundleId.split('_');
        const zoneId = parts.slice(0, 2).join('_');
        const tkdRange = parts.slice(2).join('_');
        const zone = zones.find((z) => z.id === zoneId);
        const zoneName = zone ? getShortZoneName(zone) : 'Зона неизвестна';
        return { bundleId, zoneName, tkdRange, takenAt: data.takenAt, comment: data.comment || '' };
      })
      .sort((a, b) => a.zoneName.localeCompare(b.zoneName) || a.tkdRange.localeCompare(b.tkdRange));

    if (!personBundles.length) {
      viewKeysInfo.textContent = 'У этого человека нет ключей.';
      viewBundles.innerHTML = '';
      viewButtons.innerHTML = '';

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'btn btn-secondary';
      closeBtn.textContent = 'Закрыть';
      closeBtn.addEventListener('click', () => {
        selectedPerson = null;
        renderPeople();
        renderViewPanel();
      });

      viewButtons.appendChild(closeBtn);
      return;
    }

    // По умолчанию помечаем все связки для возврата
    selectedReturnBundleIds = new Set(personBundles.map((b) => b.bundleId));

    // Проверяем, может ли текущий пользователь возвращать ключи
    const canReturn = isAdmin() || (currentUser && selectedPerson === currentUser.name);

    if (canReturn) {
      viewKeysInfo.textContent = `Всего: ${personBundles.length} связок. Выбери, какие вернуть:`;
    } else {
      viewKeysInfo.textContent = `Всего связок: ${personBundles.length}`;
    }

    viewBundles.innerHTML = '';
    
    // Отображаем ключи сотрудника
    personBundles.forEach((bundle) => {
      const item = document.createElement('div');
      item.className = 'view-bundle-item';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = bundle.bundleId;
      checkbox.checked = selectedReturnBundleIds.has(bundle.bundleId);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          selectedReturnBundleIds.add(bundle.bundleId);
        } else {
          selectedReturnBundleIds.delete(bundle.bundleId);
        }
      });
      
      const label = document.createElement('label');
      label.className = 'view-bundle-label';
      label.textContent = `${bundle.zoneName} — ТКД ${bundle.tkdRange}`;
      
      const timeInfo = document.createElement('span');
      timeInfo.className = 'view-bundle-time';
      timeInfo.textContent = `Взято: ${formatTime(bundle.takenAt)}`;
      
      if (canReturn) {
        item.appendChild(checkbox);
      }
      item.appendChild(label);
      item.appendChild(timeInfo);

      if (bundle.comment) {
        const commentInfo = document.createElement('div');
        commentInfo.className = 'view-bundle-comment';
        // commentInfo.textContent = `Комментарий: ${bundle.comment}`;
        item.appendChild(commentInfo);
      }

      // Все пользователи могут добавлять/редактировать комментарии
      item.appendChild(createBundleCommentEditor(bundle.bundleId, bundle.comment || '', { showCancel: false }));
      
      viewBundles.appendChild(item);
    });
    
    // Кнопки действий
    viewButtons.innerHTML = '';
    
    const returnBtn = document.createElement('button');
    returnBtn.type = 'button';
    returnBtn.className = 'btn btn-return';
    returnBtn.textContent = 'Вернуть выбранные';
    returnBtn.addEventListener('click', async () => {
      const bundleIds = Array.from(selectedReturnBundleIds);
      if (!bundleIds.length) {
        alert('Выберите связки для возврата');
        return;
      }
      await returnKeys(bundleIds);
      selectedPerson = null;
      renderPeople();
      renderViewPanel();
    });
    
    const returnAllBtn = document.createElement('button');
    returnAllBtn.type = 'button';
    returnAllBtn.className = 'btn btn-return';
    returnAllBtn.textContent = 'Вернуть все';
    returnAllBtn.addEventListener('click', async () => {
      const bundleIds = personBundles.map(b => b.bundleId);
      if (!bundleIds.length) {
        alert('У этого человека нет ключей');
        return;
      }
      if (confirm(`Вы уверены, что хотите вернуть все ${bundleIds.length} связок?`)) {
        await returnKeys(bundleIds);
        selectedPerson = null;
        renderPeople();
        renderViewPanel();
      }
    });

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn-danger';
    closeBtn.textContent = 'Закрыть';
    closeBtn.addEventListener('click', () => {
      selectedPerson = null;
      renderPeople();
      renderViewPanel();
    });
    
    if (canReturn) {
      viewButtons.appendChild(returnBtn);
      viewButtons.appendChild(returnAllBtn);
    }
    viewButtons.appendChild(closeBtn);
  }

  function isOverdue(takenAt) {
    const now = Date.now();
    const diffDays = Math.floor((now - takenAt) / (1000 * 60 * 60 * 24));
    return diffDays >= 2;
  }

  function getDaysOverdue(takenAt) {
    const now = Date.now();
    return Math.floor((now - takenAt) / (1000 * 60 * 60 * 24));
  }

  function renderOverdueNotification() {
    const notification = document.getElementById('overdue-notification');
    const countEl = document.getElementById('overdue-count');
    const listEl = document.getElementById('overdue-list');
    if (!notification || !countEl || !listEl) return;

    const overdueItems = [];
    for (const [bundleId, data] of Object.entries(state)) {
      if (data && data.takenAt && isOverdue(data.takenAt)) {
        const days = getDaysOverdue(data.takenAt);
        overdueItems.push({ bundleId, personName: data.personName, days });
      }
    }

    if (overdueItems.length === 0) {
      notification.style.display = 'none';
      return;
    }

    notification.style.display = 'block';
    countEl.textContent = overdueItems.length;
    listEl.textContent = overdueItems.map(item =>
      item.bundleId.split('_').slice(2).join('_') + ' (' + item.personName + ', ' + item.days + ' дн.)'
    ).join(', ');
   }

   function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function render() {
    renderZoneSelect();
    renderBundleSelect();
    updateSelectedBundlesDisplay();
    renderPeople();
    renderOverdueNotification();
    updateHistoryPersonFilter();
    renderHistory();
    renderAccessAdminLog();
    
    // Show/hide people section based on whether any keys are taken and activity
    const hasTakenKeys = Object.keys(state).some(key => state[key] && state[key].personName);
    if (peopleSection) {
      peopleSection.style.display = (currentActivity === 'keys' && hasTakenKeys) ? 'block' : 'none';
    }
  }

  function updateHistoryPersonFilter() {
    if (!historyPersonFilter) return;
    const currentValue = historyPersonFilter.value;
    historyPersonFilter.innerHTML = '<option value="">Все сотрудники</option>';
    // Get unique people from history
    const uniquePeople = [...new Set(history.map(h => h.personName).filter(Boolean))].sort();
    uniquePeople.forEach(person => {
      const opt = document.createElement('option');
      opt.value = person;
      opt.textContent = person;
      historyPersonFilter.appendChild(opt);
    });
    // Restore selection if still valid
    if (currentValue && uniquePeople.includes(currentValue)) {
      historyPersonFilter.value = currentValue;
    }
   }

    if (addressSearch) {
     addressSearch.addEventListener('input', () => {
       addressSearchQuery = addressSearch.value;
       if (addressSearchQuery.trim()) {
         renderAddressSearchResults();
       } else {
         if (addressSearchResults) addressSearchResults.style.display = 'none';
       }
     });

     addressSearch.addEventListener('keydown', (e) => {
       if (e.key === 'Escape') {
         addressSearch.value = '';
         addressSearchQuery = '';
         if (addressSearchResults) addressSearchResults.style.display = 'none';
       }
     });
   }

   if (bundleSearch) {
    bundleSearch.addEventListener('input', () => {
      bundleSearchQuery = bundleSearch.value;
      renderBundleSelect();
    });
    bundleSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        bundleSearch.value = '';
        bundleSearchQuery = '';
        renderBundleSelect();
      }
    });
  }

  // Access address search handlers
  const accessAddressSearch = document.getElementById('access-address-search');
  const accessAddressSearchResults = document.getElementById('access-address-search-results');

  function resizeAccessSearchInput() {}

// Filter addresses/TKD by search query for access section
  // Использует window.FuzzySearch (см. js/zone-access/search.js) для нечёткого поиска
  // с допуском опечаток, нормализацией адресных сокращений и переключения раскладки.
  function filterAccessAddressesBySearch() {
    const results = [];
    const rawQuery = accessAddressSearchQuery.trim();
    if (!rawQuery) return results;

    const fuzzy = window.FuzzySearch;
    const scoreFn = fuzzy && typeof fuzzy.matchScore === 'function'
      ? fuzzy.matchScore
      : function (q, t) {
        if (!q || !t) return -1;
        return String(t).toLowerCase().includes(String(q).toLowerCase()) ? 0 : -1;
      };

    Object.keys(zoneAccessData).forEach(zoneNum => {
      const addresses = zoneAccessData[zoneNum] || [];
      addresses.forEach((addr, addressIdx) => {
        const fullAddress = addr.address || '';

        // Ищем только в названии улицы (адрес) — это ЕДИНСТВЕННЫЙ источник результатов
        const addressScore = scoreFn(rawQuery, fullAddress);
        if (addressScore < 0) return;

        if (addr.tkdEntries && addr.tkdEntries.length > 0) {
          addr.tkdEntries.forEach((tkdEntry, tkdIdx) => {
            const tkdNumber = String(tkdEntry.tkd || '').trim();
            const entrance = String(tkdEntry.entrance || '').trim();
            const place = String(tkdEntry.place || '').trim();

            results.push({
              zoneNum,
              zoneName: getZoneDisplayName(zoneNum),
              address: addr.address,
              addressIdx: addressIdx,
              tkdEntry: { tkd: tkdNumber, entrance, place, tkdIdx },
              matchType: 'address',
              score: addressScore
            });
          });
        } else {
          results.push({
            zoneNum,
            zoneName: getZoneDisplayName(zoneNum),
            address: addr.address,
            addressIdx: addressIdx,
            tkdEntry: null,
            matchType: 'address',
            score: addressScore
          });
        }
      });
    });

    results.sort((a, b) => (a.score || 0) - (b.score || 0));
    return results;
  }

  // Render access address/TKD search results
  function renderAccessAddressSearchResults() {
    if (!accessAddressSearchResults) return;

    const list = filterAccessAddressesBySearch();
    accessAddressSearchResults.innerHTML = '';

    if (!list.length) {
      accessAddressSearchResults.innerHTML = '<p class="search-no-results">Ничего не найдено</p>';
      accessAddressSearchResults.style.display = list.length ? 'none' : '';
      return;
    }

    // Group results by zone and address index
    const grouped = {};
    list.forEach(item => {
      const key = `${item.zoneNum}_${item.addressIdx}`;
      if (!grouped[key]) {
        grouped[key] = {
          zoneNum: item.zoneNum,
          zoneName: item.zoneName,
          addressIdx: item.addressIdx,
          tkdEntries: []
        };
      }
      if (item.tkdEntry) {
        grouped[key].tkdEntries.push(item.tkdEntry);
      }
    });

    // Render grouped results with the same card layout as inside a zone
    Object.values(grouped).forEach(item => {
      const zoneNum = item.zoneNum;
      const addresses = zoneAccessData[zoneNum] || [];
      const addr = addresses[item.addressIdx] || {};
      const accessHtml = buildAddressCardAccessHtml(addr);

      const el = document.createElement('div');
      el.className = 'address-card search-result-address-card';
      el.style.cursor = 'pointer';

      el.innerHTML = `
        <div class="address-card__header">
          <div class="address-card__info">
            <span class="address-card__pin">📌</span>
            <span class="address-card__street">${escapeHtml(formatAddress(addr.address))}</span>
            <span class="address-card__zone-label" style="font-size: 0.85em; color: #666; margin-left: 0.5em;">${escapeHtml(item.zoneName)}</span>
          </div>
          ${accessHtml ? `<div class="address-card__access">${accessHtml}</div>` : ''}
        </div>
        <div class="address-card__details" style="display: block;">
          ${buildAddressCardTkdDetails(addr)}
        </div>
      `;

      accessAddressSearchResults.appendChild(el);
    });

    accessAddressSearchResults.style.display = '';
  }

  if (accessAddressSearch) {
    resizeAccessSearchInput();

    accessAddressSearch.addEventListener('input', () => {
      resizeAccessSearchInput();
      accessAddressSearchQuery = accessAddressSearch.value;
      if (accessAddressSearchQuery.trim()) {
        renderAccessAddressSearchResults();
      } else {
        if (accessAddressSearchResults) accessAddressSearchResults.style.display = 'none';
      }
    });

    accessAddressSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        accessAddressSearch.value = '';
        accessAddressSearchQuery = '';
        resizeAccessSearchInput();
        if (accessAddressSearchResults) accessAddressSearchResults.style.display = 'none';
      }
    });
  }

// Modal for adding address to any zone
const addAddressModal = document.getElementById('add-address-modal');
const btnAddAddressAllZones = document.getElementById('btn-add-address-all-zones');
const btnExportZoneAccess = document.getElementById('btn-export-zone-access');
const toggleAccessAdminLogBtn = document.getElementById('toggle-access-admin-log');
const closeAddAddressModal = document.getElementById('close-add-address-modal');
const modalAddZone = document.getElementById('modal-add-zone');
const modalAddCancel = document.getElementById('modal-add-cancel');
const modalAddConfirm = document.getElementById('modal-add-confirm');

// Voice input for address modal and edit form
const voiceInputBtnModal = document.getElementById('voice-input-btn');
const modalAddAddress = document.getElementById('modal-add-address');
const modalAddCode = document.getElementById('modal-add-code');

const voiceInputBtnEdit = document.getElementById('voice-input-edit-address');
const voiceInputBtnZoneForm = document.getElementById('voice-input-zone-form');
const editFormAddress = document.getElementById('access-form-address');
const editFormCode = document.getElementById('access-form-code');

if (window.VoiceInput && typeof window.VoiceInput.attach === 'function') {
    const aiVoiceParser = typeof window.VoiceInput.createAiParser === 'function'
      ? window.VoiceInput.createAiParser({
          endpoint: '/api/voice/parse',
          getAuthToken: () => (window.api && window.api.token ? window.api.token : ''),
        })
      : null;

    const baseVoiceOptions = {
      lang: 'uk-UA',
      fallbackLang: 'ru-RU',
      aiParse: aiVoiceParser,
      aiMode: 'prefer',
      aiConfidenceThreshold: 55,
      showToast,
    };

    if (voiceInputBtnModal) {
      window.VoiceInput.attach(voiceInputBtnModal, {
        ...baseVoiceOptions,
        fields: {
          address: modalAddAddress,
          code: modalAddCode,
        },
        isActive: () => {
          if (!addAddressModal) return false;
          const display = addAddressModal.style.display;
          return display === '' || display === 'block' || display === 'flex';
        },
        getZoneNum: () => document.getElementById('modal-add-zone')?.value || '',
      });
    }

    const editVoiceOptions = {
      ...baseVoiceOptions,
      fields: {
        address: editFormAddress,
        code: editFormCode,
      },
      isActive: () => {
        const editForm = document.getElementById('zone-edit-form');
        if (!editForm) return false;
        const display = editForm.style.display;
        return display === '' || display === 'block' || display === 'flex';
      },
      getZoneNum: () => currentZoneNum ? String(currentZoneNum) : '',
    };

    if (voiceInputBtnEdit) {
      window.VoiceInput.attach(voiceInputBtnEdit, editVoiceOptions);
    }
    if (voiceInputBtnZoneForm) {
      window.VoiceInput.attach(voiceInputBtnZoneForm, editVoiceOptions);
    }
} else {
    if (voiceInputBtnModal) voiceInputBtnModal.style.display = 'none';
    if (voiceInputBtnEdit) voiceInputBtnEdit.style.display = 'none';
    if (voiceInputBtnZoneForm) voiceInputBtnZoneForm.style.display = 'none';
}

  // Initialize modal zone select
  populateModalZoneSelect();

  if (btnAddAddressAllZones) {
    btnAddAddressAllZones.addEventListener('click', () => {
      modalAddZone.value = '';
      modalAddAddress.value = '';
      modalAddCode.value = '';
      addAddressModal.style.display = '';
      if (modalAddZone) modalAddZone.focus();
    });
  }

  const btnAddAddressInZone = document.getElementById('btn-add-address-in-zone');
  if (btnAddAddressInZone) {
    btnAddAddressInZone.addEventListener('click', () => {
      showZoneAccessEdit(true, -1);
    });
  }

  if (toggleAccessAdminLogBtn) {
    toggleAccessAdminLogBtn.textContent = 'Список';
    toggleAccessAdminLogBtn.addEventListener('click', () => {
      renderAccessAdminLog();
      updateAccessAdminLogVisibility();
    });
  }

  if (btnExportZoneAccess) {
    btnExportZoneAccess.addEventListener('click', () => {
      exportZoneAccessData();
    });
  }

  if (modalAddZone) {
    modalAddZone.addEventListener('input', () => {
      modalAddZone.value = modalAddZone.value.replace(/\D/g, '');
    });
  }

  if (closeAddAddressModal) {
    closeAddAddressModal.addEventListener('click', () => {
      addAddressModal.style.display = 'none';
    });
  }

  if (modalAddCancel) {
    modalAddCancel.addEventListener('click', () => {
      addAddressModal.style.display = 'none';
    });
  }

  if (modalAddConfirm) {
    modalAddConfirm.addEventListener('click', () => {
      const zoneNum = modalAddZone.value.trim();
      const address = modalAddAddress.value.trim();
      const code = modalAddCode.value.trim();

      if (!zoneNum) {
        showToast('Введи номер зоны');
        return;
      }

      if (!/^\d+$/.test(zoneNum)) {
        showToast('Номер зоны должен содержать только цифры');
        return;
      }

      if (!address) {
        showToast('Введи адрес');
        return;
      }

      // Add address to zone
      if (!zoneAccessData[zoneNum]) {
        zoneAccessData[zoneNum] = [];
      }

      zoneAccessData[zoneNum].push({
        address: address,
        code: code || '',
        tkdEntries: [],
        audit: stampAddressAudit(null, { isNew: true })
      });

      saveZoneAccessData();
      showToast(`Адрес "${address}" добавлен в Зону ${zoneNum}`);
      addAddressModal.style.display = 'none';
    });
  }

  // Close modal on background click
  if (addAddressModal) {
    addAddressModal.addEventListener('click', (e) => {
      if (e.target === addAddressModal) {
        addAddressModal.style.display = 'none';
      }
    });
  }

  if (zoneSelect) {
    zoneSelect.addEventListener('change', () => {
      if (bundleSearch) {
        bundleSearch.value = '';
        bundleSearchQuery = '';
      }
      renderBundleSelect();
    });
  }

  btnTake.addEventListener('click', () => {
    const bundleIds = getSelectedBundleIds();
    const name = isAdmin()
      ? personName.value
      : String(currentUser && currentUser.name ? currentUser.name : '').trim();
    if (!name) {
      alert(isAdmin() ? 'Выбери сотрудника из списка.' : 'Не удалось определить авторизованного пользователя.');
      return;
    }
    if (!bundleIds.length) {
      alert('Выбери связку(и) (ТКД).');
      return;
    }
    selectedPerson = null;
    takeKeys(bundleIds, name);
    if (isAdmin()) {
      personName.value = '';
    }
  });

  // Quick bundle select removed from UI.

  // People modal handlers
  if (btnManagePeople && peopleModal) {
    btnManagePeople.addEventListener('click', () => {
      renderPeopleManageList();
      peopleModal.style.display = 'flex';
    });
    closePeopleModal.addEventListener('click', () => {
      peopleModal.style.display = 'none';
    });
    peopleModal.addEventListener('click', (e) => {
      if (e.target === peopleModal) {
        peopleModal.style.display = 'none';
      }
    });
    if (btnAddPerson && newPersonName) {
      btnAddPerson.addEventListener('click', async () => {
        console.log('Add person button clicked');
        console.log('Elements found:', {
          btnAddPerson: !!btnAddPerson,
          newPersonName: !!newPersonName,
          newPersonPhone: !!newPersonPhone,
          newPersonPassword: !!newPersonPassword,
          newPersonRole: !!newPersonRole
        });
        
        if (!isAdmin()) {
          alert('Только администратор может добавлять сотрудников');
          return;
        }
        const name = newPersonName.value.trim();
        // Phone is optional - get value if field exists
        const phone = newPersonPhone ? newPersonPhone.value.trim() : '';
        // Password is required
        const password = newPersonPassword ? newPersonPassword.value.trim() : '';
        // Role selection (ADMIN or USER)
        const role = newPersonRole ? newPersonRole.value : 'USER';
        const isAdminValue = role === 'ADMIN';
        
        console.log('Form data:', { name, phone, password, isAdminValue });
        
        if (!name) {
          alert('Введите ФИО сотрудника');
          return;
        }
        
        const duplicatePerson = Array.isArray(people)
          ? people.find((person) => normalizePersonNameForCompare(person.name) === normalizePersonNameForCompare(name))
          : null;

        if (duplicatePerson) {
          showValidationErrors([
            `Сотрудник "${name}" уже есть в списке. Нельзя добавить второго сотрудника с таким же именем.`
          ], {
            title: 'Предупреждение',
            variant: 'warning'
          });
          return;
        }

        if (!password || password.length < 4) {
          alert('Введите пароль (минимум 4 символа)');
          return;
        }
        
        try {
          console.log('Attempting to add person:', { name, phone, isAdminValue, password });
          await addPerson(name, phone, isAdminValue, password);
          // Clear form fields
          newPersonName.value = '';
          if (newPersonPhone) newPersonPhone.value = '';
          if (newPersonPassword) newPersonPassword.value = '';
          if (newPersonRole) newPersonRole.value = 'USER';
        } catch (error) {
          console.error('Error adding person:', error);
          alert('Ошибка при добавлении сотрудника: ' + error.message);
        }
      });
      newPersonName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') btnAddPerson.click();
      });
    }
  }

  // History toggle handler
  if (toggleHistoryBtn && historySection) {
    toggleHistoryBtn.addEventListener('click', () => {
      if (historySection.style.display === 'none') {
        historySection.style.display = 'block';
        toggleHistoryBtn.textContent = 'История';
        toggleHistoryBtn.classList.add('active');
      } else {
        historySection.style.display = 'none';
        toggleHistoryBtn.textContent = 'История';
        toggleHistoryBtn.classList.remove('active');
      }
    });
  }

  // History hide button handler
  if (toggleHistoryHideBtn && historySection) {
    toggleHistoryHideBtn.addEventListener('click', () => {
      historySection.style.display = 'none';
      if (toggleHistoryBtn) {
        toggleHistoryBtn.classList.remove('active');
      }
    });
  }

  // Person select handler — only update admin mode, don't affect view panel
  if (personName) {
    personName.addEventListener('change', () => {
      updateAdminMode();
    });
  }

  // Login modal handlers
  const loginModal = document.getElementById('login-modal');
  const closeLoginModal = document.getElementById('close-login-modal');
  const btnDoLogin = document.getElementById('btn-do-login');
  const loginName = document.getElementById('login-name');

  if (btnLogin && loginModal) {
    btnLogin.addEventListener('click', () => {
      loginModal.style.display = 'flex';
    });
  }

  if (closeLoginModal && loginModal) {
    closeLoginModal.addEventListener('click', () => {
      loginModal.style.display = 'none';
    });
    loginModal.addEventListener('click', (e) => {
      if (e.target === loginModal) {
        loginModal.style.display = 'none';
      }
    });
  }

  const loginPassword = document.getElementById('login-password');
  
  if (btnDoLogin && loginName && loginPassword) {
    btnDoLogin.addEventListener('click', async () => {
      const name = loginName.value;
      const password = loginPassword.value;
      if (!name || !name.trim()) {
        alert('Введите имя пользователя');
        return;
      }
      if (!password) {
        alert('Введите пароль');
        return;
      }
      const success = await login(name.trim(), password);
      if (success) {
        loginModal.style.display = 'none';
        loginName.value = '';
        loginPassword.value = '';
      }
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      logout();
    });
  }

  // Switch profile button - logout and show login screen
  const btnSwitchProfile = document.getElementById('btn-switch-profile');
  if (btnSwitchProfile) {
    btnSwitchProfile.addEventListener('click', () => {
      if (peopleModal) peopleModal.style.display = 'none';
      logout();
    });
  }

  const headerBtnSwitchProfile = document.getElementById('header-btn-switch-profile');
  if (headerBtnSwitchProfile) {
    headerBtnSwitchProfile.addEventListener('click', () => {
      logout();
    });
  }

  // History person filter handler
  if (historyPersonFilter) {
    historyPersonFilter.addEventListener('change', () => {
      historyFilterPerson = historyPersonFilter.value;
      renderHistory();
    });
  }
  
  // History bundle filter handler
  const historyBundleFilter = document.getElementById('history-bundle-filter');
  if (historyBundleFilter) {
    historyBundleFilter.addEventListener('input', () => {
      historyFilterBundle = historyBundleFilter.value.trim();
      renderHistory();
    });
  }

  // Инициализация
  const accessSection = document.getElementById('access-section');
  const searchSection = document.querySelector('.search-section');
  const actionsSection = document.querySelector('.actions-section');
  const historySectionEl = document.getElementById('history-section');
  const peopleSection = document.getElementById('people-section');
  const zoneAccessModal = document.getElementById('zone-access-modal');
  
  // Ensure modal is hidden initially
  if (zoneAccessModal) zoneAccessModal.style.display = 'none';
  
  // Set initial view - always start with keys activity (default)
  // Hide access section initially
  if (accessSection) accessSection.style.display = 'none';
  
  // Keys sections should be visible
  if (searchSection) searchSection.style.display = 'block';
  if (actionsSection) actionsSection.style.display = 'block';

  // Load zone access data from localStorage
  loadZoneAccessData();

  // Try auto-login with persistent token first, then load
  tryAutoLogin().then((autoLoggedIn) => {
    if (autoLoggedIn) {
      console.log('Auto-login successful');
    }
    load();
    render();
    // Register service worker for push notifications
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((e) => {
        console.error('SW registration error:', e);
      });
    }
    // Mobile fix: first tap on input inside fixed overlay often doesn't
    // open keyboard. Focus the login field on the very first touch.
    if (loginNameInput) {
      const firstTouch = () => {
        if (loginScreen && loginScreen.style.display !== 'none') {
          loginNameInput.focus();
        }
        document.removeEventListener('touchstart', firstTouch, true);
      };
      document.addEventListener('touchstart', firstTouch, { capture: true, passive: true });
    }
  });
})();




