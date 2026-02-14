export type Layout3DTemplate = {
  key?: string;
  name: string;
  preview: string;
  isPro?: boolean;
  transform: () => {
    transform?: string;
    perspective?: string;
    transformStyle?: string;
    zIndex?: number;
  };
};

export const layout3DTemplates: Record<string, Layout3DTemplate> = {
  none: {
    key: "none",
    name: "None",
    preview: "No 3D effect",
    transform: () => ({}),
  },
  tiltUp: {
    key: "tilt-up",
    name: "Tilt Up",
    preview: "Tilted upward view",
    transform: () => ({
      transform: "perspective(1000px) rotateX(-20deg)",
      transformStyle: "preserve-3d",
      zIndex: 10,
    }),
  },
  tiltDown: {
    key: "tilt-down",
    name: "Tilt Down", 
    preview: "Tilted downward view",
    transform: () => ({
      transform: "perspective(1000px) rotateX(20deg)",
      transformStyle: "preserve-3d",
      zIndex: 10,
    }),
  },
  cardLeft: {
    key: "card-left",
    name: "Left",
    preview: "Card-like left rotation",
    isPro: true,
    transform: () => ({
      transform: "perspective(800px) rotateY(-25deg) rotateX(10deg) translateZ(20px)",
      transformStyle: "preserve-3d",
      zIndex: 15,
    }),
  },
  cardRight: {
    key: "card-right",
    name: "Right", 
    preview: "Card-like right rotation",
    isPro: true,
    transform: () => ({
      transform: "perspective(800px) rotateY(25deg) rotateX(10deg) translateZ(20px)",
      transformStyle: "preserve-3d",
      zIndex: 15,
    }),
  },
  book: {
    key: "book",
    name: "Book",
    preview: "Open book perspective",
    isPro: true,
    transform: () => ({
      transform: "perspective(1200px) rotateY(-45deg) rotateX(15deg) translateZ(30px)",
      transformStyle: "preserve-3d",
      zIndex: 20,
    }),
  },
  floating: {
    key: "floating",
    name: "Floating",
    preview: "Elevated floating effect",
    isPro: true,
    transform: () => ({
      transform: "perspective(1000px) translateZ(50px) rotateX(-5deg) rotateY(10deg)",
      transformStyle: "preserve-3d",
      zIndex: 25,
    }),
  },
  billboard: {
    key: "billboard",
    name: "Billboard",
    preview: "Billboard perspective",
    isPro: true,
    transform: () => ({
      transform: "perspective(1500px) rotateX(-30deg) translateZ(40px)",
      transformStyle: "preserve-3d",
      zIndex: 20,
    }),
  },
  skewed: {
    key: "skewed",
    name: "Skewed",
    preview: "Dramatic skew effect",
    isPro: true,
    transform: () => ({
      transform: "perspective(600px) rotateY(-35deg) rotateX(25deg) skewX(-5deg)",
      transformStyle: "preserve-3d", 
      zIndex: 30,
    }),
  },
};

/**
 * Helper function to convert kebab-case layout keys to camelCase keys
 */
export const getLayout3DKey = (kebabKey: string): string => {
  const keyMap: Record<string, string> = {
    'none': 'none',
    'tilt-up': 'tiltUp',
    'tilt-down': 'tiltDown',
    'card-left': 'cardLeft',
    'card-right': 'cardRight',
    'book': 'book',
    'floating': 'floating',
    'billboard': 'billboard',
    'skewed': 'skewed'
  };
  return keyMap[kebabKey] || kebabKey;
};

/**
 * Creates a static 3D layout adaptor from layout templates
 */
export const createStatic3DLayoutAdaptor = (
  layouts: Record<string, Layout3DTemplate>, 
  displayName: string = '3D Layout Templates'
) => ({
  name: 'static-3d-layouts',
  displayName,
  description: 'Static collection of 3D layout templates',
  requiresAuth: false,
  
  getTemplates: async (config?: Record<string, any>) => {
    console.log("get3DTemplates", config);
    const items = Object.values(layouts);
    
    return {
      items,
      totalCount: items.length
    };
  }
});

/**
 * Default 3D layout adaptor with built-in layout templates
 */
export const default3DLayoutAdaptor = createStatic3DLayoutAdaptor(layout3DTemplates, 'Default 3D Layouts'); 