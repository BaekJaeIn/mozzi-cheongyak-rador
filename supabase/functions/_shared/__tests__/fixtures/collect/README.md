# 수집 파서 픽스처

- `synthetic-*`: cheongYak-radar에서 확인한 필드 구조로 만든 **합성 샘플** (실제 공고 아님)
- `real-*`: `scripts/capture-fixtures.mjs`로 받은 **실제 응답** (U3 Code Generation Step 12). API 키·요청 URL 쿼리는 저장하지 않으며 공개 공고 정보만 담는다

실제 응답이 바뀌어 파서가 깨지면, 다시 캡처해 `real-*`를 갱신하고 파서 테스트를 고친다.
