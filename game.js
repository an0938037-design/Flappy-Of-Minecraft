const ASSETS = 'pjt1/';

const OBSTACLE_FILES = [
  'bn1-12-a-2.png','bn1-12-b-2.png','bv1-1-o-3.png','bv2-2-a-3.png',
  'bv3-12-a-3.png','bv3-12-b-3.png','mn1-2-o-4.png','mv2-2-b-3.png','tn1-2-o-4.png'
];

const CHAPTERS = [
  { id:1, duration:120, baseMinSpeed:150, baseMaxSpeed:200 },
  { id:2, duration:120, baseMinSpeed:225, baseMaxSpeed:300 }
];

const CHAR_MAP = {
  bee:{ crt:'nvo1.jpg', logo:'logo1.png', label:'BEE' },
  parrot:{ crt:'nvo2.jpg', logo:'logo2.png', label:'PARROT' },
  bat:{ crt:'nvo3.jpg', logo:'logo3.png', label:'BAT' }
};

const GROUND_FILES = { gs0:'gs0.png', gs1:'gs1.png', dt0:'dt0.png', se0:'se0.png', cl0:'cl0.png', in0:'in0.png' };

function parseObstacleName(name) {
  const m = name.match(/^([bmt])([vnd])(\d+)-(\d+)-([a-z])-(\d+)\.png$/);
  if (!m) return null;
  return {
    pos:m[1], type:m[2], id:parseInt(m[3]),
    chapters:m[4].split('').map(Number),
    group:m[5], maxPerZone:parseInt(m[6])
  };
}

function rand(a,b){return a+Math.random()*(b-a)}
function randInt(a,b){return Math.floor(rand(a,b+1))}

// ========== ASSET MANAGER ==========
class AssetManager {
  constructor() {
    this.images = {};
    this.obstacles = [];
    this.ready = false;
  }

  load(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => { console.warn('Failed:', src); resolve(null); };
      img.src = src;
    });
  }

  async init() {
    const groundKeys = Object.keys(GROUND_FILES);
    const groundPromises = groundKeys.map(async (k) => {
      this.images[k] = await this.load(ASSETS + 'ground/' + GROUND_FILES[k]);
    });
    await Promise.all(groundPromises);

    for (const f of OBSTACLE_FILES) {
      const data = parseObstacleName(f);
      if (!data) continue;
      const img = await this.load(ASSETS + 'obc/' + f);
      this.obstacles.push({ ...data, img, file:f });
    }

    for (const [ch,map] of Object.entries(CHAR_MAP)) {
      this.images['crt_'+ch] = await this.load(ASSETS + 'crt/' + map.crt);
      this.images['logo_'+ch] = await this.load(ASSETS + 'logo/' + map.logo);
    }

    this.images.clouds = await this.load(ASSETS + 'clouds/cloud1.png');

    this.ready = true;
  }

  getCrt(charId) { return this.images['crt_'+charId]; }
  getLogo(charId) { return this.images['logo_'+charId]; }
  getGround(key) { return this.images[key]; }
}

// ========== CLOUD GENERATOR ==========
function createCloudTexture(w,h) {
  const c = document.createElement('canvas');
  c.width=w; c.height=h;
  const cx=c.getContext('2d');
  const s=Math.max(4,w/10);
  cx.fillStyle='rgba(255,255,255,0.55)';
  const shape=[
    [0,0,1,1,0,0],
    [0,1,1,1,1,0],
    [1,1,1,1,1,1],
    [0,1,1,1,1,0],
    [0,0,1,1,0,0]
  ];
  const cols=shape[0].length, rows=shape.length;
  const ox=(w-cols*s)/2, oy=(h-rows*s)/2;
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) if(shape[y][x]) cx.fillRect(ox+x*s,oy+y*s,s,s);
  return c;
}

class Cloud {
  constructor(canvasW,canvasH) {
    this.img=createCloudTexture(rand(60,120),rand(30,60));
    this.x=rand(canvasW,canvasW+300);
    this.y=rand(20,canvasH*0.3);
    this.speed=rand(15,35);
  }
  update(dt,speedMul){this.x-=this.speed*dt*speedMul}
}

// ========== TERRAIN ==========
class Terrain {
  constructor() {
    this.cols=new Map();
    this.offset=0;
    this.chunkSize=30;
    this.oreCount={cl0:0,in0:0};
    this.oreMax={cl0:3,in0:2};
    this.zoneOreReset=0;
  }

  generateColumn(idx) {
    const layers=[];
    layers[0]='gs0';
    const r2=Math.random();
    let l1=r2<0.15?'cl0':r2<0.3?'se0':'dt0';
    if(l1==='cl0'&&this.oreCount.cl0>=this.oreMax.cl0) l1='dt0';
    else if(l1==='cl0') this.oreCount.cl0++;
    layers[1]=l1;
    const r3=Math.random();
    let l2=r3<0.12?'in0':r3<0.25?'se0':'dt0';
    if(l2==='in0'&&this.oreCount.in0>=this.oreMax.in0) l2='dt0';
    else if(l2==='in0') this.oreCount.in0++;
    layers[2]=l2;
    layers[3]='se0'; layers[4]='se0';
    return layers;
  }

  resetOreCount(){this.oreCount={cl0:0,in0:0}}

  getCol(idx) {
    if(!this.cols.has(idx)) this.cols.set(idx,this.generateColumn(idx));
    return this.cols.get(idx);
  }

  setPath(startX,endX) {
    const bs=this.blockSize||Math.floor(800*0.04);
    if(bs<4) return;
    const si=Math.floor(this.offset/bs)+Math.floor(startX/bs);
    const ei=Math.floor(this.offset/bs)+Math.ceil(endX/bs);
    for(let i=si;i<=ei;i++){
      if(this.cols.has(i)){const l=this.cols.get(i);if(l[0]==='gs0')l[0]='gs1'}
    }
  }

  revertPath(startX,endX) {
    const bs=this.blockSize||Math.floor(800*0.04);
    if(bs<4) return;
    const si=Math.floor(this.offset/bs)+Math.floor(startX/bs);
    const ei=Math.floor(this.offset/bs)+Math.ceil(endX/bs);
    for(let i=si;i<=ei;i++){
      if(this.cols.has(i)){const l=this.cols.get(i);if(l[0]==='gs1')l[0]='gs0'}
    }
  }

  render(ctx,canvasW,canvasH) {
    if(!canvasW||!canvasH||canvasH<100) return;
    const bs=this.blockSize=Math.max(4,Math.floor(canvasH*0.04));
    const groundH=bs*5;
    const groundY=canvasH-groundH;
    const colsVisible=Math.ceil(canvasW/bs)+4;
    const startCol=Math.floor(this.offset/bs);

    for(let i=-2;i<colsVisible;i++){
      const colIdx=startCol+i;
      const col=this.getCol(colIdx);
      const x=i*bs-(this.offset%bs);
      for(let ly=0;ly<5;ly++){
        const y=groundY+ly*bs;
        const key=col[ly];
        const tex=assets?assets.getGround(key):null;
        if(tex){
          try{ctx.drawImage(tex,x,y,bs,bs)}catch(e){
            ctx.fillStyle='#8B6914';ctx.fillRect(x,y,bs,bs);
          }
        } else {
          const colors={'se0':'#666','dt0':'#8B6914','cl0':'#333','in0':'#c8a06e','gs0':'#4a4','gs1':'#a0845c'};
          ctx.fillStyle=colors[key]||'#555';
          ctx.fillRect(x,y,bs,bs);
          ctx.strokeStyle='rgba(0,0,0,0.25)';
          ctx.strokeRect(x+0.5,y+0.5,bs-1,bs-1);
        }
      }
    }
  }

  update(dt,speed){this.offset+=speed*dt}
}

// ========== BIRD ==========
class Bird {
  constructor() {
    this.x=0; this.y=0;
    this.vy=0;
    this.w=0; this.h=0;
    this.gravity=0;
    this.jumpForce=0;
    this.cooldown=0;
    this.cooldownMax=0.4;
    this.rotation=0;
  }

  init(canvasW,canvasH) {
    if(!canvasW||!canvasH||canvasH<50) {canvasW=800;canvasH=600}
    this.blockRef=Math.max(4,Math.floor(canvasH*0.04));
    this.w=this.blockRef;
    this.h=this.blockRef;
    this.x=canvasW*0.2;
    this.y=canvasH*0.35;
    this.vy=0;
    this.gravity=canvasH*0.75;
    this.jumpForce=-canvasH*1.0;
    this.rotation=0;
    this.cooldown=0;
  }

  flap() {
    if(this.cooldown>0) return;
    this.vy=this.jumpForce;
    this.rotation=-0.4;
    this.cooldown=this.cooldownMax;
  }

  update(dt) {
    this.vy+=this.gravity*dt;
    this.y+=this.vy*dt;
    if(this.cooldown>0) this.cooldown-=dt;
    this.rotation+=(0-this.rotation)*5*dt;
    if(this.rotation>1.2) this.rotation=1.2;
    if(this.rotation<-0.4) this.rotation=-0.4;
  }

  render(ctx,charId) {
    ctx.save();
    ctx.translate(this.x+this.w/2,this.y+this.h/2);
    ctx.rotate(this.rotation);
    const img=assets?assets.getCrt(charId||'bee'):null;
    if(img){
      try{ctx.drawImage(img,-this.w/2,-this.h/2,this.w,this.h)}catch(e){
        ctx.fillStyle='#FFD700';ctx.beginPath();ctx.arc(0,0,this.w/2,0,Math.PI*2);ctx.fill();
      }
    } else {
      ctx.fillStyle='#FFD700'; ctx.beginPath();
      ctx.arc(0,0,this.w/2,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#8B6914';
      for(let i=0;i<3;i++) ctx.fillRect(-this.w/4+10*i,-4,6,8);
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(6,-6,4,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  getBounds() {
    const s=this.blockRef||this.w;
    return { x:this.x, y:this.y, w:s, h:s };
  }
}

// ========== OBSTACLE MANAGER ==========
class ObstacleManager {
  constructor() {
    this.active=[];
    this.zones=[];
    this.zoneIdx=0;
    this.currentZone=null;
    this.zoneSpawnIdx=0;
    this.nextSpawnX=0;
    this.generatedZones=0;
  }

  generateZone(chapterId) {
    const pool=assets.obstacles.filter(o=>o.chapters.includes(chapterId));
    if(!pool.length) return [];

    const counts={b:0,t:0,m:0};
    const used={};
    for(const o of pool) used[o.file]=0;

    const shuffled=[...pool];
    for(let i=shuffled.length-1;i>0;i--){const j=randInt(0,i);[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]]}

    const zone=[];
    const maxTotal=randInt(10,20);

    for(const o of shuffled){
      if(zone.length>=maxTotal) break;
      if(counts[o.pos]>= {b:8,t:9,m:4}[o.pos]) continue;
      if(o.maxPerZone>0&&used[o.file]>=o.maxPerZone) continue;
      zone.push(o);
      counts[o.pos]++; used[o.file]++;
    }

    if(zone.length<5){
      for(const o of pool){
        if(zone.length>=10) break;
        if(counts[o.pos]>= {b:8,t:9,m:4}[o.pos]) continue;
        zone.push(o); counts[o.pos]++;
      }
    }

    return zone;
  }

  initZones(chapterId) {
    this.zones=[];
    this.zoneIdx=0;
    this.zoneSpawnIdx=0;
    this.nextSpawnX=0;
    this.active=[];
    this.generatedZones=0;

    for(let i=0;i<4;i++){
      const zone=this.generateZone(chapterId);
      if(zone.length) this.zones.push(zone);
    }
    this.currentZone=this.zones[0]||[];
  }

  getNextObstacle() {
    if(!this.currentZone||this.zoneSpawnIdx>=this.currentZone.length){
      this.zoneIdx++;
      this.generatedZones++;
      if(this.zoneIdx>=this.zones.length) this.zones.push(this.generateZone(game.currentChapter));
      this.currentZone=this.zones[this.zoneIdx]||[];
      this.zoneSpawnIdx=0;
      if(!this.currentZone.length) return null;
    }
    return this.currentZone[this.zoneSpawnIdx++];
  }

  spawnNext(canvasW,canvasH) {
    const data=this.getNextObstacle();
    if(!data) return;

    const img=data.img;
    if(!img||!img.naturalWidth) return;

    const bs=Math.max(4,Math.floor(canvasH*0.04));
    const groundH=bs*5;
    const groundY=canvasH-groundH;
    const birdW=bs;

    let x=this.nextSpawnX;
    const lastObs=this.active[this.active.length-1];
    if(lastObs){
      const lastP=lastObs.data.pos, currP=data.pos;
      let minGap=birdW*2;
      if(lastP!==currP){
        const p=lastP+currP;
        if(p==='mt'||p==='tm') minGap=birdW*1.5;
        else if(p==='mb'||p==='bm') minGap=birdW*2.5;
      }
      const desiredX=lastObs.x+lastObs.img.naturalWidth+minGap;
      if(x<desiredX) x=desiredX+rand(20,60);
    }
    if(x<canvasW) x=canvasW+rand(20,80);

    let y;
    switch(data.pos){
      case 'b': y=Math.min(groundY-img.naturalHeight,canvasH-img.naturalHeight); if(y<0) y=0; break;
      case 'm': y=Math.max(10,Math.min(rand(canvasH*0.3,canvasH*0.7),canvasH-img.naturalHeight-10)); break;
      case 't': y=0; break;
    }

    const obs={ data, img, x, y };
    this.active.push(obs);

    const sp=rand(120,200);
    this.nextSpawnX=x+img.naturalWidth+sp;
  }

  update(dt,speed) {
    for(let i=this.active.length-1;i>=0;i--){
      this.active[i].x-=speed*dt;
      if(this.active[i].x+this.active[i].img.naturalWidth< -100) this.active.splice(i,1);
    }
  }

  render(ctx) {
    for(const o of this.active){
      if(o.data.pos==='b') continue;
      if(o.img) ctx.drawImage(o.img,o.x,o.y);
      else {
        ctx.fillStyle='#888'; ctx.fillRect(o.x,o.y,60,60);
        ctx.fillStyle='#fff'; ctx.font='10px monospace';
        ctx.fillText('['+o.data.pos+o.data.type+']',o.x+5,o.y+30);
      }
    }
  }

  checkCollision(birdBounds) {
    for(const o of this.active){
      const img=o.img;
      if(!img) continue;
      const pad=5;
      const ob={ x:o.x+pad, y:o.y+pad, w:img.naturalWidth-pad*2, h:img.naturalHeight-pad*2 };
      if(birdBounds.x<ob.x+ob.w&&birdBounds.x+birdBounds.w>ob.x&&
         birdBounds.y<ob.y+ob.h&&birdBounds.y+birdBounds.h>ob.y) return true;
    }
    return false;
  }

  getPassed(birdX) {
    let count=0;
    for(const o of this.active){
      if(!o.passed&&o.x+o.img.naturalWidth<birdX){ o.passed=true; count++; }
    }
    return count;
  }

  renderFront(ctx) {
    for(const o of this.active){
      if(o.data.pos==='b'){
        if(o.img) ctx.drawImage(o.img,o.x,o.y);
      }
    }
  }

  isLastObstacleOffScreen() {
    if(!this.active.length) return true;
    return this.active[this.active.length-1].x+this.active[this.active.length-1].img.naturalWidth<0;
  }

  zonesCompleted(){return this.generatedZones}
}

// ========== DAY/NIGHT CYCLE ==========
class DayNightCycle {
  getColor(chapterId,elapsed,duration) {
    if(!duration||duration<=0) return '#78A7FF';
    const p=Math.min(1,elapsed/duration);
    if(chapterId===1){
      if(p<0.8) return '#78A7FF';
      return lerpColor('#78A7FF','#FFA07A',(p-0.8)/0.2);
    } else {
      if(p<0.1) return lerpColor('#FFA07A','#111147',p/0.1);
      return '#111147';
    }
  }
}

function lerpColor(c1,c2,t){
  t=Math.max(0,Math.min(1,t));
  const r1=parseInt(c1.slice(1,3),16),g1=parseInt(c1.slice(3,5),16),b1=parseInt(c1.slice(5,7),16);
  const r2=parseInt(c2.slice(1,3),16),g2=parseInt(c2.slice(3,5),16),b2=parseInt(c2.slice(5,7),16);
  const r=Math.round(r1+(r2-r1)*t),g=Math.round(g1+(g2-g1)*t),b=Math.round(b1+(b2-b1)*t);
  return '#'+r.toString(16).padStart(2,'0')+g.toString(16).padStart(2,'0')+b.toString(16).padStart(2,'0');
}

// ========== HAND TRACKER ==========
class HandTracker {
  constructor() {
    this.hands=null;
    this.running=false;
    this.lastGesture='';
    this.gestureCooldown=0;
    this.landmarks=null;
    this.smoothX=0; this.smoothY=0;
    this.hasHand=false;
  }

  async init(camera,callback) {
    try {
      this.hands=new Hands({
        locateFile:(f)=>'https://cdn.jsdelivr.net/npm/@mediapipe/hands/'+f
      });
      this.hands.setOptions({
        maxNumHands:1, modelComplexity:1,
        minDetectionConfidence:0.5, minTrackingConfidence:0.5
      });
      const self=this;
      this.hands.onResults((results)=>{
        if(results.multiHandLandmarks&&results.multiHandLandmarks.length>0){
          self.landmarks=results.multiHandLandmarks[0];
          self.hasHand=true;
          const cx=self.landmarks[9].x;
          const cy=self.landmarks[9].y;
          const smoothed=camera.smoothPosition(cx,cy);
          self.smoothX=smoothed.x;
          self.smoothY=smoothed.y;
          const isOpen=self.detectOpen();
          const gesture=isOpen?'open':'fist';
          if(gesture!==self.lastGesture){
            self.lastGesture=gesture;
            if(callback) callback(gesture);
          }
        } else {
          self.hasHand=false;
        }
      });
      camera.onFrame=async (video,shouldProcess)=>{
        if(shouldProcess&&self.hands&&self.running){
          try{await self.hands.send({image:video})}catch(e){}
        }
      };
      await camera.start();
      this.running=true;
    } catch(e){
      console.warn('Hand tracking init failed:',e);
      this.running=false;
    }
  }

  detectOpen() {
    if(!this.landmarks) return false;
    let extended=0;
    const tips=[4,8,12,16,20];
    const palm=this.landmarks[0];
    for(const tip of tips){
      const d=Math.hypot(this.landmarks[tip].x-palm.x,this.landmarks[tip].y-palm.y);
      if(d>0.15) extended++;
    }
    return extended>=3;
  }

  stop(){
    this.running=false;
    if(this.hands) try{this.hands.close()}catch(e){}
  }
}

// ========== MAIN GAME ==========
class Game {
  constructor() {
    this.state='menu';
    this.selectedChar='bee';
    this.currentChapter=1;
    this.currentZone=0;
    this.score=0;
    this.highScore=parseInt(localStorage.getItem('fom_highscore')||'0');
    this.chapterTimer=0;
    this.currentSpeed=0;

    this.canvas=document.getElementById('gameCanvas');
    this.ctx=this.canvas.getContext('2d');
    this.logoCanvas=document.getElementById('logoCanvas');
    this.logoCtx=this.logoCanvas.getContext('2d');

    this.bird=new Bird();
    this.terrain=new Terrain();
    this.obstacles=new ObstacleManager();
    this.dayNight=new DayNightCycle();
    this.clouds=[];
    this.handTracker=new HandTracker();
    this.camera=new Camera(document.getElementById('webcamVideo'));

    this.lastTime=0;
    this.chapterProgress=0;
    this.oreTimer=0;
    this.rafId=null;
    this.countdownTimer=null;
    this.chapterTimeout=null;
    this.webcamRafId=null;

    this.setupUI();
    this.setupControls();
  }

  setupControls() {
    const tapFlap=()=>{if(this.state==='playing')this.bird.flap()};
    this.canvas.addEventListener('click',tapFlap);
    this.canvas.addEventListener('touchstart',(e)=>{e.preventDefault();tapFlap()},{passive:false});
  }

  setupUI() {
    document.querySelectorAll('.char-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        document.querySelectorAll('.char-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedChar=btn.dataset.char;
        this.renderLogo();
      });
    });

    document.getElementById('playBtn').addEventListener('click',()=>this.startGame());
  }

  renderLogo() {
    const c=this.logoCanvas,ctx=this.logoCtx;
    ctx.clearRect(0,0,c.width,c.height);
    const img=assets.getLogo(this.selectedChar);
    if(img) ctx.drawImage(img,0,0,c.width,c.height);
    else {
      ctx.fillStyle='#333'; ctx.fillRect(0,0,c.width,c.height);
      ctx.fillStyle='#ffd700'; ctx.font='16px monospace'; ctx.textAlign='center';
      ctx.fillText('['+this.selectedChar+' logo]',c.width/2,45);
    }
  }

  async startGame() {
    const playBtn=document.getElementById('playBtn');
    playBtn.classList.add('hidden');
    document.getElementById('webcam-area').style.display='flex';

    try{
      await this.handTracker.init(this.camera,(gesture)=>{
        if(this.state==='playing'&&gesture==='open') this.bird.flap();
      });
    }catch(e){
      console.warn('Camera fallback:',e);
    }

    this.renderLogo();
    this.renderWebcamFeed();
    this.startCountdown();
  }

  startCountdown() {
    this.state='countdown';
    document.getElementById('char-select').style.display='none';
    if(this.countdownTimer){clearInterval(this.countdownTimer);this.countdownTimer=null}

    let count=3;
    const drawCount=()=>{
      this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
      this.ctx.fillStyle='#78A7FF';
      this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
      this.ctx.fillStyle='#ffd700';
      this.ctx.font='bold 80px "Press Start 2P",monospace';
      this.ctx.textAlign='center';
      this.ctx.shadowColor='#8b6914';
      this.ctx.shadowBlur=8;
      if(count>0) this.ctx.fillText(count+'...',this.canvas.width/2,this.canvas.height/2);
      else this.ctx.fillText('GO!',this.canvas.width/2,this.canvas.height/2);
      this.ctx.shadowBlur=0;
    };
    drawCount();

    this.countdownTimer=setInterval(()=>{
      count--;
      if(count<0){ clearInterval(this.countdownTimer);this.countdownTimer=null; this.beginPlay(); return; }
      drawCount();
    },1000);
  }

  beginPlay() {
    if(this.rafId){cancelAnimationFrame(this.rafId);this.rafId=null}
    this.state='playing';
    this.score=0;
    this.currentChapter=1;
    this.currentZone=0;
    this.chapterProgress=0;
    this.oreTimer=0;

    const ch=CHAPTERS[0];
    this.chapterTimer=ch.duration;
    this.currentSpeed=ch.baseMinSpeed;

    this.canvas.width=this.canvas.offsetWidth;
    this.canvas.height=this.canvas.offsetHeight;
    this.bird.init(this.canvas.width,this.canvas.height);
    this.terrain.blockSize=Math.max(4,Math.floor(this.canvas.height*0.04));
    this.terrain.offset=0;
    this.terrain.cols.clear();
    this.terrain.resetOreCount();

    this.obstacles.initZones(1);
    this.obstacles.nextSpawnX=this.canvas.width+50;

    this.clouds=[];
    for(let i=0;i<6;i++) this.clouds.push(new Cloud(this.canvas.width,this.canvas.height));
    if(!this.camera.running) this.camera.start().catch(()=>{});

    this.lastTime=performance.now();
    this._loop(this.lastTime);
  }

  _loop(timestamp) {
    this.rafId=requestAnimationFrame((t)=>this._loop(t));
    const dt=Math.min((timestamp-this.lastTime)/1000,0.05);
    this.lastTime=timestamp;
    this.update(dt);
    this.render();
  }

  update(dt) {
    if(this.state==='playing'){
      this.chapterTimer=Math.max(0,this.chapterTimer-dt);

      const ch=CHAPTERS[this.currentChapter-1];
      this.chapterProgress=ch?Math.max(0,1-this.chapterTimer/ch.duration):0;
      this.currentSpeed=ch.baseMinSpeed+(ch.baseMaxSpeed-ch.baseMinSpeed)*this.chapterProgress;

      this.terrain.update(dt,this.currentSpeed*0.5);
      this.oreTimer+=dt;
      const curZone=Math.floor(this.oreTimer/10);
      if(curZone!==this.terrain.zoneOreReset){this.terrain.resetOreCount();this.terrain.zoneOreReset=curZone}

      this.bird.update(dt);

      this.obstacles.update(dt,this.currentSpeed);
      const lastObs=this.obstacles.active[this.obstacles.active.length-1];
      if(!lastObs||lastObs.x+lastObs.img.naturalWidth<this.canvas.width){
        this.obstacles.spawnNext(this.canvas.width,this.canvas.height);
      }

      this.score+=this.obstacles.getPassed(this.bird.x);

      const bb=this.bird.getBounds();
      const bs=Math.max(4,Math.floor(this.canvas.height*0.04));
      const groundY=this.canvas.height-bs*5;
      if(bb.y+bb.h>=groundY||bb.y<=0){ this.gameOver(); return; }
      if(this.obstacles.checkCollision(bb)){ this.gameOver(); return; }

      if(this.chapterTimer<=0||this.obstacles.zonesCompleted()>=4){
        this.chapterComplete();
        return;
      }

      if(!this._villageObs) this._villageObs=new Set();
      let hasActiveVillage=false;
      for(const o of this.obstacles.active){
        if(o.data.pos==='b'&&o.data.type==='v'){
          const id=o.data.file+'_'+Math.floor(o.x/100);
          if(!this._villageObs.has(id)){
            this.terrain.setPath(o.x,o.x+o.img.naturalWidth);
            this._villageObs.add(id);
          }
          hasActiveVillage=true;
        }
      }
      if(!hasActiveVillage&&this._villageObs.size){
        this.terrain.revertPath(0,this.canvas.width*2);
        this._villageObs.clear();
      }

      this.updateUI();
    }

    for(const c of this.clouds) c.update(dt,this.currentSpeed/100);
    this.clouds=this.clouds.filter(c=>c.x>-200);
    while(this.clouds.length<6) this.clouds.push(new Cloud(this.canvas.width,this.canvas.height));
  }

  render() {
    const ctx=this.ctx;
    const w=this.canvas.width, h=this.canvas.height;
    if(!w||!h) return;

    const ch=CHAPTERS[this.currentChapter-1];
    const skyDuration=ch?ch.duration:40;
    const skyElapsed=skyDuration*this.chapterProgress;
    const skyColor=this.dayNight.getColor(this.currentChapter,skyElapsed,skyDuration);
    ctx.fillStyle=skyColor;
    ctx.fillRect(0,0,w,h);

    for(const c of this.clouds) if(c.img) ctx.drawImage(c.img,c.x,c.y);

    if(this.state==='playing'||this.state==='gameover'||this.state==='chaptercomplete'){
      this.terrain.render(ctx,w,h);
      this.obstacles.render(ctx);
      this.bird.render(ctx,this.selectedChar);
      this.obstacles.renderFront(ctx);
    }
  }

  renderWebcamFeed() {
    if(this.webcamRafId){cancelAnimationFrame(this.webcamRafId);this.webcamRafId=null}
    const wcCanvas=document.getElementById('webcamCanvas');
    const wcCtx=wcCanvas.getContext('2d');
    const video=document.getElementById('webcamVideo');

    const draw=()=>{
      if(!this.camera.running){this.webcamRafId=requestAnimationFrame(draw);return}
      if(wcCanvas.offsetWidth){
        wcCanvas.width=wcCanvas.offsetWidth;
        wcCanvas.height=wcCanvas.offsetHeight;
        wcCtx.drawImage(video,0,0,wcCanvas.width,wcCanvas.height);

        if(this.handTracker.landmarks){
          const lm=this.handTracker.landmarks;
          for(let i=0;i<lm.length;i++){
            wcCtx.fillStyle='#0f0';
            wcCtx.beginPath();
            wcCtx.arc(lm[i].x*wcCanvas.width,lm[i].y*wcCanvas.height,4,0,Math.PI*2);
            wcCtx.fill();
          }
          const connections=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[0,9],
            [9,10],[10,11],[11,12],[0,13],[13,14],[14,15],[15,16],[0,17],[17,18],[18,19],[19,20],
            [5,9],[9,13],[13,17]];
          wcCtx.strokeStyle='#0f0'; wcCtx.lineWidth=2;
          for(const [a,b] of connections){
            wcCtx.beginPath();
            wcCtx.moveTo(lm[a].x*wcCanvas.width,lm[a].y*wcCanvas.height);
            wcCtx.lineTo(lm[b].x*wcCanvas.width,lm[b].y*wcCanvas.height);
            wcCtx.stroke();
          }
        }
      }
      this.webcamRafId=requestAnimationFrame(draw);
    };
    draw();
  }

  updateUI() {
    document.getElementById('scoreDisplay').textContent=this.score;
    document.getElementById('highScoreDisplay').textContent=this.highScore;
    document.getElementById('chapterDisplay').textContent=this.currentChapter;
    document.getElementById('timerDisplay').textContent=Math.ceil(this.chapterTimer);
    const ch=CHAPTERS[this.currentChapter-1];
    if(ch) document.getElementById('speedDisplay').textContent=((ch.baseMinSpeed+(ch.baseMaxSpeed-ch.baseMinSpeed)*this.chapterProgress)/100).toFixed(1);
  }

  gameOver() {
    if(this.state==='gameover') return;
    this.state='gameover';
    this.camera.resetSmoothing();
    if(this.rafId){cancelAnimationFrame(this.rafId);this.rafId=null}
    if(this.score>this.highScore){
      this.highScore=this.score;
      localStorage.setItem('fom_highscore',String(this.highScore));
    }

    const ctx=this.ctx;
    const w=this.canvas.width, h=this.canvas.height;
    ctx.fillStyle='rgba(0,0,0,0.6)';
    ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#ff4444';
    ctx.font='bold 40px "Press Start 2P",monospace';
    ctx.textAlign='center';
    ctx.shadowColor='#000'; ctx.shadowBlur=10;
    ctx.fillText('GAME OVER',w/2,h/2-30);
    ctx.fillStyle='#fff';
    ctx.font='20px "Press Start 2P",monospace';
    ctx.fillText('Score: '+this.score,w/2,h/2+30);
    ctx.shadowBlur=0;

    document.getElementById('playBtn').classList.remove('hidden');
    document.getElementById('playBtn').textContent='↻ PLAY AGAIN';
    document.getElementById('char-select').style.display='flex';

    this.handTracker.stop();
  }

  chapterComplete() {
    if(this.chapterTimeout){clearTimeout(this.chapterTimeout);this.chapterTimeout=null}
    if(this.currentChapter>=CHAPTERS.length){
      this.state='gameover';
      const ctx=this.ctx;
      ctx.fillStyle='rgba(0,0,0,0.5)';
      ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
      ctx.fillStyle='#ffd700';
      ctx.font='30px "Press Start 2P",monospace';
      ctx.textAlign='center';
      ctx.fillText('ALL CHAPTERS',this.canvas.width/2,this.canvas.height/2-20);
      ctx.fillText('COMPLETE!',this.canvas.width/2,this.canvas.height/2+30);
      return;
    }

    this.state='chaptercomplete';

    this.currentChapter++;
    this.currentZone=0;
    this.chapterProgress=0;
    this.oreTimer=0;
    this._villageObs=new Set();

    const ch=CHAPTERS[this.currentChapter-1];
    if(ch){
      this.chapterTimer=ch.duration;
      this.currentSpeed=ch.baseMinSpeed;
      this.terrain.resetOreCount();
      this.terrain.cols.clear();
      this.terrain.offset=0;
      this.obstacles.initZones(this.currentChapter);
      this.obstacles.nextSpawnX=this.canvas.width+50;
      this.bird.init(this.canvas.width,this.canvas.height);
      this.bird.vy=0;
      this.clouds=[];
      for(let i=0;i<6;i++) this.clouds.push(new Cloud(this.canvas.width,this.canvas.height));
    }

    this.state='playing';
  }
}

// ========== INIT ==========
const assets=new AssetManager();
let game;

async function init() {
  await assets.init();

  const canvas=document.getElementById('gameCanvas');
  const setCanvasSize=()=>{
    canvas.width=Math.max(100,canvas.offsetWidth);
    canvas.height=Math.max(100,canvas.offsetHeight);
  };
  setCanvasSize();
  setTimeout(setCanvasSize,100);

  game=new Game();
  game.renderLogo();

  document.getElementById('highScoreDisplay').textContent=game.highScore;

  window.addEventListener('resize',()=>{
    canvas.width=Math.max(100,canvas.offsetWidth);
    canvas.height=Math.max(100,canvas.offsetHeight);
    if(game.bird) game.bird.init(canvas.width,canvas.height);
  });

  document.addEventListener('keydown',(e)=>{
    if((e.code==='Space'||e.code==='ArrowUp')&&game.state==='playing'){
      e.preventDefault();
      game.bird.flap();
    }
  });
}

init();
