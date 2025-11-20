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

/* getNextOccurrence: corrected logic */
function getNextOccurrence(dayStr, timeStr){
  const days = ['sun','mon','tue','wed','thu','fri','sat'];
  const now = new Date();
  const targetDay = days.indexOf((dayStr||'').toLowerCase());
  if(targetDay === -1){
    // invalid day — return now
    return now.getTime();
  }
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

/* ---------- Create card markup ---------- */
function createBossCard(b, isManual = true){
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.label = b.label;

  const manualHours = b.manual ? b.manual.hours : null;
  const schedules = b.scheduled ? b.scheduled.schedule.split(',').map(s=>s.trim()) : [];
  const schedHtml = schedules.length ? `<div class="small">Schedule: ${schedules.join(', ')}</div>` : '';

  let buttonsHtml = '';
  if(isManual){
    buttonsHtml = `
      <div class="small endtime"></div>
      <button class="restartBtn">Restart (${manualHours}h)</button>
      <button class="stopBtn">Stop</button>
      ${b.manual.isCustom ? '<button class="deleteBtn">Delete</button>' : ''}
    `;
  }
  buttonsHtml += `<button class="sendBtn" style="margin-top:8px;">Send Timer</button>`;

  card.innerHTML = `
    <div class="label">${b.label}</div>
    <div class="clock">--:--:--</div>
    <div class="datetime"></div>
    <div class="small missCount"></div>
    ${buttonsHtml}
    ${schedHtml}
    <div class="small lastBy"></div>
  `;

 // --- Inside createBossCard (manual bosses only) ---
if(isManual){
  const missPenaltyDiv = document.createElement('div');
  missPenaltyDiv.className = 'missPenaltyContainer';
  const currentMiss = b.manual.missPenalty ?? (missesCache[b.manual.id]?.missPenalty ?? 3); // default 3 min
  missPenaltyDiv.innerHTML = `
    <label>Miss Penalty (min): </label>
    <input type="number" class="missPenaltyInput" min="0" value="${currentMiss}" data-boss-id="${b.manual.id}">
  `;
  card.appendChild(missPenaltyDiv);
}
  // --- Inside attachManualHandlers, after creating card ---
const missInput = card.querySelector('.missPenaltyInput');
if(missInput && !missInput.dataset.bound){
  const bossId = missInput.dataset.bossId;

  // Update local + Firebase on change
  missInput.addEventListener('change', () => {
    const value = parseInt(missInput.value, 10) || 0;
    const manual = bossMap[b.label].manual;
    manual.missPenalty = value;
    db.ref('misses/' + bossId + '/missPenalty').set(value).catch(err=>{
      console.error('Failed to update miss penalty', err);
    });
  });

  // Live update if Firebase changes
  db.ref('misses/' + bossId + '/missPenalty').on('value', snap => {
    const val = snap.val() ?? 3; // default 3 min
    if(parseInt(missInput.value,10) !== val) missInput.value = val;
    bossMap[b.label].manual.missPenalty = val;
  });

  missInput.dataset.bound = '1';
}

  // apply guild restrictions early if known
  if(currentUser && currentUser.guild && currentUser.guild.toLowerCase() !== 'vesperial'){
    ['stopBtn','sendBtn'].forEach(cls=>{
      const btn = card.querySelector('.'+cls);
      if(btn) btn.style.display = 'none';
    });
  }

  return card;
}

/* ---------- Renderers ---------- */
function renderManualTimers(){
  manualGrid.innerHTML = '';
  Object.values(bossMap).forEach(b => { if(b.manual) manualGrid.appendChild(createBossCard(b)); });
  attachManualHandlers();
}

function renderScheduledTimers(){
  scheduledGrid.innerHTML = '';
  Object.values(bossMap).forEach(b => { if(b.scheduled) scheduledGrid.appendChild(createBossCard(b,false)); });
  attachScheduledHandlers();
}

function renderBossTimers(){
  renderManualTimers();
  renderScheduledTimers();
  refreshSendPanel();
  renderTodaysBosses();
  applyGuildRestrictions();
}

/* ---------- Handlers (manual) ---------- */
function attachManualHandlers(){
  document.querySelectorAll('#manualBossGrid .card').forEach(card=>{
    const label = card.dataset.label;
    const manual = bossMap[label].manual;
    if(!manual) return;

    const restartBtn = card.querySelector('.restartBtn');
    const stopBtn = card.querySelector('.stopBtn');
    const deleteBtn = card.querySelector('.deleteBtn');
    const sendBtn = card.querySelector('.sendBtn');

    // --- Restart button ---
    if(restartBtn && !restartBtn.dataset.bound){
      restartBtn.addEventListener('click', ()=>{
        const entry = { startedAt: Date.now(), user: currentUser?.user || 'Unknown', guild: currentUser?.guild || '' };
        db.ref('timers/'+manual.id).set(entry).catch(()=>{});
        db.ref('timerLogs/'+manual.id).push(entry).catch(()=>{});
        db.ref('misses/'+manual.id).set(null).catch(()=>{});
        delete notified10Min[manual.id];
        delete notified10Min['miss_'+manual.id];
        sendVisitorDiscord(`🟢 **${label}** restarted by **${entry.user} [${entry.guild}]**`);
      });
      restartBtn.dataset.bound = '1';
    }

    // --- Stop button ---
    if(stopBtn && !stopBtn.dataset.bound){
      stopBtn.addEventListener('click', ()=>{
        db.ref('timers/'+manual.id).set(null).catch(()=>{});
        delete startTimes[manual.id];
        sendVisitorDiscord(`⏹️ **${label}** timer stopped by **${currentUser?.user || 'Unknown'} [${currentUser?.guild || ''}]**`);
      });
      stopBtn.dataset.bound = '1';
    }

    // --- Delete button ---
    if(deleteBtn && !deleteBtn.dataset.bound){
      deleteBtn.addEventListener('click', ()=>{
        if(!confirm(`Delete manual timer for ${label}?`)) return;
        const idx = manualDefs.findIndex(m=>m.label === label);
        if(idx !== -1) manualDefs.splice(idx, 1);
        db.ref('timers/'+manual.id).set(null).catch(()=>{});
        db.ref('misses/'+manual.id).set(null).catch(()=>{});
        mergeTimers();
        renderBossTimers();
        sendVisitorDiscord(`🗑️ **${label}** manual timer deleted by **${currentUser?.user || 'Unknown'} [${currentUser?.guild || ''}]**`);
      });
      deleteBtn.dataset.bound = '1';
    }

    // --- Send button ---
    if(sendBtn && !sendBtn.dataset.bound){
      sendBtn.addEventListener('click', async ()=>{
        const endTimeText = await computeManualSendTime(manual);
        const msg = `@everyone\n🟢 **${label}**\nTime: ${endTimeText}\nBy: ${currentUser?.user || ''}`;
        sendBossDiscord(msg);
      });
      sendBtn.dataset.bound = '1';
    }

    // --- Miss Penalty Input ---
    const missInput = card.querySelector('.missPenaltyInput');
if(missInput && !missInput.dataset.bound){
  const bossId = missInput.dataset.bossId;

  // Update local + Firebase when input changes
  missInput.addEventListener('change', () => {
    const value = parseInt(missInput.value, 10) || 0;
    const manual = bossMap[b.label].manual;
    manual.missPenalty = value;
    db.ref('misses/' + bossId + '/missPenalty').set(value).catch(()=>{});
  });

  // Live update when Firebase changes
  db.ref('misses/' + bossId + '/missPenalty').on('value', snap => {
    const val = snap.val() ?? 0;
    if(parseInt(missInput.value,10) !== val) missInput.value = val;
    bossMap[b.label].manual.missPenalty = val;
  });

  missInput.dataset.bound = '1';
}

  });
}

/* ---------- Handlers (scheduled) ---------- */
function attachScheduledHandlers(){
  document.querySelectorAll('#scheduledBossGrid .card').forEach(card=>{
    const label = card.dataset.label;
    const b = bossMap[label];
    if(!b || !b.scheduled) return;

    const sendBtn = card.querySelector('.sendBtn');
    if(sendBtn && !sendBtn.dataset.bound){
      sendBtn.addEventListener('click', ()=>{
        let nextTime = null;
        b.scheduled.schedule.split(',').forEach(s=>{
          const [day,time] = s.trim().split(' ');
          const occ = getNextOccurrence(day,time);
          if(!nextTime || occ < nextTime) nextTime = occ;
        });
        const endDate = nextTime ? new Date(nextTime) : null;
        const endTimeText = endDate ? `${endDate.toLocaleDateString(undefined,{weekday:'short',day:'2-digit',month:'short'})} ${endDate.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}` : '--:--';
        const msg = `@everyone\n🟢 **${label}**\nNext spawn: ${endTimeText}\nBy: ${currentUser?.user || ''}`;
        sendBossDiscord(msg);
      });
      sendBtn.dataset.bound = '1';
    }
  });
}

// ---------- Compute Manual Send (with iterative miss penalty) ----------
async function computeManualSendTime(manual){
  const running = startTimes[manual.id];
  let end = null;

  if(running && running.startedAt){
    end = new Date(running.startedAt);
    const baseMs = manual.hours * 3600 * 1000;
    const miss = missesCache[manual.id] || { missCount: 0, missPenalty: 0 };
    for(let i = 0; i < (miss.missCount || 0); i++){
      end = new Date(end.getTime() + baseMs + (miss.missPenalty || 0) * 60000);
    }
    // add base hours for current
    end = new Date(end.getTime() + baseMs);
    return `${end.toLocaleDateString(undefined,{weekday:'short',day:'2-digit',month:'short'})} ${end.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}`;
  }

  // fallback if no running timer
  const miss = missesCache[manual.id] || null;
  if(miss && miss.nextMissTime){
    return formatDateForMsg(miss.nextMissTime) + ` (Misses: ${miss.missCount || 0})`;
  }
  return '--:--';
}

/* ---------- updateBossClocks (fixed data var, scheduling logic) ---------- */
function updateBossClocks(){
  const now = Date.now();
  ['manualBossGrid','scheduledBossGrid'].forEach(gridId=>{
    document.querySelectorAll(`#${gridId} .card`).forEach(card=>{
      const label = card.dataset.label;
      const b = bossMap[label];
      if(!b) return;

      const clockEl = card.querySelector('.clock');
      const datetimeEl = card.querySelector('.datetime');
      const endTimeEl = card.querySelector('.endtime');
      const missCountEl = card.querySelector('.missCount');
      const lastByEl = card.querySelector('.lastBy');

      let remaining = null;

     // Manual timers
if(b.manual){
  const data = startTimes[b.manual.id] || null;
  const miss = missesCache[b.manual.id] || { missCount: 0, missPenalty: 0 }; // get miss count & penalty

  if(data && data.startedAt){
    // Iterative calculation for end time with miss penalties
    let end = new Date(data.startedAt);
    const baseMs = b.manual.hours * 3600 * 1000;
    for(let i = 0; i < (miss.missCount || 0); i++){
  end = new Date(end.getTime() + baseMs + ((b.manual.missPenalty || 0) * 60000));
}
    // Add base hours for current run
    end = new Date(end.getTime() + baseMs);

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
      remaining = b.manual.hours * 3600; // default full countdown (not running)
      if(datetimeEl) datetimeEl.textContent = '';
      if(missCountEl) missCountEl.textContent = '';
    }
  }
}

      // Scheduled timers
      if(b.scheduled){
        let next = null;
        b.scheduled.schedule.split(',').forEach(s=>{
          const [day, time] = s.trim().split(' ');
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
          // scheduled countdown shows if it's the nearest event
          if(remaining === null || schedRemaining < remaining) remaining = schedRemaining;
          if(clockEl) clockEl.textContent = secondsToHMS(schedRemaining);
          if(datetimeEl) datetimeEl.textContent = `Next spawn: ${new Date(next).toLocaleDateString(undefined,{weekday:'short',day:'2-digit',month:'short'})} ${new Date(next).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}`;
        }
      }

      // Update clock display for manual when remaining resolved
      if(remaining !== null && clockEl){
        clockEl.textContent = secondsToHMS(remaining);
        if(remaining <= 0) {
          card.classList.add('expired');
          card.classList.remove('timer-running','timer-today');
        } else {
          // determine if same-day
          let isSameDay = false;
          if(b.manual && startTimes[b.manual.id] && startTimes[b.manual.id].startedAt){
            const endDate = new Date(startTimes[b.manual.id].startedAt + b.manual.hours*3600*1000);
            isSameDay = new Date().toDateString() === endDate.toDateString();
          } else if(b.scheduled){
            // pick soonest scheduled next and check same day
            let next = null;
            b.scheduled.schedule.split(',').forEach(s=>{
              const [day,time] = s.trim().split(' ');
              const occ = getNextOccurrence(day,time);
              if(!next || occ < next) next = occ;
            });
            if(next) isSameDay = new Date().toDateString() === new Date(next).toDateString();
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

  // Refresh Today panel after clock updates
  renderTodaysBosses();
}

/* ---------- Fetch / DB listeners ---------- */
function fetchTimers(){
  db.ref('timers').on('value', snap=>{
    startTimes = snap.val() || {};
  }, err=>console.error(err));

  db.ref('fixedTimers').on('value', snap=>{
    fixedTimersCache = snap.val() || {};
    mergeTimers();
    renderBossTimers();
  }, err=>console.error(err));

  db.ref('misses').on('value', snap=>{
    missesCache = snap.val() || {};
  }, err=>console.error(err));

  // visitor log listener (last 10 minutes)
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
        d.textContent = `${v.user} [${v.guild}] - ${minutes} min ago`;
        visitorLogDiv.appendChild(d);
      });
    } catch(e){
      console.error('render visitors error', e);
      visitorLogDiv.textContent = 'Error loading visitors';
    }
  }, err=>console.error(err));
}

/* ---------- Visitor logging helper ---------- */
function logVisitor(user,guild){
  if(!user || !guild) return;
  const userKey = encodeURIComponent(`${user}|${guild}`);
  const now = Date.now();
  const cooldownRef = db.ref('visitorCooldowns/'+userKey);
  const visitRef = db.ref('siteVisits').push();

  cooldownRef.get().then(snapshot=>{
    const lastTime = snapshot.val() || 0;
    const canSend = (now - lastTime) >= (5*60*1000);
    visitRef.set({ user, guild, accessedAt: now }).catch(()=>{});
    if(canSend){
      sendVisitorDiscord(`👀 New visitor: **${user} [${guild}]** visited the site!`);
      cooldownRef.set(now).catch(()=>{});
    }
  }).catch(err=>{
    console.error('cooldown get error', err);
    visitRef.set({ user, guild, accessedAt: now }).catch(()=>{});
  });
}

/* ---------- Today's Boss Spawn ---------- */
function renderTodaysBosses(){
  if(!todaysPanel) return;
  todaysPanel.innerHTML = '';
  const todayStr = new Date().toDateString();

  Object.values(bossMap).forEach(b=>{
    // Manual running end
    if(b.manual && startTimes[b.manual.id] && startTimes[b.manual.id].startedAt){
      const endDate = new Date(startTimes[b.manual.id].startedAt + b.manual.hours*3600*1000);
      if(endDate.toDateString() === todayStr){
        const div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = `<div class="label">${b.label}</div><div class="small">Type: Manual</div><div class="small">Ends: ${endDate.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>`;
        todaysPanel.appendChild(div);
      }
    }
    // Scheduled occurrences for today
    if(b.scheduled){
      b.scheduled.schedule.split(',').forEach(s=>{
        const [day,time] = s.trim().split(' ');
        const nextOcc = getNextOccurrence(day,time);
        const occDate = new Date(nextOcc);
        if(occDate.toDateString() === todayStr){
          const div = document.createElement('div');
          div.className = 'card';
          div.innerHTML = `<div class="label">${b.label}</div><div class="small">Type: Scheduled</div><div class="small">At: ${occDate.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>`;
          todaysPanel.appendChild(div);
        }
      });
    }
  });

  if(todaysPanel.children.length === 0) todaysPanel.textContent = 'No spawns today.';
}

/* ---------- Send Panel (refresh + send) ---------- */
function refreshSendPanel(){
  if(!sendPanelTimers) return;
  sendPanelTimers.innerHTML = '';
  Object.values(bossMap).forEach(b=>{
    const endText = b.manual ? computeManualSendTimeSync(b.manual) : (() => {
      if(b.scheduled){
        let next=null;
        b.scheduled.schedule.split(',').forEach(s=>{
          const [day,time] = s.trim().split(' ');
          const occ = getNextOccurrence(day,time);
          if(!next || occ < next) next = occ;
        });
        return next ? new Date(next).toLocaleString() : '--:--';
      }
      return '--:--';
    })();

    const div = document.createElement('div');
    div.innerHTML = `<label><input type="checkbox" value="${b.label}"> ${b.label} ${b.manual?`- ${endText}`:''}</label>`;
    sendPanelTimers.appendChild(div);
  });
}

/* synchronous helper to compute a quick end text for UI (not awaiting DB) */
function computeManualSendTimeSync(manual){
  const running = startTimes[manual.id];
  if(running && running.startedAt){
    const end = new Date(running.startedAt + manual.hours*3600*1000);
    return `${end.toLocaleDateString(undefined,{weekday:'short',day:'2-digit',month:'short'})} ${end.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}`;
  }
  const miss = missesCache[manual.id] || null;
  if(miss && miss.nextMissTime){
    return formatDateForMsg(miss.nextMissTime) + ` (Misses: ${miss.missCount || 0})`;
  }
  return '--:--';
}

if(toggleSendPanel && sendPanelContent){
  let open = true;
  toggleSendPanel.addEventListener('click', ()=>{
    open = !open;
    sendPanelContent.style.display = open ? 'block' : 'none';
    toggleSendPanel.textContent = open ? '▲' : '▼';
  });
}

/* send selected timers */
if(sendSelectedBtn){
  sendSelectedBtn.addEventListener('click', ()=>{
    const checked = Array.from(document.querySelectorAll('#sendPanelTimers input:checked')).map(i=>i.value);
    if(checked.length === 0){ alert("Select at least one timer."); return; }
    let msgs = [];
    checked.forEach(label=>{
      const b = bossMap[label];
      if(!b) return;
      if(b.manual){
        msgs.push(`🟢 **${label}**\nTime: ${computeManualSendTimeSync(b.manual)}`);
      }
      if(b.scheduled){
        let next=null;
        b.scheduled.schedule.split(',').forEach(s=>{
          const [day,time] = s.trim().split(' ');
          const occ = getNextOccurrence(day,time);
          if(!next || occ < next) next = occ;
        });
        const endDate = next ? new Date(next) : null;
        const endText = endDate ? `${endDate.toLocaleDateString(undefined,{weekday:'short',day:'2-digit',month:'short'})} ${endDate.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}` : '--:--';
        msgs.push(`🟢 **${label}**\nNext spawn: ${endText}`);
      }
    });
    if(msgs.length){
      let fullMsg = `@everyone\n` + msgs.join('\n\n');
      const custom = customMessageEl.value.trim();
      if(custom) fullMsg += `\n\n💬 ${custom}`;
      sendBossDiscord(fullMsg);
    }
  });
}

/* ---------- Add Manual / Scheduled UI actions ---------- */
if(addManualBtn){
  addManualBtn.addEventListener('click', ()=>{
    const name = manualNameInput.value.trim();
    const hours = parseInt(manualHoursInput.value, 10);
    if(!name || isNaN(hours) || hours <= 0){ alert('Enter valid name and hours'); return; }
    const id = 'manual_' + normalize(name);
    if(manualDefs.some(m => m.id === id)){
      alert('Boss already exists'); return;
    }
    const newBoss = { label: name, hours: hours, id: id, isCustom: true };
    manualDefs.push(newBoss);
    // create a DB placeholder so listeners have something (optional)
    db.ref('timers/'+id).set(null).catch(()=>{});
    mergeTimers();
    renderBossTimers();
    manualNameInput.value = '';
    manualHoursInput.value = '';
  });
}

if(addScheduledBtn){
  addScheduledBtn.addEventListener('click', ()=>{
    const label = schedNameInput.value.trim();
    const schedule = schedTimeInput.value.trim(); // e.g. "mon 11:30,tue 15:00"
    if(!label || !schedule){ alert('Enter name and schedule'); return; }
    const key = 'fixed_'+normalize(label);
    const obj = { label, schedule };
    db.ref('fixedTimers/'+key).set(obj).then(()=>{ schedNameInput.value=''; schedTimeInput.value=''; })
      .catch(err=>{ console.error('add scheduled error', err); alert('Failed to add scheduled'); });
  });
}

/* ---------- Webhook switch ---------- */
if(switchWebhookBtn){
  switchWebhookBtn.addEventListener('click', ()=>{
    const current = parseInt(localStorage.getItem('activeBossWebhook') || "1", 10) || 1;
    const next = current === 1 ? 2 : 1;
    setActiveBossWebhook(next);
  });
}
updateWebhookButtonLabel();

/* ---------- Theme toggle ---------- */
if(toggleThemeBtn){
  toggleThemeBtn.addEventListener('click', ()=>{
    document.body.classList.toggle('light');
    localStorage.setItem('themeLight', document.body.classList.contains('light') ? '1' : '0');
  });
  if(localStorage.getItem('themeLight') === '1') document.body.classList.add('light');
}

/* ---------- Apply guild restrictions ---------- */
function applyGuildRestrictions(){
  const isVesperial = currentUser && currentUser.guild && currentUser.guild.toLowerCase() === 'vesperial';
  ['restartAll','stopAll','sendTimers'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.style.display = isVesperial ? 'inline-block' : 'none';
  });
  document.querySelectorAll('.card').forEach(card=>{
    ['stopBtn','sendBtn'].forEach(cls=>{
      const btn = card.querySelector('.'+cls);
      if(btn) btn.style.display = isVesperial ? 'inline-block' : 'none';
    });
  });
  const sp = document.getElementById('sendPanel');
  if(sp) sp.style.display = isVesperial ? 'block' : 'none';
}

/* ---------- User modal integration (unified) ---------- */
function showUserModal(){ if(userModal) userModal.style.display='flex'; if(mainContent) mainContent.style.display='none'; }
function hideUserModal(){ if(userModal) userModal.style.display='none'; if(mainContent) mainContent.style.display='block'; }

function loadUserFromStorage(){
  currentUser = JSON.parse(localStorage.getItem('userInfo')) || null;
  if(currentUser && currentUser.user && currentUser.guild){
    userInfoDisplay.textContent = `IGN: ${currentUser.user} | Guild: ${currentUser.guild}`;
    hideUserModal();
    applyGuildRestrictions();
  } else {
    showUserModal();
  }
}

if(modalSubmit){
  modalSubmit.addEventListener('click', ()=>{
    const ign = modalIGN.value.trim();
    const guild = modalGuild.value.trim();
    if(!ign || !guild){ alert('Both IGN and Guild are required'); return; }
    currentUser = { user: ign, guild: guild };
    localStorage.setItem('userInfo', JSON.stringify(currentUser));
    userInfoDisplay.textContent = `IGN: ${ign} | Guild: ${guild}`;
    hideUserModal();
    logVisitor(ign, guild);
    applyGuildRestrictions();
  });
}

if(changeUserBtn){
  changeUserBtn.addEventListener('click', ()=>{
    if(userModal) userModal.style.display='flex';
    if(mainContent) mainContent.style.display='none';
    if(modalIGN) modalIGN.value = currentUser ? currentUser.user : '';
    if(modalGuild) modalGuild.value = currentUser ? currentUser.guild : '';
  });
}

/* ---------- Start-up ---------- */
loadUserFromStorage();
fetchTimers();
setInterval(updateBossClocks, 1000);
setInterval(refreshSendPanel, 1000); // keep send panel names live
setInterval(renderTodaysBosses, 60*1000); // every minute

}); // DOMContentLoaded