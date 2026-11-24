// 동행복권에서 latest.json 다음 회차들을 받아 검증 후 draws/{회차}.json, latest.json을 쓴다.
// 하나라도 검증에 실패하면 아무 파일도 쓰지 않고 실패로 끝낸다 (Actions 실패 메일이 알림).
// 새 회차가 없으면 아무것도 하지 않는다.
import { readFile, writeFile, access } from "node:fs/promises";

const API = "https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do";
const MAX_BACKFILL = 20;

const latest = JSON.parse(await readFile("latest.json", "utf8"));
const from = latest.latestRound + 1;
const to = latest.latestRound + MAX_BACKFILL;

const response = await fetch(`${API}?srchStrLtEpsd=${from}&srchEndLtEpsd=${to}`, {
  headers: { Accept: "application/json" },
  signal: AbortSignal.timeout(30_000),
});
const body = await response.text();
if (!response.ok) fail(`HTTP ${response.status}`);

let json;
try {
  json = JSON.parse(body);
} catch {
  // 주소 변경·차단이면 HTML이 온다
  fail(`JSON이 아닌 응답 (앞부분: ${body.slice(0, 200).replace(/\s+/g, " ")})`);
}

const list = json?.data?.list;
if (!Array.isArray(list)) fail(`data.list가 없음: ${body.slice(0, 200)}`);

const draws = list.map(toDraw).sort((a, b) => a.round - b.round);

// latestRound 바로 다음부터 빈 회차 없이 이어져야 한다
draws.forEach((draw, i) => {
  if (draw.round !== from + i) fail(`회차가 이어지지 않음: ${from + i} 자리에 ${draw.round}`);
});
draws.forEach(validate);

if (draws.length === 0) {
  console.log(`새 회차 없음 (최신 ${latest.latestRound}회)`);
  process.exit(0);
}

for (const draw of draws) {
  const path = `draws/${draw.round}.json`;
  if (await exists(path)) fail(`${path}가 이미 있는데 latest.json은 ${latest.latestRound}회`);
  await writeFile(path, format(draw));
}

const last = draws.at(-1);
await writeFile(
  "latest.json",
  format({
    latestRound: last.round,
    drawDate: last.drawDate,
    updatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  }),
);
console.log(`추가: ${draws.map((d) => d.round).join(", ")}회`);

function toDraw(item) {
  const rank = (field) => [1, 2, 3, 4, 5].map((r) => Number(item[`rnk${r}${field}`]));
  const winners = rank("WnNope");
  const ymd = String(item.ltRflYmd);
  return {
    round: Number(item.ltEpsd),
    drawDate: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`,
    numbers: [1, 2, 3, 4, 5, 6].map((i) => Number(item[`tm${i}WnNo`])).sort((a, b) => a - b),
    bonus: Number(item.bnsWnNo),
    prizes: rank("WnAmt"),
    winners,
    // 1등 0명(이월)이면 운영자가 확인 후 채운다. 자동 확정 금지
    firstPrizeOverride: null,
  };
}

function validate(draw) {
  const where = `${draw.round}회`;
  if (!Number.isInteger(draw.round)) fail(`${where}: 회차가 정수가 아님`);
  // 실제 있는 날짜이고 토요일이어야 한다 (추첨은 매주 토요일)
  const date = new Date(`${draw.drawDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== draw.drawDate) {
    fail(`${where}: 추첨일 형식 ${draw.drawDate}`);
  }
  if (date.getUTCDay() !== 6) fail(`${where}: 추첨일이 토요일이 아님 ${draw.drawDate}`);

  const all = [...draw.numbers, draw.bonus];
  if (!all.every((n) => Number.isInteger(n) && n >= 1 && n <= 45)) fail(`${where}: 번호 범위 ${all}`);
  if (new Set(all).size !== 7) fail(`${where}: 번호 중복 ${all}`);

  if (![...draw.prizes, ...draw.winners].every((n) => Number.isSafeInteger(n) && n >= 0)) {
    fail(`${where}: 금액·당첨수가 0 이상 정수가 아님 ${draw.prizes} / ${draw.winners}`);
  }
  if (!draw.prizes.slice(1).every((p) => p > 0)) fail(`${where}: 2~5등 당첨금이 0 ${draw.prizes}`);
  // 1등은 당첨자가 있을 때만 금액 > 0
  if (draw.winners[0] > 0 !== draw.prizes[0] > 0) {
    fail(`${where}: 1등 당첨자 ${draw.winners[0]}명인데 당첨금 ${draw.prizes[0]}`);
  }
}

// 기존 파일과 같은 모양: 2칸 들여쓰기, 숫자 배열은 한 줄
function format(value) {
  const text = JSON.stringify(value, null, 2).replace(/\[\s+([\d,\s]+?)\s+\]/g, (_, inner) =>
    `[${inner.split(/,\s*/).join(", ")}]`,
  );
  return `${text}\n`;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function fail(message) {
  console.error(`수집 실패: ${message}`);
  process.exit(1);
}
