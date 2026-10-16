// Edge Function CPU 2초 한도 점검 (infrastructure-design §4, Q2=A)
// 실행: npx -y deno@2.5.6 run scripts/measure-push-cpu.ts [건수]
// 웹 푸시 1건 = 내용 암호화(ECDH·HKDF·AES-GCM) + VAPID 서명(origin마다 1번 재사용). 네트워크는 빼고 계산만 잰다.
import { encryptPayload, decodePushKeys } from "../supabase/functions/_shared/push/encrypt.ts";
import { encodePayload, testPayload } from "../supabase/functions/_shared/push/payload.ts";
import { createVapidSigner, generateVapidKeys } from "../supabase/functions/_shared/push/vapid.ts";

const n = Number(Deno.args[0] ?? "1000");
const keys = decodePushKeys(
  "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  "BTBZMqHH6r4Tts7J_aSIgg",
);
const signer = await createVapidSigner({ ...(await generateVapidKeys()), subject: "https://mozzi-cheongyak-rador.vercel.app" });
const body = encodePayload(testPayload());

await encryptPayload(body, keys); // 준비 운동
const started = performance.now();
for (let i = 0; i < n; i++) {
  await encryptPayload(body, keys);
  await signer.authorization("https://fcm.googleapis.com/fcm/send/x", 1_790_000_000);
}
const ms = performance.now() - started;
console.log(JSON.stringify({ count: n, totalMs: Math.round(ms), perPushMs: Number((ms / n).toFixed(3)) }));
