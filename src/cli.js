import { greet } from "./greeting.js";

export function run(name) {
  return greet(name);
}

if (process.argv[1]?.endsWith("/cli.js")) {
  console.log(run(process.argv[2] ?? "world"));
}
