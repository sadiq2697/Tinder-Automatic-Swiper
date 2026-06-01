// Auto Swiper Dashboard v3.0

let stats = {};
let history = { swipes: [], sessions: [] };
let currentPage = 1;
const itemsPerPage = 20;
let filterText = '';

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  setupEventListeners();
});

function loadData() {
  chrome.storage.local.get(['stats', 'history'], (data) => {
    stats = data.stats || {};
    history = data.history || { swipes: [], sessions: [] };
    updateDashboard();
  });
}

function updateDashboard() {
  updateStatsCards();
  updateCharts();
  updateHistoryTable();
  updateSessions();
}

function updateStatsCards() {
  document.getElementById('totalLikes').textContent = stats.totalLikes || 0;
  document.getElementById('totalDislikes').textContent = stats.totalDislikes || 0;
  document.getElementById('totalMatches').textContent = stats.matchCount || 0;
  document.getElementById('streakDays').textContent = stats.streakDays || 0;
  document.getElementById('totalSessions').textContent = stats.sessionsCount || 0;
}

// Charts
let ratioChart = null;
let activityChart = null;

// Pull chart colors from the CSS design tokens so the diagrams stay in sync
// with the theme. Reskinning via :root automatically recolors the charts.
function chartPalette() {
  const css = getComputedStyle(document.documentElement);
  const v = (name, fallback) => (css.getPropertyValue(name).trim() || fallback);
  return {
    like: v('--like', '#16a34a'),
    pass: v('--pass', '#dc2626'),
    text: v('--text-dim', '#71717a'),
    grid: v('--hairline', '#e4e4e7'),
  };
}

function updateCharts() {
  updateRatioChart();
  updateActivityChart();
}

function updateRatioChart() {
  const ctx = document.getElementById('ratioChart').getContext('2d');
  const likes = stats.totalLikes || 0;
  const dislikes = stats.totalDislikes || 0;

  if (ratioChart) {
    ratioChart.destroy();
  }

  const palette = chartPalette();

  ratioChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Likes', 'Passes'],
      datasets: [{
        data: [likes, dislikes],
        backgroundColor: [palette.like, palette.pass],
        borderWidth: 0,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: palette.text,
            padding: 20,
          }
        }
      }
    }
  });
}

function updateActivityChart() {
  const ctx = document.getElementById('activityChart').getContext('2d');

  // Get last 7 days of activity
  const days = [];
  const likesData = [];
  const dislikesData = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toDateString();
    days.push(date.toLocaleDateString('en-US', { weekday: 'short' }));

    const daySwipes = (history.swipes || []).filter(s => {
      const swipeDate = new Date(s.timestamp).toDateString();
      return swipeDate === dateStr;
    });

    likesData.push(daySwipes.filter(s => s.action === 'like').length);
    dislikesData.push(daySwipes.filter(s => s.action === 'dislike').length);
  }

  if (activityChart) {
    activityChart.destroy();
  }

  const palette = chartPalette();

  activityChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        {
          label: 'Likes',
          data: likesData,
          backgroundColor: palette.like,
        },
        {
          label: 'Passes',
          data: dislikesData,
          backgroundColor: palette.pass,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          grid: { color: palette.grid },
          ticks: { color: palette.text }
        },
        y: {
          stacked: true,
          grid: { color: palette.grid },
          ticks: { color: palette.text }
        }
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: palette.text }
        }
      }
    }
  });
}

// History Table - uses safe DOM manipulation
function updateHistoryTable() {
  const tbody = document.getElementById('historyBody');
  let swipes = history.swipes || [];

  // Apply filter
  if (filterText) {
    swipes = swipes.filter(s =>
      s.name.toLowerCase().includes(filterText.toLowerCase())
    );
  }

  // Pagination
  const totalPages = Math.ceil(swipes.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const pageSwipes = swipes.slice(startIndex, startIndex + itemsPerPage);

  // Clear existing rows
  tbody.textContent = '';

  if (pageSwipes.length === 0) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.setAttribute('colspan', '7');
    emptyCell.className = 'empty-state';
    emptyCell.textContent = 'No swipe history yet';
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
    document.getElementById('pagination').textContent = '';
    return;
  }

  pageSwipes.forEach(swipe => {
    const row = document.createElement('tr');

    // Time
    const timeCell = document.createElement('td');
    timeCell.textContent = new Date(swipe.timestamp).toLocaleString();
    row.appendChild(timeCell);

    // Name (escaped via textContent)
    const nameCell = document.createElement('td');
    nameCell.textContent = swipe.name;
    row.appendChild(nameCell);

    // Age
    const ageCell = document.createElement('td');
    ageCell.textContent = swipe.age;
    row.appendChild(ageCell);

    // Distance
    const distCell = document.createElement('td');
    distCell.textContent = swipe.distance;
    row.appendChild(distCell);

    // Action
    const actionCell = document.createElement('td');
    const actionBadge = document.createElement('span');
    actionBadge.className = 'action-badge ' + (swipe.action === 'like' ? 'like' : 'dislike');
    actionBadge.textContent = swipe.action === 'like' ? 'LIKED' : 'PASSED';
    actionCell.appendChild(actionBadge);
    row.appendChild(actionCell);

    // Site
    const siteCell = document.createElement('td');
    const siteBadge = document.createElement('span');
    siteBadge.className = 'site-badge ' + (swipe.site || 'tinder');
    siteBadge.textContent = swipe.site || 'tinder';
    siteCell.appendChild(siteBadge);
    row.appendChild(siteCell);

    // Filter reason
    const filterCell = document.createElement('td');
    filterCell.className = 'filter-reason';
    filterCell.textContent = swipe.filterReason || '-';
    row.appendChild(filterCell);

    tbody.appendChild(row);
  });

  // Update pagination
  updatePagination(totalPages);
}

function updatePagination(totalPages) {
  const container = document.getElementById('pagination');
  container.textContent = '';

  if (totalPages <= 1) {
    return;
  }

  const createPageBtn = (text, page, disabled) => {
    const btn = document.createElement('button');
    btn.className = 'page-btn';
    btn.textContent = text;
    btn.disabled = disabled;
    if (!disabled) {
      btn.addEventListener('click', () => goToPage(page));
    }
    return btn;
  };

  container.appendChild(createPageBtn('First', 1, currentPage === 1));
  container.appendChild(createPageBtn('Prev', currentPage - 1, currentPage === 1));

  const startPage = Math.max(1, currentPage - 2);
  const endPage = Math.min(totalPages, currentPage + 2);

  for (let i = startPage; i <= endPage; i++) {
    const btn = createPageBtn(String(i), i, false);
    if (i === currentPage) {
      btn.classList.add('active');
    }
    container.appendChild(btn);
  }

  container.appendChild(createPageBtn('Next', currentPage + 1, currentPage === totalPages));
  container.appendChild(createPageBtn('Last', totalPages, currentPage === totalPages));
}

function goToPage(page) {
  currentPage = page;
  updateHistoryTable();
}

// Sessions - uses safe DOM manipulation
function updateSessions() {
  const container = document.getElementById('sessionsContainer');
  const sessions = history.sessions || [];

  container.textContent = '';

  if (sessions.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-state';
    emptyDiv.textContent = 'No sessions recorded yet';
    container.appendChild(emptyDiv);
    return;
  }

  sessions.slice(0, 10).forEach(session => {
    const card = document.createElement('div');
    card.className = 'session-card';

    // Info section
    const infoDiv = document.createElement('div');
    infoDiv.className = 'session-info';

    const dateDiv = document.createElement('div');
    dateDiv.className = 'session-date';
    const startDate = new Date(session.startTime);
    dateDiv.textContent = startDate.toLocaleDateString() + ' - ' + (session.site || 'Unknown');
    infoDiv.appendChild(dateDiv);

    const timeDiv = document.createElement('div');
    timeDiv.className = 'session-time';
    const endDate = new Date(session.endTime);
    const duration = Math.round((session.endTime - session.startTime) / 60000);
    timeDiv.textContent = startDate.toLocaleTimeString() + ' - ' + endDate.toLocaleTimeString() + ' (' + duration + ' min)';
    infoDiv.appendChild(timeDiv);

    card.appendChild(infoDiv);

    // Stats section
    const statsDiv = document.createElement('div');
    statsDiv.className = 'session-stats';

    const createStat = (num, label, className) => {
      const stat = document.createElement('div');
      stat.className = 'session-stat' + (className ? ' ' + className : '');
      const numDiv = document.createElement('div');
      numDiv.className = 'num';
      numDiv.textContent = num;
      const labelDiv = document.createElement('div');
      labelDiv.className = 'label';
      labelDiv.textContent = label;
      stat.appendChild(numDiv);
      stat.appendChild(labelDiv);
      return stat;
    };

    statsDiv.appendChild(createStat(session.likes, 'Likes', 'likes'));
    statsDiv.appendChild(createStat(session.dislikes, 'Passes', 'dislikes'));
    statsDiv.appendChild(createStat(session.likes + session.dislikes, 'Total', ''));

    card.appendChild(statsDiv);
    container.appendChild(card);
  });
}

// Event Listeners
function setupEventListeners() {
  // Filter input
  document.getElementById('historyFilter').addEventListener('input', (e) => {
    filterText = e.target.value;
    currentPage = 1;
    updateHistoryTable();
  });

  // Log match
  document.getElementById('logMatchBtn').addEventListener('click', () => {
    stats.matchCount = (stats.matchCount || 0) + 1;
    chrome.storage.local.set({ stats }, () => {
      updateStatsCards();
      alert('Match logged!');
    });
  });

  // Export JSON
  document.getElementById('exportJsonBtn').addEventListener('click', () => {
    const data = {
      stats,
      history,
      exportDate: new Date().toISOString(),
    };
    downloadFile(JSON.stringify(data, null, 2), 'swiper-data.json', 'application/json');
  });

  // Export CSV
  document.getElementById('exportCsvBtn').addEventListener('click', () => {
    const swipes = history.swipes || [];
    if (swipes.length === 0) {
      alert('No data to export');
      return;
    }

    const headers = ['Timestamp', 'Name', 'Age', 'Distance', 'Action', 'Site', 'Filter Reason'];
    const rows = swipes.map(s => [
      new Date(s.timestamp).toISOString(),
      s.name,
      s.age,
      s.distance,
      s.action,
      s.site,
      s.filterReason || '',
    ]);

    const csv = [headers, ...rows].map(row =>
      row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',')
    ).join('\n');

    downloadFile(csv, 'swipe-history.csv', 'text/csv');
  });

  // Reset
  document.getElementById('resetBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to reset ALL data? This cannot be undone.')) {
      const freshStats = {
        totalLikes: 0,
        totalDislikes: 0,
        sessionsCount: 0,
        matchCount: 0,
        todayLikes: 0,
        todayDislikes: 0,
        todayDate: '',
        streakDays: 0,
        lastActiveDate: '',
      };
      const freshHistory = { swipes: [], sessions: [] };

      chrome.storage.local.set({ stats: freshStats, history: freshHistory }, () => {
        stats = freshStats;
        history = freshHistory;
        updateDashboard();
        alert('All data has been reset.');
      });
    }
  });
}

// Helpers
function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Auto-refresh every 5 seconds
setInterval(loadData, 5000);
