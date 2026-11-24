const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {spawn} = require('child_process');

const root = path.join(__dirname, '..');

function serve() {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent((req.url || '/').split('?')[0]);
    if (rel === '/') rel = '/index.html';
    const fp = path.normalize(path.join(root, rel));
    if (!fp.startsWith(root)) { res.writeHead(403); res.end(); return; }
    fs.readFile(fp, (err, buf) => {
      if (err) { res.writeHead(404); res.end('missing'); return; }
      const ext = path.extname(fp);
      const type = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.js' ? 'text/javascript' : ext === '.json' ? 'application/json' : 'application/octet-stream';
      res.writeHead(200, {'content-type': type, 'cache-control': 'no-store'});
      res.end(buf);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function waitPort(dir, child) {
  return new Promise((resolve, reject) => {
    const file = path.join(dir, 'DevToolsActivePort');
    const timer = setInterval(() => {
      if (fs.existsSync(file)) {
        clearInterval(timer);
        resolve(fs.readFileSync(file, 'utf8').split('\n')[0].trim());
      }
    }, 50);
    child.on('exit', (code) => { clearInterval(timer); reject(new Error('chrome exited ' + code)); });
    setTimeout(() => { clearInterval(timer); reject(new Error('chrome port timeout')); }, 15000);
  });
}

async function cdpConnect(port) {
  const res = await fetch('http://127.0.0.1:' + port + '/json/list');
  const list = await res.json();
  const page = list.find((t) => t.type === 'page') || list[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else p.resolve(msg.result);
    }
  });
  function send(method, params) {
    const msgId = ++id;
    return new Promise((resolve, reject) => {
      pending.set(msgId, {resolve, reject});
      ws.send(JSON.stringify({id: msgId, method, params: params || {}}));
    });
  }
  return {ws, send};
}

test('three tables page by 10 and keep the page after 查看, 删除, and 详情', async () => {
  const server = await serve();
  const port = server.address().port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xingce-pg-'));
  const chrome = spawn('google-chrome', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--user-data-dir=' + dir, '--remote-debugging-port=0', 'about:blank'
  ], {stdio: 'ignore'});
  let cdp;
  try {
    const dbg = await waitPort(dir, chrome);
    cdp = await cdpConnect(dbg);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {width: 1280, height: 900, deviceScaleFactor: 1, mobile: false});
    await cdp.send('Page.navigate', {url: 'http://127.0.0.1:' + port + '/index.html'});
    const ready = await cdp.send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const start = Date.now();
        const tick = () => {
          const msg = (document.getElementById('q_msg') || {}).textContent || '';
          if (window.XG && /已自动加载|没加载成功|请用下方按钮导入/.test(msg)) setTimeout(() => resolve(msg), 250);
          else if (Date.now() - start > 20000) resolve('timeout:' + msg);
          else setTimeout(tick, 80);
        };
        tick();
      })`,
      awaitPromise: true,
      returnByValue: true
    });
    assert.match(String(ready.result.value), /已自动加载/, JSON.stringify(ready.result.value));

    const run = await cdp.send('Runtime.evaluate', {
      expression: `(async function () {
        const fails = [];
        function eq(name, cond, extra) { if (!cond) fails.push(name + (extra != null ? ' ' + JSON.stringify(extra) : '')); }
        window.confirm = function () { return true; };
        const S = window.XG._S();
        function bar(root) {
          const el = root.querySelector('.pgbar');
          if (!el) return null;
          const t = el.innerText.replace(/\\s+/g, ' ').trim();
          const m = t.match(/第\\s*(\\d+)\\s*\\/\\s*(\\d+)\\s*页/);
          const prev = el.querySelector('[data-dir="-1"]');
          const next = el.querySelector('[data-dir="1"]');
          return {t: t, page: m ? +m[1] : 0, pages: m ? +m[2] : 0, prevDis: !!(prev && prev.disabled), nextDis: !!(next && next.disabled), prev: prev, next: next,
            prevCls: prev ? prev.className : '', nextCls: next ? next.className : ''};
        }
        function col(root, idx) {
          return [].map.call(root.querySelectorAll('tbody tr'), function (tr) { return tr.cells[idx].innerText.replace(/\\s+/g, ' ').trim(); });
        }
        function toStart(root) {
          let g = 0;
          while (g++ < 30) { const b = bar(root); if (!b || b.prevDis) return; b.prev.click(); }
        }
        function toEnd(root) {
          let g = 0;
          while (g++ < 30) { const b = bar(root); if (!b || b.nextDis) return; b.next.click(); }
        }
        function allPages(root, idx) {
          toStart(root);
          const out = [];
          let g = 0;
          while (g++ < 30) {
            out.push(col(root, idx));
            const b = bar(root);
            if (!b || b.nextDis) break;
            b.next.click();
          }
          toStart(root);
          return out;
        }
        function header(root) {
          const th = root.querySelector('thead');
          return th ? th.innerText.replace(/\\s+/g, ' ').trim() : '';
        }
        const mods = {};
        S.papers = [];
        for (let i = 1; i <= 25; i++) {
          S.papers.push({id: 'pg' + i, name: '分页卷' + i, date: '2024-03-' + String(i).padStart(2, '0'), note: '', file: '', mods: mods});
        }
        S.redo = [];
        for (let i = 0; i < 25; i++) {
          S.redo.push({id: 'rd' + i, at: new Date(Date.UTC(2024, 0, i + 1)).toISOString(), label: '记录' + i, n: 1, graded: 1, cor: 1, time: 1500, items: []});
        }
        window.XG.go('papers');
        const paper = document.getElementById('paperList');
        let b = bar(paper);
        eq('papers bar page 1', b && b.page === 1 && b.pages === 3 && b.prevDis && !b.nextDis, b && b.t);
        eq('papers bar text', b && b.t === '上一页 · 第 1 / 3 页 · 下一页', b && b.t);
        eq('papers button class', b && b.nextCls === 'btn sec sm');
        eq('papers header', header(paper).indexOf('日期 套卷') === 0 && /总分/.test(header(paper)), header(paper));
        eq('papers page 1 count', col(paper, 1).length === 10);
        eq('papers newest first', col(paper, 1)[0] === '分页卷25' && col(paper, 0)[0] === '2024-03-25', col(paper, 1).concat(col(paper, 0)));
        b.next.click();
        b = bar(paper);
        const page2first = col(paper, 1)[0];
        eq('papers page 2', b.page === 2 && b.pages === 3 && !b.prevDis && !b.nextDis && col(paper, 1).length === 10 && page2first === '分页卷15', {t: b.t, name: page2first});
        paper.querySelector('[data-det]').click();
        b = bar(paper);
        eq('详情 stays on page 2', b.page === 2 && col(paper, 1)[0] === page2first && paper.querySelector('tr.sel td b').textContent === page2first, b.t);
        eq('详情 card open', document.getElementById('detailCard').style.display !== 'none' && /分页卷15/.test(document.getElementById('detailCard').innerText));
        window.XG.go('papers');
        b = bar(paper);
        eq('rerender keeps papers page', b.page === 2 && col(paper, 1)[0] === page2first, b.t);
        b.next.click();
        eq('papers last page', bar(paper).page === 3 && bar(paper).nextDis && col(paper, 1).join(',') === '分页卷5,分页卷4,分页卷3,分页卷2,分页卷1', col(paper, 1));
        bar(paper).next.click();
        eq('papers next does not wrap', bar(paper).page === 3 && col(paper, 1)[0] === '分页卷5');
        for (let n = 0; n < 5; n++) paper.querySelector('[data-delp]').click();
        b = bar(paper);
        eq('delete clamps to last existing page', b.page === 2 && b.pages === 2 && b.nextDis && col(paper, 1)[0] === '分页卷15' && col(paper, 1).length === 10, {t: b.t, names: col(paper, 1)});
        S.papers = S.papers.slice(0, 10);
        window.XG.go('papers');
        eq('papers bar hidden at 10', !paper.querySelector('.pgbar') && col(paper, 1).length === 10, col(paper, 1).length);
        S.papers = S.papers.slice(0, 8);
        window.XG.go('papers');
        eq('papers bar hidden under 10', !paper.querySelector('.pgbar') && col(paper, 1).length === 8);

        window.XG.go('redo');
        const hist = document.getElementById('r_hist');
        b = bar(hist);
        eq('redo newest first', b && b.page === 1 && b.pages === 3 && b.prevDis && col(hist, 1)[0] === '记录24' && col(hist, 1).length === 10, b && {t: b.t, names: col(hist, 1)});
        eq('redo header', header(hist) === '时间 范围 题数 正确率 用时', header(hist));
        eq('redo bar text', b.t === '上一页 · 第 1 / 3 页 · 下一页', b.t);
        b.next.click();
        const redoFirst = col(hist, 1)[0];
        eq('redo page 2', bar(hist).page === 2 && redoFirst === '记录14' && col(hist, 1).length === 10, col(hist, 1));
        hist.querySelector('[data-att]').click();
        eq('查看 opens result', document.getElementById('practice').style.display === 'block' && /记录14/.test(document.getElementById('practice').innerText));
        document.getElementById('rs_close').click();
        b = bar(hist);
        eq('查看 returns to same page', document.getElementById('practice').style.display === 'none' && b.page === 2 && col(hist, 1)[0] === '记录14', b && b.t);
        b.next.click();
        eq('redo last page', bar(hist).page === 3 && bar(hist).nextDis && col(hist, 1).join(',') === '记录4,记录3,记录2,记录1,记录0', col(hist, 1));
        for (let n = 0; n < 5; n++) hist.querySelector('[data-attdel]').click();
        b = bar(hist);
        eq('redo delete clamps', b.page === 2 && b.pages === 2 && b.nextDis && col(hist, 1)[0] === '记录14', {t: b.t, names: col(hist, 1)});
        S.redo = S.redo.slice(-10);
        window.XG.go('redo');
        eq('redo bar hidden at 10', !hist.querySelector('.pgbar') && col(hist, 1).length === 10);
        S.redo = [];
        window.XG.go('redo');
        eq('redo empty has no bar', !hist.querySelector('.pgbar') && /还没有重做记录/.test(hist.innerText));

        const qs = document.getElementById('q_status');
        eq('qb header', header(qs).indexOf('套卷 分组 题目 含图 答案') === 0, header(qs));
        const before = allPages(qs, 0);
        const flat = before.reduce(function (a, p) { return a.concat(p); }, []);
        eq('qb pages of 10', before.length > 1 && before.slice(0, -1).every(function (p) { return p.length === 10; }) && before[before.length - 1].length > 0 && before[before.length - 1].length <= 10, before.map(function (p) { return p.length; }));
        eq('qb first page disabled prev', bar(qs).page === 1 && bar(qs).prevDis);
        function nat(a, b) { return String(a).localeCompare(String(b), 'zh-CN', {numeric: true}); }
        const stems = ['zzz分页', '香分页', '龠分页', '\uffff分页'];
        let stem = '';
        for (let s = 0; s < stems.length && !stem; s++) {
          if (flat.every(function (n) { return nat(stems[s] + '1', n) > 0; })) stem = stems[s];
        }
        eq('found a name that sorts last', !!stem, flat.slice(-3));
        const need = (10 - (flat.length % 10)) % 10 + 1;
        if (stem) {
          for (let i = 1; i <= need; i++) window.XG._QB()[stem + i] = {name: stem + i, count: 3, figs: 0, file: '测', g: '测'};
        }
        window.XG.go('redo');
        const added = allPages(qs, 0);
        const addedFlat = added.reduce(function (a, p) { return a.concat(p); }, []);
        const tailName = stem + need;
        eq('qb tail is the new rows', !!stem && added[added.length - 1].length === 1 && addedFlat[addedFlat.length - 1] === tailName, added[added.length - 1]);
        eq('qb order preserved ahead of the tail', !!stem && addedFlat.slice(0, flat.length).join('|') === flat.join('|'));
        toEnd(qs);
        const lastBar = bar(qs);
        eq('qb on last page before delete', !!stem && lastBar && lastBar.page === added.length && lastBar.nextDis, lastBar && lastBar.t);
        const delBtn = stem ? [].find.call(qs.querySelectorAll('[data-qdel]'), function (btn) { return btn.getAttribute('data-qdel') === tailName; }) : null;
        eq('qb delete button on last page', !!delBtn);
        if (delBtn) delBtn.click();
        if (stem) {
          for (let i = 0; i < 40 && window.XG._QB()[tailName]; i++) await new Promise(function (r) { setTimeout(r, 50); });
          for (let i = 0; i < 40 && qs.innerText.indexOf(tailName) >= 0; i++) await new Promise(function (r) { setTimeout(r, 50); });
        }
        b = bar(qs);
        const after = col(qs, 0);
        eq('qb delete clamps off the empty page', !!stem && b && b.page === added.length - 1 && b.nextDis && after.length === 10 && after.indexOf(tailName) < 0, {t: b && b.t, after: after, pages: added.length});
        eq('marked list not paginated', !document.querySelector('#r_marked .pgbar'));
        eq('due list not paginated', !document.querySelector('#dueCard .pgbar'));
        eq('err list not paginated', !document.querySelector('#e_fileList .pgbar'));
        eq('sync version untouched', window.XG._syncPack().version === 3);
        return {fails: fails, qbPages: before.map(function (p) { return p.length; }), addedLast: added[added.length - 1]};
      })()`,
      awaitPromise: true,
      returnByValue: true
    });
    if (run.exceptionDetails) {
      throw new Error(run.exceptionDetails.text + ' ' + JSON.stringify(run.exceptionDetails.exception || run.exceptionDetails));
    }
    assert.deepEqual(run.result.value.fails, [], JSON.stringify(run.result.value, null, 2));
  } finally {
    try { if (cdp) cdp.ws.close(); } catch (e) {}
    try { chrome.kill('SIGKILL'); } catch (e) {}
    server.close();
    try { fs.rmSync(dir, {recursive: true, force: true, maxRetries: 5, retryDelay: 80}); } catch (e) {}
  }
});
