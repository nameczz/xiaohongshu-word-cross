(() => {
  "use strict";

  const DIRS = {
    H: { dr: 0, dc: 1, opposite: "V" },
    V: { dr: 1, dc: 0, opposite: "H" },
  };
  const REVEAL_RATIOS = { easy: 0.5, normal: 0.35, hard: 0.2 };

  function clamp(min, max, value) {
    return Math.max(min, Math.min(max, value));
  }

  function createRng(seed) {
    let state = (seed >>> 0) || 0x9e3779b9;
    return function next() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 0x100000000;
    };
  }

  function shuffle(items, rng) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function key(r, c) {
    return `${r},${c}`;
  }

  function inside(size, r, c) {
    return r >= 0 && c >= 0 && r < size && c < size;
  }

  function normalizeWords(words) {
    const seen = new Set();
    const result = [];
    (Array.isArray(words) ? words : []).forEach((item) => {
      if (!item || typeof item !== "object") return;
      const word = String(item.word || "").trim().toUpperCase();
      const clue = String(item.clue || "").trim();
      const meaning = String(item.meaning || "").trim();
      if (!/^[A-Z]{3,8}$/.test(word) || !clue || !meaning || seen.has(word)) return;
      seen.add(word);
      result.push({ word, clue, meaning });
    });
    return result;
  }

  function emptyState(size) {
    return {
      size,
      cells: Array.from({ length: size }, () =>
        Array.from({ length: size }, () => ({ char: null, words: {} })),
      ),
      placements: [],
    };
  }

  function cloneState(state) {
    return {
      size: state.size,
      cells: state.cells.map((row) =>
        row.map((cell) => ({ char: cell.char, words: { ...cell.words } })),
      ),
      placements: state.placements.map((placement) => ({
        ...placement,
        fixed: placement.fixed.map((cell) => ({ ...cell })),
      })),
    };
  }

  function cellsFor(placement) {
    const dir = DIRS[placement.dir];
    if (!dir) return [];
    return Array.from({ length: placement.answer.length }, (_, index) => ({
      r: placement.row + dir.dr * index,
      c: placement.col + dir.dc * index,
      index,
      char: placement.answer[index],
    }));
  }

  function canPlace(state, placement, requireIntersection) {
    const dir = DIRS[placement.dir];
    if (!dir || !/^[A-Z]{3,8}$/.test(placement.answer || "")) return false;
    const cells = cellsFor(placement);
    if (!cells.length) return false;

    const before = { r: placement.row - dir.dr, c: placement.col - dir.dc };
    const after = {
      r: placement.row + dir.dr * placement.answer.length,
      c: placement.col + dir.dc * placement.answer.length,
    };
    if (inside(state.size, before.r, before.c) && state.cells[before.r][before.c].char) return false;
    if (inside(state.size, after.r, after.c) && state.cells[after.r][after.c].char) return false;

    let intersections = 0;
    for (const item of cells) {
      if (!inside(state.size, item.r, item.c)) return false;
      const target = state.cells[item.r][item.c];
      if (target.char) {
        if (target.char !== item.char) return false;
        if (target.words[placement.dir] !== undefined) return false;
        if (target.words[dir.opposite] === undefined) return false;
        intersections += 1;
        continue;
      }

      const sides = placement.dir === "H"
        ? [[item.r - 1, item.c], [item.r + 1, item.c]]
        : [[item.r, item.c - 1], [item.r, item.c + 1]];
      for (const [r, c] of sides) {
        if (inside(state.size, r, c) && state.cells[r][c].char) return false;
      }
    }
    return !requireIntersection || intersections > 0;
  }

  function place(state, placement) {
    const next = cloneState(state);
    const id = next.placements.length;
    const fixed = cellsFor(placement).map((item) => ({
      r: item.r,
      c: item.c,
      index: item.index,
    }));
    for (const item of fixed) {
      next.cells[item.r][item.c].char = placement.answer[item.index];
      next.cells[item.r][item.c].words[placement.dir] = id;
    }
    next.placements.push({
      id,
      answer: placement.answer,
      clue: placement.clue,
      meaning: placement.meaning,
      dir: placement.dir,
      row: placement.row,
      col: placement.col,
      fixed,
    });
    return next;
  }

  function candidatesFor(state, word, rng, requireIntersection) {
    const candidates = [];
    const signatures = new Set();
    if (!state.placements.length) {
      for (const dirName of ["H", "V"]) {
        const dir = DIRS[dirName];
        for (let row = 0; row < state.size; row += 1) {
          for (let col = 0; col < state.size; col += 1) {
            const candidate = {
              answer: word.word,
              clue: word.clue,
              meaning: word.meaning,
              dir: dirName,
              row,
              col,
            };
            if (canPlace(state, candidate, false)) candidates.push(candidate);
          }
        }
      }
    } else {
      for (let row = 0; row < state.size; row += 1) {
        for (let col = 0; col < state.size; col += 1) {
          const existing = state.cells[row][col];
          if (!existing.char) continue;
          for (let index = 0; index < word.word.length; index += 1) {
            if (word.word[index] !== existing.char) continue;
            for (const dirName of ["H", "V"]) {
              const dir = DIRS[dirName];
              const candidate = {
                answer: word.word,
                clue: word.clue,
                meaning: word.meaning,
                dir: dirName,
                row: row - dir.dr * index,
                col: col - dir.dc * index,
              };
              const signature = `${dirName}:${candidate.row}:${candidate.col}`;
              if (signatures.has(signature)) continue;
              signatures.add(signature);
              if (canPlace(state, candidate, requireIntersection)) candidates.push(candidate);
            }
          }
        }
      }
    }
    return shuffle(candidates, rng);
  }

  function search(state, pool, target, rng, budget) {
    budget.calls += 1;
    if (budget.calls > budget.max) return null;
    if (state.placements.length === target) return state;
    if (pool.length < target - state.placements.length) return null;

    const options = [];
    const sample = pool.slice(0, Math.min(pool.length, 24));
    for (let index = 0; index < sample.length; index += 1) {
      const candidates = candidatesFor(state, sample[index], rng, state.placements.length > 0);
      if (candidates.length) options.push({ index, candidates });
    }
    if (!options.length) return null;
    options.sort((a, b) => a.candidates.length - b.candidates.length);

    for (const option of options.slice(0, 7)) {
      for (const candidate of option.candidates.slice(0, 24)) {
        const nextPool = pool.filter((_, index) => index !== option.index);
        const solved = search(place(state, candidate), nextPool, target, rng, budget);
        if (solved) return solved;
      }
    }
    return null;
  }

  function finalize(state, difficulty, rng) {
    const ratio = REVEAL_RATIOS[difficulty] || REVEAL_RATIOS.normal;
    const allKeys = [];
    const wordKeys = new Map();
    state.placements.forEach((placement) => {
      const keys = placement.fixed.map((cell) => key(cell.r, cell.c));
      wordKeys.set(placement.id, keys);
      keys.forEach((coord) => {
        if (!allKeys.includes(coord)) allKeys.push(coord);
      });
    });

    const hidden = new Set();
    const wordIds = shuffle([...wordKeys.keys()], rng);
    for (const id of wordIds) {
      const available = wordKeys.get(id).filter((coord) => !hidden.has(coord));
      const choices = available.length ? available : wordKeys.get(id);
      hidden.add(choices[Math.floor(rng() * choices.length)]);
    }
    const hiddenTarget = Math.min(allKeys.length - 1, Math.max(hidden.size, Math.round(allKeys.length * (1 - ratio))));
    const remaining = shuffle(allKeys.filter((coord) => !hidden.has(coord)), rng);
    while (hidden.size < hiddenTarget && remaining.length) hidden.add(remaining.pop());

    const board = state.cells.map((row, r) => row.map((cell, c) => {
      if (!cell.char) return { char: null, blocked: true, revealed: false, words: {} };
      return {
        char: cell.char,
        blocked: false,
        revealed: !hidden.has(key(r, c)),
        words: { ...cell.words },
      };
    }));
    const placements = state.placements.map((placement, id) => ({
      id,
      answer: placement.answer,
      clue: placement.clue,
      meaning: placement.meaning,
      dir: placement.dir,
      row: placement.row,
      col: placement.col,
      fixed: placement.fixed.map((cell) => ({
        ...cell,
        revealed: !hidden.has(key(cell.r, cell.c)),
      })),
    }));
    return { size: state.size, difficulty, board, placements, totalCells: allKeys.length };
  }

  function validatePuzzleStructure(puzzle) {
    if (!puzzle || !Number.isInteger(puzzle.size) || puzzle.size < 7 || puzzle.size > 9) return false;
    if (!Array.isArray(puzzle.placements) || puzzle.placements.length < 6 || puzzle.placements.length > 8) return false;
    if (!Array.isArray(puzzle.board) || puzzle.board.length !== puzzle.size) return false;
    if (puzzle.board.some((row) => !Array.isArray(row) || row.length !== puzzle.size)) return false;

    const expected = new Map();
    const wordCells = [];
    for (let id = 0; id < puzzle.placements.length; id += 1) {
      const placement = puzzle.placements[id];
      const dir = DIRS[placement.dir];
      if (!dir || !/^[A-Z]{3,8}$/.test(placement.answer || "")) return false;
      if (!Array.isArray(placement.fixed) || placement.fixed.length !== placement.answer.length) return false;
      const coords = [];
      let hasHidden = false;
      for (let index = 0; index < placement.answer.length; index += 1) {
        const r = placement.row + dir.dr * index;
        const c = placement.col + dir.dc * index;
        const fixed = placement.fixed[index];
        if (!inside(puzzle.size, r, c) || !fixed || fixed.r !== r || fixed.c !== c || fixed.index !== index) return false;
        if (!fixed.revealed) hasHidden = true;
        const coord = key(r, c);
        coords.push(coord);
        const entry = expected.get(coord) || { char: placement.answer[index], words: {} };
        if (entry.char !== placement.answer[index] || entry.words[placement.dir] !== undefined) return false;
        entry.words[placement.dir] = id;
        expected.set(coord, entry);
      }
      if (!hasHidden) return false;
      wordCells.push(coords);

    }

    for (let id = 0; id < puzzle.placements.length; id += 1) {
      const placement = puzzle.placements[id];
      const placementDir = DIRS[placement.dir];
      const opposite = placementDir.opposite;
      const beforeR = placement.row - placementDir.dr;
      const beforeC = placement.col - placementDir.dc;
      const afterR = placement.row + placementDir.dr * placement.answer.length;
      const afterC = placement.col + placementDir.dc * placement.answer.length;
      if (expected.has(key(beforeR, beforeC)) || expected.has(key(afterR, afterC))) return false;
      for (const coord of wordCells[id]) {
        const [r, c] = coord.split(",").map(Number);
        const sides = placement.dir === "H" ? [[r - 1, c], [r + 1, c]] : [[r, c - 1], [r, c + 1]];
        for (const [sideR, sideC] of sides) {
          const neighbor = expected.get(key(sideR, sideC));
          if (!neighbor) continue;
          const here = expected.get(coord);
          const crossId = here.words[opposite];
          if (crossId === undefined || neighbor.words[opposite] !== crossId) return false;
        }
      }
    }

    for (let r = 0; r < puzzle.size; r += 1) {
      for (let c = 0; c < puzzle.size; c += 1) {
        const cell = puzzle.board[r][c];
        const entry = expected.get(key(r, c));
        if (!cell || typeof cell !== "object") return false;
        if (!entry) {
          if (!cell.blocked || cell.char !== null || Object.keys(cell.words || {}).length) return false;
          continue;
        }
        if (cell.blocked || cell.char !== entry.char || typeof cell.revealed !== "boolean") return false;
        const actualWords = cell.words || {};
        const dirs = Object.keys(entry.words);
        if (dirs.length < 1 || dirs.length > 2 || Object.keys(actualWords).length !== dirs.length) return false;
        if (dirs.some((dir) => actualWords[dir] !== entry.words[dir])) return false;
      }
    }

    const graph = puzzle.placements.map(() => new Set());
    expected.forEach((entry) => {
      const ids = Object.values(entry.words);
      if (ids.length === 2) {
        graph[ids[0]].add(ids[1]);
        graph[ids[1]].add(ids[0]);
      }
    });
    const seen = new Set([0]);
    const queue = [0];
    while (queue.length) {
      graph[queue.pop()].forEach((id) => {
        if (!seen.has(id)) { seen.add(id); queue.push(id); }
      });
    }
    return seen.size === puzzle.placements.length && expected.size === puzzle.totalCells;
  }

  function generatePuzzle(words, options = {}) {
    const normalized = normalizeWords(words);
    const difficulty = REVEAL_RATIOS[options.difficulty] ? options.difficulty : "normal";
    const minWords = clamp(6, 8, Number(options.minWords) || 6);
    const maxWords = clamp(minWords, 8, Number(options.maxWords) || 8);
    const rng = options.rng || createRng(Date.now());
    if (normalized.length < minWords) return null;

    for (const target of shuffle(Array.from({ length: maxWords - minWords + 1 }, (_, i) => maxWords - i), rng)) {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const sizeRoll = rng();
        const size = sizeRoll < 0.72 ? 9 : sizeRoll < 0.92 ? 8 : 7;
        const pool = shuffle(normalized.slice(), rng);
        const solved = search(emptyState(size), pool, target, rng, { calls: 0, max: 12000 });
        if (!solved) continue;
        const puzzle = finalize(solved, difficulty, rng);
        if (validatePuzzleStructure(puzzle)) return puzzle;
      }
    }
    return null;
  }

  const api = {
    generatePuzzle,
    _internal: {
      createRng,
      normalizeWords,
      canPlace,
      candidatesFor,
      validatePuzzleStructure,
      revealRatios: REVEAL_RATIOS,
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.WordCross = api;
})();
