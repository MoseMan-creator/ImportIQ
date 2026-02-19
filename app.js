// Global variables
let currentEditId = null;
let dutyCategories = [];
let choicesInstances = {};

// Initialize app when DOM loads
document.addEventListener('DOMContentLoaded', function() {
  // Check auth state
  firebase.auth().onAuthStateChanged(function(user) {
    if (user) {
      showAppSection();
      loadDutyCategories();
      loadProducts();
    } else {
      showAuthSection();
    }
  });
});

// Authentication functions
function showSignup() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  firebase.auth().createUserWithEmailAndPassword(email, password)
    .then(() => {
      showStatus('Account created!', 'success');
    })
    .catch((error) => {
      showStatus(error.message, 'error');
    });
}

function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  firebase.auth().signInWithEmailAndPassword(email, password)
    .catch((error) => {
      showStatus(error.message, 'error');
    });
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
}

// Load duty categories from Firestore
async function loadDutyCategories() {
  try {
    const snapshot = await db.collection(DUTY_COLLECTION).orderBy('label').get();
    dutyCategories = [];
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
  }
}

// Add loading states
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
    
    const snapshot = await db.collection(PRODUCTS_COLLECTION)
      .where('userId', '==', user.uid)
      .orderBy('createdAt', 'desc')
      .get();
    
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
    showStatus('Error loading products', 'error');
    
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

// Add loading state to buttons
function setButtonLoading(button, isLoading) {
  if (isLoading) {
    button.disabled = true;
    button.innerHTML = '<span class="loading"></span> Loading...';
  } else {
    button.disabled = false;
    button.innerHTML = button.getAttribute('data-original-text');
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
        shouldSort: false
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
      });
    }
  });
}

// Load products from Firestore
async function loadProducts() {
  try {
    const user = firebase.auth().currentUser;
    if (!user) return;
    
    const snapshot = await db.collection(PRODUCTS_COLLECTION)
      .where('userId', '==', user.uid)
      .orderBy('createdAt', 'desc')
      .get();
    
    const tbody = document.querySelector('#productTable tbody');
    tbody.innerHTML = '';
    
    snapshot.forEach(doc => {
      const product = doc.data();
      const row = createProductRow(doc.id, product);
      tbody.appendChild(row);
    });
    
    showStatus(`Loaded ${snapshot.size} products`, 'success');
  } catch (error) {
    console.error("Error loading products:", error);
    showStatus('Error loading products', 'error');
  }
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
    `<a href="${product.link || '#'}" target="_blank">Link</a>`,
    `$${parseFloat(product.cost || 0).toFixed(2)}`,
    `$${parseFloat(product.shipping || 0).toFixed(2)}`,
    `${dutyPercent}%`,
    `${vatPercent}%`,
    `BBD $${parseFloat(product.handling || 0).toFixed(2)}`,
    `$${parseFloat(product.declared || cifUSD).toFixed(2)}`,
    parseFloat(product.rate || 2).toFixed(2),
    `BBD $${landedCost.toFixed(2)}`,
    `BBD $${parseFloat(product.carrier || 0).toFixed(2)}`,
    `${markupPercent}%`,
    `BBD $${sellingPrice.toFixed(2)}`,
    `BBD $${profit.toFixed(2)}`,
    `${margin.toFixed(1)}%`,
    product.vatApply || 'Auto',
    `BBD $${finalVatAmount.toFixed(2)}`,
    `BBD $${finalPrice.toFixed(2)}`,
    `BBD $${(finalPrice * (product.quantity || 1)).toFixed(2)}`,
    `<button class="btn small" onclick="editProduct('${id}')">Edit</button>
     <button class="btn small secondary" onclick="deleteProduct('${id}')">Delete</button>`
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
  
  // Open modal
  openModal('newModal');
  
  // Add event listeners for live calculations
  const calcFields = ['newCost', 'newShipping', 'newDeclared', 'newRate', 'newVat', 'newMarkup', 'newCarrier', 'newHandling'];
  calcFields.forEach(fieldId => {
    document.getElementById(fieldId).addEventListener('input', calculateNewPreview);
  });
  
  document.getElementById('newDutySelect').addEventListener('change', calculateNewPreview);
  document.getElementById('newOtherDuty').addEventListener('input', calculateNewPreview);
  
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
  
  // Get duty rate
  let dutyRate = 0;
  const dutySelect = choicesInstances.newDutySelect.getValue();
  if (dutySelect.value === 'other') {
    dutyRate = parseFloat(document.getElementById('newOtherDuty').value) || 0;
  } else {
    dutyRate = parseFloat(dutySelect.value) || 0;
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
  try {
    const user = firebase.auth().currentUser;
    if (!user) {
      showStatus('Please login first', 'error');
      return;
    }
    
    // Get values
    const item = document.getElementById('newItem').value.trim();
    const quantity = parseInt(document.getElementById('newQuantity').value);
    const link = document.getElementById('newLink').value.trim();
    const cost = parseFloat(document.getElementById('newCost').value);
    const shipping = parseFloat(document.getElementById('newShipping').value);
    const declared = parseFloat(document.getElementById('newDeclared').value) || (cost + shipping);
    const rate = parseFloat(document.getElementById('newRate').value);
    const markup = parseFloat(document.getElementById('newMarkup').value);
    const vat = parseFloat(document.getElementById('newVat').value);
    const carrier = parseFloat(document.getElementById('newCarrier').value) || 0;
    const handling = parseFloat(document.getElementById('newHandling').value) || 0;
    
    // Get duty
    const dutySelect = choicesInstances.newDutySelect.getValue();
    let duty = 0;
    if (dutySelect.value === 'other') {
      duty = parseFloat(document.getElementById('newOtherDuty').value) || 0;
    } else {
      duty = parseFloat(dutySelect.value) || 0;
    }
    
    // Determine VAT apply
    const cifUSD = declared;
    const vatApply = cifUSD > 30 ? 'Yes' : 'No';
    
    // Validate required fields
    if (!item || isNaN(cost) || isNaN(rate)) {
      showStatus('Please fill in required fields (Item, Cost, Rate)', 'error');
      return;
    }
    
    // Create product object
    const product = {
      item,
      quantity: quantity || 1,
      link,
      cost,
      shipping: shipping || 0,
      declared,
      rate,
      markup: markup || 0,
      vat: vat || 17.5,
      duty,
      carrier: carrier || 0,
      handling: handling || 0,
      vatApply,
      userId: user.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Save to Firestore
    await db.collection(PRODUCTS_COLLECTION).add(product);
    
    // Close modal and refresh
    closeModal('newModal');
    showStatus('Product saved successfully!', 'success');
    refreshData();
    
  } catch (error) {
    console.error("Error saving product:", error);
    showStatus('Error saving product: ' + error.message, 'error');
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
      const dutyCategory = dutyCategories.find(d => d.rate === dutyValue);
      if (dutyCategory) {
        choicesInstances.editDutySelect.setChoiceByValue(dutyValue.toString());
      } else {
        choicesInstances.editDutySelect.setChoiceByValue('other');
        document.getElementById('editOtherDutyGroup').style.display = 'block';
        document.getElementById('editOtherDuty').disabled = false;
        document.getElementById('editOtherDuty').value = dutyValue;
      }
    }
    
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
  // Similar to calculateNewPreview but for edit form
  // Implementation omitted for brevity - same logic as calculateNewPreview
}

// Save edited product
async function saveEdit() {
  try {
    if (!currentEditId) return;
    
    // Get values (similar to saveNew)
    const item = document.getElementById('editItem').value.trim();
    const quantity = parseInt(document.getElementById('editQuantity').value);
    const link = document.getElementById('editLink').value.trim();
    const cost = parseFloat(document.getElementById('editCost').value);
    const shipping = parseFloat(document.getElementById('editShipping').value);
    const declared = parseFloat(document.getElementById('editDeclared').value) || (cost + shipping);
    const rate = parseFloat(document.getElementById('editRate').value);
    const markup = parseFloat(document.getElementById('editMarkup').value);
    const vat = parseFloat(document.getElementById('editVat').value);
    const carrier = parseFloat(document.getElementById('editCarrier').value) || 0;
    const handling = parseFloat(document.getElementById('editHandling').value) || 0;
    
    // Get duty
    const dutySelect = choicesInstances.editDutySelect.getValue();
    let duty = 0;
    if (dutySelect.value === 'other') {
      duty = parseFloat(document.getElementById('editOtherDuty').value) || 0;
    } else {
      duty = parseFloat(dutySelect.value) || 0;
    }
    
    // Determine VAT apply
    const cifUSD = declared;
    const vatApply = cifUSD > 30 ? 'Yes' : 'No';
    
    // Update product
    const updateData = {
      item,
      quantity: quantity || 1,
      link,
      cost,
      shipping: shipping || 0,
      declared,
      rate,
      markup: markup || 0,
      vat: vat || 17.5,
      duty,
      carrier: carrier || 0,
      handling: handling || 0,
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
  try {
    const label = document.getElementById('newDutyLabel').value.trim();
    const rate = parseFloat(document.getElementById('newDutyRate').value);
    
    if (!label || isNaN(rate)) {
      showStatus('Please enter both name and rate', 'error');
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
    loadDutyCategories();
    
  } catch (error) {
    console.error("Error saving duty:", error);
    showStatus('Error saving duty category', 'error');
  }
}

// Open/close modal functions
function openModal(modalId) {
  document.getElementById(modalId).style.display = 'flex';
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
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
  
  setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className = 'status';
  }, 3000);
}

// Initialize modals
function initializeModals() {
  // Close modal when clicking outside
  window.onclick = function(event) {
    if (event.target.className === 'modal') {
      event.target.style.display = 'none';
    }
  };
}

// Initialize when page loads
initializeModals();
