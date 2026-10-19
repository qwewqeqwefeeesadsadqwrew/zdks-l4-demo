// zlzs-boot.js — 我来掌勺演示站引导：解锁预置 / 资源根指向本站 / 前 5 关自动连播
// 说明：不改游戏文件；解锁用游戏自己的存档键，资源根覆盖运行时 getter，玩法全部走游戏自身判定
(function () {
  var CACHE = 'WoLaiZhangShaoV1_';
  try {
    localStorage.setItem(CACHE + 'unLockAllTime', String(Date.now()));
    localStorage.setItem(CACHE + 'allUnLockHour', '999999');
  } catch (e) {}

  var DEMO = {
    levels: [1, 354, 271, 347, 53],
    idx: 0,
    state: 'boot',
    log: [],
    stopped: false,
    stop: function () { DEMO.stopped = true; },
    start: function () { DEMO.stopped = false; DEMO.state = 'boot'; DEMO.idx = 0; setTimeout(loop, 400); },
    status: function () {
      return JSON.stringify({ state: DEMO.state, idx: DEMO.idx, level: DEMO.levels[DEMO.idx], log: DEMO.log.slice(-20) });
    }
  };
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
      if (ui && ui.closeThis) ui.closeThis();
    } catch (e) {}
  }

  function loop() {
    if (DEMO.stopped) return;
    var m = mcc();
    if (!m || !m.gameData || !m.UI) { setTimeout(loop, 300); return; }

    if (DEMO.state === 'boot') {
      closeSignIn(m);
      var lvUI = null;
      try { lvUI = m.UI.GetUI(m.enum_ui.Level); } catch (e) {}
      if (lvUI && m.gameData.selectLevel === 0) {
        DEMO.log.push('main-ready');
        DEMO.state = 'enter';
        setTimeout(loop, 300);
      } else {
        setTimeout(loop, 500);
      }
      return;
    }

    if (DEMO.state === 'enter') {
      var lv = DEMO.levels[DEMO.idx];
      cleanShells();
      try { m.game.enterGengLevel(lv); } catch (e) { DEMO.log.push('enter-err ' + e); }
      DEMO.log.push('enter ' + lv);
      DEMO.state = 'loading';
      setTimeout(loop, 1500);
      return;
    }

    if (DEMO.state === 'loading') {
      var shell = cc.find('Canvas/StalkPre_1');
      var pre = shell && shell.getComponent('StalkPre_1');
      if (pre && m.gameData.selectLevel === DEMO.levels[DEMO.idx]) {
        DEMO.log.push('loaded ' + DEMO.levels[DEMO.idx]);
        DEMO.state = 'play';
        try { window.__zlzsAuto.start(); } catch (e) { DEMO.log.push('auto-err ' + e); }
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
          DEMO.log.push('clear ' + DEMO.levels[DEMO.idx]);
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
      DEMO.log.push('win ' + DEMO.levels[DEMO.idx]);
      if (DEMO.idx >= DEMO.levels.length - 1) {
        DEMO.state = 'done';
        DEMO.log.push('all-done');
        return;
      }
      DEMO.idx++;
      DEMO.state = 'loading';
      try { win.nextBtnClick(); } catch (e) { DEMO.log.push('next-err ' + e); DEMO.state = 'enter'; }
      setTimeout(loop, 1600);
      return;
    }

    if (DEMO.state === 'done') {
      setTimeout(loop, 1000);
    }
  }
  setTimeout(loop, 600);
})();
