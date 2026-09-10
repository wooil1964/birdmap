# birdmap

이 저장소는 들뫼생태연구회 전국 탐조지도 프로젝트입니다.

- 현재 지도 파일은 `index.html`입니다.
- 오프라인 원본 DB(엑셀)는 `data/` 폴더에 있습니다. 조석 생성기(`.github/scripts/update_tide.py`)가 실제로 읽는 MasterDB는
  `data/birdmap_latest_v24_MasterDB_조석연동_업데이트용.xlsx`입니다.
  그 밖의 작업에서 기준으로 삼을 엑셀은 `AI_WORK_RULES.md` 4항에 따라 사용자가 지정하므로, 특정 파일명을 항상 최신본으로 단정하지 마세요.
- `notices.json`은 탐조기획 공지 파일입니다.
- 이미지 파일은 공지 사진 표시용입니다.
- `index.html` 수정 후에는 GitHub Desktop에서 Commit to main, Push origin을 해야 GitHub Pages에 반영됩니다.
