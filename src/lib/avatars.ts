// Preset avatars rendered by DiceBear (https://www.dicebear.com). Each id is "<style>:<seed>".
// Credits (shown on the profile page): Fun Emoji by Davis Uche (CC BY 4.0), Bottts by Pablo Stanley
// (free for personal and commercial use), Big Smile by Ashley Seo (CC BY 4.0), Croodles by vijay verma (CC BY 4.0).

export const avatarSets = [
  { style: "fun-emoji", label: "Fun Emoji", seeds: ["Chai", "Samosa", "Jalebi", "Pakora", "Ladoo", "Masala", "Chutney", "Rasgulla"] },
  { style: "bottts", label: "Robots", seeds: ["Jugaad", "Tiffin", "Rickshaw", "Chappal", "Pressure", "Cooker", "Dabba", "Tempo"] },
  { style: "big-smile", label: "Big Smile", seeds: ["Pappu", "Bunty", "Chintu", "Guddu", "Pinky", "Tinku", "Munni", "Babloo"] },
  { style: "croodles", label: "Doodles", seeds: ["Nimbu", "Mirchi", "Aloo", "Bhindi", "Gajar", "Mooli", "Pudina", "Adrak"] },
] as const;

export const allAvatars = avatarSets.flatMap((set) => set.seeds.map((seed) => `${set.style}:${seed}`));

export function avatarUrl(avatar: string) {
  const [style, seed] = avatar.split(":");
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&radius=50&backgroundColor=ffd5dc,ffdfbf,c0aede,d1d4f9,b6e3f4`;
}
