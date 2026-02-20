// Global variables
let currentEditId = null;
let dutyCategories = [];
let choicesInstances = {};
let isOfflineMode = false;

// Initialize app when DOM loads
document.addEventListener('DOMContentLoaded', function() {
  // Check Firebase connection
  checkFirebaseConnection();
  
  // Check auth state
  firebase.auth().onAuthStateChanged(function(user) {
    if (user) {
      showAppSection();
      // Load data with retry mechanism
      retryOperation(loadDutyCategories, 3);
      retryOperation(loadProducts, 3);
    } else {
      showAuthSection();
    }
  });
  
  // Initialize modals
  initializeModals();
});

// Retry operation on failure
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
          // Load from cache or use defaults
          loadDutyCategoriesFromCache();
        } else if (error.message && error.message.includes('API has not been used')) {
          showStatus('Firestore API not enabled. Please enable it in Google Cloud Console.', 'error');
        } else {
          showStatus('Connection error. Please check your internet.', 'error');
        }
      }
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

// Check Firebase connection status
function checkFirebaseConnection() {
  if (!navigator.onLine) {
    showStatus('You are offline. Working in offline mode.', 'warning');
    isOfflineMode = true;
    return false;
  }
  
  // Test Firestore connection
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

// Load duty categories from cache when offline
function loadDutyCategoriesFromCache() {
  // Use default duty categories as fallback
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

// Authentication functions
function showSignup() {
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
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  if (!email || !password) {
    showStatus('Please enter email and password', 'error');
    return;
  }
  
  setAuthButtonLoading(true);
  
  firebase.auth().signInWithEmailAndPassword(email, password)
    .catch((error) => {
      showStatus(error.message, 'error');
      setAuthButtonLoading(false);
    });
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
  firebase.auth().signOut();
}

function showAuthSection() {
  document.getElementById('authSection').style.display = 'block';
  document.getElementById('appSection').style.display = 'none';
}

function showAppSection() {
  const user = firebase.auth().currentUser;
  document.getElementById('userEmail').textContent = user.email;
  document.getElementById('authSection').style.display = 'none';
  document.getElementById('appSection').style.display = 'block';
  
  // Show FAB on mobile
  checkMobile();
}

// Load duty categories from Firestore
async function loadDutyCategories() {
  try {
    // Check if Firestore is properly initialized
    if (!db) {
      throw new Error('Firestore not initialized');
    }
    
    const snapshot = await db.collection(DUTY_COLLECTION).orderBy('label').get();
    dutyCategories = [];
    
    if (snapshot.empty) {
      // Add default duty categories if none exist
      await addDefaultDutyCategories();
      return;
    }
    
    snapshot.forEach(doc => {
      dutyCategories.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Initialize dropdowns
    initializeDutyDropdowns();
  } catch (error) {
    console.error("Error loading duty categories:", error);
    throw error; // Propagate error for retry mechanism
  }
}

// Add default duty categories
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

// Load products from Firestore
async function loadProducts() {
  const tbody = document.querySelector('#productTable tbody');
  
  // Show skeleton loading
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
  
  try {
    const user = firebase.auth().currentUser;
    if (!user) return;
    
    let snapshot;
    if (isOfflineMode) {
      // Try to get from cache first
      snapshot = await db.collection(PRODUCTS_COLLECTION)
        .where('userId', '==', user.uid)
        .orderBy('createdAt', 'desc')
        .get({ source: 'cache' });
    } else {
      snapshot = await db.collection(PRODUCTS_COLLECTION)
        .where('userId', '==', user.uid)
        .orderBy('createdAt', 'desc')
        .get();
    }
    
    tbody.innerHTML = '';
    
    if (snapshot.empty) {
      // Show empty state
      tbody.innerHTML = `
        <tr>
          <td colspan="21">
            <div class="empty-state">
              <i class="fas fa-box-open" style="font-size: 48px; color: var(--text-light);"></i>
              <h3>No products yet</h3>
              <p>Get started by adding your first product</p>
              <button class="btn primary" onclick="openNew()">
                <i class="fas fa-plus"></i> Add Product
              </button>
            </div>
          </td>
        </tr>
      `;
      return;
    }
    
    snapshot.forEach(doc => {
      const product = doc.data();
      const row = createProductRow(doc.id, product);
      tbody.appendChild(row);
    });
    
    showStatus(`Loaded ${snapshot.size} products`, 'success');
  } catch (error) {
    console.error("Error loading products:", error);
    
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
    
    throw error; // Propagate error for retry mechanism
  }
}

// Initialize Choices.js dropdowns
function initializeDutyDropdowns() {
  const dutySelects = ['newDutySelect', 'editDutySelect'];
  
  dutySelects.forEach(selectId => {
    const select = document.getElementById(selectId);
    if (select) {
      // Clear existing options
      select.innerHTML = '<option value="">Select duty...</option>' +
        dutyCategories.map(duty => 
          `<option value="${duty.rate}">${duty.label} (${duty.rate}%)</option>`
        ).join('') +
        '<option value="other">Other...</option>';
      
      // Initialize Choices.js
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
      
      // Add event listener for "Other" selection
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
        
        // Trigger calculation when duty changes
        if (selectId.includes('new')) {
          calculateNewPreview();
        } else {
          calculateEditPreview();
        }
      });
    }
  });
}

// Create table row for a product
function createProductRow(id, product) {
  const row = document.createElement('tr');
  
  // Calculate values
  const cifUSD = (parseFloat(product.cost) || 0) + (parseFloat(product.shipping) || 0);
  const cifBBD = cifUSD * (parseFloat(product.rate) || 2);
  const dutyPercent = parseFloat(product.duty) || 0;
  const vatPercent = parseFloat(product.vat) || 0;
  const markupPercent = parseFloat(product.markup) || 0;
  
  // Calculate duty
  let dutyAmount = 0;
  if (cifUSD > 30) {
    dutyAmount = cifBBD * (dutyPercent / 100);
  }
  
  // Calculate VAT on customs (CIF + Duty)
  const vatAmount = (cifBBD + dutyAmount) * (vatPercent / 100);
  
  // Total landed cost
  const landedCost = cifBBD + dutyAmount + vatAmount + 
                    (parseFloat(product.carrier) || 0) + 
                    (parseFloat(product.handling) || 0);
  
  // Selling price
  const sellingPrice = landedCost * (1 + (markupPercent / 100));
  
  // VAT on selling (if applicable)
  const finalVatAmount = product.vatApply === 'Yes' ? sellingPrice * 0.175 : 0;
  const finalPrice = sellingPrice + finalVatAmount;
  
  // Profit and margin
  const profit = finalPrice - landedCost;
  const margin = landedCost > 0 ? (profit / landedCost) * 100 : 0;
  
  // Create cells
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

// Open new product modal
function openNew() {
  // Reset form
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
  
  // Reset duty dropdown
  if (choicesInstances.newDutySelect) {
    choicesInstances.newDutySelect.setChoiceByValue('');
  }
  document.getElementById('newOtherDutyGroup').style.display = 'none';
  document.getElementById('newOtherDuty').disabled = true;
  document.getElementById('newOtherDuty').value = '';
  
  // Remove existing event listeners
  const calcFields = ['newCost', 'newShipping', 'newDeclared', 'newRate', 'newVat', 'newMarkup', 'newCarrier', 'newHandling', 'newQuantity'];
  calcFields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    field.removeEventListener('input', calculateNewPreview);
    field.addEventListener('input', calculateNewPreview);
  });
  
  document.getElementById('newDutySelect').removeEventListener('change', calculateNewPreview);
  document.getElementById('newDutySelect').addEventListener('change', calculateNewPreview);
  
  document.getElementById('newOtherDuty').removeEventListener('input', calculateNewPreview);
  document.getElementById('newOtherDuty').addEventListener('input', calculateNewPreview);
  
  // Open modal
  openModal('newModal');
  
  // Initial calculation
  calculateNewPreview();
}

// Calculate preview for new product
function calculateNewPreview() {
  // Get values
  const cost = parseFloat(document.getElementById('newCost').value) || 0;
  const shipping = parseFloat(document.getElementById('newShipping').value) || 0;
  const declared = parseFloat(document.getElementById('newDeclared').value) || (cost + shipping);
  const rate = parseFloat(document.getElementById('newRate').value) || 2;
  const vatRate = parseFloat(document.getElementById('newVat').value) || 17.5;
  const markup = parseFloat(document.getElementById('newMarkup').value) || 30;
  const carrier = parseFloat(document.getElementById('newCarrier').value) || 0;
  const handling = parseFloat(document.getElementById('newHandling').value) || 0;
  const quantity = parseInt(document.getElementById('newQuantity').value) || 1;
  
  // Update declared field if empty
  if (!document.getElementById('newDeclared').value) {
    document.getElementById('newDeclared').value = (cost + shipping).toFixed(2);
  }
  
  // Get duty rate
  let dutyRate = 0;
  if (choicesInstances.newDutySelect) {
    const dutySelect = choicesInstances.newDutySelect.getValue();
    if (dutySelect && dutySelect.value === 'other') {
      dutyRate = parseFloat(document.getElementById('newOtherDuty').value) || 0;
    } else if (dutySelect && dutySelect.value) {
      dutyRate = parseFloat(dutySelect.value) || 0;
    }
  }
  
  // Calculate CIF
  const cifUSD = declared;
  const cifBBD = cifUSD * rate;
  
  // Calculate duty (only if CIF > $30)
  let dutyAmount = 0;
  if (cifUSD > 30) {
    dutyAmount = cifBBD * (dutyRate / 100);
  }
  
  // Calculate VAT on customs (only if CIF > $30)
  let vatAmount = 0;
  if (cifUSD > 30) {
    vatAmount = (cifBBD + dutyAmount) * (vatRate / 100);
  }
  
  // Calculate landed cost
  const landedCost = cifBBD + dutyAmount + vatAmount + carrier + handling;
  
  // Calculate selling price
  const sellingPrice = landedCost * (1 + (markup / 100));
  
  // Calculate VAT on selling (if applicable)
  const vatApply = cifUSD > 30 ? 'Yes' : 'No';
  const finalVatAmount = vatApply === 'Yes' ? sellingPrice * 0.175 : 0;
  const finalPrice = sellingPrice + finalVatAmount;
  
  // Calculate profit and margin
  const profit = finalPrice - landedCost;
  const margin = landedCost > 0 ? (profit / landedCost) * 100 : 0;
  
  // Update preview
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

// Save new product
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
    
    // Get values
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
    
    // Validate required fields
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
    
    // Get duty
    let duty = 0;
    if (choicesInstances.newDutySelect) {
      const dutySelect = choicesInstances.newDutySelect.getValue();
      if (dutySelect && dutySelect.value === 'other') {
        duty = parseFloat(document.getElementById('newOtherDuty').value) || 0;
      } else if (dutySelect && dutySelect.value) {
        duty = parseFloat(dutySelect.value) || 0;
      }
    }
    
    // Determine VAT apply
    const cifUSD = declared;
    const vatApply = cifUSD > 30 ? 'Yes' : 'No';
    
    // Create product object
    const product = {
      item,
      quantity,
      link: link || '',
      cost,
      shipping,
      declared,
      rate,
      markup,
      vat,
      duty,
      carrier,
      handling,
      vatApply,
      userId: user.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Save to Firestore
    if (isOfflineMode) {
      // In offline mode, save locally and sync later
      await db.collection(PRODUCTS_COLLECTION).add(product);
      showStatus('Product saved locally. Will sync when online.', 'warning');
    } else {
      await db.collection(PRODUCTS_COLLECTION).add(product);
      showStatus('Product saved successfully!', 'success');
    }
    
    // Close modal and refresh
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

// Edit product
async function editProduct(id) {
  try {
    currentEditId = id;
    
    // Load product data
    const doc = await db.collection(PRODUCTS_COLLECTION).doc(id).get();
    const product = doc.data();
    
    // Fill form
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
    
    // Set duty dropdown
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
    
    // Add event listeners for live calculations
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
    
    // Calculate preview
    calculateEditPreview();
    
    // Open modal
    openModal('editModal');
    
  } catch (error) {
    console.error("Error loading product for edit:", error);
    showStatus('Error loading product', 'error');
  }
}

// Calculate preview for edit
function calculateEditPreview() {
  // Get values
  const cost = parseFloat(document.getElementById('editCost').value) || 0;
  const shipping = parseFloat(document.getElementById('editShipping').value) || 0;
  const declared = parseFloat(document.getElementById('editDeclared').value) || (cost + shipping);
  const rate = parseFloat(document.getElementById('editRate').value) || 2;
  const vatRate = parseFloat(document.getElementById('editVat').value) || 17.5;
  const markup = parseFloat(document.getElementById('editMarkup').value) || 30;
  const carrier = parseFloat(document.getElementById('editCarrier').value) || 0;
  const handling = parseFloat(document.getElementById('editHandling').value) || 0;
  const quantity = parseInt(document.getElementById('editQuantity').value) || 1;
  
  // Update declared field if empty
  if (!document.getElementById('editDeclared').value) {
    document.getElementById('editDeclared').value = (cost + shipping).toFixed(2);
  }
  
  // Get duty rate
  let dutyRate = 0;
  if (choicesInstances.editDutySelect) {
    const dutySelect = choicesInstances.editDutySelect.getValue();
    if (dutySelect && dutySelect.value === 'other') {
      dutyRate = parseFloat(document.getElementById('editOtherDuty').value) || 0;
    } else if (dutySelect && dutySelect.value) {
      dutyRate = parseFloat(dutySelect.value) || 0;
    }
  }
  
  // Calculate CIF
  const cifUSD = declared;
  const cifBBD = cifUSD * rate;
  
  // Calculate duty (only if CIF > $30)
  let dutyAmount = 0;
  if (cifUSD > 30) {
    dutyAmount = cifBBD * (dutyRate / 100);
  }
  
  // Calculate VAT on customs (only if CIF > $30)
  let vatAmount = 0;
  if (cifUSD > 30) {
    vatAmount = (cifBBD + dutyAmount) * (vatRate / 100);
  }
  
  // Calculate landed cost
  const landedCost = cifBBD + dutyAmount + vatAmount + carrier + handling;
  
  // Calculate selling price
  const sellingPrice = landedCost * (1 + (markup / 100));
  
  // Calculate VAT on selling (if applicable)
  const vatApply = cifUSD > 30 ? 'Yes' : 'No';
  const finalVatAmount = vatApply === 'Yes' ? sellingPrice * 0.175 : 0;
  const finalPrice = sellingPrice + finalVatAmount;
  
  // Calculate profit and margin
  const profit = finalPrice - landedCost;
  const margin = landedCost > 0 ? (profit / landedCost) * 100 : 0;
  
  // Update preview
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

// Save edited product
async function saveEdit() {
  const saveBtn = document.querySelector('#editModal .modal-actions .btn.primary');
  const originalText = saveBtn.innerHTML;
  setButtonLoading(saveBtn, true);
  
  try {
    if (!currentEditId) return;
    
    // Get values
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
    
    // Validate required fields
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
    
    // Get duty
    let duty = 0;
    if (choicesInstances.editDutySelect) {
      const dutySelect = choicesInstances.editDutySelect.getValue();
      if (dutySelect && dutySelect.value === 'other') {
        duty = parseFloat(document.getElementById('editOtherDuty').value) || 0;
      } else if (dutySelect && dutySelect.value) {
        duty = parseFloat(dutySelect.value) || 0;
      }
    }
    
    // Determine VAT apply
    const cifUSD = declared;
    const vatApply = cifUSD > 30 ? 'Yes' : 'No';
    
    // Update product
    const updateData = {
      item,
      quantity,
      link: link || '',
      cost,
      shipping,
      declared,
      rate,
      markup,
      vat,
      duty,
      carrier,
      handling,
      vatApply,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
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

// Delete product
async function deleteProduct(id) {
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

// Add new duty category
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
      label,
      rate,
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

// Open add duty modal
function openAddDutyModal() {
  document.getElementById('newDutyLabel').value = '';
  document.getElementById('newDutyRate').value = '';
  openModal('addDutyModal');
}

// Add loading state to buttons
function setButtonLoading(button, isLoading) {
  if (isLoading) {
    button.disabled = true;
    button.innerHTML = '<span class="loading"></span> Saving...';
  } else {
    button.disabled = false;
  }
}

// Open/close modal functions
function openModal(modalId) {
  document.getElementById(modalId).style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
  document.body.style.overflow = 'auto';
  
  // Remove event listeners to prevent memory leaks
  if (modalId === 'newModal') {
    const calcFields = ['newCost', 'newShipping', 'newDeclared', 'newRate', 'newVat', 'newMarkup', 'newCarrier', 'newHandling', 'newQuantity'];
    calcFields.forEach(fieldId => {
      document.getElementById(fieldId).removeEventListener('input', calculateNewPreview);
    });
    document.getElementById('newDutySelect').removeEventListener('change', calculateNewPreview);
    document.getElementById('newOtherDuty').removeEventListener('input', calculateNewPreview);
  } else if (modalId === 'editModal') {
    const calcFields = ['editCost', 'editShipping', 'editDeclared', 'editRate', 'editVat', 'editMarkup', 'editCarrier', 'editHandling', 'editQuantity'];
    calcFields.forEach(fieldId => {
      document.getElementById(fieldId).removeEventListener('input', calculateEditPreview);
    });
    document.getElementById('editDutySelect').removeEventListener('change', calculateEditPreview);
    document.getElementById('editOtherDuty').removeEventListener('input', calculateEditPreview);
  }
}

// Refresh data
function refreshData() {
  loadProducts();
}

// Show status message
function showStatus(message, type) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = 'status ' + type;
  
  // Clear previous timeout
  if (window.statusTimeout) {
    clearTimeout(window.statusTimeout);
  }
  
  window.statusTimeout = setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className = 'status';
  }, 5000);
}

// Initialize modals
function initializeModals() {
  // Close modal when clicking outside
  window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
      closeModal(event.target.id);
    }
  };
  
  // Close modal with Escape key
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
      const modals = document.querySelectorAll('.modal[style*="display: flex"]');
      modals.forEach(modal => {
        closeModal(modal.id);
      });
    }
  });
}

// Check mobile and show/hide FAB
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

// Listen for online/offline events
window.addEventListener('online', function() {
  showStatus('Back online! Syncing data...', 'success');
  isOfflineMode = false;
  refreshData();
  loadDutyCategories();
});

window.addEventListener('offline', function() {
  showStatus('You are offline. Working in offline mode.', 'warning');
  isOfflineMode = true;
});

// Listen for resize events
window.addEventListener('resize', checkMobile);
