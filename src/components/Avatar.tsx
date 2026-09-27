import { avatarUrl } from "@/lib/avatars";

/** Shows the chosen avatar, or the first letter of the name when none is picked. */
export function Avatar({ name, avatar, size = 32 }: { name: string; avatar?: string | null; size?: number }) {
  const style = { width: size, height: size };
  if (avatar) {
    // DiceBear SVGs are tiny and already optimised, so a plain <img> is the right tool here.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl(avatar)} alt="" style={style} className="shrink-0 rounded-full border-2 border-ink bg-surface" />;
  }
  return (
    <span style={{ ...style, fontSize: size * 0.4 }} className="avatar">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
