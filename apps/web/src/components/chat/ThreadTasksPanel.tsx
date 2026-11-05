import { CircleCheckIcon, CircleDotIcon, CircleIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import type { LatestTodoList } from "../../session-logic";
import { ThreadDetailsSection } from "./ThreadDetailsSection";

const STEP_ICON = {
  pending: CircleIcon,
  running: CircleDotIcon,
  completed: CircleCheckIcon,
} as const;

const STEP_STATUS_LABEL = {
  pending: "Pending",
  running: "In progress",
  completed: "Done",
} as const;

/** The agent's latest todo list, updated whenever the agent rewrites it. */
export function ThreadTasksPanel({ todoList }: { todoList: LatestTodoList }) {
  const done = todoList.steps.filter((step) => step.status === "completed").length;
  return (
    <ThreadDetailsSection
      headingId="thread-details-tasks-heading"
      title="Tasks"
      actions={
        <span className="text-2xs tabular-nums text-muted-foreground">
          {done}/{todoList.steps.length}
        </span>
      }
    >
      <ul className="m-0 max-h-64 list-none overflow-y-auto p-0">
        {todoList.steps.map((step) => {
          const Icon = STEP_ICON[step.status];
          return (
            <li key={step.id} className="flex min-w-0 items-start gap-2.5 px-2.5 py-1">
              <Icon
                role="img"
                aria-label={STEP_STATUS_LABEL[step.status]}
                className={cn(
                  "mt-px size-4 shrink-0",
                  step.status === "completed"
                    ? "text-success"
                    : step.status === "running"
                      ? "text-info"
                      : "text-muted-foreground",
                )}
              />
              <span
                className={cn(
                  "min-w-0 flex-1 text-sm leading-4.5 break-words",
                  step.status === "completed"
                    ? "text-muted-foreground line-through"
                    : step.status === "running"
                      ? "font-medium text-foreground"
                      : "text-foreground/80",
                )}
              >
                {step.text}
              </span>
            </li>
          );
        })}
      </ul>
    </ThreadDetailsSection>
  );
}
