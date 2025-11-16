/* Towers.js
   Core app logic: manual timers, scheduled timers, misses, visitors, Discord webhooks,
   rendering and UI handlers. Relies on FirebaseModule, ModalModule, SchedulerModule, SoundModule.
*/
(function(window){
  const db = window.FirebaseModule.db;

  // Discord webhooks — update with your own if needed
  const DISCORD_BOSS_WEBHOOK_1 = "https://discord.com/api/webhooks/1418540875323150507/E1ojUFf1gBvgKs2O-GPm7XxCz6P4LVmCiBMIm3C8iyTrV957xlHOFTolet2OrcPEWPNL";
  const DISCORD_BOSS_WEBHOOK_2 = "https://discord.com/api/webhooks/1428809007279378442/Qxpf5p_hObctijGgM-mz6iSUm4eW5LyMuiTdi14YN7-t3icxBTIwCv2ddyQAAaRwCwR1";
  const DISCORD_VISITOR_WEBHOOK = "https://discord.com/api/webhooks/1418184593047289956/d0xJb2P_tDCDzmQXuBDj09s6S5qN5we22Ub6-1qJvnPrt99taW97zSZtYfGg9iccPWVe";

  let activeBossWebhook = DISCORD_BOSS_WEBHOOK_1;
  function setActiveBossWebhook(which, skipSave){
    if(which === 1) activeBossWebhook = DISCORD_BOSS_WEBHOOK_1;
    else if(which === 2) activeBossWebhook = DISCORD_BOSS_WEBHOOK_2;
    else activeBossWebhook = DISCORD_BOSS_WEBHOOK_1;
    if(!skipSave) localStorage.setItem('activeBossWebhook', String(which));
    updateWebhookButtonLabel();
  }

  function updateWebhookButtonLabel(){
    const btn = document.getElementById('switchWebhook');
    const which = parseInt(localStorage.getItem('activeBossWebhook') || "1", 10) || 1;
    btn.textContent = `Webhook: ${which}`;
    btn.title = `Active boss webhook: ${which}`;
  }

  function sendBossDiscord(msg){
    fetch(activeBossWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: msg })
    }).catch(e=>console.error("Discord Boss error:", e));
  }

  function sendVisitorDiscord(msg){
    fetch(DISCORD_VISITOR_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: msg })
    }).catch(e=>console.error("Discord Visitor error:", e));
  }

  // preloaded manual list & normalize helper (keeps parity with your original)
  const preloadedManual = ["Venatus","Viorent","Ego","Levera","Araneo","Undomiel","Lady Dalia","General Aquleus","Amentis","Baron Braudmore","Wannitas","Metus","Duplican","Shuliar","Gareth","Titore","Larba","Catena"];
  function normalize(s){ return s.replace(/\s+/g,'_').toLowerCase(); }

  const manualDefs = preloadedManual.map(name=>({
    label: name,
    hours: { 'venatus':10,'viorent':10,'ego':21,'levera':24,'araneo':24,'undomiel':24,'lady_dalia':18,'general_aquleus':29,'amentis':29,'baron_braudmore':32,'wannitas':48,'metus':48,'duplican':48,'shuliar':35,'gareth':32,'titore':37,'larba':35,'catena':35 }[normalize(name)] || 24,
    id: 'manual_'+normalize(name),
    isCustom: false
  }));

  // state caches
  let startTimes = {};        // timers/<id> current startedAt
  let fixedTimersCache = {};
  let bossMap = {};
  let missesCache = {};       // misses/<id>
  let lastStarts = {};        // last recorded start from logs or from startTimes

  const MISS_PENALTY_MS = 3 * 60 * 1000; // 3 minutes per miss
  const notified10Min = {}; // track 10-min notifications

  // default scheduled bosses stored to firebase if missing (same as your original)
  const defaultFixedBosses = [
    { label: "Climantis", schedule: "mon 11:30,thu 19:00" },
    { label: "Saphirus", schedule: "sun 17:00,tue 11:30" },
    { label: "Neutro", schedule: "tue 19:00,thu 11:30" },
    { label: "Thymele", schedule: "mon 19:00,wed 11:30" },
    { label: "Milavy", schedule: "sat 15:00" },
    { label: "Ringor", schedule: "sat 17:00" },
    { label: "Roderick", schedule: "fri 19:00" },
    { label: "Auraq", schedule: "sun 21:00,wed 21:00" }
  ];
  defaultFixedBosses.forEach(b=>{
    const key = 'default_'+normalize(b.label);
    db.ref('fixedTimers/'+key).get().then(snap=>{
      if(!snap.exists()) db.ref('fixedTimers/'+key).set(b);
    }).catch(()=>{});
  });

  // ---------- Merge Timers ----------
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

  // ---------- Create Cards ----------
  function createBossCard(b, isManual=true){
    const card=document.createElement('div');
    card.className='card';
    card.dataset.label=b.label;
    const manualHours=b.manual ? b.manual.hours : null;
    const schedules=b.scheduled ? b.scheduled.schedule.split(',').map(s=>s.trim()) : [];
    const schedHtml=schedules.length ? `<div class="small">Schedule: ${schedules.join(', ')}</div>` : '';

    let buttonsHtml = '';
    if(isManual){
      buttonsHtml = `
        <div class="small endtime"></div>
        <button class="restartBtn btn">Restart (${manualHours}h)</button>
        <button class="stopBtn btn ghost">Stop</button>
        ${b.manual.isCustom ? '<button class="deleteBtn btn ghost">Delete</button>' : ''}
      `;
    }
    buttonsHtml += `<button class="sendBtn btn" style="margin-top:8px;">Send Timer</button>`;

    card.innerHTML=`
      <div class="label">${b.label}</div>
      <div class="clock">--:--:--</div>
      <div class="datetime"></div>
      <div class="small missCount"></div>
      ${buttonsHtml}
      ${schedHtml}
      <div class="small lastBy"></div>
    `;

    // Apply guild-based button visibility (initial; will be reapplied on user change)
    const userInfo = window.ModalModule.getUserInfo();
    if(userInfo && userInfo.guild && userInfo.guild.toLowerCase() !== 'vesperial'){
      const stopBtn = card.querySelector('.stopBtn');
      const sendBtn = card.querySelector('.sendBtn');
      if(stopBtn) stopBtn.style.display='none';
      if(sendBtn) sendBtn.style.display='none';
    }

    return card;
  }

  function renderManualTimers(){
    const grid = document.getElementById('manualBossGrid');
    grid.innerHTML='';
    Object.values(bossMap).forEach(b=>{ if(b.manual) grid.appendChild(createBossCard(b)); });
    attachManualHandlers();
  }

  function renderScheduledTimers(){
    const grid = document.getElementById('scheduledBossGrid');
    grid.innerHTML='';
    Object.values(bossMap).forEach(b=>{ if(b.scheduled) grid.appendChild(createBossCard(b,false)); });
    attachScheduledHandlers();
  }

  function renderBossTimers(){
    renderManualTimers();
    renderScheduledTimers();
    refreshSendPanel();
    applyGuildRestrictions();
  }

  // ---------- UI Helpers ----------
  function applyGuildRestrictions(){
    const userInfo = window.ModalModule.getUserInfo();
    const isVesperial = userInfo && userInfo.guild && userInfo.guild.toLowerCase() === 'vesperial';
    document.getElementById('restartAll').style.display = isVesperial ? 'inline-block' : 'none';
    document.getElementById('stopAll').style.display = isVesperial ? 'inline-block' : 'none';
    document.getElementById('sendTimers').style.display = isVesperial ? 'inline-block' : 'none';

    document.querySelectorAll('.card').forEach(card=>{
      const stopBtn = card.querySelector('.stopBtn');
      const sendBtn = card.querySelector('.sendBtn');
      if(stopBtn) stopBtn.style.display = isVesperial ? 'inline-block' : 'none';
      if(sendBtn) sendBtn.style.display = isVesperial ? 'inline-block' : 'none';
    });

    const sp = document.getElementById('sendPanel');
    if(sp) sp.style.display = isVesperial ? 'block' : 'none';
  }

  // ---------- Attach Handlers ----------
  function attachManualHandlers(){
    document.querySelectorAll('#manualBossGrid .card').forEach(card=>{
      const label = card.dataset.label;
      const manual = bossMap[label].manual;
      if(!manual) return;

      const restartBtn = card.querySelector('.restartBtn');
      const stopBtn = card.querySelector('.stopBtn');
      const deleteBtn = card.querySelector('.deleteBtn');
      const sendBtn = card.querySelector('.sendBtn');

      if(restartBtn && !restartBtn.dataset.bound){
        restartBtn.addEventListener('click', ()=>{
          const userInfo = window.ModalModule.getUserInfo();
          const entry = { startedAt: Date.now(), user: userInfo.user, guild: userInfo.guild };
          db.ref('timers/'+manual.id).set(entry);
          db.ref('timerLogs/'+manual.id).push(entry);
          // reset misses when restarted
          db.ref('misses/'+manual.id).set(null);
          sendVisitorDiscord(`🟢 **${label}** restarted by **${userInfo.user} [${userInfo.guild}]**`);
        });
        restartBtn.dataset.bound='1';
      }

      if(stopBtn && !stopBtn.dataset.bound){
        stopBtn.addEventListener('click', ()=>{
          db.ref('timers/'+manual.id).set(null);
          const userInfo = window.ModalModule.getUserInfo();
          sendVisitorDiscord(`⏹️ **${label}** timer stopped by **${userInfo.user} [${userInfo.guild}]**`);
        });
        stopBtn.dataset.bound='1';
      }

      if(deleteBtn && !deleteBtn.dataset.bound){
        deleteBtn.addEventListener('click', ()=>{
          if(confirm(`Delete manual timer for ${label}?`)){
            delete bossMap[label].manual;
            db.ref('timers/'+manual.id).set(null);
            db.ref('misses/'+manual.id).set(null);
            renderManualTimers();
            const userInfo = window.ModalModule.getUserInfo();
            sendVisitorDiscord(`🗑️ **${label}** manual timer deleted by **${userInfo.user} [${userInfo.guild}]**`);
          }
        });
        deleteBtn.dataset.bound='1';
      }

      if(sendBtn && !sendBtn.dataset.bound){
        sendBtn.addEventListener('click', async ()=>{
          const endTimeText = await computeManualSendTime(manual);
          const userInfo = window.ModalModule.getUserInfo();
          const msg = `@everyone\n🟢 **${label}**\nTime: ${endTimeText}\nBy: ${userInfo.user}`;
          sendBossDiscord(msg);
        });
        sendBtn.dataset.bound='1';
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
            const occ = window.SchedulerModule.getNextOccurrence(day,time);
            if(!nextTime || occ < nextTime) nextTime = occ;
          });
          const endDate = nextTime ? new Date(nextTime) : null;
          const endTimeText = endDate ? `${endDate.toLocaleDateString(undefined,{weekday:'short',day:'2-digit',month:'short'})} ${endDate.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}` : '--:--';
          const userInfo = window.ModalModule.getUserInfo();
          const msg = `@everyone\n🟢 **${label}**\nNext spawn: ${endTimeText}\nBy: ${userInfo.user}`;
          sendBossDiscord(msg);
        });
        sendBtn.dataset.bound='1';
      }
    });
  }

  // ---------- Compute manual send time ----------
  function formatDateForMsg(ms){
    const d = new Date(ms);
    return `${d.toLocaleDateString(undefined,{weekday:'short',day:'2-digit',month:'short'})} ${d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}`;
  }

  async function computeManualSendTime(manual){
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

  // ---------- Update Clocks ----------
  function updateBossClocks(){
    const now = Date.now();

    ['manualBossGrid','scheduledBossGrid'].forEach(gridId => {
      document.querySelectorAll(`#${gridId} .card`).forEach(card => {
        const label = card.dataset.label;
        const b = bossMap[label];
        const clockEl = card.querySelector('.clock');
        const datetimeEl = card.querySelector('.datetime');
        const lastByEl = card.querySelector('.lastBy');
        const endTimeEl = card.querySelector('.endtime');
        const missCountEl = card.querySelector('.missCount');
        let remaining = null;

        // manual
        if(b && b.manual){
          const data = startTimes[b.manual.id];
          if(data && data.startedAt){
            remaining = b.manual.hours*3600 - Math.floor((now - data.startedAt)/1000);

            if(remaining <= 600 && remaining > 599 && !notified10Min[b.manual.id]){
              sendBossDiscord(`@everyone⏰ **${b.label}** will spawn in 10 minutes!`);
              notified10Min[b.manual.id] = true;
            } else if(remaining > 600){
              notified10Min[b.manual.id] = false;
            }

            if(missCountEl) missCountEl.textContent = '';
          } else {
            const miss = missesCache[b.manual.id] || null;
            if(miss && miss.nextMissTime){
              remaining = Math.floor((miss.nextMissTime - now)/1000);

              const missKey = 'miss_' + b.manual.id;
              if(remaining <= 600 && remaining > 599 && !notified10Min[missKey]){
                sendBossDiscord(`@everyone⏰ **${b.label}** will spawn in 10 minutes!`);
                notified10Min[missKey] = true;
              } else if(remaining > 600){
                notified10Min[missKey] = false;
              }

              if(missCountEl) missCountEl.textContent = `Misses: ${miss.missCount || 0}`;
              if(datetimeEl && miss.nextMissTime) datetimeEl.textContent = `Next spawn: ${new Date(miss.nextMissTime).toLocaleDateString(undefined,{weekday:'short'})} ${new Date(miss.nextMissTime).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}`;
            } else {
              remaining = b.manual.hours*3600;
              if(missCountEl) missCountEl.textContent = '';
            }
          }
        }

        // scheduled
        if(b && b.scheduled){
          let next = null;
          b.scheduled.schedule.split(',').forEach(s=>{
            const [day,time] = s.trim().split(' ');
            const occ = window.SchedulerModule.getNextOccurrence(day,time);
            if(!next || occ < next) next = occ;
          });

          if(next){
            const schedRemaining = Math.floor((next - now)/1000);
            const schedKey = 'sched_' + b.label;
            if(schedRemaining === 600 && !notified10Min[schedKey]){
              sendBossDiscord(`@everyone⏰ **${b.label}** will spawn in 10 minutes!`);
              notified10Min[schedKey] = true;
            } else if(schedRemaining > 600){
              notified10Min[schedKey] = false;
            }

            if(remaining===null || schedRemaining<remaining) remaining = schedRemaining;
            const d = new Date(next);
            datetimeEl.textContent = `Next spawn: ${d.toLocaleDateString(undefined,{weekday:'short'})} ${d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}`;
          }
        }

        // display
        let isSameDay = false;
        if (b && b.manual && startTimes[b.manual.id]) {
          const endDate = new Date(startTimes[b.manual.id].startedAt + b.manual.hours*3600*1000);
          isSameDay = new Date().toDateString() === endDate.toDateString();
        }
        if (b && b.scheduled) {
          let next = null;
          b.scheduled.schedule.split(',').forEach(s => {
            const [day,time] = s.trim().split(' ');
            const occ = window.SchedulerModule.getNextOccurrence(day,time);
            if (!next || occ < next) next = occ;
          });

          if (next) {
            const nextDate = new Date(next);
            isSameDay = new Date().toDateString() === nextDate.toDateString();
            // datetimeEl already updated above
          }
        }

        if(remaining!==null){
          if(remaining<=0){
            remaining=0;
            card.classList.add('expired');
            card.classList.remove('warning','timer-running','timer-today');
            // play ready sound when expired (ready to spawn)
            try { window.SoundModule.playReady(); } catch(e){}
          } else if (isSameDay) {
            card.classList.add('timer-today');
            card.classList.remove('expired','warning','timer-running');
          } else {
            card.classList.add('timer-running');
            card.classList.remove('expired','warning','timer-today');
          }

          const h=Math.floor(remaining/3600);
          const m=Math.floor((remaining%3600)/60);
          const s=remaining%60;
          clockEl.textContent=`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

          if(b && b.manual && startTimes[b.manual.id]){
            const endDate=new Date(startTimes[b.manual.id].startedAt + b.manual.hours*3600*1000);
            if(endTimeEl) endTimeEl.textContent = `Ends: ${endDate.toLocaleDateString(undefined,{weekday:'short',day:'2-digit',month:'short'})} ${endDate.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}`;
            lastByEl.textContent = `Last restart: ${startTimes[b.manual.id].user} [${startTimes[b.manual.id].guild}]`;
          }
        } else {
          clockEl.textContent='--:--:--';
          if(endTimeEl) endTimeEl.textContent='';
          lastByEl.textContent='';
          if(card) card.classList.remove('expired','warning','timer-today','timer-running');
        }
      });
    });
  }

  // ---------- Visitor Logging ----------
  const visitorLogDiv = document.getElementById('visitorLog');
  const VISITOR_COOLDOWN = 5*60*1000;

  function logVisitor(user,guild){
    if(!user || !guild) return;
    const userKey = encodeURIComponent(`${user}|${guild}`);
    const now = Date.now();
    const cooldownRef = db.ref('visitorCooldowns/'+userKey);
    const visitRef = db.ref('siteVisits').push();

    cooldownRef.get().then(snapshot=>{
      const lastTime = snapshot.val() || 0;
      const canSend = (now - lastTime) >= VISITOR_COOLDOWN;
      visitRef.set({user,guild,accessedAt:now}).catch(e=>console.error('visit set error', e));
      if(canSend){
        sendVisitorDiscord(`👀 New visitor: **${user} [${guild}]** visited the site!`);
        cooldownRef.set(now).catch(e=>console.error('cooldown set error', e));
      }
    }).catch(err=>{
      visitRef.set({user,guild,accessedAt:now}).catch(e=>console.error('visit set fallback error', e));
    });
  }

  function loadVisitors(){
    const cutoff = Date.now() - 10*60*1000;
    const q = db.ref('siteVisits').orderByChild('accessedAt').startAt(cutoff).limitToLast(200);
    if(window._siteVisitsListenerRef) {
      window._siteVisitsListenerRef.off();
    }
    window._siteVisitsListenerRef = q;
    q.on('value', snap=>{
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
    }, err=>{
      console.error('loadVisitors Firebase error', err);
      visitorLogDiv.textContent = 'Unable to load visitors';
    });
  }

  // ---------- Firebase Listeners ----------
  manualDefs.forEach(m=>{
    // timers current
    db.ref('timers/'+m.id).on('value', snap => {
      const val = snap.val();
      startTimes[m.id] = val;
      if(val && val.startedAt){
        lastStarts[m.id] = val.startedAt;
      }
      renderBossTimers();
    });

    // misses listener
    db.ref('misses/'+m.id).on('value', snap => {
      missesCache[m.id] = snap.val();
      renderBossTimers();
    });

    // fetch last log entry once to have fallback previous start
    db.ref('timerLogs/'+m.id).orderByChild('startedAt').limitToLast(1).once('value').then(snap=>{
      snap.forEach(c=>{
        const v = c.val();
        if(v && v.startedAt) lastStarts[m.id] = v.startedAt;
      });
    }).catch(()=>{});
  });

  db.ref('fixedTimers').on('value', snap=>{
    fixedTimersCache = snap.val() || {};
    mergeTimers();
    renderBossTimers();
  });

  // ---------- Miss Processing Logic ----------
  function processMisses(){
    const now = Date.now();

    manualDefs.forEach(manual => {
      const running = startTimes[manual.id];
      const missRef = db.ref('misses/'+manual.id);

      if(running && running.startedAt){
        missRef.get().then(snap=>{
          if(snap.exists()) missRef.set(null);
        }).catch(()=>{});
        return;
      }

      const missData = missesCache[manual.id] || null;
      const lastStart = lastStarts[manual.id] || null;
      const timerMs = manual.hours * 3600 * 1000;

      if(missData && missData.lastMissTime){
        missRef.transaction(current=>{
          if(!current) return current;
          let missCount = current.missCount || 0;
          let lastMissTime = current.lastMissTime || current.lastMissTime;
          let next = current.nextMissTime || (lastMissTime + timerMs + (missCount * MISS_PENALTY_MS));
          let changed = false;
          while(next <= Date.now()){
            missCount = (missCount || 0) + 1;
            lastMissTime = next;
            next = lastMissTime + timerMs + (missCount * MISS_PENALTY_MS);
            changed = true;
          }
          if(changed){
            return { missCount, lastMissTime, nextMissTime: next };
          }
          return undefined;
        }).catch(()=>{});
        return;
      }

      if(!missData && lastStart){
        const prevSpawn = lastStart + timerMs;
        if(prevSpawn <= now){
          const missCount = 1;
          const lastMissTime = prevSpawn;
          const nextMissTime = lastMissTime + timerMs + (missCount * MISS_PENALTY_MS);
          missRef.set({ missCount, lastMissTime, nextMissTime }).catch(()=>{});
        }
      }
    });
  }

  setInterval(processMisses, 10000);
  processMisses();

  // ---------- Send All Timers ----------
  const sendTimersBtn = document.getElementById('sendTimers');

  // Guild visibility
  const initUser = window.ModalModule.getUserInfo();
  if(initUser && initUser.guild && initUser.guild.toLowerCase() !== 'vesperial'){
    sendTimersBtn.style.display='none';
    document.getElementById('restartAll').style.display='none';
    document.getElementById('stopAll').style.display='none';
  }

  sendTimersBtn.addEventListener('click', async () => {
    let messages = [];

    for(const b of Object.values(bossMap)){
      if(b.manual){
        const manual = b.manual;
        const data = startTimes[manual.id];
        let endTimeText = '--:--';
        if(data && data.startedAt){
          const end = new Date(data.startedAt + manual.hours*3600*1000);
          endTimeText = `${end.toLocaleDateString(undefined,{weekday:'short',day:'2-digit',month:'short'})} ${end.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}`;
        } else {
          const miss = missesCache[manual.id] || null;
          if(miss && miss.nextMissTime){
            endTimeText = `${formatDateForMsg(miss.nextMissTime)} (Misses: ${miss.missCount || 0})`;
          }
        }
        messages.push(`🟢 **${b.label}**\nTime: ${endTimeText}`);
      }
    }

    Object.values(bossMap).forEach(b => {
      if(b.scheduled){
        let nextTime = null;
        b.scheduled.schedule.split(',').forEach(s=>{
          const [day,time] = s.trim().split(' ');
          const occ = window.SchedulerModule.getNextOccurrence(day,time);
          if(!nextTime || occ < nextTime) nextTime = occ;
        });
        const endDate = nextTime ? new Date(nextTime) : null;
        const endTimeText = endDate ? `${endDate.toLocaleDateString(undefined,{weekday:'short',day:'2-digit',month:'short'})} ${endDate.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}` : '--:--';
        messages.push(`🟢 **${b.label}**\nNext spawn: ${endTimeText}`);
      }
    });

    if(messages.length){
      const fullMsg = `@everyone\n` + messages.join('\n\n');
      sendBossDiscord(fullMsg);
    }
  });

  // ---------- Auto Update Clocks ----------
  setInterval(updateBossClocks,1000);

  // ---------- Switch Webhook Button ----------
  document.getElementById('switchWebhook').addEventListener('click', ()=>{
    const current = parseInt(localStorage.getItem('activeBossWebhook') || "1", 10);
    const next = current === 1 ? 2 : 1;
    setActiveBossWebhook(next);
  });

  // ---------- Send Panel ----------
  const sendPanelContent = document.getElementById('sendPanelContent');
  const toggleSendPanel = document.getElementById('toggleSendPanel');
  let sendPanelOpen = true;

  toggleSendPanel.addEventListener('click', () => {
    sendPanelOpen = !sendPanelOpen;
    sendPanelContent.style.display = sendPanelOpen ? 'block' : 'none';
    toggleSendPanel.textContent = sendPanelOpen ? '▲' : '▼';
  });

  function refreshSendPanel(){
    const container = document.getElementById('sendPanelTimers');
    container.innerHTML = '';
    Object.values(bossMap).forEach(b=>{
      const div=document.createElement('div');
      div.innerHTML=`<label><input type="checkbox" value="${b.label}"> ${b.label}</label>`;
      container.appendChild(div);
    });
  }

  document.getElementById('sendSelected').addEventListener('click', async ()=>{
    const selected = Array.from(document.querySelectorAll('#sendPanelTimers input:checked')).map(i=>i.value);
    const customMsg = document.getElementById('customMessage').value.trim();
    if(!selected.length){ alert("Select at least one timer."); return; }

    let messages=[];
    for(const label of selected){
      const b = bossMap[label];
      if(!b) continue;

      if(b.manual){
        const data = startTimes[b.manual.id];
        let endTimeText='--:--';
        if(data && data.startedAt){
          const end = new Date(data.startedAt + b.manual.hours*3600*1000);
          endTimeText = `${end.toLocaleDateString(undefined,{weekday:'short',day:'2-digit',month:'short'})} ${end.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}`;
        } else {
          const miss = missesCache[b.manual.id] || null;
          if(miss && miss.nextMissTime){
            endTimeText = `${new Date(miss.nextMissTime).toLocaleDateString(undefined,{weekday:'short',day:'2-digit',month:'short'})} ${new Date(miss.nextMissTime).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})} (Misses: ${miss.missCount || 0})`;
          }
        }
        messages.push(`🟢 **${label}**\nTime: ${endTimeText}`);
      }

      if(b.scheduled){
        let nextTime=null;
        b.scheduled.schedule.split(',').forEach(s=>{
          const [day,time] = s.trim().split(' ');
          const occ = window.SchedulerModule.getNextOccurrence(day,time);
          if(!nextTime || occ < nextTime) nextTime = occ;
        });
        const endDate=nextTime ? new Date(nextTime):null;
        const endTimeText = endDate ? `${endDate.toLocaleDateString(undefined,{weekday:'short',day:'2-digit',month:'short'})} ${endDate.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}` : '--:--';
        messages.push(`🟢 **${label}**\nNext spawn: ${endTimeText}`);
      }
    }

    if(messages.length){
      let fullMsg = `@everyone\n`+messages.join('\n\n');
      if(customMsg) fullMsg += `\n\n💬 ${customMsg}`;
      sendBossDiscord(fullMsg);
    }
  });

  // ---------- Visitors wiring ----------
  if(window.ModalModule.getUserInfo()){
    const ui = window.ModalModule.getUserInfo();
    logVisitor(ui.user, ui.guild);
  }
  loadVisitors();
  setInterval(loadVisitors, 30000);

  // ---------- Export for main.js to call on init (if needed) ----------
  window.TowersModule = {
    renderBossTimers,
    updateBossClocks,
    processMisses,
    setActiveBossWebhook,
    sendBossDiscord,
    sendVisitorDiscord
  };

  // small boot render
  mergeTimers();
  renderBossTimers();
})();