"use client"

import { useState, useEffect } from "react"
import {
  Activity,
  Timer,
  TrendingUp,
  Wifi,
  WifiOff,
  User,
  Calendar,
  BarChart3,
  Plus,
  Trash2,
  Download,
  Play,
  Square,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Athlete {
  id: string
  name: string
  category: string
}

interface TrainingSession {
  id: string
  athleteId: string
  athleteName: string
  date: string
  hurdleTimes: number[]
  totalTime: number
  numHurdles: number
}

declare global {
  interface BluetoothDevice extends EventTarget {
    id: string
    name?: string
    gatt?: BluetoothRemoteGATTServer
  }

  interface BluetoothRemoteGATTServer {
    connected: boolean
    connect(): Promise<BluetoothRemoteGATTServer>
    disconnect(): void
    getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>
  }

  interface BluetoothRemoteGATTService {
    getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>
  }

  interface BluetoothRemoteGATTCharacteristic extends EventTarget {
    value?: DataView
    startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>
    addEventListener(type: string, listener: (event: any) => void): void
  }

  interface Navigator {
    bluetooth?: {
      requestDevice(options: {
        filters?: Array<{ namePrefix?: string; name?: string }>
        optionalServices?: string[]
      }): Promise<BluetoothDevice>
    }
  }
}

export default function AutomatedTimingSystemDashboard() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showInstallButton, setShowInstallButton] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState("Desconectado")
  const [lastSignal, setLastSignal] = useState<Date | null>(null)
  const [bluetoothDevice, setBluetoothDevice] = useState<BluetoothDevice | null>(null)
  const [bluetoothCharacteristic, setBluetoothCharacteristic] = useState<any>(null)
  const [isBluetoothSupported, setIsBluetoothSupported] = useState(true)

  const [athletes, setAthletes] = useState<Athlete[]>(() => {
    if (typeof window === "undefined") return []
    const saved = localStorage.getItem("athletes")
    return saved
      ? JSON.parse(saved)
      : [
          { id: "1", name: "Juan Pérez", category: "Junior" },
          { id: "2", name: "María García", category: "Senior" },
          { id: "3", name: "Carlos López", category: "Junior" },
        ]
  })
  const [newAthleteName, setNewAthleteName] = useState("")
  const [newAthleteCategory, setNewAthleteCategory] = useState("Junior")

  const [sessions, setSessions] = useState<TrainingSession[]>(() => {
    if (typeof window === "undefined") return []
    const saved = localStorage.getItem("sessions")
    return saved ? JSON.parse(saved) : []
  })
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>("")
  const [isRaceActive, setIsRaceActive] = useState(false)
  const [hurdleTimes, setHurdleTimes] = useState<number[]>([])
  const [numHurdles, setNumHurdles] = useState<number>(10)

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("athletes", JSON.stringify(athletes))
    }
  }, [athletes])

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sessions", JSON.stringify(sessions))
    }
  }, [sessions])

  useEffect(() => {
    if (typeof window === "undefined") return
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowInstallButton(true)
    }
    window.addEventListener("beforeinstallprompt", handler)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setShowInstallButton(false)
    }
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  useEffect(() => {
    if (typeof window !== "undefined" && !navigator.bluetooth) {
      setIsBluetoothSupported(false)
    }
  }, [])

  useEffect(() => {
    const checkConnection = setInterval(() => {
      if (isConnected && bluetoothDevice && !bluetoothDevice.gatt?.connected) {
        setIsConnected(false)
        setConnectionStatus("Conexión perdida")
        setBluetoothDevice(null)
        setBluetoothCharacteristic(null)
      }
    }, 1000)
    return () => clearInterval(checkConnection)
  }, [isConnected, bluetoothDevice])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setShowInstallButton(false)
  }

  const connectToESP32 = async () => {
    if (!navigator.bluetooth) {
      alert("Bluetooth no disponible. Usa Chrome en Android.")
      return
    }
    try {
      setConnectionStatus("Buscando dispositivos...")
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "ESP32" }, { namePrefix: "ESP" }],
        optionalServices: ["4fafc201-1fb5-459e-8fcc-c5c9c331914b"],
      })
      setConnectionStatus("Conectando...")
      const server = await device.gatt?.connect()
      if (!server) throw new Error("No se pudo conectar")

      const service = await server.getPrimaryService("4fafc201-1fb5-459e-8fcc-c5c9c331914b")
      const characteristic = await service.getCharacteristic("beb5483e-36e1-4688-b7f5-ea07361b26a8")

      await characteristic.startNotifications()
      characteristic.addEventListener("characteristicvaluechanged", (event: any) => {
        handleTimeReceived(event.target.value)
      })

      setBluetoothDevice(device)
      setBluetoothCharacteristic(characteristic)
      setIsConnected(true)
      setConnectionStatus("Conectado")
      setLastSignal(new Date())
    } catch (error) {
      console.error("Error conectando:", error)
      setConnectionStatus("Error al conectar")
      alert("No se pudo conectar al ESP32. Asegúrate de que esté encendido y cerca.")
    }
  }

  const disconnectFromESP32 = () => {
    if (bluetoothDevice && bluetoothDevice.gatt?.connected) {
      bluetoothDevice.gatt.disconnect()
    }
    setBluetoothDevice(null)
    setBluetoothCharacteristic(null)
    setIsConnected(false)
    setConnectionStatus("Desconectado")
  }

  const handleTimeReceived = (value: DataView) => {
    if (!isRaceActive) return

    const time = value.getUint32(0, true)
    setLastSignal(new Date())

    setHurdleTimes((prev) => {
      const newTimes = [...prev, time]
      if (newTimes.length >= numHurdles) {
        stopRace(newTimes)
      }
      return newTimes
    })
  }

  const startRace = () => {
    if (!selectedAthleteId) {
      alert("Por favor selecciona un atleta")
      return
    }
    if (!isConnected) {
      alert("Por favor conecta el dispositivo ESP32")
      return
    }
    setIsRaceActive(true)
    setHurdleTimes([])
  }

  const stopRace = (times?: number[]) => {
    const finalTimes = times || hurdleTimes
    if (finalTimes.length > 0 && selectedAthleteId) {
      saveSession(finalTimes)
    }
    setIsRaceActive(false)
    setHurdleTimes([])
  }

  const saveSession = (times: number[]) => {
    const athlete = athletes.find((a) => a.id === selectedAthleteId)
    if (!athlete) return

    const totalTime = times[times.length - 1]
    const newSession: TrainingSession = {
      id: Date.now().toString(),
      athleteId: athlete.id,
      athleteName: athlete.name,
      date: new Date().toISOString(),
      hurdleTimes: times,
      totalTime: totalTime,
      numHurdles: times.length,
    }

    setSessions((prev) => [newSession, ...prev])
  }

  const addAthlete = () => {
    if (!newAthleteName.trim()) return
    const newAthlete: Athlete = {
      id: Date.now().toString(),
      name: newAthleteName,
      category: newAthleteCategory,
    }
    setAthletes((prev) => [...prev, newAthlete])
    setNewAthleteName("")
    setNewAthleteCategory("Junior")
  }

  const deleteAthlete = (id: string) => {
    setAthletes((prev) => prev.filter((a) => a.id !== id))
  }

  const exportData = () => {
    const data = { athletes, sessions }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `cronometraje-${new Date().toISOString().split("T")[0]}.json`
    a.click()
  }

  const formatTime = (ms: number) => {
    return (ms / 1000).toFixed(3) + "s"
  }

  const getAthleteStats = (athleteId: string) => {
    const athleteSessions = sessions.filter((s) => s.athleteId === athleteId)
    return {
      total: athleteSessions.length,
      best: athleteSessions.length > 0 ? Math.min(...athleteSessions.map((s) => s.totalTime)) : 0,
      average:
        athleteSessions.length > 0
          ? athleteSessions.reduce((sum, s) => sum + s.totalTime, 0) / athleteSessions.length
          : 0,
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Sistema de Cronometraje</h1>
          </div>
          {showInstallButton && (
            <Button onClick={handleInstallClick} variant="outline" className="gap-2 bg-transparent">
              <Download className="w-4 h-4" />
              Instalar App
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isConnected ? <Wifi className="text-green-600" /> : <WifiOff className="text-red-600" />}
                Conexión ESP32
              </CardTitle>
              <CardDescription>{connectionStatus}</CardDescription>
            </CardHeader>
            <CardContent>
              {!isBluetoothSupported ? (
                <p className="text-sm text-red-600">Bluetooth no disponible. Usa Chrome en Android.</p>
              ) : (
                <Button
                  onClick={isConnected ? disconnectFromESP32 : connectToESP32}
                  variant={isConnected ? "destructive" : "default"}
                  className="w-full"
                >
                  {isConnected ? "Desconectar" : "Conectar"}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Timer className="text-blue-600" />
                Estado de Carrera
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center space-y-2">
                {isRaceActive ? (
                  <>
                    <div className="text-2xl font-bold text-green-600 animate-pulse">CARRERA EN CURSO</div>
                    <div className="text-lg text-gray-600">
                      Vallas: {hurdleTimes.length} / {numHurdles}
                    </div>
                    {hurdleTimes.length > 0 && (
                      <div className="text-sm text-blue-600">
                        Último: {formatTime(hurdleTimes[hurdleTimes.length - 1])}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold text-gray-400">EN ESPERA</div>
                    <div className="text-sm text-gray-500">Listo para iniciar carrera</div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="text-purple-600" />
                Estadísticas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Atletas:</span>
                  <span className="font-semibold">{athletes.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Sesiones:</span>
                  <span className="font-semibold">{sessions.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Tiempos hoy:</span>
                  <span className="font-semibold">
                    {sessions.filter((s) => new Date(s.date).toDateString() === new Date().toDateString()).length}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="text-green-600" />
                Gestión de Atletas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Nombre</Label>
                  <Input
                    placeholder="Nombre del atleta"
                    value={newAthleteName}
                    onChange={(e) => setNewAthleteName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Categoría</Label>
                  <Select value={newAthleteCategory} onValueChange={setNewAthleteCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Junior">Junior</SelectItem>
                      <SelectItem value="Senior">Senior</SelectItem>
                      <SelectItem value="Master">Master</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={addAthlete} className="w-full gap-2">
                <Plus className="w-4 h-4" />
                Agregar Atleta
              </Button>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {athletes.map((athlete) => (
                  <div key={athlete.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium">{athlete.name}</div>
                      <div className="text-sm text-gray-500">{athlete.category}</div>
                    </div>
                    <Button onClick={() => deleteAthlete(athlete.id)} variant="ghost" size="sm">
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="text-orange-600" />
                Sesión de Entrenamiento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Seleccionar Atleta</Label>
                <Select value={selectedAthleteId} onValueChange={setSelectedAthleteId}>
                  <SelectTrigger>
                    <SelectValue placeholder="-- Seleccionar --" />
                  </SelectTrigger>
                  <SelectContent>
                    {athletes.map((athlete) => (
                      <SelectItem key={athlete.id} value={athlete.id}>
                        {athlete.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Número de Vallas</Label>
                <Select
                  value={numHurdles.toString()}
                  onValueChange={(v) => setNumHurdles(Number.parseInt(v))}
                  disabled={isRaceActive}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        {num} vallas
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={startRace}
                  disabled={isRaceActive || !selectedAthleteId || !isConnected}
                  className="flex-1 gap-2"
                  variant="default"
                >
                  <Play className="w-4 h-4" />
                  Iniciar Carrera
                </Button>
                <Button
                  onClick={() => stopRace()}
                  disabled={!isRaceActive}
                  variant="destructive"
                  className="flex-1 gap-2"
                >
                  <Square className="w-4 h-4" />
                  Detener
                </Button>
              </div>

              {hurdleTimes.length > 0 && (
                <div className="space-y-2">
                  <Label>Tiempos Parciales:</Label>
                  <div className="grid grid-cols-5 gap-2 max-h-40 overflow-y-auto p-2 bg-gray-50 rounded">
                    {hurdleTimes.map((time, index) => (
                      <div key={index} className="text-center p-2 bg-white rounded border">
                        <div className="text-xs text-gray-500">V{index + 1}</div>
                        <div className="font-mono text-sm font-semibold">{formatTime(time)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="text-blue-600" />
              Historial de Sesiones
            </CardTitle>
            <Button onClick={exportData} variant="outline" className="gap-2 bg-transparent">
              <Download className="w-4 h-4" />
              Exportar Datos
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {sessions.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No hay sesiones registradas</p>
              ) : (
                sessions.map((session) => (
                  <div key={session.id} className="p-4 bg-gray-50 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-lg">{session.athleteName}</div>
                        <div className="text-sm text-gray-500">{new Date(session.date).toLocaleString("es-ES")}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-blue-600">{formatTime(session.totalTime)}</div>
                        <div className="text-xs text-gray-500">{session.numHurdles} vallas</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 md:grid-cols-10 gap-2 pt-2 border-t">
                      {session.hurdleTimes.map((time, index) => (
                        <div key={index} className="text-center p-1 bg-white rounded text-xs">
                          <div className="text-gray-500">V{index + 1}</div>
                          <div className="font-mono font-semibold">{formatTime(time)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
