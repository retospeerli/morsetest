const MORSE_MAP = {
  A: ".-",
  B: "-...",
  C: "-.-.",
  D: "-..",
  E: ".",
  F: "..-.",
  G: "--.",
  H: "....",
  I: "..",
  J: ".---",
  K: "-.-",
  L: ".-..",
  M: "--",
  N: "-.",
  O: "---",
  P: ".--.",
  Q: "--.-",
  R: ".-.",
  S: "...",
  T: "-",
  U: "..-",
  V: "...-",
  W: ".--",
  X: "-..-",
  Y: "-.--",
  Z: "--.."
};

const setupScreen = document.getElementById("setupScreen");
const appScreen = document.getElementById("appScreen");

const firstNameInput = document.getElementById("firstNameInput");
const lastNameInput = document.getElementById("lastNameInput");
const startBtn = document.getElementById("startBtn");
const backBtn = document.getElementById("backBtn");

const unitSlider = document.getElementById("unitSlider");
const freqSlider = document.getElementById("freqSlider");
const toleranceSlider = document.getElementById("toleranceSlider");
const unitLabel = document.getElementById("unitLabel");
const freqLabel = document.getElementById("freqLabel");
const toleranceLabel = document.getElementById("toleranceLabel");

const screenTitle = document.getElementById("screenTitle");
const screenInfo = document.getElementById("screenInfo");
const targetText = document.getElementById("targetText");
const hintText = document.getElementById("hintText");

const playBtn = document.getElementById("playBtn");
const clearBtn = document.getElementById("clearBtn");
const finishBtn = document.getElementById("finishBtn");

const morseKey = document.getElementById("morseKey");
const livePattern = document.getElementById("livePattern");
const liveDecode = document.getElementById("liveDecode");
const feedback = document.getElementById("feedback");

const recognizedTextEl = document.getElementById("recognizedText");
const charCountEl = document.getElementById("charCount");
const statusTextEl = document.getElementById("statusText");

let appMode = "exam"; // exam | practice
let expectedText = "";
let recognizedLetters = [];
let currentInputSymbols = "";

let audioCtx = null;
let oscillator = null;
let gainNode = null;

let isPressing = false;
let pressStartTime = 0;
let finalizeLetterTimer = null;

const toleranceSettings = [
  { name: "streng", dotMaxFactor: 1.8, letterPauseFactor: 2.6 },
  { name: "mittel", dotMaxFactor: 2.2, letterPauseFactor: 3.0 },
  { name: "grosszügig", dotMaxFactor: 2.8, letterPauseFactor: 3.6 }
];

function init() {
  updateLabels();
  updateModeFromRadios();
  setupEventListeners();
  updateStartUI();
  resetAppState();
}

function setupEventListeners() {
  unitSlider.addEventListener("input", updateLabels);
  freqSlider.addEventListener("input", updateLabels);
  toleranceSlider.addEventListener("input", updateLabels);

  document.querySelectorAll('input[name="appMode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      updateModeFromRadios();
      updateStartUI();
    });
  });

  startBtn.addEventListener("click", startApp);
  backBtn.addEventListener("click", goBack);

  playBtn.addEventListener("click", playTarget);
  clearBtn.addEventListener("click", clearCurrentAttempt);
  finishBtn.addEventListener("click", finishAttempt);

  morseKey.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handlePressStart();
  });

  morseKey.addEventListener("pointerup", (e) => {
    e.preventDefault();
    handlePressEnd();
  });

  morseKey.addEventListener("pointerleave", () => {
    if (isPressing) handlePressEnd();
  });

  morseKey.addEventListener("pointercancel", () => {
    if (isPressing) handlePressEnd();
  });

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (!appScreen.classList.contains("hidden") && !e.repeat) {
        handlePressStart();
      }
    }
  });

  document.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (!appScreen.classList.contains("hidden")) {
        handlePressEnd();
      }
    }
  });

  window.addEventListener("blur", () => {
    if (isPressing) handlePressEnd();
  });
}

function updateModeFromRadios() {
  const checked = document.querySelector('input[name="appMode"]:checked');
  appMode = checked ? checked.value : "exam";
}

function updateStartUI() {
  const showNames = appMode === "exam";
  document.getElementById("nameFields").style.display = showNames ? "block" : "none";
}

function updateLabels() {
  unitLabel.textContent = `${unitSlider.value} ms`;
  freqLabel.textContent = `${freqSlider.value} Hz`;
  toleranceLabel.textContent = toleranceSettings[Number(toleranceSlider.value)].name;
}

function getUnit() {
  return Number(unitSlider.value);
}

function getFrequency() {
  return Number(freqSlider.value);
}

function getTolerance() {
  return toleranceSettings[Number(toleranceSlider.value)];
}

function normalizeNamePart(text) {
  return String(text || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z]/g, "");
}

function buildExpectedName() {
  const first = normalizeNamePart(firstNameInput.value);
  const last = normalizeNamePart(lastNameInput.value);

  if (!first || !last) return "";
  return `${first}${last}`;
}

function resetAppState() {
  recognizedLetters = [];
  currentInputSymbols = "";
  livePattern.textContent = "–";
  liveDecode.textContent = "…";
  recognizedTextEl.textContent = "–";
  charCountEl.textContent = "0";
  statusTextEl.textContent = "Bereit";
  setFeedback("Noch keine Eingabe.", "neutral");
}

function startApp() {
  updateModeFromRadios();

  if (appMode === "exam") {
    expectedText = buildExpectedName();

    if (!expectedText) {
      alert("Bitte Vorname und Nachname eingeben.");
      return;
    }

    screenTitle.textContent = "Prüfung";
    screenInfo.textContent = "Morse deinen ganzen Vor- und Nachnamen ohne Leerzeichen.";
    targetText.textContent = `${normalizeNamePart(firstNameInput.value)} ${normalizeNamePart(lastNameInput.value)}`;
    hintText.textContent = "Wenn dein ganzer Name korrekt gemorst ist, erhältst du den nächsten Hinweis.";
    statusTextEl.textContent = "Prüfung läuft";
  } else {
    expectedText = "";
    screenTitle.textContent = "Übungsmodus";
    screenInfo.textContent = "Freies Morsen: Die App schreibt einfach mit, was sie versteht.";
    targetText.textContent = "FREIES MORSEN";
    hintText.textContent = "Morse frei. Mit Überprüfen wird nichts bewertet, nur angezeigt.";
    statusTextEl.textContent = "Freies Üben";
  }

  resetAppState();

  setupScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");

  ensureAudio();
}

function goBack() {
  stopTone();
  clearLetterTimer();
  isPressing = false;
  setupScreen.classList.remove("hidden");
  appScreen.classList.add("hidden");
}

function clearCurrentAttempt() {
  clearLetterTimer();
  resetAppState();
}

function setFeedback(text, type = "neutral") {
  feedback.textContent = text;
  feedback.className = `feedback ${type}`;
}

function updateRecognizedUI() {
  const text = recognizedLetters.join("");
  recognizedTextEl.textContent = text || "–";
  charCountEl.textContent = String(text.length);
  liveDecode.textContent = text || "…";
}

function patternToLetter(pattern) {
  for (const [letter, morse] of Object.entries(MORSE_MAP)) {
    if (morse === pattern) return letter;
  }
  return null;
}

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function startTone() {
  ensureAudio();
  stopTone();

  oscillator = audioCtx.createOscillator();
  gainNode = audioCtx.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = getFrequency();
  gainNode.gain.value = 0.18;

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  oscillator.start();
}

function stopTone() {
  if (oscillator) {
    try {
      oscillator.stop();
    } catch (err) {
      // ignore
    }
    oscillator.disconnect();
    oscillator = null;
  }

  if (gainNode) {
    gainNode.disconnect();
    gainNode = null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function playMorsePattern(pattern) {
  const unit = getUnit();

  for (let i = 0; i < pattern.length; i++) {
    const symbol = pattern[i];
    const duration = symbol === "." ? unit : unit * 3;

    startTone();
    await sleep(duration);
    stopTone();

    if (i < pattern.length - 1) {
      await sleep(unit);
    }
  }
}

async function playTarget() {
  let textToPlay = "";

  if (appMode === "exam") {
    textToPlay = expectedText;
  } else {
    const current = recognizedLetters.join("");
    if (!current) {
      setFeedback("Im Übungsmodus wird nur bereits gemorstes Material vorgespielt.", "warning");
      return;
    }
    textToPlay = current;
  }

  if (!textToPlay) return;

  playBtn.disabled = true;
  finishBtn.disabled = true;
  clearBtn.disabled = true;
  morseKey.disabled = true;

  const unit = getUnit();

  for (let i = 0; i < textToPlay.length; i++) {
    const ch = textToPlay[i];
    const pattern = MORSE_MAP[ch];
    if (!pattern) continue;

    await playMorsePattern(pattern);

    if (i < textToPlay.length - 1) {
      await sleep(unit * 3);
    }
  }

  await sleep(unit * 2);

  playBtn.disabled = false;
  finishBtn.disabled = false;
  clearBtn.disabled = false;
  morseKey.disabled = false;
}

function handlePressStart() {
  if (isPressing) return;

  ensureAudio();
  clearLetterTimer();

  isPressing = true;
  pressStartTime = performance.now();
  morseKey.classList.add("active");
  startTone();
}

function handlePressEnd() {
  if (!isPressing) return;

  isPressing = false;
  stopTone();
  morseKey.classList.remove("active");

  const duration = performance.now() - pressStartTime;
  const unit = getUnit();
  const tolerance = getTolerance();

  const symbol = duration < unit * tolerance.dotMaxFactor ? "." : "-";
  currentInputSymbols += symbol;
  livePattern.textContent = currentInputSymbols;

  const waitMs = unit * tolerance.letterPauseFactor;

  clearLetterTimer();
  finalizeLetterTimer = setTimeout(() => {
    finalizeCurrentLetter();
  }, waitMs);
}

function clearLetterTimer() {
  if (finalizeLetterTimer) {
    clearTimeout(finalizeLetterTimer);
    finalizeLetterTimer = null;
  }
}

function finalizeCurrentLetter() {
  if (!currentInputSymbols) return;

  const typedPattern = currentInputSymbols;
  const decoded = patternToLetter(typedPattern);

  currentInputSymbols = "";
  livePattern.textContent = "–";

  if (!decoded) {
    recognizedLetters.push("?");
    updateRecognizedUI();
    setFeedback(`Die Folge ${typedPattern} wurde als ? gespeichert.`, "warning");
    return;
  }

  recognizedLetters.push(decoded);
  updateRecognizedUI();
  setFeedback(`Erkannt: ${decoded}`, "neutral");
}

function finishAttempt() {
  clearLetterTimer();

  if (currentInputSymbols) {
    finalizeCurrentLetter();
  }

  const recognized = recognizedLetters.join("");

  if (appMode === "practice") {
    statusTextEl.textContent = "Frei gemorst";
    setFeedback(`Erkannt wurde: ${recognized || "∅"}`, "neutral");
    return;
  }

  if (!recognized) {
    setFeedback("Es wurde noch nichts erkannt.", "warning");
    statusTextEl.textContent = "Keine Eingabe";
    return;
  }

  if (recognized === expectedText) {
    statusTextEl.textContent = "Bestanden";
    setFeedback(
      "Richtig gemorst. Das Passwort ist der Name des Schulhauses.",
      "success"
    );
  } else {
    statusTextEl.textContent = "Nicht bestanden";
    setFeedback(
      `Nicht korrekt. Erkannt wurde: ${recognized}. Versuche es noch einmal.`,
      "error"
    );
  }
}

init();
