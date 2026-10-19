// zdks-nav.js —— 页面内导航/读数工具（只读游戏状态，不修改游戏代码或内存）
// 依赖全局 cc（Cocos 3.x）。由 zdks-boot.js 调用。
(function () {
  'use strict';
  if (window.__zdksNav && window.__zdksNav.v === 1) return;
  var N = { v: 1 };

  function scene() {
    try { return cc.director.getScene(); } catch (e) { return null; }
  }
  function compClass(c) {
    try { return cc.js.getClassName(c); } catch (e) { return ''; }
  }
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

  // 取节点的世界包围盒中心（按钮 pivot 不一定在中心）
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

  // 世界坐标 -> 浏览器 CSS 像素（严格逆变换，适配 DPR / canvas 偏移）
  function domOfNode(node) {
    if (!node) return null;
    try {
      var s = scene();
      var wp = boundsCenter(node);
      var anc = node, canvasNode = null;
      while (anc && anc !== s) {
        var cn = compClass(anc);
        if (anc.name === 'Canvas' || cn === 'cc.Canvas') { canvasNode = anc; break; }
        anc = anc.parent;
      }
      if (!canvasNode) return null;
      var cam = null;
      for (var i = 0; i < (canvasNode.children || []).length; i++) {
        var c = canvasNode.children[i].getComponent(cc.Camera);
        if (c) { cam = c; break; }
      }
      if (!cam) return null;
      var v = new cc.Vec3();
      cam.worldToScreen(wp, v);
      var el = (cc.game && cc.game.canvas) || document.getElementById('GameCanvas');
      var rc = (el && el.getBoundingClientRect) ? el.getBoundingClientRect()
        : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      // Cocos 的相机/输入都以画布后备存储像素为准，且会把 DPR 封顶（实测手机 DPR3 时画布是 2x）。
      // 所以用 canvas.width / CSS宽 还原，不能用 window.devicePixelRatio。
      var sx = (el && rc.width) ? (el.width / rc.width) : 1;
      var sy = (el && rc.height) ? (el.height / rc.height) : 1;
      return {
        x: Math.round(rc.left + v.x / sx),
        y: Math.round(rc.top + rc.height - v.y / sy)
      };
    } catch (e) { return null; }
  }

  function findTextNode(text) {
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
  }

  // 按文本找可点区域：排除富文本里的同名子串，优先祖先带按钮的
  N.textDom = function (text) {
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
    // 点按钮框中心，而不是文字锚点：大厅左侧入口的文字贴在最左边，
    // 按文字坐标会点在按钮外；向上找 btn* / cc.Button 祖先。
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
    return domOfNode(target);
  };

  // 升级奖励三选一：卡牌文字是图片，不能按文本找；按 card_dialog 的节点结构点中间那张
  N.rewardDom = function () {
    var dlg = findNode('card_dialog');
    if (!dlg || !dlg.activeInHierarchy) return null;
    var items = [];
    (function walk(n, d) {
      if (d > 4) return;
      if (/^item(-\d+)?$/.test(n.name || '') && n.activeInHierarchy) items.push(n);
      for (var j = 0; j < (n.children || []).length; j++) walk(n.children[j], d + 1);
    })(dlg, 0);
    if (!items.length) return null;
    var pick = items[Math.floor(items.length / 2)];
    return domOfNode(pick);
  };

  N.levelButtonDom = function (levelText, kinds) {
    var label = findTextNode(levelText);
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
        if (ch.name === kinds[kk] && ch.activeInHierarchy) return { kind: ch.name, dom: domOfNode(ch) };
      }
    }
    return null;
  };

  N.retryDom = function () {
    var n = findNode('sure_btn2');
    if (!n || !n.activeInHierarchy) return null;
    return domOfNode(n);
  };

  N.stateSnap = function () {
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

  N.backToHall = function () {
    var v = findComp('Game11ChallengeView');
    if (v && v.node && v.node.activeInHierarchy) { try { v.onClickBackBtn(); return true; } catch (e) { return false; } }
    return false;
  };
  N.closeEnd = function () {
    var v = findComp('Game11EndView');
    if (v && v.node && v.node.activeInHierarchy) { try { v.onClickCloseBtn(); return true; } catch (e) { return false; } }
    return false;
  };
  // 结算面板结果：'win' / 'lose' / 'end' / null（面板未激活）
  N.endResult = function () {
    var v = findComp('Game11EndView');
    if (!v || !v.node || !v.node.activeInHierarchy) return null;
    var text = '';
    (function walk(n, d) {
      if (d > 8) return;
      for (var i = 0; i < (n.components || []).length; i++) {
        var c = n.components[i];
        if (compClass(c) === 'cc.Label' && typeof c.string === 'string') text += c.string + '\n';
      }
      for (var j = 0; j < (n.children || []).length; j++) walk(n.children[j], d + 1);
    })(v.node, 0);
    if (/挑战成功|通关成功|胜利/.test(text)) return 'win';
    if (/挑战失败|失败|未通关/.test(text)) return 'lose';
    return 'end';
  };

  window.__zdksNav = N;
})();
