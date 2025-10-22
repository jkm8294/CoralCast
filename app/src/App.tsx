import { useEffect, useState } from 'react'
import Card from './components/Card'
import './index.css'

type Today = {
  chi: number
  sst: number
  dhw: number
  alert: string
  region: string
}

export default function App() {
  const [data, setData] = useState<Today | null>(null)

  useEffect(() => {
    // temp: mocked until backend is ready
    setData({
      chi: 78,
      sst: 29.6,
      dhw: 4.3,
      alert: 'Watch',
      region: 'Puerto Rico Shelf',
    })
  }, [])

  return (
    <div className="mx-auto max-w-screen-sm space-y-4 p-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">CoralCast</h1>
        <p className="text-sm opacity-70">{data?.region ?? 'Select a region'}</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Card
          title="Coral Health Index"
          value={data ? `${data.chi}` : '--'}
          detail="0–100"
        />
        <Card title="SST (°C)" value={data ? `${data.sst.toFixed(1)}` : '--'} />
        <Card
          title="DHW"
          value={data ? `${data.dhw.toFixed(1)}` : '--'}
          detail="Heat stress"
        />
        <Card title="Bleaching" value={data?.alert ?? '--'} />
      </div>

      <footer className="text-xs opacity-60">v0.1 • mock data</footer>
    </div>
  )
}
