# Ruta viva (Expo Go)

Versión nativa para probar en **Expo Go** (iPhone), con mapa que se adapta a la velocidad.

## En el Mac

```bash
cd ~/Desktop/Proyectos
git clone https://github.com/neosigmatrend/ruta-viva-expo.git
cd ruta-viva-expo
npm install
npx expo start
```

## En el iPhone

1. Instalá **Expo Go** desde App Store  
2. Misma WiFi que el Mac  
3. Escaneá el QR del terminal  

## Probar velocidad del mapa

En ruta en curso, abajo en **Debug velocidad**:

- `GPS` — velocidad real  
- `40` / `90` / `120` — simula km/h (zoom se abre)  
- `0` vía GPS o pausa — zoom cerca  

También: Simular peaje · Simular llegada.

## Nota

La PWA web sigue en https://github.com/neosigmatrend/ruta-viva  
Esta app Expo es para test en teléfono como el ayuno.
