import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

test('proxy-addr does not trust IPv4 clients through unrelated IPv6 subnets', () => {
  const platform = createRequire(api.resolve('@nestjs/platform-express'));
  const express = createRequire(platform.resolve('express'));
  const proxyaddr = express('proxy-addr');
  for (const subnet of ['::ffff:10.0.0.0/8', '::/1']) {
    for (const ranges of [subnet, [subnet, '192.168.0.0/16']]) {
      const trust = proxyaddr.compile(ranges);
      for (const address of ['203.0.113.10', '::ffff:203.0.113.10']) {
        assert.equal(trust(address), false);
        assert.equal(proxyaddr({ socket: { remoteAddress: address }, headers: { 'x-forwarded-for': '198.51.100.9' } }, trust), address);
      }
    }
  }
  const trust = proxyaddr.compile('::ffff:10.0.0.0/104');
  assert.equal(trust('10.1.2.3'), true);
  assert.equal(trust('::ffff:10.1.2.3'), true);
  assert.equal(trust('203.0.113.10'), false);
  assert.equal(proxyaddr({ socket: { remoteAddress: '10.1.2.3' }, headers: { 'x-forwarded-for': '198.51.100.9' } }, trust), '198.51.100.9');
});

for (const app of ['miniapp', 'admin']) {
  const project = createRequire(new URL(`../apps/${app}/package.json`, import.meta.url));
  const vue = createRequire(project.resolve('vue'));
  const renderer = createRequire(vue.resolve('@vue/server-renderer/package.json'));
  const shared = createRequire(renderer.resolve('@vue/shared/package.json'));

  test(`${app} source-map-js rejects malicious indexed offsets and preserves normal mappings`, () => {
    const compiler = createRequire(vue.resolve('@vue/compiler-sfc'));
    const { SourceMapConsumer, SourceNode } = compiler('source-map-js');
    const basic = { version: 3, sources: ['trip.js'], names: [], mappings: 'AAAA', sourcesContent: ['trip();'] };
    for (const line of [1e12, Infinity, 0.5, -1]) {
      assert.throws(() => new SourceMapConsumer({ version: 3, sections: [{ offset: { line, column: 0 }, map: basic }] }), /Section offset/);
    }
    const nested = { version: 3, sections: [{ offset: { line: 6_000_000, column: 0 }, map: basic }] };
    assert.throws(() => new SourceMapConsumer({ version: 3, sections: [{ offset: { line: 6_000_000, column: 0 }, map: nested }] }), /Section offset/);
    const consumer = new SourceMapConsumer({ version: 3, sections: [{ offset: { line: 1, column: 0 }, map: basic }] });
    assert.deepEqual(consumer.originalPositionFor({ line: 2, column: 1 }), { source: 'trip.js', line: 1, column: 0, name: null });
    const output = SourceNode.fromStringWithSourceMap('\ntrip();', consumer).toStringWithSourceMap();
    assert.equal(output.code, '\ntrip();');
    assert.deepEqual(new SourceMapConsumer(output.map.toJSON()).originalPositionFor({ line: 2, column: 1 }), { source: 'trip.js', line: 1, column: 0, name: null });
  });

  for (const mode of ['cjs', 'cjs.prod']) {
    test(`${app} Vue ${mode} rejects CR attribute injection through its real SSR renderer`, async context => {
      context.mock.method(console, 'error', () => {});
      context.mock.method(console, 'warn', () => {});
      const { ssrRenderAttrs, renderToString } = renderer(`./dist/server-renderer.${mode}.js`);
      const { isSSRSafeAttrName } = shared(`./dist/shared.${mode}.js`);
      for (const whitespace of ['\r', '\t', '\n', '\f', ' ']) {
        const name = `x${whitespace}autofocus${whitespace}onfocus`;
        assert.equal(isSSRSafeAttrName(name), false);
        const props = { id: 'safe', [name]: 'alert(1)' };
        assert.equal(ssrRenderAttrs(props), ' id="safe"');
        assert.equal(await renderToString(project('vue').h('input', props)), '<input id="safe">');
      }
      assert.equal(ssrRenderAttrs({ id: 'safe', 'data-trip': '临安 & "出行"', 'aria-label': '合同', disabled: true }), ' id="safe" data-trip="临安 &amp; &quot;出行&quot;" aria-label="合同" disabled');
      assert.equal(ssrRenderAttrs({ title: '第一行\r第二行' }), ' title="第一行\r第二行"');
    });
  }

  for (const mode of ['esm-bundler', 'esm-browser', 'esm-browser.prod']) {
    test(`${app} Vue ${mode} rejects CR injection through its published SSR functions`, async context => {
      context.mock.method(console, 'error', () => {});
      context.mock.method(console, 'warn', () => {});
      const filename = renderer.resolve(`./dist/server-renderer.${mode}.js`);
      const moduleUrl = mode === 'esm-bundler' ? pathToFileURL(filename).href : `data:text/javascript;base64,${Buffer.from(readFileSync(filename, 'utf8')).toString('base64')}`;
      const { ssrRenderAttrs, renderToString } = await import(moduleUrl);
      for (const whitespace of ['\r', '\t', '\n', '\f', ' ']) {
        const props = { id: 'safe', [`x${whitespace}autofocus${whitespace}onfocus`]: 'alert(1)' };
        assert.equal(ssrRenderAttrs(props), ' id="safe"');
        assert.equal(await renderToString(project('vue').h('input', props)), '<input id="safe">');
      }
      assert.equal(ssrRenderAttrs({ 'data-trip': '临安 & "出行"', 'aria-label': '合同', disabled: true }), ' data-trip="临安 &amp; &quot;出行&quot;" aria-label="合同" disabled');
      assert.equal(ssrRenderAttrs({ title: '第一行\r第二行' }), ' title="第一行\r第二行"');
    });
  }

  test(`${app} Vue shared ESM rejects the same unsafe names without rejecting ordinary attributes`, async context => {
    context.mock.method(console, 'error', () => {});
    const code = readFileSync(shared.resolve('./dist/shared.esm-bundler.js'), 'utf8');
    const { isSSRSafeAttrName } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    for (const whitespace of ['\r', '\t', '\n', '\f', ' ']) assert.equal(isSSRSafeAttrName(`x${whitespace}onfocus`), false);
    for (const name of ['id', 'data-trip', 'aria-label', 'viewBox']) assert.equal(isSSRSafeAttrName(name), true);
  });
}

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
