import type {
  ProviderInstanceId,
  ServerProvider,
  UsageLimitSourceSnapshots,
} from "@t3tools/contracts";
import { resolveProviderInstanceDisplayName } from "@t3tools/client-runtime/state/provider-instance-display";
import { formatDuration } from "@t3tools/shared/usageLimits";
import { memo } from "react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { useEnvironmentProviders, usePrimaryEnvironment } from "../../state/environments";
import { cn } from "../../lib/utils";
import { Separator } from "../ui/separator";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";
import {
  collectProviderUsageGroups,
  type ProviderUsageGroup,
  type UsageMetric,
  usageTone,
} from "./ProviderUsageStrip.logic";

const METRIC_LABEL: Record<UsageMetric["key"], string> = {
  ctx: "Context window",
  "5h": "5-hour limit",
  week: "Weekly limit",
};

const TONE_STROKE = {
  ok: "var(--color-success)",
  warning: "var(--color-warning)",
  critical: "var(--color-error)",
} as const;

const TONE_TEXT = {
  ok: "text-success-foreground",
  warning: "text-warning-foreground",
  critical: "text-error-foreground",
} as const;

/** Every enabled provider's context, 5-hour, and weekly usage, active provider first. */
export const ProviderUsageStrip = memo(function ProviderUsageStrip(props: {
  readonly providers: readonly ServerProvider[];
  readonly sources: UsageLimitSourceSnapshots;
  readonly activeProviderInstanceId: ProviderInstanceId | null;
  readonly contextUsedPercent: number | null;
  readonly trailingSeparator?: boolean | undefined;
}) {
  const nowMinute = useNowMinute();
  const now = Date.parse(`${nowMinute}:00Z`);
  const groups = collectProviderUsageGroups({ ...props, now });
  if (groups.length === 0) return null;
  return (
    <div className="flex h-full shrink-0 items-center gap-2" data-provider-usage-strip>
      {groups.map((group, index) => (
        <div key={group.provider.instanceId} className="flex items-center gap-2">
          {index > 0 ? <Separator orientation="vertical" className="h-4" /> : null}
          <ProviderUsageGroupView group={group} now={now} />
        </div>
      ))}
      {props.trailingSeparator === false ? null : (
        <Separator orientation="vertical" className="ml-1 h-4" />
      )}
    </div>
  );
});

const EMPTY_PROVIDERS: readonly ServerProvider[] = [];
const EMPTY_SOURCES: UsageLimitSourceSnapshots = [];

/** For pages without an active thread: limits from the primary environment's providers. */
export function PrimaryEnvironmentUsageStrip(props: {
  readonly trailingSeparator?: boolean | undefined;
}) {
  const primaryEnvironment = usePrimaryEnvironment();
  const providersByEnvironment = useEnvironmentProviders();
  const providers =
    (primaryEnvironment
      ? providersByEnvironment.get(primaryEnvironment.environmentId)
      : undefined) ?? EMPTY_PROVIDERS;
  return (
    <ProviderUsageStrip
      providers={providers}
      sources={primaryEnvironment?.serverConfig?.usageLimitSources ?? EMPTY_SOURCES}
      activeProviderInstanceId={null}
      contextUsedPercent={null}
      trailingSeparator={props.trailingSeparator}
    />
  );
}

function ProviderUsageGroupView({
  group,
  now,
}: {
  readonly group: ProviderUsageGroup;
  readonly now: number;
}) {
  const displayName = resolveProviderInstanceDisplayName(group.provider);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            tabIndex={0}
            aria-label={`${displayName} usage`}
            className="flex cursor-default items-center gap-2 rounded-md px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          />
        }
      >
        <ProviderInstanceIcon
          driverKind={group.provider.driver}
          displayName={displayName}
          accentColor={group.provider.accentColor}
          className="size-3.5"
          iconClassName="size-3.5"
        />
        {group.metrics.map((metric) => (
          <UsageMetricView key={metric.key} metric={metric} />
        ))}
      </TooltipTrigger>
      <TooltipPopup side="bottom">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{displayName}</span>
          {group.metrics.map((metric) => {
            const resetsAt = metric.resetsAt ? Date.parse(metric.resetsAt) : Number.NaN;
            return (
              <span key={metric.key} className="text-muted-foreground">
                {METRIC_LABEL[metric.key]}: {Math.round(metric.usedPercent)}% used
                {resetsAt > now ? ` · resets in ${formatDuration(resetsAt - now)}` : ""}
              </span>
            );
          })}
        </div>
      </TooltipPopup>
    </Tooltip>
  );
}

function UsageMetricView({ metric }: { readonly metric: UsageMetric }) {
  const tone = usageTone(metric.usedPercent);
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - metric.usedPercent / 100);
  return (
    <span className="flex items-center gap-1 text-2xs tabular-nums">
      <span className="text-muted-foreground">{metric.key}</span>
      <svg viewBox="0 0 24 24" className="-rotate-90 size-3.5 shrink-0" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          className="stroke-muted-foreground/24"
          strokeWidth="4"
        />
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          stroke={TONE_STROKE[tone]}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span className={cn("font-medium", TONE_TEXT[tone])}>{Math.round(metric.usedPercent)}%</span>
    </span>
  );
}
