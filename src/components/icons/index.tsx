/**
 * TERRA ICON LIBRARY
 * ------------------------------------------------------------------
 * Backed by lucide-react (the industry-standard outline set that ships
 * with shadcn/ui). We expose a single semantic registry so the product
 * never imports raw glyph names — UI code references *concepts*
 * ("create", "render-time"), not shapes ("Sparkles", "Clock").
 *
 * Naming convention (industry standard):
 *   - registry keys are kebab-case domain concepts        e.g. "render-time"
 *   - the underlying export is Lucide PascalCase           e.g. Clock
 *   - <Icon name="render-time" /> is the canonical usage
 *
 * Swapping an icon = change one line here; every call site updates.
 */
import {
  Home,
  Orbit,
  Search,
  Compass,
  FolderClosed,
  Library,
  Users,
  Trash2,
  Star,
  Plus,
  Sparkles,
  Image,
  Video,
  Box,
  PanelLeftClose,
  PanelLeftOpen,
  Bell,
  Download,
  Zap,
  Images,
  Clock,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  X,
  SlidersHorizontal,
  Brush,
  Command,
  Layers,
  Camera,
  Spline,
  Play,
  Settings,
  LogOut,
  HelpCircle,
  Check,
  UsersRound,
  Undo2,
  Redo2,
  Save,
  Upload,
  Boxes,
  Package,
  WandSparkles,
  Globe,
  Frame,
  Focus,
  Mountain,
  UploadCloud,
  Link,
  MoreVertical,
  MapPin,
  FolderPlus,
  Pencil,
  Info,
  CircleCheck,
  Loader2,
  ArrowLeft,
  Palette,
  Move3d,
  Rotate3d,
  Scale3d,
  Lock,
  GripHorizontal,
  Crown,
  SunMedium,
  ScanSearch,
  Send,
  ImagePlus,
  type LucideIcon,
} from "lucide-react";

/** Concept → glyph. Keep keys sorted by domain area. */
export const iconRegistry = {
  // Navigation
  home: Home,
  search: Search,
  explore: Compass,
  projects: FolderClosed,
  library: Library,
  shared: Users,
  trash: Trash2,
  starred: Star,
  community: UsersRound,

  // Primary actions
  create: Plus,
  generate: Sparkles,
  brush: Brush,
  preview: Play,
  undo: Undo2,
  redo: Redo2,
  save: Save,
  export: Upload,

  // Editor rail
  scene: Boxes,
  assets: Package,
  ai: WandSparkles,
  world: Globe,

  // Asset library
  environment: Mountain,
  upload: UploadCloud,
  link: Link,
  more: MoreVertical,
  place: MapPin,
  "folder-add": FolderPlus,
  edit: Pencil,
  info: Info,
  "select-check": CircleCheck,
  spinner: Loader2,

  // Object editing (gizmo / toolbar / panels)
  back: ArrowLeft,
  adjust: SlidersHorizontal,
  texture: Palette,
  color: Palette,
  surface: SunMedium,
  move: Move3d,
  rotate: Rotate3d,
  scale: Scale3d,
  lock: Lock,
  drag: GripHorizontal,
  master: Crown,

  // AI flyout + chat
  "ai-chat": Sparkles,
  asa: ScanSearch,
  mat: ImagePlus,
  send: Send,
  attach: ImagePlus,

  // Viewport gizmo
  "gizmo-home": Home,
  "gizmo-fit": Frame,
  "gizmo-focus": Focus,
  "gizmo-reset": Orbit,
  "gizmo-save": Save,

  // World / scene inputs
  "input-2d": Image,
  "input-3d": Box,
  video: Video,
  panorama: Layers,
  camera: Camera,
  spline: Spline,

  // Chrome / layout
  "sidebar-collapse": PanelLeftClose,
  "sidebar-expand": PanelLeftOpen,
  notifications: Bell,
  download: Download,
  settings: Settings,
  help: HelpCircle,
  "sign-out": LogOut,
  command: Command,
  tune: SlidersHorizontal,

  // Credits / status
  credits: Zap,
  "image-credits": Images,
  "render-time": Clock,
  check: Check,

  // Directional
  "chevron-right": ChevronRight,
  "chevron-down": ChevronDown,
  "arrow-right": ArrowRight,
  close: X,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof iconRegistry;

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, "ref"> {
  name: IconName;
  /** pixel size — maps to width & height. Default 18. */
  size?: number;
  strokeWidth?: number;
}

/** Canonical icon component: <Icon name="create" size={18} /> */
export function Icon({ name, size = 18, strokeWidth = 1.9, ...props }: IconProps) {
  const Glyph = iconRegistry[name];
  return <Glyph width={size} height={size} strokeWidth={strokeWidth} {...props} />;
}
