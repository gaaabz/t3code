import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { isScratchProject } from "@t3tools/client-runtime/state/projects";
import { PlusIcon } from "lucide-react";

import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useScratchProject } from "../../hooks/useScratchProject";
import { useProjects } from "../../state/entities";
import { THREAD_GRID_MAX_TILES, useThreadGridStore } from "../../threadGridStore";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { reportGridFull } from "./threadGridActions";

export function GridNewChatMenu() {
  const projects = useProjects();
  const { scratchWorkspaceRootFor } = useScratchProject();
  const openProjectDraft = useNewThreadHandler();
  const full = useThreadGridStore((state) => state.tiles.length >= THREAD_GRID_MAX_TILES);
  const choices = projects
    .filter((project) => !isScratchProject(project, scratchWorkspaceRootFor(project.environmentId)))
    .toSorted((left, right) => left.title.localeCompare(right.title));

  const openNewChat = async (project: (typeof choices)[number]) => {
    const opened = await openProjectDraft(scopeProjectRef(project.environmentId, project.id), {
      navigate: false,
    });
    if (!opened) return;
    reportGridFull(
      useThreadGridStore.getState().addDraft({ ...opened, environmentId: project.environmentId }),
    );
  };

  return (
    <Menu>
      <MenuTrigger
        disabled={full || choices.length === 0}
        render={<Button className="[-webkit-app-region:no-drag]" size="xs" variant="ghost-muted" />}
      >
        <PlusIcon />
        New chat
      </MenuTrigger>
      <MenuPopup align="end" width="content">
        {choices.map((project) => (
          <MenuItem
            key={`${project.environmentId}:${project.id}`}
            onClick={() => void openNewChat(project)}
          >
            {project.title}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}
