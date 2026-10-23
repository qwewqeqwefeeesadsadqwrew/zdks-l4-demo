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
    gestures: [],
    stop: function () { A.running = false; A._why = 'stopped'; },
    status: function () {
      var p = preComp();
      return JSON.stringify({
        running: A.running, why: A._why || null, stats: A.stats,
        mini: p ? p.currentMiniLv : null, step: p ? p.currentStepNum : null,
        fin: p ? p.currentStepFinishNum : null, lastGesture: A.lastGesture || null,
        intro: pendingIntro ? { leftMs: Math.max(0, (introFrom ? introFrom + introMs : Date.now() + introMs) - Date.now()), totalMs: Math.round(introMs) } : null,
        gestures: A.gestures.slice(-8),
        log: A.log.slice(-25), err: A.err
      });
    }
  };
  window.__zlzsAuto = A;
  function recordGesture(g) {
    g.at = Date.now(); // 出手时刻（验收用：算转场后过了多久才动手）
    A.lastGesture = g;
    A.gestures.push(g);
    if (A.gestures.length > 12) A.gestures.shift();
  }

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
    var first = null;
    (function walk(n) {
      if (!n || first && first.activeInHierarchy) return;
      if (n.name === name) {
        if (n.activeInHierarchy) { first = n; return; }
        if (!first) first = n;
      }
      for (var i = 0; i < n.children.length; i++) walk(n.children[i]);
    })(p.node);
    if (first && first.activeInHierarchy) return first;
    return first || findN(CC().director.getScene(), name);
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
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randPointInRect(r, inset) {
    if (!r) return null;
    var ix = Math.max(2, r.w * inset), iy = Math.max(2, r.h * inset);
    var x0 = r.x + ix, x1 = r.x + r.w - ix, y0 = r.y + iy, y1 = r.y + r.h - iy;
    return { x: rand(Math.min(x0, x1), Math.max(x0, x1)), y: rand(Math.min(y0, y1), Math.max(y0, y1)) };
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
      [r.x + r.w * 0.2, r.y + r.h * 0.8], [r.x + r.w * 0.8, r.y + r.h * 0.8]
    ];
    // 再撒 24 个连续随机点：同一道具每次按下的位置都不同
    for (var ri = 0; ri < 24; ri++) {
      var rp = randPointInRect(r, 0.12);
      if (rp) cands.push([rp.x, rp.y]);
    }
    for (var ci = cands.length - 1; ci > 0; ci--) {
      var cj = Math.floor(Math.random() * (ci + 1));
      var ct = cands[ci]; cands[ci] = cands[cj]; cands[cj] = ct;
    }
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

  // 拟人缓动：每次随机混合 smoothstep 与幂函数，速度曲线不重复
  function makeEase() {
    var mix = rand(0.45, 0.85), pow = rand(1.35, 2.6);
    return function (t) {
      var s = t * t * (3 - 2 * t);
      return mix * s + (1 - mix) * Math.pow(t, pow);
    };
  }

  // 拖拽：源节点 → 目标节点。起点/落点/时长/按压/路径弧度/抖动全随机
  function drag(node, target) {
    var sp = bestWorld(node);
    var tr = rectOf(target);
    var tp = (tr && randPointInRect(tr, 0.24)) || worldOf(target);
    emit(node, CC().Node.EventType.TOUCH_START, sp.x, sp.y, 0, 0);
    A.stats.drags++;
    var dur = rand(300, 850), pressMs = rand(40, 180);
    var vx = tp.x - sp.x, vy = tp.y - sp.y;
    var dist = Math.sqrt(vx * vx + vy * vy) || 1;
    var nx = -vy / dist, ny = vx / dist;
    var curve = rand(-0.12, 0.12) * Math.min(dist, 260); // 侧向弧度，最多 ±31px
    var jitter = rand(0.4, 2.2), jfreq = rand(2, 4.5), jphase = rand(0, 6.28);
    var ease = makeEase();
    var t0 = Date.now(), lx = sp.x, ly = sp.y;
    recordGesture({ type: 'drag', node: node.name, target: target.name, from: sp, to: tp, dur: Math.round(dur), press: Math.round(pressMs), curve: Math.round(curve) });
    function moveStep() {
      try {
        var t = Math.min(1, (Date.now() - t0) / dur);
        var e = ease(t), arc = Math.sin(Math.PI * t);
        var x = sp.x + vx * e + nx * curve * arc + nx * jitter * Math.sin(Math.PI * t * jfreq + jphase) * arc;
        var y = sp.y + vy * e + ny * curve * arc + ny * jitter * Math.sin(Math.PI * t * jfreq + jphase) * arc;
        emit(node, CC().Node.EventType.TOUCH_MOVE, x, y, x - lx, y - ly);
        lx = x; ly = y;
        if (t < 1) { setTimeout(moveStep, rand(12, 22)); return; }
        emit(node, CC().Node.EventType.TOUCH_MOVE, tp.x, tp.y, tp.x - lx, tp.y - ly);
        setTimeout(function () {
          try { emit(node, CC().Node.EventType.TOUCH_END, tp.x, tp.y, 0, 0); } catch (err) {}
        }, rand(0, 120));
      } catch (err) {}
    }
    setTimeout(moveStep, pressMs);
  }

  function tapNode(node) {
    var p = bestWorld(node);
    var press = rand(50, 180);
    var jx = rand(-2.2, 2.2), jy = rand(-2.2, 2.2);
    emit(node, CC().Node.EventType.TOUCH_START, p.x, p.y, 0, 0);
    A.stats.taps++;
    recordGesture({ type: 'tap', node: node.name, at: p, press: Math.round(press) });
    setTimeout(function () {
      try {
        if (Math.random() < 0.7) emit(node, CC().Node.EventType.TOUCH_MOVE, p.x + jx, p.y + jy, jx, jy);
      } catch (err) {}
    }, Math.max(10, press * 0.4));
    setTimeout(function () {
      try { emit(node, CC().Node.EventType.TOUCH_END, p.x + jx, p.y + jy, 0, 0); } catch (err) {}
    }, press);
  }

  // 方向滑动：方向/距离加随机抖动；起点、时长、按压随机
  function swipe(node, dx, dy, dist) {
    var p = bestWorld(node);
    var base = Math.max(20, Number(dist) || 30);
    var len = base + rand(8, 60);
    var ang = rand(-0.06, 0.06); // ±3.4°
    var ca = Math.cos(ang), sa = Math.sin(ang);
    var ux = dx * ca - dy * sa, uy = dx * sa + dy * ca;
    var dur = rand(260, 700), pressMs = rand(30, 150);
    var curve = rand(-0.05, 0.05) * len;
    var ease = makeEase();
    emit(node, CC().Node.EventType.TOUCH_START, p.x, p.y, 0, 0);
    A.stats.swipes++;
    recordGesture({ type: 'swipe', node: node.name, dir: [dx, dy], len: Math.round(len), dur: Math.round(dur), press: Math.round(pressMs) });
    var t0 = Date.now(), lx = p.x, ly = p.y;
    function moveStep() {
      try {
        var t = Math.min(1, (Date.now() - t0) / dur);
        var e = ease(t), arc = Math.sin(Math.PI * t);
        var x = p.x + ux * len * e - uy * curve * arc;
        var y = p.y + uy * len * e + ux * curve * arc;
        emit(node, CC().Node.EventType.TOUCH_MOVE, x, y, x - lx, y - ly);
        lx = x; ly = y;
        if (t < 1) { setTimeout(moveStep, rand(12, 22)); return; }
        emit(node, CC().Node.EventType.TOUCH_END, p.x + ux * len, p.y + uy * len, 0, 0);
      } catch (err) {}
    }
    setTimeout(moveStep, pressMs);
  }

  function hold(node, seconds) {
    var p = bestWorld(node);
    var ms = Math.max(200, (Number(seconds) || 2) * 1000 + rand(100, 600));
    emit(node, CC().Node.EventType.TOUCH_START, p.x, p.y, 0, 0);
    A.stats.holds++;
    recordGesture({ type: 'hold', node: node.name, at: p, dur: Math.round(ms) });
    var t0 = Date.now();
    (function jitterLoop() {
      if (Date.now() - t0 > ms) {
        try { emit(node, CC().Node.EventType.TOUCH_END, p.x, p.y, 0, 0); } catch (err) {}
        return;
      }
      try {
        var jx = rand(-1.4, 1.4), jy = rand(-1.4, 1.4);
        emit(node, CC().Node.EventType.TOUCH_MOVE, p.x + jx, p.y + jy, jx, jy);
      } catch (err) {}
      setTimeout(jitterLoop, rand(120, 260));
    })();
  }

  // TouchCuo：按住来回划动，累计时间达到 Value 秒；方向/幅度/频率随机
  function rub(node, seconds) {
    var p = bestWorld(node);
    var amp = rand(14, 42), vertical = Math.random() < 0.5, period = rand(30, 60);
    var until = Date.now() + Math.max(800, (Number(seconds) || 1) * 1000 + rand(400, 900));
    emit(node, CC().Node.EventType.TOUCH_START, p.x, p.y, 0, 0);
    A.stats.rubs++;
    recordGesture({ type: 'cuo', node: node.name, amp: Math.round(amp), vertical: vertical, period: Math.round(period) });
    var dir = 1;
    (function loop() {
      if (Date.now() > until) { emit(node, CC().Node.EventType.TOUCH_END, p.x, p.y, 0, 0); return; }
      dir = -dir;
      var dx = vertical ? 0 : dir * amp, dy = vertical ? dir * amp : 0;
      emit(node, CC().Node.EventType.TOUCH_MOVE, p.x + dx, p.y + dy, dx, dy);
      setTimeout(loop, period);
    })();
  }

  // 纯提示条目（Key 且无 Step/Tween）不推进任何状态：查询下一步时临时把它们从场景配置里摘掉，
  // 查完立刻原样放回（不碰节点 active，避免 onDisable 副作用）。
  function pickActionTip(p) {
    var arr = (p && p.currentSceneConfig) || [];
    var removed = [];
    for (var i = arr.length - 1; i >= 0; i--) {
      var it = arr[i];
      if (it && it.Key && !it.Step && (!it.Tween || !it.Tween.length)) { removed.push([i, it]); arr.splice(i, 1); }
    }
    var t = null;
    try { t = p.getTipConfig(); }
    finally {
      removed.sort(function (a, b) { return a[0] - b[0]; });
      for (var j = 0; j < removed.length; j++) arr.splice(removed[j][0], 0, removed[j][1]);
    }
    return t;
  }

  // 教学提示（Key 条目、无 Step/Tween）本身不是可执行项：
  // 从当前场景配置里找「点击后会把该提示节点 active=false」的那个条目，点它。
  function findUnlocker(tip, p) {
    var list = (p && p.currentSceneConfig) || [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (!it || it === tip || it.Step) continue;
      var tw = it.Tween || [];
      for (var j = 0; j < tw.length; j++) {
        var e = tw[j];
        if (!e || e.type !== 'active' || e.value !== false) continue;
        var names = typeof it.node === 'string' ? [it.node] : it.node;
        var hit = false;
        if (typeof e.node === 'string') { for (var k = 0; k < names.length; k++) if (names[k] === e.node) hit = true; }
        else if (Object.prototype.toString.call(e.node) === '[object Array]') { for (var k2 = 0; k2 < names.length; k2++) if (e.node.indexOf(names[k2]) >= 0) hit = true; }
        if (!hit) continue;
        for (var m = 0; m < names.length; m++) {
          var cand = findAny(names[m]);
          if (cand && cand.activeInHierarchy) return cand;
        }
      }
    }
    return null;
  }

  // 无 Value 的 TouchMove = 自由拖动 + 来回擦：节点上挂 TouchRubOut 时，
  // 把它的 check 节点拖进 maskItem，再在 mask 里来回划，游戏自己的碰撞逻辑会计数推进。
  function findRubComp(node) {
    var cs = node._components || [];
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i];
      if (c && c.maskItem && c.touchNode && c.tweenStr) return c;
    }
    return null;
  }
  function worldOfNode(n) { return n.parent.convertToWorldSpaceAR(n.position); }
  function rubOut(node, comp) {
    var maskComp = comp.maskItem, check = comp.touchNode;
    var rub = maskComp && maskComp.rubNode;
    var maskNode = maskComp && (maskComp.node || maskComp);
    if (!maskComp || !maskNode || !maskNode.activeInHierarchy || !check || !check.parent || !rub || !rub.parent) return false;
    var sp = bestWorld(node);
    var cp = worldOfNode(check);
    var x0 = rub.parent.convertToWorldSpaceAR(CC().v2(-rub.width / 2, -rub.height / 2));
    var x1 = rub.parent.convertToWorldSpaceAR(CC().v2(rub.width / 2, rub.height / 2));
    var left = Math.min(x0.x, x1.x), right = Math.max(x0.x, x1.x);
    var bottom = Math.min(x0.y, x1.y), top = Math.max(x0.y, x1.y);
    var inset = rand(18, 28), gap = rand(36, 52);
    var path = [];
    var vertical = Math.random() < 0.5;
    var flipX = Math.random() < 0.5, flipY = Math.random() < 0.5;
    function pushPoint(x, y) {
      x = Math.min(right - 2, Math.max(left + 2, x + rand(-5, 5)));
      y = Math.min(top - 2, Math.max(bottom + 2, y + rand(-5, 5)));
      path.push([x, y]);
    }
    if (!vertical) {
      var ys = [];
      for (var yy = bottom + inset; yy <= top - inset + 0.1; yy += gap) ys.push(yy);
      if (flipY) ys.reverse();
      for (var yi = 0; yi < ys.length; yi++) {
        var xs = [];
        for (var xx = left + inset; xx <= right - inset + 0.1; xx += gap) xs.push(xx);
        if ((yi % 2 === 0) !== flipX) xs.reverse();
        for (var xi = 0; xi < xs.length; xi++) pushPoint(xs[xi], ys[yi]);
      }
    } else {
      var xs2 = [];
      for (var xx2 = left + inset; xx2 <= right - inset + 0.1; xx2 += gap) xs2.push(xx2);
      if (flipX) xs2.reverse();
      for (var xi2 = 0; xi2 < xs2.length; xi2++) {
        var ys2 = [];
        for (var yy2 = bottom + inset; yy2 <= top - inset + 0.1; yy2 += gap) ys2.push(yy2);
        if ((xi2 % 2 === 0) !== flipY) ys2.reverse();
        for (var yi2 = 0; yi2 < ys2.length; yi2++) pushPoint(xs2[xi2], ys2[yi2]);
      }
    }
    var first = path[0] || [left + inset, bottom + inset];
    path.unshift([first[0], first[1]]);
    var curC = { x: cp.x, y: cp.y }, curG = { x: sp.x, y: sp.y };
    var stepMs = rand(16, 34);
    recordGesture({ type: 'rub', node: node.name, orientation: vertical ? 'vertical' : 'horizontal', points: path.length, gap: Math.round(gap), stepMs: Math.round(stepMs) });
    A._gestureUntil = Date.now() + path.length * stepMs * 2 + 1200;
    emit(node, CC().Node.EventType.TOUCH_START, sp.x, sp.y, 0, 0);
    A.stats.rubs++;
    var i = 0;
    function tickRub() {
      try {
        if (i >= path.length) {
          emit(node, CC().Node.EventType.TOUCH_END, curG.x, curG.y, 0, 0);
          return;
        }
        var tgt = path[i++];
        var dx = tgt[0] - curC.x, dy = tgt[1] - curC.y;
        // 分两小步，保证每步都有 MOVE 事件喂给 updateMaskRub
        var hx = dx / 2, hy = dy / 2;
        curC.x += hx; curC.y += hy; curG.x += hx; curG.y += hy;
        emit(node, CC().Node.EventType.TOUCH_MOVE, curG.x, curG.y, hx, hy);
        setTimeout(function () {
          try {
            curC.x += hx; curC.y += hy; curG.x += hx; curG.y += hy;
            emit(node, CC().Node.EventType.TOUCH_MOVE, curG.x, curG.y, hx, hy);
            setTimeout(tickRub, stepMs);
          } catch (e) {}
        }, stepMs);
      } catch (e) {}
    }
    setTimeout(tickRub, 30 + Math.random() * 40);
    return true;
  }

  function perform(tip, node) {
    var t = tip.Type;
    if (t === 'TouchMove' || t === 'TouchMoveInter') {
      if (!tip.Value) {
        var rc = findRubComp(node);
        if (rc && rubOut(node, rc)) { A.log.push('RUBOUT ' + tip.node); return true; }
        A.stats.skips++; A.log.push('NO_VALUE ' + tip.node); return false;
      }
      var names = typeof tip.Value === 'string' ? [tip.Value] : tip.Value;
      var targets = [];
      for (var i = 0; i < names.length; i++) {
        var cand = findAny(names[i]);
        if (cand && cand.activeInHierarchy) targets.push(cand);
      }
      if (!targets.length) { A.stats.skips++; A.log.push('NO_TARGET ' + tip.node + ' -> ' + JSON.stringify(tip.Value)); return false; }
      var target = targets[Math.floor(Math.random() * targets.length)];
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

  var lastProg = '', lastAt = 0, idle = 0, gen = 0, waitUntil = 0, lastMini = -1, lastStep = -1;
  // 开局/转场后"先看一眼画面"：遮罩落下后先停 3~5 秒再出手。
  var pendingIntro = false, introFrom = 0, introMs = 0, lastMiniSeen = -1, lastPre = null;
  var REPEAT = { ClickMaxNum: 1, ClickTimeNum: 1, TouchCuo: 1 };
  function beginIntro(why) {
    // 同一个"看画面"窗口只计一次：还在等（尚未开始计时）就不重置，避免换关时叠加成 6~10 秒
    if (pendingIntro && !introFrom) return;
    pendingIntro = true;
    introFrom = 0;
    introMs = 3000 + Math.random() * 2000;
    A.log.push('INTRO ' + why + ' ' + (introMs / 1000).toFixed(1) + 's');
    if (A.log.length > 200) A.log.splice(0, A.log.length - 200);
  }
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

      // 换关（StalkPre_1 组件重建）或同关内切场景（currentMiniLv +1）→ 重新"先看一眼画面"
      if (p !== lastPre) {
        lastPre = p;
        lastMiniSeen = p.currentMiniLv;
        beginIntro('level' + ((p.ctrl.interConfig && p.ctrl.interConfig.lv) || '?'));
      } else if (lastMiniSeen >= 0 && p.currentMiniLv === lastMiniSeen + 1) {
        beginIntro('scene' + p.currentMiniLv);
      }
      lastMiniSeen = p.currentMiniLv;
      // 遮罩已落下，画面可交互：从这里开始计 3~5 秒"看画面"时间
      if (pendingIntro) {
        if (!introFrom) introFrom = Date.now();
        if (Date.now() < introFrom + introMs) { setTimeout(function () { tick(g); }, 150); return; }
        pendingIntro = false;
        A.log.push('INTRO-END');
      }

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
      var keyOnly = tip.Key && !tip.Step && (!tip.Tween || !tip.Tween.length);
      var unlocker = keyOnly ? findUnlocker(tip, p) : null;
      lastProg = prog; lastAt = now;
      A.stats.actions++;
      var ok;
      if (unlocker) {
        tapNode(unlocker);
        ok = true;
        A.log.push('UNLOCK ' + tip.node + ' via ' + unlocker.name);
      } else if (keyOnly) {
        var t2 = pickActionTip(p);
        if (t2) {
          tip = t2;
          node = findAny(tip.node);
          ok = node ? perform(tip, node) : false;
          if (node) A.log.push('SKIPHINT ' + tip.Type + ' ' + tip.node);
        } else {
          ok = perform(tip, node);
        }
      } else {
        ok = perform(tip, node);
      }
      if (ok) {
        A.log.push((tip.Type || '?') + ' ' + tip.node + (tip.Value && typeof tip.Value !== 'object' ? ' ' + tip.Value : ''));
        if (A.log.length > 200) A.log.splice(0, A.log.length - 200);
      }
      var dur = 0;
      try { dur = tweenDur(tip.Tween || [], 0); } catch (e) {}
      var miniNow = p.currentMiniLv, stepNow = p.currentStepNum;
      var sameGroup = (miniNow === lastMini && stepNow === lastStep);
      var gap;
      if (repeat) gap = 80 + Math.random() * 270;
      else if (sameGroup) gap = 250 + Math.random() * 650;
      else gap = 1000 + Math.random() * 2000;
      lastMini = miniNow; lastStep = stepNow;
      waitUntil = Date.now() + Math.max(dur * 1000 + 650 + Math.random() * 350, gap);
      if (A._gestureUntil && A._gestureUntil > waitUntil) waitUntil = A._gestureUntil;
      setTimeout(function () { tick(g); }, 200);
    } catch (e) {
      A.err = String(e) + '\n' + (e.stack || '');
      setTimeout(function () { tick(g); }, 600);
    }
  }

  A.start = function () {
    A.running = true; A._why = null; A.err = null;
    lastProg = ''; lastAt = 0; idle = 0; lastMini = -1; lastStep = -1;
    // 记下启动时已存在的关卡组件（boot 在新关加载完才 start），避免把同一组件误判成"换关"
    lastPre = null;
    try { lastPre = preComp(); } catch (e) {}
    lastMiniSeen = lastPre ? lastPre.currentMiniLv : -1;
    pendingIntro = false; introFrom = 0;
    beginIntro('level-start');
    gen++;
    tick(gen);
    return 'started';
  };

  return JSON.stringify({ ok: true, version: A.version });
})()
