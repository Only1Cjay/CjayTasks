/* ============================================================
   CjayTasks — app.js
   Single-file logic. Loaded via <script src="app.js" defer>.
   ============================================================ */
(function(){
'use strict';

/* ============================================================
   CONSTANTS
   ============================================================ */
const STORAGE_KEY = 'cjaytasks_v1';
const THEME_KEY = 'cjaytasks_theme';
const DRIVE_FOLDER = 'CjayTasks';
const DRIVE_FILE = 'cjay-tasks.json';
const CLIENT_KEY = 'cjay_gdrive_client_id';

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

/* ============================================================
   STATE
   ============================================================ */
let state = {
  tasks: [],
  templates: [],
  semStart: '',
  semEnd: ''
};

let ui = {
  activeView: 'list',            // 'list' | 'today' | 'upcoming'
  sortMode: 'manual',            // 'manual' | 'date' | 'priority' | 'created'
  search: '',
  filterPriority: 'all',         // 'all' | 'high' | 'medium' | 'low'
  filterCategory: '',
  historyFilter: 'week',         // 'week' | 'month' | 'all'
  editingTaskId: null,
  menuOpen: false,
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  viewOnly: false
};

let pendingUndo = null;
let tokenClient = null;
let accessToken = null;
let gapiReady = false;
let tokenResolvers = [];

/* ============================================================
   HELPERS
   ============================================================ */
function uid(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

/* ============================================================
   CUSTOM SELECT COMPONENT
   ============================================================ */
let openCustomSelect = null;

function buildCustomSelect({ container, options, value, placeholder, onChange, onOpen }){
  if(!container) return;

  let selected = options.find(o => o.value === value) || null;
  const label = selected ? selected.label : (placeholder || 'Select…');

  container.innerHTML = `
    <button type="button" class="custom-select-trigger">
      <span class="custom-select-label ${selected ? '' : 'placeholder'}">${esc(label)}</span>
      <i class="fas fa-chevron-down custom-select-chevron"></i>
    </button>
    <div class="custom-select-menu hidden">
      ${options.map(o => `
        <button type="button" class="custom-select-option ${o.value === value ? 'active' : ''}" data-value="${esc(o.value)}">
          <span>${esc(o.label)}</span>
          <i class="fas fa-check check-icon"></i>
        </button>
      `).join('')}
    </div>
  `;

  const trigger = container.querySelector('.custom-select-trigger');
  const menu = container.querySelector('.custom-select-menu');
  const labelEl = container.querySelector('.custom-select-label');

  function closeMenu(){
    container.classList.remove('open');
    menu.classList.add('hidden');
    if(openCustomSelect === container) openCustomSelect = null;
  }
  function openMenu(){
    if(openCustomSelect && openCustomSelect !== container){
      openCustomSelect.classList.remove('open');
      const m = openCustomSelect.querySelector('.custom-select-menu');
      if(m) m.classList.add('hidden');
    }
    container.classList.add('open');
    menu.classList.remove('hidden');
    openCustomSelect = container;
    if(typeof onOpen === 'function') onOpen();
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if(container.classList.contains('open')) closeMenu();
    else openMenu();
  });

  menu.querySelectorAll('.custom-select-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = opt.dataset.value;
      const chosen = options.find(o => o.value === val);
      if(chosen){
        labelEl.textContent = chosen.label;
        labelEl.classList.remove('placeholder');
      }
      menu.querySelectorAll('.custom-select-option').forEach(o =>
        o.classList.toggle('active', o.dataset.value === val));
      closeMenu();
      if(typeof onChange === 'function') onChange(val);
    });
  });

  container._closeMenu = closeMenu;
}

document.addEventListener('click', () => {
  if(openCustomSelect){
    const m = openCustomSelect.querySelector('.custom-select-menu');
    if(m) m.classList.add('hidden');
    openCustomSelect.classList.remove('open');
    openCustomSelect = null;
  }
});

/* ============================================================
   CUSTOM DATE PICKER
   ============================================================ */
let openDatePicker = null;

function buildDatePicker({ inputWrap, value, onChange }){
  if(!inputWrap) return;

  // Build the input field
  const inputId = 'dp-' + uid();
  inputWrap.innerHTML = `
    <input type="text" id="${inputId}" readonly placeholder="YYYY-MM-DD" value="${value || ''}">
    <button type="button" class="date-icon-btn"><i class="far fa-calendar"></i></button>
  `;

  const input = inputWrap.querySelector('input');
  const iconBtn = inputWrap.querySelector('.date-icon-btn');

  // Track displayed month
  const today = new Date();
  let pickerYear = value ? new Date(value + 'T00:00:00').getFullYear() : today.getFullYear();
  let pickerMonth = value ? new Date(value + 'T00:00:00').getMonth() : today.getMonth();
  let selectedValue = value || '';

  function renderPicker(){
    const popup = document.getElementById('datePickerPopup');
    if(!popup) return;

    const firstDay = new Date(pickerYear, pickerMonth, 1).getDay();
    const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();

    const todayISO = (() => {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    })();

    const labelEl = popup.querySelector('#dpLabel');
    const gridEl = popup.querySelector('#dpGrid');

    labelEl.textContent = MONTHS[pickerMonth] + ' ' + pickerYear;

    let html = '';
    for(let i = 0; i < firstDay; i++) html += `<div class="dp-cell empty"></div>`;
    for(let day = 1; day <= daysInMonth; day++){
      const iso = pickerYear + '-' + String(pickerMonth+1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
      const isToday = iso === todayISO;
      const isSelected = iso === selectedValue;
      html += `<button type="button" class="dp-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-iso="${iso}">${day}</button>`;
    }
    gridEl.innerHTML = html;

    gridEl.querySelectorAll('.dp-cell[data-iso]').forEach(cell => {
      cell.onclick = () => {
        selectedValue = cell.dataset.iso;
        input.value = selectedValue;
        closePicker();
        if(typeof onChange === 'function') onChange(selectedValue);
      };
    });
  }

  function positionPicker(){
    const popup = document.getElementById('datePickerPopup');
    if(!popup) return;
    const rect = input.getBoundingClientRect();
    const popupWidth = Math.min(Math.max(rect.width, 280), 340);
    const popupHeight = 380; // approximate

    // Prefer below the input, but if it doesn't fit, put it above
    let top = rect.bottom + 6;
    if(top + popupHeight > window.innerHeight - 12){
      top = Math.max(12, rect.top - popupHeight - 6);
    }

    // Keep it horizontally within the viewport
    let left = rect.left;
    if(left + popupWidth > window.innerWidth - 12){
      left = window.innerWidth - popupWidth - 12;
    }
    if(left < 12) left = 12;

    popup.style.position = 'fixed';
    popup.style.top = top + 'px';
    popup.style.left = left + 'px';
    popup.style.width = popupWidth + 'px';
  }

  function closePicker(){
    const popup = document.getElementById('datePickerPopup');
    if(!popup) return;
    popup.classList.add('hidden');
    openDatePicker = null;
    document.removeEventListener('click', outsideClick);
    window.removeEventListener('scroll', positionPicker, true);
  }

  function outsideClick(e){
    const popup = document.getElementById('datePickerPopup');
    if(!popup || popup.classList.contains('hidden')) return;
    if(e.target.closest('#datePickerPopup')) return;
    if(e.target === input || e.target === iconBtn) return;
    if(inputWrap.contains(e.target)) return;
    closePicker();
  }

  function openPicker(){
    if(openDatePicker && openDatePicker !== inputWrap){
      const p = document.getElementById('datePickerPopup');
      if(p) p.classList.add('hidden');
    }
    const popup = document.getElementById('datePickerPopup');
    if(!popup) return;
    popup.classList.remove('hidden');
    renderPicker();
    positionPicker();
    openDatePicker = inputWrap;
    setTimeout(() => {
      document.addEventListener('click', outsideClick);
      window.addEventListener('scroll', positionPicker, true);
    }, 10);
  }

  function togglePicker(){
    const popup = document.getElementById('datePickerPopup');
    if(!popup) return;
    if(popup.classList.contains('hidden')) openPicker();
    else closePicker();
  }

  input.addEventListener('click', (e) => { e.stopPropagation(); togglePicker(); });
  iconBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePicker(); });
  inputWrap._openPicker = openPicker;

  // Bind the shared popup nav + quick buttons once
  const popup = document.getElementById('datePickerPopup');
  if(popup && !popup._navBound){
    popup._navBound = true;
    popup.querySelectorAll('[data-dp-nav]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dir = Number(btn.dataset.dpNav);
        pickerMonth += dir;
        if(pickerMonth < 0){ pickerMonth = 11; pickerYear--; }
        if(pickerMonth > 11){ pickerMonth = 0; pickerYear++; }
        renderPicker();
      });
    });
    popup.querySelectorAll('[data-dp-quick]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const kind = btn.dataset.dpQuick;
        const d = new Date();
        if(kind === 'today'){}
        else if(kind === 'tomorrow'){ d.setDate(d.getDate() + 1); }
        else if(kind === 'clear'){
          selectedValue = '';
          const activeInput = openDatePicker ? openDatePicker.querySelector('input') : null;
          if(activeInput) activeInput.value = '';
          closePicker();
          // call onChange with empty string if we can find it
          if(activeInput && activeInput._onChange) activeInput._onChange('');
          return;
        }
        const iso = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
        selectedValue = iso;
        const activeInput = openDatePicker ? openDatePicker.querySelector('input') : null;
        if(activeInput){
          activeInput.value = iso;
          if(activeInput._onChange) activeInput._onChange(iso);
        }
        closePicker();
      });
    });
  }

  input._onChange = onChange;
}

function todayISO(d){
  d = d || new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth()+1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0');
}

function esc(s){
  if(s == null) return '';
  return String(s).replace(/[&<>"']/g, c => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
  ));
}

function parseDate(s){
  if(!s) return null;
  const d = new Date(s + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function niceDate(iso){
  const d = parseDate(iso);
  if(!d) return '—';
  return d.toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short', year:'numeric'});
}

function shortDate(iso){
  const d = parseDate(iso);
  if(!d) return '—';
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yest = new Date(); yest.setDate(today.getDate()-1);
  const isYest = d.toDateString() === yest.toDateString();
  const tomo = new Date(); tomo.setDate(today.getDate()+1);
  const isTomo = d.toDateString() === tomo.toDateString();
  if(isToday) return 'Today';
  if(isYest) return 'Yesterday';
  if(isTomo) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', {day:'numeric', month:'short'});
}

function startOfWeek(d){
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() - c.getDay());
  return c;
}

/* ============================================================
   LOCAL STORAGE
   ============================================================ */
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const p = JSON.parse(raw);
      state.tasks = Array.isArray(p.tasks) ? p.tasks : [];
      state.templates = Array.isArray(p.templates) ? p.templates : [];
      state.semStart = p.semStart || '';
      state.semEnd = p.semEnd || '';
    }
  }catch(e){ console.warn('Load failed', e); }
}

function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      tasks: state.tasks,
      templates: state.templates,
      semStart: state.semStart,
      semEnd: state.semEnd
    }));
  }catch(e){ console.warn('Save failed', e); }
}

/* ============================================================
   THEME
   ============================================================ */
function applyTheme(){
  const isDark = document.body.dataset.theme === 'dark';
  const icon = document.querySelector('#themeBtn i');
  if(icon) icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
}

function toggleTheme(){
  const isDark = document.body.dataset.theme === 'dark';
  const next = isDark ? 'light' : 'dark';
  document.body.dataset.theme = next;
  try{ localStorage.setItem(THEME_KEY, next); }catch(e){}
  applyTheme();
}

/* ============================================================
   TASK FILTERING + SORTING
   ============================================================ */
function activeTasks(){
  return state.tasks.filter(t => !t.done);
}

function tasksInView(){
  const today = todayISO();
  const active = activeTasks();

  if(ui.activeView === 'today'){
    return active.filter(t => t.dueDate === today);
  }
  if(ui.activeView === 'upcoming'){
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndISO = todayISO(weekEnd);
    return active.filter(t => t.dueDate && t.dueDate > today && t.dueDate <= weekEndISO);
  }
  return active;
}

function sortedTasks(arr){
  const copy = arr.slice();
  if(ui.sortMode === 'date'){
    copy.sort((a,b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  } else if(ui.sortMode === 'priority'){
    const order = {high:0, medium:1, low:2};
    copy.sort((a,b) => (order[a.priority] ?? 1) - (order[b.priority] ?? 1));
  } else if(ui.sortMode === 'created'){
    copy.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
  } else {
    copy.sort((a,b) => (a.order ?? 9999) - (b.order ?? 9999));
  }
  return copy;
}

function filteredTasks(){
  let arr = tasksInView();
  if(ui.search){
    const q = ui.search.toLowerCase();
    arr = arr.filter(t => {
      const hay = ((t.title||'') + ' ' + (t.category||'') + ' ' + (t.notes||'')).toLowerCase();
      return hay.includes(q);
    });
  }
  if(ui.filterPriority !== 'all'){
    arr = arr.filter(t => t.priority === ui.filterPriority);
  }
  if(ui.filterCategory){
    arr = arr.filter(t => t.category === ui.filterCategory);
  }
  return sortedTasks(arr);
}

function allCategories(){
  const set = new Set();
  state.tasks.forEach(t => { if(t.category && t.category.trim()) set.add(t.category.trim()); });
  return Array.from(set).sort((a,b) => a.localeCompare(b));
}

/* ============================================================
   RENDER — HERO
   ============================================================ */
function renderHero(){
  const today = todayISO();
  const todayTasks = state.tasks.filter(t => t.dueDate === today);
  const done = todayTasks.filter(t => t.done).length;
  const total = todayTasks.length;

  const pct = total ? Math.round((done / total) * 100) : 0;
  const circumference = 169.65;
  const offset = circumference * (1 - pct / 100);

  const ringFill = document.getElementById('heroRingFill');
  const ringPct = document.getElementById('heroRingPct');
  const title = document.getElementById('heroTitle');
  const sub = document.getElementById('heroSub');

  if(ringFill) ringFill.setAttribute('stroke-dashoffset', offset.toFixed(2));
  if(ringPct) ringPct.textContent = pct + '%';

  if(total === 0){
    if(title) title.textContent = 'All clear';
    if(sub) sub.textContent = 'Nothing on your plate right now.';
    return;
  }

  const remaining = total - done;
  if(remaining === 0){
    if(title) title.textContent = 'All done for today 🎉';
    if(sub) sub.textContent = 'Great work — everything due today is finished.';
  } else if(remaining === 1){
    if(title) title.textContent = '1 task due today';
    if(sub) sub.textContent = 'Almost there — one more to go.';
  } else {
    if(title) title.textContent = remaining + ' tasks due today';
    if(sub) sub.textContent = "Let's clear the list.";
  }
}

/* ============================================================
   RENDER — TASK LIST
   ============================================================ */
function renderTaskList(){
  const list = document.getElementById('taskList');
  const empty = document.getElementById('emptyState');
  const emptyTitle = document.getElementById('emptyTitle');
  const emptySub = document.getElementById('emptySub');
  if(!list) return;

  const items = filteredTasks();

  if(items.length === 0){
    list.innerHTML = '';
    if(empty) empty.classList.remove('hidden');

    // Contextual empty states
    let t = 'No tasks yet';
    let s = 'Tap the + button to add your first task.';
    if(ui.activeView === 'today'){
      t = 'Nothing due today';
      s = 'Enjoy the calm — or add something to work on.';
    } else if(ui.activeView === 'upcoming'){
      t = 'Nothing upcoming';
      s = 'The next 7 days are clear.';
    } else if(ui.search || ui.filterPriority !== 'all' || ui.filterCategory){
      t = 'No matches';
      s = 'Try adjusting your search or filters.';
    }
    if(emptyTitle) emptyTitle.textContent = t;
    if(emptySub) emptySub.textContent = s;
    return;
  }

  if(empty) empty.classList.add('hidden');

  list.innerHTML = items.map(task => {
    const isDone = !!task.done;
    const isOverdue = task.dueDate && task.dueDate < todayISO() && !isDone;
    const isToday = task.dueDate === todayISO();

    const datePillClass = isOverdue ? 'overdue' : (isToday ? 'today' : '');

    const priorityLabel = task.priority === 'high' ? 'High'
      : task.priority === 'low' ? 'Low' : '';

    return `<div class="task-card ${isDone?'done':''} priority-${task.priority||'medium'}" data-id="${task.id}">
      <div class="task-check" data-check="${task.id}">
        <i class="fas fa-check"></i>
      </div>
      <div class="task-main">
        <div class="task-title">${esc(task.title || 'Untitled task')}</div>
        <div class="task-meta">
          ${task.dueDate ? `<span class="meta-pill date ${datePillClass}"><i class="far fa-calendar"></i>${shortDate(task.dueDate)}</span>` : ''}
          ${priorityLabel ? `<span class="priority-badge ${task.priority}">${priorityLabel}</span>` : ''}
          ${task.category ? `<span class="meta-pill category"><i class="fas fa-tag"></i>${esc(task.category)}</span>` : ''}
          ${task.recurring ? `<span class="meta-pill recurring"><i class="fas fa-rotate"></i>${task.recurrenceType}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button class="task-action-btn delete" data-delete="${task.id}" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>`;
  }).join('');

  bindTaskCardEvents();
}

/* ============================================================
   TASK CARD BINDINGS
   ============================================================ */
function bindTaskCardEvents(){
  const list = document.getElementById('taskList');
  if(!list) return;

  // Checkbox → complete toggle
  list.querySelectorAll('[data-check]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if(ui.viewOnly) return;
      toggleTaskDone(el.dataset.check);
    });
  });

  // Delete button
  list.querySelectorAll('[data-delete]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if(ui.viewOnly) return;
      confirmDelete(el.dataset.delete);
    });
  });

  // Tap card → open detail modal
  list.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if(e.target.closest('[data-check]') || e.target.closest('[data-delete]')) return;
      openTaskModal(card.dataset.id);
    });
  });
}

/* ============================================================
   TASK OPERATIONS
   ============================================================ */
function toggleTaskDone(id){
  const task = state.tasks.find(t => t.id === id);
  if(!task) return;

  if(task.recurring && !task.done){
    // Recurring: roll forward
    task.lastCompletedDate = todayISO();
    task.completedDate = todayISO();

    if(task.recurrenceType === 'daily' || !task.recurrenceType){
      const d = parseDate(task.dueDate) || new Date();
      d.setDate(d.getDate() + 1);
      task.dueDate = todayISO(d);
    } else if(task.recurrenceType === 'weekly'){
      const d = parseDate(task.dueDate) || new Date();
      d.setDate(d.getDate() + 7);
      task.dueDate = todayISO(d);
    } else if(task.recurrenceType === 'monthly'){
      const d = parseDate(task.dueDate) || new Date();
      d.setMonth(d.getMonth() + 1);
      task.dueDate = todayISO(d);
    }
    // Keep done = false
    task.done = false;
    saveState();
    render();
    toast('Nice! Rescheduled to ' + shortDate(task.dueDate));
    return;
  }

  // Non-recurring
  if(!task.done){
    task.done = true;
    task.completedDate = todayISO();
    saveState();
    render();
    toast('Task complete', 'Undo', () => {
      task.done = false;
      task.completedDate = '';
      saveState();
      render();
    });
  } else {
    task.done = false;
    task.completedDate = '';
    saveState();
    render();
  }
}

function confirmDelete(id){
  const task = state.tasks.find(t => t.id === id);
  if(!task) return;
  openConfirmModal({
    title: 'Delete task?',
    message: `"${task.title || 'This task'}" will be permanently removed.`,
    confirmLabel: 'Delete',
    danger: true,
    onConfirm: () => {
      deleteTask(id);
      closeModal();
    }
  });
}

function deleteTask(id){
  const idx = state.tasks.findIndex(t => t.id === id);
  if(idx < 0) return;
  const removed = state.tasks[idx];
  state.tasks.splice(idx, 1);
  saveState();
  render();
  toast('Task deleted', 'Undo', () => {
    state.tasks.splice(idx, 0, removed);
    saveState();
    render();
  });
}

/* ============================================================
   MODAL SYSTEM
   ============================================================ */
const overlay = document.getElementById('modalOverlay');
const modal = document.getElementById('modalContent');

function openModal(html){
  modal.innerHTML = html;
  overlay.classList.add('active');
  const close = modal.querySelector('.close-x');
  if(close) close.onclick = closeModal;
}
function closeModal(){
  overlay.classList.remove('active');
  modal.innerHTML = '';
}

/* ============================================================
   CONFIRM MODAL
   ============================================================ */
function openConfirmModal({ title, message, confirmLabel, cancelLabel, danger, onConfirm }){
  openModal(`
    <div class="confirm-modal">
      <div class="confirm-icon ${danger ? 'danger' : ''}">
        <i class="fas fa-${danger ? 'triangle-exclamation' : 'circle-question'}"></i>
      </div>
      <h2 class="confirm-title">${esc(title || 'Are you sure?')}</h2>
      <p class="confirm-message">${esc(message || '')}</p>
      <div class="confirm-actions">
        <button type="button" class="confirm-btn cancel" id="confirmCancelBtn">
          ${esc(cancelLabel || 'Cancel')}
        </button>
        <button type="button" class="confirm-btn ${danger ? 'danger' : 'primary'}" id="confirmOkBtn">
          ${esc(confirmLabel || 'Confirm')}
        </button>
      </div>
    </div>
  `);

  document.getElementById('confirmCancelBtn').onclick = closeModal;
  document.getElementById('confirmOkBtn').onclick = () => {
    if(typeof onConfirm === 'function') onConfirm();
  };
}
overlay.addEventListener('click', (e) => {
  if(e.target === overlay) closeModal();
});

/* ============================================================
   ADD / EDIT TASK MODAL
   ============================================================ */
function openTaskModal(taskId){
  const editing = !!taskId;
  const task = editing
    ? state.tasks.find(t => t.id === taskId)
    : {
        id: uid(),
        title: '',
        dueDate: todayISO(),
        priority: 'medium',
        category: '',
        notes: '',
        recurring: false,
        recurrenceType: 'daily',
        done: false,
        completedDate: '',
        lastCompletedDate: '',
        order: state.tasks.length,
        createdAt: Date.now()
      };
  if(!task) return;
  ui.editingTaskId = task.id;

  const categories = allCategories();

  openModal(`
    <div class="modal-header">
      <h2>${editing ? 'Edit Task' : 'New Task'}</h2>
      <button class="close-x">&times;</button>
    </div>

    <div class="form-group">
      <label>Task</label>
      <input type="text" id="taskTitle" placeholder="What needs doing?" value="${esc(task.title)}" maxlength="120" autofocus>
    </div>

      <div class="form-row">
      <div class="form-group">
        <label>Due date</label>
        <div class="date-input-wrap" id="taskDueWrap"></div>
      </div>
      <div class="form-group">
        <label>Category</label>
        <input type="text" id="taskCategory" list="categoryList" placeholder="e.g. Study" value="${esc(task.category || '')}" maxlength="40">
        <datalist id="categoryList">${categories.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      </div>
    </div>

    <div class="form-group">
      <label>Priority</label>
      <div class="priority-grid" id="priorityGrid">
        <button type="button" data-prio="low" class="${task.priority==='low'?'active':''}">
          <i class="fas fa-circle" style="color:var(--teal);font-size:.6rem"></i> Low
        </button>
        <button type="button" data-prio="medium" class="${task.priority==='medium'?'active':''}">
          <i class="fas fa-circle" style="color:var(--amber);font-size:.6rem"></i> Medium
        </button>
        <button type="button" data-prio="high" class="${task.priority==='high'?'active':''}">
          <i class="fas fa-circle" style="color:var(--red);font-size:.6rem"></i> High
        </button>
      </div>
    </div>

    <div class="form-group">
      <label>Notes <span style="text-transform:none;font-weight:500;color:var(--muted)">(optional)</span></label>
      <textarea id="taskNotes" placeholder="Details, links, anything useful…" maxlength="800">${esc(task.notes || '')}</textarea>
    </div>

    <div class="form-group" style="flex-direction:row;align-items:center;gap:12px">
      <label style="padding:0;text-transform:none;font-size:.88rem;font-weight:600;color:var(--text);letter-spacing:0">
        Recurring task
      </label>
      <input type="checkbox" id="taskRecurring" ${task.recurring?'checked':''} style="width:20px;height:20px;accent-color:var(--accent);margin-left:auto">
    </div>

       <div class="form-group hidden" id="recurrenceGroup">
      <label>Repeat</label>
      <div class="custom-select" id="recurrenceSelect"></div>
    </div>

    <button type="button" class="btn btn-primary" id="saveTaskBtn">
      ${editing ? 'Save Changes' : 'Add Task'}
    </button>
    ${editing ? `<button type="button" class="btn btn-danger" id="deleteTaskBtn">Delete Task</button>` : ''}
  `);

   // Priority grid
  modal.querySelectorAll('#priorityGrid button').forEach(btn => {
    btn.onclick = () => {
      modal.querySelectorAll('#priorityGrid button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
  });

  // Custom date picker
  let taskDueValue = task.dueDate || '';
  buildDatePicker({
    inputWrap: document.getElementById('taskDueWrap'),
    value: taskDueValue,
    onChange: (v) => { taskDueValue = v; }
  });

  // Custom recurrence select
  let recurrenceValue = task.recurrenceType || 'daily';
  buildCustomSelect({
    container: document.getElementById('recurrenceSelect'),
    value: recurrenceValue,
    options: [
      { value: 'daily', label: 'Daily' },
      { value: 'weekly', label: 'Weekly' },
      { value: 'monthly', label: 'Monthly' }
    ],
    onChange: (v) => { recurrenceValue = v; }
  });

  // Recurring toggle
  const recurringCb = document.getElementById('taskRecurring');
  const recurrenceGroup = document.getElementById('recurrenceGroup');
  function updateRecurringVisibility(){
    recurrenceGroup.classList.toggle('hidden', !recurringCb.checked);
  }
  recurringCb.onchange = updateRecurringVisibility;
  updateRecurringVisibility();

  // Save
  document.getElementById('saveTaskBtn').onclick = () => {
    const title = document.getElementById('taskTitle').value.trim();
    if(!title){ toast('Enter a task title'); return; }

    const prioBtn = modal.querySelector('#priorityGrid button.active');
    task.title = title;
    task.dueDate = taskDueValue || '';
    task.category = document.getElementById('taskCategory').value.trim();
    task.priority = prioBtn ? prioBtn.dataset.prio : 'medium';
    task.notes = document.getElementById('taskNotes').value.trim();
    task.recurring = recurringCb.checked;
    task.recurrenceType = recurrenceValue || 'daily';

    if(!editing){
      state.tasks.unshift(task);
    }
    saveState();
    closeModal();
    render();
    toast(editing ? 'Task updated' : 'Task added');
  };

  // Delete
  if(editing){
    document.getElementById('deleteTaskBtn').onclick = () => {
      closeModal();
      setTimeout(() => {
        openConfirmModal({
          title: 'Delete task?',
          message: `"${task.title || 'This task'}" will be permanently removed.`,
          confirmLabel: 'Delete',
          danger: true,
          onConfirm: () => {
            deleteTask(task.id);
            closeModal();
          }
        });
      }, 200);
    };
  }
}

/* ============================================================
   SEARCH MODAL
   ============================================================ */
function openSearchModal(){
  const categories = allCategories();

  openModal(`
    <div class="modal-header">
      <h2>Search & Filter</h2>
      <button class="close-x">&times;</button>
    </div>

    <div class="form-group">
      <label>Search</label>
      <input type="text" id="searchInput" placeholder="Title, category, or notes…" value="${esc(ui.search)}" autofocus>
    </div>

      <div class="form-group">
      <label>Priority</label>
      <div class="custom-select" id="filterPrioritySelect"></div>
    </div>

    <div class="form-group">
      <label>Category</label>
      <div class="custom-select" id="filterCategorySelect"></div>
    </div>

    <button type="button" class="btn btn-primary" id="applySearchBtn">Apply</button>
    <button type="button" class="btn btn-secondary" id="resetSearchBtn">Reset</button>
  `);

  let filterPriorityValue = ui.filterPriority;
  let filterCategoryValue = ui.filterCategory;

  buildCustomSelect({
    container: document.getElementById('filterPrioritySelect'),
    value: filterPriorityValue,
    options: [
      { value: 'all', label: 'All priorities' },
      { value: 'high', label: 'High only' },
      { value: 'medium', label: 'Medium only' },
      { value: 'low', label: 'Low only' }
    ],
    onChange: (v) => { filterPriorityValue = v; }
  });

  const categoryOptions = [{ value: '', label: 'All categories' }]
    .concat(categories.map(c => ({ value: c, label: c })));
  buildCustomSelect({
    container: document.getElementById('filterCategorySelect'),
    value: filterCategoryValue,
    options: categoryOptions,
    placeholder: 'All categories',
    onChange: (v) => { filterCategoryValue = v; }
  });

  document.getElementById('applySearchBtn').onclick = () => {
    ui.search = document.getElementById('searchInput').value.trim();
    ui.filterPriority = filterPriorityValue;
    ui.filterCategory = filterCategoryValue;
    closeModal();
    render();
  };

  document.getElementById('resetSearchBtn').onclick = () => {
    ui.search = '';
    ui.filterPriority = 'all';
    ui.filterCategory = '';
    closeModal();
    render();
  };
}

/* ============================================================
   CALENDAR MODAL
   ============================================================ */
function openCalendarModal(){
  renderCalendarModal();
}

function renderCalendarModal(){
  const year = ui.calYear;
  const month = ui.calMonth;
  const today = todayISO();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let gridHtml = '';
  const dows = ['S','M','T','W','T','F','S'];
  dows.forEach(d => { gridHtml += `<div class="cal-dow">${d}</div>`; });

  for(let i = 0; i < firstDay; i++){
    gridHtml += `<div class="cal-cell empty"></div>`;
  }

  for(let day = 1; day <= daysInMonth; day++){
    const dateStr = year + '-' + String(month+1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
    const dayTasks = state.tasks.filter(t => t.dueDate === dateStr && !t.done);
    const isToday = dateStr === today;
    const hasTasks = dayTasks.length > 0;
    gridHtml += `<button type="button" class="cal-cell ${isToday?'today':''} ${hasTasks?'has-tasks':''}" data-date="${dateStr}">
      <span class="cal-num">${day}</span>
      ${hasTasks ? `<span class="cal-badge">${dayTasks.length}</span>` : ''}
    </button>`;
  }

  openModal(`
    <div class="modal-header">
      <h2>Calendar</h2>
      <button class="close-x">&times;</button>
    </div>

    <div class="cal-nav">
      <button type="button" class="icon-btn" id="calPrev"><i class="fas fa-chevron-left"></i></button>
      <div class="cal-label">${MONTHS[month]} ${year}</div>
      <button type="button" class="icon-btn" id="calNext"><i class="fas fa-chevron-right"></i></button>
    </div>

    <div class="cal-grid">${gridHtml}</div>

    <div id="calDayPanel" class="cal-day-panel hidden"></div>
  `);

  document.getElementById('calPrev').onclick = () => {
    ui.calMonth--;
    if(ui.calMonth < 0){ ui.calMonth = 11; ui.calYear--; }
    renderCalendarModal();
  };
  document.getElementById('calNext').onclick = () => {
    ui.calMonth++;
    if(ui.calMonth > 11){ ui.calMonth = 0; ui.calYear++; }
    renderCalendarModal();
  };

  // Day click → show tasks
  modal.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
    cell.onclick = () => {
      const dateStr = cell.dataset.date;
      const panel = document.getElementById('calDayPanel');
      const dayTasks = state.tasks.filter(t => t.dueDate === dateStr);
      if(dayTasks.length === 0){
        panel.innerHTML = `<div class="cal-day-title">${niceDate(dateStr)}</div>
          <div style="color:var(--muted);font-size:.85rem;padding:8px 0">No tasks on this day.</div>`;
      } else {
        panel.innerHTML = `<div class="cal-day-title">${niceDate(dateStr)}</div>
          ${dayTasks.map(t => `
            <div class="cal-task-row ${t.done?'done':''}">
              <span class="cal-task-dot priority-${t.priority||'medium'}"></span>
              <span class="cal-task-name">${esc(t.title || 'Untitled')}</span>
              ${t.done ? '<i class="fas fa-check" style="color:var(--teal);font-size:.75rem"></i>' : ''}
            </div>
          `).join('')}`;
      }
      panel.classList.remove('hidden');
    };
  });
}

/* ============================================================
   HISTORY MODAL
   ============================================================ */
function openHistoryModal(){
  renderHistoryModal();
}

function renderHistoryModal(){
  const filter = ui.historyFilter;
  const now = new Date();
  const weekStart = startOfWeek(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let completed = state.tasks.filter(t => t.done && t.completedDate);
  if(filter === 'week'){
    const weekStartISO = todayISO(weekStart);
    completed = completed.filter(t => t.completedDate >= weekStartISO);
  } else if(filter === 'month'){
    const monthStartISO = todayISO(monthStart);
    completed = completed.filter(t => t.completedDate >= monthStartISO);
  }

  completed.sort((a,b) => (b.completedDate || '').localeCompare(a.completedDate || ''));

  let listHtml = '';
  if(completed.length === 0){
    listHtml = `<div style="text-align:center;padding:32px 16px;color:var(--muted);font-size:.88rem">
      No completed tasks in this period.
    </div>`;
  } else {
    listHtml = completed.map(t => `
      <div class="history-row">
        <div class="history-check"><i class="fas fa-check"></i></div>
        <div class="history-main">
          <div class="history-title">${esc(t.title || 'Untitled')}</div>
          <div class="history-meta">
            ${t.category ? `📚 ${esc(t.category)} · ` : ''}${niceDate(t.completedDate)}
          </div>
        </div>
      </div>
    `).join('');
  }

  openModal(`
    <div class="modal-header">
      <h2>History</h2>
      <button class="close-x">&times;</button>
    </div>

    <div class="seg-control" id="historySeg">
      <button type="button" data-h="week" class="${filter==='week'?'active':''}">This Week</button>
      <button type="button" data-h="month" class="${filter==='month'?'active':''}">This Month</button>
      <button type="button" data-h="all" class="${filter==='all'?'active':''}">All Time</button>
    </div>

    <div style="margin-bottom:14px;font-size:.78rem;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.05em">
      ${completed.length} completed
    </div>

    <div class="history-list">${listHtml}</div>
  `);

  modal.querySelectorAll('#historySeg button').forEach(btn => {
    btn.onclick = () => {
      ui.historyFilter = btn.dataset.h;
      renderHistoryModal();
    };
  });
}

/* ============================================================
   REPORTS MODAL
   ============================================================ */
function openReportsModal(){
  const totalDone = state.tasks.filter(t => t.done).length;
  const totalActive = state.tasks.filter(t => !t.done).length;

  const weekStart = startOfWeek(new Date());
  const weekStartISO = todayISO(weekStart);
  const weekDone = state.tasks.filter(t => t.done && t.completedDate >= weekStartISO).length;

  openModal(`
    <div class="modal-header">
      <h2>Reports</h2>
      <button class="close-x">&times;</button>
    </div>

    <div class="report-stat-row">
      <div class="report-stat">
        <div class="report-stat-num">${totalActive}</div>
        <div class="report-stat-label">Active</div>
      </div>
      <div class="report-stat">
        <div class="report-stat-num">${weekDone}</div>
        <div class="report-stat-label">Done this week</div>
      </div>
      <div class="report-stat">
        <div class="report-stat-num">${totalDone}</div>
        <div class="report-stat-label">Done all-time</div>
      </div>
    </div>

    <button type="button" class="btn btn-primary" id="exportCsvBtn">
      <i class="fas fa-file-csv"></i> Export CSV
    </button>
    <button type="button" class="btn btn-secondary" id="exportIcsBtn">
      <i class="fas fa-calendar-plus"></i> Export tasks to Calendar (.ics)
    </button>
  `);

  document.getElementById('exportCsvBtn').onclick = exportCSV;
  document.getElementById('exportIcsBtn').onclick = exportICS;
}

/* ============================================================
   SETTINGS MODAL
   ============================================================ */
function openSettingsModal(){
  openModal(`
    <div class="modal-header">
      <h2>Settings</h2>
      <button class="close-x">&times;</button>
    </div>

      <div class="settings-block">
      <h4><i class="fas fa-list-check" style="color:var(--accent);margin-right:6px"></i> Sort order</h4>
      <div class="blk-sub">How your task list is ordered</div>
      <div class="custom-select" id="sortSelectWrap"></div>
    </div>
    
         <div class="settings-block">
      <h4><i class="fas fa-graduation-cap" style="color:var(--accent);margin-right:6px"></i> Semester dates</h4>
      <div class="blk-sub">Optional — helps track progress</div>
      <div class="form-row">
        <div class="form-group" style="margin:0">
          <label>Start</label>
          <div class="date-input-wrap" id="semStartWrap"></div>
        </div>
        <div class="form-group" style="margin:0">
          <label>End</label>
          <div class="date-input-wrap" id="semEndWrap"></div>
        </div>
      </div>
      <div id="semProgressWrap" class="hidden" style="margin-top:14px">
        <div class="sem-bar-track"><div class="sem-bar-fill" id="semBarFill"></div></div>
        <div class="sem-pct" id="semPctText"></div>
      </div>
    </div>

    <div class="settings-block">
      <h4><i class="fas fa-cloud" style="color:var(--accent);margin-right:6px"></i> Google Drive</h4>
      <div class="blk-sub">Sync your tasks to Drive (folder: CjayTasks)</div>
      <div class="form-group" style="margin-top:10px">
        <label>Client ID</label>
        <input type="text" id="clientIdInput" placeholder="xxxxx.apps.googleusercontent.com" value="${esc(localStorage.getItem(CLIENT_KEY)||'')}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:10px">
        <button type="button" class="btn btn-secondary" id="driveConnectBtn" style="margin:0;padding:12px;font-size:.78rem">
          <i class="fas fa-plug"></i> Connect
        </button>
        <button type="button" class="btn btn-secondary" id="drivePushBtn" style="margin:0;padding:12px;font-size:.78rem">
          <i class="fas fa-cloud-upload-alt"></i> Push
        </button>
        <button type="button" class="btn btn-secondary" id="drivePullBtn" style="margin:0;padding:12px;font-size:.78rem">
          <i class="fas fa-cloud-download-alt"></i> Pull
        </button>
      </div>
    </div>

    <div class="settings-block danger">
      <h4 style="color:var(--red)">Danger zone</h4>
      <div class="blk-sub">This cannot be undone</div>
      <button type="button" class="btn btn-danger" id="clearAllBtn" style="margin-top:8px">Clear all data</button>
    </div>

    <div style="text-align:center;color:var(--muted);font-size:.7rem;margin-top:16px">
      CjayTasks · <span id="versionTrigger">v1.0.0</span>
    </div>
  `);
   
    // Sort
  buildCustomSelect({
    container: document.getElementById('sortSelectWrap'),
    value: ui.sortMode,
    options: [
      { value: 'manual', label: 'Manual (as added)' },
      { value: 'date', label: 'By due date' },
      { value: 'priority', label: 'By priority' },
      { value: 'created', label: 'Newest first' }
    ],
    onChange: (v) => { ui.sortMode = v; render(); }
  });

  // Semester progress
  const progWrap = document.getElementById('semProgressWrap');
  const barFill = document.getElementById('semBarFill');
  const pctText = document.getElementById('semPctText');

  let semStartVal = state.semStart || '';
  let semEndVal = state.semEnd || '';

  function updateSemProgress(){
    if(!semStartVal || !semEndVal){ progWrap.classList.add('hidden'); return; }
    const start = new Date(semStartVal), end = new Date(semEndVal), now = new Date();
    const pct = Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
    progWrap.classList.remove('hidden');
    barFill.style.width = pct + '%';
    pctText.textContent = Math.round(pct) + '% through semester';
  }

  buildDatePicker({
    inputWrap: document.getElementById('semStartWrap'),
    value: semStartVal,
    onChange: (v) => { semStartVal = v; state.semStart = v; saveState(); updateSemProgress(); }
  });
  buildDatePicker({
    inputWrap: document.getElementById('semEndWrap'),
    value: semEndVal,
    onChange: (v) => { semEndVal = v; state.semEnd = v; saveState(); updateSemProgress(); }
  });
  updateSemProgress();

  // Drive
  document.getElementById('driveConnectBtn').onclick = driveConnect;
  document.getElementById('drivePushBtn').onclick = drivePush;
  document.getElementById('drivePullBtn').onclick = drivePull;
  document.getElementById('clientIdInput').onchange = (e) => {
    localStorage.setItem(CLIENT_KEY, e.target.value.trim());
    gapiReady = false; accessToken = null;
    toast('Client ID saved');
  };

  // Clear all
  document.getElementById('clearAllBtn').onclick = () => {
    closeModal();
    setTimeout(() => {
      openConfirmModal({
        title: 'Clear all data?',
        message: 'This will delete every task permanently. This cannot be undone.',
        confirmLabel: 'Clear All',
        danger: true,
        onConfirm: () => {
          state.tasks = [];
          state.templates = [];
          saveState();
          render();
          closeModal();
          toast('All data cleared');
        }
      });
    }, 200);
  };

  // Version
  const versionTrigger = document.getElementById('versionTrigger');
  if(versionTrigger){
    fetch('sw.js', { cache: 'no-store' }).then(r => r.text()).then(text => {
      const m = text.match(/CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/);
      if(m) versionTrigger.textContent = m[1];
    }).catch(() => {});
  }
}

/* ============================================================
   EXPORTS
   ============================================================ */
function exportCSV(){
  if(state.tasks.length === 0){ toast('No tasks to export'); return; }
  const headers = ['Title','Due Date','Priority','Category','Notes','Recurring','Recurrence','Done','Completed Date'];
  const rows = state.tasks.map(t => [
    t.title || '',
    t.dueDate || '',
    t.priority || '',
    t.category || '',
    t.notes || '',
    t.recurring ? 'yes' : 'no',
    t.recurrenceType || '',
    t.done ? 'yes' : 'no',
    t.completedDate || ''
  ]);
  const csv = [headers, ...rows].map(r =>
    r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')
  ).join('\n');
  downloadBlob(csv, 'text/csv', 'cjaytasks-export-' + todayISO() + '.csv');
  toast('CSV downloaded');
}

function exportICS(){
  const tasksWithDates = state.tasks.filter(t => t.dueDate && !t.done);
  if(tasksWithDates.length === 0){ toast('No dated tasks to export'); return; }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CjayTasks//EN',
    'CALSCALE:GREGORIAN'
  ];

  tasksWithDates.forEach(t => {
    const dt = t.dueDate.replace(/-/g,'');
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + t.id + '@cjaytasks');
    lines.push('DTSTAMP:' + new Date().toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z');
    lines.push('DTSTART;VALUE=DATE:' + dt);
    lines.push('DTEND;VALUE=DATE:' + dt);
    lines.push('SUMMARY:' + (t.title || 'Task').replace(/[\n,;]/g,' '));
    if(t.notes) lines.push('DESCRIPTION:' + t.notes.replace(/[\n,;]/g,' '));
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  downloadBlob(lines.join('\r\n'), 'text/calendar', 'cjaytasks-calendar-' + todayISO() + '.ics');
  toast('Calendar file downloaded');
}

function downloadBlob(content, mime, filename){
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ============================================================
   GOOGLE DRIVE SYNC
   ============================================================ */
async function initDrive(){
  const clientId = localStorage.getItem(CLIENT_KEY);
  if(!clientId) return false;
  if(gapiReady) return true;
  if(typeof gapi === 'undefined' || typeof google === 'undefined'){
    setTimeout(initDrive, 600);
    return false;
  }
  try{
    await new Promise(res => gapi.load('client', res));
    await gapi.client.init({
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
    });
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (resp) => {
        const resolvers = tokenResolvers; tokenResolvers = [];
        if(resp.access_token){
          accessToken = resp.access_token;
          gapi.client.setToken({ access_token: accessToken });
          resolvers.forEach(r => r(accessToken));
        } else {
          resolvers.forEach(r => r(null));
        }
      }
    });
    gapiReady = true;
    return true;
  }catch(e){
    console.warn('Drive init failed', e);
    return false;
  }
}

function ensureAccessToken(){
  if(accessToken) return Promise.resolve(accessToken);
  return new Promise(async (resolve, reject) => {
    if(!localStorage.getItem(CLIENT_KEY)){ reject(new Error('no client')); return; }
    if(!gapiReady){
      const ok = await initDrive();
      if(!ok){ reject(new Error('init failed')); return; }
    }
    tokenResolvers.push(tok => tok ? resolve(tok) : reject(new Error('auth failed')));
    tokenClient.requestAccessToken();
  });
}

async function driveConnect(){
  try{
    await ensureAccessToken();
    toast('Drive connected');
  }catch(e){ toast('Connection failed'); }
}

async function getOrCreateFolder(){
  const q = `mimeType='application/vnd.google-apps.folder' and name='${DRIVE_FOLDER}' and trashed=false`;
  const res = await gapi.client.drive.files.list({ q, fields:'files(id,name)', spaces:'drive' });
  if(res.result.files && res.result.files.length) return res.result.files[0].id;
  const created = await gapi.client.drive.files.create({
    resource: { name: DRIVE_FOLDER, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id'
  });
  return created.result.id;
}

async function findDriveFile(folderId){
  const q = `'${folderId}' in parents and name='${DRIVE_FILE}' and trashed=false`;
  const res = await gapi.client.drive.files.list({ q, fields:'files(id,name,modifiedTime)', spaces:'drive' });
  return (res.result.files && res.result.files[0]) || null;
}

async function drivePush(){
  try{
    await ensureAccessToken();
    const folderId = await getOrCreateFolder();
    const existing = await findDriveFile(folderId);
    const payload = JSON.stringify({
      tasks: state.tasks,
      templates: state.templates,
      semStart: state.semStart,
      semEnd: state.semEnd,
      pushedAt: new Date().toISOString()
    });
    if(existing){
      await gapi.client.request({
        path: `/upload/drive/v3/files/${existing.id}`,
        method: 'PATCH',
        params: { uploadType: 'media' },
        body: payload
      });
    } else {
      const form = new FormData();
      form.append('metadata', new Blob(
        [JSON.stringify({ name: DRIVE_FILE, mimeType:'application/json', parents:[folderId] })],
        {type:'application/json'}
      ));
      form.append('file', new Blob([payload], {type:'application/json'}));
      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + accessToken },
        body: form
      });
    }
    toast('Pushed to Drive');
  }catch(e){
    console.warn(e);
    toast('Push failed');
  }
}

async function drivePull(){
  try{
    await ensureAccessToken();
    const folderId = await getOrCreateFolder();
    const existing = await findDriveFile(folderId);
    if(!existing){ toast('No backup found'); return; }
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`,
      { headers: { Authorization: 'Bearer ' + accessToken } }
    );
    if(!res.ok){ toast('Pull failed'); return; }
    const cloud = await res.json();
    if(!cloud || !Array.isArray(cloud.tasks)){ toast('Backup is empty'); return; }

     const localCount = state.tasks.length;
    const cloudCount = cloud.tasks.length;

    closeModal();
    setTimeout(() => {
      openConfirmModal({
        title: 'Restore from Drive?',
        message: `Cloud has ${cloudCount} task${cloudCount!==1?'s':''}. Local has ${localCount}. This will replace local data.`,
        confirmLabel: 'Restore',
        danger: false,
        onConfirm: () => {
          state.tasks = cloud.tasks;
          state.templates = cloud.templates || [];
          state.semStart = cloud.semStart || '';
          state.semEnd = cloud.semEnd || '';
          saveState();
          render();
          closeModal();
          toast('Restored from Drive');
        }
      });
    }, 200);
  }catch(e){
    console.warn(e);
    toast('Pull failed');
  }
}

/* ============================================================
   MENU
   ============================================================ */
function initMenu(){
  const menuBtn = document.getElementById('menuBtn');
  const menuDropdown = document.getElementById('menuDropdown');
  if(!menuBtn || !menuDropdown) return;

  function openMenu(){
    ui.menuOpen = true;
    menuDropdown.classList.remove('hidden');
    menuBtn.setAttribute('aria-expanded', 'true');
  }
  function closeMenu(){
    ui.menuOpen = false;
    menuDropdown.classList.add('hidden');
    menuBtn.setAttribute('aria-expanded', 'false');
  }

  menuBtn.onclick = (e) => {
    e.stopPropagation();
    ui.menuOpen ? closeMenu() : openMenu();
  };
  document.addEventListener('click', (e) => {
    if(!ui.menuOpen) return;
    if(e.target.closest('.menu-wrap')) return;
    closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && ui.menuOpen) closeMenu();
  });

  document.getElementById('searchBtn').onclick = () => { closeMenu(); openSearchModal(); };
  document.getElementById('calendarBtn').onclick = () => { closeMenu(); openCalendarModal(); };
  document.getElementById('historyBtn').onclick = () => { closeMenu(); openHistoryModal(); };
  document.getElementById('reportsBtn').onclick = () => { closeMenu(); openReportsModal(); };
  document.getElementById('settingsBtn').onclick = () => { closeMenu(); openSettingsModal(); };
}

/* ============================================================
   OFFLINE BANNER
   ============================================================ */
function updateOnlineStatus(){
  const online = navigator.onLine;
  const banner = document.getElementById('offlineBanner');
  if(banner) banner.classList.toggle('show', !online);
  document.body.classList.toggle('offline', !online);
}

/* ============================================================
   TOAST
   ============================================================ */
let toastTimer = null;
function toast(msg, actionLabel, actionFn){
  const el = document.getElementById('toast');
  if(!el) return;
  el.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = msg;
  el.appendChild(span);
  if(actionLabel && actionFn){
    const btn = document.createElement('button');
    btn.textContent = actionLabel;
    btn.onclick = () => { actionFn(); el.classList.remove('show'); };
    el.appendChild(btn);
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 5000);
}

/* ============================================================
   UPDATE TOAST
   ============================================================ */
let updateToastTimer = null;
let updateToastDismissed = false;

function showUpdateToast(){
  if(updateToastDismissed) return;
  const existing = document.getElementById('updateToast');
  if(existing) return;

  const el = document.createElement('div');
  el.className = 'update-toast';
  el.id = 'updateToast';
  el.innerHTML = `
    <span>✨ New version available</span>
    <button class="update-refresh" id="updateRefreshBtn">Refresh</button>
    <button class="update-dismiss" id="updateDismissBtn">✕</button>
  `;
  el.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--text);color:var(--bg);padding:12px 18px;border-radius:999px;font-size:.82rem;font-weight:600;box-shadow:var(--shadow-lg);opacity:0;pointer-events:none;transition:.25s;z-index:3001;display:flex;align-items:center;gap:14px;max-width:calc(100vw - 40px);';
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
    el.style.pointerEvents = 'auto';
  });

  function hideToast(){
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(20px)';
    clearTimeout(updateToastTimer);
    setTimeout(() => el.remove(), 300);
  }

  updateToastTimer = setTimeout(hideToast, 5000);

  document.getElementById('updateRefreshBtn').style.cssText = 'background:var(--accent);color:#fff;border:none;padding:6px 14px;border-radius:999px;font-weight:700;font-size:.78rem;text-transform:uppercase;cursor:pointer;';
  document.getElementById('updateRefreshBtn').onclick = async () => {
    try{
      const reg = await navigator.serviceWorker.getRegistration();
      if(reg && reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
    }catch(e){}
    setTimeout(() => window.location.reload(), 200);
  };
  document.getElementById('updateDismissBtn').style.cssText = 'background:transparent;color:var(--bg);opacity:.6;border:none;font-size:1rem;cursor:pointer;';
  document.getElementById('updateDismissBtn').onclick = () => {
    updateToastDismissed = true;
    hideToast();
  };
}

window.addEventListener('sw-update-available', showUpdateToast);
if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('message', (event) => {
    if(event.data && event.data.type === 'UPDATE_AVAILABLE') showUpdateToast();
  });
}

/* ============================================================
   RENDER MASTER
   ============================================================ */
function render(){
  renderHero();
  renderTaskList();
}

/* ============================================================
   BINDINGS
   ============================================================ */
function bindEvents(){
  // Theme
  document.getElementById('themeBtn').onclick = toggleTheme;

  // Segmented control (List / Today / Upcoming)
  document.querySelectorAll('#viewSegControl button').forEach(btn => {
    btn.onclick = () => {
      ui.activeView = btn.dataset.view;
      document.querySelectorAll('#viewSegControl button').forEach(b =>
        b.classList.toggle('active', b.dataset.view === ui.activeView));
      render();
    };
  });

  // FAB
  document.getElementById('fabBtn').onclick = () => {
    if(ui.viewOnly) return;
    openTaskModal(null);
  };
}

/* ============================================================
   BOOT
   ============================================================ */
function boot(){
  // Load state
  loadState();

  // Theme
  applyTheme();

  // Offline banner
  updateOnlineStatus();
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // View-only mode
  const params = new URLSearchParams(window.location.search);
  if(params.get('view') === '1' || params.get('readonly') === '1'){
    ui.viewOnly = true;
    document.getElementById('viewBadge').classList.remove('hidden');
    const fab = document.getElementById('fabBtn');
    if(fab) fab.classList.add('hidden');
  }

  // Bind
  bindEvents();
  initMenu();

  // Render
  render();

  // Drive init (only if client ID set)
  initDrive();

  // Hide loading screen
  setTimeout(() => {
    const ls = document.getElementById('loadingScreen');
    if(ls){
      ls.classList.add('hidden');
      setTimeout(() => ls.remove(), 400);
    }
  }, 250);
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

})();
