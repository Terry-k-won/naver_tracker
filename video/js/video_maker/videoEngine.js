/**
 * VideoEngine: Canvas 기반 프레임 렌더링, 실시간 미리보기 및 MP4 인코딩 엔진
 */
class VideoEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.isPlaying = false;
    this.currentTime = 0;
    this.totalDuration = 20.0;
    this.fps = 30;
    this.photos = []; // [{ id, img, rotation, ... }]
    this.fitMode = 'blur';
    this.transitionMode = 'cut';
    this.animFrameId = null;
    this.lastTimestamp = null;
    this.onTimeUpdate = null;
    this.onEnded = null;
  }

  setOptions({ duration, photos, fitMode, transitionMode, width, height }) {
    if (duration !== undefined) this.totalDuration = Math.max(0.1, duration);
    if (photos !== undefined) this.photos = photos;
    if (fitMode !== undefined) this.fitMode = fitMode;
    if (transitionMode !== undefined) this.transitionMode = transitionMode;
    if (width !== undefined && height !== undefined) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  // 특정 시간(초)에 해당하는 프레임 그리기
  renderAtTime(timeInSeconds) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (!this.photos || this.photos.length === 0) {
      ctx.fillStyle = '#060911';
      ctx.fillRect(0, 0, w, h);
      return;
    }

    const n = this.photos.length;
    const durationPerPhoto = this.totalDuration / n;
    const clampedTime = Math.min(Math.max(0, timeInSeconds), this.totalDuration);
    
    // 현재 인덱스 계산
    let currentIndex = Math.floor(clampedTime / durationPerPhoto);
    if (currentIndex >= n) currentIndex = n - 1;

    const currentPhoto = this.photos[currentIndex];
    const timeInCurrent = clampedTime - (currentIndex * durationPerPhoto);

    // 전환 효과 처리 (디졸브 모드일 경우 마지막 0.4초 오버랩)
    const transitionDuration = Math.min(0.5, durationPerPhoto * 0.4);
    const isTransitioning = this.transitionMode === 'fade' && 
                            n > 1 && 
                            currentIndex < n - 1 && 
                            (durationPerPhoto - timeInCurrent) < transitionDuration;

    if (isTransitioning) {
      const nextPhoto = this.photos[currentIndex + 1];
      const progress = (transitionDuration - (durationPerPhoto - timeInCurrent)) / transitionDuration;
      
      // 현재 사진
      this.drawSinglePhoto(ctx, currentPhoto, w, h, 1.0);
      // 다음 사진 (페이드 인)
      this.drawSinglePhoto(ctx, nextPhoto, w, h, progress);
    } else {
      this.drawSinglePhoto(ctx, currentPhoto, w, h, 1.0);
    }
  }

  drawSinglePhoto(ctx, photoItem, w, h, alpha = 1.0) {
    if (!photoItem || !photoItem.img) return;

    ctx.save();
    ctx.globalAlpha = alpha;

    const img = photoItem.img;
    const rotation = (photoItem.rotation || 0) % 360;

    // 가상 캔버스에 회전 적용된 이미지 준비
    let renderSource = img;
    let srcW = img.naturalWidth || img.width;
    let srcH = img.naturalHeight || img.height;

    if (rotation !== 0) {
      const rotCanvas = document.createElement('canvas');
      const isRotated90 = (rotation === 90 || rotation === 270);
      rotCanvas.width = isRotated90 ? srcH : srcW;
      rotCanvas.height = isRotated90 ? srcW : srcH;
      const rotCtx = rotCanvas.getContext('2d');
      rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
      rotCtx.rotate((rotation * Math.PI) / 180);
      rotCtx.drawImage(img, -srcW / 2, -srcH / 2);
      renderSource = rotCanvas;
      srcW = rotCanvas.width;
      srcH = rotCanvas.height;
    }

    if (this.fitMode === 'blur') {
      // 1. 배경 블러 처리 (화면을 가득 채우고 어둡게 블러)
      ctx.save();
      ctx.filter = 'blur(28px) brightness(0.65) saturate(1.2)';
      const scaleBg = Math.max(w / srcW, h / srcH) * 1.15; // 여백 방지 15% 확대
      const bgW = srcW * scaleBg;
      const bgH = srcH * scaleBg;
      ctx.drawImage(renderSource, (w - bgW) / 2, (h - bgH) / 2, bgW, bgH);
      ctx.restore();

      // 2. 중앙에 원본 비율로 선명하게 표시 + 은은한 그림자
      const scaleFit = Math.min(w / srcW, h / srcH);
      const fitW = srcW * scaleFit;
      const fitH = srcH * scaleFit;
      const posX = (w - fitW) / 2;
      const posY = (h - fitH) / 2;

      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 24;
      ctx.drawImage(renderSource, posX, posY, fitW, fitH);
    } else if (this.fitMode === 'cover') {
      // 화면 꽉 채우기 (자르기)
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      const scale = Math.max(w / srcW, h / srcH);
      const scaledW = srcW * scale;
      const scaledH = srcH * scale;
      ctx.drawImage(renderSource, (w - scaledW) / 2, (h - scaledH) / 2, scaledW, scaledH);
    } else {
      // 원본 맞춤 (검은 여백)
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      const scale = Math.min(w / srcW, h / srcH);
      const scaledW = srcW * scale;
      const scaledH = srcH * scale;
      ctx.drawImage(renderSource, (w - scaledW) / 2, (h - scaledH) / 2, scaledW, scaledH);
    }

    ctx.restore();
  }

  // 실시간 재생 시작
  play() {
    if (this.isPlaying) return;
    if (this.currentTime >= this.totalDuration) {
      this.currentTime = 0;
    }
    this.isPlaying = true;
    this.lastTimestamp = performance.now();
    this.loop();
  }

  pause() {
    this.isPlaying = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  seek(timeInSeconds) {
    this.currentTime = Math.min(Math.max(0, timeInSeconds), this.totalDuration);
    this.renderAtTime(this.currentTime);
    if (this.onTimeUpdate) {
      this.onTimeUpdate(this.currentTime, this.totalDuration);
    }
  }

  loop(timestamp) {
    if (!this.isPlaying) return;

    if (timestamp && this.lastTimestamp) {
      const delta = (timestamp - this.lastTimestamp) / 1000;
      this.currentTime += delta;

      if (this.currentTime >= this.totalDuration) {
        this.currentTime = this.totalDuration;
        this.renderAtTime(this.currentTime);
        this.pause();
        if (this.onTimeUpdate) this.onTimeUpdate(this.currentTime, this.totalDuration);
        if (this.onEnded) this.onEnded();
        return;
      }
    }
    this.lastTimestamp = timestamp || performance.now();

    this.renderAtTime(this.currentTime);
    if (this.onTimeUpdate) {
      this.onTimeUpdate(this.currentTime, this.totalDuration);
    }

    this.animFrameId = requestAnimationFrame(this.loop.bind(this));
  }

  /**
   * 고화질 MP4 렌더링 및 내보내기
   * 프레임 단위로 완벽하게 캔버스에 렌더링하여 고화질 영상으로 인코딩
   */
  async exportVideo(options, onProgress) {
    const { width, height, fps = 30, duration, photos, fitMode, transitionMode } = options;
    const totalDuration = duration;
    const totalFrames = Math.max(1, Math.round(totalDuration * fps));

    // 인코딩용 오프스크린 캔버스 생성
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = width;
    exportCanvas.height = height;
    const exportCtx = exportCanvas.getContext('2d');

    // 지원되는 비디오 포맷 확인
    let mimeType = 'video/mp4';
    if (!MediaRecorder.isTypeSupported('video/mp4')) {
      if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) {
        mimeType = 'video/mp4;codecs=avc1';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        mimeType = 'video/webm;codecs=vp9';
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        mimeType = 'video/webm';
      }
    }

    return new Promise(async (resolve, reject) => {
      try {
        const stream = exportCanvas.captureStream(fps);
        const recordedChunks = [];
        
        const recorderOptions = {
          mimeType,
          videoBitsPerSecond: 8000000 // 8 Mbps 고화질
        };

        let mediaRecorder;
        try {
          mediaRecorder = new MediaRecorder(stream, recorderOptions);
        } catch (e) {
          mediaRecorder = new MediaRecorder(stream);
        }

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            recordedChunks.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(recordedChunks, { type: mimeType });
          resolve({ blob, mimeType });
        };

        mediaRecorder.start(100);

        // 프레임 렌더러 임시 인스턴스
        const tempEngine = new VideoEngine(exportCanvas);
        tempEngine.setOptions({
          duration: totalDuration,
          photos,
          fitMode,
          transitionMode,
          width,
          height
        });

        // 프레임 단위 렌더링 루프
        const frameIntervalMs = 1000 / fps;
        let currentFrame = 0;

        const renderNextFrame = () => {
          if (currentFrame >= totalFrames) {
            setTimeout(() => {
              mediaRecorder.stop();
            }, 300);
            return;
          }

          const currentTime = (currentFrame / fps);
          tempEngine.renderAtTime(currentTime);

          currentFrame++;
          const progressPercent = Math.round((currentFrame / totalFrames) * 100);

          if (onProgress) {
            onProgress({
              percent: progressPercent,
              currentFrame,
              totalFrames,
              currentTime: currentTime.toFixed(2),
              totalDuration: totalDuration.toFixed(2)
            });
          }

          setTimeout(renderNextFrame, frameIntervalMs / 1.5);
        };

        // 첫 프레임 시작
        renderNextFrame();

      } catch (err) {
        reject(err);
      }
    });
  }
}

window.VideoEngine = VideoEngine;
