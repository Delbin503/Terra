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
  Blocks,
  Dices,
  Shuffle,
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
  LockOpen,
  Eye,
  EyeOff,
  Copy,
  ClipboardPaste,
  CopyPlus,
  Group,
  Ungroup,
  BoxSelect,
  ListFilter,
  GripHorizontal,
  Crown,
  SunMedium,
  ScanSearch,
  Send,
  ImagePlus,
  Minimize2,
  SquareStack,
  Tag,
  Database,
  FolderOpen,
  Paperclip,
  AtSign,
  Braces,
  CircleAlert,
  TriangleAlert,
  RotateCcw,
  LayoutGrid,
  LayoutTemplate,
  FileText,
  Sun,
  Cloud,
  CloudRain,
  CloudLightning,
  CloudSnow,
  CloudFog,
  Haze,
  Wind,
  Compass as CompassRose,
  MessageSquare,
  CreditCard,
  ChevronUp,
  Type,
  List,
  Heart,
  ThumbsUp,
  FolderInput,
  Building2,
  User,
  Mail,
  Monitor,
  ScrollText,
  CircleDollarSign,
  ArrowUpDown,
  Calendar,
  ChevronLeft,
  Eraser,
  MousePointerClick,
  Minus,
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
  /** kept by the user — the Favourites shelf, as opposed to `starred` the verb */
  favourite: Heart,
  community: UsersRound,
  /** one person — the account itself, as opposed to `shared` for many */
  person: User,
  /** an appreciation on someone else's world — the community's own currency */
  like: ThumbsUp,

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
  /** Define a space — the volume objects are arranged inside. */
  space: Frame,
  /** The arrangement solver, and the axis that sweeps it. */
  arrange: Blocks,
  /** Reroll the arrangement seed. */
  seed: Dices,
  /** Scatter what's in the room into a fresh arrangement. */
  shuffle: Shuffle,
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
  folder: FolderClosed,
  "folder-open": FolderOpen,
  tag: Tag,
  /** open the asset library as a chooser */
  "library-picker": Database,
  /** send this somewhere else — a folder, an organization */
  "move-to": FolderInput,
  /** a workspace's parent org, as a destination */
  organization: Building2,

  // Image studio — the eraser + segmentation pass over a reference photo
  /** wipe part of the photo away */
  "magic-eraser": Eraser,
  /** click a segmented thing to select it */
  "pick-region": MousePointerClick,

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
  unlock: LockOpen,
  drag: GripHorizontal,
  master: Crown,

  // Scene layers (tree rows + their context menu)
  /** a container object — children nest inside it */
  group: Group,
  /** collapse a selection into a container */
  "group-add": BoxSelect,
  /** dissolve a container, keeping its contents */
  ungroup: Ungroup,
  /** the object is rendered in the viewport */
  visible: Eye,
  /** the object is excluded from the viewport */
  hidden: EyeOff,
  copy: Copy,
  paste: ClipboardPaste,
  duplicate: CopyPlus,
  /** narrow a list down to chosen types */
  filter: ListFilter,

  /** freshly published — the badge on a community banner */
  news: Sparkles,

  // AI flyout + chat
  "ai-chat": Sparkles,
  asa: ScanSearch,
  mat: ImagePlus,
  sab: SquareStack,
  send: Send,
  attach: Paperclip,
  /** @-mention a library, material or style in the composer */
  mention: AtSign,
  /** a bundle of scene objects referenced as one thing */
  nodes: Layers,
  /** the agent's work categories, on its work cards */
  layout: LayoutTemplate,
  /** everything, as a grid — the catalogue rather than one thing in it */
  grid: LayoutGrid,
  /** the same catalogue as rows, one per line */
  list: List,
  /** technical output — a query, a log, a script */
  code: Braces,
  /** re-run the thing that failed */
  retry: RotateCcw,
  /** a referenced project file */
  file: FileText,
  /** collapse a working panel down to its progress toast */
  minimize: Minimize2,

  // Viewport gizmo
  "gizmo-home": Home,
  "gizmo-fit": Frame,
  "gizmo-focus": Focus,
  "gizmo-reset": Orbit,
  "gizmo-save": Save,
  /** the turntable capture pass */
  capture: Orbit,

  // World / scene inputs
  "input-2d": Image,
  "input-3d": Box,
  /** a world described in words alone */
  "input-text": Type,
  video: Video,
  panorama: Layers,
  camera: Camera,
  spline: Spline,

  // Weather — the five conditions a scene can be rendered in, plus the two
  // atmosphere controls that aren't tied to one condition.
  sunny: Sun,
  cloudy: Cloud,
  rain: CloudRain,
  storm: CloudLightning,
  /** Airborne dust — Haze is lucide's low-visibility sky, which is what dust
   *  reads as in a render; CloudDust doesn't exist in the set. */
  dusty: Haze,
  snow: CloudSnow,
  fog: CloudFog,
  wind: Wind,
  /** wind BEARING — the dial, as opposed to `wind` the phenomenon */
  bearing: CompassRose,

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

  // Status / severity
  /** a failure — an operation that stopped */
  error: CircleAlert,
  /** a caution — approaching a limit, nothing broken yet */
  warning: TriangleAlert,

  // Credits / status
  credits: Zap,
  "image-credits": Images,
  "render-time": Clock,
  check: Check,

  // Settings
  /** email preferences */
  mail: Mail,
  /** an admin overview screen */
  dashboard: Monitor,
  /** the audit trail */
  "activity-log": ScrollText,
  /** money on the account — balance, credits, billing */
  balance: CircleDollarSign,
  /** a sortable column heading */
  sort: ArrowUpDown,
  /** pick a date or a range */
  calendar: Calendar,

  // Account / billing chrome
  /** open the feedback thread */
  feedback: MessageSquare,
  /** buy more credits */
  payment: CreditCard,

  // Steppers — a paired +/- on a count. `create` is Plus in its own right,
  // so the pair gets its own names to keep call sites reading as a stepper.
  "step-up": Plus,
  "step-down": Minus,

  // Directional
  "chevron-up": ChevronUp,
  "chevron-left": ChevronLeft,
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
