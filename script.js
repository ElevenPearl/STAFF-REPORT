// ---------- Firebase setup ----------
// 1. Create a Firebase project at https://console.firebase.google.com/
// 2. Add a Web App, then paste your firebaseConfig values below.
// 3. Enable Firestore Database in the Firebase console.
const firebaseConfig = {
  apiKey: "AIzaSyCq2K0gLhY95ZERvIrKltjkG7g5hlpi8IA",
  authDomain: "staff-report-99bdb.firebaseapp.com",
  projectId: "staff-report-99bdb",
  storageBucket: "staff-report-99bdb.firebasestorage.app",
  messagingSenderId: "886903229220",
  appId: "1:886903229220:web:4f33f0676b5c8af4fec1b1"
};

const hasFirebaseConfig = !Object.values(firebaseConfig).some(value => value.includes("PASTE_"));
let db = null;
let staffUnsubscribe = null;
let recordsUnsubscribe = null;
let appState = {
  staffList: [],
  records: {}
};

if(hasFirebaseConfig && window.firebase){
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
}

// ---------- Firebase data helpers ----------
const STAFF_DOC = "settings/staff";
const RECORDS_COLLECTION = "dailyRecords";

function getStaffList(){
  return [...appState.staffList];
}
async function setStaffList(list){
  appState.staffList = [...list];
  renderActivePanel();
  if(!db) return;
  await db.doc(STAFF_DOC).set({ names:list }, { merge:true });
}
function getRecords(){
  return JSON.parse(JSON.stringify(appState.records));
}
async function saveDayRecord(dateStr, dayData){
  appState.records[dateStr] = dayData;
  if(!db) return;
  await db.collection(RECORDS_COLLECTION).doc(dateStr).set({ entries:dayData }, { merge:true });
}
async function seedStaffDocIfMissing(){
  const doc = await db.doc(STAFF_DOC).get();
  if(!doc.exists){
    await db.doc(STAFF_DOC).set({ names:[] });
  }
}
function showBackendStatus(text, state){
  let badge = document.getElementById("backendStatus");
  if(!badge){
    badge = document.createElement("div");
    badge.id = "backendStatus";
    badge.className = "backend-status";
    document.querySelector("header").appendChild(badge);
  }
  badge.textContent = text;
  badge.dataset.state = state;
}
function subscribeToFirebase(){
  if(!db){
    showBackendStatus("Firebase config needed", "warning");
    return;
  }

  showBackendStatus("Connecting to Firebase...", "loading");
  seedStaffDocIfMissing().catch(error => {
    console.error(error);
    showBackendStatus("Firebase setup error", "error");
  });

  staffUnsubscribe = db.doc(STAFF_DOC).onSnapshot(snapshot => {
    const data = snapshot.data() || {};
    appState.staffList = Array.isArray(data.names) ? data.names : [];
    renderActivePanel();
    showBackendStatus("Firebase synced", "ok");
  }, error => {
    console.error(error);
    showBackendStatus("Firebase read error", "error");
  });

  recordsUnsubscribe = db.collection(RECORDS_COLLECTION).onSnapshot(snapshot => {
    const records = {};
    snapshot.forEach(doc => {
      records[doc.id] = (doc.data() && doc.data().entries) || {};
    });
    appState.records = records;
    renderActivePanel();
    showBackendStatus("Firebase synced", "ok");
  }, error => {
    console.error(error);
    showBackendStatus("Firebase read error", "error");
  });
}
function renderActivePanel(){
  if(document.getElementById("panel-staff").classList.contains("active")) renderStaffManager();
  if(document.getElementById("panel-today").classList.contains("active")) renderTodayTable();
  if(document.getElementById("panel-history").classList.contains("active")){
    const wrap = document.getElementById("historyTableWrap");
    if(wrap.innerHTML.trim()) loadHistoryDate();
  }
  if(document.getElementById("panel-summary").classList.contains("active")) renderSummary();
}

function todayStr(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function formatNice(dateStr){
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

// ---------- Init ----------
document.getElementById('todayBadge').textContent = formatNice(todayStr());
document.getElementById('todayLabel').textContent = formatNice(todayStr());
document.getElementById('historyDatePicker').value = todayStr();
document.getElementById('summaryMonthPicker').value = todayStr().slice(0,7);
subscribeToFirebase();

// ---------- Tabs ----------
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-'+btn.dataset.tab).classList.add('active');
    if(btn.dataset.tab === 'staff') renderStaffManager();
    if(btn.dataset.tab === 'today') renderTodayTable();
    if(btn.dataset.tab === 'summary') renderSummary();
  });
});

// ---------- Staff Manager ----------
function renderStaffManager(){
  const list = getStaffList();
  const wrap = document.getElementById('staffListWrap');
  if(list.length === 0){
    wrap.innerHTML = '<p class="muted">No staff added yet. Add names below.</p>';
    return;
  }
  wrap.innerHTML = '';
  list.forEach((name, idx)=>{
    const row = document.createElement('div');
    row.className = 'staff-list-item';
    row.innerHTML = `
      <input type="text" value="${escapeHtml(name)}" data-idx="${idx}" onchange="renameStaff(${idx}, this.value)">
      <button class="remove-x" onclick="removeStaff(${idx})">Remove</button>
    `;
    wrap.appendChild(row);
  });
}
async function addStaff(){
  const input = document.getElementById('newStaffInput');
  const name = input.value.trim();
  if(!name) return;
  const list = getStaffList();
  if(list.includes(name)){ alert('That name is already on the list.'); return; }
  list.push(name);
  input.value = '';
  await setStaffList(list);
}
async function renameStaff(idx, newName){
  newName = newName.trim();
  if(!newName) { renderStaffManager(); return; }
  const list = getStaffList();
  const oldName = list[idx];
  if(!oldName) return;
  list[idx] = newName;
  await setStaffList(list);

  const records = getRecords();
  const saves = Object.keys(records).map(date=>{
    if(records[date][oldName]){
      records[date][newName] = records[date][oldName];
      delete records[date][oldName];
      return saveDayRecord(date, records[date]);
    }
    return Promise.resolve();
  });
  await Promise.all(saves);
  renderStaffManager();
}
async function removeStaff(idx){
  const list = getStaffList();
  if(!confirm(`Remove "${list[idx]}" from the staff list? Their past daily records will be kept in history.`)) return;
  list.splice(idx,1);
  await setStaffList(list);
}
function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
function escapeForJs(str){
  return String(str).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "");
}

// ---------- Today's Table ----------
function renderTodayTable(){
  buildDayTable(todayStr(), 'todayTableWrap');
}
function buildDayTable(dateStr, wrapId){
  const staffList = getStaffList();
  const wrap = document.getElementById(wrapId);
  if(staffList.length === 0){
    wrap.innerHTML = '<p class="muted">No staff added yet. Go to "Manage Staff" tab to add your team first.</p>';
    return;
  }
  const records = getRecords();
  const dayData = records[dateStr] || {};

  let html = `<table><thead><tr>
    <th style="width:150px">Staff Name</th>
    <th style="width:130px">Date</th>
    <th style="width:160px">Attendance</th>
    <th>Work Done</th>
  </tr></thead><tbody>`;

  staffList.forEach(name=>{
    const safeName = escapeHtml(name);
    const jsName = escapeForJs(name);
    const entry = dayData[name] || { status:null, work:'', entryTime:'', exitTime:'' };
    const showTimes = entry.status === 'halfday';
    html += `<tr>
      <td class="staff-name">${safeName}</td>
      <td>${dateStr}</td>
      <td>
        <div class="attend-toggle" data-date="${dateStr}" data-name="${safeName}">
          <button type="button" class="present-btn ${entry.status==='present'?'present-on':''}" onclick="setStatus('${dateStr}','${jsName}','present', this)">Present</button>
          <button type="button" class="halfday-btn ${entry.status==='halfday'?'halfday-on':''}" onclick="setStatus('${dateStr}','${jsName}','halfday', this)">Half Day</button>
          <button type="button" class="absent-btn ${entry.status==='absent'?'absent-on':''}" onclick="setStatus('${dateStr}','${jsName}','absent', this)">Absent</button>
        </div>
        <div class="halfday-times" style="${showTimes ? '' : 'display:none;'}">
          <label>Entry Time
            <input type="time" value="${entry.entryTime||''}" onchange="setHalfDayTime('${dateStr}','${jsName}','entryTime', this.value)">
          </label>
          <label>Exit Time
            <input type="time" value="${entry.exitTime||''}" onchange="setHalfDayTime('${dateStr}','${jsName}','exitTime', this.value)">
          </label>
        </div>
      </td>
      <td>
        <textarea placeholder="Describe work done today..." onchange="setWork('${dateStr}','${jsName}', this.value)">${escapeHtml(entry.work||'')}</textarea>
      </td>
    </tr>`;
  });
  html += `</tbody></table>`;
  wrap.innerHTML = html;
}
async function setStatus(dateStr, name, status, btnEl){
  const records = getRecords();
  if(!records[dateStr]) records[dateStr] = {};
  if(!records[dateStr][name]) records[dateStr][name] = {status:null, work:'', entryTime:'', exitTime:''};
  records[dateStr][name].status = (records[dateStr][name].status === status) ? null : status;
  await saveDayRecord(dateStr, records[dateStr]);

  const group = btnEl.parentElement;
  const current = records[dateStr][name].status;
  group.querySelector('.present-btn').classList.toggle('present-on', current==='present');
  group.querySelector('.halfday-btn').classList.toggle('halfday-on', current==='halfday');
  group.querySelector('.absent-btn').classList.toggle('absent-on', current==='absent');
  const timesRow = group.parentElement.querySelector('.halfday-times');
  if(timesRow){
    timesRow.style.display = (current === 'halfday') ? 'flex' : 'none';
  }
  flashSaved(dateStr);
}
async function setHalfDayTime(dateStr, name, field, value){
  const records = getRecords();
  if(!records[dateStr]) records[dateStr] = {};
  if(!records[dateStr][name]) records[dateStr][name] = {status:'halfday', work:'', entryTime:'', exitTime:''};
  records[dateStr][name][field] = value;
  await saveDayRecord(dateStr, records[dateStr]);
  flashSaved(dateStr);
}
async function setWork(dateStr, name, work){
  const records = getRecords();
  if(!records[dateStr]) records[dateStr] = {};
  if(!records[dateStr][name]) records[dateStr][name] = {status:null, work:'', entryTime:'', exitTime:''};
  records[dateStr][name].work = work;
  await saveDayRecord(dateStr, records[dateStr]);
  flashSaved(dateStr);
}
function flashSaved(dateStr){
  if(dateStr === todayStr()){
    const note = document.getElementById('todaySaveNote');
    note.classList.add('show');
    setTimeout(()=>note.classList.remove('show'), 1200);
  }
}

// ---------- History ----------
function loadHistoryDate(){
  const dateStr = document.getElementById('historyDatePicker').value;
  if(!dateStr) return;
  buildDayTable(dateStr, 'historyTableWrap');
}

// ---------- Monthly Summary ----------
function renderSummary(){
  const monthStr = document.getElementById('summaryMonthPicker').value;
  const wrap = document.getElementById('summaryTableWrap');
  const staffList = getStaffList();
  if(!monthStr || staffList.length === 0){
    wrap.innerHTML = '<p class="muted">Add staff and pick a month to see the summary.</p>';
    return;
  }
  const records = getRecords();
  const [year, month] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  const totals = {};
  staffList.forEach(name=> totals[name] = {present:0, halfday:0, absent:0, notMarked:0});

  for(let d=1; d<=daysInMonth; d++){
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayData = records[dateStr] || {};
    staffList.forEach(name=>{
      const entry = dayData[name];
      if(entry && entry.status === 'present') totals[name].present++;
      else if(entry && entry.status === 'halfday') totals[name].halfday++;
      else if(entry && entry.status === 'absent') totals[name].absent++;
      else totals[name].notMarked++;
    });
  }

  let html = `<table><thead><tr>
    <th>Staff Name</th>
    <th>Present Days</th>
    <th>Half Days</th>
    <th>Absent Days</th>
    <th>Not Marked</th>
    <th>Total Days in Month</th>
  </tr></thead><tbody>`;
  staffList.forEach(name=>{
    const t = totals[name];
    html += `<tr>
      <td class="staff-name">${escapeHtml(name)}</td>
      <td class="summary-cell-present">${t.present}</td>
      <td class="summary-cell-half">${t.halfday}</td>
      <td class="summary-cell-absent">${t.absent}</td>
      <td class="muted">${t.notMarked}</td>
      <td>${daysInMonth}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  wrap.innerHTML = html;
}

window.addStaff = addStaff;
window.renameStaff = renameStaff;
window.removeStaff = removeStaff;
window.setStatus = setStatus;
window.setHalfDayTime = setHalfDayTime;
window.setWork = setWork;
window.loadHistoryDate = loadHistoryDate;
window.renderSummary = renderSummary;

// ---------- First load ----------
renderTodayTable();
