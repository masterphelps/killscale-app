/**
 * Simple caption style template interface
 * Replaces the complex external caption template system
 */
export interface CaptionStyleTemplate {
  id: string;
  name: string;
  styles: {
    fontFamily: string;
    fontSize: string;
    fontWeight: string | number;
    color: string;
    backgroundColor?: string;
    background?: string;
    backdropFilter?: string;
    padding?: string;
    borderRadius?: string;
    textAlign: "left" | "center" | "right";
    lineHeight: number;
    letterSpacing?: string;
    textShadow?: string;
    highlightStyle?: {
      backgroundColor?: string;
      color?: string;
      scale?: number;
      fontWeight?: number;
      textShadow?: string;
      padding?: string;
      borderRadius?: string;
      transition?: string;
      background?: string;
      border?: string;
      backdropFilter?: string;
    };
  };
}

/**
 * Default caption style templates
 * Users can override these or provide their own
 */
export const defaultCaptionStyles: CaptionStyleTemplate[] = [
  {
    id: 'default',
    name: 'Default',
    styles: {
      fontFamily: 'Inter, sans-serif',
      fontSize: '24px',
      fontWeight: 600,
      color: '#ffffff',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      padding: '8px 16px',
      borderRadius: '4px',
      textAlign: 'center',
      lineHeight: 1.2,
    }
  },
  {
    id: 'modern',
    name: 'Modern',
    styles: {
      fontFamily: 'Inter, sans-serif',
      fontSize: '28px',
      fontWeight: 700,
      color: '#ffffff',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '12px 24px',
      borderRadius: '12px',
      textAlign: 'center',
      lineHeight: 1.3,
      textShadow: '0 2px 4px rgba(0,0,0,0.3)',
    }
  },
  {
    id: 'minimal',
    name: 'Minimal',
    styles: {
      fontFamily: 'Inter, sans-serif',
      fontSize: '22px',
      fontWeight: 500,
      color: '#333333',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      padding: '6px 12px',
      borderRadius: '6px',
      textAlign: 'center',
      lineHeight: 1.4,
    }
  },
  {
    id: 'bold',
    name: 'Bold',
    styles: {
      fontFamily: 'Inter, sans-serif',
      fontSize: '32px',
      fontWeight: 900,
      color: '#ffffff',
      backgroundColor: '#000000',
      padding: '16px 32px',
      borderRadius: '0px',
      textAlign: 'center',
      lineHeight: 1.1,
      letterSpacing: '1px',
      textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
    }
  },
  {
    id: 'highlight',
    name: 'Highlight',
    styles: {
      fontFamily: 'Inter, sans-serif',
      fontSize: '26px',
      fontWeight: 600,
      color: '#ffffff',
      backgroundColor: 'transparent',
      textAlign: 'center',
      lineHeight: 1.3,
      highlightStyle: {
        backgroundColor: '#ffeb3b',
        color: '#000000',
        padding: '2px 6px',
        borderRadius: '4px',
        fontWeight: 700,
      }
    }
  }
];

/**
 * Props interface for caption style components
 */
export interface CaptionStyleProps {
  templates?: CaptionStyleTemplate[];
  selectedTemplate?: string;
  onTemplateSelect?: (templateId: string) => void;
} 