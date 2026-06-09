class Camera {
  constructor(videoEl, options = {}) {
    this.video = videoEl;
    this.stream = null;
    this.rafId = null;
    this.running = false;
    this.onFrame = null;
    this.frameCount = 0;
    this.options = {
      width: 320,
      height: 240,
      facingMode: 'user',
      frameSkip: 2,
      ...options
    };
    this.handBuffer = [];
    this.bufferSize = 5;
  }

  async start() {
    if (this.running) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('getUserMedia not supported');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: this.options.width,
        height: this.options.height,
        facingMode: this.options.facingMode
      }
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.running = true;
    this.frameCount = 0;
    this.handBuffer = [];
    this._loop();
  }

  stop() {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
    this.frameCount = 0;
    this.handBuffer = [];
  }

  smoothPosition(x, y) {
    this.handBuffer.push({ x, y });
    if (this.handBuffer.length > this.bufferSize) {
      this.handBuffer.shift();
    }
    let sx = 0, sy = 0;
    for (const p of this.handBuffer) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / this.handBuffer.length, y: sy / this.handBuffer.length };
  }

  resetSmoothing() {
    this.handBuffer = [];
  }

  _loop() {
    if (!this.running) return;
    if (this.video.readyState >= 2) {
      this.frameCount++;
      const skip = this.options.frameSkip + 1;
      const shouldProcess = (this.frameCount % skip === 0);
      if (this.onFrame) {
        this.onFrame(this.video, shouldProcess);
      }
    }
    this.rafId = requestAnimationFrame(() => this._loop());
  }
}
