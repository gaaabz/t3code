import type { OrchestrationV2PlanStep } from "@t3tools/contracts";
import type { ThreadStructureVisibleTurnItem } from "@t3tools/client-runtime/state/shell";

const ODD_DOCUMENT_PATTERN = /(?:^|[\\/\s"'`(=])odd[\\/]tasks[\\/]([\w.-]+)\.md\b/;
const TASK_LINE_PATTERN = /^\s*[-*]\s+(?:\[([ xX])\]\s+)?\**(T\d+)\**\b(.*)$/;
const TASK_FIELD_PATTERN = /\s(?:Route|Status|Risk|Commit|Evidence|RED|GREEN)\s*:/i;
const STATUS_PATTERN = /\bStatus\s*:\s*([^.;,]+)/i;

function oddDocumentIn(value: unknown): string | null {
  if (typeof value !== "string" || !value.includes("odd")) return null;
  const match = ODD_DOCUMENT_PATTERN.exec(value);
  return match ? `odd/tasks/${match[1]}.md` : null;
}

/** The ODD feature document this thread last wrote or read, relative to the workspace root. */
export function findOddFeatureDocument(
  visibleTurnItems: ReadonlyArray<ThreadStructureVisibleTurnItem>,
): string | null {
  for (let index = visibleTurnItems.length - 1; index >= 0; index -= 1) {
    const item = visibleTurnItems[index]?.item;
    if (!item) continue;
    let found: string | null = null;
    if (item.type === "file_change") found = oddDocumentIn(item.fileName);
    else if (item.type === "command_execution") found = oddDocumentIn(item.input);
    else if (item.type === "dynamic_tool") {
      const input = item.input;
      if (typeof input === "string") found = oddDocumentIn(input);
      else if (typeof input === "object" && input !== null) {
        for (const value of Object.values(input)) {
          found = oddDocumentIn(value);
          if (found) break;
        }
      }
    }
    if (found) return found;
  }
  return null;
}

function oddTaskStatus(
  checkbox: string | undefined,
  rest: string,
): OrchestrationV2PlanStep["status"] {
  const status = STATUS_PATTERN.exec(rest)?.[1]?.trim().toLowerCase();
  if (status !== undefined) {
    if (/^(done|complete|completed|finished|closed)\b/.test(status)) return "completed";
    if (/^(in[ _-]?progress|running|started|active|doing|wip)\b/.test(status)) return "running";
    return "pending";
  }
  return checkbox === "x" || checkbox === "X" ? "completed" : "pending";
}

/** Parses the `## Tasks` section of an ODD feature document; null when it lists no tasks. */
export function parseOddTasks(markdown: string): ReadonlyArray<OrchestrationV2PlanStep> | null {
  const steps: OrchestrationV2PlanStep[] = [];
  let inTasks = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^##\s/.test(line)) {
      inTasks = /^##\s+Tasks\s*$/i.test(line);
      continue;
    }
    if (!inTasks) continue;
    const match = TASK_LINE_PATTERN.exec(line);
    if (!match) continue;
    const [, checkbox, id, rest = ""] = match;
    const fieldStart = rest.search(TASK_FIELD_PATTERN);
    const summary = (fieldStart === -1 ? rest : rest.slice(0, fieldStart))
      .replace(/^\s*[[(]S[^\])]*[\])]/, "")
      .replace(/^\s*(inline|delegated)\b/i, "")
      .replace(/^[\s:—–-]+/, "")
      .replaceAll("`", "")
      .split(/\.\s+(?=[A-Z])/)[0]!
      .replace(/[\s.]+$/, "");
    steps.push({
      id: `odd-${id}`,
      text: summary.length > 0 ? `${id}: ${summary}` : id!,
      status: oddTaskStatus(checkbox, rest),
    });
  }
  return steps.length > 0 ? steps : null;
}
