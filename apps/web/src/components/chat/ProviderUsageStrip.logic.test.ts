import type { ServerProvider, ServerProviderUsageWindow } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { collectProviderUsageGroups, usageTone } from "./ProviderUsageStrip.logic";

function provider(
  instanceId: string,
  windows: ServerProviderUsageWindow[],
  enabled = true,
): ServerProvider {
  return {
    instanceId,
    driver: instanceId,
    enabled,
    usageLimits: { checkedAt: "2026-10-31T00:00:00.000Z", windows },
  } as unknown as ServerProvider;
}

const session = (usedPercent: number): ServerProviderUsageWindow => ({
  id: "five_hour",
  kind: "session",
  label: "Session",
  usedPercent,
});

describe("collectProviderUsageGroups", () => {
  it("puts the active provider first with its context, and picks the account-wide weekly window", () => {
    const groups = collectProviderUsageGroups({
      providers: [
        provider("codex", [session(10)]),
        provider("claudeAgent", [
          { id: "weekly-opus", kind: "weekly", label: "Weekly · Opus", usedPercent: 90 },
          session(40),
          { id: "seven_day", kind: "weekly", label: "Weekly", usedPercent: 70 },
        ]),
        provider("cursor", [session(5)], false),
      ],
      sources: [],
      activeProviderInstanceId: "claudeAgent" as never,
      contextUsedPercent: 25,
      now: 0,
    });
    expect(
      groups.map((group) => [
        group.provider.instanceId,
        group.metrics.map((metric) => [metric.key, metric.usedPercent]),
      ]),
    ).toEqual([
      [
        "claudeAgent",
        [
          ["ctx", 25],
          ["5h", 40],
          ["week", 70],
        ],
      ],
      ["codex", [["5h", 10]]],
    ]);
  });
});

describe("usageTone", () => {
  it.each([
    [59, "ok"],
    [60, "warning"],
    [85, "critical"],
  ] as const)("%d%% is %s", (used, tone) => {
    expect(usageTone(used)).toBe(tone);
  });
});
