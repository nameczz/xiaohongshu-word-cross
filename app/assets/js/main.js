(() => {
  const STORAGE_KEY = "wordCrossStateV1";
  const DIFFICULTIES = [
    { id: "easy", label: "简单", ratio: 0.5, icon: "Easy" },
    { id: "normal", label: "普通", ratio: 0.35, icon: "Normal" },
    { id: "hard", label: "困难", ratio: 0.2, icon: "Hard" },
  ];

  const APP_SOUND = {
    enabled: true,
    context: null,
  };

  const views = {
    home: document.getElementById("view-home"),
    tutorial: document.getElementById("view-tutorial"),
    game: document.getElementById("view-game"),
    result: document.getElementById("view-result"),
  };
  const homeRefs = {
    themeList: document.getElementById("theme-list"),
    difficultySwitch: document.getElementById("difficulty-switch"),
    difficultyTrigger: document.getElementById("difficulty-trigger"),
    difficultyLabel: document.getElementById("difficulty-label"),
    randomButton: document.getElementById("random-challenge"),
    randomSubtitle: document.getElementById("random-subtitle"),
    resetButton: document.getElementById("reset-progress"),
    continueButton: document.getElementById("continue-game"),
    continueTitle: document.getElementById("continue-title"),
    continueProgress: document.getElementById("continue-progress"),
    settingsButton: document.getElementById("open-settings"),
  };
  const settingsRefs = {
    overlay: document.getElementById("settings-overlay"),
    closeButton: document.getElementById("close-settings"),
    soundButton: document.getElementById("sound-toggle"),
    soundState: document.getElementById("sound-state"),
  };
  const gameRefs = {
    backHome: document.getElementById("back-home"),
    gameTitle: document.getElementById("game-title"),
    timer: document.getElementById("game-timer"),
    boardWrap: document.getElementById("board-wrap"),
    activeDirection: document.getElementById("active-direction"),
    wordStatus: document.getElementById("word-status"),
    activeClue: document.getElementById("active-clue"),
    hintMessage: document.getElementById("hint-message"),
    checkButton: document.getElementById("check-answer"),
    hintMeaning: document.getElementById("hint-meaning"),
    hintFirstLetter: document.getElementById("hint-first-letter"),
    hintFillCell: document.getElementById("hint-fill-cell"),
    nativeInput: document.getElementById("letter-input"),
  };
  const resultRefs = {
    summary: document.getElementById("result-summary"),
    canvas: document.getElementById("result-card"),
    saveButton: document.getElementById("save-result"),
    shareButton: document.getElementById("share-result"),
    backButton: document.getElementById("back-home-result"),
    bridgeTip: document.getElementById("bridge-tip"),
  };
  const tutorialRefs = {
    steps: document.getElementById("tutorial-steps"),
    board: document.getElementById("tutorial-board"),
    direction: document.getElementById("tutorial-direction"),
    clue: document.getElementById("tutorial-clue"),
    hint: document.getElementById("tutorial-hint"),
    keys: document.getElementById("tutorial-keys"),
    progress: document.getElementById("tutorial-progress"),
    next: document.getElementById("tutorial-next"),
    skip: document.getElementById("tutorial-skip"),
  };
  const toast = document.getElementById("toast");
  const confettiLayer = document.getElementById("confetti-layer");

  const state = {
    storage: {
      currentGame: null,
      finished: [],
      stats: {},
      tutorialSeen: false,
      themeStats: {},
    },
    view: "home",
    homeDifficulty: "normal",
    game: null,
    timerId: null,
    confettiEnabled: true,
  };

  function safeParse(raw, fallback) {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  }

  function readStorage() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = safeParse(raw, {});
    state.storage.currentGame = parsed.currentGame || null;
    state.storage.finished = parsed.finished || [];
    state.storage.stats = parsed.stats || {};
    state.storage.tutorialSeen = !!parsed.tutorialSeen;
    state.storage.themeStats = parsed.themeStats || {};
    state.homeDifficulty = DIFFICULTIES.some((item) => item.id === parsed.settings?.difficulty)
      ? parsed.settings.difficulty
      : "normal";
    APP_SOUND.enabled = parsed.settings?.soundEnabled !== false;
  }

  function writeStorage() {
    const payload = {
      currentGame: state.storage.currentGame,
      finished: state.storage.finished,
      stats: state.storage.stats,
      tutorialSeen: state.storage.tutorialSeen,
      themeStats: state.storage.themeStats,
      settings: {
        difficulty: state.homeDifficulty,
        soundEnabled: APP_SOUND.enabled,
      },
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      showToast("本地进度暂时无法保存");
    }
  }

  function formatNumber(value, digits = 2) {
    return String(value).padStart(digits, "0");
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const mm = Math.floor(total / 60);
    const ss = total % 60;
    return `${formatNumber(mm)}:${formatNumber(ss)}`;
  }

  function cloneDeep(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function toUpper(str) {
    return String(str || "").toUpperCase();
  }

  function playTone(type) {
    if (!APP_SOUND.enabled || !APP_SOUND.context) return;
    const context = APP_SOUND.context;
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.connect(gain);
    gain.connect(context.destination);

    const freq = type === "ok" ? 660 : 220;
    const duration = type === "ok" ? 0.15 : 0.28;
    osc.type = type === "ok" ? "triangle" : "sine";
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.frequency.setValueAtTime(freq, now);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  function ensureAudio() {
    if (!APP_SOUND.context) {
      const AudioConstructor = window.AudioContext || window.webkitAudioContext;
      if (!AudioConstructor) return false;
      APP_SOUND.context = new AudioConstructor();
    }
    if (APP_SOUND.context.state === "suspended") {
      APP_SOUND.context.resume().catch(() => {});
    }
    return true;
  }

  function showToast(text, timeout = 1900) {
    if (!text) return;
    toast.hidden = false;
    toast.textContent = text;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.hidden = true;
    }, timeout);
  }

  function hasBridgeMethod(name) {
    const mini = window.xhs && window.xhs.miniTool;
    return !!mini && typeof mini[name] === "function";
  }

  function updateGameTimer() {
    if (!state.game || state.game.solved) return;
    const elapsed = getElapsedMs();
    gameRefs.timer.textContent = formatTime(elapsed);
  }

  function getElapsedMs() {
    if (!state.game) return 0;
    const now = Date.now();
    const extra = state.game.baseElapsedMs + (now - state.game.lastTickMs);
    return extra;
  }

  function getDifficultyById(id) {
    return DIFFICULTIES.find((item) => item.id === id) || DIFFICULTIES[1];
  }

  function rngFromSeed(seed) {
    let x = seed >>> 0;
    return () => {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      return (x >>> 0) / 4294967296;
    };
  }

  function getThemeById(id) {
    return state.wordBank.find((theme) => theme.id === id);
  }

  function getBoardWordIdsAt(r, c) {
    const baseCell = state.game?.puzzle.board[r]?.[c];
    if (!baseCell || baseCell.blocked) return {};
    return baseCell.words || {};
  }

  function getWordByDirection(r, c, dir) {
    if (!state.game) return null;
    const wordId = getBoardWordIdsAt(r, c)[dir];
    if (wordId === undefined || wordId === null) return null;
    return state.game.puzzle.placements[wordId] || null;
  }

  function switchView(name) {
    Object.keys(views).forEach((key) => {
      views[key].classList.toggle("active", key === name);
    });
    state.view = name;
  }

  function renderDifficultySwitch() {
    const selected = getDifficultyById(state.homeDifficulty);
    homeRefs.difficultyLabel.textContent = selected.label;
    homeRefs.difficultySwitch.replaceChildren();
    DIFFICULTIES.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "difficulty-option";
      btn.innerHTML = `<span>${item.label}</span><small>${item.id === "easy" ? "留白更少" : item.id === "hard" ? "留白更多" : "均衡提示"}</small>`;
      btn.setAttribute("aria-pressed", String(item.id === state.homeDifficulty));
      if (item.id === state.homeDifficulty) {
        btn.classList.add("active");
        btn.insertAdjacentHTML("beforeend", '<b aria-hidden="true">✓</b>');
      }
      btn.addEventListener("click", () => {
        state.homeDifficulty = item.id;
        writeStorage();
        closeDifficultyMenu();
        renderDifficultySwitch();
        renderThemeCards();
        renderRandomCard();
      });
      homeRefs.difficultySwitch.appendChild(btn);
    });
  }

  function closeDifficultyMenu() {
    homeRefs.difficultySwitch.hidden = true;
    homeRefs.difficultyTrigger.setAttribute("aria-expanded", "false");
  }

  function renderRandomCard() {
    const difficulty = getDifficultyById(state.homeDifficulty);
    homeRefs.randomSubtitle.textContent = `${difficulty.label}难度 · 从 ${state.wordBank.length} 个主题里抽一局`;
  }

  function formatStars(stars) {
    const n = clamp(0, 3, Math.round(stars));
    return "★".repeat(n) + "☆".repeat(3 - n);
  }

  function clamp(min, max, value) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }

  function getThemeBest(themeId) {
    const records = state.storage.themeStats?.[themeId] || {};
    const all = Object.keys(records).map((k) => records[k] || {});
    const bestStar = all.reduce((acc, item) => Math.max(acc, item.bestStars || 0), 0);
    const bestTime = all.reduce((acc, item) => {
      if (!item.bestTimeMs) return acc;
      if (!acc) return item.bestTimeMs;
      return Math.min(acc, item.bestTimeMs);
    }, 0);
    return { bestStar, bestTime };
  }

  function renderThemeCards() {
    homeRefs.themeList.replaceChildren();
    state.wordBank.forEach((theme, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `theme-item theme-tone-${(index % 5) + 1}`;
      item.setAttribute("aria-label", `开始${theme.name}主题`);

      const artWrap = document.createElement("span");
      artWrap.className = "theme-art-wrap";
      const art = document.createElement("img");
      art.className = "theme-art";
      art.src = `./app/assets/images/themes/${theme.id}.png`;
      art.alt = "";
      art.width = 256;
      art.height = 256;
      artWrap.appendChild(art);

      const copy = document.createElement("span");
      copy.className = "theme-copy";
      const title = document.createElement("strong");
      title.textContent = theme.name;
      const meta = document.createElement("span");
      meta.className = "theme-stats";
      const difficulty = getDifficultyById(state.homeDifficulty);
      const stats = state.storage.themeStats?.[theme.id]?.[difficulty.id];
      meta.textContent = stats
        ? `${formatStars(stats.bestStars || 0)} · ${stats.bestTimeMs ? formatTime(stats.bestTimeMs) : "已通关"}`
        : `${difficulty.label} · 未挑战`;
      copy.appendChild(title);
      copy.appendChild(meta);

      const arrow = document.createElement("span");
      arrow.className = "theme-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "↗";

      const tiles = document.createElement("span");
      tiles.className = "theme-letter-tiles";
      tiles.setAttribute("aria-hidden", "true");
      theme.id.slice(0, 2).toUpperCase().split("").forEach((letter) => {
        const tile = document.createElement("i");
        tile.textContent = letter;
        tiles.appendChild(tile);
      });

      item.appendChild(artWrap);
      item.appendChild(copy);
      item.appendChild(arrow);
      item.appendChild(tiles);
      item.addEventListener("click", () => startNewGame(theme.id));
      homeRefs.themeList.appendChild(item);
    });
  }

  function getContinueProgress(current) {
    if (!current?.puzzle?.board || !current?.board) return { filled: 0, total: 0 };
    let filled = 0;
    let total = 0;
    current.puzzle.board.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (cell.blocked) return;
        total += 1;
        if (/^[A-Z]$/.test(current.board[r]?.[c]?.value || "")) filled += 1;
      });
    });
    return { filled, total };
  }

  function renderContinueCard() {
    const current = state.storage.currentGame;
    homeRefs.continueButton.hidden = !current;
    if (!current) return;
    const theme = getThemeById(current.themeId);
    const difficulty = getDifficultyById(current.difficulty);
    const progress = getContinueProgress(current);
    homeRefs.continueTitle.textContent = `${theme?.name || "未完成棋盘"} · ${difficulty.label}`;
    homeRefs.continueProgress.textContent = `已填 ${progress.filled} / ${progress.total} 格`;
  }

  function renderSoundSetting() {
    settingsRefs.soundButton.setAttribute("aria-pressed", String(APP_SOUND.enabled));
    settingsRefs.soundState.classList.toggle("active", APP_SOUND.enabled);
  }

  function renderHome() {
    renderDifficultySwitch();
    renderThemeCards();
    renderRandomCard();
    renderContinueCard();
    renderSoundSetting();
    closeDifficultyMenu();
    switchView("home");
  }

  function randomTheme() {
    const index = Math.floor(Math.random() * state.wordBank.length);
    return state.wordBank[index];
  }

  function updateHomeFromStorage() {
    state.storage.currentGame = state.storage.currentGame || null;
    renderHome();
  }

  function startNewGame(themeId, continueData) {
    const theme = getThemeById(themeId);
    if (!theme) {
      showToast("主题不存在");
      return;
    }
    const difficulty = getDifficultyById(state.homeDifficulty);
    const seed = Math.floor(Date.now() % 2147483647);
    const rng = rngFromSeed(seed);
    const puzzle = WordCross.generatePuzzle(theme.words, {
      difficulty: difficulty.id,
      minWords: 6,
      maxWords: 8,
      rng,
    });

    if (!puzzle) {
      showToast("当前词库无法生成可解题面板，已自动重试。");
      // hard fail fallback attempt one more time in a deterministic way
      const fallback = WordCross.generatePuzzle(theme.words, {
        difficulty: difficulty.id,
        minWords: 6,
        maxWords: 7,
        rng,
      });
      if (!fallback) {
        showToast("暂时无法生成棋盘，请切换主题再试。");
        return;
      }
      initGameState(themeId, difficulty.id, fallback, continueData);
      return;
    }

    initGameState(themeId, difficulty.id, puzzle, continueData);
  }

  function initGameState(themeId, difficultyId, puzzle, continueData) {
    const board = puzzle.board.map((row) =>
      row.map((cell) => {
        if (cell.blocked) {
          return {
            value: "",
            fixed: false,
            locked: false,
            wrong: false,
          };
        }
        return {
          value: cell.revealed ? cell.char : "",
          fixed: cell.revealed,
          locked: cell.revealed,
          wrong: false,
        };
      }),
    );

    state.game = {
      themeId,
      difficulty: difficultyId,
      puzzle,
      board,
      selected: null,
      hintStages: {},
      hintsUsed: continueData ? continueData.hintsUsed : 0,
      mistakes: continueData ? continueData.mistakes : 0,
      solved: false,
      star: 0,
      baseElapsedMs: continueData ? continueData.baseElapsedMs : 0,
      lastTickMs: Date.now(),
      solvedResult: null,
      selectedWordId: null,
    };
    findFirstSelectableCell();
    if (continueData) {
      state.storage.currentGame = continueData;
    } else {
      persistCurrentGame();
    }

    const theme = getThemeById(themeId);
    gameRefs.gameTitle.textContent = `${theme.name} · ${getDifficultyById(difficultyId).label}`;
    renderBoard();
    renderClueCard();
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = setInterval(() => {
      if (state.view === "game" && !state.game.solved) {
        updateGameTimer();
      }
    }, 500);
    switchView("game");
  }

  function persistCurrentGame() {
    if (!state.game) {
      state.storage.currentGame = null;
      writeStorage();
      return;
    }
    const payload = {
      themeId: state.game.themeId,
      difficulty: state.game.difficulty,
      puzzle: state.game.puzzle,
      board: state.game.board,
      hintStages: state.game.hintStages,
      hintsUsed: state.game.hintsUsed,
      mistakes: state.game.mistakes,
      baseElapsedMs: getElapsedMs(),
      lastSaved: Date.now(),
      selected: state.game.selected,
    };
    state.storage.currentGame = payload;
    writeStorage();
  }

  function clearCurrentGame() {
    state.storage.currentGame = null;
    writeStorage();
  }

  function findFirstSelectableCell() {
    if (!state.game) return;
    for (let r = 0; r < state.game.puzzle.size; r += 1) {
      for (let c = 0; c < state.game.puzzle.size; c += 1) {
        const cell = state.game.board[r][c];
        const baseCell = state.game.puzzle.board[r][c];
        if (!baseCell.blocked && !cell.locked) {
          state.game.selected = { r, c, dir: getPreferredDirection(r, c) };
          return;
        }
      }
    }
    state.game.selected = null;
  }

  function getPreferredDirection(r, c) {
    const map = getBoardWordIdsAt(r, c);
    if (map.H !== undefined) return "H";
    if (map.V !== undefined) return "V";
    return "H";
  }

  function getActivePlacement() {
    if (!state.game || !state.game.selected) return null;
    const { r, c, dir } = state.game.selected;
    return getWordByDirection(r, c, dir);
  }

  function setSelected(r, c, explicitDir) {
    if (!state.game) return;
    const map = getBoardWordIdsAt(r, c);
    const options = [];
    if (map.H !== undefined) options.push("H");
    if (map.V !== undefined) options.push("V");
    if (options.length === 0) return;

    let nextDir = explicitDir || state.game.selected?.dir;
    if (!nextDir || !options.includes(nextDir)) {
      nextDir = options[0];
    } else if (state.game.selected && state.game.selected.r === r && state.game.selected.c === c && options.length === 2) {
      nextDir = options.find((item) => item !== nextDir);
    }
    state.game.selected = { r, c, dir: nextDir };
  }

  function isInActiveWord(word, r, c) {
    const placement = word;
    if (!placement) return false;
    return placement.answer
      ? placement.answer.split("").some((_, idx) => {
          const item = placement.fixed[idx];
          return item.r === r && item.c === c;
        })
      : false;
  }

  function renderBoard() {
    if (!state.game) return;
    const size = state.game.puzzle.size;
    const boardEl = document.createElement("div");
    boardEl.className = "board";
    boardEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;

    const active = getActivePlacement();
    const selected = state.game.selected;

    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        const baseCell = state.game.puzzle.board[r][c];
        const uiCell = state.game.board[r][c];
        const el = document.createElement("button");
        el.className = "cell";
        el.type = "button";
        if (baseCell.blocked) {
          el.classList.add("blocked");
          el.disabled = true;
        } else {
          el.classList.add("editable");
          if (uiCell.locked) el.classList.add("locked");
          if (uiCell.wrong) el.classList.add("wrong");
          if (active && isInActiveWord(active, r, c)) {
            el.classList.add("highlight-word");
          }
          if (selected && selected.r === r && selected.c === c) {
            el.classList.add("selected");
          }
          el.textContent = /^[A-Z]$/.test(uiCell.value || "") ? uiCell.value : "";
          el.dataset.r = String(r);
          el.dataset.c = String(c);
          el.addEventListener("pointerdown", () => {
            if (baseCell.blocked) return;
            const nextDir = state.game?.selected?.r === r && state.game?.selected?.c === c
              ? null
              : state.game?.selected?.dir;
            setSelected(r, c, nextDir);
            renderBoard();
            renderClueCard();
            focusNativeInput();
          });
        }
        boardEl.appendChild(el);
      }
    }
    gameRefs.boardWrap.innerHTML = "";
    gameRefs.boardWrap.appendChild(boardEl);
  }

  function renderClueCard() {
    const placement = getActivePlacement();
    if (!placement) {
      gameRefs.activeDirection.textContent = "Across / 横向";
      gameRefs.wordStatus.textContent = "";
      gameRefs.activeClue.textContent = "先选择一个字母格";
      return;
    }
    const direction = state.game.selected.dir === "H" ? "Across / 横向" : "Down / 纵向";
    const stage = state.game.hintStages[placement.id] || 0;
    gameRefs.activeDirection.textContent = direction;
    gameRefs.wordStatus.textContent = `${placement.answer.length} 格`;
    gameRefs.activeClue.textContent = placement.clue || "Use the crossing letters to find this word.";
    gameRefs.hintMessage.textContent = stage >= 1 ? `中文释义：${placement.meaning}` : "卡住时可以逐级使用提示";
  }

  function applyCellValue(r, c, value) {
    if (!state.game) return;
    value = String(value || "").toUpperCase().slice(0, 1);
    if (!/^[A-Z]$/.test(value)) return;
    const cell = state.game.board[r][c];
    const baseCell = state.game.puzzle.board[r][c];
    if (!baseCell || baseCell.blocked || cell.locked) return;
    const prev = cell.value;
    if (prev !== value) {
      cell.value = value;
      cell.wrong = false;
      persistCurrentGame();
      renderBoard();
      renderClueCard();
      ensureAudio();
      playTone("ok");
      autoMoveSelection();
    }
  }

  function deleteCell() {
    const selected = state.game && state.game.selected;
    if (!selected) return;
    const { r, c } = selected;
    const baseCell = state.game.puzzle.board[r][c];
    const uiCell = state.game.board[r][c];
    if (baseCell.blocked || uiCell.locked) return;
    if (uiCell.value.length > 0) {
      uiCell.value = "";
      uiCell.wrong = false;
      persistCurrentGame();
      renderBoard();
      return;
    }
    const placement = getActivePlacement();
    const currentIndex = indexInWord(placement, r, c);
    const before = findEditableIndexInWord(placement, currentIndex, true);
    if (before >= 0) {
      const item = placement.fixed[before];
      state.game.selected = { r: item.r, c: item.c, dir: placement.dir };
      renderBoard();
      renderClueCard();
    }
  }

  function autoMoveSelection() {
    if (!state.game || !state.game.selected) return;
    const placement = getActivePlacement();
    if (!placement) return;
    const { r, c } = state.game.selected;
    const idx = indexInWord(placement, r, c);
    const nextIdx = findEditableIndexInWord(placement, idx, false);
    if (nextIdx >= 0) {
      const item = placement.fixed[nextIdx];
      state.game.selected = { r: item.r, c: item.c, dir: state.game.selected.dir };
      renderBoard();
    }
  }

  function indexInWord(placement, r, c) {
    for (let i = 0; i < placement.fixed.length; i += 1) {
      const cell = placement.fixed[i];
      if (cell.r === r && cell.c === c) return i;
    }
    return -1;
  }

  function findEditableIndexInWord(placement, startIndex, reverse) {
    if (!placement) return -1;
    const step = reverse ? -1 : 1;
    let i = startIndex + step;
    while (i >= 0 && i < placement.fixed.length) {
      const cellRef = placement.fixed[i];
      const ui = state.game.board[cellRef.r][cellRef.c];
      const base = state.game.puzzle.board[cellRef.r][cellRef.c];
      if (!base.blocked && !ui.locked) return i;
      i += step;
    }
    if (reverse) {
      return -1;
    }
    // wrap to first editable
    for (let j = 0; j < placement.fixed.length; j += 1) {
      const cellRef = placement.fixed[j];
      const ui = state.game.board[cellRef.r][cellRef.c];
      const base = state.game.puzzle.board[cellRef.r][cellRef.c];
      if (!base.blocked && !ui.locked) return j;
    }
    return -1;
  }

  function checkCurrent() {
    if (!state.game) return;
    let wrongWords = 0;
    const totalWords = state.game.puzzle.placements.length;
    for (let i = 0; i < totalWords; i += 1) {
      const placement = state.game.puzzle.placements[i];
      let solved = true;
      for (let j = 0; j < placement.answer.length; j += 1) {
        const item = placement.fixed[j];
        const uiCell = state.game.board[item.r][item.c];
        const baseCell = state.game.puzzle.board[item.r][item.c];
        const expected = placement.answer[j];
        const actual = uiCell.value;
        if (baseCell.blocked) continue;
        if (actual !== expected) {
          solved = false;
          if (!uiCell.locked) {
            uiCell.wrong = true;
          }
        }
      }
      if (!solved) wrongWords += 1;
    }

    persistCurrentGame();
    renderBoard();

    if (wrongWords === 0) {
      finishGame();
      return;
    }
    state.game.mistakes += 1;
    persistCurrentGame();
    playTone("error");
    showToast(`有 ${wrongWords} 个词暂未填对`);
    gameRefs.hintMessage.textContent = "错误已标注，按提示继续尝试。";
  }

  function isSolved() {
    if (!state.game) return false;
    for (let r = 0; r < state.game.puzzle.size; r += 1) {
      for (let c = 0; c < state.game.puzzle.size; c += 1) {
        const base = state.game.puzzle.board[r][c];
        if (base.blocked) continue;
        const answer = base.char;
        const actual = state.game.board[r][c].value;
        if (actual !== answer) return false;
      }
    }
    return true;
  }

  function calculateStars() {
    if (!state.game) return 0;
    const penalty = state.game.mistakes * 1 + state.game.hintsUsed * 0.65;
    const raw = 3 - Math.floor(penalty);
    return clamp(1, 3, raw);
  }

  function finishGame() {
    if (!state.game || state.game.solved) return;
    state.game.solved = true;
    const elapsed = getElapsedMs();
    state.game.star = calculateStars();
    const record = {
      themeId: state.game.themeId,
      difficulty: state.game.difficulty,
      elapsedMs: elapsed,
      hintsUsed: state.game.hintsUsed,
      mistakes: state.game.mistakes,
      stars: state.game.star,
      completedAt: Date.now(),
    };
    state.storage.finished.push(record);
    const best = state.storage.themeStats?.[state.game.themeId]?.[state.game.difficulty] || {
      bestStars: 0,
      bestTimeMs: null,
    };
    if (!state.storage.themeStats[state.game.themeId]) state.storage.themeStats[state.game.themeId] = {};
    const current = state.storage.themeStats[state.game.themeId][state.game.difficulty] || {
      bestStars: 0,
      bestTimeMs: null,
    };
    current.bestStars = Math.max(current.bestStars || 0, record.stars);
    if (!current.bestTimeMs || elapsed < current.bestTimeMs) {
      current.bestTimeMs = elapsed;
    }
    state.storage.themeStats[state.game.themeId][state.game.difficulty] = current;
    clearCurrentGame();
    writeStorage();
    state.game.solvedResult = record;
    renderResult(record);
    if (state.confettiEnabled) runConfetti();
    playTone("ok");
    switchView("result");
  }

  function renderResult(record) {
    const theme = getThemeById(record.themeId);
    const difficulty = getDifficultyById(record.difficulty);
    resultRefs.summary.innerHTML = `
      <div><strong>主题:</strong> ${theme?.name || record.themeId}</div>
      <div><strong>难度:</strong> ${difficulty.label}</div>
      <div><strong>用时:</strong> ${formatTime(record.elapsedMs)}</div>
      <div><strong>提示:</strong> ${record.hintsUsed}</div>
      <div><strong>错次数:</strong> ${record.mistakes}</div>
      <div><strong>星级:</strong> ${formatStars(record.stars)}</div>
    `;
    drawResultCard(record);
  }

  function drawResultCard(record) {
    const theme = getThemeById(record.themeId);
    const c = resultRefs.canvas;
    const ctx = c.getContext("2d");
    const w = c.width;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = "#f6ede0";
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 1800; i += 1) {
      const x = Math.floor(Math.random() * w);
      const y = Math.floor(Math.random() * h);
      const a = Math.random() * 0.08;
      ctx.fillStyle = `rgba(18,38,63,${a})`;
      ctx.fillRect(x, y, 1, 1);
    }

    ctx.fillStyle = "#12263f";
    ctx.font = "bold 54px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText("单词纵横 · 单局成绩", 60, 90);

    ctx.font = "32px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText(`主题：${theme?.name || ""}`, 60, 150);
    ctx.fillText(`难度：${getDifficultyById(record.difficulty).label}`, 60, 192);
    ctx.fillText(`用时：${formatTime(record.elapsedMs)}`, 60, 236);
    ctx.fillText(`提示：${record.hintsUsed}   错误：${record.mistakes}`, 60, 278);
    ctx.fillText(`星级：${formatStars(record.stars)}`, 60, 320);

    ctx.fillStyle = "#f5f6f7";
    const boardSize = state.game ? state.game.puzzle.size : 9;
    const pad = 60;
    const boardArea = 820;
    const cellSize = Math.floor(boardArea / boardSize);
    const sx = 60;
    const sy = 380;
    const solvedBoard = state.game ? state.game.puzzle.board : null;

    for (let r = 0; r < boardSize; r += 1) {
      for (let c = 0; c < boardSize; c += 1) {
        const x = sx + c * cellSize;
        const y = sy + r * cellSize;
        if (!solvedBoard || !solvedBoard[r] || !solvedBoard[r][c] || solvedBoard[r][c].blocked) {
          ctx.fillStyle = "#1e3a5f";
          ctx.fillRect(x, y, cellSize - 1, cellSize - 1);
          continue;
        }
        ctx.strokeStyle = "#6f8aa8";
        ctx.strokeRect(x, y, cellSize - 1, cellSize - 1);
        ctx.fillStyle = "#fff";
        ctx.fillRect(x + 3, y + 3, cellSize - 7, cellSize - 7);
        const show = solvedBoard[r][c].revealed ? solvedBoard[r][c].char : "?";
        if (show !== "?") {
          ctx.fillStyle = "#112942";
          ctx.font = `${Math.floor(cellSize * 0.45)}px -apple-system, BlinkMacSystemFont, sans-serif`;
          ctx.fillText(show, x + cellSize * 0.33, y + cellSize * 0.65);
        } else {
          ctx.fillStyle = "#a78f57";
          ctx.font = `${Math.floor(cellSize * 0.18)}px -apple-system, BlinkMacSystemFont, sans-serif`;
          ctx.fillText("?", x + cellSize * 0.42, y + cellSize * 0.58);
        }
      }
    }
    ctx.strokeStyle = "#a27c2e";
    ctx.lineWidth = 4;
    ctx.strokeRect(54, 372, boardArea + 12, boardArea + 12);
  }

  function runConfetti() {
    for (let i = 0; i < 24; i += 1) {
      const item = document.createElement("span");
      item.className = "confetti";
      item.style.left = `${Math.random() * 100}%`;
      item.style.background = i % 2 ? "#ff6f61" : "#1e3a5f";
      item.style.animationDuration = `${1 + Math.random() * 1.2}s`;
      item.style.animationDelay = `${Math.random() * 0.4}s`;
      confettiLayer.appendChild(item);
      item.addEventListener("animationend", () => item.remove(), { once: true });
    }
  }

  function resetBoardWrong() {
    if (!state.game) return;
    for (let r = 0; r < state.game.puzzle.size; r += 1) {
      for (let c = 0; c < state.game.puzzle.size; c += 1) {
        if (!state.game.board[r][c]) continue;
        state.game.board[r][c].wrong = false;
      }
    }
  }

  function useHintMeaning() {
    const placement = getActivePlacement();
    if (!placement) {
      showToast("请先选中一个可用格子");
      return;
    }
    if ((state.game.hintStages[placement.id] || 0) >= 1) {
      renderClueCard();
      showToast("中文释义已经显示");
      return;
    }
    ensureAudio();
    state.game.hintStages[placement.id] = Math.max(1, state.game.hintStages[placement.id] || 0);
    state.game.hintsUsed += 1;
    playTone("ok");
    persistCurrentGame();
    renderClueCard();
    showToast("已显示词义提示");
  }

  function useHintFirstLetter() {
    const placement = getActivePlacement();
    if (!placement) {
      showToast("请先选中一个可用格子");
      return;
    }
    if ((state.game.hintStages[placement.id] || 0) < 1) {
      showToast("请先使用“释义”按钮");
      return;
    }
    if ((state.game.hintStages[placement.id] || 0) >= 2) {
      showToast("本词已经补过一个字母");
      return;
    }
    ensureAudio();
    let placed = false;
    for (let i = 0; i < placement.fixed.length; i += 1) {
      const item = placement.fixed[i];
      const base = state.game.puzzle.board[item.r][item.c];
      const ui = state.game.board[item.r][item.c];
      if (base.blocked || ui.locked) continue;
      if (!ui.value) {
        ui.value = placement.answer[i];
        ui.wrong = false;
        placed = true;
        break;
      }
    }
    if (placed) {
      state.game.hintStages[placement.id] = Math.max(2, state.game.hintStages[placement.id] || 0);
      state.game.hintsUsed += 1;
      persistCurrentGame();
      renderBoard();
      showToast("已补充该词的一个字母");
      playTone("ok");
    } else {
      showToast("该词已全部填写");
    }
  }

  function useHintFillCell() {
    const selected = state.game?.selected;
    if (!selected) {
      showToast("请先选中一个格子");
      return;
    }
    if ((state.game.hintStages[selectedWordIdForSelected()] || 0) < 2) {
      showToast("请先使用“补一字母”提示");
      return;
    }
    const base = state.game.puzzle.board[selected.r][selected.c];
    const ui = state.game.board[selected.r][selected.c];
    if (base.blocked || ui.locked) {
      showToast("当前格子不可填");
      return;
    }
    const placement = getActivePlacement();
    if (!placement) return;
    if ((state.game.hintStages[placement.id] || 0) >= 3) {
      showToast("本词已经使用过填格提示");
      return;
    }
    const answer = placement?.answer || "";
    for (let i = 0; i < placement.fixed.length; i += 1) {
      if (placement.fixed[i].r === selected.r && placement.fixed[i].c === selected.c) {
        ui.value = answer[i];
        ui.wrong = false;
        break;
      }
    }
    state.game.hintStages[placement.id] = Math.max(3, state.game.hintStages[placement.id] || 0);
    state.game.hintsUsed += 1;
    persistCurrentGame();
    playTone("ok");
    renderBoard();
    showToast("已填当前字母");
  }

  function selectedWordIdForSelected() {
    if (!state.game || !state.game.selected) return null;
    const map = getBoardWordIdsAt(state.game.selected.r, state.game.selected.c);
    return map[state.game.selected.dir];
  }

  function focusNativeInput() {
    if (!gameRefs.nativeInput || state.view !== "game") return;
    try {
      gameRefs.nativeInput.focus({ preventScroll: true });
    } catch (err) {
      gameRefs.nativeInput.focus();
    }
  }

  function enterNativeLetter(value) {
    if (!state.game || state.game.solved || !state.game.selected) return;
    const letter = String(value || "").toUpperCase().replace(/[^A-Z]/g, "").slice(-1);
    if (!letter) return;

    let selected = state.game.selected;
    const selectedCell = state.game.board[selected.r]?.[selected.c];
    if (selectedCell?.locked) {
      autoMoveSelection();
      selected = state.game.selected;
    }
    if (!selected) return;
    applyCellValue(selected.r, selected.c, letter);
  }

  function setupNativeInput() {
    const input = gameRefs.nativeInput;
    if (!input) return;

    input.addEventListener("input", (event) => {
      if (event.isComposing) return;
      enterNativeLetter(input.value);
      input.value = "";
    });
    input.addEventListener("compositionend", () => {
      enterNativeLetter(input.value);
      input.value = "";
    });
    input.addEventListener("keydown", (event) => {
      if (!state.game || state.game.solved) return;
      if (event.key === "Backspace" && !input.value) {
        event.preventDefault();
        deleteCell();
      } else if (event.key === "Enter") {
        event.preventDefault();
        autoMoveSelection();
      }
    });
    const visualViewport = window.visualViewport;
    const syncViewport = () => {
      const height = visualViewport ? visualViewport.height : window.innerHeight;
      document.documentElement.style.setProperty("--visible-height", `${Math.round(height)}px`);
    };
    syncViewport();
    visualViewport?.addEventListener("resize", syncViewport);
    visualViewport?.addEventListener("scroll", syncViewport);
  }

  async function saveCardToAlbum() {
    const card = resultRefs.canvas;
    const dataUrl = card.toDataURL("image/png");
    if (!hasBridgeMethod("writeTempFile") || !hasBridgeMethod("saveImageToPhotosAlbum")) {
      resultRefs.bridgeTip.hidden = false;
      showToast("当前环境无法直接写入相册，已显示图片预览");
      return;
    }
    try {
      const mini = window.xhs.miniTool;
      const writeResult = await mini.writeTempFile({ data: dataUrl });
      const filePath = writeResult.filePath || dataUrl;
      await mini.saveImageToPhotosAlbum({ filePath });
      showToast("已保存到相册");
    } catch (err) {
      console.error(err);
      showToast("保存失败");
      resultRefs.bridgeTip.hidden = false;
    }
  }

  async function shareCardToNote() {
    const card = resultRefs.canvas;
    const dataUrl = card.toDataURL("image/png");
    if (!hasBridgeMethod("postNote")) {
      resultRefs.bridgeTip.hidden = false;
      showToast("当前环境不支持发笔记");
      return;
    }
    try {
      const mini = window.xhs.miniTool;
      await mini.postNote({
        pageType: "photo_publish",
        title: "单词纵横战绩",
        content: "我完成了今天的单词纵横挑战！",
        mediaInfo: {
          image_resources: [{ url: dataUrl }],
        },
      });
      showToast("已打开发布页面");
    } catch (err) {
      console.error(err);
      resultRefs.bridgeTip.hidden = false;
      showToast("发布失败，请在发布页重试");
    }
  }

  function openTutorial() {
    const steps = [
      "点击白色格子，会高亮它所在的整条横词或竖词。",
      "每格只填一个字母；用手机键盘输入后，会自动跳到这条词的下一个空格。",
      "卡住时按顺序使用提示。交叉格的同一个字母会同时帮助两条词。",
    ];
    const demoStates = [
      {
        direction: "横向",
        clue: "A small animal that says “meow”.",
        hint: "点击珊瑚色格子，选中整条 CAT",
        selected: "1,0",
        highlight: ["1,0", "1,1", "1,2"],
        values: { "0,1": "M", "1,1": "A" },
        keys: ["点击格子", "打开手机键盘"],
        activeKey: "打开手机键盘",
      },
      {
        direction: "横向",
        clue: "A small animal that says “meow”.",
        hint: "手机键盘填入 C 后，光标越过已知的 A，自动来到 T",
        selected: "1,2",
        highlight: ["1,0", "1,1", "1,2"],
        values: { "0,1": "M", "1,0": "C", "1,1": "A" },
        keys: ["手机键盘", "输入 C", "→ T"],
        activeKey: "输入 C",
      },
      {
        direction: "纵向",
        clue: "A drawing that shows where places are.",
        hint: "中文释义：地图 · 交叉字母 A 已经自动共享",
        selected: "2,1",
        highlight: ["0,1", "1,1", "2,1"],
        values: { "0,1": "M", "1,0": "C", "1,1": "A", "1,2": "T" },
        keys: ["释义", "补一字母", "填一格"],
        activeKey: "释义",
      },
    ];
    let idx = 0;

    function renderDemo() {
      const demo = demoStates[idx];
      tutorialRefs.board.replaceChildren();
      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          const coord = `${row},${col}`;
          const active = coord === "0,1" || coord === "1,0" || coord === "1,1" || coord === "1,2" || coord === "2,1";
          const cell = document.createElement("div");
          cell.className = active ? "tutorial-cell playable" : "tutorial-cell blocked";
          if (demo.highlight.includes(coord)) cell.classList.add("highlighted");
          if (demo.selected === coord) cell.classList.add("selected");
          cell.textContent = demo.values[coord] || "";
          tutorialRefs.board.appendChild(cell);
        }
      }
      tutorialRefs.direction.textContent = demo.direction;
      tutorialRefs.clue.textContent = demo.clue;
      tutorialRefs.hint.textContent = demo.hint;
      tutorialRefs.keys.replaceChildren();
      demo.keys.forEach((label) => {
        const key = document.createElement("span");
        key.textContent = label;
        if (label === demo.activeKey) key.classList.add("active");
        tutorialRefs.keys.appendChild(key);
      });
      tutorialRefs.progress.replaceChildren();
      demoStates.forEach((_, dotIndex) => {
        const dot = document.createElement("span");
        if (dotIndex === idx) dot.classList.add("active");
        tutorialRefs.progress.appendChild(dot);
      });
    }

    function renderStep() {
      tutorialRefs.steps.textContent = steps[idx];
      tutorialRefs.next.textContent = idx === steps.length - 1 ? "开始游戏" : "下一步";
      renderDemo();
    }
    renderStep();
    tutorialRefs.next.addEventListener("pointerdown", () => {
      idx += 1;
      if (idx >= steps.length) {
        state.storage.tutorialSeen = true;
        writeStorage();
        switchView("home");
        renderHome();
        return;
      }
      renderStep();
    });
    tutorialRefs.skip.addEventListener("pointerdown", () => {
      state.storage.tutorialSeen = true;
      writeStorage();
      switchView("home");
      renderHome();
    }, { once: true });
    switchView("tutorial");
  }

  function resumeGameFromStorage() {
    const current = state.storage.currentGame;
    if (!current) {
      showToast("没有可继续游戏");
      return;
    }
    state.game = cloneDeep(current);
    const expected = getThemeById(state.game.themeId);
    if (!expected) {
      clearCurrentGame();
      showToast("存档主题不存在，已清理");
      return;
    }
    state.game.lastTickMs = Date.now();
    if (!state.game.hintStages) state.game.hintStages = {};
    if (!state.game.puzzle) {
      clearCurrentGame();
      showToast("存档数据异常，已清理");
      return;
    }
    gameRefs.gameTitle.textContent = `${expected.name} · ${getDifficultyById(state.game.difficulty).label}`;
    state.game.solved = false;
    renderBoard();
    renderClueCard();
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = setInterval(() => {
      if (state.view === "game" && !state.game.solved) {
        updateGameTimer();
      }
    }, 500);
    switchView("game");
  }

  function openSettings() {
    closeDifficultyMenu();
    settingsRefs.overlay.hidden = false;
    homeRefs.settingsButton.setAttribute("aria-expanded", "true");
    renderSoundSetting();
    window.setTimeout(() => settingsRefs.closeButton.focus(), 0);
  }

  function closeSettings() {
    settingsRefs.overlay.hidden = true;
    homeRefs.settingsButton.setAttribute("aria-expanded", "false");
    if (state.view === "home") homeRefs.settingsButton.focus();
  }

  function bindEvents() {
    homeRefs.randomButton.addEventListener("click", () => {
      const theme = randomTheme();
      if (theme) startNewGame(theme.id);
    });

    homeRefs.resetButton.addEventListener("click", () => {
      if (!window.confirm("确定清空所有本地进度吗？")) return;
      localStorage.removeItem(STORAGE_KEY);
      readStorage();
      state.storage.currentGame = null;
      state.storage.themeStats = {};
      closeSettings();
      renderHome();
      showToast("本地数据已重置");
    });

    homeRefs.continueButton.addEventListener("click", resumeGameFromStorage);

    homeRefs.difficultyTrigger.addEventListener("click", () => {
      const shouldOpen = homeRefs.difficultySwitch.hidden;
      homeRefs.difficultySwitch.hidden = !shouldOpen;
      homeRefs.difficultyTrigger.setAttribute("aria-expanded", String(shouldOpen));
    });

    homeRefs.settingsButton.addEventListener("click", openSettings);
    settingsRefs.closeButton.addEventListener("click", closeSettings);
    settingsRefs.overlay.addEventListener("click", (event) => {
      if (event.target === settingsRefs.overlay) closeSettings();
    });
    settingsRefs.soundButton.addEventListener("click", () => {
      APP_SOUND.enabled = !APP_SOUND.enabled;
      if (APP_SOUND.enabled) ensureAudio();
      writeStorage();
      renderSoundSetting();
      playTone("ok");
      showToast(APP_SOUND.enabled ? "音效已开启" : "音效已关闭");
    });

    document.addEventListener("click", (event) => {
      if (
        !homeRefs.difficultySwitch.hidden &&
        !homeRefs.difficultySwitch.contains(event.target) &&
        !homeRefs.difficultyTrigger.contains(event.target)
      ) {
        closeDifficultyMenu();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !settingsRefs.overlay.hidden) closeSettings();
    });

    gameRefs.backHome.addEventListener("pointerdown", () => {
      if (state.game) {
        persistCurrentGame();
      }
      if (state.timerId) clearInterval(state.timerId);
      renderHome();
    });

    gameRefs.checkButton.addEventListener("pointerdown", checkCurrent);

    gameRefs.hintMeaning.addEventListener("pointerdown", () => {
      if (!state.game || state.game.solved) return;
      useHintMeaning();
    });
    gameRefs.hintFirstLetter.addEventListener("pointerdown", () => {
      if (!state.game || state.game.solved) return;
      useHintFirstLetter();
    });
    gameRefs.hintFillCell.addEventListener("pointerdown", () => {
      if (!state.game || state.game.solved) return;
      useHintFillCell();
    });

    resultRefs.saveButton.addEventListener("pointerdown", saveCardToAlbum);
    resultRefs.shareButton.addEventListener("pointerdown", shareCardToNote);
    resultRefs.backButton.addEventListener("pointerdown", () => {
      renderHome();
    });

    window.addEventListener("resize", () => {
      if (state.view === "game") {
        renderBoard();
      }
      if (state.view === "result" && state.game?.solvedResult) {
        drawResultCard(state.game.solvedResult);
      }
    });
  }

  function init() {
    if (!window.WordBank || !window.WordCross) {
      showToast("依赖文件加载失败");
      return;
    }
    state.wordBank = window.WordBank.themes;
    readStorage();
    renderHome();
    setupNativeInput();
    bindEvents();

    if (!state.storage.tutorialSeen) {
      openTutorial();
    }
  }

  init();
})();
