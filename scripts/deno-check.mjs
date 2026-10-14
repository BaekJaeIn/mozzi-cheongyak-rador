// _shared(테스트 제외)와 Edge Function 진입점을 deno check로 검사한다.
// Deno 전용 코드가 Node 전용 API를 쓰지 않는지, Deno 쪽 import 규칙(.ts 확장자)을 지키는지 확인한다.
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["supabase/functions"];
const files = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(path);
    } else if (name.endsWith(".ts")) {
      files.push(path);
    }
  }
}

roots.forEach(walk);

if (files.length === 0) {
  console.log("deno check: 검사할 파일 없음");
  process.exit(0);
}

const result = spawnSync("deno", ["check", ...files], { stdio: "inherit", shell: process.platform === "win32" });
if (result.error) {
  console.error("deno를 실행할 수 없습니다. https://deno.com 에서 설치하거나 CI에서 확인하세요.");
  process.exit(1);
}
process.exit(result.status ?? 1);
