// Test scoreboard API
const BASE = "http://localhost:3000";

// Test 1: No auth (should get 401)
console.log("=== Test 1: No auth ===");
const r1 = await fetch(`${BASE}/api/scoreboard`);
console.log(`Status: ${r1.status}`);
const b1 = await r1.json();
console.log(JSON.stringify(b1));

// Test 2: Create a free user and test
console.log("\n=== Test 2: Signup free user ===");
const r2 = await fetch(`${BASE}/api/auth/signup`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: `scoretest${Date.now()}@test.com`, password: "test1234" }),
});
const d2 = await r2.json();
console.log(`Status: ${r2.status}, token: ${d2.token?.slice(0,10)}...`);

// Test 3: Free user hits scoreboard (should get 403)
console.log("\n=== Test 3: Free user → scoreboard ===");
const r3 = await fetch(`${BASE}/api/scoreboard`, {
  headers: { Authorization: `Bearer ${d2.token}` },
});
const b3 = await r3.json();
console.log(`Status: ${r3.status}`);
console.log(JSON.stringify(b3));

// Test 4: Upgrade and test
console.log("\n=== Test 4: Upgrade to Pro ===");
const r4 = await fetch(`${BASE}/api/subscription/upgrade`, {
  method: "POST",
  headers: { Authorization: `Bearer ${d2.token}` },
});
const d4 = await r4.json();
console.log(`Status: ${r4.status}, tier: ${d4.tier}`);

// Test 5: Pro user hits scoreboard
console.log("\n=== Test 5: Pro user → scoreboard ===");
const r5 = await fetch(`${BASE}/api/scoreboard`, {
  headers: { Authorization: `Bearer ${d2.token}` },
});
const d5 = await r5.json();
console.log(`Status: ${r5.status}`);
console.log("Gurus:", d5.gurus?.length);
console.log("Meta:", JSON.stringify(d5.meta));
if (d5.gurus) {
  for (const g of d5.gurus.slice(0, 2)) {
    console.log(`  ${g.name}: win_rate=${g.win_rate}%, avg_return=${g.avg_return_pct}%, trades=${g.total_trades}`);
  }
}

// Test 6: Single guru detail
console.log("\n=== Test 6: Guru detail ===");
const r6 = await fetch(`${BASE}/api/scoreboard/warren-buffett`, {
  headers: { Authorization: `Bearer ${d2.token}` },
});
const d6 = await r6.json();
console.log(`Status: ${r6.status}, trades: ${d6.trades?.length}, wins: ${d6.wins}/${d6.total_trades}`);

console.log("\n=== ALL TESTS DONE ===");
