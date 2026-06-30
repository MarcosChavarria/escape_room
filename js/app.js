const STORY_PATH = "data/story.json";

const state = {
  lang: "en",
  story: null,
  participants: [],
  scores: [],
  activeScenes: [],
  sceneIndex: 0,
  turnPlan: [],
  turnPointer: 0,
  turnMode: "ordered",
  hintIndex: 0,
  searchUnlocked: false,
  setupIntroIndex: 0,
  sceneBridgeIndex: 0,
  sceneBridgeUnlocked: false,
  transitionLock: false,
  audioCtx: null,
};

const els = {
  title: document.getElementById("game-title"),
  subtitle: document.getElementById("game-subtitle"),
  langToggle: document.getElementById("lang-toggle"),
  footerNote: document.getElementById("footer-note"),

  setupScreen: document.getElementById("setup-screen"),
  setupTitle: document.getElementById("setup-title"),
  setupDescription: document.getElementById("setup-description"),
  setupIntroTitle: document.getElementById("setup-intro-title"),
  setupIntroText: document.getElementById("setup-intro-text"),
  setupIntroNext: document.getElementById("setup-intro-next"),
  participantsGrid: document.getElementById("participants-grid"),
  participantCountLabel: document.getElementById("participant-count-label"),
  participantCountInput: document.getElementById("participant-count"),
  turnModeLabel: document.getElementById("turn-mode-label"),
  turnModeSelect: document.getElementById("turn-mode"),
  turnModeOrdered: document.getElementById("turn-mode-ordered"),
  turnModeRandom: document.getElementById("turn-mode-random"),
  setupError: document.getElementById("setup-error"),
  startGame: document.getElementById("start-game"),

  gameScreen: document.getElementById("game-screen"),
  roundLabel: document.getElementById("round-label"),
  roundValue: document.getElementById("round-value"),
  turnLabel: document.getElementById("turn-label"),
  turnValue: document.getElementById("turn-value"),
  scoreboardLabel: document.getElementById("scoreboard-label"),
  scoreboardList: document.getElementById("scoreboard-list"),

  sceneTitle: document.getElementById("scene-title"),
  sceneDescription: document.getElementById("scene-description"),
  sceneBridgeLabel: document.getElementById("scene-bridge-label"),
  sceneBridgeText: document.getElementById("scene-bridge-text"),
  sceneBridgeNext: document.getElementById("scene-bridge-next"),
  objectiveLabel: document.getElementById("objective-label"),
  objectiveText: document.getElementById("objective-text"),
  puzzleLabel: document.getElementById("puzzle-label"),
  puzzleQuestion: document.getElementById("puzzle-question"),
  searchButton: document.getElementById("search-button"),
  hintButton: document.getElementById("hint-button"),
  searchText: document.getElementById("search-text"),
  hintText: document.getElementById("hint-text"),
  optionsField: document.getElementById("options-field"),
  submitAnswer: document.getElementById("submit-answer"),
  feedbackText: document.getElementById("feedback-text"),
  turnBanner: document.getElementById("turn-banner"),
  turnBannerText: document.getElementById("turn-banner-text"),
};

function t(node) {
  return node?.[state.lang] ?? "";
}

function clearFeedback() {
  els.feedbackText.textContent = "";
  els.feedbackText.classList.remove("ok", "error");
}

function getAudioCtx() {
  if (!window.AudioContext && !window.webkitAudioContext) {
    return null;
  }
  if (!state.audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    state.audioCtx = new Ctx();
  }
  if (state.audioCtx.state === "suspended") {
    state.audioCtx.resume().catch(() => {});
  }
  return state.audioCtx;
}

function playTone(frequency, durationMs, type = "sine", volume = 0.04, delayMs = 0) {
  const ctx = getAudioCtx();
  if (!ctx) {
    return;
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const startAt = ctx.currentTime + delayMs / 1000;
  const endAt = startAt + durationMs / 1000;

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(endAt + 0.01);
}

function playSfx(kind) {
  if (kind === "correct") {
    playTone(620, 90, "triangle", 0.045, 0);
    playTone(780, 120, "triangle", 0.05, 95);
    return;
  }
  if (kind === "wrong") {
    playTone(260, 130, "sawtooth", 0.035, 0);
    playTone(200, 160, "sawtooth", 0.03, 110);
    return;
  }
  if (kind === "hint") {
    playTone(520, 90, "sine", 0.03, 0);
    return;
  }
  if (kind === "search") {
    playTone(420, 80, "square", 0.025, 0);
    playTone(520, 80, "square", 0.025, 85);
    return;
  }
  if (kind === "turn") {
    playTone(700, 80, "triangle", 0.03, 0);
    playTone(580, 80, "triangle", 0.026, 95);
    return;
  }
  if (kind === "scene") {
    playTone(500, 90, "sine", 0.025, 0);
    playTone(620, 120, "sine", 0.028, 90);
  }
}

function formatTemplate(template, replacements) {
  let text = template;
  Object.entries(replacements).forEach(([key, value]) => {
    text = text.replaceAll(`{${key}}`, value);
  });
  return text;
}

function showTurnBanner(kind) {
  if (!els.turnBanner || !els.turnBannerText) {
    return;
  }

  const ui = state.story.ui;
  const responder = currentResponder();
  const template = kind === "scene" ? t(ui.turnBannerScene) : t(ui.turnBannerWrong);
  els.turnBannerText.textContent = formatTemplate(template, { name: responder });
  els.turnBanner.classList.add("is-visible");
  playSfx("turn");

  window.clearTimeout(showTurnBanner.timeoutId);
  showTurnBanner.timeoutId = window.setTimeout(() => {
    els.turnBanner.classList.remove("is-visible");
  }, 1450);
}

function currentScene() {
  return state.activeScenes[state.sceneIndex];
}

function currentResponder() {
  if (state.participants.length === 0 || state.turnPlan.length === 0) {
    return "-";
  }
  const participantIndex = state.turnPlan[state.turnPointer];
  return state.participants[participantIndex] ?? "-";
}

function turnParticipantIndex() {
  if (state.participants.length === 0 || state.turnPlan.length === 0) {
    return 0;
  }
  return state.turnPlan[state.turnPointer];
}

function renderParticipantInputs() {
  const ui = state.story.ui;
  const requested = Number.parseInt(els.participantCountInput.value, 10);
  const teamSize = Number.isNaN(requested) ? 2 : Math.max(2, Math.min(8, requested));
  els.participantCountInput.value = String(teamSize);
  const existingValues = Array.from(document.querySelectorAll(".participant-name")).map((input) => input.value.trim());

  els.participantsGrid.innerHTML = "";

  for (let i = 0; i < teamSize; i += 1) {
    const wrapper = document.createElement("label");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "player-input participant-name";
    input.maxLength = 24;
    input.placeholder = `${t(ui.playerPlaceholder)} ${i + 1}`;
    input.setAttribute("data-player-index", String(i));
    input.value = existingValues[i] ?? "";

    wrapper.appendChild(input);
    els.participantsGrid.appendChild(wrapper);
  }
}

function renderScoreboard() {
  const scoreText = t(state.story.ui.scoreLine);
  els.scoreboardList.innerHTML = "";

  state.participants.forEach((name, index) => {
    const item = document.createElement("li");
    item.textContent = `${name}: ${state.scores[index]} ${scoreText}`;
    if (index === turnParticipantIndex()) {
      item.style.fontWeight = "700";
    }
    els.scoreboardList.appendChild(item);
  });
}

function setPuzzleControlsEnabled(enabled) {
  const controls = [els.searchButton, els.hintButton, els.submitAnswer];
  controls.forEach((control) => {
    if (control) {
      control.disabled = !enabled;
    }
  });

  const options = document.querySelectorAll('input[name="answer-option"]');
  options.forEach((option) => {
    option.disabled = !enabled;
  });
}

function renderSetupIntro() {
  const ui = state.story.ui;
  const lines = ui.setupIntroLines ?? [];

  if (lines.length === 0) {
    els.setupIntroText.textContent = "";
    els.setupIntroNext.style.display = "none";
    return;
  }

  const index = Math.min(state.setupIntroIndex, lines.length - 1);
  els.setupIntroText.textContent = t(lines[index]);
  els.setupIntroNext.style.display = "inline-block";
  els.setupIntroNext.textContent = index < lines.length - 1 ? t(ui.setupIntroNext) : t(ui.setupIntroRestart);
}

function renderSceneBridge(scene) {
  const ui = state.story.ui;
  const lines = scene.bridgeLines ?? [];
  els.sceneBridgeLabel.textContent = t(ui.sceneBridgeLabel);

  if (lines.length === 0) {
    state.sceneBridgeUnlocked = true;
    els.sceneBridgeText.textContent = "";
    els.sceneBridgeNext.style.display = "none";
    return;
  }

  const index = Math.min(state.sceneBridgeIndex, lines.length - 1);
  els.sceneBridgeText.textContent = t(lines[index]);
  if (state.sceneBridgeUnlocked) {
    els.sceneBridgeNext.style.display = "none";
    return;
  }
  els.sceneBridgeNext.style.display = "inline-block";
  els.sceneBridgeNext.textContent = index < lines.length - 1 ? t(ui.sceneBridgeNext) : t(ui.sceneBridgeUnlock);
}

function renderOptions(scene) {
  els.optionsField.innerHTML = "";

  scene.options.forEach((option, index) => {
    const row = document.createElement("label");
    row.className = "option-row";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "answer-option";
    radio.value = option.id;
    radio.id = `option-${index}`;

    const text = document.createElement("span");
    text.textContent = t(option);

    row.appendChild(radio);
    row.appendChild(text);
    els.optionsField.appendChild(row);
  });
}

function renderCompleted() {
  const ui = state.story.ui;
  els.sceneTitle.textContent = t(ui.completed);
  els.sceneDescription.textContent = t(ui.completedDescription);
  els.sceneBridgeLabel.textContent = t(ui.epilogueLabel);
  els.sceneBridgeText.textContent = t(ui.epilogueText);
  els.objectiveText.textContent = t(ui.completedDescription);
  els.puzzleQuestion.textContent = "";
  els.searchButton.style.display = "none";
  els.hintButton.style.display = "none";
  els.optionsField.style.display = "none";
  els.submitAnswer.style.display = "none";
  els.searchText.textContent = "";
  els.hintText.textContent = "";
  els.sceneBridgeNext.style.display = "none";
  clearFeedback();

  els.roundValue.textContent = `${state.activeScenes.length} / ${state.activeScenes.length}`;
  els.turnValue.textContent = "-";
  els.gameScreen.classList.remove("bridge-focus");

  els.gameScreen.style.backgroundImage = `url("images/img_scene_9_victory.png")`;
  playSfx("scene");
}

function renderGame() {
  const story = state.story;
  const ui = story.ui;
  const scene = currentScene();

  els.title.textContent = t(story.meta.title);
  els.subtitle.textContent = t(story.meta.subtitle);
  els.footerNote.textContent = t(story.meta.footer);
  els.langToggle.textContent = t(ui.langToggle);

  els.roundLabel.textContent = t(ui.roundLabel);
  els.turnLabel.textContent = t(ui.turnLabel);
  els.scoreboardLabel.textContent = t(ui.scoreboardLabel);
  els.objectiveLabel.textContent = t(ui.objectiveLabel);
  els.puzzleLabel.textContent = t(ui.puzzleLabel);
  els.searchButton.textContent = t(ui.search);
  els.hintButton.textContent = state.hintIndex > 0 ? t(ui.nextHint) : t(ui.hint);
  els.submitAnswer.textContent = t(ui.submit);

  renderScoreboard();

  if (!scene) {
    renderCompleted();
    return;
  }

  els.optionsField.style.display = "grid";
  els.submitAnswer.style.display = "inline-block";

  els.roundValue.textContent = `${state.sceneIndex + 1} / ${state.activeScenes.length}`;
  els.turnValue.textContent = currentResponder();

  els.sceneTitle.textContent = t(scene.title);
  els.sceneDescription.textContent = t(scene.description);
  renderSceneBridge(scene);
  els.objectiveText.textContent = t(scene.objective);
  els.puzzleQuestion.textContent = t(scene.question);

  els.gameScreen.style.backgroundImage = `url("${scene.image}")`;

  renderOptions(scene);

  const needsSearch = Boolean(scene.requiresSearch);
  els.searchButton.style.display = needsSearch ? "inline-block" : "none";
  els.searchButton.disabled = state.searchUnlocked;
  els.searchText.textContent = state.searchUnlocked && scene.searchClue ? t(scene.searchClue) : "";

  els.hintText.textContent = "";

  if (!state.sceneBridgeUnlocked) {
    els.gameScreen.classList.add("bridge-focus");
    setPuzzleControlsEnabled(false);
    clearFeedback();
    els.feedbackText.textContent = t(ui.readBridgeFirst);
  } else {
    els.gameScreen.classList.remove("bridge-focus");
    setPuzzleControlsEnabled(true);
  }
}

function advanceTurn() {
  if (state.participants.length === 0 || state.turnPlan.length === 0) {
    return;
  }
  state.turnPointer = (state.turnPointer + 1) % state.turnPlan.length;
}

function nextScene() {
  state.sceneIndex += 1;
  state.hintIndex = 0;
  state.searchUnlocked = false;
  state.sceneBridgeIndex = 0;
  state.sceneBridgeUnlocked = false;
  els.searchText.textContent = "";
  els.hintText.textContent = "";
  clearFeedback();
}

function showHint() {
  if (state.transitionLock) {
    return;
  }
  const scene = currentScene();
  if (!scene || !scene.hints?.length) {
    return;
  }

  const idx = Math.min(state.hintIndex, scene.hints.length - 1);
  els.hintText.textContent = t(scene.hints[idx]);
  if (state.hintIndex < scene.hints.length - 1) {
    state.hintIndex += 1;
  }

  els.hintButton.textContent = t(state.story.ui.nextHint);
  playSfx("hint");
}

function searchClue() {
  if (state.transitionLock) {
    return;
  }
  const scene = currentScene();
  if (!scene || !scene.requiresSearch || state.searchUnlocked) {
    return;
  }

  state.searchUnlocked = true;
  els.searchText.textContent = t(scene.searchClue);
  els.searchButton.disabled = true;
  playSfx("search");
}

function selectedOptionId() {
  const selected = document.querySelector('input[name="answer-option"]:checked');
  return selected?.value ?? "";
}

function handleAnswer() {
  if (state.transitionLock) {
    return;
  }
  const scene = currentScene();
  if (!scene) {
    return;
  }

  if (!state.sceneBridgeUnlocked) {
    clearFeedback();
    els.feedbackText.textContent = t(state.story.ui.readBridgeFirst);
    return;
  }

  clearFeedback();

  if (scene.requiresSearch && !state.searchUnlocked) {
    els.feedbackText.textContent = t(state.story.ui.searchFirst);
    els.feedbackText.classList.add("error");
    return;
  }

  const picked = selectedOptionId();
  if (!picked) {
    els.feedbackText.textContent = t(state.story.ui.chooseOption);
    els.feedbackText.classList.add("error");
    return;
  }

  if (picked === scene.correctOptionId) {
    state.transitionLock = true;
    setPuzzleControlsEnabled(false);
    els.feedbackText.textContent = t(state.story.ui.correct);
    els.feedbackText.classList.add("ok");
    state.scores[turnParticipantIndex()] += 1;
    playSfx("correct");

    setTimeout(() => {
      advanceTurn();
      nextScene();
      renderGame();
      showTurnBanner("scene");
      playSfx("scene");
      state.transitionLock = false;
    }, 900);
    return;
  }

  state.transitionLock = true;
  setPuzzleControlsEnabled(false);
  els.feedbackText.textContent = t(state.story.ui.incorrect);
  els.feedbackText.classList.add("error");
  playSfx("wrong");

  setTimeout(() => {
    advanceTurn();
    clearFeedback();
    renderGame();
    showTurnBanner("wrong");
    state.transitionLock = false;
  }, 800);
}

function setupGame() {
  renderParticipantInputs();
  const inputs = Array.from(document.querySelectorAll(".participant-name"));
  const names = inputs.map((input) => input.value.trim());

  if (names.some((name) => !name)) {
    els.setupError.textContent = t(state.story.ui.setupError);
    return;
  }

  state.participants = names;
  state.scores = names.map(() => 0);
  state.turnMode = els.turnModeSelect.value === "random" ? "random" : "ordered";
  state.activeScenes = buildScenePlan(state.story.scenes, names.length * 2);
  state.turnPlan = buildTurnPlan(names.length, state.activeScenes.length, state.turnMode);
  state.sceneIndex = 0;
  state.turnPointer = 0;
  state.hintIndex = 0;
  state.searchUnlocked = false;
  state.sceneBridgeIndex = 0;
  state.sceneBridgeUnlocked = false;

  els.setupError.textContent = "";
  els.setupScreen.classList.add("hidden");
  els.gameScreen.classList.remove("hidden");
  document.body.classList.add("game-active");
  renderGame();
}

function renderSetup() {
  const story = state.story;
  const ui = story.ui;

  els.title.textContent = t(story.meta.title);
  els.subtitle.textContent = t(story.meta.subtitle);
  els.footerNote.textContent = t(story.meta.footer);
  els.langToggle.textContent = t(ui.langToggle);

  els.setupTitle.textContent = t(ui.setupTitle);
  els.setupDescription.textContent = t(ui.setupDescription);
  els.setupIntroTitle.textContent = t(ui.setupIntroTitle);
  renderSetupIntro();
  els.participantCountLabel.textContent = t(ui.participantCountLabel);
  els.turnModeLabel.textContent = t(ui.turnModeLabel);
  els.turnModeOrdered.textContent = t(ui.turnModeOrdered);
  els.turnModeRandom.textContent = t(ui.turnModeRandom);
  els.startGame.textContent = t(ui.startGame);

  renderParticipantInputs();
}

function shuffled(numbers) {
  const list = [...numbers];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = list[i];
    list[i] = list[j];
    list[j] = temp;
  }
  return list;
}

function cloneScene(scene, suffix, ui) {
  return {
    ...scene,
    id: `${scene.id}-${suffix}`,
    title: {
      en: `${scene.title.en} (${ui.bonusTag.en} ${suffix})`,
      es: `${scene.title.es} (${ui.bonusTag.es} ${suffix})`,
    },
  };
}

function buildScenePlan(baseScenes, minimumRounds) {
  const plan = baseScenes.map((scene) => ({ ...scene }));
  if (plan.length >= minimumRounds) {
    return plan;
  }

  let extraIndex = 1;
  while (plan.length < minimumRounds) {
    const source = baseScenes[(extraIndex - 1) % baseScenes.length];
    plan.push(cloneScene(source, extraIndex, state.story.ui));
    extraIndex += 1;
  }

  return plan;
}

function buildTurnPlan(participantCount, rounds, mode) {
  const minTurnsPerParticipant = 2;
  const minimumSlots = participantCount * minTurnsPerParticipant;
  const totalSlots = Math.max(rounds, minimumSlots);
  const base = [];

  for (let i = 0; i < participantCount; i += 1) {
    for (let j = 0; j < minTurnsPerParticipant; j += 1) {
      base.push(i);
    }
  }

  let plan = mode === "random" ? shuffled(base) : [...base];

  while (plan.length < totalSlots) {
    if (mode === "random") {
      const segment = shuffled(Array.from({ length: participantCount }, (_, index) => index));
      plan = [...plan, ...segment];
    } else {
      for (let i = 0; i < participantCount; i += 1) {
        plan.push(i);
      }
    }
  }

  return plan.slice(0, totalSlots);
}

function bindEvents() {
  els.langToggle.addEventListener("click", () => {
    state.lang = state.lang === "en" ? "es" : "en";

    if (els.gameScreen.classList.contains("hidden")) {
      renderSetup();
      return;
    }

    renderGame();
  });

  els.startGame.addEventListener("click", setupGame);
  els.setupIntroNext.addEventListener("click", () => {
    const lines = state.story.ui.setupIntroLines ?? [];
    if (lines.length === 0) {
      return;
    }
    if (state.setupIntroIndex < lines.length - 1) {
      state.setupIntroIndex += 1;
    } else {
      state.setupIntroIndex = 0;
    }
    renderSetupIntro();
  });
  els.sceneBridgeNext.addEventListener("click", () => {
    const scene = currentScene();
    if (!scene) {
      return;
    }
    const lines = scene.bridgeLines ?? [];
    if (lines.length === 0) {
      state.sceneBridgeUnlocked = true;
      renderGame();
      return;
    }
    if (state.sceneBridgeIndex < lines.length - 1) {
      state.sceneBridgeIndex += 1;
    } else {
      state.sceneBridgeUnlocked = true;
    }
    renderGame();
  });
  els.participantCountInput.addEventListener("change", renderParticipantInputs);
  els.submitAnswer.addEventListener("click", handleAnswer);
  els.hintButton.addEventListener("click", showHint);
  els.searchButton.addEventListener("click", searchClue);
}

async function init() {
  const response = await fetch(STORY_PATH);
  state.story = await response.json();
  bindEvents();
  renderSetup();
}

init().catch((error) => {
  console.error("Failed to initialize the game", error);
  els.setupTitle.textContent = "Error loading game";
});


