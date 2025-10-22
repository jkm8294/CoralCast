type CardProps = {
  title: string
  value: string
  detail?: string
}

export default function Card({ title, value, detail }: CardProps) {
  return (
    <div className="rounded-2xl border p-4 shadow-sm">
      <div className="text-sm opacity-70">{title}</div>
      <div className="text-3xl font-semibold">{value}</div>
      {detail && <div className="mt-1 text-xs opacity-60">{detail}</div>}
    </div>
  )
}
