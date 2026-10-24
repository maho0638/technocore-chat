// Fork-only focused Chromium check for flop-labs/technocore-chat#1029.
// Not the full browser gate. Runtime code is unchanged from source commit 4e7364ad.
import { chromium } from "playwright";
const PORT = process.argv[2] || "8099";
const BASE = `http://127.0.0.1:${PORT}`;
let failures = 0;
function check(label, ok, detail = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}
const browser = await chromium.launch({
  args: ["--enable-features=WebMCP"],
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
// --------------------------------------------------------- Unicode message length parity
// Native maxlength counts UTF-16 units; store.clean_text counts Unicode code points.
// Exercise real Chromium text insertion, not fill() alone (which bypasses native limits).
{
  console.log("Unicode composer length");
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  let posts = 0;
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url() === `${BASE}/r/unicode-length`) posts++;
  });
  await page.goto(`${BASE}/humans#r/unicode-length`, { waitUntil: "domcontentloaded" });
  await page.locator("#text").focus();
  const cdp = await context.newCDPSession(page);
  const emoji = "😀";
  await cdp.send("Input.insertText", { text: emoji.repeat(3000) });
  check("Unicode: paste retains all 3000 non-BMP code points",
        (await page.inputValue("#text")) === emoji.repeat(3000));

  await Promise.all([
    page.waitForResponse((response) =>
      response.request().method() === "POST" &&
      response.url() === `${BASE}/r/unicode-length`),
    page.click("#send"),
  ]);
  let view = await (await page.request.get(`${BASE}/r/unicode-length?format=json`)).json();
  check("Unicode: server stores the full 3000-emoji message",
        view.messages.some((message) => message.text === emoji.repeat(3000)));

  await page.fill("#text", "");
  await page.locator("#text").focus();
  await cdp.send("Input.insertText", { text: emoji.repeat(4097) });
  check("Unicode: native insertion retains all 4097 over-limit code points",
        (await page.inputValue("#text")) === emoji.repeat(4097));
  const before = posts;
  await page.click("#send");
  check("Unicode: over-limit draft is not posted", posts === before);
  check("Unicode: over-limit draft remains editable",
        (await page.inputValue("#text")) === emoji.repeat(4097));
  check("Unicode: over-limit draft gets a visible error",
        (await page.textContent("#status")).includes("error") &&
        (await page.textContent("#status")).includes("4096"));

  await page.fill("#text", "a".repeat(3000));
  check("Unicode: ASCII control remains intact",
        (await page.inputValue("#text")) === "a".repeat(3000));
  await page.fill("#text", "");
  await page.locator("#text").focus();
  await cdp.send("Input.insertText", { text: emoji.repeat(4096) });
  check("Unicode: native insertion retains all 4096 boundary code points",
        (await page.inputValue("#text")) === emoji.repeat(4096));
  await Promise.all([
    page.waitForResponse((response) =>
      response.request().method() === "POST" &&
      response.url() === `${BASE}/r/unicode-length`),
    page.click("#send"),
  ]);
  view = await (await page.request.get(`${BASE}/r/unicode-length?format=json`)).json();
  check("Unicode: exact 4096-code-point boundary is accepted",
        view.messages.some((message) => message.text === emoji.repeat(4096)));
  check("Unicode: no page errors", errors.length === 0, errors.join("; "));
  await context.close();
}
await browser.close();
if (failures) process.exitCode = 1;
