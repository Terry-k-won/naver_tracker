/* ==================== 상수 / 유틸 ==================== */

const STORAGE_KEY = 'medigo_naver_tracker_v1';
const THEME_KEY = 'medigo_naver_tracker_theme';
const TASK_ORDER_KEY = 'medigo_naver_tracker_task_order';
const LONG_PRESS_MS = 450;

/* ==================== 클라우드 동기화 (Supabase & Google Sheets) ==================== */
const DEFAULT_SUPABASE_URL = 'https://pwyzqntqrwlxxtjzeons.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB3eXpxbnRxcndseHh0anplb25zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4MDczMzAsImV4cCI6MjEwNzM4MzMzMH0.-6Op_iT2VARkZ-bA78MdnnYeUqrn-FMPlFabsFGcpDo';
const SUPABASE_URL_KEY = 'medigo_naver_tracker_supabase_url';
const SUPABASE_KEY_KEY = 'medigo_naver_tracker_supabase_key';
let supabaseUrl = localStorage.getItem(SUPABASE_URL_KEY) || DEFAULT_SUPABASE_URL;
let supabaseKey = localStorage.getItem(SUPABASE_KEY_KEY) || DEFAULT_SUPABASE_KEY;
if (!supabaseUrl) supabaseUrl = DEFAULT_SUPABASE_URL;
if (!supabaseKey) supabaseKey = DEFAULT_SUPABASE_KEY;
let supabaseClient = null;

function initSupabaseClient() {
  if (supabaseUrl && supabaseKey && window.supabase) {
    try {
      supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
      return supabaseClient;
    } catch (e) {
      console.error('Supabase 클라이언트 초기화 실패:', e);
      supabaseClient = null;
    }
  }
  return null;
}

const DEFAULT_GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzj2b6DBcH-4fhfKXOhrxQgZ0V1qYmXXhlM3_J26EdBK3A84xnZMMMAUi6VF5_Q1W59kA/exec';
const GOOGLE_SCRIPT_URL_KEY = 'medigo_naver_tracker_google_script_url';
let googleScriptUrl = DEFAULT_GOOGLE_SCRIPT_URL || localStorage.getItem(GOOGLE_SCRIPT_URL_KEY) || '';

// 공유 비밀번호(패스코드) 게이트 - 평문 대신 SHA-256 해시로 비교한다.
// 비밀번호를 바꾸려면: 새 비밀번호의 SHA-256 해시값으로 아래 상수만 교체하면 된다.
const PASSCODE_OK_KEY = 'medigo_naver_tracker_passcode_ok';
const APP_PASSCODE_HASH = '0be057bbbdf7ad63295016eb691feb8c21a364073267de09503eb04b954d522e'; // "1825"

async function sha256Hex(str) {
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function showPasscodeGate() {
  return new Promise((resolve) => {
    if (localStorage.getItem(PASSCODE_OK_KEY) === '1') { resolve(); return; }

    const root = document.getElementById('app');
    root.innerHTML = `
      <div class="passcode-gate">
        <div class="passcode-card">
          <div class="passcode-title">MEDI GO ROUND</div>
          <div class="passcode-desc">비밀번호를 입력하면 계속할 수 있습니다.</div>
          <input type="password" id="passcodeInput" class="passcode-input" placeholder="비밀번호" autofocus>
          <div id="passcodeError" class="passcode-error"></div>
          <button type="button" id="passcodeSubmit" class="primary-btn btn-lg">입장하기</button>
        </div>
      </div>`;

    const pwEl = document.getElementById('passcodeInput');
    const errEl = document.getElementById('passcodeError');
    const btnEl = document.getElementById('passcodeSubmit');

    async function trySubmit() {
      const hash = await sha256Hex(pwEl.value);
      if (hash === APP_PASSCODE_HASH) {
        localStorage.setItem(PASSCODE_OK_KEY, '1');
        resolve();
      } else {
        errEl.textContent = '비밀번호가 올바르지 않습니다.';
        pwEl.value = '';
        pwEl.focus();
      }
    }

    btnEl.addEventListener('click', trySubmit);
    pwEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') trySubmit(); });
    pwEl.focus();
  });
}

function getInitialTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

let currentTheme = getInitialTheme();
document.documentElement.dataset.theme = currentTheme;

function loadTaskOrder() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TASK_ORDER_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

let taskOrder = loadTaskOrder();

function currentTaskOrderKey() {
  return `${state.hospitalId}::${monthKey(state.year, state.month)}`;
}

function saveCurrentTaskOrder() {
  const tbody = document.getElementById('trackerTbody');
  if (!tbody) return;
  taskOrder[currentTaskOrderKey()] = [...tbody.querySelectorAll('tr[data-task-id]')]
    .map((row) => row.dataset.taskId);
  localStorage.setItem(TASK_ORDER_KEY, JSON.stringify(taskOrder));
}

const TYPE_META = {
  brandBlog: { label: '브랜드 블로그', short: '브랜드', color: 'var(--series-1)' },
  press:     { label: '기자단',        short: '기자단', color: 'var(--series-2)' },
  receipt:   { label: '영수증 리뷰',    short: '영수증', color: 'var(--series-3)' },
};
const TYPE_KEYS = Object.keys(TYPE_META);
// 목표 수량 입력칸의 상한 - 오타로 큰 숫자가 들어가 자동 배정이 수만 건씩
// 생성되며 브라우저가 멈추는 사고를 막기 위한 안전장치.
const MAX_QUOTA_PER_TYPE = 200;
const STATUS_LIST = ['시작 전', '원고 준비', '메일 준비', '예약 발행', '요청 완료', '발행', '보고 완료'];
const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function pad2(n) { return String(n).padStart(2, '0'); }

function fmtDateStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthKey(year, month) { return `${year}-${pad2(month)}`; }

function monthLabel(year, month) { return `${year}년 ${month}월`; }

function normalizeUrl(u) {
  const trimmed = (u || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return 'https://' + trimmed;
}

function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }
function clampDay(year, month, day) { return Math.min(day, daysInMonth(year, month)); }

function getCycleRange(hospital, year, month) {
  const startDay = hospital.cycleStartDay || 1;
  const start = new Date(year, month - 1, clampDay(year, month, startDay));
  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) { nextMonth = 1; nextYear += 1; }
  const nextStart = new Date(nextYear, nextMonth - 1, clampDay(nextYear, nextMonth, startDay));
  const end = new Date(nextStart);
  end.setDate(end.getDate() - 1);
  return { start, end };
}

function cycleLabel(hospital, year, month) {
  if ((hospital.cycleStartDay || 1) === 1) return monthLabel(year, month);
  const { start, end } = getCycleRange(hospital, year, month);
  return `${start.getFullYear()}.${start.getMonth() + 1}.${start.getDate()} ~ ${end.getFullYear()}.${end.getMonth() + 1}.${end.getDate()}`;
}

function periodWord(hospital, year, month) {
  const isMonthly = (hospital.cycleStartDay || 1) === 1;
  if (year === undefined || month === undefined) {
    return isMonthly ? '이번달' : '이번 주기';
  }
  const anchor = getCurrentCycleAnchor(hospital, today);
  const isCurrent = year === anchor.year && month === anchor.month;
  if (isCurrent) return isMonthly ? '이번달' : '이번 주기';
  return isMonthly ? `${month}월` : cycleLabel(hospital, year, month);
}

function getCurrentCycleAnchor(hospital, refDate) {
  const startDay = hospital.cycleStartDay || 1;
  let y = refDate.getFullYear();
  let m = refDate.getMonth() + 1;
  const d = refDate.getDate();
  const thisStart = clampDay(y, m, startDay);
  if (d < thisStart) {
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
  }
  return { year: y, month: m };
}

const today = new Date();
const TODAY_STR = fmtDateStr(today);

function isPublishedStatus(status) {
  return status === '발행' || status === '발행완료' || status === '보고 완료' || status === '보고';
}

// 마감 보드에서 "색이 칠해질(=진행 중 이상)" 상태로 볼 것들.
// 할당량 완료 집계(isPublishedStatus)와는 다르게, 예약 발행/요청 완료처럼
// 실제 발행 전이라도 이미 손이 간 상태는 보드에서 시각적으로 구분되게 한다.
function isBoardActiveStatus(status) {
  return status === '예약 발행' || status === '예약발행' || status === '요청 완료' || status === '요청완료' || isPublishedStatus(status);
}

const INITIAL_HOSPITALS = [
  { id: 'h-gangnam', name: '강남마디튼튼의원', defaultQuota: { brandBlog: 2, press: 2, receipt: 4 }, cycleStartDay: 1, naverId: '', naverPassword: '', naverBlogUrl: '', naverMapUrl: '' },
  { id: 'h-junghankyo', name: '정한교피부과의원', defaultQuota: { brandBlog: 5, press: 6, receipt: 4 }, cycleStartDay: 1, naverId: '', naverPassword: '', naverBlogUrl: '', naverMapUrl: '' },
  { id: 'h-gibaek', name: '기백한의원', defaultQuota: { brandBlog: 5, press: 3, receipt: 4 }, cycleStartDay: 1, naverId: '', naverPassword: '', naverBlogUrl: '', naverMapUrl: '' },
  { id: 'h-simpyeonhan', name: '심편한내과', defaultQuota: { brandBlog: 4, press: 4, receipt: 2 }, cycleStartDay: 1, naverId: '', naverPassword: '', naverBlogUrl: '', naverMapUrl: '' },
];

const INITIAL_TASKS = [
  { id: 't-1', hospitalId: 'h-gangnam', type: 'press', deadline: '2026-08-24', status: '시작 전', keyword: '', keywordVolume: 100, keywordDocs: 240 },
  { id: 't-2', hospitalId: 'h-junghankyo', type: 'brandBlog', deadline: '2026-08-24', status: '시작 전', keyword: '', keywordVolume: 30, keywordDocs: 110 },
  { id: 't-3', hospitalId: 'h-gibaek', type: 'brandBlog', deadline: '2026-08-24', status: '시작 전', keyword: '', keywordVolume: 20, keywordDocs: 44 },
  { id: 't-4', hospitalId: 'h-simpyeonhan', type: 'brandBlog', deadline: '2026-08-24', status: '시작 전', keyword: '시흥 심편한내과', keywordVolume: 20, keywordDocs: 71 },
  { id: 't-5', hospitalId: 'h-gangnam', type: 'brandBlog', deadline: '2026-08-17', status: '시작 전', keyword: '', keywordVolume: 350, keywordDocs: 160 },
  { id: 't-6', hospitalId: 'h-junghankyo', type: 'brandBlog', deadline: '2026-08-17', status: '시작 전', keyword: '', keywordVolume: 30, keywordDocs: 110 },
  { id: 't-7', hospitalId: 'h-junghankyo', type: 'brandBlog', deadline: '2026-08-17', status: '시작 전', keyword: '', keywordVolume: 30, keywordDocs: 110 },
  { id: 't-8', hospitalId: 'h-junghankyo', type: 'press', deadline: '2026-08-17', status: '시작 전', keyword: '', keywordVolume: 30, keywordDocs: 110 },
  { id: 't-9', hospitalId: 'h-junghankyo', type: 'press', deadline: '2026-08-17', status: '시작 전', keyword: '', keywordVolume: 30, keywordDocs: 110 },
  { id: 't-10', hospitalId: 'h-gibaek', type: 'brandBlog', deadline: '2026-08-17', status: '시작 전', keyword: '', keywordVolume: 20, keywordDocs: 44 },
  { id: 't-11', hospitalId: 'h-simpyeonhan', type: 'brandBlog', deadline: '2026-08-17', status: '시작 전', keyword: '', keywordVolume: 20, keywordDocs: 44 },
  { id: 't-12', hospitalId: 'h-simpyeonhan', type: 'press', deadline: '2026-08-17', status: '시작 전', keyword: '', keywordVolume: 20, keywordDocs: 44 },
  { id: 't-13', hospitalId: 'h-gibaek', type: 'brandBlog', deadline: '2026-08-10', status: '시작 전', keyword: '분당 공진단', keywordVolume: 80, keywordDocs: 105 },
  { id: 't-14', hospitalId: 'h-gangnam', type: 'press', deadline: '2026-08-10', status: '시작 전', keyword: '', keywordVolume: 100, keywordDocs: 240 },
  { id: 't-15', hospitalId: 'h-junghankyo', type: 'brandBlog', deadline: '2026-08-10', status: '예약 발행', keyword: '안산 기미 치료', keywordVolume: 20, keywordDocs: 440 },
  { id: 't-16', hospitalId: 'h-junghankyo', type: 'brandBlog', deadline: '2026-08-10', status: '예약 발행', keyword: '안산 피코토닝', keywordVolume: 20, keywordDocs: 90 },
  { id: 't-17', hospitalId: 'h-junghankyo', type: 'press', deadline: '2026-08-10', status: '시작 전', keyword: '안산 중앙역 색소', keywordVolume: 20, keywordDocs: 90 },
  { id: 't-18', hospitalId: 'h-junghankyo', type: 'press', deadline: '2026-08-10', status: '시작 전', keyword: '고잔동 기미', keywordVolume: 30, keywordDocs: 110 },
  { id: 't-19', hospitalId: 'h-gibaek', type: 'press', deadline: '2026-08-10', status: '시작 전', keyword: '단대오거리역 안면마비', keywordVolume: 20, keywordDocs: 5 },
  { id: 't-20', hospitalId: 'h-simpyeonhan', type: 'brandBlog', deadline: '2026-08-10', status: '원고 준비', keyword: '노인 다리 부종 원인', keywordVolume: 310, keywordDocs: 340 },
  { id: 't-21', hospitalId: 'h-simpyeonhan', type: 'press', deadline: '2026-08-10', status: '시작 전', keyword: '', keywordVolume: 20, keywordDocs: 44 },
  { id: 't-22', hospitalId: 'h-junghankyo', type: 'press', deadline: '2026-08-04', status: '보고 완료', keyword: '고잔동 기미 치료', keywordVolume: 20, keywordDocs: 28, publishedDate: '2026-08-04' },
  { id: 't-23', hospitalId: 'h-junghankyo', type: 'press', deadline: '2026-08-04', status: '보고 완료', keyword: '단원구 토닝', keywordVolume: 20, keywordDocs: 26, publishedDate: '2026-08-04' },
  { id: 't-24', hospitalId: 'h-gibaek', type: 'press', deadline: '2026-08-04', status: '보고 완료', keyword: '금광동 안면마비', keywordVolume: 20, keywordDocs: 6, publishedDate: '2026-08-04' },
  { id: 't-25', hospitalId: 'h-gangnam', type: 'brandBlog', deadline: '2026-08-03', status: '보고 완료', keyword: '다산 성장클리닉', keywordVolume: 350, keywordDocs: 160, publishedDate: '2026-08-03' },
  { id: 't-26', hospitalId: 'h-gibaek', type: 'press', deadline: '2026-08-03', status: '보고 완료', keyword: '단대오거리역 한의원', keywordVolume: 20, keywordDocs: 10, publishedDate: '2026-08-03' },
  { id: 't-27', hospitalId: 'h-gibaek', type: 'brandBlog', deadline: '2026-08-03', status: '보고 완료', keyword: '금광동 안면마비', keywordVolume: 20, keywordDocs: 6, publishedDate: '2026-08-03' },
  { id: 't-28', hospitalId: 'h-gibaek', type: 'brandBlog', deadline: '2026-08-03', status: '보고 완료', keyword: '단대오거리 안면마비', keywordVolume: 20, keywordDocs: 6, publishedDate: '2026-08-03' },
  { id: 't-29', hospitalId: 'h-simpyeonhan', type: 'press', deadline: '2026-08-03', status: '보고 완료', keyword: '목감 심장내과', keywordVolume: 20, keywordDocs: 64, publishedDate: '2026-08-03' },
  { id: 't-30', hospitalId: 'h-simpyeonhan', type: 'press', deadline: '2026-08-03', status: '보고 완료', keyword: '시흥 심장내', keywordVolume: 50, keywordDocs: 690, publishedDate: '2026-08-03' },
  { id: 't-31', hospitalId: 'h-junghankyo', type: 'brandBlog', deadline: '2026-07-28', status: '보고 완료', keyword: '안산 아그네스', keywordVolume: 40, keywordDocs: 5, publishedDate: '2026-07-28' },
  { id: 't-32', hospitalId: 'h-simpyeonhan', type: 'brandBlog', deadline: '2026-07-27', status: '보고 완료', keyword: '목감 심편한내과', keywordVolume: 260, keywordDocs: 4, publishedDate: '2026-07-27' },
  { id: 't-33', hospitalId: 'h-gibaek', type: 'brandBlog', deadline: '2026-07-27', status: '보고 완료', keyword: '분당 안면마비', keywordVolume: 30, keywordDocs: 151, publishedDate: '2026-07-27' },
  { id: 't-34', hospitalId: 'h-gibaek', type: 'press', deadline: '2026-07-27', status: '보고 완료', keyword: '성남 안면마비 한의원', keywordVolume: 20, keywordDocs: 44, publishedDate: '2026-07-27' },
  { id: 't-35', hospitalId: 'h-junghankyo', type: 'brandBlog', deadline: '2026-07-27', status: '보고 완료', keyword: '더블타이트 모공', keywordVolume: 30, keywordDocs: 110, publishedDate: '2026-07-27' },
  { id: 't-36', hospitalId: 'h-gibaek', type: 'brandBlog', deadline: '2026-07-27', status: '보고 완료', keyword: '성남 삼차신경통', keywordVolume: 20, keywordDocs: 7, publishedDate: '2026-07-27' },
  { id: 't-37', hospitalId: 'h-junghankyo', type: 'brandBlog', deadline: '2026-07-27', status: '보고 완료', keyword: '스킨젯', keywordVolume: 760, keywordDocs: 24, publishedDate: '2026-07-27' },
  { id: 't-38', hospitalId: 'h-gangnam', type: 'press', deadline: '2026-07-27', status: '보고 완료', keyword: '도농역 무릎통증', keywordVolume: 20, keywordDocs: 27, publishedDate: '2026-07-27' },
  { id: 't-39', hospitalId: 'h-gibaek', type: 'press', deadline: '2026-07-22', status: '보고 완료', keyword: '신흥역 한의원', keywordVolume: 150, keywordDocs: 182, publishedDate: '2026-07-22' },
  { id: 't-40', hospitalId: 'h-gangnam', type: 'brandBlog', deadline: '2026-07-22', status: '보고 완료', keyword: '남양주 인대강화주사', keywordVolume: 20, keywordDocs: 45, publishedDate: '2026-07-22' },
  { id: 't-41', hospitalId: 'h-junghankyo', type: 'press', deadline: '2026-07-22', status: '보고 완료', keyword: '안산 중앙역 피부과', keywordVolume: 300, keywordDocs: 160, publishedDate: '2026-07-22' },
  { id: 't-42', hospitalId: 'h-junghankyo', type: 'press', deadline: '2026-07-22', status: '보고 완료', keyword: '단원구 피부질환', keywordVolume: 20, keywordDocs: 140, publishedDate: '2026-07-22' },
  { id: 't-43', hospitalId: 'h-gibaek', type: 'brandBlog', deadline: '2026-07-22', status: '보고 완료', keyword: '구강작열감증후군 원인', keywordVolume: 40, keywordDocs: 330, publishedDate: '2026-07-22' },
  { id: 't-44', hospitalId: 'h-gibaek', type: 'brandBlog', deadline: '2026-07-22', status: '보고 완료', keyword: '분당 구강작열감', keywordVolume: 20, keywordDocs: 0, publishedDate: '2026-07-22' },
  { id: 't-45', hospitalId: 'h-gibaek', type: 'brandBlog', deadline: '2026-07-13', status: '보고 완료', keyword: '분당 심방세동', keywordVolume: 20, keywordDocs: 250, publishedDate: '2026-07-13' },
  { id: 't-46', hospitalId: 'h-junghankyo', type: 'brandBlog', deadline: '2026-07-13', status: '보고 완료', keyword: '손발톱 검은선', keywordVolume: 20, keywordDocs: 67, publishedDate: '2026-07-13' },
  { id: 't-47', hospitalId: 'h-gangnam', type: 'press', deadline: '2026-07-13', status: '보고 완료', keyword: '다산동 도수치료', keywordVolume: 30, keywordDocs: 130, publishedDate: '2026-07-13' },
  { id: 't-48', hospitalId: 'h-junghankyo', type: 'press', deadline: '2026-07-13', status: '보고 완료', keyword: '단원구 피부과', keywordVolume: 120, keywordDocs: 183, publishedDate: '2026-07-13' },
  { id: 't-49', hospitalId: 'h-gibaek', type: 'press', deadline: '2026-07-13', status: '보고 완료', keyword: '남한산성입구역 한의원', keywordVolume: 20, keywordDocs: 52, publishedDate: '2026-07-13' },
  { id: 't-50', hospitalId: 'h-gangnam', type: 'brandBlog', deadline: '2026-07-06', status: '보고 완료', keyword: '다산 비타민수액', keywordVolume: 20, keywordDocs: 11, publishedDate: '2026-07-06' },
  { id: 't-51', hospitalId: 'h-junghankyo', type: 'brandBlog', deadline: '2026-07-06', status: '보고 완료', keyword: '안산 사마귀 치료', keywordVolume: 120, keywordDocs: 198, publishedDate: '2026-07-06' },
  { id: 't-52', hospitalId: 'h-gibaek', type: 'brandBlog', deadline: '2026-07-06', status: '보고 완료', keyword: '분당 삼차신경통', keywordVolume: 20, keywordDocs: 25, publishedDate: '2026-07-06' },
  { id: 't-53', hospitalId: 'h-gangnam', type: 'brandBlog', deadline: '2026-06-29', status: '보고 완료', keyword: '다산 위고비', keywordVolume: 100, keywordDocs: 58, publishedDate: '2026-06-29' },
  { id: 't-54', hospitalId: 'h-junghankyo', type: 'brandBlog', deadline: '2026-06-29', status: '보고 완료', keyword: '안산 피부질환진료', keywordVolume: 20, keywordDocs: 1230, publishedDate: '2026-06-29' },
  { id: 't-55', hospitalId: 'h-junghankyo', type: 'brandBlog', deadline: '2026-06-29', status: '보고 완료', keyword: '안산 피부진료 잘하는', keywordVolume: 30, keywordDocs: 63, publishedDate: '2026-06-29' },
  { id: 't-56', hospitalId: 'h-gibaek', type: 'brandBlog', deadline: '2026-06-29', status: '보고 완료', keyword: '분당 이명 명의', keywordVolume: 20, keywordDocs: 0, publishedDate: '2026-06-29' },
  { id: 't-57', hospitalId: 'h-junghankyo', type: 'brandBlog', deadline: '2026-06-22', status: '보고 완료', keyword: '안산 3D 피부분석', keywordVolume: 20, keywordDocs: 70, publishedDate: '2026-06-22' },
  { id: 't-58', hospitalId: 'h-junghankyo', type: 'press', deadline: '2026-06-22', status: '보고 완료', keyword: '안산 피부과 전문의', keywordVolume: 890, keywordDocs: 370, publishedDate: '2026-06-22' },
  { id: 't-59', hospitalId: 'h-junghankyo', type: 'press', deadline: '2026-06-22', status: '보고 완료', keyword: '안산 중앙동 피부과의원', keywordVolume: 160, keywordDocs: 120, publishedDate: '2026-06-22' },
  { id: 't-60', hospitalId: 'h-junghankyo', type: 'press', deadline: '2026-06-22', status: '보고 완료', keyword: '안산 중앙동 피부과의원', keywordVolume: 160, keywordDocs: 120, publishedDate: '2026-06-22' },
  { id: 't-61', hospitalId: 'h-gibaek', type: 'brandBlog', deadline: '2026-06-22', status: '보고 완료', keyword: '금광동 이명', keywordVolume: 20, keywordDocs: 6, publishedDate: '2026-06-22' },
  { id: 't-62', hospitalId: 'h-gangnam', type: 'press', deadline: '2026-06-15', status: '보고 완료', keyword: '다산역 정형외과', keywordVolume: 660, keywordDocs: 120, publishedDate: '2026-06-15' },
  { id: 't-63', hospitalId: 'h-junghankyo', type: 'brandBlog', deadline: '2026-06-15', status: '보고 완료', keyword: '안산 정한교피부과', keywordVolume: 1700, keywordDocs: 4, publishedDate: '2026-06-15' },
  { id: 't-64', hospitalId: 'h-junghankyo', type: 'brandBlog', deadline: '2026-06-15', status: '보고 완료', keyword: '정한교피부과', keywordVolume: 3030, keywordDocs: 4, publishedDate: '2026-06-15' },
  { id: 't-65', hospitalId: 'h-gibaek', type: 'press', deadline: '2026-06-15', status: '보고 완료', keyword: '단대오거리역 한의원', keywordVolume: 30, keywordDocs: 330, publishedDate: '2026-06-15' },
  { id: 't-66', hospitalId: 'h-gibaek', type: 'press', deadline: '2026-06-15', status: '보고 완료', keyword: '서현역 한의원', keywordVolume: 1120, keywordDocs: 540, publishedDate: '2026-06-15' },
  { id: 't-67', hospitalId: 'h-gibaek', type: 'brandBlog', deadline: '2026-06-15', status: '보고 완료', keyword: '설통 치료법', keywordVolume: 20, keywordDocs: 83, publishedDate: '2026-06-15' },
  { id: 't-68', hospitalId: 'h-gibaek', type: 'brandBlog', deadline: '2026-06-14', status: '보고 완료', keyword: '비정형 안면통', keywordVolume: 250, keywordDocs: 32, publishedDate: '2026-06-14' },
  { id: 't-69', hospitalId: 'h-gangnam', type: 'press', deadline: '2026-06-08', status: '보고 완료', keyword: '다산 도수치료', keywordVolume: 200, keywordDocs: 310, publishedDate: '2026-06-08' },
  { id: 't-70', hospitalId: 'h-gangnam', type: 'brandBlog', deadline: '2026-06-01', status: '보고 완료', keyword: '도농역 어깨통증', keywordVolume: 20, keywordDocs: 90, publishedDate: '2026-06-01' }
];

function normalizeDateStr(val) {
  if (!val) return '';
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val.trim())) {
    return val.trim().substring(0, 10);
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return String(val || '');
}

function migrateTask(t) {
  if (t.status === '작성 전') t.status = '시작 전';
  if (t.status === '작성완료') t.status = '원고 준비';
  if (t.status === '발행완료') t.status = '발행';
  if (t.deadline) t.deadline = normalizeDateStr(t.deadline);
  if (t.publishedDate) t.publishedDate = normalizeDateStr(t.publishedDate);
  return t;
}

// parsed(로컬 or 원격에서 막 읽어온 원시 데이터)를 안전한 db 형태로 만든다.
// 예전에는 여기서 "병원 4곳 미만이면 데모로 대체", "작업 0건이면 데모로 대체",
// "빈 키워드/시작전 상태의 새 작업은 쓰레기로 간주해 삭제" 하는 1회성 마이그레이션
// 로직이 있었는데, 이게 실시간 동기화 경로(다른 기기 반영, echo 처리)에서도 매번
// 실행되면서 방금 자동배정으로 막 만든 정상 작업(키워드 없음+시작 전 상태라 조건이
// 똑같음)까지 계속 지워버리는 사고를 냈다. 이제는 타입만 검증하고 내용은 손대지 않는다.
function normalizeLoadedData(parsed) {
  const hospitals = Array.isArray(parsed.hospitals) ? parsed.hospitals : [];
  const tasks = Array.isArray(parsed.tasks) ? parsed.tasks.map(migrateTask) : [];

  return {
    hospitals,
    quotaOverrides: parsed.quotaOverrides && typeof parsed.quotaOverrides === 'object' ? parsed.quotaOverrides : {},
    tasks,
    tagPool: Array.isArray(parsed.tagPool) ? parsed.tagPool : [],
  };
}

// 로컬(localStorage)에 캐시된 데이터 - 오프라인이거나 Supabase 연결 실패 시 대비용.
function loadLocalData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeLoadedData(JSON.parse(raw));
  } catch (e) {
    console.error('로컬 데이터 로드 실패:', e);
    return null;
  }
}

// Google Apps Script Web App (Spreadsheet) API 호출
async function fetchRemoteData() {
  if (!googleScriptUrl) return null;
  try {
    const res = await fetch(googleScriptUrl, { method: 'GET' });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status === 'ok' && json.data && typeof json.data === 'object' && Array.isArray(json.data.hospitals)) {
      lastSyncedUpdatedAt = json.updated_at || null;
      return normalizeLoadedData(json.data);
    }
    return null;
  } catch (e) {
    console.error('구글 시트 로드 실패:', e);
    return null;
  }
}

let isPushingRemote = false;
let lastPushTimestamp = 0;

async function pushRemoteState(data) {
  if (!googleScriptUrl) return;
  isPushingRemote = true;
  lastPushTimestamp = Date.now();
  try {
    const nowIso = new Date().toISOString();
    const res = await fetch(googleScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      lastSyncedUpdatedAt = nowIso;
      lastPushTimestamp = Date.now();
    }
  } catch (e) {
    console.error('구글 시트 저장 실패:', e);
  } finally {
    isPushingRemote = false;
  }
}

/* ==================== Supabase 실시간 DB 엔진 ==================== */

async function fetchSupabaseData() {
  if (!supabaseClient) return null;
  try {
    const [hRes, tRes, qRes, pRes] = await Promise.all([
      supabaseClient.from('hospitals').select('*'),
      supabaseClient.from('tasks').select('*'),
      supabaseClient.from('quota_overrides').select('*'),
      supabaseClient.from('tag_pool').select('*')
    ]);

    if (hRes.error || tRes.error) {
      console.warn('Supabase 데이터 조회 오류 (초기 연결 대기):', hRes.error || tRes.error);
      return null;
    }

    const hospitals = (hRes.data || []).map(h => ({
      id: h.id,
      name: h.name,
      defaultQuota: h.default_quota || { brandBlog: 0, press: 0, receipt: 0 },
      naverId: h.naver_id || '',
      naverPassword: h.naver_password || '',
      naverBlogUrl: h.naver_blog_url || '',
      naverMapUrl: h.naver_map_url || '',
      cycleStartDay: Number(h.cycle_start_day) || 1,
      autoAssignPaused: !!h.auto_assign_paused,
      interleaveTypes: !!h.interleave_types,
      createdAt: h.created_at
    }));

    const tasks = (tRes.data || []).map(t => ({
      id: t.id,
      hospitalId: t.hospital_id,
      type: t.type || 'brandBlog',
      keyword: t.keyword || '',
      topicText: t.topic_text || '',
      deadline: t.deadline || '',
      status: t.status || '시작 전',
      publishedDate: t.published_date || null,
      publishedUrl: t.published_url || '',
      keywordVolume: t.keyword_volume !== null && t.keyword_volume !== undefined ? Number(t.keyword_volume) : null,
      keywordDocs: t.keyword_docs !== null && t.keyword_docs !== undefined ? Number(t.keyword_docs) : null,
      keywordGap: t.keyword_gap !== null && t.keyword_gap !== undefined ? Number(t.keyword_gap) : null,
      performance: t.performance || '',
      createdAt: Number(t.created_at) || Date.now()
    }));

    const quotaOverrides = {};
    (qRes.data || []).forEach(q => {
      quotaOverrides[q.key] = {
        brandBlog: Number(q.brand_blog) || 0,
        press: Number(q.press) || 0,
        receipt: Number(q.receipt) || 0
      };
    });

    const tagPool = (pRes.data || []).map(p => ({
      id: p.id,
      hospitalId: p.hospital_id,
      kind: p.kind,
      text: p.text
    }));

    return { hospitals, tasks, quotaOverrides, tagPool };
  } catch (err) {
    console.error('Supabase 데이터 로드 실패:', err);
    return null;
  }
}

let realtimeChannel = null;

// ─── 자기 쓰기 에코 억제 ───────────────────────────────────────────────────
// 내가 직접 Supabase에 쓴 행은 Realtime 이벤트로 되돌아와도 무시한다.
// syncSupabase* 함수에서 markOwnWrite(id) 호출 → handleRealtime* 함수에서 isOwnWrite(id) 체크.
const _ownWrites = new Map(); // id -> timestamp
const OWN_WRITE_SUPPRESS_MS = 6000; // 6초 이내 되돌아온 이벤트는 내 쓰기로 간주하고 무시

function markOwnWrite(id) {
  if (id == null) return;
  _ownWrites.set(String(id), Date.now());
  setTimeout(() => _ownWrites.delete(String(id)), OWN_WRITE_SUPPRESS_MS);
}

function isOwnWrite(id) {
  if (id == null) return false;
  const ts = _ownWrites.get(String(id));
  return ts !== undefined && (Date.now() - ts) < OWN_WRITE_SUPPRESS_MS;
}
// ─────────────────────────────────────────────────────────────────────────────

function setupSupabaseRealtime() {
  if (!supabaseClient) return;
  if (realtimeChannel) {
    try { supabaseClient.removeChannel(realtimeChannel); } catch (e) { /* ignore */ }
  }

  realtimeChannel = supabaseClient.channel('tracker_realtime_stream')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
      handleRealtimeTaskChange(payload);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitals' }, (payload) => {
      handleRealtimeHospitalChange(payload);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'quota_overrides' }, (payload) => {
      handleRealtimeQuotaChange(payload);
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('⚡ Supabase 실시간 웹소켓 연결 성공! 0.1초 동기화 가동 중');
      }
    });
}

function handleRealtimeTaskChange(payload) {
  if (!payload || !db || !Array.isArray(db.tasks)) return;
  const { eventType, new: newRow, old: oldRow } = payload;

  // ── 자기 에코 억제: 내가 방금 쓴 행이 되돌아온 경우 무시 ──
  const echoId = newRow?.id ?? oldRow?.id;
  if (isOwnWrite(echoId)) return;

  if (eventType === 'INSERT') {
    if (!db.tasks.some(t => t.id === newRow.id)) {
      db.tasks.push({
        id: newRow.id,
        hospitalId: newRow.hospital_id,
        type: newRow.type,
        keyword: newRow.keyword || '',
        topicText: newRow.topic_text || '',
        deadline: newRow.deadline || '',
        status: newRow.status || '시작 전',
        publishedDate: newRow.published_date || null,
        publishedUrl: newRow.published_url || '',
        keywordVolume: newRow.keyword_volume !== null ? Number(newRow.keyword_volume) : null,
        keywordDocs: newRow.keyword_docs !== null ? Number(newRow.keyword_docs) : null,
        keywordGap: newRow.keyword_gap !== null ? Number(newRow.keyword_gap) : null,
        performance: newRow.performance || '',
        createdAt: Number(newRow.created_at) || Date.now()
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      render();
    }
  } else if (eventType === 'UPDATE') {
    const idx = db.tasks.findIndex(t => t.id === newRow.id);
    if (idx >= 0) {
      const activeEl = document.activeElement;
      const isFocusedOnThisTask = activeEl && activeEl.closest(`tr[data-task-id="${newRow.id}"]`);
      if (isFocusedOnThisTask) return; // 편집 중인 행은 건드리지 않음
      db.tasks[idx] = {
        id: newRow.id,
        hospitalId: newRow.hospital_id,
        type: newRow.type,
        keyword: newRow.keyword || '',
        topicText: newRow.topic_text || '',
        deadline: newRow.deadline || '',
        status: newRow.status || '시작 전',
        publishedDate: newRow.published_date || null,
        publishedUrl: newRow.published_url || '',
        keywordVolume: newRow.keyword_volume !== null ? Number(newRow.keyword_volume) : null,
        keywordDocs: newRow.keyword_docs !== null ? Number(newRow.keyword_docs) : null,
        keywordGap: newRow.keyword_gap !== null ? Number(newRow.keyword_gap) : null,
        performance: newRow.performance || '',
        createdAt: Number(newRow.created_at) || db.tasks[idx].createdAt
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      render();
    }
  } else if (eventType === 'DELETE') {
    if (oldRow && oldRow.id) {
      db.tasks = db.tasks.filter(t => t.id !== oldRow.id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      render();
    }
  }
}

function handleRealtimeHospitalChange(payload) {
  if (!payload || !db || !Array.isArray(db.hospitals)) return;
  const { eventType, new: newRow, old: oldRow } = payload;

  // ── 자기 에코 억제 ──
  const echoId = newRow?.id ?? oldRow?.id;
  if (isOwnWrite(echoId)) return;

  if (eventType === 'INSERT' || eventType === 'UPDATE') {
    const mapped = {
      id: newRow.id,
      name: newRow.name,
      defaultQuota: newRow.default_quota || { brandBlog: 0, press: 0, receipt: 0 },
      naverId: newRow.naver_id || '',
      naverPassword: newRow.naver_password || '',
      naverBlogUrl: newRow.naver_blog_url || '',
      naverMapUrl: newRow.naver_map_url || '',
      cycleStartDay: Number(newRow.cycle_start_day) || 1,
      autoAssignPaused: !!newRow.auto_assign_paused,
      interleaveTypes: !!newRow.interleave_types,
      createdAt: newRow.created_at
    };
    const idx = db.hospitals.findIndex(h => h.id === newRow.id);
    if (idx >= 0) db.hospitals[idx] = mapped;
    else db.hospitals.push(mapped);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    render();
  } else if (eventType === 'DELETE' && oldRow && oldRow.id) {
    db.hospitals = db.hospitals.filter(h => h.id !== oldRow.id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    render();
  }
}

function handleRealtimeQuotaChange(payload) {
  if (!payload || !db || !db.quotaOverrides) return;
  const { eventType, new: newRow, old: oldRow } = payload;

  // ── 자기 에코 억제 ──
  const echoKey = newRow?.key ?? oldRow?.key;
  if (isOwnWrite(echoKey)) return;

  if (eventType === 'INSERT' || eventType === 'UPDATE') {
    db.quotaOverrides[newRow.key] = {
      brandBlog: Number(newRow.brand_blog) || 0,
      press: Number(newRow.press) || 0,
      receipt: Number(newRow.receipt) || 0
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    render();
  } else if (eventType === 'DELETE' && oldRow && oldRow.key) {
    delete db.quotaOverrides[oldRow.key];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    render();
  }
}

async function syncSupabaseTask(task) {
  if (!supabaseClient) return;
  try {
    markOwnWrite(task.id); // 자기 에코 억제
    await supabaseClient.from('tasks').upsert({
      id: task.id,
      hospital_id: task.hospitalId,
      type: task.type || 'brandBlog',
      keyword: task.keyword || '',
      topic_text: task.topicText || '',
      deadline: task.deadline || '',
      status: task.status || '시작 전',
      published_date: task.publishedDate || null,
      published_url: task.publishedUrl || '',
      keyword_volume: task.keywordVolume !== null && task.keywordVolume !== undefined ? Number(task.keywordVolume) : null,
      keyword_docs: task.keywordDocs !== null && task.keywordDocs !== undefined ? Number(task.keywordDocs) : null,
      keyword_gap: task.keywordGap !== null && task.keywordGap !== undefined ? Number(task.keywordGap) : null,
      performance: task.performance || '',
      created_at: task.createdAt ? Number(task.createdAt) : Date.now()
    });
  } catch (e) {
    console.error('Supabase 작업 단건 저장 오류:', e);
  }
}

async function syncSupabaseTaskDelete(taskId) {
  if (!supabaseClient) return;
  try {
    markOwnWrite(taskId); // 자기 에코 억제
    await supabaseClient.from('tasks').delete().eq('id', taskId);
  } catch (e) {
    console.error('Supabase 작업 삭제 오류:', e);
  }
}

async function syncSupabaseHospital(hospital) {
  if (!supabaseClient) return;
  try {
    markOwnWrite(hospital.id); // 자기 에코 억제
    await supabaseClient.from('hospitals').upsert({
      id: hospital.id,
      name: hospital.name,
      default_quota: hospital.defaultQuota || { brandBlog: 0, press: 0, receipt: 0 },
      naver_id: hospital.naverId || '',
      naver_password: hospital.naverPassword || '',
      naver_blog_url: hospital.naverBlogUrl || '',
      naver_map_url: hospital.naverMapUrl || '',
      cycle_start_day: Number(hospital.cycleStartDay) || 1,
      auto_assign_paused: !!hospital.autoAssignPaused,
      interleave_types: !!hospital.interleaveTypes
    });
  } catch (e) {
    console.error('Supabase 병원 저장 오류:', e);
  }
}

async function syncSupabaseHospitalDelete(hospitalId) {
  if (!supabaseClient) return;
  try {
    markOwnWrite(hospitalId); // 자기 에코 억제
    await supabaseClient.from('hospitals').delete().eq('id', hospitalId);
  } catch (e) {
    console.error('Supabase 병원 삭제 오류:', e);
  }
}

async function syncSupabaseQuota(key, override) {
  if (!supabaseClient) return;
  try {
    markOwnWrite(key); // 자기 에코 억제
    const parts = key.split('::');
    await supabaseClient.from('quota_overrides').upsert({
      key,
      hospital_id: parts[0] || '',
      year_month: parts[1] || '',
      brand_blog: Number(override.brandBlog) || 0,
      press: Number(override.press) || 0,
      receipt: Number(override.receipt) || 0
    });
  } catch (e) {
    console.error('Supabase 할당량 저장 오류:', e);
  }
}

async function syncSupabaseTasksBatch(taskList) {
  if (!supabaseClient || !taskList || taskList.length === 0) return;
  try {
    taskList.forEach(task => markOwnWrite(task.id)); // 자기 에코 억제
    const rows = taskList.map(task => ({
      id: task.id,
      hospital_id: task.hospitalId,
      type: task.type || 'brandBlog',
      keyword: task.keyword || '',
      topic_text: task.topicText || '',
      deadline: task.deadline || '',
      status: task.status || '시작 전',
      published_date: task.publishedDate || null,
      published_url: task.publishedUrl || '',
      keyword_volume: task.keywordVolume !== null && task.keywordVolume !== undefined ? Number(task.keywordVolume) : null,
      keyword_docs: task.keywordDocs !== null && task.keywordDocs !== undefined ? Number(task.keywordDocs) : null,
      keyword_gap: task.keywordGap !== null && task.keywordGap !== undefined ? Number(task.keywordGap) : null,
      performance: task.performance || '',
      created_at: task.createdAt ? Number(task.createdAt) : Date.now()
    }));
    await supabaseClient.from('tasks').upsert(rows);
  } catch (e) {
    console.error('Supabase 작업 배치 저장 오류:', e);
  }
}

async function loadInitialData() {
  initSupabaseClient();
  if (supabaseClient) {
    const supaData = await fetchSupabaseData();
    if (supaData && Array.isArray(supaData.hospitals) && supaData.hospitals.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(supaData));
      setupSupabaseRealtime();
      return supaData;
    }
  }

  const remote = await fetchRemoteData();
  const local = loadLocalData();

  const isRemoteValid = remote && Array.isArray(remote.hospitals) && remote.hospitals.length >= 7;
  const isLocalValid = local && Array.isArray(local.hospitals) && local.hospitals.length >= 7;

  if (!isRemoteValid && !isLocalValid) {
    let backupData = null;
    try {
      let resp = await fetch('live_backup_latest.json');
      if (!resp.ok) resp = await fetch('merged_backup.json');
      if (!resp.ok) resp = await fetch('supabase_backup.json');
      if (resp.ok) {
        const rawBackup = await resp.json();
        const firstRow = Array.isArray(rawBackup) ? rawBackup[0] : rawBackup;
        const targetData = (firstRow && firstRow.data) ? firstRow.data : firstRow;
        if (targetData && Array.isArray(targetData.hospitals)) backupData = normalizeLoadedData(targetData);
      }
    } catch (err) { /* ignore */ }

    const base = backupData || { hospitals: INITIAL_HOSPITALS, quotaOverrides: {}, tasks: INITIAL_TASKS, tagPool: [] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(base));
    return base;
  }

  if (isRemoteValid) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
    return remote;
  }

  if (isLocalValid) {
    return local;
  }

  return remote || local;
}

let lastSyncedUpdatedAt = null;
let saveDebounceTimer = null;

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  if (supabaseClient) {
    // Supabase 환경에서는 각 액션에서 원자적 행 단위 동기화가 이뤄지므로 전체 시트 덮어쓰기를 하지 않습니다.
    return;
  }
  clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => pushRemoteState(db), 600);
}

async function syncRemoteDataIfIdle() {
  if (!googleScriptUrl) return;

  // 로컬 수정 내용이 전송 중이거나, 저장이 대기 중이거나, 구글 시트에 막 동기화된 지 8초 이내인 경우 덮어쓰기 방지
  if (isPushingRemote || saveDebounceTimer || (Date.now() - lastPushTimestamp < 8000)) {
    return;
  }

  // 사용자가 입력 필드(input, textarea)에 포커스하고 타이핑 중인 경우 방해하지 않음
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
    return;
  }

  const remote = await fetchRemoteData();
  if (!remote) return;

  if (isPushingRemote || saveDebounceTimer || (Date.now() - lastPushTimestamp < 8000)) {
    return;
  }

  const localStr = JSON.stringify(db);
  const remoteStr = JSON.stringify(remote);
  if (localStr !== remoteStr) {
    db = remote;
    localStorage.setItem(STORAGE_KEY, remoteStr);
    render();
  }
}

function startRemoteSyncPolling() {
  setInterval(syncRemoteDataIfIdle, 10000);

  // 모바일 기기 화면 켜짐 / 백그라운드 복귀 / 탭 전환 시 즉시 서버 최신 데이터 동기화
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncRemoteDataIfIdle();
    }
  });
  window.addEventListener('pageshow', () => {
    syncRemoteDataIfIdle();
  });
  window.addEventListener('focus', () => {
    syncRemoteDataIfIdle();
  });
}

let db = null;

let state = {
  view: 'list',        // 'list' | 'detail'
  hospitalId: null,
  year: today.getFullYear(),
  month: today.getMonth() + 1,
  weeklyOffset: 0,     // 0 = 이번주, -1 = 지난주, 1 = 다음주
  pwVisible: false,
  trackerExpanded: false,
  trackerSortMode: 'deadline', // 'deadline' | 'type'
  homeHospitalFilter: 'all',  // 'all' | hospitalId
};

function getMondaysInMonth(year, month) {
  const mondays = [];
  const totalDays = daysInMonth(year, month);
  for (let day = 1; day <= totalDays; day++) {
    const cur = new Date(year, month - 1, day);
    if (cur.getDay() === 1) { // 1 = 월요일
      mondays.push(cur);
    }
  }
  return mondays;
}

// 이미 발행 완료된 작업은 지나간 기록이므로 마감일을 건드리지 않는다.
// 목표 수량에서 부족한 만큼 새 작업(대기중)을 만든 뒤, 아직 발행 전인 작업들을
// "현재 배정 건수가 가장 적은 주"부터 순서대로 채워 넣어 총량이 이번 달(달력 월)
// 월요일들에 최대한 고르게(최대-최소 차이 1건 이하) 맞춰지도록 한다.
// 정산 주기(cycleStartDay)는 무시하고 항상 달력 월(1일~말일) 기준으로 채운다.
function assignQuotaEvenlyForMonth(hospital, year, month) {
  if (hospital.autoAssignPaused) return { added: 0, moved: 0, paused: true };

  const ymKey = monthKey(year, month);
  const quota = getEffectiveQuota(hospital, ymKey);
  const mondays = getMondaysInMonth(year, month).map(fmtDateStr);
  if (mondays.length === 0) return { added: 0, moved: 0, paused: false };

  const currentTasks = db.tasks.filter((t) => t.hospitalId === hospital.id && t.deadline && t.deadline.startsWith(ymKey));
  let added = 0;
  let moved = 0;

  // 목표 수량만큼 부족한 대기중 작업을 새로 만들고, 완료/대기 목록을 반환한다.
  function ensurePendingList(type) {
    // 목표 수량 입력 실수(예: 자릿수 오타)로 수만~수백만 건이 생성되며 브라우저가
    // 멈추는 사고를 막기 위해 한 달에 타입당 생성 가능한 상한을 둔다.
    const target = Math.min(MAX_QUOTA_PER_TYPE, Number(quota[type]) || 0);
    const typeTasks = currentTasks.filter((t) => t.type === type);
    const completed = typeTasks.filter((t) => isPublishedStatus(t.status));
    const pending = typeTasks.filter((t) => !isPublishedStatus(t.status));

    while (completed.length + pending.length < target) {
      const newTask = {
        id: uuid(),
        hospitalId: hospital.id,
        type,
        keyword: '',
        keywordVolume: null,
        keywordDocs: null,
        keywordGap: null,
        deadline: '',
        status: '시작 전',
        publishedDate: null,
        publishedUrl: '',
        performance: '',
        createdAt: Date.now() + added,
      };
      db.tasks.push(newTask);
      pending.push(newTask);
      added++;
    }
    return { completed, pending };
  }

  // groups(여러 타입의 {completed, pending} 묶음)를 "주차별 배정 건수"를 공유해가며 채운다.
  // group이 1개면 기존과 동일한 단일 타입 균등 배정이고, 2개 이상이면 각 그룹에서
  // 한 건씩 번갈아 꺼내 배치하므로(교차 배정) 같은 주에 여러 타입이 몰리지 않고
  // 타입별로 주차가 번갈아가며 채워진다.
  function placeEvenly(groups) {
    const countPerWeek = mondays.map(() => 0);
    groups.forEach(({ completed }) => {
      completed.forEach((t) => {
        const idx = mondays.indexOf(toMondayStr(t.deadline));
        if (idx >= 0) countPerWeek[idx] += 1;
      });
    });

    const queues = groups.map((g) => g.pending.slice());
    let hasMore = true;
    while (hasMore) {
      hasMore = false;
      queues.forEach((queue) => {
        const task = queue.shift();
        if (!task) return;
        hasMore = true;
        let minIdx = 0;
        for (let i = 1; i < countPerWeek.length; i++) {
          if (countPerWeek[i] < countPerWeek[minIdx]) minIdx = i;
        }
        const newDeadline = mondays[minIdx];
        if (task.deadline !== newDeadline) moved++;
        task.deadline = newDeadline;
        countPerWeek[minIdx] += 1;
      });
    }
  }

  if (hospital.interleaveTypes) {
    // 브랜드 블로그 / 기자단은 같은 주에 몰리지 않도록 교차 배정, 영수증은 독립적으로 배정
    placeEvenly([ensurePendingList('brandBlog'), ensurePendingList('press')]);
    placeEvenly([ensurePendingList('receipt')]);
  } else {
    TYPE_KEYS.forEach((type) => {
      placeEvenly([ensurePendingList(type)]);
    });
  }

  return { added, moved, paused: false };
}

async function autoAssignMondays(hospital, year, month) {
  if (supabaseClient) {
    try {
      const latest = await fetchSupabaseData();
      if (latest && Array.isArray(latest.hospitals) && latest.hospitals.length > 0) {
        db = latest;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      }
    } catch (e) { /* ignore */ }
  } else if (googleScriptUrl) {
    try {
      const latest = await fetchRemoteData();
      if (latest && Array.isArray(latest.hospitals) && latest.hospitals.length > 0) {
        db = latest;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      }
    } catch (e) { /* ignore */ }
  }
  const currentHospital = getHospital(hospital.id) || hospital;
  const { added, moved, paused } = assignQuotaEvenlyForMonth(currentHospital, year, month);
  if (paused) {
    alert(`"${currentHospital.name}" 병원은 자동 배정이 일시중지된 상태입니다. "병원 정보 수정"에서 재개할 수 있어요.`);
    return;
  }
  saveData();
  if (supabaseClient) {
    const ymPrefix = monthKey(year, month);
    const affectedTasks = db.tasks.filter(t => t.hospitalId === currentHospital.id && t.deadline && t.deadline.startsWith(ymPrefix));
    syncSupabaseTasksBatch(affectedTasks);
  }
  render();
  if (added > 0 || moved > 0) {
    alert(`"${currentHospital.name}" 병원의 ${month}월 목표 수량에 맞춰 신규 ${added}건 생성, ${moved}건 재배치하여 월요일 마감일에 고르게 배정했습니다!`);
  } else {
    alert(`"${currentHospital.name}" 병원의 ${month}월은 이미 고르게 배정되어 있습니다.`);
  }
}

async function autoAssignAllHospitalsMondays(year, month) {
  if (supabaseClient) {
    try {
      const latest = await fetchSupabaseData();
      if (latest && Array.isArray(latest.hospitals) && latest.hospitals.length > 0) {
        db = latest;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      }
    } catch (e) { /* ignore */ }
  } else if (googleScriptUrl) {
    try {
      const latest = await fetchRemoteData();
      if (latest && Array.isArray(latest.hospitals) && latest.hospitals.length > 0) {
        db = latest;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      }
    } catch (e) { /* ignore */ }
  }
  let totalAdded = 0;
  let totalMoved = 0;
  let pausedCount = 0;

  db.hospitals.forEach((hospital) => {
    const { added, moved, paused } = assignQuotaEvenlyForMonth(hospital, year, month);
    if (paused) { pausedCount += 1; return; }
    totalAdded += added;
    totalMoved += moved;
  });

  saveData();
  if (supabaseClient) {
    const ymPrefix = monthKey(year, month);
    const affectedTasks = db.tasks.filter(t => t.deadline && t.deadline.startsWith(ymPrefix));
    syncSupabaseTasksBatch(affectedTasks);
  }
  render();

  const pausedNote = pausedCount > 0 ? ` (자동 배정 일시중지된 병원 ${pausedCount}곳은 제외)` : '';
  if (totalAdded > 0 || totalMoved > 0) {
    alert(`${year}년 ${month}월 목표 수량에 맞춰 총 ${totalAdded}건 생성, ${totalMoved}건 재배치하여 월요일 마감일에 고르게 배정했습니다!${pausedNote}`);
  } else {
    alert(`${year}년 ${month}월은 이미 모든 병원이 고르게 배정되어 있습니다.${pausedNote}`);
  }
}

function toMondayStr(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return fmtDateStr(monday);
}

function renderHomeHospitalFilter() {
  const options = db.hospitals.map((h) => `
    <button class="filter-pill ${state.homeHospitalFilter === h.id ? 'active' : ''}" data-action="filter-home-hospital" data-id="${h.id}">${esc(h.name)}</button>
  `).join('');

  return `
  <div class="home-filter-bar">
    <div class="home-filter-head">
      <div class="home-filter-title">🏥 표시 병원 필터링</div>
      <div class="home-filter-sub">필터를 선택하면 달력과 마감 보드에 선택한 병원만 표시되어 모바일 화면이 훨씬 깔끔해집니다.</div>
    </div>
    <div class="home-filter-pills">
      <button class="filter-pill ${state.homeHospitalFilter === 'all' ? 'active' : ''}" data-action="filter-home-hospital" data-id="all">전체 병원 보기 (${db.hospitals.length})</button>
      ${options}
    </div>
  </div>`;
}

function getActiveHomeHospitals() {
  if (state.homeHospitalFilter && state.homeHospitalFilter !== 'all') {
    const filtered = db.hospitals.filter((h) => h.id === state.homeHospitalFilter);
    if (filtered.length > 0) return filtered;
  }
  return db.hospitals;
}

function renderMondayBoard() {
  const year = state.year;
  const month = state.month;

  const mondays = getMondaysInMonth(year, month);
  const ymPrefix = monthKey(year, month);
  const activeHospitals = getActiveHomeHospitals();

  const monthMondayTasks = db.tasks.filter((task) => {
    const targetDate = task.deadline || task.publishedDate;
    return targetDate && targetDate.startsWith(ymPrefix);
  });

  const totalTasks = monthMondayTasks.length;
  const completedTasks = monthMondayTasks.filter((t) => isBoardActiveStatus(t.status)).length;
  const pendingTasks = totalTasks - completedTasks;

  const isCurrentMonth = year === today.getFullYear() && month === (today.getMonth() + 1);

  // 월요일별로 그 주(화~다음주 일)에 걸린 작업들을 묶는다
  const weeks = mondays.map((date) => {
    const dateStr = fmtDateStr(date);
    const weekTasks = monthMondayTasks.filter((t) => {
      if (t.deadline === dateStr) return true;
      const mDay = toMondayStr(t.deadline || t.publishedDate);
      return mDay === dateStr;
    });
    return { date, dateStr, isToday: dateStr === TODAY_STR, weekTasks };
  });

  // 병원 × 주차 매트릭스 헤더 (요일 대신 병원 행을 기준으로 한눈에 비교)
  const headerCellsHtml = weeks.map(({ date, dateStr, isToday, weekTasks }) => `
    <div class="week-head-cell ${isToday ? 'is-today' : ''}">
      <span class="week-head-date">${date.getMonth() + 1}/${date.getDate()}</span>
      <span class="week-head-count">${weekTasks.length}건</span>
    </div>`).join('');

  const rowsHtml = db.hospitals.map((hospital) => {
    const cellsHtml = weeks.map(({ dateStr, isToday, weekTasks }) => {
      const hospitalTasks = weekTasks.filter((t) => t.hospitalId === hospital.id);
      if (hospitalTasks.length === 0) {
        return `<div class="week-cell is-empty ${isToday ? 'is-today-col' : ''}">–</div>`;
      }
      const doneCount = hospitalTasks.filter((t) => isBoardActiveStatus(t.status)).length;
      const allDone = doneCount === hospitalTasks.length;
      const groupsHtml = TYPE_KEYS.map((type) => {
        const typeTasks = hospitalTasks.filter((t) => t.type === type);
        if (typeTasks.length === 0) return '';
        const meta = TYPE_META[type];
        const dotsHtml = typeTasks.map((t) => {
          const done = isBoardActiveStatus(t.status);
          return `<span class="week-item-dot ${done ? 'is-done' : ''}" style="--dot-color:${meta.color}" title="${esc(meta.label)} · ${esc(t.status)}"></span>`;
        }).join('');
        return `<span class="week-item-group">${dotsHtml}</span>`;
      }).join('');
      return `
      <div class="week-cell ${allDone ? 'is-complete' : ''} ${isToday ? 'is-today-col' : ''}" data-action="open-hospital" data-id="${hospital.id}" data-date="${dateStr}" title="${esc(hospital.name)} 상세보기 · ${doneCount}/${hospitalTasks.length}건 진행/완료">
        ${groupsHtml}
      </div>`;
    }).join('');
    return `
    <div class="week-row-head" data-action="open-hospital" data-id="${hospital.id}" title="${esc(hospital.name)} 상세보기">${esc(hospital.name)}</div>
    ${cellsHtml}`;
  }).join('');

  return `
  <section class="monday-board-section">
    <div class="monday-board-head">
      <div class="monday-board-title">
        📅 마감 보드
        <div class="monday-board-nav">
          <button class="icon-btn" data-action="main-prev-month" title="이전달 보기">◀</button>
          <span class="monday-nav-label">${year}년 ${month}월</span>
          <button class="icon-btn" data-action="main-next-month" title="다음달 보기">▶</button>
          ${!isCurrentMonth ? `<button class="ghost-btn" data-action="main-today-month">이번달</button>` : ''}
        </div>
      </div>
      <div class="monday-board-stats">
        <span class="monday-stat-badge">마감 <strong>${totalTasks}건</strong></span>
        <span class="monday-stat-badge">· 진행 <strong>${pendingTasks}건</strong></span>
        <span class="monday-stat-badge">· 완료 <strong>${completedTasks}건</strong></span>
        <button type="button" class="primary-btn auto-assign-all-btn" data-action="auto-assign-all-mondays" title="이번달(달력 월) 목표 수량에 맞춰 마감 수량을 월요일 마감일로 자동 배정합니다">
          🎯 이번달 마감 자동 배정
        </button>
      </div>
    </div>
    <div class="monday-board-scroll">
      <div class="week-matrix" style="grid-template-columns: var(--week-corner-w, 132px) repeat(${mondays.length}, minmax(var(--week-col-min, 78px), 1fr));">
        <div class="week-corner">병원 \\ 주차</div>
        ${headerCellsHtml}
        ${rowsHtml}
      </div>
    </div>
  </section>`;
}

/* ==================== 데이터 헬퍼 ==================== */

function getHospital(id) { return db.hospitals.find((h) => h.id === id) || null; }

function getEffectiveQuota(hospital, ymKey) {
  const override = db.quotaOverrides[`${hospital.id}::${ymKey}`];
  return override || hospital.defaultQuota;
}

function getTasksForCycle(hospital, year, month) {
  const { start, end } = getCycleRange(hospital, year, month);
  const startStr = fmtDateStr(start);
  const endStr = fmtDateStr(end);
  return db.tasks.filter((t) => t.hospitalId === hospital.id && t.deadline && t.deadline >= startStr && t.deadline <= endStr);
}

function getCompletedCount(hospital, year, month, type) {
  return getTasksForCycle(hospital, year, month).filter((t) => t.type === type && isPublishedStatus(t.status)).length;
}

function deleteHospitalCascade(hospitalId) {
  db.hospitals = db.hospitals.filter((h) => h.id !== hospitalId);
  db.tasks = db.tasks.filter((t) => t.hospitalId !== hospitalId);
  db.tagPool = db.tagPool.filter((t) => t.hospitalId !== hospitalId);
  Object.keys(db.quotaOverrides).forEach((k) => {
    if (k.startsWith(`${hospitalId}::`)) delete db.quotaOverrides[k];
  });
}

function getHospitalTags(hospitalId, kind) {
  return db.tagPool.filter((t) => t.hospitalId === hospitalId && t.kind === kind);
}

/* ==================== 렌더링 : 헤더 ==================== */

function renderHeader() {
  const nextThemeLabel = currentTheme === 'dark' ? '라이트모드' : '다크모드';
  const themeIcon = currentTheme === 'dark' ? '☀' : '☾';
  const isDetail = state.view === 'detail';
  return `
  <div class="app-header">
    <div class="app-title-group">
      <div class="app-title" data-action="go-list">네이버 마케팅 작업 트래커</div>
    </div>
    <div class="header-actions">
      ${isDetail ? `<button class="primary-btn home-nav-btn" data-action="go-list" title="홈(목록)으로 돌아가기">🏠 홈으로</button>` : ''}
      ${isDetail ? `<button class="ghost-btn report-export-header-btn" data-action="export-pdf-report" title="Dr.NAEO 성과 보고서 PDF 출력/다운로드">📄 PDF 보고서</button>` : ''}
      <button class="ghost-btn db-sync-btn ${supabaseClient ? 'is-connected' : ''}" data-action="open-cloud-db-config" title="클라우드 DB (Supabase / 구글 시트) 연동 설정">
        ${supabaseClient ? '⚡ DB 연결됨' : '☁️ 클라우드 DB'}
      </button>
      <button class="ghost-btn" data-action="export-data" title="현재 데이터를 JSON 백업 파일로 저장">내보내기</button>
      <button class="ghost-btn" data-action="import-data" title="백업 파일에서 데이터 복원">가져오기</button>
      <button class="ghost-btn theme-toggle" data-action="toggle-theme" title="${nextThemeLabel}로 전환" aria-label="${nextThemeLabel}로 전환">
        <span aria-hidden="true">${themeIcon}</span> <span class="theme-label-text">${nextThemeLabel}</span>
      </button>
    </div>
  </div>
  ${isDetail ? renderTabStrip() : ''}
  `;
}

function renderTabStrip() {
  const pills = db.hospitals.map((h) => `
    <button class="tab-pill ${h.id === state.hospitalId ? 'active' : ''}" data-action="switch-hospital" data-id="${h.id}">${esc(h.name)}${h.autoAssignPaused ? ' ⏸' : ''}</button>
  `).join('');
  return `
  <div class="tab-strip">
    <button class="tab-pill home-tab-pill" data-action="go-list" title="홈(목록)으로 돌아가기">🏠 홈 목록</button>
    ${pills}
    <button class="tab-pill add-pill" data-action="add-hospital">+ 새 병원</button>
  </div>`;
}

/* ==================== 렌더링 : 목록 화면 ==================== */

function renderMiniQuotaRow(type, hospital, year, month) {
  const ymKey = monthKey(year, month);
  const quota = getEffectiveQuota(hospital, ymKey);
  const target = Number(quota[type]) || 0;
  const done = getCompletedCount(hospital, year, month, type);
  const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : (done > 0 ? 100 : 0);
  const meta = TYPE_META[type];
  return `
  <div class="mini-quota-row">
    <span class="mini-dot" style="background:${meta.color}"></span>
    <span class="mini-label">${esc(meta.short)}</span>
    <span class="mini-track"><span class="mini-fill" style="width:${pct}%;background:${meta.color}"></span></span>
    <span class="mini-frac">${done}/${target}</span>
  </div>`;
}

function renderHospitalCard(hospital) {
  const anchor = getCurrentCycleAnchor(hospital, today);
  return `
  <div class="hospital-card" data-action="open-hospital" data-id="${hospital.id}">
    <div class="hospital-card-head">
      <div class="hospital-card-name">${esc(hospital.name)}</div>
      <div class="hospital-card-actions">
        <button class="icon-btn" data-action="edit-hospital" data-id="${hospital.id}" title="수정">⚙</button>
        <button class="icon-btn danger-btn" data-action="delete-hospital" data-id="${hospital.id}" title="삭제">✕</button>
      </div>
    </div>
    ${TYPE_KEYS.map((t) => renderMiniQuotaRow(t, hospital, anchor.year, anchor.month)).join('')}
  </div>`;
}

function getTasksForCalendarMonth(hospitalId, year, month) {
  const startStr = `${monthKey(year, month)}-01`;
  const endStr = `${monthKey(year, month)}-${pad2(daysInMonth(year, month))}`;
  return db.tasks.filter((task) => task.hospitalId === hospitalId && (
    (task.deadline && task.deadline >= startStr && task.deadline <= endStr)
    || (isPublishedStatus(task.status) && task.publishedDate && task.publishedDate >= startStr && task.publishedDate <= endStr)
  ));
}

function getMondaysInCycle(hospital, year, month) {
  const { start, end } = getCycleRange(hospital, year, month);
  const mondays = [];
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    if (cur.getDay() === 1) { // 1 = 월요일
      mondays.push(fmtDateStr(cur));
    }
    cur.setDate(cur.getDate() + 1);
  }
  if (mondays.length === 0) {
    mondays.push(fmtDateStr(start));
  }
  return mondays;
}

function renderDeadlineSummary(hospital, year, month) {
  const tasks = getTasksForCycle(hospital, year, month);
  const brandCount = tasks.filter((t) => t.type === 'brandBlog' && t.deadline).length;
  const pressCount = tasks.filter((t) => t.type === 'press' && t.deadline).length;
  const receiptCount = tasks.filter((t) => t.type === 'receipt' && t.deadline).length;
  const totalCount = brandCount + pressCount + receiptCount;

  return `
  <div class="deadline-summary-bar">
    <div class="deadline-summary-title">
      <span>📅 마감 현황</span>
      <small style="font-weight:normal;color:var(--text-muted);">(총 ${totalCount}건)</small>
    </div>
    <div class="deadline-summary-chips">
      <span class="deadline-summary-chip" style="color:var(--series-1);">
        <span class="mini-dot" style="background:var(--series-1)"></span> 브랜드: <strong>${brandCount}건 마감</strong>
      </span>
      <span class="deadline-summary-chip" style="color:var(--series-2);">
        <span class="mini-dot" style="background:var(--series-2)"></span> 기자단: <strong>${pressCount}건 마감</strong>
      </span>
      <span class="deadline-summary-chip" style="color:var(--series-3);">
        <span class="mini-dot" style="background:var(--series-3)"></span> 영수증: <strong>${receiptCount}건 마감</strong>
      </span>
    </div>
    <button type="button" class="primary-btn auto-assign-btn" data-action="auto-assign-mondays" title="목표 수량에 맞춰 월요일 마감일로 자동 균등 배정합니다">
      🎯 월요일 마감 자동 배정
    </button>
    <button type="button" class="${hospital.autoAssignPaused ? 'primary-btn' : 'ghost-btn'} pause-toggle-btn" data-action="toggle-auto-assign-pause" data-id="${hospital.id}" title="${hospital.autoAssignPaused ? '누르면 다시 자동 배정 대상에 포함됩니다' : '누르면 기존 기록은 그대로 두고 새 자동 배정만 건너뜁니다'}">
      ${hospital.autoAssignPaused ? '▶ 배정 재개' : '⏸ 일시정지'}
    </button>
  </div>`;
}

function renderMonthlyHospitalSummary(hospital, year, month) {
  const tasks = getTasksForCalendarMonth(hospital.id, year, month);
  const quota = getEffectiveQuota(hospital, monthKey(year, month));

  let totalTarget = 0;
  let totalDone = 0;

  const rowsHtml = TYPE_KEYS.map((type) => {
    const meta = TYPE_META[type];
    const deadlineCount = tasks.filter((task) => task.type === type && task.deadline?.startsWith(monthKey(year, month))).length;
    const publishedCount = tasks.filter((task) => task.type === type && isPublishedStatus(task.status) && task.publishedDate?.startsWith(monthKey(year, month))).length;
    const target = Number(quota[type]) || 0;
    const pct = target > 0 ? Math.min(100, Math.round((publishedCount / target) * 100)) : (publishedCount > 0 ? 100 : 0);
    totalTarget += target;
    totalDone += publishedCount;
    return `
    <div class="monthly-stat-row">
      <span class="mini-dot" style="background:${meta.color}"></span>
      <span class="monthly-stat-label">${esc(meta.short)}</span>
      <span class="monthly-stat-track"><span class="monthly-stat-fill" style="width:${pct}%;background:${meta.color}"></span></span>
      <span class="monthly-stat-frac">${publishedCount}<small>/${target}</small></span>
      <span class="monthly-stat-deadline">마감 ${deadlineCount}</span>
    </div>`;
  }).join('');

  const overallPct = totalTarget > 0 ? Math.min(100, Math.round((totalDone / totalTarget) * 100)) : (totalDone > 0 ? 100 : 0);

  return `
  <div class="monthly-hospital-card" data-action="open-hospital" data-id="${hospital.id}">
    <div class="monthly-hospital-head">
      <strong>${esc(hospital.name)}</strong>
      <div class="monthly-hospital-ring" style="--pct:${overallPct}" title="전체 진행률 ${overallPct}%">
        <span>${overallPct}%</span>
      </div>
    </div>
    <div class="monthly-hospital-stats">
      ${rowsHtml}
    </div>
  </div>`;
}

function renderHomeEventChip(task, kind) {
  const meta = TYPE_META[task.type] || TYPE_META.brandBlog;
  const isPublish = kind === 'publish';
  return `
  <span class="home-event-chip ${isPublish ? 'is-published' : 'is-deadline'}" style="--chip-color:${meta.color}"
    title="${esc(meta.label)} ${isPublish ? '발행완료' : `마감 · ${task.status}`}">
    ${esc(meta.short)} ${isPublish ? '발행 ✓' : '마감'}
  </span>`;
}

function renderHomeCalendar(year, month) {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month - 1, daysInMonth(year, month));
  const cells = buildCycleCells(monthStart, monthEnd);
  const monthPrefix = monthKey(year, month);
  const monthlyTasks = db.hospitals.flatMap((hospital) => getTasksForCalendarMonth(hospital.id, year, month));

  const cellsHtml = cells.map((date) => {
    const dateStr = fmtDateStr(date);
    const isCurrentMonth = dateStr.startsWith(monthPrefix);
    const isToday = dateStr === TODAY_STR;
    const hospitalGroups = isCurrentMonth ? db.hospitals.map((hospital) => {
      const tasks = monthlyTasks.filter((task) => task.hospitalId === hospital.id);
      const events = [
        ...tasks.filter((task) => task.status === '발행완료' && task.publishedDate === dateStr)
          .map((task) => ({ task, kind: 'publish' })),
        ...tasks.filter((task) => task.deadline === dateStr && task.publishedDate !== dateStr)
          .map((task) => ({ task, kind: 'deadline' })),
      ];
      if (!events.length) return '';
      return `
      <div class="home-hospital-sector" data-action="open-hospital" data-id="${hospital.id}" data-date="${dateStr}">
        <div class="home-sector-name">${esc(hospital.name)}</div>
        <div class="home-sector-events">${events.map(({ task, kind }) => renderHomeEventChip(task, kind)).join('')}</div>
      </div>`;
    }).join('') : '';
    return `
    <div class="home-calendar-cell ${isCurrentMonth ? '' : 'outside'} ${isToday ? 'today' : ''}">
      <div class="home-calendar-day">${date.getDate()}</div>
      <div class="home-calendar-sectors">${hospitalGroups}</div>
    </div>`;
  }).join('');

  return `
  <section class="home-calendar-section">
    <div class="home-calendar-head">
      <div>
        <div class="section-title">${monthLabel(year, month)} 통합 작업 달력</div>
        <div class="home-calendar-description">이번 달 마감 작업과 이번 달 발행 작업을 병원별로 모아 표시합니다.</div>
      </div>
      <div class="home-calendar-legend">
        <span><i class="deadline-sample"></i>마감</span>
        <span><i class="publish-sample"></i>발행완료</span>
      </div>
    </div>
    <div class="home-calendar-scroll">
      <div class="home-calendar-grid">
        ${DOW_LABELS.map((day) => `<div class="home-calendar-dow">${day}</div>`).join('')}
        ${cellsHtml}
      </div>
    </div>
  </section>`;
}

function renderListView() {
  if (db.hospitals.length === 0) {
    return `
    <div class="empty-state onboarding-card">
      <div class="onboarding-icon">🏥</div>
      <h2 class="onboarding-title">네이버 마케팅 작업 트래커에 오신 것을 환영합니다!</h2>
      <p class="onboarding-desc">아직 등록된 병원(업체)이 없습니다.<br>새 병원을 추가하여 월별/주기별 목표 수량과 발행 일정을 편리하게 관리해 보세요.</p>
      <div class="onboarding-actions">
        <button class="primary-btn btn-lg" data-action="add-hospital">✨ 새 병원 추가하고 시작하기</button>
        <button class="ghost-btn" data-action="import-data">📁 기존 백업 파일 불러오기</button>
      </div>
    </div>`;
  }
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  return `
  ${renderMondayBoard()}
  <div class="list-toolbar">
    <div>
      <div class="section-title">${monthLabel(year, month)} 전체 병원 현황</div>
      <div class="home-summary-caption">숫자는 이번 달 발행량 / 목표량이며, 정산 주기와 별도로 달력 월 기준으로 집계됩니다.</div>
    </div>
    <button class="primary-btn" data-action="add-hospital">+ 병원 추가</button>
  </div>
  <div class="monthly-hospital-grid">
    ${db.hospitals.map((hospital) => renderMonthlyHospitalSummary(hospital, year, month)).join('')}
  </div>
  ${renderHomeCalendar(year, month)}`;
}

/* ==================== 렌더링 : 병원 상세 화면 ==================== */

function renderQuotaSection(hospital, year, month) {
  const ymKey = monthKey(year, month);
  return `
  <div class="quota-section">
    <div class="quota-section-head">
      <div class="section-title">${periodWord(hospital, year, month)} 할당량</div>
      <button class="ghost-btn" data-action="edit-quota">목표 수정</button>
    </div>
    <div class="stat-tiles">
      ${TYPE_KEYS.map((type) => {
        const quota = getEffectiveQuota(hospital, ymKey);
        const target = Number(quota[type]) || 0;
        const done = getCompletedCount(hospital, year, month, type);
        const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : (done > 0 ? 100 : 0);
        const meta = TYPE_META[type];
        return `
        <div class="stat-tile">
          <div class="stat-tile-head">
            <span class="stat-dot" style="background:${meta.color}"></span>
            <span class="stat-label">${esc(meta.label)}</span>
          </div>
          <div class="stat-value">${done}<span class="stat-value-sep">/</span>${target}</div>
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%;background:${meta.color}"></div></div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function buildCycleCells(start, end) {
  const gridStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const gridEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));
  const cells = [];
  const cur = new Date(gridStart);
  while (cur.getTime() <= gridEnd.getTime()) {
    cells.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return cells;
}

function renderChip(task, kind) {
  const meta = TYPE_META[task.type];
  if (kind === 'publish') {
    return `<span class="chip chip-publish" style="--chip-color:${meta.color}" title="${esc(meta.label)} 발행완료">${esc(meta.short)} 발행 ✓</span>`;
  }
  const done = isPublishedStatus(task.status);
  return `<span class="chip chip-deadline ${done ? 'chip-done' : ''}" style="--chip-color:${meta.color}" title="${esc(meta.label)} 마감 (${esc(task.status)})">${esc(meta.short)} 마감${done ? ' ✓' : ''}</span>`;
}

function renderCalendarSection(hospital, year, month) {
  const { start, end } = getCycleRange(hospital, year, month);
  const startStr = fmtDateStr(start);
  const endStr = fmtDateStr(end);
  const cells = buildCycleCells(start, end);
  const hospitalTasks = db.tasks.filter((t) => t.hospitalId === hospital.id);

  const dayCellsHtml = cells.map((date) => {
    const dateStr = fmtDateStr(date);
    const isToday = dateStr === TODAY_STR;
    const inCycle = dateStr >= startStr && dateStr <= endStr;
    const deadlineTasks = hospitalTasks.filter((t) => t.deadline === dateStr && t.publishedDate !== dateStr);
    const publishTasks = hospitalTasks.filter((t) => isPublishedStatus(t.status) && t.publishedDate === dateStr);
    const chips = [
      ...publishTasks.map((t) => ({ t, kind: 'publish' })),
      ...deadlineTasks.map((t) => ({ t, kind: 'deadline' })),
    ];
    const shown = chips.slice(0, 3);
    const overflow = chips.length - shown.length;
    const monthTag = date.getDate() === 1 ? `<span class="calendar-month-tag">${date.getMonth() + 1}월</span>` : '';
    return `
    <div class="calendar-cell ${isToday ? 'today' : ''} ${inCycle ? '' : 'outside'}">
      <div class="calendar-daynum">${monthTag}${date.getDate()}</div>
      ${shown.map((c) => renderChip(c.t, c.kind)).join('')}
      ${overflow > 0 ? `<span class="chip-more">+${overflow}</span>` : ''}
    </div>`;
  }).join('');

  return `
  <div class="calendar-section">
    <div class="calendar-legend">
      <span><span class="legend-dot" style="background:var(--series-1)"></span>브랜드 블로그</span>
      <span><span class="legend-dot" style="background:var(--series-2)"></span>기자단</span>
      <span><span class="legend-dot" style="background:var(--series-3)"></span>영수증 리뷰</span>
      <span>· 옅은 색=마감 목표, 진한 색=발행완료</span>
      <span>· 흐린 날짜=이번 주기 범위 밖</span>
    </div>
    <div class="calendar-grid">
      ${DOW_LABELS.map((d) => `<div class="calendar-dow">${d}</div>`).join('')}
      ${dayCellsHtml}
    </div>
  </div>`;
}

function renderTaskRow(task) {
  const typeOptions = TYPE_KEYS.map((key) => `<option value="${key}" ${task.type === key ? 'selected' : ''}>${esc(TYPE_META[key].label)}</option>`).join('');
  const statusOptions = STATUS_LIST.map((s) => `<option value="${esc(s)}" ${task.status === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
  
  const isPublished = isPublishedStatus(task.status);
  const publishedCell = isPublished
    ? `<input type="date" class="cell-input" data-field="publishedDate" value="${esc(task.publishedDate || '')}">`
    : `<span class="cell-dash">-</span>`;

  const isReceipt = task.type === 'receipt';
  const keywordCell = isReceipt
    ? `<span class="receipt-keyword-disabled">미사용</span>`
    : `<input type="text" class="cell-input" data-field="keyword" placeholder="키워드 입력" value="${esc(task.keyword || '')}">`;

  const urlCell = `<div class="url-cell-box">
     <input type="url" class="cell-input url-input" data-field="publishedUrl" placeholder="https://..." value="${esc(task.publishedUrl || '')}">
     ${task.publishedUrl && task.publishedUrl.trim() ? `<a href="${esc(task.publishedUrl.trim())}" target="_blank" rel="noopener noreferrer" class="url-open-btn" title="링크 열기">🔗</a>` : ''}
   </div>`;

  const topicCell = `<input type="text" class="cell-input topic-input" data-field="topicText" placeholder="글감(주제/텍스트) 입력" value="${esc(task.topicText || '')}">`;

  let volumeCell = `<span class="cell-dash">-</span>`;
  let docsCell = `<span class="cell-dash">-</span>`;
  let compCell = `<span class="comp-badge is-na">미사용</span>`;

  if (!isReceipt) {
    volumeCell = `<input type="number" class="cell-input num-input" data-field="keywordVolume" placeholder="0" min="0" value="${task.keywordVolume ?? ''}">`;
    docsCell = `<input type="number" class="cell-input num-input" data-field="keywordDocs" placeholder="0" min="0" value="${task.keywordDocs ?? ''}">`;
    
    if (task.keywordVolume !== null && task.keywordVolume !== undefined && Number(task.keywordVolume) > 0) {
      const vol = Number(task.keywordVolume);
      const docs = Number(task.keywordDocs || 0);
      const comp = docs / vol;
      const formattedComp = Number.isInteger(comp) ? comp.toString() : (Math.round(comp * 10000) / 10000).toString();
      compCell = `<span class="comp-badge" title="경쟁도 = 발행량 (${docs}) / 검색량 (${vol})">${formattedComp}</span>`;
    } else {
      compCell = `<span class="comp-badge is-na">-</span>`;
    }
  }

  return `
  <tr data-task-id="${task.id}">
    <td class="delete-task-cell"><button class="icon-btn danger-btn" data-action="delete-task" title="삭제" aria-label="작업 삭제">✕</button></td>
    <td class="cell-type"><select class="cell-input type-select type-${task.type}" data-field="type">${typeOptions}</select></td>
    <td class="cell-keyword"><span class="mobile-cell-label">키워드</span>${keywordCell}</td>
    <td class="cell-topic"><span class="mobile-cell-label">글감</span>${topicCell}</td>
    <td class="cell-deadline"><span class="mobile-cell-label">마감일</span><input type="date" class="cell-input" data-field="deadline" value="${esc(task.deadline || '')}"></td>
    <td class="cell-status"><select class="cell-input status-select" data-status="${esc(task.status)}" data-field="status">${statusOptions}</select></td>
    <td class="cell-published"><span class="mobile-cell-label">발행일</span>${publishedCell}</td>
    <td class="cell-published-url"><span class="mobile-cell-label">발행 URL</span>${urlCell}</td>
    <td class="cell-volume"><span class="mobile-cell-label">검색량</span>${volumeCell}</td>
    <td class="cell-docs"><span class="mobile-cell-label">발행량</span>${docsCell}</td>
    <td class="cell-comp"><span class="mobile-cell-label">경쟁도</span>${compCell}</td>
    <td class="cell-performance"><span class="mobile-cell-label">성과</span><input type="text" class="cell-input performance-input" data-field="performance" placeholder="예: 블로그탭 1위" value="${esc(task.performance || '')}"></td>
  </tr>`;
}

const TRACKER_TYPE_ORDER = { brandBlog: 0, press: 1, receipt: 2 };

function renderTrackerSection(hospital, year, month) {
  const savedOrder = taskOrder[`${hospital.id}::${monthKey(year, month)}`] || [];
  const savedPositions = new Map(savedOrder.map((id, index) => [id, index]));
  const sortMode = state.trackerSortMode === 'type' ? 'type' : 'deadline';
  const tasks = getTasksForCycle(hospital, year, month)
    .map((task, index) => ({ task, index, savedPosition: savedPositions.get(task.id) }))
    .sort((a, b) => {
      if (sortMode === 'type') {
        const aType = TRACKER_TYPE_ORDER[a.task.type] ?? 99;
        const bType = TRACKER_TYPE_ORDER[b.task.type] ?? 99;
        if (aType !== bType) return aType - bType;
      } else {
        const aDeadline = a.task.deadline || '';
        const bDeadline = b.task.deadline || '';
        if (aDeadline !== bDeadline) return aDeadline.localeCompare(bDeadline);
      }
      const aSaved = a.savedPosition !== undefined;
      const bSaved = b.savedPosition !== undefined;
      if (aSaved && bSaved) return a.savedPosition - b.savedPosition;
      if (aSaved !== bSaved) return aSaved ? -1 : 1;
      if (sortMode === 'type') {
        const aDeadline = a.task.deadline || '';
        const bDeadline = b.task.deadline || '';
        if (aDeadline !== bDeadline) return aDeadline.localeCompare(bDeadline);
      }
      const aCreated = typeof a.task.createdAt === 'number' ? a.task.createdAt : Number.NEGATIVE_INFINITY;
      const bCreated = typeof b.task.createdAt === 'number' ? b.task.createdAt : Number.NEGATIVE_INFINITY;
      return aCreated - bCreated || a.index - b.index;
    })
    .map(({ task }) => task);
  const word = periodWord(hospital, year, month);
  return `
  <div class="tracker-section ${state.trackerExpanded ? 'is-expanded' : ''}">
    <div class="tracker-section-head" data-action="toggle-tracker-expand" title="${state.trackerExpanded ? '원래 크기로 보기' : '크게 보기'}">
      <div class="section-title tracker-expand-title">
        ${word} 작업 트래커
        <span class="tracker-expand-icon" aria-hidden="true">${state.trackerExpanded ? '↙' : '↗'}</span>
      </div>
      <div class="tracker-head-actions">
        <select id="trackerSortSelect" class="ghost-btn sort-select" data-action="noop" title="정렬 기준">
          <option value="deadline" ${sortMode === 'deadline' ? 'selected' : ''}>마감일순</option>
          <option value="type" ${sortMode === 'type' ? 'selected' : ''}>발행종류순</option>
        </select>
        ${state.trackerExpanded ? `<button class="ghost-btn" data-action="toggle-tracker-expand">축소</button>` : ''}
        <button class="ghost-btn" data-action="add-task" data-type="receipt">+ 영수증 리뷰 추가</button>
        <button class="primary-btn" data-action="add-task" data-type="brandBlog">+ 작업 추가</button>
      </div>
    </div>
    <div class="table-scroll">
      <table class="tracker-table">
        <thead>
          <tr>
            <th class="delete-task-head"><span class="sr-only">삭제</span></th>
            <th>발행 종류</th>
            <th>키워드</th>
            <th class="topic-head">글감 (텍스트)</th>
            <th>마감일</th>
            <th>진행상황</th>
            <th>발행일</th>
            <th>발행 URL</th>
            <th>검색량</th>
            <th>발행량</th>
            <th>경쟁도</th>
            <th>성과</th>
          </tr>
        </thead>
        <tbody id="trackerTbody">
          ${tasks.length ? tasks.map(renderTaskRow).join('') : ''}
        </tbody>
      </table>
      ${tasks.length === 0 ? `<div class="tracker-empty">${word} 작업이 없습니다. "+ 작업 추가"로 시작하세요.</div>` : ''}
    </div>
  </div>`;
}

function renderKeywordItem(task) {
  const meta = TYPE_META[task.type] || TYPE_META.brandBlog;
  const vol = task.keywordVolume !== null && task.keywordVolume !== undefined ? Number(task.keywordVolume).toLocaleString() : '-';
  const docs = task.keywordDocs !== null && task.keywordDocs !== undefined ? Number(task.keywordDocs).toLocaleString() : '-';
  return `
  <div class="keyword-item">
    <div class="keyword-item-head">
      <span class="mini-dot" style="background:${meta.color}"></span>
      <span class="keyword-item-text" title="${esc(task.keyword)}">${esc(task.keyword)}</span>
      <span class="keyword-item-type-badge" style="color:${meta.color}">${esc(meta.short)}</span>
    </div>
    <div class="keyword-item-stats">
      <span>검색량 <strong>${vol}</strong></span>
      <span class="stat-sep">•</span>
      <span>발행량 <strong>${docs}</strong></span>
    </div>
  </div>`;
}

function renderPoolChip(item) {
  return `
  <div class="pool-chip" data-action="edit-pool-item" data-id="${item.id}">
    <button type="button" class="chip-x" data-action="delete-pool-item" data-id="${item.id}" title="삭제">×</button>
    <div class="pool-chip-text">${esc(item.keyword)}</div>
    <div class="pool-chip-stats">
      <span>검색 <strong>${item.volume ?? '-'}</strong></span>
      <span>발행 <strong>${item.docs ?? '-'}</strong></span>
    </div>
  </div>`;
}

function renderKeywordPoolSection(hospital) {
  const items = getHospitalTags(hospital.id, 'search');
  return `
  <div class="keyword-pool-block">
    <div class="keyword-pool-head">
      <div class="keyword-banner-subtitle">키워드 풀</div>
      <button type="button" class="icon-btn" data-action="add-pool-item" title="키워드 추가">+</button>
    </div>
    <div class="pool-chip-list">
      ${items.map(renderPoolChip).join('')}
      ${items.length === 0 ? `<div class="keyword-empty">아직 저장된 키워드가 없습니다.<br>발행에 쓰지 않아도 미리 모아둘 수 있어요.</div>` : ''}
    </div>
  </div>`;
}

function renderKeywordBanner(hospital) {
  const items = db.tasks
    .filter((t) => t.hospitalId === hospital.id && t.keyword && t.keyword.trim())
    .slice()
    .sort((a, b) => {
      const ca = a.createdAt || 0;
      const cb = b.createdAt || 0;
      if (cb !== ca) return cb - ca;
      return (b.deadline || '').localeCompare(a.deadline || '');
    })
    .slice(0, 40);

  return `
  <aside class="keyword-banner">
    <div class="keyword-banner-title">최근 ${esc(hospital.name)}의 키워드</div>
    ${items.length === 0
      ? `<div class="keyword-empty">아직 입력된 키워드가 없습니다.<br>트래커에서 키워드를 입력해보세요.</div>`
      : `<div class="keyword-list">${items.map(renderKeywordItem).join('')}</div>`}
    ${renderKeywordPoolSection(hospital)}
  </aside>`;
}

function renderCreds(hospital) {
  const id = hospital.naverId || '';
  const pw = hospital.naverPassword || '';
  const pwShown = state.pwVisible ? (pw || '-') : (pw ? '•'.repeat(Math.min(pw.length, 12)) : '-');
  return `
  <div class="detail-creds">
    <span class="cred-item">
      <span class="cred-key">네이버 아이디</span>
      <strong class="cred-val">${esc(id || '-')}</strong>
      <button class="icon-btn" data-action="copy-naver-id" title="아이디 복사">⧉</button>
    </span>
    <span class="cred-item">
      <span class="cred-key">비밀번호</span>
      <strong class="cred-val">${esc(pwShown)}</strong>
      <button class="icon-btn" data-action="toggle-pw" title="${state.pwVisible ? '숨기기' : '보기'}">${state.pwVisible ? '🙈' : '👁'}</button>
      <button class="icon-btn" data-action="copy-naver-pw" title="비밀번호 복사">⧉</button>
    </span>
  </div>`;
}

function renderQuickLinks(hospital) {
  const links = [];
  if (hospital.naverBlogUrl) {
    links.push(`<a class="ghost-btn link-btn" href="${esc(hospital.naverBlogUrl)}" target="_blank" rel="noopener noreferrer">블로그 바로가기 ↗</a>`);
  }
  if (hospital.naverMapUrl) {
    links.push(`<a class="ghost-btn link-btn" href="${esc(hospital.naverMapUrl)}" target="_blank" rel="noopener noreferrer">지도 바로가기 ↗</a>`);
  }
  if (links.length === 0) return '';
  return `<div class="detail-links">${links.join('')}</div>`;
}

function renderTextChip(item) {
  return `
  <div class="tag-chip" data-action="edit-tag-item" data-id="${item.id}">
    <span class="tag-chip-text">${esc(item.keyword)}</span>
    <button type="button" class="chip-x tag-chip-x" data-action="delete-tag-item" data-id="${item.id}" title="삭제">×</button>
  </div>`;
}

function renderTagGroup(hospital, kind, title) {
  const items = getHospitalTags(hospital.id, kind);
  return `
  <div class="tag-group">
    <div class="tag-group-head">
      <span class="tag-group-title">${esc(title)}</span>
      <button type="button" class="icon-btn" data-action="add-tag-item" data-kind="${kind}" title="${esc(title)} 추가">+</button>
    </div>
    <div class="tag-chip-list">
      ${items.map(renderTextChip).join('')}
      ${items.length === 0 ? `<span class="tag-empty">없음</span>` : ''}
    </div>
  </div>`;
}

function renderLocationProcedureSection(hospital) {
  return `
  <div class="tag-section">
    ${renderTagGroup(hospital, 'location', '위치 키워드')}
    ${renderTagGroup(hospital, 'procedure', '시술질환 키워드')}
  </div>`;
}

function renderDetailView() {
  const hospital = getHospital(state.hospitalId);
  if (!hospital) { state.view = 'list'; return renderListView(); }
  const anchor = getCurrentCycleAnchor(hospital, today);
  const isCurrentCycle = state.year === anchor.year && state.month === anchor.month;

  return `
  <div class="detail-head">
    <div>
      <div class="detail-title-row">
        <div class="detail-title">${esc(hospital.name)}</div>
        ${hospital.autoAssignPaused ? `<span class="paused-badge" title="자동 배정이 일시중지되어 있습니다">일시중지</span>` : ''}
        <button class="icon-btn" data-action="edit-hospital" data-id="${hospital.id}" title="병원 정보 수정">⚙</button>
      </div>
      ${renderCreds(hospital)}
      ${renderQuickLinks(hospital)}
      ${renderLocationProcedureSection(hospital)}
    </div>
    <div class="month-nav">
      <button class="icon-btn" data-action="prev-month">◀</button>
      <span class="month-nav-label">${cycleLabel(hospital, state.year, state.month)}</span>
      <button class="icon-btn" data-action="next-month">▶</button>
      ${!isCurrentCycle ? `<button class="ghost-btn" data-action="today-month">${periodWord(hospital)}</button>` : ''}
      <button class="primary-btn pdf-report-btn" data-action="export-pdf-report" title="Dr.NAEO 성과 보고서 PDF 출력/다운로드">📄 PDF 보고서 내보내기</button>
    </div>
  </div>
  <div class="detail-body">
    <div class="detail-main">
      ${renderDeadlineSummary(hospital, state.year, state.month)}
      ${renderQuotaSection(hospital, state.year, state.month)}
      ${renderCalendarSection(hospital, state.year, state.month)}
      ${renderTrackerSection(hospital, state.year, state.month)}
    </div>
    ${renderKeywordBanner(hospital)}
  </div>
  `;
}

/* ==================== 전체 렌더 ==================== */

function render() {
  if (state.view === 'detail' && !getHospital(state.hospitalId)) {
    state.view = 'list';
    state.hospitalId = null;
  }

  const activeEl = document.activeElement;
  let focusedTaskId = null;
  let focusedField = null;
  let selectionStart = null;
  let selectionEnd = null;

  const tableScroll = document.querySelector('.table-scroll');
  const savedTableScrollLeft = tableScroll ? tableScroll.scrollLeft : 0;
  const savedTableScrollTop = tableScroll ? tableScroll.scrollTop : 0;

  if (activeEl && activeEl.closest) {
    const tr = activeEl.closest('tr[data-task-id]');
    if (tr && activeEl.dataset && activeEl.dataset.field) {
      focusedTaskId = tr.dataset.taskId;
      focusedField = activeEl.dataset.field;
      if (typeof activeEl.selectionStart === 'number') {
        selectionStart = activeEl.selectionStart;
        selectionEnd = activeEl.selectionEnd;
      }
    }
  }

  const app = document.getElementById('app');
  app.innerHTML = renderHeader() + (state.view === 'list' ? renderListView() : renderDetailView());
  document.body.classList.toggle('tracker-expanded', !!state.trackerExpanded);
  attachListeners();

  const newTableScroll = document.querySelector('.table-scroll');
  if (newTableScroll) {
    newTableScroll.scrollLeft = savedTableScrollLeft;
    newTableScroll.scrollTop = savedTableScrollTop;
  }

  if (focusedTaskId && focusedField) {
    const targetInput = document.querySelector(`tr[data-task-id="${focusedTaskId}"] [data-field="${focusedField}"]`);
    if (targetInput) {
      targetInput.focus();
      if (typeof selectionStart === 'number' && targetInput.setSelectionRange) {
        try {
          targetInput.setSelectionRange(selectionStart, selectionEnd);
        } catch (e) {}
      }
    }
  }
}

/* ==================== 모달 ==================== */

function openModal(html) {
  const modalRoot = document.getElementById('modalRoot');
  modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal-card" role="dialog">${html}</div></div>`;
  modalRoot.querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) closeModal();
  });
  modalRoot.querySelectorAll('[data-action="close-modal"]').forEach((button) => {
    button.addEventListener('click', closeModal);
  });
}

function closeModal() {
  document.getElementById('modalRoot').innerHTML = '';
}

function hospitalFormHtml(hospital) {
  const isEdit = !!hospital;
  const q = isEdit ? hospital.defaultQuota : { brandBlog: 0, press: 0, receipt: 0 };
  return `
  <h3>${isEdit ? '병원 정보 수정' : '병원 추가'}</h3>
  <form id="hospitalForm">
    <label>병원명
      <input type="text" name="name" required value="${isEdit ? esc(hospital.name) : ''}">
    </label>
    <div class="form-row-3">
      <label>브랜드 블로그 목표<input type="number" name="brandBlog" min="0" max="${MAX_QUOTA_PER_TYPE}" value="${q.brandBlog}"></label>
      <label>기자단 목표<input type="number" name="press" min="0" max="${MAX_QUOTA_PER_TYPE}" value="${q.press}"></label>
      <label>영수증 리뷰 목표<input type="number" name="receipt" min="0" max="${MAX_QUOTA_PER_TYPE}" value="${q.receipt}"></label>
    </div>
    <label>정산(발행) 시작일
      <input type="number" name="cycleStartDay" min="1" max="31" value="${isEdit ? (hospital.cycleStartDay || 1) : 1}">
    </label>
    <p class="helper-text">예: 25로 설정하면 매월 25일부터 다음달 24일까지를 한 주기(한달 단위)로 계산합니다. 기본값 1은 일반 달력 월(1일~말일)입니다. (단, "마감 자동 배정" 버튼은 이 설정과 무관하게 항상 달력 월 기준으로 채웁니다.)</p>
    <label class="checkbox-row">
      <input type="checkbox" name="autoAssignPaused" ${isEdit && hospital.autoAssignPaused ? 'checked' : ''}>
      자동 배정 일시중지 (기존 기록은 유지, 새로 자동 배정만 하지 않음)
    </label>
    <p class="helper-text">체크하면 "마감 자동 배정" 버튼을 눌러도 이 병원은 건너뜁니다. 수동으로 "+ 작업 추가"하는 건 그대로 가능합니다.</p>
    <label class="checkbox-row">
      <input type="checkbox" name="interleaveTypes" ${isEdit && hospital.interleaveTypes ? 'checked' : ''}>
      브랜드 블로그 / 기자단 교차 배정
    </label>
    <p class="helper-text">체크하면 같은 주에 브랜드 블로그와 기자단이 같이 몰리지 않고, 주차마다 번갈아가며 배정됩니다 (예: 1주차 브랜드, 2주차 기자단, 3주차 브랜드...). 영수증 리뷰는 영향받지 않습니다.</p>
    <label>네이버 블로그 아이디
      <input type="text" name="naverId" value="${isEdit ? esc(hospital.naverId || '') : ''}">
    </label>
    <label>네이버 블로그 비밀번호
      <div class="pw-row">
        <input type="password" name="naverPassword" id="naverPasswordInput" value="${isEdit ? esc(hospital.naverPassword || '') : ''}">
        <button type="button" class="ghost-btn" id="togglePwBtn">보기</button>
      </div>
    </label>
    <p class="helper-text">비밀번호는 이 트래커의 공유 클라우드 저장소(Supabase)에 평문으로 저장됩니다. 접속 비밀번호를 아는 사람은 누구나 볼 수 있으니 공용 컴퓨터/타인과 공유 시 주의하세요.</p>
    <div class="form-row-2">
      <label>네이버 블로그 주소<input type="text" name="naverBlogUrl" placeholder="blog.naver.com/..." value="${isEdit ? esc(hospital.naverBlogUrl || '') : ''}"></label>
      <label>네이버 지도 주소<input type="text" name="naverMapUrl" placeholder="map.naver.com/..." value="${isEdit ? esc(hospital.naverMapUrl || '') : ''}"></label>
    </div>
    <div class="modal-actions">
      ${isEdit ? `<button type="button" class="danger-btn" id="deleteHospitalBtn">병원 삭제</button>` : `<span></span>`}
      <div class="modal-actions-right">
        <button type="button" class="ghost-btn" data-action="close-modal">취소</button>
        <button type="submit" class="primary-btn">저장</button>
      </div>
    </div>
  </form>`;
}

function openHospitalForm(hospital) {
  openModal(hospitalFormHtml(hospital));
  const form = document.getElementById('hospitalForm');
  const pwInput = document.getElementById('naverPasswordInput');
  const toggleBtn = document.getElementById('togglePwBtn');
  toggleBtn.addEventListener('click', () => {
    const show = pwInput.type === 'password';
    pwInput.type = show ? 'text' : 'password';
    toggleBtn.textContent = show ? '숨기기' : '보기';
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    if (!name) return;
    const defaultQuota = {
      brandBlog: Number(fd.get('brandBlog')) || 0,
      press: Number(fd.get('press')) || 0,
      receipt: Number(fd.get('receipt')) || 0,
    };
    const naverId = String(fd.get('naverId') || '').trim();
    const naverPassword = String(fd.get('naverPassword') || '');
    const naverBlogUrl = normalizeUrl(String(fd.get('naverBlogUrl') || ''));
    const naverMapUrl = normalizeUrl(String(fd.get('naverMapUrl') || ''));
    const cycleStartDay = Math.min(31, Math.max(1, Number(fd.get('cycleStartDay')) || 1));
    const autoAssignPaused = fd.get('autoAssignPaused') === 'on';
    const interleaveTypes = fd.get('interleaveTypes') === 'on';
    let targetHospital = hospital;
    if (hospital) {
      hospital.name = name;
      hospital.defaultQuota = defaultQuota;
      hospital.naverId = naverId;
      hospital.naverPassword = naverPassword;
      hospital.naverBlogUrl = naverBlogUrl;
      hospital.naverMapUrl = naverMapUrl;
      hospital.cycleStartDay = cycleStartDay;
      hospital.autoAssignPaused = autoAssignPaused;
      hospital.interleaveTypes = interleaveTypes;
    } else {
      targetHospital = {
        id: uuid(), name, defaultQuota, naverId, naverPassword, naverBlogUrl, naverMapUrl, cycleStartDay, autoAssignPaused, interleaveTypes, createdAt: TODAY_STR,
      };
      db.hospitals.push(targetHospital);
    }
    saveData();
    if (supabaseClient) syncSupabaseHospital(targetHospital);
    closeModal();
    render();
  });
  if (hospital) {
    document.getElementById('deleteHospitalBtn').addEventListener('click', () => {
      if (!confirm(`"${hospital.name}" 병원과 관련된 모든 작업 기록을 삭제할까요? 되돌릴 수 없습니다.`)) return;
      const delId = hospital.id;
      deleteHospitalCascade(delId);
      saveData();
      if (supabaseClient) syncSupabaseHospitalDelete(delId);
      closeModal();
      if (state.hospitalId === delId) { state.view = 'list'; state.hospitalId = null; }
      render();
    });
  }
}

function quotaFormHtml(hospital, ymKey) {
  const quota = getEffectiveQuota(hospital, ymKey);
  const hasOverride = !!db.quotaOverrides[`${hospital.id}::${ymKey}`];
  return `
  <h3>${cycleLabel(hospital, state.year, state.month)} 할당량 수정</h3>
  <form id="quotaForm">
    <label>브랜드 블로그 목표<input type="number" name="brandBlog" min="0" max="${MAX_QUOTA_PER_TYPE}" value="${Number(quota.brandBlog) || 0}"></label>
    <label>기자단 목표<input type="number" name="press" min="0" max="${MAX_QUOTA_PER_TYPE}" value="${Number(quota.press) || 0}"></label>
    <label>영수증 리뷰 목표<input type="number" name="receipt" min="0" max="${MAX_QUOTA_PER_TYPE}" value="${Number(quota.receipt) || 0}"></label>
    <div class="modal-actions">
      ${hasOverride ? `<button type="button" class="ghost-btn" id="resetQuotaBtn">기본값으로 초기화</button>` : `<span></span>`}
      <div class="modal-actions-right">
        <button type="button" class="ghost-btn" data-action="close-modal">취소</button>
        <button type="submit" class="primary-btn">저장</button>
      </div>
    </div>
  </form>`;
}

function openQuotaForm(hospital, ymKey) {
  openModal(quotaFormHtml(hospital, ymKey));
  const form = document.getElementById('quotaForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const qKey = `${hospital.id}::${ymKey}`;
    const qVal = {
      brandBlog: Number(fd.get('brandBlog')) || 0,
      press: Number(fd.get('press')) || 0,
      receipt: Number(fd.get('receipt')) || 0,
    };
    db.quotaOverrides[qKey] = qVal;
    saveData();
    if (supabaseClient) syncSupabaseQuota(qKey, qVal);
    closeModal();
    render();
  });
  const resetBtn = document.getElementById('resetQuotaBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const qKey = `${hospital.id}::${ymKey}`;
      delete db.quotaOverrides[qKey];
      saveData();
      if (supabaseClient) {
        supabaseClient.from('quota_overrides').delete().eq('key', qKey).catch(() => {});
      }
      closeModal();
      render();
    });
  }
}

function keywordFormHtml(task) {
  const hasKeywordInfo = !!(
    (task.keyword && task.keyword.trim())
    || task.keywordVolume !== null && task.keywordVolume !== undefined
    || task.keywordDocs !== null && task.keywordDocs !== undefined
    || task.keywordGap !== null && task.keywordGap !== undefined
  );
  return `
  <h3>키워드 정보</h3>
  <form id="keywordForm">
    <label>키워드
      <input type="text" name="keyword" value="${esc(task.keyword || '')}" placeholder="예: 강남 임플란트">
    </label>
    <div class="form-row-2">
      <label>월간 검색량<input type="number" name="volume" min="0" value="${task.keywordVolume ?? ''}"></label>
      <label>월간 문서 발행수<input type="number" name="docs" min="0" value="${task.keywordDocs ?? ''}"></label>
    </div>
    <label>빈자리<input type="number" name="gap" min="0" value="${task.keywordGap ?? ''}"></label>
    <div class="modal-actions">
      ${hasKeywordInfo ? `<button type="button" class="danger-btn" id="deleteKeywordBtn">삭제</button>` : `<span></span>`}
      <div class="modal-actions-right">
        <button type="button" class="ghost-btn" data-action="close-modal">취소</button>
        <button type="submit" class="primary-btn">저장</button>
      </div>
    </div>
  </form>`;
}

function openKeywordForm(task) {
  openModal(keywordFormHtml(task));
  const form = document.getElementById('keywordForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    task.keyword = String(fd.get('keyword') || '').trim();
    const vol = fd.get('volume');
    const docs = fd.get('docs');
    const gap = fd.get('gap');
    task.keywordVolume = vol === '' ? null : Number(vol);
    task.keywordDocs = docs === '' ? null : Number(docs);
    task.keywordGap = gap === '' ? null : Number(gap);
    if (!task.createdAt) task.createdAt = Date.now();
    saveData();
    closeModal();
    render();
  });
  const deleteBtn = document.getElementById('deleteKeywordBtn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (!confirm('이 작업의 키워드 정보를 삭제할까요?')) return;
      task.keyword = '';
      task.keywordVolume = null;
      task.keywordDocs = null;
      task.keywordGap = null;
      saveData();
      closeModal();
      render();
    });
  }
}

function poolFormHtml(item) {
  const isEdit = !!item;
  return `
  <h3>키워드 풀 ${isEdit ? '수정' : '추가'}</h3>
  <form id="poolForm">
    <label>키워드
      <input type="text" name="keyword" required value="${isEdit ? esc(item.keyword) : ''}" placeholder="예: 강남 임플란트">
    </label>
    <div class="form-row-3">
      <label>월간 검색량<input type="number" name="volume" min="0" value="${isEdit ? (item.volume ?? '') : ''}"></label>
      <label>월간 발행량<input type="number" name="docs" min="0" value="${isEdit ? (item.docs ?? '') : ''}"></label>
      <label>빈자리<input type="number" name="gap" min="0" value="${isEdit ? (item.gap ?? '') : ''}"></label>
    </div>
    <div class="modal-actions">
      ${isEdit ? `<button type="button" class="danger-btn" id="deletePoolBtn">삭제</button>` : `<span></span>`}
      <div class="modal-actions-right">
        <button type="button" class="ghost-btn" data-action="close-modal">취소</button>
        <button type="submit" class="primary-btn">저장</button>
      </div>
    </div>
  </form>`;
}

function openPoolForm(hospitalId, item) {
  openModal(poolFormHtml(item));
  const form = document.getElementById('poolForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const keyword = String(fd.get('keyword') || '').trim();
    if (!keyword) return;
    const vol = fd.get('volume');
    const docs = fd.get('docs');
    const gap = fd.get('gap');
    const volume = vol === '' ? null : Number(vol);
    const docsNum = docs === '' ? null : Number(docs);
    const gapNum = gap === '' ? null : Number(gap);
    if (item) {
      item.keyword = keyword;
      item.volume = volume;
      item.docs = docsNum;
      item.gap = gapNum;
    } else {
      db.tagPool.push({
        id: uuid(), hospitalId, kind: 'search', keyword, volume, docs: docsNum, gap: gapNum, createdAt: Date.now(),
      });
    }
    saveData();
    closeModal();
    render();
  });
  if (item) {
    document.getElementById('deletePoolBtn').addEventListener('click', () => {
      if (!confirm('이 키워드를 삭제할까요?')) return;
      db.tagPool = db.tagPool.filter((t) => t.id !== item.id);
      saveData();
      closeModal();
      render();
    });
  }
}

function tagFormHtml(kind, item) {
  const isEdit = !!item;
  const kindLabel = kind === 'location' ? '위치 키워드' : '시술질환 키워드';
  return `
  <h3>${esc(kindLabel)} ${isEdit ? '수정' : '추가'}</h3>
  <form id="tagForm">
    <label>키워드
      <input type="text" name="keyword" required value="${isEdit ? esc(item.keyword) : ''}" placeholder="${kind === 'location' ? '예: 강남역' : '예: 임플란트'}">
    </label>
    <div class="modal-actions">
      ${isEdit ? `<button type="button" class="danger-btn" id="deleteTagBtn">삭제</button>` : `<span></span>`}
      <div class="modal-actions-right">
        <button type="button" class="ghost-btn" data-action="close-modal">취소</button>
        <button type="submit" class="primary-btn">저장</button>
      </div>
    </div>
  </form>`;
}

function openTagForm(hospitalId, kind, item) {
  openModal(tagFormHtml(kind, item));
  const form = document.getElementById('tagForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const keyword = String(fd.get('keyword') || '').trim();
    if (!keyword) return;
    if (item) {
      item.keyword = keyword;
    } else {
      db.tagPool.push({ id: uuid(), hospitalId, kind, keyword, volume: null, docs: null, gap: null, createdAt: Date.now() });
    }
    saveData();
    closeModal();
    render();
  });
  if (item) {
    document.getElementById('deleteTagBtn').addEventListener('click', () => {
      if (!confirm('이 키워드를 삭제할까요?')) return;
      db.tagPool = db.tagPool.filter((t) => t.id !== item.id);
      saveData();
      closeModal();
      render();
    });
  }
}

/* ==================== 이벤트 처리 ==================== */

function handleAddTask(type) {
  const hospital = getHospital(state.hospitalId);
  if (!hospital) return;
  const anchor = getCurrentCycleAnchor(hospital, today);
  const isCurrentCycle = state.year === anchor.year && state.month === anchor.month;
  let deadline;
  if (isCurrentCycle) {
    deadline = TODAY_STR;
  } else {
    const { start } = getCycleRange(hospital, state.year, state.month);
    deadline = fmtDateStr(start);
  }
  const isReceipt = type === 'receipt';
  const newTask = {
    id: uuid(),
    hospitalId: state.hospitalId,
    type: TYPE_KEYS.includes(type) ? type : 'brandBlog',
    keyword: isReceipt ? null : '',
    keywordVolume: null,
    keywordDocs: null,
    keywordGap: null,
    deadline,
    status: '작성 전',
    publishedDate: null,
    publishedUrl: '',
    performance: '',
    createdAt: Date.now(),
  };
  db.tasks.push(newTask);
  saveData();
  if (supabaseClient) syncSupabaseTask(newTask);
  render();
}

function handleTrackerChange(e) {
  const field = e.target.dataset.field;
  if (!field) return;
  const tr = e.target.closest('tr');
  const task = db.tasks.find((t) => t.id === tr.dataset.taskId);
  if (!task) return;
  if (field === 'type') {
    task.type = e.target.value;
    if (task.type === 'receipt') {
      task.keyword = null;
      task.keywordVolume = null;
      task.keywordDocs = null;
      task.keywordGap = null;
    }
  } else if (field === 'status') {
    task.status = e.target.value;
    if (isPublishedStatus(task.status)) {
      if (!task.publishedDate) task.publishedDate = TODAY_STR;
    } else {
      task.publishedDate = null;
    }
  } else if (field === 'publishedDate') {
    task.publishedDate = e.target.value || null;
  } else if (field === 'keywordVolume' || field === 'keywordDocs') {
    const val = e.target.value;
    task[field] = val === '' ? null : Math.max(0, Number(val));
  } else {
    task[field] = e.target.value;
  }
  saveData();
  if (supabaseClient) syncSupabaseTask(task);
  render();
}

function handleTrackerClick(e) {
  const delBtn = e.target.closest('[data-action="delete-task"]');
  if (delBtn) {
    const tr = delBtn.closest('tr');
    const id = tr.dataset.taskId;
    if (!confirm('이 작업 항목을 삭제할까요?')) return;
    db.tasks = db.tasks.filter((t) => t.id !== id);
    saveData();
    if (supabaseClient) syncSupabaseTaskDelete(id);
    render();
    return;
  }
  const kwBtn = e.target.closest('[data-action="edit-keyword"]');
  if (kwBtn) {
    const tr = kwBtn.closest('tr');
    const task = db.tasks.find((t) => t.id === tr.dataset.taskId);
    if (task) openKeywordForm(task);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) { /* noop */ }
  document.body.removeChild(ta);
}

function copyToClipboard(text) {
  if (!text) return;
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function exportDataFile() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `naver-tracker-backup-${TODAY_STR}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function generatePdfReportHtml(hospital, year, month) {
  const ymKey = monthKey(year, month);
  const quota = getEffectiveQuota(hospital, ymKey);
  const cycleText = cycleLabel(hospital, year, month);
  const word = periodWord(hospital, year, month);
  const tasks = getTasksForCycle(hospital, year, month);

  // Quotas
  const brandBlogQuota = Number(quota.brandBlog) || 0;
  const pressQuota = Number(quota.press) || 0;
  const receiptQuota = Number(quota.receipt) || 0;
  const totalQuota = brandBlogQuota + pressQuota + receiptQuota;

  // Actual Completed Tasks
  const brandBlogDone = getCompletedCount(hospital, year, month, 'brandBlog');
  const pressDone = getCompletedCount(hospital, year, month, 'press');
  const receiptDone = getCompletedCount(hospital, year, month, 'receipt');
  const totalDone = brandBlogDone + pressDone + receiptDone;

  const totalPct = totalQuota > 0 ? Math.min(100, Math.round((totalDone / totalQuota) * 100)) : (totalDone > 0 ? 100 : 0);
  const brandBlogPct = brandBlogQuota > 0 ? Math.min(100, Math.round((brandBlogDone / brandBlogQuota) * 100)) : (brandBlogDone > 0 ? 100 : 0);
  const pressPct = pressQuota > 0 ? Math.min(100, Math.round((pressDone / pressQuota) * 100)) : (pressDone > 0 ? 100 : 0);
  const receiptPct = receiptQuota > 0 ? Math.min(100, Math.round((receiptDone / receiptQuota) * 100)) : (receiptDone > 0 ? 100 : 0);

  // Performance Highlights (영수증 리뷰는 성과 카운팅 및 성과율에서 완전 제외)
  const brandBlogPerfCount = tasks.filter(t => t.type === 'brandBlog' && t.performance && t.performance.trim()).length;
  const pressPerfCount = tasks.filter(t => t.type === 'press' && t.performance && t.performance.trim()).length;

  // SEO(성과) 대상 발행 건수: 브랜드 블로그 + 기자단 (영수증 리뷰 제외)
  const seoDone = brandBlogDone + pressDone;
  const seoPerfCount = brandBlogPerfCount + pressPerfCount;
  const seoPerfPct = seoDone > 0 ? Math.min(100, Math.round((seoPerfCount / seoDone) * 100)) : (seoPerfCount > 0 ? 100 : 0);

  const perfTasks = tasks.filter(t => t.type !== 'receipt' && t.performance && t.performance.trim());

  // Sort tasks by publishedDate or deadline
  const sortedTasks = tasks.slice().sort((a, b) => {
    const aDate = a.publishedDate || a.deadline || '';
    const bDate = b.publishedDate || b.deadline || '';
    return aDate.localeCompare(bDate);
  });

  const taskRowsHtml = sortedTasks.length > 0
    ? sortedTasks.map(t => {
        const typeMeta = TYPE_META[t.type] || TYPE_META.brandBlog;
        const typeLabel = typeMeta.label;
        const dateStr = t.publishedDate ? t.publishedDate : (t.deadline ? `${t.deadline} (마감)` : '-');
        
        let urlHtml = '-';
        if (t.publishedUrl && t.publishedUrl.trim()) {
          const u = esc(t.publishedUrl.trim());
          urlHtml = `<a href="${u}" target="_blank" rel="noopener noreferrer" class="url-link">${u}</a>`;
        }

        let perfHtml = '-';
        if (t.type === 'receipt') {
          perfHtml = `<span style="color:#ADB5BD; font-size:11px;">- (성과 평가 제외)</span>`;
        } else if (t.performance && t.performance.trim()) {
          perfHtml = `<span class="perf-highlight">🏆 ${esc(t.performance.trim())}</span>`;
        }

        let kwDisplay = esc(t.keyword || '');
        if (!kwDisplay) {
          kwDisplay = t.type === 'receipt' ? '영수증 리뷰' : '(미지정)';
        }

        return `
        <tr>
          <td><strong class="kw-title">${kwDisplay}</strong>${t.topicText ? `<div class="topic-sub">${esc(t.topicText)}</div>` : ''}</td>
          <td><span class="badge-type badge-${t.type}">${typeLabel}</span></td>
          <td class="date-cell">${esc(dateStr)}</td>
          <td>${urlHtml}</td>
          <td>${perfHtml}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="5" style="text-align:center; padding: 24px; color: #868E96;">이번 주기에 등록된 작업 항목이 없습니다.</td></tr>`;

  const perfChipsHtml = perfTasks.length > 0
    ? perfTasks.map(t => `<div class="perf-chip"><strong>${esc(t.keyword || TYPE_META[t.type].label)}</strong>: ${esc(t.performance)}</div>`).join('')
    : `<span style="color:#868E96; font-size:11.5px;">등록된 주요 성과 항목이 아직 없습니다.</span>`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>Dr.NAEO 마케팅 성과 보고서 - ${esc(hospital.name)} (${word})</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<style>
  @page {
    size: A4 portrait;
    margin: 12mm 15mm;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Pretendard Variable", Pretendard, -apple-system, sans-serif;
    color: #17181C;
    background: #FFFFFF;
    font-size: 12px;
    line-height: 1.5;
    word-break: keep-all;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .no-print-bar {
    position: sticky;
    top: 0;
    left: 0;
    right: 0;
    background: #0E1015;
    color: #FFFFFF;
    padding: 12px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 4px 14px rgba(0,0,0,0.25);
    z-index: 9999;
  }
  .no-print-info {
    font-size: 13.5px;
    font-weight: 700;
    color: #37D67F;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .no-print-actions {
    display: flex;
    gap: 8px;
  }
  .no-print-btn {
    background: #12A35C;
    color: #FFFFFF;
    border: none;
    border-radius: 6px;
    padding: 8px 18px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .no-print-btn:hover { background: #0FB864; transform: translateY(-1px); }
  .no-print-btn.close-btn { background: #333742; }
  .no-print-btn.close-btn:hover { background: #495057; }

  @media print {
    .no-print-bar { display: none !important; }
    body { padding: 0 !important; background: #FFF !important; }
    .report-wrapper { padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
  }

  .report-wrapper {
    max-width: 820px;
    margin: 20px auto;
    padding: 32px 28px;
    background: #FFFFFF;
  }

  /* Brand Header */
  .report-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 2.5px solid #12A35C;
    padding-bottom: 18px;
    margin-bottom: 24px;
  }
  .brand-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .brand-logo-svg {
    width: 38px;
    height: 38px;
  }
  .brand-title-wrap {
    display: flex;
    flex-direction: column;
  }
  .brand-name {
    font-size: 24px;
    font-weight: 400;
    color: #17181C;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  .brand-name b { font-weight: 800; color: #12A35C; }
  .brand-sub {
    font-size: 11px;
    color: #6E6E78;
    margin-top: 3px;
    font-weight: 500;
  }
  .report-meta {
    text-align: right;
  }
  .report-main-title {
    font-size: 18px;
    font-weight: 800;
    color: #17181C;
  }
  .report-date-badge {
    font-size: 11.5px;
    color: #6E6E78;
    margin-top: 4px;
  }

  /* Summary Cards */
  .meta-card-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    margin-bottom: 24px;
  }
  .meta-card {
    background: #F8F9FA;
    border: 1px solid #E9ECEF;
    border-radius: 12px;
    padding: 16px 18px;
  }
  .meta-card-title {
    font-size: 11.5px;
    color: #6E6E78;
    font-weight: 600;
    margin-bottom: 6px;
  }
  .meta-card-value {
    font-size: 20px;
    font-weight: 800;
    color: #17181C;
    line-height: 1.2;
  }
  .meta-card-sub {
    font-size: 11px;
    color: #12A35C;
    font-weight: 700;
    margin-top: 4px;
  }

  /* Section Title */
  .section-title {
    font-size: 15px;
    font-weight: 800;
    color: #17181C;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .section-title::before {
    content: '';
    display: inline-block;
    width: 4.5px;
    height: 15px;
    background: #12A35C;
    border-radius: 2px;
  }

  /* Breakdown Table */
  .quota-summary-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 24px;
    font-size: 12px;
  }
  .quota-summary-table th, .quota-summary-table td {
    padding: 10px 14px;
    border: 1px solid #E9ECEF;
    text-align: center;
  }
  .quota-summary-table th {
    background: #F1F3F5;
    font-weight: 700;
    color: #495057;
  }
  .quota-summary-table td {
    background: #FFFFFF;
  }

  .progress-bg {
    background: #E9ECEF;
    border-radius: 6px;
    height: 8px;
    width: 100%;
    overflow: hidden;
    margin-top: 4px;
  }
  .progress-fill {
    background: #12A35C;
    height: 100%;
    border-radius: 6px;
  }

  /* Performance Summary Box */
  .perf-summary-box {
    background: #F8F9FA;
    border: 1px solid #E9ECEF;
    border-left: 4.5px solid #12A35C;
    padding: 14px 18px;
    border-radius: 0 10px 10px 0;
    margin-bottom: 28px;
  }
  .perf-chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }
  .perf-chip {
    background: #FFFFFF;
    border: 1px solid #CED4DA;
    border-radius: 20px;
    padding: 5px 12px;
    font-size: 11px;
    color: #212529;
  }
  .perf-chip strong {
    color: #12A35C;
  }

  /* Main Task Table */
  .task-report-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 28px;
    font-size: 11.5px;
  }
  .task-report-table th {
    background: #0E1015;
    color: #FFFFFF;
    padding: 11px 14px;
    text-align: left;
    font-size: 11.5px;
    font-weight: 700;
  }
  .task-report-table td {
    padding: 10px 14px;
    border-bottom: 1px solid #E9ECEF;
    vertical-align: middle;
  }
  .task-report-table tr:nth-child(even) td {
    background: #F8F9FA;
  }
  .kw-title {
    font-size: 12px;
    color: #17181C;
    font-weight: 700;
  }
  .topic-sub {
    font-size: 11px;
    color: #6E6E78;
    margin-top: 2px;
  }
  .date-cell {
    white-space: nowrap;
    color: #495057;
  }
  .badge-type {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 10.5px;
    font-weight: 800;
    white-space: nowrap;
  }
  .badge-brandBlog { background: rgba(55,214,127,0.15); color: #0E8A57; }
  .badge-press { background: rgba(78,162,233,0.15); color: #2B72C4; }
  .badge-receipt { background: rgba(240,165,0,0.15); color: #C77800; }

  .url-link {
    color: #2B72C4;
    text-decoration: none;
    font-size: 11px;
    word-break: break-all;
  }

  .perf-highlight {
    display: inline-block;
    background: #E6FCF5;
    color: #0CA678;
    border: 1px solid #96F2D7;
    padding: 3px 8px;
    border-radius: 6px;
    font-weight: 700;
    font-size: 11px;
  }

  /* Footer */
  .report-footer {
    text-align: center;
    border-top: 1px solid #E9ECEF;
    padding-top: 18px;
    color: #868E96;
    font-size: 11px;
    margin-top: 36px;
  }
  .report-footer b { color: #12A35C; }
</style>
</head>
<body>

<div class="no-print-bar">
  <div class="no-print-info">
    <span>📄 Dr.NAEO 마케팅 성과 보고서 미리보기</span>
  </div>
  <div class="no-print-actions">
    <button class="no-print-btn" onclick="window.print();">🖨️ PDF로 저장 / 인쇄하기</button>
    <button class="no-print-btn close-btn" onclick="window.close();">✖ 닫기</button>
  </div>
</div>

<div class="report-wrapper">
  <header class="report-header">
    <div class="brand-group">
      <svg class="brand-logo-svg" viewBox="0 0 24 24">
        <defs>
          <path id="tri_pdf" d="M12 2.2c1.5 0 2.7.8 3.5 2.2l4.8 8.3c.8 1.4.9 2.9.1 4.2-.8 1.3-2.1 2-3.7 2H7.3c-1.6 0-2.9-.7-3.7-2-.8-1.3-.7-2.8.1-4.2l4.8-8.3C9.3 3 10.5 2.2 12 2.2z"/>
          <clipPath id="tc_pdf"><use href="#tri_pdf"/></clipPath>
          <radialGradient id="wg1_pdf" cx="30%" cy="24%" r="75%"><stop offset="0%" stop-color="#37D67F"/><stop offset="100%" stop-color="#37D67F" stop-opacity="0"/></radialGradient>
          <radialGradient id="wg2_pdf" cx="76%" cy="30%" r="80%"><stop offset="0%" stop-color="#0FB864"/><stop offset="100%" stop-color="#0FB864" stop-opacity="0"/></radialGradient>
          <radialGradient id="wg3_pdf" cx="28%" cy="80%" r="85%"><stop offset="0%" stop-color="#0E8A57"/><stop offset="100%" stop-color="#0E8A57" stop-opacity="0"/></radialGradient>
          <radialGradient id="wg4_pdf" cx="80%" cy="78%" r="85%"><stop offset="0%" stop-color="#0B6E43"/><stop offset="100%" stop-color="#0B6E43" stop-opacity="0"/></radialGradient>
        </defs>
        <g clip-path="url(#tc_pdf)">
          <rect width="24" height="24" fill="#12A35C"/>
          <rect width="24" height="24" fill="url(#wg4_pdf)"/>
          <rect width="24" height="24" fill="url(#wg3_pdf)"/>
          <rect width="24" height="24" fill="url(#wg2_pdf)"/>
          <rect width="24" height="24" fill="url(#wg1_pdf)"/>
          <circle cx="8" cy="9" r="4.5" fill="#37D67F" opacity=".28"/>
          <circle cx="16.5" cy="15" r="5" fill="#0B6E43" opacity=".3"/>
          <circle cx="13" cy="7.5" r="3" fill="#5FE49A" opacity=".22"/>
        </g>
      </svg>
      <div class="brand-title-wrap">
        <span class="brand-name">Dr.<b>NAEO</b></span>
        <span class="brand-sub">의사가 직접 쓰는 네이버 마케팅</span>
      </div>
    </div>
    <div class="report-meta">
      <div class="report-main-title">네이버 마케팅 성과 보고서</div>
      <div class="report-date-badge">${esc(hospital.name)} · ${esc(cycleText)}</div>
    </div>
  </header>

  <!-- Summary Grid -->
  <div class="meta-card-grid">
    <div class="meta-card">
      <div class="meta-card-title">이번 주기 목표 할당량</div>
      <div class="meta-card-value">${totalQuota}건</div>
      <div class="meta-card-sub">블로그 ${brandBlogQuota} | 기자단 ${pressQuota} | 영수증 ${receiptQuota}</div>
    </div>
    <div class="meta-card">
      <div class="meta-card-value">${totalDone}건 <span style="font-size:13px; font-weight:700; color:#12A35C;">(${totalPct}%)</span></div>
      <div class="meta-card-title" style="margin-top:6px;">총 발행 완료량 (목표 달성률)</div>
      <div class="progress-bg"><div class="progress-fill" style="width: ${totalPct}%;"></div></div>
    </div>
    <div class="meta-card">
      <div class="meta-card-value">${seoPerfCount}건 ${seoDone > 0 ? `<span style="font-size:13px; font-weight:700; color:#12A35C;">(${seoPerfPct}%)</span>` : ''}</div>
      <div class="meta-card-title" style="margin-top:6px;">주요 노출 성과율 (영수증 제외)</div>
      <div class="meta-card-sub">블로그·기자단(${seoDone}건) 중 상위노출 성과</div>
    </div>
  </div>

  <!-- Section 1: Quota Breakdown -->
  <div class="section-title">이번 주기 항목별 발행 & 성과 현황</div>
  <table class="quota-summary-table">
    <thead>
      <tr>
        <th>항목 구분</th>
        <th>목표 할당량</th>
        <th>실제 발행량</th>
        <th>발행 달성률</th>
        <th>주요 성과 건수</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>브랜드 블로그</strong></td>
        <td>${brandBlogQuota}건</td>
        <td>${brandBlogDone}건</td>
        <td><strong>${brandBlogPct}%</strong></td>
        <td>${brandBlogPerfCount > 0 ? `<span class="perf-highlight" style="font-size:11px; padding:2px 7px;">🏆 ${brandBlogPerfCount}건</span>` : '-'}</td>
      </tr>
      <tr>
        <td><strong>기자단</strong></td>
        <td>${pressQuota}건</td>
        <td>${pressDone}건</td>
        <td><strong>${pressPct}%</strong></td>
        <td>${pressPerfCount > 0 ? `<span class="perf-highlight" style="font-size:11px; padding:2px 7px;">🏆 ${pressPerfCount}건</span>` : '-'}</td>
      </tr>
      <tr>
        <td><strong>영수증 리뷰</strong></td>
        <td>${receiptQuota}건</td>
        <td>${receiptDone}건</td>
        <td><strong>${receiptPct}%</strong></td>
        <td><span style="color:#ADB5BD; font-size:11px;">- (성과 평가 제외)</span></td>
      </tr>
    </tbody>
  </table>

  <!-- Section 2: Performance Highlights -->
  <div class="section-title">주요 성과 요약 (영수증 리뷰 제외)</div>
  <div class="perf-summary-box">
    <div style="font-weight:700; font-size:12px; color:#17181C;">🏆 블로그·기자단 주요 키워드 노출 & 랭킹 성과</div>
    <div class="perf-chip-list">
      ${perfChipsHtml}
    </div>
  </div>

  <!-- Section 3: Task Details Table -->
  <div class="section-title">작업 상세 내역</div>
  <table class="task-report-table">
    <thead>
      <tr>
        <th style="width: 25%;">키워드</th>
        <th style="width: 15%;">항목종류</th>
        <th style="width: 15%;">발행일</th>
        <th style="width: 25%;">URL</th>
        <th style="width: 20%;">성과</th>
      </tr>
    </thead>
    <tbody>
      ${taskRowsHtml}
    </tbody>
  </table>

  <footer class="report-footer">
    <b>Dr.NAEO</b> · 의사가 직접 쓰는 네이버 마케팅 &nbsp;|&nbsp; 보고서 생성일: ${TODAY_STR}
  </footer>
</div>

<script>
  window.addEventListener('load', function() {
    setTimeout(function() {
      window.print();
    }, 400);
  });
</script>
</body>
</html>`;
}

function exportHospitalPdfReport(hospital, year, month) {
  if (!hospital) return;
  const reportHtml = generatePdfReportHtml(hospital, year, month);
  const printWin = window.open('', '_blank', 'width=1000,height=900,scrollbars=yes,resizable=yes');
  if (!printWin) {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(reportHtml);
    iframe.contentDocument.close();
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 2000);
    }, 400);
    return;
  }
  printWin.document.open();
  printWin.document.write(reportHtml);
  printWin.document.close();
}

function importDataFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || !Array.isArray(parsed.hospitals)) throw new Error('invalid');
      if (!confirm('현재 데이터를 가져온 파일 내용으로 덮어씁니다. 계속할까요?')) return;
      db = {
        hospitals: Array.isArray(parsed.hospitals) ? parsed.hospitals : [],
        quotaOverrides: parsed.quotaOverrides && typeof parsed.quotaOverrides === 'object' ? parsed.quotaOverrides : {},
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        tagPool: Array.isArray(parsed.tagPool) ? parsed.tagPool : [],
      };
      saveData();
      state = { view: 'list', hospitalId: null, year: today.getFullYear(), month: today.getMonth() + 1 };
      render();
      alert('가져오기가 완료되었습니다.');
    } catch (err) {
      alert('올바른 백업 파일이 아닙니다.');
    }
  };
  reader.readAsText(file);
}

function attachListeners() {
  const tbody = document.getElementById('trackerTbody');
  if (tbody) {
    tbody.addEventListener('change', handleTrackerChange);
    tbody.addEventListener('click', handleTrackerClick);
    attachTaskReordering(tbody);
  }
  const sortSelect = document.getElementById('trackerSortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('click', (e) => e.stopPropagation());
    sortSelect.addEventListener('change', (e) => {
      state.trackerSortMode = e.target.value === 'type' ? 'type' : 'deadline';
      render();
    });
  }
}

function attachTaskReordering(tbody) {
  let pressTimer = null;
  let pressedRow = null;
  let draggingRow = null;
  let activePointerId = null;
  let suppressNextClick = false;
  let startX = 0;
  let startY = 0;

  const clearPress = () => {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
    pressedRow = null;
  };

  tbody.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // 삭제 버튼이나 입력/선택 요소를 누르는 건 줄 옮기기 제스처 대상에서 제외한다.
    // (안 그러면 삭제 버튼을 살짝 오래 누르기만 해도 롱프레스로 오인되어 드래그
    //  모드에 들어가고, 그 다음 클릭이 "삭제" 핸들러까지 가지 못하고 씹혔다)
    if (e.target.closest('button, input, select, a')) return;
    const row = e.target.closest('tr[data-task-id]');
    if (!row) return;
    pressedRow = row;
    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    pressTimer = setTimeout(() => {
      if (pressedRow !== row) return;
      draggingRow = row;
      row.classList.add('is-reordering');
      document.body.classList.add('task-reordering');
      try { tbody.setPointerCapture(activePointerId); } catch (err) { /* unsupported */ }
      if (navigator.vibrate) navigator.vibrate(25);
    }, LONG_PRESS_MS);
  });

  tbody.addEventListener('pointermove', (e) => {
    if (!pressedRow && !draggingRow) return;
    if (!draggingRow) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) clearPress();
      return;
    }
    e.preventDefault();
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('tr[data-task-id]');
    if (!target || target === draggingRow || target.parentElement !== tbody) return;
    const rect = target.getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      tbody.insertBefore(draggingRow, target);
    } else {
      tbody.insertBefore(draggingRow, target.nextSibling);
    }
  });

  const finishReorder = () => {
    clearPress();
    if (!draggingRow) return;
    suppressNextClick = true;
    setTimeout(() => { suppressNextClick = false; }, 500);
    draggingRow.classList.remove('is-reordering');
    document.body.classList.remove('task-reordering');
    try {
      if (activePointerId !== null && tbody.hasPointerCapture(activePointerId)) tbody.releasePointerCapture(activePointerId);
    } catch (err) { /* unsupported */ }
    activePointerId = null;
    draggingRow = null;
    saveCurrentTaskOrder();
  };

  tbody.addEventListener('click', (e) => {
    if (!suppressNextClick) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    suppressNextClick = false;
  }, true);

  tbody.addEventListener('pointerup', finishReorder);
  tbody.addEventListener('pointercancel', finishReorder);
  tbody.addEventListener('pointerleave', () => {
    if (!draggingRow) clearPress();
  });
}

function onAppClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const id = el.dataset.id;

  switch (action) {
    case 'go-list':
      state.view = 'list';
      state.hospitalId = null;
      state.trackerExpanded = false;
      render();
      break;
    case 'filter-home-hospital':
      state.homeHospitalFilter = id || 'all';
      render();
      break;
    case 'open-cloud-db-config':
    case 'open-google-sheet-config':
      openCloudDbConfigModal();
      break;
    case 'export-data':
      exportDataFile();
      break;
    case 'export-pdf-report': {
      const hospital = getHospital(state.hospitalId);
      if (hospital) {
        exportHospitalPdfReport(hospital, state.year, state.month);
      } else {
        alert('보고서를 내보낼 병원을 먼저 선택해주세요.');
      }
      break;
    }
    case 'import-data':
      document.getElementById('importFileInput').click();
      break;
    case 'clear-all-data': {
      if (!confirm('정말로 모든 병원 및 작업 데이터를 초기화(전체 삭제)할까요?\n\n※ 삭제된 데이터는 복구할 수 없으니 필요한 경우 미리 [내보내기]로 백업해 두세요.')) return;
      db = { hospitals: [], quotaOverrides: {}, tasks: [], tagPool: [] };
      taskOrder = {};
      saveData();
      localStorage.removeItem(TASK_ORDER_KEY);
      state.view = 'list';
      state.hospitalId = null;
      state.trackerExpanded = false;
      render();
      alert('모든 데이터가 초기화되었습니다.');
      break;
    }
    case 'toggle-theme':
      currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = currentTheme;
      localStorage.setItem(THEME_KEY, currentTheme);
      render();
      break;
    case 'add-hospital':
      openHospitalForm(null);
      break;
    case 'edit-hospital':
      openHospitalForm(getHospital(id));
      break;
    case 'delete-hospital': {
      const h = getHospital(id);
      if (!h) return;
      if (!confirm(`"${h.name}" 병원과 관련된 모든 작업 기록을 삭제할까요? 되돌릴 수 없습니다.`)) return;
      deleteHospitalCascade(id);
      saveData();
      if (state.hospitalId === id) { state.view = 'list'; state.hospitalId = null; }
      render();
      break;
    }
    case 'open-hospital': {
      const h = getHospital(id);
      const dateAttr = el.dataset.date;
      let targetYear = today.getFullYear();
      let targetMonth = today.getMonth() + 1;
      if (dateAttr && /^\d{4}-\d{2}/.test(dateAttr)) {
        targetYear = parseInt(dateAttr.substring(0, 4), 10);
        targetMonth = parseInt(dateAttr.substring(5, 7), 10);
      }
      state.view = 'detail';
      state.hospitalId = id;
      state.year = targetYear;
      state.month = targetMonth;
      state.pwVisible = false;
      state.trackerExpanded = false;
      render();
      break;
    }
    case 'switch-hospital': {
      state.hospitalId = id;
      state.pwVisible = false;
      state.trackerExpanded = false;
      render();
      break;
    }
    case 'auto-assign-mondays': {
      const h = getHospital(state.hospitalId);
      if (h) {
        if (confirm(`"${h.name}" 병원의 목표 수량(브랜드, 기자단, 영수증)에 맞게 이번달의 월요일 마감일을 자동 분배할까요?`)) {
          autoAssignMondays(h, state.year, state.month);
        }
      }
      break;
    }
    case 'auto-assign-all-mondays': {
      if (confirm(`모든 병원의 목표 수량을 이번달(달력 월) 기준으로 월요일 마감일에 골고루 자동 배정하시겠습니까? (자동 배정 일시중지된 병원은 제외됩니다)`)) {
        autoAssignAllHospitalsMondays(state.year, state.month);
      }
      break;
    }
    case 'toggle-auto-assign-pause': {
      const h = getHospital(id);
      if (h) {
        h.autoAssignPaused = !h.autoAssignPaused;
        saveData();
        render();
      }
      break;
    }
    case 'main-prev-month':
      state.month -= 1;
      if (state.month < 1) { state.month = 12; state.year -= 1; }
      if (state.year < 2026 || (state.year === 2026 && state.month < 6)) {
        state.year = 2026;
        state.month = 6;
      }
      render();
      break;
    case 'main-next-month':
      state.month += 1;
      if (state.month > 12) { state.month = 1; state.year += 1; }
      render();
      break;
    case 'main-today-month':
      state.year = today.getFullYear();
      state.month = today.getMonth() + 1;
      render();
      break;
    case 'prev-week':
      state.weeklyOffset = (state.weeklyOffset || 0) - 1;
      render();
      break;
    case 'next-week':
      state.weeklyOffset = (state.weeklyOffset || 0) + 1;
      render();
      break;
    case 'today-week':
      state.weeklyOffset = 0;
      render();
      break;
    case 'prev-month':
      state.month -= 1;
      if (state.month < 1) { state.month = 12; state.year -= 1; }
      render();
      break;
    case 'next-month':
      state.month += 1;
      if (state.month > 12) { state.month = 1; state.year += 1; }
      render();
      break;
    case 'today-month': {
      const h = getHospital(state.hospitalId);
      const anchor = h ? getCurrentCycleAnchor(h, today) : { year: today.getFullYear(), month: today.getMonth() + 1 };
      state.year = anchor.year;
      state.month = anchor.month;
      render();
      break;
    }
    case 'edit-quota':
      openQuotaForm(getHospital(state.hospitalId), monthKey(state.year, state.month));
      break;
    case 'toggle-pw':
      state.pwVisible = !state.pwVisible;
      render();
      break;
    case 'copy-naver-id': {
      const h = getHospital(state.hospitalId);
      if (h) copyToClipboard(h.naverId || '');
      break;
    }
    case 'copy-naver-pw': {
      const h = getHospital(state.hospitalId);
      if (h) copyToClipboard(h.naverPassword || '');
      break;
    }
    case 'add-task':
      handleAddTask(el.dataset.type || 'brandBlog');
      break;
    case 'toggle-tracker-expand':
      state.trackerExpanded = !state.trackerExpanded;
      render();
      break;
    case 'add-pool-item':
      if (state.hospitalId) openPoolForm(state.hospitalId, null);
      break;
    case 'edit-pool-item': {
      const item = db.tagPool.find((t) => t.id === id);
      if (item) openPoolForm(item.hospitalId, item);
      break;
    }
    case 'delete-pool-item':
      db.tagPool = db.tagPool.filter((t) => t.id !== id);
      saveData();
      render();
      break;
    case 'add-tag-item': {
      const kind = el.dataset.kind;
      if (state.hospitalId && kind) openTagForm(state.hospitalId, kind, null);
      break;
    }
    case 'edit-tag-item': {
      const item = db.tagPool.find((t) => t.id === id);
      if (item) openTagForm(item.hospitalId, item.kind, item);
      break;
    }
    case 'delete-tag-item':
      db.tagPool = db.tagPool.filter((t) => t.id !== id);
      saveData();
      render();
      break;
    case 'close-modal':
      closeModal();
      break;
    default:
      break;
  }
}

document.getElementById('importFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) importDataFile(file);
  e.target.value = '';
});

document.getElementById('app').addEventListener('click', onAppClick);

function closeScreensaver() {
  const root = document.getElementById('screensaverRoot');
  if (!root || !root.firstChild) return;
  root.innerHTML = '';
  document.body.classList.remove('screensaver-active');
  document.removeEventListener('keydown', closeScreensaver);
}

function openScreensaver() {
  const root = document.getElementById('screensaverRoot');
  root.innerHTML = `
    <div class="screensaver" role="dialog" aria-modal="true" aria-label="NAVIRM 화면보호기">
      <div class="screensaver-ambient" aria-hidden="true"></div>
      <div class="screensaver-logo" aria-label="NAVIRM">NAVIRM</div>
      <div class="screensaver-hint">화면을 누르거나 아무 키를 누르면 돌아갑니다</div>
    </div>`;
  document.body.classList.add('screensaver-active');
  root.querySelector('.screensaver').addEventListener('pointerdown', closeScreensaver, { once: true });
  document.addEventListener('keydown', closeScreensaver);
}

document.getElementById('screensaverBtn').addEventListener('click', openScreensaver);

document.addEventListener('keydown', (e) => {
  if (document.getElementById('screensaverRoot').firstChild) return;
  if (e.key !== 'Escape' || !state.trackerExpanded) return;
  state.trackerExpanded = false;
  render();
});

function openCloudDbConfigModal() {
  const isSupabaseActive = !!supabaseClient;
  const isGoogleActive = !isSupabaseActive && !!googleScriptUrl;

  openModal(`
    <div class="google-config-card" style="max-width: 580px;">
      <div class="google-config-header">
        <h3 style="margin-bottom:4px; font-size:17px; font-weight:700;">☁️ 클라우드 DB 연동 설정</h3>
        <p class="helper-text" style="font-size:12.5px; color:var(--text-muted); margin:0;">안정적인 실시간 다중 사용자 협업을 위한 클라우드 DB를 연동합니다.</p>
      </div>

      <div style="margin: 14px 0 16px; padding: 10px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; display:flex; align-items:center; gap:8px;
        ${isSupabaseActive ? 'background:rgba(18,163,92,0.12); color:#0B6B3D; border:1px solid rgba(18,163,92,0.3);' : 
          (isGoogleActive ? 'background:rgba(43,114,196,0.12); color:#1A539B; border:1px solid rgba(43,114,196,0.3);' : 'background:#F1F3F5; color:#495057; border:1px solid #CED4DA;')}">
        <span>현재 가동 모드:</span>
        ${isSupabaseActive ? '🟢 Supabase 실시간 클라우드 DB 가동 중 (0.1초 동기화)' : 
          (isGoogleActive ? '📄 구글 스프레드시트 모드 가동 중' : '⚪ 로컬 브라우저 저장 모드')}
      </div>

      <!-- Tab 1: Supabase (초고속 실시간 DB) -->
      <div style="background:var(--surface-card); border:1.5px solid var(--border); border-radius:10px; padding:16px; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <h4 style="font-size:14px; font-weight:700; color:var(--text); margin:0;">⚡ Supabase (초고속 실시간 PostgreSQL - 강력 권장)</h4>
          <span style="font-size:11px; background:#E8F5E9; color:#2E7D32; font-weight:700; padding:2px 8px; border-radius:12px;">100% 무료</span>
        </div>
        <p style="font-size:12px; color:var(--text-muted); margin-bottom:12px; line-height:1.5;">
          행(Row) 단위로 저장되어 <strong>동시 작업 시 덮어쓰기나 롤백이 100% 차단</strong>되며, 모바일과 PC가 <strong>0.1초 만에 실시간 웹소켓으로 동기화</strong>됩니다.
        </p>

        <form id="supabaseConfigForm">
          <label style="display:block; margin-bottom:10px;">
            <span style="display:block; font-size:12px; font-weight:600; margin-bottom:4px;">Supabase Project URL</span>
            <input type="url" id="supabaseUrlInput" class="cell-input" placeholder="https://xxxxxxxxxxxx.supabase.co" value="${esc(supabaseUrl)}" style="border:1px solid var(--border); padding:8px 10px; width:100%; font-size:12.5px;">
          </label>
          <label style="display:block; margin-bottom:12px;">
            <span style="display:block; font-size:12px; font-weight:600; margin-bottom:4px;">Supabase Anon Public API Key</span>
            <input type="text" id="supabaseKeyInput" class="cell-input" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." value="${esc(supabaseKey)}" style="border:1px solid var(--border); padding:8px 10px; width:100%; font-size:12.5px;">
          </label>
          
          <div style="display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap;">
            <button type="button" class="primary-btn" id="migrateToSupabaseBtn" style="background:#12A35C; font-size:12.5px;">🚀 현재 데이터 1클릭 복사/이전</button>
            <button type="submit" class="primary-btn" style="font-size:12.5px;">Supabase 설정 저장</button>
          </div>
        </form>
      </div>

      <!-- Tab 2: Google Sheets (보조/백업) -->
      <details style="background:var(--surface-page); border:1px solid var(--border); border-radius:10px; padding:12px 16px; margin-bottom:16px;">
        <summary style="font-size:13px; font-weight:600; cursor:pointer; color:var(--text-muted);">📄 구글 스프레드시트 연동 (보조/백업용)</summary>
        <form id="googleConfigForm" style="margin-top:12px;">
          <label style="display:block; margin-bottom:10px;">
            <span style="display:block; font-size:12px; font-weight:600; margin-bottom:4px;">구글 Apps Script 웹 앱 URL</span>
            <input type="url" id="googleScriptUrlInput" class="cell-input" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(googleScriptUrl)}" style="border:1px solid var(--border); padding:8px 10px; width:100%; font-size:12.5px;">
          </label>
          <div style="display:flex; gap:8px; justify-content:flex-end;">
            <button type="button" class="ghost-btn" id="copyAppsScriptCodeBtn" style="font-size:12px;">📋 Apps Script 코드 복사</button>
            <button type="submit" class="primary-btn" style="font-size:12px;">구글 시트 저장</button>
          </div>
        </form>
      </details>

      <div class="form-actions" style="display:flex; justify-content:flex-end;">
        <button type="button" class="ghost-btn" data-action="close-modal">닫기</button>
      </div>
    </div>
  `);

  // Supabase 설정 저장
  const supaForm = document.getElementById('supabaseConfigForm');
  if (supaForm) {
    supaForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newUrl = document.getElementById('supabaseUrlInput').value.trim();
      const newKey = document.getElementById('supabaseKeyInput').value.trim();
      supabaseUrl = newUrl;
      supabaseKey = newKey;
      localStorage.setItem(SUPABASE_URL_KEY, newUrl);
      localStorage.setItem(SUPABASE_KEY_KEY, newKey);
      
      if (newUrl && newKey) {
        initSupabaseClient();
        if (supabaseClient) {
          const freshData = await fetchSupabaseData();
          if (freshData && freshData.hospitals && freshData.hospitals.length > 0) {
            db = freshData;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
            setupSupabaseRealtime();
            render();
            alert('🎉 Supabase 클라우드 DB 연결 성공! 실시간 0.1초 동기화가 활성화되었습니다.');
          } else {
            alert('Supabase에 연결되었습니다! 테이블이 비어있다면 [현재 데이터 1클릭 복사/이전] 버튼을 눌러 데이터를 넣어주세요.');
          }
        }
      } else {
        supabaseClient = null;
        alert('Supabase 연결이 해제되었습니다.');
      }
      closeModal();
      render();
    });
  }

  // 1클릭 마이그레이션 버튼
  const migrateBtn = document.getElementById('migrateToSupabaseBtn');
  if (migrateBtn) {
    migrateBtn.addEventListener('click', async () => {
      const urlVal = document.getElementById('supabaseUrlInput').value.trim();
      const keyVal = document.getElementById('supabaseKeyInput').value.trim();
      if (!urlVal || !keyVal) {
        alert('Supabase URL과 Key를 먼저 입력해주세요.');
        return;
      }
      supabaseUrl = urlVal;
      supabaseKey = keyVal;
      localStorage.setItem(SUPABASE_URL_KEY, urlVal);
      localStorage.setItem(SUPABASE_KEY_KEY, keyVal);
      initSupabaseClient();

      if (!supabaseClient) {
        alert('Supabase 클라이언트를 생성할 수 없습니다. URL과 Key를 확인하세요.');
        return;
      }

      if (!confirm(`현재 트래커 데이터 (병원 ${db.hospitals.length}곳, 작업 ${db.tasks.length}건)를 Supabase로 복사하시겠습니까?\n\n(※ 중요: Supabase SQL Editor에서 supabase_schema.sql 스크립트가 먼저 실행되어 있어야 합니다)`)) {
        return;
      }

      migrateBtn.disabled = true;
      migrateBtn.textContent = '⏳ 데이터 이전 중...';

      try {
        // 1. Hospitals
        const hRows = db.hospitals.map(h => ({
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
        if (hRows.length) await supabaseClient.from('hospitals').upsert(hRows);

        // 2. Tasks
        const tRows = db.tasks.map(t => ({
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
        for (let i = 0; i < tRows.length; i += 100) {
          await supabaseClient.from('tasks').upsert(tRows.slice(i, i + 100));
        }

        // 3. Quota Overrides
        const qRows = Object.keys(db.quotaOverrides || {}).map(k => {
          const q = db.quotaOverrides[k] || {};
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
        if (qRows.length) await supabaseClient.from('quota_overrides').upsert(qRows);

        // 4. Tag Pool
        const pRows = (db.tagPool || []).map(p => ({
          id: p.id,
          hospital_id: p.hospitalId,
          kind: p.kind,
          text: p.text || p.keyword || ''
        }));
        if (pRows.length) await supabaseClient.from('tag_pool').upsert(pRows);

        setupSupabaseRealtime();
        alert('🎉 성공! 모든 데이터가 Supabase로 완벽하게 이전되었습니다.\n이제부터 초고속 실시간 DB로 동작합니다!');
        closeModal();
        render();
      } catch (err) {
        console.error('Supabase 이전 오류:', err);
        alert('❌ 데이터 이전 중 오류가 발생했습니다: ' + err.message + '\n\nSupabase SQL Editor에서 supabase_schema.sql을 먼저 실행했는지 확인해주세요.');
      } finally {
        migrateBtn.disabled = false;
        migrateBtn.textContent = '🚀 현재 데이터 1클릭 복사/이전';
      }
    });
  }

  // Google Sheets 설정 저장
  const googleForm = document.getElementById('googleConfigForm');
  if (googleForm) {
    googleForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const newUrl = document.getElementById('googleScriptUrlInput').value.trim();
      googleScriptUrl = newUrl;
      localStorage.setItem(GOOGLE_SCRIPT_URL_KEY, newUrl);
      closeModal();
      if (newUrl) {
        pushRemoteState(db);
        alert('구글 시트 연동 URL이 저장되었습니다.');
      } else {
        alert('구글 시트 연동 URL이 해제되었습니다.');
      }
      render();
    });
  }

  const copyBtn = document.getElementById('copyAppsScriptCodeBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      copyToClipboard(googleAppsScriptSourceCode);
      alert('Apps Script 코드가 복사되었습니다.');
    });
  }
}

function openGoogleSheetConfigModal() {
  openCloudDbConfigModal();
}

const googleAppsScriptSourceCode = `/** @OnlyCurrentDoc */

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
    return \`\${y}-\${m}-\${d}\`;
  }
  const str = String(val).trim();
  if (/^\\d{4}-\\d{2}-\\d{2}/.test(str)) return str.substring(0, 10);
  const parsedDate = new Date(str);
  if (!isNaN(parsedDate.getTime())) {
    const y = parsedDate.getFullYear();
    const m = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const d = String(parsedDate.getDate()).padStart(2, '0');
    return \`\${y}-\${m}-\${d}\`;
  }
  return str;
}

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const data = buildDataFromTabularSheets(ss);
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok', data: data, updated_at: new Date().toISOString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const contents = e.postData.contents;
    if (!contents) throw new Error('empty payload');
    const parsed = JSON.parse(contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    updateTabularSheets(ss, parsed);
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok', updated_at: new Date().toISOString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function updateTabularSheets(ss, db) {
  if (!db || typeof db !== 'object') return;
  const hospitals = Array.isArray(db.hospitals) ? db.hospitals : [];
  let hSheet = ss.getSheetByName(SHEET_HOSPITALS);
  if (!hSheet) hSheet = ss.insertSheet(SHEET_HOSPITALS);
  hSheet.clearContents();
  const hHeaders = ['ID', '병원명', '브랜드블로그 목표', '기자단 목표', '영수증리뷰 목표', '주기 시작일', '네이버 ID', '네이버 비밀번호', '블로그 URL', '지도 URL', '일시정지 여부'];
  const hRows = [hHeaders];
  hospitals.forEach(h => {
    const q = h.defaultQuota || {};
    hRows.push([h.id||'', h.name||'', q.brandBlog||0, q.press||0, q.receipt||0, h.cycleStartDay||1, h.naverId||'', h.naverPassword||'', h.naverBlogUrl||'', h.naverMapUrl||'', h.autoAssignPaused ? '일시정지' : '정상']);
  });
  hSheet.getRange(1, 1, hRows.length, hHeaders.length).setValues(hRows);

  const tasks = Array.isArray(db.tasks) ? db.tasks : [];
  let tSheet = ss.getSheetByName(SHEET_TASKS);
  if (!tSheet) tSheet = ss.insertSheet(SHEET_TASKS);
  tSheet.clearContents();
  const tHeaders = ['ID', '병원ID', '발행 종류', '키워드', '글감(텍스트)', '마감일', '진행상황', '발행일', '검색량', '발행량', '성과'];
  const tRows = [tHeaders];
  tasks.forEach(t => {
    const typeLabel = t.type === 'brandBlog' ? '브랜드 블로그' : (t.type === 'press' ? '기자단' : (t.type === 'receipt' ? '영수증 리뷰' : t.type));
    tRows.push([t.id||'', t.hospitalId||'', typeLabel, t.keyword||'', t.topicText||'', formatDateVal(t.deadline), t.status||'', formatDateVal(t.publishedDate), t.keywordVolume ?? '', t.keywordDocs ?? '', t.performance||'']);
  });
  hSheet.getRange(1, 1, tRows.length, tHeaders.length).setValues(tRows);
}

function buildDataFromTabularSheets(ss) {
  const hospitals = [];
  const hSheet = ss.getSheetByName(SHEET_HOSPITALS);
  if (hSheet && hSheet.getLastRow() > 1) {
    const hVals = hSheet.getRange(2, 1, hSheet.getLastRow() - 1, 11).getValues();
    hVals.forEach(r => {
      if (r[0]) {
        hospitals.push({
          id: String(r[0]), name: String(r[1]),
          defaultQuota: { brandBlog: Number(r[2])||0, press: Number(r[3])||0, receipt: Number(r[4])||0 },
          cycleStartDay: Number(r[5])||1, naverId: String(r[6]||''), naverPassword: String(r[7]||''),
          naverBlogUrl: String(r[8]||''), naverMapUrl: String(r[9]||''), autoAssignPaused: String(r[10]) === '일시정지'
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
          id: String(r[0]), hospitalId: String(r[1]||''), type, keyword: String(r[3]||''), topicText: String(r[4]||''),
          deadline: formatDateVal(r[5]), status: String(r[6]||'시작 전'), publishedDate: r[7] ? formatDateVal(r[7]) : null,
          keywordVolume: r[8] !== '' ? Number(r[8]) : null, keywordDocs: r[9] !== '' ? Number(r[9]) : null, performance: String(r[10]||'')
        });
      }
    });
  }
  return { hospitals, tasks, quotaOverrides: {}, tagPool: [] };
}`;

const CURRENT_CACHE_VERSION = 'v20261012_02';
const CACHE_VERSION_KEY = 'medigo_naver_tracker_cache_version';

(async function bootstrap() {
  const savedVersion = localStorage.getItem(CACHE_VERSION_KEY);
  if (savedVersion !== CURRENT_CACHE_VERSION) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(CACHE_VERSION_KEY, CURRENT_CACHE_VERSION);
  }
  await showPasscodeGate();
  document.getElementById('app').innerHTML = `<div class="boot-loading">불러오는 중…</div>`;
  db = await loadInitialData();
  render();
  startRemoteSyncPolling();
})();
