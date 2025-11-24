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
let accounts = [];
let categories = [];
let editingTransactionId = null;
let editingAccountId = null;
let selectedCategoryId = null;

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
    
    setupEventListeners();
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

    // Buttons
    document.getElementById('addAccountBtn').addEventListener('click', () => {
        document.getElementById('accountModalTitle').textContent = 'Добавить счет';
        document.getElementById('accountForm').reset();
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
    document.getElementById('moreCategoriesBtn').addEventListener('click', () => {
        loadAllCategories();
        openModal('moreCategoriesModal');
    });
    document.getElementById('addCategoryBtn').addEventListener('click', () => {
        openModal('addCategoryModal');
    });

    // Simple amount validation - allow only 0-9, dot and comma, only one dot/comma
    function setupAmountValidation(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        
        input.addEventListener('input', function() {
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
                <div>${cat.name}</div>
            </button>
        `).join('') + `
            <button type="button" class="category-button" onclick="document.getElementById('moreCategoriesBtn').click()">
                <div class="icon">➕</div>
                <div>Еще</div>
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
                <div>${cat.name}</div>
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
        const url = `${gatewayUrl}/api/transactions?telegram_id=${telegramId}&limit=100`;

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
        const url = `${gatewayUrl}/api/stats/overview?telegram_id=${telegramId}`;

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
    
    if (!selectedCategoryId) {
        showAlert('Выберите категорию');
        return;
    }

    let amount = document.getElementById('transactionAmount').value.replace(',', '.');
    const date = document.getElementById('transactionDate').value;
    const comment = document.getElementById('transactionComment').value;
    const accountIdStr = document.getElementById('transactionAccount').value;
    const accountId = accountIdStr ? parseInt(accountIdStr) : null;

    if (!accountId) {
        showAlert('Выберите счет');
        return;
    }

    // Проверка, что дата не позже сегодняшнего дня
    const today = new Date().toISOString().split('T')[0];
    if (date > today) {
        showAlert('Нельзя создавать транзакции с датой позже сегодняшнего дня');
        return;
    }

    try {
        const endpoint = currentType === 'expense' ? 
            `${gatewayUrl}/api/transactions/expense` : 
            `${gatewayUrl}/api/transactions/income`;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                telegram_id: telegramId,
                account_id: accountId,
                amount: amount,
                category_id: selectedCategoryId,
                description: comment,
                operation_date: date ? new Date(date).toISOString() : new Date().toISOString()
            })
        });

        const data = await response.json();
        if (response.ok) {
            showAlert('Транзакция создана!');
            closeModal('transactionModal');
            document.getElementById('transactionForm').reset();
            selectedCategoryId = null;
            loadAccounts();
            loadHomeData();
        } else {
            showAlert(data.error || 'Ошибка при создании транзакции');
        }
    } catch (error) {
        console.error('Error creating transaction:', error);
        showAlert('Ошибка при создании транзакции');
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
    let amount = document.getElementById('editTransactionAmount').value.replace(',', '.');
    const categoryId = document.getElementById('editTransactionCategory').value;
    const date = document.getElementById('editTransactionDate').value;
    const comment = document.getElementById('editTransactionComment').value;
    const accountId = accounts.length > 0 ? accounts[0].id : null;

    // Проверка, что дата не позже сегодняшнего дня
    const today = new Date().toISOString().split('T')[0];
    if (date > today) {
        showAlert('Нельзя создавать транзакции с датой позже сегодняшнего дня');
        return;
    }

    try {
        const response = await fetch(`${gatewayUrl}/api/transactions/${editingTransactionId}?telegram_id=${telegramId}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                account_id: accountId,
                amount: amount,
                category_id: parseInt(categoryId),
                description: comment,
                operation_date: new Date(date).toISOString()
            })
        });

        const data = await response.json();
        if (response.ok) {
            showAlert('Транзакция обновлена!');
            closeModal('transactionEditModal');
            editingTransactionId = null;
            loadAccounts();
            loadHomeData();
        } else {
            showAlert(data.error || 'Ошибка при обновлении транзакции');
        }
    } catch (error) {
        console.error('Error updating transaction:', error);
        showAlert('Ошибка при обновлении транзакции');
    }
}

async function handleDeleteTransaction() {
    const confirmed = await showConfirmDialog('Удалить эту транзакцию?');
    if (!confirmed) return;

    try {
        const response = await fetch(`${gatewayUrl}/api/transactions/${editingTransactionId}?telegram_id=${telegramId}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        if (response.ok) {
            showAlert('Транзакция удалена!');
            closeModal('transactionEditModal');
            editingTransactionId = null;
            loadAccounts();
            loadHomeData();
        } else {
            showAlert(data.error || 'Ошибка при удалении транзакции');
        }
    } catch (error) {
        console.error('Error deleting transaction:', error);
        showAlert('Ошибка при удалении транзакции');
    }
}

async function handleAccountSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('accountName').value.trim();
    let balance = document.getElementById('accountBalance').value.trim().replace(',', '.');

    // Check for duplicate account name
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
    
    // Add balance only if provided
    if (balance && balance !== '' && balance !== '0' && balance !== '0.00') {
        requestBody.balance = balance;
    }

    try {
        const response = await fetch(`${gatewayUrl}/api/accounts`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        if (response.ok) {
            showAlert('Счет создан!');
            closeModal('accountModal');
            document.getElementById('accountForm').reset();
            loadAccounts();
        } else {
            showAlert(data.error || 'Ошибка при создании счета');
        }
    } catch (error) {
        console.error('Error creating account:', error);
        showAlert('Ошибка при создании счета');
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
    const name = document.getElementById('editAccountName').value.trim();
    let balance = document.getElementById('editAccountBalance').value.replace(',', '.');

    // Check for duplicate account name (excluding current account)
    const existingAccount = accounts.find(acc => 
        acc.id !== editingAccountId && 
        acc.name.toLowerCase() === name.toLowerCase() && 
        !acc.is_archived
    );
    if (existingAccount) {
        showAlert('Счет с таким названием уже существует');
        return;
    }

    try {
        const response = await fetch(`${gatewayUrl}/api/accounts/${editingAccountId}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                telegram_id: telegramId,
                name: name,
                balance: balance
            })
        });

        const data = await response.json();
        if (response.ok) {
            showAlert('Счет обновлен!');
            closeModal('accountEditModal');
            editingAccountId = null;
            loadAccounts();
        } else {
            showAlert(data.error || 'Ошибка при обновлении счета');
        }
    } catch (error) {
        console.error('Error updating account:', error);
        showAlert('Ошибка при обновлении счета');
    }
}

async function handleDeleteAccount() {
    const confirmed = await showConfirmDialog('Удалить этот счет? Все транзакции будут сохранены.');
    if (!confirmed) return;

    try {
        const response = await fetch(`${gatewayUrl}/api/accounts/${editingAccountId}?telegram_id=${telegramId}`, {
            method: 'DELETE'
        });

        const data = await response.json();
        if (response.ok) {
            showAlert('Счет удален!');
            closeModal('accountEditModal');
            editingAccountId = null;
            loadAccounts();
        } else {
            showAlert(data.error || 'Ошибка при удалении счета');
        }
    } catch (error) {
        console.error('Error deleting account:', error);
        showAlert('Ошибка при удалении счета');
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
    const fromAccountId = document.getElementById('transferFromAccount').value;
    const toAccountId = document.getElementById('transferToAccount').value;
    let amount = document.getElementById('transferAmount').value.replace(',', '.');
    const comment = document.getElementById('transferComment').value;

    if (fromAccountId === toAccountId) {
        showAlert('Нельзя переводить на тот же счет');
        return;
    }

    try {
        const response = await fetch(`${gatewayUrl}/api/transactions/transfer`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                telegram_id: telegramId,
                from_account_id: parseInt(fromAccountId),
                to_account_id: parseInt(toAccountId),
                amount: amount,
                description: comment
            })
        });

        const data = await response.json();
        if (response.ok) {
            showAlert('Перевод выполнен!');
            closeModal('transferModal');
            document.getElementById('transferForm').reset();
            loadAccounts();
        } else {
            showAlert(data.error || 'Ошибка при переводе');
        }
    } catch (error) {
        console.error('Error creating transfer:', error);
        showAlert('Ошибка при переводе');
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
    const fromAccountId = document.getElementById('editTransferFromAccount').value;
    const toAccountId = document.getElementById('editTransferToAccount').value;
    let amount = document.getElementById('editTransferAmount').value.replace(',', '.');
    const date = document.getElementById('editTransferDate').value;
    const comment = document.getElementById('editTransferComment').value;

    if (fromAccountId === toAccountId) {
        showAlert('Нельзя переводить на тот же счет');
        return;
    }

    // Проверка, что дата не позже сегодняшнего дня
    const today = new Date().toISOString().split('T')[0];
    if (date > today) {
        showAlert('Нельзя создавать транзакции с датой позже сегодняшнего дня');
        return;
    }

    try {
        const response = await fetch(`${gatewayUrl}/api/transactions/${editingTransferId}?telegram_id=${telegramId}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                account_id: parseInt(fromAccountId),
                related_account_id: parseInt(toAccountId),
                amount: amount,
                category_id: 0,
                description: comment,
                operation_date: new Date(date).toISOString()
            })
        });

        const data = await response.json();
        if (response.ok) {
            showAlert('Перевод обновлен!');
            closeModal('transferEditModal');
            editingTransferId = null;
            loadAccounts();
            loadTransferHistory();
        } else {
            showAlert(data.error || 'Ошибка при обновлении перевода');
        }
    } catch (error) {
        console.error('Error updating transfer:', error);
        showAlert('Ошибка при обновлении перевода');
    }
}

async function handleDeleteTransfer() {
    const transferIdToDelete = editingTransferId;
    if (!transferIdToDelete) {
        showAlert('Не выбран перевод для удаления');
        return;
    }

    const confirmed = await showConfirmDialog('Удалить этот перевод?');
    if (!confirmed) return;

    try {
        console.log('Deleting transfer:', transferIdToDelete);
        const response = await fetch(`${gatewayUrl}/api/transactions/${transferIdToDelete}?telegram_id=${telegramId}`, {
            method: 'DELETE'
        });

        console.log('Delete response status:', response.status);

        let data = {};
        try {
            const text = await response.text();
            if (text) {
                data = JSON.parse(text);
            }
        } catch (e) {
            console.log('Response is not JSON or empty');
        }

        if (response.ok) {
            console.log('Transfer deleted successfully');
            editingTransferId = null;
            closeModal('transferEditModal');
            
            // Обновить данные
            await Promise.all([
                loadAccounts(),
                loadTransferHistory()
            ]);
            
            // Показать сообщение после закрытия модального окна
            setTimeout(() => {
                showAlert('Перевод удален!');
            }, 100);
        } else {
            const errorMsg = data.error || `Ошибка ${response.status}: ${response.statusText}`;
            showAlert(errorMsg);
            console.error('Delete failed:', response.status, data);
        }
    } catch (error) {
        console.error('Error deleting transfer:', error);
        showAlert('Ошибка при удалении перевода: ' + error.message);
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
            list.innerHTML = transfers.map(tx => `
                <li class="transaction-item" onclick="openTransferEdit(${tx.id})">
                    <div class="transaction-header">
                        <span class="transaction-category">${tx.description || 'Перевод'}</span>
                        <span class="transaction-amount">${formatAmount(tx.amount)} ${tx.currency}</span>
                    </div>
                    <div class="transaction-details">
                        <span>${tx.account_name}</span>
                        <span>${formatDate(new Date(tx.operation_date))}</span>
                    </div>
                </li>
            `).join('');
        }
    } catch (error) {
        console.error('Error loading transfer history:', error);
        document.getElementById('transferHistoryList').innerHTML = '<li class="empty-state">Ошибка при загрузке истории</li>';
    }
}

async function handleAddCategorySubmit(e) {
    e.preventDefault();
    const name = document.getElementById('categoryName').value;

    try {
        const response = await fetch(`${gatewayUrl}/api/categories`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                telegram_id: telegramId,
                name: name,
                type: currentType
            })
        });

        const data = await response.json();
        if (response.ok) {
            showAlert('Категория создана!');
            closeModal('addCategoryModal');
            document.getElementById('addCategoryForm').reset();
            await loadCategories(currentType);
            await loadAllCategories();
        } else {
            showAlert(data.error || 'Ошибка при создании категории');
        }
    } catch (error) {
        console.error('Error creating category:', error);
        showAlert('Ошибка при создании категории');
    }
}

function openModal(modalId) {
    document.getElementById(modalId).classList.add('show');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
}

function formatAmount(amount) {
    const num = parseFloat(amount || 0);
    return num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Add button to create transaction
document.addEventListener('DOMContentLoaded', () => {
    const homeTab = document.getElementById('homeTab');
    const addButton = document.createElement('button');
    addButton.className = 'submit-button';
    addButton.style.cssText = 'position: fixed; bottom: 20px; right: 20px; width: 60px; height: 60px; border-radius: 50%; font-size: 24px; z-index: 100;';
    addButton.textContent = '+';
    addButton.onclick = () => {
        document.getElementById('transactionModalTitle').textContent = 
            currentType === 'expense' ? 'Добавить расход' : 'Добавить доход';
        document.getElementById('transactionForm').reset();
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('transactionDate').value = today;
        document.getElementById('transactionDate').setAttribute('max', today);
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
    };
    homeTab.appendChild(addButton);
});
