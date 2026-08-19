-- 계모임 시드 (PRD §5.3) — 재실행 가능. 데모 직전 리셋 스크립트를 겸한다.
-- ⚠️ 맨 위 TRUNCATE 가 기존 데이터를 전부 지운다. 데모 중에는 돌리지 말 것.

truncate messages, attendances, memberships, events, groups, users restart identity cascade;

-- 1) 계정 40개 — 전부 비밀번호 1234.
--    로그인 화면에는 demo01~demo08 만 버튼으로 노출하고, 나머지는 직접 입력용(청중 다수 대비).
insert into users (login_id, nickname, password) values
  ('demo01','김서준','1234'), ('demo02','이지우','1234'), ('demo03','박하은','1234'), ('demo04','최민준','1234'),
  ('demo05','정예린','1234'), ('demo06','강도윤','1234'), ('demo07','조수아','1234'), ('demo08','윤시우','1234'),
  ('demo09','임채원','1234'), ('demo10','한지호','1234'), ('demo11','오유진','1234'), ('demo12','서건우','1234'),
  ('demo13','신아린','1234'), ('demo14','권태오','1234'), ('demo15','황서윤','1234'), ('demo16','안준서','1234'),
  ('demo17','송하준','1234'), ('demo18','류다인','1234'), ('demo19','전민서','1234'), ('demo20','홍시연','1234'),
  ('demo21','문재이','1234'), ('demo22','배소율','1234'), ('demo23','백지훈','1234'), ('demo24','남기현','1234'),
  ('demo25','심우재','1234'), ('demo26','노가온','1234'), ('demo27','하도현','1234'), ('demo28','곽지안','1234'),
  ('demo29','성유나','1234'), ('demo30','차예원','1234'), ('demo31','구본희','1234'), ('demo32','표승민','1234'),
  ('demo33','지한결','1234'), ('demo34','우다현','1234'), ('demo35','마지원','1234'), ('demo36','진소윤','1234'),
  ('demo37','채윤아','1234'), ('demo38','도현우','1234'), ('demo39','여승아','1234'), ('demo40','탁민재','1234');

-- 2) 모임 12개
--    ⚠️ 데모 시나리오 2의 판정 기준: category='운동/스포츠' AND region='판교' 는 정확히 3개여야 한다.
insert into groups (name, summary, description, category, region, owner_id, created_at) values
  ('반코트 배드민턴 [NEW!]', '복식으로 재미있게, 원하면 단식으로 빡세게. 두 마리 토끼 다 잡아요',
   E'판교 체육관 A코트를 매주 금요일 저녁에 통째로 빌려서 칩니다.\n라켓은 대여해드리니 운동화만 챙겨오세요. 초보도 환영이에요.',
   '운동/스포츠', '판교', 1, now() - interval '210 days'),
  ('판교 아침 러닝크루', '출근 전 6시 30분, 탄천 5km. 러닝으로 하루를 여는 사람들',
   E'매주 화·목 아침 6시 30분에 탄천 산책로에서 만나 5km를 뜁니다.\n페이스는 6분~7분대로 넉넉하게, 완주가 목표예요.',
   '운동/스포츠', '판교', 6, now() - interval '150 days'),
  ('볼링킹 B.C', '신입 회원 모집! 스트라이크보다 즐거운 만남',
   E'매월 둘째·넷째 토요일 저녁 볼링 3게임 + 뒤풀이.\n평균 점수 상관없어요. 공 굴려본 적 없어도 됩니다.',
   '운동/스포츠', '판교', 12, now() - interval '120 days'),
  ('판교역 보드게임', '판교역 걸어서 2분. 퇴근 후 보드게임 어떠신가요',
   E'보드게임 200종 보유한 카페에서 매주 수요일 저녁에 모입니다.\n룰 설명해드리니 처음 오셔도 바로 섞여요.',
   '게임/오락', '판교', 8, now() - interval '300 days'),
  ('느슨하고 해이한 온기', '느슨해도 해이해도 괜찮은 자리. 오래도록 따뜻하게',
   E'한 달에 한 번, 저녁에 모여 밥 먹고 이야기합니다.\n출석 압박 없어요. 오고 싶을 때 오시면 됩니다.',
   '사교/인맥', '분당', 2, now() - interval '260 days'),
  ('분당 문화예술 Art', '다양한 문화 생활 공유를 목표로 합니다. 전시·공연·독서',
   E'전시 관람을 중심으로 공연·영화까지 함께 다닙니다.\n티켓은 각자 부담, 정보 공유와 동행이 이 모임의 전부예요.',
   '문화/공연/축제', '분당', 5, now() - interval '330 days'),
  ('백스테이지 모란', '무대 뒤에서, 당신이 주인공이 되는 모임',
   E'아마추어 연극팀입니다. 대본 리딩부터 연말 소극장 공연까지 함께 만들어요.\n연기 경험은 필요 없습니다.',
   '문화/공연/축제', '수원', 20, now() - interval '190 days'),
  ('얼리버드 캠핑', '진한 하루, 여유로운 마무리. 소규모로 모여 더 편안하게',
   E'한 달에 한 번 캠핑장을 잡아 1박 2일로 갑니다.\n장비 없으셔도 됩니다 — 남는 텐트가 늘 있어요.',
   '아웃도어/여행', '용인', 10, now() - interval '95 days'),
  ('완독 — 수원 독서모임', '한 달에 한 권, 끝까지 읽고 만납니다',
   E'격주 일요일 오전 카페에서 2시간. 발제자를 돌아가며 맡아요.\n안 읽고 오셔도 쫓아내진 않지만 재미가 반으로 줄어요.',
   '인문학/책/글', '수원', 11, now() - interval '400 days'),
  ('광교 주말 등산대', '광교산부터 시작해 경기도 산을 하나씩',
   E'매주 토요일 아침 등산. 3~4시간 코스 위주로 다닙니다.\n하산 후 막걸리가 사실상 본 행사예요.',
   '아웃도어/여행', '광교', 14, now() - interval '75 days'),
  ('일산 우쿨렐레 초보방', '코드 3개면 한 곡. 악기 처음이어도 괜찮아요',
   E'매주 목요일 저녁 2시간 합주. 우쿨렐레는 빌려드립니다.\n악보 못 봐도 됩니다, 숫자로 알려드려요.',
   '음악/악기', '일산', 17, now() - interval '45 days'),
  ('동탄 원데이 도자기', '흙 만지는 두 시간, 머리가 텅 비어요',
   E'매달 한 번 공방을 빌려 물레를 돌립니다.\n만든 그릇은 구워서 다음 달에 가져가실 수 있어요.',
   '공예/만들기', '동탄', 22, now() - interval '30 days');

-- 3) 모임장 멤버십
insert into memberships (group_id, user_id, role)
select id, owner_id, 'owner' from groups;

-- 4) 일반 멤버 채우기 — 모임별 목표 인원(모임장 포함)에서 1명을 뺀 수만큼 결정적으로 배정
--    ⚠️ 박하은(demo03, id=3)은 「반코트 배드민턴」에서 제외한다.
--       시나리오 3에서 직접 가입해 멤버수 25 → 26 이 되는 장면을 보여야 하기 때문.
with target(name, cnt) as (values
  ('반코트 배드민턴 [NEW!]', 25), ('판교 아침 러닝크루', 18), ('볼링킹 B.C', 12),
  ('판교역 보드게임', 30), ('느슨하고 해이한 온기', 22), ('분당 문화예술 Art', 27),
  ('백스테이지 모란', 15), ('얼리버드 캠핑', 13), ('완독 — 수원 독서모임', 20),
  ('광교 주말 등산대', 16), ('일산 우쿨렐레 초보방', 9), ('동탄 원데이 도자기', 7)
)
insert into memberships (group_id, user_id, role)
select g.id, u.id, 'member'
from groups g
join target t on t.name = g.name
cross join lateral (
  select us.id
  from users us
  where us.id <> g.owner_id
    and not (g.name = '반코트 배드민턴 [NEW!]' and us.id = 3)
  order by ((us.id * 7 + g.id * 13) % 41), us.id
  limit t.cnt - 1
) u;

-- 5) 정모 3개
insert into events (group_id, title, starts_at, place, created_by)
select g.id, v.title, v.starts_at, v.place, g.owner_id
from (values
  ('반코트 배드민턴 [NEW!]', '8월 정기 셔틀 대회', timestamptz '2026-08-22 20:00+09', '판교 체육관 A코트'),
  ('판교역 보드게임',        '주말 보드게임 데이', timestamptz '2026-08-23 14:00+09', '판교역 2번 출구 카페 다이스'),
  ('느슨하고 해이한 온기',   '9월 첫 모임 — 와인 한 잔', timestamptz '2026-09-05 19:30+09', '분당 정자동 와인바')
) as v(gname, title, starts_at, place)
join groups g on g.name = v.gname;

-- 6) 참석 시드 — 각 정모에 그 모임 멤버 일부. 박하은(id=3)은 제외(시나리오 4)
insert into attendances (event_id, user_id)
select e.id, u.user_id
from events e
cross join lateral (
  select m.user_id
  from memberships m
  where m.group_id = e.group_id and m.user_id <> 3
  order by ((m.user_id * 5 + e.id * 11) % 37), m.user_id
  limit 8
) u;

-- 7) 한 줄 소개 (마이페이지 표시용)
update users set bio = v.bio
from (values
  ('demo01','주 3회는 라켓을 잡아야 사는 사람'),
  ('demo03','새로운 모임 구경 다니는 중이에요'),
  ('demo08','보드게임 200종 정도 해봤습니다')
) as v(login_id, bio)
where users.login_id = v.login_id;

-- 8) 채팅 시드 — 빈 채팅방은 데모에서 죽어 보인다
insert into messages (group_id, user_id, body, created_at)
select g.id, u.id, v.body, now() - (v.mins || ' minutes')::interval
from (values
  ('반코트 배드민턴 [NEW!]', 'demo01', '이번 주 금요일 A코트 예약 완료했어요! 8시부터입니다', 320),
  ('반코트 배드민턴 [NEW!]', 'demo15', '오 좋아요 저 갑니다 🏸', 300),
  ('반코트 배드민턴 [NEW!]', 'demo22', '라켓 하나 더 빌릴 수 있을까요? 친구 데려가려고요', 240),
  ('반코트 배드민턴 [NEW!]', 'demo01', '넉넉해요~ 그냥 오시면 됩니다', 232),
  ('반코트 배드민턴 [NEW!]', 'demo29', '저는 이번 주는 못 가고 다음 주에 뵐게요 ㅠㅠ', 95),
  ('판교역 보드게임',        'demo08', '오늘 신작 두 개 가져갑니다. 룰 어려운 거 아니니 걱정 마세요', 180),
  ('판교역 보드게임',        'demo13', '몇 시까지 가면 될까요?', 150),
  ('판교역 보드게임',        'demo08', '7시부터 시작하는데 늦게 오셔도 중간 합류 됩니다', 143),
  ('판교역 보드게임',        'demo34', '퇴근하고 바로 갈게요!', 40)
) as v(gname, login_id, body, mins)
join groups g on g.name = v.gname
join users  u on u.login_id = v.login_id;

-- 9) 자가 검증 — 아래 3줄이 전부 ok 여야 시드가 성공한 것이다
select case when count(*) = 3 then 'ok' else 'FAIL' end as "시나리오2: 운동/스포츠+판교=3", count(*)
  from groups where category = '운동/스포츠' and region = '판교';
select case when count(*) = 25 then 'ok' else 'FAIL' end as "시나리오3: 반코트 멤버=25", count(*)
  from memberships m join groups g on g.id = m.group_id where g.name = '반코트 배드민턴 [NEW!]';
select case when count(*) = 0 then 'ok' else 'FAIL' end as "시나리오3: 박하은 미가입", count(*)
  from memberships m join groups g on g.id = m.group_id
  where g.name = '반코트 배드민턴 [NEW!]' and m.user_id = 3;
