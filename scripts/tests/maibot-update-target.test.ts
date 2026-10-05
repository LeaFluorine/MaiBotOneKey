import { expect, test } from "bun:test";
import { publishedStableReleaseTags, resolveMaiBotUpdateTarget } from "../../src/shared/maibot-update-target";

test("stable updates and notes share the exact published release tag", () => {
  expect(resolveMaiBotUpdateTarget("stable", "dev", "v1.3.3", "v1.2.0"))
    .toEqual({ type: "tag", name: "v1.3.3" });
});

test("missing release metadata cannot fall back to main or a history tag", () => {
  expect(resolveMaiBotUpdateTarget("stable", "tag", undefined, "v1.3.3")).toBeUndefined();
});

test("dev and historical versions keep independent targets", () => {
  expect(resolveMaiBotUpdateTarget("other", "dev", "v1.3.3", "v1.2.0"))
    .toEqual({ type: "branch", name: "dev" });
  expect(resolveMaiBotUpdateTarget("other", "tag", "v1.3.3", "v1.2.0"))
    .toEqual({ type: "tag", name: "v1.2.0" });
  expect(resolveMaiBotUpdateTarget("other", "tag", "v1.3.3", undefined)).toBeUndefined();
});

test("drafts and prereleases cannot become the official release target", () => {
  expect(publishedStableReleaseTags([
    { tag_name: "v1.3.3", prerelease: false, draft: false },
    { tag_name: "v1.4.0", draft: true },
    { tag_name: "v1.5.0", prerelease: true },
    { tag_name: null },
    { tag_name: " " },
  ])).toEqual(["v1.3.3"]);
});
