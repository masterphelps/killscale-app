import { TextOverlayAdaptor } from '../types/overlay-adaptors';
import { TextOverlayTemplate, textOverlayTemplates } from '../templates/text-overlay-templates';

/**
 * Creates a static text adaptor from a collection of text templates
 * Useful for providing predefined text template collections
 */
export const createStaticTextAdaptor = (templates: TextOverlayTemplate[], displayName: string = 'Text Templates'): TextOverlayAdaptor => ({
  name: 'static-text',
  displayName,
  description: 'Static collection of text templates',
  requiresAuth: false,
  
  getTemplates: async () => {
    return {
      items: templates,
      totalCount: templates.length
    };
  }
});

/**
 * Default text adaptor with all current text overlay templates
 * Automatically included when no text adaptors are configured
 */
export const defaultTextAdaptor = createStaticTextAdaptor(
  Object.values(textOverlayTemplates), 
  'Default Text Styles'
);

/**
 * Helper function to get default text adaptors
 * This provides a consistent way to include default text templates
 */
export const getDefaultTextAdaptors = (): TextOverlayAdaptor[] => {
  return [defaultTextAdaptor];
}; 