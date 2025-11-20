// main.js — updated, fixed auto-restart, unified send panel
document.addEventListener("DOMContentLoaded", () => {  

/* ---------- Firebase Setup ---------- */  
const firebaseConfig = {  
  apiKey: "AIzaSyCcZa-fnSwdD36rB_DAR-SSfFlzH2fqcPc",  
  authDomain: "lordninetimer.firebaseapp.com",  
  databaseURL: "https://lordninetimer-default-rtdb.asia-southeast1.firebasedatabase.app",  
  projectId: "lordninetimer",  
  storageBucket: "lordninetimer.firebasestorage.app",  
  messagingSenderId: "462837939255",  
  appId: "1:462837939255:web:dee141d630d5d9b94a53b2"  
};  
firebase.initializeApp(firebaseConfig);  
const db = firebase.database();  

/* ---------- Discord Webhooks ---------- */  
const DISCORD_BOSS_WEBHOOK_1 = "...";  
const DISCORD_BOSS_WEBHOOK_2 = "...";  
const DISCORD_VISITOR_WEBHOOK = "...";  

/* ---------- DOM elements ---------- */  
const mainContent = document.getElementById('mainContent');  
const userModal = document.getElementById('userModal');  
const modalIGN = document.getElementById('modalIGN');  
const modalGuild = document.getElementById('modalGuild');  
const modalSubmit = document.getElementById('modalSubmit');  
const userInfoDisplay = document.getElementById('userInfo');  
const changeUserBtn = document.getElementById('changeUser');  
const switchWebhookBtn = document.getElementById('switchWebhook');  
const toggleThemeBtn = document.getElementById('toggleTheme');  
const manualNameInput = document.getElementById('manualName');  
const manualHoursInput = document.getElementById('manualHours');  
const addManualBtn = document.getElementById('addManual');  
const schedNameInput = document.getElementById('schedName');  
const schedTimeInput = document.getElementById('schedTime');  
const addScheduledBtn = document.getElementById('addScheduled');  
const manualGrid = document.getElementById('manualBossGrid');  
const scheduledGrid = document.getElementById('scheduledBossGrid');  
const todaysPanel = document.getElementById('todaysBosses');  
const visitorLogDiv = document.getElementById('visitorLog');  
const sendPanelTimers = document.getElementById('sendPanelTimers');  
const sendSelectedBtn = document.getElementById('sendSelected');  
const customMessageEl = document.getElementById('customMessage');  
const toggleSendPanel = document.getElementById('toggleSendPanel');  
const sendPanelContent = document.getElementById('sendPanelContent');  

/* ---------- Local state ---------- */  
let currentUser = JSON.parse(localStorage.getItem('userInfo')) || null;  
let activeBossWebhook = DISCORD_BOSS_WEBHOOK_1;  
let startTimes = {};        // timers/<id> current startedAt  
let fixedTimersCache = {};  
let bossMap = {};  
let missesCache = {};  
let lastStarts = {};        // last recorded start time per id  
const MISS_PENALTY_MS = 3 * 60 * 1000; // fallback penalty used only where applicable  
const notified10Min = {};   // track 10-min notifications  

/* ---------- Utility helpers ---------- */  
function normalize(s){ return s.replace(/\s+/g,'_').toLowerCase(); }  

function setActiveBossWebhook(which, skipSave=false){  
  if(which === 2) activeBossWebhook = DISCORD_BOSS_WEBHOOK_2;  
  else activeBossWebhook = DISCORD_BOSS_WEBHOOK_1;  
  if(!skipSave) localStorage.setItem('activeBossWebhook', String(which));  
  updateWebhookButtonLabel();  
}  

function updateWebhookButtonLabel(){  
  const btn = switchWebhookBtn;  
  const which = parseInt(localStorage.getItem('activeBossWebhook') || "1", 10) || 1;  
  if(btn) { btn.textContent = `Webhook: ${which}`; btn.title = `Active boss webhook: ${which}`; }  
}  

function sendBossDiscord(msg){  
  if(!activeBossWebhook) { console.warn("No active webhook set"); return; }  
  fetch(activeBossWebhook, {  
    method: "POST",  
    headers: { "Content-Type": "application/json" },  
    body: JSON.stringify({ content: msg })  
  }).catch(e=>console.error("Discord Boss error:", e));  
}  

function sendVisitorDiscord(msg){  
  if(!DISCORD_VISITOR_WEBHOOK) return;  
  fetch(DISCORD_VISITOR_WEBHOOK, {  
    method: "POST",  
    headers: { "Content-Type": "application/json" },  
    body: JSON.stringify({ content: msg })  
  }).catch(e=>console.error("Discord Visitor error:", e));  
}  

function formatDateForMsg(ms){  
  const d = new Date(ms);  
  return `${d.toLocaleDateString(undefined,{weekday:'short',day:'2-digit',month:'short'})} ${d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}`;  
}  

function getNextOccurrence(dayStr, timeStr){  
  const days = ['sun','mon','tue','wed','thu','fri','sat'];  
  const now = new Date();  
  const targetDay = days.indexOf((dayStr||'').toLowerCase());  
  if(targetDay === -1) return now.getTime();  
  const [hour, minute] = (timeStr || "00:00").split(':').map(Number);  
  let dt = new Date(now);  
  dt.setHours(hour, minute, 0, 0);  
  let diff = targetDay - dt.getDay();  
  if(diff < 0 || (diff === 0 && dt < now)) diff += 7;  
  dt.setDate(dt.getDate() + diff);  
  return dt.getTime();  
}  

function secondsToHMS(sec){  
  if(!Number.isFinite(sec) || sec < 0) sec = 0;  
  const h = Math.floor(sec/3600);  
  const m = Math.floor((sec % 3600) / 60);  
  const s = Math.floor(sec % 60);  
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;  
}  

/* ---------- Preloaded manual + scheduled data ---------- */  
const preloadedManual = ["Venatus","Viorent","Ego","Levera","Araneo","Undomiel","Lady Dalia","General Aquleus","Amentis","Baron Braudmore","Wannitas","Metus","Duplican","Shuliar","Gareth","Titore","Larba","Catena"];  
const manualDefs = preloadedManual.map(name => ({  
  label: name,  
  hours: {  
    'venatus':10,'viorent':10,'ego':21,'levera':24,'araneo':24,'undomiel':24,'lady_dalia':18,'general_aquleus':29,'amentis':29,'baron_braudmore':32,'wannitas':48,'metus':48,'duplican':48,'shuliar':35,'gareth':32,'titore':37,'larba':35,'catena':35  
  }[normalize(name)] || 24,  
  id: 'manual_' + normalize(name),  
  isCustom: false  
}));  

const defaultFixedBosses = [  
  { label:"Climantis", schedule:"mon 11:30,thu 19:00"},  
  { label:"Saphirus", schedule:"sun 17:00,tue 11:30"},  
  { label:"Neutro", schedule:"tue 19:00,thu 11:30"},  
  { label:"Thymele", schedule:"mon 19:00,wed 11:30"},  
  { label:"Milavy", schedule:"sat 15:00"},  
  { label:"Ringor", schedule:"sat 17:00"},  
  { label:"Roderick", schedule:"fri 19:00"},  
  { label:"Auraq", schedule:"sun 21:00,wed 21:00"}  
];  
defaultFixedBosses.forEach(b=>{  
  const key = 'default_'+normalize(b.label);  
  db.ref('fixedTimers/'+key).get().then(snap=>{  
    if(!snap.exists()) db.ref('fixedTimers/'+key).set(b);  
  }).catch(()=>{});  
});  

/* ---------- Merge timers into bossMap ---------- */  
function mergeTimers(){  
  bossMap = {};  
  manualDefs.forEach(m=>{  
    bossMap[m.label] = bossMap[m.label] || {};  
    bossMap[m.label].label = m.label;  
    bossMap[m.label].manual = m;  
  });  
  Object.values(fixedTimersCache).forEach(f=>{  
    bossMap[f.label] = bossMap[f.label] || {};  
    bossMap[f.label].label = f.label;  
    bossMap[f.label].scheduled = f;  
  });  
}  

/* ---------- Auto-restart handler ---------- */  
function handleAutoRestart(boss){  
  if(!boss.manual) return;  
  const id = boss.manual.id;  
  const start = startTimes[id];  
  const now = Date.now();  
  if(!start || !start.startedAt) return;  

  const baseMs = boss.manual.hours * 3600 * 1000;  
  const penaltyMs = (boss.manual.missPenalty || 0) * 60000;  
  const miss = missesCache[id] || { missCount: 0, missPenalty: boss.manual.missPenalty || 0 };  

  let end = new Date(start.startedAt + baseMs + (miss.missCount || 0) * penaltyMs);  
  if(end > now) return; // already handled  

  const newMissCount = (miss.missCount || 0) + 1;  
  const newStart = now;  

  db.ref("timers/" + id).set({ startedAt: newStart, user: "AUTO", guild: "" });  
  db.ref("timerLogs/" + id).push({ startedAt: newStart, autoRestart:true, user:"AUTO", guild:"" });  
  db.ref("misses/" + id).set({ missCount: newMissCount, missPenalty: boss.manual.missPenalty||0, nextMissTime: newStart+baseMs+penaltyMs });  

  startTimes["auto_"+id] = true;  

  sendVisitorDiscord(`🔄 **${boss.label}** auto-restarted (miss #${newMissCount}) — next end at ${new Date(newStart+baseMs+penaltyMs).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`);  
}  

/* ---------- Boss Rendering & Update Loop ---------- */
function updateBossClocks() {
  Object.values(bossMap).forEach(b => {
    // Handle auto-restart
    handleAutoRestart(b);

    const id = b.manual ? b.manual.id : 'sched_' + normalize(b.label);
    const timerEl = document.getElementById(id + '_timer');
    if(!timerEl) return;

    const start = startTimes[id];
    let remainingSec = 0;
    if(start && start.startedAt){
      const baseMs = b.manual ? b.manual.hours * 3600 * 1000 : 0;
      const penaltyMs = (missesCache[id]?.missCount || 0) * (b.manual?.missPenalty || 0) * 60000;
      const endTime = b.manual ? start.startedAt + baseMs + penaltyMs : getNextOccurrenceFromSchedule(b);
      remainingSec = Math.floor((endTime - Date.now())/1000);
    }
    timerEl.textContent = secondsToHMS(remainingSec);

    // Notify 10-min remaining
    if(!notified10Min[id] && remainingSec <= 600 && remainingSec > 0){
      sendVisitorDiscord(`⏰ **${b.label}** will respawn in 10 minutes!`);
      notified10Min[id] = true;
    }
    if(remainingSec > 600) notified10Min[id] = false;
  });
}

/* ---------- Visitor Logging ---------- */
function logVisitor(ign, guild){
  const visitorRef = db.ref('visitors').push();
  const msg = `👋 Visitor: ${ign}${guild ? ' ('+guild+')':''} at ${formatDateForMsg(Date.now())}`;
  visitorRef.set({ ign, guild, timestamp: Date.now() });
  sendVisitorDiscord(msg);
  renderVisitorLog();
}

function renderVisitorLog(){
  visitorLogDiv.innerHTML = '';
  db.ref('visitors').orderByChild('timestamp').limitToLast(20).get().then(snap=>{
    snap.forEach(child=>{
      const v = child.val();
      const div = document.createElement('div');
      div.textContent = `${formatDateForMsg(v.timestamp)} — ${v.ign}${v.guild?' ('+v.guild+')':''}`;
      visitorLogDiv.appendChild(div);
    });
  });
}

/* ---------- Manual / Scheduled Boss Cards ---------- */
function renderManualGrid(){
  manualGrid.innerHTML = '';
  Object.values(bossMap).forEach(b => {
    if(!b.manual) return;
    const div = document.createElement('div');
    div.className = 'bossCard';
    div.innerHTML = `<b>${b.label}</b> <span id="${b.manual.id}_timer">--:--:--</span>`;
    manualGrid.appendChild(div);
  });
}

function renderScheduledGrid(){
  scheduledGrid.innerHTML = '';
  Object.values(bossMap).forEach(b => {
    if(!b.scheduled) return;
    const div = document.createElement('div');
    div.className = 'bossCard';
    div.innerHTML = `<b>${b.label}</b> <span id="sched_${normalize(b.label)}_timer">--:--:--</span>`;
    scheduledGrid.appendChild(div);
  });
}

/* ---------- Today’s Boss Panel ---------- */
function renderTodaysBosses(){
  todaysPanel.innerHTML = '';
  const now = new Date();
  Object.values(bossMap).forEach(b => {
    if(!b.scheduled) return;
    const times = (b.scheduled.schedule||'').split(',');
    times.forEach(t => {
      const [day, hm] = t.trim().split(' ');
      if(day && hm){
        const next = getNextOccurrence(day, hm);
        if(next.toDateString() === now.toDateString()){
          const div = document.createElement('div');
          div.textContent = `${b.label} at ${hm}`;
          todaysPanel.appendChild(div);
        }
      }
    });
  });
}

/* ---------- Send Panel ---------- */
function refreshSendPanel(){
  sendPanelContent.innerHTML = '';
  Object.values(bossMap).forEach(b => {
    const id = b.manual ? b.manual.id : 'sched_' + normalize(b.label);
    const div = document.createElement('div');
    div.innerHTML = `<input type="checkbox" id="send_${id}"> ${b.label} <span>${secondsToHMS(Math.max(0,(startTimes[id]?.startedAt?Math.floor((b.manual.hours*3600*1000-(Date.now()-startTimes[id].startedAt))/1000):0)))}</span>`;
    sendPanelContent.appendChild(div);
  });
}

sendSelectedBtn.addEventListener('click',()=>{
  const checkboxes = sendPanelContent.querySelectorAll('input[type="checkbox"]:checked');
  checkboxes.forEach(cb=>{
    const id = cb.id.replace('send_','');
    const boss = Object.values(bossMap).find(b => (b.manual?b.manual.id:'sched_'+normalize(b.label))===id);
    if(boss){
      const msg = customMessageEl.value || `🟢 **${boss.label}** timer update`;
      sendBossDiscord(msg);
    }
  });
});

toggleSendPanel.addEventListener('click',()=>{ sendPanelTimers.classList.toggle('hidden'); });

/* ---------- User Modal ---------- */
function loadUserFromStorage(){
  if(currentUser) {
    userInfoDisplay.textContent = `${currentUser.ign}${currentUser.guild?' ('+currentUser.guild+')':''}`;
  } else userModal.style.display = 'block';
}

modalSubmit.addEventListener('click',()=>{
  const ign = modalIGN.value.trim();
  const guild = modalGuild.value.trim();
  if(!ign) return alert("IGN required");
  currentUser = { ign, guild };
  localStorage.setItem('userInfo', JSON.stringify(currentUser));
  userInfoDisplay.textContent = `${ign}${guild?' ('+guild+')':''}`;
  userModal.style.display = 'none';
});

/* ---------- Add Manual / Scheduled Bosses ---------- */
addManualBtn.addEventListener('click',()=>{
  const name = manualNameInput.value.trim();
  const hours = parseInt(manualHoursInput.value,10)||24;
  if(!name) return;
  const id = 'manual_'+normalize(name);
  manualDefs.push({ label:name, hours, id, isCustom:true });
  mergeTimers(); renderManualGrid(); manualNameInput.value=''; manualHoursInput.value='';
});

addScheduledBtn.addEventListener('click',()=>{
  const name = schedNameInput.value.trim();
  const schedule = schedTimeInput.value.trim();
  if(!name||!schedule) return;
  const id = 'sched_'+normalize(name);
  fixedTimersCache[id] = { label:name, schedule };
  mergeTimers(); renderScheduledGrid(); schedNameInput.value=''; schedTimeInput.value='';
});

/* ---------- Switch Webhook & Theme ---------- */
switchWebhookBtn.addEventListener('click',()=>{
  const which = activeBossWebhook===DISCORD_BOSS_WEBHOOK_1 ? 2 : 1;
  setActiveBossWebhook(which);
});

toggleThemeBtn.addEventListener('click',()=>{
  document.body.classList.toggle('darkMode');
});

/* ---------- Guild Restrictions Example ---------- */
function canTriggerForBoss(boss){
  if(!currentUser) return false;
  if(boss.manual?.restrictedGuilds){
    return boss.manual.restrictedGuilds.includes(currentUser.guild);
  }
  return true;
}

/* ---------- Start-up ---------- */  
loadUserFromStorage();  
fetchTimers();  
setInterval(updateBossClocks, 1000);  
setInterval(refreshSendPanel, 1000);  
setInterval(renderTodaysBosses, 60*1000);  

}); // DOMContentLoaded