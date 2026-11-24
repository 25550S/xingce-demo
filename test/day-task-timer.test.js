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
        const port = fs.readFileSync(file, 'utf8').split('\n')[0].trim();
        resolve(port);
      }
    }, 50);
    child.on('exit', (code) => {
      clearInterval(timer);
      reject(new Error('chrome exited ' + code));
    });
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

test('daily task start, pause, resume, complete, persist, and sync fields', async () => {
  const server = await serve();
  const port = server.address().port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xingce-dt-'));
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
        const tick = () => {
          if (window.XG && document.getElementById('dtCard') && document.getElementById('dtCols')) resolve(true);
          else setTimeout(tick, 50);
        };
        tick();
        setTimeout(() => resolve(false), 20000);
      })`,
      awaitPromise: true,
      returnByValue: true
    });
    assert.equal(ready.result.value, true, 'page did not become ready');

    const run = await cdp.send('Runtime.evaluate', {
      expression: `(function () {
        const X = window.XG, S = X._S(), dt = X._dt;
        const Real = Date;
        window.__shift = 0;
        function MD() {
          if (arguments.length) return new Real(...arguments);
          return new Real(Real.now() + window.__shift);
        }
        MD.now = function () { return Real.now() + window.__shift; };
        MD.parse = Real.parse; MD.UTC = Real.UTC; MD.prototype = Real.prototype;
        window.Date = MD;
        const fails = [];
        function eq(name, cond, extra) { if (!cond) fails.push(name + (extra != null ? ' ' + JSON.stringify(extra) : '')); }
        function btns(id) {
          const root = document.querySelector('[data-dtid="' + id + '"]');
          if (!root) return [];
          return [].map.call(root.querySelectorAll('.acts .btn'), function (b) { return b.textContent; });
        }
        function click(sel) {
          const n = document.querySelector(sel);
          if (!n) { fails.push('missing ' + sel); return false; }
          n.click();
          return true;
        }
        function timer(id) {
          const n = document.querySelector('[data-dtel="' + id + '"]');
          return n ? n.textContent.replace(/\\s+/g, ' ').trim() : '';
        }
        const date = dt.dates().t;
        const rounded = Math.round(dt.now());
        const os = Math.min(1740, rounded);
        const os2 = Math.min(1765, os + 25);
        const papers = JSON.stringify(S.papers);
        const ans = JSON.stringify(S.ans);
        const redo = JSON.stringify(S.redo);
        const otherAt = '2024-06-01T00:00:00.000Z';
        S.day = S.day || {};
        S.day[date] = {
          task1: dt.normTask({id:'task1', n:'言语精读', k:'hi', dur:15, pl:true, os:os, done:false, at:otherAt}),
          other: dt.normTask({id:'other', n:'复盘', k:'lt', dur:15, pl:true, os:os2, done:false, at:otherAt})
        };
        dt.view('t');
        eq('idle buttons', JSON.stringify(btns('task1')) === JSON.stringify(['开始']), btns('task1'));
        eq('other still start', JSON.stringify(btns('other')) === JSON.stringify(['开始']), btns('other'));
        eq('idle phase', dt.phase(S.day[date].task1) === 'idle');
        click('[data-dtst="task1"]');
        const started = S.day[date].task1;
        eq('running phase', dt.phase(started) === 'run', dt.phase(started));
        eq('running buttons', JSON.stringify(btns('task1')) === JSON.stringify(['暂停', '完成']), btns('task1'));
        eq('elapsed starts at 0', Math.abs(dt.elapsed(started, dt.now())) < 0.02, dt.elapsed(started, dt.now()));
        eq('timer visible', /已开始/.test(timer('task1')) && /0:00:0/.test(timer('task1')), timer('task1'));
        eq('other untouched by start', S.day[date].other.at === otherAt && dt.phase(S.day[date].other) === 'idle');
        eq('papers untouched', JSON.stringify(S.papers) === papers);
        eq('ans untouched', JSON.stringify(S.ans) === ans);
        eq('redo untouched', JSON.stringify(S.redo) === redo);
        const packVer = X._syncPack().version;
        eq('pack version stays 3', packVer === 3, packVer);
        window.__shift += 2 * 60 * 1000;
        dt.render();
        const ran = dt.elapsed(S.day[date].task1, dt.now());
        eq('two minutes counted', Math.abs(ran - 2) < 0.05, ran);
        eq('timer advanced', /0:02:0/.test(timer('task1')), timer('task1'));
        const atBeforePause = S.meta.updatedAt;
        click('[data-dtpa="task1"]');
        const paused = S.day[date].task1;
        eq('paused phase', dt.phase(paused) === 'pause' && paused.pa === true, dt.phase(paused));
        eq('paused buttons', JSON.stringify(btns('task1')) === JSON.stringify(['继续', '完成']), btns('task1'));
        eq('pause froze elapsed', Math.abs(paused.el - ran) < 0.05 && paused.rk == null, paused.el);
        eq('paused label', /已暂停/.test(timer('task1')) && /0:02:0/.test(timer('task1')), timer('task1'));
        const frozen = paused.el;
        const atAfterPause = S.meta.updatedAt;
        const daySnap = localStorage.getItem('xingce_rpg_day');
        window.__shift += 5 * 60 * 1000;
        dt.render();
        eq('pause excludes five minutes', Math.abs(dt.elapsed(S.day[date].task1, dt.now()) - frozen) < 0.001, dt.elapsed(S.day[date].task1, dt.now()));
        eq('stored el unchanged while paused', S.day[date].task1.el === frozen);
        eq('paused timer text frozen', /已暂停/.test(timer('task1')) && /0:02:0/.test(timer('task1')), timer('task1'));
        eq('tick does not rewrite sync time', S.meta.updatedAt === atAfterPause, [atBeforePause, atAfterPause, S.meta.updatedAt]);
        eq('tick does not rewrite day storage', localStorage.getItem('xingce_rpg_day') === daySnap);
        eq('other at unchanged', S.day[date].other.at === otherAt);
        click('[data-dtst="task1"]');
        eq('resume phase', dt.phase(S.day[date].task1) === 'run' && S.day[date].task1.pa === false);
        eq('resume keeps elapsed', Math.abs(dt.elapsed(S.day[date].task1, dt.now()) - frozen) < 0.05, dt.elapsed(S.day[date].task1, dt.now()));
        eq('resume buttons', JSON.stringify(btns('task1')) === JSON.stringify(['暂停', '完成']), btns('task1'));
        window.__shift += 60 * 1000;
        dt.render();
        const resumed = dt.elapsed(S.day[date].task1, dt.now());
        eq('resume adds only the new minute', Math.abs(resumed - (frozen + 1)) < 0.05, {resumed: resumed, frozen: frozen});
        eq('resume did not add the paused gap', resumed < frozen + 2, resumed);
        click('[data-dtck="task1"]');
        const done = S.day[date].task1;
        eq('completed', dt.phase(done) === 'done' && done.done === true && done.rk == null);
        eq('completed elapsed frozen', Math.abs(done.el - resumed) < 0.05, done.el);
        eq('completed buttons', JSON.stringify(btns('task1')) === JSON.stringify(['撤销']), btns('task1'));
        eq('completed has no live timer', !document.querySelector('[data-dtel="task1"]'));
        const doneEl = done.el;
        const atDone = S.meta.updatedAt;
        window.__shift += 4 * 60 * 1000;
        dt.render();
        eq('completed does not keep timing', S.day[date].task1.el === doneEl && Math.abs(dt.elapsed(S.day[date].task1, dt.now()) - doneEl) < 0.001);
        eq('completed tick does not bump sync', S.meta.updatedAt === atDone);
        const legacy = dt.normTask({id:'leg', n:'旧任务', k:'hi', dur:60, pl:true, os:os, st:rounded - 10, done:false, at:otherAt});
        eq('legacy fields', legacy.el == null && legacy.rk == null && legacy.pa === false);
        eq('legacy still running', dt.phase(legacy) === 'run');
        const legacyEl = dt.elapsed(legacy, rounded);
        eq('legacy elapsed from original start', Math.abs(legacyEl - 10) < 0.2, legacyEl);
        S.day[date].leg = legacy;
        dt.render();
        const legacyNow = dt.elapsed(S.day[date].leg, dt.now());
        eq('legacy buttons', JSON.stringify(btns('leg')) === JSON.stringify(['暂停', '完成']), btns('leg'));
        click('[data-dtpa="leg"]');
        eq('legacy pause keeps elapsed', Math.abs(S.day[date].leg.el - legacyNow) < 0.05 && S.day[date].leg.el > 1, {stored: S.day[date].leg.el, legacyNow: legacyNow});
        const cloud = X._syncPack();
        const local = JSON.parse(JSON.stringify(cloud));
        local.day[date].task1.at = '2020-01-01T00:00:00.000Z';
        local.day[date].task1.el = 0;
        local.day[date].task1.done = false;
        local.day[date].task1.pa = false;
        local.day[date].leg.pa = false;
        local.day[date].leg.el = 0;
        local.day[date].leg.rk = rounded;
        local.day[date].leg.at = '2020-01-01T00:00:00.000Z';
        const merged = X._mergePack(local, cloud);
        eq('merge keeps newer completion', merged.day[date].task1.done === true && Math.abs(merged.day[date].task1.el - doneEl) < 0.05, merged.day[date].task1);
        eq('merge keeps legacy pause', merged.day[date].leg.pa === true && merged.day[date].leg.el > 1, merged.day[date].leg);
        eq('merge version stays 3', merged.version === 3);
        eq('merge leaves papers', JSON.stringify(merged.papers) === JSON.stringify(cloud.papers));
        eq('merge leaves ans', JSON.stringify(merged.ans) === JSON.stringify(cloud.ans));
        const round = dt.norm(merged.day);
        eq('norm keeps fields', !!(round[date] && round[date].task1 && round[date].task1.done && round[date].task1.el > 2 && round[date].leg && round[date].leg.pa === true && round[date].leg.rk == null && round[date].leg.el > 1), round[date] && {task1: round[date].task1, leg: round[date].leg});
        return {fails: fails, timer: timer('task1'), buttons: btns('task1'), el: doneEl, debug: {
          date: date, os: os, keys: S.day && S.day[date] ? Object.keys(S.day[date]) : null,
          listed: dt.list(date).map(function (t) { return t.id + ':' + t.pl + ':' + t.os; }),
          cols: (document.getElementById('dtCols') || {}).innerText || '',
          tray: (document.getElementById('dtTray') || {}).innerText || '',
          head: (document.getElementById('dtHead') || {}).innerText || '',
          fold: document.getElementById('dtCard') && document.getElementById('dtCard').className
        }};
      })()`,
      returnByValue: true
    });
    if (run.exceptionDetails) {
      throw new Error(run.exceptionDetails.text + ' ' + JSON.stringify(run.exceptionDetails.exception));
    }
    assert.deepEqual(run.result.value.fails, [], JSON.stringify(run.result.value, null, 2));

    await cdp.send('Runtime.evaluate', {expression: `document.getElementById('dtCard').scrollIntoView({block:'start'})`, returnByValue: true});
    const shot = await cdp.send('Page.captureScreenshot', {format: 'png'});
    fs.mkdirSync('/tmp/xingce-shots', {recursive: true});
    fs.writeFileSync('/tmp/xingce-shots/day-task-states.png', Buffer.from(shot.data, 'base64'));

    await cdp.send('Page.reload', {ignoreCache: true});
    const ready2 = await cdp.send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        const tick = () => {
          if (window.XG && document.getElementById('dtCols') && window.XG._S().day) resolve(true);
          else setTimeout(tick, 50);
        };
        tick();
        setTimeout(() => resolve(false), 20000);
      })`,
      awaitPromise: true,
      returnByValue: true
    });
    assert.equal(ready2.result.value, true, 'reload did not become ready');
    const persisted = await cdp.send('Runtime.evaluate', {
      expression: `(function () {
        const S = window.XG._S(), dt = window.XG._dt, date = dt.dates().t;
        const t = S.day[date] && S.day[date].task1;
        const leg = S.day[date] && S.day[date].leg;
        const root = document.querySelector('[data-dtid="task1"]');
        const btns = root ? [].map.call(root.querySelectorAll('.acts .btn'), function (b) { return b.textContent; }) : [];
        const lroot = document.querySelector('[data-dtid="leg"]');
        const lbtns = lroot ? [].map.call(lroot.querySelectorAll('.acts .btn'), function (b) { return b.textContent; }) : [];
        return {
          done: !!(t && t.done && t.rk == null && t.el > 2),
          el: t && t.el,
          btns: btns,
          live: !!document.querySelector('[data-dtel="task1"]'),
          legPause: !!(leg && leg.pa && leg.rk == null && leg.el > 1),
          lbtns: lbtns,
          ver: window.XG._syncPack().version
        };
      })()`,
      returnByValue: true
    });
    const p = persisted.result.value;
    assert.equal(p.done, true, JSON.stringify(p));
    assert.ok(p.el > 2, JSON.stringify(p));
    assert.equal(p.live, false);
    assert.equal(p.legPause, true, JSON.stringify(p));
    assert.deepEqual(p.lbtns, ['继续', '完成']);
    assert.equal(p.ver, 3);
    if (p.btns.length) assert.deepEqual(p.btns, ['撤销']);

    await cdp.send('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 2, mobile: true});
    await cdp.send('Runtime.evaluate', {expression: 'window.XG._dt.render()', returnByValue: true});
    await cdp.send('Runtime.evaluate', {expression: `document.getElementById('dtCard').scrollIntoView({block:'start'})`, returnByValue: true});
    const mobile = await cdp.send('Page.captureScreenshot', {format: 'png'});
    fs.writeFileSync('/tmp/xingce-shots/day-task-mobile.png', Buffer.from(mobile.data, 'base64'));
    const mobileBtns = await cdp.send('Runtime.evaluate', {
      expression: `(function () {
        const leg = document.querySelector('[data-dtid="leg"]');
        if (!leg) return {ok:false};
        const r = leg.getBoundingClientRect();
        const buttons = [].map.call(leg.querySelectorAll('.acts .btn'), function (b) {
          const br = b.getBoundingClientRect();
          return {t: b.textContent, w: br.width, h: br.height, top: br.top, left: br.left, right: br.right};
        });
        return {ok: r.width > 200, width: r.width, buttons: buttons};
      })()`,
      returnByValue: true
    });
    const mb = mobileBtns.result.value;
    assert.equal(mb.ok, true, JSON.stringify(mb));
    assert.equal(mb.buttons.length, 2, JSON.stringify(mb));
    mb.buttons.forEach((b) => {
      assert.ok(b.w >= 36 && b.h >= 24, JSON.stringify(b));
    });
  } finally {
    try { if (cdp) cdp.ws.close(); } catch (e) {}
    try { chrome.kill('SIGKILL'); } catch (e) {}
    server.close();
    try { fs.rmSync(dir, {recursive: true, force: true, maxRetries: 5, retryDelay: 80}); } catch (e) {}
  }
});
