// VAPID 키 1쌍 만들기 (U6 infrastructure-design §3, Q1=A) — Web Crypto(P-256), 새 라이브러리 없음
//
//   npm run vapid:generate          화면에 세 값과 등록 안내를 출력 (파일에 쓰지 않음)
//   npm run vapid:generate -- --env  KEY=값 세 줄만 출력 (CI: 임시 키를 .env.local에 덧붙일 때)
//
// 개인 키는 이 화면에만 한 번 나온다. 채팅·문서·저장소에 붙여넣지 말 것.
const SUBJECT = "https://mozzi-cheongyak-rador.vercel.app";

const b64url = (bytes) => Buffer.from(bytes).toString("base64url");

const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publicKey = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
const privateKey = (await crypto.subtle.exportKey("jwk", pair.privateKey)).d;

const lines = [`VAPID_PUBLIC_KEY=${publicKey}`, `VAPID_PRIVATE_KEY=${privateKey}`, `VAPID_SUBJECT=${SUBJECT}`];

if (process.argv.includes("--env")) {
  console.log(lines.join("\n"));
} else {
  console.log("새 VAPID 키 (개인 키는 지금 한 번만 보입니다)\n");
  console.log(lines.join("\n"));
  console.log("\n1) Supabase: npx supabase secrets set " + lines.map((l) => l.split("=")[0] + "=<위 값>").join(" "));
  console.log("2) Vercel: Settings → Environment Variables → Production에 같은 이름 3개");
  console.log("자세한 순서: aidlc-docs/construction/U6-pwa-push/code/setup-guide-u6.md");
}
