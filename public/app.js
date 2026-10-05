/* ======================================================
   ExpenseFlow — App Logic (multi-user, server-backed)
   ====================================================== */

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  transactions: [],
  editingId:    null,
  deleteId:     null,
  currentMonth: (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })(),
  filters:      { search: '', category: '', type: '', from: '', to: '' },
  debounceTimer: null,
};

// ── Constants ─────────────────────────────────────────────────────────────────
const EXPENSE_CATS = ['Food', 'Transport', 'Shopping', 'Bills', 'Entertainment', 'Other'];
const INCOME_CATS  = ['Salary', 'Freelance', 'Investment'];
const ALL_CATS     = [...EXPENSE_CATS, ...INCOME_CATS];

const CAT_EMOJI = {
  Food: '🍔', Transport: '🚗', Shopping: '🛍️', Bills: '📄',
  Entertainment: '🎬', Other: '📦', Salary: '💼', Freelance: '💻', Investment: '📈',
};
const CAT_COLORS = {
  Food: '#ff6b6b', Transport: '#4ecdc4', Shopping: '#feca57',
  Bills: '#a29bfe', Entertainment: '#fd79a8', Other: '#636e72',
  Salary: '#55efc4', Freelance: '#74b9ff', Investment: '#fdcb6e',
};

// ── DOM ───────────────────────────────────────────────────────────────────────
const $ = sel => document.querySelector(sel);
const el = {
  addBtn:           $('#addExpenseBtn'),
  logoutBtn:        $('#logoutBtn'),
  userEmail:        $('#userEmail'),
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
  // Delete
  deleteModal:      $('#deleteModal'),
  cancelDelete:     $('#cancelDelete'),
  confirmDelete:    $('#confirmDelete'),
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
    el.categoryBreakdown.innerHTML = s.byCategory.map(c => `
      <div class="cat-row">
        <div class="cat-dot" style="background:${CAT_COLORS[c.category] || '#888'}"></div>
        <span class="cat-name">${CAT_EMOJI[c.category] || ''} ${c.category}</span>
        <span class="cat-amount">₹${fmtNum(c.total)}</span>
        <span class="cat-count">(${c.count})</span>
      </div>`).join('');
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
    return `
    <div class="expense-card" data-id="${t.id}" style="animation-delay:${i * 0.03}s">
      <div class="expense-cat-badge badge-${t.category.toLowerCase()}">${CAT_EMOJI[t.category] || '📦'}</div>
      <div class="expense-info">
        <div class="expense-title" title="${esc(t.title)}">${esc(t.title)}</div>
        <div class="expense-meta">
          <span>${fmtDate(t.date)}</span>
          <span class="dot"></span>
          <span style="color:${CAT_COLORS[t.category] || '#888'}">${t.category}</span>
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
    const pct = summary.expense > 0 ? c.total / summary.expense : 0;
    const dash = pct * circ;
    const s = { cat: c.category, dash, offset, color: CAT_COLORS[c.category] || '#888' };
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
    el.dateInput.value = new Date().toISOString().split('T')[0];
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
  // Uncheck radios that don't belong to the selected type
  document.querySelectorAll('input[name="category"]:checked').forEach(r => {
    const inExpense = EXPENSE_CATS.includes(r.value);
    if ((isExp && !inExpense) || (!isExp && inExpense)) r.checked = false;
  });
}

// ── Submit ────────────────────────────────────────────────────────────────────
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

// ── Delete ────────────────────────────────────────────────────────────────────
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

  // Event wiring
  el.addBtn.addEventListener('click', () => openModal());
  el.logoutBtn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    window.location.href = '/login.html';
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

  // Delete
  el.confirmDelete.addEventListener('click', confirmDeleteTxn);
  el.cancelDelete.addEventListener('click', () => { el.deleteModal.style.display = 'none'; state.deleteId = null; });
  el.deleteModal.addEventListener('click', e => { if (e.target === el.deleteModal) { el.deleteModal.style.display = 'none'; state.deleteId = null; } });

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
    if (el.deleteModal.style.display === 'flex')  { el.deleteModal.style.display = 'none'; state.deleteId = null; }
    else if (el.expenseModal.style.display === 'flex') closeModal();
  });

  fetchTransactions();
  fetchSummary();
}

document.addEventListener('DOMContentLoaded', init);
