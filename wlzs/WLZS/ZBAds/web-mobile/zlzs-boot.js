// zlzs-boot.js — 我来掌勺演示站引导：解锁预置 / 资源根指向本站 / 20 关洗牌式无限循环
// 说明：不改游戏文件；解锁用游戏自己的存档键，资源根覆盖运行时 getter，玩法全部走游戏自身判定
// 循环规则：每一轮把池内关卡洗牌（Fisher-Yates，轮内不重复），排列历史去重（轮间不重复、刷新保持）；
// 新一轮第一关不与上一轮最后一关相同；URL 可用 ?levels=1,354,... 指定测试池
(function () {
  var CACHE = 'WoLaiZhangShaoV1_';
  try {
    localStorage.setItem(CACHE + 'unLockAllTime', String(Date.now()));
    localStorage.setItem(CACHE + 'allUnLockHour', '999999');
  } catch (e) {}

  function shuffle(a) {
    var r = a.slice();
    for (var i = r.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = r[i]; r[i] = r[j]; r[j] = t;
    }
    return r;
  }
  // 新的一轮：洗牌式——① 每轮是本池的一个排列（轮内不重复）；
  // ② 新一轮的排列不得出现在历史中（轮与轮不重复）；③ 首关不与上一轮末关相同。
  // 120 种排列用尽后清空历史从头来（实际演示跑不到）。
  function newQueue(pool, prevLast, history) {
    var n = 1;
    for (var f = 2; f <= pool.length; f++) n *= f;
    for (var tries = 0; tries < 500; tries++) {
      var q = shuffle(pool);
      if (q.length > 1 && prevLast != null && q[0] === prevLast) continue;
      if (history && history.indexOf(q.join(',')) >= 0) {
        if (history.length >= n) history.length = 0;
        continue;
      }
      return q;
    }
    // 兜底：清历史后再洗一次
    if (history) history.length = 0;
    return shuffle(pool);
  }

  function loadHistory(key) {
    try { var h = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(h) ? h : []; } catch (e) { return []; }
  }
  function saveHistory(key, h) {
    try { localStorage.setItem(key, JSON.stringify(h)); } catch (e) {}
  }

  var DEFAULT_POOL = [1, 354, 271, 347, 53, 191, 367, 324, 188, 230, 346, 270, 366, 365, 364, 363, 362, 361, 360, 359];
  var POOL = DEFAULT_POOL.slice();
  try {
    var q = new URLSearchParams(location.search).get('levels');
    if (q) {
      var t = q.split(',').map(function (x) { return parseInt(x, 10); }).filter(function (x) { return x > 0; });
      if (t.length) POOL = t;
    }
  } catch (e) {}
  var HIST_KEY = 'zlzsDemoHistory_' + POOL.join('_');

  var DEMO = {
    pool: POOL,
    queue: [],
    qi: 0,
    round: 1,
    history: loadHistory(HIST_KEY),
    histKey: HIST_KEY,
    lastFinished: null,
    state: 'boot',
    log: [],
    stopped: false,
    t0: 0,
    stop: function () { DEMO.stopped = true; },
    start: function () {
      DEMO.stopped = false;
      DEMO.state = 'boot';
      DEMO.round = 1;
      DEMO.qi = 0;
      DEMO.lastFinished = null;
      DEMO.history = loadHistory(HIST_KEY);
      DEMO.queue = newQueue(DEMO.pool, null, DEMO.history);
      DEMO.history.push(DEMO.queue.join(','));
      saveHistory(HIST_KEY, DEMO.history);
      setTimeout(loop, 400);
    },
    status: function () {
      return JSON.stringify({
        state: DEMO.state, round: DEMO.round, qi: DEMO.qi,
        queue: DEMO.queue, level: DEMO.queue[DEMO.qi] || null, seenOrders: DEMO.history.length,
        log: DEMO.log.slice(-25)
      });
    }
  };
  DEMO.queue = newQueue(DEMO.pool, null, DEMO.history);
  DEMO.history.push(DEMO.queue.join(','));
  saveHistory(HIST_KEY, DEMO.history);
  window.__zlzsDemo = DEMO;

  function mcc() {
    try { return window.__require ? window.__require('mCore').mcc : null; } catch (e) { return null; }
  }
  function cleanShells() {
    var c = cc.find('Canvas');
    if (!c) return;
    for (var i = c.children.length - 1; i >= 0; i--) {
      if (c.children[i].name === 'StalkPre_1') {
        try { c.children[i].destroy(); } catch (e) {}
      }
    }
  }
  function closeSignIn(m) {
    try {
      var ui = m.UI.GetUI(m.enum_ui.SignIn);
      if (ui) {
        if (ui.closeThis) { ui.closeThis(); return; }
        if (ui.hideBack && ui.hideAni) { ui.hideBack(); ui.hideAni(); ui.isOpen = false; return; }
      }
    } catch (e) {}
    try {
      var tips = cc.find('Canvas/tipsUIs');
      if (!tips) return;
      for (var i = 0; i < tips.children.length; i++) {
        var n = tips.children[i];
        if (n.name !== 'UI_SignIn' || !n.activeInHierarchy) continue;
        var comps = n._components || [], comp = null;
        for (var j = 0; j < comps.length; j++) if (comps[j].closeBtn) { comp = comps[j]; break; }
        if (comp && comp.closeBtn) { comp.closeBtn.emit('click'); }
        else { n.active = false; }
        return;
      }
    } catch (e2) {}
  }

  // 倒计时到点会弹 UI_AddTime（加时广告弹窗）；h5_noAds 下广告即时空放，点游戏自己的加时按钮继续
  function pressAddTime(m) {
    try {
      var ui = m.UI.GetUI(m.enum_ui.AddTime);
      if (ui) {
        var btn = ui.addTimeBtn || ui.addTime;
        if (btn && btn.node) { btn.node.emit('click'); DEMO.log.push('addtime'); return true; }
      }
    } catch (e) {}
    try {
      var found = null;
      (function walk(n) {
        if (!n || found) return;
        if (n.name === 'UI_AddTime' && n.activeInHierarchy) { found = n; return; }
        for (var i = 0; i < n.children.length; i++) walk(n.children[i]);
      })(cc.find('Canvas'));
      if (found) {
        var comps = found._components || [];
        for (var j = 0; j < comps.length; j++) {
          if (comps[j].addTimeBtn && comps[j].addTimeBtn.node) {
            comps[j].addTimeBtn.node.emit('click');
            DEMO.log.push('addtime');
            return true;
          }
        }
      }
    } catch (e2) {}
    return false;
  }

  // 预载下一关 bundle：提前把 config/index 和资源拉进 Cocos 缓存，切关时不用现下载。
  function preloadNext() {
    try {
      var m = mcc();
      if (!m || DEMO.queue.length < 2) return;
      var L = DEMO.queue[(DEMO.qi + 1) % DEMO.queue.length];
      var name = 'bundleLv_' + L;
      var url = m.res.getBundleJsonUrl() + name;
      var ver = (m.gameConfig.BundleJson || {})[name];
      cc.assetManager.loadBundle(url, { version: ver }, function (err, bundle) {
        if (err) { DEMO.log.push('preload-err ' + name + ' ' + err); return; }
        DEMO.log.push('preload ' + name);
        try { bundle.preloadDir('', cc.Asset); } catch (e) { DEMO.log.push('preload-dir-err ' + e); }
      });
    } catch (e) { DEMO.log.push('preload-ex ' + e); }
  }

  function loop() {
    if (DEMO.stopped) return;
    var m = mcc();
    if (!m || !m.gameData || !m.UI) { setTimeout(loop, 300); return; }
    closeSignIn(m);
    pressAddTime(m);

    if (DEMO.state === 'boot') {
      var lvUI = null;
      try { lvUI = m.UI.GetUI(m.enum_ui.Level); } catch (e) {}
      if (lvUI && m.gameData.selectLevel === 0) {
        DEMO.log.push('main-ready · round ' + DEMO.round + ' order ' + DEMO.queue.join(','));
        DEMO.state = 'enter';
        setTimeout(loop, 300);
      } else {
        setTimeout(loop, 500);
      }
      return;
    }

    if (DEMO.state === 'enter') {
      var lv = DEMO.queue[DEMO.qi];
      cleanShells();
      try { m.game.enterGengLevel(lv); } catch (e) { DEMO.log.push('enter-err ' + e); }
      DEMO.log.push('enter ' + lv + ' @' + Math.round((Date.now() - (DEMO.t0 || (DEMO.t0 = Date.now()))) / 1000) + 's');
      DEMO.state = 'loading';
      setTimeout(loop, 1500);
      return;
    }

    if (DEMO.state === 'loading') {
      var shell = cc.find('Canvas/StalkPre_1');
      var pre = shell && shell.getComponent('StalkPre_1');
      if (pre && m.gameData.selectLevel === DEMO.queue[DEMO.qi]) {
        DEMO.log.push('loaded ' + DEMO.queue[DEMO.qi]);
        DEMO.state = 'play';
        // 计时：游戏只在玩家第一次触摸关卡节点时才开始倒计时；自动玩不发那个事件，
        // 这里直接调游戏自己的 downStartTime()，让顶部时间正常从 04:00 开始走。
        try { if (pre.downStartTime) pre.downStartTime(); } catch (e) { DEMO.log.push('timer-err ' + e); }
        try { window.__zlzsAuto.start(); } catch (e) { DEMO.log.push('auto-err ' + e); }
        try { if (DEMO.preloadFor !== DEMO.queue[DEMO.qi]) { DEMO.preloadFor = DEMO.queue[DEMO.qi]; setTimeout(preloadNext, 1200 + Math.random() * 1200); } } catch (e) {}
      }
      setTimeout(loop, 500);
      return;
    }

    if (DEMO.state === 'play') {
      var winNow = null;
      try { winNow = m.UI.GetUI(m.enum_ui.Win); } catch (e) {}
      if (winNow) { try { window.__zlzsAuto.stop(); } catch (e) {} DEMO.state = 'win'; setTimeout(loop, 200); return; }
      var A = window.__zlzsAuto;
      if (!A) { setTimeout(loop, 500); return; }
      var st = {};
      try { st = JSON.parse(A.status()); } catch (e) {}
      if (!st.running) {
        if (st.why === 'scene-done') {
          DEMO.log.push('clear ' + DEMO.queue[DEMO.qi]);
          DEMO.state = 'win';
        } else if (st.why && st.why !== 'stopped') {
          DEMO.log.push('auto-end ' + st.why);
          DEMO.state = 'win';
        }
      }
      setTimeout(loop, 800);
      return;
    }

    if (DEMO.state === 'win') {
      var win = null;
      try { win = m.UI.GetUI(m.enum_ui.Win); } catch (e) {}
      if (!win) { setTimeout(loop, 500); return; }
      try { window.__zlzsAuto.stop(); } catch (e) {}
      DEMO.lastFinished = DEMO.queue[DEMO.qi];
      DEMO.log.push('win ' + DEMO.lastFinished + ' @' + Math.round((Date.now() - (DEMO.t0 || Date.now())) / 1000) + 's');
      DEMO.qi++;
      if (DEMO.qi >= DEMO.queue.length) {
        DEMO.round++;
        DEMO.queue = newQueue(DEMO.pool, DEMO.lastFinished, DEMO.history);
        DEMO.history.push(DEMO.queue.join(','));
        saveHistory(HIST_KEY, DEMO.history);
        DEMO.qi = 0;
        DEMO.log.push('round ' + DEMO.round + ' order ' + DEMO.queue.join(','));
      }
      DEMO.state = 'next';
      DEMO.nextAt = Date.now() + 150 + Math.random() * 350;
      setTimeout(loop, 300);
      return;
    }

    if (DEMO.state === 'next') {
      if (Date.now() < DEMO.nextAt) { setTimeout(loop, 200); return; }
      var nextLv = DEMO.queue[DEMO.qi];
      try {
        m.game.dispachEvent(m.enum_event.Remove_Level);
        m.UI.closeAllUI();
        m.game.enterGengLevel(nextLv);
        DEMO.log.push('next ' + nextLv + ' @' + Math.round((Date.now() - (DEMO.t0 || Date.now())) / 1000) + 's');
      } catch (e) { DEMO.log.push('next-err ' + e); }
      DEMO.state = 'loading';
      setTimeout(loop, 1200);
      return;
    }

    // 无限循环：不再有 done 终态
    setTimeout(loop, 1000);
  }
  setTimeout(loop, 600);
})();
