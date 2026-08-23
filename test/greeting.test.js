import test from "node:test";
import assert from "node:assert/strict";
import { greet } from "../src/greeting.js";

test("名前を使って挨拶を生成する", () => {
  assert.equal(greet({ name: "Alice" }), "Hello, Alice!");
});