# 🚀 MEDI GO ROUND 트래커 - 초안정 무료 배포 & 도메인 연동 가이드

본 문서는 **Supabase(초고속 무료 실시간 DB)**와 **Cloudflare Pages / Vercel(초고속 무료 호스팅)**을 결합하여, 구매하신 개인 도메인으로 평생 무료이면서 끊김 없는 완벽한 환경을 구축하는 전체 가이드입니다.

---

## 📌 전체 구성 개요 (100% 영구 무료)

```
[사용자 브라우저 (PC/모바일)] 
          │
          ▼ HTTPS (개인 도메인)
[Cloudflare Pages / Vercel] ── (글로벌 서울 엣지 CDN 호스팅)
          │
          ▼ WebSocket (Realtime) & REST API (0.05초)
[Supabase (PostgreSQL)] ──── (500MB 무료 DB, 행 단위 원자적 업데이트)
```

---

## STEP 1. Supabase 무료 데이터베이스 만들기 (약 3분 소요)

1. **[Supabase](https://supabase.com/)** 접속 후 무료 회원가입 (GitHub 계정 로그인 가능)
2. **[New Project]** 클릭:
   - **Name**: `naver-tracker` (자유롭게 입력)
   - **Database Password**: 안전한 비밀번호 입력 (메모해 두세요)
   - **Region**: **`Northeast (Seoul)`** 선택 (가장 빠름!)
   - **Plan**: `Free tier` 확인 후 **[Create new project]** 클릭 (약 1분 대기)
3. **테이블 스키마 생성 (원클릭)**:
   - 좌측 메뉴에서 **[SQL Editor]** 아이콘 클릭 ➔ **[New query]** 클릭
   - 프로젝트 폴더의 **`supabase_schema.sql`** 파일 내용을 전체 복사하여 붙여넣기
   - 우측 하단 **[Run]** (또는 `Ctrl+Enter`) 클릭!
   - ➔ `Success. No rows returned` 메시지가 뜨면 4개 테이블(`hospitals`, `tasks`, `quota_overrides`, `tag_pool`)과 실시간 구독(Realtime) 설정이 완료됩니다.
4. **접속 주소(URL) 및 API Key 확인**:
   - 좌측 하단 ⚙️ **[Project Settings]** 클릭 ➔ **[API]** 메뉴 클릭
   - **Project URL** (예: `https://abcdefghijklmn.supabase.co`) 복사
   - **Project API keys**의 **`anon` `public`** 키 (예: `eyJhbGciOiJIUzI1NiIsIn...`) 복사

---

## STEP 2. 기존 데이터 Supabase로 1클릭 복사 (이전)

현재 트래커에는 최신 병원 8곳과 248건의 실제 작업 데이터가 보존되어 있습니다. 아래 방법 중 편한 방법으로 1회 실행하시면 데이터가 이전됩니다:

### 방법 A: 브라우저 화면에서 원클릭 이전 (가장 쉬움!)
1. 트래커 사이트 접속 후 상단 헤더의 **[☁️ 클라우드 DB]** 버튼 클릭
2. STEP 1에서 복사한 **Supabase URL**과 **Anon Key**를 입력 후 **[저장 및 연결]** 클릭
3. 바로 아래 **[🚀 현재 데이터 Supabase로 1클릭 이전]** 버튼 클릭!
4. ➔ 2초 안에 8개 병원과 248건의 모든 작업이 Supabase로 즉시 이전됩니다.

### 방법 B: 터미널 명령어로 직접 이전 (선택사항)
터미널에서 아래 한 줄 실행:
```bash
node migrate_to_supabase.js <내_SUPABASE_URL> <내_SUPABASE_ANON_KEY>
```

---

## STEP 3. Cloudflare Pages 또는 Vercel로 무료 배포하기 (약 2분)

둘 중 원하시는 플랫폼을 선택하시면 됩니다. (대역폭이 완전 무제한인 **Cloudflare Pages**를 추천합니다.)

### 🌐 Option A: Cloudflare Pages 배포 (추천)
1. **[Cloudflare 대시보드](https://dash.cloudflare.com/)** 로그인 ➔ 좌측 **[Compute (Workers & Pages)]** ➔ **[Pages]** 클릭
2. **[Connect to Git]** 클릭 ➔ GitHub 연결 후 **`Terry-k-won/naver_tracker`** 저장소 선택
3. **설정 확인**:
   - **Project name**: `naver-tracker`
   - **Production branch**: `main`
   - **Framework preset**: `None` (기본값)
   - **Build command**: 비워둠
   - **Build output directory**: `/` (또는 비워둠)
4. **[Save and Deploy]** 클릭!
   ➔ 15초 후 `https://naver-tracker.pages.dev` 주소로 즉시 전 세계 배포 완료!

### ▲ Option B: Vercel 배포
1. **[Vercel](https://vercel.com/)** 로그인 ➔ **[Add New...]** ➔ **[Project]**
2. GitHub의 `naver_tracker` 저장소에서 **[Import]** 클릭
3. Framework Preset: `Other`, 나머지는 그대로 두고 **[Deploy]** 클릭!
   ➔ 20초 후 `https://naver-tracker.vercel.app`으로 배포 완료!

---

## STEP 4. 구매하신 개인 도메인 연결하기 (DNS 설정)

구매하신 도메인 등록 사이트(가비아, 카페24, 후이즈 등)에서 설정합니다:

### 1. 배포 대시보드에서 도메인 추가
- **Cloudflare Pages의 경우**:
  - 내 Pages 프로젝트 ➔ **[Custom domains]** 탭 ➔ **[Set up a custom domain]** 클릭
  - 사용하실 도메인 입력 (예: `track.내도메인.com` 또는 `내도메인.com`)
- **Vercel의 경우**:
  - 내 Vercel 프로젝트 ➔ **[Settings]** ➔ **[Domains]** ➔ 도메인 입력 후 **[Add]**

### 2. 도메인 구매 사이트(가비아/카페24 등) DNS 레코드 등록
도메인 관리 페이지의 **[DNS 레코드 설정]** 메뉴에서 아래 중 하나를 추가합니다:

#### 서브도메인을 쓸 때 (예: `track.mydomain.com` - 가장 추천!)
- **타입**: `CNAME`
- **호스트 / 이름**: `track`
- **값 / 목적지**:
  - Cloudflare Pages인 경우: `naver-tracker.pages.dev`
  - Vercel인 경우: `cname.vercel-dns.com`

#### 메인 도메인을 쓸 때 (예: `mydomain.com`)
- **타입**: `CNAME` 또는 `A`
  - Vercel의 경우: `A` 레코드 ➔ 값: `76.76.21.21`
  - Cloudflare Pages의 경우: Cloudflare DNS 프록시 사용 시 CNAME flattened

등록 후 1~5분 이내에 자동으로 **무료 SSL 보안 인증서(HTTPS 자물쇠)**가 발급되며, 내 도메인으로 안전하게 접속됩니다!

---

## 🎉 완성 후 변화되는 점

1. **동시성 덮어쓰기 문제 100% 영구 종결**:
   - 구글 시트처럼 전체를 덮어쓰지 않고, **수정한 해당 작업 행(Row)만 DB에 업데이트**됩니다.
   - 모바일과 PC에서 여러 명이 동시에 마감일, 상태, 키워드를 수정해도 절대 다른 사람의 내용이 날아가거나 롤백되지 않습니다.
2. **실시간 0.1초 동기화**:
   - WebSocket Realtime 채널을 통해, 모바일에서 글감을 적으면 PC 화면에 실시간으로 깜빡임 없이 즉시 뜹니다.
3. **콜드 스타트(지연) 제로**:
   - 구글 Apps Script의 5초~10초 대기가 사라지고 0.05초 만에 데이터가 즉시 로드됩니다.
4. **구글 시트처럼 관리 가능**:
   - Supabase 웹 대시보드의 **[Table Editor]**에 들어가면, 엑셀/구글시트처럼 모든 표를 직접 필터링, 정렬, 수정, CSV 다운로드 할 수 있습니다.
