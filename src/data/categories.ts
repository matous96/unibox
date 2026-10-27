import {
  Code2,
  Gamepad2,
  Globe,
  Image,
  MessagesSquare,
  Music,
  NotebookPen,
  Settings2,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { CategoryId } from "@/types";

/**
 * Definice kategorií pro UI. Název se bere z překladů (`categories.<id>`),
 * tady je jen ikona a barevný přechod dlaždice.
 */
export interface CategoryDef {
  id: CategoryId;
  icon: LucideIcon;
  /** Tailwind třídy pro gradient pozadí dlaždice. */
  gradient: string;
}

export const CATEGORIES: CategoryDef[] = [
  { id: "browsers", icon: Globe, gradient: "from-sky-500 to-blue-600" },
  { id: "development", icon: Code2, gradient: "from-violet-500 to-indigo-600" },
  { id: "communication", icon: MessagesSquare, gradient: "from-emerald-500 to-teal-600" },
  { id: "games", icon: Gamepad2, gradient: "from-rose-500 to-pink-600" },
  { id: "multimedia", icon: Music, gradient: "from-orange-500 to-amber-600" },
  { id: "graphics", icon: Image, gradient: "from-fuchsia-500 to-purple-600" },
  { id: "productivity", icon: NotebookPen, gradient: "from-yellow-500 to-orange-500" },
  { id: "utilities", icon: Wrench, gradient: "from-slate-500 to-slate-700" },
  { id: "security", icon: ShieldCheck, gradient: "from-red-500 to-rose-700" },
  { id: "system", icon: Settings2, gradient: "from-cyan-500 to-sky-700" },
];

export const getCategory = (id: string) => CATEGORIES.find((c) => c.id === id);
