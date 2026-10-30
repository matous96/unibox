import { create } from "zustand";
import { prepareScreenshot, ScreenshotError, type ScreenshotProblem } from "@/lib/screenshotImage";

export type ContactTopic = "question" | "bug" | "idea" | "collaboration" | "other";
export const CONTACT_TOPICS: ContactTopic[] = ["question", "bug", "idea", "collaboration", "other"];

/** Nejvýš snímků obrazovky k jedné zprávě. */
export const CONTACT_MAX_IMAGES = 3;

/** Snímek obrazovky ke zprávě – připravený (WebP a náhled), nebo se ještě zpracovává. */
export interface ContactImage {
  key: string;
  name: string;
  image?: Blob;
  /** Adresa náhledu (URL.createObjectURL) – uvolní se po odebrání. */
  preview?: string;
}

interface ContactDraft {
  topic: ContactTopic;
  name: string;
  email: string;
  message: string;
  /** Přiložit verzi HubGetu, Windows a jazyk. */
  attachInfo: boolean;
  images: ContactImage[];
}

interface ContactState extends ContactDraft {
  update: (patch: Partial<Omit<ContactDraft, "images">>) => void;
  /** Předvyplní téma a text (např. z nahlášení aplikace); jméno a e-mail zůstanou. */
  prefill: (topic: ContactTopic, message: string) => void;
  /** Přidá obrázky (vybrané, přetažené, vložené); `onProblem` dostane ty, které nejdou použít. */
  addImages: (files: File[], onProblem: (problem: ScreenshotProblem, file: string) => void) => void;
  removeImage: (key: string) => void;
  /** Po odeslání: nová zpráva, jméno a e-mail zůstanou vyplněné. */
  clearMessage: () => void;
}

const release = (images: ContactImage[]) => images.forEach((i) => i.preview && URL.revokeObjectURL(i.preview));

/**
 * Rozepsaná zpráva kontaktního formuláře. Jen v paměti – vydrží přechod
 * na jinou stránku, po restartu aplikace začíná formulář prázdný.
 */
export const useContact = create<ContactState>()((set, get) => ({
  topic: "question",
  name: "",
  email: "",
  message: "",
  attachInfo: true,
  images: [],
  update: (patch) => set(patch),
  prefill: (topic, message) => set({ topic, message }),

  addImages: (files, onProblem) => {
    const accepted = files.slice(0, CONTACT_MAX_IMAGES - get().images.length);
    for (const file of accepted) {
      const key = crypto.randomUUID();
      const name = file.name || "image";
      set((s) => ({ images: [...s.images, { key, name }] }));
      // Výřez chybové hlášky bývá malý – bez spodní hranice velikosti
      prepareScreenshot(file, 1)
        .then((shot) => {
          // Mezitím odebraný (nebo zpráva odeslaná) – náhled nezakládat
          if (!get().images.some((i) => i.key === key)) return;
          const preview = URL.createObjectURL(shot.thumb);
          set((s) => ({ images: s.images.map((i) => (i.key === key ? { ...i, image: shot.full, preview } : i)) }));
        })
        .catch((error) => {
          set((s) => ({ images: s.images.filter((i) => i.key !== key) }));
          onProblem(error instanceof ScreenshotError ? error.problem : "decode", name);
        });
    }
  },

  removeImage: (key) => {
    release(get().images.filter((i) => i.key === key));
    set((s) => ({ images: s.images.filter((i) => i.key !== key) }));
  },

  clearMessage: () => {
    release(get().images);
    set({ topic: "question", message: "", images: [] });
  },
}));
