/* ======================================================
   ExpenseFlow — App Logic (multi-user, server-backed)
   ====================================================== */

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  transactions: [],
  categories:   [], // [{ id, name, type, emoji, color, is_default, is_custom }]
  editingId:    null,
  deleteId:     null,
  deleteCatId:  null,
  currentMonth: (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })(),
  filters:      { search: '', category: '', type: '', from: '', to: '' },
  debounceTimer: null,
};

// ── Palette presets & emojis for category creation ───────────────────────────
const PRESET_EMOJIS = [
  '🍔', '🚗', '🛍️', '📄', '🎬', '📦', '💼', '💻', '📈',
  '☕', '🏥', '✈️', '🎓', '🏋️', '🐾', '🏠', '🎁', '💡',
  '📚', '👗', '🎮', '🍕', '🚌', '💰', '🏷️', '🛠️'
];

const PRESET_COLORS = [
  '#ff6b6b', '#4ecdc4', '#feca57', '#a29bfe', '#fd79a8', '#636e72',
  '#55efc4', '#74b9ff', '#fdcb6e', '#10b981', '#6366f1', '#ec4899',
  '#f97316', '#8b5cf6', '#14b8a6', '#f43f5e'
];

function getCatMeta(name) {
  const c = state.categories.find(x => x.name.toLowerCase() === (name || '').toLowerCase());
  if (c) return { emoji: c.emoji || '📦', color: c.color || '#636e72' };
  return { emoji: '📦', color: '#636e72' };
}

// ── DOM ───────────────────────────────────────────────────────────────────────
const $ = sel => document.querySelector(sel);
const el = {
  addBtn:           $('#addExpenseBtn'),
  logoutBtn:        $('#logoutBtn'),
  userEmail:        $('#userEmail'),
  manageCatsBtn:    $('#manageCatsBtn'),
  openCatMgmtFromModal: $('#openCatMgmtFromModal'),
  prevMonth:        $('#prevMonth'),
  nextMonth:        $('#nextMonth'),
  currentMonth:     $('#currentMonth'),
  balanceAmount:    $('#balanceAmount'),
  incomeAmount:     $('#incomeAmount'),
  expenseAmount:    $('#expenseAmount'),
  donutChart:       $('#donutChart'),
  chartCenter:      $('#chartCenter'),
  chartCenterCount: $('#chartCenterCount'),
  chartEmpty:       $('#chartEmpty'),
  categoryBreakdown:$('#categoryBreakdown'),
  searchInput:      $('#searchInput'),
  typeFilter:       $('#typeFilter'),
  categoryFilter:   $('#categoryFilter'),
  dateFrom:         $('#dateFrom'),
  dateTo:           $('#dateTo'),
  clearFilters:     $('#clearFilters'),
  expensesList:     $('#expensesList'),
  emptyState:       $('#emptyState'),
  emptyTitle:       $('#emptyTitle'),
  emptySubtitle:    $('#emptySubtitle'),
  // Modal
  expenseModal:     $('#expenseModal'),
  modalTitle:       $('#modalTitle'),
  modalClose:       $('#modalClose'),
  expenseForm:      $('#expenseForm'),
  typeToggle:       $('#typeToggle'),
  typeInput:        $('#typeInput'),
  titleInput:       $('#titleInput'),
  amountInput:      $('#amountInput'),
  dateInput:        $('#dateInput'),
  noteInput:        $('#noteInput'),
  expenseCatPills:  $('#expenseCatPills'),
  incomeCatPills:   $('#incomeCatPills'),
  cancelBtn:        $('#cancelBtn'),
  submitBtn:        $('#submitBtn'),
  submitBtnText:    $('#submitBtnText'),
  // Errors
  titleError:       $('#titleError'),
  amountError:      $('#amountError'),
  dateError:        $('#dateError'),
  categoryError:    $('#categoryError'),
  // Delete Transaction
  deleteModal:      $('#deleteModal'),
  cancelDelete:     $('#cancelDelete'),
  confirmDelete:    $('#confirmDelete'),
  // Category Management Modal
  categoryModal:    $('#categoryModal'),
  catModalClose:    $('#catModalClose'),
  catMgmtList:      $('#catMgmtList'),
  btnToggleNewCat:  $('#btnToggleNewCat'),
  catForm:          $('#catForm'),
  catFormTitle:     $('#catFormTitle'),
  catFormId:        $('#catFormId'),
  catNameInput:     $('#catNameInput'),
  catNameError:     $('#catNameError'),
  catTypeToggle:    $('#catTypeToggle'),
  catTypeInput:     $('#catTypeInput'),
  emojiPickerRow:   $('#emojiPickerRow'),
  catEmojiInput:    $('#catEmojiInput'),
  colorPickerRow:   $('#colorPickerRow'),
  catColorInput:    $('#catColorInput'),
  catFormCancel:    $('#catFormCancel'),
  catFormSubmit:    $('#catFormSubmit'),
  // Delete Category Modal
  deleteCatModal:   $('#deleteCatModal'),
  deleteCatTitle:   $('#deleteCatTitle'),
  deleteCatDesc:    $('#deleteCatDesc'),
  cancelDeleteCat:  $('#cancelDeleteCat'),
  confirmDeleteCat: $('#confirmDeleteCat'),
  // Toast
  toastContainer:   $('#toastContainer'),
};

// ── API ───────────────────────────────────────────────────────────────────────
async function api(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (res.status === 401) { window.location.href = '/login.html'; return; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.errors ? data.errors.join(', ') : data.error || 'Request failed';
    throw new Error(msg);
  }
  return data;
}

// ── Categories Loading & Rendering ───────────────────────────────────────────
async function fetchCategories() {
  const cats = await api('/api/categories');
  if (cats) {
    state.categories = cats;
    renderCategoryFiltersAndPills();
  }
}

function renderCategoryFiltersAndPills() {
  const expCats = state.categories.filter(c => c.type === 'expense');
  const incCats = state.categories.filter(c => c.type === 'income');

  // 1. Update filter dropdown
  const currentSelectedFilter = el.categoryFilter.value;
  el.categoryFilter.innerHTML = `
    <option value="">All Categories</option>
    <optgroup label="Expenses">
      ${expCats.map(c => `<option value="${esc(c.name)}">${c.emoji || '📦'} ${esc(c.name)}</option>`).join('')}
    </optgroup>
    <optgroup label="Income">
      ${incCats.map(c => `<option value="${esc(c.name)}">${c.emoji || '💼'} ${esc(c.name)}</option>`).join('')}
    </optgroup>
  `;
  el.categoryFilter.value = currentSelectedFilter;

  // 2. Update form pills
  const checkedCat = document.querySelector('input[name="category"]:checked')?.value;

  el.expenseCatPills.innerHTML = expCats.map(c => `
    <label class="pill">
      <input type="radio" name="category" value="${esc(c.name)}" ${checkedCat === c.name ? 'checked' : ''} />
      <span>${c.emoji || '📦'} ${esc(c.name)}</span>
    </label>
  `).join('');

  el.incomeCatPills.innerHTML = incCats.map(c => `
    <label class="pill">
      <input type="radio" name="category" value="${esc(c.name)}" ${checkedCat === c.name ? 'checked' : ''} />
      <span>${c.emoji || '💼'} ${esc(c.name)}</span>
    </label>
  `).join('');
}

async function fetchTransactions() {
  const p = new URLSearchParams();
  const f = state.filters;
  if (f.search)   p.set('search',   f.search);
  if (f.category) p.set('category', f.category);
  if (f.type)     p.set('type',     f.type);
  if (f.from)     p.set('from',     f.from);
  if (f.to)       p.set('to',       f.to);
  const qs = p.toString();
  state.transactions = await api(`/api/expenses${qs ? '?' + qs : ''}`);
  renderList();
}

async function fetchSummary() {
  const [y, m] = state.currentMonth.split('-');
  el.currentMonth.textContent = new Date(y, m - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  const s = await api(`/api/expenses/summary?month=${state.currentMonth}`);
  if (!s) return;
  el.balanceAmount.textContent = fmt(s.balance);
  el.balanceAmount.style.color = s.balance >= 0 ? 'var(--income-color)' : 'var(--danger)';
  el.incomeAmount.textContent  = fmt(s.income);
  el.expenseAmount.textContent = fmt(s.expense);

  const totalCount = s.byCategory.reduce((a, c) => a + c.count, 0);
  if (s.expense === 0) {
    el.donutChart.innerHTML = '';
    el.chartCenter.style.display = 'none';
    el.chartEmpty.style.display  = 'flex';
  } else {
    el.chartEmpty.style.display  = 'none';
    el.chartCenter.style.display = 'flex';
    el.chartCenterCount.textContent = totalCount;
    renderDonut(s);
  }

  if (!s.byCategory.length) {
    el.categoryBreakdown.innerHTML = '<p style="font-size:.8rem;color:var(--text-muted);text-align:center;padding:.5rem">No expense data this month</p>';
  } else {
    // Properly HTML-escape dynamic category names from the server
    el.categoryBreakdown.innerHTML = s.byCategory.map(c => {
      const meta = getCatMeta(c.category);
      return `
      <div class="cat-row">
        <div class="cat-dot" style="background:${meta.color}"></div>
        <span class="cat-name">${meta.emoji} ${esc(c.category)}</span>
        <span class="cat-amount">₹${fmtNum(c.total)}</span>
        <span class="cat-count">(${c.count})</span>
      </div>`;
    }).join('');
  }
}

// ── Render: list ──────────────────────────────────────────────────────────────
function renderList() {
  const list = el.expensesList;
  if (!state.transactions.length) {
    list.innerHTML = '';
    const hasF = state.filters.search || state.filters.category || state.filters.type || state.filters.from || state.filters.to;
    el.emptyTitle.textContent    = hasF ? 'No matches found' : 'No transactions yet';
    el.emptySubtitle.textContent = hasF ? 'Try adjusting your filters.' : 'Click "Add Transaction" to start tracking your money.';
    el.emptyState.style.display  = 'flex';
    return;
  }
  el.emptyState.style.display = 'none';
  list.innerHTML = state.transactions.map((t, i) => {
    const isIncome = t.type === 'income';
    const meta = getCatMeta(t.category);
    return `
    <div class="expense-card" data-id="${t.id}" style="animation-delay:${i * 0.03}s">
      <div class="expense-cat-badge" style="background:${meta.color}26; color:${meta.color}; font-size:1.15rem;">
        ${meta.emoji}
      </div>
      <div class="expense-info">
        <div class="expense-title" title="${esc(t.title)}">${esc(t.title)}</div>
        <div class="expense-meta">
          <span>${fmtDate(t.date)}</span>
          <span class="dot"></span>
          <span style="color:${meta.color}">${esc(t.category)}</span>
          <span class="dot"></span>
          <span class="type-badge ${isIncome ? 'type-income' : 'type-expense'}">${isIncome ? '↑ Income' : '↓ Expense'}</span>
        </div>
        ${t.note ? `<div class="expense-note" title="${esc(t.note)}">${esc(t.note)}</div>` : ''}
      </div>
      <div class="expense-amount ${isIncome ? 'amount-income' : 'amount-expense'}">
        ${isIncome ? '+' : '-'}₹${fmtNum(t.amount)}
      </div>
      <div class="expense-actions">
        <button class="action-btn edit" data-action="edit" data-id="${t.id}" title="Edit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="action-btn delete" data-action="delete" data-id="${t.id}" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>`;
  }).join('');
}

// ── Donut ─────────────────────────────────────────────────────────────────────
function renderDonut(summary) {
  const cx = 100, cy = 100, r = 70, circ = 2 * Math.PI * r;
  let offset = 0;
  const segs = summary.byCategory.map(c => {
    const meta = getCatMeta(c.category);
    const pct = summary.expense > 0 ? c.total / summary.expense : 0;
    const dash = pct * circ;
    const s = { cat: c.category, dash, offset, color: meta.color };
    offset += dash;
    return s;
  });
  el.donutChart.innerHTML = segs.map((s, i) => `
    <circle class="donut-segment" cx="${cx}" cy="${cy}" r="${r}"
      stroke="${s.color}"
      stroke-dasharray="${s.dash} ${circ - s.dash}"
      stroke-dashoffset="${-(s.offset - s.dash)}"
      style="transition-delay:${i * 0.08}s" />`).join('');
}

// ── Modal: open / close ───────────────────────────────────────────────────────
function openModal(txn = null) {
  clearErrors();
  setType(txn ? txn.type : 'expense');
  const todayIso = new Date().toISOString().split('T')[0];
  el.dateInput.max = todayIso;

  if (txn) {
    state.editingId = txn.id;
    el.modalTitle.textContent   = 'Edit Transaction';
    el.submitBtnText.textContent = 'Update';
    el.titleInput.value  = txn.title;
    el.amountInput.value = txn.amount;
    el.dateInput.value   = txn.date;
    el.noteInput.value   = txn.note || '';
    const r = document.querySelector(`input[name="category"][value="${txn.category}"]`);
    if (r) r.checked = true;
  } else {
    state.editingId = null;
    el.modalTitle.textContent   = 'Add Transaction';
    el.submitBtnText.textContent = 'Save';
    el.expenseForm.reset();
    el.typeInput.value = 'expense';
    el.dateInput.value = todayIso;
  }
  el.expenseModal.style.display = 'flex';
  setTimeout(() => el.titleInput.focus(), 80);
}

function closeModal() {
  el.expenseModal.style.display = 'none';
  state.editingId = null;
}

// ── Type toggle ───────────────────────────────────────────────────────────────
function setType(type) {
  el.typeInput.value = type;
  el.typeToggle.querySelectorAll('.type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === type);
  });
  const isExp = type === 'expense';
  el.expenseCatPills.style.display = isExp ? 'flex' : 'none';
  el.incomeCatPills.style.display  = isExp ? 'none' : 'flex';

  const validCatsForType = state.categories.filter(c => c.type === type).map(c => c.name);
  document.querySelectorAll('input[name="category"]:checked').forEach(r => {
    if (!validCatsForType.includes(r.value)) r.checked = false;
  });
}

// ── Submit Transaction ────────────────────────────────────────────────────────
async function handleSubmit(e) {
  e.preventDefault();
  clearErrors();

  const data = {
    title:    el.titleInput.value,
    amount:   el.amountInput.value,
    date:     el.dateInput.value,
    type:     el.typeInput.value,
    category: document.querySelector('input[name="category"]:checked')?.value || '',
    note:     el.noteInput.value,
  };

  let valid = true;
  if (!data.title.trim())                       { showErr('title',    'Title is required'); valid = false; }
  if (!data.amount || Number(data.amount) <= 0) { showErr('amount',   'Enter a valid positive amount'); valid = false; }
  if (!data.date)                               { showErr('date',     'Date is required'); valid = false; }
  if (!data.category)                           { showErr('category', 'Pick a category'); valid = false; }
  if (!valid) return;

  el.submitBtn.disabled = true;
  try {
    if (state.editingId) {
      await api(`/api/expenses/${state.editingId}`, { method: 'PUT', body: JSON.stringify(data) });
      toast('Transaction updated', 'success');
    } else {
      await api('/api/expenses', { method: 'POST', body: JSON.stringify(data) });
      toast('Transaction saved', 'success');
    }
    closeModal();
    fetchTransactions();
    fetchSummary();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    el.submitBtn.disabled = false;
  }
}

// ── Delete Transaction ────────────────────────────────────────────────────────
function promptDelete(id) { state.deleteId = id; el.deleteModal.style.display = 'flex'; }

async function confirmDeleteTxn() {
  if (!state.deleteId) return;
  try {
    await api(`/api/expenses/${state.deleteId}`, { method: 'DELETE' });
    toast('Transaction deleted', 'success');
    el.deleteModal.style.display = 'none';
    state.deleteId = null;
    fetchTransactions(); fetchSummary();
  } catch (err) { toast(err.message, 'error'); }
}

// ── Month nav ─────────────────────────────────────────────────────────────────
function changeMonth(dir) {
  let [y, m] = state.currentMonth.split('-').map(Number);
  m += dir;
  if (m < 1)  { m = 12; y--; }
  if (m > 12) { m = 1;  y++; }
  state.currentMonth = `${y}-${String(m).padStart(2, '0')}`;
  fetchSummary();
}

// ── Filters ───────────────────────────────────────────────────────────────────
function applyFilters() {
  state.filters.search   = el.searchInput.value.trim();
  state.filters.category = el.categoryFilter.value;
  state.filters.type     = el.typeFilter.value;
  state.filters.from     = el.dateFrom.value;
  state.filters.to       = el.dateTo.value;
  fetchTransactions();
}
function debouncedFilter() {
  clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(applyFilters, 280);
}
function clearAllFilters() {
  el.searchInput.value = ''; el.categoryFilter.value = '';
  el.typeFilter.value  = ''; el.dateFrom.value = ''; el.dateTo.value = '';
  state.filters = { search: '', category: '', type: '', from: '', to: '' };
  fetchTransactions();
}

// ── Category Management Feature ───────────────────────────────────────────────
function initCategoryPickers() {
  // Emoji picker
  el.emojiPickerRow.innerHTML = PRESET_EMOJIS.map(em => `
    <div class="emoji-opt ${em === el.catEmojiInput.value ? 'selected' : ''}" data-emoji="${em}">${em}</div>
  `).join('');

  el.emojiPickerRow.addEventListener('click', e => {
    const opt = e.target.closest('.emoji-opt');
    if (!opt) return;
    el.emojiPickerRow.querySelectorAll('.emoji-opt').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
    el.catEmojiInput.value = opt.dataset.emoji;
  });

  // Color picker
  el.colorPickerRow.innerHTML = PRESET_COLORS.map(col => `
    <div class="color-opt ${col === el.catColorInput.value ? 'selected' : ''}" style="background:${col};" data-color="${col}"></div>
  `).join('');

  el.colorPickerRow.addEventListener('click', e => {
    const opt = e.target.closest('.color-opt');
    if (!opt) return;
    el.colorPickerRow.querySelectorAll('.color-opt').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
    el.catColorInput.value = opt.dataset.color;
  });

  // Type toggle in cat form
  el.catTypeToggle.addEventListener('click', e => {
    const btn = e.target.closest('.type-btn');
    if (!btn) return;
    el.catTypeToggle.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b === btn));
    el.catTypeInput.value = btn.dataset.type;
  });
}

function openCategoryModal() {
  renderCatMgmtList();
  hideCatForm();
  el.categoryModal.style.display = 'flex';
}

function closeCategoryModal() {
  el.categoryModal.style.display = 'none';
  hideCatForm();
}

function renderCatMgmtList() {
  if (!state.categories.length) {
    el.catMgmtList.innerHTML = '<div style="color:var(--text-muted);font-size:.84rem;text-align:center;padding:1rem;">No categories found</div>';
    return;
  }
  el.catMgmtList.innerHTML = state.categories.map(c => `
    <div class="cat-mgmt-item">
      <div class="cat-mgmt-left">
        <div class="cat-mgmt-badge" style="background:${c.color}22; color:${c.color}; border:1px solid ${c.color}44;">
          ${c.emoji || '📦'}
        </div>
        <div>
          <span class="cat-mgmt-title">${esc(c.name)}</span>
          <span class="cat-mgmt-tag ${c.type === 'income' ? 'tag-income' : 'tag-expense'}">${c.type}</span>
          ${c.is_default ? '<span style="font-size:.65rem;color:var(--text-muted);margin-left:.35rem;">(System)</span>' : '<span style="font-size:.65rem;color:var(--accent-light);margin-left:.35rem;">(Custom)</span>'}
        </div>
      </div>
      <div class="cat-mgmt-actions">
        ${c.is_custom ? `
          <button class="action-btn edit" data-cat-action="edit" data-id="${c.id}" title="Edit Category">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="action-btn delete" data-cat-action="delete" data-id="${c.id}" data-name="${esc(c.name)}" title="Delete Category">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        ` : `
          <span style="font-size:.72rem;color:var(--text-muted);padding-right:.3rem;">Default</span>
        `}
      </div>
    </div>
  `).join('');
}

function showCatForm(cat = null) {
  el.catForm.style.display = 'block';
  el.catNameError.textContent = '';
  if (cat) {
    el.catFormTitle.textContent = 'Edit Custom Category';
    el.catFormId.value = cat.id;
    el.catNameInput.value = cat.name;
    el.catTypeInput.value = cat.type;
    el.catEmojiInput.value = cat.emoji || '📦';
    el.catColorInput.value = cat.color || '#636e72';
  } else {
    el.catFormTitle.textContent = 'Create New Category';
    el.catFormId.value = '';
    el.catNameInput.value = '';
    el.catTypeInput.value = 'expense';
    el.catEmojiInput.value = '📦';
    el.catColorInput.value = '#636e72';
  }
  // Sync buttons & pickers
  el.catTypeToggle.querySelectorAll('.type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === el.catTypeInput.value);
  });
  el.emojiPickerRow.querySelectorAll('.emoji-opt').forEach(o => {
    o.classList.toggle('selected', o.dataset.emoji === el.catEmojiInput.value);
  });
  el.colorPickerRow.querySelectorAll('.color-opt').forEach(o => {
    o.classList.toggle('selected', o.dataset.color === el.catColorInput.value);
  });
  el.catNameInput.focus();
}

function hideCatForm() {
  el.catForm.style.display = 'none';
  el.catFormId.value = '';
  el.catNameInput.value = '';
}

async function handleCatFormSubmit(e) {
  e.preventDefault();
  el.catNameError.textContent = '';
  const name = el.catNameInput.value.trim();
  const type = el.catTypeInput.value;
  const emoji = el.catEmojiInput.value;
  const color = el.catColorInput.value;
  const id = el.catFormId.value;

  if (!name) {
    el.catNameError.textContent = 'Category name is required';
    return;
  }

  el.catFormSubmit.disabled = true;
  try {
    if (id) {
      // Edit
      await api(`/api/categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, type, emoji, color }),
      });
      toast('Category updated', 'success');
    } else {
      // Create
      await api('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name, type, emoji, color }),
      });
      toast('Category created', 'success');
    }
    hideCatForm();
    await fetchCategories();
    renderCatMgmtList();
    fetchTransactions();
    fetchSummary();
  } catch (err) {
    el.catNameError.textContent = err.message;
  } finally {
    el.catFormSubmit.disabled = false;
  }
}

function promptDeleteCategory(id, name) {
  state.deleteCatId = id;
  el.deleteCatTitle.textContent = `Delete "${name}"?`;
  el.deleteCatDesc.textContent = `Existing transactions under "${name}" will be automatically moved to 'Other'.`;
  el.deleteCatModal.style.display = 'flex';
}

async function confirmDeleteCategory() {
  if (!state.deleteCatId) return;
  try {
    await api(`/api/categories/${state.deleteCatId}`, { method: 'DELETE' });
    toast('Category deleted', 'success');
    el.deleteCatModal.style.display = 'none';
    state.deleteCatId = null;
    await fetchCategories();
    renderCatMgmtList();
    fetchTransactions();
    fetchSummary();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ── Validation helpers ────────────────────────────────────────────────────────
function showErr(field, msg) {
  const errEl = $(`#${field}Error`), inp = $(`#${field}Input`);
  if (errEl) errEl.textContent = msg;
  if (inp)   inp.classList.add('error');
}
function clearErrors() {
  document.querySelectorAll('.field-error').forEach(e => e.textContent = '');
  document.querySelectorAll('.input.error').forEach(e => e.classList.remove('error'));
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const div = document.createElement('div');
  div.className = `toast ${type}`;
  div.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${esc(msg)}</span>`;
  el.toastContainer.appendChild(div);
  setTimeout(() => {
    div.classList.add('leaving');
    div.addEventListener('animationend', () => div.remove(), { once: true });
  }, 3200);
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function fmtNum(n) { return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmt(n)    { return '₹' + fmtNum(n); }
function fmtDate(s){ return new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }

// ── Auth guard + init ─────────────────────────────────────────────────────────
async function init() {
  // Check session — redirect to login if not authenticated
  try {
    const me = await api('/api/auth/me');
    if (!me) return; // api() already redirected
    el.userEmail.textContent = me.email;
  } catch {
    window.location.href = '/login.html';
    return;
  }

  // Initialize category pickers
  initCategoryPickers();

  // Event wiring
  el.addBtn.addEventListener('click', () => openModal());
  el.manageCatsBtn.addEventListener('click', openCategoryModal);
  if (el.openCatMgmtFromModal) {
    el.openCatMgmtFromModal.addEventListener('click', () => {
      closeModal();
      openCategoryModal();
    });
  }

  el.logoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    } catch (_) {}
    // Clear state in memory
    state.transactions = [];
    state.categories = [];
    // Use location.replace so the authenticated page is replaced in browser history
    window.location.replace('/login.html');
  });

  // Modal
  el.expenseForm.addEventListener('submit', handleSubmit);
  el.cancelBtn.addEventListener('click', closeModal);
  el.modalClose.addEventListener('click', closeModal);
  el.expenseModal.addEventListener('click', e => { if (e.target === el.expenseModal) closeModal(); });

  // Type toggle (event delegation on container)
  el.typeToggle.addEventListener('click', e => {
    const btn = e.target.closest('.type-btn');
    if (btn) setType(btn.dataset.type);
  });

  // Delete Transaction
  el.confirmDelete.addEventListener('click', confirmDeleteTxn);
  el.cancelDelete.addEventListener('click', () => { el.deleteModal.style.display = 'none'; state.deleteId = null; });
  el.deleteModal.addEventListener('click', e => { if (e.target === el.deleteModal) { el.deleteModal.style.display = 'none'; state.deleteId = null; } });

  // Category Management Events
  el.catModalClose.addEventListener('click', closeCategoryModal);
  el.categoryModal.addEventListener('click', e => { if (e.target === el.categoryModal) closeCategoryModal(); });
  el.btnToggleNewCat.addEventListener('click', () => showCatForm());
  el.catFormCancel.addEventListener('click', hideCatForm);
  el.catForm.addEventListener('submit', handleCatFormSubmit);

  el.catMgmtList.addEventListener('click', e => {
    const btn = e.target.closest('[data-cat-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const action = btn.dataset.catAction;
    if (action === 'edit') {
      const cat = state.categories.find(c => c.id === id);
      if (cat) showCatForm(cat);
    } else if (action === 'delete') {
      promptDeleteCategory(id, btn.dataset.name || 'Category');
    }
  });

  el.confirmDeleteCat.addEventListener('click', confirmDeleteCategory);
  el.cancelDeleteCat.addEventListener('click', () => { el.deleteCatModal.style.display = 'none'; state.deleteCatId = null; });
  el.deleteCatModal.addEventListener('click', e => { if (e.target === el.deleteCatModal) { el.deleteCatModal.style.display = 'none'; state.deleteCatId = null; } });

  // Month nav
  el.prevMonth.addEventListener('click', () => changeMonth(-1));
  el.nextMonth.addEventListener('click', () => changeMonth(1));

  // Filters
  el.searchInput.addEventListener('input', debouncedFilter);
  el.categoryFilter.addEventListener('change', applyFilters);
  el.typeFilter.addEventListener('change', applyFilters);
  el.dateFrom.addEventListener('change', applyFilters);
  el.dateTo.addEventListener('change', applyFilters);
  el.clearFilters.addEventListener('click', clearAllFilters);

  // Event delegation for edit / delete buttons on cards
  el.expensesList.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (btn.dataset.action === 'edit') {
      const txn = state.transactions.find(t => t.id === id);
      if (txn) openModal(txn);
    } else if (btn.dataset.action === 'delete') {
      promptDelete(id);
    }
  });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (el.deleteCatModal.style.display === 'flex') { el.deleteCatModal.style.display = 'none'; state.deleteCatId = null; }
    else if (el.deleteModal.style.display === 'flex') { el.deleteModal.style.display = 'none'; state.deleteId = null; }
    else if (el.categoryModal.style.display === 'flex') closeCategoryModal();
    else if (el.expenseModal.style.display === 'flex') closeModal();
  });

  // Initial data loading
  await fetchCategories();
  fetchTransactions();
  fetchSummary();
document.addEventListener('DOMContentLoaded', init);

// If the page is restored from back-forward cache (bfcache) when user hits browser Back button
window.addEventListener('pageshow', async event => {
  if (event.persisted) {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Cache-Control': 'no-cache, no-store' }
      });
      if (res.status === 401 || !res.ok) {
        window.location.replace('/login.html');
      }
    } catch {
      window.location.replace('/login.html');
    }
  }
});
