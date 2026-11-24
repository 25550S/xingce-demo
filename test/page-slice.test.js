const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(name) {
  const key = 'function ' + name + '(';
  const i = html.indexOf(key);
  if (i < 0) throw new Error('missing ' + name);
  let depth = 0, started = false;
  for (let j = i; j < html.length; j++) {
    if (html[j] === '{') { depth++; started = true; }
    else if (html[j] === '}') {
      depth--;
      if (started && depth === 0) return html.slice(i, j + 1);
    }
  }
  throw new Error('unterminated ' + name);
}

function loadHelpers() {
  const src = 'var listPage={qb:1,redo:1,papers:1};\n' +
    extractFn('pageSlice') + '\n' +
    extractFn('pagerBar') + '\n' +
    extractFn('usePage') + '\n' +
    'return {pageSlice:pageSlice,pagerBar:pagerBar,usePage:usePage,get:function(k){return listPage[k]},set:function(k,v){listPage[k]=v}};';
  return new Function(src)();
}

const api = loadHelpers();
const seq = function (n) { return Array.from({length: n}, function (_, i) { return 'r' + i; }); };

test('pageSlice keeps order, pages by 10, and clamps', function () {
  const rows = seq(25);
  const first = api.pageSlice(rows, 1, 10);
  assert.equal(first.page, 1);
  assert.equal(first.pages, 3);
  assert.equal(first.start, 0);
  assert.equal(first.show, true);
  assert.deepEqual(first.rows, rows.slice(0, 10));

  const mid = api.pageSlice(rows, 2, 10);
  assert.deepEqual(mid.rows, rows.slice(10, 20));
  assert.equal(mid.start, 10);

  const last = api.pageSlice(rows, 3, 10);
  assert.deepEqual(last.rows, rows.slice(20));
  assert.equal(last.rows[0], 'r20');

  const over = api.pageSlice(rows, 9, 10);
  assert.equal(over.page, 3);
  assert.deepEqual(over.rows, rows.slice(20));

  assert.equal(api.pageSlice(rows, 0, 10).page, 1);
  assert.equal(api.pageSlice(rows, -4, 10).page, 1);
  assert.equal(api.pageSlice(rows, 'x', 10).page, 1);
  assert.equal(api.pageSlice(rows, 2.9, 10).page, 2);

  const newestFirst = ['n24', 'n23', 'n22'].concat(seq(8));
  assert.equal(newestFirst.length, 11);
  assert.deepEqual(api.pageSlice(newestFirst, 1, 10).rows, newestFirst.slice(0, 10));
  assert.deepEqual(api.pageSlice(newestFirst, 2, 10).rows, ['r7']);
  assert.equal(api.pageSlice(newestFirst, 2, 10).rows[0], newestFirst[10]);
});

test('bar is hidden at 10 or fewer rows and shown from 11', function () {
  [0, 1, 10].forEach(function (n) {
    const info = api.pageSlice(seq(n), 4, 10);
    assert.equal(info.show, false);
    assert.equal(info.pages, 1);
    assert.equal(info.page, 1);
    assert.equal(info.rows.length, n);
    assert.equal(api.pagerBar('qb', info), '');
  });
  assert.deepEqual(api.pageSlice(null, 3, 10), {page: 1, pages: 1, start: 0, rows: [], show: false});
  assert.equal(api.pageSlice(seq(11), 1).pages, 2);
  const eleven = api.pageSlice(seq(11), 2);
  assert.equal(eleven.show, true);
  assert.deepEqual(eleven.rows, ['r10']);
});

test('pager disables the ends and does not wrap', function () {
  const rows = seq(21);
  const first = api.pagerBar('redo', api.pageSlice(rows, 1, 10));
  assert.match(first, /class="btn sec sm"/);
  assert.match(first, /上一页/);
  assert.match(first, /下一页/);
  assert.match(first, /第 1 \/ 3 页/);
  assert.match(first, /data-pg="redo"/);
  assert.match(first, /data-dir="-1" disabled/);
  assert.doesNotMatch(first, /data-dir="1" disabled/);

  const last = api.pagerBar('papers', api.pageSlice(rows, 99, 10));
  assert.match(last, /第 3 \/ 3 页/);
  assert.match(last, /data-dir="1" disabled/);
  assert.doesNotMatch(last, /data-dir="-1" disabled/);

  const mid = api.pagerBar('qb', api.pageSlice(rows, 2, 10));
  assert.match(mid, /第 2 \/ 3 页/);
  assert.doesNotMatch(mid, /disabled/);
});

test('usePage keeps the current page and clamps after a shrink', function () {
  api.set('redo', 3);
  let info = api.usePage('redo', seq(21));
  assert.equal(info.page, 3);
  assert.deepEqual(info.rows, ['r20']);
  assert.equal(api.get('redo'), 3);

  info = api.usePage('redo', seq(21));
  assert.equal(info.page, 3);

  info = api.usePage('redo', seq(11));
  assert.equal(info.page, 2);
  assert.deepEqual(info.rows, ['r10']);
  assert.equal(api.get('redo'), 2);

  info = api.usePage('papers', seq(10));
  assert.equal(info.show, false);
  assert.equal(info.page, 1);
  assert.equal(api.pagerBar('papers', info), '');
});

test('the three tables page in place without resetting to page 1', function () {
  const redo = extractFn('renderRedoTab');
  const papers = extractFn('renderPapers');
  const use = extractFn('usePage');
  assert.match(use, /pageSlice\(list,listPage\[key\],10\)/);
  assert.match(redo, /usePage\('qb',list\)/);
  assert.match(redo, /pagerBar\('qb',qbPg\)/);
  assert.match(redo, /S\.redo\.slice\(\)\.reverse\(\)/);
  assert.match(redo, /usePage\('redo',hs\)/);
  assert.match(redo, /pagerBar\('redo',rdPg\)/);
  assert.match(redo, /bindPager\(\$\('t-redo'\)\)/);
  assert.match(papers, /sortedPapers\(true\)/);
  assert.match(papers, /usePage\('papers',ps\)/);
  assert.match(papers, /pagerBar\('papers',ppPg\)/);
  assert.match(papers, /bindPager\(\$\('paperList'\)\)/);
  assert.doesNotMatch(redo, /listPage\.(qb|redo)\s*=\s*1/);
  assert.doesNotMatch(papers, /listPage\.papers\s*=\s*1/);
  assert.doesNotMatch(extractFn('renderErrs'), /pagerBar|usePage/);
  assert.doesNotMatch(extractFn('renderDue'), /pagerBar|usePage/);
});
