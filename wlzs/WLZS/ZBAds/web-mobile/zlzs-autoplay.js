// zlzs-autoplay.js — 我来掌勺（WLZS/ZBAds）页内自动玩内核 v2
// 驱动：读游戏自己的"下一步提示" getTipConfig()（游戏提示功能的实现）→ 按 Type 操作
// 输入：给目标节点 emit 触摸事件（走游戏自己的 StalkItemTouch 监听、判定与 Tween 动画）
// 说明：v1 用 inputManager 命中分发，部分节点被全屏监听吞掉；v2 改为节点级注入（仍是触摸事件）
(function () {
  // 热替换：每次注入先停掉旧循环
  if (window.__zlzsAuto && typeof window.__zlzsAuto.stop === 'function') {
    try { window.__zlzsAuto.stop(); } catch (e) {}
  }

  function CC() { return window.cc; }
  var A = {
    version: 2,
    running: false,
    log: [],
    err: null,
    stats: { actions: 0, drags: 0, taps: 0, swipes: 0, holds: 0, rubs: 0, skips: 0 },
    stop: function () { A.running = false; A._why = 'stopped'; },
    status: function () {
      var p = preComp();
      return JSON.stringify({
        running: A.running, why: A._why || null, stats: A.stats,
        mini: p ? p.currentMiniLv : null, step: p ? p.currentStepNum : null,
        fin: p ? p.currentStepFinishNum : null, log: A.log.slice(-25), err: A.err
      });
    }
  };
  window.__zlzsAuto = A;

  function shell() { return CC().find('Canvas/StalkPre_1'); }
  function preComp() { var s = shell(); return s ? s.getComponent('StalkPre_1') : null; }

  function findN(root, name) {
    if (!root) return null;
    if (root.name === name) return root;
    for (var i = 0; i < root.children.length; i++) {
      var q = findN(root.children[i], name);
      if (q) return q;
    }
    return null;
  }
  function findAny(name) {
    var p = preComp();
    if (!p) return null;
    return findN(p.node, name) || findN(CC().director.getScene(), name);
  }
  function worldOf(node) { return node.parent.convertToWorldSpaceAR(node.position); }

  // ---- 遮挡感知选点（部分用完的道具透明了但仍盖在上层） ----
  function rectOf(n) {
    var bb = n.getBoundingBox ? n.getBoundingBox() : null;
    if (!bb || !n.parent) return null;
    var p = n.parent.convertToWorldSpaceAR(CC().v2(bb.x, bb.y));
    var sx = 1, sy = 1;
    try { var ws = n.getWorldScale ? n.getWorldScale() : null; if (ws) { sx = ws.x; sy = ws.y; } } catch (e) {}
    return { x: p.x, y: p.y, w: bb.width * sx, h: bb.height * sy };
  }
  function collectTouchNodes() {
    var list = [];
    var p = preComp();
    if (!p) return list;
    (function walk(n) {
      var comps = n._components || [];
      for (var i = 0; i < comps.length; i++) {
        if (comps[i].InterArr && comps[i].InterArr.length && n.activeInHierarchy) {
          var r = rectOf(n);
          if (r) list.push({ node: n, rect: r });
          break;
        }
      }
      for (var k = 0; k < n.children.length; k++) walk(n.children[k]);
    })(p.node);
    return list;
  }
  function bestWorld(node) {
    var r = rectOf(node);
    if (!r) return worldOf(node);
    var others = collectTouchNodes().filter(function (o) { return o.node !== node; });
    var cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    var cands = [
      [cx, cy],
      [cx, r.y + r.h * 0.15], [cx, r.y + r.h * 0.85],
      [r.x + r.w * 0.15, cy], [r.x + r.w * 0.85, cy],
      [r.x + r.w * 0.2, r.y + r.h * 0.2], [r.x + r.w * 0.8, r.y + r.h * 0.2],
      [r.x + r.w * 0.2, r.y + r.h * 0.8], [r.x + r.w * 0.8, r.y + r.h * 0.8],
      [cx, r.y + 10], [cx, r.y + r.h - 10]
    ];
    for (var c = 0; c < cands.length; c++) {
      var x = cands[c][0], y = cands[c][1], ok = true;
      for (var o = 0; o < others.length; o++) {
        var q = others[o].rect;
        if (x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h) { ok = false; break; }
      }
      if (ok) return { x: x, y: y };
    }
    return { x: cx, y: cy };
  }

  // ---- 节点级触摸注入（设计坐标） ----
  function touchEvt(x, y, dx, dy) {
    var e = new (CC().Event.EventTouch)([], true);
    e.touch = new (CC().Touch)(x, y);
    e.getLocation = function () { return CC().v2(x, y); };
    e.getLocationX = function () { return x; };
    e.getLocationY = function () { return y; };
    e.getDelta = function () { return CC().v2(dx || 0, dy || 0); };
    e.getDeltaX = function () { return dx || 0; };
    e.getDeltaY = function () { return dy || 0; };
    return e;
  }
  function emit(node, type, x, y, dx, dy) {
    node.emit(type, touchEvt(x, y, dx, dy));
  }

  // 拖拽：源节点 → 目标节点（12 步，节点跟着 delta 移动，结束判定用节点矩形相交）
  function drag(node, target, steps) {
    var sp = bestWorld(node), tp = worldOf(target);
    steps = steps || 12;
    emit(node, CC().Node.EventType.TOUCH_START, sp.x, sp.y, 0, 0);
    for (var i = 1; i <= steps; i++) {
      var x = sp.x + (tp.x - sp.x) * i / steps;
      var y = sp.y + (tp.y - sp.y) * i / steps;
      emit(node, CC().Node.EventType.TOUCH_MOVE, x, y, (tp.x - sp.x) / steps, (tp.y - sp.y) / steps);
    }
    emit(node, CC().Node.EventType.TOUCH_END, tp.x, tp.y, 0, 0);
    A.stats.drags++;
  }

  function tapNode(node) {
    var p = bestWorld(node);
    emit(node, CC().Node.EventType.TOUCH_START, p.x, p.y, 0, 0);
    emit(node, CC().Node.EventType.TOUCH_END, p.x, p.y, 0, 0);
    A.stats.taps++;
  }

  // 方向滑动：dx/dy 为设计坐标方向（y 向上），dist 为配置的 Value（设计像素）
  function swipe(node, dx, dy, dist) {
    var p = bestWorld(node);
    var len = Math.max(20, Number(dist) || 30) + 20;
    var N = 10;
    emit(node, CC().Node.EventType.TOUCH_START, p.x, p.y, 0, 0);
    for (var i = 1; i <= N; i++) {
      var x = p.x + dx * len * i / N;
      var y = p.y + dy * len * i / N;
      emit(node, CC().Node.EventType.TOUCH_MOVE, x, y, dx * len / N, dy * len / N);
    }
    emit(node, CC().Node.EventType.TOUCH_END, p.x + dx * len, p.y + dy * len, 0, 0);
    A.stats.swipes++;
  }

  function hold(node, seconds) {
    var p = bestWorld(node);
    emit(node, CC().Node.EventType.TOUCH_START, p.x, p.y, 0, 0);
    setTimeout(function () {
      emit(node, CC().Node.EventType.TOUCH_END, p.x, p.y, 0, 0);
    }, Math.max(200, (Number(seconds) || 2) * 1000 + 150));
    A.stats.holds++;
  }

  // TouchCuo：按住来回划动，累计时间达到 Value 秒
  function rub(node, seconds) {
    var p = bestWorld(node);
    emit(node, CC().Node.EventType.TOUCH_START, p.x, p.y, 0, 0);
    var until = Date.now() + Math.max(800, (Number(seconds) || 1) * 1000 + 400);
    var dir = 1;
    (function loop() {
      if (Date.now() > until) { emit(node, CC().Node.EventType.TOUCH_END, p.x, p.y, 0, 0); return; }
      dir = -dir;
      emit(node, CC().Node.EventType.TOUCH_MOVE, p.x + dir * 24, p.y, dir * 24, 0);
      setTimeout(loop, 40);
    })();
    A.stats.rubs++;
  }

  function perform(tip, node) {
    var t = tip.Type;
    if (t === 'TouchMove' || t === 'TouchMoveInter') {
      var names = typeof tip.Value === 'string' ? [tip.Value] : tip.Value;
      var target = null;
      for (var i = 0; i < names.length; i++) {
        var cand = findAny(names[i]);
        if (cand && cand.activeInHierarchy) { target = cand; break; }
      }
      if (!target) { A.stats.skips++; A.log.push('NO_TARGET ' + tip.node + ' -> ' + JSON.stringify(tip.Value)); return false; }
      drag(node, target);
      return true;
    }
    if (t === 'TouchMoveLeft') { swipe(node, -1, 0, tip.Value); return true; }
    if (t === 'TouchMoveRight') { swipe(node, 1, 0, tip.Value); return true; }
    if (t === 'TouchMoveTop') { swipe(node, 0, 1, tip.Value); return true; }
    if (t === 'TouchMoveDown') { swipe(node, 0, -1, tip.Value); return true; }
    if (t === 'Click' || t === 'ClickMaxNum' || t === 'ClickTimeNum') { tapNode(node); return true; }
    if (t === 'TouchLong') { hold(node, tip.Value); return true; }
    if (t === 'TouchMoveLen') { swipe(node, 1, 0, tip.Value); return true; }
    if (t === 'TouchCuo') { rub(node, tip.Value); return true; }
    A.stats.skips++;
    A.log.push('SKIP_TYPE ' + t + ' ' + tip.node);
    return false;
  }

  var lastProg = '', lastAt = 0, idle = 0, gen = 0, waitUntil = 0;
  var REPEAT = { ClickMaxNum: 1, ClickTimeNum: 1, TouchCuo: 1 };
  function tweenDur(arr, depth) {
    var t = 0;
    if (!arr || (depth || 0) > 4) return t;
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      if (it.type === 'delay' && it.value) t += Number(it.value) || 0;
      else if (it.type === 'otherTween' && it.value) {
        var p = preComp();
        var com = p && p.ctrl && p.ctrl.interConfig && p.ctrl.interConfig.ComInterArr;
        if (com) {
          for (var j = 0; j < com.length; j++) {
            if (com[j].node === it.value) { t += tweenDur(com[j].Tween, (depth || 0) + 1); break; }
          }
        }
      }
    }
    return t;
  }
  function progress() {
    var p = preComp();
    if (!p) return '';
    return p.currentMiniLv + '/' + p.currentStepNum + '/' + p.currentStepFinishNum + '/' +
      ((p.ctrl && p.ctrl.StateArr) ? p.ctrl.StateArr.join('|') : '');
  }

  function tick(g) {
    if (!A.running || g !== gen) return;
    try {
      var s = shell(), p = preComp();
      if (!s || !p) { setTimeout(function () { tick(g); }, 400); return; }
      if (p.currentMiniLv > p.ctrl.interConfig.sceneNum) { A._why = 'scene-done'; A.running = false; return; }
      var block = s.getChildByName('BlockInputEvent');
      if (block && block.active) { setTimeout(function () { tick(g); }, 120); return; }
      if (Date.now() < waitUntil) { setTimeout(function () { tick(g); }, 150); return; }
      var tip = p.getTipConfig();
      if (!tip) { idle++; if (idle > 80) { A._why = 'idle-no-tip'; A.running = false; return; } setTimeout(function () { tick(g); }, 250); return; }
      idle = 0;
      var prog = progress();
      var now = Date.now();
      var repeat = REPEAT[tip.Type];
      if (!repeat && prog === lastProg && now - lastAt < 2200) { setTimeout(function () { tick(g); }, 180); return; }
      var node = findAny(tip.node);
      if (!node) { A.log.push('NO_NODE ' + tip.node); A.stats.skips++; lastProg = prog; lastAt = now; setTimeout(function () { tick(g); }, 300); return; }
      lastProg = prog; lastAt = now;
      A.stats.actions++;
      var ok = perform(tip, node);
      if (ok) {
        A.log.push((tip.Type || '?') + ' ' + tip.node + (tip.Value && typeof tip.Value !== 'object' ? ' ' + tip.Value : ''));
        if (A.log.length > 200) A.log.splice(0, A.log.length - 200);
      }
      var dur = 0;
      try { dur = tweenDur(tip.Tween || [], 0); } catch (e) {}
      waitUntil = Date.now() + (repeat ? 280 : Math.max(600, dur * 1000 + 1000));
      setTimeout(function () { tick(g); }, 200);
    } catch (e) {
      A.err = String(e) + '\n' + (e.stack || '');
      setTimeout(function () { tick(g); }, 600);
    }
  }

  A.start = function () {
    A.running = true; A._why = null; A.err = null;
    lastProg = ''; lastAt = 0; idle = 0;
    gen++;
    tick(gen);
    return 'started';
  };

  return JSON.stringify({ ok: true, version: A.version });
})()
