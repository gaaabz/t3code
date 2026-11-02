import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { ChevronDownIcon, GitBranchIcon } from "lucide-react";
import { memo } from "react";

import { cn } from "~/lib/utils";
import { useEnvironmentQuery } from "../../state/query";
import { vcsEnvironment } from "../../state/vcs";
import { formatWorktreePathForDisplay } from "../../worktreeCleanup";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  formatWorktreeBaseRef,
  type SidebarWorktreeGroup,
  useRetainedValue,
  useSidebarRowSubscriptionLease,
} from "../Sidebar.logic";

export function sidebarWorktreeRowId(worktreeKey: string) {
  return `worktree:${worktreeKey}`;
}

/** A worktree inside a boring-sidebar project folder, naming its branch and the base it came from. */
export const SidebarWorktreeGroupHeader = memo(function SidebarWorktreeGroupHeader(props: {
  worktree: SidebarWorktreeGroup<EnvironmentThreadShell>;
  folderRowId: string;
  collapsed: boolean;
  hiddenCount: number;
  onToggle: (worktreeKey: string) => void;
}) {
  const { worktree, collapsed, hiddenCount } = props;
  const { leaseLiveStatus, rowRef } = useSidebarRowSubscriptionLease(false);
  // Same query as the thread rows, so the subscription is shared rather than added.
  const status = useEnvironmentQuery(
    leaseLiveStatus
      ? vcsEnvironment.status({
          environmentId: worktree.environmentId,
          input: { cwd: worktree.worktreePath, includeRemote: false },
        })
      : null,
  );
  const visibleStatus = useRetainedValue(worktree.key, status.data);
  const baseRef = visibleStatus?.branchChanges?.baseRef ?? null;
  const base = baseRef ? formatWorktreeBaseRef(baseRef) : null;
  const name =
    visibleStatus?.refName ??
    worktree.branch ??
    formatWorktreePathForDisplay(worktree.worktreePath);
  return (
    <li ref={rowRef} data-testid="sidebar-worktree-group" className="list-none">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              role="treeitem"
              tabIndex={-1}
              data-sidebar-row={sidebarWorktreeRowId(worktree.key)}
              data-sidebar-parent={props.folderRowId}
              aria-expanded={!collapsed}
              onClick={() => props.onToggle(worktree.key)}
              className="flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-(--control-radius) ps-9 pe-(--sidebar-row-content-inset) text-left text-xs outline-none hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            />
          }
        >
          <GitBranchIcon aria-hidden className="size-3.5 shrink-0 text-icon-muted" />
          <span className="min-w-0 truncate font-medium text-sidebar-foreground/85">{name}</span>
          {base ? (
            <span className="min-w-0 shrink-[2] truncate text-sidebar-muted-foreground">
              <span aria-hidden>← </span>
              <span className="sr-only">from </span>
              {base}
            </span>
          ) : null}
          <span className="flex-1" />
          {collapsed && hiddenCount > 0 ? (
            <span className="shrink-0 tabular-nums text-sidebar-muted-foreground">
              {hiddenCount}
            </span>
          ) : null}
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "size-3 shrink-0 text-sidebar-muted-foreground transition-transform",
              collapsed && "-rotate-90",
            )}
          />
        </TooltipTrigger>
        <TooltipPopup side="right">{worktree.worktreePath}</TooltipPopup>
      </Tooltip>
    </li>
  );
});
