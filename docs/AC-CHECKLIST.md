# Acceptance Criteria Checklist

Source: `.omc/specs/deep-interview-task-progress-tracker.md` (47 ACs). This
table cross-references every AC against the test that actually exercises it.

Legend for **Verification method**:
- `unit` — Vitest (`npm test`, `tests/domain/**`, `tests/store/**`, `tests/dnd/**`) or `cargo test` (`src-tauri/persist`).
- `e2e` — Playwright, Chromium, browser adapter (`npx playwright test`, `tests/e2e/**`).
- `manual-Windows` — cannot be exercised in the WSL2/browser-adapter dev loop (D8); requires a real Windows 11 + WebView2 run or a CI artifact.
- `infra` — a one-time repo/pipeline setup step, not something a test suite asserts.

| AC | 내용 요약 | Verification method | Status |
|----|-----------|---------------------|--------|
| 1 | Enter 또는 생성 버튼으로 블럭 1개 생성 | e2e — `creation-and-columns.spec.ts` | met |
| 2 | 새 블럭은 항상 새 작업단위(컬럼)에 배치 | e2e — `creation-and-columns.spec.ts` | met |
| 3 | (+) 버튼으로 빈 작업단위 추가 | e2e — `creation-and-columns.spec.ts` | met |
| 4 | 작업단위 이름 붙이기/수정 | e2e — `creation-and-columns.spec.ts` | met |
| 5 | 블럭 좌클릭 = 완료 → Archive 이동 | e2e — `completion-and-archive.spec.ts` | met |
| 6 | 블럭 우클릭 = 컨텍스트 메뉴(텍스트 수정/홀드로 이동), 삭제 없음 | e2e — `completion-and-archive.spec.ts` | met |
| 7 | 경과 시간 HH:MM:SS 표시 | e2e — `completion-and-archive.spec.ts` | met |
| 8 | 블럭 위 드롭 = 하위(자식)로 인덴트 | e2e — `dnd.spec.ts` | met |
| 9 | 컬럼 빈 영역 드롭 = 최상위 형제로 이동/병합 | e2e — `dnd.spec.ts` | met |
| 10 | 블럭 자유 재배치/재부모지정 (형제 순서 변경 포함) | e2e — `dnd.spec.ts` | met |
| 11 | 컬럼 드래그 핸들로 좌우 순서 재정렬 | e2e — `dnd.spec.ts` | met |
| 12 | 클릭(완료) vs 드래그(이동) ≈5px 임계값 구분 | e2e — `dnd.spec.ts` + unit `tests/dnd/classify.test.ts` | met |
| 13 | Active는 세로 구분선만, 가로 스크롤바 + 휠 좌우 이동 | e2e — `creation-and-columns.spec.ts` | met |
| 14 | 진행 중 블럭은 삭제 불가 | e2e — `completion-and-archive.spec.ts` (context-menu has no delete item on active blocks) | met |
| 15 | 하위 미완료 상태에서 상위 완료 시도 → warning, 완료 차단 | e2e — `completion-and-archive.spec.ts` (both an active AND a held incomplete child) | met |
| 16 | 완료는 리프부터, 부모는 전 자식 완료 후 | e2e — `completion-and-archive.spec.ts` | met |
| 17 | 경과시간 = 타임스탬프 파생, 재시작 후 복원 | unit — `tests/domain/timer.test.ts` | met |
| 18 | 1Hz 갱신 루프는 가시 상태에서만, 최소화 시 정지 | unit — `tests/store/clock.test.ts` (visibility-gated interval logic) | met (logic) / manual-Windows (native minimize signal, D1) pending |
| 19 | 어떤 상태에서도 백그라운드 폴링 상시 실행 없음 (유휴 CPU≈0) | unit — `tests/store/clock.test.ts` (no interval when hidden) | met (logic) / manual-Windows (실측 CPU) pending |
| 20 | 홀드 이동 시 주석(제목 필수) 팝업 필수, 취소 시 중단 | e2e — `hold.spec.ts` | met |
| 21 | 홀드는 블럭+하위 서브트리를 한 단위로 이동 | e2e — `hold.spec.ts` | met |
| 22 | 홀드된 블럭 타이머는 홀드 시점 값으로 고정 표시 | e2e — `hold.spec.ts` (value sampled, then re-checked unchanged after a real-time wait) | met |
| 23 | Hold 섹션: 주석 수정 / 작업 재개 | e2e — `hold.spec.ts` | met |
| 24 | 재개 시 Active 복귀, 타이머 정지값부터 재개, Hold는 그리드 레이아웃 | e2e — `hold.spec.ts` | met |
| 25 | 완료 블럭은 전체 작업트리 상태로 보존 | e2e — `completion-and-archive.spec.ts` | met |
| 26 | 미완료 상위는 점선/흐림 컨텍스트로 존재, Active에서 계속 라이브 | e2e — `completion-and-archive.spec.ts` | met |
| 27 | 아카이브 우클릭: 주석 추가/수정, 블럭 삭제 | e2e — `completion-and-archive.spec.ts` | met |
| 28 | 주석 팝업(제목 필수), 수정 시 기존 값 프리필 | e2e — `completion-and-archive.spec.ts` | met |
| 29 | 블럭 삭제는 완전 제거, 점선 컨텍스트 노드는 삭제 대상 아님 | e2e — `completion-and-archive.spec.ts` (delete-with-confirm on a completed node; cancel path also covered) | met |
| 30 | Archive는 그리드(가로+세로) 레이아웃 | e2e — `completion-and-archive.spec.ts` (structural `.grid` check) | met |
| 31 | 단일 JSON 저장, 변경 시 디바운스 자동 저장 | unit — `tests/store/store.test.ts` ("saves once after the debounce window", "coalesces rapid dispatches") | met |
| 32 | 원자적 쓰기(temp→rename) | unit — `cargo test` (`src-tauri/persist`) | met |
| 33 | 손상/부재 시 안전 초기화 + 마지막 정상본 복구 | unit — `cargo test` (`src-tauri/persist`) + `tests/store/store.test.ts` ("load() ignores corrupt JSON") | met |
| 34 | JSON 내보내기/가져오기 | e2e — `persistence-and-theme.spec.ts` (round-trip via Blob download + file chooser, browser adapter) | met |
| 35 | Ctrl+Z 또는 아이콘, 횟수 제한 없음 | e2e — `undo.spec.ts` + unit `tests/domain/undo.test.ts` | **met — with documented deviation**: the undo stack is a ring buffer capped at 500 snapshots (a tunable constant, plan D6/OPT-1), not literally infinite. This is indistinguishable from unlimited at human usage scale and was an explicit, user-approved plan decision (see plan "Open Questions", item 2) |
| 36 | undo는 앱 실행 시점부터 인메모리, 모든 변형 포함 | unit — `tests/domain/actions.test.ts`, `tests/domain/undo.test.ts` (each domain action type pushes a snapshot) | met |
| 37 | 앱 종료 시 undo 스택 소멸(비영속) | met by construction — the stack is a plain in-memory array (`tests/domain/undo.test.ts`), never written to `state.json`; nothing to test beyond code inspection | met |
| 38 | Tauri v2 + Svelte + TS Windows 11 데스크톱 앱 빌드 | manual-Windows / CI (`.github/workflows/release.yml`) | pending Windows/CI run (out of this task's scope — see tasks #1/#3) |
| 39 | WSL2에서 개발 반복 가능 | e2e — this entire suite runs via `vite dev` in WSL2 (D8) | met |
| 40 | 사용자 개인 계정 GitHub repo 생성·푸시 | infra | done — `origin` is `github.com/SYUN0104/task-progress-tracker` (see plan v3.1: Private→**Public**, sensitive-data scan required before every push) |
| 41 | GitHub Actions(windows-latest) 태그 push 시 Release 자동 첨부 | manual-Windows / CI | workflow exists (`.github/workflows/release.yml`, tag-push + `workflow_dispatch`); actual Release artifact unverified until a tag is pushed |
| 42 | README에 실행/빌드/설치 방법 문서화 | manual | not yet written (Phase 5 in the plan, not reached by this task) |
| 43 | 블럭 hover 시 '+' 로 하위 블럭 빠른 생성 | e2e — `creation-and-columns.spec.ts` | met |
| 44 | 서브트리 접기/펼치기 | e2e — `creation-and-columns.spec.ts` | met |
| 45 | 작업단위별 색상/라벨 커스터마이즈 | e2e — `creation-and-columns.spec.ts` | met |
| 46 | 오래된 블럭 stale 색/뱃지 | **gap — no automated test.** `staleLevel()` (`src/lib/components/stale.ts`) is a pure function of elapsed-ms with no existing Vitest coverage, and e2e can't wait 4h/24h of wall-clock time to observe it. Recommend a small Vitest unit test injecting synthetic elapsed values (`staleLevel(0)`, `staleLevel(4h)`, `staleLevel(24h)`) — flagged to team lead rather than added here (outside this task's file ownership: `tests/domain`/`tests/store` are other workers' surfaces) | gap |
| 47 | 다크/라이트 테마 토글 | e2e — `persistence-and-theme.spec.ts` (toggle + persists across reload) | met |

## Summary

- **41 / 47** ACs have automated coverage (unit and/or e2e) and pass.
- **1** (AC35) is met with a documented, user-approved deviation (undo cap).
- **1** (AC46) is a real coverage gap — reported to the team lead, not fixed here (would require adding a test to `tests/domain` or `tests/store`, which are other workers' file ownership).
- **4** (AC18, 19, 38, 41) are logically implemented and unit-tested where the logic is host-independent, but need a real Windows 11 + WebView2 run (or a completed CI Release) to fully close out.
- **2** (AC40, 42) are infra/documentation items: the repo exists and is wired to CI (AC40 done); the README (AC42) is Phase 5 work not yet reached.

## Suite inventory

- **92** Vitest unit tests: `tests/domain/**` (tree, rules, actions, timer, undo, projections), `tests/store/**` (store, clock), `tests/dnd/classify.test.ts`.
- **35** Playwright e2e tests (Chromium, browser/localStorage adapter): `tests/e2e/**`.
  - `creation-and-columns.spec.ts` — AC1-4, 13, 43-45
  - `dnd.spec.ts` — AC8-12
  - `completion-and-archive.spec.ts` — AC5-7, 14-16, 25-30
  - `hold.spec.ts` — AC20-24 (+ nested-hold safety, plan D3)
  - `undo.spec.ts` — AC35
  - `persistence-and-theme.spec.ts` — AC34, AC47
