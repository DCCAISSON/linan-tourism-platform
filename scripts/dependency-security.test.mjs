import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const api = createRequire(new URL('../apps/api/package.json', import.meta.url));
const miniapp = createRequire(new URL('../apps/miniapp/package.json', import.meta.url));
const excel = createRequire(api.resolve('exceljs'));
const archiver = createRequire(excel.resolve('archiver'));
const archiverUtils = createRequire(archiver.resolve('archiver-utils'));
const glob = createRequire(archiverUtils.resolve('glob'));
const readdirGlob = createRequire(archiver.resolve('readdir-glob'));
const expansionV1 = createRequire(glob.resolve('minimatch'))('brace-expansion');
const expansionV2 = createRequire(readdirGlob.resolve('minimatch'))('brace-expansion');
const nestCli = createRequire(api.resolve('@nestjs/cli/package.json'));
const expansionV5 = createRequire(nestCli.resolve('minimatch'))('brace-expansion').expand;
const uniPlugin = createRequire(miniapp.resolve('@dcloudio/vite-plugin-uni'));
const uniShared = createRequire(uniPlugin.resolve('@dcloudio/uni-cli-shared'));
const fastGlob = createRequire(uniShared.resolve('fast-glob'));
const micromatch = createRequire(fastGlob.resolve('micromatch'));
const braces = micromatch('braces');

for (const [version, expand] of [['1.x', expansionV1], ['2.x', expansionV2], ['5.x', expansionV5]]) {
  test(`brace-expansion ${version} handles previously overflowing patterns`, () => {
    assert.deepEqual(expand('trip-{a,b}-{1..2}'), ['trip-a-1', 'trip-a-2', 'trip-b-1', 'trip-b-2']);
    assert.doesNotThrow(() => expand('{'.repeat(4_000) + 'a' + '}'.repeat(4_000)));
    assert.doesNotThrow(() => expand('{' + '{a},'.repeat(7_000) + 'b}'));
  });
}

test('braces rejects excessive brace and parenthesis nesting before stack exhaustion', () => {
  for (const [open, close] of [['{', '}'], ['(', ')']]) {
    for (const depth of [101, 4_000]) {
      const pattern = open.repeat(depth) + 'a' + close.repeat(depth);
      for (const method of ['parse', 'compile', 'expand', 'stringify']) {
        assert.throws(() => braces[method](pattern), { name: 'SyntaxError', message: /maximum nesting depth/ });
      }
    }
    const boundary = open.repeat(100) + 'a' + close.repeat(100);
    for (const method of ['parse', 'compile', 'expand', 'stringify']) {
      assert.doesNotThrow(() => braces[method](boundary));
    }
  }
});

test('braces guards direct AST calls as well as its parser', () => {
  for (const method of ['compile', 'expand', 'stringify']) {
    const root = { type: 'root', nodes: [] };
    let parent = root;
    for (let i = 0; i < 4_000; i++) {
      const node = { type: 'paren', nodes: [], parent };
      parent.nodes.push(node);
      parent = node;
    }
    parent.nodes.push({ type: 'text', value: 'a' });
    assert.throws(() => braces[method](root), { name: 'SyntaxError', message: /maximum nesting depth/ });
  }
});

test('braces preserves ordinary expansion and invalid-brace stringification', () => {
  assert.deepEqual(braces.expand('trip-{a,b}-{1..2}'), ['trip-a-1', 'trip-a-2', 'trip-b-1', 'trip-b-2']);
  assert.equal(braces.compile('trip-{a,b}'), 'trip-(a|b)');
  for (const pattern of ['{{a}}', '{a,{b}}', '{{x}y}', '{a,{b,{c}}', '{}{a}', '{1..8}']) {
    assert.equal(braces.stringify(pattern, { escapeInvalid: true }), pattern);
  }
  assert.equal(braces.stringify('\\{a,b\\}', { keepEscaping: true }), '\\{a,b\\}');
});

test('miniapp glob consumers retain normal file matching', async () => {
  const match = fastGlob('micromatch');
  assert.deepEqual(match(['a.vue', 'b.ts', 'c.md'], '*.{vue,ts}'), ['a.vue', 'b.ts']);
  const files = await uniShared('fast-glob')('scripts/*.{mjs,cjs}', { cwd: fileURLToPath(new URL('..', import.meta.url)), absolute: false });
  assert.ok(files.includes('scripts/dependency-security.test.mjs'));
});

test('ExcelJS can write and read an in-memory enrollment workbook', async () => {
  const ExcelJS = api('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Synthetic roster');
  sheet.addRows([['Participant', 'Class', 'Paid fen'], ['SYNTHETIC_A', 'Class 1', 100], ['SYNTHETIC_B', 'Class 2', 200]]);
  const bytes = await workbook.xlsx.writeBuffer();
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(bytes);
  assert.deepEqual(restored.getWorksheet('Synthetic roster').getSheetValues().slice(1).map(row => row.slice(1)), [
    ['Participant', 'Class', 'Paid fen'], ['SYNTHETIC_A', 'Class 1', 100], ['SYNTHETIC_B', 'Class 2', 200],
  ]);
});
