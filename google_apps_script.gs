/** @OnlyCurrentDoc */

/**
 * MEDI GO ROUND - 네이버 마케팅 트래커 (Google Apps Script API)
 */

const SHEET_STATE = 'TrackerState';
const SHEET_HOSPITALS = 'Hospitals';
const SHEET_TASKS = 'Tasks';
const SHEET_QUOTAS = 'QuotaOverrides';
const SHEET_TAGS = 'TagPool';

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let stateSheet = ss.getSheetByName(SHEET_STATE);
    
    if (!stateSheet) {
      stateSheet = ss.insertSheet(SHEET_STATE);
    }
    
    const lastRow = stateSheet.getLastRow();
    let jsonStr = '';
    if (lastRow > 0) {
      const values = stateSheet.getRange(1, 1, lastRow, 1).getValues();
      jsonStr = values.map(r => r[0] || '').join('');
    }
    
    const updatedAt = stateSheet.getRange('B1').getValue() || new Date().toISOString();
    
    let data = null;
    if (jsonStr && jsonStr !== '{}') {
      try {
        data = JSON.parse(jsonStr);
      } catch (err) {
        data = null;
      }
    }
    
    // Fallback: If TrackerState json is empty, build from tabular sheets
    if (!data || !Array.isArray(data.hospitals) || data.hospitals.length === 0) {
      data = buildDataFromTabularSheets(ss);
    }
    
    const output = {
      status: 'ok',
      data: data,
      updated_at: updatedAt
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
    
    let stateSheet = ss.getSheetByName(SHEET_STATE);
    if (!stateSheet) {
      stateSheet = ss.insertSheet(SHEET_STATE);
    }
    
    const nowIso = new Date().toISOString();
    const jsonStr = JSON.stringify(parsed);
    
    // Chunk jsonStr into 30,000 character cells so single cell 50,000 limit is never hit
    stateSheet.clearContents();
    const CHUNK_SIZE = 30000;
    const chunks = [];
    for (let i = 0; i < jsonStr.length; i += CHUNK_SIZE) {
      chunks.push([jsonStr.substring(i, i + CHUNK_SIZE)]);
    }
    if (chunks.length > 0) {
      stateSheet.getRange(1, 1, chunks.length, 1).setValues(chunks);
    }
    stateSheet.getRange(1, 2).setValue(nowIso);
    
    updateTabularSheets(ss, parsed);
    
    const output = {
      status: 'ok',
      updated_at: nowIso
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
  const tHeaders = ['ID', '병원ID', '발행 종류', '키워드', '글감(텍스트)', '마감일', '진행상황', '발행일', '검색량', '발행량', '성과'];
  const tRows = [tHeaders];
  tasks.forEach(t => {
    const typeLabel = t.type === 'brandBlog' ? '브랜드 블로그' : (t.type === 'press' ? '기자단' : (t.type === 'receipt' ? '영수증 리뷰' : t.type));
    tRows.push([
      t.id || '',
      t.hospitalId || '',
      typeLabel,
      t.keyword || '',
      t.topicText || '',
      t.deadline || '',
      t.status || '',
      t.publishedDate || '',
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
    const tVals = tSheet.getRange(2, 1, tSheet.getLastRow() - 1, 11).getValues();
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
          deadline: String(r[5]||''),
          status: String(r[6]||'시작 전'),
          publishedDate: r[7] ? String(r[7]) : null,
          keywordVolume: r[8] !== '' ? Number(r[8]) : null,
          keywordDocs: r[9] !== '' ? Number(r[9]) : null,
          performance: String(r[10]||'')
        });
      }
    });
  }

  return { hospitals, tasks, quotaOverrides: {}, tagPool: [] };
}
