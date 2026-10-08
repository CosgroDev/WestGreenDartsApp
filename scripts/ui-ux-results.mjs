import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";

// Read-only result checks against the isolated UI harness. This never creates,
// changes, reopens or deletes a session and never uses production credentials.
export async function verifyResultScreens({ browser, runtime, out }) {
  const rt = runtime.rt ?? runtime;
  assert.equal(
    rt.synthetic,
    true,
    "Result checks require synthetic local data.",
  );
  for (const url of [rt.appUrl, rt.adapterUrl]) {
    assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname));
  }
  mkdirSync(out, { recursive: true });
  const headers = {
    apikey: "synthetic-audit-service-key",
    Authorization: "Bearer synthetic-audit-service-key",
  };
  const modes = [
    { mode: "x01", table: "practice_sessions", path: "/practice/scoring" },
    { mode: "121", table: "game_121_sessions", path: "/practice/121/scoring" },
    {
      mode: "doubles",
      table: "doubles_practice_sessions",
      path: "/practice/doubles/scoring",
    },
    {
      mode: "checkout",
      table: "checkout_practice_sessions",
      path: "/practice/checkout/scoring",
    },
  ];
  const targets = await Promise.all(
    modes.map(async (mode) => {
      const url = new URL("/rest/v1/" + mode.table, rt.adapterUrl);
      url.search = new URLSearchParams({
        select: "id,status",
        team_id: "eq." + rt.team,
        status: mode.mode === "121" ? "eq.abandoned" : "eq.completed",
        limit: "1",
      });
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(
        response.status,
        200,
        `Could not read ${mode.mode} result fixture.`,
      );
      const [session] = await response.json();
      assert.ok(
        session && session.status !== "in_progress",
        `No ended ${mode.mode} session is available.`,
      );
      return {
        ...mode,
        status: session.status,
        route: mode.path + "?session=" + session.id,
      };
    }),
  );
  const captures = [],
    pageErrors = [],
    failures = [];
  for (const theme of ["dark", "light"]) {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    await context.addCookies([rt.cookie]);
    await context.addInitScript(
      (theme) => localStorage.setItem("wgd-appearance-v1", theme),
      theme,
    );
    const page = await context.newPage();
    page.on("pageerror", (error) =>
      pageErrors.push({
        route: page.url().replace(rt.appUrl, ""),
        error: error.message,
      }),
    );
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
      for (const target of targets) {
        try {
          const response = await page.goto(rt.appUrl + target.route, {
            waitUntil: "networkidle",
          });
          await page
            .getByRole("link", { name: "Play again", exact: true })
            .waitFor({ timeout: 20000 });
          const metric = await page.evaluate(() => {
            const resultActions = [...document.querySelectorAll("button,a")]
              .filter((el) => {
                const box = el.getBoundingClientRect();
                const text = el.textContent.trim().replace(/\s+/g, " ");
                return (
                  box.width &&
                  box.height &&
                  /^(Play again|Undo|Back to)/.test(text)
                );
              })
              .map((el) => {
                const box = el.getBoundingClientRect();
                return {
                  name: el.textContent.trim().replace(/\s+/g, " "),
                  tag: el.tagName,
                  x: box.x,
                  width: box.width,
                  height: box.height,
                  disabled: !!el.disabled,
                };
              });
            return {
              theme: document.documentElement.dataset.theme,
              width: innerWidth,
              height: innerHeight,
              documentWidth: document.documentElement.scrollWidth,
              title: document.querySelector("h1,h2")?.textContent,
              actions: resultActions,
              error: document.body.innerText.includes(
                "The request could not be completed",
              ),
            };
          });
          const capture = {
            mode: target.mode,
            sessionStatus: target.status,
            route: target.route,
            status: response.status(),
            ...metric,
          };
          captures.push(capture);
          if (
            capture.status !== 200 ||
            capture.theme !== theme ||
            capture.documentWidth > width ||
            capture.error ||
            capture.actions.some(
              (action) =>
                action.height < 44 ||
                action.x < -1 ||
                action.x + action.width > width + 1,
            )
          )
            failures.push(capture);
          if (width === 390)
            await page.screenshot({
              path: `${out}/results-${target.mode}-${theme}-${width}.png`,
              fullPage: true,
            });
          console.log(
            "RESULT_SCREEN_CHECK",
            JSON.stringify({
              mode: target.mode,
              theme,
              width,
              documentWidth: metric.documentWidth,
              minimumActionHeight: Math.min(
                ...metric.actions.map((a) => a.height),
              ),
              passed: !failures.includes(capture),
            }),
          );
        } catch (error) {
          const failure = {
            mode: target.mode,
            theme,
            width,
            route: target.route,
            error: error.message,
          };
          captures.push(failure);
          failures.push(failure);
          console.error("RESULT_SCREEN_FAIL", JSON.stringify(failure));
        }
      }
    }
    await context.close();
  }
  const report = {
    dataset:
      "Read-only completed and ended synthetic local sessions; real production Next.js application; Chromium",
    captures,
    pageErrors,
    failures,
  };
  writeFileSync(out + "/result-checks.json", JSON.stringify(report, null, 2));
  assert.equal(pageErrors.length, 0, JSON.stringify(pageErrors));
  assert.equal(
    failures.length,
    0,
    JSON.stringify(
      failures.map((f) => ({
        mode: f.mode,
        theme: f.theme,
        width: f.width,
        documentWidth: f.documentWidth,
        actions: f.actions,
      })),
    ),
  );
  console.log("RESULT_SCREEN_PASS", captures.length);
  return report;
}
