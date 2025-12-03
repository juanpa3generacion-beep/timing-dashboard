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
  Settings,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

const AutomatedTimingSystemDashboard = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [showInstallButton, setShowInstallButton] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState("Desconectado")
  const [lastSignal, setLastSignal] = useState<Date | null>(null)
  const [bluetoothDevice, setBluetoothDevice] = useState<BluetoothDevice | null>(null)
  const [bluetoothCharacteristic, setBluetoothCharacteristic] = useState<any>(null)
  const [isBluetoothSupported, setIsBluetoothSupported] = useState(true)

  const [athletes, setAthletes] = useState<Athlete[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("athletes")
      return saved
        ? JSON.parse(saved)
        : [
            { id: "1", name: "Juan Pérez", category: "Junior" },
            { id: "2", name: "María García", category: "Senior" },
            { id: "3", name: "Carlos López", category: "Junior" },
          ]
    }
    return []
  })
  const [newAthleteName, setNewAthleteName] = useState("")
  const [newAthleteCategory, setNewAthleteCategory] = useState("Junior")

  const [sessions, setSessions] = useState<TrainingSession[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sessions")
      return saved ? JSON.parse(saved) : []
    }
    return []
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
    if (!navigator.bluetooth) {
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
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === "accepted") {
        setShowInstallButton(false)
      }
      setDeferredPrompt(null)
    }
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
      characteristic.addEventListener("characteristicvaluechanged", handleTimeReceived)

      setBluetoothDevice(device)
      setBluetoothCharacteristic(characteristic)
      setIsConnected(true)
      setConnectionStatus("Conectado")
      setLastSignal(new Date())
    } catch (error) {
      console.error("Error al conectar:", error)
      setConnectionStatus("Error al conectar")
      setIsConnected(false)
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

  const handleTimeReceived = (event: any) => {
    const value = event.target.value
    const timeMs = value.getUint32(0, true)

    setLastSignal(new Date())

    if (isRaceActive && hurdleTimes.length < numHurdles) {
      setHurdleTimes((prev) => [...prev, timeMs])

      if (hurdleTimes.length + 1 === numHurdles) {
        stopRace()
      }
    }
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

  const stopRace = () => {
    setIsRaceActive(false)
    if (hurdleTimes.length > 0) {
      saveSession()
    }
  }

  const saveSession = () => {
    const athlete = athletes.find((a) => a.id === selectedAthleteId)
    if (!athlete || hurdleTimes.length === 0) return

    const totalTime = hurdleTimes[hurdleTimes.length - 1]
    const newSession: TrainingSession = {
      id: Date.now().toString(),
      athleteId: athlete.id,
      athleteName: athlete.name,
      date: new Date().toISOString(),
      hurdleTimes: [...hurdleTimes],
      totalTime,
      numHurdles,
    }

    setSessions((prev) => [newSession, ...prev])
    setHurdleTimes([])
    setIsRaceActive(false)
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
    a.download = `timing-data-${new Date().toISOString()}.json`
    a.click()
  }

  const formatTime = (ms: number) => {
    return (ms / 1000).toFixed(3) + "s"
  }

  const getAthleteStats = (athleteId: string) => {
    const athleteSessions = sessions.filter((s) => s.athleteId === athleteId)
    if (athleteSessions.length === 0) return null

    const times = athleteSessions.map((s) => s.totalTime)
    const avg = times.reduce((a, b) => a + b, 0) / times.length
    const best = Math.min(...times)

    return { sessions: athleteSessions.length, avgTime: avg, bestTime: best }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-10 h-10 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-800">Sistema de Cronometraje</h1>
          </div>
          {showInstallButton && (
            <Button onClick={handleInstallClick} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Instalar App
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isConnected ? (
                  <Wifi className="w-5 h-5 text-green-600" />
                ) : (
                  <WifiOff className="w-5 h-5 text-red-600" />
                )}
                Conexión ESP32
              </CardTitle>
              <CardDescription>{connectionStatus}</CardDescription>
            </CardHeader>
            <CardContent>
              {isConnected ? (
                <div className="space-y-3">
                  <Button onClick={disconnectFromESP32} variant="destructive" className="w-full">
                    Desconectar
                  </Button>
                  {lastSignal && (
                    <p className="text-sm text-gray-500">Última señal: {lastSignal.toLocaleTimeString()}</p>
                  )}
                </div>
              ) : (
                <Button onClick={connectToESP32} className="w-full" disabled={!isBluetoothSupported}>
                  {isBluetoothSupported ? "Conectar" : "Bluetooth no disponible"}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Timer className="w-5 h-5 text-blue-600" />
                Tiempo Actual
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center space-y-2">
                {isRaceActive ? (
                  <>
                    <div className="text-4xl font-bold text-blue-600">
                      {hurdleTimes.length > 0 ? formatTime(hurdleTimes[hurdleTimes.length - 1]) : "0.000s"}
                    </div>
                    <div className="text-sm text-gray-600">
                      Vallas: {hurdleTimes.length} / {numHurdles}
                    </div>
                    {hurdleTimes.length > 0 && (
                      <div className="text-sm text-blue-600">
                        Último: {(hurdleTimes[hurdleTimes.length - 1] / 1000).toFixed(3)}s
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold text-gray-400">EN ESPERA</div>
                    <div className="text-sm text-gray-500">Presiona Iniciar Carrera</div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
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
                <User className="w-5 h-5 text-blue-600" />
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
              <Button onClick={addAthlete} className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Agregar Atleta
              </Button>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {athletes.map((athlete) => (
                  <div key={athlete.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-semibold">{athlete.name}</div>
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
                <Calendar className="w-5 h-5 text-blue-600" />
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
                <Label className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Número de Vallas
                </Label>
                <Select value={numHurdles.toString()} onValueChange={(val) => setNumHurdles(Number.parseInt(val))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...Array(20)].map((_, i) => (
                      <SelectItem key={i + 1} value={(i + 1).toString()}>
                        {i + 1} vallas
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                {!isRaceActive ? (
                  <Button onClick={startRace} className="flex-1 bg-green-600 hover:bg-green-700">
                    <Play className="w-4 h-4 mr-2" />
                    Iniciar Carrera
                  </Button>
                ) : (
                  <Button onClick={stopRace} className="flex-1 bg-red-600 hover:bg-red-700">
                    <Square className="w-4 h-4 mr-2" />
                    Detener Carrera
                  </Button>
                )}
              </div>

              {hurdleTimes.length > 0 && (
                <div>
                  <Label>Tiempos parciales:</Label>
                  <div className="grid grid-cols-5 gap-2 mt-2">
                    {hurdleTimes.map((time, index) => (
                      <div key={index} className="bg-blue-50 p-2 rounded text-center">
                        <div className="text-xs text-gray-600">V{index + 1}</div>
                        <div className="text-sm font-semibold">{formatTime(time)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                Historial de Sesiones
              </CardTitle>
              <Button onClick={exportData} variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Exportar Datos
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {sessions.map((session) => (
                <div key={session.id} className="border rounded-lg p-4 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-lg">{session.athleteName}</div>
                      <div className="text-sm text-gray-500">{new Date(session.date).toLocaleString("es-ES")}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-blue-600">{formatTime(session.totalTime)}</div>
                      <div className="text-xs text-gray-500">{session.numHurdles} vallas</div>
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-2">Parciales por valla:</div>
                    <div className="grid grid-cols-5 gap-2">
                      {session.hurdleTimes.map((time, index) => (
                        <div key={index} className="bg-gray-50 p-2 rounded text-center">
                          <div className="text-xs text-gray-600">V{index + 1}</div>
                          <div className="text-sm font-semibold">{formatTime(time)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default AutomatedTimingSystemDashboard
