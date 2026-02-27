'use client'

import { useCallback, useState } from 'react'
import { useEditorContext } from '../../contexts/editor-context'
import { OverlayType, CTAOverlay } from '../../types'
import { setCurrentNewItemDragData, setCurrentNewItemDragType } from '../advanced-timeline/hooks/use-new-item-drag'

export interface CTATemplate {
  id: string
  label: string
  text: string
  buttonColor: string
  textColor: string
  style: 'pill' | 'block' | 'outline' | 'gradient'
}

interface CTAPanelProps {
  onAddCTA: (template: CTATemplate) => void
}

const CTA_TEMPLATES: CTATemplate[] = [
  { id: 'buy-red', label: 'Buy Now', text: 'BUY NOW', buttonColor: '#ef4444', textColor: '#ffffff', style: 'pill' },
  { id: 'shop-blue', label: 'Shop Now', text: 'SHOP NOW', buttonColor: '#3b82f6', textColor: '#ffffff', style: 'pill' },
  { id: 'learn-green', label: 'Learn More', text: 'LEARN MORE', buttonColor: '#22c55e', textColor: '#ffffff', style: 'pill' },
  { id: 'signup-purple', label: 'Sign Up', text: 'SIGN UP FREE', buttonColor: '#8b5cf6', textColor: '#ffffff', style: 'pill' },
  { id: 'get-offer', label: 'Get Offer', text: 'GET 50% OFF', buttonColor: '#f59e0b', textColor: '#000000', style: 'block' },
  { id: 'try-free', label: 'Try Free', text: 'TRY IT FREE', buttonColor: '#06b6d4', textColor: '#ffffff', style: 'outline' },
  { id: 'order-gradient', label: 'Order Now', text: 'ORDER NOW', buttonColor: 'linear-gradient(135deg, #ec4899, #8b5cf6)', textColor: '#ffffff', style: 'gradient' },
  { id: 'swipe-up', label: 'Swipe Up', text: 'SWIPE UP ↑', buttonColor: '#ffffff', textColor: '#000000', style: 'pill' },
]

const COLOR_PRESETS = [
  '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
  '#ffffff', '#000000',
]

function CTACard({ template, onAddCTA }: { template: CTATemplate; onAddCTA: (t: CTATemplate) => void }) {
  const handleDragStart = useCallback((e: React.DragEvent) => {
    const dragData = {
      isNewItem: true,
      type: 'cta',
      label: template.text,
      duration: 3,
      data: template,
    }

    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/json', JSON.stringify(dragData))

    setCurrentNewItemDragType('cta')
    setCurrentNewItemDragData(dragData)

    const preview = document.createElement('div')
    preview.style.cssText = 'position:absolute;top:-9999px;padding:6px 12px;border-radius:6px;font-size:12px;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.3)'
    preview.style.background = template.buttonColor
    preview.style.color = template.textColor
    preview.textContent = template.text
    document.body.appendChild(preview)
    e.dataTransfer.setDragImage(preview, 40, 14)
    setTimeout(() => preview.remove(), 0)
  }, [template])

  const handleDragEnd = useCallback(() => {
    setCurrentNewItemDragType(null)
    setCurrentNewItemDragData(null)
  }, [])

  return (
    <button
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={() => onAddCTA(template)}
      className="rounded-lg overflow-hidden border border-border hover:border-zinc-600 transition-colors cursor-grab active:cursor-grabbing"
    >
      <div className="h-20 flex items-center justify-center bg-bg-card">
        <span
          className="text-sm font-bold px-4 py-2"
          style={{
            background: template.style === 'gradient' ? template.buttonColor : template.style === 'outline' ? 'transparent' : template.buttonColor,
            color: template.textColor,
            border: template.style === 'outline' ? `2px solid ${template.buttonColor}` : 'none',
            borderRadius: template.style === 'block' ? '4px' : '9999px',
          }}
        >
          {template.text}
        </span>
      </div>
      <div className="px-2.5 py-2 bg-bg-hover">
        <p className="text-sm text-zinc-400 text-center">{template.label}</p>
      </div>
    </button>
  )
}

/** Editor for the currently selected CTA overlay */
function CTAEditor({ overlay }: { overlay: CTAOverlay }) {
  const { changeOverlay } = useEditorContext()
  const [text, setText] = useState(overlay.content)

  const updateStyle = useCallback((updates: Partial<CTAOverlay['styles']>) => {
    const updated = {
      ...overlay,
      styles: { ...overlay.styles, ...updates },
    }
    changeOverlay(overlay.id, () => updated as any)
  }, [overlay, changeOverlay])

  const updateText = useCallback((newText: string) => {
    setText(newText)
    const updated = { ...overlay, content: newText }
    changeOverlay(overlay.id, () => updated as any)
  }, [overlay, changeOverlay])

  const applyTemplate = useCallback((template: CTATemplate) => {
    const updated = {
      ...overlay,
      content: template.text,
      styles: {
        ...overlay.styles,
        color: template.textColor,
        backgroundColor: template.style === 'gradient' ? 'transparent' : (template.style === 'outline' ? 'transparent' : template.buttonColor),
        background: template.style === 'gradient' ? template.buttonColor : undefined,
        borderRadius: template.style === 'block' ? '4px' : '9999px',
        border: template.style === 'outline' ? `2px solid ${template.buttonColor}` : 'none',
      },
    }
    setText(template.text)
    changeOverlay(overlay.id, () => updated as any)
  }, [overlay, changeOverlay])

  // Detect current shape style from border-radius
  const currentShape = overlay.styles.borderRadius === '4px' ? 'block' : 'pill'
  const currentBgColor = overlay.styles.background || overlay.styles.backgroundColor || '#ef4444'

  return (
    <div className="space-y-4">
      {/* Text */}
      <div className="space-y-1.5">
        <label className="text-xs text-zinc-500 uppercase tracking-wide">Button Text</label>
        <input
          type="text"
          value={text}
          onChange={(e) => updateText(e.target.value)}
          className="w-full text-sm px-3 py-2.5 rounded-lg bg-bg-hover border border-border text-white focus:outline-none focus:border-purple-500/50"
        />
      </div>

      {/* Shape */}
      <div className="space-y-1.5">
        <label className="text-xs text-zinc-500 uppercase tracking-wide">Shape</label>
        <div className="flex gap-2">
          <button
            onClick={() => updateStyle({ borderRadius: '9999px', border: 'none' })}
            className={`flex-1 text-sm py-2 rounded-lg border transition-colors ${currentShape === 'pill' ? 'border-purple-500 bg-purple-500/10 text-white' : 'border-border text-zinc-400 hover:border-zinc-600'}`}
          >
            Pill
          </button>
          <button
            onClick={() => updateStyle({ borderRadius: '4px', border: 'none' })}
            className={`flex-1 text-sm py-2 rounded-lg border transition-colors ${currentShape === 'block' ? 'border-purple-500 bg-purple-500/10 text-white' : 'border-border text-zinc-400 hover:border-zinc-600'}`}
          >
            Block
          </button>
        </div>
      </div>

      {/* Button Color */}
      <div className="space-y-1.5">
        <label className="text-xs text-zinc-500 uppercase tracking-wide">Button Color</label>
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((color) => (
            <button
              key={color}
              onClick={() => updateStyle({ backgroundColor: color, background: undefined })}
              className={`w-8 h-8 rounded-full border-2 transition-all ${currentBgColor === color ? 'border-white scale-110' : 'border-transparent hover:border-zinc-500'}`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      {/* Text Color */}
      <div className="space-y-1.5">
        <label className="text-xs text-zinc-500 uppercase tracking-wide">Text Color</label>
        <div className="flex gap-2">
          <button
            onClick={() => updateStyle({ color: '#ffffff' })}
            className={`flex-1 text-sm py-2 rounded-lg border transition-colors ${overlay.styles.color === '#ffffff' ? 'border-purple-500 bg-purple-500/10 text-white' : 'border-border text-zinc-400 hover:border-zinc-600'}`}
          >
            White
          </button>
          <button
            onClick={() => updateStyle({ color: '#000000' })}
            className={`flex-1 text-sm py-2 rounded-lg border transition-colors ${overlay.styles.color === '#000000' ? 'border-purple-500 bg-purple-500/10 text-white' : 'border-border text-zinc-400 hover:border-zinc-600'}`}
          >
            Black
          </button>
        </div>
      </div>

      {/* Quick swap to template */}
      <div className="space-y-1.5">
        <label className="text-xs text-zinc-500 uppercase tracking-wide">Swap Style</label>
        <div className="grid grid-cols-4 gap-1.5">
          {CTA_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => applyTemplate(t)}
              className="rounded-md overflow-hidden border border-border hover:border-zinc-500 transition-colors"
              title={t.label}
            >
              <div className="h-8 flex items-center justify-center bg-bg-card">
                <span
                  className="text-[9px] font-bold px-2 py-0.5"
                  style={{
                    background: t.style === 'gradient' ? t.buttonColor : t.style === 'outline' ? 'transparent' : t.buttonColor,
                    color: t.textColor,
                    border: t.style === 'outline' ? `1px solid ${t.buttonColor}` : 'none',
                    borderRadius: t.style === 'block' ? '2px' : '9999px',
                  }}
                >
                  {t.text}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function CTAPanel({ onAddCTA }: CTAPanelProps) {
  const { selectedOverlayId, overlays } = useEditorContext()

  // Check if the selected overlay is a CTA
  const selectedCTA = selectedOverlayId !== null
    ? overlays.find(o => o.id === selectedOverlayId && o.type === OverlayType.CTA) as CTAOverlay | undefined
    : undefined

  return (
    <div className="p-3 space-y-3 flex flex-col h-full overflow-x-hidden">
      {selectedCTA ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <CTAEditor overlay={selectedCTA} />
        </div>
      ) : (
        <>
          <p className="text-sm text-zinc-500 px-1 flex-shrink-0">Drag or click to add</p>
          <div className="grid grid-cols-2 gap-2.5 flex-1 min-h-0 overflow-y-auto">
            {CTA_TEMPLATES.map((template) => (
              <CTACard key={template.id} template={template} onAddCTA={onAddCTA} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
