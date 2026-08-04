"use client"

import * as React from "react"
import { useTheme } from "next-themes"

/**
 * Alterna entre o modo claro e o escuro com Ctrl + Shift + N.
 *
 * Não renderiza nada: o tema é fixado em claro por padrão e o modo escuro
 * só fica acessível por este atalho de teclado.
 */
export function ThemeShortcut() {
  const { resolvedTheme, setTheme } = useTheme()

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) return

      // event.code ignora o layout do teclado, mas nem todo ambiente o preenche;
      // por isso aceitamos tambem event.key como alternativa.
      const isTeclaN =
        event.code === "KeyN" || event.key?.toLowerCase() === "n"
      if (!isTeclaN) return

      event.preventDefault()
      setTheme(resolvedTheme === "dark" ? "light" : "dark")
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [resolvedTheme, setTheme])

  return null
}
