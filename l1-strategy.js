// l1-strategy.js —— 由 autoplay/l1-strategy.js 生成，页面内可重复启动
window.__zdksStartStrategyL1 = function () {
// l1-strategy.js —— 《噩梦模拟器 · 让子弹射》第1关 页内自动玩闭环（v5 打法移植）
// 路线（默认 center）：右 ×3 喂弹道 <-> 中列 -300/-500 打通道 -> 武器 8 -> 右 ×3 终盘
// 备选路线（left）：左 -250 开门 -> 左 ×16 收割/喂玩家 -> 中列 -300 通道 -> 左 ×16 终盘
// 结构照抄第4关 v5：短间隔交替（喂主角 <-> 打通道）、命中区内巡逻、无 HUD、失败自愈。
// 只做四件事：读游戏自己的状态 / 调游戏自己的移动接口 / 调游戏自己的按钮处理 / 记账。
// 不修改游戏 JS、不改内存、不改判定。
(function () {
  'use strict';
  if (window.__zdksAuto && window.__zdksAuto.live) {
    console.log('[zdks-l1] already live');
    return;
  }

  // 第1关刷怪表（旧账实测：22 波，总血 4264；最后一波 140s / 2275 血）
  var W_T = [3, 6, 7, 8, 15, 23, 30, 36, 43, 50, 57, 65, 71, 78, 85, 92, 100, 107, 115, 125, 132, 140];
  var W_HP = [3, 5, 9, 20, 90, 30, 45, 98, 50, 30, 30, 70, 50, 120, 85, 120, 230, 205, 247, 205, 247, 2275];
  var WAVES = W_T.map(function (t, i) { return { t: t, hp: W_HP[i] }; });

  var A = {
    live: true,
    over: null,          // 'WIN ...' / 'LOSE ...' / null
    phase: 'boot',
    rows: [],
    n: 0,
    errN: 0,
    err: null,
    lanes: null,
    healed: false,
    buffed: false,
    heals: 0,
    lastHealAt: null,
    t0: null,
    phaseT0: null,
    gL: null, gC1: null, gC2: null, gC: null,
    weaponWaitT0: null,
    // 通道冲刺（短间隔交替）：杯子从喂弹道压到红闸/中列，再回喂弹道
    dash: { active: false, startedAt: 0, until: 0, lastAt: -999, count: 0, lane: null, reason: '' },
    th: null,
    cfg: {
      tickMs: 250,
      route: 'left',          // 'left' | 'center'（默认左列 v5：左闸 -250 -> 左 ×16 <-> 喂弹道）
      rightOffset: 0,         // 右 ×3 车位偏移（旧账黄金道在 ×3 中心右侧；默认踩块中心）
      feedAmp: 10,            // 右 ×3 巡逻幅度
      dashEnabled: true,      // 通道冲刺开关（?dash=0 关闭，只留命中区巡逻）
      dashMax: 999,           // 全程冲刺上限（?dash=N）
      leftAmp: 4,             // 左 ×16 巡逻幅度
      primeCap: 150,
      primeMaxSec: 15,
      centerMaxSec: 130,
      center300MaxSec: 75,
      leftBreakMaxSec: 90,
      harvestSec: 8,
      weaponWaitSec: 6,
      healHp: 80,
      maxHeals: 3,
      healCooldownSec: 12,
      // 冲刺参数：短、频；安全或弹药富裕时压通道
      dashSec: 1.8,
      dashCooldownSec: 1.8,
      dashBreakCloseN: 10,
      // 威胁读数：喂弹道 + 250 是观众可见范围；520 是老账的贴身警戒线
      threatRange: 250,
      safeEnemyX: 520,
      feedFloor: 80,
      budgetReserve: 25,
      levels: 1
    }
  };
  window.__zdksAuto = A;

  // 测试/演示旋钮：?route=left|center & ro=<右×3偏移> & amp=<右×3巡逻幅度>
  var Q = {};
  try {
    (location.search || '').replace(/^\?/, '').split('&').forEach(function (kv) {
      var p = kv.split('=');
      if (p[0]) Q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
  } catch (e) { }
  if (Q.route === 'left' || Q.route === 'center') A.cfg.route = Q.route;
  if (Q.ro != null && Q.ro !== '' && isFinite(+Q.ro)) A.cfg.rightOffset = +Q.ro;
  if (Q.amp != null && Q.amp !== '' && isFinite(+Q.amp)) A.cfg.feedAmp = +Q.amp;
  if (Q.dash != null && Q.dash !== '' && isFinite(+Q.dash)) { A.cfg.dashMax = +Q.dash; A.cfg.dashEnabled = +Q.dash > 0; }

  // ---------- 基础读取 ----------
  function scene() { try { return cc.director.getScene(); } catch (e) { return null; } }
  function compClass(c) { try { return cc.js.getClassName(c); } catch (e) { return ''; } }
  function findComp(className) {
    var s = scene(); if (!s) return null;
    var found = null;
    (function walk(n, d) {
      if (found || d > 40) return;
      for (var i = 0; i < (n.components || []).length; i++) {
        if (compClass(n.components[i]) === className) { found = n.components[i]; return; }
      }
      for (var j = 0; j < (n.children || []).length; j++) walk(n.children[j], d + 1);
    })(s, 0);
    return found;
  }
  function findState() {
    var s = scene(); if (!s) return null;
    var main = null;
    for (var i = 0; i < s.children.length; i++) if (s.children[i].name === 'main') { main = s.children[i]; break; }
    if (!main) return null;
    var rc = null;
    for (var k = 0; k < (main.components || []).length; k++) {
      if (compClass(main.components[k]) === 'r') { rc = main.components[k]; break; }
    }
    var st = rc && rc.ctrl && rc.ctrl.state;
    if (!st || !st._cup || !st.players) return null;
    return st;
  }
  function findNode(name) {
    var s = scene(); if (!s) return null;
    var found = null;
    (function walk(n, d) {
      if (found || d > 40) return;
      if (n.name === name) { found = n; return; }
      for (var j = 0; j < (n.children || []).length; j++) walk(n.children[j], d + 1);
    })(s, 0);
    return found;
  }
  function gateCap(name) {
    var n = findNode(name);
    if (!n) return null;
    for (var i = 0; i < (n.components || []).length; i++) {
      if (compClass(n.components[i]) === 'Game11BlockTriggerCmp') return n.components[i]._capacity;
    }
    return null;
  }
  function worldX(name) {
    var n = findNode(name);
    if (!n) return null;
    try { return n.getWorldPosition().x; } catch (e) { return null; }
  }
  // 第1关：右 ×3 = 1_12；左闸 = 1_1（左 ×16 阶梯 1_2..1_9 与闸几乎同 x）；中列 = 1_10/1_11
  function discoverLanes() {
    var right = worldX('trigger_wall_1_12');
    var left = worldX('trigger_wall_1_1');
    var c1 = worldX('trigger_wall_1_10');
    var c2 = worldX('trigger_wall_1_11');
    var center = (c1 != null && c2 != null) ? (c1 + c2) / 2 : (c1 != null ? c1 : c2);
    return {
      right: right != null ? right : 499,
      left: left != null ? left : 220,
      center: center != null ? center : 406
    };
  }

  // ---------- 动作 ----------
  function moveTo(st, x) {
    try {
      if (!st || !st._cup || x == null) return;
      var dx = (x - st._cup._position.x) / (st._cup.moveRatio || 1.6);
      if (Math.abs(dx) > 0.01) st.moveCup(dx, 0);
    } catch (e) { A.errN++; A.err = 'move:' + (e && e.message); }
  }
  // 命中区内巡逻：观众看到杯子一直在走位，但不脱离 ×3 / ×16 的命中区
  function patrolTo(st, x, amp, period) {
    var t = st.pastTime || 0;
    var off = Math.sin((t / (period || 2)) * Math.PI * 2) * (amp || 18);
    moveTo(st, x + off);
  }
  function applyBuffs(st) {
    if (A.buffed) return;
    var view = findComp('Game11ChallengeView');
    if (!view) return;
    A.buffed = true;
    try { view.onAddAtk(); } catch (e) { A.errN++; A.err = 'atk:' + (e && e.message); }
    try { view.onAddAtkSpeed(); } catch (e) { A.errN++; A.err = 'sp:' + (e && e.message); }
    console.log('[zdks-l1] buffs: atk+50%, spd+20%');
  }
  function maybeHeal(st) {
    var hp = st.players[0].hp;
    if (hp >= A.cfg.healHp) return;
    if ((A.heals || 0) >= A.cfg.maxHeals) return;
    var t = st.pastTime || 0;
    if (A.lastHealAt != null && t - A.lastHealAt < A.cfg.healCooldownSec) return;
    var v = findComp('Game11AddHpView');
    if (!v || !v.node || !v.node.activeInHierarchy) return;
    A.lastHealAt = t;
    A.heals = (A.heals || 0) + 1;
    A.healed = true;
    try { v.onClickADBtn(); console.log('[zdks-l1] heal +100 #' + A.heals); } catch (e) { A.errN++; A.err = 'heal:' + (e && e.message); }
  }

  // ---------- 读数 ----------
  function nextWave(t) {
    for (var i = 0; i < WAVES.length; i++) if (WAVES[i].t > t + 1e-6) return WAVES[i];
    return null;
  }
  function budget(t) {
    var nw = nextWave(t);
    return (nw ? nw.hp : 25) + A.cfg.budgetReserve;
  }
  function enemyThreat(st) {
    var list = st.enemies || [];
    var limit = rightLane() + A.cfg.threatRange;
    var nearN = 0, nearHp = 0, minX = 1e9, closeN = 0;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !e.config) continue;
      var x = 1e9;
      try {
        if (e.node && e.node.getWorldPosition) x = e.node.getWorldPosition().x;
        else if (e.position) x = e.position.x;
      } catch (err) { }
      if (x < limit) { nearN++; nearHp += (e.config.hp || 1); if (x < minX) minX = x; }
      if (x < A.cfg.safeEnemyX) closeN++;
    }
    return { nearN: nearN, nearHp: nearHp, minX: minX, closeN: closeN, limit: limit, cap: st.players[0]._capacity };
  }

  // ---------- 相位机 ----------
  function defaultDashLane() {
    if (A.cfg.route === 'left') {
      if (A.phase === 'leftBreak') return A.lanes.left;
      return A.lanes.center;
    }
    return A.lanes.center;
  }
  function feedLane() {
    // 左路线：左闸开了以后用左 ×16 喂玩家；没开 / 中路线始终用右 ×3
    if (A.cfg.route === 'left' && A.phase !== 'leftBreak' && A.gL != null && A.gL <= 0) return A.lanes.left;
    return rightLane();
  }
  function rightLane() {
    return (A.lanes ? A.lanes.right : 467.8) + (A.cfg.rightOffset || 0);
  }
  function moveToFeed(st) {
    var lane = feedLane();
    if (lane === A.lanes.left) patrolTo(st, lane, A.cfg.leftAmp, 1.4);  // 左 ×16 是命脉，踩正位小幅摆
    else patrolTo(st, lane, A.cfg.feedAmp, 1.4);                       // 右 ×3 命中区里摆大一点
  }
  function setPhase(p, t) {
    if (A.phase === p) return;
    A.phase = p;
    A.phaseT0 = t;
    A.weaponWaitT0 = null;
    A.dash.active = false;
    A.dash.lane = defaultDashLane();
    console.log('[zdks-l1] phase -> ' + p + ' @t' + Math.round(t * 10) / 10);
  }

  // ---------- 通道冲刺：默认在喂弹道，短压通道再回 ----------
  function maybeDash(st, t, th) {
    if (A.dash.active) return false;
    if (!A.cfg.dashEnabled || A.dash.count >= A.cfg.dashMax) return false;
    if (t - A.dash.lastAt < A.cfg.dashCooldownSec) return false;
    var p = st.players[0];
    if (p._capacity < A.cfg.feedFloor) return false;
    var safe = (th.minX > A.cfg.safeEnemyX) || (th.closeN <= 2);
    var rich = p._capacity >= budget(t) * 1.3;
    if (!safe && !rich) return false;
    A.dash.active = true;
    A.dash.startedAt = t;
    A.dash.until = t + A.cfg.dashSec;
    A.dash.count++;
    A.dash.reason = safe ? 'safe' : 'rich';
    console.log('[zdks-l1] dash #' + A.dash.count + ' -> channel x=' + Math.round(A.dash.lane) +
      ' why=' + A.dash.reason + ' t=' + Math.round(t * 10) / 10 +
      ' cap=' + p._capacity + ' close=' + th.closeN + ' minX=' + (th.minX === 1e9 ? 'none' : Math.round(th.minX)));
    return true;
  }
  function dashStep(st, t, th) {
    if (!A.dash.active) return false;
    moveTo(st, A.dash.lane); // 通道上踩正位
    var p = st.players[0];
    var elapsed = t - A.dash.startedAt;
    var urgent = (th.closeN > A.cfg.dashBreakCloseN) && (p._capacity < budget(t));
    if (elapsed >= A.cfg.dashSec || urgent) {
      A.dash.active = false;
      A.dash.lastAt = t;
      console.log('[zdks-l1] dash done #' + A.dash.count + ' t=' + Math.round(t * 10) / 10 +
        ' cap=' + p._capacity + ' elapsed=' + Math.round(elapsed * 10) / 10 + 's' + (urgent ? ' urgent' : ''));
    }
    return true;
  }
  function maybeChannel(st, t, th) {
    if (dashStep(st, t, th)) return true;
    if (maybeDash(st, t, th)) { moveTo(st, A.dash.lane); return true; }
    return false;
  }

  // ---------- 页面内导航小工具（给 Node 驱动读坐标用） ----------
  function boundsCenter(node) {
    try {
      for (var i = 0; i < (node.components || []).length; i++) {
        var c = node.components[i];
        if (c && typeof c.getBoundingBoxToWorld === 'function') {
          var r = c.getBoundingBoxToWorld();
          if (r && r.width > 0 && r.height > 0) {
            return new cc.Vec3(r.x + r.width / 2, r.y + r.height / 2, 0);
          }
        }
      }
    } catch (e) { }
    return node.getWorldPosition();
  }
  A.domOfNode = function (node) {
    if (!node) return null;
    try {
      var s = scene();
      var wp = boundsCenter(node);
      var anc = node, canvas = null;
      while (anc && anc !== s) {
        var cn = compClass(anc);
        if (anc.name === 'Canvas' || cn === 'cc.Canvas') { canvas = anc; break; }
        anc = anc.parent;
      }
      if (!canvas) return null;
      var cam = null;
      for (var i = 0; i < (canvas.children || []).length; i++) {
        var c = canvas.children[i].getComponent(cc.Camera);
        if (c) { cam = c; break; }
      }
      if (!cam) return null;
      var v = new cc.Vec3();
      cam.worldToScreen(wp, v);
      var el = (cc.game && cc.game.canvas) || document.getElementById('GameCanvas');
      var rc = (el && el.getBoundingClientRect) ? el.getBoundingClientRect()
        : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      var sx = (el && rc.width) ? (el.width / rc.width) : 1;
      var sy = (el && rc.height) ? (el.height / rc.height) : 1;
      return {
        x: Math.round(rc.left + v.x / sx),
        y: Math.round(rc.top + rc.height - v.y / sy)
      };
    } catch (e) { return null; }
  };
  A.findTextNode = function (text) {
    var s = scene(); if (!s) return null;
    var found = null;
    (function walk(n, d) {
      if (found || d > 45) return;
      for (var i = 0; i < (n.components || []).length; i++) {
        var c = n.components[i];
        if (compClass(c) === 'cc.Label' && typeof c.string === 'string' && c.string.replace(/\s+/g, '') === text) { found = n; return; }
      }
      for (var j = 0; j < (n.children || []).length; j++) walk(n.children[j], d + 1);
    })(s, 0);
    return found;
  };
  A.levelButtonDom = function (levelText, kinds) {
    var label = A.findTextNode(levelText);
    if (!label) return null;
    var item = label.parent;
    for (var up = 0; up < 5 && item; up++) {
      var has = false;
      for (var i = 0; i < (item.children || []).length; i++) {
        for (var k = 0; k < kinds.length; k++) if (item.children[i].name === kinds[k]) has = true;
      }
      if (has) break;
      item = item.parent;
    }
    if (!item) return null;
    for (var kk = 0; kk < kinds.length; kk++) {
      for (var j = 0; j < (item.children || []).length; j++) {
        var ch = item.children[j];
        if (ch.name === kinds[kk] && ch.activeInHierarchy) return { kind: ch.name, dom: A.domOfNode(ch) };
      }
    }
    return null;
  };
  A.findNode = findNode;
  A.backToHall = function () {
    var v = findComp('Game11ChallengeView');
    if (v) { try { v.onClickBackBtn(); return true; } catch (e) { return false; } }
    return false;
  };
  A.closeEnd = function () {
    var v = findComp('Game11EndView');
    if (v) { try { v.onClickCloseBtn(); return true; } catch (e) { return false; } }
    return false;
  };
  A.textDom = function (text) {
    var s = scene(); if (!s) return null;
    var matches = [];
    (function walk(n, d) {
      if (d > 45) return;
      for (var i = 0; i < (n.components || []).length; i++) {
        var c = n.components[i];
        if (compClass(c) === 'cc.Label' && typeof c.string === 'string' && c.string.replace(/\s+/g, '') === text) matches.push(n);
      }
      for (var j = 0; j < (n.children || []).length; j++) walk(n.children[j], d + 1);
    })(s, 0);
    if (!matches.length) return null;
    function hasRich(n) {
      var x = n;
      for (var i = 0; i < 3 && x; i++) {
        for (var k = 0; k < (x.components || []).length; k++) if (compClass(x.components[k]) === 'cc.RichText') return true;
        x = x.parent;
      }
      return false;
    }
    function nearBtn(n) {
      var x = n;
      for (var i = 0; i < 5 && x; i++) {
        if (/^btn/i.test(x.name || '')) return true;
        try { if (x.getComponent && x.getComponent(cc.Button)) return true; } catch (e) { }
        x = x.parent;
      }
      return false;
    }
    var pool = matches.filter(function (n) { return !hasRich(n); });
    if (!pool.length) pool = matches;
    var best = null;
    for (var i = 0; i < pool.length; i++) if (nearBtn(pool[i])) { best = pool[i]; break; }
    if (!best) best = pool[0];
    function btnAncestor(n) {
      var x = n;
      for (var i = 0; i < 6 && x; i++) {
        if (/^btn/i.test(x.name || '')) return x;
        try { if (x.getComponent && x.getComponent(cc.Button)) return x; } catch (e) { }
        x = x.parent;
      }
      return null;
    }
    var target = btnAncestor(best) || best;
    return A.domOfNode(target);
  };
  A.retryDom = function () {
    var n = findNode('sure_btn2');
    if (!n || !n.activeInHierarchy) return null;
    return A.domOfNode(n);
  };
  A.stateSnap = function () {
    var st = findState();
    if (!st) return null;
    var p = st.players[0] || {};
    return {
      level: st.config && st.config.id,
      status: st._status,
      t: Math.round((st.pastTime || 0) * 10) / 10,
      hp: p.hp,
      cap: p._capacity,
      kill: st.killCount,
      left: st._leftEnemyCount,
      total: st.totalEnemyCount,
      en: st.enemies ? st.enemies.length : null,
      cup: st._cup ? st._cup._count : null,
      x: st._cup ? Math.round(st._cup._position.x * 10) / 10 : null,
      wid: p.config ? p.config.id : null
    };
  };

  // ---------- 主循环 ----------
  A.tick = function () {
    if (!A.live) return;
    var st = findState();
    if (!st) { A.errN++; A.err = 'no-state'; return; }
    if (!A.lanes) {
      A.lanes = discoverLanes();
      A.t0 = st.pastTime;
      A.phaseT0 = st.pastTime;
      A.dash.lane = defaultDashLane();
      console.log('[zdks-l1] lanes ' + JSON.stringify(A.lanes) + ' route=' + A.cfg.route);
    }
    var t = st.pastTime || 0;
    var p = st.players[0];
    applyBuffs(st);
    maybeHeal(st);

    var won = (st._status === 4 || st._status === 7) ||
      (st._leftEnemyCount <= 0 && st.killCount >= st.totalEnemyCount);
    function finalRow(tag) {
      A.rows.push({
        t: Math.round(t * 10) / 10, ph: 'over', x: Math.round(st._cup._position.x * 10) / 10,
        cap: p._capacity, hp: p.hp, kill: st.killCount, left: st._leftEnemyCount,
        en: st.enemies ? st.enemies.length : null, cup: st._cup._count,
        gL: A.gL, gC: A.gC, gC1: A.gC1, gC2: A.gC2, wid: p.config ? p.config.id : null,
        heal: A.healed, heals: A.heals, dashN: A.dash.count, status: st._status, final: tag
      });
    }
    if (won) {
      A.over = 'WIN t=' + Math.round(t * 10) / 10 + ' kill=' + st.killCount + '/' + st.totalEnemyCount + ' hp=' + p.hp;
      finalRow(A.over);
      A.live = false; clearInterval(A._id);
      console.log('[zdks-l1] ' + A.over);
      return;
    }
    if (st._status !== 1) {
      A.over = 'LOSE st=' + st._status + ' t=' + Math.round(t * 10) / 10 +
        ' kill=' + st.killCount + '/' + st.totalEnemyCount + ' hp=' + p.hp +
        ' left=' + st._leftEnemyCount + ' en=' + (st.enemies ? st.enemies.length : '?');
      finalRow(A.over);
      A.live = false; clearInterval(A._id);
      console.log('[zdks-l1] ' + A.over);
      return;
    }

    A.gL = gateCap('trigger_wall_1_1');
    A.gC1 = gateCap('trigger_wall_1_10');
    A.gC2 = gateCap('trigger_wall_1_11');
    A.gC = (A.gC1 == null && A.gC2 == null) ? null : (A.gC1 || 0) + (A.gC2 || 0);
    var se = t - A.phaseT0;
    var th = enemyThreat(st);
    A.th = th;

    if (A.phase === 'boot') setPhase('prime', t);

    switch (A.phase) {
      case 'prime':
        // 先攒弹：右 ×3 喂弹道巡逻
        patrolTo(st, rightLane(), A.cfg.feedAmp, 1.4);
        if (p._capacity >= A.cfg.primeCap || t >= A.cfg.primeMaxSec) {
          setPhase(A.cfg.route === 'left' ? 'leftBreak' : 'centerBreak', t);
        }
        break;

      case 'leftBreak':
        // 左闸 -250：默认右 ×3 喂玩家；安全/富裕时短压左闸
        if (A.gL != null && A.gL <= 0) { setPhase('harvest1', t); break; }
        if (se >= 2 && maybeChannel(st, t, th)) break;
        moveToFeed(st);
        if (se > A.cfg.leftBreakMaxSec) {
          if (A.gL != null && A.gL <= 0) setPhase('harvest1', t);
          else setPhase('centerBreak', t);
        }
        break;

      case 'harvest1':
        // 左 ×16 收割：命脉，小幅走位
        patrolTo(st, A.lanes.left, 4, 1.4);
        if (se >= A.cfg.harvestSec) setPhase('centerBreak', t);
        break;

      case 'centerBreak':
        if (A.cfg.route === 'center') {
          // 中列 -300/-500：破闸拿武器 8
          if (A.gC != null && A.gC <= 0) {
            if (A.weaponWaitT0 == null) { A.weaponWaitT0 = t; console.log('[zdks-l1] center gates clear; wait weapon 8'); }
            moveTo(st, A.lanes.center);
            if (p.config && p.config.id === 8) { setPhase('final', t); break; }
            if (t - A.weaponWaitT0 > A.cfg.weaponWaitSec) setPhase('final', t);
            break;
          }
          if (se >= 2 && maybeChannel(st, t, th)) break;
          moveToFeed(st);
          if (p.config && p.config.id === 8) { setPhase('final', t); break; }
          if (se > A.cfg.centerMaxSec) setPhase('final', t);
          break;
        } else {
          // 左路线：中列只打 -300（-500 和左闸合计超出 900 发）
          if (A.gC1 != null && A.gC1 <= 0) { setPhase('final', t); break; }
          if (se >= 2 && maybeChannel(st, t, th)) break;
          moveToFeed(st);
          if (se > A.cfg.center300MaxSec) setPhase('final', t);
          break;
        }

      case 'final':
        // 终盘：喂弹道（左 ×16 已开就用左 ×16，否则右 ×3）
        moveToFeed(st);
        break;

      default:
        setPhase('prime', t);
    }

    if (A.n % 2 === 0) {
      A.rows.push({
        t: Math.round(t * 10) / 10,
        ph: A.phase,
        x: Math.round(st._cup._position.x * 10) / 10,
        cap: p._capacity,
        hp: p.hp,
        kill: st.killCount,
        left: st._leftEnemyCount,
        en: st.enemies ? st.enemies.length : null,
        cup: st._cup._count,
        gL: A.gL, gC: A.gC, gC1: A.gC1, gC2: A.gC2,
        wid: p.config ? p.config.id : null,
        heal: A.healed, heals: A.heals,
        dash: A.dash.active ? 1 : 0, dashN: A.dash.count,
        near: th.nearN, nearHp: th.nearHp, close: th.closeN,
        minX: (th.minX === 1e9 ? null : Math.round(th.minX)),
        status: st._status
      });
      if (A.rows.length > 2400) A.rows.splice(0, 600);
    }
    A.n++;
  };
  A.pull = function () {
    var o = A.rows.length ? A.rows[A.rows.length - 1] : {};
    return {
      over: A.over, phase: A.phase, lanes: A.lanes, healed: A.healed, heals: A.heals,
      t: o.t, x: o.x, cap: o.cap, hp: o.hp, kill: o.kill, left: o.left,
      en: o.en, cup: o.cup, wid: o.wid, gL: o.gL, gC: o.gC, gC1: o.gC1, gC2: o.gC2,
      dash: A.dash.active ? 1 : 0, dashN: A.dash.count,
      near: A.th ? A.th.nearN : null, nearHp: A.th ? A.th.nearHp : null,
      close: A.th ? A.th.closeN : null,
      n: A.n, errN: A.errN, err: A.err
    };
  };
  A.stop = function () { if (A._id) clearInterval(A._id); A.live = false; };

  A._id = setInterval(A.tick, A.cfg.tickMs);
  console.log('[zdks-l1] strategy v2 boot (route=' + A.cfg.route + '; left gate <-> right x3 dashes; safe-zone patrol; no HUD)');
})();

};
