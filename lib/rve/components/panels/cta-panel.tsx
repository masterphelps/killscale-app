'use client'

import { AISection } from './ai-section'

export interface CTATemplate {
  id: string
  label: string
  text: string
  buttonColor: string
  textColor: string
  style: 'pill' | 'block' | 'outline' | 'gradient'
}

interface CTAPanelProps {
  onAIGenerate: (instruction: string) => Promise<void>
  isAIGenerating: boolean
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

export function CTAPanel({ onAIGenerate, isAIGenerating, onAddCTA }: CTAPanelProps) {
  return (
    <div className="p-3 space-y-3">
      <AISection
        onGenerate={(instruction) => onAIGenerate(`Create CTA: ${instruction}`)}
        isGenerating={isAIGenerating}
        placeholder="Describe CTA you want..."
        quickActions={[
          { label: 'Add end-screen CTA', instruction: 'Add a call-to-action button at the end of the video' },
        ]}
      />

      <p className="text-sm text-zinc-500 px-1">Templates</p>
      <div className="grid grid-cols-2 gap-2.5">
        {CTA_TEMPLATES.map((template) => (
          <button
            key={template.id}
            onClick={() => onAddCTA(template)}
            className="rounded-lg overflow-hidden border border-border hover:border-zinc-600 transition-colors"
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
        ))}
      </div>
    </div>
  )
}
