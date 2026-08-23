import { greet } from "./greeting.js";

export function run(name) {
  return greet({ name: name.trim() });
}

if (process.argv[1]?.endsWith("/cli.js")) {
  console.log(run(process.argv[2] ?? "world"));
}
