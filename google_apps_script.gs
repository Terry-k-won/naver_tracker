/** @OnlyCurrentDoc */

/**
 * MEDI GO ROUND - 네이버 마케팅 트래커 (Google Apps Script API)
 * 
 * [배포방법]
 * 1. 이 코드를 Apps Script 에디터에 전체 복사-붙여넣기 합니다.
 * 2. 우측 상단 [배포] -> [배포 관리] 클릭 -> ✏️ 연필(편집) 아이콘 클릭 -> 버전을 [새 버전]으로 선택 -> [배포] 클릭!
 */

const SHEET_HOSPITALS = 'Hospitals';
const SHEET_TASKS = 'Tasks';
const SHEET_QUOTAS = 'QuotaOverrides';
const SHEET_TAGS = 'TagPool';

function formatDateVal(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
  const parsedDate = new Date(str);
  if (!isNaN(parsedDate.getTime())) {
    const y = parsedDate.getFullYear();
    const m = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const d = String(parsedDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return str;
}

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const data = buildDataFromTabularSheets(ss);
    
    const output = {
      status: 'ok',
      data: data,
      updated_at: new Date().toISOString()
    };
    
    return ContentService.createTextOutput(JSON.stringify(output))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const contents = e.postData.contents;
    if (!contents) {
      throw new Error('요청 본문(postData)이 비어있습니다.');
    }
    
    const parsed = JSON.parse(contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    updateTabularSheets(ss, parsed);
    
    const output = {
      status: 'ok',
      updated_at: new Date().toISOString()
    };
    
    return ContentService.createTextOutput(JSON.stringify(output))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function updateTabularSheets(ss, db) {
  if (!db || typeof db !== 'object') return;

  // 1. Hospitals 시트
  const hospitals = Array.isArray(db.hospitals) ? db.hospitals : [];
  let hSheet = ss.getSheetByName(SHEET_HOSPITALS);
  if (!hSheet) hSheet = ss.insertSheet(SHEET_HOSPITALS);
  hSheet.clearContents();
  const hHeaders = ['ID', '병원명', '브랜드블로그 목표', '기자단 목표', '영수증리뷰 목표', '주기 시작일', '네이버 ID', '네이버 비밀번호', '블로그 URL', '지도 URL', '일시정지 여부'];
  const hRows = [hHeaders];
  hospitals.forEach(h => {
    const q = h.defaultQuota || {};
    hRows.push([
      h.id || '',
      h.name || '',
      q.brandBlog || 0,
      q.press || 0,
      q.receipt || 0,
      h.cycleStartDay || 1,
      h.naverId || '',
      h.naverPassword || '',
      h.naverBlogUrl || '',
      h.naverMapUrl || '',
      h.autoAssignPaused ? '일시정지' : '정상'
    ]);
  });
  hSheet.getRange(1, 1, hRows.length, hHeaders.length).setValues(hRows);

  // 2. Tasks 시트
  const tasks = Array.isArray(db.tasks) ? db.tasks : [];
  let tSheet = ss.getSheetByName(SHEET_TASKS);
  if (!tSheet) tSheet = ss.insertSheet(SHEET_TASKS);
  tSheet.clearContents();
  const tHeaders = ['ID', '병원ID', '발행 종류', '키워드', '글감(텍스트)', '마감일', '진행상황', '발행일', '발행 URL', '검색량', '발행량', '성과'];
  const tRows = [tHeaders];
  tasks.forEach(t => {
    const typeLabel = t.type === 'brandBlog' ? '브랜드 블로그' : (t.type === 'press' ? '기자단' : (t.type === 'receipt' ? '영수증 리뷰' : t.type));
    tRows.push([
      t.id || '',
      t.hospitalId || '',
      typeLabel,
      t.keyword || '',
      t.topicText || '',
      formatDateVal(t.deadline),
      t.status || '',
      formatDateVal(t.publishedDate),
      t.publishedUrl || '',
      t.keywordVolume !== null && t.keywordVolume !== undefined ? t.keywordVolume : '',
      t.keywordDocs !== null && t.keywordDocs !== undefined ? t.keywordDocs : '',
      t.performance || ''
    ]);
  });
  tSheet.getRange(1, 1, tRows.length, tHeaders.length).setValues(tRows);

  // 3. QuotaOverrides 시트
  const quotaOverrides = db.quotaOverrides || {};
  let qSheet = ss.getSheetByName(SHEET_QUOTAS);
  if (!qSheet) qSheet = ss.insertSheet(SHEET_QUOTAS);
  qSheet.clearContents();
  const qHeaders = ['연월-병원ID', '브랜드블로그 목표', '기자단 목표', '영수증리뷰 목표'];
  const qRows = [qHeaders];
  Object.keys(quotaOverrides).forEach(key => {
    const item = quotaOverrides[key] || {};
    qRows.push([
      key,
      item.brandBlog || 0,
      item.press || 0,
      item.receipt || 0
    ]);
  });
  qSheet.getRange(1, 1, qRows.length, qHeaders.length).setValues(qRows);

  // 4. TagPool 시트
  const tagPool = Array.isArray(db.tagPool) ? db.tagPool : [];
  let tagSheet = ss.getSheetByName(SHEET_TAGS);
  if (!tagSheet) tagSheet = ss.insertSheet(SHEET_TAGS);
  tagSheet.clearContents();
  const tagHeaders = ['ID', '병원ID', '구분', '키워드/텍스트', '검색량', '발행량'];
  const tagRows = [tagHeaders];
  tagPool.forEach(tag => {
    tagRows.push([
      tag.id || '',
      tag.hospitalId || '',
      tag.kind || '',
      tag.keyword || '',
      tag.volume !== null && tag.volume !== undefined ? tag.volume : '',
      tag.docs !== null && tag.docs !== undefined ? tag.docs : ''
    ]);
  });
  tagSheet.getRange(1, 1, tagRows.length, tagHeaders.length).setValues(tagRows);
}

function buildDataFromTabularSheets(ss) {
  const hospitals = [];
  const hSheet = ss.getSheetByName(SHEET_HOSPITALS);
  if (hSheet && hSheet.getLastRow() > 1) {
    const hVals = hSheet.getRange(2, 1, hSheet.getLastRow() - 1, 11).getValues();
    hVals.forEach(r => {
      if (r[0]) {
        hospitals.push({
          id: String(r[0]),
          name: String(r[1]),
          defaultQuota: { brandBlog: Number(r[2])||0, press: Number(r[3])||0, receipt: Number(r[4])||0 },
          cycleStartDay: Number(r[5])||1,
          naverId: String(r[6]||''),
          naverPassword: String(r[7]||''),
          naverBlogUrl: String(r[8]||''),
          naverMapUrl: String(r[9]||''),
          autoAssignPaused: String(r[10]) === '일시정지'
        });
      }
    });
  }

  const tasks = [];
  const tSheet = ss.getSheetByName(SHEET_TASKS);
  if (tSheet && tSheet.getLastRow() > 1) {
    const tVals = tSheet.getRange(2, 1, tSheet.getLastRow() - 1, 12).getValues();
    tVals.forEach(r => {
      if (r[0]) {
        let rawType = String(r[2]||'');
        let type = 'brandBlog';
        if (rawType.includes('기자단') || rawType === 'press') type = 'press';
        else if (rawType.includes('영수증') || rawType === 'receipt') type = 'receipt';

        tasks.push({
          id: String(r[0]),
          hospitalId: String(r[1]||''),
          type,
          keyword: String(r[3]||''),
          topicText: String(r[4]||''),
          deadline: formatDateVal(r[5]),
          status: String(r[6]||'시작 전'),
          publishedDate: r[7] ? formatDateVal(r[7]) : null,
          publishedUrl: String(r[8]||''),
          keywordVolume: r[9] !== '' ? Number(r[9]) : null,
          keywordDocs: r[10] !== '' ? Number(r[10]) : null,
          performance: String(r[11]||'')
        });
      }
    });
  }

  const quotaOverrides = {};
  const qSheet = ss.getSheetByName(SHEET_QUOTAS);
  if (qSheet && qSheet.getLastRow() > 1) {
    const qVals = qSheet.getRange(2, 1, qSheet.getLastRow() - 1, 4).getValues();
    qVals.forEach(r => {
      if (r[0]) {
        quotaOverrides[String(r[0])] = {
          brandBlog: Number(r[1])||0,
          press: Number(r[2])||0,
          receipt: Number(r[3])||0
        };
      }
    });
  }

  return { hospitals, tasks, quotaOverrides, tagPool: [] };
}
