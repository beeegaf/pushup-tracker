// ===== Constants =====
const GOAL = 100;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * 85; // matches SVG circle r=85

// ===== DOM Elements =====
const todayCountEl = document.getElementById('todayCount');
const remainingTextEl = document.getElementById('remainingText');
const progressFill = document.querySelector('.progress-ring-fill');
const progressText = document.querySelector('.progress-text');
const currentStreakEl = document.getElementById('currentStreak');
const bestStreakEl = document.getElementById('bestStreak');
const totalPushupsEl = document.getElementById('totalPushups');
const historyGrid = document.getElementById('historyGrid');
const customAmountInput = document.getElementById('customAmount');
const addCustomBtn = document.getElementById('addCustomBtn');
const undoBtn = document.getElementById('undoBtn');
const remindersList = document.getElementById('remindersList');
const reminderLabelInput = document.getElementById('reminderLabel');
const reminderTimeInput = document.getElementById('reminderTime');
const addReminderBtn = document.getElementById('addReminderBtn');
const notificationStatusEl = document.getElementById('notificationStatus');

// ===== State =====
let lastAddedAmount = 0; // for undo

// ===== Helpers =====

function getTodayKey() {
  // Returns date string like "2026-02-06"
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function getDateKey(date) {
  return date.toISOString().split('T')[0];
}

function formatTime12h(time24) {
  // Converts "08:30" to "8:30 AM"
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

// ===== Data Layer (localStorage) =====

function loadPushupData() {
  const raw = localStorage.getItem('pushupData');
  return raw ? JSON.parse(raw) : {};
}

function savePushupData(data) {
  localStorage.setItem('pushupData', JSON.stringify(data));
}

function getTodayCount() {
  const data = loadPushupData();
  return data[getTodayKey()] || 0;
}

function setTodayCount(count) {
  const data = loadPushupData();
  data[getTodayKey()] = Math.max(0, count);
  savePushupData(data);
}

function loadReminders() {
  const raw = localStorage.getItem('reminders');
  return raw ? JSON.parse(raw) : [];
}

function saveReminders(reminders) {
  localStorage.setItem('reminders', JSON.stringify(reminders));
}

// ===== Progress Ring =====

function updateProgressRing(count) {
  const pct = Math.min(count / GOAL, 1);
  const offset = CIRCLE_CIRCUMFERENCE * (1 - pct);
  progressFill.style.strokeDashoffset = offset;
}

// ===== Update UI =====

function updateDisplay() {
  const count = getTodayCount();

  // Update count text
  todayCountEl.textContent = count;

  // Update remaining text
  if (count >= GOAL) {
    remainingTextEl.textContent = 'Goal reached!';
    remainingTextEl.classList.add('complete');
  } else {
    remainingTextEl.textContent = `${GOAL - count} to go!`;
    remainingTextEl.classList.remove('complete');
  }

  // Update progress ring
  updateProgressRing(count);

  // Update undo button
  undoBtn.disabled = lastAddedAmount === 0;

  // Update stats
  updateStats();

  // Update history
  renderHistory();
}

// ===== Add Pushups =====

function addPushups(amount) {
  if (amount <= 0) return;

  const current = getTodayCount();
  const wasUnderGoal = current < GOAL;

  setTodayCount(current + amount);
  lastAddedAmount = amount;

  // Trigger bump animation
  progressText.classList.remove('bump');
  // Force reflow to restart animation
  void progressText.offsetWidth;
  progressText.classList.add('bump');

  // Celebration if just hit goal
  if (wasUnderGoal && current + amount >= GOAL) {
    document.querySelector('.today-section').classList.add('celebrate');
    setTimeout(() => {
      document.querySelector('.today-section').classList.remove('celebrate');
    }, 500);
  }

  updateDisplay();
}

function undoLast() {
  if (lastAddedAmount === 0) return;
  const current = getTodayCount();
  setTodayCount(current - lastAddedAmount);
  lastAddedAmount = 0;
  updateDisplay();
}

// ===== Stats =====

function calculateStreaks() {
  const data = loadPushupData();
  const today = new Date();
  let currentStreak = 0;
  let bestStreak = 0;
  let tempStreak = 0;

  // Check consecutive days backwards from today
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = getDateKey(d);
    const count = data[key] || 0;

    if (count >= GOAL) {
      tempStreak++;
      if (i === currentStreak) {
        // Still counting from today
        currentStreak = tempStreak;
      }
    } else {
      // If today and count > 0 but not at goal, don't break current streak check
      // (the streak counts completed days only)
      if (i === 0 && count > 0) {
        // Today is in progress, check yesterday for streak
        tempStreak = 0;
        continue;
      }
      if (i === 0 && count === 0) {
        // Haven't started today, check yesterday for streak
        tempStreak = 0;
        continue;
      }
      tempStreak = 0;
    }
    bestStreak = Math.max(bestStreak, tempStreak);
  }

  // If today is not yet complete, calculate streak from yesterday
  const todayCount = data[getTodayKey()] || 0;
  if (todayCount < GOAL) {
    currentStreak = 0;
    for (let i = 1; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = getDateKey(d);
      if ((data[key] || 0) >= GOAL) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  return { currentStreak, bestStreak };
}

function calculateTotal() {
  const data = loadPushupData();
  return Object.values(data).reduce((sum, v) => sum + v, 0);
}

function updateStats() {
  const { currentStreak, bestStreak } = calculateStreaks();
  const total = calculateTotal();

  currentStreakEl.textContent = currentStreak;
  bestStreakEl.textContent = bestStreak;
  totalPushupsEl.textContent = total.toLocaleString();
}

// ===== History Grid =====

function renderHistory() {
  const data = loadPushupData();
  const today = new Date();
  historyGrid.innerHTML = '';

  // Show last 28 days (4 weeks)
  // Find the Monday that starts the grid (go back to fill a 4-week block)
  const daysToShow = 28;

  // Day-of-week headers
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  dayLabels.forEach(label => {
    const el = document.createElement('div');
    el.className = 'history-day future';
    el.innerHTML = `<span class="day-label">${label}</span>`;
    el.style.aspectRatio = 'auto';
    el.style.padding = '2px 0';
    historyGrid.appendChild(el);
  });

  // Calculate start date: go back 27 days from today, then adjust to Monday
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 27);
  // Adjust to previous Monday (0=Sun, 1=Mon, ..., 6=Sat)
  const dayOfWeek = startDate.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  startDate.setDate(startDate.getDate() + mondayOffset);

  // Calculate how many days to render (from that Monday through today's week's Sunday)
  const endDate = new Date(today);
  const endDayOfWeek = endDate.getDay();
  const sundayOffset = endDayOfWeek === 0 ? 0 : 7 - endDayOfWeek;
  endDate.setDate(endDate.getDate() + sundayOffset);

  const totalDays = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const key = getDateKey(d);
    const count = data[key] || 0;
    const isToday = key === getTodayKey();
    const isFuture = d > today && !isToday;

    const el = document.createElement('div');
    el.className = 'history-day';

    if (isFuture) {
      el.classList.add('future');
    } else if (count >= GOAL) {
      el.classList.add('done');
    } else if (count > 0) {
      el.classList.add('partial');
    } else {
      el.classList.add('missed');
    }

    if (isToday) {
      el.classList.add('today');
    }

    el.innerHTML = `<span class="day-number">${d.getDate()}</span>`;
    el.title = `${key}: ${count} pushups`;

    historyGrid.appendChild(el);
  }
}

// ===== Reminders =====

function renderReminders() {
  const reminders = loadReminders();
  remindersList.innerHTML = '';

  if (reminders.length === 0) {
    remindersList.innerHTML = '<p class="empty-reminders">No reminders set. Add one below.</p>';
    return;
  }

  // Sort by time
  reminders.sort((a, b) => a.time.localeCompare(b.time));

  reminders.forEach(r => {
    const item = document.createElement('div');
    item.className = 'reminder-item';
    item.innerHTML = `
      <span class="reminder-time">${formatTime12h(r.time)}</span>
      <span class="reminder-label">${escapeHtml(r.label)}</span>
      <input type="checkbox" class="reminder-toggle" data-id="${r.id}" ${r.enabled ? 'checked' : ''}>
      <button class="reminder-delete" data-id="${r.id}" title="Delete">&times;</button>
    `;
    remindersList.appendChild(item);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function addReminder() {
  const label = reminderLabelInput.value.trim();
  const time = reminderTimeInput.value;

  if (!label || !time) return;

  const reminders = loadReminders();
  const newReminder = {
    id: Date.now(),
    label,
    time,
    enabled: true
  };
  reminders.push(newReminder);
  saveReminders(reminders);

  reminderLabelInput.value = '';
  reminderTimeInput.value = '';
  renderReminders();
}

function toggleReminder(id) {
  const reminders = loadReminders();
  const r = reminders.find(r => r.id === id);
  if (r) {
    r.enabled = !r.enabled;
    saveReminders(reminders);
    renderReminders();
  }
}

function deleteReminder(id) {
  let reminders = loadReminders();
  reminders = reminders.filter(r => r.id !== id);
  saveReminders(reminders);
  renderReminders();
}

// ===== Notifications =====

function initNotifications() {
  if (!('Notification' in window)) {
    notificationStatusEl.textContent = 'Your browser does not support notifications.';
    notificationStatusEl.className = 'notification-status warning';
    return;
  }

  if (Notification.permission === 'default') {
    notificationStatusEl.innerHTML = '<button id="enableNotifBtn" class="add-btn" style="width:100%;padding:10px">Enable notifications</button>';
    notificationStatusEl.className = 'notification-status info';
    document.getElementById('enableNotifBtn').addEventListener('click', () => {
      Notification.requestPermission().then(perm => {
        initNotifications(); // re-run to update status
      });
    });
  } else if (Notification.permission === 'denied') {
    notificationStatusEl.textContent = 'Notifications are blocked. Enable them in your browser settings to receive reminders.';
    notificationStatusEl.className = 'notification-status warning';
  } else {
    // granted
    notificationStatusEl.style.display = 'none';
  }
}

// Track which reminders have already fired this minute to avoid repeats
const firedReminders = new Set();

function checkReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  const reminders = loadReminders();
  reminders.forEach(r => {
    if (!r.enabled) return;
    if (r.time !== currentTime) return;

    const fireKey = `${r.id}-${currentTime}`;
    if (firedReminders.has(fireKey)) return;

    // Fire this reminder
    firedReminders.add(fireKey);
    const remaining = Math.max(0, GOAL - getTodayCount());

    new Notification('Pushup Tracker', {
      body: `${r.label} (${remaining} remaining today)`,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="80" font-size="80">💪</text></svg>'
    });
  });

  // Clear fired set every new minute
  if (now.getSeconds() === 0) {
    firedReminders.clear();
  }
}

// ===== Event Listeners =====

// Quick-add buttons
document.querySelectorAll('.quick-buttons .add-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const amount = parseInt(btn.dataset.amount, 10);
    addPushups(amount);
  });
});

// Custom add
addCustomBtn.addEventListener('click', () => {
  const val = parseInt(customAmountInput.value, 10);
  if (val > 0) {
    addPushups(val);
    customAmountInput.value = '';
  }
});

// Allow pressing Enter in the custom input
customAmountInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    addCustomBtn.click();
  }
});

// Undo
undoBtn.addEventListener('click', undoLast);

// Reminders list (event delegation for toggles and deletes)
remindersList.addEventListener('change', (e) => {
  if (e.target.classList.contains('reminder-toggle')) {
    toggleReminder(Number(e.target.dataset.id));
  }
});

remindersList.addEventListener('click', (e) => {
  if (e.target.classList.contains('reminder-delete')) {
    deleteReminder(Number(e.target.dataset.id));
  }
});

// Add reminder
addReminderBtn.addEventListener('click', addReminder);

// Allow pressing Enter in the reminder label input
reminderLabelInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    addReminder();
  }
});

// ===== Init =====

function init() {
  updateDisplay();
  renderReminders();
  initNotifications();

  // Check reminders every 30 seconds
  setInterval(checkReminders, 30000);
  // Also check right away
  checkReminders();
}

init();
