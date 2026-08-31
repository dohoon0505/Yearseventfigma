# HANDOFF — 세션 인수인계

> 마지막 갱신: 2026-07-16 · HEAD `ec33c246` · origin/main 동기화 · 작업 규약은 [CLAUDE.md](CLAUDE.md) 참조

## 현재 상태
- 배포: main 푸시 → GitHub Pages 자동(`.github/workflows/deploy.yml`, 레포 루트 전체).
- 미커밋 변경 없음. 미추적 파일(`mockups/`·`MIGRATION_GUIDE.md`·`백엔드 참고문서.docx`·삭제된 `guidelines/`)은 의도적 로컬 상태 — 건드리지 말 것.
- 개발 서버는 꺼져 있을 가능성 높음 → `node serve.mjs` (localhost:8000).

## 직전 세션(2026-07-13~16)에서 완료된 것
1. **B2C 통합주문관리 모달 전면 재설계** (읽기↔편집 전환형, 구역 카드, 17px 값 타이포) — 상태 4단계 개편 포함
2. **담당자 워크플로**: 미지정 주문 자동 피커(스택 모달) → 커스텀 드롭다운+'직접 입력…' 2단 / 담당자 헤더 이관 / staff-mock 소스 통합
3. **시스템 관리 > 담당자 관련설정** 신설 (`#/admin/staff`) — 이름·부서·연락처·알림 ON/OFF 토글, B2C 피커와 라이브 연동
4. **필터 리디자인**: claude.ai/design 시안(.dc.html) 적용 → `.bf-*` 공용 체계로 승격, **전 ADMIN 페이지 5곳** 확산 (언더라인 탭·세그먼트·인라인 라벨 검색·datepicker·접이식 상세)
5. 버그 수정: admin.css 고아 중괄호(잠복), datepicker 잘림(overflow), focus-visible 이중 링, pricing 탭 활성 표시, 상품명 오타 4건(쌀화환·탁상용·미니화분·1단형)

## 보류 / 열린 항목
- **거래처 기업 A·B·C 엣지케이스 설계**: 확정됐지만 구현 보류 (auto-memory `client-edge-cases-design.md` + 플랜 파일 참조)
- 의도적 미이식(H→Y): mobile-order/, 반입가이드 표, delivery-fees 실데이터 (auto-memory `harim-migration.md`)
- admin-clients 레거시 정리 포인트 (동 memory 참조)
- **근조화환 B2C 퍼널 사이트(공감→아코디언→구매, 장례식장 랜딩, SEO)는 이 레포 대상 아님** — 사용자가 다른 프로젝트로 보낼 요청을 잘못 전달했던 것. 이 레포에서 다시 요청받으면 대상 프로젝트를 먼저 확인할 것.

## 참조 위치
- auto-memory: `~/.claude/projects/C--Users-ehgns-Documents-GitHub-Yearseventfigma/memory/MEMORY.md` (커밋 규칙·디자인 결정·워크플로 학습)
- B2C 모달 미리보기 아트팩트(사용자 요청 시 갱신·재게시): https://claude.ai/code/artifact/b89f6bff-be29-43a3-85ee-181df9dcfd47
- 필터 시안 정본: claude.ai/design 프로젝트 `5ad2963b-4434-40a9-bd0d-df144dd4d45b` (`DesignSync` 툴)
