// zdks-boot.js —— 页面内自动导航 + 自动玩「让子弹射」第4关
// 流程：同意 → 大厅「让子弹射」→ 第4关「提前解锁/开始」→ 注入策略自动通关。
// 只调用游戏自己的按钮处理与移动接口；不修改游戏文件、内存或判定。
// 手机上用合成 TouchEvent，桌面用合成 MouseEvent；点不动会自动换另一种。
(function () {
  'use strict';
  if (window.__zdksBoot && window.__zdksBoot.live) return;

  var nav = window.__zdksNav;
  if (!nav) { console.error('[zdks-boot] zdks-nav.js 未加载'); return; }

  var hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  var B = {
    live: true,
    phase: 'boot',
    mode: hasTouch ? 'touch' : 'mouse',
    taps: 0,
    startedAt: Date.now(),
    hudEl: null,
    lastHud: '',
    act: { key: '', n: 0, at: 0 },
    lastKill: null,
    stallAt: 0
  };
  window.__zdksBoot = B;

  // 同一个 index.html 页面壳：?level=1 -> 第 1 关；默认第 4 关
  var LV = 4;
  try {
    var qm = (location.search || '').match(/[?&]level=(1|4)(?:&|$)/);
    if (qm) LV = +qm[1];
  } catch (e) { }

  function log() {
    try { console.log.apply(console, ['[zdks-boot]'].concat([].slice.call(arguments))); } catch (e) { }
  }

  // 观众要求去掉底部“自动演示”小条：不再往页面加 HUD，只保留 console 日志。
  function hud() {
    try {
      var old = document.getElementById('zdks-hud');
      if (old && old.parentNode) old.parentNode.removeChild(old);
    } catch (e) { }
  }

  function canvasEl() {
    return document.getElementById('GameCanvas') || (window.cc && cc.game && cc.game.canvas) || null;
  }

  function tapMouse(x, y) {
    var cv = canvasEl(); if (!cv) return false;
    var o = { clientX: x, clientY: y, screenX: x, screenY: y, bubbles: true, cancelable: true, composed: true, view: window, button: 0 };
    function ev(type, extra) {
      var e = {}; for (var k in o) e[k] = o[k]; for (var k2 in extra) e[k2] = extra[k2];
      return new MouseEvent(type, e);
    }
    cv.dispatchEvent(ev('mousedown', { buttons: 1 }));
    window.dispatchEvent(ev('mousemove', { buttons: 1 }));
    window.dispatchEvent(ev('mouseup', { buttons: 0 }));
    cv.dispatchEvent(ev('mouseup', { buttons: 0 }));
    return true;
  }

  function tapTouch(x, y) {
    var cv = canvasEl(); if (!cv) return false;
    if (typeof Touch !== 'function' || typeof TouchEvent !== 'function') return false;
    var t = new Touch({
      identifier: Date.now() % 100000, target: cv,
      clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y,
      radiusX: 2, radiusY: 2, rotationAngle: 0, force: 1
    });
    function te(type, list) {
      return new TouchEvent(type, {
        touches: list, targetTouches: list, changedTouches: [t],
        bubbles: true, cancelable: true, composed: true
      });
    }
    cv.dispatchEvent(te('touchstart', [t]));
    cv.dispatchEvent(te('touchend', []));
    return true;
  }

  function tapAt(x, y) {
    var ok = false;
    if (B.mode === 'touch') {
      try { ok = tapTouch(x, y); } catch (e) { ok = false; }
      if (!ok) { B.mode = 'mouse'; ok = tapMouse(x, y); }
    } else {
      ok = tapMouse(x, y);
    }
    return ok;
  }

  // 同一个按钮点 3 次还没推进一步：换一种输入方式再试
  function act(key, dom) {
    if (!dom) return false;
    var now = Date.now();
    if (key === B.act.key && now - B.act.at < 1500) return false;
    if (key === B.act.key) B.act.n++; else { B.act.key = key; B.act.n = 1; }
    if (B.act.n > 1 && B.act.n % 3 === 1) {
      B.mode = B.mode === 'touch' ? 'mouse' : 'touch';
      log('切换输入方式 ->', B.mode);
    }
    B.act.at = now;
    B.taps++;
    tapAt(dom.x, dom.y);
    log('tap', key, '@' + dom.x + ',' + dom.y, 'mode=' + B.mode);
    return true;
  }

  function strategy() {
    if (!window.__zdksAuto || !window.__zdksAuto.live) {
      var fn = (LV === 1 ? window.__zdksStartStrategyL1 : window.__zdksStartStrategy);
      if (typeof fn === 'function') {
        try { fn(); log('策略已启动 (L' + LV + ')'); } catch (e) { log('策略启动失败', e && e.message); }
      }
    }
  }

  function loop() {
    if (!B.live) return;
    if (!window.cc || !cc.director || !cc.director.getScene()) {
      B.phase = 'wait-cc'; hud('自动演示 · 加载中…'); return;
    }

    var st = nav.stateSnap();

    // 正在目标关：启动/重启策略
    if (st && st.level === LV && st.status === 1) {
      B.phase = 'play';
      B.loseAt = 0; B.hallAt = 0;
      strategy();
      var A = window.__zdksAuto || {};
      var fN = (A.feed && A.feed.count) || 0;
      var fA = !!(A.feed && A.feed.active);
      var microTxt = fA ? ' · 回防喂弹…' : (fN ? ' · 喂弹 ' + fN + ' 次' : '');
      hud('自动演示 · 第' + LV + '关 · 击杀 ' + st.kill + '/' + st.total + microTxt + ' · ' + Math.floor(st.t) + 's');
      if (LV === 1) {
        // 第 1 关没有通关判定：杯子漏完 + 击杀停滞 15 秒 -> 整页重载重开
        if (st.cup != null && st.cup <= 0) {
          if (B.lastKill === st.kill) {
            if (!B.stallAt) B.stallAt = Date.now();
            if (Date.now() - B.stallAt > 15000) { log('replay: cup empty, kill stalled at ' + st.kill); location.reload(); return; }
          } else { B.lastKill = st.kill; B.stallAt = 0; }
        } else { B.lastKill = st.kill; B.stallAt = 0; }
      }
      return;
    }

    // 关卡加载中（status 0）：只等待，绝不能调关闭/返回，否则会把刚进的关卡退掉
    if (st && st.status === 0) {
      B.phase = 'loading';
      hud('自动演示 · 第' + (st.level || '?') + '关 加载中…');
      return;
    }

    // 结算面板直接识别：state 可能已销毁，不能只靠策略的 over 标记
    var er = nav.endResult ? nav.endResult() : null;
    if (er === 'win') {
      B.live = false;
      B.phase = 'won';
      var lastRow = (window.__zdksAuto && window.__zdksAuto.rows && window.__zdksAuto.rows.length)
        ? window.__zdksAuto.rows[window.__zdksAuto.rows.length - 1] : {};
      var wk = lastRow.kill != null ? lastRow.kill : (st && st.kill);
      var wt = (st && st.total) || 869;
      var wA = window.__zdksAuto || {};
      var wF = (wA.feed && wA.feed.count) || 0;
      hud('第' + LV + '关 通关 ✓ 击杀 ' + (wk != null ? wk : '?') + '/' + wt + (wF ? ' · 喂弹 ' + wF + ' 次' : ''), 'win');
      log('WIN (end panel)');
      return;
    }
    if (er === 'lose') {
      B.phase = 'lost';
      var rdEnd = nav.retryDom();
      if (rdEnd) { hud('未通关，重新挑战…'); act('retry-end', rdEnd); return; }
      if (nav.closeEnd()) { hud('未通关，关闭结算…'); return; }
      if (!B.loseAt) B.loseAt = Date.now();
      if (Date.now() - B.loseAt > 6000) { log('reload after lose'); location.reload(); return; }
      hud('未通关，准备重试…');
      return;
    }

    var A = window.__zdksAuto;
    if (A && A.over) {
      if (/^WIN/.test(A.over)) {
        B.live = false;
        B.phase = 'won';
        var aF = (A.feed && A.feed.count) || 0;
        hud('第' + LV + '关 通关 ✓ ' + A.over.replace(/^WIN\s*/, '') + (aF ? ' · 喂弹 ' + aF + ' 次' : ''), 'win');
        log('WIN', A.over);
        return;
      }
      if (/^LOSE/.test(A.over)) {
        B.phase = 'lost';
        var rd = nav.retryDom();
        if (rd) { hud('未通关，重新挑战…'); act('retry', rd); }
        else if (nav.closeEnd()) { hud('未通关，关闭结算…'); }
        else if (nav.backToHall()) { hud('未通关，返回大厅…'); }
        else { hud('未通关，重新进入第' + LV + '关…'); }
        // 清掉失败标记，允许下一轮重新启动策略（旧实例已停）
        A.over = null;
        return;
      }
    }

    if (st && st.status !== 1) {
      var rd2 = nav.retryDom();
      if (rd2) { B.phase = 'end'; hud('结算面板…'); act('retry2', rd2); return; }
      if (nav.closeEnd()) { B.phase = 'close-end'; hud('关闭结算…'); return; }
      B.phase = 'wait-state'; hud('等待关卡…');
      return;
    }

    if (st && st.status === 1 && st.level !== LV) {
      B.phase = 'wrong-level'; hud('返回大厅…');
      nav.backToHall();
      return;
    }

    var agree = nav.textDom('同意');
    if (agree) { B.phase = 'agree'; hud('自动进入…'); act('agree', agree); return; }

    var lvBtn = nav.levelButtonDom(LV === 1 ? '第1关' : '第4关', ['btnUnlock', 'btnStart']);
    if (lvBtn && lvBtn.dom) { B.phase = 'level' + LV; hud('进入第' + LV + '关…'); act('lv-' + lvBtn.kind, lvBtn.dom); return; }

    // level-up reward picker (three cards): pick the middle one so the demo keeps going
    var reward = nav.rewardDom ? nav.rewardDom() : null;
    if (reward) { B.phase = 'reward'; hud('选择升级奖励…'); act('reward', reward); return; }

    var hall = nav.textDom('让子弹射');
    if (hall) {
      B.phase = 'hall'; hud('进入玩法…'); act('hall', hall);
      // 失败后有时会退回大厅但点不进玩法：连点超过 20 次且卡 15 秒就整页重载自愈
      if (B.taps > 20) {
        if (!B.hallAt) B.hallAt = Date.now();
        if (Date.now() - B.hallAt > 15000) { log('reload from hall'); location.reload(); return; }
      } else B.hallAt = 0;
      return;
    }

    B.phase = 'wait-ui';
    hud('自动演示 · 等待界面…');
  }

  var timer = setInterval(loop, 500);
  B.stop = function () { B.live = false; clearInterval(timer); };
  log('boot ready, input mode =', B.mode);
  loop();
})();
