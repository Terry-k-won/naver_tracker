/**
 * Supabase 일괄 데이터 마이그레이션 스크립트
 * 
 * 사용법:
 * node migrate_to_supabase.js <SUPABASE_URL> <SUPABASE_ANON_OR_SERVICE_KEY>
 * 
 * 예:
 * node migrate_to_supabase.js https://xyz.supabase.co eyJhbGciOi...
 */

const fs = require('fs');
const path = require('path');

const supabaseUrl = process.argv[2] || process.env.SUPABASE_URL;
const supabaseKey = process.argv[3] || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('\n[오류] Supabase URL과 Key를 인자로 전달해주세요.');
  console.log('사용법: node migrate_to_supabase.js <SUPABASE_URL> <SUPABASE_KEY>\n');
  process.exit(1);
}

const cleanedUrl = supabaseUrl.replace(/\/+$/, '');

async function supabaseFetch(endpoint, data) {
  const res = await fetch(`${cleanedUrl}/rest/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[${res.status}] ${endpoint} 삽입 실패: ${errText}`);
  }
}

async function runMigration() {
  console.log('====================================================');
  console.log('🚀 MEDI GO ROUND 데이터 -> Supabase 마이그레이션 시작');
  console.log(`대상 URL: ${cleanedUrl}`);
  console.log('====================================================\n');

  let rawData = null;
  const liveBackupPath = path.join(__dirname, 'live_backup_latest.json');
  const mergedBackupPath = path.join(__dirname, 'merged_backup.json');

  if (fs.existsSync(liveBackupPath)) {
    console.log('📦 최신 라이브 백업 데이터 (live_backup_latest.json) 로드 중...');
    rawData = JSON.parse(fs.readFileSync(liveBackupPath, 'utf8'));
  } else if (fs.existsSync(mergedBackupPath)) {
    console.log('📦 백업 데이터 (merged_backup.json) 로드 중...');
    rawData = JSON.parse(fs.readFileSync(mergedBackupPath, 'utf8'));
  } else {
    throw new Error('백업 데이터 파일을 찾을 수 없습니다.');
  }

  // 1. Hospitals
  const hospitals = Array.isArray(rawData.hospitals) ? rawData.hospitals : [];
  console.log(`\n🏥 1. 병원 데이터 이전 (${hospitals.length}개)...`);
  const hospitalRows = hospitals.map(h => ({
    id: h.id,
    name: h.name,
    default_quota: h.defaultQuota || { brandBlog: 0, press: 0, receipt: 0 },
    naver_id: h.naverId || '',
    naver_password: h.naverPassword || '',
    naver_blog_url: h.naverBlogUrl || '',
    naver_map_url: h.naverMapUrl || '',
    cycle_start_day: Number(h.cycleStartDay) || 1,
    auto_assign_paused: !!h.autoAssignPaused,
    interleave_types: !!h.interleaveTypes
  }));

  if (hospitalRows.length > 0) {
    await supabaseFetch('hospitals', hospitalRows);
    console.log(`✅ 병원 ${hospitalRows.length}개 이전 완료!`);
  }

  // 2. Tasks (배치 크기 100개씩 분할 전송)
  const tasks = Array.isArray(rawData.tasks) ? rawData.tasks : [];
  console.log(`\n📋 2. 작업 내역 데이터 이전 (${tasks.length}개)...`);
  const taskRows = tasks.map(t => ({
    id: t.id,
    hospital_id: t.hospitalId,
    type: t.type || 'brandBlog',
    keyword: t.keyword || '',
    topic_text: t.topicText || '',
    deadline: t.deadline || '',
    status: t.status || '시작 전',
    published_date: t.publishedDate || null,
    published_url: t.publishedUrl || '',
    keyword_volume: t.keywordVolume !== null && t.keywordVolume !== undefined ? Number(t.keywordVolume) : null,
    keyword_docs: t.keywordDocs !== null && t.keywordDocs !== undefined ? Number(t.keywordDocs) : null,
    keyword_gap: t.keywordGap !== null && t.keywordGap !== undefined ? Number(t.keywordGap) : null,
    performance: t.performance || '',
    created_at: t.createdAt ? Number(t.createdAt) : Date.now()
  }));

  const batchSize = 100;
  for (let i = 0; i < taskRows.length; i += batchSize) {
    const chunk = taskRows.slice(i, i + batchSize);
    await supabaseFetch('tasks', chunk);
    console.log(`   - 작업 ${i + 1} ~ ${Math.min(i + batchSize, taskRows.length)}건 이전 완료`);
  }
  console.log(`✅ 전체 작업 내역 ${taskRows.length}개 이전 완료!`);

  // 3. Quota Overrides
  const quotaOverrides = rawData.quotaOverrides || {};
  const quotaKeys = Object.keys(quotaOverrides);
  console.log(`\n⚙️ 3. 월별 할당량 예외 이전 (${quotaKeys.length}개)...`);
  const quotaRows = quotaKeys.map(k => {
    const q = quotaOverrides[k] || {};
    const parts = k.split('::');
    return {
      key: k,
      hospital_id: parts[0] || '',
      year_month: parts[1] || '',
      brand_blog: Number(q.brandBlog) || 0,
      press: Number(q.press) || 0,
      receipt: Number(q.receipt) || 0
    };
  });

  if (quotaRows.length > 0) {
    await supabaseFetch('quota_overrides', quotaRows);
    console.log(`✅ 할당량 예외 ${quotaRows.length}개 이전 완료!`);
  }

  // 4. Tag Pool
  const tagPool = Array.isArray(rawData.tagPool) ? rawData.tagPool : [];
  console.log(`\n🏷️ 4. 키워드 풀 이전 (${tagPool.length}개)...`);
  const tagRows = tagPool.map(t => ({
    id: t.id || `${t.hospitalId}-${t.kind}-${t.text}`,
    hospital_id: t.hospitalId,
    kind: t.kind,
    text: t.text
  }));

  if (tagRows.length > 0) {
    await supabaseFetch('tag_pool', tagRows);
    console.log(`✅ 키워드 풀 ${tagRows.length}개 이전 완료!`);
  }

  console.log('\n====================================================');
  console.log('🎉 모든 데이터가 Supabase로 완벽하게 이전되었습니다!');
  console.log('====================================================\n');
}

runMigration().catch(err => {
  console.error('\n❌ 마이그레이션 실패:', err.message);
  process.exit(1);
});
