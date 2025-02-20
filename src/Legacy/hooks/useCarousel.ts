import { useState, useCallback } from 'react';

export const useCarousel = (totalSlides: number) => {
  const [activeIndex, setActiveIndex] = useState(0);

  const next = useCallback(() => {
    setActiveIndex((current) =>
      current === totalSlides - 1 ? 0 : current + 1
    );
  }, [totalSlides]);

  const prev = useCallback(() => {
    setActiveIndex((current) =>
      current === 0 ? totalSlides - 1 : current - 1
    );
  }, [totalSlides]);

  return {
    activeIndex,
    next,
    prev,
    hasMultipleSlides: totalSlides > 1
  };
};