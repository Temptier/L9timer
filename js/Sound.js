// ===============================
// Sound management
// ===============================

let defaultBeep = new Audio("beep.mp3");
let customBeep = null;

// Load custom beep from localStorage if exists
const savedAudio = localStorage.getItem("customBeepData");
if (savedAudio) {
    customBeep = new Audio(savedAudio);
}

export function playBeep() {
    const useCustom = localStorage.getItem("useCustomBeep") === "true";

    if (useCustom && customBeep) {
        customBeep.currentTime = 0;
        customBeep.play();
    } else {
        defaultBeep.currentTime = 0;
        defaultBeep.play();
    }
}

// Save custom beep
export function loadCustomBeep(file) {
    const reader = new FileReader();
    reader.onload = () => {
        localStorage.setItem("customBeepData", reader.result);
        customBeep = new Audio(reader.result);
    };
    reader.readAsDataURL(file);
}

export function setUseCustomBeep(value) {
    localStorage.setItem("useCustomBeep", value ? "true" : "false");
}