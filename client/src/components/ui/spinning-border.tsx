"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * SpinningBorder Component
 * 
 * Cria um elemento com borda gradiente animada e efeito blur opcional
 * 
 * @example
 * // Borda padrão com blur
 * <SpinningBorder className="w-[300px] h-[100px]">
 *   <div className="bg-white">Conteúdo</div>
 * </SpinningBorder>
 * 
 * @example
 * // Borda fina sem blur
 * <SpinningBorder borderSize={1} showBlur={false}>
 *   <div>Conteúdo</div>
 * </SpinningBorder>
 * 
 * @example
 * // Borda grossa com blur suave
 * <SpinningBorder 
 *   borderSize={3} 
 *   blurOffset={8} 
 *   blurAmount={5}
 *   blurOpacity={0.3}
 * >
 *   <div>Conteúdo</div>
 * </SpinningBorder>
 */
interface SpinningBorderProps {
  children: React.ReactNode
  className?: string
  innerClassName?: string
  borderSize?: number // Tamanho da borda em pixels (default: 2)
  blurOffset?: number // Distância do blur em relação ao elemento (default: 6)
  blurAmount?: number // Intensidade do blur em pixels (default: 10)
  blurOpacity?: number // Opacidade do blur (default: 0.6)
  borderRadius?: number // Border radius em pixels (default: 6)
  gradientColors?: string[] // Array de cores para o gradiente
  animationDuration?: number // Duração da animação em segundos (default: 3)
  showBlur?: boolean // Mostrar ou não o efeito blur (default: true)
}

const SpinningBorder = React.forwardRef<HTMLDivElement, SpinningBorderProps>(
  (
    {
      children,
      className,
      innerClassName,
      borderSize = 2,
      blurOffset = 6,
      blurAmount = 10,
      blurOpacity = 0.6,
      borderRadius = 6,
      gradientColors = ["#216283", "#94A3B8", "#216283"],
      animationDuration = 3,
      showBlur = true,
    },
    ref
  ) => {
    const gradientString = `linear-gradient(45deg, ${gradientColors.join(", ")})`
    const styleId = React.useId().replace(/:/g, '')

    return (
      <>
        <div
          ref={ref}
          className={cn("spinning-border-container", className)}
          data-style-id={styleId}
        >
          {children}
        </div>
        <style>{`
          .spinning-border-container[data-style-id="${styleId}"] {
            position: relative;
            border-radius: ${borderRadius - 3}px;
            padding: 1px;
            overflow: visible;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .spinning-border-container[data-style-id="${styleId}"]::before {
            content: '';
            position: absolute;
            top: -${borderSize}px;
            left: -${borderSize}px;
            right: -${borderSize}px;
            bottom: -${borderSize}px;
            z-index: 0;
            border-radius: ${borderRadius}px;
            background: ${gradientString};
            background-size: 300% 300%;
            animation: gradient-shift-${styleId} ${animationDuration}s ease infinite;
            pointer-events: none;
          }
          ${showBlur ? `
          .spinning-border-container[data-style-id="${styleId}"]::after {
            content: '';
            position: absolute;
            top: -${blurOffset}px;
            left: -${blurOffset}px;
            right: -${blurOffset}px;
            bottom: -${blurOffset}px;
            z-index: -1;
            border-radius: ${borderRadius + 2}px;
            background: ${gradientString};
            background-size: 300% 300%;
            animation: gradient-shift-${styleId} ${animationDuration}s ease infinite;
            filter: blur(${blurAmount}px);
            opacity: ${blurOpacity};
            pointer-events: none;
          }` : ''}
          @keyframes gradient-shift-${styleId} {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          .spinning-border-container[data-style-id="${styleId}"] > * {
            position: relative;
            z-index: 1;
            width: 100%;
            height: 100%;
            border-radius: ${borderRadius - 1}px;
            overflow: hidden;
          }
        `}</style>
      </>
    )
  }
)

SpinningBorder.displayName = "SpinningBorder"

export { SpinningBorder }