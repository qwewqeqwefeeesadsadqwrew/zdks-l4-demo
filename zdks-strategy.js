// zdks-strategy.js —— 由 autoplay/strategy.js 生成，页面内可重复启动
window.__zdksStartStrategy = function () {
// strategy.js —— 《噩梦模拟器 · 让子弹射》第4关 页内自动玩闭环
// 注入方式：把本文件整体作为表达式注入（IIFE），重复注入会被 live 标记挡掉。
// 只做四件事：读游戏自己的状态 / 调游戏自己的移动接口 / 调游戏自己的按钮处理 / 记账。
// 不修改游戏 JS、不改内存、不改判定。
(function () {
  'use strict';
  if (window.__zdksAuto && window.__zdksAuto.live) {
    console.log('[zdks] already live');
    return;
  }
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
    t0: null,
    phaseT0: null,
    recharge: false,
    // 反应式微操：红闸 <-> 绿 x3 喂弹道
    feed: {
      active: false, startedAt: 0, until: 0, target: 0, lastAt: -999,
      count: 0, centerCount: 0, entryN: 0, reason: '', nearN: 0, nearHp: 0
    },
    th: null,
    cfg: {
      tickMs: 250,
      primeCap: 250,
      primeMaxSec: 18,
      harvest1Sec: 8,
      leftBreakMaxSec: 90,
      centerTimeoutSec: 85,
      rechargeCap: 100,
      healHp: 80,
      maxHeals: 3,
      healCooldownSec: 12,
      // 微操参数：喂弹量 = base + 威胁血量*hp + 威胁数量*n，封顶 max
      feedMaxSec: 3.5,
      feedMinSec: 1.8,
      feedCooldownSec: 4,
      feedTargetBase: 45,
      feedTargetPerHp: 3,
      feedTargetPerEnemy: 2,
      feedTargetMax: 220,
      feedEmergencyCap: 22,
      threatRange: 250, // 距绿 x3 喂弹道 250 内的小怪算“压线”（按观众可见范围，不是玩家贴身）
      levels: 4
    }
  };
  window.__zdksAuto = A;

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
  function discoverLanes() {
    var right = worldX('trigger_wall_1_17');
    var left = worldX('trigger_wall_1_14');
    var c1 = worldX('trigger_wall_1_1');
    var c2 = worldX('trigger_wall_1_11');
    var center = (c1 != null && c2 != null) ? (c1 + c2) / 2 : (c1 != null ? c1 : c2);
    return {
      prime: right != null ? right : 673,
      left: left != null ? left : 221,
      center: center != null ? center : 460
    };
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
      // worldToScreen 返回画布后备存储像素；Cocos 输入也按后备比例还原，
      // 且会把设备 DPR 封顶（实测手机 DPR3 时画布是 2x）。
      // 用 canvas.width / CSS宽 做严格逆变换，手机高 DPR 下才不会点偏。
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
    // 点按钮框中心，而不是文字锚点（大厅入口文字贴在按钮最左边）
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

  // ---------- 动作 ----------
  function moveTo(st, x) {
    try {
      if (!st || !st._cup || x == null) return;
      var dx = (x - st._cup._position.x) / (st._cup.moveRatio || 1.6);
      if (Math.abs(dx) > 0.01) st.moveCup(dx, 0);
    } catch (e) { A.errN++; A.err = 'move:' + (e && e.message); }
  }

  // 走位巡逻：在目标车道附近连续小幅摆动，观众看到杯子一直在走位，
  // 同时不脱离红闸/×16 的命中区。
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
    console.log('[zdks] buffs: atk+50%, spd+20%');
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
    A.healed = true; // 兼容战报字段
    try { v.onClickADBtn(); console.log('[zdks] heal +100 #' + A.heals); } catch (e) { A.errN++; A.err = 'heal:' + (e && e.message); }
  }

  // ---------- 反应式微操：小怪压线 -> 回绿 x3 喂弹 -> 够数回红闸 ----------
  function enemyThreat(st) {
    var p = st.players[0];
    var list = st.enemies || [];
    var limit = (A.lanes ? A.lanes.prime : 642) + A.cfg.threatRange;
    var nearN = 0, nearHp = 0, minX = 1e9;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !e.config) continue;
      var x = 1e9;
      try {
        if (e.node && e.node.getWorldPosition) x = e.node.getWorldPosition().x;
        else if (e.position) x = e.position.x;
      } catch (err) { }
      if (x < limit) {
        nearN++;
        nearHp += (e.config.hp || 1);
        if (x < minX) minX = x;
      }
    }
    return { nearN: nearN, nearHp: nearHp, minX: minX, limit: limit, cap: p._capacity };
  }
  function feedStart(st, gateLeft, th, t, why) {
    if (A.feed.active) return false;
    if (gateLeft != null && gateLeft <= 15) return false; // 红闸快破，先打完
    var p = st.players[0];
    // 中心阶段是拿武器 8 的关键：只在中盘或真急时回防，且最多 2 次
    if (A.phase === 'center') {
      var urgent = p._capacity < 80 || p.hp < 120;
      var mid = gateLeft != null && gateLeft <= 130;
      if (A.feed.centerCount >= 1 && !urgent) return false;
      if (A.feed.centerCount >= 2) return false;
      if (!urgent && !mid) return false;
    }
    var cold = (t - A.feed.lastAt) < A.cfg.feedCooldownSec;
    var emergency = p._capacity < A.cfg.feedEmergencyCap && th.nearN > 0;
    if (cold && !emergency) return false;
    A.feed.active = true;
    A.feed.startedAt = t;
    var maxSec = A.phase === 'center' ? Math.min(A.cfg.feedMaxSec, 2.5) : A.cfg.feedMaxSec;
    A.feed.until = t + maxSec;
    if (A.phase === 'center') A.feed.centerCount++;
    A.feed.entryN = th.nearN;
    A.feed.target = Math.min(A.cfg.feedTargetMax,
      A.cfg.feedTargetBase + th.nearHp * A.cfg.feedTargetPerHp + th.nearN * A.cfg.feedTargetPerEnemy);
    A.feed.reason = why;
    A.feed.nearN = th.nearN;
    A.feed.nearHp = th.nearHp;
    console.log('[zdks] feed start #' + (A.feed.count + 1) + ' why=' + why +
      ' t=' + Math.round(t * 10) / 10 + ' near=' + th.nearN + '/' + th.nearHp + 'hp cap=' + p._capacity +
      ' target=' + A.feed.target);
    return true;
  }
  function feedStep(st, t, th) {
    if (!A.feed.active) return false;
    patrolTo(st, A.lanes.prime, 12, 1.6);
    var p = st.players[0];
    var elapsed = t - A.feed.startedAt;
    var reduced = th.nearN <= Math.max(2, Math.floor((A.feed.entryN || 0) * 0.55));
    var done = (th.nearN <= 2) || (t >= A.feed.until) || (p._capacity >= A.feed.target && reduced);
    if (elapsed >= A.cfg.feedMinSec && done) {
      A.feed.active = false;
      A.feed.lastAt = t;
      A.feed.count++;
      console.log('[zdks] feed done #' + A.feed.count + ' t=' + Math.round(t * 10) / 10 +
        ' cap=' + p._capacity + ' near=' + th.nearN + ' elapsed=' + Math.round(elapsed * 10) / 10 + 's');
    }
    return true;
  }
  function maybeFeed(st, gateLeft, t, th) {
    if (feedStep(st, t, th)) return true;
    var p = st.players[0];
    var why = null;
    if (p._capacity < A.cfg.feedEmergencyCap && th.nearN > 0) why = 'ammo';
    else if (th.nearN >= 8) why = 'wave';
    else if (th.nearHp >= 28) why = 'hpwave';
    if (why && feedStart(st, gateLeft, th, t, why)) {
      console.log('[zdks] dash red -> green feed lane');
      patrolTo(st, A.lanes.prime, 12, 1.6);
      return true;
    }
    return false;
  }

  // ---------- 相位机 ----------
  function setPhase(p, t) {
    if (A.phase === p) return;
    A.phase = p; A.phaseT0 = t;
    if (p !== 'leftBreak' && p !== 'center') A.feed.active = false;
    console.log('[zdks] phase -> ' + p + ' @t' + t);
  }
  A.tick = function () {
    if (!A.live) return;
    var st = findState();
    if (!st) { A.errN++; A.err = 'no-state'; return; }
    if (!A.lanes) {
      A.lanes = discoverLanes();
      A.t0 = st.pastTime;
      A.phaseT0 = st.pastTime;
      console.log('[zdks] lanes ' + JSON.stringify(A.lanes));
    }
    var t = st.pastTime || 0;
    var p = st.players[0];
    applyBuffs(st);
    maybeHeal(st);

    // 胜负（先判，避免死后还发指令）
    // 击杀数达标即算赢：最后一两只可能还在死亡动画里，不能等 enemies.length===0
    // （实测 t=164 kill=869 left=0 en=1 时游戏已结算，等 en=0 会错过结算瞬间）
    var won = (st._status === 4 || st._status === 7) ||
      (st._leftEnemyCount <= 0 && st.killCount >= st.totalEnemyCount);
    function finalRow(tag) {
      A.rows.push({
        t: Math.round(t * 10) / 10, ph: 'over', x: Math.round(st._cup._position.x * 10) / 10,
        cap: p._capacity, hp: p.hp, kill: st.killCount, left: st._leftEnemyCount,
        en: st.enemies ? st.enemies.length : null, cup: st._cup._count,
        gL: null, gC: null, wid: p.config ? p.config.id : null, heal: A.healed,
        status: st._status, final: tag
      });
    }
    if (won) {
      A.over = 'WIN t=' + Math.round(t * 10) / 10 + ' kill=' + st.killCount + '/' + st.totalEnemyCount + ' hp=' + p.hp;
      finalRow(A.over);
      A.live = false; clearInterval(A._id);
      console.log('[zdks] ' + A.over);
      return;
    }
    if (st._status !== 1) {
      A.over = 'LOSE st=' + st._status + ' t=' + Math.round(t * 10) / 10 + ' kill=' + st.killCount + '/' + st.totalEnemyCount + ' hp=' + p.hp + ' left=' + st._leftEnemyCount + ' en=' + (st.enemies ? st.enemies.length : '?');
      finalRow(A.over);
      A.live = false; clearInterval(A._id);
      console.log('[zdks] ' + A.over);
      return;
    }

    var gLeft = gateCap('trigger_wall_1_14');
    var gC1 = gateCap('trigger_wall_1_1');
    var gC2 = gateCap('trigger_wall_1_11');
    var gC = (gC1 == null && gC2 == null) ? null : (gC1 || 0) + (gC2 || 0);
    var se = t - A.phaseT0;
    var th = enemyThreat(st);
    A.th = th;

    switch (A.phase) {
      case 'boot':
        setPhase('prime', t);
        patrolTo(st, A.lanes.prime, 12, 1.6);
        break;
      case 'prime':
        patrolTo(st, A.lanes.prime, 12, 1.6);
        if (p._capacity >= A.cfg.primeCap || t >= A.cfg.primeMaxSec) setPhase('leftBreak', t);
        break;
      case 'leftBreak':
        if (gLeft != null && gLeft <= 0) { setPhase('harvest1', t); break; }
        // 小怪压线/弹药见底：先回绿 x3 喂一轮，够数再回左红闸
        // 先让观众看到杯子确实去红闸干活，至少 3 秒后再响应小怪
        if (se >= 3 && maybeFeed(st, gLeft, t, th)) { A.recharge = false; break; }
        if (!A.recharge && p._capacity < 8 && p.hp < 110) { A.recharge = true; }
        if (A.recharge) {
          patrolTo(st, A.lanes.prime, 12, 1.6);
          if (p._capacity >= A.cfg.rechargeCap) { A.recharge = false; console.log('[zdks] recharge done @t' + Math.round(t * 10) / 10); }
        } else {
          patrolTo(st, A.lanes.left, 12, 2.0);
        }
        if (se > A.cfg.leftBreakMaxSec) setPhase('harvest1', t);
        break;
      case 'harvest1':
        // 收割这 8 秒是弹药命脉，杯子踩正 ×16 位，不摆
        moveTo(st, A.lanes.left);
        if (se >= A.cfg.harvest1Sec) setPhase('center', t);
        break;
      case 'center':
        // 中心红闸期间同样响应小怪：绿 x3 喂弹 -> 回中心
        if (se >= 3 && maybeFeed(st, gC, t, th)) break;
        // 中心是拿武器 8 的硬时限：踩正中心位，不摆；走位靠中盘那一次短喂
        moveTo(st, A.lanes.center);
        if (p.config && p.config.id === 8) { setPhase('final', t); break; }
        if (gC != null && gC <= 0 && se > 3) { setPhase('final', t); break; }
        if (se > A.cfg.centerTimeoutSec) setPhase('final', t);
        break;
      case 'final':
        // ×16 是弹药命脉：弹量充足时小幅走位；低于 450 立刻回正位猛喂，清最后的大怪
        if (p._capacity > 450) patrolTo(st, A.lanes.left, 8, 1.6);
        else moveTo(st, A.lanes.left);
        break;
      default:
        setPhase('prime', t);
    }

    // 记账（500ms 一拍）
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
        gL: gLeft,
        gC: gC,
        wid: p.config ? p.config.id : null,
        heal: A.healed,
        feed: A.feed.active ? 1 : 0,
        feedN: A.feed.count,
        near: th.nearN,
        nearHp: th.nearHp,
        capT: A.feed.target,
        status: st._status
      });
      if (A.rows.length > 2400) A.rows.splice(0, 600);
    }
    A.n++;
  };
  A.pull = function () {
    var o = A.rows.length ? A.rows[A.rows.length - 1] : {};
    return {
      over: A.over, phase: A.phase, lanes: A.lanes, healed: A.healed,
      t: o.t, x: o.x, cap: o.cap, hp: o.hp, kill: o.kill, left: o.left,
      en: o.en, cup: o.cup, wid: o.wid, gL: o.gL, gC: o.gC,
      feed: A.feed.active ? 1 : 0, feedN: A.feed.count, feedReason: A.feed.reason,
      feedTarget: A.feed.target, near: A.th ? A.th.nearN : null,
      nearHp: A.th ? A.th.nearHp : null,
      n: A.n, errN: A.errN, err: A.err
    };
  };
  A.stop = function () { if (A._id) clearInterval(A._id); A.live = false; };

  A._id = setInterval(A.tick, A.cfg.tickMs);
  console.log('[zdks] strategy v3 boot (patrol movement + denser feed cycles; HUD removed by request)');
})();
};
