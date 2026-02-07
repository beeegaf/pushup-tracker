// ===== Constants =====
const GOAL = 100;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * 85; // matches SVG circle r=85

// Medal definitions
const MEDALS = [
  // Milestone medals (total pushups)
  { id: 'bronze',   emoji: '🥉', name: 'Bronze',         desc: '500 pushups',    type: 'total', threshold: 500 },
  { id: 'silver',   emoji: '🥈', name: 'Silver',         desc: '1,000 pushups',  type: 'total', threshold: 1000 },
  { id: 'gold',     emoji: '🥇', name: 'Gold',           desc: '2,500 pushups',  type: 'total', threshold: 2500 },
  { id: 'diamond',  emoji: '💎', name: 'Diamond',        desc: '5,000 pushups',  type: 'total', threshold: 5000 },
  { id: 'legend',   emoji: '🏆', name: 'Legend',         desc: '10,000 pushups', type: 'total', threshold: 10000 },
  // Streak medals
  { id: 'week',     emoji: '🔥', name: 'Week Warrior',   desc: '7-day streak',   type: 'streak', threshold: 7 },
  { id: 'month',    emoji: '⚡', name: 'Monthly Machine', desc: '30-day streak',  type: 'streak', threshold: 30 },
  { id: 'century',  emoji: '👑', name: 'Centurion',      desc: '100-day streak', type: 'streak', threshold: 100 },
];

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
const medalsGrid = document.getElementById('medalsGrid');

// Friends view elements
const groupBanner = document.getElementById('groupBanner');
const joinGroupBtn = document.getElementById('joinGroupBtn');
const soloView = document.getElementById('soloView');
const friendsView = document.getElementById('friendsView');
const groupModal = document.getElementById('groupModal');
const displayNameInput = document.getElementById('displayNameInput');
const groupCodeInput = document.getElementById('groupCodeInput');
const confirmJoinBtn = document.getElementById('confirmJoinBtn');
const cancelJoinBtn = document.getElementById('cancelJoinBtn');
const modalError = document.getElementById('modalError');
const groupNameEl = document.getElementById('groupName');
const leaveGroupBtn = document.getElementById('leaveGroupBtn');
const leaderboardList = document.getElementById('leaderboardList');
const activityFeed = document.getElementById('activityFeed');
const inviteCodeEl = document.getElementById('inviteCode');
const copyCodeBtn = document.getElementById('copyCodeBtn');
const weeklyWinnerSection = document.getElementById('weeklyWinnerSection');
const weeklyWinnerName = document.getElementById('weeklyWinnerName');
const weeklyWinnerDetail = document.getElementById('weeklyWinnerDetail');

// ===== State =====
let lastAddedAmount = 0; // for undo
let currentSort = 'today'; // 'today' or 'streak'
let unsubscribeGroup = null; // Firestore listener unsubscribe function
let previousMemberStates = {}; // for detecting completions
let currentMembers = []; // latest snapshot of group members
let previousMedalIds = new Set(); // for detecting new medals

// ===== Helpers =====

function getTodayKey() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function getDateKey(date) {
  return date.toISOString().split('T')[0];
}

function formatTime12h(time24) {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getUserProfile() {
  const raw = localStorage.getItem('userProfile');
  return raw ? JSON.parse(raw) : null;
}

function getWeekKey(date) {
  // Returns "YYYY-Www" format for ISO week
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}

function getLastWeekKey() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return getWeekKey(d);
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

// ===== Firebase Auth & Groups =====

function initAuth() {
  auth.signInAnonymously().then(() => {
    const profile = getUserProfile();
    if (profile) {
      // Auto-rejoin the group
      joinGroup(profile.groupCode, profile.displayName, true);
      groupBanner.classList.remove('show');
    } else {
      groupBanner.classList.add('show');
    }
  }).catch(err => {
    console.log('Auth error:', err);
    // App still works in solo mode without auth
    const profile = getUserProfile();
    if (!profile) {
      groupBanner.classList.add('show');
    }
  });
}

async function joinGroup(groupCode, displayName, isReconnect) {
  const code = groupCode.toLowerCase().trim();
  const name = displayName.trim();

  if (!code || !name) {
    modalError.textContent = 'Please enter both a name and group code.';
    return;
  }

  if (code.length < 3) {
    modalError.textContent = 'Group code must be at least 3 characters.';
    return;
  }

  try {
    const groupRef = db.collection('groups').doc(code);
    const groupDoc = await groupRef.get();

    if (groupDoc.exists) {
      // Check if name is taken by someone else
      const memberRef = groupRef.collection('members').doc(name.toLowerCase());
      const memberDoc = await memberRef.get();

      if (memberDoc.exists && !isReconnect) {
        // Name exists — could be them on another device, allow it
        // (merge logic will handle data)
      }

      // Add member name to group members array
      await groupRef.update({
        members: firebase.firestore.FieldValue.arrayUnion(name)
      });
    } else {
      // Create new group
      await groupRef.set({
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        members: [name]
      });
    }

    // Upload current localStorage data to Firestore
    const localData = loadPushupData();
    const { currentStreak, bestStreak } = calculateStreaks();
    const todayCount = getTodayCount();

    const memberDocRef = groupRef.collection('members').doc(name.toLowerCase());
    const existingMember = await memberDocRef.get();

    if (existingMember.exists && isReconnect) {
      // Merge cloud data with local data
      const cloudData = existingMember.data().pushupData || {};
      mergeWithCloud(cloudData);
    }

    // Write merged data to Firestore
    const mergedData = loadPushupData();
    await memberDocRef.set({
      displayName: name,
      pushupData: mergedData,
      todayCount: mergedData[getTodayKey()] || 0,
      currentStreak: currentStreak,
      bestStreak: bestStreak,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Save profile locally
    localStorage.setItem('userProfile', JSON.stringify({
      groupCode: code,
      displayName: name
    }));

    // Update UI
    groupBanner.classList.remove('show');
    groupNameEl.textContent = code;
    inviteCodeEl.textContent = code;
    hideModal();

    // Start real-time listener
    startGroupListener(code);

    // Check for weekly winner
    checkWeeklyWinner(code);

  } catch (err) {
    console.error('Join group error:', err);
    modalError.textContent = 'Failed to join group. Check your connection and try again.';
  }
}

function leaveGroup() {
  if (unsubscribeGroup) {
    unsubscribeGroup();
    unsubscribeGroup = null;
  }
  localStorage.removeItem('userProfile');
  previousMemberStates = {};
  currentMembers = [];

  // Switch to solo view
  switchView('solo');
  groupBanner.classList.add('show');
  activityFeed.innerHTML = '';
  leaderboardList.innerHTML = '';
}

function mergeWithCloud(cloudData) {
  const localData = loadPushupData();
  const merged = { ...cloudData };

  // For each day, take the higher count (never lose pushups)
  for (const [date, count] of Object.entries(localData)) {
    if (!merged[date] || merged[date] < count) {
      merged[date] = count;
    }
  }

  savePushupData(merged);
}

// ===== Firestore Sync =====

function syncToFirestore() {
  const profile = getUserProfile();
  if (!profile) return; // Not in a group, skip

  const data = loadPushupData();
  const { currentStreak, bestStreak } = calculateStreaks();

  const memberRef = db.collection('groups').doc(profile.groupCode)
    .collection('members').doc(profile.displayName.toLowerCase());

  memberRef.update({
    pushupData: data,
    todayCount: data[getTodayKey()] || 0,
    currentStreak: currentStreak,
    bestStreak: bestStreak,
    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(err => {
    console.log('Sync error (will retry):', err.code);
  });
}

// ===== View Switching =====

function switchView(viewName) {
  const profile = getUserProfile();

  if (viewName === 'friends' && !profile) {
    // Not in a group — show the join modal
    showModal();
    return;
  }

  // Update tab buttons
  document.querySelectorAll('.view-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === viewName);
  });

  // Toggle views
  soloView.style.display = viewName === 'solo' ? 'block' : 'none';
  friendsView.style.display = viewName === 'friends' ? 'block' : 'none';
}

// ===== Modal =====

function showModal() {
  groupModal.style.display = 'flex';
  modalError.textContent = '';
  displayNameInput.value = '';
  groupCodeInput.value = '';
  displayNameInput.focus();
}

function hideModal() {
  groupModal.style.display = 'none';
  modalError.textContent = '';
}

// ===== Real-Time Leaderboard =====

function startGroupListener(groupCode) {
  if (unsubscribeGroup) unsubscribeGroup();

  unsubscribeGroup = db.collection('groups').doc(groupCode)
    .collection('members')
    .onSnapshot(snapshot => {
      const members = [];
      snapshot.forEach(doc => {
        members.push(doc.data());
      });

      currentMembers = members;

      // Check for friend completions
      checkForCompletions(members);

      // Update previous states
      members.forEach(m => {
        previousMemberStates[m.displayName] = {
          todayCount: m.todayCount || 0
        };
      });

      // Render the leaderboard
      renderLeaderboard(members);
    }, err => {
      console.error('Leaderboard listener error:', err);
    });
}

function renderLeaderboard(members) {
  const profile = getUserProfile();
  if (!profile) return;

  leaderboardList.innerHTML = '';

  if (members.length === 0) {
    leaderboardList.innerHTML = '<p class="leaderboard-empty">No members yet.</p>';
    return;
  }

  // Sort members
  const sorted = [...members].sort((a, b) => {
    if (currentSort === 'today') {
      return (b.todayCount || 0) - (a.todayCount || 0);
    } else {
      return (b.currentStreak || 0) - (a.currentStreak || 0);
    }
  });

  sorted.forEach((member, index) => {
    const isMe = member.displayName === profile.displayName;
    const todayCount = member.todayCount || 0;
    const streak = member.currentStreak || 0;
    const pushupData = member.pushupData || {};

    // Calculate medals for this member
    const memberMedals = calculateMedals(pushupData, member.bestStreak || streak);

    // Get last 7 days
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = getDateKey(d);
      last7.push(pushupData[key] || 0);
    }

    const item = document.createElement('div');
    item.className = `leaderboard-item${isMe ? ' is-me' : ''}`;

    const todayClass = todayCount >= GOAL ? 'stat-complete' : 'stat-highlight';
    const medalEmojis = memberMedals.filter(m => m.earned).map(m => m.emoji).join('');

    item.innerHTML = `
      <div class="member-header">
        <span class="member-rank">${index + 1}.</span>
        <span class="member-name${isMe ? ' is-me' : ''}">${escapeHtml(member.displayName)}</span>
        <span class="member-medals">${medalEmojis}</span>
      </div>
      <div class="member-stats">
        <span>Today: <span class="${todayClass}">${todayCount}</span></span>
        <span>Streak: <span class="stat-highlight">${streak}</span></span>
      </div>
      <div class="member-week">
        ${last7.map(count => {
          const cls = count >= GOAL ? 'done' : count > 0 ? 'partial' : 'missed';
          return `<span class="week-dot ${cls}">${count}</span>`;
        }).join('')}
      </div>
    `;

    leaderboardList.appendChild(item);
  });
}

// ===== Activity Feed =====

function checkForCompletions(members) {
  const profile = getUserProfile();
  if (!profile) return;

  members.forEach(member => {
    const prev = previousMemberStates[member.displayName];
    const todayCount = member.todayCount || 0;

    if (prev &&
        prev.todayCount < GOAL &&
        todayCount >= GOAL &&
        member.displayName !== profile.displayName) {
      // This friend just hit 100!
      addActivityItem(`${member.displayName} just completed 100! 💪`);
      notifyFriendCompletion(member.displayName);
    }
  });
}

function addActivityItem(message) {
  const item = document.createElement('div');
  item.className = 'activity-item';
  item.innerHTML = `<span class="activity-icon">🎉</span> ${escapeHtml(message)}`;
  activityFeed.prepend(item);

  // Limit to 5 items
  while (activityFeed.children.length > 5) {
    activityFeed.removeChild(activityFeed.lastChild);
  }

  // Auto-remove after 60 seconds
  setTimeout(() => {
    if (item.parentNode) item.remove();
  }, 60000);
}

function notifyFriendCompletion(friendName) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  new Notification('Pushup Tracker', {
    body: `${friendName} just completed their 100 pushups!`,
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="80" font-size="80">💪</text></svg>'
  });
}

// ===== Weekly Winner =====

async function checkWeeklyWinner(groupCode) {
  try {
    const groupRef = db.collection('groups').doc(groupCode);
    const groupDoc = await groupRef.get();
    const groupData = groupDoc.data();
    const lastWeek = getLastWeekKey();

    // Check if we already have a winner for last week
    const weeklyWinners = groupData.weeklyWinners || {};

    if (weeklyWinners[lastWeek]) {
      // Show existing winner
      showWeeklyWinner(weeklyWinners[lastWeek].name, weeklyWinners[lastWeek].total);
      return;
    }

    // Calculate last week's winner from member data
    const membersSnap = await groupRef.collection('members').get();
    let bestMember = null;
    let bestTotal = 0;

    // Get last week's Monday-Sunday dates
    const today = new Date();
    const lastMonday = new Date(today);
    lastMonday.setDate(lastMonday.getDate() - lastMonday.getDay() - 6); // Monday of last week
    if (lastMonday.getDay() !== 1) {
      lastMonday.setDate(lastMonday.getDate() - ((lastMonday.getDay() + 6) % 7));
    }

    membersSnap.forEach(doc => {
      const member = doc.data();
      const pushupData = member.pushupData || {};
      let weekTotal = 0;

      for (let i = 0; i < 7; i++) {
        const d = new Date(lastMonday);
        d.setDate(d.getDate() + i);
        const key = getDateKey(d);
        weekTotal += pushupData[key] || 0;
      }

      if (weekTotal > bestTotal) {
        bestTotal = weekTotal;
        bestMember = member.displayName;
      }
    });

    if (bestMember && bestTotal > 0) {
      // Store the winner
      await groupRef.update({
        [`weeklyWinners.${lastWeek}`]: {
          name: bestMember,
          total: bestTotal
        }
      });

      showWeeklyWinner(bestMember, bestTotal);
    }

  } catch (err) {
    console.log('Weekly winner check error:', err);
  }
}

function showWeeklyWinner(name, total) {
  weeklyWinnerName.textContent = name;
  weeklyWinnerDetail.textContent = `${total.toLocaleString()} pushups last week`;
  weeklyWinnerSection.style.display = 'block';
}

// ===== Medals =====

function calculateMedals(pushupData, bestStreak) {
  const total = Object.values(pushupData || {}).reduce((sum, v) => sum + v, 0);
  const streak = bestStreak || 0;

  return MEDALS.map(medal => {
    let earned = false;
    if (medal.type === 'total') {
      earned = total >= medal.threshold;
    } else if (medal.type === 'streak') {
      earned = streak >= medal.threshold;
    }
    return { ...medal, earned };
  });
}

function renderMedals() {
  const data = loadPushupData();
  const { bestStreak } = calculateStreaks();
  const medals = calculateMedals(data, bestStreak);

  medalsGrid.innerHTML = '';

  // Check for newly earned medals
  const currentEarnedIds = new Set(medals.filter(m => m.earned).map(m => m.id));

  medals.forEach(medal => {
    const item = document.createElement('div');
    const isNew = medal.earned && !previousMedalIds.has(medal.id) && previousMedalIds.size > 0;
    item.className = `medal-item ${medal.earned ? 'earned' : 'locked'}${isNew ? ' just-earned' : ''}`;
    item.innerHTML = `
      <span class="medal-emoji">${medal.emoji}</span>
      <div class="medal-info">
        <span class="medal-name">${medal.name}</span>
        <span class="medal-desc">${medal.desc}</span>
      </div>
    `;
    medalsGrid.appendChild(item);
  });

  previousMedalIds = currentEarnedIds;
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

  // Update medals
  renderMedals();

  // Update history
  renderHistory();
}

// ===== Celebration (Confetti) =====

function launchCelebration() {
  const colors = ['#4ade80', '#facc15', '#60a5fa', '#f87171', '#c084fc', '#fb923c', '#22d3ee'];

  // Create confetti container
  const container = document.createElement('div');
  container.className = 'confetti-container';
  document.body.appendChild(container);

  // Launch 80 confetti pieces
  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.width = (Math.random() * 8 + 6) + 'px';
    piece.style.height = (Math.random() * 8 + 6) + 'px';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    piece.style.animationDuration = (Math.random() * 1.5 + 1.5) + 's';
    piece.style.animationDelay = (Math.random() * 0.8) + 's';
    container.appendChild(piece);
  }

  // Show "GOAL!" banner
  const banner = document.createElement('div');
  banner.className = 'goal-banner';
  banner.innerHTML = `
    <span class="banner-emoji">💪🔥</span>
    <span class="banner-text">GOAL REACHED!</span>
    <span class="banner-sub">100 pushups today!</span>
  `;
  document.body.appendChild(banner);

  // Clean up after animation
  setTimeout(() => {
    container.remove();
    banner.remove();
  }, 3500);
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
  void progressText.offsetWidth;
  progressText.classList.add('bump');

  // Celebration if just hit goal
  if (wasUnderGoal && current + amount >= GOAL) {
    document.querySelector('.today-section').classList.add('celebrate');
    setTimeout(() => {
      document.querySelector('.today-section').classList.remove('celebrate');
    }, 500);
    launchCelebration();
  }

  updateDisplay();
  syncToFirestore(); // Sync to cloud
}

function undoLast() {
  if (lastAddedAmount === 0) return;
  const current = getTodayCount();
  setTodayCount(current - lastAddedAmount);
  lastAddedAmount = 0;
  updateDisplay();
  syncToFirestore(); // Sync to cloud
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
        currentStreak = tempStreak;
      }
    } else {
      if (i === 0 && count > 0) {
        tempStreak = 0;
        continue;
      }
      if (i === 0 && count === 0) {
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

  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 27);
  const dayOfWeek = startDate.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  startDate.setDate(startDate.getDate() + mondayOffset);

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
        initNotifications();
      });
    });
  } else if (Notification.permission === 'denied') {
    notificationStatusEl.textContent = 'Notifications are blocked. Enable them in your browser settings to receive reminders.';
    notificationStatusEl.className = 'notification-status warning';
  } else {
    notificationStatusEl.style.display = 'none';
  }
}

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

    firedReminders.add(fireKey);
    const remaining = Math.max(0, GOAL - getTodayCount());

    new Notification('Pushup Tracker', {
      body: `${r.label} (${remaining} remaining today)`,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="80" font-size="80">💪</text></svg>'
    });
  });

  if (now.getSeconds() === 0) {
    firedReminders.clear();
  }
}

// ===== Event Listeners =====

// View tabs
document.querySelectorAll('.view-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    switchView(tab.dataset.view);
  });
});

// Join group button (on banner)
joinGroupBtn.addEventListener('click', showModal);

// Modal buttons
confirmJoinBtn.addEventListener('click', () => {
  joinGroup(groupCodeInput.value, displayNameInput.value, false);
});

cancelJoinBtn.addEventListener('click', hideModal);

// Close modal on overlay click
groupModal.addEventListener('click', (e) => {
  if (e.target === groupModal) hideModal();
});

// Enter key in modal inputs
displayNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') groupCodeInput.focus();
});
groupCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmJoinBtn.click();
});

// Leave group
leaveGroupBtn.addEventListener('click', leaveGroup);

// Sort toggle
document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentSort = btn.dataset.sort;
    document.querySelectorAll('.sort-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.sort === currentSort);
    });
    renderLeaderboard(currentMembers);
  });
});

// Copy invite code
copyCodeBtn.addEventListener('click', () => {
  const code = inviteCodeEl.textContent;
  navigator.clipboard.writeText(code).then(() => {
    copyCodeBtn.textContent = 'Copied!';
    setTimeout(() => { copyCodeBtn.textContent = 'Copy'; }, 2000);
  });
});

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

customAmountInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    addCustomBtn.click();
  }
});

// Undo
undoBtn.addEventListener('click', undoLast);

// Reminders list (event delegation)
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

reminderLabelInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    addReminder();
  }
});

// ===== Init =====

function init() {
  // Initialize previous medals so first render doesn't trigger celebration
  const data = loadPushupData();
  const { bestStreak } = calculateStreaks();
  const medals = calculateMedals(data, bestStreak);
  previousMedalIds = new Set(medals.filter(m => m.earned).map(m => m.id));

  updateDisplay();
  renderReminders();
  initNotifications();

  // Check reminders every 30 seconds
  setInterval(checkReminders, 30000);
  checkReminders();

  // Firebase auth
  initAuth();
}

init();
