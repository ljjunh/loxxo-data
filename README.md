# loxxo-data

로또안사요 앱이 읽는 로또 6/45 당첨 데이터 (GitHub Pages 정적 JSON).

- `latest.json` — 가장 최근 추첨 회차
- `draws/{회차}.json` — 회차별 당첨번호·보너스·등수별 1게임당 당첨금·당첨 게임 수

형식은 필드 추가만 한다. 삭제·이름 변경은 배포된 앱을 깨뜨린다.
`firstPrizeOverride`는 1등 당첨자가 없는 회차에만 운영자가 확인 후 채운다.

## 자동 수집

`.github/workflows/collect.yml`이 토 21:00·22:00, 일 07:00(KST)에 `scripts/collect.mjs`를 실행한다.
`latest.json` 다음 회차부터 받아 검증하고, 하나라도 실패하면 아무것도 쓰지 않고 실패로 끝난다 (GitHub 실패 메일이 알림).
수동 실행: Actions 탭 → collect → Run workflow
