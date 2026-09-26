import { useEffect } from 'react'

/** Recarga al montar (navegación simple sin React Navigation). */
export function useFocusEffect(cb: () => void | Promise<void>) {
  useEffect(() => {
    void cb()
  }, [cb])
}
