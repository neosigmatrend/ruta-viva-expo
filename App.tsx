import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'
import { HomeScreen } from './src/screens/HomeScreen'
import { ArmarScreen } from './src/screens/ArmarScreen'
import { RutaActivaScreen } from './src/screens/RutaActivaScreen'
import { ResumenScreen } from './src/screens/ResumenScreen'
import { MapaMacroScreen } from './src/screens/MapaMacroScreen'

type Screen =
  | { name: 'home' }
  | { name: 'armar' }
  | { name: 'activa'; rutaId: string }
  | { name: 'resumen'; rutaId: string }
  | { name: 'mapaMacro'; rutaIds: string[] }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' })

  return (
    <>
      <StatusBar style="light" />
      {screen.name === 'home' && (
        <HomeScreen
          onNueva={() => setScreen({ name: 'armar' })}
          onContinuar={(id) => setScreen({ name: 'activa', rutaId: id })}
          onResumen={(id) => setScreen({ name: 'resumen', rutaId: id })}
          onMapaMacro={(ids) => setScreen({ name: 'mapaMacro', rutaIds: ids })}
        />
      )}
      {screen.name === 'armar' && (
        <ArmarScreen
          onCancel={() => setScreen({ name: 'home' })}
          onIniciada={(id) => setScreen({ name: 'activa', rutaId: id })}
        />
      )}
      {screen.name === 'activa' && (
        <RutaActivaScreen
          rutaId={screen.rutaId}
          onHome={() => setScreen({ name: 'home' })}
          onFinalizada={(id) => setScreen({ name: 'resumen', rutaId: id })}
        />
      )}
      {screen.name === 'resumen' && (
        <ResumenScreen
          rutaId={screen.rutaId}
          onHome={() => setScreen({ name: 'home' })}
        />
      )}
      {screen.name === 'mapaMacro' && (
        <MapaMacroScreen
          rutaIds={screen.rutaIds}
          onBack={() => setScreen({ name: 'home' })}
        />
      )}
    </>
  )
}
