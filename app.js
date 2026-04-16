/* ============================================================
   MARUTI CRM — app.js v2.0
   Fixes: A5 Delivery Challan print, CSV, Notifications, Settings
   ============================================================ */

// ─── SETTINGS ────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  companyName: 'MARUTI ENTERPRISE',
  address: 'India Colony, Bapunagar, Ahmedabad',
  city: 'Ahmedabad, Gujarat - 382350',
  phone: '9265965084',
  gstNo: '',
  panNo: '',
  udyam: '',
};
let settings = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem('marutiSettings') || '{}'));

// ─── STATE ───────────────────────────────────────────────────
let orders = JSON.parse(localStorage.getItem('marutiOrders') || '[]');
let filteredOrders = [];

// ─── MASTER DATA (DROPDOWNS) ─────────────────────────────────
const DEFAULT_MASTER = {
  products: [
    "ACV + Moringa - 15 Effervescent (Green Apple)", "ACV + Moringa - 15 Effervescent (Mixed Fruit)",
    "Biotin 10000mcg - 60 Tablets", "Collagen + Vitamin C - 60 Capsules", "Fish Oil Omega-3 - 60 Softgels",
    "Garcinia Cambogia - 60 Capsules", "Green Coffee Bean Extract - 60 Capsules", "L-Carnitine 500mg - 60 Tablets",
    "Moringa Leaf Extract - 60 Capsules", "Multivitamin Complete - 60 Tablets", "Probiotics 10 Billion CFU - 30 Capsules",
    "Turmeric + Curcumin - 60 Capsules", "Vitamin B12 + Folic Acid - 60 Tablets", "Vitamin D3 + K2 - 60 Softgels", "Whey Protein Isolate - 1kg"
  ],
  types: [
    "Label", "Carton", "Insert", "Sleeve", "Alu. Foil", "Digital Sheets", "Art Card",
    "Business Card", "Latterhead", "Mar. Material", "Roll Foam Label", "Foil",
    "Standy Pouch", "Paper Tube", "Other"
  ],
  materials: [
    "350 GSM + UV Drip-Off + Emboss", "350 GSM + Matte Lamination", "300 GSM + Gloss Lamination",
    "300 GSM + UV Spot", "250 GSM + Foil Stamping", "BOPP + Digital Print",
    "Kraft Paper + Flexo Print", "White PET Label", "Transparent BOPP Label", "Other"
  ],
  vendors: [
    "Gujarat Print Pack", "Ahmedabad Packaging Co.", "Surat Box Works", "Rajkot Print House",
    "Vadodara Label Studio", "Mumbai Carton Mart", "Delhi Print Solutions", "Other"
  ],
  vendorGst: {} // { vendorName: gstNumber }
};
let masterData = Object.assign({ vendorGst: {} }, DEFAULT_MASTER, JSON.parse(localStorage.getItem('marutiMasterData') || '{}'));
if (!masterData.vendorGst) masterData.vendorGst = {};
function saveMasterData() { localStorage.setItem('marutiMasterData', JSON.stringify(masterData)); }

let currentPage = 1;
const PAGE_SIZE = 15;
let sortKey = 'date';
let sortDir = -1;
let activeChip = '';
let filterStatus = '';
let searchQuery = '';
let pendingDeleteIds = [];

// ─── SAVE ────────────────────────────────────────────────────
function saveData() { localStorage.setItem('marutiOrders', JSON.stringify(orders)); }
function saveSettingsData() { localStorage.setItem('marutiSettings', JSON.stringify(settings)); }

// ─── GENERATE ID ─────────────────────────────────────────────
function genId() {
  return 'ord_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
}

// ─── RESET ALL DATA ──────────────────────────────────────────
function resetAllData() {
  if (confirm('🚨 ARE YOU ABSOLUTELY SURE?\n\nThis will permanently delete ALL orders and cannot be undone. We recommend exporting to CSV first.')) {
    orders = [];
    saveData();
    applyFilters();
    renderDashboard();
    toggleSettings();
    showToast('🔴 All order data has been permanently deleted.', 'error');
  }
}

// ─── CLOCK ───────────────────────────────────────────────────
function updateClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  const now = new Date();
  el.textContent =
    now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + '  ' +
    now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

// ─── VIEW SWITCH ─────────────────────────────────────────────
function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const viewEl = document.getElementById('view-' + view);
  const navEl = document.getElementById('nav-' + view);
  if (viewEl) viewEl.classList.add('active');
  if (navEl) navEl.classList.add('active');

  const titles = {
    dashboard: ['Dashboard', 'Overview & Statistics'],
    orders: ['All Orders', 'Manage, search, edit, delete and print'],
    master: ['Master Data Management', 'Configure your dynamic dropdown categories'],
  };
  if (titles[view]) {
    document.getElementById('page-title').textContent = titles[view][0];
    document.getElementById('page-breadcrumb').textContent = titles[view][1];
  }
  if (view === 'dashboard') renderDashboard();
  if (view === 'orders') applyFilters();
  if (view === 'master') renderMasterData();
}

// ─── NOTIFICATION PANEL ──────────────────────────────────────
function toggleNotifications() {
  const panel = document.getElementById('notif-panel');
  const settPanel = document.getElementById('settings-panel');
  const settOverlay = document.getElementById('settings-overlay');
  settPanel.classList.remove('open');
  settOverlay.classList.remove('open');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) renderNotifications();
}

function renderNotifications() {
  const list = document.getElementById('notif-list');
  const badge = document.getElementById('notif-badge');
  const pending = orders.filter(o => !o.dispatchQty || Number(o.dispatchQty) < Number(o.orderQty));

  if (badge) {
    badge.textContent = pending.length;
    badge.style.display = pending.length > 0 ? 'flex' : 'none';
  }

  const recent = [...orders].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 12);
  if (!recent.length) {
    list.innerHTML = '<div class="notif-empty">No activity yet</div>';
    return;
  }
  list.innerHTML = recent.map(o => {
    const dispatched = o.dispatchQty && Number(o.dispatchQty) >= Number(o.orderQty);
    return `<div class="notif-item">
      <div class="notif-dot-indicator ${dispatched ? 'dispatched' : 'pending'}"></div>
      <div class="notif-content">
        <div class="notif-title">${esc(o.company)}</div>
        <div class="notif-sub">${esc(o.product.length > 42 ? o.product.slice(0, 40) + '…' : o.product)}</div>
        <div class="notif-meta">
          ${fmtDate(o.date)} &middot;
          <span style="color:${dispatched ? 'var(--success)' : 'var(--warning)'};">
            ${dispatched ? 'Dispatched' : 'Pending'}
          </span>
          &middot; Qty: ${formatNum(o.orderQty)}
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─── SETTINGS PANEL ──────────────────────────────────────────
function toggleSettings() {
  const panel = document.getElementById('settings-panel');
  const overlay = document.getElementById('settings-overlay');
  const notifPanel = document.getElementById('notif-panel');
  notifPanel.classList.remove('open');
  panel.classList.toggle('open');
  overlay.classList.toggle('open');
  if (panel.classList.contains('open')) loadSettingsForm();
}

function loadSettingsForm() {
  Object.keys(DEFAULT_SETTINGS).forEach(f => {
    const el = document.getElementById('s-' + f);
    if (el) el.value = settings[f] || '';
  });
}

function saveSettings() {
  Object.keys(DEFAULT_SETTINGS).forEach(f => {
    const el = document.getElementById('s-' + f);
    if (el) settings[f] = el.value.trim();
  });
  saveSettingsData();
  document.getElementById('settings-panel').classList.remove('open');
  document.getElementById('settings-overlay').classList.remove('open');
  showToast('Settings saved successfully!', 'success');
}

// Close notification panel on outside click
document.addEventListener('click', function (e) {
  const notifPanel = document.getElementById('notif-panel');
  if (notifPanel && notifPanel.classList.contains('open')) {
    if (!e.target.closest('#notif-panel') && !e.target.closest('#notif-btn')) {
      notifPanel.classList.remove('open');
    }
  }
});

// ─── DASHBOARD ───────────────────────────────────────────────
function renderDashboard() {
  const total = orders.length;
  const companies = new Set(orders.map(o => o.company)).size;
  const pending = orders.filter(o => !o.dispatchQty || Number(o.dispatchQty) < Number(o.orderQty)).length;
  const revenue = orders.reduce((s, o) => s + (Number(o.orderQty || 0) * Number(o.rate || 0) + Number(o.otherCharge || 0)), 0);

  document.getElementById('stat-total-orders').textContent = total;
  document.getElementById('stat-total-companies').textContent = companies;
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('stat-revenue').textContent = '₹' + formatNum(revenue);
  document.getElementById('stat-orders-change').textContent = total ? `${total} total orders recorded` : 'No orders yet';
  document.getElementById('stat-companies-change').textContent = companies ? `${companies} unique parties` : '—';
  document.getElementById('stat-pending-change').textContent = pending ? `${pending} awaiting dispatch` : 'All dispatched ✓';
  document.getElementById('stat-revenue-change').textContent = revenue ? `₹${formatNum(revenue)} total value` : '—';
  document.getElementById('order-count-badge').textContent = total;

  // Notification badge
  const badge = document.getElementById('notif-badge');
  if (badge) {
    badge.textContent = pending;
    badge.style.display = pending > 0 ? 'flex' : 'none';
  }

  // Recent orders
  const rec = [...orders].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
  const recEl = document.getElementById('recent-orders-list');
  if (!rec.length) {
    recEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📭</div><h3>No orders yet</h3><p>Add your first order to see it here</p></div>`;
  } else {
    recEl.innerHTML = rec.map(o => {
      const dispatched = o.dispatchQty && Number(o.dispatchQty) >= Number(o.orderQty);
      return `<div class="recent-order-item">
        <div style="width:36px;height:36px;border-radius:8px;background:var(--bg-input);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">📦</div>
        <div style="flex:1;min-width:0;">
          <div class="order-company">${esc(o.company)}</div>
          <div class="order-product">${esc(o.product)}</div>
        </div>
        <div class="order-qty">${formatNum(o.orderQty)}</div>
        <span class="status-badge ${dispatched ? 'dispatched' : 'pending'}">${dispatched ? 'Dispatched' : 'Pending'}</span>
      </div>`;
    }).join('');
  }

  // Product stats
  const prodMap = {};
  orders.forEach(o => { prodMap[o.product || 'Unknown'] = (prodMap[o.product || 'Unknown'] || 0) + Number(o.orderQty || 0); });
  const sorted = Object.entries(prodMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxVal = sorted[0]?.[1] || 1;
  const psEl = document.getElementById('product-stats-list');
  if (!sorted.length) {
    psEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📊</div><h3>No data yet</h3></div>`;
  } else {
    psEl.innerHTML = sorted.map(([name, qty]) => `
      <div class="product-stat-item">
        <div class="product-stat-name">${esc(name.length > 40 ? name.slice(0, 38) + '…' : name)}</div>
        <div class="product-stat-bar-bg"><div class="product-stat-bar" style="width:${Math.round(qty / maxVal * 100)}%"></div></div>
        <div class="product-stat-meta"><span>${formatNum(qty)} pcs</span></div>
      </div>`).join('');
  }
}

// ─── TABLE ───────────────────────────────────────────────────
function applyFilters() {
  const si = document.getElementById('search-input');
  const fs = document.getElementById('filter-status');
  searchQuery = si ? si.value.toLowerCase().trim() : '';
  filterStatus = fs ? fs.value : '';

  filteredOrders = orders.filter(o => {
    if (activeChip && o.type !== activeChip) return false;
    if (filterStatus && (o.status || 'pending') !== filterStatus) return false;
    if (searchQuery) {
      const h = [o.company, o.product, o.batch, o.invoice, o.vendor, o.type, o.size, o.material].join(' ').toLowerCase();
      if (!h.includes(searchQuery)) return false;
    }
    return true;
  });

  filteredOrders.sort((a, b) => {
    let va = a[sortKey] || '', vb = b[sortKey] || '';
    if (['date', 'dispatchDate'].includes(sortKey)) {
      va = new Date(va || '1970-01-01'); vb = new Date(vb || '1970-01-01');
    } else if (['orderQty', 'dispatchQty', 'rate', 'otherCharge'].includes(sortKey)) {
      va = Number(va); vb = Number(vb);
    } else {
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
    }
    return va < vb ? -sortDir : va > vb ? sortDir : 0;
  });

  currentPage = 1;
  renderTable();
}

function setChip(el, val) {
  activeChip = val;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  applyFilters();
}

function sortTable(key) {
  if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = -1; }
  applyFilters();
}

function renderTable() {
  const tbody = document.getElementById('orders-tbody');
  const total = filteredOrders.length;
  const start = (currentPage - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);
  const page = filteredOrders.slice(start, end);

  document.getElementById('total-showing').textContent = `Showing ${total} record${total !== 1 ? 's' : ''}`;
  document.getElementById('table-info').textContent = `${total} record${total !== 1 ? 's' : ''} found`;

  if (!page.length) {
    tbody.innerHTML = `<tr><td colspan="19" style="text-align:center;padding:60px 20px;">
      <div class="empty-state"><div class="empty-state-icon">📭</div><h3>No orders found</h3><p>Try adjusting your search or filters</p></div>
    </td></tr>`;
    renderPagination(0); updateBulkButtons(); return;
  }

  tbody.innerHTML = page.map((o, i) => {
    const dispatched = o.dispatchQty && Number(o.dispatchQty) >= Number(o.orderQty);
    const rowTotal = Number(o.orderQty || 0) * Number(o.rate || 0) + Number(o.otherCharge || 0);
    return `<tr id="row-${o.id}" class="${isSelected(o.id) ? 'selected' : ''}">
      <td><input type="checkbox" ${isSelected(o.id) ? 'checked' : ''} onchange="toggleRow('${o.id}', this)" /></td>
      <td style="color:var(--text-muted);font-size:11px;">${start + i + 1}</td>
      <td>${fmtDate(o.date)}</td>
      <td class="bold">${esc(o.company)}</td>
      <td style="max-width:200px;white-space:normal;line-height:1.4;">${esc(o.product)}</td>
      <td>
        <select class="type-select ${typeToClass(o.type)}" style="text-transform: capitalize;" onchange="updateOrderType('${o.id}', this.value, this)">
          ${masterData.types.sort().map(t => `<option value="${esc(t)}" ${o.type === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
        </select>
      </td>
      <td>${esc(o.size || '—')}</td>
      <td style="max-width:180px;white-space:normal;font-size:11px;">${esc(o.material || '—')}</td>
      <td class="bold">${formatNum(o.orderQty)}</td>
      <td>${o.dispatchQty ? formatNum(o.dispatchQty) : '—'}</td>
      <td>₹${Number(o.rate || 0).toFixed(2)}</td>
      <td>${o.otherCharge ? '₹' + formatNum(o.otherCharge) : '—'}</td>
      <td class="bold" style="color:var(--success);">₹${formatNum(rowTotal)}</td>
      <td>${esc(o.batch || '—')}</td>
      <td>${esc(o.vendor || '—')}</td>
      <td>${o.dispatchDate ? fmtDate(o.dispatchDate) : '—'}</td>
      <td>${esc(o.invoice || '—')}</td>
      <td>
        <select class="status-select ${o.status || 'pending'}" onchange="updateOrderStatus('${o.id}', this.value)">
          <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="approval" ${o.status === 'approval' ? 'selected' : ''}>Approval</option>
          <option value="printing" ${o.status === 'printing' ? 'selected' : ''}>Printing</option>
          <option value="dispatch" ${o.status === 'dispatch' ? 'selected' : ''}>Dispatch</option>
          <option value="process" ${o.status === 'process' ? 'selected' : ''}>Process</option>
          <option value="ready" ${o.status === 'ready' ? 'selected' : ''}>Ready</option>
          <option value="cancel" ${o.status === 'cancel' ? 'selected' : ''}>Cancel</option>
        </select>
      </td>
      <td>
        <div class="row-actions">
          <button class="action-btn edit"   onclick="editOrder('${o.id}')"          title="Edit">✏️</button>
          <button class="action-btn print"  onclick="printOrders(['${o.id}'])"      title="Print Challan A5">🖨️</button>
          <button class="action-btn delete" onclick="confirmDelete(['${o.id}'])"    title="Delete">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  renderPagination(total);
  updateBulkButtons();
}

function renderPagination(total) {
  const pages = Math.ceil(total / PAGE_SIZE);
  const pag = document.getElementById('pagination');
  if (pages <= 1) { pag.innerHTML = ''; return; }
  let html = `<button class="page-btn" onclick="goPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>‹</button>`;
  for (let p = 1; p <= pages; p++) {
    if (pages > 7 && p > 2 && p < pages - 1 && Math.abs(p - currentPage) > 2) {
      if (p === 3 || p === pages - 2) html += `<span style="padding:0 4px;color:var(--text-muted);">…</span>`;
      continue;
    }
    html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="goPage(${p})">${p}</button>`;
  }
  html += `<button class="page-btn" onclick="goPage(${currentPage + 1})" ${currentPage === pages ? 'disabled' : ''}>›</button>`;
  pag.innerHTML = html;
}

function goPage(p) {
  const pages = Math.ceil(filteredOrders.length / PAGE_SIZE);
  if (p < 1 || p > pages) return;
  currentPage = p; renderTable();
}

// ─── SELECT ───────────────────────────────────────────────────
let selectedIds = new Set();
function isSelected(id) { return selectedIds.has(id); }

function toggleRow(id, cb) {
  if (cb.checked) selectedIds.add(id); else selectedIds.delete(id);
  const row = document.getElementById('row-' + id);
  if (row) row.classList.toggle('selected', cb.checked);
  updateBulkButtons();
}

function toggleSelectAll(cb) {
  const start = (currentPage - 1) * PAGE_SIZE;
  filteredOrders.slice(start, start + PAGE_SIZE).forEach(o => {
    if (cb.checked) selectedIds.add(o.id); else selectedIds.delete(o.id);
  });
  renderTable();
}

function updateBulkButtons() {
  const n = selectedIds.size;
  const label = document.getElementById('selected-count-label');
  const printBtn = document.getElementById('bulk-print-btn');
  const deleteBtn = document.getElementById('bulk-delete-btn');
  if (n > 0) {
    label.textContent = `${n} selected`;
    label.classList.add('show');
    if (printBtn) printBtn.disabled = false;
    if (deleteBtn) deleteBtn.disabled = false;
  } else {
    label.classList.remove('show');
    if (printBtn) printBtn.disabled = true;
    if (deleteBtn) deleteBtn.disabled = true;
  }
}

function openAddModal() {
  document.getElementById('modal-title').textContent = 'Add New Order';
  document.getElementById('order-form').reset();
  document.getElementById('edit-id').value = '';
  document.getElementById('f-status').value = 'pending';
  document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('custom-product-group').style.display = 'none';
  document.getElementById('f-party-gst').value = '';
  document.getElementById('order-modal').classList.add('open');
}

function editOrder(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  document.getElementById('modal-title').textContent = 'Edit Order';
  document.getElementById('edit-id').value = id;
  document.getElementById('f-company').value = o.company || '';
  document.getElementById('f-date').value = o.date || '';

  const productSel = document.getElementById('f-product');
  const opts = Array.from(productSel.options).map(opt => opt.value);
  if (opts.includes(o.product)) {
    productSel.value = o.product;
    document.getElementById('custom-product-group').style.display = 'none';
  } else {
    productSel.value = '__custom__';
    document.getElementById('f-product-custom').value = o.product || '';
    document.getElementById('custom-product-group').style.display = 'flex';
  }

  document.getElementById('f-type').value = o.type || '';
  document.getElementById('f-size').value = o.size || '';
  document.getElementById('f-material').value = o.material || '';
  document.getElementById('f-order-qty').value = o.orderQty || '';
  document.getElementById('f-dispatch-qty').value = o.dispatchQty || '';
  document.getElementById('f-rate').value = o.rate || '';
  document.getElementById('f-other').value = o.otherCharge || '';
  document.getElementById('f-batch').value = o.batch || '';
  document.getElementById('f-vendor').value = o.vendor || '';
  document.getElementById('f-dispatch-date').value = o.dispatchDate || '';
  document.getElementById('f-invoice').value = o.invoice || '';
  document.getElementById('f-status').value = o.status || 'pending';
  document.getElementById('f-party-gst').value = o.partyGst || '';
  document.getElementById('order-modal').classList.add('open');
}

document.getElementById('f-product').addEventListener('change', function () {
  document.getElementById('custom-product-group').style.display =
    this.value === '__custom__' ? 'flex' : 'none';
});

function saveOrder() {
  const form = document.getElementById('order-form');
  if (!form.checkValidity()) { form.reportValidity(); return; }

  let product = document.getElementById('f-product').value;
  if (product === '__custom__') {
    product = document.getElementById('f-product-custom').value.trim();
    if (!product) { showToast('Please enter a custom product name.', 'error'); return; }
  }
  if (!product) { showToast('Please select or enter a product name.', 'error'); return; }

  const id = document.getElementById('edit-id').value;
  const rec = {
    id: id || genId(),
    company: document.getElementById('f-company').value.trim(),
    date: document.getElementById('f-date').value,
    product,
    type: document.getElementById('f-type').value,
    size: document.getElementById('f-size').value.trim(),
    material: document.getElementById('f-material').value,
    orderQty: document.getElementById('f-order-qty').value,
    dispatchQty: document.getElementById('f-dispatch-qty').value,
    rate: document.getElementById('f-rate').value,
    otherCharge: document.getElementById('f-other').value,
    batch: document.getElementById('f-batch').value.trim(),
    vendor: document.getElementById('f-vendor').value,
    dispatchDate: document.getElementById('f-dispatch-date').value,
    invoice: document.getElementById('f-invoice').value.trim(),
    status: document.getElementById('f-status').value,
    partyGst: (document.getElementById('f-party-gst').value || '').trim().toUpperCase(),
    createdAt: id ? (orders.find(x => x.id === id)?.createdAt || Date.now()) : Date.now(),
  };

  if (id) {
    const idx = orders.findIndex(x => x.id === id);
    if (idx !== -1) orders[idx] = rec;
    showToast('Order updated successfully!', 'success');
  } else {
    orders.unshift(rec);
    showToast('Order added successfully!', 'success');
  }

  saveData(); closeModal(); applyFilters(); renderDashboard();
}

function closeModal() { document.getElementById('order-modal').classList.remove('open'); }

// ─── DELETE ───────────────────────────────────────────────────
function confirmDelete(ids) {
  pendingDeleteIds = ids;
  document.getElementById('confirm-msg').textContent =
    ids.length === 1
      ? 'Are you sure you want to delete this order? This cannot be undone.'
      : `Are you sure you want to delete ${ids.length} selected orders? This cannot be undone.`;
  document.getElementById('confirm-ok-btn').onclick = doDelete;
  document.getElementById('confirm-modal').classList.add('open');
}

function doDelete() {
  orders = orders.filter(o => !pendingDeleteIds.includes(o.id));
  pendingDeleteIds.forEach(id => selectedIds.delete(id));
  saveData(); closeConfirm(); applyFilters(); renderDashboard();
  showToast('Order(s) deleted.', 'error');
}

function deleteSelected() {
  if (!selectedIds.size) return;
  confirmDelete([...selectedIds]);
}

function closeConfirm() { document.getElementById('confirm-modal').classList.remove('open'); }

// ─── PRINT — A5 DELIVERY CHALLAN ─────────────────────────────
function printOrders(ids) {
  const rows = orders.filter(o => ids.includes(o.id));
  if (!rows.length) { showToast('No orders selected for printing.', 'error'); return; }

  const printArea = document.getElementById('print-area');

  // Single order → individual challan  ||  Multiple → one consolidated bill
  if (rows.length === 1) {
    printArea.innerHTML = generateChallan(rows[0], 1);
  } else {
    printArea.innerHTML = generateConsolidatedChallan(rows);
  }

  printArea.style.display = 'block';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
      setTimeout(() => {
        printArea.style.display = 'none';
        printArea.innerHTML = '';
      }, 1000);
    });
  });
}

function printSelected() {
  if (!selectedIds.size) {
    showToast('Please select at least one order first.', 'error');
    return;
  }
  printOrders([...selectedIds]);
}

function generateChallan(o, sn) {
  const dispatched = o.dispatchQty && Number(o.dispatchQty) >= Number(o.orderQty);
  const total = Number(o.orderQty || 0) * Number(o.rate || 0) + Number(o.otherCharge || 0);

  const company = settings.companyName || 'MARUTI ENTERPRISE';
  const address = settings.address || '';
  const city = settings.city || '';
  const phone = settings.phone || '';
  const gstNo = settings.gstNo || '';
  const panNo = settings.panNo || '';
  const udyam = settings.udyam || '';

  // Filler rows to match layout
  const fillerRows = Array(8).fill(`
    <tr>
      <td style="border:1px solid #aaa;border-top:none;padding:12px 6px;font-size:8.5pt;text-align:center;">&nbsp;</td>
      <td style="border:1px solid #aaa;border-left:none;border-top:none;padding:12px 8px;"></td>
      <td style="border:1px solid #aaa;border-left:none;border-top:none;padding:12px 6px;"></td>
    </tr>`).join('');

  return `
<div style="width:148.5mm;min-height:208.98mm;padding:8mm 10mm 36.67mm;font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;background:white;color:#000;page-break-after:always;box-sizing:border-box;position:relative;">

  <!-- ── BRAND LOGO HEADER (FOR PRINT) ── -->
  <div style="position:absolute;top:8mm;left:10mm;right:10mm;height:12mm;background:#0a111a;display:flex;align-items:center;justify-content:center;border-radius:4px;overflow:hidden;">
    <img src="images/Maruti New latterhead.png" alt="Logo" style="height:80%;max-width:90%;object-fit:contain;" />
  </div>

  <div style="margin-top:17.66mm;"> <!-- 25.66mm total top space: 8mm padding + 17.66mm margin -->
    <!-- ── PARTY + DC INFO (MATCHING IMAGE BOX) ── -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:0;border:1px solid #999;">
    <tr>
      <td style="padding:10px 12px;width:60%;vertical-align:top;border-right:1px solid #999;">
        <div style="font-size:8pt;color:#666;margin-bottom:2px;">M/s.</div>
        <div style="font-size:14pt;font-weight:700;color:#1d3557;">${esc(o.company)}</div>
        ${o.partyGst ? `<div style="font-size:8pt;color:#444;margin-top:3px;">GST No.: <strong>${esc(o.partyGst)}</strong></div>` : ''}
      </td>
      <td style="padding:0;vertical-align:top;width:40%;">
        <table style="width:100%;border-collapse:collapse;font-size:9pt;">
          <tr style="border-bottom:1px solid #999;">
            <td style="padding:5px 8px;font-weight:600;border-right:1px solid #999;background:#f9f9f9;width:35%;">D.C. No.</td>
            <td style="padding:5px 8px;color:#333;">${esc(o.invoice || '—')}</td>
          </tr>
          <tr style="border-bottom:1px solid #999;">
            <td style="padding:5px 8px;font-weight:600;border-right:1px solid #999;background:#f9f9f9;">D.C. Dt.</td>
            <td style="padding:5px 8px;color:#333;">${fmtDate(o.dispatchDate || o.date)}</td>
          </tr>
          <tr style="border-bottom:1px solid #999;">
            <td style="padding:5px 8px;font-weight:600;border-right:1px solid #999;background:#f9f9f9;">P.O. No.</td>
            <td style="padding:5px 8px;color:#333;">${esc(o.batch || '—')}</td>
          </tr>
          <tr>
            <td style="padding:5px 8px;font-weight:600;border-right:1px solid #999;background:#f9f9f9;">P.O. Dt.</td>
            <td style="padding:5px 8px;color:#333;">${fmtDate(o.date)}</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td colspan="2" style="border-top:1px solid #999;padding:6px 12px;font-size:8pt;color:#444;">
        Company's GST No. : <strong>${esc(gstNo || 'N/A')}</strong>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        Company's PAN No. : <strong>${esc(panNo || 'N/A')}</strong>
      </td>
    </tr>
  </table>

  <!-- ── PRODUCT TABLE ── -->
  <table style="width:100%;border-collapse:collapse;margin-top:10px;border:1px solid #999;">
    <thead>
      <tr style="background:#fff;border-bottom:1px solid #999;">
        <th style="padding:8px 6px;font-size:9pt;width:8%;text-align:center;color:#000;font-weight:700;border-right:1px solid #999;">NO.</th>
        <th style="padding:8px 10px;font-size:9pt;text-align:left;color:#000;font-weight:700;border-right:1px solid #999;">DESCRIPTION</th>
        <th style="padding:8px 10px;font-size:9pt;width:22%;text-align:right;color:#000;font-weight:700;">QUANTITY</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="border-right:1px solid #999;padding:12px 6px;text-align:center;font-size:9pt;vertical-align:top;">1</td>
        <td style="border-right:1px solid #999;padding:12px 10px;font-size:9pt;vertical-align:top;">
          <div style="font-weight:700;font-size:10.5pt;margin-bottom:4px;color:#111;">${esc(o.product)}</div>
          <div style="font-size:8.5pt;color:#555;">${formatNum(o.orderQty)} X 1</div>
        </td>
        <td style="padding:12px 10px;text-align:right;font-weight:700;font-size:11pt;vertical-align:top;color:#000;">${formatNum(o.orderQty)}</td>
      ${fillerRows}
    </tbody>
  </table>
  </div> <!-- Closing margin-top wrapper -->
</div>`;
}


// ─── CONSOLIDATED MULTI-ORDER BILL (A5) ──────────────────────
function generateConsolidatedChallan(rows) {
  const company = settings.companyName || 'MARUTI ENTERPRISE';
  const address = settings.address || '';
  const city = settings.city || '';
  const phone = settings.phone || '';
  const gstNo = settings.gstNo || '';
  const panNo = settings.panNo || '';
  const udyam = settings.udyam || '';

  // Totals
  const grandTotal = rows.reduce((s, o) => s + Number(o.orderQty || 0) * Number(o.rate || 0) + Number(o.otherCharge || 0), 0);
  const grandQty = rows.reduce((s, o) => s + Number(o.orderQty || 0), 0);

  // Company info for M/s.
  const uniqueCompanies = [...new Set(rows.map(o => o.company))];
  const partyName = uniqueCompanies.length === 1 ? uniqueCompanies[0] : 'Multiple Parties';

  // Today's date for D.C. Dt.
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  // Product rows
  const productRows = rows.map((o, i) => {
    const partyLabel = uniqueCompanies.length > 1
      ? `<div style="font-size:7pt;color:#666;margin-top:2px;">Party: ${esc(o.company)}</div>` : '';
    return `<tr>
      <td style="border-right:1px solid #999;padding:10px 6px;text-align:center;font-size:9pt;vertical-align:top;">${i + 1}</td>
      <td style="border-right:1px solid #999;padding:10px 10px;font-size:9pt;vertical-align:top;">
        <div style="font-weight:700;font-size:10pt;color:#111;">${esc(o.product)}</div>
        ${partyLabel}
        <div style="font-size:8.5pt;color:#555;margin-top:2px;">${formatNum(o.orderQty)} X 1</div>
      </td>
      <td style="padding:10px 10px;text-align:right;font-weight:700;font-size:11pt;vertical-align:top;color:#000;">${formatNum(o.orderQty)}</td>
    </tr>`;
  }).join('');

  // Filler rows (ensure min 10 rows total, filler = 10 - actual)
  const fillerCount = Math.max(0, 10 - rows.length);
  const fillerRows = Array(fillerCount).fill(`
    <tr>
      <td style="border-right:1px solid #999;padding:12px 6px;">&nbsp;</td>
      <td style="border-right:1px solid #999;padding:12px 10px;"></td>
      <td style="padding:12px 10px;"></td>
    </tr>`).join('');

  return `
<div style="width:148.5mm;min-height:208.98mm;padding:8mm 10mm 36.67mm;font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;background:white;color:#000;page-break-after:always;box-sizing:border-box;position:relative;">

  <!-- ── BRAND LOGO HEADER (FOR PRINT) ── -->
  <div style="position:absolute;top:8mm;left:10mm;right:10mm;height:12mm;background:#0a111a;display:flex;align-items:center;justify-content:center;border-radius:4px;overflow:hidden;">
    <img src="images/Maruti New latterhead.png" alt="Logo" style="height:80%;max-width:90%;object-fit:contain;" />
  </div>

  <div style="margin-top:17.66mm;"> <!-- 25.66mm total top space -->
    <!-- ── PARTY + DC INFO (MATCHING IMAGE BOX) ── -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:0;border:1px solid #999;">
    <tr>
      <td style="padding:10px 12px;width:60%;vertical-align:top;border-right:1px solid #999;">
        <div style="font-size:8pt;color:#666;margin-bottom:2px;">M/s.</div>
        <div style="font-size:14pt;font-weight:700;color:#1d3557;">${esc(partyName)}</div>
      </td>
      <td style="padding:0;vertical-align:top;width:40%;">
        <table style="width:100%;border-collapse:collapse;font-size:9pt;">
          <tr style="border-bottom:1px solid #999;">
            <td style="padding:5px 8px;font-weight:600;border-right:1px solid #999;background:#f9f9f9;width:35%;">D.C. No.</td>
            <td style="padding:5px 8px;color:#333;font-size:8pt;overflow:hidden;text-overflow:ellipsis;">${rows.map(o => esc(o.invoice || '—')).join(', ')}</td>
          </tr>
          <tr style="border-bottom:1px solid #999;">
            <td style="padding:5px 8px;font-weight:600;border-right:1px solid #999;background:#f9f9f9;">D.C. Dt.</td>
            <td style="padding:5px 8px;color:#333;">${today}</td>
          </tr>
          <tr style="border-bottom:1px solid #999;">
            <td style="padding:5px 8px;font-weight:600;border-right:1px solid #999;background:#f9f9f9;">P.O. No.</td>
            <td style="padding:5px 8px;color:#333;font-size:8pt;overflow:hidden;text-overflow:ellipsis;">${rows.map(o => esc(o.batch || '—')).join(', ')}</td>
          </tr>
          <tr>
            <td style="padding:5px 8px;font-weight:600;border-right:1px solid #999;background:#f9f9f9;">Total</td>
            <td style="padding:5px 8px;color:#333;font-weight:700;">${rows.length} orders</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td colspan="2" style="border-top:1px solid #999;padding:6px 12px;font-size:8pt;color:#444;">
        Company's GST No. : <strong>${esc(gstNo || 'N/A')}</strong>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
        Company's PAN No. : <strong>${esc(panNo || 'N/A')}</strong>
      </td>
    </tr>
  </table>

  <!-- ── PRODUCT TABLE ── -->
  <table style="width:100%;border-collapse:collapse;margin-top:10px;border:1px solid #999;">
    <thead>
      <tr style="background:#fff;border-bottom:1px solid #999;">
        <th style="padding:8px 6px;font-size:9pt;width:8%;text-align:center;color:#000;font-weight:700;border-right:1px solid #999;">NO.</th>
        <th style="padding:8px 10px;font-size:9pt;text-align:left;color:#000;font-weight:700;border-right:1px solid #999;">DESCRIPTION</th>
        <th style="padding:8px 10px;font-size:9pt;width:22%;text-align:right;color:#000;font-weight:700;">QUANTITY</th>
      </tr>
    </thead>
    <tbody>
      ${productRows}
      ${fillerRows}
      <!-- TOTAL ROW -->
      <tr style="border-top:2px solid #999;background:#fef9d9;">
        <td colspan="2" style="padding:8px 12px;text-align:right;font-weight:900;font-size:10pt;border-right:1px solid #999;">TOTAL QUANTITY</td>
        <td style="padding:8px 10px;text-align:right;font-weight:900;font-size:11.5pt;color:#c8a200;">${formatNum(grandQty)}</td>
      </tr>
    </tbody>
  </table>
  </div> <!-- Closing margin-top wrapper -->
</div>`;
}

// ─── EXPORT CSV ───────────────────────────────────────────────
function exportCSV() {
  if (!orders.length) { showToast('No orders to export.', 'error'); return; }

  const headers = [
    'Date', 'Company/Party', 'Product Name', 'Type', 'Size', 'Material',
    'Order Qty', 'Dispatch Qty', 'Rate (Rs)', 'Other Charge (Rs)', 'Total (Rs)',
    'Batch No.', 'Vendor', 'Dispatch Date', 'Invoice No.', 'Status'
  ];

  const csvRows = orders.map(o => {
    const total = Number(o.orderQty || 0) * Number(o.rate || 0) + Number(o.otherCharge || 0);
    const dispatched = o.dispatchQty && Number(o.dispatchQty) >= Number(o.orderQty);
    return [
      fmtDate(o.date), o.company || '', o.product || '', o.type || '',
      o.size || '', o.material || '',
      o.orderQty || '0', o.dispatchQty || '',
      Number(o.rate || 0).toFixed(2), o.otherCharge || '', total.toFixed(2),
      o.batch || '', o.vendor || '',
      o.dispatchDate ? fmtDate(o.dispatchDate) : '',
      o.invoice || '',
      o.status || 'pending'
    ].map(v => '"' + String(v).replace(/"/g, '""') + '"');
  });

  const csvContent = '\uFEFF' + [
    headers.map(h => '"' + h + '"').join(','),
    ...csvRows.map(r => r.join(','))
  ].join('\r\n');

  try {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'MarutiCRM_Orders_' + new Date().toISOString().slice(0, 10) + '.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast(`✅ Exported ${orders.length} orders to CSV!`, 'success');
  } catch (err) {
    console.error('CSV export error:', err);
    showToast('CSV export failed. Please try again.', 'error');
  }
}

// ─── IMPORT EXCEL / CSV ──────────────────────────────────────
function handleExcelImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (!jsonData.length) {
        showToast('Empty file or no data found.', 'warning');
        return;
      }

      const newOrders = mapImportedData(jsonData);
      if (newOrders.length > 0) {
        saveImportedOrders(newOrders);
      } else {
        showToast('No valid orders found in the file.', 'warning');
      }
    } catch (err) {
      console.error('Import error:', err);
      showToast('Error reading file. Please use a valid Excel or CSV.', 'error');
    } finally {
      event.target.value = ''; // Reset input
    }
  };
  reader.readAsArrayBuffer(file);
}

function mapImportedData(data) {
  // Mapping of internal keys to possible Excel headers
  const headerMap = {
    date: ['date', 'order date', 'dt'],
    company: ['company', 'party', 'customer', 'company/party', 'party name'],
    product: ['product', 'item', 'product name', 'description'],
    type: ['type', 'category', 'product type'],
    size: ['size', 'dimensions', 'dim'],
    material: ['material', 'material & process', 'process'],
    orderQty: ['order qty', 'qty', 'quantity', 'order quantity'],
    dispatchQty: ['dispatch qty', 'dispatched', 'dispatch quantity'],
    rate: ['rate', 'price', 'rate (rs)'],
    otherCharge: ['other charge', 'other', 'other charge (rs)'],
    batch: ['batch', 'batch no.', 'p.o. no.', 'po'],
    vendor: ['vendor', 'supplier', 'vendor name'],
    dispatchDate: ['dispatch date'],
    invoice: ['invoice', 'invoice no.', 'bill no.'],
    status: ['status', 'order status', 'stage']
  };

  const results = [];
  data.forEach(row => {
    const order = { id: genId(), createdAt: Date.now() };

    // Find best match for each key
    for (const key in headerMap) {
      const aliases = headerMap[key];
      const foundHeader = Object.keys(row).find(h =>
        aliases.includes(h.toLowerCase().trim())
      );
      
      let val = foundHeader ? row[foundHeader] : '';

      // Specific formatting for certain types
      if (key === 'date' || key === 'dispatchDate') {
        if (val instanceof Date) {
          val = val.toISOString().split('T')[0];
        } else if (val && String(val).includes('/')) {
          // Try parse DD/MM/YYYY
          const parts = String(val).split('/');
          if (parts.length === 3) val = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
        }
      }
      
      order[key] = val;
    }

    // Normalize status to valid options
    const validStatuses = ['pending', 'approval', 'printing', 'dispatch', 'process', 'ready', 'cancel'];
    const rawStatus = String(order.status || '').toLowerCase().trim();
    // Allow common aliases from old exports
    const statusMap = {
      'dispatched': 'dispatch', 'delivered': 'dispatch',
      'processing': 'process', 'in process': 'process',
      'in printing': 'printing', 'printed': 'printing',
      'approved': 'approval', 'cancelled': 'cancel', 'canceled': 'cancel',
    };
    order.status = statusMap[rawStatus] || (validStatuses.includes(rawStatus) ? rawStatus : 'pending');

    // Default date
    if (!order.date) order.date = new Date().toISOString().split('T')[0];
    if (order.company && order.product) {
      results.push(order);
    }
  });

  return results;
}

function saveImportedOrders(newOrders) {
  orders = [...orders, ...newOrders];
  saveData();
  applyFilters();
  renderDashboard();
  showToast(`✅ Successfully imported ${newOrders.length} orders!`, 'success');
}

// ─── UPDATE ORDER STATUS (INLINE) ────────────────────────────
function updateOrderStatus(id, newStatus) {
  const o = orders.find(x => x.id === id);
  if (!o) return;

  o.status = newStatus;

  if (newStatus === 'dispatch') {
    o.dispatchQty = o.orderQty;
    o.dispatchDate = new Date().toISOString().slice(0, 10);
    showToast('🚛 Order marked as Dispatch! Quantities updated.', 'success');
  } else if (newStatus === 'cancel') {
    showToast('🚫 Order has been Cancelled.', 'error');
  } else {
    showToast(`🔄 Status updated to ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}.`, 'info');
  }

  saveData();
  applyFilters();
  renderDashboard();
}

function updateOrderType(id, newType, el) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  o.type = newType;
  
  if (el) {
    el.className = 'type-select ' + typeToClass(newType);
  }

  saveData();
  applyFilters();
  renderDashboard();
  showToast(`✅ Type updated to ${newType}.`, 'success');
}

function typeToClass(type) {
  if (!type) return 'other';
  return type.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}


// ─── TOAST ───────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const div = document.createElement('div');
  div.className = `toast ${type}`;
  div.innerHTML = `<span>${icons[type] || '💬'}</span><span>${msg}</span>`;
  container.appendChild(div);
  setTimeout(() => {
    div.classList.add('removing');
    setTimeout(() => { if (div.parentNode) div.remove(); }, 300);
  }, 3500);
}


// ─── HELPERS ─────────────────────────────────────────────────
function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function formatNum(n) {
  const num = Number(n || 0);
  if (isNaN(num)) return '0';
  return num.toLocaleString('en-IN');
}
function fmtDate(d) {
  if (!d) return '—';
  try {
    const dt = new Date(String(d).includes('T') ? d : d + 'T00:00:00');
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return d; }
}

// ─── MODAL EVENTS ────────────────────────────────────────────
document.getElementById('order-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
document.getElementById('confirm-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeConfirm(); });

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeConfirm(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    switchView('orders');
    const si = document.getElementById('search-input');
    if (si) si.focus();
  }
});

// ─── INIT ────────────────────────────────────────────────────
(function init() {
  // Migration: Update Product Types to new list from User (One-time)
  if (!localStorage.getItem('maruti_mig_v1_types')) {
    masterData.types = [...DEFAULT_MASTER.types];
    saveMasterData();
    localStorage.setItem('maruti_mig_v1_types', 'true');
  }

  populateDropdowns();
  applyFilters();
  renderDashboard();
})();

// ─── DYNAMIC DROPDOWNS ────────────────────────────────────────
function populateDropdowns() {
  const filling = {
    'f-product': masterData.products,
    'f-type': masterData.types,
    'f-material': masterData.materials,
    'f-vendor': masterData.vendors
  };

  for (const [id, list] of Object.entries(filling)) {
    const el = document.getElementById(id);
    if (!el) continue;
    const currentVal = el.value;
    const label = id.split('-')[1].charAt(0).toUpperCase() + id.split('-')[1].slice(1);
    
    let html = `<option value="">— Select ${label} —</option>`;
    list.sort().forEach(item => {
      html += `<option value="${esc(item)}">${esc(item)}</option>`;
    });
    
    if (id === 'f-product') {
      html += `<option value="__custom__">+ Add Custom Product...</option>`;
    }
    
    el.innerHTML = html;
    el.value = currentVal;
  }
}

function renderMasterData() {
  const grid = document.getElementById('master-grid');
  if (!grid) return;

  const categories = [
    { key: 'products', label: 'Products', icon: '📦' },
    { key: 'types', label: 'Product Types', icon: '📁' },
    { key: 'materials', label: 'Materials & Processes', icon: '🛠️' },
    { key: 'vendors', label: 'Vendors', icon: '🏬', hasGst: true }
  ];

  grid.innerHTML = categories.map(cat => `
    <div class="master-card">
      <div class="master-card-header">
        <span>${cat.icon}</span>
        <span>${cat.label}</span>
        ${cat.hasGst ? '<span style="font-size:10px;color:var(--text-muted);margin-left:auto;">Name + GST No. (optional)</span>' : ''}
      </div>
      <div class="master-list">
        ${masterData[cat.key].sort().map((item) => {
          const gst = cat.hasGst ? (masterData.vendorGst?.[item] || '') : '';
          return `
          <div class="master-item">
            <div style="flex:1;min-width:0;">
              <div class="master-item-text">${esc(item)}</div>
              ${gst ? `<div style="font-size:10px;color:var(--text-muted);margin-top:1px;">GST: ${esc(gst)}</div>` : ''}
            </div>
            <div class="master-item-del" onclick="deleteMasterItem('${cat.key}', '${esc(item)}')">✕</div>
          </div>`;
        }).join('')}
      </div>
      <div class="master-card-footer" style="${cat.hasGst ? 'flex-direction:column;gap:6px;' : ''}">
        ${cat.hasGst ? `
          <div style="display:flex;gap:6px;">
            <input type="text" class="form-control master-add-input" id="add-${cat.key}" placeholder="Vendor name..." style="flex:2;" />
            <input type="text" class="form-control master-add-input" id="add-${cat.key}-gst" placeholder="GST No. (optional)" style="flex:2;text-transform:uppercase;" maxlength="15" />
            <button class="btn btn-primary btn-sm" onclick="addMasterItem('${cat.key}')">Add</button>
          </div>
        ` : `
          <input type="text" class="form-control master-add-input" id="add-${cat.key}" placeholder="Add new..." onkeydown="if(event.key==='Enter') addMasterItem('${cat.key}')" />
          <button class="btn btn-primary btn-sm" onclick="addMasterItem('${cat.key}')">Add</button>
        `}
      </div>
    </div>
  `).join('');
}

function addMasterItem(key) {
  const input = document.getElementById('add-' + key);
  const val = input.value.trim();
  if (!val) return;
  if (masterData[key].includes(val)) { showToast('Item already exists!', 'warning'); return; }
  
  masterData[key].push(val);

  // Handle vendor GST
  if (key === 'vendors') {
    const gstInput = document.getElementById('add-' + key + '-gst');
    if (gstInput) {
      const gst = gstInput.value.trim().toUpperCase();
      if (gst) masterData.vendorGst[val] = gst;
      gstInput.value = '';
    }
  }

  saveMasterData();
  input.value = '';
  renderMasterData();
  populateDropdowns();
  showToast(`Added successfully!`, 'success');
}

function deleteMasterItem(key, val) {
  if (!confirm(`Are you sure you want to delete "${val}"?`)) return;
  masterData[key] = masterData[key].filter(x => x !== val);
  if (key === 'vendors' && masterData.vendorGst) delete masterData.vendorGst[val];
  saveMasterData();
  renderMasterData();
  populateDropdowns();
  showToast(`Deleted successfully.`, 'info');
}

// ─── AUTO-FILL VENDOR GST ────────────────────────────────────
function autoFillVendorGst(vendorName) {
  const gstField = document.getElementById('f-party-gst');
  if (!gstField) return;
  const gst = masterData.vendorGst?.[vendorName] || '';
  if (gst && !gstField.value) {
    gstField.value = gst;
  }
}
