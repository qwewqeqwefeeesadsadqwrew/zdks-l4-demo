// zdks-netq.js —— 并发限流（演示站专用，不改游戏逻辑）
// 背景：雷电模拟器自带的“发行浏览器”（WebView 146）访问 GitHub Pages 时，HTTP/2 大文件
// 并发请求会把连接压死：单独下载 2.3MB 的引擎脚本约 19 秒能完成，但几十个请求一起发就永远卡住。
// 这里在页面最前面把 XHR、fetch、动态 <script> 排成小队列（最多同时 2 个），避免连接被压垮。
(function () {
  'use strict';
  if (window.__zdksNetq) return;

  var MAX = 2;          // 同时进行的请求数上限
  var SLOT_MS = 45000;  // 单个请求占槽最长时间；到点只放行后面的请求，不中止原请求
  var active = 0;
  var q = [];

  function run(fn) {
    active++;
    var released = false;
    function release() {
      if (released) return;
      released = true;
      active--;
      var n = q.shift();
      if (n) run(n);
    }
    var timer = setTimeout(release, SLOT_MS);
    try { fn(function () { clearTimeout(timer); release(); }); }
    catch (e) { clearTimeout(timer); release(); throw e; }
  }
  function enqueue(fn) {
    if (active < MAX) run(fn); else q.push(fn);
  }

  // 1) XMLHttpRequest：引擎下载资源主要走它
  var XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    var xhr = this, args = arguments;
    enqueue(function (release) {
      xhr.addEventListener('loadend', release);
      XS.apply(xhr, args);
    });
  };

  // 2) fetch
  if (window.fetch) {
    var F = window.fetch;
    window.fetch = function () {
      var args = arguments;
      return new Promise(function (resolve, reject) {
        enqueue(function (release) {
          F.apply(window, args).then(function (r) { resolve(r); release(); },
            function (e) { reject(e); release(); });
        });
      });
    };
  }

  // 3) 动态插入的 <script src>：SystemJS 用它加载引擎虚拟模块
  var AP = Node.prototype.appendChild;
  Node.prototype.appendChild = function (node) {
    try {
      if (node && node.tagName === 'SCRIPT' && node.src && !node.__zdksQueued) {
        node.__zdksQueued = true;
        var src = node.getAttribute('src');
        node.removeAttribute('src');
        enqueue(function (release) {
          var fired = false;
          function rel() { if (fired) return; fired = true; release(); }
          node.addEventListener('load', rel);
          node.addEventListener('error', rel);
          node.setAttribute('src', src);
        });
      }
    } catch (e) { }
    return AP.apply(this, arguments);
  };

  window.__zdksNetq = { max: MAX };
})();
