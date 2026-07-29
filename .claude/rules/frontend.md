---
paths:
  - "frontend/**"
---

# frontend 규칙 (Next.js 16 App Router)

버전 경고는 `frontend/AGENTS.md`가 정본 — 이 디렉토리 작업 시 자동 로드된다. 아래는 그 외 실측으로 확인된 것들.

## 검증 (테스트 스크립트 없음 — 두 명령이 서로를 못 대신한다)

- `npm run lint` — bare `eslint`(flat config, `eslint-config-next` core-web-vitals + typescript). **타입체크를 하지 않는다.**
- `npm run build` — 타입 오류는 **여기서만** 드러난다. lint만 통과하고 끝내면 타입 깨진 채 머지된다.
- 포매터 없음(Prettier·Biome·.editorconfig 전무). 임의 도입·전체 재포맷 금지.

### ⚠️ `npm run dev`가 떠 있을 때 `npm run build`를 돌리지 말 것

둘이 `.next/`를 공유해서, build가 dev 서버의 매니페스트·청크를 덮어쓴다. **증상이 에러가 아니라 브라우저가 낡은 번들을 계속 받는 것**이라, 방금 고친 코드가 화면에 반영 안 되는 걸 "내 수정이 틀렸나"로 오해하게 된다(2026-07-29 Story 7.1 실측 — 코드리뷰 반영분이 안 보여 30분 헤맸다).

워크플로가 **build 검증과 브라우저 실측을 둘 다** 요구하므로 이 순서 충돌은 반복해서 밟힌다. 실측 중 타입체크가 필요하면:

```bash
npx --no-install tsc --noEmit -p tsconfig.json   # .next/ 를 건드리지 않는다
```

이미 밟았으면 `pkill -f "next dev"; rm -rf .next` 후 dev 재기동 + 브라우저 하드 리로드(`Cmd+Shift+R`).
순서를 지킬 거면 **build → 종료 → dev 기동** 또는 **dev 종료 → build**.

## 함정

- `next.config.ts`의 `allowedDevOrigins`에 LAN IP가 하드코딩돼 있다(`192.168.0.13`). Next 16은 미등록 교차 오리진의 dev 접근을 차단하는데, 증상이 에러가 아니라 **하이드레이션이 조용히 멈추는 것**이다(Story 5.1 실측). 다른 네트워크·다른 IP에서 브라우저 실측이 안 되면 앱 버그로 의심하기 전에 여기부터 본다.
- 백엔드 좌표는 `NEXT_PUBLIC_API_BASE_URL` 하나뿐이다(`lib/api.ts`, 기본값 `http://localhost:8000`). `.env.local`이 없어도 동작한다.
- `NEXT_PUBLIC_` 값은 브라우저 번들에 그대로 박힌다 — DB 문자열·시크릿 금지(AD-1/AD-7).
