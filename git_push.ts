// Quick git commit and push
import { $ } from "bun";

const SITE = "/home/team/shared/site";

console.log("=== git status ===");
const status = await $`cd ${SITE} && git status --short`.quiet();
console.log(status.text());

console.log("\n=== git add ===");
await $`cd ${SITE} && git add -A`.quiet();
console.log("Added all files");

console.log("\n=== git commit ===");
const commit = await $`cd ${SITE} && git commit -m "feat: Guru Performance Scoreboard — data-driven trust layer with win rates, leaderboard, and Pro-only API"`.quiet();
console.log(commit.text());

console.log("\n=== git push ===");
const push = await $`cd ${SITE} && git push origin main 2>&1`.quiet();
console.log(push.text());

console.log("\n=== DONE ===");
