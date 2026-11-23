const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const qb = JSON.parse(fs.readFileSync(path.join(root, 'tiku/qb.json'), 'utf8'));

const NAMES = [
  "花生省考一期套题_第01套",
  "花生省考一期套题_第02套",
  "花生省考一期套题_第03套",
  "花生省考一期套题_第04套",
  "花生省考一期套题_第05套",
  "花生省考一期套题_第06套",
  "花生省考一期套题_第07套",
  "花生省考一期套题_第08套",
  "花生省考一期套题_第09套",
  "花生省考一期套题_第10套",
  "花生省考一期套题_第11套",
  "花生省考一期套题_第12套"
];
const OLD = ["套题1","套题2","套题3","套题4","套题5","套题6","套题7","套题8","套题9","套题10","套题11","套题12","26国考","25国考","24国考","23国考","22国考"];
const OLD_HASH = {"套题1":{"paper":"8da16263ce8d3b3ff7d4e0fb9586f81265a7bcfc15f6487f78dfd22ac66085b8","ans":"4587df8cb87063ddc72b2830a5340bcbf3ddc362dbadb71203fc60bb2c6b0f08","c":130},"套题2":{"paper":"1e9d967cf34c024029a60182e18e62710858b0277ed06a4ec7646c0d5e9dc116","ans":"799e6e6f0b2213287696e23b39cc3ebbe03bee418c07db40e10b83513329a4e8","c":130},"套题3":{"paper":"4b463e7952813bf63ec6e8e41cf580571ddca27d2afe1a78bd7ad795efcfef60","ans":"fa5b36ef19e03d8e25c78db510656a756f8fb2bfa3be54e3a780ef9aa0d6a809","c":130},"套题4":{"paper":"abd8f5b08413d20f0684cabd5f6c3f65e65a359a97523cd24459290e5f1ff0c1","ans":"0c9de86a1b94fa3acf15f316cf5a5b94c59ff3e568b0042570b5695b79cd4b68","c":130},"套题5":{"paper":"70361f2a5c8ce1fdbea59021a5a64b2b19a68285c31bbe1d4c45e83fb712ae37","ans":"962f3b575e24bf87c302f132c99553576f3bcdb74d4aa354a90bc0dde4bbd3dc","c":130},"套题6":{"paper":"8ab6b3e69e8b2dcdf43d3b96e5b8f66390b4f799ba741b959281fccb0a9b43ea","ans":"a3ce471c9491bd779a53235a061bdcf66d7ba50dd9b301f12eef3e5728af54d1","c":130},"套题7":{"paper":"2dcefec5a80e7f707937923151ec2ef8bd8c199b01b59ec1fa5435379c133c69","ans":"c7d360fd6173a506fe0a4558c4dfbe703c22b838360e98019eb238d42ec6a8b2","c":130},"套题8":{"paper":"1b6de5e4155cac9f5af6f72cb561000b8efa6cb0e0d4b0cecab21317a4a5b2df","ans":"24d3ec6335352fdc654b6857380482be8382a121dedf3eddd33eb318737863dd","c":130},"套题9":{"paper":"1e10273ff4cbef4806e393179f8ad5b20d2d9c42bf0fe2b0645c7cfb15d9458f","ans":"b75365543b5a742263274334f5530133c69990ff7d02b237cb8afe7c86336e3c","c":130},"套题10":{"paper":"308c86e9feecee88913f68fa96ffec18e4a4751730d1077951e36efd68c162c0","ans":"efb335261a3f4ac959903e0ab66ac6f8804feb23359c7fead95adb8661a4f3cd","c":130},"套题11":{"paper":"e590f2efcd85ae1e55c96dbfb057dde601b1d052eb013e2e604e6c27758a3f09","ans":"34bbc6b660da11f8a4fe6547606cad0586bf617875a79062340723aa18923127","c":130},"套题12":{"paper":"345d8b16c63f926af4e659721f8fa70f12a7c63a6ac2e61d7e541c16b23dacc3","ans":"5072ffdcd2c2f7e826d958f4feae343b97353a3b80238295c67e8610893f7be8","c":130},"26国考":{"paper":"ebc7aedd443519993cf8089a4321a5484dc7ab6d83373058f82e6ff94bd95840","ans":"001d9c5f875fab579e95443bb0f696bdfe50567c1dc3beb0624570607f0ebb87","c":130},"25国考":{"paper":"4e18a47bb88f1cadb1d732129970b2dd33e96003e402490f00b45d993f255d46","ans":"001d9c5f875fab579e95443bb0f696bdfe50567c1dc3beb0624570607f0ebb87","c":130},"24国考":{"paper":"136d85e82e95636486910000d893d32a839ac732db43396c1a4cc894c79f0cb2","ans":"001d9c5f875fab579e95443bb0f696bdfe50567c1dc3beb0624570607f0ebb87","c":130},"23国考":{"paper":"c79876c11e9a77f689588e0fc5fb8f5999d96daff0a32cd16a17db03e5d4292b","ans":"001d9c5f875fab579e95443bb0f696bdfe50567c1dc3beb0624570607f0ebb87","c":130},"22国考":{"paper":"44a26afa5fea51261fd1b30e8b1ff322a5a7efdf8324a9d8fabd873258a15aa1","ans":"001d9c5f875fab579e95443bb0f696bdfe50567c1dc3beb0624570607f0ebb87","c":130}};
const OFFICIAL = {
  "花生省考一期套题_第01套": "BDCBBDCDDADDCACBDADDCAABADADCDDDDBACDADACCAACDCCABADBAADBDACBAABCCBDADADBBCBBCCCABDBCCBCABCBDBDBADBBCCDACCBCADDCABBABCCD",
  "花生省考一期套题_第02套": "BCAABBCCACBCCCBCABADDBCCDCABBCBDAAADDBABACDDDDDCBCBAABAADCBCCBDBDCAADAADACDBDBDDADCDCDBACDBDDBBCADACDBCAAADBBBCBDADCBABD",
  "花生省考一期套题_第03套": "DAADCDCDABBCDCDCBAADDBBCBBCCBCDBDACBDBDCACDCDBBADBCACADBDBCACCDDBCADCACAAACDADCBBDCBCDBBDADACCDBDADAABDDAADCCBCAAACCCBDD",
  "花生省考一期套题_第04套": "ADDBCBDCACCDDDBABDDCBBDCACABADACBBDDACDBDCBBDBDCAABACBCCDDDABBAACADBCBCDCADDCCBBBDCAAABADBBCDABBDCCCCABDBBDAACCCAABCBCDA",
  "花生省考一期套题_第05套": "CBADCDBACACBDABDCCBBABDABABCCDDBAABCCDCDDCCBCADAAABDBCDDCABADCBCBBACADBDCBDDBBACAADBCAABDBCCBCCDAADBACBDABAABDCBBDDABCDA",
  "花生省考一期套题_第06套": "ADCBADDBCDBDACAABCDCBDADDADCBBADCBBBDBACBADCDCAACACCDDBBBDCCBCAAACBAADBCCBBBACABDCBBCBBDCBADCBDCABDBBACDDDCBACCDABCABDAA",
  "花生省考一期套题_第07套": "CDBCADACBBCDCCADCACDCCABAADBCDBCDBDDCDABCADBAAACAACCDCBADCCAABCBCDBCDDADBDBBCBBCCDCCADBBABDBAACCDCDBBCBBDADBCDCDACDCBACD",
  "花生省考一期套题_第08套": "ACDBABDCDCBACABDDBACDAADBBABACDCDBCCCDAABDBACDADCDBADDBDACBCBCDCBABBDDABCBCBABCBCDDDDADDCDDBCBBDBDBCBAABCCBBACDCDBAACDCC",
  "花生省考一期套题_第09套": "CDAACADABBCBDABDABBDCDCBCCBBCABBDABABDDBCADACDADBBBACBDADCBDDCDACABBBCDBBBCBBBBCCBABCADABCDCBBCCCAABCBADCBACBCCDBABCDABB",
  "花生省考一期套题_第10套": "CDBCDCADBCBACDBBCCBBBCDDABDBDCCACACDCABBDDDABAACDDACABACDAABBACDBCABDCBCCADBCCBABBAADCBDBABBCCBDBBCABDACDCBACDBDBBCBCADB",
  "花生省考一期套题_第11套": "DCBDDABACAABDBDBABCADACABACBCDCADACACBADABCBBDDDAADDDABBDABDABCBCCDCCDCCCACBDADABDDCDDBDACDCBCBABACDAABBDCBDACCBCADCBBDC",
  "花生省考一期套题_第12套": "DACAACBADABADBDBAABDCDABADBACDBBCBBADDDBCDCDBBDCDBDCCCBDADCCBDACABDCABACCBDADBABBBAADBBBAADBDDCDBADBBABACCABDCBCACDABCBD"
};
const LAYOUT = {
  zz: {t: 15, s: 0.8, r: '1-15'},
  cs: {t: 10, s: 0.6, r: '16-25'},
  yy: {t: 30, s: 0.8, r: '26-55'},
  sl: {t: 15, s: 0.7, r: '56-70'},
  lj: {t: 30, s: 0.8, r: '71-100'},
  zl: {t: 20, s: 0.8, r: '101-120'}
};

function sha(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

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

function embAns() {
  const i = html.indexOf('var EMB_ANS=');
  const j = html.indexOf(';</script>', i);
  return JSON.parse(html.slice(i + 'var EMB_ANS='.length, j));
}

function qbVer() {
  const m = html.match(/var QB_VER=(\d+);/);
  return m ? +m[1] : 0;
}

function loadUnpack() {
  return new Function(extractFn('unpackQb') + '\nreturn unpackQb;')();
}

function loadAnsOf(S, EMB_ANS) {
  return new Function('S', 'EMB_ANS', extractFn('ansOf') + '\nreturn ansOf;')(S, EMB_ANS);
}

function loadApply(S) {
  const save = function () {};
  let QUIET = false;
  return new Function('S', 'QUIET', 'save', extractFn('applyBuiltinAns') + '\nreturn applyBuiltinAns;')(S, QUIET, save);
}

function byName(unpacked) {
  const m = {};
  unpacked.papers.forEach(function (p) { m[p.name] = p; });
  return m;
}

test('question bank version is bumped', function () {
  assert.equal(qb.v, 7);
  assert.equal(qbVer(), 7);
  assert.ok(qb.v > 6 && qbVer() > 6);
});

test('loads all 12 huasheng papers at 120 questions', function () {
  const unpackQb = loadUnpack();
  const papers = byName(unpackQb(qb));
  assert.equal(NAMES.length, 12);
  NAMES.forEach(function (name) {
    const p = papers[name];
    assert.ok(p, 'missing ' + name);
    assert.equal(p.count, 120, name);
    assert.equal(Object.keys(p.qs).length, 120, name);
    assert.equal(p.builtin, true);
    assert.equal(p.g, '花生省考一期');
    assert.deepEqual(p.layout, LAYOUT);
    assert.equal(p.mats.length, 4, name + ' materials');
    let linked = 0;
    for (let n = 1; n <= 120; n++) {
      const q = p.qs[n];
      assert.ok(q, name + ' q' + n);
      assert.equal(typeof q.s, 'string');
      assert.equal(q.o.length, 4);
      if (n >= 101) {
        assert.ok(q.mi >= 0 && q.mi < p.mats.length, name + ' material ' + n);
        assert.ok(p.mats[q.mi] && p.mats[q.mi].length > 0);
        linked++;
      } else {
        assert.equal(q.mi, -1, name + ' q' + n);
      }
    }
    assert.equal(linked, 20);
    assert.ok(p.mats[0].indexOf('【资料】') < 0);
  });
  const p1 = papers['花生省考一期套题_第01套'];
  assert.match(p1.qs[1].s, /网络生态治理/);
  assert.match(p1.qs[71].f, /本题含图/);
  assert.match(p1.mats[0], /根据所给材料/);
});

test('every question 1-120 has an official A-D answer', function () {
  const EMB = embAns();
  const unpackQb = loadUnpack();
  const papers = byName(unpackQb(qb));
  const S = {ans: {}};
  loadApply(S)(qb.ans, true);
  const fromStore = loadAnsOf(S, {});
  const fromEmb = loadAnsOf({ans: {}}, EMB);
  NAMES.forEach(function (name) {
    const official = OFFICIAL[name];
    assert.match(official, /^[A-D]{120}$/);
    assert.equal(qb.ans[name], official, name + ' qb.ans');
    assert.equal(EMB[name], official, name + ' EMB_ANS');
    assert.equal(papers[name].count, 120);
    for (let n = 1; n <= 120; n++) {
      const letter = official.charAt(n - 1);
      assert.match(letter, /^[A-D]$/);
      assert.equal(fromStore(name, n), letter, name + ' stored ' + n);
      assert.equal(fromEmb(name, n), letter, name + ' embedded ' + n);
    }
  });
});

test('new names do not overwrite 套题1-12 or 国考 papers', function () {
  const names = Object.keys(qb.papers);
  OLD.forEach(function (name) {
    assert.ok(names.indexOf(name) >= 0, name);
    assert.equal(qb.papers[name].c, OLD_HASH[name].c, name);
    assert.equal(sha(JSON.stringify(qb.papers[name])), OLD_HASH[name].paper, name);
    assert.equal(sha(qb.ans[name]), OLD_HASH[name].ans, name);
  });
  NAMES.forEach(function (name) {
    assert.equal(OLD.indexOf(name), -1);
    assert.ok(!/^套题\d+$/.test(name));
    assert.notEqual(qb.papers[name].g, '国考真题');
  });
  for (let i = 1; i <= 12; i++) {
    assert.equal(qb.papers['套题' + i].c, 130);
    assert.ok(!qb.papers['套题' + i].g);
  }
  assert.equal(names.length, OLD.length + NAMES.length);
  const EMB = embAns();
  ['套题1','套题2','套题3','套题4','套题5','套题6','套题7','套题8','套题9','套题10','套题11','套题12'].forEach(function (name) {
    assert.equal(EMB[name], qb.ans[name]);
  });
  assert.equal(EMB['套题1'].charAt(0), 'D');
});
