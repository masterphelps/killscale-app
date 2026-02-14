import { interpolate } from "remotion";

export type AnimationTemplate = {
  key?: string;
  name: string;
  preview: string;
  isPro?: boolean;
  enter: (
    frame: number,
    durationInFrames: number
  ) => {
    transform?: string;
    opacity?: number;
    filter?: string;
    clipPath?: string;
  };
  exit: (
    frame: number,
    durationInFrames: number
  ) => {
    transform?: string;
    opacity?: number;
    filter?: string;
    clipPath?: string;
  };
};

export const animationTemplates: Record<string, AnimationTemplate> = {
  fade: {
    key: "fade",
    name: "Fade",
    preview: "Simple fade in/out",
    enter: (frame) => ({
      opacity: interpolate(frame, [0, 15], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      opacity: interpolate(frame, [duration - 15, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  scale: {
    key: "scale",
    name: "Scale",
    preview: "Scale in/out",
    enter: (frame) => ({
      transform: `scale(${interpolate(frame, [0, 15], [0, 1], {
        extrapolateRight: "clamp",
      })})`,
      opacity: interpolate(frame, [0, 15], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `scale(${interpolate(
        frame,
        [duration - 15, duration],
        [1, 0],
        { extrapolateLeft: "clamp" }
      )})`,
      opacity: interpolate(frame, [duration - 15, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  bounce: {
    key: "bounce",
    name: "Bounce",
    preview: "Elastic bounce entrance",
    isPro: true,
    enter: (frame) => ({
      transform: `translateY(${interpolate(
        frame,
        [0, 10, 13, 15],
        [100, -10, 5, 0],
        { extrapolateRight: "clamp" }
      )}px)`,
      opacity: interpolate(frame, [0, 10], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `translateY(${interpolate(
        frame,
        [duration - 15, duration - 13, duration - 10, duration],
        [0, 5, -10, 100],
        { extrapolateLeft: "clamp" }
      )}px)`,
      opacity: interpolate(frame, [duration - 10, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  flipX: {
    key: "flip",
    name: "Flip",
    preview: "3D flip around X axis",
    isPro: true,
    enter: (frame) => ({
      transform: `perspective(400px) rotateX(${interpolate(
        frame,
        [0, 15],
        [90, 0],
        { extrapolateRight: "clamp" }
      )}deg)`,
      opacity: interpolate(frame, [0, 5, 15], [0, 0.7, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `perspective(400px) rotateX(${interpolate(
        frame,
        [duration - 15, duration],
        [0, -90],
        { extrapolateLeft: "clamp" }
      )}deg)`,
      opacity: interpolate(
        frame,
        [duration - 15, duration - 5, duration],
        [1, 0.7, 0],
        {
          extrapolateLeft: "clamp",
        }
      ),
    }),
  },
  zoomBlur: {
    key: "zoom-blur",
    name: "Zoom",
    preview: "Zoom with blur effect",
    isPro: true,
    enter: (frame) => ({
      transform: `scale(${interpolate(frame, [0, 15], [1.5, 1], {
        extrapolateRight: "clamp",
      })})`,
      opacity: interpolate(frame, [0, 15], [0, 1], {
        extrapolateRight: "clamp",
      }),
      filter: `blur(${interpolate(frame, [0, 15], [10, 0], {
        extrapolateRight: "clamp",
      })}px)`,
    }),
    exit: (frame, duration) => ({
      transform: `scale(${interpolate(
        frame,
        [duration - 15, duration],
        [1, 1.5],
        { extrapolateLeft: "clamp" }
      )})`,
      opacity: interpolate(frame, [duration - 15, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
      filter: `blur(${interpolate(frame, [duration - 15, duration], [0, 10], {
        extrapolateLeft: "clamp",
      })}px)`,
    }),
  },
  slideUp: {
    key: "slide-up",
    name: "Slide",
    preview: "Modern slide from bottom",
    enter: (frame) => ({
      transform: `translateY(${interpolate(frame, [0, 15], [30, 0], {
        extrapolateRight: "clamp",
      })}px)`,
      opacity: interpolate(frame, [0, 15], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `translateY(${interpolate(
        frame,
        [duration - 15, duration],
        [0, -30],
        { extrapolateLeft: "clamp" }
      )}px)`,
      opacity: interpolate(frame, [duration - 15, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  snapRotate: {
    key: "snap-rotate",
    name: "Snap",
    preview: "Quick rotate with snap",
    isPro: true,
    enter: (frame) => ({
      transform: `rotate(${interpolate(frame, [0, 8, 12, 15], [-10, 5, -2, 0], {
        extrapolateRight: "clamp",
      })}deg) scale(${interpolate(frame, [0, 15], [0.8, 1], {
        extrapolateRight: "clamp",
      })})`,
      opacity: interpolate(frame, [0, 10], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `rotate(${interpolate(
        frame,
        [duration - 15, duration - 12, duration - 8, duration],
        [0, -2, 5, -10],
        { extrapolateLeft: "clamp" }
      )}deg) scale(${interpolate(frame, [duration - 15, duration], [1, 0.8], {
        extrapolateLeft: "clamp",
      })})`,
      opacity: interpolate(frame, [duration - 10, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  glitch: {
    key: "glitch",
    name: "Glitch",
    preview: "Digital glitch effect",
    isPro: true,
    enter: (frame) => {
      const progress = interpolate(frame, [0, 15], [0, 1], {
        extrapolateRight: "clamp",
      });
      const xOffset =
        frame % 3 === 0 ? (Math.random() * 10 - 5) * (1 - progress) : 0;
      const yOffset =
        frame % 4 === 0 ? (Math.random() * 8 - 4) * (1 - progress) : 0;

      return {
        transform: `translate(${xOffset}px, ${yOffset}px) scale(${interpolate(
          frame,
          [0, 3, 6, 10, 15],
          [0.9, 1.05, 0.95, 1.02, 1],
          { extrapolateRight: "clamp" }
        )})`,
        opacity: interpolate(frame, [0, 3, 5, 15], [0, 0.7, 0.8, 1], {
          extrapolateRight: "clamp",
        }),
      };
    },
    exit: (frame, duration) => {
      const progress = interpolate(frame, [duration - 15, duration], [0, 1], {
        extrapolateLeft: "clamp",
      });
      const xOffset =
        (duration - frame) % 3 === 0 ? (Math.random() * 10 - 5) * progress : 0;
      const yOffset =
        (duration - frame) % 4 === 0 ? (Math.random() * 8 - 4) * progress : 0;

      return {
        transform: `translate(${xOffset}px, ${yOffset}px) scale(${interpolate(
          frame,
          [duration - 15, duration - 10, duration - 6, duration - 3, duration],
          [1, 1.02, 0.95, 1.05, 0.9],
          { extrapolateLeft: "clamp" }
        )})`,
        opacity: interpolate(
          frame,
          [duration - 15, duration - 5, duration - 3, duration],
          [1, 0.8, 0.7, 0],
          {
            extrapolateLeft: "clamp",
          }
        ),
      };
    },
  },
  swipeReveal: {
    key: "swipe-reveal",
    name: "Swipe",
    preview: "Reveals content with a swipe",
    isPro: true,
    enter: (frame) => ({
      transform: `translateX(${interpolate(frame, [0, 15], [0, 0], {
        extrapolateRight: "clamp",
      })}px)`,
      opacity: 1,
      clipPath: `inset(0 ${interpolate(frame, [0, 15], [100, 0], {
        extrapolateRight: "clamp",
      })}% 0 0)`,
    }),
    exit: (frame, duration) => ({
      transform: `translateX(${interpolate(
        frame,
        [duration - 15, duration],
        [0, 0],
        { extrapolateLeft: "clamp" }
      )}px)`,
      opacity: 1,
      clipPath: `inset(0 0 0 ${interpolate(
        frame,
        [duration - 15, duration],
        [0, 100],
        { extrapolateLeft: "clamp" }
      )}%)`,
    }),
  },
  floatIn: {
    key: "float-in",
    name: "Float",
    preview: "Smooth floating entrance",
    enter: (frame) => ({
      transform: `translate(${interpolate(frame, [0, 15], [10, 0], {
        extrapolateRight: "clamp",
      })}px, ${interpolate(frame, [0, 15], [-20, 0], {
        extrapolateRight: "clamp",
      })}px)`,
      opacity: interpolate(frame, [0, 15], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `translate(${interpolate(
        frame,
        [duration - 15, duration],
        [0, -10],
        { extrapolateLeft: "clamp" }
      )}px, ${interpolate(frame, [duration - 15, duration], [0, -20], {
        extrapolateLeft: "clamp",
      })}px)`,
      opacity: interpolate(frame, [duration - 15, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  spin: {
    key: "spin",
    name: "Spin",
    preview: "360° rotation entrance",
    isPro: true,
    enter: (frame) => ({
      transform: `rotate(${interpolate(frame, [0, 15], [360, 0], {
        extrapolateRight: "clamp",
      })}deg) scale(${interpolate(frame, [0, 15], [0, 1], {
        extrapolateRight: "clamp",
      })})`,
      opacity: interpolate(frame, [0, 10], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `rotate(${interpolate(
        frame,
        [duration - 15, duration],
        [0, -360],
        { extrapolateLeft: "clamp" }
      )}deg) scale(${interpolate(frame, [duration - 15, duration], [1, 0], {
        extrapolateLeft: "clamp",
      })})`,
      opacity: interpolate(frame, [duration - 10, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  slideDown: {
    key: "slide-down",
    name: "Slide D",
    preview: "Slide in from top",
    enter: (frame) => ({
      transform: `translateY(${interpolate(frame, [0, 15], [-100, 0], {
        extrapolateRight: "clamp",
      })}%)`,
      opacity: interpolate(frame, [0, 15], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `translateY(${interpolate(
        frame,
        [duration - 15, duration],
        [0, 100],
        { extrapolateLeft: "clamp" }
      )}%)`,
      opacity: interpolate(frame, [duration - 15, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  slideLeft: {
    key: "slide-left",
    name: "Slide L",
    preview: "Slide in from right",
    enter: (frame) => ({
      transform: `translateX(${interpolate(frame, [0, 15], [100, 0], {
        extrapolateRight: "clamp",
      })}%)`,
      opacity: interpolate(frame, [0, 15], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `translateX(${interpolate(
        frame,
        [duration - 15, duration],
        [0, -100],
        { extrapolateLeft: "clamp" }
      )}%)`,
      opacity: interpolate(frame, [duration - 15, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  diagonalSlide: {
    key: "diagonal-slide",
    name: "Diagonal",
    preview: "Diagonal slide entrance",
    isPro: true,
    enter: (frame) => ({
      transform: `translate(${interpolate(frame, [0, 15], [-100, 0], {
        extrapolateRight: "clamp",
      })}%, ${interpolate(frame, [0, 15], [-100, 0], {
        extrapolateRight: "clamp",
      })}%)`,
      opacity: interpolate(frame, [0, 15], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `translate(${interpolate(
        frame,
        [duration - 15, duration],
        [0, 100],
        { extrapolateLeft: "clamp" }
      )}%, ${interpolate(frame, [duration - 15, duration], [0, 100], {
        extrapolateLeft: "clamp",
      })}%)`,
      opacity: interpolate(frame, [duration - 15, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  wobble: {
    key: "wobble",
    name: "Wobble",
    preview: "Playful wobble effect",
    isPro: true,
    enter: (frame) => ({
      transform: `rotate(${interpolate(
        frame,
        [0, 3, 6, 9, 12, 15],
        [0, -10, 8, -6, 3, 0],
        { extrapolateRight: "clamp" }
      )}deg)`,
      opacity: interpolate(frame, [0, 5], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `rotate(${interpolate(
        frame,
        [duration - 15, duration - 12, duration - 9, duration - 6, duration - 3, duration],
        [0, 3, -6, 8, -10, 0],
        { extrapolateLeft: "clamp" }
      )}deg)`,
      opacity: interpolate(frame, [duration - 5, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  flipY: {
    key: "flip-y",
    name: "Flip Y",
    preview: "3D flip around Y axis",
    isPro: true,
    enter: (frame) => ({
      transform: `perspective(400px) rotateY(${interpolate(
        frame,
        [0, 15],
        [90, 0],
        { extrapolateRight: "clamp" }
      )}deg)`,
      opacity: interpolate(frame, [0, 5, 15], [0, 0.7, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `perspective(400px) rotateY(${interpolate(
        frame,
        [duration - 15, duration],
        [0, -90],
        { extrapolateLeft: "clamp" }
      )}deg)`,
      opacity: interpolate(
        frame,
        [duration - 15, duration - 5, duration],
        [1, 0.7, 0],
        {
          extrapolateLeft: "clamp",
        }
      ),
    }),
  },
  pulse: {
    key: "pulse",
    name: "Pulse",
    preview: "Heartbeat pulse effect",
    enter: (frame) => ({
      transform: `scale(${interpolate(
        frame,
        [0, 5, 10, 15],
        [0, 1.2, 0.9, 1],
        { extrapolateRight: "clamp" }
      )})`,
      opacity: interpolate(frame, [0, 5], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `scale(${interpolate(
        frame,
        [duration - 15, duration - 10, duration - 5, duration],
        [1, 0.9, 1.2, 0],
        { extrapolateLeft: "clamp" }
      )})`,
      opacity: interpolate(frame, [duration - 5, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  drop: {
    key: "drop",
    name: "Drop",
    preview: "Gravity drop effect",
    isPro: true,
    enter: (frame) => ({
      transform: `translateY(${interpolate(
        frame,
        [0, 10, 15],
        [-200, 20, 0],
        { extrapolateRight: "clamp" }
      )}px)`,
      opacity: interpolate(frame, [0, 8], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `translateY(${interpolate(
        frame,
        [duration - 15, duration - 10, duration],
        [0, -20, 200],
        { extrapolateLeft: "clamp" }
      )}px)`,
      opacity: interpolate(frame, [duration - 8, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  squeeze: {
    key: "squeeze",
    name: "Squeeze",
    preview: "Squeeze and expand",
    isPro: true,
    enter: (frame) => ({
      transform: `scale(${interpolate(frame, [0, 8, 15], [0, 1.3, 1], {
        extrapolateRight: "clamp",
      })}, ${interpolate(frame, [0, 8, 15], [0, 0.7, 1], {
        extrapolateRight: "clamp",
      })})`,
      opacity: interpolate(frame, [0, 8], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `scale(${interpolate(
        frame,
        [duration - 15, duration - 8, duration],
        [1, 1.3, 0],
        { extrapolateLeft: "clamp" }
      )}, ${interpolate(frame, [duration - 15, duration - 8, duration], [1, 0.7, 0], {
        extrapolateLeft: "clamp",
      })})`,
      opacity: interpolate(frame, [duration - 8, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  roll: {
    key: "roll",
    name: "Roll",
    preview: "Rolling entrance",
    isPro: true,
    enter: (frame) => ({
      transform: `translateX(${interpolate(frame, [0, 15], [-100, 0], {
        extrapolateRight: "clamp",
      })}%) rotate(${interpolate(frame, [0, 15], [-180, 0], {
        extrapolateRight: "clamp",
      })}deg)`,
      opacity: interpolate(frame, [0, 10], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `translateX(${interpolate(
        frame,
        [duration - 15, duration],
        [0, 100],
        { extrapolateLeft: "clamp" }
      )}%) rotate(${interpolate(frame, [duration - 15, duration], [0, 180], {
        extrapolateLeft: "clamp",
      })}deg)`,
      opacity: interpolate(frame, [duration - 10, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  swing: {
    key: "swing",
    name: "Swing",
    preview: "Pendulum swing effect",
    isPro: true,
    enter: (frame) => ({
      transform: `rotate(${interpolate(
        frame,
        [0, 5, 10, 15],
        [20, -15, 10, 0],
        { extrapolateRight: "clamp" }
      )}deg)`,
      opacity: interpolate(frame, [0, 5], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `rotate(${interpolate(
        frame,
        [duration - 15, duration - 10, duration - 5, duration],
        [0, 10, -15, 20],
        { extrapolateLeft: "clamp" }
      )}deg)`,
      opacity: interpolate(frame, [duration - 5, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  expandVertical: {
    key: "expand-vertical",
    name: "Expand",
    preview: "Vertical expansion",
    enter: (frame) => ({
      transform: `scaleY(${interpolate(frame, [0, 15], [0, 1], {
        extrapolateRight: "clamp",
      })})`,
      opacity: interpolate(frame, [0, 10], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `scaleY(${interpolate(frame, [duration - 15, duration], [1, 0], {
        extrapolateLeft: "clamp",
      })})`,
      opacity: interpolate(frame, [duration - 10, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  expandHorizontal: {
    key: "expand-horizontal",
    name: "Expand",
    preview: "Horizontal expansion",
    enter: (frame) => ({
      transform: `scaleX(${interpolate(frame, [0, 15], [0, 1], {
        extrapolateRight: "clamp",
      })})`,
      opacity: interpolate(frame, [0, 10], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `scaleX(${interpolate(frame, [duration - 15, duration], [1, 0], {
        extrapolateLeft: "clamp",
      })})`,
      opacity: interpolate(frame, [duration - 10, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  twist: {
    key: "twist",
    name: "Twist",
    preview: "3D twisting effect",
    isPro: true,
    enter: (frame) => ({
      transform: `perspective(600px) rotateX(${interpolate(
        frame,
        [0, 15],
        [180, 0],
        { extrapolateRight: "clamp" }
      )}deg) rotateY(${interpolate(frame, [0, 15], [180, 0], {
        extrapolateRight: "clamp",
      })}deg)`,
      opacity: interpolate(frame, [0, 8, 15], [0, 0.5, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `perspective(600px) rotateX(${interpolate(
        frame,
        [duration - 15, duration],
        [0, -180],
        { extrapolateLeft: "clamp" }
      )}deg) rotateY(${interpolate(frame, [duration - 15, duration], [0, -180], {
        extrapolateLeft: "clamp",
      })}deg)`,
      opacity: interpolate(
        frame,
        [duration - 15, duration - 8, duration],
        [1, 0.5, 0],
        {
          extrapolateLeft: "clamp",
        }
      ),
    }),
  },
  blur: {
    key: "blur",
    name: "Blur",
    preview: "Blur in and out",
    enter: (frame) => ({
      filter: `blur(${interpolate(frame, [0, 15], [20, 0], {
        extrapolateRight: "clamp",
      })}px)`,
      opacity: interpolate(frame, [0, 15], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      filter: `blur(${interpolate(frame, [duration - 15, duration], [0, 20], {
        extrapolateLeft: "clamp",
      })}px)`,
      opacity: interpolate(frame, [duration - 15, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  spiral: {
    key: "spiral",
    name: "Spiral",
    preview: "Spiral rotation entrance",
    isPro: true,
    enter: (frame) => ({
      transform: `translate(${interpolate(frame, [0, 15], [-50, 0], {
        extrapolateRight: "clamp",
      })}px, ${interpolate(frame, [0, 15], [-50, 0], {
        extrapolateRight: "clamp",
      })}px) rotate(${interpolate(frame, [0, 15], [720, 0], {
        extrapolateRight: "clamp",
      })}deg) scale(${interpolate(frame, [0, 15], [0, 1], {
        extrapolateRight: "clamp",
      })})`,
      opacity: interpolate(frame, [0, 10], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `translate(${interpolate(
        frame,
        [duration - 15, duration],
        [0, 50],
        { extrapolateLeft: "clamp" }
      )}px, ${interpolate(frame, [duration - 15, duration], [0, 50], {
        extrapolateLeft: "clamp",
      })}px) rotate(${interpolate(frame, [duration - 15, duration], [0, -720], {
        extrapolateLeft: "clamp",
      })}deg) scale(${interpolate(frame, [duration - 15, duration], [1, 0], {
        extrapolateLeft: "clamp",
      })})`,
      opacity: interpolate(frame, [duration - 10, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  shake: {
    key: "shake",
    name: "Shake",
    preview: "Energetic shake entrance",
    enter: (frame) => ({
      transform: `translateX(${interpolate(
        frame,
        [0, 2, 4, 6, 8, 10, 12, 15],
        [0, -10, 10, -8, 8, -5, 5, 0],
        { extrapolateRight: "clamp" }
      )}px)`,
      opacity: interpolate(frame, [0, 5], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `translateX(${interpolate(
        frame,
        [
          duration - 15,
          duration - 12,
          duration - 10,
          duration - 8,
          duration - 6,
          duration - 4,
          duration - 2,
          duration,
        ],
        [0, 5, -5, 8, -8, 10, -10, 0],
        { extrapolateLeft: "clamp" }
      )}px)`,
      opacity: interpolate(frame, [duration - 5, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  curtain: {
    key: "curtain",
    name: "Curtain",
    preview: "Curtain reveal effect",
    isPro: true,
    enter: (frame) => ({
      clipPath: `inset(0 0 ${interpolate(frame, [0, 15], [100, 0], {
        extrapolateRight: "clamp",
      })}% 0)`,
      opacity: 1,
    }),
    exit: (frame, duration) => ({
      clipPath: `inset(${interpolate(
        frame,
        [duration - 15, duration],
        [0, 100],
        { extrapolateLeft: "clamp" }
      )}% 0 0 0)`,
      opacity: 1,
    }),
  },
  fold: {
    key: "fold",
    name: "Fold",
    preview: "Paper fold effect",
    isPro: true,
    enter: (frame) => ({
      transform: `perspective(800px) rotateX(${interpolate(
        frame,
        [0, 15],
        [-90, 0],
        { extrapolateRight: "clamp" }
      )}deg)`,
      opacity: interpolate(frame, [0, 8], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `perspective(800px) rotateX(${interpolate(
        frame,
        [duration - 15, duration],
        [0, 90],
        { extrapolateLeft: "clamp" }
      )}deg)`,
      opacity: interpolate(frame, [duration - 8, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  zigzag: {
    key: "zigzag",
    name: "Zigzag",
    preview: "Zigzag path entrance",
    isPro: true,
    enter: (frame) => ({
      transform: `translate(${interpolate(
        frame,
        [0, 3, 6, 9, 12, 15],
        [-100, -60, -40, -20, -10, 0],
        { extrapolateRight: "clamp" }
      )}%, ${interpolate(
        frame,
        [0, 3, 6, 9, 12, 15],
        [0, 30, -20, 15, -10, 0],
        { extrapolateRight: "clamp" }
      )}%)`,
      opacity: interpolate(frame, [0, 10], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `translate(${interpolate(
        frame,
        [duration - 15, duration - 12, duration - 9, duration - 6, duration - 3, duration],
        [0, 10, 20, 40, 60, 100],
        { extrapolateLeft: "clamp" }
      )}%, ${interpolate(
        frame,
        [duration - 15, duration - 12, duration - 9, duration - 6, duration - 3, duration],
        [0, -10, 15, -20, 30, 0],
        { extrapolateLeft: "clamp" }
      )}%)`,
      opacity: interpolate(frame, [duration - 10, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  elastic: {
    key: "elastic",
    name: "Elastic",
    preview: "Elastic bounce effect",
    isPro: true,
    enter: (frame) => ({
      transform: `scale(${interpolate(
        frame,
        [0, 5, 8, 11, 13, 15],
        [0, 1.3, 0.9, 1.1, 0.95, 1],
        { extrapolateRight: "clamp" }
      )})`,
      opacity: interpolate(frame, [0, 5], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `scale(${interpolate(
        frame,
        [duration - 15, duration - 13, duration - 11, duration - 8, duration - 5, duration],
        [1, 0.95, 1.1, 0.9, 1.3, 0],
        { extrapolateLeft: "clamp" }
      )})`,
      opacity: interpolate(frame, [duration - 5, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  slingshot: {
    key: "slingshot",
    name: "Slingshot",
    preview: "Slingshot pull and release",
    isPro: true,
    enter: (frame) => ({
      transform: `translateX(${interpolate(
        frame,
        [0, 8, 10, 15],
        [-200, -50, 20, 0],
        { extrapolateRight: "clamp" }
      )}px) scaleX(${interpolate(frame, [0, 8, 10, 15], [1.5, 1.2, 0.9, 1], {
        extrapolateRight: "clamp",
      })})`,
      opacity: interpolate(frame, [0, 8], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `translateX(${interpolate(
        frame,
        [duration - 15, duration - 10, duration - 8, duration],
        [0, -20, 50, 200],
        { extrapolateLeft: "clamp" }
      )}px) scaleX(${interpolate(
        frame,
        [duration - 15, duration - 10, duration - 8, duration],
        [1, 0.9, 1.2, 1.5],
        { extrapolateLeft: "clamp" }
      )})`,
      opacity: interpolate(frame, [duration - 8, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  rotateIn: {
    key: "rotate-in",
    name: "Rotate",
    preview: "Rotate with scale entrance",
    enter: (frame) => ({
      transform: `rotate(${interpolate(frame, [0, 15], [-180, 0], {
        extrapolateRight: "clamp",
      })}deg) scale(${interpolate(frame, [0, 15], [0, 1], {
        extrapolateRight: "clamp",
      })})`,
      opacity: interpolate(frame, [0, 10], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `rotate(${interpolate(
        frame,
        [duration - 15, duration],
        [0, 180],
        { extrapolateLeft: "clamp" }
      )}deg) scale(${interpolate(frame, [duration - 15, duration], [1, 0], {
        extrapolateLeft: "clamp",
      })})`,
      opacity: interpolate(frame, [duration - 10, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  skew: {
    key: "skew",
    name: "Skew",
    preview: "Skew transformation",
    isPro: true,
    enter: (frame) => ({
      transform: `skewX(${interpolate(frame, [0, 15], [45, 0], {
        extrapolateRight: "clamp",
      })}deg) skewY(${interpolate(frame, [0, 15], [15, 0], {
        extrapolateRight: "clamp",
      })}deg)`,
      opacity: interpolate(frame, [0, 10], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `skewX(${interpolate(
        frame,
        [duration - 15, duration],
        [0, -45],
        { extrapolateLeft: "clamp" }
      )}deg) skewY(${interpolate(frame, [duration - 15, duration], [0, -15], {
        extrapolateLeft: "clamp",
      })}deg)`,
      opacity: interpolate(frame, [duration - 10, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  peek: {
    key: "peek",
    name: "Peek",
    preview: "Peek from edge",
    enter: (frame) => ({
      clipPath: `inset(0 ${interpolate(frame, [0, 15], [95, 0], {
        extrapolateRight: "clamp",
      })}% 0 0)`,
      transform: `translateX(${interpolate(frame, [0, 15], [-50, 0], {
        extrapolateRight: "clamp",
      })}px)`,
      opacity: 1,
    }),
    exit: (frame, duration) => ({
      clipPath: `inset(0 0 0 ${interpolate(
        frame,
        [duration - 15, duration],
        [0, 95],
        { extrapolateLeft: "clamp" }
      )}%)`,
      transform: `translateX(${interpolate(
        frame,
        [duration - 15, duration],
        [0, 50],
        { extrapolateLeft: "clamp" }
      )}px)`,
      opacity: 1,
    }),
  },
  vortex: {
    key: "vortex",
    name: "Vortex",
    preview: "Vortex spin effect",
    isPro: true,
    enter: (frame) => ({
      transform: `rotate(${interpolate(frame, [0, 15], [1080, 0], {
        extrapolateRight: "clamp",
      })}deg) scale(${interpolate(frame, [0, 15], [0.2, 1], {
        extrapolateRight: "clamp",
      })})`,
      filter: `blur(${interpolate(frame, [0, 10, 15], [15, 5, 0], {
        extrapolateRight: "clamp",
      })}px)`,
      opacity: interpolate(frame, [0, 10], [0, 1], {
        extrapolateRight: "clamp",
      }),
    }),
    exit: (frame, duration) => ({
      transform: `rotate(${interpolate(
        frame,
        [duration - 15, duration],
        [0, -1080],
        { extrapolateLeft: "clamp" }
      )}deg) scale(${interpolate(frame, [duration - 15, duration], [1, 0.2], {
        extrapolateLeft: "clamp",
      })})`,
      filter: `blur(${interpolate(
        frame,
        [duration - 15, duration - 10, duration],
        [0, 5, 15],
        {
          extrapolateLeft: "clamp",
        }
      )}px)`,
      opacity: interpolate(frame, [duration - 10, duration], [1, 0], {
        extrapolateLeft: "clamp",
      }),
    }),
  },
  typing: {
    key: "typing",
    name: "Typing",
    preview: "Reveal characters",
    enter: (frame) => ({
      // Simple preview: fade in to hint behavior
      opacity: interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" }),
    }),
    exit: () => ({})
  },
};

/**
 * Creates a static animation adaptor from animation templates
 */
export const createStaticAnimationAdaptor = (
  animations: Record<string, AnimationTemplate>, 
  displayName: string = 'Animation Templates'
) => ({
  name: 'static-animations',
  displayName,
  description: 'Static collection of animation templates',
  requiresAuth: false,
  
  getTemplates: async (config?: Record<string, any>) => {
    console.log("getTemplates", config);
    const items = Object.values(animations);
    
    return {
      items,
      totalCount: items.length
    };
  }
});

/**
 * Default animation adaptor with built-in animation templates
 */
export const defaultAnimationAdaptor = createStaticAnimationAdaptor(animationTemplates, 'Default Animations');

/**
 * Helper function to convert kebab-case animation keys to camelCase keys
 */
export const getAnimationKey = (kebabKey: string): string => {
  const keyMap: Record<string, string> = {
    'fade': 'fade',
    'slide-right': 'slideRight',
    'scale': 'scale',
    'bounce': 'bounce',
    'flip': 'flipX',
    'zoom-blur': 'zoomBlur',
    'slide-up': 'slideUp',
    'snap-rotate': 'snapRotate',
    'glitch': 'glitch',
    'swipe-reveal': 'swipeReveal',
    'float-in': 'floatIn',
    'spin': 'spin',
    'slide-down': 'slideDown',
    'slide-left': 'slideLeft',
    'diagonal-slide': 'diagonalSlide',
    'wobble': 'wobble',
    'flip-y': 'flipY',
    'pulse': 'pulse',
    'drop': 'drop',
    'squeeze': 'squeeze',
    'roll': 'roll',
    'swing': 'swing',
    'expand-vertical': 'expandVertical',
    'expand-horizontal': 'expandHorizontal',
    'twist': 'twist',
    'blur': 'blur',
    'spiral': 'spiral',
    'shake': 'shake',
    'curtain': 'curtain',
    'fold': 'fold',
    'zigzag': 'zigzag',
    'elastic': 'elastic',
    'slingshot': 'slingshot',
    'rotate-in': 'rotateIn',
    'skew': 'skew',
    'peek': 'peek',
    'vortex': 'vortex',
    'typing': 'typing',
    'explode': 'explode'
  };
  return keyMap[kebabKey] || kebabKey;
};

/**
 * Helper function to get default animation adaptors
 */
export const getDefaultAnimationAdaptors = () => {
  return [defaultAnimationAdaptor];
};