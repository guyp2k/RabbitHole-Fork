"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");

const script = fs.readFileSync(require.resolve("../scripts/test-docker-lock-recovery.sh"), "utf8");
const restart = script.slice(script.indexOf("crash_and_restart() {"), script.indexOf("\n}\n", script.indexOf("crash_and_restart() {")) + 2);

test("the crash-restart check retries until the restarted app actually reuses the dead owner's PID, instead of failing on the first unlucky PID", () => {
  assert.match(restart, /for attempt in 1 2 3 4 5; do/);
  assert.match(restart, /if \[\[ "\$\(owner_pid\)" == "\$previous_pid" \]\]; then/);
  assert.match(restart, /fail "The test did not reproduce PID reuse for \$mode in 5 restarts"/);
});

test("the crash-restart check still proves the sentinel and live-owner exclusion once PID reuse happens", () => {
  const success = restart.slice(restart.indexOf('if [[ "$(owner_pid)" == "$previous_pid" ]]; then'));
  assert.match(success, /check_sentinel\s+check_competing_owner\s+printf 'Passed: forced restart with PID reuse/);
});
