-- ==============================================================================
-- MEDI GO ROUND - 네이버 마케팅 트래커 Supabase PostgreSQL 스키마
-- [적용 방법]
-- 1. Supabase 대시보드 (https://supabase.com/dashboard) 로그인
-- 2. 새 프로젝트 생성 (지역: Seoul / ap-northeast-2 권장)
-- 3. 좌측 메뉴 [SQL Editor] 클릭 -> [New Query] 클릭
-- 4. 아래 스크립트 전체를 복사하여 붙여넣고 [Run] 실행!
-- ==============================================================================

-- 1. 기존 테이블 정리 (필요시)
DROP TABLE IF EXISTS tag_pool CASCADE;
DROP TABLE IF EXISTS quota_overrides CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS hospitals CASCADE;

-- 2. 병원 테이블 (hospitals)
CREATE TABLE hospitals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  default_quota JSONB DEFAULT '{"brandBlog": 0, "press": 0, "receipt": 0}'::jsonb,
  naver_id TEXT DEFAULT '',
  naver_password TEXT DEFAULT '',
  naver_blog_url TEXT DEFAULT '',
  naver_map_url TEXT DEFAULT '',
  cycle_start_day INTEGER DEFAULT 1,
  auto_assign_paused BOOLEAN DEFAULT FALSE,
  interleave_types BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 작업 항목 테이블 (tasks)
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  hospital_id TEXT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'brandBlog',
  keyword TEXT DEFAULT '',
  topic_text TEXT DEFAULT '',
  deadline TEXT DEFAULT '',
  status TEXT DEFAULT '시작 전',
  published_date TEXT,
  published_url TEXT DEFAULT '',
  keyword_volume NUMERIC,
  keyword_docs NUMERIC,
  keyword_gap NUMERIC,
  performance TEXT DEFAULT '',
  created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성 (성능 최적화)
CREATE INDEX idx_tasks_hospital_id ON tasks(hospital_id);
CREATE INDEX idx_tasks_deadline ON tasks(deadline);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_type ON tasks(type);

-- 4. 월별 할당량 예외 테이블 (quota_overrides)
CREATE TABLE quota_overrides (
  key TEXT PRIMARY KEY, -- e.g. "h-gangnam::2026-08"
  hospital_id TEXT,
  year_month TEXT,
  brand_blog INTEGER DEFAULT 0,
  press INTEGER DEFAULT 0,
  receipt INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 키워드 태그 풀 테이블 (tag_pool)
CREATE TABLE tag_pool (
  id TEXT PRIMARY KEY,
  hospital_id TEXT NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tag_pool_hospital ON tag_pool(hospital_id);

-- 6. Row Level Security (RLS) 활성화 및 전체 읽기/쓰기 허용 (내부 트래커용)
ALTER TABLE hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE quota_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_pool ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon all on hospitals" ON hospitals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on quota_overrides" ON quota_overrides FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on tag_pool" ON tag_pool FOR ALL USING (true) WITH CHECK (true);

-- 7. 실시간 웹소켓 변경 감지 (Supabase Realtime) 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE hospitals, tasks, quota_overrides, tag_pool;

-- 8. 자동 updated_at 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_hospitals_updated_at BEFORE UPDATE ON hospitals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_quota_overrides_updated_at BEFORE UPDATE ON quota_overrides FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
