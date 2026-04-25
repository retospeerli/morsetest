const MORSE_MAP = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".",
  F: "..-.", G: "--.", H: "....", I: "..", J: ".---",
  K: "-.-", L: ".-..", M: "--", N: "-.", O: "---",
  P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-",
  U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--",
  Z: "--.."
};

const setupScreen = document.getElementById("setupScreen");
const appScreen = document.getElementById("appScreen");

const firstNameInput = document.getElementById("firstNameInput");
const lastNameInput = document.getElementById("lastNameInput");
const nameFields = document.getElementById("nameFields");

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

const morseKey = document.getElementById("morseKey");
const livePattern = document.getElementById("livePattern");
const liveDecode = document.getElementById("liveDecode");
const feedback = document.getElementById("feedback");

const recognizedTextEl = document.getElementById("recognizedText");
const charCountEl = document.getElementById("charCount");
const statusTextEl = document.getElementById("statusText");

const chooseKeyBtn = document.getElementById("chooseKeyBtn");
const currentKeyLabel = document.getElementById("currentKeyLabel");
const currentKeyLabel2 = document.getElementById("currentKeyLabel2");

let appMode = "free";
let expectedText = "";
let displaySentence = "";

let recognizedLetters = [];
let currentInputSymbols = "";

let morseKeyCode = "Space";
let morseKeyLabel = "Leertaste";
let waitingForKeyChoice = false;

let audioCtx = null;
let oscillator = null;
let gainNode = null;

let isPressing = false;
let pressStartTime = 0;

let finalizeLetterTimer = null;
let finishPauseTimer = null;
let longPauseTimer = null;
let longPauseViolation = false;

const PASS_HINT = "Richtig gemorst. Das Passwort ist der Name des Schulhauses.";
const Q_CODE_REPEAT = "QSM";

const toleranceSettings = [
  { name: "streng", dotMaxFactor: 1.8, letterPauseFactor: 2.6 },
  { name: "mittel", dotMaxFactor: 2.2, letterPauseFactor: 3.0 },
  { name: "grosszügig", dotMaxFactor: 2.8, letterPauseFactor: 3.6 }
];

function init() {
  updateLabels();
  updateModeFromRadios();
  updateStartUI();
  updateMorseKeyLabels();
  setupEventListeners();
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

  chooseKeyBtn.addEventListener("click", () => {
    waitingForKeyChoice = true;
    updateMorseKeyLabels("nächste Taste drücken ...");
    setFeedback("Drücke jetzt die Taste, die als Morsetaste dienen soll.", "neutral");
  });

  startBtn.addEventListener("click", startApp);
  backBtn.addEventListener("click", goBack);
  playBtn.addEventListener("click", playTarget);
  clearBtn.addEventListener("click", clearCurrentAttempt);

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
    if (waitingForKeyChoice) {
      e.preventDefault();

      morseKeyCode = e.code;
      morseKeyLabel = getReadableKeyName(e);
      waitingForKeyChoice = false;

      updateMorseKeyLabels();
      setFeedback(`Morsetaste festgelegt: ${morseKeyLabel}`, "success");
      return;
    }

    if (e.code === morseKeyCode) {
      e.preventDefault();

      if (!appScreen.classList.contains("hidden") && !e.repeat) {
        handlePressStart();
      }
    }
  });

  document.addEventListener("keyup", (e) => {
    if (e.code === morseKeyCode) {
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
  appMode = checked ? checked.value : "free";
}

function updateStartUI() {
  nameFields.style.display = appMode === "free" ? "none" : "block";
}

function updateLabels() {
  unitLabel.textContent = `${unitSlider.value} ms`;
  freqLabel.textContent = `${freqSlider.value} Hz`;
  toleranceLabel.textContent = toleranceSettings[Number(toleranceSlider.value)].name;
}

function updateMorseKeyLabels(customText) {
  const text = customText || morseKeyLabel;
  currentKeyLabel.textContent = text;
  currentKeyLabel2.textContent = text;
}

function getReadableKeyName(e) {
  if (e.code === "Space") return "Leertaste";
  if (e.code.startsWith("Key")) return e.code.replace("Key", "");
  if (e.code.startsWith("Digit")) return e.code.replace("Digit", "");
  if (e.code.startsWith("Numpad")) return "Num " + e.code.replace("Numpad", "");
  if (e.key && e.key.length === 1) return e.key.toUpperCase();
  return e.key || e.code;
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

function normalizeText(text) {
  return String(text || "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z]/g, "");
}

function buildExpectedSentence() {
  const first = normalizeText(firstNameInput.value);
  const last = normalizeText(lastNameInput.value);

  if (!first || !last) return null;

  displaySentence = `Mein Name ist ${first} ${last}`;
  expectedText = `MEINNAMEIST${first}${last}`;
  return expectedText;
}

function resetAppState() {
  recognizedLetters = [];
  currentInputSymbols = "";
  longPauseViolation = false;

  livePattern.textContent = "–";
  liveDecode.textContent = "…";
  recognizedTextEl.textContent = "–";
  charCountEl.textContent = "0";
  statusTextEl.textContent = "Bereit";
  setFeedback("Noch keine Eingabe.", "neutral");

  clearAllTimers();
}

function clearCurrentAttempt() {
  resetAppState();

  if (appMode === "free") {
    statusTextEl.textContent = "Freies Morsen";
  } else {
    statusTextEl.textContent = appMode === "exam" ? "Prüfung läuft" : "Übung läuft";
  }
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
    } catch (err) {}
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

async function playTextAsMorse(text) {
  playBtn.disabled = true;
  clearBtn.disabled = true;
  morseKey.disabled = true;

  const unit = getUnit();

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const pattern = MORSE_MAP[ch];
    if (!pattern) continue;

    await playMorsePattern(pattern);

    if (i < text.length - 1) {
      await sleep(unit * 3);
    }
  }

  await sleep(unit * 2);

  playBtn.disabled = false;
  clearBtn.disabled = false;
  morseKey.disabled = false;
}

function playTarget() {
  if (appMode === "free") {
    const text = recognizedLetters.join("");
    if (!text) {
      setFeedback("Im freien Modus kann nur bereits erkannter Text vorgespielt werden.", "warning");
      return;
    }
    playTextAsMorse(text);
    return;
  }

  playTextAsMorse(expectedText);
}

function handlePressStart() {
  if (isPressing) return;

  ensureAudio();
  clearLetterTimer();
  clearFinishPauseTimer();
  clearLongPauseTimer();

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

  clearLetterTimer();

  finalizeLetterTimer = setTimeout(() => {
    finalizeCurrentLetter();
  }, unit * tolerance.letterPauseFactor);
}

function finalizeCurrentLetter() {
  if (!currentInputSymbols) return;

  const pattern = currentInputSymbols;
  const decoded = patternToLetter(pattern);

  currentInputSymbols = "";
  livePattern.textContent = "–";

  if (!decoded) {
    recognizedLetters.push("?");
  } else {
    recognizedLetters.push(decoded);
  }

  updateRecognizedUI();

  if (appMode === "free") {
    setFeedback(`Erkannt: ${decoded || "?"}`, decoded ? "neutral" : "warning");
  } else if (appMode === "practice") {
    setFeedback("Weiter morsen. Rückmeldung kommt nach 3 Sekunden Pause.", "neutral");
  } else {
    setFeedback("Prüfung läuft. Rückmeldung kommt nach der Morsepause.", "neutral");
  }

  scheduleEndFeedback();
  scheduleLongPauseCheckIfNeeded();
}

function scheduleEndFeedback() {
  clearFinishPauseTimer();

  finishPauseTimer = setTimeout(() => {
    finishAttemptAfterPause();
  }, 3000);
}

function scheduleLongPauseCheckIfNeeded() {
  clearLongPauseTimer();

  if (appMode !== "exam") return;

  const recognized = recognizedLetters.join("");
  if (recognized === expectedText) return;

  longPauseTimer = setTimeout(() => {
    longPauseViolation = true;
  }, 2000);
}

function finishAttemptAfterPause() {
  clearLetterTimer();
  clearLongPauseTimer();

  if (currentInputSymbols) {
    finalizeCurrentLetter();
    return;
  }

  const recognized = recognizedLetters.join("");

  if (appMode === "free") {
    statusTextEl.textContent = "Frei gemorst";
    setFeedback(`Erkannt wurde: ${recognized || "∅"}`, "neutral");
    return;
  }

  if (appMode === "practice") {
    if (recognized === expectedText) {
      statusTextEl.textContent = "Richtig";
      setFeedback(PASS_HINT, "success");
    } else {
      statusTextEl.textContent = "Noch nicht richtig";
      setFeedback(`Erkannt wurde: ${recognized || "∅"}. Erwartet war: ${expectedText}.`, "error");
    }
    return;
  }

  if (appMode === "exam") {
    if (recognized === expectedText && !longPauseViolation) {
      statusTextEl.textContent = "Bestanden";
      setFeedback(PASS_HINT, "success");
    } else {
      statusTextEl.textContent = "Nicht bestanden";
      setFeedback("Nicht verstanden, wiederholen. QSM", "error");
      playTextAsMorse(Q_CODE_REPEAT);
    }
  }
}

function clearLetterTimer() {
  if (finalizeLetterTimer) {
    clearTimeout(finalizeLetterTimer);
    finalizeLetterTimer = null;
  }
}

function clearFinishPauseTimer() {
  if (finishPauseTimer) {
    clearTimeout(finishPauseTimer);
    finishPauseTimer = null;
  }
}

function clearLongPauseTimer() {
  if (longPauseTimer) {
    clearTimeout(longPauseTimer);
    longPauseTimer = null;
  }
}

function clearAllTimers() {
  clearLetterTimer();
  clearFinishPauseTimer();
  clearLongPauseTimer();
}

function startApp() {
  updateModeFromRadios();

  if (appMode !== "free") {
    const expected = buildExpectedSentence();

    if (!expected) {
      alert("Bitte Vorname und Nachname eingeben.");
      return;
    }
  } else {
    expectedText = "";
    displaySentence = "";
  }

  resetAppState();

  if (appMode === "free") {
    screenTitle.textContent = "Freies Morsen";
    screenInfo.textContent = "Morse frei. Die App schreibt mit, was sie versteht.";
    targetText.textContent = "FREIES MORSEN";
    hintText.textContent = "Nach 3 Sekunden Pause wird die Eingabe abgeschlossen.";
    statusTextEl.textContent = "Freies Morsen";
  }

  if (appMode === "practice") {
    screenTitle.textContent = "Üben für die Prüfung";
    screenInfo.textContent = "Morse den ganzen Satz. Rückmeldung kommt erst nach 3 Sekunden Pause.";
    targetText.textContent = displaySentence;
    hintText.textContent = "Der Satz muss ohne Pause länger als 2 Sekunden gemorst werden.";
    statusTextEl.textContent = "Übung läuft";
  }

  if (appMode === "exam") {
    screenTitle.textContent = "Prüfung";
    screenInfo.textContent = "Morse den ganzen Satz. In der Prüfung gibt es erst am Schluss Rückmeldung.";
    targetText.textContent = displaySentence;
    hintText.textContent = "Keine Pause länger als 2 Sekunden. Schluss nach 3 Sekunden Morsepause.";
    statusTextEl.textContent = "Prüfung läuft";
  }

  setupScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");

  ensureAudio();
}

function goBack() {
  stopTone();
  clearAllTimers();

  isPressing = false;
  waitingForKeyChoice = false;
  updateMorseKeyLabels();

  setupScreen.classList.remove("hidden");
  appScreen.classList.add("hidden");
}

init();
