const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

const gatewayUrl = tg.initDataUnsafe?.start_param ? 
    `${window.location.origin.replace('/webapp', '')}` : 
    (window.location.origin.includes('localhost') ? 'http://localhost:8080' : window.location.origin.replace('/webapp', ''));

const telegramId = tg.initDataUnsafe?.user?.id;
if (!telegramId) {
    document.body.innerHTML = '<div style="padding: 20px; text-align: center;">Ошибка: не удалось получить ID пользователя</div>';
}

// State
let currentTab = 'home';
let currentType = 'expense';
let currentPeriod = 'day';
let currentDate = new Date();
let periodStartDate = null;
let periodEndDate = null;
let customStartDate = null;
let customEndDate = null;
let accounts = [];
let categories = [];
let editingTransactionId = null;
let editingAccountId = null;
let selectedCategoryId = null;

// Utility functions
function normalizeAmount(value) {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    if (trimmed === '') return null;
    const normalized = trimmed.replace(',', '.');
    const num = parseFloat(normalized);
    // Explicitly allow zero value
    if (normalized === '0' || normalized === '0.0' || normalized === '0.00') {
        return 0;
    }
    if (isNaN(num) || num < 0 || !isFinite(num)) return null;
    return Math.round(num * 100) / 100;
}

function validateAmount(value, fieldId) {
    const normalized = normalizeAmount(value);
    if (normalized === null) {
        const field = document.getElementById(fieldId);
        if (field) field.classList.add('invalid');
        return null;
    }
    // normalized can be 0, which is a valid value
    return normalized.toString();
}

function validateDate(date, allowFuture = false) {
    const today = new Date().toISOString().split('T')[0];
    if (!allowFuture && date > today) {
        showToast('Нельзя создавать транзакции с датой позже сегодняшнего дня');
        return false;
    }
    return true;
}

async function apiRequest(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: {'Content-Type': 'application/json'},
            ...options
        });
        const data = await response.json();
        if (response.ok) {
            return { success: true, data };
        }
        return { success: false, error: data.error || 'Ошибка запроса' };
    } catch (error) {
        console.error('API request error:', error);
        return { success: false, error: 'Ошибка соединения' };
    }
}

function resetForm(formId) {
    const form = document.getElementById(formId);
    if (form) {
        form.reset();
        form.querySelectorAll('.form-input').forEach(field => {
            field.classList.remove('invalid');
        });
    }
}

// Toast Notification
function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    
    toastMessage.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Form Validation
function validateForm(form) {
    let isValid = true;
    const requiredFields = form.querySelectorAll('[required]');
    
    // Remove invalid class from all fields first
    form.querySelectorAll('.form-input').forEach(field => {
        field.classList.remove('invalid');
    });
    
    // Check each required field
    requiredFields.forEach(field => {
        let value = field.value.trim();
        const isEmpty = value === '' || value === null || value === undefined;
        
        // Special check for select elements
        if (field.tagName === 'SELECT' && isEmpty) {
            field.classList.add('invalid');
            isValid = false;
        } else if (field.tagName === 'INPUT') {
            // Check if it's a number input (amount, balance fields)
            const isNumberField = field.type === 'text' && (
                field.id.includes('Amount') || 
                field.id.includes('Balance')
            );
            
            if (isEmpty) {
                field.classList.add('invalid');
                isValid = false;
            } else if (isNumberField) {
                // For number fields, check if value is valid after replacing comma
                const numValue = value.replace(',', '.');
                const parsed = parseFloat(numValue);
                // Allow zero value (0, 0.0, 0.00, etc.)
                if (numValue === '' || (isNaN(parsed) && numValue !== '0' && numValue !== '0.0' && numValue !== '0.00')) {
                    field.classList.add('invalid');
                    isValid = false;
                }
            }
        }
    });
    
    // Special validation for transaction form - check category selection
    if (form.id === 'transactionForm' && !selectedCategoryId) {
        isValid = false;
    }
    
    if (!isValid) {
        // Show specific message for category if needed, otherwise general message
        if (form.id === 'transactionForm' && !selectedCategoryId) {
            showToast('Выберите категорию');
        } else {
            showToast('Заполните все обязательные поля');
        }
    }
    
    return isValid;
}

// Remove invalid class when user starts typing
function setupFieldValidation() {
    document.querySelectorAll('.form-input[required]').forEach(field => {
        field.addEventListener('input', function() {
            if (this.classList.contains('invalid')) {
                this.classList.remove('invalid');
            }
        });
        
        field.addEventListener('change', function() {
            if (this.classList.contains('invalid')) {
                this.classList.remove('invalid');
            }
        });
    });
}

// Setup account name inputs to allow any characters including Russian
function setupAccountNameInputs() {
    const accountNameInputs = ['accountName', 'editAccountName'];
    
    accountNameInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (!input) return;
        
        // Ensure input accepts any characters
        input.setAttribute('lang', 'ru');
        input.setAttribute('inputmode', 'text');
        
        // Remove any potential restrictions on keydown/keypress
        input.addEventListener('keydown', function(e) {
            // Allow all keys including Russian characters
            // Don't block any input
        });
        
        input.addEventListener('keypress', function(e) {
            // Allow all keys including Russian characters
            // Don't block any input
        });
        
        input.addEventListener('input', function(e) {
            // Allow all input including Russian characters
            // Don't filter or modify the input
        });
    });
}

// Custom Alert Modal (replaces tg.showAlert and alert)
function showAlert(message, type = 'auto') {
    if (!message || typeof message !== 'string') {
        message = 'Произошла ошибка';
    }
    // Limit message length for display
    message = String(message).substring(0, 500);
    if (message.length === 0) {
        message = 'Произошла ошибка';
    }
    
    // Auto-detect type if not specified
    if (type === 'auto') {
        const lowerMessage = message.toLowerCase();
        if (lowerMessage.includes('ошибка') || lowerMessage.includes('не удалось') || lowerMessage.includes('нельзя')) {
            type = 'error';
        } else if (lowerMessage.includes('создан') || lowerMessage.includes('обновлен') || lowerMessage.includes('удален') || 
                  lowerMessage.includes('выполнен') || lowerMessage.includes('успешно')) {
            type = 'success';
        } else {
            type = 'info';
        }
    }
    
    return new Promise((resolve) => {
        const modal = document.getElementById('alertModal');
        const messageElement = document.getElementById('alertMessage');
        const iconElement = document.getElementById('alertIcon');
        const iconContainer = document.getElementById('alertIconContainer');
        const okBtn = document.getElementById('alertOkBtn');
        
        messageElement.textContent = message;
        
        // Set icon and colors based on type
        let icon, bgGradient, btnGradient, btnShadow;
        if (type === 'success') {
            icon = '✓';
            bgGradient = 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)';
            btnGradient = 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)';
            btnShadow = '0 4px 12px rgba(76, 175, 80, 0.3)';
        } else if (type === 'error') {
            icon = '✕';
            bgGradient = 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)';
            btnGradient = 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)';
            btnShadow = '0 4px 12px rgba(244, 67, 54, 0.3)';
        } else {
            icon = 'ℹ';
            bgGradient = 'linear-gradient(135deg, #0099DD 0%, #00ABBD 100%)';
            btnGradient = 'linear-gradient(135deg, #0099DD 0%, #00ABBD 100%)';
            btnShadow = '0 4px 12px rgba(0, 153, 221, 0.3)';
        }
        
        iconElement.textContent = icon;
        iconContainer.style.background = bgGradient;
        okBtn.style.background = btnGradient;
        okBtn.style.boxShadow = btnShadow;
        
        // Remove old listeners
        const newOkBtn = okBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOkBtn, okBtn);
        
        // Add new listener
        newOkBtn.addEventListener('click', () => {
            closeModal('alertModal');
            resolve();
        });
        
        // Handle outside click
        const handleClose = () => {
            resolve();
            modal.removeEventListener('click', outsideClickHandler);
        };
        
        const outsideClickHandler = (e) => {
            if (e.target === modal) {
                handleClose();
            }
        };
        
        modal.addEventListener('click', outsideClickHandler);
        
        // Show modal
        modal.classList.add('show');
    });
}

// Confirmation Dialog
function showConfirmDialog(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmationModal');
        const messageElement = document.getElementById('confirmationMessage');
        const confirmBtn = document.getElementById('confirmDeleteBtn');
        
        messageElement.textContent = message;
        
        // Remove old listeners
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        
        // Add new listener
        newConfirmBtn.addEventListener('click', () => {
            closeModal('confirmationModal');
            resolve(true);
        });
        
        // Handle cancel/close
        const handleCancel = () => {
            resolve(false);
            modal.removeEventListener('click', outsideClickHandler);
        };
        
        const outsideClickHandler = (e) => {
            if (e.target === modal) {
                handleCancel();
            }
        };
        
        modal.addEventListener('click', outsideClickHandler);
        
        // Show modal
        modal.classList.add('show');
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Установить максимальную дату (сегодня) для полей даты
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('transactionDate').setAttribute('max', today);
    document.getElementById('editTransactionDate').setAttribute('max', today);
    
    // Разрешить ввод любых символов (включая русские) в полях названия счета
    setupAccountNameInputs();
    
    setupFieldValidation();
    setupEventListeners();
    setupAddTransactionButton();
    
    // Инициализация периода
    currentDate = new Date();
    currentPeriod = 'week';
    // Установить активную вкладку периода
    document.querySelectorAll('.period-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.period === currentPeriod) {
            tab.classList.add('active');
        }
    });
    updateDateDisplay();
    
    loadUserInfo();
    loadAccounts();
    loadCategories(currentType);
    loadHomeData();
});

function setupEventListeners() {
    // Sidebar
    document.getElementById('menuButton').addEventListener('click', toggleSidebar);
    document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);
    document.querySelectorAll('.menu-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tab = e.currentTarget.dataset.tab;
            switchTab(tab);
            closeSidebar();
        });
    });

    // Type selector
    document.querySelectorAll('.type-button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentType = e.currentTarget.dataset.type;
            document.querySelectorAll('.type-button').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            loadCategories(currentType);
            loadHomeData();
        });
    });

    // Period selector
    document.querySelectorAll('.period-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const period = e.currentTarget.dataset.period;
            selectPeriod(period);
        });
    });

    // Date navigation
    document.getElementById('dateNavPrev').addEventListener('click', () => {
        navigatePeriod(-1);
    });

    document.getElementById('dateNavNext').addEventListener('click', () => {
        navigatePeriod(1);
    });

    // Date display click - open period selector
    document.getElementById('dateRangeDisplay').addEventListener('click', () => {
        openPeriodSelector();
    });

    // Balance account selector
    document.getElementById('balanceAccountSelect').addEventListener('change', () => {
        loadBalance();
    });

    // Forms
    document.getElementById('transactionForm').addEventListener('submit', handleTransactionSubmit);
    document.getElementById('transactionEditForm').addEventListener('submit', handleTransactionEditSubmit);
    document.getElementById('accountForm').addEventListener('submit', handleAccountSubmit);
    document.getElementById('accountEditForm').addEventListener('submit', handleAccountEditSubmit);
    document.getElementById('transferForm').addEventListener('submit', handleTransferSubmit);
    document.getElementById('transferEditForm').addEventListener('submit', handleTransferEditSubmit);
    document.getElementById('deleteTransferBtn').addEventListener('click', handleDeleteTransfer);
    document.getElementById('addCategoryForm').addEventListener('submit', handleAddCategorySubmit);
    document.getElementById('customPeriodForm').addEventListener('submit', handleCustomPeriodSubmit);
    document.getElementById('daySelectorForm').addEventListener('submit', handleDaySelectorSubmit);
    document.getElementById('weekSelectorForm').addEventListener('submit', handleWeekSelectorSubmit);
    document.getElementById('monthSelectorForm').addEventListener('submit', handleMonthSelectorSubmit);
    document.getElementById('yearSelectorForm').addEventListener('submit', handleYearSelectorSubmit);

    // Buttons
    document.getElementById('addAccountBtn').addEventListener('click', () => {
        document.getElementById('accountModalTitle').textContent = 'Добавить счет';
        const form = document.getElementById('accountForm');
        form.reset();
        form.querySelectorAll('.form-input').forEach(field => {
            field.classList.remove('invalid');
        });
        openModal('accountModal');
    });

    document.getElementById('transferBtn').addEventListener('click', () => {
        loadTransferForm();
        openModal('transferModal');
    });

    document.getElementById('transferHistoryBtn').addEventListener('click', () => {
        loadTransferHistory();
        openModal('transferHistoryModal');
    });

    document.getElementById('deleteTransactionBtn').addEventListener('click', handleDeleteTransaction);
    document.getElementById('deleteAccountBtn').addEventListener('click', handleDeleteAccount);
    document.getElementById('addCategoryBtn').addEventListener('click', () => {
        const form = document.getElementById('addCategoryForm');
        form.reset();
        form.querySelectorAll('.form-input').forEach(field => {
            field.classList.remove('invalid');
        });
        openModal('addCategoryModal');
    });

    // Simple amount validation - allow only 0-9, dot and comma, only one dot/comma, max 2 decimal places
    function setupAmountValidation(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        
        input.addEventListener('input', function() {
            // Remove invalid class when user starts typing
            if (this.classList.contains('invalid')) {
                this.classList.remove('invalid');
            }
            
            let value = this.value;
            
            // Remove all characters except 0-9, dot, comma
            value = value.replace(/[^0-9.,]/g, '');
            
            // Check if dot or comma already exists
            const hasDot = value.includes('.');
            const hasComma = value.includes(',');
            
            // If both exist, keep only the first one
            if (hasDot && hasComma) {
                const dotPos = value.indexOf('.');
                const commaPos = value.indexOf(',');
                if (dotPos < commaPos) {
                    value = value.replace(/,/g, '');
                } else {
                    value = value.replace(/\./g, '');
                }
            }
            
            // Remove duplicate dots
            if ((value.match(/\./g) || []).length > 1) {
                const firstDot = value.indexOf('.');
                value = value.substring(0, firstDot + 1) + value.substring(firstDot + 1).replace(/\./g, '');
            }
            
            // Remove duplicate commas
            if ((value.match(/,/g) || []).length > 1) {
                const firstComma = value.indexOf(',');
                value = value.substring(0, firstComma + 1) + value.substring(firstComma + 1).replace(/,/g, '');
            }
            
            // Limit to 2 decimal places
            const decimalSeparator = value.includes('.') ? '.' : (value.includes(',') ? ',' : null);
            if (decimalSeparator) {
                const parts = value.split(decimalSeparator);
                if (parts.length === 2 && parts[1].length > 2) {
                    // Limit to 2 decimal places
                    parts[1] = parts[1].substring(0, 2);
                    value = parts[0] + decimalSeparator + parts[1];
                }
            }
            
            this.value = value;
        });
    }
    
    setupAmountValidation('transactionAmount');
    setupAmountValidation('editTransactionAmount');
    setupAmountValidation('accountBalance');
    setupAmountValidation('editAccountBalance');
    setupAmountValidation('transferAmount');
    setupAmountValidation('editTransferAmount');
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
}

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.menu-link').forEach(l => l.classList.remove('active'));

    document.getElementById(`${tab}Tab`).classList.add('active');
    document.querySelector(`.menu-link[data-tab="${tab}"]`).classList.add('active');

    document.getElementById('pageTitle').textContent = tab === 'home' ? 'Главная' : 'Счета';

    if (tab === 'home') {
        loadHomeData();
    } else if (tab === 'accounts') {
        loadAccounts();
    }
}


function formatDate(date) {
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Period management functions
function formatDateForDisplay(date) {
    const months = ['янв.', 'февр.', 'марта', 'апр.', 'мая', 'июня', 'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
    const day = date.getDate();
    const month = months[date.getMonth()];
    return `${day} ${month}`;
}

function getPeriodDates(period, date) {
    const result = { start: null, end: null };
    const d = new Date(date);
    
    switch (period) {
        case 'day':
            d.setHours(0, 0, 0, 0);
            result.start = new Date(d);
            result.end = new Date(d);
            result.end.setHours(23, 59, 59, 999);
            break;
            
        case 'week':
            // Неделя: только прошедшие даты + сегодня
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // Начало недели (понедельник)
            const dayOfWeek = d.getDay();
            const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Если воскресенье, откат на 6 дней назад
            d.setDate(d.getDate() + diff);
            d.setHours(0, 0, 0, 0);
            result.start = new Date(d);
            
            // Конец недели - либо воскресенье, либо сегодня (если сегодня раньше)
            result.end = new Date(d);
            result.end.setDate(result.end.getDate() + 6);
            result.end.setHours(23, 59, 59, 999);
            
            // Если конец недели в будущем, ограничиваем сегодняшним днем
            if (result.end > today) {
                result.end = new Date(today);
                result.end.setHours(23, 59, 59, 999);
            }
            break;
            
        case 'month':
            // Начало месяца
            result.start = new Date(d.getFullYear(), d.getMonth(), 1);
            result.start.setHours(0, 0, 0, 0);
            
            // Конец месяца
            result.end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
            result.end.setHours(23, 59, 59, 999);
            break;
            
        case 'year':
            // Начало года
            result.start = new Date(d.getFullYear(), 0, 1);
            result.start.setHours(0, 0, 0, 0);
            
            // Конец года
            result.end = new Date(d.getFullYear(), 11, 31);
            result.end.setHours(23, 59, 59, 999);
            break;
            
        case 'custom':
            // Для кастомного периода используем сохраненные даты или текущую дату
            if (customStartDate && customEndDate) {
                result.start = new Date(customStartDate);
                result.end = new Date(customEndDate);
            } else {
                d.setHours(0, 0, 0, 0);
                result.start = new Date(d);
                result.end = new Date(d);
                result.end.setHours(23, 59, 59, 999);
            }
            break;
    }
    
    return result;
}

function getDateRangeDisplay(period, date) {
    const dates = getPeriodDates(period, date);
    
    if (period === 'day') {
        return formatDateForDisplay(dates.start);
    } else if (period === 'month') {
        // Для месяца показывать название месяца и год
        const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                          'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        return `${monthNames[dates.start.getMonth()]} ${dates.start.getFullYear()}`;
    } else if (period === 'year') {
        // Для года показывать только год
        return dates.start.getFullYear().toString();
    } else if (period === 'custom' && customStartDate && customEndDate) {
        // Для кастомного периода показывать диапазон
        const startStr = formatDateForDisplay(customStartDate);
        const endStr = formatDateForDisplay(customEndDate);
        return `${startStr} - ${endStr}`;
    } else {
        // Для недели показывать диапазон
        const startStr = formatDateForDisplay(dates.start);
        const endStr = formatDateForDisplay(dates.end);
        return `${startStr} - ${endStr}`;
    }
}

function updateDateDisplay() {
    const display = document.getElementById('dateRangeDisplay');
    const prevBtn = document.getElementById('dateNavPrev');
    const nextBtn = document.getElementById('dateNavNext');
    
    if (display) {
        display.textContent = getDateRangeDisplay(currentPeriod, currentDate);
    }
    
    // Скрывать только стрелки навигации для кастомного периода (отображение даты остается видимым)
    if (currentPeriod === 'custom') {
        if (prevBtn) prevBtn.classList.add('hidden');
        if (nextBtn) nextBtn.classList.add('hidden');
    } else {
        if (prevBtn) prevBtn.classList.remove('hidden');
        updateNavigationButtons();
    }
    
    updatePeriodDates();
}

function updateNavigationButtons() {
    const prevBtn = document.getElementById('dateNavPrev');
    const nextBtn = document.getElementById('dateNavNext');
    
    if (!nextBtn) return;
    
    // Проверяем, будет ли следующий период в будущем
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    const nextDate = new Date(currentDate);
    switch (currentPeriod) {
        case 'day':
            nextDate.setDate(nextDate.getDate() + 1);
            break;
        case 'week':
            nextDate.setDate(nextDate.getDate() + 7);
            break;
        case 'month':
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
        case 'year':
            nextDate.setFullYear(nextDate.getFullYear() + 1);
            break;
    }
    
    // Получаем период для следующей даты
    const nextPeriodDates = getPeriodDates(currentPeriod, nextDate);
    
    // Проверяем: если начало следующего периода после сегодня, скрываем стрелку
    // Для недели: если начало следующей недели после сегодня (или равна сегодня, но конец в будущем)
    if (currentPeriod === 'week') {
        // Для недели: если следующая неделя начинается после сегодня - скрываем
        if (nextPeriodDates.start > today) {
            nextBtn.classList.add('hidden');
        } else {
            nextBtn.classList.remove('hidden');
        }
    } else {
        // Для остальных периодов: если начало следующего периода в будущем - скрываем
        const nextStart = new Date(nextPeriodDates.start);
        nextStart.setHours(0, 0, 0, 0);
        const todayStart = new Date(today);
        todayStart.setHours(0, 0, 0, 0);
        
        if (nextStart > todayStart) {
            nextBtn.classList.add('hidden');
        } else {
            nextBtn.classList.remove('hidden');
        }
    }
}

function updatePeriodDates() {
    const dates = getPeriodDates(currentPeriod, currentDate);
    periodStartDate = dates.start;
    periodEndDate = dates.end;
}

function getPeriodApiParams() {
    // Преобразуем текущий период в формат API
    updatePeriodDates();
    
    // Для всех периодов используем "period" с конкретными датами
    // чтобы получить точные данные за выбранный диапазон
    let apiPeriod = 'period';
    let startDate = null;
    let endDate = null;
    
    if (periodStartDate && periodEndDate) {
        // Форматируем даты в формат ISO для API
        startDate = periodStartDate.toISOString();
        endDate = periodEndDate.toISOString();
    }
    
    return {
        period: apiPeriod,
        startDate: startDate,
        endDate: endDate
    };
}

function buildApiUrl(basePath, params = {}) {
    // Формируем полный URL с параметрами
    const baseUrl = gatewayUrl.endsWith('/') ? gatewayUrl.slice(0, -1) : gatewayUrl;
    const path = basePath.startsWith('/') ? basePath : '/' + basePath;
    const url = new URL(path, baseUrl);
    
    Object.keys(params).forEach(key => {
        if (params[key] !== null && params[key] !== undefined && params[key] !== '') {
            url.searchParams.set(key, params[key]);
        }
    });
    return url.toString();
}

function navigatePeriod(direction) {
    const newDate = new Date(currentDate);
    
    switch (currentPeriod) {
        case 'day':
            newDate.setDate(newDate.getDate() + direction);
            break;
        case 'week':
            newDate.setDate(newDate.getDate() + (direction * 7));
            break;
        case 'month':
            newDate.setMonth(newDate.getMonth() + direction);
            break;
        case 'year':
            newDate.setFullYear(newDate.getFullYear() + direction);
            break;
        case 'custom':
            // Навигация не используется для кастомного периода
            return;
    }
    
    currentDate = newDate;
    updateDateDisplay();
    
    // Перезагрузить данные при навигации по периоду
    if (currentTab === 'home') {
        loadHomeData();
    }
}

function selectPeriod(period) {
    if (period === 'custom') {
        // Установить период как custom и обновить отображение перед открытием модального окна
        currentPeriod = 'custom';
        document.querySelectorAll('.period-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.period === 'custom') {
                tab.classList.add('active');
            }
        });
        // Обновить отображение периода перед открытием модального окна
        updateDateDisplay();
        // Открыть модальное окно для выбора периода
        openCustomPeriodModal();
        return;
    }
    
    currentPeriod = period;
    document.querySelectorAll('.period-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.period === period) {
            tab.classList.add('active');
        }
    });
    updateDateDisplay();
    
    // Перезагрузить данные при изменении периода
    if (currentTab === 'home') {
        loadHomeData();
    }
}

function getTransactionDate() {
    // Возвращает дату для создания транзакции (самая левая дата диапазона)
    updatePeriodDates();
    const dateToUse = periodStartDate || currentDate;
    // Возвращаем дату с правильным временем (начало дня)
    const result = new Date(dateToUse);
    result.setHours(0, 0, 0, 0);
    return result;
}

function openCustomPeriodModal() {
    const modal = document.getElementById('customPeriodModal');
    const form = document.getElementById('customPeriodForm');
    
    // Установить максимальную дату (сегодня)
    const today = new Date().toISOString().split('T')[0];
    const dateFromInput = document.getElementById('periodDateFrom');
    const dateToInput = document.getElementById('periodDateTo');
    
    dateFromInput.setAttribute('max', today);
    dateToInput.setAttribute('max', today);
    
    // Заполнить даты если они уже выбраны, иначе использовать текущий период
    if (customStartDate && customEndDate) {
        dateFromInput.value = customStartDate.toISOString().split('T')[0];
        dateToInput.value = customEndDate.toISOString().split('T')[0];
    } else {
        // Использовать текущий период как начальные значения
        const dates = getPeriodDates(currentPeriod, currentDate);
        dateFromInput.value = dates.start.toISOString().split('T')[0];
        dateToInput.value = dates.end.toISOString().split('T')[0];
    }
    
    // Убрать класс invalid если есть
    form.querySelectorAll('.form-input').forEach(field => {
        field.classList.remove('invalid');
    });
    
    // Добавить валидацию в реальном времени
    setupCustomPeriodValidation();
    
    openModal('customPeriodModal');
}

function setupCustomPeriodValidation() {
    const dateFromInput = document.getElementById('periodDateFrom');
    const dateToInput = document.getElementById('periodDateTo');
    
    if (!dateFromInput || !dateToInput) return;
    
    // Функция обновления минимальной даты для поля "до"
    function updateDateToMin() {
        const fromValue = dateFromInput.value;
        if (fromValue) {
            // Устанавливаем минимальную дату для поля "до" равной дате "от"
            dateToInput.setAttribute('min', fromValue);
            
            // Если текущее значение "до" меньше "от", обновляем его
            const toValue = dateToInput.value;
            if (toValue && toValue < fromValue) {
                dateToInput.value = fromValue;
            }
        }
        validateDates();
    }
    
    // Функция проверки валидности
    function validateDates() {
        const fromValue = dateFromInput.value;
        const toValue = dateToInput.value;
        
        if (!fromValue || !toValue) {
            // Убираем ошибки если поля пустые
            dateFromInput.classList.remove('invalid');
            dateToInput.classList.remove('invalid');
            return true;
        }
        
        const fromDate = new Date(fromValue);
        fromDate.setHours(0, 0, 0, 0);
        const toDate = new Date(toValue);
        toDate.setHours(0, 0, 0, 0);
        
        // Убираем предыдущие ошибки
        dateFromInput.classList.remove('invalid');
        dateToInput.classList.remove('invalid');
        
        // Проверка: дата "до" не может быть раньше "от"
        if (toDate < fromDate) {
            dateToInput.classList.add('invalid');
            return false;
        }
        
        return true;
    }
    
    // Удаляем старые обработчики если они есть
    dateFromInput.removeEventListener('change', updateDateToMin);
    dateFromInput.removeEventListener('change', validateDates);
    dateToInput.removeEventListener('change', validateDates);
    
    // Добавляем обработчики
    dateFromInput.addEventListener('change', updateDateToMin);
    dateFromInput.addEventListener('change', validateDates);
    dateToInput.addEventListener('change', validateDates);
    
    // Инициализация при открытии модального окна
    updateDateToMin();
}

function applyCustomPeriod(dateFrom, dateTo) {
    // Валидация дат
    const fromDate = new Date(dateFrom);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(dateTo);
    toDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    if (toDate < fromDate) {
        showToast('Дата "до" не может быть раньше даты "от"');
        document.getElementById('periodDateFrom').classList.add('invalid');
        document.getElementById('periodDateTo').classList.add('invalid');
        return false;
    }
    
    if (toDate > today) {
        showToast('Дата "до" не может быть позже сегодняшнего дня');
        document.getElementById('periodDateTo').classList.add('invalid');
        return false;
    }
    
    // Сохранить кастомный период
    customStartDate = new Date(fromDate);
    customStartDate.setHours(0, 0, 0, 0);
    customEndDate = new Date(toDate);
    customEndDate.setHours(23, 59, 59, 999);
    
    // Установить период как custom
    currentPeriod = 'custom';
    document.querySelectorAll('.period-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.period === 'custom') {
            tab.classList.add('active');
        }
    });
    
    updateDateDisplay();
    closeModal('customPeriodModal');
    
    // Перезагрузить данные при применении кастомного периода
    if (currentTab === 'home') {
        loadHomeData();
    }
    
    return true;
}

async function loadUserInfo() {
    if (tg.initDataUnsafe?.user) {
        const user = tg.initDataUnsafe.user;
        document.getElementById('userName').textContent = user.first_name || 'Пользователь';
        document.getElementById('userTelegramId').textContent = user.username ? `@${user.username}` : '';
    }
}

async function loadAccounts() {
    try {
        const response = await fetch(`${gatewayUrl}/api/accounts?telegram_id=${telegramId}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to load accounts:', response.status, errorText);
            let errorMsg = 'Ошибка при загрузке счетов';
            try {
                const errorData = JSON.parse(errorText);
                errorMsg = errorData.error || errorMsg;
            } catch (e) {
                errorMsg = `Ошибка ${response.status}: ${errorText || response.statusText}`;
            }
            showAlert(errorMsg);
            return;
        }

        const data = await response.json();
        accounts = data.accounts || [];

        // Update balance selector
        const select = document.getElementById('balanceAccountSelect');
        if (select) {
            select.innerHTML = '<option value="all">Все счета</option>';
            accounts.forEach(acc => {
                const option = document.createElement('option');
                option.value = acc.id;
                option.textContent = acc.name;
                select.appendChild(option);
            });
        }

        // Update accounts list
        const list = document.getElementById('accountsList');
        if (list) {
            if (accounts.length === 0) {
                list.innerHTML = '<li class="empty-state"><div class="empty-state-icon">💳</div><div>Нет счетов</div></li>';
            } else {
                list.innerHTML = accounts.map(acc => `
                    <li class="account-item" onclick="openAccountEdit(${acc.id})">
                        <div class="account-header">
                            <span class="account-name">${acc.name}</span>
                            <span class="account-balance">${formatAmount(acc.balance)} ${acc.currency}</span>
                        </div>
                        <div class="account-currency">${acc.currency}</div>
                    </li>
                `).join('');
            }
        }

        // Update total balance
        const totalBalanceEl = document.getElementById('totalBalance');
        if (totalBalanceEl) {
            const total = accounts.reduce((sum, acc) => sum + parseFloat(acc.balance || 0), 0);
            totalBalanceEl.textContent = formatAmount(total) + ' ₽';
        }

        loadBalance();
    } catch (error) {
        console.error('Error loading accounts:', error);
        const errorMsg = 'Ошибка при загрузке счетов: ' + (error.message || 'Неизвестная ошибка');
        showAlert(errorMsg);
    }
}

async function loadBalance() {
    try {
        const accountId = document.getElementById('balanceAccountSelect').value;
        let balance = 0;

        if (accountId === 'all') {
            balance = accounts.reduce((sum, acc) => sum + parseFloat(acc.balance || 0), 0);
        } else {
            const account = accounts.find(acc => acc.id.toString() === accountId);
            balance = account ? parseFloat(account.balance || 0) : 0;
        }

        document.getElementById('balanceAmount').textContent = formatAmount(balance) + ' ₽';
    } catch (error) {
        console.error('Error loading balance:', error);
    }
}

async function loadCategories(type) {
    try {
        const response = await fetch(`${gatewayUrl}/api/categories?telegram_id=${telegramId}&type=${type}`);
        const data = await response.json();
        categories = data.categories || [];

        // Display first 7 categories (2 rows of 4, last is "more")
        const grid = document.getElementById('categoriesGrid');
        const displayCategories = categories.slice(0, 7);
        grid.innerHTML = displayCategories.map(cat => `
            <button type="button" class="category-button" data-category-id="${cat.id}" onclick="selectCategory(${cat.id})">
                <div class="icon">📁</div>
                <div class="category-name">${cat.name}</div>
            </button>
        `).join('') + `
            <button type="button" class="category-button" onclick="loadAllCategories(); openModal('moreCategoriesModal');">
                <div class="icon">➕</div>
                <div class="category-name">Еще</div>
            </button>
        `;
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

async function loadAllCategories() {
    try {
        const grid = document.getElementById('allCategoriesGrid');
        grid.innerHTML = categories.map(cat => `
            <button type="button" class="category-button" data-category-id="${cat.id}" onclick="selectCategoryFromAll(${cat.id})">
                <div class="icon">📁</div>
                <div class="category-name">${cat.name}</div>
            </button>
        `).join('');
    } catch (error) {
        console.error('Error loading all categories:', error);
    }
}

function selectCategory(categoryId) {
    selectedCategoryId = categoryId;
    document.querySelectorAll('#categoriesGrid .category-button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.categoryId === categoryId.toString()) {
            btn.classList.add('active');
        }
    });
}

function selectCategoryFromAll(categoryId) {
    selectedCategoryId = categoryId;
    closeModal('moreCategoriesModal');
    // Update main grid selection
    document.querySelectorAll('#categoriesGrid .category-button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.categoryId === categoryId.toString()) {
            btn.classList.add('active');
        }
    });
}

async function loadHomeData() {
    await loadTransactions();
    await loadSummary();
}

async function loadTransactions() {
    try {
        const periodParams = getPeriodApiParams();
        const params = {
            telegram_id: telegramId,
            limit: 100,
            period: periodParams.period
        };
        
        if (periodParams.startDate) {
            params.start_date = periodParams.startDate;
        }
        if (periodParams.endDate) {
            params.end_date = periodParams.endDate;
        }
        
        const url = buildApiUrl('/api/transactions', params);

        const response = await fetch(url);
        const data = await response.json();
        const transactions = (data.transactions || []).filter(tx => tx.type === currentType);

        const list = document.getElementById('transactionsList');
        if (transactions.length === 0) {
            list.innerHTML = '<li class="empty-state"><div class="empty-state-icon">📝</div><div>Нет транзакций</div></li>';
        } else {
            list.innerHTML = transactions.map(tx => `
                <li class="transaction-item" onclick="openTransactionEdit(${tx.id})">
                    <div class="transaction-header">
                        <span class="transaction-category">${tx.category_name || 'Без категории'}</span>
                        <span class="transaction-amount ${tx.type}">${tx.type === 'expense' ? '-' : '+'}${formatAmount(tx.amount)} ${tx.currency}</span>
                    </div>
                    <div class="transaction-details">
                        <span>${tx.account_name}</span>
                        <span>${formatDate(new Date(tx.operation_date))}</span>
                    </div>
                    ${tx.description ? `<div style="margin-top: 5px; font-size: 12px; opacity: 0.7;">${tx.description}</div>` : ''}
                </li>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
        document.getElementById('transactionsList').innerHTML = '<li class="empty-state">Ошибка при загрузке транзакций</li>';
    }
}

async function loadSummary() {
    try {
        const periodParams = getPeriodApiParams();
        const params = {
            telegram_id: telegramId,
            period: periodParams.period
        };
        
        if (periodParams.startDate) {
            params.start_date = periodParams.startDate;
        }
        if (periodParams.endDate) {
            params.end_date = periodParams.endDate;
        }
        
        const url = buildApiUrl('/api/stats/overview', params);

        const response = await fetch(url);
        const data = await response.json();

        const amount = currentType === 'expense' ? 
            parseFloat(data.total_expense || 0) : 
            parseFloat(data.total_income || 0);

        document.getElementById('summaryLabel').textContent = 
            currentType === 'expense' ? 'Всего расходов' : 'Всего доходов';
        document.getElementById('summaryAmount').textContent = formatAmount(amount) + ' ₽';
    } catch (error) {
        console.error('Error loading summary:', error);
    }
}

async function handleTransactionSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    if (!validateForm(form)) return;

    const amountStr = validateAmount(document.getElementById('transactionAmount').value, 'transactionAmount');
    if (!amountStr) {
        showToast('Введите корректную сумму');
        return;
    }

    const date = document.getElementById('transactionDate').value;
    if (!validateDate(date)) return;

    const accountIdStr = document.getElementById('transactionAccount').value;
    const accountId = accountIdStr ? parseInt(accountIdStr) : null;
    if (!accountId) {
        showToast('Выберите счет');
        document.getElementById('transactionAccount').classList.add('invalid');
        return;
    }

    // Форматируем дату для отправки в API (начало дня в локальном времени)
    const operationDate = formatDateForApi(date);

    const endpoint = currentType === 'expense' ? 
        `${gatewayUrl}/api/transactions/expense` : 
        `${gatewayUrl}/api/transactions/income`;

    const result = await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify({
            telegram_id: telegramId,
            account_id: accountId,
            amount: amountStr,
            category_id: selectedCategoryId,
            description: document.getElementById('transactionComment').value,
            operation_date: operationDate
        })
    });

    if (result.success) {
        showAlert('Транзакция создана!');
        closeModal('transactionModal');
        resetForm('transactionForm');
        selectedCategoryId = null;
        loadAccounts();
        loadHomeData();
    } else {
        showAlert(result.error || 'Ошибка при создании транзакции');
    }
}

async function openTransactionEdit(transactionId) {
    editingTransactionId = transactionId;
    try {
        const response = await fetch(`${gatewayUrl}/api/transactions?telegram_id=${telegramId}&limit=1000`);
        const data = await response.json();
        const transaction = data.transactions.find(tx => tx.id === transactionId);

        if (transaction) {
            document.getElementById('editTransactionAmount').value = transaction.amount;
            const today = new Date().toISOString().split('T')[0];
            const transactionDate = new Date(transaction.operation_date).toISOString().split('T')[0];
            document.getElementById('editTransactionDate').value = transactionDate;
            document.getElementById('editTransactionDate').setAttribute('max', today);
            document.getElementById('editTransactionComment').value = transaction.description || '';

            // Load categories for edit
            const catResponse = await fetch(`${gatewayUrl}/api/categories?telegram_id=${telegramId}&type=${transaction.type}`);
            const catData = await catResponse.json();
            const select = document.getElementById('editTransactionCategory');
            select.innerHTML = catData.categories.map(cat => 
                `<option value="${cat.id}" ${cat.id === transaction.category_id ? 'selected' : ''}>${cat.name}</option>`
            ).join('');

            openModal('transactionEditModal');
        }
    } catch (error) {
        console.error('Error loading transaction:', error);
        showAlert('Ошибка при загрузке транзакции');
    }
}

async function handleTransactionEditSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    if (!validateForm(form)) return;
    
    const amountStr = validateAmount(document.getElementById('editTransactionAmount').value, 'editTransactionAmount');
    if (!amountStr) {
        showToast('Введите корректную сумму');
        return;
    }

    const date = document.getElementById('editTransactionDate').value;
    if (!validateDate(date)) return;

    const accountId = accounts.length > 0 ? accounts[0].id : null;
    const result = await apiRequest(`${gatewayUrl}/api/transactions/${editingTransactionId}?telegram_id=${telegramId}`, {
        method: 'PUT',
        body: JSON.stringify({
            account_id: accountId,
            amount: amountStr,
            category_id: parseInt(document.getElementById('editTransactionCategory').value),
            description: document.getElementById('editTransactionComment').value,
            operation_date: formatDateForApi(date)
        })
    });

    if (result.success) {
        showAlert('Транзакция обновлена!');
        closeModal('transactionEditModal');
        editingTransactionId = null;
        loadAccounts();
        loadHomeData();
    } else {
        showAlert(result.error || 'Ошибка при обновлении транзакции');
    }
}

async function handleDeleteTransaction() {
    const confirmed = await showConfirmDialog('Удалить эту транзакцию?');
    if (!confirmed) return;

    const result = await apiRequest(`${gatewayUrl}/api/transactions/${editingTransactionId}?telegram_id=${telegramId}`, {
        method: 'DELETE'
    });

    if (result.success) {
        showAlert('Транзакция удалена!');
        closeModal('transactionEditModal');
        editingTransactionId = null;
        loadAccounts();
        loadHomeData();
    } else {
        showAlert(result.error || 'Ошибка при удалении транзакции');
    }
}

async function handleAccountSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    if (!validateForm(form)) return;
    
    const name = document.getElementById('accountName').value.trim();
    const existingAccount = accounts.find(acc => acc.name.toLowerCase() === name.toLowerCase() && !acc.is_archived);
    if (existingAccount) {
        showAlert('Счет с таким названием уже существует');
        return;
    }

    const requestBody = {
        telegram_id: telegramId,
        name: name,
        currency: 'RUB'
    };
    
    const balanceStr = document.getElementById('accountBalance').value.trim();
    if (balanceStr && balanceStr !== '0' && balanceStr !== '0.00') {
        const normalizedBalance = normalizeAmount(balanceStr);
        if (normalizedBalance !== null) {
            requestBody.balance = normalizedBalance.toString();
        } else {
            showToast('Введите корректный баланс');
            document.getElementById('accountBalance').classList.add('invalid');
            return;
        }
    }

    const result = await apiRequest(`${gatewayUrl}/api/accounts`, {
        method: 'POST',
        body: JSON.stringify(requestBody)
    });

    if (result.success) {
        showAlert('Счет создан!');
        closeModal('accountModal');
        resetForm('accountForm');
        loadAccounts();
    } else {
        showAlert(result.error || 'Ошибка при создании счета');
    }
}

function openAccountEdit(accountId) {
    editingAccountId = accountId;
    const account = accounts.find(acc => acc.id === accountId);
    if (account) {
        document.getElementById('editAccountName').value = account.name;
        document.getElementById('editAccountBalance').value = account.balance;
        openModal('accountEditModal');
    }
}

async function handleAccountEditSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    if (!validateForm(form)) return;
    
    const name = document.getElementById('editAccountName').value.trim();
    const balanceInput = document.getElementById('editAccountBalance').value.trim();
    
    // Explicitly handle zero value
    let balanceStr;
    if (balanceInput === '0' || balanceInput === '0.0' || balanceInput === '0.00' || balanceInput === '0,0' || balanceInput === '0,00') {
        balanceStr = '0';
    } else {
        balanceStr = validateAmount(balanceInput, 'editAccountBalance');
        if (!balanceStr) {
            showToast('Введите корректный баланс');
            return;
        }
    }

    const existingAccount = accounts.find(acc => 
        acc.id !== editingAccountId && 
        acc.name.toLowerCase() === name.toLowerCase() && 
        !acc.is_archived
    );
    if (existingAccount) {
        showAlert('Счет с таким названием уже существует');
        return;
    }

    const result = await apiRequest(`${gatewayUrl}/api/accounts/${editingAccountId}`, {
        method: 'PUT',
        body: JSON.stringify({
            telegram_id: telegramId,
            name: name,
            balance: balanceStr
        })
    });

    if (result.success) {
        showAlert('Счет обновлен!');
        closeModal('accountEditModal');
        editingAccountId = null;
        loadAccounts();
    } else {
        showAlert(result.error || 'Ошибка при обновлении счета');
    }
}

async function handleDeleteAccount() {
    const confirmed = await showConfirmDialog('Удалить этот счет? Все транзакции будут сохранены.');
    if (!confirmed) return;

    const result = await apiRequest(`${gatewayUrl}/api/accounts/${editingAccountId}?telegram_id=${telegramId}`, {
        method: 'DELETE'
    });

    if (result.success) {
        showAlert('Счет удален!');
        closeModal('accountEditModal');
        editingAccountId = null;
        loadAccounts();
    } else {
        showAlert(result.error || 'Ошибка при удалении счета');
    }
}

async function loadTransferForm() {
    const fromSelect = document.getElementById('transferFromAccount');
    const toSelect = document.getElementById('transferToAccount');
    
    fromSelect.innerHTML = accounts.map(acc => 
        `<option value="${acc.id}">${acc.name} (${formatAmount(acc.balance)} ${acc.currency})</option>`
    ).join('');
    
    toSelect.innerHTML = accounts.map(acc => 
        `<option value="${acc.id}">${acc.name} (${formatAmount(acc.balance)} ${acc.currency})</option>`
    ).join('');
}

async function handleTransferSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    if (!validateForm(form)) return;
    
    const fromAccountId = document.getElementById('transferFromAccount').value;
    const toAccountId = document.getElementById('transferToAccount').value;
    if (fromAccountId === toAccountId) {
        showToast('Нельзя переводить на тот же счет');
        return;
    }

    const amountStr = validateAmount(document.getElementById('transferAmount').value, 'transferAmount');
    if (!amountStr) {
        showToast('Введите корректную сумму');
        return;
    }

    const result = await apiRequest(`${gatewayUrl}/api/transactions/transfer`, {
        method: 'POST',
        body: JSON.stringify({
            telegram_id: telegramId,
            from_account_id: parseInt(fromAccountId),
            to_account_id: parseInt(toAccountId),
            amount: amountStr,
            description: document.getElementById('transferComment').value
        })
    });

    if (result.success) {
        showAlert('Перевод выполнен!');
        closeModal('transferModal');
        resetForm('transferForm');
        loadAccounts();
    } else {
        showAlert(result.error || 'Ошибка при переводе');
    }
}

let editingTransferId = null;

async function openTransferEdit(transferId) {
    editingTransferId = transferId;
    try {
        const response = await fetch(`${gatewayUrl}/api/transactions?telegram_id=${telegramId}&limit=1000`);
        const data = await response.json();
        const transfer = data.transactions.find(tx => tx.id === transferId && tx.type === 'transfer');

        if (transfer) {
            // Заполнить select счетами
            const fromSelect = document.getElementById('editTransferFromAccount');
            const toSelect = document.getElementById('editTransferToAccount');
            fromSelect.innerHTML = '<option value="">Выберите счет</option>';
            toSelect.innerHTML = '<option value="">Выберите счет</option>';
            
            accounts.forEach(acc => {
                const fromOption = document.createElement('option');
                fromOption.value = acc.id;
                fromOption.textContent = `${acc.name} (${formatAmount(acc.balance)} ${acc.currency})`;
                if (acc.id == transfer.account_id) {
                    fromOption.selected = true;
                }
                fromSelect.appendChild(fromOption);

                const toOption = document.createElement('option');
                toOption.value = acc.id;
                toOption.textContent = `${acc.name} (${formatAmount(acc.balance)} ${acc.currency})`;
                if (transfer.related_account_id && acc.id == transfer.related_account_id) {
                    toOption.selected = true;
                }
                toSelect.appendChild(toOption);
            });

            document.getElementById('editTransferAmount').value = transfer.amount;
            const today = new Date().toISOString().split('T')[0];
            const transferDate = new Date(transfer.operation_date).toISOString().split('T')[0];
            document.getElementById('editTransferDate').value = transferDate;
            document.getElementById('editTransferDate').setAttribute('max', today);
            document.getElementById('editTransferComment').value = transfer.description || '';

            openModal('transferEditModal');
        }
    } catch (error) {
        console.error('Error loading transfer:', error);
        showAlert('Ошибка при загрузке перевода');
    }
}

async function handleTransferEditSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    if (!validateForm(form)) return;
    
    const fromAccountId = document.getElementById('editTransferFromAccount').value;
    const toAccountId = document.getElementById('editTransferToAccount').value;
    if (fromAccountId === toAccountId) {
        showToast('Нельзя переводить на тот же счет');
        return;
    }

    const amountStr = validateAmount(document.getElementById('editTransferAmount').value, 'editTransferAmount');
    if (!amountStr) {
        showToast('Введите корректную сумму');
        return;
    }

    const date = document.getElementById('editTransferDate').value;
    if (!validateDate(date)) return;

    const result = await apiRequest(`${gatewayUrl}/api/transactions/${editingTransferId}?telegram_id=${telegramId}`, {
        method: 'PUT',
        body: JSON.stringify({
            account_id: parseInt(fromAccountId),
            related_account_id: parseInt(toAccountId),
            amount: amountStr,
            category_id: 0,
            description: document.getElementById('editTransferComment').value,
            operation_date: formatDateForApi(date)
        })
    });

    if (result.success) {
        showAlert('Перевод обновлен!');
        closeModal('transferEditModal');
        editingTransferId = null;
        loadAccounts();
        loadTransferHistory();
    } else {
        showAlert(result.error || 'Ошибка при обновлении перевода');
    }
}

async function handleDeleteTransfer() {
    if (!editingTransferId) {
        showAlert('Не выбран перевод для удаления');
        return;
    }

    const confirmed = await showConfirmDialog('Удалить этот перевод?');
    if (!confirmed) return;

    const result = await apiRequest(`${gatewayUrl}/api/transactions/${editingTransferId}?telegram_id=${telegramId}`, {
        method: 'DELETE'
    });

    if (result.success) {
        editingTransferId = null;
        closeModal('transferEditModal');
        await Promise.all([loadAccounts(), loadTransferHistory()]);
        setTimeout(() => showAlert('Перевод удален!'), 100);
    } else {
        showAlert(result.error || 'Ошибка при удалении перевода');
    }
}

async function loadTransferHistory() {
    try {
        const response = await fetch(`${gatewayUrl}/api/transactions?telegram_id=${telegramId}&limit=1000`);
        const data = await response.json();
        const transfers = (data.transactions || []).filter(tx => tx.type === 'transfer');

        const list = document.getElementById('transferHistoryList');
        if (transfers.length === 0) {
            list.innerHTML = '<li class="empty-state"><div class="empty-state-icon">💸</div><div>Нет переводов</div></li>';
        } else {
            list.innerHTML = transfers.map(tx => {
                const fromAccount = accounts.find(acc => acc.id === tx.account_id);
                const toAccount = tx.related_account_id ? accounts.find(acc => acc.id === tx.related_account_id) : null;
                const fromName = fromAccount ? fromAccount.name : tx.account_name || 'Неизвестный счет';
                const toName = toAccount ? toAccount.name : 'Неизвестный счет';
                
                return `
                    <li class="transaction-item" onclick="openTransferEdit(${tx.id})">
                        <div class="transaction-header">
                            <span class="transaction-category">${tx.description || 'Перевод'}</span>
                            <span class="transaction-amount">${formatAmount(tx.amount)} ${tx.currency}</span>
                        </div>
                        <div class="transaction-details">
                            <span>${fromName} → ${toName}</span>
                            <span>${formatDate(new Date(tx.operation_date))}</span>
                        </div>
                    </li>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Error loading transfer history:', error);
        document.getElementById('transferHistoryList').innerHTML = '<li class="empty-state">Ошибка при загрузке истории</li>';
    }
}

async function handleAddCategorySubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    if (!validateForm(form)) return;
    
    const result = await apiRequest(`${gatewayUrl}/api/categories`, {
        method: 'POST',
        body: JSON.stringify({
            telegram_id: telegramId,
            name: document.getElementById('categoryName').value,
            type: currentType
        })
    });

    if (result.success) {
        showAlert('Категория создана!');
        closeModal('addCategoryModal');
        resetForm('addCategoryForm');
        await loadCategories(currentType);
        await loadAllCategories();
    } else {
        showAlert(result.error || 'Ошибка при создании категории');
    }
}

function handleCustomPeriodSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    if (!validateForm(form)) return;
    
    const dateFrom = document.getElementById('periodDateFrom').value;
    const dateTo = document.getElementById('periodDateTo').value;
    
    if (!dateFrom || !dateTo) {
        showToast('Выберите обе даты');
        return;
    }
    
    applyCustomPeriod(dateFrom, dateTo);
}

function openPeriodSelector() {
    switch (currentPeriod) {
        case 'day':
            openDaySelector();
            break;
        case 'week':
            openWeekSelector();
            break;
        case 'month':
            openMonthSelector();
            break;
        case 'year':
            openYearSelector();
            break;
        case 'custom':
            openCustomPeriodModal();
            break;
    }
}

function openDaySelector() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDate = today.toISOString().split('T')[0];
    
    const dateInput = document.getElementById('daySelectorDate');
    dateInput.setAttribute('max', maxDate);
    
    // Установить текущую дату из периода
    updatePeriodDates();
    if (periodStartDate) {
        const currentDateStr = formatDateForInput(periodStartDate);
        dateInput.value = currentDateStr <= maxDate ? currentDateStr : maxDate;
    } else {
        dateInput.value = maxDate;
    }
    
    openModal('daySelectorModal');
}

function openWeekSelector() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDate = today.toISOString().split('T')[0];
    
    const dateInput = document.getElementById('weekSelectorDate');
    dateInput.setAttribute('max', maxDate);
    
    // Установить текущую дату из периода (любая дата в неделе)
    updatePeriodDates();
    if (periodStartDate) {
        const currentDateStr = formatDateForInput(periodStartDate);
        dateInput.value = currentDateStr <= maxDate ? currentDateStr : maxDate;
    } else {
        dateInput.value = maxDate;
    }
    
    openModal('weekSelectorModal');
}

function openMonthSelector() {
    const today = new Date();
    const maxMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    
    const monthInput = document.getElementById('monthSelectorDate');
    monthInput.setAttribute('max', maxMonth);
    
    // Установить текущий месяц из периода
    updatePeriodDates();
    if (periodStartDate) {
        const year = periodStartDate.getFullYear();
        const month = String(periodStartDate.getMonth() + 1).padStart(2, '0');
        const currentMonth = `${year}-${month}`;
        monthInput.value = currentMonth <= maxMonth ? currentMonth : maxMonth;
    } else {
        monthInput.value = maxMonth;
    }
    
    openModal('monthSelectorModal');
}

function openYearSelector() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const startYear = 2000; // Начальный год для выбора
    const endYear = currentYear;
    
    const yearSelect = document.getElementById('yearSelectorDate');
    
    // Заполнить select годами
    yearSelect.innerHTML = '';
    for (let year = endYear; year >= startYear; year--) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearSelect.appendChild(option);
    }
    
    // Установить текущий год из периода
    updatePeriodDates();
    if (periodStartDate) {
        const selectedYear = periodStartDate.getFullYear();
        yearSelect.value = selectedYear <= currentYear ? selectedYear : currentYear;
    } else {
        yearSelect.value = currentYear;
    }
    
    openModal('yearSelectorModal');
}

function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDateForApi(dateStr) {
    // Преобразует строку даты YYYY-MM-DD в ISO строку с учетом локального времени
    if (!dateStr) {
        return new Date().toISOString();
    }
    const [year, month, day] = dateStr.split('-');
    const localDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 0, 0, 0, 0);
    return localDate.toISOString();
}

function handleDaySelectorSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    if (!validateForm(form)) return;
    
    const selectedDate = document.getElementById('daySelectorDate').value;
    if (!selectedDate) {
        showToast('Выберите дату');
        return;
    }
    
    // Установить выбранную дату
    currentDate = new Date(selectedDate);
    updateDateDisplay();
    closeModal('daySelectorModal');
    
    // Перезагрузить данные
    if (currentTab === 'home') {
        loadHomeData();
    }
}

function handleWeekSelectorSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    if (!validateForm(form)) return;
    
    const selectedDate = document.getElementById('weekSelectorDate').value;
    if (!selectedDate) {
        showToast('Выберите дату');
        return;
    }
    
    // Установить выбранную дату (неделя будет вычислена автоматически)
    currentDate = new Date(selectedDate);
    updateDateDisplay();
    closeModal('weekSelectorModal');
    
    // Перезагрузить данные
    if (currentTab === 'home') {
        loadHomeData();
    }
}

function handleMonthSelectorSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    if (!validateForm(form)) return;
    
    const selectedMonth = document.getElementById('monthSelectorDate').value;
    if (!selectedMonth) {
        showToast('Выберите месяц');
        return;
    }
    
    // Установить первый день выбранного месяца
    const [year, month] = selectedMonth.split('-');
    currentDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    updateDateDisplay();
    closeModal('monthSelectorModal');
    
    // Перезагрузить данные
    if (currentTab === 'home') {
        loadHomeData();
    }
}

function handleYearSelectorSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    if (!validateForm(form)) return;
    
    const selectedYear = parseInt(document.getElementById('yearSelectorDate').value);
    if (!selectedYear || isNaN(selectedYear)) {
        showToast('Выберите год');
        return;
    }
    
    // Установить первый день выбранного года
    currentDate = new Date(selectedYear, 0, 1);
    updateDateDisplay();
    closeModal('yearSelectorModal');
    
    // Перезагрузить данные
    if (currentTab === 'home') {
        loadHomeData();
    }
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.add('show');
    
    // Remove invalid classes from all form inputs when opening modal
    const form = modal.querySelector('form');
    if (form) {
        form.querySelectorAll('.form-input').forEach(field => {
            field.classList.remove('invalid');
        });
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
}

function formatAmount(amount) {
    const num = parseFloat(amount || 0);
    return num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Setup add transaction button
function setupAddTransactionButton() {
    const addButton = document.getElementById('addTransactionBtn');
    if (addButton) {
        addButton.addEventListener('click', () => {
            document.getElementById('transactionModalTitle').textContent = 
                currentType === 'expense' ? 'Добавить расход' : 'Добавить доход';
            const form = document.getElementById('transactionForm');
            form.reset();
            // Remove invalid classes when opening modal
            form.querySelectorAll('.form-input').forEach(field => {
                field.classList.remove('invalid');
            });
            // Установить дату из выбранного периода (самая левая дата диапазона)
            const transactionDate = getTransactionDate();
            const maxDate = new Date();
            maxDate.setHours(0, 0, 0, 0);
            
            // Форматируем дату для избежания проблем с часовыми поясами
            const maxDateStr = formatDateForInput(maxDate);
            const periodDateStr = formatDateForInput(transactionDate);
            
            // Использовать дату из периода, но не больше сегодняшнего дня
            const dateToSet = periodDateStr <= maxDateStr ? periodDateStr : maxDateStr;
            document.getElementById('transactionDate').value = dateToSet;
            document.getElementById('transactionDate').setAttribute('max', maxDateStr);
            selectedCategoryId = null;
            document.querySelectorAll('#categoriesGrid .category-button').forEach(btn => btn.classList.remove('active'));
            
            // Заполнить select счетами
            const accountSelect = document.getElementById('transactionAccount');
            accountSelect.innerHTML = '<option value="">Выберите счет</option>';
            accounts.forEach(acc => {
                const option = document.createElement('option');
                option.value = acc.id;
                option.textContent = `${acc.name} (${formatAmount(acc.balance)} ${acc.currency})`;
                accountSelect.appendChild(option);
            });
            
            openModal('transactionModal');
        });
    }
}
