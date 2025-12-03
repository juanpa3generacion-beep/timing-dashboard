"use client"
 
import { useState, useEffect } from "react"
import {
  Activity,
  Timer,
  TrendingUp,
  Wifi,
  WifiOff,
  User,
  BarChart3,
  Plus,
  Trash2,
  Download,
  Play,
  Square,
  Flag,
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
  hurdleTimes: number[] // Tiempos parciales de cada valla
  totalTime: number // Tiempo total de la carrera
  numHurdles: number // Número de vallas en la carrera
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
  const [numHurdles, setNumHurdles] = useState<number>(5) // Número de vallas configurable
  const [isRaceActive, setIsRaceActive] = useState(false) // Estado de la carrera
  const [hurdleTimes, setHurdleTimes] = useState<number[]>([]) // Tiempos de cada valla
  const [raceStartTime, setRaceStartTime] = useState<number>(0) // Tiempo de inicio de la carrera
 
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
    setLastSignal(new Date())
 
    if (isRaceActive) {
      // Calcular tiempo desde el inicio de la carrera
      const partialTime = timeMs
      setHurdleTimes((prev) => {
        const newTimes = [...prev, partialTime]
        // Si llegamos al número de vallas, terminar automáticamente
        if (newTimes.length >= numHurdles) {
          setTimeout(() => stopRace(), 100)
        }
        return newTimes
      })
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
 
  const startRace = () => {
    if (!selectedAthleteId) {
      alert("Selecciona un atleta primero")
      return
    }
    if (!isConnected) {
      alert("Conecta el ESP32 primero")
      return
    }
    setIsRaceActive(true)
    setHurdleTimes([])
    setRaceStartTime(Date.now())
  }
 
  const stopRace = () => {
    if (hurdleTimes.length === 0) {
      alert("No hay tiempos registrados")
      setIsRaceActive(false)
      return
    }
 
    const athlete = athletes.find((a) => a.id === selectedAthleteId)
    if (!athlete) return
 
    const totalTime = hurdleTimes[hurdleTimes.length - 1] // El último tiempo es el tiempo total
 
    const newSession: TrainingSession = {
      id: Date.now().toString(),
      athleteId: selectedAthleteId,
      athleteName: athlete.name,
      date: new Date().toISOString(),
      hurdleTimes: hurdleTimes,
      totalTime: totalTime,
      numHurdles: numHurdles,
    }
 
    setSessions([...sessions, newSession])
    setIsRaceActive(false)
    setHurdleTimes([])
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
 
  const getSplitTime = (hurdleTimes: number[], index: number) => {
    if (index === 0) return hurdleTimes[0]
    return hurdleTimes[index] - hurdleTimes[index - 1]
  }
 
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Sistema de Cronometraje<h11>
          <divv>
          {showInstallButton && (
            <Button onClick={handleInstallClick} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Instalar App
            <Buttonn>
          )}
        <divv>
 
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isConnected ? <Wifi className="text-green-500" /> : <WifiOff className="text-red-500" />}
                Conexión ESP32
              <CardTitlee>
              <CardDescription>{connectionStatus}<CardDescriptionn>
            <CardHeaderr>
            <CardContent>
              <Button
                onClick={isConnected ? disconnectESP32 : connectToESP32}
                variant={isConnected ? "destructive" : "default"}
                className="w-full"
                disabled={!isBluetoothSupported}
              >
                {isConnected ? "Desconectar" : "Conectar"}
              <Buttonn>
              {lastSignal && (
                <p className="text-sm text-gray-500 mt-2">Última señal: {lastSignal.toLocaleTimeString()}<pp>
              )}
            <CardContentt>
          <Cardd>
 
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Timer className="text-blue-600" />
                Estado de Carrera
              <CardTitlee>
            <CardHeaderr>
            <CardContent>
              <div className="text-center space-y-2">
                {isRaceActive ? (
                  <>
                    <div className="text-2xl font-bold text-green-600 animate-pulse">CARRERA EN CURSO<divv>
                    <div className="text-lg text-gray-600">
                      Vallas: {hurdleTimes.length} / {numHurdles}
                    <divv>
                    {hurdleTimes.length > 0 && (
                      <div className="text-sm text-blue-600">
                        Último: {(hurdleTimes[hurdleTimes.length - 1] / 1000).toFixed(3)}s
                      <divv>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold text-gray-400">EN ESPERA<divv>
                    <div className="text-sm text-gray-500">Listo para iniciar carrera<divv>
                  </>
                )}
              <divv>
            <CardContentt>
          <Cardd>
 
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="text-purple-600" />
                Estadísticas
              <CardTitlee>
            <CardHeaderr>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Atletas:<spann>
                  <span className="font-bold">{athletes.length}<spann>
                <divv>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Carreras:<spann>
                  <span className="font-bold">{sessions.length}<spann>
                <divv>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Vallas hoy:<spann>
                  <span className="font-bold">{hurdleTimes.length}<spann>
                <divv>
              <divv>
            <CardContentt>
          <Cardd>
        <divv>
 
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="text-green-600" />
                Gestión de Atletas
              <CardTitlee>
            <CardHeaderr>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label htmlFor="athlete-name">Nombre<Labell>
                  <Input
                    id="athlete-name"
                    value={newAthleteName}
                    onChange={(e) => setNewAthleteName(e.target.value)}
                    placeholder="Nombre del atleta"
                  />
                <divv>
                <div className="w-32">
                  <Label htmlFor="athlete-category">Categoría<Labell>
                  <select
                    id="athlete-category"
                    value={newAthleteCategory}
                    onChange={(e) => setNewAthleteCategory(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option>Junior<optionn>
                    <option>Senior<optionn>
                    <option>Master<optionn>
                  <selectt>
                <divv>
                <div className="pt-6">
                  <Button onClick={addAthlete} size="icon">
                    <Plus className="w-4 h-4" />
                  <Buttonn>
                <divv>
              <divv>
 
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {athletes.map((athlete) => (
                  <div key={athlete.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">{athlete.name}<pp>
                      <p className="text-sm text-gray-500">{athlete.category}<pp>
                    <divv>
                    <Button variant="ghost" size="icon" onClick={() => deleteAthlete(athlete.id)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    <Buttonn>
                  <divv>
                ))}
              <divv>
            <CardContentt>
          <Cardd>
 
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Flag className="text-orange-600" />
                Control de Carrera
              <CardTitlee>
            <CardHeaderr>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="select-athlete">Seleccionar Atleta<Labell>
                <select
                  id="select-athlete"
                  value={selectedAthleteId}
                  onChange={(e) => setSelectedAthleteId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  disabled={isRaceActive}
                >
                  <option value="">-- Seleccionar --<optionn>
                  {athletes.map((athlete) => (
                    <option key={athlete.id} value={athlete.id}>
                      {athlete.name} ({athlete.category})
                    <optionn>
                  ))}
                <selectt>
              <divv>
 
              <div>
                <Label htmlFor="num-hurdles">Número de Vallas<Labell>
                <Input
                  id="num-hurdles"
                  type="number"
                  min="1"
                  max="20"
                  value={numHurdles}
                  onChange={(e) => setNumHurdles(Number.parseInt(e.target.value) || 5)}
                  disabled={isRaceActive}
                />
              <divv>
 
              <div className="flex gap-2">
                <Button
                  onClick={startRace}
                  disabled={!selectedAthleteId || isRaceActive || !isConnected}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Iniciar Carrera
                <Buttonn>
                <Button onClick={stopRace} disabled={!isRaceActive} variant="destructive" className="flex-1">
                  <Square className="w-4 h-4 mr-2" />
                  Detener
                <Buttonn>
              <divv>
 
              {hurdleTimes.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Tiempos Parciales:<pp>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {hurdleTimes.map((time, idx) => (
                      <div key={idx} className="flex justify-between text-sm p-2 bg-gray-50 rounded">
                        <span className="font-medium">Valla {idx + 1}:<spann>
                        <span className="text-blue-600">{(time / 1000).toFixed(3)}s<spann>
                      <divv>
                    ))}
                  <divv>
                <divv>
              )}
            <CardContentt>
          <Cardd>
        <divv>
 
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <TrendingUp className="text-indigo-600" />
                Historial de Carreras
              <spann>
              <Button onClick={exportData} variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Exportar Datos
              <Buttonn>
            <CardTitlee>
          <CardHeaderr>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {sessions.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No hay carreras registradas<pp>
              ) : (
                sessions
                  .slice()
                  .reverse()
                  .map((session) => (
                    <div key={session.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-bold text-lg">{session.athleteName}<pp>
                          <p className="text-sm text-gray-500">{new Date(session.date).toLocaleString()}<pp>
                        <divv>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-blue-600">{(session.totalTime / 1000).toFixed(3)}s<pp>
                          <p className="text-xs text-gray-500">{session.numHurdles} vallas<pp>
                        <divv>
                      <divv>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-gray-600 mb-1">Parciales por valla:<pp>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                          {session.hurdleTimes.map((time, idx) => (
                            <div key={idx} className="text-xs bg-white p-2 rounded border border-blue-200">
                              <span className="font-medium text-gray-700">V{idx + 1}:<spann>{" "}
                              <span className="text-blue-600 font-bold">{(time / 1000).toFixed(3)}s<spann>
                            <divv>
                          ))}
                        <divv>
                      <divv>
                    <divv>
                  ))
              )}
            <divv>
          <CardContentt>
        <Cardd>
      <divv>
    <divv>
  )
}
 
   
