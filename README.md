# ADBlockBuster-Chrome_dnr

Chrome MV3 기반 광고 차단 확장 프로그램.

## 정적 DNR 룰셋 갱신

EasyList 최신본을 내려받아 `ruleset/block1.json`과 `easylist.version`을 재생성하려면 아래 순서를 따릅니다.

1. 프로젝트 루트에서 스크립트를 직접 실행:
   ```bash
   node js/cicd/dnr_generator.js
   ```
   또는 `cd js/cicd` 후
   ```bash
   npm run update-rules
   ```
2. 스크립트가 EasyList 버전을 확인해 변경이 있을 때만 JSON을 갱신합니다. 완료 후 콘솔에 새 버전과 룰 개수가 출력됩니다.
3. 생성된 `ruleset/block1.json`은 바로 크롬 확장에서 사용되며, `easylist.version`은 다음 업데이트 시 비교에 쓰입니다.

> 참고: 런타임 UI의 “업데이트 실행” 버튼은 더 이상 정적 룰셋을 교체하지 않습니다. 확장 배포 전 위 스크립트를 실행해 최신 룰을 포함시키세요.
