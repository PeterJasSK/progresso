// Circle avatar: gradient fill, thin accent ring, initials in Orbitron.
interface AvatarProps {
  name: string
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function Avatar({ name }: AvatarProps) {
  return (
    <span
      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent to-primary font-display text-xs font-bold text-white ring-1 ring-accent"
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  )
}
