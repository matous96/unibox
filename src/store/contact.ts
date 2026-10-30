import { create } from "zustand";

export type ContactTopic = "question" | "bug" | "idea" | "collaboration" | "other";
export const CONTACT_TOPICS: ContactTopic[] = ["question", "bug", "idea", "collaboration", "other"];

interface ContactDraft {
  topic: ContactTopic;
  name: string;
  email: string;
  message: string;
  /** Přiložit verzi HubGetu, Windows a jazyk. */
  attachInfo: boolean;
}

interface ContactState extends ContactDraft {
  update: (patch: Partial<ContactDraft>) => void;
  /** Předvyplní téma a text (např. z nahlášení aplikace); jméno a e-mail zůstanou. */
  prefill: (topic: ContactTopic, message: string) => void;
  /** Po odeslání: nová zpráva, jméno a e-mail zůstanou vyplněné. */
  clearMessage: () => void;
}

/**
 * Rozepsaná zpráva kontaktního formuláře. Jen v paměti – vydrží přechod
 * na jinou stránku, po restartu aplikace začíná formulář prázdný.
 */
export const useContact = create<ContactState>()((set) => ({
  topic: "question",
  name: "",
  email: "",
  message: "",
  attachInfo: true,
  update: (patch) => set(patch),
  prefill: (topic, message) => set({ topic, message }),
  clearMessage: () => set({ topic: "question", message: "" }),
}));
