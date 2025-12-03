'use client'

import { useState, useEffect } from 'react';
import { Activity, Timer, TrendingUp, Wifi, WifiOff, User, Calendar, BarChart3, Plus, Trash2, Download, Play, Square, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Athlete {
  id: string;
  name: string;
  category: string;
}

interface TrainingSession {
  id: string;
  athleteId: string;
  athleteName: string;
  date: string;
  hurdleTimes: number[];
  totalTime: number;
  numHurdles: number;
}

declare global {
  interface BluetoothDevice extends EventTarget {
    id: string;
    name?: string;
    gatt?: BluetoothRemoteGATTServer;
  }

  interface BluetoothRemoteGATTServer {
    connected: boolean;
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
    getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
  }

  interface BluetoothRemoteGATTService {
    getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>;
  }

  interface BluetoothRemoteGATTCharacteristic extends EventTarget {
    value?: DataView;
    startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
    addEventListener(type: string, listener: (event: any) => void): void;
  }

  interface Navigator {
    bluetooth?: {
      requestDevice(options: {
        filters?: Array<{ namePrefix?: string; name?: string }>;
        optionalServices?: string[];
      }): Promise<BluetoothDevice>;
    };
  }
}

const AutomatedTimingSystemDashboard = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Desconectado');
  const [lastSignal, setLastSignal] = useState<Date | null>(null);
  const [bluetoothDevice, setBluetoothDevice] = useState<BluetoothDevice | null>(null);
  const [bluetoothCharacteristic, setBluetoothCharacteristic] = useState<any>(null);
  const [isBluetoothSupported, setIsBluetoothSupported] = useState(true);

  const [athletes, setAthletes] = useState<Athlete[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('athletes');
      return saved ? JSON.parse(saved) : [
        { id: '1', name: 'Juan Pérez', category: 'Junior' },
        { id: '2', name: 'María García', category: 'Senior' },
        { id: '3', name: 'Carlos López', category: 'Junior' }
      ];
    }
    return [];
  });
  const [newAthleteName, setNewAthleteName] = useState('');
  const [newAthleteCategory, setNewAthleteCategory] = useState('Junior');

  const [sessions, setSessions] = useState<TrainingSession[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sessions');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>('');
  const [isRaceActive, setIsRaceActive] = useState(false);
  const [hurdleTimes, setHurdleTimes] = useState<number[]>([]);
  const [numHurdles, setNumHurdles] = useState(10);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('athletes', JSON.stringify(athletes));
    }
  }, [athletes]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('sessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallButton(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallButton(false);
    }
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if (!navigator.bluetooth) {
      setIsBluetoothSupported(false);
    }
  }, []);

  useEffect(() => {
    const checkConnection = setInterval(() => {
      if (isConnected && bluetoothDevice && !bluetoothDevice.gatt?.connected) {
        setIsConnected(false);
        setConnectionStatus('Conexión perdida');
        setBluetoothDevice(null);
        setBluetoothCharacteristic(null);
      }
    }, 1000);
    return () => clearInterval(checkConnection);
  }, [isConnected, bluetoothDevice]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallButton(false);
    }
    setDeferredPrompt(null);
  };

  const connectToESP32 = async () => {
    if (!navigator.bluetooth) {
      alert('Bluetooth no disponible. Usa Chrome en Android.');
      return;
    }
    try {
      setConnectionStatus('Buscando dispositivos...');
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'ESP32' }, { namePrefix: 'ESP' }],
        optionalServices: ['4fafc201-1fb5-459e-8fcc-c5c9c331914b']
      });
      
      setConnectionStatus('Conectando...');
      const server = await device.gatt?.connect();
      if (!server) throw new Error('No se pudo conectar');
      
      const service = await server.getPrimaryService('4fafc201-1fb5-459e-8fcc-c5c9c331914b');
      const characteristic = await service.getCharacteristic('beb5483e-36e1-4688-b7f5-ea07361b26a8');
      
      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', handleTimeReceived);
      
      setBluetoothDevice(device);
      setBluetoothCharacteristic(characteristic);
      setIsConnected(true);
      setConnectionStatus('Conectado');
      setLastSignal(new Date());
    } catch (error) {
      console.error('Error conectando:', error);
      setConnectionStatus('Error de conexión');
      setIsConnected(false);
    }
  };

  const disconnectFromESP32 = () => {
    if (bluetoothDevice && bluetoothDevice.gatt?.connected) {
      bluetoothDevice.gatt.disconnect();
    }
    setIsConnected(false);
    setConnectionStatus('Desconectado');
    setBluetoothDevice(null);
    setBluetoothCharacteristic(null);
  };

  const handleTimeReceived = (event: any) => {
    const value = event.target.value;
    const timeMs = value.getUint32(0, true);
    
    setLastSignal(new Date());
    
    if (isRaceActive) {
      setHurdleTimes(prev => {
        const newTimes = [...prev, timeMs];
        if (newTimes.length >= numHurdles) {
          stopRace(newTimes);
        }
        return newTimes;
      });
    }
  };

  const startRace = () => {
    if (!selectedAthleteId) {
      alert('Selecciona un atleta primero');
      return;
    }
    if (!isConnected) {
      alert('Conecta el ESP32 primero');
      return;
    }
    setIsRaceActive(true);
    setHurdleTimes([]);
  };

  const stopRace = (times?: number[]) => {
    const finalTimes = times || hurdleTimes;
    if (finalTimes.length > 0) {
      saveSession(finalTimes);
    }
    setIsRaceActive(false);
    setHurdleTimes([]);
  };

  const saveSession = (times: number[]) => {
    const athlete = athletes.find(a => a.id === selectedAthleteId);
    if (!athlete) return;

    const totalTime = times[times.length - 1] || 0;
    
    const newSession: TrainingSession = {
      id: Date.now().toString(),
      athleteId: athlete.id,
      athleteName: athlete.name,
      date: new Date().toISOString(),
      hurdleTimes: times,
      totalTime: totalTime,
      numHurdles: numHurdles
    };

    setSessions(prev => [newSession, ...prev]);
  };

  const addAthlete = () => {
    if (!newAthleteName.trim()) return;
    const newAthlete: Athlete = {
      id: Date.now().toString(),
      name: newAthleteName,
      category: newAthleteCategory
    };
    setAthletes(prev => [...prev, newAthlete]);
    setNewAthleteName('');
  };

  const deleteAthlete = (id: string) => {
    setAthletes(prev => prev.filter(a => a.id !== id));
  };

  const exportData = () => {
    const data = { athletes, sessions };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timing-data-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const formatTime = (ms: number) => {
    return (ms / 1000).toFixed(3);
  };

  const getAthleteStats = (athleteId: string) => {
    const athleteSessions = sessions.filter(s => s.athleteId === athleteId);
    if (athleteSessions.length === 0) return null;
    
    const times = athleteSessions.map(s => s.totalTime);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const best = Math.min(...times);
    
    return { sessions: athleteSessions.length, avg, best };
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
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
                {isConnected ? <Wifi className="w-5 h-5 text-green-600" /> : <WifiOff className="w-5 h-5 text-red-600" />}
                Conexión ESP32
              </CardTitle>
              <CardDescription>{connectionStatus}</CardDescription>
            </CardHeader>
            <CardContent>
              {!isBluetoothSupported ? (
                <p className="text-sm text-red-600">Bluetooth no disponible. Usa Chrome en Android.</p>
              ) : isConnected ? (
                <div className="space-y-2">
                  <Button onClick={disconnectFromESP32} variant="destructive" className="w-full">
                    Desconectar
                  </Button>
                  {lastSignal && (
                    <p className="text-xs text-gray-500">
                      Última señal: {lastSignal.toLocaleTimeString()}
                    </p>
                  )}
                </div>
              ) : (
                <Button onClick={connectToESP32} className="w-full">
                  Conectar
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Timer className="w-5 h-5" />
                Tiempo Actual
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
                        Último: {(hurdleTimes[hurdleTimes.length - 1] / 1000).toFixed(3)}s
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
                <BarChart3 className="w-5 h-5" />
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
                <User className="w-5 h-5" />
                Gestión de Atletas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Label htmlFor="athleteName">Nombre</Label>
                  <Input
                    id="athleteName"
                    value={newAthleteName}
                    onChange={(e) => setNewAthleteName(e.target.value)}
                    placeholder="Nombre del atleta"
                  />
                </div>
                <div>
                  <Label htmlFor="category">Categoría</Label>
                  <Select value={newAthleteCategory} onValueChange={setNewAthleteCategory}>
                    <SelectTrigger id="category">
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

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {athletes.map((athlete) => {
                  const stats = getAthleteStats(athlete.id);
                  return (
                    <div key={athlete.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{athlete.name}</div>
                        <div className="text-sm text-gray-500">
                          {athlete.category}
                          {stats && ` • ${stats.sessions} sesiones • Mejor: ${formatTime(stats.best)}s`}
                        </div>
                      </div>
                      <Button
                        onClick={() => deleteAthlete(athlete.id)}
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Sesión de Entrenamiento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="selectAthlete">Seleccionar Atleta</Label>
                <Select value={selectedAthleteId} onValueChange={setSelectedAthleteId}>
                  <SelectTrigger id="selectAthlete">
                    <SelectValue placeholder="-- Seleccionar --" />
                  </SelectTrigger>
                  <SelectContent>
                    {athletes.map((athlete) => (
                      <SelectItem key={athlete.id} value={athlete.id}>
                        {athlete.name} ({athlete.category})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="numHurdles">Número de Vallas</Label>
                <Input
                  id="numHurdles"
                  type="number"
                  min="1"
                  max="20"
                  value={numHurdles}
                  onChange={(e) => setNumHurdles(parseInt(e.target.value) || 1)}
                  disabled={isRaceActive}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={startRace}
                  disabled={isRaceActive || !selectedAthleteId || !isConnected}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  <Play className="w-4 h-4" />
                  Iniciar Carrera
                </Button>
                <Button
                  onClick={() => stopRace()}
                  disabled={!isRaceActive}
                  variant="destructive"
                  className="gap-2"
                >
                  <Square className="w-4 h-4" />
                  Detener
                </Button>
              </div>

              {isRaceActive && hurdleTimes.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Tiempos Parciales:</h3>
                  <div className="grid grid-cols-5 gap-2">
                    {hurdleTimes.map((time, index) => (
                      <div key={index} className="text-center p-2 bg-blue-50 rounded">
                        <div className="text-xs text-gray-600">V{index + 1}</div>
                        <div className="text-sm font-bold">{formatTime(time)}s</div>
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
                <TrendingUp className="w-5 h-5" />
                Historial de Sesiones
              </CardTitle>
              <Button onClick={exportData} variant="outline" size="sm" className="gap-2 bg-transparent">
                <Download className="w-4 h-4" />
                Exportar Datos
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {sessions.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No hay sesiones registradas</p>
              ) : (
                sessions.map((session) => (
                  <div key={session.id} className="border rounded-lg p-4 bg-white hover:bg-gray-50">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="font-semibold text-lg">{session.athleteName}</div>
                        <div className="text-sm text-gray-500">
                          {new Date(session.date).toLocaleString('es-ES')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-blue-600">
                          {formatTime(session.totalTime)}s
                        </div>
                        <div className="text-xs text-gray-500">{session.numHurdles} vallas</div>
                      </div>
                    </div>
                    
                    {session.hurdleTimes.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-gray-600 mb-2">Tiempos por valla:</div>
                        <div className="grid grid-cols-5 gap-2">
                          {session.hurdleTimes.map((time, index) => (
                            <div key={index} className="text-center p-2 bg-gray-100 rounded">
                              <div className="text-xs text-gray-600">V{index + 1}</div>
                              <div className="text-sm font-semibold">{formatTime(time)}s</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AutomatedTimingSystemDashboard;
