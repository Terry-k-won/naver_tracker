/**
 * App: 통합 미디어 스튜디오 메인 스크립트 (비디오 메이커 & 워터마크 스튜디오 연동)
 */
document.addEventListener('DOMContentLoaded', async () => {
  // ============================================================
  // 1. 상단 탭 네비게이션
  // ============================================================
  const tabVideoMaker = document.getElementById('tabVideoMaker');
  const tabWatermarkStudio = document.getElementById('tabWatermarkStudio');
  const videoSection = document.getElementById('videoSection');
  const watermarkSection = document.getElementById('watermarkSection');
  const photoCountBadge = document.getElementById('photoCountBadge');

  function switchTab(target) {
    if (target === 'video') {
      tabVideoMaker.classList.add('active');
      tabWatermarkStudio.classList.remove('active');
      videoSection.classList.add('active');
      watermarkSection.classList.remove('active');
      photoCountBadge.textContent = `비디오 사진 ${videoState.photos.length}장`;
    } else {
      tabWatermarkStudio.classList.add('active');
      tabVideoMaker.classList.remove('active');
      watermarkSection.classList.add('active');
      videoSection.classList.remove('active');
      if (window.watermarkStudioInstance) {
        photoCountBadge.textContent = `워터마크 사진 ${window.watermarkStudioInstance.items.length}장`;
      } else {
        photoCountBadge.textContent = '워터마크 스튜디오';
      }
    }
  }

  tabVideoMaker.addEventListener('click', () => switchTab('video'));
  tabWatermarkStudio.addEventListener('click', () => switchTab('watermark'));

  // ============================================================
  // 2. 워터마크 스튜디오 초기화
  // ============================================================
  const watermarkStudio = new WatermarkStudio();
  window.watermarkStudioInstance = watermarkStudio;
  await watermarkStudio.init();

  // ============================================================
  // 3. 비디오 메이커 로직
  // ============================================================
  const videoState = {
    photos: [], // { id, name, file, dataUrl, img, rotation }
    duration: 20.0,
    aspectRatio: { aspect: '16:9', width: 1920, height: 1080 },
    fitMode: 'blur',
    transitionMode: 'cut',
    fps: 30,
    isExporting: false
  };

  // DOM 요소
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const browseBtn = document.getElementById('browseBtn');
  const photoGrid = document.getElementById('photoGrid');
  const photoGridWrapper = document.getElementById('photoGridWrapper');
  const photoTools = document.getElementById('photoTools');
  const addMorePhotosBtn = document.getElementById('addMorePhotosBtn');
  const sortNameBtn = document.getElementById('sortNameBtn');
  const reverseOrderBtn = document.getElementById('reverseOrderBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const gridSummary = document.getElementById('gridSummary');

  // 설정 요소
  const durationInput = document.getElementById('durationInput');
  const presetBtns = document.querySelectorAll('.preset-btn');
  const durMinus5 = document.getElementById('durMinus5');
  const durMinus1 = document.getElementById('durMinus1');
  const durPlus1 = document.getElementById('durPlus1');
  const durPlus5 = document.getElementById('durPlus5');
  const calcMainText = document.getElementById('calcMainText');
  const calcSubText = document.getElementById('calcSubText');
  const ratioBtns = document.querySelectorAll('.ratio-btn');
  const fitRadios = document.querySelectorAll('input[name="fitMode"]');
  const transitionRadios = document.querySelectorAll('input[name="transitionMode"]');

  // 미리보기 및 내보내기 요소
  const previewCanvas = document.getElementById('previewCanvas');
  const aspectWrapper = document.getElementById('aspectWrapper');
  const previewPlaceholder = document.getElementById('previewPlaceholder');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const iconPlay = playPauseBtn.querySelector('.icon-play');
  const iconPause = playPauseBtn.querySelector('.icon-pause');
  const timelineSlider = document.getElementById('timelineSlider');
  const timeDisplay = document.getElementById('timeDisplay');
  const exportBtn = document.getElementById('exportBtn');
  const progressBox = document.getElementById('progressBox');
  const progressStatus = document.getElementById('progressStatus');
  const progressPercent = document.getElementById('progressPercent');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressDetail = document.getElementById('progressDetail');

  // 모달 요소
  const completeModal = document.getElementById('completeModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const resultVideo = document.getElementById('resultVideo');
  const resultMeta = document.getElementById('resultMeta');
  const downloadLink = document.getElementById('downloadLink');

  // 비디오 엔진 및 정렬 초기화
  const videoEngine = new VideoEngine(previewCanvas);

  new SortableGrid(photoGrid, (newOrderIds) => {
    const idMap = new Map(videoState.photos.map(p => [p.id, p]));
    videoState.photos = newOrderIds.map(id => idMap.get(id)).filter(Boolean);
    updateVideoUI();
  });

  // 파일 업로드
  browseBtn.addEventListener('click', () => fileInput.click());
  addMorePhotosBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleVideoFiles(Array.from(e.target.files));
      fileInput.value = '';
    }
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('drag-over');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleVideoFiles(Array.from(e.dataTransfer.files));
    }
  });

  async function handleVideoFiles(files) {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      alert('이미지 파일(JPG, PNG, GIF, WebP 등)만 추가할 수 있습니다.');
      return;
    }

    const loadedPromises = imageFiles.map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            resolve({
              id: 'photo_' + Math.random().toString(36).substr(2, 9),
              name: file.name,
              file: file,
              dataUrl: e.target.result,
              img: img,
              rotation: 0
            });
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      });
    });

    const newPhotos = await Promise.all(loadedPromises);
    videoState.photos.push(...newPhotos);
    updateVideoUI();
  }

  function updateVideoUI() {
    const count = videoState.photos.length;
    const duration = videoState.duration;

    if (tabVideoMaker.classList.contains('active')) {
      photoCountBadge.textContent = `비디오 사진 ${count}장`;
    }
    gridSummary.textContent = `총 ${count}장의 사진`;

    if (count === 0) {
      dropzone.style.display = 'block';
      photoGridWrapper.style.display = 'none';
      photoTools.style.display = 'none';
      previewPlaceholder.style.display = 'flex';
      playPauseBtn.disabled = true;
      timelineSlider.disabled = true;
      exportBtn.disabled = true;

      calcMainText.textContent = '사진을 추가하면 장당 노출 시간이 자동 계산됩니다.';
      calcSubText.textContent = `총 시간 ${duration.toFixed(2)}초에 맞춰 모든 사진이 균일한 시간 동안 표시됩니다.`;

      videoEngine.setOptions({ photos: [], duration });
      videoEngine.renderAtTime(0);
      return;
    }

    dropzone.style.display = 'none';
    photoGridWrapper.style.display = 'flex';
    photoTools.style.display = 'flex';
    previewPlaceholder.style.display = 'none';
    playPauseBtn.disabled = false;
    timelineSlider.disabled = false;
    exportBtn.disabled = videoState.isExporting;

    const perPhotoSec = (duration / count).toFixed(2);
    calcMainText.innerHTML = `총 <strong>${count}장</strong>의 사진 &rarr; <strong>장당 ${perPhotoSec}초</strong> 균일 노출`;
    calcSubText.textContent = `전체 영상 길이 ${duration.toFixed(2)}초 = ${count}장 × ${perPhotoSec}초`;

    renderPhotoGrid(perPhotoSec);

    videoEngine.setOptions({
      photos: videoState.photos,
      duration: videoState.duration,
      fitMode: videoState.fitMode,
      transitionMode: videoState.transitionMode,
      width: videoState.aspectRatio.width,
      height: videoState.aspectRatio.height
    });

    if (!videoEngine.isPlaying) {
      videoEngine.renderAtTime(videoEngine.currentTime);
    }
    updateTimeDisplay(videoEngine.currentTime, videoState.duration);
  }

  function renderPhotoGrid(perPhotoSec) {
    photoGrid.innerHTML = '';

    videoState.photos.forEach((photo, index) => {
      const card = document.createElement('div');
      card.className = 'photo-card';
      card.draggable = true;
      card.dataset.id = photo.id;

      card.innerHTML = `
        <div class="photo-thumb-wrap">
          <img src="${photo.dataUrl}" alt="${photo.name}" class="photo-thumb" style="transform: rotate(${photo.rotation}deg);">
          <span class="photo-index-badge">#${index + 1}</span>
          <div class="photo-actions">
            <button type="button" class="card-action-btn btn-rotate" title="시계방향 90도 회전">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            </button>
            <button type="button" class="card-action-btn btn-delete" title="사진 삭제">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
        <div class="photo-info">
          <span class="photo-name" title="${photo.name}">${photo.name}</span>
          <span class="photo-duration">${perPhotoSec}초 노출</span>
        </div>
      `;

      card.querySelector('.btn-rotate').addEventListener('click', (e) => {
        e.stopPropagation();
        photo.rotation = (photo.rotation + 90) % 360;
        updateVideoUI();
      });

      card.querySelector('.btn-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        videoState.photos = videoState.photos.filter(p => p.id !== photo.id);
        updateVideoUI();
      });

      photoGrid.appendChild(card);
    });
  }

  // 툴바 이벤트
  sortNameBtn.addEventListener('click', () => {
    videoState.photos.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    updateVideoUI();
  });

  reverseOrderBtn.addEventListener('click', () => {
    videoState.photos.reverse();
    updateVideoUI();
  });

  clearAllBtn.addEventListener('click', () => {
    if (confirm('비디오 사진을 모두 삭제하시겠습니까?')) {
      videoState.photos = [];
      updateVideoUI();
    }
  });

  // 시간 제어
  durationInput.addEventListener('input', () => {
    const val = parseFloat(durationInput.value);
    if (!isNaN(val) && val > 0) {
      videoState.duration = val;
      updatePresetActiveState(val);
      updateVideoUI();
    }
  });

  durationInput.addEventListener('blur', () => {
    const val = parseFloat(durationInput.value);
    if (isNaN(val) || val <= 0) {
      durationInput.value = '20.00';
      videoState.duration = 20.0;
    } else {
      durationInput.value = val.toFixed(2);
      videoState.duration = val;
    }
    updateVideoUI();
  });

  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const sec = parseFloat(btn.dataset.sec);
      durationInput.value = sec.toFixed(2);
      videoState.duration = sec;
      updatePresetActiveState(sec);
      updateVideoUI();
    });
  });

  function updatePresetActiveState(sec) {
    presetBtns.forEach(btn => {
      if (Math.abs(parseFloat(btn.dataset.sec) - sec) < 0.01) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function adjustDuration(delta) {
    let current = parseFloat(durationInput.value) || 20.0;
    let next = Math.max(1, current + delta);
    durationInput.value = next.toFixed(2);
    videoState.duration = next;
    updatePresetActiveState(next);
    updateVideoUI();
  }

  durMinus5.addEventListener('click', () => adjustDuration(-5));
  durMinus1.addEventListener('click', () => adjustDuration(-1));
  durPlus1.addEventListener('click', () => adjustDuration(1));
  durPlus5.addEventListener('click', () => adjustDuration(5));

  // 종횡비 및 렌더링 옵션
  ratioBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      ratioBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const aspect = btn.dataset.aspect;
      const w = parseInt(btn.dataset.w, 10);
      const h = parseInt(btn.dataset.h, 10);

      videoState.aspectRatio = { aspect, width: w, height: h };
      aspectWrapper.style.aspectRatio = aspect.replace(':', ' / ');
      updateVideoUI();
    });
  });

  fitRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      videoState.fitMode = e.target.value;
      updateVideoUI();
    });
  });

  transitionRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      videoState.transitionMode = e.target.value;
      updateVideoUI();
    });
  });

  // 미리보기 컨트롤러
  playPauseBtn.addEventListener('click', () => {
    if (videoEngine.isPlaying) {
      videoEngine.pause();
      setPlayButtonState(false);
    } else {
      videoEngine.play();
      setPlayButtonState(true);
    }
  });

  function setPlayButtonState(isPlaying) {
    if (isPlaying) {
      iconPlay.style.display = 'none';
      iconPause.style.display = 'block';
    } else {
      iconPlay.style.display = 'block';
      iconPause.style.display = 'none';
    }
  }

  timelineSlider.addEventListener('input', (e) => {
    const percent = parseFloat(e.target.value);
    const targetTime = (percent / 100) * videoState.duration;
    videoEngine.seek(targetTime);
  });

  videoEngine.onTimeUpdate = (currentTime, totalDuration) => {
    const percent = (currentTime / totalDuration) * 100;
    timelineSlider.value = percent;
    updateTimeDisplay(currentTime, totalDuration);
  };

  videoEngine.onEnded = () => {
    setPlayButtonState(false);
  };

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function updateTimeDisplay(cur, total) {
    timeDisplay.textContent = `${formatTime(cur)} / ${formatTime(total)}`;
  }

  // MP4 Export
  exportBtn.addEventListener('click', async () => {
    if (videoState.photos.length === 0 || videoState.isExporting) return;

    videoEngine.pause();
    setPlayButtonState(false);

    videoState.isExporting = true;
    exportBtn.disabled = true;
    progressBox.style.display = 'flex';
    progressBarFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressStatus.textContent = '고화질 MP4 영상을 렌더링하는 중입니다...';

    try {
      const exportOptions = {
        width: videoState.aspectRatio.width,
        height: videoState.aspectRatio.height,
        fps: videoState.fps,
        duration: videoState.duration,
        photos: videoState.photos,
        fitMode: videoState.fitMode,
        transitionMode: videoState.transitionMode
      };

      const result = await videoEngine.exportVideo(exportOptions, (prog) => {
        progressBarFill.style.width = `${prog.percent}%`;
        progressPercent.textContent = `${prog.percent}%`;
        progressDetail.textContent = `프레임 인코딩 중: ${prog.currentFrame} / ${prog.totalFrames} (${prog.currentTime}s / ${prog.totalDuration}s)`;
      });

      progressBox.style.display = 'none';
      videoState.isExporting = false;
      exportBtn.disabled = false;

      const videoUrl = URL.createObjectURL(result.blob);
      resultVideo.src = videoUrl;

      const perPhoto = (videoState.duration / videoState.photos.length).toFixed(2);
      const isMp4 = result.mimeType.includes('mp4');
      const ext = isMp4 ? 'mp4' : 'webm';
      const filename = `slideshow_${videoState.duration}s_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.${ext}`;

      downloadLink.href = videoUrl;
      downloadLink.download = filename;

      resultMeta.innerHTML = `
        <div>📌 <strong>총 재생 시간:</strong> ${videoState.duration.toFixed(2)}초</div>
        <div>🖼️ <strong>사용된 사진:</strong> 총 ${videoState.photos.length}장 (장당 ${perPhoto}초 균일 분할)</div>
        <div>📐 <strong>해상도:</strong> ${videoState.aspectRatio.width} × ${videoState.aspectRatio.height} (${videoState.aspectRatio.aspect})</div>
        <div>💾 <strong>파일 크기:</strong> ${(result.blob.size / (1024 * 1024)).toFixed(2)} MB</div>
      `;

      completeModal.style.display = 'flex';

    } catch (err) {
      console.error('비디오 제작 실패:', err);
      alert('비디오 제작 중 오류가 발생했습니다: ' + err.message);
      progressBox.style.display = 'none';
      videoState.isExporting = false;
      exportBtn.disabled = false;
    }
  });

  closeModalBtn.addEventListener('click', () => {
    completeModal.style.display = 'none';
    resultVideo.pause();
  });

  // 초기 렌더링
  updateVideoUI();
});
