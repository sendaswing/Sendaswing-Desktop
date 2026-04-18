import React from 'react'
import { MousePointer, Minus, ArrowRight, Circle, Triangle, Pencil, Trash2 } from 'lucide-react'
import { useAnalysisStore } from '../../store/analysisStore'
import { TOOL_COLORS, type ToolDefinition, TOOL_DEFINITIONS } from '../../lib/drawing/tools'
import { cn } from '../../lib/utils/cn'
import type { DrawingToolType } from '../../types/drawing'

const ICONS: Record<string, React.ComponentType<any>> = {
  MousePointer, Minus, ArrowRight, Circle, Triangle, Pencil
}

export function ToolPalette() {
  const { activeTool, activeStyle, setActiveTool, setActiveStyle, clearCurrentLayerAnnotations } = useAnalysisStore()

  return (
    <div className="flex flex-col gap-3 p-2 bg-surface-800 border-r border-white/5 w-12 shrink-0">
      {TOOL_DEFINITIONS.map((tool) => {
        const Icon = ICONS[tool.icon]
        return (
          <button
            key={tool.type}
            onClick={() => setActiveTool(tool.type === activeTool ? null : tool.type)}
            title={tool.label}
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded transition-colors',
              activeTool === tool.type
                ? 'bg-accent-500/30 text-accent-400 ring-1 ring-accent-500/60'
                : 'text-white/40 hover:text-white/80 hover:bg-white/5'
            )}
          >
            {Icon && <Icon size={14} />}
          </button>
        )
      })}

      <div className="border-t border-white/10 pt-2 flex flex-col gap-1">
        {TOOL_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => setActiveStyle({ color })}
            className={cn(
              'w-6 h-6 rounded-full mx-auto transition-transform',
              activeStyle.color === color ? 'scale-125 ring-2 ring-white/50' : 'hover:scale-110'
            )}
            style={{ background: color }}
            title={color}
          />
        ))}
      </div>

      <div className="mt-auto border-t border-white/10 pt-2">
        <button
          onClick={clearCurrentLayerAnnotations}
          title="Clear all annotations"
          className="w-8 h-8 flex items-center justify-center rounded text-white/30 hover:text-red-400 hover:bg-red-400/10 transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}
