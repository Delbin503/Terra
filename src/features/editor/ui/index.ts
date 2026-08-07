/**
 * EDITOR UI PRIMITIVES
 * ------------------------------------------------------------------
 * The parts every editor panel is assembled from. Each component names its
 * internal layers via `data-ui`, derived from the instance name, so a layer is
 * traceable across Figma ↔ code ↔ runtime — the same convention the glass
 * ornaments use.
 *
 * Type comes from the `type-*` styles, colour from the role tokens. No
 * primitive here sets a raw font size, weight or colour value.
 *
 * Shared, non-glass components (Button, Badge, Card, Dialog…) stay in
 * `@/components/ui`; these are the glass-panel counterparts.
 */
export {
  Panel,
  PanelHeader,
  PanelTitle,
  PanelSubtitle,
  PanelEyebrow,
  PanelClose,
  PanelBody,
  PanelFooter,
  PanelSection,
  PanelRow,
  PanelAction,
  type PanelProps,
} from "./panel";

export {
  Field,
  TextInput,
  TextArea,
  Select,
  NumberInput,
  SearchInput,
  type TextInputProps,
  type TextAreaProps,
  type SelectProps,
} from "./field";

export { Pill, PillButton, type PillProps, type PillButtonProps } from "./pill";
