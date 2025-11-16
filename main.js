// ---------- Firebase Setup ----------
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

// ---------- Discord Webhooks ----------
const DISCORD_BOSS_WEBHOOK_1 = "..."; // replace with your webhook
const DISCORD_BOSS_WEBHOOK_2 = "...";
const DISCORD_VISITOR_WEBHOOK = "...";

let activeBossWebhook = DISCORD_BOSS_WEBHOOK_1;
function setActiveBossWebhook(which, skipSave){
  if(which===1) activeBossWebhook = DISCORD_BOSS_WEBHOOK_1;
  else if(which===2) activeBossWebhook = DISCORD_BOSS_WEBHOOK_2;
  else activeBossWebhook = DISCORD_BOSS_WEBHOOK_1;
  if(!skipSave) localStorage.setItem('activeBossWebhook', String(which));
  updateWebhookButtonLabel();
}
const savedChoice = parseInt(localStorage.getItem('activeBossWebhook')||"1",10);
setActiveBossWebhook(savedChoice,true);

function updateWebhookButtonLabel(){
  const btn = document.getElementById('switchWebhook');
  const which = parseInt(localStorage.getItem('activeBossWebhook')||"1",10)||1;
  btn.textContent = `Webhook: ${which}`;
  btn.title = `Active boss webhook: ${which}`;
}

function sendBossDiscord(msg){
  fetch(activeBossWebhook,{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ content: msg })
  }).catch(e=>console.error("Discord Boss error:",e));
}

function sendVisitorDiscord(msg){
  fetch(DISCORD_VISITOR_WEBHOOK,{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ content: msg })
  }).catch(e=>console.error("Discord Visitor error:",e));
}

// ---------- User Info ----------
let userInfo = JSON.parse(localStorage.getItem("userInfo"))||null;
const mainContent = document.getElementById('mainContent');
const userModal = document.getElementById('userModal');
const modalIGN = document.getElementById('modalIGN');
const modalGuild = document.getElementById('modalGuild');
const modalSubmit = document.getElementById('modalSubmit');
const userInfoDisplay = document.getElementById('userInfo');
const changeUserBtn = document.getElementById('changeUser');

function showUserModal(){ userModal.style.display='flex'; mainContent.style.display='none'; }
function hideUserModal(){
  userModal.style.display='none'; mainContent.style.display='block';
  if(userInfo && userInfo.user && userInfo.guild){
    userInfoDisplay.textContent = `IGN: ${userInfo.user} | Guild: ${userInfo.guild}`;
    applyGuildRestrictions();
  }
}

if(!userInfo || !userInfo.user || !userInfo.guild){ showUserModal(); } else { hideUserModal(); }

modalSubmit.addEventListener('click', ()=>{
  const ign = modalIGN.value.trim();
  const guild = modalGuild.value.trim();
  if(!ign||!guild){ alert('Both IGN and Guild are required'); return; }
  userInfo = { user: ign, guild: guild };
  localStorage.setItem('userInfo', JSON.stringify(userInfo));
  hideUserModal();
  logVisitor(userInfo.user,userInfo.guild);
});

changeUserBtn.addEventListener('click', ()=>{
  showUserModal();
  modalIGN.value = userInfo?userInfo.user:'';
  modalGuild.value = userInfo?userInfo.guild:'';
});

// ---------- Theme ----------
const themeBtn = document.getElementById('toggleTheme');
themeBtn.addEventListener('click', ()=>{
  document.body.classList.toggle('light');
  localStorage.setItem('themeLight',document.body.classList.contains('light')?'1':'0');
});
if(localStorage.getItem('themeLight')==='1') document.body.classList.add('light');

// ---------- Guild Restrictions ----------
function applyGuildRestrictions(){
  const isVesperial = userInfo && userInfo.guild && userInfo.guild.toLowerCase()==='vesperial';
  ['restartAll','stopAll','sendTimers'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.style.display=isVesperial?'inline-block':'none';
  });
  document.querySelectorAll('.card').forEach(card=>{
    ['stopBtn','sendBtn'].forEach(cls=>{
      const btn = card.querySelector('.'+cls);
      if(btn) btn.style.display=isVesperial?'inline-block':'none';
    });
  });
  const sp = document.getElementById('sendPanel');
  if(sp) sp.style.display=isVesperial?'block':'none';
}

// ---------- Preloaded Manual Timers ----------
const preloadedManual = ["Venatus","Viorent","Ego","Levera","Araneo","Undomiel","Lady Dalia","General Aquleus","Amentis","Baron Braudmore","Wannitas","Metus","Duplican","Shuliar","Gareth","Titore","Larba","Catena"];
function normalize(s){ return s.replace(/\s+/g,'_').toLowerCase(); }

const manualDefs = preloadedManual.map(name=>({
  label: name,
  hours: { 'venatus':10,'viorent':10,'ego':21,'levera':24,'araneo':24,'undomiel':24,'lady_dalia':18,'general_aquleus':29,'amentis':29,'baron_braudmore':32,'wannitas':48,'metus':48,'duplican':48,'shuliar':35,'gareth':32,'titore':37,'larba':35,'catena':35}[normalize(name)]||24,
  id: 'manual_'+normalize(name),
  isCustom: false
}));

let startTimes = {};
let fixedTimersCache = {};
let bossMap = {};
let missesCache = {};
let lastStarts = {};
const MISS_PENALTY_MS = 3*60*1000;

// ---------- Preloaded Scheduled ----------
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
  });
});

// ---------- Merge & Render ----------
function mergeTimers(){
  bossMap={};
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

function createBossCard(b,isManual=true){
  const card=document.createElement('div');
  card.className='card'; card.dataset.label=b.label;
  const manualHours = b.manual?b.manual.hours:null;
  const schedules = b.scheduled?b.scheduled.schedule.split(',').map(s=>s.trim()):[];
  const schedHtml = schedules.length?`<div class="small">Schedule: ${schedules.join(', ')}</div>`:'';
  let buttonsHtml='';
  if(isManual){
    buttonsHtml=`<div class="small endtime"></div>
      <button class="restartBtn">Restart (${manualHours}h)</button>
      <button class="stopBtn">Stop</button>
      ${b.manual.isCustom?'<button class="deleteBtn">Delete</button>':''}`;
  }
  buttonsHtml += `<button class="sendBtn" style="margin-top:8px;">Send Timer</button>`;
  card.innerHTML=`
    <div class="label">${b.label}</div>
    <div class="clock">--:--:--</div>
    <div class="datetime"></div>
    <div class="small missCount"></div>
    ${buttonsHtml}
    ${schedHtml}
    <div class="small lastBy"></div>
  `;
  if(userInfo && userInfo.guild && userInfo.guild.toLowerCase()!=='vesperial'){
    ['stopBtn','sendBtn'].forEach(cls=>{
      const btn = card.querySelector('.'+cls);
      if(btn) btn.style.display='none';
    });
  }
  return card;
}

function renderManualTimers(){
  const grid = document.getElementById('manualBossGrid'); grid.innerHTML='';
  Object.values(bossMap).forEach(b=>{ if(b.manual) grid.appendChild(createBossCard(b)); });
  attachManualHandlers();
}

function renderScheduledTimers(){
  const grid = document.getElementById('scheduledBossGrid'); grid.innerHTML='';
  Object.values(bossMap).forEach(b=>{ if(b.scheduled) grid.appendChild(createBossCard(b,false)); });
  attachScheduledHandlers();
}

function renderBossTimers(){
  renderManualTimers();
  renderScheduledTimers();
  refreshSendPanel();
  renderTodaysBosses();
  applyGuildRestrictions();
}

// ---------- Attach Handlers ----------
function attachManualHandlers(){
  document.querySelectorAll('#manualBossGrid .card').forEach(card=>{
    const label=card.dataset.label;
    const manual=bossMap[label].manual;
    if(!manual) return;
    const restartBtn = card.querySelector('.restartBtn');
    const stopBtn = card.querySelector('.stopBtn');
    const deleteBtn = card.querySelector('.deleteBtn');
    const sendBtn = card.querySelector('.sendBtn');

    if(restartBtn && !restartBtn.dataset.bound){
      restartBtn.addEventListener('click', ()=>{
        const entry={startedAt:Date.now(),user:userInfo.user,guild:userInfo.guild};
        db.ref('timers/'+manual.id).set(entry);
        db.ref('timerLogs/'+manual.id).push(entry);
        db.ref('misses/'+manual.id).set(null);
        sendVisitorDiscord(`🟢 **${label}** restarted by **${userInfo.user} [${userInfo.guild}]**`);
      }); restartBtn.dataset.bound='1';
    }

    if(stopBtn && !stopBtn.dataset.bound){
      stopBtn.addEventListener('click', ()=>{
        db.ref('timers/'+manual.id).set(null);
        sendVisitorDiscord(`⏹️ **${label}** timer stopped by **${userInfo.user} [${userInfo.guild}]**`);
      }); stopBtn.dataset.bound='1';
    }

    if(deleteBtn && !deleteBtn.dataset.bound){
      deleteBtn.addEventListener('click', ()=>{
        if(confirm(`Delete manual timer for ${label}?`)){
          delete bossMap[label].manual;
          db.ref('timers/'+manual.id).set(null);
          db.ref('misses/'+manual.id).set(null);
          renderManualTimers();
          sendVisitorDiscord(`🗑️ **${label}** manual timer deleted by **${userInfo.user} [${userInfo.guild}]**`);
        }
      }); deleteBtn.dataset.bound='1';
    }

    if(sendBtn && !sendBtn.dataset.bound){
      sendBtn.addEventListener('click', async ()=>{
        const endTimeText = await computeManualSendTime(manual);
        const msg = `@everyone\n🟢 **${label}**\nTime: ${endTimeText}\nBy: ${userInfo.user} `;
        sendBossDiscord(msg);
      }); sendBtn.dataset.bound='1';
    }
  });
}

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
        const endDate = nextTime?new Date(nextTime):null;
        const endTimeText = endDate?`${endDate.toLocaleDateString(undefined,{weekday:'short',day:'2-digit',month:'short'})} ${endDate.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}`:'--:--';
        const msg = `@everyone\n🟢 **${label}**\nNext spawn: ${endTimeText}\nBy: ${userInfo.user} `;
        sendBossDiscord(msg);
      }); sendBtn.dataset.bound='1';
    }
  });
}

// ---------- Helper Functions ----------
function getNextOccurrence(dayStr,timeStr){
  const days=['sun','mon','tue','wed','thu','fri','sat'];
  const now=new Date();
  const targetDay = days.indexOf(dayStr.toLowerCase());
  if(targetDay===-1) return now.getTime();
  const [hour,minute]=timeStr.split(':').map(Number);
  let dt=new Date(now);
  dt.setHours(hour,minute,0,0);
  let diff=targetDay - dt.getDay();
  if(diff<0||(diff===0 && dt<now)) dt.setDate(dt.getDate()+7+diff);
  else dt.setDate(dt.getDate()+diff);
  return dt.getTime();
}

function formatDateForMsg(ms){
  const d = new Date(ms);
  return `${d.toLocaleDateString(undefined,{weekday:'short',day:'2-digit',month:'short'})} ${d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}`;
}

// ---------- Compute Manual Send ----------
async function computeManualSendTime(manual){
  const running = startTimes[manual.id];
  if(running && running.startedAt){
    const end = new Date(running.startedAt + manual.hours*3600*1000);
    const miss = missesCache[manual.id];
    let extra = miss && miss.nextMissTime?Math.ceil((miss.nextMissTime - end)/60000):0;
    return `${end.toLocaleDateString(undefined,{weekday:'short',day:'2-digit',month:'short'})} ${end.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}` + (extra?` +${extra} min`:``);
  }
  const miss = missesCache[manual.id] || null;
  if(miss && miss.nextMissTime){
    return formatDateForMsg(miss.nextMissTime) + ` (Misses: ${miss.missCount || 0})`;
  }
  return '--:--';
}

// ---------- Update Boss Clocks ----------
const notified10Min={};

function updateBossClocks(){
  const now=Date.now();
  ['manualBossGrid','scheduledBossGrid'].forEach(gridId=>{
    document.querySelectorAll(`#${gridId} .card`).forEach(card=>{
      const label = card.dataset.label;
      const b = bossMap[label];
      const clockEl = card.querySelector('.clock');
      const datetimeEl = card.querySelector('.datetime');
      const lastByEl = card.querySelector('.lastBy');
      const endTimeEl = card.querySelector('.endtime');
      const missCountEl = card.querySelector('.missCount');
      let remaining = null;

      // Manual
      if(b && b.manual){
        const data = startTimes[b.manual.id];
        if(data && data.startedAt){
          remaining = b.manual.hours*3600 - Math.floor((now-data.startedAt)/1000);
          if(remaining<=600 && remaining>599 && !notified10Min[b.manual.id]){
            sendBossDiscord(`@everyone⏰ **${b.label}** will spawn in 10 minutes!`);
            notified10Min[b.manual.id]=true;
          } else if(remaining>600) notified10Min[b.manual.id]=false;
          if(missCountEl) missCountEl.textContent='';
        } else {
          const miss = missesCache[b.manual.id] || null;
          if(miss && miss.nextMissTime){
            remaining = Math.floor((miss.nextMissTime-now)/1000);
            const missKey='miss_'+b.manual.id;
            if(remaining<=600 && remaining>599 && !notified10Min[missKey]){
              sendBossDiscord(`@everyone⏰ **${b.label}** will spawn in 10 minutes!`);
              notified10Min[missKey]=true;
            } else if(remaining>600) notified10Min[missKey]=false;
            if(missCountEl) missCountEl.textContent=`Misses: ${miss.missCount||0}`;
            if(datetimeEl && miss.nextMissTime) datetimeEl.textContent=`Next spawn: ${new Date(miss.nextMissTime).toLocaleDateString(undefined,{weekday:'short'})} ${new Date(miss.nextMissTime).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}`;
          } else remaining=b.manual.hours*3600;
        }
      }

      // Scheduled
      if(b && b.scheduled){
        let next=null;
        b.scheduled.schedule.split(',').forEach(s=>{
          const [day,time]=s.trim().split(' ');
          const occ=getNextOccurrence(day,time);
          if(!next || occ<next) next=occ;
        });
        if(next){
          const schedRemaining = Math.floor((next-now)/1000);
          const schedKey = 'sched_'+b.label;
          if(schedRemaining===600 && !notified10Min[schedKey]){
            sendBossDiscord(`@everyone⏰ **${b.label}** scheduled spawn in 10 minutes!`);
            notified10Min[schedKey]=true;
          } else if(schedRemaining>600) notified10Min[schedKey]=false;
          if(clockEl) clockEl.textContent = secondsToHMS(schedRemaining);
          if(datetimeEl) datetimeEl.textContent = `Next spawn: ${new Date(next).toLocaleDateString(undefined,{weekday:'short',day:'2-digit',month:'short'})} ${new Date(next).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}`;
        }
      }

      // Update clock for manual
      if(b.manual && remaining!=null && clockEl){
        clockEl.textContent = secondsToHMS(remaining);
        if(endTimeEl){
          const endTime = data && data.startedAt ? new Date(data.startedAt + b.manual.hours*3600*1000) : null;
          if(endTime) endTimeEl.textContent = `Ends at: ${endTime.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
        }
      }
    });
  });
}

function secondsToHMS(sec){
  if(sec<0) sec=0;
  const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

setInterval(updateBossClocks,1000);

// ---------- Fetch Data ----------
function fetchTimers(){
  db.ref('timers').on('value', snap=>{
    startTimes = snap.val() || {};
  });
  db.ref('fixedTimers').on('value', snap=>{
    fixedTimersCache = snap.val() || {};
    mergeTimers();
    renderBossTimers();
  });
  db.ref('misses').on('value', snap=>{
    missesCache = snap.val() || {};
  });
}

// ---------- Visitor Log ----------
function logVisitor(user,guild){
  const entry = { user, guild, timestamp: Date.now() };
  db.ref('visitors').push(entry);
  sendVisitorDiscord(`👀 Visitor: **${user} [${guild}]**`);
}

// ---------- Today's Boss Spawn Panel ----------
function renderTodaysBosses(){
  const panel = document.getElementById('todaysBosses'); 
  if(!panel) return;
  panel.innerHTML='';
  const today = new Date();
  const todayStr = today.toDateString();

  Object.values(bossMap).forEach(b=>{
    // Manual
    if(b.manual && startTimes[b.manual.id]){
      const endDate = new Date(startTimes[b.manual.id].startedAt + b.manual.hours*3600*1000);
      if(endDate.toDateString()===todayStr){
        const div = document.createElement('div');
        div.textContent = `${b.label} | Ends: ${endDate.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} | Type: Manual`;
        panel.appendChild(div);
      }
    }
    // Scheduled
    if(b.scheduled){
      b.scheduled.schedule.split(',').forEach(s=>{
        const [day,time] = s.trim().split(' ');
        const nextOcc = getNextOccurrence(day,time);
        const occDate = new Date(nextOcc);
        if(occDate.toDateString()===todayStr){
          const div = document.createElement('div');
          div.textContent = `${b.label} | Ends: ${occDate.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} | Type: Scheduled`;
          panel.appendChild(div);
        }
      });
    }
  });
}

// ---------- Start ----------
fetchTimers();