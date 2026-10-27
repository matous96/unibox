import { cn, initialOf, placeholderColors } from "@/lib/utils";
import type { User } from "@/services/auth";

/** Kulatý avatar uživatele: fotka, nebo iniciála na barevném přechodu odvozeném z id. */
export function Avatar({ user, size = 32, className }: { user: User; size?: number; className?: string }) {
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt=""
        width={size}
        height={size}
        // Fotky z Googlu (lh3.googleusercontent.com) s odkazující adresou občas vrátí 403
        referrerPolicy="no-referrer"
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  const [from, to] = placeholderColors(user.id);
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.42, background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {initialOf(user.name)}
    </span>
  );
}
