import { user } from "@/features/home/data";

/** Workspace the current project belongs to (shown in the Credits popover). */
export const workspace = {
  name: user.workspace, // "MetaBlock AI"
};

/* The credit balance used to be a constant here too — see the note in
   features/home/data.ts. It belongs to the account store now, so the editor's
   credit popover and the dispatch review read the same figure the home rail and
   Settings do, and a top-up moves all four. */

/** The signed-in user — owner of this project. */
export const owner = {
  role: "Owner",
};

export type CollaboratorStatus = "editing" | "viewing";

export interface Collaborator {
  id: string;
  name: string;
  seat: string;
  status: CollaboratorStatus;
}

/** Everyone else with access to this scene, for the account popover list. */
export const collaborators: Collaborator[] = [
  { id: "u1", name: "Karrina Lenz", seat: "Viewer Seat", status: "editing" },
  { id: "u2", name: "Leonardo Zetz", seat: "Viewer Seat", status: "editing" },
  { id: "u3", name: "Jodh Hutcherson", seat: "Viewer Seat", status: "viewing" },
  { id: "u4", name: "Alex Henderson", seat: "Viewer Seat", status: "viewing" },
  { id: "u5", name: "Mara Whitfield", seat: "Viewer Seat", status: "viewing" },
  { id: "u6", name: "Tomas Vega", seat: "Viewer Seat", status: "editing" },
];
