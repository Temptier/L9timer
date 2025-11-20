// modal.js

// Elements
const userModal = document.getElementById("userModal");
const modalIGN = document.getElementById("modalIGN");
const modalGuild = document.getElementById("modalGuild");
const modalSubmit = document.getElementById("modalSubmit");
const mainContent = document.getElementById("mainContent");
const userInfo = document.getElementById("userInfo");
const changeUserBtn = document.getElementById("changeUser");

// Check localStorage for saved info
function loadUserInfo() {
  const ign = localStorage.getItem("userIGN");
  const guild = localStorage.getItem("userGuild");
  if (ign && guild) {
    userInfo.textContent = `IGN: ${ign} | Guild: ${guild}`;
    mainContent.style.display = "block";
    userModal.style.display = "none";
  } else {
    userModal.style.display = "flex";
  }
}

// Save user info
function saveUserInfo() {
  const ign = modalIGN.value.trim();
  const guild = modalGuild.value.trim();
  if (!ign || !guild) return alert("Please fill in both fields.");
  localStorage.setItem("userIGN", ign);
  localStorage.setItem("userGuild", guild);
  userInfo.textContent = `IGN: ${ign} | Guild: ${guild}`;
  mainContent.style.display = "block";
  userModal.style.display = "none";
}

// Event listeners
modalSubmit.addEventListener("click", saveUserInfo);
changeUserBtn.addEventListener("click", () => {
  userModal.style.display = "flex";
  mainContent.style.display = "none";
});

// Initialize
loadUserInfo();