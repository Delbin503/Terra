export type ProjectKind = "FSD" | "HSD";

export interface Project {
  id: string;
  name: string;
  editedLabel: string;
  kind: ProjectKind;
  /** CSS gradient stand-in for the rendered thumbnail */
  gradient: string;
}

const gradients = [
  "linear-gradient(160deg,#3f6f3a,#6ea94a 45%,#8fc95e)",
  "linear-gradient(160deg,#c1521f,#e08a2b 50%,#f0b352)",
  "linear-gradient(160deg,#7b3fb0,#c05aa8 50%,#e58fb0)",
  "linear-gradient(160deg,#25607a,#3f9bb0 50%,#7fd0c9)",
  "linear-gradient(160deg,#4a5d2a,#7fa23e 50%,#b9cf6a)",
];

export const projects: Project[] = [
  { id: "p1", name: "Sand Dune Project", editedLabel: "Edited 4 days ago", kind: "HSD", gradient: gradients[0] },
  { id: "p2", name: "Voxel Valley", editedLabel: "Edited 4 days ago", kind: "FSD", gradient: gradients[1] },
  { id: "p3", name: "Harbor Yard", editedLabel: "Edited 4 days ago", kind: "FSD", gradient: gradients[2] },
  { id: "p4", name: "Alpine Ridge", editedLabel: "Edited 5 days ago", kind: "FSD", gradient: gradients[3] },
  { id: "p5", name: "Delta Fields", editedLabel: "Edited 6 days ago", kind: "FSD", gradient: gradients[4] },
];

export interface CommunityWorld {
  id: string;
  title: string;
  gradient: string;
}

export const communityWorlds: CommunityWorld[] = [
  { id: "c1", title: "Desert canyon", gradient: gradients[2] },
  { id: "c2", title: "Coastal ruins", gradient: gradients[3] },
  { id: "c3", title: "Neon district", gradient: gradients[4] },
  { id: "c4", title: "Frost valley", gradient: gradients[0] },
  { id: "c5", title: "Terraced hills", gradient: gradients[1] },
];

export const user = {
  name: "Delbin Arkar",
  plan: "Pro plan",
  workspace: "MetaBlock AI",
};

export const credits = {
  images: { used: 500, total: 5000 },
  renderSeconds: { used: 0, total: 54000 },
};
