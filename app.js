// Global variables
let currentEditId = null;
let dutyCategories = [];
let choicesInstances = {};
let isOfflineMode = false;
let productTableBody = null;
let mobileProductGrid = null;

// Make functions globally available
window.openNew = openNew;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.saveNew = saveNew;
window.saveEdit = saveEdit;
window.closeModal = closeModal;
window.openModal = openModal;
window.logout = logout;
window.login = login;
window.showSignup = showSignup;
window.openAddDutyModal = openAddDutyModal;
window.saveNewDuty = saveNewDuty;
window.toggleDarkMode = toggleDarkMode;
window.googleSignIn = googleSignIn;
window.googleSignInLogin = googleSignInLogin;
window.googleSignInSignup = googleSignInSignup;

// ===== HELPER FUNCTIONS =====

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Define refreshData EARLY
const refreshData = debounce(() => {
    console.log('Refreshing data...');
    if (typeof loadProducts === 'function') loadProducts();
    if (typeof loadDutyCategories === 'function') loadDutyCategories();
}, 300);
window.refreshData = refreshData;

// UI State functions
function showLoadingState() {
    const tbody = document.querySelector('#productTable tbody');
    if (tbody) {
        tbody.innerHTML = '';
        for (let i = 0; i < 3; i++) {
            const skeletonRow = document.createElement('tr');
            skeletonRow.innerHTML = `
                <td colspan="21">
                    <div class="skeleton" style="height: 40px; margin: 8px 0;"></div>
                </td>
            `;
            tbody.appendChild(skeletonRow);
        }
    }
}

function showEmptyState() {
    const tbody = document.querySelector('#productTable tbody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="21">
                    <div class="empty-state">
                        <i class="fas fa-box-open"></i>
                        <h3>No products yet</h3>
                        <p>Get started by adding your first product</p>
                        <button class="btn primary" onclick="openNew()">
                            <i class="fas fa-plus"></i> Add Product
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }
    
    const mobileGrid = document.querySelector('.mobile-product-grid');
    if (mobileGrid) {
        mobileGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-box-open"></i>
                <h3>No products yet</h3>
                <p>Get started by adding your first product</p>
                <button class="btn primary" onclick="openNew()">
                    <i class="fas fa-plus"></i> Add Product
                </button>
            </div>
        `;
    }
}

function showErrorState() {
    const tbody = document.querySelector('#productTable tbody');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="21">
                    <div class="empty-state" style="color: var(--danger);">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Failed to load products</p>
                        <button class="btn secondary" onclick="refreshData()">
                            <i class="fas fa-sync-alt"></i> Try Again
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('App initializing...');
    
    checkFirebaseConnection();
    initializeModals();
    handleRedirectResult();
    loadDarkModePreference();
    
    firebase.auth().onAuthStateChanged(function(user) {
        console.log('Auth state changed:', user ? 'Logged in' : 'Logged out');
        if (user) {
            showAppSection();
            retryOperation(loadDutyCategories, 3);
            retryOperation(loadProducts, 3);
        } else {
            showAuthSection();
        }
    });
});

// ===== FIREBASE CONNECTION =====
async function retryOperation(operation, maxRetries) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            await operation();
            break;
        } catch (error) {
            console.log(`Attempt ${i + 1} failed:`, error);
            if (i === maxRetries - 1) {
                if (error.code === 'permission-denied') {
                    showStatus('Permission denied. Please check Firebase rules.', 'error');
                } else if (error.code === 'unavailable' || error.code === 'failed-precondition') {
                    showStatus('Working in offline mode. Changes will sync when online.', 'warning');
                    isOfflineMode = true;
                    loadDutyCategoriesFromCache();
                } else if (error.message && error.message.includes('API has not been used')) {
                    showStatus('Firestore API not enabled. Please enable it in Google Cloud Console.', 'error');
                } else {
                    showStatus('Connection error. Please check your internet.', 'error');
                }
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

function checkFirebaseConnection() {
    if (!navigator.onLine) {
        showStatus('You are offline. Working in offline mode.', 'warning');
        isOfflineMode = true;
        return false;
    }
    
    if (db) {
        db.collection('_health_check').doc('_check').get()
            .then(() => {
                console.log('Firestore connection OK');
                isOfflineMode = false;
            })
            .catch((error) => {
                console.error('Firestore connection failed:', error);
                if (error.code === 'unavailable') {
                    showStatus('Cannot connect to database. Working offline.', 'warning');
                    isOfflineMode = true;
                }
            });
    }
    return true;
}

// ===== SERVICE WORKER =====
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/ImportIQ/sw.js')
            .then(registration => {
                console.log('Service Worker registered: ', registration);
            })
            .catch(error => {
                console.log('Service Worker registration failed: ', error);
            });
    });
}

// ===== OFFLINE DETECTION =====
window.addEventListener('online', function() {
    console.log('Back online');
    showStatus('Back online! Syncing data...', 'success');
    isOfflineMode = false;
    refreshData();
    loadDutyCategories();
});

window.addEventListener('offline', function() {
    console.log('Offline');
    showStatus('You are offline. Working in offline mode.', 'warning');
    isOfflineMode = true;
    loadProducts().catch(() => {
        showStatus('Using cached data (offline mode)', 'info');
    });
});

// ===== AUTHENTICATION =====
function showSignup() {
    console.log('Show signup called');
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if (!email || !password) {
        showStatus('Please enter email and password', 'error');
        return;
    }
    
    setAuthButtonLoading(true);
    
    firebase.auth().createUserWithEmailAndPassword(email, password)
        .then(() => {
            showStatus('Account created!', 'success');
            setAuthButtonLoading(false);
        })
        .catch((error) => {
            showStatus(error.message, 'error');
            setAuthButtonLoading(false);
        });
}

function login() {
    console.log('Login called');
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const rememberMe = document.getElementById('rememberMe')?.checked || false;
    const loginBtn = document.getElementById('loginBtn');
    
    if (!email || !password) {
        showToast('Please enter email and password', 'error');
        return;
    }
    
    loginBtn.classList.add('loading');
    const btnText = loginBtn.querySelector('.btn-text');
    const btnLoader = loginBtn.querySelector('.btn-loader');
    btnText.style.visibility = 'hidden';
    btnLoader.style.display = 'inline-block';
    
    try {
        const persistence = rememberMe 
            ? firebase.auth.Auth.Persistence.LOCAL 
            : firebase.auth.Auth.Persistence.SESSION;
        firebase.auth().setPersistence(persistence);
        
        firebase.auth().signInWithEmailAndPassword(email, password)
            .then(() => {
                console.log('Login successful');
                setAuthButtonLoading(false);
            })
            .catch((error) => {
                showStatus(error.message, 'error');
                setAuthButtonLoading(false);
            });
    } catch (error) {
        showStatus(error.message, 'error');
        loginBtn.classList.remove('loading');
        btnText.style.visibility = 'visible';
        btnLoader.style.display = 'none';
    }
}

function setAuthButtonLoading(isLoading) {
    const loginBtn = document.querySelector('#authSection .btn.primary');
    const signupBtn = document.querySelector('#authSection .btn.secondary');
    
    if (isLoading) {
        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.innerHTML = '<span class="loading"></span> Logging in...';
        }
        if (signupBtn) {
            signupBtn.disabled = true;
            signupBtn.innerHTML = '<span class="loading"></span> Creating...';
        }
    } else {
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login';
        }
        if (signupBtn) {
            signupBtn.disabled = false;
            signupBtn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
        }
    }
}

function logout() {
    console.log('Logout called');
    firebase.auth().signOut()
        .then(() => {
            console.log('Logout successful');
            showAuthSection();
        })
        .catch((error) => {
            console.error('Logout error:', error);
        });
}

function showAuthSection() {
    console.log('Showing auth section');
    
    const appSection = document.getElementById('appSection');
    if (appSection) appSection.style.display = 'none';
    
    const authSection = document.getElementById('authSection');
    if (authSection) authSection.style.display = 'flex';
    
    toggleAuthForm('login');
    
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    if (emailInput) emailInput.value = '';
    if (passwordInput) passwordInput.value = '';
    
    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.classList.add('active');
}

function showAppSection() {
    console.log('Showing app section');
    
    const user = firebase.auth().currentUser;
    if (!user) {
        console.error('No user found');
        return;
    }
    
    const userEmailEl = document.getElementById('userEmail');
    if (userEmailEl) userEmailEl.textContent = user.email;
    
    const authSection = document.getElementById('authSection');
    if (authSection) authSection.style.display = 'none';
    
    const appSection = document.getElementById('appSection');
    if (appSection) appSection.style.display = 'block';
    
    loadDutyCategories();
    loadProducts();
    checkMobile();
}

// ===== DUTY CATEGORIES =====
async function loadDutyCategories() {
    console.log('Loading duty categories...');
    try {
        if (!db) throw new Error('Firestore not initialized');
        
        const snapshot = await db.collection(DUTY_COLLECTION).orderBy('label').get();
        dutyCategories = [];
        
        if (snapshot.empty) {
            console.log('No duty categories found, adding defaults...');
            await addDefaultDutyCategories();
            return;
        }
        
        snapshot.forEach(doc => {
            dutyCategories.push({ id: doc.id, ...doc.data() });
        });
        
        console.log('Loaded duty categories:', dutyCategories.length);
        initializeDutyDropdowns();
    } catch (error) {
        console.error("Error loading duty categories:", error);
        throw error;
    }
}

async function addDefaultDutyCategories() {
    const defaultCategories = [
        { label: 'Electronics', rate: 20 },
        { label: 'Clothing', rate: 25 },
        { label: 'Books', rate: 0 },
        { label: 'Furniture', rate: 30 },
        { label: 'Toys', rate: 15 },
        { label: 'Automotive', rate: 35 },
        { label: 'Food', rate: 10 },
        { label: 'Medicine', rate: 0 }
    ];
    
    const user = firebase.auth().currentUser;
    if (!user) return;
    
    const batch = db.batch();
    defaultCategories.forEach(cat => {
        const docRef = db.collection(DUTY_COLLECTION).doc();
        batch.set(docRef, {
            ...cat,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    });
    
    await batch.commit();
    await loadDutyCategories();
}

function loadDutyCategoriesFromCache() {
    dutyCategories = [
        { id: '1', label: 'Electronics', rate: 20 },
        { id: '2', label: 'Clothing', rate: 25 },
        { id: '3', label: 'Books', rate: 0 },
        { id: '4', label: 'Furniture', rate: 30 },
        { id: '5', label: 'Toys', rate: 15 },
        { id: '6', label: 'Automotive', rate: 35 },
        { id: '7', label: 'Food', rate: 10 },
        { id: '8', label: 'Medicine', rate: 0 }
    ];
    
    initializeDutyDropdowns();
    showStatus('Using default duty categories (offline mode)', 'warning');
}

// ===== PRODUCTS =====
async function loadProducts() {
    console.log('Loading products...');
    
    const user = firebase.auth().currentUser;
    if (!user) return;
    
    showLoadingState();
    
    try {
        const snapshot = await db.collection(PRODUCTS_COLLECTION)
            .where('userId', '==', user.uid)
            .orderBy('createdAt', 'desc')
            .get();
        
        if (snapshot.empty) {
            showEmptyState();
            return;
        }
        
        const fragment = document.createDocumentFragment();
        const mobileFragment = document.createDocumentFragment();
        
        snapshot.forEach(doc => {
            const product = doc.data();
            const row = createProductRow(doc.id, product);
            fragment.appendChild(row);
            
            // Always create mobile cards (they'll be shown/hidden by CSS)
            const card = createMobileCard(doc.id, product);
            mobileFragment.appendChild(card);
        });
        
        // Update table view
        if (!productTableBody) {
            productTableBody = document.querySelector('#productTable tbody');
        }
        if (productTableBody) {
            productTableBody.innerHTML = '';
            productTableBody.appendChild(fragment);
        }
        
        // Update card view
        if (!mobileProductGrid) {
            mobileProductGrid = document.querySelector('.mobile-product-grid');
            if (!mobileProductGrid) createMobileGrid();
        }
        if (mobileProductGrid) {
            mobileProductGrid.innerHTML = '';
            mobileProductGrid.appendChild(mobileFragment);
        }
        
        showStatus(`Loaded ${snapshot.size} products`, 'success');
    } catch (error) {
        console.error("Error loading products:", error);
        showErrorState();
    }
}

function createProductRow(id, product) {
    const row = document.createElement('tr');
    
    const cifUSD = (parseFloat(product.cost) || 0) + (parseFloat(product.shipping) || 0);
    const cifBBD = cifUSD * (parseFloat(product.rate) || 2);
    const dutyPercent = parseFloat(product.duty) || 0;
    const vatPercent = parseFloat(product.vat) || 0;
    const markupPercent = parseFloat(product.markup) || 0;
    
    let dutyAmount = 0;
    if (cifUSD > 30) dutyAmount = cifBBD * (dutyPercent / 100);
    
    const vatAmount = (cifBBD + dutyAmount) * (vatPercent / 100);
    
    const landedCost = cifBBD + dutyAmount + vatAmount + 
                      (parseFloat(product.carrier) || 0) + 
                      (parseFloat(product.handling) || 0);
    
    const sellingPrice = landedCost * (1 + (markupPercent / 100));
    const finalVatAmount = product.vatApply === 'Yes' ? sellingPrice * 0.175 : 0;
    const finalPrice = sellingPrice + finalVatAmount;
    const profit = finalPrice - landedCost;
    const margin = landedCost > 0 ? (profit / landedCost) * 100 : 0;
    
    const cells = [
        product.item || '',
        product.quantity || 1,
        product.link ? `<a href="${product.link}" target="_blank" class="table-link">Link</a>` : '—',
        `$${(product.cost || 0).toFixed(2)}`,
        `$${(product.shipping || 0).toFixed(2)}`,
        `${dutyPercent}%`,
        `${vatPercent}%`,
        `BBD $${(product.handling || 0).toFixed(2)}`,
        `$${(product.declared || cifUSD).toFixed(2)}`,
        (product.rate || 2).toFixed(2),
        `BBD $${landedCost.toFixed(2)}`,
        `BBD $${(product.carrier || 0).toFixed(2)}`,
        `${markupPercent}%`,
        `BBD $${sellingPrice.toFixed(2)}`,
        `BBD $${profit.toFixed(2)}`,
        `${margin.toFixed(1)}%`,
        product.vatApply || 'Auto',
        `BBD $${finalVatAmount.toFixed(2)}`,
        `BBD $${finalPrice.toFixed(2)}`,
        `BBD $${(finalPrice * (product.quantity || 1)).toFixed(2)}`,
        `<div class="action-buttons">
            <button class="btn small" onclick="editProduct('${id}')"><i class="fas fa-edit"></i></button>
            <button class="btn small secondary" onclick="deleteProduct('${id}')"><i class="fas fa-trash"></i></button>
        </div>`
    ];
    
    cells.forEach(cellContent => {
        const td = document.createElement('td');
        td.innerHTML = cellContent;
        row.appendChild(td);
    });
    
    return row;
}

// ===== MODAL FUNCTIONS =====
function openNew() {
    console.log('Opening new product modal');
    
    const modal = document.getElementById('newModal');
    if (!modal) {
        console.error('New modal not found');
        showStatus('Error: Modal not found', 'error');
        return;
    }
    
    document.getElementById('newItem').value = '';
    document.getElementById('newQuantity').value = '1';
    document.getElementById('newLink').value = '';
    document.getElementById('newCost').value = '';
    document.getElementById('newShipping').value = '';
    document.getElementById('newCarrier').value = '';
    document.getElementById('newHandling').value = '';
    document.getElementById('newDeclared').value = '';
    document.getElementById('newRate').value = '2.00';
    document.getElementById('newMarkup').value = '30';
    document.getElementById('newVat').value = '17.5';
    
    if (choicesInstances.newDutySelect) {
        choicesInstances.newDutySelect.setChoiceByValue('');
    }
    document.getElementById('newOtherDutyGroup').style.display = 'none';
    document.getElementById('newOtherDuty').disabled = true;
    document.getElementById('newOtherDuty').value = '';
    
    const calcFields = ['newCost', 'newShipping', 'newDeclared', 'newRate', 'newVat', 'newMarkup', 'newCarrier', 'newHandling', 'newQuantity'];
    calcFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.removeEventListener('input', calculateNewPreview);
            field.addEventListener('input', calculateNewPreview);
        }
    });
    
    setupQuantityListener();
    calculateNewPreview();
    openModal('newModal');
}

function calculateNewPreview() {
    const cost = parseFloat(document.getElementById('newCost').value) || 0;
    const shipping = parseFloat(document.getElementById('newShipping').value) || 0;
    const declared = parseFloat(document.getElementById('newDeclared').value) || (cost + shipping);
    const rate = parseFloat(document.getElementById('newRate').value) || 2;
    const vatRate = parseFloat(document.getElementById('newVat').value) || 17.5;
    const markup = parseFloat(document.getElementById('newMarkup').value) || 30;
    const carrier = parseFloat(document.getElementById('newCarrier').value) || 0;
    const handling = parseFloat(document.getElementById('newHandling').value) || 0;
    const quantity = parseInt(document.getElementById('newQuantity').value) || 1;
    
    if (!document.getElementById('newDeclared').value) {
        document.getElementById('newDeclared').value = (cost + shipping).toFixed(2);
    }
    
    let dutyRate = 0;
    if (choicesInstances.newDutySelect) {
        const dutySelect = choicesInstances.newDutySelect.getValue();
        if (dutySelect && dutySelect.value === 'other') {
            dutyRate = parseFloat(document.getElementById('newOtherDuty').value) || 0;
        } else if (dutySelect && dutySelect.value) {
            dutyRate = parseFloat(dutySelect.value) || 0;
        }
    }
    
    const cifUSD = declared;
    const cifBBD = cifUSD * rate;
    
    let dutyAmount = 0;
    if (cifUSD > 30) dutyAmount = cifBBD * (dutyRate / 100);
    
    let vatAmount = 0;
    if (cifUSD > 30) vatAmount = (cifBBD + dutyAmount) * (vatRate / 100);
    
    const landedCost = cifBBD + dutyAmount + vatAmount + carrier + handling;
    const sellingPrice = landedCost * (1 + (markup / 100));
    const vatApply = cifUSD > 30 ? 'Yes' : 'No';
    const finalVatAmount = vatApply === 'Yes' ? sellingPrice * 0.175 : 0;
    const finalPrice = sellingPrice + finalVatAmount;
    const profit = finalPrice - landedCost;
    const margin = landedCost > 0 ? (profit / landedCost) * 100 : 0;
    
    document.getElementById('newCIF').textContent = `$${cifUSD.toFixed(2)}`;
    document.getElementById('newCIFBBD').textContent = `BBD $${cifBBD.toFixed(2)}`;
    document.getElementById('newDutyAmount').textContent = `BBD $${dutyAmount.toFixed(2)}`;
    document.getElementById('newVatAmount').textContent = `BBD $${vatAmount.toFixed(2)}`;
    document.getElementById('newLanded').textContent = `BBD $${landedCost.toFixed(2)}`;
    document.getElementById('newSellingPreview').textContent = `BBD $${sellingPrice.toFixed(2)}`;
    document.getElementById('newProfit').textContent = `BBD $${profit.toFixed(2)}`;
    document.getElementById('newMargin').textContent = `${margin.toFixed(1)}%`;
    document.getElementById('newFinalPreview').textContent = `BBD $${finalPrice.toFixed(2)}`;
    document.getElementById('newTotalFinal').textContent = `BBD $${(finalPrice * quantity).toFixed(2)}`;
}

async function saveNew() {
    const saveBtn = document.querySelector('#newModal .modal-actions .btn.primary');
    const originalText = saveBtn.innerHTML;
    setButtonLoading(saveBtn, true);
    
    try {
        const user = firebase.auth().currentUser;
        if (!user) {
            showStatus('Please login first', 'error');
            setButtonLoading(saveBtn, false);
            return;
        }
        
        const item = document.getElementById('newItem').value.trim();
        const quantity = parseInt(document.getElementById('newQuantity').value) || 1;
        const link = document.getElementById('newLink').value.trim();
        const cost = parseFloat(document.getElementById('newCost').value);
        const shipping = parseFloat(document.getElementById('newShipping').value) || 0;
        const declared = parseFloat(document.getElementById('newDeclared').value) || (cost + shipping);
        const rate = parseFloat(document.getElementById('newRate').value);
        const markup = parseFloat(document.getElementById('newMarkup').value) || 0;
        const vat = parseFloat(document.getElementById('newVat').value) || 17.5;
        const carrier = parseFloat(document.getElementById('newCarrier').value) || 0;
        const handling = parseFloat(document.getElementById('newHandling').value) || 0;
        
        if (!item) {
            showStatus('Please enter an item name', 'error');
            setButtonLoading(saveBtn, false);
            return;
        }
        
        if (isNaN(cost) || cost <= 0) {
            showStatus('Please enter a valid cost', 'error');
            setButtonLoading(saveBtn, false);
            return;
        }
        
        if (isNaN(rate) || rate <= 0) {
            showStatus('Please enter a valid exchange rate', 'error');
            setButtonLoading(saveBtn, false);
            return;
        }
        
        let duty = 0;
        if (choicesInstances.newDutySelect) {
            const dutySelect = choicesInstances.newDutySelect.getValue();
            if (dutySelect && dutySelect.value === 'other') {
                duty = parseFloat(document.getElementById('newOtherDuty').value) || 0;
            } else if (dutySelect && dutySelect.value) {
                duty = parseFloat(dutySelect.value) || 0;
            }
        }
        
        const cifUSD = declared;
        const vatApply = cifUSD > 30 ? 'Yes' : 'No';
        
        const product = {
            item, quantity, link: link || '', cost, shipping, declared, rate,
            markup, vat, duty, carrier, handling, vatApply,
            userId: user.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        console.log('Saving product:', product);
        
        if (isOfflineMode) {
            await db.collection(PRODUCTS_COLLECTION).add(product);
            showStatus('Product saved locally. Will sync when online.', 'warning');
        } else {
            await db.collection(PRODUCTS_COLLECTION).add(product);
            showStatus('Product saved successfully!', 'success');
        }
        
        closeModal('newModal');
        refreshData();
    } catch (error) {
        console.error("Error saving product:", error);
        showStatus('Error saving product: ' + error.message, 'error');
    } finally {
        setButtonLoading(saveBtn, false);
        saveBtn.innerHTML = originalText;
    }
}

// ===== EDIT FUNCTIONS =====
async function editProduct(id) {
    console.log('Editing product:', id);
    try {
        currentEditId = id;
        
        const doc = await db.collection(PRODUCTS_COLLECTION).doc(id).get();
        const product = doc.data();
        
        document.getElementById('editItem').value = product.item || '';
        document.getElementById('editQuantity').value = product.quantity || 1;
        document.getElementById('editLink').value = product.link || '';
        document.getElementById('editCost').value = product.cost || '';
        document.getElementById('editShipping').value = product.shipping || '';
        document.getElementById('editCarrier').value = product.carrier || '';
        document.getElementById('editHandling').value = product.handling || '';
        document.getElementById('editDeclared').value = product.declared || '';
        document.getElementById('editRate').value = product.rate || '2.00';
        document.getElementById('editMarkup').value = product.markup || '30';
        document.getElementById('editVat').value = product.vat || '17.5';
        
        const dutyValue = product.duty || 0;
        if (choicesInstances.editDutySelect) {
            const dutyCategory = dutyCategories.find(d => Math.abs(d.rate - dutyValue) < 0.01);
            if (dutyCategory) {
                choicesInstances.editDutySelect.setChoiceByValue(dutyValue.toString());
                document.getElementById('editOtherDutyGroup').style.display = 'none';
                document.getElementById('editOtherDuty').disabled = true;
            } else {
                choicesInstances.editDutySelect.setChoiceByValue('other');
                document.getElementById('editOtherDutyGroup').style.display = 'block';
                document.getElementById('editOtherDuty').disabled = false;
                document.getElementById('editOtherDuty').value = dutyValue;
            }
        }
        
        const calcFields = ['editCost', 'editShipping', 'editDeclared', 'editRate', 'editVat', 'editMarkup', 'editCarrier', 'editHandling', 'editQuantity'];
        calcFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            field.removeEventListener('input', calculateEditPreview);
            field.addEventListener('input', calculateEditPreview);
        });
        
        document.getElementById('editDutySelect').removeEventListener('change', calculateEditPreview);
        document.getElementById('editDutySelect').addEventListener('change', calculateEditPreview);
        document.getElementById('editOtherDuty').removeEventListener('input', calculateEditPreview);
        document.getElementById('editOtherDuty').addEventListener('input', calculateEditPreview);
        
        calculateEditPreview();
        openModal('editModal');
    } catch (error) {
        console.error("Error loading product for edit:", error);
        showStatus('Error loading product', 'error');
    }
}

function calculateEditPreview() {
    const cost = parseFloat(document.getElementById('editCost').value) || 0;
    const shipping = parseFloat(document.getElementById('editShipping').value) || 0;
    const declared = parseFloat(document.getElementById('editDeclared').value) || (cost + shipping);
    const rate = parseFloat(document.getElementById('editRate').value) || 2;
    const vatRate = parseFloat(document.getElementById('editVat').value) || 17.5;
    const markup = parseFloat(document.getElementById('editMarkup').value) || 30;
    const carrier = parseFloat(document.getElementById('editCarrier').value) || 0;
    const handling = parseFloat(document.getElementById('editHandling').value) || 0;
    const quantity = parseInt(document.getElementById('editQuantity').value) || 1;
    
    if (!document.getElementById('editDeclared').value) {
        document.getElementById('editDeclared').value = (cost + shipping).toFixed(2);
    }
    
    let dutyRate = 0;
    if (choicesInstances.editDutySelect) {
        const dutySelect = choicesInstances.editDutySelect.getValue();
        if (dutySelect && dutySelect.value === 'other') {
            dutyRate = parseFloat(document.getElementById('editOtherDuty').value) || 0;
        } else if (dutySelect && dutySelect.value) {
            dutyRate = parseFloat(dutySelect.value) || 0;
        }
    }
    
    const cifUSD = declared;
    const cifBBD = cifUSD * rate;
    
    let dutyAmount = 0;
    if (cifUSD > 30) dutyAmount = cifBBD * (dutyRate / 100);
    
    let vatAmount = 0;
    if (cifUSD > 30) vatAmount = (cifBBD + dutyAmount) * (vatRate / 100);
    
    const landedCost = cifBBD + dutyAmount + vatAmount + carrier + handling;
    const sellingPrice = landedCost * (1 + (markup / 100));
    const vatApply = cifUSD > 30 ? 'Yes' : 'No';
    const finalVatAmount = vatApply === 'Yes' ? sellingPrice * 0.175 : 0;
    const finalPrice = sellingPrice + finalVatAmount;
    const profit = finalPrice - landedCost;
    const margin = landedCost > 0 ? (profit / landedCost) * 100 : 0;
    
    document.getElementById('editCIF').textContent = `$${cifUSD.toFixed(2)}`;
    document.getElementById('editCIFBBD').textContent = `BBD $${cifBBD.toFixed(2)}`;
    document.getElementById('editDutyAmount').textContent = `BBD $${dutyAmount.toFixed(2)}`;
    document.getElementById('editVatAmount').textContent = `BBD $${vatAmount.toFixed(2)}`;
    document.getElementById('editLanded').textContent = `BBD $${landedCost.toFixed(2)}`;
    document.getElementById('editSellingPreview').textContent = `BBD $${sellingPrice.toFixed(2)}`;
    document.getElementById('editProfit').textContent = `BBD $${profit.toFixed(2)}`;
    document.getElementById('editMargin').textContent = `${margin.toFixed(1)}%`;
    document.getElementById('editFinalPreview').textContent = `BBD $${finalPrice.toFixed(2)}`;
    document.getElementById('editTotalFinal').textContent = `BBD $${(finalPrice * quantity).toFixed(2)}`;
}

async function saveEdit() {
    const saveBtn = document.querySelector('#editModal .modal-actions .btn.primary');
    const originalText = saveBtn.innerHTML;
    setButtonLoading(saveBtn, true);
    
    try {
        if (!currentEditId) return;
        
        const item = document.getElementById('editItem').value.trim();
        const quantity = parseInt(document.getElementById('editQuantity').value) || 1;
        const link = document.getElementById('editLink').value.trim();
        const cost = parseFloat(document.getElementById('editCost').value);
        const shipping = parseFloat(document.getElementById('editShipping').value) || 0;
        const declared = parseFloat(document.getElementById('editDeclared').value) || (cost + shipping);
        const rate = parseFloat(document.getElementById('editRate').value);
        const markup = parseFloat(document.getElementById('editMarkup').value) || 0;
        const vat = parseFloat(document.getElementById('editVat').value) || 17.5;
        const carrier = parseFloat(document.getElementById('editCarrier').value) || 0;
        const handling = parseFloat(document.getElementById('editHandling').value) || 0;
        
        if (!item) {
            showStatus('Please enter an item name', 'error');
            setButtonLoading(saveBtn, false);
            return;
        }
        
        if (isNaN(cost) || cost <= 0) {
            showStatus('Please enter a valid cost', 'error');
            setButtonLoading(saveBtn, false);
            return;
        }
        
        if (isNaN(rate) || rate <= 0) {
            showStatus('Please enter a valid exchange rate', 'error');
            setButtonLoading(saveBtn, false);
            return;
        }
        
        let duty = 0;
        if (choicesInstances.editDutySelect) {
            const dutySelect = choicesInstances.editDutySelect.getValue();
            if (dutySelect && dutySelect.value === 'other') {
                duty = parseFloat(document.getElementById('editOtherDuty').value) || 0;
            } else if (dutySelect && dutySelect.value) {
                duty = parseFloat(dutySelect.value) || 0;
            }
        }
        
        const cifUSD = declared;
        const vatApply = cifUSD > 30 ? 'Yes' : 'No';
        
        const updateData = {
            item, quantity, link: link || '', cost, shipping, declared, rate,
            markup, vat, duty, carrier, handling, vatApply,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        console.log('Updating product:', updateData);
        
        await db.collection(PRODUCTS_COLLECTION).doc(currentEditId).update(updateData);
        
        closeModal('editModal');
        showStatus('Product updated successfully!', 'success');
        refreshData();
    } catch (error) {
        console.error("Error updating product:", error);
        showStatus('Error updating product', 'error');
    } finally {
        setButtonLoading(saveBtn, false);
        saveBtn.innerHTML = originalText;
    }
}

// ===== DELETE FUNCTIONS =====
async function deleteProduct(id) {
    console.log('Deleting product:', id);
    if (confirm('Are you sure you want to delete this product?')) {
        try {
            await db.collection(PRODUCTS_COLLECTION).doc(id).delete();
            showStatus('Product deleted successfully!', 'success');
            refreshData();
        } catch (error) {
            console.error("Error deleting product:", error);
            showStatus('Error deleting product', 'error');
        }
    }
}

// ===== DUTY FUNCTIONS =====
async function saveNewDuty() {
    const saveBtn = document.querySelector('#addDutyModal .btn.primary');
    const originalText = saveBtn.innerHTML;
    setButtonLoading(saveBtn, true);
    
    try {
        const label = document.getElementById('newDutyLabel').value.trim();
        const rate = parseFloat(document.getElementById('newDutyRate').value);
        
        if (!label) {
            showStatus('Please enter a duty name', 'error');
            setButtonLoading(saveBtn, false);
            return;
        }
        
        if (isNaN(rate) || rate < 0) {
            showStatus('Please enter a valid duty rate', 'error');
            setButtonLoading(saveBtn, false);
            return;
        }
        
        const duty = {
            label, rate,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection(DUTY_COLLECTION).add(duty);
        
        closeModal('addDutyModal');
        document.getElementById('newDutyLabel').value = '';
        document.getElementById('newDutyRate').value = '';
        
        showStatus('Duty category added!', 'success');
        await loadDutyCategories();
    } catch (error) {
        console.error("Error saving duty:", error);
        showStatus('Error saving duty category', 'error');
    } finally {
        setButtonLoading(saveBtn, false);
        saveBtn.innerHTML = originalText;
    }
}

function openAddDutyModal() {
    console.log('Opening add duty modal');
    document.getElementById('newDutyLabel').value = '';
    document.getElementById('newDutyRate').value = '';
    openModal('addDutyModal');
}

// ===== UI UTILITIES =====
function setButtonLoading(button, isLoading) {
    if (isLoading) {
        button.disabled = true;
        button.innerHTML = '<span class="loading"></span> Saving...';
    } else {
        button.disabled = false;
    }
}

function openModal(modalId) {
    console.log('Opening modal:', modalId);
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    } else {
        console.error('Modal not found:', modalId);
    }
}

function closeModal(modalId) {
    console.log('Closing modal:', modalId);
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
    
    if (modalId === 'newModal') {
        const calcFields = ['newCost', 'newShipping', 'newDeclared', 'newRate', 'newVat', 'newMarkup', 'newCarrier', 'newHandling', 'newQuantity'];
        calcFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) field.removeEventListener('input', calculateNewPreview);
        });
        const dutySelect = document.getElementById('newDutySelect');
        if (dutySelect) dutySelect.removeEventListener('change', calculateNewPreview);
        const otherDuty = document.getElementById('newOtherDuty');
        if (otherDuty) otherDuty.removeEventListener('input', calculateNewPreview);
    } else if (modalId === 'editModal') {
        const calcFields = ['editCost', 'editShipping', 'editDeclared', 'editRate', 'editVat', 'editMarkup', 'editCarrier', 'editHandling', 'editQuantity'];
        calcFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) field.removeEventListener('input', calculateEditPreview);
        });
        const dutySelect = document.getElementById('editDutySelect');
        if (dutySelect) dutySelect.removeEventListener('change', calculateEditPreview);
        const otherDuty = document.getElementById('editOtherDuty');
        if (otherDuty) otherDuty.removeEventListener('input', calculateEditPreview);
    }
}

function showStatus(message, type) {
    console.log('Status:', type, message);
    const statusEl = document.getElementById('status');
    if (!statusEl) {
        console.warn('Status element not found');
        return;
    }
    
    statusEl.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> ${message}`;
    statusEl.className = 'status ' + type;
    
    if (window.statusTimeout) clearTimeout(window.statusTimeout);
    
    window.statusTimeout = setTimeout(() => {
        statusEl.innerHTML = '';
        statusEl.className = 'status';
    }, 5000);
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '';
    switch(type) {
        case 'success': icon = 'check-circle'; break;
        case 'error': icon = 'exclamation-circle'; break;
        case 'warning': icon = 'exclamation-triangle'; break;
        default: icon = 'info-circle';
    }
    
    toast.innerHTML = `
        <div class="toast-icon"><i class="fas fa-${icon}"></i></div>
        <div class="toast-message">${message}</div>
        <button class="toast-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// ===== INITIALIZE DROPDOWNS =====
function initializeDutyDropdowns() {
    console.log('Initializing duty dropdowns');
    const dutySelects = ['newDutySelect', 'editDutySelect'];
    
    dutySelects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = '<option value="">Select duty...</option>' +
                dutyCategories.map(duty => 
                    `<option value="${duty.rate}">${duty.label} (${duty.rate}%)</option>`
                ).join('') +
                '<option value="other">Other...</option>';
            
            if (choicesInstances[selectId]) {
                choicesInstances[selectId].destroy();
            }
            
            choicesInstances[selectId] = new Choices(select, {
                searchEnabled: true,
                itemSelectText: '',
                shouldSort: false,
                placeholder: true,
                placeholderValue: 'Select duty...'
            });
            
            choicesInstances[selectId].passedElement.element.addEventListener('choice', function(event) {
                const detail = event.detail;
                if (detail.choice && detail.choice.value === 'other') {
                    if (selectId.includes('new')) {
                        document.getElementById('newOtherDutyGroup').style.display = 'block';
                        document.getElementById('newOtherDuty').disabled = false;
                    } else {
                        document.getElementById('editOtherDutyGroup').style.display = 'block';
                        document.getElementById('editOtherDuty').disabled = false;
                    }
                } else {
                    if (selectId.includes('new')) {
                        document.getElementById('newOtherDutyGroup').style.display = 'none';
                        document.getElementById('newOtherDuty').disabled = true;
                    } else {
                        document.getElementById('editOtherDutyGroup').style.display = 'none';
                        document.getElementById('editOtherDuty').disabled = true;
                    }
                }
                
                if (selectId.includes('new')) {
                    calculateNewPreview();
                } else {
                    calculateEditPreview();
                }
            });
        } else {
            console.warn(`Select element ${selectId} not found`);
        }
    });
}

// ===== MODAL INITIALIZATION =====
function initializeModals() {
    console.log('Initializing modals');
    
    window.onclick = function(event) {
        if (event.target.classList.contains('modal')) {
            closeModal(event.target.id);
        }
    };
    
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            const modals = document.querySelectorAll('.modal[style*="display: flex"]');
            modals.forEach(modal => {
                closeModal(modal.id);
            });
        }
    });
}

// ===== MOBILE FUNCTIONS =====
function checkMobile() {
    const fab = document.querySelector('.fab');
    if (fab) {
        if (window.innerWidth <= 768) {
            fab.style.display = 'flex';
        } else {
            fab.style.display = 'none';
        }
    }
}

function checkMobileView() {
    const isMobile = window.innerWidth <= 768;
    const table = document.getElementById('productTable');
    const container = document.querySelector('.table-container');
    
    if (isMobile) {
        if (!document.querySelector('.mobile-product-grid')) {
            const mobileGrid = document.createElement('div');
            mobileGrid.className = 'mobile-product-grid';
            container.appendChild(mobileGrid);
        }
        renderMobileProducts();
    }
}

function renderMobileProducts() {
    const mobileGrid = document.querySelector('.mobile-product-grid');
    if (!mobileGrid) return;
    
    const tbody = document.querySelector('#productTable tbody');
    const rows = tbody.querySelectorAll('tr');
    
    if (rows.length === 1 && rows[0].querySelector('td[colspan]')) {
        mobileGrid.innerHTML = '<div class="empty-state">No products yet</div>';
        return;
    }
    
    let html = '';
    rows.forEach((row, index) => {
        const cells = row.querySelectorAll('td');
        if (cells.length > 1) {
            const productId = cells[20]?.querySelector('button')?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] || '';
            
            html += `
                <div class="product-card" data-id="${productId}" data-index="${index}">
                    <div class="product-card-header" onclick="toggleCard(this)">
                        <h3>${cells[0]?.textContent || 'Unnamed'}</h3>
                        <span class="product-quantity">Qty: ${cells[1]?.textContent || 1}</span>
                        <span class="expand-icon"><i class="fas fa-chevron-down"></i></span>
                    </div>
                    
                    <div class="product-card-quick-info">
                        <div class="quick-info-item">
                            <span class="quick-info-label">Cost</span>
                            <span class="quick-info-value cost">${cells[3]?.textContent || '$0.00'}</span>
                        </div>
                        <div class="quick-info-item">
                            <span class="quick-info-label">Selling</span>
                            <span class="quick-info-value selling">${cells[13]?.textContent || '$0.00'}</span>
                        </div>
                        <div class="quick-info-item">
                            <span class="quick-info-label">Profit</span>
                            <span class="quick-info-value profit">${cells[14]?.textContent || '$0.00'}</span>
                        </div>
                    </div>
                    
                    <div class="product-card-details">
                        <div class="details-grid">
                            <div class="detail-item">
                                <span class="detail-label">Shipping</span>
                                <span class="detail-value">${cells[4]?.textContent || '$0.00'}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Duty %</span>
                                <span class="detail-value">${cells[5]?.textContent || '0%'}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">VAT %</span>
                                <span class="detail-value">${cells[6]?.textContent || '0%'}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Handling</span>
                                <span class="detail-value">${cells[7]?.textContent || 'BBD $0.00'}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Declared</span>
                                <span class="detail-value">${cells[8]?.textContent || '$0.00'}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Rate</span>
                                <span class="detail-value">${cells[9]?.textContent || '2.00'}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Landed</span>
                                <span class="detail-value">${cells[10]?.textContent || 'BBD $0.00'}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Carrier</span>
                                <span class="detail-value">${cells[11]?.textContent || 'BBD $0.00'}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Markup</span>
                                <span class="detail-value">${cells[12]?.textContent || '0%'}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Margin</span>
                                <span class="detail-value">${cells[15]?.textContent || '0%'}</span>
                            </div>
                            <div class="detail-item full-width">
                                <span class="detail-label">Final Price</span>
                                <span class="detail-value highlight">${cells[18]?.textContent || 'BBD $0.00'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="product-card-actions">
                        <button class="edit-btn" onclick="editProduct('${productId}')">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="delete-btn" onclick="deleteProduct('${productId}')">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </div>
            `;
        }
    });
    mobileGrid.innerHTML = html;
}

function toggleCard(headerElement) {
    const card = headerElement.closest('.product-card');
    card.classList.toggle('expanded');
}

function createMobileCard(id, product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.setAttribute('data-id', id);
    
    const cifUSD = (parseFloat(product.cost) || 0) + (parseFloat(product.shipping) || 0);
    const cifBBD = cifUSD * (parseFloat(product.rate) || 2);
    const dutyPercent = parseFloat(product.duty) || 0;
    const vatPercent = parseFloat(product.vat) || 0;
    const markupPercent = parseFloat(product.markup) || 0;
    
    let dutyAmount = 0;
    if (cifUSD > 30) dutyAmount = cifBBD * (dutyPercent / 100);
    
    const vatAmount = (cifBBD + dutyAmount) * (vatPercent / 100);
    const landedCost = cifBBD + dutyAmount + vatAmount + 
                      (parseFloat(product.carrier) || 0) + 
                      (parseFloat(product.handling) || 0);
    const sellingPrice = landedCost * (1 + (markupPercent / 100));
    const finalVatAmount = product.vatApply === 'Yes' ? sellingPrice * 0.175 : 0;
    const finalPrice = sellingPrice + finalVatAmount;
    
    card.innerHTML = `
        <div class="product-card-header" onclick="toggleCard(this)">
            <h3>${product.item || 'Unnamed'}</h3>
            <span class="product-quantity">Qty: ${product.quantity || 1}</span>
            <span class="expand-icon"><i class="fas fa-chevron-down"></i></span>
        </div>
        
        <div class="product-card-quick-info">
            <div class="quick-info-item">
                <span class="quick-info-label">Cost</span>
                <span class="quick-info-value cost">$${(product.cost || 0).toFixed(2)}</span>
            </div>
            <div class="quick-info-item">
                <span class="quick-info-label">Selling</span>
                <span class="quick-info-value selling">BBD $${sellingPrice.toFixed(2)}</span>
            </div>
            <div class="quick-info-item">
                <span class="quick-info-label">Profit</span>
                <span class="quick-info-value profit">BBD $${(finalPrice - landedCost).toFixed(2)}</span>
            </div>
        </div>
        
        <div class="product-card-details">
            <div class="details-grid">
                <div class="detail-item">
                    <span class="detail-label">Shipping</span>
                    <span class="detail-value">$${(product.shipping || 0).toFixed(2)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Duty %</span>
                    <span class="detail-value">${dutyPercent}%</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">VAT %</span>
                    <span class="detail-value">${vatPercent}%</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Handling</span>
                    <span class="detail-value">BBD $${(product.handling || 0).toFixed(2)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Declared</span>
                    <span class="detail-value">$${(product.declared || cifUSD).toFixed(2)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Rate</span>
                    <span class="detail-value">${(product.rate || 2).toFixed(2)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Landed</span>
                    <span class="detail-value">BBD $${landedCost.toFixed(2)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Carrier</span>
                    <span class="detail-value">BBD $${(product.carrier || 0).toFixed(2)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Markup</span>
                    <span class="detail-value">${markupPercent}%</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Margin</span>
                    <span class="detail-value">${((finalPrice - landedCost) / landedCost * 100).toFixed(1)}%</span>
                </div>
                <div class="detail-item full-width">
                    <span class="detail-label">Final Price</span>
                    <span class="detail-value highlight">BBD $${finalPrice.toFixed(2)}</span>
                </div>
            </div>
        </div>
        
        <div class="product-card-actions">
            <button class="edit-btn" onclick="editProduct('${id}')">
                <i class="fas fa-edit"></i> Edit
            </button>
            <button class="delete-btn" onclick="deleteProduct('${id}')">
                <i class="fas fa-trash"></i> Delete
            </button>
        </div>
    `;
    
    return card;
}

function createMobileGrid() {
    const container = document.querySelector('.table-container');
    if (container && !document.querySelector('.mobile-product-grid')) {
        const grid = document.createElement('div');
        grid.className = 'mobile-product-grid';
        container.appendChild(grid);
        mobileProductGrid = grid;
    }
}

function setupQuantityListener() {
    const quantityInput = document.getElementById('newQuantity');
    if (quantityInput) {
        quantityInput.addEventListener('input', debounce(() => {
            calculateNewPreview();
        }, 150));
    }
}

// ===== AUTH UI FUNCTIONS =====
function toggleAuthForm(formType) {
    document.querySelectorAll('.auth-form').forEach(form => {
        form.classList.remove('active');
    });
    
    if (formType === 'login') {
        document.getElementById('loginForm').classList.add('active');
    } else if (formType === 'signup') {
        document.getElementById('signupForm').classList.add('active');
    } else if (formType === 'forgot') {
        document.getElementById('forgotForm').classList.add('active');
    }
}

function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const icon = input.nextElementSibling.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

function fillDemoCredentials(email, password) {
    document.getElementById('email').value = email;
    document.getElementById('password').value = password;
    showToast('Demo credentials filled!', 'info');
}

function showForgotPassword() {
    toggleAuthForm('forgot');
}

function sendResetLink() {
    const email = document.getElementById('resetEmail').value;
    if (!email) {
        showToast('Please enter your email', 'error');
        return;
    }
    
    firebase.auth().sendPasswordResetEmail(email)
        .then(() => {
            showToast('Password reset email sent!', 'success');
            setTimeout(() => toggleAuthForm('login'), 3000);
        })
        .catch(error => {
            showToast(error.message, 'error');
        });
}

function showTerms() {
    showToast('Terms of Service would open here', 'info');
}

function showPrivacy() {
    showToast('Privacy Policy would open here', 'info');
}

// ===== GOOGLE SIGN-IN - ENHANCED =====
async function googleSignIn(buttonId = 'googleSignInBtn') {
    console.log('🔵 Google Sign-In clicked:', buttonId);
    
    const googleBtn = document.getElementById(buttonId);
    if (!googleBtn) {
        console.error('🔴 Google button not found');
        alert('Error: Google button not found');
        return;
    }
    
    // Show loading state
    const originalHTML = googleBtn.innerHTML;
    googleBtn.disabled = true;
    googleBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
    
    try {
        // Check if we're on mobile
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        console.log('📱 Is mobile:', isMobile);
        
        // Check if popups are blocked
        const testPopup = window.open('about:blank', '_blank');
        if (!testPopup && !isMobile) {
            console.warn('⚠️ Popup blocked');
            alert('Please allow popups for this site to use Google Sign-In');
            googleBtn.disabled = false;
            googleBtn.innerHTML = originalHTML;
            return;
        }
        if (testPopup) testPopup.close();
        
        if (isMobile) {
            console.log('🔄 Using redirect for mobile');
            await auth.signInWithRedirect(googleProvider);
            // The page will redirect, so we don't need to reset button
            return;
        } else {
            console.log('🔄 Using popup for desktop');
            const result = await auth.signInWithPopup(googleProvider);
            console.log('✅ Sign-in successful:', result.user.email);
            await handleGoogleSignInResult(result);
        }
    } catch (error) {
        console.error('🔴 Google Sign-In Error:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        
        let errorMessage = 'Sign-in failed. ';
        
        switch (error.code) {
            case 'auth/popup-closed-by-user':
                errorMessage += 'Popup was closed before completing sign-in.';
                break;
            case 'auth/popup-blocked':
                errorMessage += 'Popup was blocked. Please allow popups for this site.';
                break;
            case 'auth/unauthorized-domain':
                errorMessage += 'This domain is not authorized. Please add it to Firebase Console.';
                break;
            case 'auth/network-request-failed':
                errorMessage += 'Network error. Check your connection.';
                break;
            default:
                errorMessage += error.message;
        }
        
        alert(errorMessage);
        showToast(errorMessage, 'error');
        
        // Reset button
        googleBtn.disabled = false;
        googleBtn.innerHTML = originalHTML;
    }
}

// Make sure these are defined
window.googleSignIn = googleSignIn;
window.googleSignInLogin = function() { googleSignIn('googleSignInBtn'); };
window.googleSignInSignup = function() { googleSignIn('googleSignUpBtn'); };

async function handleRedirectResult() {
    try {
        const result = await auth.getRedirectResult();
        if (result.user) {
            console.log('Redirect sign-in successful');
            await handleGoogleSignInResult(result);
        } else if (result.credential) {
            console.log('Redirect result with credential');
            await handleGoogleSignInResult(result);
        }
    } catch (error) {
        console.error('Redirect error:', error);
        if (error.code !== 'auth/popup-closed-by-user') {
            handleGoogleSignInError(error);
        }
    }
}

async function handleGoogleSignInResult(result) {
    console.log('Handling Google sign-in result');
    
    const user = result.user;
    const isNewUser = result.additionalUserInfo?.isNewUser || false;
    
    console.log('User:', user.email, 'New user:', isNewUser);
    showToast(`Welcome ${user.displayName || 'back'} to ImportIQ!`, 'success');
    
    try {
        const userProfile = {
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
            authProvider: 'google'
        };
        
        if (isNewUser) {
            await db.collection('userProfiles').doc(user.uid).set({
                ...userProfile,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                preferences: {
                    currency: 'USD',
                    defaultMarkup: 30,
                    defaultVAT: 17.5
                }
            });
            showToast('Account created successfully!', 'success');
        } else {
            await db.collection('userProfiles').doc(user.uid).set(userProfile, { merge: true });
        }
    } catch (error) {
        console.error('Error updating user profile:', error);
    }
}

function handleGoogleSignInError(error) {
    let errorMessage = 'Sign-in failed. Please try again.';
    
    switch (error.code) {
        case 'auth/popup-closed-by-user':
            errorMessage = 'Sign-in was cancelled. Please try again.';
            break;
        case 'auth/popup-blocked':
            errorMessage = 'Popup was blocked. Please allow popups for this site.';
            break;
        case 'auth/cancelled-popup-request':
            errorMessage = 'Another sign-in request is already in progress.';
            break;
        case 'auth/account-exists-with-different-credential':
            errorMessage = 'An account already exists with the same email address using a different sign-in method.';
            break;
        case 'auth/network-request-failed':
            errorMessage = 'Network connection lost. Please check your internet.';
            break;
        case 'auth/user-disabled':
            errorMessage = 'This account has been disabled. Please contact support.';
            break;
        case 'auth/unauthorized-domain':
            errorMessage = 'This domain is not authorized for Google Sign-In.';
            break;
        default:
            console.error('Unhandled error:', error);
    }
    
    showToast(errorMessage, 'error');
}

function googleSignInLogin() {
    googleSignIn('googleSignInBtn');
}

function googleSignInSignup() {
    googleSignIn('googleSignUpBtn');
}

// ===== DARK MODE =====
function toggleDarkMode() {
    const body = document.body;
    body.classList.toggle('dark-mode');
    
    if (body.classList.contains('dark-mode')) {
        localStorage.setItem('darkMode', 'enabled');
    } else {
        localStorage.setItem('darkMode', 'disabled');
    }
}

function loadDarkModePreference() {
    const savedMode = localStorage.getItem('darkMode');
    const body = document.body;
    
    if (savedMode === 'enabled') {
        body.classList.add('dark-mode');
    } else if (!savedMode && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        body.classList.add('dark-mode');
        localStorage.setItem('darkMode', 'enabled');
    }
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!localStorage.getItem('darkMode')) {
        if (e.matches) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }
});

// ===== VIEW TOGGLE =====
let currentView = localStorage.getItem('viewMode') || 'auto'; // auto, table, card

function toggleView() {
    const body = document.body;
    const toggleBtn = document.getElementById('viewToggle');
    if (!toggleBtn) return;
    
    const icon = toggleBtn.querySelector('i');
    const text = toggleBtn.querySelector('span');
    
    if (currentView === 'auto') {
        // Switch to table view
        currentView = 'table';
        body.classList.remove('card-mode');
        body.classList.add('table-mode');
        icon.className = 'fas fa-id-card';
        text.textContent = 'Cards';
        showStatus('Table view', 'info');
    } else if (currentView === 'table') {
        // Switch to card view
        currentView = 'card';
        body.classList.remove('table-mode');
        body.classList.add('card-mode');
        icon.className = 'fas fa-table';
        text.textContent = 'Table';
        showStatus('Card view', 'info');
    } else {
        // Switch to auto (responsive)
        currentView = 'auto';
        body.classList.remove('table-mode', 'card-mode');
        
        if (window.innerWidth <= 768) {
            icon.className = 'fas fa-table';
            text.textContent = 'Table';
        } else {
            icon.className = 'fas fa-id-card';
            text.textContent = 'Cards';
        }
        showStatus('Auto mode', 'info');
    }
    
    localStorage.setItem('viewMode', currentView);
}

// Initialize view on load
function initializeView() {
    const body = document.body;
    const toggleBtn = document.getElementById('viewToggle');
    if (!toggleBtn) return;
    
    const icon = toggleBtn.querySelector('i');
    const text = toggleBtn.querySelector('span');
    
    // Remove any existing mode classes
    body.classList.remove('table-mode', 'card-mode');
    
    if (currentView === 'table') {
        body.classList.add('table-mode');
        icon.className = 'fas fa-id-card';
        text.textContent = 'Cards';
    } else if (currentView === 'card') {
        body.classList.add('card-mode');
        icon.className = 'fas fa-table';
        text.textContent = 'Table';
    } else {
        // Auto mode - cards on mobile, table on desktop
        if (window.innerWidth <= 768) {
            icon.className = 'fas fa-table';
            text.textContent = 'Table';
        } else {
            icon.className = 'fas fa-id-card';
            text.textContent = 'Cards';
        }
    }
}

// Update view on resize for auto mode
window.addEventListener('resize', () => {
    if (currentView === 'auto') {
        const toggleBtn = document.getElementById('viewToggle');
        if (!toggleBtn) return;
        
        const icon = toggleBtn.querySelector('i');
        const text = toggleBtn.querySelector('span');
        
        if (window.innerWidth <= 768) {
            icon.className = 'fas fa-id-card';
            text.textContent = 'Table View';
        } else {
            icon.className = 'fas fa-table';
            text.textContent = 'Card View';
        }
    }
});

// Make function globally available
window.toggleView = toggleView;

// ===== UTILITY FUNCTIONS =====
function checkOverflow() {
    const container = document.querySelector('.table-container');
    const table = document.getElementById('productTable');
    
    if (table && container) {
        if (table.scrollWidth > container.clientWidth) {
            container.classList.add('overflow');
        } else {
            container.classList.remove('overflow');
        }
    }
}

function updateConnectionStatus() {
    const statusEl = document.getElementById('connectionStatus');
    if (statusEl) {
        if (navigator.onLine) {
            statusEl.className = 'connection-status online';
            statusEl.innerHTML = '<i class="fas fa-wifi"></i>';
        } else {
            statusEl.className = 'connection-status offline';
            statusEl.innerHTML = '<i class="fas fa-wifi-slash"></i>';
        }
    }
}

// ===== EVENT LISTENERS =====
window.addEventListener('load', () => {
    checkOverflow();
    checkMobileView();
    updateConnectionStatus();
});

window.addEventListener('resize', () => {
    checkOverflow();
    checkMobileView();
    checkMobile();
});

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);
