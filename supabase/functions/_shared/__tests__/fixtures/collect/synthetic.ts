// 합성 샘플 (실제 공고 아님) — cheongYak-radar에서 확인한 필드 구조. Step 12에서 real-* 픽스처로 보강
export const SYNTHETIC_APPLYHOME = {
  currentCount: 3,
  data: [
    {
      PBLANC_NO: "2026000101",
      HOUSE_MANAGE_NO: "2026000101",
      HOUSE_NM: "하남교산 A2블록 공공분양",
      HSSPLY_ADRES: "경기도 하남시 교산동 일원",
      SUBSCRPT_AREA_CODE_NM: "경기",
      RENT_SECD_NM: "분양주택",
      HOUSE_DTL_SECD_NM: "국민",
      HOUSE_SECD_NM: "APT",
      BSNS_MBY_NM: "한국토지주택공사",
      RCRIT_PBLANC_DE: "2026-10-13",
      SPSPLY_RCEPT_BGNDE: "2026-10-20",
      RCEPT_BGNDE: "2026-10-21",
      RCEPT_ENDDE: "2026-10-22",
      PRZWNER_PRESNATN_DE: "2026-10-30",
      CNTRCT_CNCLS_BGNDE: "2026-11-10",
      CNTRCT_CNCLS_ENDDE: "2026-11-12",
      PBLANC_URL: "https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetail.do?houseManageNo=2026000101",
    },
    { PBLANC_NO: "2026000102", HOUSE_NM: "부산 어딘가 아파트", SUBSCRPT_AREA_CODE_NM: "부산", RCEPT_ENDDE: "2026-10-30" },
    { PBLANC_NO: "2026000103", HOUSE_NM: "인천계양 A10블록 민간", SUBSCRPT_AREA_CODE_NM: "인천", RENT_SECD_NM: "분양주택", HOUSE_DTL_SECD_NM: "민영", RCEPT_BGNDE: "20261101" },
  ],
};

export const SYNTHETIC_LH_LIST = [
  { dsSch: [{ PG_SZ: "100", PAGE: "1" }] },
  {
    dsList: [
      {
        PAN_ID: "2015122300012345",
        PAN_NM: "[경기남부] 고양창릉 S-3블록 국민임대 예비입주자 모집",
        CNP_CD_NM: "경기도",
        UPP_AIS_TP_NM: "임대주택",
        AIS_TP_CD_NM: "국민임대",
        PAN_NT_ST_DT: "2026.10.14",
        CLSG_DT: "2026.10.29",
        DTL_URL: "https://apply.lh.or.kr/lhapply/apply/wt/wrtanc/selectWrtancInfo.do?panId=2015122300012345",
        CCR_CNNT_SYS_DS_CD: "03",
        SPL_INF_TP_CD: "050",
        UPP_AIS_TP_CD: "06",
        AIS_TP_CD: "07",
      },
      { PAN_ID: "2015122300099999", PAN_NM: "고양창릉 상가 입찰", CNP_CD_NM: "경기도", UPP_AIS_TP_NM: "상가" },
      { PAN_ID: "2015122300088888", PAN_NM: "[부산울산] 행복주택", CNP_CD_NM: "부산광역시", UPP_AIS_TP_NM: "임대주택" },
    ],
  },
];

export const SYNTHETIC_LH_DETAIL = [
  { dsSch: [{ PAN_ID: "2015122300012345" }] },
  {
    dsSplScdl: [
      { HS_SBSC_ACP_TRG_CD_NM: "우선공급", ACP_DTTM: "2026.10.20 10:00 ~ 2026.10.21 17:00", PZWR_ANC_DT: "2026.11.05" },
      { HS_SBSC_ACP_TRG_CD_NM: "일반공급", ACP_DTTM: "2026.10.22 10:00 ~ 2026.10.23 17:00", PZWR_ANC_DT: "2026.11.05" },
    ],
  },
  {
    dsAhflInfo: [
      { SL_PAN_AHFL_DS_CD_NM: "공고문", CMN_AHFL_NM: "고양창릉S3_공고문.pdf", AHFL_URL: "https://apply.lh.or.kr/lhapply/lhFile.do?fileid=111" },
      { SL_PAN_AHFL_DS_CD_NM: "기타", CMN_AHFL_NM: "평면도.pdf", AHFL_URL: "https://apply.lh.or.kr/lhapply/lhFile.do?fileid=222" },
    ],
  },
];

export const SYNTHETIC_GH_MAIN = `
<html><body>
<script>
// NetFunnel_Action(...) 주석 처리됨
</script>
<a href="#" data-pbancNo="1234" data-bizTyNm="행복주택" data-bizTyCd="06">
  <p class="leading-6 font-bold">남양주왕숙 행복주택 입주자 모집</p>
  <p class="calender_box">신청기간 2026.10.18 ~ 2026.10.21</p>
</a>
<a href="#" data-pbancNo="1234" data-bizTyNm="행복주택" data-bizTyCd="06"><p class="leading-6">중복</p></a>
<a href="#" data-pbancNo="5678" data-bizTyNm="상가" data-bizTyCd="09"><p class="leading-6">상가 입찰</p></a>
</body></html>`;

export const SYNTHETIC_GH_QUEUE = `<script>
  NetFunnel_Action({action_id:"main"}, function(){});
</script>`;

export const SYNTHETIC_GH_DETAIL = `
<div class="file_list">
  <a href="/cmmn/fileDown.do?atchFileId=FILE_1&amp;fileSn=0">남양주왕숙 행복주택 입주자모집공고문.pdf</a>
  <a href="javascript:void(0)">미리보기.pdf</a>
  <a href="/cmmn/fileDown.do?atchFileId=FILE_2&amp;fileSn=0">신청서.hwp</a>
</div>`;
