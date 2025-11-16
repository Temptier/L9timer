/* main.js
   Bootstraps app and wires top-level controls (add manual/scheduled, restart all, stop all).
*/
(function(window){
  // Wait briefly to ensure modules loaded
  function ready(fn){
    if(document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(() => {
    // Top-level controls
    const addManual = document.getElementById('addManual');
    const manualName = document.getElementById('manualName');
    const manualHours = document.getElementById('manualHours');
    const addScheduled = document.getElementById('addScheduled');
    const schedName = document.getElementById('schedName');
    const schedTime = document.getElementById('schedTime');
    const restartAll = document.getElementById('restartAll');
    const stopAll = document.getElementById('stopAll');
    const confirmModal = document.getElementById('confirmModal');
    const confirmYes = document.getElementById('confirmYes');
    const confirmNo = document.getElementById('confirmNo');
    const dontShowAgain = document.getElementById('dontShowAgain');

    // show main content (modal module toggles it if user not set)
    document.getElementById('mainContent').style.display = 'block';
    // update webhook label
    window.TowersModule.setActiveBossWebhook(parseInt(localStorage.getItem('activeBossWebhook') || "1", 10), true);

    // Add manual - creates a custom manual timer in Firebase as well as local UI
    addManual.addEventListener('click', ()=>{
      const name = manualName.value.trim();
      const hours = parseInt(manualHours.value,10) || 24;
      if(!name){ alert('Enter boss name'); return; }
      const id = 'manual_'+name.replace(/\s+/g,'_').toLowerCase();
      const def = { label: name, hours, id, isCustom: true };
      // write to firebase fixedTimers? We'll keep it local by updating 'fixedTimers' area for persistence
      const key = id;
      window.FirebaseModule.db.ref('manualDefs/'+key).set(def).then(()=>{
        // best-effort: tell user to refresh or re-run merge
        alert('Manual timer added. It will appear shortly.');
      }).catch(e=>{ console.error(e); alert('Unable to add manual timer'); });
    });

    // Add scheduled boss
    addScheduled.addEventListener('click', ()=>{
      const name = schedName.value.trim();
      const sched = schedTime.value.trim();
      if(!name || !sched){ alert('Name and schedule required'); return; }
      const key = 'custom_'+name.replace(/\s+/g,'_').toLowerCase();
      window.FirebaseModule.db.ref('fixedTimers/'+key).set({ label:name, schedule: sched }).then(()=>{
        alert('Scheduled boss added.');
      }).catch(e=>{ console.error(e); alert('Unable to add scheduled boss'); });
    });

    // Restart all (ask confirm unless disabled)
    restartAll.addEventListener('click', ()=>{
      const skip = localStorage.getItem('dontAskRestart') === '1';
      if(skip){
        performRestartAll();
        return;
      }
      confirmModal.classList.remove('hidden');
    });

    confirmYes.addEventListener('click', ()=>{
      if(dontShowAgain.checked) localStorage.setItem('dontAskRestart','1');
      confirmModal.classList.add('hidden');
      performRestartAll();
    });
    confirmNo.addEventListener('click', ()=> confirmModal.classList.add('hidden'));

    function performRestartAll(){
      // iterate manualDefs from Towers module (we rely on same manualDefs list in Towers.js)
      // For simplicity, write start time for each manual in timers/
      const user = window.ModalModule.getUserInfo();
      if(!user){ alert('Set user first'); return; }
      const now = Date.now();
      window.TowersModule.updateBossClocks(); // immediate UI refresh
      // restart each manual timer
      // manual list is in Towers.js scope, not exported — but we can re-create same list here or call firebase
      // We'll write to timers/<id> for each known manual name from the preloaded list (replicates Towers' list)
      const preloaded = ["Venatus","Viorent","Ego","Levera","Araneo","Undomiel","Lady Dalia","General Aquleus","Amentis","Baron Braudmore","Wannitas","Metus","Duplican","Shuliar","Gareth","Titore","Larba","Catena"];
      preloaded.forEach(name=>{
        const id = 'manual_'+name.replace(/\s+/g,'_').toLowerCase();
        const payload = { startedAt: now, user: user.user, guild: user.guild };
        window.FirebaseModule.db.ref('timers/'+id).set(payload).catch(e=>console.error('restartAll error', e));
      });
      alert('Restarted all preloaded manual timers.');
    }

    // Stop all
    stopAll.addEventListener('click', ()=>{
      if(!confirm('Stop all manual timers?')) return;
      const preloaded = ["Venatus","Viorent","Ego","Levera","Araneo","Undomiel","Lady Dalia","General Aquleus","Amentis","Baron Braudmore","Wannitas","Metus","Duplican","Shuliar","Gareth","Titore","Larba","Catena"];
      preloaded.forEach(name=>{
        const id = 'manual_'+name.replace(/\s+/g,'_').toLowerCase();
        window.FirebaseModule.db.ref('timers/'+id).set(null).catch(e=>console.error('stopAll error', e));
      });
      alert('Stopped all preloaded manual timers.');
    });

    // small periodic tasks (UI refresh)
    setInterval(()=>{
      try{ window.TowersModule.updateBossClocks(); }catch(e){}
    }, 1000);

    // when user changes (Modal dispatch event), re-apply guild permissions and log visitor
    window.addEventListener('userInfo.changed', (e)=>{
      const ui = e.detail;
      if(ui && ui.user && ui.guild){
        // update header & apply restrictions
        document.getElementById('userInfo').textContent = `IGN: ${ui.user} | Guild: ${ui.guild}`;
        try{ window.TowersModule.renderBossTimers(); }catch(e){}
        // log visitor
        try{ window.FirebaseModule.db.ref('siteVisits').push({ user: ui.user, guild: ui.guild, accessedAt: Date.now() }); }catch(e){}
      }
    });
  });
})(window);