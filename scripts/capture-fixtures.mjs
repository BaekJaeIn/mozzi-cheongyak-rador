// 수집 파서용 실제 응답 캡처 (U3 Code Generation Step 12, RK-U3-2)
// 청약홈 1쪽·LH 목록 1쪽·LH 상세 2건·GH 메인·GH 상세 2건(주소 형식별 1건)을 받아
// supabase/functions/_shared/__tests__/fixtures/collect/real-*에 저장한다.
//
// 실행: node scripts/capture-fixtures.mjs [gh|applyhome|lh ...]   (인자 없으면 전부)
// - 공공데이터 키는 .env.local(또는 환경 변수)의 DATA_GO_KR_API_KEY. 없으면 청약홈·LH는 건너뛴다.
// - 저장 전: 키·요청 URL 쿼리 제거, 전화번호·이메일 가림, HTML은 script·style·주석 제거. 키가 남아 있으면 저장하지 않는다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "supabase/functions/_shared/__tests__/fixtures/collect";
const UA = "MojjineAlimi/0.1 (+https://github.com/BaekJaeIn/mozzi-cheongyak-rador)";
const APPLYHOME_ENDPOINT = "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail";
const LH_LIST_ENDPOINT = "https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1";
const LH_DETAIL_ENDPOINT = "https://apis.data.go.kr/B552555/lhLeaseNoticeDtlInfo1/getLeaseNoticeDtlInfo1";
const LH_DETAIL_KEYS = ["PAN_ID", "CCR_CNNT_SYS_DS_CD", "SPL_INF_TP_CD", "UPP_AIS_TP_CD", "AIS_TP_CD"];
const GH_BASE = "https://apply.gh.or.kr";
const APPLYHOME_KEEP_ROWS = 40;

function readEnvLocal() {
  if (!existsSync(".env.local")) return {};
  const env = {};
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const apiKey = process.env.DATA_GO_KR_API_KEY || readEnvLocal().DATA_GO_KR_API_KEY || "";
const serviceKey = apiKey.includes("%") ? apiKey : encodeURIComponent(apiKey);
const secrets = [apiKey, serviceKey, decodeURIComponent(serviceKey)].filter((s) => s.length >= 8);

const safeUrl = (url) => {
  const u = new URL(url);
  return `${u.origin}${u.pathname}`;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, accept) {
  const res = await fetch(url, { headers: { "user-agent": UA, ...(accept ? { accept } : {}) }, signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${safeUrl(url)}`);
  await sleep(1_000); // 원천 서버에 부담 주지 않게
  return text;
}

function maskText(s) {
  let out = s
    .replace(/\b0\d{1,3}-\d{3,4}-\d{4}\b/g, "000-0000-0000")
    .replace(/\b1\d{3}-\d{4}\b/g, "0000-0000")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "masked@example.invalid");
  for (const k of secrets) out = out.split(k).join("<REDACTED>");
  return out;
}

function maskJson(value) {
  if (typeof value === "string") return maskText(value);
  if (Array.isArray(value)) return value.map(maskJson);
  if (value && typeof value === "object") {
    // 전화번호 필드(MDHS_TELNO, SIL_OFC_TLNO 등)는 하이픈 없이 오기도 해서 이름으로 가린다 (열 이름 행의 글자는 둔다)
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, /TELNO|TLNO/i.test(k) && typeof v === "string" && /\d/.test(v) ? "0000000000" : maskJson(v)]),
    );
  }
  return value;
}

function cleanHtml(html) {
  return maskText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{2,}/g, "\n"),
  );
}

const saved = [];
function save(name, content, sourceUrl) {
  const text = typeof content === "string" ? content : `${JSON.stringify(content, null, 2)}\n`;
  if (secrets.some((k) => text.includes(k))) throw new Error(`${name}: 키가 남아 있어 저장하지 않음`);
  writeFileSync(join(OUT, name), text);
  saved.push({ file: name, source: safeUrl(sourceUrl), bytes: Buffer.byteLength(text) });
  console.log(`저장 ${name} (${Buffer.byteLength(text)} bytes) ← ${safeUrl(sourceUrl)}`);
}

// ---------- GH ----------
async function captureGh() {
  const mainUrl = `${GH_BASE}/co/coa/selectMainView.do`;
  const html = await get(mainUrl);
  save("real-gh-main.html", cleanHtml(html), mainUrl);

  // 상세 주소 형식(sr7150·sr7155·sr7170)별로 첫 공고 하나씩, 최대 2건
  const paths = { "06": "sr7155", "07": "sr7170" };
  const picked = new Map();
  for (const m of html.matchAll(/<a\b[^>]*\bdata-pbancNo="(\d+)"[^>]*>/gi)) {
    const cd = m[0].match(/data-bizTyCd="([^"]*)"/i)?.[1] ?? "";
    if (/상가/.test(m[0])) continue;
    const path = paths[cd] ?? "sr7150";
    if (!picked.has(path)) picked.set(path, m[1]);
  }
  for (const [path, pbancNo] of [...picked].slice(0, 2)) {
    const url = `${GH_BASE}/sb/sr/${path}/selectPbancDetailView.do?pbancNo=${pbancNo}`;
    save(`real-gh-detail-${path}.html`, cleanHtml(await get(url)), url);
  }
}

// ---------- 청약홈 ----------
async function captureApplyhome() {
  const url = `${APPLYHOME_ENDPOINT}?serviceKey=${serviceKey}&page=1&perPage=100`;
  const json = JSON.parse(await get(url, "application/json"));
  const rows = Array.isArray(json.data) ? json.data : [];
  // 경기·인천 행을 앞에 두고 일부만 (크기 줄이기)
  const target = rows.filter((r) => /경기|인천/.test(r.SUBSCRPT_AREA_CODE_NM ?? ""));
  const others = rows.filter((r) => !target.includes(r));
  const kept = [...target, ...others].slice(0, APPLYHOME_KEEP_ROWS);
  save("real-applyhome.json", maskJson({ ...json, currentCount: kept.length, data: kept }), url);
}

// ---------- LH ----------
const ymd = (d) => d.toISOString().slice(0, 10).replaceAll("-", "");
function lhRows(json, key) {
  if (Array.isArray(json)) return json.find((b) => b && Array.isArray(b[key]))?.[key] ?? [];
  return Array.isArray(json?.[key]) ? json[key] : [];
}

async function captureLh() {
  const today = new Date();
  const from = new Date(today.getTime() - 180 * 86_400_000);
  const to = new Date(today.getTime() + 365 * 86_400_000);
  const url = `${LH_LIST_ENDPOINT}?serviceKey=${serviceKey}&PG_SZ=100&PAGE=1&PAN_NT_ST_DT=${ymd(from)}&CLSG_DT=${ymd(to)}`;
  const text = await get(url, "application/json");
  if (/Forbidden|errMsg|등록되지|SERVICE_KEY|returnReasonCode/i.test(text)) throw new Error("LH 목록이 오류 봉투 (키 승인 확인)");
  const json = JSON.parse(text);
  save("real-lh-list.json", maskJson(json), url);

  // 경기·인천 주택 공고 중 공급 유형이 다른 2건
  const rows = lhRows(json, "dsList").filter(
    (r) => /경기|인천/.test(`${r.CNP_CD_NM ?? ""} ${r.PAN_NM ?? ""}`) && !/토지|상가|용지|점포/.test(`${r.UPP_AIS_TP_NM ?? ""} ${r.PAN_NM ?? ""}`),
  );
  const chosen = [];
  for (const r of rows) {
    if (chosen.length === 2) break;
    if (chosen.some((c) => c.AIS_TP_CD === r.AIS_TP_CD) && rows.length > 2) continue;
    chosen.push(r);
  }
  for (const [i, r] of chosen.entries()) {
    const query = LH_DETAIL_KEYS.map((k) => `${k}=${encodeURIComponent(r[k] ?? "")}`).join("&");
    const detailUrl = `${LH_DETAIL_ENDPOINT}?serviceKey=${serviceKey}&${query}`;
    const detail = await get(detailUrl, "application/json");
    if (/Forbidden|errMsg|등록되지|SERVICE_KEY|returnReasonCode/i.test(detail)) throw new Error("LH 상세가 오류 봉투 (상세 API 키 승인 확인)");
    save(`real-lh-detail-${i + 1}.json`, maskJson(JSON.parse(detail)), detailUrl);
  }
}

// ---------- 실행 ----------
const wanted = new Set(process.argv.slice(2).length ? process.argv.slice(2) : ["gh", "applyhome", "lh"]);
mkdirSync(OUT, { recursive: true });
const failures = [];
for (const [name, run, needsKey] of [
  ["gh", captureGh, false],
  ["applyhome", captureApplyhome, true],
  ["lh", captureLh, true],
]) {
  if (!wanted.has(name)) continue;
  if (needsKey && !apiKey) {
    console.log(`${name}: DATA_GO_KR_API_KEY가 없어 건너뜀 (.env.local에 공공데이터포털 Decoding 키를 넣으세요)`);
    continue;
  }
  try {
    await run();
  } catch (e) {
    failures.push(name);
    console.error(`${name} 실패: ${maskText(e instanceof Error ? e.message : String(e))}`);
  }
}
if (saved.length) {
  const manifestPath = join(OUT, "real-capture.json");
  const prev = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { files: [] };
  const files = [...prev.files.filter((f) => !saved.some((s) => s.file === f.file)), ...saved.map((s) => ({ ...s, capturedAt: new Date().toISOString().slice(0, 10) }))];
  writeFileSync(manifestPath, `${JSON.stringify({ files: files.sort((a, b) => a.file.localeCompare(b.file)) }, null, 2)}\n`);
}
process.exitCode = failures.length ? 1 : 0;
