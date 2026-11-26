/**
 * WatermarkStudio: 병원별 1080x1080 워터마크 합성, 인스타용 4:5(1080x1440) 확장 및 로컬 영구 저장 모듈
 */
class WatermarkStudio {
  constructor() {
    this.hospitals = [];
    this.selectedHospitalId = null;
    this.items = []; // { id, file, originalDataUrl, composedDataUrl, status, fileName, formattedFileName, dimensions }
    this.isProcessing = false;
    this.detailItem = null;

    this.initElements();
    this.initEvents();
  }

  initElements() {
    // 섹션 요소
    this.section = document.getElementById('watermarkSection');
    this.hospitalSelect = document.getElementById('wmHospitalSelect');
    this.openManagerBtn = document.getElementById('wmOpenManagerBtn');
    this.activeHospitalName = document.getElementById('wmActiveHospitalName');
    this.activeHospitalThumb = document.getElementById('wmActiveHospitalThumb');
    this.activeHospitalEmpty = document.getElementById('wmActiveHospitalEmpty');
    this.activeHospitalContent = document.getElementById('wmActiveHospitalContent');

    // 업로드 & 컨트롤 요소
    this.dropzone = document.getElementById('wmDropzone');
    this.fileInput = document.getElementById('wmFileInput');
    this.browseBtn = document.getElementById('wmBrowseBtn');
    this.addMoreBtn = document.getElementById('wmAddMoreBtn');
    this.clearAllBtn = document.getElementById('wmClearAllBtn');
    this.startProcessBtn = document.getElementById('wmStartProcessBtn');
    
    // 다운로드 버튼들 (1:1 기본 & 인스타 4:5)
    this.downloadAll1x1Btn = document.getElementById('wmDownloadAll1x1Btn');
    this.downloadAllInstaBtn = document.getElementById('wmDownloadAllInstaBtn');

    this.countBadge = document.getElementById('wmCountBadge');
    this.toolbar = document.getElementById('wmToolbar');
    this.emptyState = document.getElementById('wmEmptyState');
    this.gridWrapper = document.getElementById('wmGridWrapper');
    this.grid = document.getElementById('wmGrid');

    // 모달 요소: 병원 관리자
    this.managerModal = document.getElementById('wmManagerModal');
    this.closeManagerBtn = document.getElementById('wmCloseManagerBtn');
    this.managerList = document.getElementById('wmManagerList');
    this.managerForm = document.getElementById('wmManagerForm');
    this.newHospitalName = document.getElementById('wmNewHospitalName');
    this.newHospitalDesc = document.getElementById('wmNewHospitalDesc');
    this.newWmFileInput = document.getElementById('wmNewWmFileInput');
    this.newWmDropzone = document.getElementById('wmNewWmDropzone');
    this.newWmThumb = document.getElementById('wmNewWmThumb');
    this.newWmPlaceholder = document.getElementById('wmNewWmPlaceholder');
    this.newWmDimensions = document.getElementById('wmNewWmDimensions');
    this.submitNewHospitalBtn = document.getElementById('wmSubmitNewHospitalBtn');

    // 모달 요소: 이미지 상세 보기 (라이트박스)
    this.detailModal = document.getElementById('wmDetailModal');
    this.closeDetailBtn = document.getElementById('wmCloseDetailBtn');
    this.detailImg = document.getElementById('wmDetailImg');
    this.detailTitle = document.getElementById('wmDetailTitle');
    this.detailMeta = document.getElementById('wmDetailMeta');
    this.detailDownload1x1Btn = document.getElementById('wmDetailDownload1x1Btn');
    this.detailDownloadInstaBtn = document.getElementById('wmDetailDownloadInstaBtn');

    this.tempWatermarkDataUrl = null;
  }

  async init() {
    await this.loadHospitalsAndSyncLegacy();
    this.updateUI();
  }

  // ================================================================
  // 1. 병원 데이터 로드 및 브라우저 영구 저장 (로컬스토리지 / IndexedDB / 정적JSON 동기화)
  // ================================================================
  async loadHospitalsAndSyncLegacy() {
    try {
      let loadedHospitals = [];

      // 1-1. localStorage 확인
      try {
        const stored = localStorage.getItem('wm_hospitals_store');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            loadedHospitals = parsed;
          }
        }
      } catch (e) {
        console.warn('localStorage 파싱 오류:', e);
      }

      // 1-2. IndexedDB 확인
      if (loadedHospitals.length === 0) {
        const legacy = await this.readLegacyIndexedDB();
        if (legacy && legacy.length > 0) {
          loadedHospitals = legacy;
        }
      }

      // 1-3. 정적 data/hospitals.json 확인
      if (loadedHospitals.length === 0) {
        try {
          const res = await fetch('/video/data/hospitals.json');
          if (res.ok) {
            const data = await res.json();
            const list = Array.isArray(data) ? data : (data.hospitals || []);
            if (list.length > 0) {
              loadedHospitals = list;
            }
          }
        } catch (e) {
          try {
            const res2 = await fetch('data/hospitals.json');
            if (res2.ok) {
              const data2 = await res2.json();
              const list2 = Array.isArray(data2) ? data2 : (data2.hospitals || []);
              if (list2.length > 0) loadedHospitals = list2;
            }
          } catch (e2) {}
        }
      }

      // 1-4. 로컬 Node.js 서버 API가 실행 중이면 API 확인
      if (loadedHospitals.length === 0) {
        try {
          const res = await fetch('/api/hospitals');
          if (res.ok) {
            const data = await res.json();
            if (data.hospitals && data.hospitals.length > 0) {
              loadedHospitals = data.hospitals;
            }
          }
        } catch (e) {}
      }

      // 1-5. 마지막 대체: 기본 샘플 템플릿
      if (loadedHospitals.length === 0) {
        loadedHospitals = this.seedDefaultHospitalsLocal();
      }

      this.hospitals = loadedHospitals;
      if (this.hospitals.length > 0 && !this.selectedHospitalId) {
        this.selectedHospitalId = this.hospitals[0].id;
      }

      // 로컬 스토리지 및 IndexedDB에 저장하여 다음 방문 시 즉시 유지
      await this.saveHospitalsToStorage();
    } catch (err) {
      console.error('병원 데이터 로드 오류:', err);
    }
  }

  async saveHospitalsToStorage() {
    try {
      localStorage.setItem('wm_hospitals_store', JSON.stringify(this.hospitals));
    } catch (e) {
      console.warn('localStorage 저장 경고 (용량 초과 가능성):', e);
    }
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open('HospitalWatermarkDB', 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('hospitals')) {
            db.createObjectStore('hospitals', { keyPath: 'id' });
          }
        };
        req.onsuccess = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('hospitals')) {
            db.close();
            return resolve();
          }
          const tx = db.transaction('hospitals', 'readwrite');
          const store = tx.objectStore('hospitals');
          store.clear();
          this.hospitals.forEach(h => {
            store.put({
              id: h.id,
              name: h.name,
              description: h.description,
              watermarkDataUrl: h.watermarkDataUrl,
              watermarkUrl: h.watermarkUrl,
              createdAt: h.createdAt || Date.now(),
              isDefault: !!h.isDefault
            });
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            resolve();
          };
        };
        req.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  readLegacyIndexedDB() {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open('HospitalWatermarkDB', 1);
        req.onerror = () => resolve([]);
        req.onsuccess = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('hospitals')) {
            db.close();
            return resolve([]);
          }
          const tx = db.transaction('hospitals', 'readonly');
          const store = tx.objectStore('hospitals');
          const getReq = store.getAll();
          getReq.onsuccess = () => {
            const list = (getReq.result || []).map(item => ({
              id: item.id,
              name: item.name,
              description: item.description,
              watermarkDataUrl: item.watermarkDataUrl,
              createdAt: item.createdAt,
              isDefault: item.isDefault
            })).filter(h => !!h.watermarkDataUrl);
            db.close();
            resolve(list);
          };
          getReq.onerror = () => {
            db.close();
            resolve([]);
          };
        };
      } catch (e) {
        resolve([]);
      }
    });
  }

  seedDefaultHospitalsLocal() {
    function createSampleWatermarkSvg(hospitalName, englishName, primaryColor, badgeText, tagline) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080" width="1080" height="1080">
        <defs>
          <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="${primaryColor}" stop-opacity="0.9" />
            <stop offset="100%" stop-color="#0f172a" stop-opacity="0.95" />
          </linearGradient>
          <linearGradient id="bottomGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#000000" stop-opacity="0" />
            <stop offset="40%" stop-color="#000000" stop-opacity="0.45" />
            <stop offset="100%" stop-color="#050b14" stop-opacity="0.92" />
          </linearGradient>
          <filter id="dropShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#000000" flood-opacity="0.4"/>
          </filter>
        </defs>
        <rect x="24" y="24" width="1032" height="1032" rx="28" fill="none" stroke="${primaryColor}" stroke-width="2.5" stroke-opacity="0.5" />
        <rect x="36" y="36" width="1008" height="1008" rx="20" fill="none" stroke="#ffffff" stroke-width="1" stroke-opacity="0.2" />
        <g filter="url(#dropShadow)" transform="translate(60, 60)">
          <rect width="360" height="84" rx="20" fill="url(#headerGrad)" stroke="#ffffff" stroke-width="1.5" stroke-opacity="0.25" />
          <circle cx="48" cy="42" r="22" fill="#ffffff" fill-opacity="0.15" />
          <path d="M48 28v28M34 42h28" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" />
          <text x="86" y="40" font-family="'Pretendard', sans-serif" font-size="24" font-weight="800" fill="#ffffff" letter-spacing="-0.5">${hospitalName}</text>
          <text x="86" y="62" font-family="'Inter', sans-serif" font-size="13" font-weight="600" fill="#cbd5e1" letter-spacing="0.5">${englishName.toUpperCase()}</text>
        </g>
        <g filter="url(#dropShadow)" transform="translate(840, 60)">
          <rect width="180" height="44" rx="22" fill="#0f172a" fill-opacity="0.85" stroke="${primaryColor}" stroke-width="1.5" />
          <circle cx="24" cy="22" r="5" fill="${primaryColor}" />
          <text x="38" y="27" font-family="'Pretendard', sans-serif" font-size="14" font-weight="700" fill="#ffffff">${badgeText}</text>
        </g>
        <rect x="0" y="800" width="1080" height="280" fill="url(#bottomGrad)" />
        <g transform="translate(60, 970)">
          <rect x="0" y="-35" width="48" height="4" rx="2" fill="${primaryColor}" />
          <text x="0" y="0" font-family="'Pretendard', sans-serif" font-size="28" font-weight="700" fill="#ffffff" filter="url(#dropShadow)">${tagline}</text>
          <text x="0" y="32" font-family="'Pretendard', sans-serif" font-size="16" font-weight="500" fill="#94a3b8">공식 인증 클리닉 &amp; 전문 의료진 상주 | 1:1 맞춤 진료</text>
        </g>
        <g transform="translate(930, 940)" opacity="0.8">
          <circle cx="45" cy="45" r="40" fill="none" stroke="${primaryColor}" stroke-width="2" stroke-dasharray="4 4" />
          <text x="45" y="42" font-family="'Inter', sans-serif" font-size="11" font-weight="800" fill="#ffffff" text-anchor="middle">AUTHENTIC</text>
          <text x="45" y="58" font-family="'Inter', sans-serif" font-size="10" font-weight="600" fill="${primaryColor}" text-anchor="middle">CLINIC</text>
        </g>
      </svg>`;
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    }

    return [
      {
        id: 'sample-gangnam-severance',
        name: '강남세브란스피부과',
        description: '기본 등록된 피부과 템플릿',
        watermarkDataUrl: createSampleWatermarkSvg('강남세브란스', 'Gangnam Severance Clinic', '#2563eb', '피부과 전문의', '환자의 아름다움과 건강을 최우선으로'),
        isDefault: true
      },
      {
        id: 'sample-oracle-plastic',
        name: '오라클성형외과',
        description: '기본 등록된 성형외과 템플릿',
        watermarkDataUrl: createSampleWatermarkSvg('오라클성형외과', 'Oracle Plastic Surgery', '#ec4899', '성형외과 전문의', '당신만의 자연스러운 아름다움을 찾다'),
        isDefault: true
      },
      {
        id: 'sample-prime-dental',
        name: '프라임치과의원',
        description: '기본 등록된 치과 템플릿',
        watermarkDataUrl: createSampleWatermarkSvg('프라임치과의원', 'Prime Dental Clinic', '#06b6d4', '통합치의학과', '자연치아를 보존하는 정직한 진료'),
        isDefault: true
      }
    ];
  }

  // ================================================================
  // 2. 이벤트 리스너 설정
  // ================================================================
  initEvents() {
    this.hospitalSelect.addEventListener('change', (e) => {
      this.selectedHospitalId = e.target.value;
      this.handleHospitalChange();
    });

    this.openManagerBtn.addEventListener('click', () => this.openManager());
    this.closeManagerBtn.addEventListener('click', () => this.closeManager());
    this.managerModal.addEventListener('click', (e) => {
      if (e.target === this.managerModal) this.closeManager();
    });

    this.newWmDropzone.addEventListener('click', () => this.newWmFileInput.click());
    this.newWmFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.handleNewWatermarkFile(e.target.files[0]);
      }
    });

    this.managerForm.addEventListener('submit', (e) => this.handleSubmitNewHospital(e));

    this.browseBtn.addEventListener('click', () => this.fileInput.click());
    this.addMoreBtn.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        this.handleUploadFiles(Array.from(e.target.files));
        this.fileInput.value = '';
      }
    });

    ['dragenter', 'dragover'].forEach(ev => {
      this.dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropzone.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach(ev => {
      this.dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropzone.classList.remove('drag-over');
      });
    });

    this.dropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        this.handleUploadFiles(Array.from(e.dataTransfer.files));
      }
    });

    this.clearAllBtn.addEventListener('click', () => {
      if (confirm('목록의 모든 사진을 삭제하시겠습니까?')) {
        this.items = [];
        this.updateUI();
      }
    });

    this.startProcessBtn.addEventListener('click', () => this.processAllItems());

    // 1:1 일괄 다운로드 & 인스타용(4:5) 일괄 다운로드
    this.downloadAll1x1Btn.addEventListener('click', () => this.downloadAllAsZip1x1());
    this.downloadAllInstaBtn.addEventListener('click', () => this.downloadAllAsZipInsta());

    this.closeDetailBtn.addEventListener('click', () => this.closeDetail());
    this.detailModal.addEventListener('click', (e) => {
      if (e.target === this.detailModal) this.closeDetail();
    });
  }

  // ================================================================
  // 3. 사진 업로드 및 1080x1080 합성
  // ================================================================
  async handleUploadFiles(files) {
    const imgFiles = files.filter(f => f.type.startsWith('image/'));
    if (imgFiles.length === 0) {
      alert('이미지 파일(JPG, PNG, GIF 등)만 업로드할 수 있습니다.');
      return;
    }

    const currentHospital = this.getSelectedHospital();
    const hospitalName = currentHospital ? currentHospital.name : '병원';
    const baseDate = new Date();
    const startOffset = this.items.length;
    const totalExpected = startOffset + imgFiles.length;

    const loaded = await Promise.all(imgFiles.map((file, fileIdx) => {
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const index = startOffset + fileIdx;
            const formattedFileName = this.generateOutputFileName(hospitalName, index, totalExpected, baseDate);
            resolve({
              id: 'wm_img_' + Math.random().toString(36).substr(2, 9),
              file,
              originalDataUrl: e.target.result,
              composedDataUrl: null,
              status: 'pending',
              fileName: file.name,
              formattedFileName,
              dimensions: { width: img.naturalWidth, height: img.naturalHeight }
            });
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      });
    }));

    this.items.push(...loaded);
    this.refreshFileNames();
    this.updateUI();
  }

  // 전체 아이템 순서에 맞춰 파일명 일괄 갱신 (01, 02, 03...)
  refreshFileNames(baseDate = new Date()) {
    const currentHospital = this.getSelectedHospital();
    const hospitalName = currentHospital ? currentHospital.name : '사진';
    const total = this.items.length;

    this.items.forEach((item, idx) => {
      item.formattedFileName = this.generateOutputFileName(hospitalName, idx, total, baseDate);
    });
  }

  handleHospitalChange() {
    const currentHospital = this.getSelectedHospital();
    const hospitalName = currentHospital ? currentHospital.name : '병원';
    const baseDate = new Date();

    this.items.forEach((item, idx) => {
      item.composedDataUrl = null;
      item.status = 'pending';
      item.formattedFileName = this.generateOutputFileName(hospitalName, idx, this.items.length, baseDate);
    });

    this.updateUI();
  }

  getSelectedHospital() {
    return this.hospitals.find(h => h.id === this.selectedHospitalId) || null;
  }

  async processAllItems() {
    const hospital = this.getSelectedHospital();
    if (!hospital || !hospital.watermarkDataUrl) {
      alert('선택된 병원의 워터마크 이미지가 없습니다.');
      return;
    }

    this.isProcessing = true;
    this.updateUI();

    const baseDate = new Date();

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (item.status === 'done') continue;

      item.status = 'processing';
      this.updateUI();

      try {
        const composedUrl = await this.composeWatermark1080(
          item.originalDataUrl,
          hospital.watermarkDataUrl
        );

        item.composedDataUrl = composedUrl;
        item.status = 'done';
        item.formattedFileName = this.generateOutputFileName(hospital.name, i, this.items.length, baseDate);
      } catch (err) {
        console.error('합성 실패:', err);
        item.status = 'error';
      }
      this.updateUI();
    }

    this.isProcessing = false;
    this.updateUI();
  }

  composeWatermark1080(originalUrl, watermarkUrl) {
    return new Promise(async (resolve, reject) => {
      try {
        const targetSize = 1080;
        const canvas = document.createElement('canvas');
        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext('2d');

        const [origImg, wmImg] = await Promise.all([
          this.loadImage(originalUrl),
          this.loadImage(watermarkUrl)
        ]);

        const origAspect = origImg.naturalWidth / origImg.naturalHeight;
        let sx = 0, sy = 0, sw = origImg.naturalWidth, sh = origImg.naturalHeight;

        if (origAspect > 1) {
          sw = origImg.naturalHeight;
          sx = (origImg.naturalWidth - sw) / 2;
        } else if (origAspect < 1) {
          sh = origImg.naturalWidth;
          sy = (origImg.naturalHeight - sh) / 2;
        }

        ctx.drawImage(origImg, sx, sy, sw, sh, 0, 0, targetSize, targetSize);
        ctx.drawImage(wmImg, 0, 0, targetSize, targetSize);

        resolve(canvas.toDataURL('image/png', 1.0));
      } catch (e) {
        reject(e);
      }
    });
  }

  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = src;
    });
  }

  // ================================================================
  // 4. 🔥 인스타용 4:5 (1080×1440) 확장 & 1:1 정규화 렌더링
  //    - 원본/합성본 모두 지원!
  //    - 1:1 사진을 왜곡 없이 상하 가운데(y=180)에 배치
  //    - 상하 빈 영역(각 180px)은 최상단/최하단 픽셀 색상으로 자연스럽게 채움
  // ================================================================
  async compose1x1FromOriginal(originalUrl) {
    const origImg = await this.loadImage(originalUrl);
    const targetSize = 1080;
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');

    const origAspect = origImg.naturalWidth / origImg.naturalHeight;
    let sx = 0, sy = 0, sw = origImg.naturalWidth, sh = origImg.naturalHeight;

    if (origAspect > 1) {
      sw = origImg.naturalHeight;
      sx = (origImg.naturalWidth - sw) / 2;
    } else if (origAspect < 1) {
      sh = origImg.naturalWidth;
      sy = (origImg.naturalHeight - sh) / 2;
    }

    ctx.drawImage(origImg, sx, sy, sw, sh, 0, 0, targetSize, targetSize);
    return canvas.toDataURL('image/png', 1.0);
  }

  async composeInstagram4x5(targetDataUrl) {
    const origImg = await this.loadImage(targetDataUrl);

    // 1. 임시 캔버스에서 1:1 정사각형 1080x1080으로 준비
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 1080;
    sampleCanvas.height = 1080;
    const sCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });

    const origAspect = origImg.naturalWidth / origImg.naturalHeight;
    let sx = 0, sy = 0, sw = origImg.naturalWidth, sh = origImg.naturalHeight;

    if (origAspect > 1) {
      sw = origImg.naturalHeight;
      sx = (origImg.naturalWidth - sw) / 2;
    } else if (origAspect < 1) {
      sh = origImg.naturalWidth;
      sy = (origImg.naturalHeight - sh) / 2;
    }
    sCtx.drawImage(origImg, sx, sy, sw, sh, 0, 0, 1080, 1080);

    // 최상단 픽셀 평균 색상 추출 (상단 y: 0~4, x: 200~880 중앙 영역 샘플링)
    const topImgData = sCtx.getImageData(200, 0, 680, 4).data;
    let rTop = 0, gTop = 0, bTop = 0, countTop = 0;
    for (let i = 0; i < topImgData.length; i += 4) {
      rTop += topImgData[i];
      gTop += topImgData[i + 1];
      bTop += topImgData[i + 2];
      countTop++;
    }
    rTop = Math.round(rTop / (countTop || 1));
    gTop = Math.round(gTop / (countTop || 1));
    bTop = Math.round(bTop / (countTop || 1));

    // 최하단 픽셀 평균 색상 추출 (하단 y: 1075~1079, x: 200~880 중앙 영역 샘플링)
    const botImgData = sCtx.getImageData(200, 1075, 680, 4).data;
    let rBot = 0, gBot = 0, bBot = 0, countBot = 0;
    for (let i = 0; i < botImgData.length; i += 4) {
      rBot += botImgData[i];
      gBot += botImgData[i + 1];
      bBot += botImgData[i + 2];
      countBot++;
    }
    rBot = Math.round(rBot / (countBot || 1));
    gBot = Math.round(gBot / (countBot || 1));
    bBot = Math.round(bBot / (countBot || 1));

    // 2. 인스타 4:5 캔버스 (1080 x 1440) 생성
    const instaCanvas = document.createElement('canvas');
    instaCanvas.width = 1080;
    instaCanvas.height = 1440;
    const ctx = instaCanvas.getContext('2d');

    const topColor = `rgb(${rTop}, ${gTop}, ${bTop})`;
    const botColor = `rgb(${rBot}, ${gBot}, ${bBot})`;

    // 3. 상단 180px 영역 채우기
    ctx.fillStyle = topColor;
    ctx.fillRect(0, 0, 1080, 200);

    // 4. 하단 180px 영역 채우기
    ctx.fillStyle = botColor;
    ctx.fillRect(0, 1240, 1080, 200);

    // 5. 전체 배경 부드러운 수직 그라데이션 연결
    const bgGrad = ctx.createLinearGradient(0, 0, 0, 1440);
    bgGrad.addColorStop(0, topColor);
    bgGrad.addColorStop(0.125, topColor); // 180px
    bgGrad.addColorStop(0.875, botColor); // 1260px
    bgGrad.addColorStop(1, botColor);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 1440);

    // 6. 1:1 이미지(1080x1080)를 정중앙(y=180)에 왜곡 없이 100% 선명하게 배치
    ctx.drawImage(sampleCanvas, 0, 180, 1080, 1080);

    return instaCanvas.toDataURL('image/png', 1.0);
  }

  // 파일명 포맷: (병원명)_(현재년월일)_(시각 hhmmss)_(순번 01, 02...).png
  generateOutputFileName(hospitalName, index, total, baseDate = new Date(), suffix = '') {
    const year = baseDate.getFullYear();
    const month = String(baseDate.getMonth() + 1).padStart(2, '0');
    const day = String(baseDate.getDate()).padStart(2, '0');
    const hours = String(baseDate.getHours()).padStart(2, '0');
    const mins = String(baseDate.getMinutes()).padStart(2, '0');
    const secs = String(baseDate.getSeconds()).padStart(2, '0');

    const dateStr = `${year}${month}${day}`;
    const timeStr = `${hours}${mins}${secs}`;
    const cleanName = (hospitalName || '사진').replace(/[^a-zA-Z0-9가-힣_-]/g, '_').trim();
    const sfx = suffix ? `_${suffix}` : '';

    // 항상 명확한 2자리 순번(01, 02, 03...) 부여
    const numStr = String((index !== undefined ? index : 0) + 1).padStart(2, '0');
    return `${cleanName}_${dateStr}_${timeStr}_${numStr}${sfx}.png`;
  }

  // ================================================================
  // 5. 다운로드 기능 (합성본 및 원본 모두 1:1 / 인스타 4:5 지원)
  // ================================================================
  // 1:1 단일 다운로드
  async downloadSingle1x1(item) {
    let finalUrl = item.composedDataUrl;
    if (!finalUrl) {
      finalUrl = await this.compose1x1FromOriginal(item.originalDataUrl);
    }
    const a = document.createElement('a');
    a.href = finalUrl;
    a.download = item.formattedFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // 인스타용 4:5 단일 다운로드 (합성본 또는 원본 자동 변환)
  async downloadSingleInsta(item) {
    const src = item.composedDataUrl || item.originalDataUrl;
    const instaDataUrl = await this.composeInstagram4x5(src);
    const instaFileName = item.formattedFileName.replace('.png', '_insta_4x5.png');

    const a = document.createElement('a');
    a.href = instaDataUrl;
    a.download = instaFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // 1:1 일괄 ZIP 다운로드 (합성본 우선, 없으면 1:1 원본)
  async downloadAllAsZip1x1() {
    const total = this.items.length;
    if (total === 0) {
      alert('업로드된 이미지가 없습니다.');
      return;
    }

    this.downloadAll1x1Btn.disabled = true;
    this.downloadAll1x1Btn.textContent = '1:1 압축 중...';

    try {
      const zip = new JSZip();
      const hospital = this.getSelectedHospital();
      const hospitalName = hospital ? hospital.name : '사진';
      const baseDate = new Date();

      for (let i = 0; i < total; i++) {
        const item = this.items[i];
        this.downloadAll1x1Btn.textContent = `1:1 변환 중 (${i + 1}/${total})...`;

        let finalUrl = item.composedDataUrl;
        if (!finalUrl) {
          finalUrl = await this.compose1x1FromOriginal(item.originalDataUrl);
        }
        const base64Data = finalUrl.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
        
        // 고유한 순번 파일명 생성
        const fileName1x1 = this.generateOutputFileName(hospitalName, i, total, baseDate);
        zip.file(fileName1x1, base64Data, { base64: true });
      }

      this.downloadAll1x1Btn.textContent = 'ZIP 파일 생성 중...';
      const now = new Date();
      const zipName = `${hospitalName}_1x1_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.zip`;

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('1:1 ZIP 생성 실패:', err);
      alert('1:1 ZIP 생성 중 오류가 발생했습니다.');
    } finally {
      this.downloadAll1x1Btn.disabled = false;
      this.downloadAll1x1Btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        1:1 ZIP 다운
      `;
    }
  }

  // 인스타용 4:5 일괄 ZIP 다운로드 (합성본 또는 업로드 원본 자동 인스타 4:5 변환)
  async downloadAllAsZipInsta() {
    const total = this.items.length;
    if (total === 0) {
      alert('업로드된 이미지가 없습니다.');
      return;
    }

    this.downloadAllInstaBtn.disabled = true;
    this.downloadAllInstaBtn.textContent = '인스타 4:5 변환 시작...';

    try {
      const zip = new JSZip();
      const hospital = this.getSelectedHospital();
      const hospitalName = hospital ? hospital.name : '사진';
      const baseDate = new Date();

      for (let i = 0; i < total; i++) {
        const item = this.items[i];
        this.downloadAllInstaBtn.textContent = `인스타 4:5 변환 중 (${i + 1}/${total})...`;

        const src = item.composedDataUrl || item.originalDataUrl;
        const instaDataUrl = await this.composeInstagram4x5(src);
        const base64Data = instaDataUrl.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');

        // 고유한 순번 파일명 생성 (_insta_4x5 접미사)
        const baseFileName = this.generateOutputFileName(hospitalName, i, total, baseDate);
        const instaFileName = baseFileName.replace('.png', '_insta_4x5.png');
        
        zip.file(instaFileName, base64Data, { base64: true });
      }

      this.downloadAllInstaBtn.textContent = 'ZIP 압축 파일 생성 중...';
      const now = new Date();
      const zipName = `${hospitalName}_인스타4x5_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.zip`;

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('인스타 ZIP 생성 실패:', err);
      alert('인스타 ZIP 생성 중 오류가 발생했습니다.');
    } finally {
      this.downloadAllInstaBtn.disabled = false;
      this.downloadAllInstaBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
        인스타용(1080×1440) 일괄 ZIP 다운
      `;
    }
  }

  // ================================================================
  // 6. 병원 관리자 모달 및 로컬 파일 CRUD
  // ================================================================
  openManager() {
    this.renderManagerList();
    this.managerModal.style.display = 'flex';
  }

  closeManager() {
    this.managerModal.style.display = 'none';
    this.managerForm.reset();
    this.tempWatermarkDataUrl = null;
    this.newWmThumb.style.display = 'none';
    this.newWmPlaceholder.style.display = 'flex';
  }

  handleNewWatermarkFile(file) {
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드할 수 있습니다.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      this.tempWatermarkDataUrl = e.target.result;
      const img = new Image();
      img.onload = () => {
        this.newWmThumb.src = this.tempWatermarkDataUrl;
        this.newWmThumb.style.display = 'block';
        this.newWmPlaceholder.style.display = 'none';
        this.newWmDimensions.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
      };
      img.src = this.tempWatermarkDataUrl;
    };
    reader.readAsDataURL(file);
  }

  async handleSubmitNewHospital(e) {
    e.preventDefault();
    const name = this.newHospitalName.value.trim();
    const desc = this.newHospitalDesc.value.trim();

    if (!name) {
      alert('병원명을 입력해주세요.');
      return;
    }
    if (!this.tempWatermarkDataUrl) {
      alert('워터마크 이미지를 업로드해주세요.');
      return;
    }

    this.submitNewHospitalBtn.disabled = true;
    this.submitNewHospitalBtn.textContent = '워터마크 저장 중...';

    const newHospital = {
      id: 'hospital-' + Date.now(),
      name,
      description: desc,
      watermarkDataUrl: this.tempWatermarkDataUrl,
      createdAt: Date.now(),
      isDefault: false
    };

    let savedOnServer = false;
    try {
      const res = await fetch('/api/hospitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newHospital)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.hospital) {
          this.hospitals.push(json.hospital);
          this.selectedHospitalId = json.hospital.id;
          savedOnServer = true;
        }
      }
    } catch (err) {
      // 정적 웹 환경(Vercel)
    }

    if (!savedOnServer) {
      this.hospitals.push(newHospital);
      this.selectedHospitalId = newHospital.id;
    }

    await this.saveHospitalsToStorage();
    this.closeManager();
    this.updateUI();
    alert(`'${name}' 병원 워터마크가 안전하게 저장되었습니다!`);

    this.submitNewHospitalBtn.disabled = false;
    this.submitNewHospitalBtn.textContent = '병원 및 워터마크 저장';
  }

  async deleteHospital(id) {
    const target = this.hospitals.find(h => h.id === id);
    if (!target) return;

    if (!confirm(`'${target.name}' 병원을 정말 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await fetch(`/api/hospitals/${id}`, { method: 'DELETE' });
    } catch (err) {}

    this.hospitals = this.hospitals.filter(h => h.id !== id);
    if (this.selectedHospitalId === id) {
      this.selectedHospitalId = this.hospitals.length > 0 ? this.hospitals[0].id : null;
    }
    await this.saveHospitalsToStorage();
    this.renderManagerList();
    this.updateUI();
  }

  renderManagerList() {
    this.managerList.innerHTML = '';
    if (this.hospitals.length === 0) {
      this.managerList.innerHTML = '<div class="empty-hint">등록된 병원이 없습니다. 오른쪽에서 새 병원을 추가해주세요.</div>';
      return;
    }

    this.hospitals.forEach(h => {
      const isSelected = h.id === this.selectedHospitalId;
      const card = document.createElement('div');
      card.className = `hospital-card ${isSelected ? 'selected' : ''}`;
      card.innerHTML = `
        <div class="hospital-thumb-box">
          <img src="${h.watermarkDataUrl || h.watermarkUrl}" alt="${h.name}">
        </div>
        <div class="hospital-info">
          <div class="hospital-name-row">
            <h4>${h.name}</h4>
            ${isSelected ? '<span class="tag-selected">선택됨</span>' : ''}
          </div>
          <p class="hospital-desc">${h.description || '로컬 저장 워터마크'}</p>
        </div>
        <button type="button" class="btn-del-hospital" title="병원 삭제">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      `;

      card.addEventListener('click', () => {
        this.selectedHospitalId = h.id;
        this.renderManagerList();
        this.handleHospitalChange();
      });

      card.querySelector('.btn-del-hospital').addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteHospital(h.id);
      });

      this.managerList.appendChild(card);
    });
  }

  // ================================================================
  // 7. UI 전체 렌더링
  // ================================================================
  updateUI() {
    const selected = this.getSelectedHospital();
    const count = this.items.length;
    const doneCount = this.items.filter(it => it.status === 'done').length;

    this.hospitalSelect.innerHTML = '';
    if (this.hospitals.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '등록된 병원 없음 (우측에서 등록)';
      this.hospitalSelect.appendChild(opt);
    } else {
      this.hospitals.forEach(h => {
        const opt = document.createElement('option');
        opt.value = h.id;
        opt.textContent = h.name;
        if (h.id === this.selectedHospitalId) opt.selected = true;
        this.hospitalSelect.appendChild(opt);
      });
    }

    if (selected) {
      this.activeHospitalEmpty.style.display = 'none';
      this.activeHospitalContent.style.display = 'flex';
      this.activeHospitalName.textContent = selected.name;
      this.activeHospitalThumb.src = selected.watermarkDataUrl || selected.watermarkUrl;
    } else {
      this.activeHospitalEmpty.style.display = 'flex';
      this.activeHospitalContent.style.display = 'none';
    }

    this.countBadge.textContent = `사진 ${count}장 (${doneCount}장 워터마크 합성됨)`;

    if (count === 0) {
      this.emptyState.style.display = 'block';
      this.gridWrapper.style.display = 'none';
      this.toolbar.style.display = 'none';
    } else {
      this.emptyState.style.display = 'none';
      this.gridWrapper.style.display = 'block';
      this.toolbar.style.display = 'flex';
    }

    // 워터마크 일괄 합성은 사진이 있고 병원이 선택되었을 때 활성화
    this.startProcessBtn.disabled = this.isProcessing || count === 0 || !selected;
    
    // 다운로드 버튼은 사진이 1장 이상 업로드되면 즉시 활성화!
    this.downloadAll1x1Btn.disabled = count === 0;
    this.downloadAllInstaBtn.disabled = count === 0;

    this.renderGrid();
  }

  renderGrid() {
    this.grid.innerHTML = '';

    this.items.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = `wm-image-card ${item.status}`;
      const previewSrc = item.composedDataUrl || item.originalDataUrl;

      let statusBadge = '';
      if (item.status === 'pending') {
        statusBadge = '<span class="status-tag tag-pending">업로드됨 (미합성)</span>';
      } else if (item.status === 'processing') {
        statusBadge = '<span class="status-tag tag-processing">합성 중...</span>';
      } else if (item.status === 'done') {
        statusBadge = '<span class="status-tag tag-done">워터마크 완료</span>';
      } else if (item.status === 'error') {
        statusBadge = '<span class="status-tag tag-error">오류</span>';
      }

      card.innerHTML = `
        <div class="wm-card-thumb-wrap">
          <img src="${previewSrc}" alt="${item.fileName}" class="wm-card-thumb">
          <span class="wm-index-badge">#${index + 1}</span>
          ${statusBadge}
          <div class="wm-card-overlay-actions">
            <button type="button" class="wm-action-btn btn-zoom" title="크게 보기">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
            </button>
            <button type="button" class="wm-action-btn btn-delete-single" title="삭제">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
        <div class="wm-card-info">
          <div class="wm-formatted-name" title="${item.formattedFileName}">${item.formattedFileName}</div>
          <div class="wm-orig-meta">${item.fileName}</div>
          
          <div class="wm-card-download-row">
            <button type="button" class="btn-card-dl btn-dl-1x1" title="1:1 정방형 (1080×1080) 다운로드">
              1:1 다운
            </button>
            <button type="button" class="btn-card-dl btn-dl-insta" title="인스타 4:5 (1080×1440) 확장 다운로드">
              📸 인스타용 4:5
            </button>
          </div>
        </div>
      `;

      card.querySelector('.btn-zoom').addEventListener('click', (e) => {
        e.stopPropagation();
        this.openDetail(item);
      });

      card.querySelector('.btn-delete-single').addEventListener('click', (e) => {
        e.stopPropagation();
        this.items = this.items.filter(it => it.id !== item.id);
        this.refreshFileNames();
        this.updateUI();
      });

      card.querySelector('.btn-dl-1x1').addEventListener('click', (e) => {
        e.stopPropagation();
        this.downloadSingle1x1(item);
      });

      card.querySelector('.btn-dl-insta').addEventListener('click', (e) => {
        e.stopPropagation();
        this.downloadSingleInsta(item);
      });

      this.grid.appendChild(card);
    });
  }

  // ================================================================
  // 8. 라이트박스 모달
  // ================================================================
  openDetail(item) {
    this.detailItem = item;
    const previewSrc = item.composedDataUrl || item.originalDataUrl;
    this.detailImg.src = previewSrc;
    this.detailTitle.textContent = item.formattedFileName;
    this.detailMeta.textContent = `파일명: ${item.fileName} (${item.dimensions.width} × ${item.dimensions.height}px) - ${item.composedDataUrl ? '워터마크 합성됨' : '업로드 원본 상태'}`;

    this.detailDownload1x1Btn.style.display = 'inline-flex';
    this.detailDownloadInstaBtn.style.display = 'inline-flex';
    this.detailDownload1x1Btn.onclick = () => this.downloadSingle1x1(item);
    this.detailDownloadInstaBtn.onclick = () => this.downloadSingleInsta(item);

    this.detailModal.style.display = 'flex';
  }

  closeDetail() {
    this.detailModal.style.display = 'none';
    this.detailItem = null;
  }
}

window.WatermarkStudio = WatermarkStudio;
