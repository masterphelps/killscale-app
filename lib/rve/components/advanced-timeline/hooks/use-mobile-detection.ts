import { useState, useEffect } from 'react';

/**
 * Hook to detect if the user is on a mobile/touch device
 * This helps determine the appropriate UX behavior for timeline interactions
 */
export const useMobileDetection = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [hasTouch, setHasTouch] = useState(false);

  useEffect(() => {
    // Check for touch capabilities
    const hasTouchSupport = 'ontouchstart' in window || 
                          navigator.maxTouchPoints > 0 || 
                          (navigator as any).msMaxTouchPoints > 0;
    
    // Check for mobile viewport
    const isMobileViewport = window.innerWidth <= 768;
    
    // Check user agent for mobile patterns
    const isMobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    // Consider it mobile if it has touch AND (small viewport OR mobile user agent)
    const mobile = hasTouchSupport && (isMobileViewport || isMobileUserAgent);
    
    setHasTouch(hasTouchSupport);
    setIsMobile(mobile);
    
    // Listen for window resize to update mobile detection
    const handleResize = () => {
      const newMobileViewport = window.innerWidth <= 768;
      const newMobile = hasTouchSupport && (newMobileViewport || isMobileUserAgent);
      setIsMobile(newMobile);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return { isMobile, hasTouch };
}; 