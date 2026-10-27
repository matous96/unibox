import {
  Archive, AtSign, Bookmark, Braces, Briefcase, Brush, Bug, Calendar, Camera, Clipboard, Clock, Code2,
  Compass, Cpu, Crop, Crown, Database, Dice5, Disc3, Eye, FileCode, FileText, Film, Fingerprint, Folder,
  Gamepad2, Gauge, GitBranch, Globe, Hammer, HardDrive, Headphones, Heart, Image, Joystick, Key, KeyRound,
  Layers, Link, Lock, Mail, MemoryStick, MessageCircle, Mic, Monitor, Music, Notebook, Palette, PenTool,
  Phone, Pipette, Play, Power, Puzzle, Radio, Ruler, ScanFace, Scissors, Search, Send, Server, Settings,
  Settings2, Shapes, Shield, ShieldCheck, Smile, SquareCheck, Swords, Table, Target, Terminal, Trophy,
  Users, Video, Wifi, Wrench, Zap, type LucideIcon,
} from "lucide-react";
import type { CategoryId } from "@/types";

/**
 * Ikony pro dekorativní vzorek v banneru detailu – podle kategorie,
 * podobně jako „doodle“ pozadí bannerů v App Store.
 */
export const BANNER_ICONS: Record<CategoryId, LucideIcon[]> = {
  browsers: [Globe, Compass, Bookmark, Search, Link, Wifi, Shield, Heart],
  development: [Code2, Terminal, Braces, GitBranch, Bug, Cpu, Database, FileCode],
  communication: [MessageCircle, Phone, Video, Mail, Smile, Users, Send, AtSign, Heart],
  games: [Gamepad2, Trophy, Joystick, Swords, Dice5, Crown, Target, Puzzle],
  multimedia: [Music, Play, Headphones, Film, Mic, Radio, Camera, Disc3],
  graphics: [Palette, Brush, PenTool, Image, Shapes, Pipette, Layers, Crop],
  productivity: [FileText, Calendar, SquareCheck, Clipboard, Notebook, Briefcase, Clock, Table],
  utilities: [Wrench, Hammer, Settings, Zap, Archive, Folder, Scissors, Ruler],
  security: [Shield, Lock, Key, Fingerprint, Eye, ShieldCheck, ScanFace, KeyRound],
  system: [Cpu, HardDrive, MemoryStick, Monitor, Settings2, Power, Gauge, Server],
};
