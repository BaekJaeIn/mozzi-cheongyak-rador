// 홈 화면 아이콘 만들기 (tech-stack-decisions: 아이콘, BR-U6-75) — 새 라이브러리 없이 Playwright(Chromium) 캔버스로 그린다
//
//   node scripts/render-icons.mjs --source <사진.png>   원본 사진에서 머리 부분을 잘라 assets/icon-source.jpg로 저장 + 아이콘 생성
//   node scripts/render-icons.mjs                        assets/icon-source.jpg로 아이콘만 다시 생성
//
// 결과: public/icons/icon-192.png·icon-512.png(any), maskable-192.png·maskable-512.png(얼굴 82% + 여백),
//       apple-touch-icon.png(180), src/app/icon.png(브라우저 탭, 64)
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

// 원본 사진(941×1672, 2026-10-16 첨부)에서 머리 전체(귀~턱)가 들어가는 정사각형 — 중심과 한 변(px)
const CROP = { cx: 470, cy: 915, side: 1140 };
const SOURCE_SIZE = 1024;
const MASKABLE_SCALE = 0.82; // 둥글게 잘려도 귀·턱이 남게 (maskable 안전 영역 80% 원)

const args = process.argv.slice(2);
const sourceArg = args[args.indexOf("--source") + 1];
const fromPhoto = args.includes("--source") && sourceArg;

const toDataUrl = (path) => `data:image/${path.endsWith(".jpg") ? "jpeg" : "png"};base64,${readFileSync(path).toString("base64")}`;

const browser = await chromium.launch();
const page = await browser.newPage();

/** 브라우저 안에서 그리기: 원본 이미지의 (sx, sy, side) 정사각형을 size 캔버스 가운데에 scale만큼, 흰 바탕 */
async function render(dataUrl, crop, size, scale, type = "image/png") {
  const url = await page.evaluate(
    async ({ dataUrl, crop, size, scale, type }) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const g = c.getContext("2d");
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, size, size);
      g.imageSmoothingQuality = "high";
      const d = size * scale;
      const o = (size - d) / 2;
      const k = d / crop.side;
      g.drawImage(img, o - crop.x * k, o - crop.y * k, img.naturalWidth * k, img.naturalHeight * k);
      return c.toDataURL(type, 0.9);
    },
    { dataUrl, crop, size, scale, type },
  );
  return Buffer.from(url.split(",")[1], "base64");
}

if (fromPhoto) {
  const crop = { x: CROP.cx - CROP.side / 2, y: CROP.cy - CROP.side / 2, side: CROP.side };
  mkdirSync("assets", { recursive: true });
  writeFileSync("assets/icon-source.jpg", await render(toDataUrl(sourceArg), crop, SOURCE_SIZE, 1, "image/jpeg"));
  console.log(`assets/icon-source.jpg (${SOURCE_SIZE}px) 만듦`);
}

const source = toDataUrl("assets/icon-source.jpg");
const full = { x: 0, y: 0, side: SOURCE_SIZE };
mkdirSync("public/icons", { recursive: true });
const outputs = [
  ["public/icons/icon-192.png", 192, 1],
  ["public/icons/icon-512.png", 512, 1],
  ["public/icons/maskable-192.png", 192, MASKABLE_SCALE],
  ["public/icons/maskable-512.png", 512, MASKABLE_SCALE],
  ["public/icons/apple-touch-icon.png", 180, 1],
  ["src/app/icon.png", 64, 1],
];
for (const [path, size, scale] of outputs) {
  writeFileSync(path, await render(source, full, size, scale));
  console.log(`${path} (${size}px)`);
}
await browser.close();
