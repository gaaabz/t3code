import type {
  ProviderInstanceId,
  ServerProvider,
  ServerProviderUsageLimits,
  ServerProviderUsageWindow,
  UsageLimitSourceSnapshots,
} from "@t3tools/contracts";
import { collectProviderUsageLimits, limitsNotice } from "@t3tools/shared/usageLimits";

export type UsageTone = "ok" | "warning" | "critical";

export interface UsageMetric {
  readonly key: "ctx" | "5h" | "week";
  readonly usedPercent: number;
  readonly resetsAt?: string | undefined;
}

export interface ProviderUsageGroup {
  readonly provider: ServerProvider;
  readonly metrics: ReadonlyArray<UsageMetric>;
}

export function usageTone(usedPercent: number): UsageTone {
  if (usedPercent >= 85) return "critical";
  if (usedPercent >= 60) return "warning";
  return "ok";
}

// Claude also reports per-model weekly windows; the plain "Weekly" label is the account-wide one.
function pickWindow(
  windows: ReadonlyArray<ServerProviderUsageWindow>,
  kind: "session" | "weekly",
  label: string,
): ServerProviderUsageWindow | undefined {
  return (
    windows.find((window) => window.kind === kind && window.label === label) ??
    windows.find((window) => window.kind === kind)
  );
}

function limitsFor(
  provider: ServerProvider,
  providers: readonly ServerProvider[],
  sources: UsageLimitSourceSnapshots,
  now: number,
): ServerProviderUsageLimits | undefined {
  const report = collectProviderUsageLimits(provider.instanceId, providers, sources, now);
  return (
    report?.accounts.find((entry) => entry.instanceId === provider.instanceId)?.limits ??
    provider.usageLimits
  );
}

export function collectProviderUsageGroups(input: {
  readonly providers: readonly ServerProvider[];
  readonly sources: UsageLimitSourceSnapshots;
  readonly activeProviderInstanceId: ProviderInstanceId | null;
  readonly contextUsedPercent: number | null;
  readonly now: number;
}): ReadonlyArray<ProviderUsageGroup> {
  const groups: ProviderUsageGroup[] = [];
  for (const provider of input.providers) {
    if (!provider.enabled) continue;
    const isActive = provider.instanceId === input.activeProviderInstanceId;
    const metrics: UsageMetric[] = [];
    if (isActive && input.contextUsedPercent !== null) {
      metrics.push({ key: "ctx", usedPercent: clamp(input.contextUsedPercent) });
    }
    const limits = limitsFor(provider, input.providers, input.sources, input.now);
    if (limits && limitsNotice(limits) === null) {
      const session = pickWindow(limits.windows, "session", "Session");
      const weekly = pickWindow(limits.windows, "weekly", "Weekly");
      if (session) {
        metrics.push({ key: "5h", usedPercent: session.usedPercent, resetsAt: session.resetsAt });
      }
      if (weekly) {
        metrics.push({ key: "week", usedPercent: weekly.usedPercent, resetsAt: weekly.resetsAt });
      }
    }
    if (metrics.length === 0) continue;
    const group = { provider, metrics };
    if (isActive) groups.unshift(group);
    else groups.push(group);
  }
  return groups;
}

function clamp(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}
