# 수집 파서 픽스처

- `synthetic-*`: cheongYak-radar에서 확인한 필드 구조로 만든 **합성 샘플** (실제 공고 아님)
- `real-*`: `scripts/capture-fixtures.mjs`로 받은 **실제 응답** (U3 Code Generation Step 12). API 키·요청 URL 쿼리는 저장하지 않으며 공개 공고 정보만 담는다

- `real-capture.json`: 캡처한 파일·원천 주소(쿼리 없음)·날짜 목록

다시 캡처: `node scripts/capture-fixtures.mjs [gh|applyhome|lh]` (청약홈·LH는 `.env.local`의 `DATA_GO_KR_API_KEY` 필요). 저장 전에 키·URL 쿼리를 빼고 전화번호·이메일을 가리며, HTML은 script·style·주석을 지운다.

실제 응답이 바뀌어 파서가 깨지면, 다시 캡처해 `real-*`를 갱신하고 파서 테스트를 고친다.
