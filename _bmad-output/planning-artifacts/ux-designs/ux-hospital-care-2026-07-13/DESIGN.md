---
name: hospital-care
description: 병원 진료관리 웹 서비스(환자 포털 + 직원 진료관리)의 시각 정체성. shadcn/ui on Next.js + Tailwind; 이 DESIGN.md는 브랜드 레이어 델타만 명시. 브랜드 토큰 확정 완료(2026-07-13).
type: design-spine
status: final
created: '2026-07-13'
updated: '2026-07-13'
sources:
  - planning-artifacts/prds/prd-hospital-care-2026-07-12/prd.md
  - planning-artifacts/architecture/architecture-hospital-care-2026-07-13/ARCHITECTURE-SPINE.md
colors:
  # 브랜드 레이어 override (shadcn 기본 위에). 미기재 토큰(background, foreground,
  # muted, muted-foreground, card, popover, border, input, ring, destructive)은 shadcn 상속.
  primary: '#047857'          # 차분한 임상 emerald(emerald-700) — 크롬/버튼/활성 내비. 확정 2026-07-13. 흰 텍스트 대비 5.5:1(WCAG AA 통과)
  primary-foreground: '#FFFFFF'
  # 상태 시맨틱 — appointment.status 4값에 1:1 고정 매핑(색+텍스트). 전 화면 불변.
  status-waiting-fg: '#92400E'   # 대기 (amber)
  status-waiting-bg: '#FEF3C7'
  status-confirmed-fg: '#1E40AF' # 확정 (blue)
  status-confirmed-bg: '#DBEAFE'
  status-done-fg: '#166534'      # 완료 (green)
  status-done-bg: '#DCFCE7'
  status-cancelled-fg: '#475569' # 취소 (gray)
  status-cancelled-bg: '#F1F5F9'
  # 위험(슬롯 충돌 · 전원 점유로 인한 walk-in 접수 거부)은 shadcn destructive(red) 그대로 사용.
typography:
  # 한글 본문 가독을 위해 sans 패밀리를 Pretendard로 override(shadcn 기본 Geist는 라틴용).
  sans:
    fontFamily: 'Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'  # 확정 2026-07-13 (한글 웹 UI 표준)
  display:
    fontFamily: 'Pretendard'
    fontSize: 28px
    fontWeight: '700'
    lineHeight: '1.25'
rounded:
  # shadcn 기본 유지(친근-전문 사이). 환자 대상이라 더 날카롭게 하지 않음.
  sm: 6px
  md: 8px
  lg: 12px
spacing:
  # shadcn / Tailwind 4-기반 스케일 상속, override 없음.
components:
  button-primary:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.md}'
  status-badge:
    radius: '{rounded.sm}'
    # variant별 색은 colors.status-* 사용. 반드시 한국어 텍스트 병기(색만으로 구분 금지).
  slot-cell:
    radius: '{rounded.sm}'
    # available=outline, selected={colors.primary} fill, taken=muted+disabled
---

# hospital-care — Design Spine

> shadcn/ui 기본을 그대로 상속하고, 아래 브랜드 델타(primary·상태색·한글 폰트·소수 컴포넌트)만 명시한다. 브랜드 토큰은 확정됨(2026-07-13).

## Brand & Style

**차분한 임상 신뢰형(calm clinical trust).** 병원 서비스라 **불안을 낮추고 명료함을 높이는** 표현 — 넉넉한 여백, 높은 가독성, 시각적 소음 제거. 한 가지 디자인 언어를 두 청중에 쓰되 **밀도만 다르게**: 직원 화면은 효율적(밀도 있는 표), 환자 화면은 안심되게(여유로운 카드).

shadcn/ui 기본을 통째로 상속한다. 이 문서는 **브랜드 델타만** 지정 — primary 색, 상태 시맨틱 색, 한글 폰트, 그리고 병원 특유의 컴포넌트(상태 배지·슬롯 피커) 몇 개. shadcn에서 오는 80%(Button, Card, Dialog, Table, Input, Select, Toast, Tabs, Skeleton)는 기본 시각 스펙 그대로 쓴다.

## Colors

- **Primary Emerald (`#047857`)** — 크롬 색. primary 버튼, 활성 내비, 선택된 슬롯, 링크. shadcn `primary` 대체. 흰 텍스트 대비 5.5:1(WCAG AA 통과). ⚠️ **완료(green) 상태색과 초록 계열이 인접** — primary는 **채도 높은 fill(버튼·크롬)로만**, 상태 green은 **연한 배지(bg `#DCFCE7` + 텍스트)로만** 쓰고 서로 교차 사용 금지. 배지 한국어 텍스트 병기로 최종 구분 보장.
- **상태 시맨틱 4색** — 이건 장식이 아니라 **데이터 계약**이다. `appointment.status`의 네 값에 색+텍스트로 1:1 고정 매핑하고, **모든 화면에서 동일**:
  - 🟡 **대기** — amber (`#92400E` / bg `#FEF3C7`)
  - 🔵 **확정** — blue (`#1E40AF` / bg `#DBEAFE`)
  - 🟢 **완료** — green (`#166534` / bg `#DCFCE7`)
  - ⚪ **취소** — gray (`#475569` / bg `#F1F5F9`)
- **Destructive (red)** — shadcn 기본 그대로. **오직** 도메인 거부(슬롯 충돌, 전원 점유로 인한 walk-in 접수 거부 — 2026-07-28 correct-course 이후 둘 다 red **인라인**으로 수렴, Dialog 아님)와 파괴적 확정(예약 취소)에만.
- **그 외 토큰**(`background`, `foreground`, `muted`, `border`, `input`, `ring`, `card`, `popover`)은 shadcn 상속. 브랜드가 override를 정당화 못 하면 override 안 한다.

피할 것: 두 개 넘는 브랜드 색, 그라디언트 표면, 상태색을 크롬에 재사용(상태 4색은 상태에만), 색만으로 상태 구분.

## Typography

- **본문/라벨/캡션** — 패밀리를 **Pretendard**로 override(한글 가독), 크기·굵기 램프는 shadcn 상속. 폰트 확정(2026-07-13, 한글 웹 UI 표준).
- **display** — Pretendard 28px/700. 화면 제목, 빈 상태 헤드라인, "이수민님, 안녕하세요" 인사에만. 남발 금지.

## Layout & Spacing

shadcn / Tailwind 4-기반 스케일(4·8·12·16·24·32·48…) 그대로. **앱 셸** = 상단 **역할 컨텍스트 바**(현재 역할 + 선택된 환자/의사) + 콘텐츠. **직원 화면 예외(2026-07-25 correct-course, UX-DR12):** 좌측 사이드바 내비(예약관리 강조·신규 환자 등록·환자 목록·검색), `≥md` 고정·모바일 접힘. 환자·의사 화면은 상단 바만 유지.

- **폼 화면**(환자 등록·예약·기록 작성): `max-w-2xl`(672px) 단일 컬럼 — 초점 유지.
- **직원 목록/표**(환자·예약 목록): 넓은 폭 허용(`≥md`에서 밀도 있는 표).
- **환자 화면**: 단일 컬럼, 모바일 폭까지 편안.

## Elevation & Depth

shadcn 상속 — 카드/팝오버의 subtle shadow. 계층 표현 수단으로 남용하지 않음. 브랜드가 위에 얹는 것 없음.

## Shapes

shadcn 기본 라운딩 유지(input 6px / card·button 8px / dialog 12px). 상태 배지만 살짝 둥근 pill 느낌(`rounded.sm`). 병원 대상이라 날카롭기보다 **부드럽고 신뢰되게**.

## Components

**그대로 쓰는 shadcn**(커스터마이즈 금지): `Button`, `Card`, `Dialog`, `Table`, `Input`, `Select`, `Textarea`, `Toast`(sonner), `Tabs`, `Skeleton`, `Separator`, `Badge`(색만 상태 토큰으로).

**브랜드 델타 컴포넌트:**
- **Button (primary)** — `{colors.primary}` fill / 흰 텍스트 / `{rounded.md}`. 나머지 variant(secondary·outline·ghost·destructive)는 shadcn 기본.
- **Status Badge** — `appointment.status` 4값 전용. `colors.status-*` 색 + **반드시 한국어 텍스트 병기**(대기/확정/완료/취소). 색만으로 구분 금지(접근성).
- **Slot Picker(슬롯 피커)** — 병원 특유 핵심 컴포넌트. 30분 격자 셀: `available`=outline 클릭 가능, `selected`=`{colors.primary}` fill, `taken`=muted + disabled + "예약됨" 표기. (행동 규칙은 EXPERIENCE.md.)
- **Role Context Bar** — 상단 고정. 현재 역할(환자/직원/의사)과 선택된 환자명/의사명, 전환 액션. 무인증 데모임을 은근히 드러냄.
- **Prescription Row(처방 행)** — 진료 기록 폼 안의 반복 행(약 선택 + 용법·용량 + 일수), 추가/삭제. 0..N개.

## Do's and Don'ts

| Do | Don't |
|---|---|
| shadcn 기본을 최대한 상속 | primary·상태색 외 shadcn 색 토큰 override |
| 상태 4색은 오직 `appointment.status`에만, 색+텍스트 | 상태색을 크롬·버튼·hover에 재사용 |
| red는 도메인 거부·파괴적 확정에만 | 강조하려고 아무 데나 red |
| 한글은 Pretendard, display는 아껴서 | 본문을 display로 "예쁘게" |
| 직원=밀도, 환자=여백 (같은 언어, 다른 밀도) | 환자 화면에 직원용 밀집 표 그대로 |
