# best pic 📼

친구들끼리만 사진을 공유하는 비밀 갤러리예요. 레트로 CRT 모니터 / VHS 테이프 분위기의 어두운 웹페이지입니다.

- **닉네임 가입 → 관리자 승인제**: 이메일 없이 닉네임+비밀번호만. 승인되기 전에는 사진을 볼 수도 올릴 수도 없어요.
- **사진 올리기/갤러리**: 승인된 친구는 누구나 올릴 수 있고, 삭제는 관리자만 해요. 날짜별 폴더, 하트(날짜별 1위 표시), 댓글, 사진 저장(다운로드), 크게 보기(CRT 화면)가 있어요.
- **B&W 토글**: 화면 아래 `B&W [OFF]` 를 누르면 흑백이 돼요.
- 기술: Vite + React + Supabase(Auth/DB/Storage) + Three.js, 배포는 Vercel.

---

## 처음 한 번만 하는 설정 (순서대로!)

### 1단계. Supabase 프로젝트 만들기
1. <https://supabase.com> 로그인 → **New project** → 이름(예: `best-pic`), DB 비밀번호, 지역(Seoul 추천) → Create.
2. 만들어질 때까지 1~2분 기다려요.

### 2단계. SQL 붙여 넣기 (표와 보안 규칙 만들기)
1. 왼쪽 메뉴 **SQL Editor** → **New query**.
2. 이 폴더의 [`supabase/schema.sql`](supabase/schema.sql) 파일을 **통째로 복사해서 붙여 넣고 Run**.
3. `Success` 라고 나오면 끝. 여러 번 실행해도 안전해요(문제가 생기면 다시 한 번 실행해 보세요).

> 이 한 번으로 `profiles`(회원), `photos`(사진 목록) 표, 비공개 `photos` 저장소, 그리고 "승인된 회원만 볼 수 있다"는 보안 규칙이 모두 만들어져요.

### 3단계. Storage 확인
1. 왼쪽 메뉴 **Storage** 에 `photos` 버킷이 보이는지 확인.
2. 버킷 옆에 **PUBLIC 표시가 없어야** 해요 (비공개가 맞아요). 사진은 1시간짜리 임시 주소로만 보여요.

### 4단계. "Confirm email" 끄기 ⚠️ 꼭 필요!
이메일 없이 가입하기 때문에 메일 확인을 끄지 않으면 가입이 안 돼요.
1. **Authentication → Sign In / Providers → Email**
2. **Confirm email** 을 **끄기(OFF)** → Save.

### 5단계. 키 두 개 복사하기
**Project Settings → API** (또는 *API Keys*) 에서:
- **Project URL** → `https://xxxx.supabase.co` (⚠️ 맨 뒤에 `/rest/v1/` 같은 건 빼고 **도메인까지만**)
- **anon public** 키 (또는 `sb_publishable_…` 키)

⚠️ `service_role` / `secret` 키는 **절대** 쓰지 마세요. 이 프로젝트는 필요 없어요.

### 6단계. 내 컴퓨터에서 해 보기 (선택)
`best-pic` 폴더에서 `.env.example` 을 복사해 `.env` 로 만들고 두 값을 채워요.

```bash
npm install
npm run dev
```

열린 주소(보통 <http://localhost:5173>)에서 확인! `.env` 는 git 에 올라가지 않아요.

### 7단계. Vercel 에 배포
1. <https://vercel.com> → **Add New → Project** → GitHub 저장소 `day4` 를 Import.
2. 이 저장소(`best-pic`)를 따로 올렸다면 Root Directory 는 **기본값(비워 둠)** 그대로예요. (`day4` 저장소 안의 폴더로 배포한다면 Root Directory = `best-pic`)
3. **Environment Variables** 에 두 개 등록 (둘 다 **config(일반)** 으로 저장 — `VITE_` 로 시작하는 건 secret 이 안 돼요):
   | 이름 | 값 |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | anon 키 |
4. **Deploy**. (환경변수를 나중에 바꿨다면 **다시 배포(Redeploy)** 해야 적용돼요.)

### 8단계. Site URL 설정
Supabase → **Authentication → URL Configuration**
- **Site URL**: 배포된 주소 (예: `https://best-pic.vercel.app`, 끝에 `/` 없이)
- **Redirect URLs** 에 `https://배포주소/**` 추가 (로컬 테스트용 `http://localhost:5173/**` 도 가능)

### 9단계. 첫 관리자 만들기
1. 배포된 사이트에서 **내 닉네임으로 가입 요청**을 보내요. ("승인 대기 중" 화면이 나오면 정상!)
2. Supabase **SQL Editor** 에서 아래 한 줄을 (닉네임만 바꿔서) 실행:

```sql
update public.profiles set is_admin = true, status = 'approved' where nickname = '내닉네임';
```

3. 사이트에서 새로고침 → 위쪽 메뉴에 **ADMIN** 이 생겨요. 거기서 친구들의 가입 요청을 **승인 / 거절 / 삭제** 해요.

---

## 사용 방법
- 친구에게 사이트 주소를 알려 주세요 → 친구가 닉네임·비밀번호로 가입 요청 → 관리자가 **ADMIN** 에서 승인.
- 닉네임은 한글·영문·숫자·`_` 로 2~10자, 중복 불가예요.
- **비밀번호를 잊으면** 되찾을 이메일이 없어요. 관리자가 ADMIN 에서 그 회원을 **삭제**하면 같은 닉네임으로 다시 가입할 수 있어요.
- 사진은 올릴 때 자동으로 긴 변 1600px, 5MB 이하 JPEG 로 줄어들어요.

## 보안은 어떻게 되어 있나요?
- 회원이 스스로 `status`(승인 상태)나 `is_admin`(관리자)을 바꿀 수 없어요. `profiles` 표는 아무도 직접 수정 못 하고, 승인/거절/삭제는 **관리자만 호출할 수 있는 함수**로만 가능해요.
- 가입하면 서버(트리거)가 무조건 `pending` + 관리자 아님으로 프로필을 만들어요.
- 사진 표와 저장소 모두 "승인된 회원만" 읽을 수 있고, 올리기는 **자기 폴더(사용자 id)** 에만, 지우기는 **본인 것(또는 관리자)** 만 가능해요.
- 브라우저에는 공개용 anon 키만 있어요. service_role 키는 쓰지 않아요.

## 문제 해결
| 증상 | 해결 |
|---|---|
| "아직 연결이 안 됐어요" 화면 | 환경변수 두 개가 없어요. 5·7단계 확인 후 재배포 |
| "Invalid path specified in request URL" | `VITE_SUPABASE_URL` 에 `/rest/v1/` 까지 넣었어요. 도메인만 남기고 재배포 |
| Vercel "secret 불가" 오류 | `VITE_` 변수는 **config** 로 저장 |
| 가입했는데 로그인이 안 돼요 | 4단계 **Confirm email OFF** 확인 |
| 가입 시 이메일이 잘못됐다고 나와요 | 가짜 이메일 도메인(`bestpic.local`)을 Supabase 가 거부한 경우예요. [`src/supabase.js`](src/supabase.js) 의 `FAKE_DOMAIN` 을 `bestpic.example.com` 같은 값으로 바꾸고 재배포 (이미 가입한 사람은 이전 값으로 만든 계정이라 다시 가입해야 해요) |
| "프로필을 못 찾았어요" | 2단계 SQL 이 실행되지 않았어요 |
| 가입이 "닉네임 중복"으로만 나와요 | 정말 중복이거나, 닉네임에 허용되지 않는 글자가 있어요 |
| 사진 올리기가 실패해요 | 승인된 상태인지, 3단계 `photos` 버킷이 있는지 확인 |
| 배포 화면이 다른 사이트예요 | Vercel Root Directory 가 `best-pic` 인지 확인 |

## 폴더 구조
```
best-pic/
├─ supabase/schema.sql   표 + 보안 규칙 + 저장소 (SQL Editor 에 붙여 넣기)
├─ src/
│  ├─ App.jsx            메뉴바/상태바, 화면 전환, B&W, 승인 대기 화면
│  ├─ Auth.jsx           닉네임 가입/로그인
│  ├─ Gallery.jsx        VHS 카드 갤러리 + CRT 라이트박스 + 삭제
│  ├─ Upload.jsx         여러 장 업로드, 설명
│  ├─ Admin.jsx          승인/거절/삭제
│  ├─ Hero3D.jsx         Three.js CRT 모니터 + VHS 테이프 (lazy 로딩)
│  ├─ image.js           업로드 전 리사이즈/압축
│  ├─ supabase.js        클라이언트, 닉네임→합성 이메일, 오류 메시지
│  └─ styles.css         CRT/VHS 디자인
└─ .env.example
```
