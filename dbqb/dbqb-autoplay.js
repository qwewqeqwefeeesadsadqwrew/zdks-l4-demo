// 夺宝奇兵 · 自动玩（v15）
// 进关：FairyGUI 节点 fireClick（图标 slot_7 → 开始按钮）；策略：页面内循环；不改游戏本体
(function(){
  'use strict';
  function fgRoot(){
    var fg=System.get('chunks:///_virtual/fairygui.mjs');
    return fg&&fg.GRoot&&fg.GRoot.inst;
  }
  function findByText(root, txt, name){
    var hit=null;
    function walk(n){
      if(!n||hit) return;
      try{ if(n.text&&String(n.text).trim()===txt&&(!name||n.name===name)) hit=n; }catch(e){}
      var kids=n._children||[];
      for(var i=0;i<kids.length;i++) walk(kids[i]);
    }
    walk(root);
    return hit;
  }
  function fireUp(node){
    for(var p=node;p;p=p.parent){ if(typeof p.fireClick==='function'){ p.fireClick(); return true; } }
    return false;
  }
  function startStrategy(YT){
    if(window.__dbqb) clearInterval(window.__dbqb);
  window.__dbqbLog=[]; window.__dbqbErr=null; window.__dbqbStart=Date.now(); window.__dbqbDrops=[]; window.__dbqbKilled=[];
  let lastPlayers=0; const seenHp={}; let cur=null;
  const SKIP=[701,702,703,704,705,708,710,201,707,711,709];
  const VAL={303:100,302:90,304:88,305:86,306:84,307:82,308:80,309:78,310:76,311:74,312:72,313:70,314:68,315:66,316:64,317:62,318:60,319:58,320:56,
    101:80,102:80,103:80,104:80,105:80,106:80,107:80,108:80,109:80,110:80,706:80,
    401:60,402:60,403:60,404:60,405:60,406:60,
    501:40,502:40,503:40,601:40,602:40,603:40};
  function val(r){ return VAL[r]!==undefined?VAL[r]:50; }
  function alive(b){ return b && !b.isDead && b.node && b.node.active; }
  window.__dbqb=setInterval(function(){
    try{
      const st=YT.logic.state;
      if(!st||st.gameOver){clearInterval(window.__dbqb);window.__dbqb=null;return;}
      const pl=st.players.find(function(p){return !p.isDead;}); if(!pl) return;
      if(st.players.length<lastPlayers) window.__dbqbDrops.push([+((Date.now()-window.__dbqbStart)/1000).toFixed(1),lastPlayers,st.players.length]);
      lastPlayers=st.players.length;
      const px=st.level.playerRoot.position.x;
      const pz=pl.node.worldPosition.z;
      for(const b of st.buckets){
        const key=b.node.uuid; if(!key) continue;
        if(seenHp[key]!==undefined && seenHp[key]>0 && (b.isDead||b.hp<=0)) window.__dbqbKilled.push([+((Date.now()-window.__dbqbStart)/1000).toFixed(1),b.rewardId]);
        seenHp[key]=b.hp;
      }
      const danger=[];
      for(const b of st.buckets){
        if(!alive(b)) continue;
        const dz=b.node.worldPosition.z-pz;
        if(dz>-8&&dz<2) danger.push({x:b.node.worldPosition.x,dz:dz,hp:b.hp,rid:b.rewardId});
      }
      // 目标承诺
      let tb=null;
      if(cur && alive(cur)){
        const dz=cur.node.worldPosition.z-pz;
        if(dz>=-26&&dz<=-3.5) tb=cur;
      }
      if(!tb){
        let best=-1e9;
        for(const b of st.buckets){
          if(!alive(b)) continue;
          if(SKIP.indexOf(b.rewardId)>=0) continue;
          const dz=b.node.worldPosition.z-pz;
          if(dz<-26||dz>-3.5) continue;
          // 太近又太厚，打不完
          if(dz>-6 && b.hp>90) continue;
          const sc=val(b.rewardId)*1.0 - Math.abs(dz)*0.5 - b.hp*0.03;
          if(sc>best){best=sc;tb=b;}
        }
      }
      cur=tb;
      let threat=null,tBest=1e9;
      for(const e of st.enemies){
        if(e.isDead) continue;
        const ep=e.node.worldPosition,dz=ep.z-pz;
        if(dz>-3&&dz<1.5){
          const d=Math.abs(ep.x-px)+Math.abs(dz)*0.8;
          if(d<tBest){tBest=d;threat=e;}
        }
      }
      let tx=px,mode='idle';
      const imm=danger.filter(function(d){return d.dz>-3.5;});
      if(imm.length){
        const left=imm.filter(function(d){return d.x<0;}).length;
        const right=imm.filter(function(d){return d.x>0;}).length;
        if(left===0&&right===0)tx=0;
        else if(left===0)tx=-3.5;
        else if(right===0)tx=3.5;
        else tx=0;
        mode='dodge';
      } else if(tb){
        tx=tb.node.worldPosition.x; mode='hit:'+tb.rewardId+':'+tb.hp;
      } else if(threat){
        tx=threat.node.worldPosition.x; mode='kill-near';
      } else {
        let cnt=0,ax=0;
        for(const e of st.enemies){
          if(e.isDead) continue;
          const ep=e.node.worldPosition,dz=ep.z-pz;
          if(dz>-5&&dz<2.5){ax+=ep.x;cnt++;}
        }
        if(cnt){mode='evade';tx=ax/cnt>px?px-1.2:px+1.2;}
        else if(Math.abs(px)>1)tx=px-Math.sign(px)*0.5;
      }
      tx=Math.max(-3.65,Math.min(3.65,tx));
      const step=Math.max(-1.6,Math.min(1.6,tx-px));
      st.playerMove(step);
      window.__dbqbLog.push([+((Date.now()-window.__dbqbStart)/1000).toFixed(1),mode,+(px).toFixed(2),st.killEnemyCount,st.players.length,pl.hp]);
      if(window.__dbqbLog.length>3000) window.__dbqbLog.shift();
    }catch(e){window.__dbqbErr=String(e); clearInterval(window.__dbqb);}
  },60);
  return 'v15 started';

  }
  function boot(){
    var phase=0, t0=Date.now();
    var timer=setInterval(function(){
      try{
        var m=System.get('chunks:///_virtual/YT.ts');
        var YT=m&&m.YT;
        if(!YT||!YT.logic) return;
        var st=YT.logic.state;
        if(st&&st.players&&st.players.length>0){clearInterval(timer);startStrategy(YT);return;}
        var root=fgRoot();
        if(!root) return;
        if(phase===0&&YT.logic._updatable){
          var icon=findByText(root,'夺宝奇兵','slot_7');
          if(icon&&fireUp(icon)){phase=1;t0=Date.now();}
        } else if(phase===1&&Date.now()-t0>1500){
          var start=findByText(root,'开始');
          if(start&&fireUp(start)){phase=2;t0=Date.now();}
        } else if(phase===2&&Date.now()-t0>15000){
          phase=3;
          try{ YT.logic.onEnterMoreGame(103,1); }catch(e){}
        }
      }catch(e){}
    },700);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
