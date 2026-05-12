// =========================================================================
// SECTION 1: SHARED STATE & INITIALIZATION
// =========================================================================

// Safe data loading with try-catch
function loadData(key, fallback) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : fallback;
    } catch (e) {
        console.error(`Error loading ${key} from LocalStorage:`, e);
        return fallback;
    }
}

function saveData(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        console.log(`Saved ${key} to LocalStorage:`, data);
    } catch (e) {
        console.error(`Error saving ${key} to LocalStorage:`, e);
        alert("Warning: LocalStorage failed. Your changes might not be saved if you refresh.");
    }
}

// Load databases (or set defaults if empty)
let masterProducts = loadData('factoryProducts', ["LATEX", "NITRILE", "VINYL"]);
let orderQueue = loadData('factoryOrders', []);
let activityQueue = loadData('factoryActivities', []); // New: Non-production activity storage
window.lastGeneratedSchedules = loadData('lastGeneratedSchedules', null);

// Load Line Specific Settings (Default 48000 capacity)
const allLines = Array.from({length: 105}, (_, i) => `Line ${i + 1}`);
let lineSettings = loadData('lineSettings', allLines.reduce((acc, line) => {
    acc[line] = { capacity: 48000 };
    return acc;
}, {}));

// Define default tiers for normalization
window.DEFAULT_TIERS_STATE = { LB: '?', LT: '?', RB: '?', RT: '?' };
const DEFAULT_TIERS_STATE = window.DEFAULT_TIERS_STATE;

// Load MATRICES
let MATRICES = loadData('factoryMatrices', {
    former: [0, 600, 1080, 1440, 1800], 
    formerSpecific: {}, 
    productChange: {
        "LATEX":   { "NITRILE": 120, "VINYL": 90 },
        "NITRILE": { "LATEX": 150,   "VINYL": 60 },
        "VINYL":   { "LATEX": 90,    "NITRILE": 60 }
    },
    defaultProductChange: 180
});

// Plant to Lines mapping
const PLANTS = {
    "Plant 1": Array.from({length: 12}, (_, i) => `Line ${i + 1}`),
    "Plant 2": Array.from({length: 12}, (_, i) => `Line ${i + 13}`),
    "Plant 3": Array.from({length: 12}, (_, i) => `Line ${i + 25}`),
    "Plant 4": Array.from({length: 12}, (_, i) => `Line ${i + 37}`),
    "Plant 5": Array.from({length: 12}, (_, i) => `Line ${i + 49}`),
    "Plant 6": Array.from({length: 12}, (_, i) => `Line ${i + 61}`),
    "Plant 7": Array.from({length: 10}, (_, i) => `Line ${i + 73}`),
    "Plant 8": [...Array.from({length: 10}, (_, i) => `Line ${i + 83}`), 'Line 105'],
    "Plant 9": Array.from({length: 12}, (_, i) => `Line ${i + 93}`)
};

// Safe ID generator (crypto.randomUUID might be undefined in some iframe contexts)
window.cancelOptimization = false;

window.showLoading = function(message, progressPercentage = null) {
    let overlay = document.getElementById('globalLoadingOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'globalLoadingOverlay';
        overlay.className = 'fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[9999] flex flex-col items-center justify-center transition-opacity duration-300';
        overlay.innerHTML = `
            <div class="bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center max-w-sm w-full mx-4 border border-slate-100 relative">
                <div class="w-12 h-12 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                <h3 id="globalLoadingMessage" class="text-lg font-bold text-slate-800 mb-2 text-center">Loading...</h3>
                <div id="globalLoadingProgressWrap" class="w-full hidden mt-2">
                    <div class="h-2 bg-slate-100 rounded-full overflow-hidden w-full relative">
                        <div id="globalLoadingProgressBar" class="absolute top-0 left-0 h-full bg-indigo-600 transition-all duration-300" style="width: 0%"></div>
                    </div>
                    <div id="globalLoadingProgressText" class="text-xs text-slate-500 font-medium mt-2 text-center">0%</div>
                </div>
                <button onclick="window.emergencyClearData()" class="mt-6 text-xs text-red-500 hover:text-red-700 underline hidden" id="emergencyClearBtn">Taking too long? Click here to stop and clear queue.</button>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    
    // reset optimization flag
    window.cancelOptimization = false;
    
    document.getElementById('globalLoadingMessage').innerHTML = message;
    
    const wrap = document.getElementById('globalLoadingProgressWrap');
    const bar = document.getElementById('globalLoadingProgressBar');
    const txt = document.getElementById('globalLoadingProgressText');
    const emergencyBtn = document.getElementById('emergencyClearBtn');
    
    if (progressPercentage !== null && progressPercentage >= 0) {
        wrap.classList.remove('hidden');
        bar.style.width = `${progressPercentage}%`;
        txt.textContent = `${Math.round(progressPercentage)}%`;
        emergencyBtn.classList.remove('hidden');
    } else {
        wrap.classList.add('hidden');
        emergencyBtn.classList.add('hidden');
    }
    
    overlay.classList.remove('hidden');
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'auto';
};

window.emergencyClearData = function() {
    if(confirm("This will stop the current process, delete ALL orders in the queue, and refresh the page. Are you sure?")) {
        window.cancelOptimization = true;
        localStorage.removeItem('factoryOrders');
        window.location.reload();
    }
};

window.hideLoading = function() {
    const overlay = document.getElementById('globalLoadingOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.pointerEvents = 'none';
        setTimeout(() => overlay.classList.add('hidden'), 300);
    }
};

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// --- UI CONFIRMATION SYSTEM ---
function showConfirmation(title, message, onConfirm) {
    const existing = document.getElementById('app-confirmation-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'app-confirmation-modal';
    modal.className = "fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm";
    
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-sm w-full overflow-hidden transform transition-all scale-100 border border-gray-100">
            <div class="p-6">
                <div class="h-12 w-12 bg-red-50 rounded-full flex items-center justify-center mb-4">
                    <svg class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h3 class="text-lg font-bold text-gray-900 leading-tight mb-2">${title}</h3>
                <p class="text-sm text-gray-500">${message}</p>
            </div>
            <div class="bg-gray-50 px-6 py-4 flex flex-row-reverse gap-3">
                <button id="modal-confirm-btn" class="inline-flex justify-center items-center rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-500 uppercase tracking-tighter">
                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                    Proceed
                </button>
                <button id="modal-cancel-btn" class="inline-flex justify-center items-center rounded-md bg-white px-4 py-2 text-sm font-bold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 uppercase tracking-tighter">
                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    Cancel
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('modal-confirm-btn').addEventListener('click', () => {
        onConfirm();
        modal.remove();
    });

    document.getElementById('modal-cancel-btn').addEventListener('click', () => {
        modal.remove();
    });
}
function showNotification(title, message, type = 'error') {
    const existing = document.getElementById('app-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'app-notification';
    notification.className = `fixed top-5 right-5 z-[9999] max-w-sm w-full bg-white rounded-lg shadow-2xl border-l-4 p-4 transform transition-all duration-300 translate-x-full ${
        type === 'error' ? 'border-red-500' : 'border-indigo-500'
    }`;
    
    notification.innerHTML = `
        <div class="flex items-start">
            <div class="flex-shrink-0">
                ${type === 'error' ? 
                    `<svg class="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>` :
                    `<svg class="h-6 w-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`
                }
            </div>
            <div class="ml-3 pr-8">
                <p class="text-sm font-bold text-gray-900">${title}</p>
                <p class="mt-1 text-xs text-gray-500">${message}</p>
            </div>
            <div class="absolute top-2 right-2 flex">
                <button onclick="this.parentElement.parentElement.parentElement.remove()" class="text-gray-400 hover:text-gray-500 focus:outline-none">
                    <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(notification);
    
    // Trigger animation
    setTimeout(() => {
        notification.classList.remove('translate-x-full');
    }, 10);

    // Auto remove
    setTimeout(() => {
        notification.classList.add('translate-x-full');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("App Initialized. Orders:", orderQueue.length);

    // --- SHARED UI LOGIC ---
    const productDropdown = document.getElementById('productType');
    const activityProductDropdown = document.getElementById('activityProduct');
    if (productDropdown) {
        productDropdown.innerHTML = ''; // Clear defaults
        masterProducts.forEach(product => {
            const option = document.createElement('option');
            option.value = product;
            option.textContent = product;
            productDropdown.appendChild(option);
        });
    }
    
    if (activityProductDropdown) {
        activityProductDropdown.innerHTML = '<option value="KEEP">-- Keep Current Product --</option><option value="">-- No Product (Empty Line) --</option>';
        masterProducts.forEach(product => {
            const option = document.createElement('option');
            option.value = product;
            option.textContent = product;
            activityProductDropdown.appendChild(option);
        });
    }

    const plantSelect = document.getElementById('plantSelect');
    if (plantSelect) {
        plantSelect.innerHTML = '';
        Object.keys(PLANTS).forEach(plant => {
            const opt = document.createElement('option');
            opt.value = plant;
            opt.textContent = plant;
            plantSelect.appendChild(opt);
        });
        plantSelect.addEventListener('change', renderSchedule);
    }

    const targetConstraintContainer = document.getElementById('targetConstraintContainer');
    if (targetConstraintContainer) {
         targetConstraintContainer.innerHTML = '';
         
         // "Any" Option
         targetConstraintContainer.innerHTML += `
            <div class="flex items-center p-1 hover:bg-slate-50">
                <input type="checkbox" value="" id="tc_any" class="tc-item h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" checked>
                <label for="tc_any" class="ml-2 block text-sm font-bold text-gray-900 cursor-pointer">Any (Auto-Optimize)</label>
            </div>
         `;

         Object.keys(PLANTS).forEach(plant => {
            const groupDiv = document.createElement('div');
            groupDiv.className = "mt-2 pt-2 border-t border-gray-100";
            
            groupDiv.innerHTML += `
               <div class="flex items-center p-1 hover:bg-slate-50 mb-1">
                   <input type="checkbox" value="${plant}" id="tc_${plant.replace(/\s+/g, '')}" class="tc-item h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500">
                   <label for="tc_${plant.replace(/\s+/g, '')}" class="ml-2 block text-[11px] font-black text-indigo-900 cursor-pointer uppercase tracking-wider">${plant} (ALL LINES)</label>
               </div>
            `;

            const linesGrid = document.createElement('div');
            linesGrid.className = "grid grid-cols-2 gap-1 pl-6";
            PLANTS[plant].forEach(line => {
                const lineIdClean = line.replace(/\s+/g, '');
                linesGrid.innerHTML += `
                    <div class="flex items-center p-1 hover:bg-slate-50">
                        <input type="checkbox" value="${line}" id="tc_${lineIdClean}" class="tc-item h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500">
                        <label for="tc_${lineIdClean}" class="ml-2 block text-xs font-medium text-gray-700 cursor-pointer">${line}</label>
                    </div>
                `;
            });
            groupDiv.appendChild(linesGrid);
            targetConstraintContainer.appendChild(groupDiv);
         });

         // Add listener to uncheck "Any" if others are checked and handle parent/child selections
         targetConstraintContainer.addEventListener('change', (e) => {
             if (e.target.classList.contains('tc-item')) {
                 const val = e.target.value;
                 const isChecked = e.target.checked;
                 
                 if (val === "") {
                     if (isChecked) {
                         document.querySelectorAll('.tc-item').forEach(cb => { if (cb.value !== "") cb.checked = false; });
                     }
                 } else {
                     if (isChecked) document.getElementById('tc_any').checked = false;
                     
                     if (PLANTS[val]) {
                         // A plant checkbox was clicked
                         PLANTS[val].forEach(line => {
                             const lineCb = document.getElementById('tc_' + line.replace(/\s+/g, ''));
                             if (lineCb) lineCb.checked = isChecked;
                         });
                     } else {
                         // A line checkbox was clicked, check parent plant
                         let parentPlant = null;
                         Object.keys(PLANTS).forEach(plant => {
                             if (PLANTS[plant].includes(val)) parentPlant = plant;
                         });
                         
                         if (parentPlant) {
                             const plantCb = document.getElementById('tc_' + parentPlant.replace(/\s+/g, ''));
                             if (plantCb) {
                                 const allChecked = PLANTS[parentPlant].every(line => {
                                     const lineCb = document.getElementById('tc_' + line.replace(/\s+/g, ''));
                                     return lineCb && lineCb.checked;
                                 });
                                 plantCb.checked = allChecked;
                             }
                         }
                     }
                 }
             }
         });
    }

    const enforceCompletionDate = document.getElementById('enforceCompletionDate');
    const targetCompletionDate = document.getElementById('targetCompletionDate');
    if (enforceCompletionDate && targetCompletionDate) {
        enforceCompletionDate.addEventListener('change', (e) => {
            targetCompletionDate.disabled = !e.target.checked;
            if (e.target.checked && !targetCompletionDate.value) {
                // Set default to tomorrow
                let dt = new Date();
                dt.setDate(dt.getDate() + 1);
                dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
                targetCompletionDate.value = dt.toISOString().slice(0,16);
            }
        });
    }

    // Populate Activity Line Select
    const activityLine = document.getElementById('activityLine');
    if (activityLine) {
        activityLine.innerHTML = '';
        allLines.forEach(line => {
            const opt = document.createElement('option');
            opt.value = line;
            opt.textContent = line;
            activityLine.appendChild(opt);
        });
    }

    // --- ACTIVITY FORM ACTION ---
    const activityForm = document.getElementById('activityForm');
    if (activityForm) {
        activityForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const actProduct = document.getElementById('activityProduct').value;
            const actLB = document.getElementById('activityTierLB').value;
            const actLT = document.getElementById('activityTierLT').value;
            const actRB = document.getElementById('activityTierRB').value;
            const actRT = document.getElementById('activityTierRT').value;
            
            let hasTiers = actLB !== 'KEEP' || actLT !== 'KEEP' || actRB !== 'KEEP' || actRT !== 'KEEP';

            const newActivity = {
                id: generateId(),
                type: 'activity',
                activityType: document.getElementById('activityType').value,
                line: document.getElementById('activityLine').value,
                start: document.getElementById('activityStart').value,
                end: document.getElementById('activityEnd').value,
                entryTime: new Date().toISOString(),
                product: actProduct !== 'KEEP' ? (actProduct || null) : undefined,
                tiers: hasTiers ? { 
                    LB: actLB !== 'KEEP' ? actLB : undefined,
                    LT: actLT !== 'KEEP' ? actLT : undefined,
                    RB: actRB !== 'KEEP' ? actRB : undefined,
                    RT: actRT !== 'KEEP' ? actRT : undefined
                } : undefined
            };
            
            activityQueue.push(newActivity);
            saveData('factoryActivities', activityQueue);
            triggerScheduleRefresh();
            this.reset();
            showNotification("Activity Blocked", `Timeslot reserved for ${newActivity.activityType} on ${newActivity.line}`, "success");
        });
    }

    // --- DASHBOARD ACTIONS ---
    document.getElementById('clearDataBtn')?.addEventListener('click', clearData);
    document.getElementById('exportCsvBtn')?.addEventListener('click', exportQueueToCSV);
    document.getElementById('exportMasterCsvBtn')?.addEventListener('click', window.exportMasterScheduleToCSV);

    const orderForm = document.getElementById('orderForm');
    if (orderForm) {
        orderForm.addEventListener('submit', function(event) {
            event.preventDefault();
            const editId = orderForm.dataset.editId;
            
            const targetItems = document.querySelectorAll('.tc-item');
            const rawTargets = Array.from(targetItems).filter(cb => cb.checked).map(cb => cb.value).filter(v => v !== "");
            
            const enforceCompletionDate = document.getElementById('enforceCompletionDate')?.checked || false;
            const targetCompletionDate = document.getElementById('targetCompletionDate')?.value || null;
            const orderNumber = document.getElementById('orderNumber').value;
            const product = document.getElementById('productType').value;
            const entryTime = editId ? (orderQueue.find(o => o.id === editId)?.entryTime || new Date().toISOString()) : new Date().toISOString();

            const rows = document.querySelectorAll('.size-qty-row');
            
            if (editId) {
                // If in edit mode, only save the first row because edit mode only applies to a single order entry.
                const size = rows[0].querySelector('.targetSize').value;
                const qtyStr = rows[0].querySelector('.orderQuantity').value.replace(/,/g, '');
                const newOrder = {
                    id: editId,
                    orderNumber: orderNumber,
                    product: product,
                    size: size,
                    quantity: parseInt(qtyStr),
                    targetConstraint: rawTargets,
                    enforceCompletionDate: enforceCompletionDate,
                    targetCompletionDate: targetCompletionDate,
                    entryTime: entryTime
                };
                const index = orderQueue.findIndex(o => o.id === editId);
                if (index !== -1) orderQueue[index] = newOrder;
                
                delete orderForm.dataset.editId;
                const submitBtn = orderForm.querySelector('button[type="submit"]');
                if(submitBtn) { 
                    submitBtn.textContent = 'Add to Schedule'; 
                    submitBtn.className = "w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors";
                }
                
                // Show add button again
                const addSizeRowBtn = document.getElementById('addSizeRowBtn');
                if (addSizeRowBtn) addSizeRowBtn.classList.remove('hidden');
            } else {
                // In add mode, create an order item for each size-qty row
                rows.forEach(row => {
                    const size = row.querySelector('.targetSize').value;
                    const qtyStr = row.querySelector('.orderQuantity').value.replace(/,/g, '');
                    const newOrder = {
                        id: generateId(), // unique ID for each split size
                        orderNumber: orderNumber,
                        product: product,
                        size: size,
                        quantity: parseInt(qtyStr),
                        targetConstraint: rawTargets,
                        enforceCompletionDate: enforceCompletionDate,
                        targetCompletionDate: targetCompletionDate,
                        entryTime: entryTime
                    };
                    orderQueue.push(newOrder);
                });
            }
            
            saveData('factoryOrders', orderQueue);
            triggerScheduleRefresh();
            this.reset();
            
            // Clean up extra rows
            const allRows = document.querySelectorAll('.size-qty-row');
            for(let i = 1; i < allRows.length; i++) {
                allRows[i].remove();
            }
            document.querySelectorAll('.remove-size-btn').forEach(b => b.classList.add('hidden'));
            document.querySelector('.orderQuantity').value = '500,000'; 
        });
    }

    window.handleExcelUpload = function(event) {
        const file = event.target.files[0];
        if (!file) return;

        window.showLoading("Uploading Excel...", -1);

        // Yield to let UI update
        setTimeout(() => {
            const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                
                if (json.length === 0) {
                    showNotification("Import Error", "Excel file is empty or cannot be parsed.");
                    window.hideLoading();
                    event.target.value = '';
                    return;
                }

                let importCount = 0;
                const nowTime = new Date().toISOString();
                
                json.forEach(row => {
                    let getVal = (possibleKeys) => {
                        for (let k of possibleKeys) {
                            for (let rk in row) {
                                if (rk.trim().toLowerCase() === k.toLowerCase()) {
                                    return row[rk];
                                }
                            }
                        }
                        return null;
                    };

                    const orderNumber = getVal(['Sales Order', 'Customer PO NO', 'Order Number', 'Order', 'OrderNo', 'Order No']) || ('Import-' + Math.floor(Math.random() * 10000));
                    const product = getVal(['Product code', 'Glove code', 'Product', 'Code', 'Product Code', 'Product Identification']);
                    const size = getVal(['Size Ratio', 'Size', 'Target Size', 'Sizes']);
                    const quantityRaw = getVal(['Glove Pieces', 'Total In Pieces', 'Quantity', 'Qty', 'Pieces']);
                    
                    if (!product || !size || !quantityRaw) return; 
                    
                    const quantity = parseInt(String(quantityRaw).replace(/,/g, ''), 10);
                    if (isNaN(quantity) || quantity <= 0) return;

                    const targetDateRaw = getVal(['Planned Completion date', 'Target Date', 'Target Completion Date', 'Deadline']);
                    
                    const enforceTargetRaw = getVal(['Enforce Target', 'Enforce Completion Date', 'Strict Deadline', 'Enforce']);
                    // Automatically enforce completion date if a planned target is provided in the upload
                    let enforceCompletionDate = !!targetDateRaw;
                    if (enforceTargetRaw !== null) {
                        const strVal = String(enforceTargetRaw).toLowerCase();
                        enforceCompletionDate = strVal === 'yes' || strVal === 'true' || strVal === '1';
                    }
                    
                    let targetCompletionDate = null;
                    if (targetDateRaw) {
                        if (typeof targetDateRaw === 'number') {
                            let d = new Date((targetDateRaw - (25567 + 2))*86400*1000);
                            targetCompletionDate = d.toISOString().slice(0,16); 
                        } else {
                            let strDate = String(targetDateRaw).trim();
                            // Look for DD/MM/YYYY or DD-MM-YYYY format specifically
                            const ukDateMatch = strDate.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
                            if (ukDateMatch) {
                                let parsed = new Date(`${ukDateMatch[3]}-${ukDateMatch[2].padStart(2, '0')}-${ukDateMatch[1].padStart(2, '0')}T00:00:00`);
                                if (!isNaN(parsed)) targetCompletionDate = parsed.toISOString().slice(0,16);
                            } else {
                                let parsed = new Date(strDate);
                                if (!isNaN(parsed)) {
                                    targetCompletionDate = parsed.toISOString().slice(0,16);
                                }
                            }
                        }
                    }

                    const constraintRaw = getVal(['Target Constraint', 'Target Line Affinity', 'Line Affinity', 'Constraint', 'Target Line']);
                    let targetConstraint = [];
                    if (constraintRaw) {
                        targetConstraint = String(constraintRaw).split(',').map(s => s.trim()).filter(Boolean);
                    }

                    // Strict product check
                    let productCode = String(product).trim();
                    if (productCode && !masterProducts.includes(productCode)) {
                        masterProducts.push(productCode);
                        saveData('factoryProducts', masterProducts);
                        // Update UI dropdowns if they exist
                        const productDropdown = document.getElementById('productType');
                        const activityProductDropdown = document.getElementById('activityProduct');
                        const initialStateProduct = document.getElementById('initialStateProduct');
                        [productDropdown, activityProductDropdown, initialStateProduct].forEach(dd => {
                            if (dd) {
                                const option = document.createElement('option');
                                option.value = productCode;
                                option.textContent = productCode;
                                dd.appendChild(option);
                            }
                        });
                    }

                    const newOrder = {
                        id: generateId(),
                        orderNumber: String(orderNumber).trim(),
                        product: productCode,
                        size: String(size).trim(),
                        quantity: quantity,
                        targetConstraint: targetConstraint,
                        enforceCompletionDate: enforceCompletionDate,
                        targetCompletionDate: targetCompletionDate,
                        entryTime: nowTime
                    };

                    orderQueue.push(newOrder);
                    importCount++;
                });

                if (importCount > 0) {
                    saveData('factoryOrders', orderQueue);
                    triggerScheduleRefresh();
                    window.hideLoading();
                    showNotification("Import Successful", `Successfully imported ${importCount} order(s) from Excel.`, "success");
                } else {
                    window.hideLoading();
                    showNotification("Import Failed", "No valid rows found. Please ensure 'Product code', 'Size Ratio', and 'Glove Pieces' (or 'Quantity') columns exist.");
                }

            } catch (error) {
                console.error(error);
                window.hideLoading();
                showNotification("Import Error", "An error occurred while parsing the Excel file.");
            }
            
            event.target.value = '';
        };

        reader.readAsArrayBuffer(file);
        }, 50);
    };

    // --- SETTINGS (MASTER DATA) ACTIONS ---
    if (document.getElementById('productListUI')) {
        renderSettingsList();
    }

    const gloveCodeForm = document.getElementById('gloveCodeForm');
    if (gloveCodeForm) {
        gloveCodeForm.addEventListener('submit', function(event) {
            event.preventDefault();
            const mat = document.getElementById('selMaterial').value;
            const type = document.getElementById('selType').value;
            const proc = document.getElementById('selProcess').value;
            const weight = document.getElementById('selWeight').value;
            const len = document.getElementById('selLength').value;
            const col = document.getElementById('selColor').value;
            const spec = document.getElementById('selSpecialty').value;

            if (!/^[0-9]{3}$/.test(weight)) {
                alert("Weight must be exactly 3 digits.");
                return;
            }

            const newProductCode = [mat, type, proc, weight, len, col, spec].join('-');

            if (!masterProducts.includes(newProductCode)) {
                masterProducts.push(newProductCode);
                saveData('factoryProducts', masterProducts);
                document.getElementById('selWeight').value = '';
                renderSettingsList(); 
                updatePreview(); 
            } else {
                showNotification("Code Already Exists", `The product code [${newProductCode}] is already in the master list.`);
            }
        });

        document.querySelectorAll('.code-input').forEach(input => {
            input.addEventListener('input', updatePreview);
            input.addEventListener('change', updatePreview);
        });
    }

    // --- MATRICES ACTIONS ---
    if (document.getElementById('matricesForm')) {
        renderMatrices();
        document.getElementById('saveFormerBtn')?.addEventListener('click', saveFormerChanges);
        document.getElementById('addSpecificFormerBtn')?.addEventListener('click', addSpecificFormerRule);
        document.getElementById('saveDefaultChangeBtn')?.addEventListener('click', saveDefaultChange);
        document.getElementById('addChangeRuleBtn')?.addEventListener('click', addProductChangeRule);
    }

    // Initial Dashboard Render
    if (document.getElementById('scheduleOutput')) {
        renderSchedule();
    }
});


// =========================================================================
// SECTION 2: DASHBOARD FUNCTIONS (Global for onclick)
// =========================================================================

window.deleteOrder = function(id) {
    showConfirmation(
        "Confirm Deletion", 
        "Are you sure you want to remove this order from the production schedule? This action cannot be undone.", 
        () => {
            let targetIds = [id];
            if (id.includes('_comb_')) targetIds = id.split('_comb_');
            
            orderQueue = orderQueue.filter(o => !targetIds.includes(o.id));
            saveData('factoryOrders', orderQueue);
            triggerScheduleRefresh();
            showNotification("Order Deleted", "The order has been successfully deleted.");
        }
    );
};

window.editOrder = function(id) {
    const order = orderQueue.find(o => o.id === id);
    if (!order) return;

    document.getElementById('orderNumber').value = order.orderNumber;
    document.getElementById('productType').value = order.product;
    
    // Clean up extra rows if currently showing multiple
    const allRows = document.querySelectorAll('.size-qty-row');
    for(let i = 1; i < allRows.length; i++) {
        allRows[i].remove();
    }
    document.querySelectorAll('.remove-size-btn').forEach(b => b.classList.add('hidden'));

    const firstRow = document.querySelector('.size-qty-row');
    firstRow.querySelector('.targetSize').value = order.size;
    firstRow.querySelector('.orderQuantity').value = order.quantity.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    
    // Hide add button in edit mode
    const addSizeRowBtn = document.getElementById('addSizeRowBtn');
    if (addSizeRowBtn) addSizeRowBtn.classList.add('hidden');
    
    if (document.getElementById('enforceCompletionDate')) document.getElementById('enforceCompletionDate').checked = order.enforceCompletionDate || false;
    if (document.getElementById('targetCompletionDate')) {
        document.getElementById('targetCompletionDate').value = order.targetCompletionDate || '';
        document.getElementById('targetCompletionDate').disabled = !(order.enforceCompletionDate || false);
    }
    
    const targetItems = document.querySelectorAll('.tc-item');
    if (targetItems.length > 0) {
        let hasSelection = false;
        targetItems.forEach(cb => {
            if (cb.value !== "") {
                const isSelected = Array.isArray(order.targetConstraint) ? order.targetConstraint.includes(cb.value) : cb.value === order.targetConstraint;
                cb.checked = isSelected;
                if (isSelected) hasSelection = true;
            }
        });
        document.getElementById('tc_any').checked = !hasSelection;
    }

    const form = document.getElementById('orderForm');
    form.dataset.editId = id;
    const submitBtn = form.querySelector('button[type="submit"]');
    if(submitBtn) { 
       submitBtn.textContent = 'Save Changes'; 
       submitBtn.className = "w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition-colors";
    }
    form.scrollIntoView({ behavior: 'smooth' });
};

function clearData() {
    showConfirmation(
        "Wipe Schedule Data", 
        "Are you sure you want to delete ALL active production orders? This will reset the factory schedule completely.", 
        () => {
            orderQueue = [];
            activityQueue = [];
            saveData('factoryOrders', []);
            saveData('factoryActivities', []);
            triggerScheduleRefresh();
            showNotification("Data Wiped", "All schedule data has been cleared.");
        }
    );
}


// =========================================================================
// SECTION 3: MASTER DATA FUNCTIONS (Global for onclick)
// =========================================================================

function renderSettingsList() {
    const listUI = document.getElementById('productListUI');
    if (!listUI) return; 

    listUI.innerHTML = '';
    masterProducts.forEach((product, index) => {
        const li = document.createElement('li');
        li.className = "flex justify-between items-center p-4 bg-white border border-gray-200 rounded-lg shadow-sm font-mono text-gray-800";
        li.innerHTML = `
            <span>${product}</span> 
            <button class="flex items-center px-3 py-1 text-[10px] font-bold uppercase text-red-600 bg-red-50 hover:bg-red-100 rounded transition-colors" onclick="deleteProduct(${index})">
                <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                Delete
            </button>
        `;
        listUI.appendChild(li);
    });
}

window.deleteProduct = function(index) {
    const product = masterProducts[index];
    showConfirmation(
        "Delete Product", 
        `Delete [${product}] from the master product database? This will not affect existing scheduled orders.`, 
        () => {
            masterProducts.splice(index, 1);
            saveData('factoryProducts', masterProducts);
            renderSettingsList(); 
            showNotification("Product Deleted", "The glove code has been removed from master list.");
        }
    );
};

function updatePreview() {
    const previewSpan = document.getElementById('codePreview');
    if (!previewSpan) return;
    const mat = document.getElementById('selMaterial').value || "XX";
    const type = document.getElementById('selType').value || "XX";
    const proc = document.getElementById('selProcess').value || "XXXX";
    const weight = document.getElementById('selWeight').value || "000";
    const len = document.getElementById('selLength').value || "XX";
    const col = document.getElementById('selColor').value || "XXXX";
    const spec = document.getElementById('selSpecialty').value || "XXXX";
    previewSpan.textContent = [mat, type, proc, weight, len, col, spec].join('-');
}


// =========================================================================
// SECTION 4: MATRICES FUNCTIONS
// =========================================================================

function renderMatrices() {
    const formerContainer = document.getElementById('formerChangeList');
    if (formerContainer) {
        formerContainer.innerHTML = '';
        MATRICES.former.forEach((val, idx) => {
            formerContainer.innerHTML += `
                <div class="flex items-center space-x-4 mb-3">
                    <label class="w-32 text-sm font-medium text-gray-700">${idx} Tier(s) Swapped:</label>
                    <input type="number" id="fVal${idx}" value="${val}" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                    <span class="text-sm text-gray-500">mins</span>
                </div>
            `;
        });
    }

    const specificFormerContainer = document.getElementById('specificFormerList');
    if (specificFormerContainer) {
        specificFormerContainer.innerHTML = '';
        const customKeys = Object.keys(MATRICES.formerSpecific || {});
        if (customKeys.length === 0) {
            specificFormerContainer.innerHTML = '<p class="text-sm text-gray-500 italic">No custom tier swaps defined.</p>';
        } else {
            customKeys.forEach(combination => {
                const time = MATRICES.formerSpecific[combination];
                specificFormerContainer.innerHTML += `
                    <div class="flex items-center space-x-4 mb-3 bg-gray-50 p-3 rounded border border-gray-200">
                        <span class="text-sm font-medium text-gray-700 w-32 tracking-wider">${combination}</span>
                        <input type="number" class="w-24 px-3 py-1 border border-gray-300 rounded-md text-sm" value="${time}" data-key="${combination}" onchange="updateSpecificFormer(this)">
                        <span class="text-sm text-gray-500">mins</span>
                        <button type="button" class="text-red-500 hover:text-red-700 ml-auto px-2 font-bold" onclick="deleteSpecificFormer('${combination}')">&times;</button>
                    </div>
                `;
            });
        }
    }

    const productChangeContainer = document.getElementById('productChangeList');
    if (productChangeContainer) {
        productChangeContainer.innerHTML = '';
        let rulesHtml = '';
        Object.keys(MATRICES.productChange || {}).forEach(fromProd => {
            Object.keys(MATRICES.productChange[fromProd]).forEach(toProd => {
                const time = MATRICES.productChange[fromProd][toProd];
                rulesHtml += `
                    <div class="flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-6 mb-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <div class="flex-1 min-w-0">
                            <div class="text-[10px] text-slate-400 font-bold uppercase mb-1">From Product</div>
                            <div class="text-xs font-mono text-slate-700 break-all leading-relaxed" title="${fromProd}">${fromProd}</div>
                        </div>
                        <div class="text-slate-300 hidden sm:block">&rarr;</div>
                        <div class="flex-1 min-w-0">
                            <div class="text-[10px] text-slate-400 font-bold uppercase mb-1">To Product</div>
                            <div class="text-xs font-mono text-slate-700 break-all leading-relaxed" title="${toProd}">${toProd}</div>
                        </div>
                        <div class="flex items-center space-x-3 bg-slate-50 px-4 py-2 rounded-lg">
                            <input type="number" class="w-20 bg-transparent border-none text-right text-sm font-bold text-indigo-600 focus:ring-0 p-0" value="${time}" data-from="${fromProd}" data-to="${toProd}" onchange="updateProductChangeTime(this)">
                            <span class="text-[10px] font-black text-slate-400 uppercase">Mins</span>
                        </div>
                        <button type="button" class="text-red-400 hover:text-red-600 transition-colors px-2" onclick="deleteProductChangeRule('${fromProd}', '${toProd}')">
                            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                `;
            });
        });
        productChangeContainer.innerHTML = rulesHtml || '<p class="text-sm text-gray-500 italic">No specific rules defined.</p>';
    }

    const defaultChangeInput = document.getElementById('defaultChangeInput');
    if (defaultChangeInput) defaultChangeInput.value = MATRICES.defaultProductChange || 180;

    const fromSelect = document.getElementById('newFromProduct');
    const toSelect = document.getElementById('newToProduct');
    if (fromSelect && toSelect) {
        fromSelect.innerHTML = ''; toSelect.innerHTML = '';
        masterProducts.forEach(p => { fromSelect.add(new Option(p, p)); toSelect.add(new Option(p, p)); });
    }
}

window.triggerScheduleRefresh = function() {
    window.lastGeneratedSchedules = null;
    saveData('lastGeneratedSchedules', null);
    if (typeof window.renderSchedule === 'function') window.renderSchedule();
    if (typeof window.renderFullSchedule === 'function') window.renderFullSchedule();
}

function saveFormerChanges() {
    const newFormer = [];
    for(let i=0; i<5; i++) {
        const el = document.getElementById(`fVal${i}`);
        newFormer.push(parseInt(el?.value) || 0);
    }
    MATRICES.former = newFormer;
    saveMatrices();
    triggerScheduleRefresh();
    alert('Former change rules saved!');
}

function addSpecificFormerRule() {
    const checkboxes = document.querySelectorAll('.tc-checkbox');
    let selected = []; checkboxes.forEach(cb => { if (cb.checked) selected.push(cb.value); });
    if (selected.length === 0) return alert("Select at least one tier.");
    selected.sort();
    const key = selected.join(",");

    if (MATRICES.formerSpecific && MATRICES.formerSpecific[key] !== undefined) {
        showNotification("Ruleset Already Exists", `A specific setup time for tiers [${key}] is already defined.`);
        return;
    }

    const timeVal = parseInt(document.getElementById('newSpecificFormerTime').value) || 0;
    if (!MATRICES.formerSpecific) MATRICES.formerSpecific = {};
    MATRICES.formerSpecific[key] = timeVal;
    saveMatrices(); renderMatrices(); triggerScheduleRefresh();
    checkboxes.forEach(cb => cb.checked = false);
}

window.deleteSpecificFormer = function(key) {
    if (MATRICES.formerSpecific && MATRICES.formerSpecific[key] !== undefined) {
        delete MATRICES.formerSpecific[key];
        saveMatrices(); renderMatrices(); triggerScheduleRefresh();
    }
};

window.updateSpecificFormer = function(inputEl) {
    const key = inputEl.getAttribute('data-key');
    const val = parseInt(inputEl.value) || 0;
    MATRICES.formerSpecific[key] = val;
    saveMatrices(); triggerScheduleRefresh();
};

function saveDefaultChange() {
    const el = document.getElementById('defaultChangeInput');
    if(el) { MATRICES.defaultProductChange = parseInt(el.value) || 180; saveMatrices(); triggerScheduleRefresh(); alert('Default change time saved!'); }
}

function addProductChangeRule() {
    const fromVal = document.getElementById('newFromProduct').value;
    const toVal = document.getElementById('newToProduct').value;
    const timeVal = parseInt(document.getElementById('newChangeTime').value) || 0;
    if (fromVal === toVal) return alert('Same product transition not allowed');
    
    if (MATRICES.productChange[fromVal] && MATRICES.productChange[fromVal][toVal] !== undefined) {
        showNotification("Rule Already Exists", `The transition ${fromVal} -> ${toVal} is already defined.`);
        return;
    }

    showConfirmation(
        "Confirm Transition Rule",
        `Do you want to register a ${timeVal} minute downtime penalty for switching from [${fromVal}] to [${toVal}]?`,
        () => {
            if (!MATRICES.productChange[fromVal]) MATRICES.productChange[fromVal] = {};
            MATRICES.productChange[fromVal][toVal] = timeVal;
            saveMatrices(); 
            renderMatrices(); triggerScheduleRefresh();
            showNotification("Rule Registered", "The product transition mapping has been updated.", "success");
        }
    );
}

window.updateProductChangeTime = function(inputEl) {
    const fromP = inputEl.getAttribute('data-from');
    const toP = inputEl.getAttribute('data-to');
    MATRICES.productChange[fromP][toP] = parseInt(inputEl.value) || 0;
    saveMatrices(); triggerScheduleRefresh();
};

window.deleteProductChangeRule = function(fromP, toP) {
    showConfirmation(
        "Delete Mapping",
        `Are you sure you want to remove the transition rule for ${fromP} -> ${toP}?`,
        () => {
            if (MATRICES.productChange[fromP]) {
                delete MATRICES.productChange[fromP][toP];
                saveMatrices(); 
                renderMatrices(); triggerScheduleRefresh();
                showNotification("Rule Deleted", "Transition rule removed successfully.");
            }
        }
    );
};

function saveMatrices() { saveData('factoryMatrices', MATRICES); }


// =========================================================================
// SECTION 5: SCHEDULING HEURISTIC ENGINE
// =========================================================================

function findBestTierConfiguration(prevState, orderSize, orderQuantity, newProduct, lineId, order = null) {
    const TIERS = ['LB', 'LT', 'RB', 'RT'];
    // Merge previous state with defaults to ensure all 4 tiers are accounted for
    const currentTiers = { ...DEFAULT_TIERS_STATE, ...(prevState?.tiers || {}) };
    
    // 1. Calculate Product Changeover Penalty
    let productPenalty = 0;
    if (prevState && prevState.product && prevState.product !== newProduct) {
        productPenalty = MATRICES.productChange[prevState.product]?.[newProduct] ?? MATRICES.defaultProductChange;
    }

    // 2. STRICT RULE: Every order MUST configure all 4 tiers to the target size,
    // UNLESS the user has set manual overrides.
    // We calculate how many tiers must physically be swapped to reach the target configuration.
    let actuallyChanged = [];
    let proposedTiers = { ...DEFAULT_TIERS_STATE };
    let activeCount = 0;
    
    TIERS.forEach(tier => {
        if (order && order.manualTiers && order.manualTiers[tier] && order.manualTiers[tier] !== '?') {
            proposedTiers[tier] = order.manualTiers[tier];
        } else {
            proposedTiers[tier] = orderSize;
        }

        if (currentTiers[tier] !== proposedTiers[tier] && currentTiers[tier] !== '?') {
            actuallyChanged.push(tier);
        }
        
        if (proposedTiers[tier] === orderSize) {
            activeCount++;
        }
    });

    // 3. Calculate Former Changeover Penalty
    actuallyChanged.sort();
    const specificKey = actuallyChanged.join(",");
    let formerPenalty = 0;
    
    if (actuallyChanged.length > 0) {
        if (MATRICES.formerSpecific && MATRICES.formerSpecific[specificKey] !== undefined) {
            formerPenalty = MATRICES.formerSpecific[specificKey];
        } else {
            // Index 0=0, 1=600, 2=1080, 3=1440, 4=1800
            formerPenalty = MATRICES.former[actuallyChanged.length] || 0;
        }
    }
    
    // New Logic: If no previous state exists (first order on line), skip CF and CP activities
    if (!prevState || (order && order.ignoreSetup)) {
        productPenalty = 0;
        formerPenalty = 0;
    }

    // 4. Calculate Production Time using Dynamic Line Speed
    const lineSpeed = lineSettings[lineId]?.capacity || 48000;
    
    let productionTime = 0;
    let imbalancePenalty = 0;
    
    if (order && order.isCombined) {
        // Find how many tiers each combined order has, and determine max production time
        let maxProdTime = 0;
        
        order.combinedOrders.forEach(o => {
            let oTiers = TIERS.filter(t => proposedTiers[t] === o.size).length;
            let oRatio = oTiers > 0 ? (oTiers / 4) : 0;
            if (oRatio === 0) {
                maxProdTime = Infinity;
            } else {
                let prodTime = (o.quantity / (lineSpeed * oRatio)) * 60;
                if (prodTime > maxProdTime) maxProdTime = prodTime;
            }
        });
        
        if (maxProdTime !== Infinity) {
            order.combinedOrders.forEach(o => {
                let oTiers = TIERS.filter(t => proposedTiers[t] === o.size).length;
                let oRatio = oTiers > 0 ? (oTiers / 4) : 1;
                let prodTime = (o.quantity / (lineSpeed * oRatio)) * 60;
                imbalancePenalty += (maxProdTime - prodTime);
            });
        }
        
        productionTime = maxProdTime;
    } else {
        const activeRatio = activeCount > 0 ? (activeCount / 4) : 1; 
        productionTime = (orderQuantity / (lineSpeed * activeRatio)) * 60; // in minutes
    }

    const setupTime = Math.max(productPenalty, formerPenalty);
    const totalCost = setupTime + productionTime;

    return {
        productPenalty,
        formerPenalty,
        setupTime,
        productionTime,
        totalCost,
        imbalancePenalty,
        changedTiers: actuallyChanged,
        activeCount: activeCount, 
        newTiersState: proposedTiers,
        lineSpeedUsed: lineSpeed
    };
}

window.deleteActivity = function(id) {
    activityQueue = activityQueue.filter(a => a.id !== id);
    saveData('factoryActivities', activityQueue);
    triggerScheduleRefresh();
};

window.removeSetup = function(orderId) {
    let order = orderQueue.find(o => o.id === orderId);
    if (order) {
        order.ignoreSetup = true;
        saveData('factoryOrders', orderQueue);
        renderSchedule();
        showNotification("Setup Ignored", "Changeover penalties removed for this order.");
    }
};

window.toggleLock = function(id, lineId) {
    let targetOrders = [];
    if (id.includes('_comb_')) {
        const parts = id.split('_comb_');
        // Find all parts in the queue
        parts.forEach(partId => {
            let found = orderQueue.find(o => o.id === partId);
            if (found) targetOrders.push(found);
        });
    } else {
        const o = orderQueue.find(o => o.id === id);
        if (o) targetOrders.push(o);
    }
    
    // If the order is part of a combined slot, grab all sibling orders
    if (window.lastGeneratedSchedules && window.lastGeneratedSchedules[lineId]) {
        let placedData = window.lastGeneratedSchedules[lineId].find(item => item.id === id || (item.combinedOrders && item.combinedOrders.some(sub => sub.id === id)));
        if (placedData && placedData.isCombined) {
            targetOrders = placedData.combinedOrders.map(sub => orderQueue.find(o => o.id === sub.id)).filter(Boolean);
        }
    }

    if (targetOrders.length === 0) return;
    
    // We base the toggle on the first target order's current lock status
    const isCurrentlyLocked = targetOrders[0].isLocked;
    
    if (isCurrentlyLocked) {
        if (window.lastGeneratedSchedules && window.lastGeneratedSchedules[lineId]) {
            let placedData = window.lastGeneratedSchedules[lineId].find(item => item.id === id || (item.combinedOrders && item.combinedOrders.some(sub => sub.id === id)));
            if (placedData) {
                const idx = window.lastGeneratedSchedules[lineId].indexOf(placedData);
                const lockedSuccessors = window.lastGeneratedSchedules[lineId].slice(idx + 1).filter(item => {
                    if (item.isInitialState || item.activityType) return false;
                    if (item.isCombined) {
                        return item.combinedOrders.some(sub => {
                            const qo = orderQueue.find(o => o.id === sub.id);
                            return qo && qo.isLocked;
                        });
                    } else {
                        const qo = orderQueue.find(o => o.id === item.id);
                        return qo && qo.isLocked;
                    }
                });

                if (lockedSuccessors.length > 0) {
                    showNotification("Cannot Unlock", "Please unlock all subsequent locked orders on this line first.", "error");
                    return;
                }
            }
        }

        targetOrders.forEach(order => {
            order.isLocked = false;
            delete order.lockedLine;
            delete order.lockedStart;
            delete order.lockedEnd;
            delete order.lockedCostDetails;
            delete order.lockedSetupType;
            delete order.lockedSetupStart;
            delete order.lockedSetupDesc;
            delete order.lockedCombinedId;
        });
        showNotification("Order Unlocked", "The order is now free to move during optimization.");
    } else {
        if (window.lastGeneratedSchedules && window.lastGeneratedSchedules[lineId]) {
            let placedData = window.lastGeneratedSchedules[lineId].find(item => item.id === id || (item.combinedOrders && item.combinedOrders.some(sub => sub.id === id)));
            let setupData = window.lastGeneratedSchedules[lineId].find(item => item.activityType && (item.orderId === id || (placedData && item.orderId === placedData.id)));
            
            if (placedData) {
                const idx = window.lastGeneratedSchedules[lineId].indexOf(placedData);
                const unlockedPredecessors = window.lastGeneratedSchedules[lineId].slice(0, idx).filter(item => {
                    if (item.isInitialState || item.activityType || item.isFixed) return false;
                    if (item.isCombined) {
                        return item.combinedOrders.some(sub => {
                            const qo = orderQueue.find(o => o.id === sub.id);
                            return qo && !qo.isLocked;
                        });
                    } else {
                        const qo = orderQueue.find(o => o.id === item.id);
                        return qo && !qo.isLocked;
                    }
                });

                if (unlockedPredecessors.length > 0) {
                    showNotification("Cannot Lock", "Please lock all preceding orders on this line first.", "error");
                    return;
                }

                targetOrders.forEach(order => {
                    order.isLocked = true;
                    order.lockedLine = lineId;
                    order.lockedStart = placedData.startTime;
                    order.lockedEnd = placedData.endTime;
                    order.lockedCostDetails = placedData.costDetails;
                    if (placedData.isCombined) order.lockedCombinedId = placedData.id;
                    if (setupData) {
                        order.lockedSetupType = setupData.activityType;
                        order.lockedSetupStart = setupData.start;
                        order.lockedSetupDesc = setupData.description;
                    }
                });
                showNotification("Order Locked", "The order's line and schedule block have been pinned.");
            }
        }
    }
    saveData('factoryOrders', orderQueue);
    triggerScheduleRefresh();
};

async function optimizeScheduleData(rawOrders, rawActivities, progressCb) {
    const schedules = {}; 
    const lineTimeTrackers = {}; 
    const lineStates = {};
    
    // Load initial line states from local storage if available
    const initialLineStates = JSON.parse(localStorage.getItem('factoryInitialLineStates') || '{}');
    const schedulingBaseline = new Date(); // Current date as baseline

    allLines.forEach(line => { 
        schedules[line] = []; 
        lineTimeTrackers[line] = 0; 
        
        let initStateObj = initialLineStates[line];
        let hasTiers = initStateObj && initStateObj.tiers && Object.values(initStateObj.tiers).some(val => val && val !== '?');
        if (initStateObj && (initStateObj.product || hasTiers)) {
            lineStates[line] = {
                product: initStateObj.product || null,
                tiers: initStateObj.tiers || DEFAULT_TIERS_STATE
            };
            
            schedules[line].push({
                id: 'init_' + line,
                type: 'activity',
                activityType: 'Initial State',
                line: line,
                start: schedulingBaseline.toISOString(),
                end: schedulingBaseline.toISOString(),
                startTime: schedulingBaseline.toISOString(),
                endTime: schedulingBaseline.toISOString(),
                isFixed: true,
                isInitialState: true,
                description: `Product: ${initStateObj.product || 'None'} | Tiers: ${Object.entries(initStateObj.tiers || DEFAULT_TIERS_STATE).map(([t, s]) => t+':'+s).join(', ')}`,
                product: initStateObj.product || null,
                tiers: initStateObj.tiers || DEFAULT_TIERS_STATE
            });
        } else {
            lineStates[line] = null; 
        }
    });

    let pendingOrders = [];
    let combinedActivities = [];
    
    if (rawActivities) {
        combinedActivities.push(...rawActivities);
    }
    
    if (rawOrders) {
        let lockedGroups = {};

        rawOrders.forEach(order => {
            if (order.isLocked && order.lockedLine) {
                if (order.lockedCombinedId) {
                    if (!lockedGroups[order.lockedCombinedId]) lockedGroups[order.lockedCombinedId] = [];
                    lockedGroups[order.lockedCombinedId].push(order);
                } else {
                    combinedActivities.push({
                        ...order,
                        isFixed: true,
                        isLockedOrder: true,
                        start: order.lockedStart,
                        end: order.lockedEnd,
                        startTime: order.lockedStart,
                        endTime: order.lockedEnd,
                        line: order.lockedLine,
                        costDetails: order.lockedCostDetails
                    });
                    if (order.lockedSetupType) {
                        combinedActivities.push({
                            id: order.id + '_setup',
                            orderId: order.id,
                            type: 'activity',
                            activityType: order.lockedSetupType,
                            line: order.lockedLine,
                            start: order.lockedSetupStart,
                            end: order.lockedStart,
                            isFixed: true,
                            isLockedOrderSetup: true,
                            description: order.lockedSetupDesc
                        });
                    }
                }
            } else {
                pendingOrders.push(order);
            }
        });

        Object.keys(lockedGroups).forEach(combId => {
            const group = lockedGroups[combId];
            if (group.length > 1) {
                const baseOrder = group[0];
                const combinedSize = Array.from(new Set(group.map(o => o.size))).join('+');
                const totalQuantity = group.reduce((sum, o) => sum + o.quantity, 0);
                const combinedOrderNumber = group.map(o => o.orderNumber || '').join(' + ');
                
                combinedActivities.push({
                    ...baseOrder,
                    id: combId,
                    size: combinedSize,
                    quantity: totalQuantity,
                    isCombined: true,
                    combinedOrders: group,
                    orderNumber: combinedOrderNumber,
                    isFixed: true,
                    isLockedOrder: true,
                    isLocked: true,
                    start: baseOrder.lockedStart,
                    end: baseOrder.lockedEnd,
                    startTime: baseOrder.lockedStart,
                    endTime: baseOrder.lockedEnd,
                    line: baseOrder.lockedLine,
                    costDetails: baseOrder.lockedCostDetails
                });

                if (baseOrder.lockedSetupType) {
                    combinedActivities.push({
                        id: combId + '_setup',
                        orderId: combId,
                        type: 'activity',
                        activityType: baseOrder.lockedSetupType,
                        line: baseOrder.lockedLine,
                        start: baseOrder.lockedSetupStart,
                        end: baseOrder.lockedStart,
                        isFixed: true,
                        isLockedOrderSetup: true,
                        description: baseOrder.lockedSetupDesc
                    });
                }
            } else if (group.length === 1) {
                // If only 1 remains in the locked group, push it as a regular fixed order
                const baseOrder = group[0];
                combinedActivities.push({
                    ...baseOrder,
                    isFixed: true,
                    isLockedOrder: true,
                    isLocked: true,
                    start: baseOrder.lockedStart,
                    end: baseOrder.lockedEnd,
                    startTime: baseOrder.lockedStart,
                    endTime: baseOrder.lockedEnd,
                    line: baseOrder.lockedLine,
                    costDetails: baseOrder.lockedCostDetails
                });

                if (baseOrder.lockedSetupType) {
                    combinedActivities.push({
                        id: baseOrder.id + '_setup',
                        orderId: baseOrder.id,
                        type: 'activity',
                        activityType: baseOrder.lockedSetupType,
                        line: baseOrder.lockedLine,
                        start: baseOrder.lockedSetupStart,
                        end: baseOrder.lockedStart,
                        isFixed: true,
                        isLockedOrderSetup: true,
                        description: baseOrder.lockedSetupDesc
                    });
                }
            }
        });
    }

    let optimizedPending = [];
    pendingOrders.forEach(order => optimizedPending.push(order));
    pendingOrders = optimizedPending;

    // 1. Process Fixed Activities First
    if (combinedActivities.length > 0) {
        combinedActivities.forEach(act => {
            if (schedules[act.line]) {
                schedules[act.line].push({
                    ...act,
                    isFixed: true,
                    costDetails: act.costDetails || { setupTime: 0, totalCost: 0 } 
                });
            }
        });
        
        // Sort activities by start time for each line
        Object.keys(schedules).forEach(line => {
            schedules[line].sort((a, b) => {
                if (a.isInitialState && b.isInitialState) return 0;
                if (a.isInitialState) return -1;
                if (b.isInitialState) return 1;
                const startA = new Date(a.startTime || a.start).getTime();
                const startB = new Date(b.startTime || b.start).getTime();
                const timeDiff = startA - startB;
                if (timeDiff === 0) {
                    if (a.isLockedOrderSetup && !b.isLockedOrderSetup) return -1;
                    if (!a.isLockedOrderSetup && b.isLockedOrderSetup) return 1;
                }
                return timeDiff;
            });
            // Prime line states if a locked order explicitly sets product state
            for (let i = schedules[line].length - 1; i >= 0; i--) {
                const item = schedules[line][i];
                if (item.isLockedOrder) {
                    const tiersToUse = item.manualTiers || item.costDetails?.newTiersState;
                    if (tiersToUse && Object.keys(tiersToUse).length > 0) {
                        lineStates[line] = { product: item.product, tiers: tiersToUse };
                        break;
                    }
                }
            }
        });
    }
    
    if (pendingOrders.length === 0 && combinedActivities.length === 0) return schedules;

    // 2. Fit Orders around Activities

    const totalToSchedule = pendingOrders.length;
    let loops = 0;

    while (pendingOrders.length > 0) {
        if (window.cancelOptimization) {
            console.warn("Optimization aborted via emergency stop.");
            break;
        }

        if (progressCb && loops % 2 === 0) {
             const done = totalToSchedule - pendingOrders.length;
             progressCb((done / totalToSchedule) * 100);
             await new Promise(r => setTimeout(r, 0));
        }
        loops++;

        let globalBestCandidate = null;
        let globalBestLine = null;
        let globalLowestCostScore = Infinity;
        let globalBestCostDetails = null;
        let globalFinalStartTime = null;

        allLines.forEach(lineId => {
            const lineState = lineStates[lineId];
            let candidates = [];
            let suppressedIndices = new Set();
            
            // First identify orders allowed on this line
            let allowedOrders = [];
            for (let i = 0; i < pendingOrders.length; i++) {
                let order = pendingOrders[i];
                let oLines = allLines;
                if (order.targetConstraint) {
                    const c = Array.isArray(order.targetConstraint) ? order.targetConstraint : [order.targetConstraint];
                    if (c.length > 0 && c[0] !== "") {
                        oLines = [];
                        c.forEach(x => {
                            if (PLANTS[x]) { PLANTS[x].forEach(l => { if (!oLines.includes(l)) oLines.push(l); }); }
                            else if (allLines.includes(x)) { if (!oLines.includes(x)) oLines.push(x); }
                        });
                    }
                }
                if (oLines.includes(lineId)) allowedOrders.push({ order, idx: i });
            }

            // Group allowed orders by product and targetConstraint (to ensure compatible combinations)
            let groups = {};
            allowedOrders.forEach(ao => {
                const tcStr = JSON.stringify(Array.isArray(ao.order.targetConstraint) ? [...ao.order.targetConstraint].sort() : [(ao.order.targetConstraint || '')]);
                const key = ao.order.product + "||" + tcStr;
                if (!groups[key]) groups[key] = [];
                groups[key].push(ao);
            });

            // For each group, find combinations of 2, 3, or 4 distinct orders
            Object.values(groups).forEach(group => {
                const getSubsets = (arr) => {
                    let subs = [];
                    const dfs = (start, current) => {
                        if (current.length >= 2 && current.length <= 4) {
                            // Only allow distinct sizes within combination to minimize complexity
                            const uniqueSizes = new Set(current.map(x => x.order.size));
                            if (uniqueSizes.size === current.length) subs.push([...current]);
                        }
                        if (current.length === 4) return;
                        for (let i = start; i < arr.length; i++) dfs(i + 1, current.concat(arr[i]));
                    };
                    dfs(0, []);
                    return subs;
                };

                const subsets = getSubsets(group);
                
                subsets.forEach(sub => {
                    const hasSuppressed = sub.some(x => suppressedIndices.has(x.idx));
                    if (hasSuppressed) return;

                    let arr = sub.map(x => x.order);
                    let combinedSize = arr.map(o => o.size).join(' / ');
                    let totalQty = arr.reduce((sum, o) => sum + o.quantity, 0);
                    let ordNums = [...new Set(arr.filter(o => o.orderNumber).map(o => o.orderNumber))].join(' + ');
                    let combId = arr.map(o => o.id).join('_comb_');

                    // Provide possible tier distributions based on subset size
                    let distributes = [];
                    if (arr.length === 2) distributes = [[2,2], [3,1], [1,3]];
                    if (arr.length === 3) distributes = [[2,1,1], [1,2,1], [1,1,2]];
                    if (arr.length === 4) distributes = [[1,1,1,1]];

                    let bestCombinedCost = null;
                    let bestCombinedOrder = null;

                    distributes.forEach(dist => {
                        let assignedTiers = { LB: null, LT: null, RB: null, RT: null };
                        let counts = {};
                        for(let k=0; k<arr.length; k++) counts[arr[k].size] = dist[k];

                        // Smart distribute based on existing line state to minimize change
                        ['LB', 'LT', 'RB', 'RT'].forEach(t => {
                            let cs = lineState?.tiers?.[t];
                            if (cs && counts[cs] > 0) {
                                assignedTiers[t] = cs;
                                counts[cs]--;
                            }
                        });
                        ['LB', 'LT', 'RB', 'RT'].forEach(t => {
                            if (!assignedTiers[t]) {
                                let remainingSize = Object.keys(counts).find(s => counts[s] > 0);
                                assignedTiers[t] = remainingSize;
                                counts[remainingSize]--;
                            }
                        });

                        let combinedOrder = { 
                            ...arr[0], // inherit base info
                            size: combinedSize, 
                            quantity: totalQty, 
                            isCombined: true, 
                            combinedOrders: arr, 
                            id: combId, 
                            manualTiers: assignedTiers,
                            orderNumber: ordNums
                        };

                        let costB = findBestTierConfiguration(lineState, combinedSize, combinedOrder.quantity, combinedOrder.product, lineId, combinedOrder);
                        
                        let scoreB = costB ? costB.totalCost + (costB.imbalancePenalty || 0) * 100 : Infinity;
                        let bestScore = bestCombinedCost ? bestCombinedCost.totalCost + (bestCombinedCost.imbalancePenalty || 0) * 100 : Infinity;

                        if (costB && scoreB < bestScore) {
                            bestCombinedCost = costB;
                            bestCombinedOrder = combinedOrder;
                        }
                    });

                    // Evaluate sequential execution permutations
                    const permute = (arr) => {
                        if (arr.length <= 1) return [arr];
                        let res = [];
                        for (let i = 0; i < arr.length; i++) {
                            let rest = permute(arr.slice(0, i).concat(arr.slice(i + 1)));
                            rest.forEach(r => res.push([arr[i]].concat(r)));
                        }
                        return res;
                    };
                    let perms = permute(arr);
                    let minSequentialCost = Infinity;

                    perms.forEach(seq => {
                        let currentState = lineState ? { product: lineState.product, tiers: { ...lineState.tiers } } : null;
                        let totalCost = 0;
                        seq.forEach(o => {
                            let stepCost = findBestTierConfiguration(currentState, o.size, o.quantity, o.product, lineId, o);
                            if (stepCost) {
                                totalCost += stepCost.totalCost;
                                currentState = { product: o.product, tiers: stepCost.newTiersState };
                            } else {
                                totalCost += Infinity;
                            }
                        });
                        if (totalCost < minSequentialCost) minSequentialCost = totalCost;
                    });

                    let bestCombinedScore = bestCombinedCost ? bestCombinedCost.totalCost + (bestCombinedCost.imbalancePenalty || 0) * 100 : Infinity;
                    if (bestCombinedCost && bestCombinedScore <= minSequentialCost) {
                        candidates.push({ 
                            type: 'combined', 
                            indices: sub.map(x => x.idx), 
                            order: bestCombinedOrder, 
                            costDetails: bestCombinedCost 
                        });
                        // IMPORTANT: Suppress these individuals so they don't spawn solo candidates
                        sub.forEach(x => suppressedIndices.add(x.idx));
                    }
                });
            });

            // Suppress indices that were added to a combined candidate if that candidate ends up being the best globally?
            // Actually, currently `suppressedIndices` is populated immediately upon finding any combination that beats sequential.
            // But with many combinations competing, we shouldn't suppress them PRE-Maturely! Wait, the original code DID suppress them prematurely!
            // `candidates.push(...); suppressedIndices.add(i); suppressedIndices.add(j);`
            // Let's keep the original behavior: if we have a valid combination, we suppress the individuals so they don't get evaluated individually.
            // Wait, if we suppress individuals prematurely for EVERY subset, we might miss better subsets! 
            // Better behavior: evaluate everything, put all combinations and individuals into `candidates`, and see which has the absolute lowest cost score.
            // We just need to skip pushing individuals if they are already in the WINNING candidate.
            // But we evaluate candidates per line, and pick ONE global best candidate to act on, then re-run the loop!
            // Yes! This is greedy. Just push EVERYTHING into `candidates`, let the sorting pick the best.

            for (let i = 0; i < pendingOrders.length; i++) {
                if (!suppressedIndices.has(i)) {
                    let order = pendingOrders[i];
                    let oLines = allLines;
                    if (order.targetConstraint) {
                        const c = Array.isArray(order.targetConstraint) ? order.targetConstraint : [order.targetConstraint];
                        if (c.length > 0 && c[0] !== "") {
                            oLines = [];
                            c.forEach(x => {
                                if (PLANTS[x]) { PLANTS[x].forEach(l => { if (!oLines.includes(l)) oLines.push(l); }); }
                                else if (allLines.includes(x)) { if (!oLines.includes(x)) oLines.push(x); }
                            });
                        }
                    }
                    if (oLines.includes(lineId)) {
                        let cost = findBestTierConfiguration(lineState, order.size, order.quantity, order.product, lineId, order);
                        if (cost) candidates.push({ type: 'single', indices: [i], order: order, costDetails: cost });
                    }
                }
            }

            candidates.forEach(candidate => {
                const order = candidate.order;
                let cost = candidate.costDetails;
                
                let proposedStart = new Date(schedulingBaseline.getTime());
                const lineItems = schedules[lineId] || [];
                const fixedActs = lineItems.filter(item => item.isFixed).sort((a,b) => new Date(a.start) - new Date(b.start));
                
                const lastProd = lineItems.filter(item => !item.isFixed).pop();
                if (lastProd && lastProd.endTime) {
                    proposedStart = new Date(lastProd.endTime);
                }

                // 1. Determine effective state right before proposedStart
                let effectiveState = null;
                const pastItems = lineItems.filter(item => {
                    const itemEnd = item.isFixed ? new Date(item.end).getTime() : (item.endTime ? item.endTime.getTime() : 0);
                    return itemEnd <= proposedStart.getTime();
                }).sort((a,b) => {
                    const endA = a.isFixed ? new Date(a.end).getTime() : (a.endTime ? a.endTime.getTime() : 0);
                    const endB = b.isFixed ? new Date(b.end).getTime() : (b.endTime ? b.endTime.getTime() : 0);
                    return endA - endB;
                });
                
                pastItems.forEach(act => {
                    if (act.activityType && ['CF + CP', 'CF', 'CP', 'SETUP'].includes(act.activityType)) return;
                    
                    const actTiers = act.costDetails?.newTiersState || act.manualTiers || act.tiers;
                    if (act.product !== undefined || actTiers) {
                        effectiveState = {
                            product: act.product !== undefined ? act.product : (effectiveState?.product || null),
                            tiers: actTiers ? {
                                LB: actTiers.LB !== undefined ? actTiers.LB : (effectiveState?.tiers?.LB || DEFAULT_TIERS_STATE.LB),
                                LT: actTiers.LT !== undefined ? actTiers.LT : (effectiveState?.tiers?.LT || DEFAULT_TIERS_STATE.LT),
                                RB: actTiers.RB !== undefined ? actTiers.RB : (effectiveState?.tiers?.RB || DEFAULT_TIERS_STATE.RB),
                                RT: actTiers.RT !== undefined ? actTiers.RT : (effectiveState?.tiers?.RT || DEFAULT_TIERS_STATE.RT)
                            } : (effectiveState?.tiers || DEFAULT_TIERS_STATE)
                        };
                    }
                });

                cost = findBestTierConfiguration(effectiveState, order.size, order.quantity, order.product, lineId, order);
                if (!cost) return; // If cost is physically impossible

                let conflict = true;
                while (conflict) {
                    conflict = false;
                    const durationMins = cost.totalCost;
                    const proposedEnd = new Date(proposedStart.getTime() + durationMins * 60000);

                    for (const act of fixedActs) {
                        const actStart = new Date(act.start);
                        const actEnd = new Date(act.end);
                        if (proposedStart < actEnd && proposedEnd > actStart) {
                            proposedStart = new Date(actEnd.getTime());
                            
                            // If we advance past an activity, adopt its state (if it has one) and recompute cost!
                            if (act.product !== undefined || (act.tiers && Object.keys(act.tiers).length > 0)) {
                                effectiveState = { 
                                    product: act.product !== undefined ? act.product : (effectiveState ? effectiveState.product : null), 
                                    tiers: act.tiers ? {
                                        LB: act.tiers.LB !== undefined ? act.tiers.LB : (effectiveState ? effectiveState.tiers.LB : DEFAULT_TIERS_STATE.LB),
                                        LT: act.tiers.LT !== undefined ? act.tiers.LT : (effectiveState ? effectiveState.tiers.LT : DEFAULT_TIERS_STATE.LT),
                                        RB: act.tiers.RB !== undefined ? act.tiers.RB : (effectiveState ? effectiveState.tiers.RB : DEFAULT_TIERS_STATE.RB),
                                        RT: act.tiers.RT !== undefined ? act.tiers.RT : (effectiveState ? effectiveState.tiers.RT : DEFAULT_TIERS_STATE.RT)
                                    } : (effectiveState ? effectiveState.tiers : DEFAULT_TIERS_STATE) 
                                };
                                cost = findBestTierConfiguration(effectiveState, order.size, order.quantity, order.product, lineId, order);
                            }
                            
                            conflict = true;
                            break; 
                        }
                    }
                }

                const finishTime = new Date(proposedStart.getTime() + cost.totalCost * 60000);
                
                // Add extreme weights to ensure minimum setup times and proper tier utilization
                let evaluationScore = cost.setupTime * 1000000000; 
                evaluationScore += finishTime.getTime() / 1000000;
                evaluationScore += (cost.imbalancePenalty || 0) * 50000;

                if (order.enforceCompletionDate && order.targetCompletionDate) {
                    const targetTime = new Date(order.targetCompletionDate).getTime();
                    const slack = targetTime - finishTime.getTime();

                    // Rather than heavily penalizing (which pushes it to the back of the queue), 
                    // we heavily favor orders that are close to missing their deadline so they get scheduled NOW.
                    if (slack < 0) {
                        // Already late or will be late! Must pick immediately to minimize further delay.
                        evaluationScore -= 10000000000000;
                    } else if (slack < 3 * 24 * 3600 * 1000) {
                         // Getting close (less than 3 days slack). High priority.
                        evaluationScore -= 500000000000;
                    } else {
                        // Standard priority for having a target date.
                        evaluationScore -= 100000000000;
                    }

                    // Break ties by picking the order with the earliest target date
                    evaluationScore += (targetTime / 100000);
                }

                if (evaluationScore < globalLowestCostScore) {
                    globalLowestCostScore = evaluationScore;
                    globalBestCandidate = candidate;
                    globalBestLine = lineId;
                    globalBestCostDetails = cost;
                    globalFinalStartTime = proposedStart;
                }
            });
        });

        if (globalBestCandidate) {
            const order = globalBestCandidate.order;
            
            globalBestCandidate.indices.sort((a,b) => b-a).forEach(idx => {
                pendingOrders.splice(idx, 1);
            });
            
            const bestLine = globalBestLine;
            const bestCostDetails = globalBestCostDetails;
            let finalStartTime = globalFinalStartTime;
            
            // Split SETUP into its own entry if penalty exists
            if (bestCostDetails.setupTime > 0) {
                let actType = 'SETUP';
                let protocolDesc = '';
                if (bestCostDetails.formerPenalty > 0 && bestCostDetails.productPenalty > 0) {
                    actType = 'CF + CP';
                    protocolDesc = `Concurrent: ${bestCostDetails.formerPenalty}m Former Swap, ${bestCostDetails.productPenalty}m Chemical Flush`;
                } else if (bestCostDetails.formerPenalty > 0) {
                    actType = 'CF';
                    protocolDesc = `Change Former: ${bestCostDetails.formerPenalty}m Former Swap`;
                } else {
                    actType = 'CP';
                    protocolDesc = `Change Product: ${bestCostDetails.productPenalty}m Chemical Flush`;
                }

                const setupEnd = new Date(finalStartTime.getTime() + bestCostDetails.setupTime * 60000);
                schedules[bestLine].push({
                    id: generateId() + '_setup',
                    orderId: order.id,
                    type: 'activity',
                    activityType: actType,
                    line: bestLine,
                    start: finalStartTime.toISOString(),
                    end: setupEnd.toISOString(),
                    startTime: finalStartTime,
                    endTime: setupEnd,
                    isFixed: false,
                    costDetails: { setupTime: 0, totalCost: 0 },
                    description: protocolDesc
                });
                finalStartTime = setupEnd;
            }

            const finishTime = new Date(finalStartTime.getTime() + bestCostDetails.productionTime * 60000);
            schedules[bestLine].push({ 
                ...order, 
                costDetails: bestCostDetails,
                startTime: finalStartTime,
                endTime: finishTime
            });
            lineStates[bestLine] = { product: order.product, tiers: bestCostDetails.newTiersState };
            
            // Re-sort line to keep UI consistent (activities + orders in sequence)
            schedules[bestLine].sort((a, b) => {
                if (a.isInitialState && b.isInitialState) return 0;
                if (a.isInitialState) return -1;
                if (b.isInitialState) return 1;
                const startA = new Date(a.startTime || a.start).getTime();
                const startB = new Date(b.startTime || b.start).getTime();
                const timeDiff = startA - startB;
                if (timeDiff === 0) {
                    if (a.isLockedOrderSetup && !b.isLockedOrderSetup) return -1;
                    if (!a.isLockedOrderSetup && b.isLockedOrderSetup) return 1;
                }
                return timeDiff;
            });
        } else {
            console.error("Heuristic could not place remaining orders:", pendingOrders);
            break;
        }
    }
    // 3. Post-Process to remove obsolete fixed setups
    allLines.forEach(line => {
        let initStateObj = initialLineStates[line];
        let hasTiers = initStateObj && initStateObj.tiers && Object.values(initStateObj.tiers).some(val => val && val !== '?');
        let currentState = (initStateObj && (initStateObj.product || hasTiers)) ? 
            { product: initStateObj.product || null, tiers: initStateObj.tiers || DEFAULT_TIERS_STATE } : null;

        let toRemove = new Set();

        for (let i = 0; i < schedules[line].length; i++) {
            let item = schedules[line][i];

            if (item.type === 'activity' && item.isFixed && item.orderId) {
                let targetOrder = schedules[line].find(o => o.id === item.orderId || (o.combinedOrders && o.combinedOrders.some(sub => sub.id === item.orderId)));
                if (targetOrder) {
                    let cost = findBestTierConfiguration(currentState, targetOrder.size, targetOrder.quantity, targetOrder.product, line, targetOrder);
                    
                    if (cost && cost.setupTime === 0) {
                        toRemove.add(item.id);
                    } else if (cost && cost.setupTime > 0) {
                        let actType = 'SETUP';
                        let protocolDesc = '';
                        if (cost.formerPenalty > 0 && cost.productPenalty > 0) {
                            actType = 'CF + CP';
                            protocolDesc = `Concurrent: ${cost.formerPenalty}m Former Swap, ${cost.productPenalty}m Chemical Flush`;
                        } else if (cost.formerPenalty > 0) {
                            actType = 'CF';
                            protocolDesc = `Change Former: ${cost.formerPenalty}m Former Swap`;
                        } else {
                            actType = 'CP';
                            protocolDesc = `Change Product: ${cost.productPenalty}m Chemical Flush`;
                        }
                        item.activityType = actType;
                        item.description = protocolDesc;
                    }
                }
            } else if (item.activityType) {
                // If the activity specifies post-activity state, update our running state
                if (item.product !== undefined || (item.tiers && Object.keys(item.tiers).length > 0)) {
                    currentState = {
                        product: item.product !== undefined ? item.product : (currentState ? currentState.product : null),
                        tiers: item.tiers ? {
                            LB: item.tiers.LB !== undefined ? item.tiers.LB : (currentState ? currentState.tiers.LB : DEFAULT_TIERS_STATE.LB),
                            LT: item.tiers.LT !== undefined ? item.tiers.LT : (currentState ? currentState.tiers.LT : DEFAULT_TIERS_STATE.LT),
                            RB: item.tiers.RB !== undefined ? item.tiers.RB : (currentState ? currentState.tiers.RB : DEFAULT_TIERS_STATE.RB),
                            RT: item.tiers.RT !== undefined ? item.tiers.RT : (currentState ? currentState.tiers.RT : DEFAULT_TIERS_STATE.RT)
                        } : (currentState ? currentState.tiers : DEFAULT_TIERS_STATE)
                    };
                }
            } else {
                let cost = findBestTierConfiguration(currentState, item.size, item.quantity, item.product, line, item);
                if (cost) {
                    currentState = { product: item.product, tiers: cost.newTiersState };
                }
            }
        }

        schedules[line] = schedules[line].filter(item => !toRemove.has(item.id));
    });

    return schedules;
}


// =========================================================================
// SECTION 6: UI RENDERING
// =========================================================================

function formatDate(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return "Invalid Date";
    const pad = (n) => String(n).padStart(2, '0');
    return `${dateObj.getFullYear()}-${pad(dateObj.getMonth()+1)}-${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;
}

function formatCSVDate(date) {
    if (!date || isNaN(date.getTime())) return "";
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

window.triggerOptimization = function() {
    showConfirmation(
        "Run Optimization Engine?", 
        "This will re-calculate the entire factory schedule using the least-cost heuristic. For large order queues, this process may take several seconds and temporarily lock the browser.", 
        async () => {
            if (window.showLoading) window.showLoading("Optimizing Schedule...", 0);
            
            // Short delay to let the UI update the loading state
            setTimeout(async () => {
                try {
                    const optimizedSchedules = await optimizeScheduleData(orderQueue, activityQueue, (progress) => {
                        if (window.showLoading) window.showLoading("Optimizing Schedule...", progress);
                    });
                    
                    window.lastGeneratedSchedules = optimizedSchedules;
                    saveData('lastGeneratedSchedules', window.lastGeneratedSchedules);
                    
                    if (window.hideLoading) window.hideLoading();
                    
                    // Refresh current view
                    if (document.getElementById('scheduleOutput')) renderSchedule();
                    if (typeof renderFullSchedule === 'function') renderFullSchedule();
                    
                    showNotification("Optimization Complete", "The factory schedule has been successfully recalculated.", "success");
                } catch (err) {
                    console.error("Optimization Error:", err);
                    if (window.hideLoading) window.hideLoading();
                    showNotification("Optimization Failed", "An error occurred during the scheduling process.");
                }
            }, 100);
        }
    );
};

window.renderSchedule = async function() {
    const outputDiv = document.getElementById('scheduleOutput');
    const plantSelect = document.getElementById('plantSelect');
    if (!outputDiv || !plantSelect) return; 

    if (orderQueue.length === 0 && activityQueue.length === 0) {
        outputDiv.innerHTML = '<div class="text-slate-400 py-12 italic border-2 border-dashed border-slate-200 rounded-lg text-center bg-slate-50 flex flex-col items-center justify-center">No active orders or activities.</div>';
        if (window.hideLoading) window.hideLoading();
        return;
    }

    if (!window.lastGeneratedSchedules) {
        outputDiv.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 px-8 text-center">
                <div class="bg-indigo-50 p-6 rounded-full mb-6">
                    <svg class="w-12 h-12 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                </div>
                <h3 class="text-lg font-bold text-slate-800 mb-2">Schedule Not Optimized</h3>
                <p class="text-sm text-slate-500 max-w-sm mb-8">New orders have been added or the queue has changed. Please run the optimization engine to generate the best production plan.</p>
                <button onclick="window.triggerOptimization()" class="btn-primary">
                    <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                    Run Heuristic Optimizer
                </button>
            </div>
        `;
        return;
    }

    const displayLines = PLANTS[plantSelect.value] || [];
    const optimizedSchedules = window.lastGeneratedSchedules;

    let allItems = [];
    displayLines.forEach(lineId => {
        const lineItems = optimizedSchedules[lineId] || [];
        lineItems.forEach(item => {
            // Logic: Include CF/CP setups if the user wants visibility
            const isSetup = item.activityType && ['CF + CP', 'CF', 'CP', 'SETUP'].includes(item.activityType);
            const isNonProd = item.isFixed && !item.isLockedOrder && !item.isLockedOrderSetup && !item.isInitialState;
            const isOrder = (!item.activityType || item.orderNumber) && !isSetup;

            if (isNonProd || isOrder || isSetup) {
                if (item.isCombined && item.combinedOrders) {
                    item.combinedOrders.forEach(subOrder => {
                        allItems.push({ 
                            ...subOrder, 
                            displayLine: lineId,
                            startTime: item.startTime,
                            endTime: item.endTime,
                            isLocked: item.isLocked,
                            isCombinedPart: true,
                            parentCombined: item 
                        });
                    });
                } else {
                    allItems.push({ ...item, displayLine: lineId });
                }
            }
        });
    });

    // Sort by Entry Time
    allItems.sort((a, b) => {
        const entryA = a.entryTime ? new Date(a.entryTime).getTime() : 0;
        const entryB = b.entryTime ? new Date(b.entryTime).getTime() : 0;
        return entryA - entryB;
    });

    let tableHtml = `<div class="overflow-x-auto"><table class="min-w-full divide-y divide-slate-200 text-xs">
        <thead class="bg-slate-50">
            <tr>
                <th class="px-4 py-3 text-left font-bold text-slate-700 uppercase tracking-tighter">No</th>
                <th class="px-4 py-3 text-left font-bold text-slate-700 uppercase tracking-tighter">Job / Activity</th>
                <th class="px-4 py-3 text-center font-bold text-slate-700 uppercase tracking-tighter">Entry Time</th>
                <th class="px-4 py-3 text-left font-bold text-slate-700 uppercase tracking-tighter">Line</th>
                <th class="px-4 py-3 text-center font-bold text-slate-700 uppercase tracking-tighter">Start Time</th>
                <th class="px-4 py-3 text-center font-bold text-slate-700 uppercase tracking-tighter">End Time</th>
                <th class="px-4 py-3 text-left font-bold text-slate-700 uppercase tracking-tighter">Details</th>
                <th class="px-4 py-3 text-center font-bold text-slate-700 uppercase tracking-tighter">Actions</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 bg-white">`;

    let noCounter = 1;
    allItems.forEach(item => {
        const start = item.startTime ? new Date(item.startTime) : new Date(item.start);
        const end = item.endTime ? new Date(item.endTime) : new Date(item.end);
        const entry = item.entryTime ? new Date(item.entryTime) : null;
        const lineId = item.displayLine;
        
        const durationMins = Math.round((end - start) / 60000);
        let displayQuantity = item.quantity;
        if (!item.isCombined && (!item.isFixed || item.isLockedOrder)) {
            displayQuantity = item.quantity;
        }

        let isDelayed = false;
        let delayStr = "";
        if (item.enforceCompletionDate && item.targetCompletionDate) {
            const target = new Date(item.targetCompletionDate);
            if (end > target) {
                isDelayed = true;
                const delayMins = Math.round((end.getTime() - target.getTime()) / 60000);
                delayStr = delayMins >= 60 ? Math.floor(delayMins/60) + 'h ' + (delayMins%60) + 'm' : Math.max(0, delayMins) + 'm';
            }
        }

        let rowHtml = '';
        const isSetup = item.activityType && ['CF + CP', 'CF', 'CP', 'SETUP'].includes(item.activityType);
        
        if (isSetup) {
            rowHtml = `
            <tr class="bg-amber-50/50">
                <td class="px-4 py-3 font-bold text-slate-400 font-mono">${noCounter++}</td>
                <td class="px-4 py-3">
                    <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-600 text-white uppercase tracking-wider">${item.activityType}</span>
                </td>
                <td class="px-4 py-3 text-center font-mono text-slate-400">-</td>
                <td class="px-4 py-3 font-bold text-amber-900 border-r border-slate-200">${lineId}</td>
                <td class="px-4 py-3 text-center font-mono text-amber-600">${formatDate(start)}</td>
                <td class="px-4 py-3 text-center font-mono text-amber-600">${formatDate(end)}</td>
                <td class="px-4 py-3 text-amber-800 text-[10px] italic">
                    ${item.description || 'Changeover Process'}
                </td>
                <td class="px-4 py-3 text-center text-slate-300 italic text-[10px]">
                    Automatic
                </td>
            </tr>`;
        } else if (item.isFixed && !item.isLockedOrder) { // Non-Production Activity
            let stateDetails = '';
            if (item.product !== undefined || item.tiers !== undefined) {
                let p = item.product === null ? 'Empty Line' : (item.product || 'Keep');
                let t = 'Keep Tiers';
                if (item.tiers) {
                    t = `LB:${item.tiers.LB || '?'} LT:${item.tiers.LT || '?'} RB:${item.tiers.RB || '?'} RT:${item.tiers.RT || '?'}`;
                }
                stateDetails = `<div><span class="text-[10px] font-bold text-slate-500 uppercase">State override:</span> ${p} | ${t}</div>`;
            }

            rowHtml = `
            <tr class="bg-slate-50">
                <td class="px-4 py-3 font-bold text-slate-400 font-mono">${noCounter++}</td>
                <td class="px-4 py-3">
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-white uppercase tracking-wider">${item.activityType}</span>
                </td>
                <td class="px-4 py-3 text-center font-mono text-slate-400">${entry ? formatDate(entry) : '-'}</td>
                <td class="px-4 py-3 font-bold text-slate-900 border-r border-slate-200">${lineId}</td>
                <td class="px-4 py-3 text-center font-mono text-slate-500">${formatDate(start)}</td>
                <td class="px-4 py-3 text-center font-mono text-slate-500">${formatDate(end)}</td>
                <td class="px-4 py-3 text-slate-400 italic">
                    <div>Maintenance / Non-Production Window</div>
                    ${stateDetails}
                </td>
                <td class="px-4 py-3 text-center">
                    <div class="flex flex-col items-center justify-center gap-2 sm:flex-row">
                        <button onclick="deleteActivity('${item.id}')" class="flex items-center text-red-500 hover:text-red-700 font-bold uppercase text-[10px]">
                            <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            Delete
                        </button>
                    </div>
                </td>
            </tr>`;
        } else { // Production Order
            rowHtml = `
            <tr class="hover:bg-indigo-50/30">
                <td class="px-4 py-3 font-bold text-slate-400 font-mono">${noCounter++}</td>
                <td class="px-4 py-3">
                    <div class="font-bold text-slate-900">${item.orderNumber}</div>
                    <div class="text-[10px] font-mono text-slate-500 truncate max-w-[200px]" title="${item.product}">${item.product}</div>
                </td>
                <td class="px-4 py-3 text-center font-mono text-slate-400">${entry ? formatDate(entry) : '-'}</td>
                <td class="px-4 py-3 font-bold text-indigo-900 border-r border-slate-200">
                    ${lineId}
                    ${item.isLocked ? '<br><span class="inline-flex rounded font-bold bg-indigo-100 text-indigo-800 px-1 text-[9px] uppercase">Locked</span>' : ''}
                </td>
                <td class="px-4 py-3 text-center font-mono text-indigo-600">${formatDate(start)}</td>
                <td class="px-4 py-3 text-center font-mono text-indigo-600">${formatDate(end)}</td>
                <td class="px-4 py-3">
                    <div class="text-slate-600 font-medium">${displayQuantity.toLocaleString()} pcs (${item.size})</div>
                    ${item.enforceCompletionDate && item.targetCompletionDate ? '<div class="text-indigo-600 text-[10px] font-bold">Target Date: ' + formatDate(new Date(item.targetCompletionDate)) + '</div>' : ''}
                    ${isDelayed ? '<div class="mt-1"><span class="inline-flex rounded font-bold bg-red-100 text-red-800 px-1.5 py-0.5 text-[9px] uppercase" title="' + delayStr + ' delayed">Delayed</span></div>' : ''}
                </td>
                <td class="px-4 py-3 text-center">
                    <div class="flex flex-col items-center justify-center gap-2 sm:flex-row">
                        <button onclick="toggleLock('${item.id}', '${lineId}')" class="flex items-center text-slate-500 hover:text-slate-800 font-bold uppercase text-[10px]">
                            <svg class="w-3 h-3 mr-1" fill="${item.isLocked ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                            ${item.isLocked ? 'Unlock' : 'Lock'}
                        </button>
                        ${!item.isLocked ? 
                        '<button onclick="editOrder(\'' + item.id + '\')" class="flex items-center text-indigo-600 hover:text-indigo-800 font-bold uppercase text-[10px]">' +
                        '<svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>' +
                        'Edit' +
                        '</button>' : ''}
                        ${!item.isLocked ? '<button onclick="deleteOrder(\'' + item.id + '\')" class="flex items-center text-red-500 hover:text-red-700 font-bold uppercase text-[10px]">' +
                        '<svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>' +
                        'Delete' +
                        '</button>' : ''}
                    </div>
                </td>
            </tr>`;
        }
        tableHtml += rowHtml;
    });

    tableHtml += `</tbody></table></div>`;
    outputDiv.innerHTML = tableHtml;
};

// Dashboard Order Entry is intentionally a raw order registry. It must not render
// optimized schedule rows, CF/CP setup activities, or fixed activity windows.
window.renderSchedule = async function() {
    const outputDiv = document.getElementById('scheduleOutput');
    const plantSelect = document.getElementById('plantSelect');
    if (!outputDiv || !plantSelect) return;

    if (orderQueue.length === 0) {
        outputDiv.innerHTML = '<div class="text-slate-400 py-12 italic border-2 border-dashed border-slate-200 rounded-lg text-center bg-slate-50 flex flex-col items-center justify-center">No production orders entered or uploaded.</div>';
        if (window.hideLoading) window.hideLoading();
        return;
    }

    const selectedPlant = plantSelect.value;
    const selectedPlantLines = PLANTS[selectedPlant] || [];
    const orderMatchesPlant = (order) => {
        const constraints = Array.isArray(order.targetConstraint) ? order.targetConstraint : [order.targetConstraint];
        const cleanConstraints = constraints.filter(Boolean);
        if (cleanConstraints.length === 0) return true;

        return cleanConstraints.some(constraint => {
            if (constraint === selectedPlant) return true;
            if (PLANTS[constraint]) return constraint === selectedPlant;
            return selectedPlantLines.includes(constraint);
        });
    };

    const ordersToDisplay = orderQueue.filter(orderMatchesPlant).sort((a, b) => {
        const entryA = a.entryTime ? new Date(a.entryTime).getTime() : 0;
        const entryB = b.entryTime ? new Date(b.entryTime).getTime() : 0;
        return entryA - entryB;
    });

    if (ordersToDisplay.length === 0) {
        outputDiv.innerHTML = '<div class="text-slate-400 py-12 italic border-2 border-dashed border-slate-200 rounded-lg text-center bg-slate-50 flex flex-col items-center justify-center">No production orders match the selected plant filter.</div>';
        if (window.hideLoading) window.hideLoading();
        return;
    }

    let tableHtml = `<div class="overflow-x-auto"><table class="min-w-full divide-y divide-slate-200 text-xs">
        <thead class="bg-slate-50">
            <tr>
                <th class="px-4 py-3 text-left font-bold text-slate-700 uppercase tracking-tighter">No</th>
                <th class="px-4 py-3 text-left font-bold text-slate-700 uppercase tracking-tighter">Order</th>
                <th class="px-4 py-3 text-center font-bold text-slate-700 uppercase tracking-tighter">Entry Time</th>
                <th class="px-4 py-3 text-center font-bold text-slate-700 uppercase tracking-tighter">Size</th>
                <th class="px-4 py-3 text-right font-bold text-slate-700 uppercase tracking-tighter">Quantity</th>
                <th class="px-4 py-3 text-left font-bold text-slate-700 uppercase tracking-tighter">Details</th>
                <th class="px-4 py-3 text-center font-bold text-slate-700 uppercase tracking-tighter">Actions</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 bg-white">`;

    let noCounter = 1;
    ordersToDisplay.forEach(item => {
        const entry = item.entryTime ? new Date(item.entryTime) : null;
        const targetValues = Array.isArray(item.targetConstraint) ? item.targetConstraint : [item.targetConstraint];
        const cleanTargetValues = targetValues.filter(Boolean);
        const targetDisplay = cleanTargetValues.length > 0 ? cleanTargetValues.join(', ') : 'Any';
        const targetDateDisplay = item.enforceCompletionDate && item.targetCompletionDate ? formatDate(new Date(item.targetCompletionDate)) : '-';

        tableHtml += `
            <tr class="hover:bg-indigo-50/30">
                <td class="px-4 py-3 font-bold text-slate-400 font-mono">${noCounter++}</td>
                <td class="px-4 py-3">
                    <div class="font-bold text-slate-900">${item.orderNumber}</div>
                    <div class="text-[10px] font-mono text-slate-500 truncate max-w-[200px]" title="${item.product}">${item.product}</div>
                </td>
                <td class="px-4 py-3 text-center font-mono text-slate-400">${entry ? formatDate(entry) : '-'}</td>
                <td class="px-4 py-3 text-center font-black text-indigo-900">${item.size}</td>
                <td class="px-4 py-3 text-right font-mono text-slate-700">${Number(item.quantity || 0).toLocaleString()}</td>
                <td class="px-4 py-3">
                    <div><span class="text-[10px] font-bold text-slate-500 uppercase">Target Scope:</span> ${targetDisplay}</div>
                    <div><span class="text-[10px] font-bold text-slate-500 uppercase">Target Date:</span> ${targetDateDisplay}</div>
                </td>
                <td class="px-4 py-3 text-center">
                    <div class="flex flex-col items-center justify-center gap-2 sm:flex-row">
                        <button onclick="editOrder('${item.id}')" class="flex items-center text-indigo-600 hover:text-indigo-800 font-bold uppercase text-[10px]">
                            <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                            Edit
                        </button>
                        <button onclick="deleteOrder('${item.id}')" class="flex items-center text-red-500 hover:text-red-700 font-bold uppercase text-[10px]">
                            <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            Delete
                        </button>
                    </div>
                </td>
            </tr>`;
    });

    tableHtml += `</tbody></table></div>`;
    outputDiv.innerHTML = tableHtml;
    if (window.hideLoading) window.hideLoading();
};

// =========================================================================
// SECTION 7: EXPORT FUNCTIONALITY
// =========================================================================

function exportQueueToCSV() {
    if (orderQueue.length === 0) return alert("Queue is empty.");
    const headers = ["Order No", "Glove Code", "Size", "Quantity", "Preferred Scope"];
    const csvRows = [headers.join(",")];
    orderQueue.forEach(o => {
        csvRows.push([
            `"${o.orderNumber}"`,
            `"${o.product}"`,
            `"${o.size}"`,
            o.quantity,
            `"${o.targetConstraint || 'Any'}"`
        ].join(","));
    });
    const blob = new Blob([csvRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Production_Queue_Export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

window.exportMasterScheduleToCSV = function() {
    if (!window.lastGeneratedSchedules) return alert("Schedule is empty.");
    const headers = ["Line No", "Job Detail / Activity", "LB", "LT", "RB", "RT", "Start Time", "End Time", "Duration", "Status"];
    const csvRows = [headers.join(",")];
    
    Object.keys(window.lastGeneratedSchedules).forEach(lineId => {
        const lineItems = window.lastGeneratedSchedules[lineId];
        lineItems.forEach((item, idx) => {
            if (!item.activityType && !item.orderNumber && !item.isFixed) return; // Skip if empty 
            
            const isSetup = item.activityType && ['CF + CP', 'CF', 'CP', 'SETUP'].includes(item.activityType);
            const isNonProd = item.isFixed && !item.isLockedOrder && !item.isLockedOrderSetup;
            
            let jobDetail = "";
            let status = "Standard";
            let lb = "", lt = "", rb = "", rt = "";
            
            let start = null;
            let end = null;
            
            if (isSetup) {
                start = new Date(item.start);
                end = new Date(item.end);
                jobDetail = `${item.activityType} - ${item.description || ''}`;
                status = "Automatic";
                lb = "STATE TRANSITION";
                lt = "STATE TRANSITION";
                rb = "STATE TRANSITION";
                rt = "STATE TRANSITION";
            } else if (isNonProd) {
                start = new Date(item.start);
                end = new Date(item.end);
                jobDetail = `${item.activityType} - Non-Production Window`;
                status = "Locked";
                const lastKnownState = (idx > 0) ? (lineItems[idx-1].costDetails?.newTiersState || lineItems[idx-1].manualTiers) : null;
                const tiers = lastKnownState || { LB: '', LT: '', RB: '', RT: '' };
                lb = tiers.LB || '';
                lt = tiers.LT || '';
                rb = tiers.RB || '';
                rt = tiers.RT || '';
            } else {
                start = new Date(item.startTime || item.start);
                end = new Date(item.endTime || item.end);
                const durationMins = Math.round((end - start) / 60000);
                const tiers = item.manualTiers || item.costDetails?.newTiersState || { LB: '', LT: '', RB: '', RT: '' };
                const activeCount = ['LB', 'LT', 'RB', 'RT'].filter(t => tiers[t] === item.size).length;
                const activeRatio = activeCount > 0 ? (activeCount / 4) : 1;
                const lineSpeed = item.costDetails?.lineSpeedUsed || 48000;
                let displayQuantity = item.quantity || 0;
                if (!item.isCombined && durationMins > 0) displayQuantity = Math.round((durationMins / 60) * lineSpeed * activeRatio);
                
                jobDetail = `${item.orderNumber || ''} - ${item.product || ''} (${displayQuantity.toLocaleString()} pcs)`;
                status = (item.isLocked) ? "Locked" : ((item.manualStartTime || item.manualEndTime || item.manualTiers) ? "Manual" : "Automatic");
                
                if (item.enforceCompletionDate && item.targetCompletionDate) {
                    const target = new Date(item.targetCompletionDate);
                    if (end && end > target) {
                        status += " (Delayed)";
                    }
                }

                lb = tiers.LB || '';
                lt = tiers.LT || '';
                rb = tiers.RB || '';
                rt = tiers.RT || '';
            }
            
            let durationStr = "";
            if (start && end) {
                const durationMins = Math.round((end - start) / 60000);
                durationStr = durationMins >= 60 ? Math.floor(durationMins/60) + 'h ' + (durationMins%60) + 'm' : Math.max(0, durationMins) + 'm';
            }

            // Function to format date to match the table
            const formatCSVDate = (date) => {
                if (!date) return "";
                const pad = (n) => (n < 10 ? '0' + n : n);
                return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
            };

            csvRows.push([
                `"${lineId}"`,
                `"${jobDetail}"`,
                `"${lb}"`,
                `"${lt}"`,
                `"${rb}"`,
                `"${rt}"`,
                `"${formatCSVDate(start)}"`,
                `"${formatCSVDate(end)}"`,
                `"${durationStr}"`,
                `"${status}"`
            ].join(","));
        });
    });

    const blob = new Blob([csvRows.join("\n")], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Master_Schedule_Export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
};
