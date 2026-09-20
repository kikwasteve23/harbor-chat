import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

await import(pathToFileURL(new URL("./migrate.mjs", import.meta.url)).href);

const port = process.env.PORT || "43147";
const child = spawn(
  process.execPath,
  ["./node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", port],
  { stdio: "inherit", env: process.env },
);
child.on("exit", (code) => process.exit(code ?? 1));
