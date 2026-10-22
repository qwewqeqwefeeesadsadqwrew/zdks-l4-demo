(function(){
  'use strict';
  function fgRoot(){var fg=System.get('chunks:///_virtual/fairygui.mjs');return fg&&fg.GRoot&&fg.GRoot.inst;}
  function findByText(root,txt,name){var hit=null;function walk(n){if(!n||hit)return;try{if(n.text&&String(n.text).trim()===txt&&(!name||n.name===name))hit=n;}catch(e){}var k=n._children||[];for(var i=0;i<k.length;i++)walk(k[i]);}walk(root);return hit;}
  function fireUp(node){for(var p=node;p;p=p.parent){if(typeof p.fireClick==='function'){p.fireClick();return true;}}return false;}
  function startStrategy(YT){

    var seed=((Date.now()%2147483647)^((window.__roundNo||1)*2654435761))>>>0;
    var rng=(function(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};})(seed);
    var pref=['role','atk','spd'][Math.floor(rng()*3)];
    var jitter=8+rng()*24;
    var dodgeBase=0.5+rng()*1.0;
    var centerBias=0.2+rng()*0.8;
    var sig=[seed,pref,jitter.toFixed(4),dodgeBase.toFixed(4),centerBias.toFixed(4)].join('|');
    if(window.__lastSig===sig&&window.__roundInfo){ seed=(seed+7919)>>>0; window.__roundInfo={round:window.__roundNo,seed:seed,pref:pref,jitter:+jitter.toFixed(3),dodgeBase:+dodgeBase.toFixed(3),centerBias:+centerBias.toFixed(3),reseeded:true}; }
    window.__lastSig=sig;
    if(!window.__roundInfo||window.__roundInfo.round!==window.__roundNo) window.__roundInfo={round:window.__roundNo,seed:seed,pref:pref,jitter:+jitter.toFixed(3),dodgeBase:+dodgeBase.toFixed(3),centerBias:+centerBias.toFixed(3)};
    if(window.__dbqb) clearInterval(window.__dbqb);
  window.__dbqbLog=[]; window.__dbqbErr=null; window.__dbqbStart=Date.now(); window.__dbqbDrops=[]; window.__dbqbKilled=[];
  window.__bigStart=null; window.__bigDur=0;
  // 本局随机偏好：先打哪一侧的桶、红蓝门往哪边推（每局重新随机，保证操作不重复）
  window.__lanePref = Math.random() < 0.5 ? -1 : 1;
  window.__blockPref = Math.random() < 0.5 ? 0 : 1;
  window.__switchedToLv2 = false;
  window.__mergedLv2 = false; window.__mergeOK = false; window.__mergeErr = null;
  // 前期无敌：每 50ms 把血量拉满；到最后一个 Boss 才解开（之后让 Boss 打死）
  window.__godOff = false;
  if(window.__godTimer) clearInterval(window.__godTimer);
  window.__godTimer = setInterval(function(){
    if(window.__godOff) return;
    try{
      const s2=YT.logic.state;
      if(!s2||!s2.players) return;
      for(const p of s2.players){ if(p&&!p.isDead&&p.hp<10) p.hp=10; }
    }catch(e){}
  },50);
  let lastPlayers=0; const seenHp={}; let cur=null;
  const SKIP=[];
  const ROLE=[101,102,103,104,105,106,107,108,109,110,706];
  const VAL={303:100,302:90,304:88,305:86,306:84,307:82,308:80,309:78,310:76,311:74,312:72,313:70,314:68,315:66,316:64,317:62,318:60,319:58,320:56,
    101:80,102:80,103:80,104:80,105:80,106:80,107:80,108:80,109:80,110:80,706:80,
    401:60,402:60,403:60,404:60,405:60,406:60,
    501:40,502:40,503:40,601:40,602:40,603:40};
  function val(r){ return VAL[r]!==undefined?VAL[r]:50; }
  function alive(b){ return b && !b.isDead && b.node && b.node.active; }
  window.__stratTimer=setInterval(function(){
    try{
      const st=YT.logic.state;
      const pl=st.players.find(function(p){return !p.isDead;});
      if(!pl) return;
      const px=st.level.playerRoot.position.x;
      const pz=pl.node.worldPosition.z;
      const rnd=Math.random;
      const prefBonus=function(r){ if(ROLE.indexOf(r)>=0)return 30; if(pref==='atk'&&r>=300&&r<400)return 25; if(pref==='spd'&&r>=400&&r<500)return 25; return 0; };
      // 终局 Boss：血量 >50 万的 Boss
      let boss3=null;
      for(const e of st.enemies){ if(!e.isDead&&e.isBoss&&e.hp>500000){boss3=e;break;} }
      // 最后一个 Boss 露脸时解开无敌（之后会被它打死，演示"打到最后一关才牺牲"）
      if(!window.__godOff&&st.config&&st.enemies.some(function(e){return !e.isDead&&e.isBoss;})){
        const remain=(st.config.boss_count||0)-st.killedBossCount;
        if(remain<=1){ window.__godOff=true; window.__dbqbLog.push([+((Date.now()-window.__dbqbStart)/1000).toFixed(1),'god-off',+px.toFixed(2),st.killEnemyCount,st.players.length,pl.hp]); }
      }
      // 第一关加载后，把第二关的地图整块接到它后面（运行时合并成一张长地图，不是换关）
      if(st.config&&st.config.id===1&&!window.__mergedLv2&&st.level&&st.level.node&&st.level.node.name==='level_002'){
        window.__mergedLv2=true;
        try{
          const cc=window.cc;
          const bundle=cc&&cc.assetManager&&cc.assetManager.getBundle('game103');
          if(bundle){
            bundle.load('prefabs/levels/level_007',cc.Prefab,function(err,prefab){
              if(err){window.__mergeErr=String(err);return;}
              try{
                const s2=YT.logic.state;
                const node=cc.instantiate(prefab);
                // 第一关地图从 +25 延伸到 -665，第二关整块平移到 -700 之后接上
                node.setPosition(0,0,-700);
                s2.level.levelRoot.addChild(node);
                // 合并后总 Boss 数 = 第一关 3 + 第二关 4 = 7，否则打满 3 个就提前判通关
                if(s2.config){ s2.config.boss_count=(s2.config.boss_count||3)+4; }
                const bm=System.get('chunks:///_virtual/G103Bucket.ts');
                const bk=System.get('chunks:///_virtual/G103Block.ts');
                const gm=System.get('chunks:///_virtual/EnemyGroupCmp.ts');
                const Bucket=bm&&(bm.G103Bucket||bm.default);
                const Block=bk&&(bk.G103Block||bk.default);
                const Group=gm&&(gm.default||gm.EnemyGroupCmp);
                if(Bucket){const nb=node.getComponentsInChildren(Bucket);nb.forEach(function(b){try{b.onInit()}catch(e){}});s2.buckets=s2.buckets.concat(nb);}
                if(Block){const nbl=node.getComponentsInChildren(Block);nbl.forEach(function(b){try{b.onInit()}catch(e){}});s2.blocks=s2.blocks.concat(nbl);}
                if(Group){const ng=node.getComponentsInChildren(Group);ng.forEach(function(g){try{g.startMove()}catch(e){}});s2.enemyGroups=s2.enemyGroups.concat(ng);}
                window.__mergeOK=true;
                window.__dbqbLog.push([+((Date.now()-window.__dbqbStart)/1000).toFixed(1),'merge-lv2',0,0,0,0]);
              }catch(e){window.__mergeErr=String(e);}
            });
          }
        }catch(e){window.__mergeErr=String(e);}
      }
      const pl0=st.players.find(function(p){return !p.isDead;});
      const bossClose=!!(boss3&&pl0&&Math.abs(boss3.node.worldPosition.z-pl0.node.worldPosition.z)<9);
      const danger=[];
      for(const b of st.buckets){
        if(!alive(b)) continue;
        const dz=b.node.worldPosition.z-pz;
        if(dz>-8&&dz<2) danger.push({x:b.node.worldPosition.x,dz:dz,hp:b.hp,rid:b.rewardId});
      }
      // 最后一个大桶（2000 血）：打 4.5~5.2 秒随机再躲；桶逼近 4 单位时硬保险强制躲
      let bigBucket=null;
      for(const b of st.buckets){ if(alive(b)&&b.hp>=1000){bigBucket=b;break;} }
      if(bigBucket){
        const bdz=bigBucket.node.worldPosition.z-pz;
        if(bdz>-26&&bdz<1.5){
          if(!window.__bigStart){ window.__bigStart=Date.now(); window.__bigDur=2.5+Math.random()*1.0; }
          const bigElapsed=(Date.now()-window.__bigStart)/1000;
          if(bigElapsed>window.__bigDur||bdz>-4){
            const bx=bigBucket.node.worldPosition.x;
            let escapeX=bx>=0?-3.5:3.5;
            // 对面车道也有桶逼近时，往中间躲，避免撞上另一个
            for(const ob of st.buckets){
              if(ob===bigBucket||!alive(ob)) continue;
              const odz=ob.node.worldPosition.z-pz;
              if(odz>-20&&odz<2&&Math.abs(ob.node.worldPosition.x-escapeX)<2.2){ escapeX=0; break; }
            }
            st.playerMove(Math.max(-1.6,Math.min(1.6,escapeX-px)));
            window.__dbqbLog.push([+((Date.now()-window.__dbqbStart)/1000).toFixed(1),'dodge-big',+px.toFixed(2),st.killEnemyCount,st.players.length,pl.hp]);
            return;
          }
        }
      }
      // 目标承诺
      let tb=null;
      if(cur && alive(cur)){
        const dz=cur.node.worldPosition.z-pz;
        if(dz>=-30&&dz<=1.5) tb=cur;
      }
      if(!tb){
        const cands=[];
        for(const b of st.buckets){
          if(!alive(b)) continue;
          const dz=b.node.worldPosition.z-pz;
          if(dz<-30||dz>1.5) continue;
          cands.push({b:b,d:Math.abs(dz)});
        }
        if(cands.length){
          cands.sort(function(x,y){return x.d-y.d;});
          // 两个桶都在射程内时，优先本局偏好那一侧（每局随机，操作不重复）
          const top=cands.slice(0,2);
          if(top.length>1&&st.players.length>=10&&Math.abs(top[0].d-top[1].d)<2&&Math.sign(top[1].b.node.worldPosition.x)===window.__lanePref){
            tb=top[1].b;
          } else {
            tb=top[0].b;
          }
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
      if(bossClose){ var bx=boss3.node.worldPosition.x; st.playerMove(Math.max(-3.65,Math.min(3.65,bx))-px); return; }
      // 非终局 Boss 贴脸：平滑躲开
      let nearBoss=null;
      for(const e of st.enemies){
        if(e.isDead||!e.isBoss) continue;
        if(e.hp>500000) continue;
        const dz=e.node.worldPosition.z-pz;
        if(dz>-10&&dz<3){ nearBoss=e; break; }
      }
      // 危险桶（还活着且快经过玩家）
      const dangerBuckets=[];
      for(const b of st.buckets){
        if(!alive(b)||b.hp<=0) continue;
        const dz=b.node.worldPosition.z-pz;
        if(dz>-8&&dz<0) dangerBuckets.push({x:b.node.worldPosition.x,dz:dz});
      }
      // 红蓝门：进入射程就按本局随机的方向站边（0=站右边推到左端，1=站左边推到右端）
      let blockNear=null;
      if(!tb){
        for(const bl of st.blocks){
          if(!bl||!bl.node||!bl.node.active) continue;
          const dz=bl.node.worldPosition.z-pz;
          if(dz>-22&&dz<2&&bl.progress>0.03&&bl.progress<0.97){ blockNear=bl; break; }
        }
      }
      if(dangerBuckets.some(function(d){return Math.abs(d.x-px)<2.0;})){
        let nearest=null;
        for(const d of dangerBuckets){ if(!nearest||d.dz>nearest.dz) nearest=d; }
        const safeX=(nearest&&nearest.x>=0)?-3.5:3.5;
        tx=px+Math.max(-0.65,Math.min(0.65,safeX-px)); mode='dodge-bucket';
      } else if(nearBoss){
        tx=px+(nearBoss.node.worldPosition.x>px?-0.8:0.8); mode='dodge-boss';
      } else if(blockNear){
        tx=(window.__blockPref===0)?2.2:-2.2; mode='block:'+window.__blockPref+':'+Number(blockNear.progress).toFixed(2);
      } else if(tb){
        tx=tb.node.worldPosition.x+Math.sin(Date.now()/280+seed%1000)*0.28; mode='hit:'+tb.rewardId+':'+tb.hp;
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
    }catch(e){window.__dbqbErr=String(e); clearInterval(window.__stratTimer); window.__stratTimer=null;}
  },60);
  }
  function boot(){
    var phase=0, tClick=0;
    setInterval(function(){
      try{
        try{ var cfgM=System.get('chunks:///_virtual/G103LevelConfig.ts'); if(cfgM&&cfgM.G103LevelConfig){ var dd=cfgM.G103LevelConfig.data; if(dd[1]&&dd[1].players)dd[1].players[0]=3; if(dd[2]&&dd[2].players)dd[2].players[0]=3; } }catch(e){}
        var m=System.get('chunks:///_virtual/YT.ts');
        var YT=m&&m.YT; if(!YT||!YT.logic) return;
        var st=YT.logic.state;
        if(st&&st.players&&st.players.length>0){
          if(!window.__stratTimer){
            window.__roundNo=(window.__roundNo||0)+1;
            window.__roundStart=Date.now();
            startStrategy(YT);
          }
          return;
        }
        if(st&&st.gameOver){
          if(window.__stratTimer){clearInterval(window.__stratTimer);window.__stratTimer=null;}
          if(window.__lastRec!==window.__roundNo){
            window.__lastRec=window.__roundNo;
            window.__roundResults=window.__roundResults||[];
            window.__roundResults.push({round:window.__roundNo,kills:st.killEnemyCount,boss:st.killedBossCount,players:st.players.length,ts:Date.now()});
          }
          var root=fgRoot();
          if(root){var btn=findByText(root,'再次挑战');if(btn)fireUp(btn);}
          return;
        }
        if(YT.logic._updatable&&!window.__stratTimer){
          var r2=fgRoot(); if(!r2) return;
          if(phase===0){var icon=findByText(r2,'夺宝奇兵','slot_7');if(icon&&fireUp(icon)){phase=1;tClick=Date.now();}}
          else if(phase===1&&Date.now()-tClick>1500){var start=findByText(r2,'开始');if(start&&fireUp(start)){phase=2;tClick=Date.now();}}
        }
      }catch(e){}
    },700);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
