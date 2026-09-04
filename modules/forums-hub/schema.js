export const PERMISSIONS = [
  { key: "view", label: "Voir le forum", short: "Voir" },
  { key: "read", label: "Lire les sujets", short: "Lire" },
  { key: "reply", label: "Répondre à un message", short: "Rép." },
  { key: "edit", label: "Éditer ses messages", short: "Édit." },
  { key: "delete", label: "Effacer ses messages et fichiers joints", short: "Suppr." },
  { key: "vote", label: "Voter", short: "Voter" },
  { key: "post", label: "Ouvrir un sujet", short: "Sujet" },
  { key: "pollcreate", label: "Créer un sondage", short: "Sondage" },
  { key: "sticky", label: "Créer une note", short: "Note" },
  { key: "announce", label: "Créer une annonce", short: "Annonce" },
  { key: "cal", label: "Lier un sujet au calendrier", short: "Cal." },
  { key: "send_att", label: "Joindre un fichier", short: "Joindre" },
  { key: "dl_att", label: "Télécharger des fichiers joints", short: "DL" },
  { key: "mod", label: "Modérer", short: "Modér." },
];

// Presets historiques
export const AUDIENCE_PRESETS = {
  open: { label: "Ouvert", guests: { view: true, reply: true }, members: { view: true, reply: true } },
  members: { label: "Membres seuls", guests: { view: false, reply: false }, members: { view: true, reply: true } },
  closed: { label: "Fermé", guests: { view: false, reply: false }, members: { view: false, reply: false } },
};

// Niveau <- 2 booléens
export const LEVELS = ["guest", "member", "admin"];
export const LEVEL_LABELS = { guest: "Invités", member: "Membres", admin: "Admin" };

export function computeLevel(state, key) {
  if (state.guests[key]) return "guest";
  if (state.members[key]) return "member";
  return "admin";
}

export function stateFromLevel(level) {
  return { guest: level === "guest", member: level === "guest" || level === "member" };
}

export const ESSENTIAL_PERMISSIONS = new Set(["view", "read", "reply", "post", "mod"]);
