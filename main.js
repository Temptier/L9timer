// main.js — fixed, unified, ready to paste
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

/* ---------- Discord Webhooks (replace placeholders) ---------- */
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

/* getNextOccurrence */
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
  if(!Number.isFinite(sec)) sec = 0;
  if(sec < 0) sec = 0;
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

/* ---------- Compute Manual Send (fixed) ---------- */
function computeManualSendTime(manual){
  const running = startTimes[manual.id];
  if(running && running.startedAt){
    const miss = missesCache[manual.id] || { missCount: 0, missPenalty: manual.missPenalty || 0 };
    const baseMs = manual.hours * 3600 * 1000;
    const penaltyMs = (manual.missPenalty || 0) * 60000;
    const totalMs = baseMs + (miss.missCount || 0) * penaltyMs;
    const end = new Date(running.startedAt + totalMs);
    return `${end.toLocaleDateString(undefined,{weekday:'short',day:'2-digit',month:'short'})} ${end.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}`;
  }
  const miss = missesCache[manual.id] || null;
  if(miss && miss.nextMissTime){
    return formatDateForMsg(miss.nextMissTime) + ` (Misses: ${miss.missCount || 0})`;
  }
  return '--:--';
}

/* ---------- updateBossClocks (fixed auto-restart logic) ---------- */
function updateBossClocks(){
  const now = Date.now();

  ['manualBossGrid','scheduledBossGrid'].forEach(gridId=>{
    document.querySelectorAll(`#${gridId} .card`).forEach(card=>{
      const label = card.dataset.label;
      const b = bossMap[label];
      if(!b) return;

      const clockEl = card.querySelector('.clock');
      const datetimeEl = card.querySelector('.datetime');
      const missCountEl = card.querySelector('.missCount');
      const lastByEl = card.querySelector('.lastBy');

      let remaining = null;

      // --- Manual timers ---
      if(b.manual){
        const data = startTimes[b.manual.id] || null;
        const miss = missesCache[b.manual.id] || { missCount: 0, missPenalty: b.manual.missPenalty || 0 };

        if(data && data.startedAt){
          const baseMs = b.manual.hours * 3600 * 1000;
          const penaltyMs = (b.manual.missPenalty || 0) * 60000;
          const totalMs = baseMs + (miss.missCount || 0) * penaltyMs;
          const end = new Date(data.startedAt + totalMs);
          remaining = Math.floor((end - now)/1000);

          // 10-min notification
          if(remaining <= 600 && remaining > 599 && !notified10Min[b.manual.id]){
            sendBossDiscord(`@everyone⏰ **${b.label}** will spawn in 10 minutes!`);
            notified10Min[b.manual.id] = true;
          } else if(remaining > 600){
            notified10Min[b.manual.id] = false;
          }

          if(missCountEl) missCountEl.textContent = `Misses: ${miss.missCount || 0}`;
          if(datetimeEl) datetimeEl.textContent = `Ends: ${formatDateForMsg(end.getTime())}`;
          if(lastByEl) lastByEl.textContent = `Last restart: ${data.user || ''} [${data.guild || ''}]`;
        } else {
          // Not running — use nextMissTime if available
          if(miss && miss.nextMissTime){
            remaining = Math.floor((miss.nextMissTime - now)/1000);
            const missKey = 'miss_'+b.manual.id;
            if(remaining <= 600 && remaining > 599 && !notified10Min[missKey]){
              sendBossDiscord(`@everyone⏰ **${b.label}** will spawn in 10 minutes!`);
              notified10Min[missKey] = true;
            } else if(remaining > 600){
              notified10Min[missKey] = false;
            }
            if(missCountEl) missCountEl.textContent = `Misses: ${miss.missCount || 0}`;
            if(datetimeEl) datetimeEl.textContent = `Next spawn: ${new Date(miss.nextMissTime).toLocaleDateString(undefined,{weekday:'short'})} ${new Date(miss.nextMissTime).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}`;
          } else {
            remaining = b.manual.hours * 3600;
            if(datetimeEl) datetimeEl.textContent = '';
            if(missCountEl) missCountEl.textContent = '';
          }
        }
      }

      // --- Scheduled timers (unchanged) ---
      if(b.scheduled){
        let next = null;
        b.scheduled.schedule.split(',').forEach(s=>{
          const [day,time] = s.trim().split(' ');
          const occ = getNextOccurrence(day, time);
          if(!next || occ < next) next = occ;
        });
        if(next){
          const schedRemaining = Math.floor((next - now)/1000);
          const schedKey = 'sched_'+b.label;
          if(schedRemaining <= 600 && schedRemaining > 599 && !notified10Min[schedKey]){
            sendBossDiscord(`@everyone⏰ **${b.label}** scheduled spawn in 10 minutes!`);
            notified10Min[schedKey] = true;
          } else if(schedRemaining > 600){
            notified10Min[schedKey] = false;
          }
          if(remaining === null || schedRemaining < remaining) remaining = schedRemaining;
          if(clockEl) clockEl.textContent = secondsToHMS(schedRemaining);
          if(datetimeEl) datetimeEl.textContent = `Next spawn: ${new Date(next).toLocaleDateString(undefined,{weekday:'short',day:'2-digit',month:'short'})} ${new Date(next).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}`;
        }
      }

      // --- Clock display & auto-restart ---
      if(remaining !== null && clockEl){
        clockEl.textContent = secondsToHMS(remaining);

        if (remaining <= 0) {
          card.classList.add('expired');
          card.classList.remove('timer-running','timer-today');

          // === AUTO-RESTART: PREVENT MULTIPLE TRIGGERS ===
          if (b.manual && !startTimes["auto_"+b.manual.id]) {
            const previousEnd = Date.now();
            const baseMs = b.manual.hours * 3600 * 1000;
            const penaltyMs = (b.manual.missPenalty || 0) * 60000;
            const miss = missesCache[b.manual.id] || { missCount: 0, missPenalty: b.manual.missPenalty || 0 };
            const newMissCount = (miss.missCount || 0) + 1;
            const newEnd = previousEnd + baseMs + penaltyMs;

            db.ref("timers/" + b.manual.id).set({ startedAt: previousEnd, user: "AUTO", guild: "" });
            db.ref("timerLogs/" + b.manual.id).push({ startedAt: previousEnd, autoRestart: true, user: "AUTO", guild: "" });
            db.ref("misses/" + b.manual.id).set({
              missCount: newMissCount,
              missPenalty: b.manual.missPenalty || 0,
              nextMissTime: newEnd
            });

            startTimes["auto_" + b.manual.id] = true;

            sendVisitorDiscord(
              `🔄 **${b.label}** auto-restarted (miss #${newMissCount}) — next end at ${new Date(newEnd).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`
            );
          }

        } else {
          let isSameDay = false;
          if(b.manual && startTimes[b.manual.id] && startTimes[b.manual.id].startedAt){
            const endDate = new Date(startTimes[b.manual.id].startedAt + b.manual.hours*3600*1000);
            isSameDay = new Date().toDateString() === endDate.toDateString();
          }
          if(isSameDay){
            card.classList.add('timer-today');
            card.classList.remove('expired','timer-running');
          } else {
            card.classList.add('timer-running');
            card.classList.remove('expired','timer-today');
          }
        }
      } else if(clockEl){
        clockEl.textContent = '--:--:--';
      }

    });
  });

  renderTodaysBosses();
}

/* ---------- Fetch / DB listeners ---------- */
function fetchTimers(){
  db.ref('timers').on('value', snap=>{ startTimes = snap.val() || {}; }, err=>console.error(err));
  db.ref('fixedTimers').on('value', snap=>{ fixedTimersCache = snap.val() || {}; mergeTimers(); renderBossTimers(); }, err=>console.error(err));
  db.ref('misses').on('value', snap=>{ missesCache = snap.val() || {}; }, err=>console.error(err));
  db.ref('manualTimers').on('value', snap=>{
    const manualData = snap.val() || {};
    for(let i = manualDefs.length - 1; i >= 0; i--){ if(manualDefs[i].isCustom) manualDefs.splice(i,1); }
    Object.values(manualData).forEach(m => manualDefs.push(m));
    mergeTimers(); renderBossTimers();
  }, err => console.error(err));

  const cutoff = Date.now() - 10*60*1000;
  db.ref('siteVisits').orderByChild('accessedAt').startAt(cutoff).limitToLast(200).on('value', snap=>{
    try{
      const visits = [];
      snap.forEach(c=>visits.push(c.val()));
      visits.sort((a,b)=> (b.accessedAt||0) - (a.accessedAt||0));
      visitorLogDiv.innerHTML = visits.length ? '' : 'No recent visitors.';
      visits.forEach(v=>{
        const minutes = Math.max(0, Math.floor((Date.now() - (v.accessedAt||0))/60000));
        const d = document.createElement('div');
        d.textContent = `${v.user || 'Guest'} accessed ${minutes} min ago`;
        visitorLogDiv.appendChild(d);
      });
    } catch(e){ console.error(e); }
  });
}

/* ---------- Render functions ---------- */
function renderBossTimers(){
  manualGrid.innerHTML = '';
  scheduledGrid.innerHTML = '';

  Object.values(bossMap).forEach(b=>{
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.label = b.label;

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = b.label;
    card.appendChild(title);

    const clock = document.createElement('div');
    clock.className = 'clock';
    clock.textContent = '--:--:--';
    card.appendChild(clock);

    const datetime = document.createElement('div');
    datetime.className = 'datetime';
    card.appendChild(datetime);

    const missCount = document.createElement('div');
    missCount.className = 'missCount';
    card.appendChild(missCount);

    const lastBy = document.createElement('div');
    lastBy.className = 'lastBy';
    card.appendChild(lastBy);

    if(b.manual) manualGrid.appendChild(card);
    if(b.scheduled) scheduledGrid.appendChild(card);
  });
}

/* ---------- Render today's bosses panel ---------- */
function renderTodaysBosses(){
  todaysPanel.innerHTML = '';
  const now = new Date();
  Object.values(bossMap).forEach(b=>{
    if(!b.scheduled) return;
    const todayStr = now.toDateString();
    let hasToday = false;
    b.scheduled.schedule.split(',').forEach(s=>{
      const [day,time] = s.trim().split(' ');
      const nextOcc = getNextOccurrence(day, time);
      if(new Date(nextOcc).toDateString() === todayStr) hasToday = true;
    });
    if(hasToday){
      const d = document.createElement('div');
      d.textContent = `${b.label}`;
      todaysPanel.appendChild(d);
    }
  });
}

/* ---------- Initial setup ---------- */
function init(){
  // Restore webhook choice
  const active = parseInt(localStorage.getItem('activeBossWebhook') || "1",10);
  setActiveBossWebhook(active,true);

  // Render timers
  mergeTimers();
  renderBossTimers();

  // Start clock updater
  setInterval(updateBossClocks, 1000);

  // Fetch data from Firebase
  fetchTimers();
}

init();

/* ---------- Event handlers ---------- */
switchWebhookBtn.addEventListener('click',()=>{
  const current = activeBossWebhook === DISCORD_BOSS_WEBHOOK_1 ? 2 : 1;
  setActiveBossWebhook(current);
});

toggleSendPanel.addEventListener('click',()=>{
  sendPanelContent.classList.toggle('hidden');
});

})();