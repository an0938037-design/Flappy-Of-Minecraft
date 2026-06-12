const ASSETS = 'pjt1/';

const SCROLL_SPEED = 420;
const SPAWN_INTERVAL = 130;

const LOGICAL_W = 1000;
const LOGICAL_H = 600;
const BLOCK_SIZE = 40;
const GROUND_LAYERS = 5;
const GROUND_Y = LOGICAL_H - GROUND_LAYERS * BLOCK_SIZE;
const BIRD_SIZE = 45;
const OBSTACLE_MAX_PX = 170;
const OBSTACLE_MAX_PCT = 0.170;
const MAX_HEIGHT_BOTTOM = 236;
const MAX_HEIGHT_MID = 159;
const MAX_HEIGHT_TOP = 184;
const BIG_OBSTACLES = new Set(['bv1-1-o-3.png','bv2-2-a-3.png','bv3-12-a-3.png','bv3-2-b-3.png']);

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
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v))}
function lerp(a,b,t){return a+(b-a)*t}
function seededRandom(seed){let s=seed;return function(){s=(s*1664525+1013904223)&0xFFFFFFFF;return (s>>>0)/0xFFFFFFFF}}

// ========== TIGHT BOUNDING BOX ==========
function computeTightBoundingBox(src){
  const w=src.naturalWidth||src.width, h=src.naturalHeight||src.height;
  const c=document.createElement('canvas');
  c.width=w; c.height=h;
  const cx=c.getContext('2d');
  cx.drawImage(src,0,0);
  const d=cx.getImageData(0,0,w,h).data;
  let minX=w,minY=h,maxX=0,maxY=0;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    if(d[(y*w+x)*4+3]>200){
      if(x<minX)minX=x; if(x>maxX)maxX=x;
      if(y<minY)minY=y; if(y>maxY)maxY=y;
    }
  }
  return minX>maxX?null:{x:minX+3,y:minY+3,width:Math.max(1,maxX-minX-5),height:Math.max(1,maxY-minY-5)};
}

// ========== CHROMA KEY ==========
function createChromaKeyedImage(srcImg, keyColor, tolerance) {
  keyColor=keyColor||[0,255,0]; tolerance=tolerance||80;
  const c = document.createElement('canvas');
  c.width=srcImg.naturalWidth; c.height=srcImg.naturalHeight;
  const cx=c.getContext('2d');
  cx.drawImage(srcImg,0,0);
  const d=cx.getImageData(0,0,c.width,c.height);
  const data=d.data;
  for(let i=0;i<data.length;i+=4){
    const dist=Math.hypot(data[i]-keyColor[0],data[i+1]-keyColor[1],data[i+2]-keyColor[2]);
    if(dist<tolerance) data[i+3]=0;
  }
  cx.putImageData(d,0,0);
  return c;
}

// ========== ASSET MANAGER ==========
class AssetManager {
  constructor() {
    this.images = {};
    this.obstacles = [];
    this.ready = false;
  }

  load(src,label,doChroma) {
    return new Promise((resolve) => {
      const img = new Image();
      let done=false;
      const timer=setTimeout(()=>{if(!done){done=true;console.warn('⏱ Timeout:',src);resolve(null)}},5000);
      img.onload = () => {
        if(done) return; done=true; clearTimeout(timer);
        console.log('✓ Loaded:',src);
        if(doChroma){
          try{ resolve(createChromaKeyedImage(img)); return }catch(e){}
        }
        resolve(img);
      };
      img.onerror = () => {
        if(done) return; done=true; clearTimeout(timer);
        console.warn('✗ Failed:',src,label?'– placeholder for '+label:'');
        resolve(null);
      };
      img.src = src;
    });
  }

  async init(obstacleFiles,progressCb) {
    const total=Object.keys(GROUND_FILES).length+obstacleFiles.length+Object.keys(CHAR_MAP).length*2+2;
    let loaded=0;
    const done=(label)=>{loaded++;if(progressCb)progressCb(Math.floor(loaded/total*100),label)};

    const groundKeys = Object.keys(GROUND_FILES);
    const groundPromises = groundKeys.map(async (k) => {
      this.images[k] = await this.load(ASSETS + 'ground/' + GROUND_FILES[k],k);
      done(k);
    });
    await Promise.all(groundPromises);

    for (const f of obstacleFiles) {
      const data = parseObstacleName(f);
      if (!data) continue;
      const img = await this.load(ASSETS + 'obc/' + f,f,true);
      this.obstacles.push({ ...data, img, file:f, tightBBox: img?computeTightBoundingBox(img):null });
      done(f);
    }

    for (const [ch,map] of Object.entries(CHAR_MAP)) {
      this.images['crt_'+ch] = await this.load(ASSETS + 'crt/' + map.crt,ch+' crt',true);
      done(ch+' crt');
      this.images['logo_'+ch] = await this.load(ASSETS + 'logo/' + map.logo,ch+' logo');
      done(ch+' logo');
    }

    this.images.clouds = await this.load(ASSETS + 'clouds/cloud1.png','cloud');
    done('cloud');

    this.images.hp = await this.load(ASSETS + 'hp.png','hp');
    done('hp');

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
    this.seed=0;
    this.rng=null;
    this.zoneOreReset=0;
  }

  setSeed(seed){
    this.seed=seed;
    this.cols.clear();
    this.rng=seededRandom(seed);
  }

  generateColumn(idx) {
    const layers=[];
    layers[0]='se0'; layers[1]='se0';
    const r2=this.rng();
    layers[2]=r2<0.2?'se0':'dt0';
    const r3=this.rng();
    let l3='dt0';
    if(r3<0.05) l3='in0';
    else if(r3<0.1) l3='cl0';
    layers[3]=l3;
    layers[4]=this.rng()<0.1?'gs1':'gs0';
    return layers;
  }

  resetOreCount(){}

  getCol(idx) {
    if(!this.cols.has(idx)) this.cols.set(idx,this.generateColumn(idx));
    return this.cols.get(idx);
  }

  setPath(startX,endX) {
    const bs=BLOCK_SIZE;
    const si=Math.floor(this.offset/bs)+Math.floor(startX/bs);
    const ei=Math.floor(this.offset/bs)+Math.ceil(endX/bs);
    for(let i=si;i<=ei;i++){
      if(this.cols.has(i)){const l=this.cols.get(i);if(l[4]==='gs0')l[4]='gs1'}
    }
  }

  revertPath(startX,endX) {
    const bs=BLOCK_SIZE;
    const si=Math.floor(this.offset/bs)+Math.floor(startX/bs);
    const ei=Math.floor(this.offset/bs)+Math.ceil(endX/bs);
    for(let i=si;i<=ei;i++){
      if(this.cols.has(i)){const l=this.cols.get(i);if(l[4]==='gs1')l[4]='gs0'}
    }
  }

  render(ctx,canvasW,canvasH) {
    const bs=BLOCK_SIZE;
    const colsVisible=Math.ceil(canvasW/bs)+4;
    const startCol=Math.floor(this.offset/bs);

    for(let i=-2;i<colsVisible;i++){
      const colIdx=startCol+i;
      const col=this.getCol(colIdx);
      const x=i*bs-(this.offset%bs);
      for(let layer=0;layer<5;layer++){
        const y=canvasH-(layer+1)*bs;
        const key=col[layer];
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
    this.jumpFull=0;
    this.jumpHand=0;
    this.maxFallSpeed=0;
    this.cooldown=0;
    this.cooldownMax=0.2;
  }

  init(canvasW,canvasH) {
    const s=Math.max(8,BIRD_SIZE);
    this.w=s; this.h=s;
    this.x=150;
    this.y=canvasH*0.35;
    this.vy=0;
    const h6=canvasH/600;
    this.gravity=750*h6;
    this.jumpFull=390*h6;
    this.jumpHand=310*h6;
    this.maxFallSpeed=480*h6;
    this.cooldown=0;
  }

  flap(fullForce) {
    if(this.cooldown>0) return;
    this.vy=-(fullForce!==false?this.jumpFull:this.jumpHand);
    this.cooldown=this.cooldownMax;
  }

  update(dt,groundY) {
    this.vy+=this.gravity*dt;
    if(this.vy>this.maxFallSpeed) this.vy=this.maxFallSpeed;
    this.y+=this.vy*dt;
    if(this.cooldown>0) this.cooldown-=dt;
    if(this.y<0){this.y=0;this.vy=0}
    if(groundY!==undefined&&this.y+this.h>=groundY){
      this.y=groundY-this.h;
      this.vy=0;
      return true;
    }
    return false;
  }

  render(ctx,charId) {
    ctx.save();
    ctx.translate(this.x+this.w/2,this.y+this.h/2);
    ctx.rotate(clamp(this.vy*0.05,-0.3,0.5));
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
    return { x:this.x+8, y:this.y+8, w:this.w-16, h:this.h-16 };
  }
}

// ========== OBSTACLE MANAGER ==========
class ObstacleManager {
  constructor() {
    this.active=[];
    this.nextSpawnX=0;
  }

  getScaledDims(img,canvasW,pos,file) {
    const mulMap={'bv2-2-a-3.png':1.1,'bv3-12-a-3.png':1.8,'bv3-2-b-3.png':1.8};
    let mul=mulMap[file]||(BIG_OBSTACLES.has(file)?1.5:1);
    const maxW=Math.min(OBSTACLE_MAX_PX,Math.floor(canvasW*OBSTACLE_MAX_PCT))*mul;
    const nw=img.naturalWidth||img.width||50;
    const nh=img.naturalHeight||img.height||50;
    let targetW=Math.min(maxW,nw);
    let targetH=targetW*nh/nw;
    const maxH={b:MAX_HEIGHT_BOTTOM,m:MAX_HEIGHT_MID,t:MAX_HEIGHT_TOP}[pos]||MAX_HEIGHT_BOTTOM;
    if(targetH>maxH*mul){targetH=maxH*mul;targetW=targetH*nw/nh}
    return {w:targetW,h:targetH};
  }

  init(canvasW) {
    this.active=[];
    this.nextSpawnX=canvasW+80;
  }

  spawnNext(canvasW,canvasH) {
    const pool=assets.obstacles.filter(o=>o.img);
    if(!pool.length) return;
    const weighted=[];
    for(const o of pool){
      const w=o.type==='n'?5:1;
      for(let i=0;i<w;i++) weighted.push(o);
    }
    const data=weighted[randInt(0,weighted.length-1)];

    const dim=this.getScaledDims(data.img,canvasW,data.pos,data.file);
    const groundY=GROUND_Y;

    let x=this.nextSpawnX;
    const lastObs=this.active[this.active.length-1];
    if(lastObs){
      const minX=lastObs.x+lastObs.dim.w+10;
      if(x<minX) x=minX+10;
    }
    if(x<canvasW) x=canvasW+50;

    let y;
    switch(data.pos){
      case 'b': y=clamp(groundY-dim.h,0,groundY-dim.h); break;
      case 'm': y=clamp(rand(canvasH*0.3,canvasH*0.7),10,groundY-dim.h-10); break;
      case 't': y=0; break;
    }

    const obs={ data, img:data.img, x, y, dim };
    this.active.push(obs);
    this.nextSpawnX=x+dim.w+randInt(SPAWN_INTERVAL-20,SPAWN_INTERVAL+20);
  }

  update(dt,speed) {
    for(let i=this.active.length-1;i>=0;i--){
      this.active[i].x-=speed*dt;
      if(this.active[i].x+this.active[i].dim.w< -100) this.active.splice(i,1);
    }
  }

  render(ctx) {
    for(const o of this.active){
      if(o.data.pos==='b') continue;
      if(o.img) ctx.drawImage(o.img,o.x,o.y,o.dim.w,o.dim.h);
      else {
        ctx.fillStyle='#888'; ctx.fillRect(o.x,o.y,o.dim.w,o.dim.h);
        ctx.fillStyle='#fff'; ctx.font='10px monospace';
        ctx.fillText('['+o.data.pos+o.data.type+']',o.x+5,o.y+o.dim.h/2);
      }
    }
  }

  checkCollision(birdBounds) {
    for(const o of this.active){
      const bbox=o.data.tightBBox;
      const inset=20;
      if(bbox){
        const scX=o.dim.w/(o.img.naturalWidth||o.img.width||o.dim.w);
        const scY=o.dim.h/(o.img.naturalHeight||o.img.height||o.dim.h);
        const tx=o.x+bbox.x*scX+inset, ty=o.y+bbox.y*scY+inset;
        const tw=Math.max(1,bbox.width*scX-inset*2), th=Math.max(1,bbox.height*scY-inset*2);
        if(birdBounds.x<tx+tw&&birdBounds.x+birdBounds.w>tx&&
           birdBounds.y<ty+th&&birdBounds.y+birdBounds.h>ty) return o;
      } else {
        if(birdBounds.x+inset<o.x+o.dim.w-inset&&birdBounds.x+birdBounds.w-inset>o.x+inset&&
           birdBounds.y+inset<o.y+o.dim.h-inset&&birdBounds.y+birdBounds.h-inset>o.y+inset) return o;
      }
    }
    return null;
  }

  getPassed(birdX) {
    let count=0;
    for(const o of this.active){
        if(!o.passed&&o.x+o.dim.w<birdX){
          o.passed=true;
          count++;
      }
    }
    return count;
  }

  renderFront(ctx) {
    for(const o of this.active){
      if(o.data.pos==='b'){
        if(o.img) ctx.drawImage(o.img,o.x,o.y,o.dim.w,o.dim.h);
      }
    }
  }
}

// ========== HAND TRACKER ==========
class HandTracker {
  constructor() {
    this.hands=null;
    this.running=false;
    this.landmarks=null;
    this.smoothX=0; this.smoothY=0;
    this.hasHand=false;
    this.lastWristY=null;
    this.lastWristTime=0;
  }

  async init(camera,callback) {
    try {
      if(typeof Hands==='undefined') throw new Error('MediaPipe Hands library not loaded');
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
          const wrist=results.multiHandLandmarks[0][0];
          const now=performance.now();
          const logicalH=game.canvas?game.canvas.height:600;
          const logicalY=wrist.y*logicalH;

          if(self.lastWristY!==null&&self.lastWristTime>0){
            const dt=(now-self.lastWristTime)/1000;
            if(dt>0.01){
              const velocity=(logicalY-self.lastWristY)/dt;
              // Upward motion (negative velocity) triggers jump
              if(velocity<-150&&callback) callback();
            }
          }
          self.lastWristY=logicalY;
          self.lastWristTime=now;

          const cx=wrist.x;
          const cy=wrist.y;
          const smoothed=camera.smoothPosition(cx,cy);
          self.smoothX=smoothed.x;
          self.smoothY=smoothed.y;
        } else {
          self.hasHand=false;
          self.lastWristY=null;
          self.lastWristTime=0;
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
    this.score=0;
    this.highScore=parseInt(localStorage.getItem('fom_highscore')||'0');
    this.currentSpeed=SCROLL_SPEED;

    this.canvas=document.getElementById('gameCanvas');
    this.ctx=this.canvas.getContext('2d');
    this.logoCanvas=document.getElementById('logoCanvas');
    this.logoCtx=this.logoCanvas.getContext('2d');

    this.bird=new Bird();
    this.terrain=new Terrain();
    this.obstacles=new ObstacleManager();
    this.clouds=[];
    this.handTracker=new HandTracker();
    this.camera=new Camera(document.getElementById('webcamVideo'));

    this.lastTime=0;
    this.rafId=null;
    this.countdownTimer=null;
    this.webcamRafId=null;
    this.groundSeed=0;

    this.setupUI();
    this.setupControls();
  }

  setupControls() {
    this.canvas.addEventListener('click',()=>{
      if(this.state==='gameover'||this.state==='over'){
        const goEl=document.getElementById('gameOver');
        if(goEl)goEl.style.display='none';
        document.getElementById('playBtn').classList.remove('hidden');
        document.getElementById('playBtn').textContent='↻ PLAY AGAIN';
        document.getElementById('char-select').style.display='flex';
        this.handTracker.stop();
        this.state='menu';
        return;
      }
      if(this.state==='playing') this.bird.flap(true);
    });
    this.canvas.addEventListener('touchstart',(e)=>{
      e.preventDefault();
      if(this.state==='gameover'||this.state==='over'){
        const goEl=document.getElementById('gameOver');
        if(goEl)goEl.style.display='none';
        document.getElementById('playBtn').classList.remove('hidden');
        document.getElementById('playBtn').textContent='↻ PLAY AGAIN';
        document.getElementById('char-select').style.display='flex';
        this.handTracker.stop();
        this.state='menu';
        return;
      }
      if(this.state==='playing') this.bird.flap(true);
    },{passive:false});
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
    const goEl=document.getElementById('gameOver');
    if(goEl) goEl.style.display='none';
    const playBtn=document.getElementById('playBtn');
    playBtn.classList.add('hidden');
    document.getElementById('webcam-area').style.display='flex';

    try{
      await this.handTracker.init(this.camera,()=>{
        if(this.state==='playing') this.bird.flap(false);
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
    const goEl=document.getElementById('gameOver');
    if(goEl) goEl.style.display='none';
    this.state='playing';
    this.score=0;
    this.currentSpeed=SCROLL_SPEED;

    this.canvas.width=LOGICAL_W;
    this.canvas.height=LOGICAL_H;
    resizeCanvas();
    this.bird.init(LOGICAL_W,LOGICAL_H);
    this.groundSeed=Math.floor(Math.random()*10000);
    this.terrain.setSeed(this.groundSeed);
    this.terrain.offset=0;
    this.terrain.cols.clear();

    this.obstacles.init(LOGICAL_W);

    this.clouds=[];
    for(let i=0;i<6;i++) this.clouds.push(new Cloud(LOGICAL_W,LOGICAL_H));
    if(!this.camera.running) this.camera.start().catch(()=>{});

    this.lastTime=performance.now();
    this._loop(this.lastTime);
  }

  _loop(timestamp) {
    this.rafId=requestAnimationFrame((t)=>this._loop(t));
    const dt=Math.min((timestamp-this.lastTime)/1000,0.033);
    this.lastTime=timestamp;
    this.update(dt);
    this.render();
  }

  update(dt) {
    if(this.state==='playing'){
      this.terrain.update(dt,this.currentSpeed*0.5);

      const groundY=GROUND_Y;
      if(this.bird.update(dt,groundY)){
        this.gameOver();
        return;
      }

      this.obstacles.update(dt,this.currentSpeed);
      const lastObs=this.obstacles.active[this.obstacles.active.length-1];
      if(!lastObs||lastObs.x+lastObs.dim.w<LOGICAL_W){
        this.obstacles.spawnNext(LOGICAL_W,LOGICAL_H);
      }

      this.score+=this.obstacles.getPassed(this.bird.x);

      const bb=this.bird.getBounds();
      const hitObs=this.obstacles.checkCollision(bb);
      if(hitObs){
        const idx=this.obstacles.active.indexOf(hitObs);
        if(idx>=0) this.obstacles.active.splice(idx,1);
        this.gameOver();
        return;
      }

      if(!this._villageObs) this._villageObs=new Map();
      let hasActiveVillage=false;
      for(const o of this.obstacles.active){
        if(o.data.pos==='b'&&o.data.type==='v'){
          const id=o.data.file+'_'+Math.floor(o.x/100);
          if(!this._villageObs.has(id)){
            this.terrain.setPath(o.x,o.x+o.dim.w);
            this._villageObs.set(id,{startX:o.x,endX:o.x+o.dim.w});
          }
          hasActiveVillage=true;
        }
      }
      if(!hasActiveVillage&&this._villageObs.size){
        for(const range of this._villageObs.values()){
          this.terrain.revertPath(range.startX,range.endX);
        }
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

    const scale=this.canvas.offsetWidth/w;
    if(!scale) return;
    ctx.save();
    ctx.scale(scale,scale);

    const skyColor='#78A7FF';
    const ga=document.getElementById('gameArea');
    if(ga) ga.style.background=skyColor;
    const grad=ctx.createLinearGradient(0,0,0,h);
    grad.addColorStop(0,skyColor);
    grad.addColorStop(0.7,'#5A8FCF');
    ctx.fillStyle=grad;
    ctx.fillRect(0,0,w,h);

    for(const c of this.clouds) if(c.img) ctx.drawImage(c.img,c.x,c.y);

    if(this.state==='playing'||this.state==='gameover'){
      this.terrain.render(ctx,w,h);
      this.obstacles.render(ctx);
      this.bird.render(ctx,this.selectedChar);
      this.obstacles.renderFront(ctx);
    }

    ctx.restore();
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
    const scrEl=document.getElementById('score');
    if(scrEl) scrEl.textContent='Score: '+this.score;
    document.getElementById('highScoreDisplay').textContent=this.highScore;
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

    const goEl=document.getElementById('gameOver');
    if(goEl) goEl.style.display='block';
    document.getElementById('playBtn').classList.remove('hidden');
    document.getElementById('playBtn').textContent='↻ PLAY AGAIN';
    document.getElementById('char-select').style.display='flex';

    this.handTracker.stop();
  }

}

// ========== INIT ==========
const assets=new AssetManager();
let game;

function resizeCanvas(){
  const canvas=document.getElementById('gameCanvas');
  const ga=document.getElementById('gameArea');
  const cw=ga.clientWidth, ch=ga.clientHeight;
  const scale=Math.min(cw/LOGICAL_W, ch/LOGICAL_H);
  canvas.width=LOGICAL_W;
  canvas.height=LOGICAL_H;
  canvas.style.width=Math.floor(LOGICAL_W*scale)+'px';
  canvas.style.height=Math.floor(LOGICAL_H*scale)+'px';
}

async function init() {
  const progressCb=window._loadingPct||function(){};
  let obstacleFiles=[];
  try{obstacleFiles=await (await fetch('obstacles.json')).json()}catch(e){obstacleFiles=["bn1-12-a-2.png","bn1-2-b-2.png","bn1-2-c-2.png","bv1-1-o-3.png","bv2-2-a-3.png","bv3-12-a-3.png","bv3-2-b-3.png","mn1-2-o-4.png","mv2-2-b-3.png","tn1-2-o-4.png"]}
  await assets.init(obstacleFiles,progressCb);

  const setCanvasSize=()=>{resizeCanvas()};
  setCanvasSize();
  setTimeout(setCanvasSize,100);

  game=new Game();
  game.renderLogo();

  document.getElementById('highScoreDisplay').textContent=game.highScore;

  window.addEventListener('resize',()=>{resizeCanvas()});
  window.addEventListener('orientationchange',()=>setTimeout(resizeCanvas,100));

  document.getElementById('btnRestart').addEventListener('click',()=>{
    if(game.state==='gameover'||game.state==='playing'){
      const goEl=document.getElementById('gameOver');
      if(goEl) goEl.style.display='none';
      document.getElementById('playBtn').classList.remove('hidden');
      document.getElementById('playBtn').textContent='↻ PLAY AGAIN';
      document.getElementById('char-select').style.display='flex';
      game.handTracker.stop();
      game.state='menu';
    }
  });
  document.getElementById('btnFullscreen').addEventListener('click',()=>{
    if(document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  });

  document.addEventListener('keydown',(e)=>{
    if((e.code==='Space'||e.code==='ArrowUp')&&game.state==='playing'){
      e.preventDefault();
      game.bird.flap(true);
    }
  });
}

init();
