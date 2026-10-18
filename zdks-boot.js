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
    act: { key: '', n: 0, at: 0 }
  };
  window.__zdksBoot = B;

  function log() {
    try { console.log.apply(console, ['[zdks-boot]'].concat([].slice.call(arguments))); } catch (e) { }
  }

  function hud(text, tone) {
    if (!B.hudEl) {
      var el = document.createElement('div');
      el.id = 'zdks-hud';
      el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483647;' +
        'font:11px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#fff;' +
        'background:rgba(0,0,0,.55);padding:3px 8px;border-radius:9px;' +
        'pointer-events:none;white-space:nowrap;text-shadow:0 1px 1px rgba(0,0,0,.5);' +
        'transition:background .3s;';
      (document.body || document.documentElement).appendChild(el);
      B.hudEl = el;
    }
    if (text === B.lastHud) return;
    B.lastHud = text;
    B.hudEl.textContent = text;
    B.hudEl.style.background = tone === 'win' ? 'rgba(20,120,60,.85)' : 'rgba(0,0,0,.55)';
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
      if (typeof window.__zdksStartStrategy === 'function') {
        try { window.__zdksStartStrategy(); log('策略已启动'); } catch (e) { log('策略启动失败', e && e.message); }
      }
    }
  }

  function loop() {
    if (!B.live) return;
    if (!window.cc || !cc.director || !cc.director.getScene()) {
      B.phase = 'wait-cc'; hud('自动演示 · 加载中…'); return;
    }

    var st = nav.stateSnap();

    // 正在第4关：启动/重启策略
    if (st && st.level === 4 && st.status === 1) {
      B.phase = 'play';
      strategy();
      hud('自动演示 · 第4关 · 击杀 ' + st.kill + '/' + st.total + ' · ' + Math.floor(st.t) + 's');
      return;
    }

    // 关卡加载中（status 0）：只等待，绝不能调关闭/返回，否则会把刚进的关卡退掉
    if (st && st.status === 0) {
      B.phase = 'loading';
      hud('自动演示 · 第' + (st.level || '?') + '关 加载中…');
      return;
    }

    var A = window.__zdksAuto;
    if (A && A.over) {
      if (/^WIN/.test(A.over)) {
        B.live = false;
        B.phase = 'won';
        hud('第4关 通关 ✓ ' + A.over.replace(/^WIN\s*/, ''), 'win');
        log('WIN', A.over);
        return;
      }
      if (/^LOSE/.test(A.over)) {
        B.phase = 'lost';
        var rd = nav.retryDom();
        if (rd) { hud('未通关，重新挑战…'); act('retry', rd); }
        else if (nav.closeEnd()) { hud('未通关，关闭结算…'); }
        else if (nav.backToHall()) { hud('未通关，返回大厅…'); }
        else { hud('未通关，重新进入第4关…'); }
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

    if (st && st.status === 1 && st.level !== 4) {
      B.phase = 'wrong-level'; hud('返回大厅…');
      nav.backToHall();
      return;
    }

    var agree = nav.textDom('同意');
    if (agree) { B.phase = 'agree'; hud('自动进入…'); act('agree', agree); return; }

    var l4 = nav.levelButtonDom('第4关', ['btnUnlock', 'btnStart']);
    if (l4 && l4.dom) { B.phase = 'level4'; hud('进入第4关…'); act('l4-' + l4.kind, l4.dom); return; }

    var hall = nav.textDom('让子弹射');
    if (hall) { B.phase = 'hall'; hud('进入玩法…'); act('hall', hall); return; }

    B.phase = 'wait-ui';
    hud('自动演示 · 等待界面…');
  }

  var timer = setInterval(loop, 500);
  B.stop = function () { B.live = false; clearInterval(timer); };
  log('boot ready, input mode =', B.mode);
  loop();
})();
