import { TemplateOverlayAdaptor } from "../types/overlay-adaptors";
import { TemplateOverlay, Overlay, OverlayType } from "../types";

/**
 * Finds a suitable thumbnail URL from a list of overlays.
 * Prioritizes video overlays first, then falls back to image overlays.
 *
 * @param overlays - Array of template overlays to search through
 * @returns The content URL of the first suitable overlay, or undefined if none found
 */
const findThumbnailFromOverlays = (overlays: Overlay[]): string | undefined => {
  // First try to find a video overlay
  const videoOverlay = overlays.find(
    (overlay) => overlay.type === OverlayType.VIDEO
  );
  if (videoOverlay && "content" in videoOverlay) {
    return videoOverlay.content;
  }

  // Then try to find an image overlay
  const imageOverlay = overlays.find(
    (overlay) => overlay.type === OverlayType.IMAGE
  );
  if (imageOverlay && "src" in imageOverlay) {
    return imageOverlay.src;
  }

  // Return undefined if no suitable thumbnail found
  return undefined;
};

const defaultTemplates = [
  {
    "id": "example-2",
    "name": "Sport",
    "description": "A custom template created with React Video Editor",
    "createdAt": "2025-04-10T02:24:50.270Z",
    "updatedAt": "2025-04-10T02:24:50.270Z",
    "createdBy": {
      "id": "user-1",
      "name": "User"
    },
    "category": "Custom",
    "tags": ["custom", "user-created"],
    "duration": 353,
    "aspectRatio": "16:9",
    "overlays": [
      {
        "id": 752284,
        "type": "sound",
        "content": "Upbeat Corporate",
        "src": "https://rwxrdxvxndclnqvznxfj.supabase.co/storage/v1/object/public/sounds/sound-1.mp3?t=2024-11-04T03%3A52%3A06.297Z",
        "from": 0,
        "row": 4,
        "left": 0,
        "top": 0,
        "width": 1920,
        "height": 100,
        "rotation": 0,
        "isDragging": false,
        "durationInFrames": 353,
        "styles": {
          "opacity": 1
        }
      },
      {
        "left": 0,
        "top": 0,
        "width": 1280,
        "height": 720,
        "durationInFrames": 88,
        "from": 0,
        "id": 643873,
        "rotation": 0,
        "row": 3,
        "isDragging": false,
        "type": "video",
        "content": "https://images.pexels.com/videos/7660624/pexels-photo-7660624.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200",
        "src": "https://videos.pexels.com/video-files/7660624/7660624-uhd_2560_1440_25fps.mp4",
        "videoStartTime": 0,
        "styles": {
          "opacity": 1,
          "zIndex": 100,
          "transform": "none",
          "objectFit": "cover"
        }
      },
      {
        "left": 0,
        "top": 0,
        "width": 1280,
        "height": 720,
        "durationInFrames": 263,
        "from": 84,
        "id": 215002,
        "rotation": 0,
        "row": 2,
        "isDragging": false,
        "type": "video",
        "content": "https://images.pexels.com/videos/5803095/cycling-dirt-bike-drone-engine-5803095.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200",
        "src": "https://videos.pexels.com/video-files/5803095/5803095-uhd_2560_1440_25fps.mp4",
        "videoStartTime": 0,
        "styles": {
          "opacity": 1,
          "zIndex": 100,
          "transform": "none",
          "objectFit": "cover"
        }
      },
      {
        "left": 91,
        "top": 142,
        "width": 1176,
        "height": 399,
        "durationInFrames": 341,
        "from": 7,
        "id": 653205,
        "row": 1,
        "rotation": 0,
        "isDragging": false,
        "type": "text",
        "content": "BUILD.",
        "styles": {
          "fontSize": "3rem",
          "fontWeight": "900",
          "color": "#FFFFFF",
          "backgroundColor": "transparent",
          "fontFamily": "font-sans",
          "fontStyle": "normal",
          "textDecoration": "none",
          "lineHeight": "1",
          "textAlign": "center",
          "letterSpacing": "0.02em",
          "textShadow": "2px 2px 0px rgba(0, 0, 0, 0.2)",
          "opacity": 1,
          "zIndex": 1,
          "transform": "none",
          "animation": {
            "enter": "fade",
            "exit": "fade"
          }
        }
      }
    ]
  },
  {
    "id": "example-3",
    "name": "Intro Example",
    "description": "Are you ready intro template",
    "createdAt": "2025-04-09T01:45:44.752Z",
    "updatedAt": "2025-04-09T01:45:44.752Z",
    "createdBy": {
      "id": "user-1",
      "name": "User"
    },
    "category": "Custom",
    "tags": ["Tiktok", "Ad"],
    "duration": 86,
    "aspectRatio": "9:16",
    "overlays": [
      {
        "left": 0,
        "top": 0,
        "width": 1101,
        "height": 1924,
        "durationInFrames": 86,
        "from": 0,
        "id": 0,
        "rotation": 0,
        "row": 4,
        "isDragging": false,
        "type": "video",
        "content": "https://images.pexels.com/videos/1943483/free-video-1943483.jpg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200",
        "src": "https://videos.pexels.com/video-files/1943483/1943483-uhd_2560_1440_25fps.mp4",
        "videoStartTime": 0,
        "styles": {
          "opacity": 1,
          "zIndex": 100,
          "transform": "none",
          "objectFit": "cover",
          "animation": {
            "exit": "fade"
          }
        }
      },
      {
        "left": 126,
        "top": 569,
        "width": 847,
        "height": 402,
        "durationInFrames": 70,
        "from": 8,
        "id": 1,
        "row": 0,
        "rotation": 0,
        "isDragging": false,
        "type": "text",
        "content": "ARE",
        "styles": {
          "fontSize": "3rem",
          "fontWeight": "900",
          "color": "#FFFFFF",
          "backgroundColor": "",
          "fontFamily": "font-sans",
          "fontStyle": "normal",
          "textDecoration": "none",
          "lineHeight": "1",
          "textAlign": "center",
          "letterSpacing": "0.02em",
          "textTransform": "uppercase",
          "textShadow": "2px 2px 0px rgba(0, 0, 0, 0.2)",
          "opacity": 1,
          "zIndex": 1,
          "transform": "none",
          "animation": {
            "enter": "snapRotate"
          }
        }
      },
      {
        "left": 126,
        "top": 927,
        "width": 847,
        "height": 402,
        "durationInFrames": 67,
        "from": 11,
        "id": 2,
        "row": 1,
        "rotation": 0,
        "isDragging": false,
        "type": "text",
        "content": "YOU",
        "styles": {
          "fontSize": "3rem",
          "fontWeight": "900",
          "color": "#FFFFFF",
          "backgroundColor": "",
          "fontFamily": "font-sans",
          "fontStyle": "normal",
          "textDecoration": "none",
          "lineHeight": "1",
          "textAlign": "center",
          "letterSpacing": "0.02em",
          "textTransform": "uppercase",
          "textShadow": "2px 2px 0px rgba(0, 0, 0, 0.2)",
          "opacity": 1,
          "zIndex": 1,
          "transform": "none",
          "animation": {
            "enter": "snapRotate"
          }
        }
      },
      {
        "left": -25,
        "top": 1294,
        "width": 1164,
        "height": 251,
        "durationInFrames": 63,
        "from": 15,
        "id": 3,
        "row": 2,
        "rotation": 0,
        "isDragging": false,
        "type": "text",
        "content": "READY?",
        "styles": {
          "fontSize": "3rem",
          "fontWeight": "900",
          "color": "#FFFFFF",
          "backgroundColor": "",
          "fontFamily": "font-sans",
          "fontStyle": "normal",
          "textDecoration": "none",
          "lineHeight": "1",
          "textAlign": "center",
          "letterSpacing": "0.02em",
          "textTransform": "uppercase",
          "textShadow": "2px 2px 0px rgba(0, 0, 0, 0.2)",
          "opacity": 1,
          "zIndex": 1,
          "transform": "none",
          "animation": {
            "enter": "snapRotate"
          }
        }
      }
    ]
  },
  {
    id: "template-7",
    name: "Hand Template",
    description: "Experiment with text animation.",
    createdAt: "2025-04-10T00:13:34.100Z",
    updatedAt: "2025-04-10T00:13:34.100Z",
    createdBy: {
      id: "user-1",
      name: "User",
    },
    category: "Custom",
    tags: ["custom", "user-created"],
    duration: 203,
    aspectRatio: "16:9",
    overlays: [
      {
        left: 0,
        top: 0,
        width: 1280,
        height: 720,
        durationInFrames: 86,
        from: 0,
        id: 337525,
        rotation: 0,
        row: 5,
        isDragging: false,
        type: "image",
        src: "https://images.pexels.com/photos/255527/pexels-photo-255527.jpeg",
        styles: {
          objectFit: "cover",
          animation: {
            enter: "fadeIn",
            exit: "fadeOut",
          },
          padding: "55px",
          paddingBackgroundColor: "#d00120",
        },
      },
      {
        left: -5,
        top: 57,
        width: 585,
        height: 296,
        durationInFrames: 59,
        from: 19,
        id: 863266,
        row: 0,
        rotation: 0,
        isDragging: false,
        type: "text",
        content: "h",
        styles: {
          fontSize: "3rem",
          fontWeight: "700",
          color: "rgb(10, 9, 9)",
          backgroundColor: "",
          fontFamily: "font-bungee-inline",
          fontStyle: "normal",
          textDecoration: "none",
          lineHeight: "1.1",
          textAlign: "center",
          letterSpacing: "-0.03em",
          opacity: 1,
          zIndex: 1,
          transform: "none",
          animation: {
            enter: "none",
            exit: "scale",
          },
        },
      },
      {
        left: 178,
        top: 58,
        width: 585,
        height: 296,
        durationInFrames: 54,
        from: 24,
        id: 985874,
        row: 1,
        rotation: 0,
        isDragging: false,
        type: "text",
        content: "a",
        styles: {
          fontSize: "3rem",
          fontWeight: "700",
          color: "rgb(10, 9, 9)",
          backgroundColor: "",
          fontFamily: "font-bungee-inline",
          fontStyle: "normal",
          textDecoration: "none",
          lineHeight: "1.1",
          textAlign: "center",
          letterSpacing: "-0.03em",
          opacity: 1,
          zIndex: 1,
          transform: "none",
          animation: {
            enter: "none",
            exit: "scale",
          },
        },
      },
      {
        left: 344,
        top: 58,
        width: 585,
        height: 296,
        durationInFrames: 48,
        from: 30,
        id: 108804,
        row: 2,
        rotation: 0,
        isDragging: false,
        type: "text",
        content: "n",
        styles: {
          fontSize: "3rem",
          fontWeight: "700",
          color: "rgb(10, 9, 9)",
          backgroundColor: "",
          fontFamily: "font-bungee-inline",
          fontStyle: "normal",
          textDecoration: "none",
          lineHeight: "1.1",
          textAlign: "center",
          letterSpacing: "-0.03em",
          opacity: 1,
          zIndex: 1,
          transform: "none",
          animation: {
            enter: "none",
            exit: "scale",
          },
        },
      },
      {
        left: 511,
        top: 57,
        width: 585,
        height: 296,
        durationInFrames: 40,
        from: 38,
        id: 51349,
        row: 3,
        rotation: 0,
        isDragging: false,
        type: "text",
        content: "d",
        styles: {
          fontSize: "3rem",
          fontWeight: "700",
          color: "rgb(10, 9, 9)",
          backgroundColor: "",
          fontFamily: "font-bungee-inline",
          fontStyle: "normal",
          textDecoration: "none",
          lineHeight: "1.1",
          textAlign: "center",
          letterSpacing: "-0.03em",
          opacity: 1,
          zIndex: 1,
          transform: "none",
          animation: {
            enter: "none",
            exit: "scale",
          },
        },
      },
      {
        left: 652,
        top: 57,
        width: 585,
        height: 296,
        durationInFrames: 32,
        from: 46,
        id: 21742,
        row: 4,
        rotation: 0,
        isDragging: false,
        type: "text",
        content: ".",
        styles: {
          fontSize: "3rem",
          fontWeight: "700",
          color: "rgb(10, 9, 9)",
          backgroundColor: "",
          fontFamily: "font-bungee-inline",
          fontStyle: "normal",
          textDecoration: "none",
          lineHeight: "1.1",
          textAlign: "center",
          letterSpacing: "-0.03em",
          opacity: 1,
          zIndex: 1,
          transform: "none",
          animation: {
            enter: "none",
            exit: "scale",
          },
        },
      },
 
    ],
  },
];

/**
 * Creates a static template adaptor from the full-templates directory
 * Useful for providing predefined template collections
 */
export const createStaticTemplateAdaptor = (
  displayName: string = "Default Templates"
): TemplateOverlayAdaptor => ({
  name: "static-templates",
  displayName,
  description: "Static collection of video editor templates",
  requiresAuth: false,

  getTemplates: async (params = {}) => {
    try {
      const { searchQuery = "", page = 1, perPage = 50 } = params;
      console.log(
        "Default template adaptor getTemplates called with params:",
        params
      );

      // Import all template files dynamically

      const loadedTemplates = defaultTemplates.map((templateModule) => {
        const templateData = templateModule as any;

        // Convert overlays with proper type handling
        const processedOverlays = templateData.overlays.map((overlay: any) => {
          console.log("Processing overlay:", overlay);
          const overlayType =
            overlay.type.toUpperCase() as keyof typeof OverlayType;
          console.log("Overlay type string:", overlay.type);
          console.log("Overlay type uppercase:", overlayType);
          const type = OverlayType[overlayType];
          console.log("Converted OverlayType:", type);

          return {
            ...overlay,
            type,
          } as Overlay;
        });

        // Create the template with proper typing
        const baseTemplate = {
          id: templateData.id,
          name: templateData.name,
          description: templateData.description,
          createdAt: templateData.createdAt,
          updatedAt: templateData.updatedAt,
          createdBy: {
            name: templateData.createdBy.name,
            avatar: templateData.createdBy.avatar || "",
          },
          category: templateData.category,
          tags: templateData.tags,
          duration: templateData.duration,
          overlays: processedOverlays,
        };

        // Add optional properties if they exist
        const optionalProps: Partial<TemplateOverlay> = {};

        if (templateData.aspectRatio) {
          optionalProps.aspectRatio = templateData.aspectRatio;
        }

        // Add thumbnail if it exists or find one from overlays
        const thumbnail =
          templateData.thumbnail ||
          findThumbnailFromOverlays(processedOverlays);

        if (thumbnail) {
          optionalProps.thumbnail = thumbnail;
        }

        const finalTemplate: TemplateOverlay = Object.assign(
          {},
          baseTemplate,
          optionalProps
        );
        return finalTemplate;
      });

      console.log("Loaded templates before filtering:", loadedTemplates);

      // Filter templates based on search query
      let filteredTemplates = loadedTemplates;
      if (searchQuery && searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filteredTemplates = loadedTemplates.filter(
          (template) =>
            template.name.toLowerCase().includes(query) ||
            template.description.toLowerCase().includes(query) ||
            template.tags.some((tag) => tag.toLowerCase().includes(query))
        );
      }

      console.log("Filtered templates:", filteredTemplates);

      // Handle pagination
      const startIndex = (page - 1) * perPage;
      const endIndex = startIndex + perPage;
      const paginatedItems = filteredTemplates.slice(startIndex, endIndex);

      const result = {
        items: paginatedItems,
        totalCount: filteredTemplates.length,
        hasMore: endIndex < filteredTemplates.length,
      };

      console.log("Default template adaptor returning:", result);
      return result;
    } catch (error) {
      console.error("Error loading templates:", error);
      return {
        items: [],
        totalCount: 0,
        hasMore: false,
      };
    }
  },
});

/**
 * Default template adaptor with all templates from the full-templates directory
 * Automatically included when no template adaptors are configured
 */
export const defaultTemplateAdaptor =
  createStaticTemplateAdaptor("Default Templates");

/**
 * Helper function to get default template adaptors
 * This provides a consistent way to include default template content
 */
export const getDefaultTemplateAdaptors = (): TemplateOverlayAdaptor[] => {
  return [defaultTemplateAdaptor];
};
