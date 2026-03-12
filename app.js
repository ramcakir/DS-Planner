/**************************************
 * P6 Lite - Core Scheduling Engine   *
 * Vanilla JS + Tailwind              *
 * FIXED: Predecessor IDs as numbers  *
 **************************************/

// ---------- Data & State ----------
let activities = [];
let nextId = 100;
let projectStart = new Date();
projectStart.setHours(0,0,0,0);

// Settings defaults
let settings = {
  workingHours: 8,
  defaultDuration: 1
};

// DOM elements
const activityListEl = document.getElementById('activityList');
const projectStartInput = document.getElementById('projectStart');
const ganttSvg = document.getElementById('ganttSvg');
const importBtn = document.getElementById('importBtn');
const exportBtn = document.getElementById('exportBtn');
const printBtn = document.getElementById('printBtn');
const templateBtn = document.getElementById('templateBtn');
const settingsBtn = document.getElementById('settingsBtn');
const checkLogicBtn = document.getElementById('checkLogicBtn');
const addActivityBtn = document.getElementById('addActivityBtn');
const importFile = document.getElementById('importFile');
const editModal = document.getElementById('editModal');
const settingsModal = document.getElementById('settingsModal');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const workingHoursInput = document.getElementById('workingHours');
const defaultDurationInput = document.getElementById('defaultDuration');
const activityForm = document.getElementById('activityForm');
const editId = document.getElementById('editId');
const editName = document.getElementById('editName');
const editDuration = document.getElementById('editDuration');
const editType = document.getElementById('editType');
const editCategory = document.getElementById('editCategory');
const predecessorList = document.getElementById('predecessorList');
const newPredId = document.getElementById('newPredId');
const newPredType = document.getElementById('newPredType');
const addPredBtn = document.getElementById('addPredBtn');

// current editing activity's predecessors (array of {id, type})
let currentPreds = [];

// ---------- Helper: date functions ----------
function formatDate(date) {
  return date.toLocaleDateString('en-CA'); // YYYY-MM-DD
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ---------- CPM Forward Pass ----------
function calculateEarlyDates() {
  // Reset ES/EF for all
  activities.forEach(a => {
    a.ES = null;
    a.EF = null;
  });

  // Topological sort / iterative until stable
  let changed;
  do {
    changed = false;
    activities.forEach(act => {
      // Ensure milestone duration is 0 (should be already, but double‑check)
      if (act.type === 'Milestone') act.duration = 0;

      if (!act.predecessors || act.predecessors.length === 0) {
        // no preds: start at project start
        if (act.ES === null || act.ES.getTime() !== projectStart.getTime()) {
          act.ES = new Date(projectStart);
          act.EF = addDays(act.ES, act.duration);
          changed = true;
        }
      } else {
        let maxES = null; // for SS
        let maxEF = null; // for FS
        act.predecessors.forEach(pred => {
          const predAct = activities.find(a => a.id === pred.id); // both numbers now
          if (!predAct) return;
          if (predAct.ES === null) return; // not ready yet

          if (pred.type === 'SS') {
            // successor can start after predecessor starts
            if (maxES === null || predAct.ES > maxES) maxES = predAct.ES;
          } else { // FS
            if (maxEF === null || predAct.EF > maxEF) maxEF = predAct.EF;
          }
        });

        let newES = null;
        if (maxEF !== null) newES = maxEF;
        if (maxES !== null) {
          if (newES === null || maxES > newES) newES = maxES;
        }
        if (newES !== null) {
          if (act.ES === null || act.ES.getTime() !== newES.getTime()) {
            act.ES = new Date(newES);
            act.EF = addDays(act.ES, act.duration);
            changed = true;
          }
        }
      }
    });
  } while (changed);

  // For any activity still null, set to project start (isolated)
  activities.forEach(act => {
    if (act.ES === null) {
      act.ES = new Date(projectStart);
      act.EF = addDays(act.ES, act.duration);
    }
  });
}

// ---------- Render Activity List ----------
function renderActivities() {
  calculateEarlyDates(); // ensure dates fresh
  let html = '';
  activities.forEach(act => {
    const startStr = act.ES ? formatDate(act.ES) : '—';
    const finishStr = act.EF ? formatDate(act.EF) : '—';
    html += `
      <div class="activity-row p-3 flex flex-wrap items-center gap-2" data-id="${act.id}">
        <div class="flex-1 min-w-0">
          <div class="font-medium text-slate-800 truncate">${act.name}</div>
          <div class="text-xs text-slate-500 flex flex-wrap gap-x-2">
            <span>${act.type}</span>
            <span>${act.category}</span>
            <span>Dur: ${act.duration}d</span>
            <span>${startStr} → ${finishStr}</span>
          </div>
        </div>
        <button class="edit-btn bg-slate-100 border px-3 py-1 text-sm rounded active:bg-slate-200" data-id="${act.id}">✎ Edit</button>
      </div>
    `;
  });
  if (activities.length === 0) {
    html = '<div class="p-4 text-center text-slate-500">No activities. Click +New to start.</div>';
  }
  activityListEl.innerHTML = html;

  // attach edit listeners
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = Number(e.target.dataset.id);
      openEditModal(id);
    });
  });

  renderGantt();
}

// ---------- Gantt SVG (simplified) ----------
function renderGantt() {
  if (activities.length === 0) {
    ganttSvg.innerHTML = '<text x="10" y="30" class="text-xs fill-slate-400">No activities</text>';
    return;
  }

  // find min start and max finish
  let minTime = Infinity, maxTime = -Infinity;
  activities.forEach(act => {
    if (act.ES && act.ES.getTime() < minTime) minTime = act.ES.getTime();
    if (act.EF && act.EF.getTime() > maxTime) maxTime = act.EF.getTime();
  });
  if (minTime === Infinity) minTime = projectStart.getTime();
  if (maxTime === -Infinity) maxTime = addDays(projectStart, 10).getTime();

  const dayWidth = 30; // pixels per day
  const startDay = new Date(minTime);
  const totalDays = Math.ceil((maxTime - minTime) / (1000*3600*24)) + 2;
  const svgWidth = Math.max(600, totalDays * dayWidth);

  // set viewBox
  ganttSvg.setAttribute('viewBox', `0 0 ${svgWidth} 200`);
  ganttSvg.innerHTML = ''; // clear

  // draw grid lines (every day)
  for (let i = 0; i <= totalDays; i++) {
    const x = i * dayWidth;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x);
    line.setAttribute('y1', '0');
    line.setAttribute('x2', x);
    line.setAttribute('y2', '180');
    line.setAttribute('stroke', '#e2e8f0');
    line.setAttribute('stroke-width', '0.5');
    ganttSvg.appendChild(line);
  }

  // draw bars for each activity
  const barHeight = 16;
  const yStart = 30;
  activities.forEach((act, index) => {
    if (!act.ES) return;
    const daysFromStart = Math.round((act.ES.getTime() - minTime) / (1000*3600*24));
    const x = daysFromStart * dayWidth;
    const y = yStart + index * (barHeight + 4);
    const width = act.duration * dayWidth;

    // bar background
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', width);
    rect.setAttribute('height', barHeight);
    rect.setAttribute('fill', '#3b82f6');
    rect.setAttribute('rx', '2');
    ganttSvg.appendChild(rect);

    // activity name (truncated)
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x + 4);
    text.setAttribute('y', y + 12);
    text.setAttribute('fill', 'white');
    text.setAttribute('font-size', '9');
    text.setAttribute('font-weight', 'bold');
    text.textContent = act.name.substring(0, 10);
    ganttSvg.appendChild(text);
  });
}

// ---------- Edit Modal ----------
function openEditModal(id) {
  const act = activities.find(a => a.id === id);
  if (!act) return;
  editId.value = act.id;
  editName.value = act.name;
  editDuration.value = act.duration;
  editType.value = act.type;
  editCategory.value = act.category;
  currentPreds = act.predecessors ? act.predecessors.map(p => ({...p})) : [];
  renderPredecessorList();
  document.getElementById('modalTitle').innerText = 'Edit Activity';
  editModal.classList.remove('hidden');
}

function openNewActivityModal() {
  editId.value = '';
  editName.value = '';
  editDuration.value = settings.defaultDuration;
  editType.value = 'Task';
  editCategory.value = 'Early Design';
  currentPreds = [];
  renderPredecessorList();
  document.getElementById('modalTitle').innerText = 'New Activity';
  editModal.classList.remove('hidden');
}

function renderPredecessorList() {
  let html = '';
  currentPreds.forEach((p, idx) => {
    html += `<div class="flex justify-between items-center text-xs bg-slate-100 p-1 rounded">
      <span>${p.id} (${p.type})</span>
      <button type="button" class="remove-pred text-red-600 font-bold px-2" data-index="${idx}">✕</button>
    </div>`;
  });
  if (currentPreds.length === 0) html = '<div class="text-xs text-slate-400 italic">None</div>';
  predecessorList.innerHTML = html;
  document.querySelectorAll('.remove-pred').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = e.target.dataset.index;
      currentPreds.splice(idx, 1);
      renderPredecessorList();
    });
  });
}

// Add predecessor (FIXED: store ID as number)
addPredBtn.addEventListener('click', () => {
  const idStr = newPredId.value.trim();
  if (!idStr) return;
  const id = Number(idStr);
  if (isNaN(id)) {
    alert('Predecessor ID must be a number');
    return;
  }
  // optional warning if activity doesn't exist yet
  if (!activities.some(a => a.id === id)) {
    alert('No activity with that ID exists. It may cause errors.');
  }
  const type = newPredType.value;
  currentPreds.push({ id, type });
  renderPredecessorList();
  newPredId.value = '';
});

// Save activity from modal
activityForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = editId.value ? Number(editId.value) : null;
  const name = editName.value.trim();
  let duration = parseInt(editDuration.value, 10) || 0;
  const type = editType.value;
  const category = editCategory.value;

  if (!name) return alert('Name is required');

  // Milestones always have zero duration
  if (type === 'Milestone') {
    duration = 0;
  }

  if (id) {
    // update
    const act = activities.find(a => a.id === id);
    if (act) {
      act.name = name;
      act.duration = duration;
      act.type = type;
      act.category = category;
      act.predecessors = currentPreds.filter(p => p.id && !isNaN(p.id));
    }
  } else {
    // create new
    const newId = nextId++;
    activities.push({
      id: newId,
      name,
      duration,
      type,
      category,
      predecessors: currentPreds.filter(p => p.id && !isNaN(p.id))
    });
  }
  editModal.classList.add('hidden');
  renderActivities();
  saveToLocalStorage(); // auto-save
});

cancelModalBtn.addEventListener('click', () => editModal.classList.add('hidden'));

// ---------- Settings ----------
settingsBtn.addEventListener('click', () => {
  workingHoursInput.value = settings.workingHours;
  defaultDurationInput.value = settings.defaultDuration;
  settingsModal.classList.remove('hidden');
});

cancelSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
saveSettingsBtn.addEventListener('click', () => {
  settings.workingHours = parseInt(workingHoursInput.value, 10) || 8;
  settings.defaultDuration = parseInt(defaultDurationInput.value, 10) || 1;
  localStorage.setItem('p6_settings', JSON.stringify(settings));
  settingsModal.classList.add('hidden');
});

// ---------- Import / Export ----------
function exportProject() {
  const data = {
    activities: activities.map(a => ({
      ...a,
      ES: undefined, EF: undefined // remove calculated fields
    })),
    projectStart: formatDate(projectStart),
    nextId
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'project.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importProject(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.activities) {
        // Ensure all IDs and predecessor IDs are numbers
        activities = data.activities.map(a => {
          const act = {
            ...a,
            id: Number(a.id),
            duration: Number(a.duration) || 0,
          };
          if (!act.predecessors) act.predecessors = [];
          act.predecessors = act.predecessors.map(p => ({
            id: Number(p.id),
            type: p.type
          })).filter(p => !isNaN(p.id));
          return act;
        });
        nextId = data.nextId ? Number(data.nextId) : (Math.max(...activities.map(a => a.id), 0) + 1);
        if (data.projectStart) {
          projectStart = new Date(data.projectStart);
          projectStartInput.value = formatDate(projectStart);
        }
        renderActivities();
        saveToLocalStorage();
      } else {
        alert('Invalid project file');
      }
    } catch (err) {
      alert('Error parsing JSON');
    }
  };
  reader.readAsText(file);
}

importBtn.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', (e) => {
  if (e.target.files[0]) importProject(e.target.files[0]);
  importFile.value = ''; // allow re-upload same file
});

exportBtn.addEventListener('click', exportProject);

// ---------- Print ----------
printBtn.addEventListener('click', () => {
  window.print();
});

// ---------- Template (FIXED: numeric IDs) ----------
templateBtn.addEventListener('click', () => {
  // load EPC template
  activities = [
    { id: 101, name: 'Early Design', duration: 5, type: 'Task', category: 'Early Design', predecessors: [] },
    { id: 102, name: 'Engineering', duration: 10, type: 'Task', category: 'Engineering', predecessors: [{ id: 101, type: 'FS' }] },
    { id: 103, name: 'Procurement', duration: 15, type: 'Task', category: 'Procurement', predecessors: [{ id: 102, type: 'FS' }] },
    { id: 104, name: 'Construction', duration: 20, type: 'Task', category: 'Construction', predecessors: [{ id: 103, type: 'FS' }] },
    { id: 105, name: 'Commissioning', duration: 7, type: 'Task', category: 'Commissioning', predecessors: [{ id: 104, type: 'FS' }] },
    { id: 106, name: 'Start up', duration: 2, type: 'Task', category: 'Start up', predecessors: [{ id: 105, type: 'FS' }] },
    { id: 107, name: 'Project Kickoff', duration: 0, type: 'Milestone', category: 'Early Design', predecessors: [] }
  ];
  nextId = 108;
  renderActivities();
  saveToLocalStorage();
});

// ---------- Check Logic (circular dependency) ----------
function detectCycle() {
  const visited = new Set();
  const stack = new Set();
  const graph = {};
  activities.forEach(a => graph[a.id] = (a.predecessors || []).map(p => p.id)); // p.id is number

  function dfs(id) {
    if (stack.has(id)) return true; // cycle
    if (visited.has(id)) return false;
    visited.add(id);
    stack.add(id);
    const neighbors = graph[id] || [];
    for (let n of neighbors) {
      if (dfs(n)) return true;
    }
    stack.delete(id);
    return false;
  }

  for (let a of activities) {
    if (!visited.has(a.id)) {
      if (dfs(a.id)) return true;
    }
  }
  return false;
}

checkLogicBtn.addEventListener('click', () => {
  const hasCycle = detectCycle();
  if (hasCycle) {
    alert('⚠️ Circular dependency detected! Check your predecessors.');
  } else {
    alert('✅ No circular dependencies found.');
  }
});

// ---------- Project Start Change ----------
projectStartInput.addEventListener('change', (e) => {
  const val = e.target.value;
  if (val) {
    projectStart = new Date(val);
    renderActivities();
    saveToLocalStorage();
  }
});

// ---------- Add activity button ----------
addActivityBtn.addEventListener('click', openNewActivityModal);

// ---------- Local Storage persistence ----------
function saveToLocalStorage() {
  const data = {
    activities: activities.map(a => ({ ...a, ES: undefined, EF: undefined })),
    projectStart: formatDate(projectStart),
    nextId,
    settings
  };
  localStorage.setItem('p6_project', JSON.stringify(data));
}

function loadFromLocalStorage() {
  const saved = localStorage.getItem('p6_project');
  const savedSettings = localStorage.getItem('p6_settings');
  if (savedSettings) {
    try {
      settings = JSON.parse(savedSettings);
      workingHoursInput.value = settings.workingHours;
      defaultDurationInput.value = settings.defaultDuration;
    } catch (e) {}
  }
  if (saved) {
    try {
      const data = JSON.parse(saved);
      // Ensure numeric IDs on load as well
      activities = (data.activities || []).map(a => {
        const act = {
          ...a,
          id: Number(a.id),
          duration: Number(a.duration) || 0,
        };
        if (!act.predecessors) act.predecessors = [];
        act.predecessors = act.predecessors.map(p => ({
          id: Number(p.id),
          type: p.type
        })).filter(p => !isNaN(p.id));
        return act;
      });
      nextId = data.nextId ? Number(data.nextId) : 100;
      if (data.projectStart) {
        projectStart = new Date(data.projectStart);
        projectStartInput.value = formatDate(projectStart);
      } else {
        projectStartInput.value = formatDate(new Date());
      }
    } catch (e) { console.warn('Failed to load project from storage'); }
  } else {
    // default start today
    projectStartInput.value = formatDate(new Date());
  }
  renderActivities();
}

// ---------- Init ----------
loadFromLocalStorage();