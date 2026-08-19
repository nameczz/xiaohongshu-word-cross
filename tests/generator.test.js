const test = require("node:test");
const assert = require("node:assert/strict");
const WordCross = require("../app/assets/js/generator.js");
const WordBank = require("../app/assets/js/words.js");

function revealRatio(puzzle) {
  const cells = puzzle.board.flat().filter((cell) => !cell.blocked);
  return cells.filter((cell) => cell.revealed).length / cells.length;
}

test("word bank has ten useful themed collections", () => {
  assert.equal(WordBank.themes.length, 10);
  const all = [];
  for (const theme of WordBank.themes) {
    assert.match(theme.id, /^[a-z]+$/);
    assert.ok(theme.name && theme.icon);
    assert.equal(theme.words.length, 40);
    const local = new Set();
    for (const item of theme.words) {
      assert.match(item.word, /^[A-Z]{3,8}$/);
      assert.match(item.clue, /^[A-Za-z]/);
      assert.doesNotMatch(item.clue, /[\u3400-\u9fff]/);
      assert.match(item.meaning, /[\u3400-\u9fff]/);
      assert.ok(!local.has(item.word), `${theme.id} repeats ${item.word}`);
      local.add(item.word);
      all.push(item.word);
    }
  }
  assert.equal(all.length, 400);
  assert.ok(new Set(all).size >= 390);
});

test("600 seeded boards are valid and stay near reveal targets", { timeout: 120000 }, () => {
  const expected = { easy: 0.7, normal: 0.55, hard: 0.45 };
  let count = 0;
  WordBank.themes.forEach((theme, themeIndex) => {
    Object.keys(expected).forEach((difficulty, difficultyIndex) => {
      for (let seed = 1; seed <= 20; seed += 1) {
        const rng = WordCross._internal.createRng(themeIndex * 10000 + difficultyIndex * 1000 + seed);
        const puzzle = WordCross.generatePuzzle(theme.words, { difficulty, minWords: 6, maxWords: 8, rng });
        assert.ok(puzzle, `${theme.id}/${difficulty}/${seed} generated`);
        assert.ok(WordCross._internal.validatePuzzleStructure(puzzle));
        assert.ok(puzzle.size >= 7 && puzzle.size <= 9);
        assert.ok(puzzle.placements.length >= 6 && puzzle.placements.length <= 8);
        assert.ok(Math.abs(revealRatio(puzzle) - expected[difficulty]) <= 0.16);
        for (const row of puzzle.board) {
          for (const cell of row) {
            if (!cell.blocked) assert.match(cell.char, /^[A-Z]$/);
          }
        }
        count += 1;
      }
    });
  });
  assert.equal(count, 600);
});

test("same seed produces the same complete puzzle", () => {
  const words = WordBank.themes[0].words;
  const a = WordCross.generatePuzzle(words, { difficulty: "normal", rng: WordCross._internal.createRng(20260819) });
  const b = WordCross.generatePuzzle(words, { difficulty: "normal", rng: WordCross._internal.createRng(20260819) });
  assert.deepEqual(a, b);
});

test("validator rejects corrupted cells and disconnected mappings", () => {
  const puzzle = WordCross.generatePuzzle(WordBank.themes[1].words, {
    difficulty: "easy",
    rng: WordCross._internal.createRng(81),
  });
  const brokenLetter = structuredClone(puzzle);
  const active = brokenLetter.board.flat().find((cell) => !cell.blocked);
  active.char = active.char === "Z" ? "A" : "Z";
  assert.equal(WordCross._internal.validatePuzzleStructure(brokenLetter), false);

  const brokenMap = structuredClone(puzzle);
  const mapped = brokenMap.board.flat().find((cell) => !cell.blocked);
  mapped.words = {};
  assert.equal(WordCross._internal.validatePuzzleStructure(brokenMap), false);
});

test("too-small input fails safely instead of returning a broken board", () => {
  const tiny = WordBank.themes[0].words.slice(0, 5);
  assert.equal(WordCross.generatePuzzle(tiny, { rng: WordCross._internal.createRng(1) }), null);
});
