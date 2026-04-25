const MORSE_MAP = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".",
  F: "..-.", G: "--.", H: "....", I: "..", J: ".---",
  K: "-.-", L: ".-..", M: "--", N: "-.", O: "---",
  P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-",
  U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--",
  Z: "--.."
};

// UI
const setupScreen = document.getElementById("setupScreen");
const appScreen = document.getElementById("appScreen");

const firstNameInput = document.getElementById("firstNameInput");
const lastNameInput = document.getElementById("lastNameInput");

const startBtn = document.getElementById("startBtn");
const backBtn = document.getElementById("backBtn");

const targetText = document.getElementById("targetText");
const hintText = document.getElementById("hintText");

const morseKey = document.getElementById("morseKey");
const livePattern = document.getElementById("livePattern");
const liveDecode = document.getElementById("liveDecode");

const feedback = document.getElementById("feedback");
const recognizedTextEl = document.getElementById("recognizedText");
const statusTextEl = document.getElementById("statusText");

const chooseKeyBtn = document.getElementById("chooseKeyBtn");
const currentKeyLabel = document.getElementById("currentKeyLabel");
const currentKeyLabel2 = document.getElementById("currentKeyLabel2");

// STATE
let appMode = "free";
let expectedText = "";

let recognizedLetters = [];
let currentInputSymbols = "";

let morseKeyCode = "Space";
let morseKeyLabel = "Leertaste";
let waitingForKeyChoice = false;

let isPressing = false;
let pressStartTime = 0;

let finalizeTimer = null;
let endPauseTimer = null;
let longPauseTimer = null;
let longPauseViolation = false;

// AUDIO
let audioCtx = null;
let osc = null;

// INIT
function init() {
  setupEvents();
  updateKeyLabel();
}

// EVENTS
function setupEvents() {
  document.querySelectorAll('input[name="appMode"]').forEach(r =>
    r.addEventListener("change", () => appMode = r.value)
  );

  chooseKeyBtn.addEventListener("click", () => {
    waitingForKeyChoice = true;
    updateKeyLabel("Taste drücken...");
  });

  startBtn.addEventListener("click", startApp);
  backBtn.addEventListener("click", resetToStart);

  morseKey.addEventListener("pointerdown", e => { e.preventDefault(); pressStart(); });
  morseKey.addEventListener("pointerup", e => { e.preventDefault(); pressEnd(); });

  document.addEventListener("keydown", e => {
    if (waitingForKeyChoice) {
      morseKeyCode = e.code;
      morseKeyLabel = e.key.toUpperCase();
      waitingForKeyChoice = false;
      updateKeyLabel();
      return;
    }
    if (e.code === morseKeyCode && !e.repeat) pressStart();
  });

  document.addEventListener("keyup", e => {
    if (e.code === morseKeyCode) pressEnd();
  });
}

// KEY LABEL
function updateKeyLabel(txt) {
  const t = txt || morseKeyLabel;
  currentKeyLabel.textContent = t;
  currentKeyLabel2.textContent = t;
}

// AUDIO
function beep(on) {
  if (!audioCtx) audioCtx = new AudioContext();
  if (on) {
    osc = audioCtx.createOscillator();
    osc.connect(audioCtx.destination);
    osc.start();
  } else if (osc) {
    osc.stop();
    osc.disconnect();
    osc = null;
  }
}

// MORSE INPUT
function pressStart() {
  if (isPressing) return;

  clearTimers();
  isPressing = true;
  pressStartTime = performance.now();
  beep(true);
}

function pressEnd() {
  if (!isPressing) return;

  isPressing = false;
  beep(false);

  const dur = performance.now() - pressStartTime;
  const symbol = dur < 200 ? "." : "-";

  currentInputSymbols += symbol;
  livePattern.textContent = currentInputSymbols;

  finalizeTimer = setTimeout(finalizeLetter, 400);
}

// LETTER
function finalizeLetter() {
  const decoded = decode(currentInputSymbols);
  currentInputSymbols = "";
  livePattern.textContent = "–";

  recognizedLetters.push(decoded || "?");

  updateRecognizedUI();

  scheduleEnd();
  scheduleLongPause();
}

// DECODE
function decode(pattern) {
  for (let k in MORSE_MAP) {
    if (MORSE_MAP[k] === pattern) return k;
  }
  return null;
}

// UI UPDATE
function updateRecognizedUI() {
  const text = recognizedLetters.join("");

  if (appMode === "free") {
    recognizedTextEl.textContent = text || "–";
    liveDecode.textContent = text || "…";
  } else {
    recognizedTextEl.textContent = "verdeckt";
    liveDecode.textContent = "••••";
  }
}

// TIMERS
function scheduleEnd() {
  clearTimeout(endPauseTimer);
  endPauseTimer = setTimeout(finishAttempt, 3000);
}

function scheduleLongPause() {
  if (appMode !== "exam") return;

  clearTimeout(longPauseTimer);
  longPauseTimer = setTimeout(() => {
    longPauseViolation = true;
  }, 2000);
}

function clearTimers() {
  clearTimeout(finalizeTimer);
  clearTimeout(endPauseTimer);
  clearTimeout(longPauseTimer);
}

// FINISH
function finishAttempt() {
  const result = recognizedLetters.join("");

  if (appMode === "free") {
    feedback.textContent = result;
    return;
  }

  if (appMode === "practice") {
    recognizedTextEl.textContent = result;
    liveDecode.textContent = result;

    if (result === expectedText) {
      feedback.textContent = "Richtig!";
    } else {
      feedback.textContent = "Falsch!";
    }
    return;
  }

  if (appMode === "exam") {
    if (result === expectedText && !longPauseViolation) {
      feedback.textContent = "Bestanden!";
    } else {
      feedback.textContent = "Nicht verstanden, wiederholen";
      playQSM();
    }
  }
}

// QSM
function playQSM() {
  playText("QSM");
}

// PLAY
async function playText(text) {
  for (let c of text) {
    const p = MORSE_MAP[c];
    if (!p) continue;

    for (let s of p) {
      beep(true);
      await sleep(s === "." ? 100 : 300);
      beep(false);
      await sleep(100);
    }
    await sleep(300);
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// START
function startApp() {
  appMode = document.querySelector('input[name="appMode"]:checked').value;

  if (appMode !== "free") {
    const f = firstNameInput.value.toUpperCase();
    const l = lastNameInput.value.toUpperCase();
    if (!f || !l) return alert("Name fehlt");

    expectedText = `MEINNAMEIST${f}${l}`;
    targetText.textContent = `Mein Name ist ${f} ${l}`;
  }

  resetState();

  setupScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");
}

// RESET
function resetState() {
  recognizedLetters = [];
  currentInputSymbols = "";
  longPauseViolation = false;

  livePattern.textContent = "–";
  liveDecode.textContent = "…";
  recognizedTextEl.textContent = "–";
  feedback.textContent = "Bereit";
}

// BACK
function resetToStart() {
  setupScreen.classList.remove("hidden");
  appScreen.classList.add("hidden");
}

init();
