/* Scheduler.js
   Simple scheduled boss helpers. Exposes getNextOccurrence(dayStr, timeStr)
*/
(function(window){
  const days = ['sun','mon','tue','wed','thu','fri','sat'];

  function getNextOccurrence(dayStr, timeStr){
    const now = new Date();
    const targetDay = days.indexOf(dayStr.toLowerCase());
    if(targetDay === -1){
      // fallback: return now
      return now.getTime();
    }
    const [hour, minute] = timeStr.split(':').map(Number);
    let dt = new Date(now);
    dt.setHours(hour, minute, 0, 0);
    let diff = targetDay - dt.getDay();
    if(diff < 0 || (diff === 0 && dt < now)) dt.setDate(dt.getDate() + 7 + diff);
    else dt.setDate(dt.getDate() + diff);
    return dt.getTime();
  }

  window.SchedulerModule = {
    getNextOccurrence
  };
})(window);