/* Modal.js
   Handles user info modal only and exposes getUserInfo() to other modules.
*/
(function(window){
  const modal = document.getElementById('userModal');
  const modalIGN = document.getElementById('modalIGN');
  const modalGuild = document.getElementById('modalGuild');
  const modalSubmit = document.getElementById('modalSubmit');
  const changeUserBtn = document.getElementById('changeUser');
  const mainContent = document.getElementById('mainContent');
  const userInfoEl = document.getElementById('userInfo');
  let userInfo = JSON.parse(localStorage.getItem('userInfo')) || null;

  function showUserModal(){
    modal.style.display = 'flex';
    mainContent.style.display = 'none';
    modalIGN.value = userInfo ? userInfo.user : '';
    modalGuild.value = userInfo ? userInfo.guild : '';
  }

  function hideUserModal(){
    modal.style.display = 'none';
    mainContent.style.display = 'block';
    if(userInfo && userInfo.user && userInfo.guild){
      userInfoEl.textContent = `IGN: ${userInfo.user} | Guild: ${userInfo.guild}`;
    } else {
      userInfoEl.textContent = 'IGN: — | Guild: —';
    }
  }

  modalSubmit.addEventListener('click', ()=>{
    const ign = modalIGN.value.trim();
    const guild = modalGuild.value.trim();
    if(!ign || !guild){ alert('Both IGN and Guild are required'); return; }
    userInfo = { user: ign, guild: guild };
    localStorage.setItem('userInfo', JSON.stringify(userInfo));
    hideUserModal();
    // notify other modules if needed
    window.dispatchEvent(new CustomEvent('userInfo.changed', { detail: userInfo }));
  });

  changeUserBtn.addEventListener('click', ()=>{
    showUserModal();
  });

  // initialize UI on load
  if(!userInfo || !userInfo.user || !userInfo.guild){
    showUserModal();
  } else {
    hideUserModal();
  }

  window.ModalModule = {
    getUserInfo: ()=> JSON.parse(localStorage.getItem('userInfo')) || null,
    showUserModal,
    hideUserModal
  };
})(window);