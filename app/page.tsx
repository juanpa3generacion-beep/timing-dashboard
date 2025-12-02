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
} from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

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
  times: number[]
  averageTime: number
  bestTime: number
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
  const [showBluetoothDialog, setShowBluetoothDialog] = useState(false)
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
  const [currentTime, setCurrentTime] = useState<number | null>(null)
  const [sessionTimes, setSessionTimes] = useState<number[]>([])
  const [isRecording, setIsRecording] = useState(false)

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
    if (outcome === "accepted") {
      setShowInstallButton(false)
    }
    setDeferredPrompt(null)
  }

  const connectToESP32 = async () => {
    if (!navigator.bluetooth) {
      alert("Bluetooth no disponible. Usa Chrome en Android.")
      return
    }
    try {
      setConnectionStatus("Buscando dispositivos...")
      setShowBluetoothDialog(true)
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
      characteristic.addEventListener("characteristicvaluechanged", handleBluetoothData)

      setBluetoothDevice(device)
      setBluetoothCharacteristic(characteristic)
      setIsConnected(true)
      setConnectionStatus("Conectado")
      setShowBluetoothDialog(false)
      setLastSignal(new Date())
    } catch (error: any) {
      setConnectionStatus("Error: " + error.message)
      setShowBluetoothDialog(false)
      alert("Error al conectar: " + error.message)
    }
  }

  const handleBluetoothData = (event: any) => {
    const value = event.target.value
    const timeMs = value.getUint32(0, true)
    setCurrentTime(timeMs)
    setLastSignal(new Date())

    if (isRecording && selectedAthleteId) {
      setSessionTimes((prev) => [...prev, timeMs])
    }
  }

  const disconnectESP32 = () => {
    if (bluetoothDevice?.gatt?.connected) {
      bluetoothDevice.gatt.disconnect()
    }
    setIsConnected(false)
    setConnectionStatus("Desconectado")
    setBluetoothDevice(null)
    setBluetoothCharacteristic(null)
  }

  const addAthlete = () => {
    if (!newAthleteName.trim()) return
    const newAthlete: Athlete = {
      id: Date.now().toString(),
      name: newAthleteName,
      category: newAthleteCategory,
    }
    setAthletes([...athletes, newAthlete])
    setNewAthleteName("")
  }

  const deleteAthlete = (id: string) => {
    setAthletes(athletes.filter((a) => a.id !== id))
  }

  const startSession = () => {
    if (!selectedAthleteId) {
      alert("Selecciona un atleta primero")
      return
    }
    setIsRecording(true)
    setSessionTimes([])
  }

  const endSession = () => {
    if (sessionTimes.length === 0) {
      alert("No hay tiempos registrados")
      return
    }

    const athlete = athletes.find((a) => a.id === selectedAthleteId)
    if (!athlete) return

    const avgTime = sessionTimes.reduce((a, b) => a + b, 0) / sessionTimes.length
    const bestTime = Math.min(...sessionTimes)

    const newSession: TrainingSession = {
      id: Date.now().toString(),
      athleteId: selectedAthleteId,
      athleteName: athlete.name,
      date: new Date().toISOString(),
      times: sessionTimes,
      averageTime: avgTime,
      bestTime: bestTime,
    }

    setSessions([...sessions, newSession])
    setIsRecording(false)
    setSessionTimes([])
  }

  const exportData = () => {
    const data = {
      athletes,
      sessions,
      exportDate: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `timing-data-${new Date().toISOString().split("T")[0]}.json`
    a.click()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Sistema de Cronometraje</h1>
          </div>
          {showInstallButton && (
            <Button onClick={handleInstallClick} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Instalar App
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isConnected ? <Wifi className="text-green-500" /> : <WifiOff className="text-red-500" />}
                Conexión ESP32
              </CardTitle>
              <CardDescription>{connectionStatus}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={isConnected ? disconnectESP32 : connectToESP32}
                variant={isConnected ? "destructive" : "default"}
                className="w-full"
                disabled={!isBluetoothSupported}
              >
                {isConnected ? "Desconectar" : "Conectar"}
              </Button>
              {lastSignal && (
                <p className="text-sm text-gray-500 mt-2">Última señal: {lastSignal.toLocaleTimeString()}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Timer className="text-blue-600" />
                Tiempo Actual
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-center text-blue-600">
                {currentTime ? (currentTime / 1000).toFixed(3) : "0.000"}s
              </div>
              {isRecording && <div className="text-center text-sm text-green-600 mt-2">Grabando sesión...</div>}
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
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Atletas:</span>
                  <span className="font-bold">{athletes.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Sesiones:</span>
                  <span className="font-bold">{sessions.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Tiempos hoy:</span>
                  <span className="font-bold">{sessionTimes.length}</span>
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
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label htmlFor="athlete-name">Nombre</Label>
                  <Input
                    id="athlete-name"
                    value={newAthleteName}
                    onChange={(e) => setNewAthleteName(e.target.value)}
                    placeholder="Nombre del atleta"
                  />
                </div>
                <div className="w-32">
                  <Label htmlFor="athlete-category">Categoría</Label>
                  <select
                    id="athlete-category"
                    value={newAthleteCategory}
                    onChange={(e) => setNewAthleteCategory(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option>Junior</option>
                    <option>Senior</option>
                    <option>Master</option>
                  </select>
                </div>
                <div className="pt-6">
                  <Button onClick={addAthlete} size="icon">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {athletes.map((athlete) => (
                  <div key={athlete.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">{athlete.name}</p>
                      <p className="text-sm text-gray-500">{athlete.category}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => deleteAthlete(athlete.id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
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
                <Label htmlFor="select-athlete">Seleccionar Atleta</Label>
                <select
                  id="select-athlete"
                  value={selectedAthleteId}
                  onChange={(e) => setSelectedAthleteId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  disabled={isRecording}
                >
                  <option value="">-- Seleccionar --</option>
                  {athletes.map((athlete) => (
                    <option key={athlete.id} value={athlete.id}>
                      {athlete.name} ({athlete.category})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={startSession}
                  disabled={!selectedAthleteId || isRecording || !isConnected}
                  className="flex-1"
                >
                  Iniciar Sesión
                </Button>
                <Button onClick={endSession} disabled={!isRecording} variant="destructive" className="flex-1">
                  Finalizar Sesión
                </Button>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Tiempos registrados:</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {sessionTimes.map((time, idx) => (
                    <div key={idx} className="text-sm p-2 bg-gray-50 rounded">
                      Intento {idx + 1}: {(time / 1000).toFixed(3)}s
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <TrendingUp className="text-indigo-600" />
                Historial de Sesiones
              </span>
              <Button onClick={exportData} variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Exportar Datos
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {sessions.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No hay sesiones registradas</p>
              ) : (
                sessions
                  .slice()
                  .reverse()
                  .map((session) => (
                    <div key={session.id} className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-medium">{session.athleteName}</p>
                          <p className="text-sm text-gray-500">{new Date(session.date).toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-600">Mejor: {(session.bestTime / 1000).toFixed(3)}s</p>
                          <p className="text-sm text-gray-600">Promedio: {(session.averageTime / 1000).toFixed(3)}s</p>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {session.times.map((time, idx) => (
                          <span key={idx} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                            {(time / 1000).toFixed(3)}s
                          </span>
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
