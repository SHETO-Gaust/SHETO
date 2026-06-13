'use client';

import { useState, useRef, useEffect } from 'react';

export function LoginVideoOverlay() {
  const [fading, setFading] = useState(false);
  const [gone, setGone] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleEnd = () => setFading(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.playbackRate = 2;
    video.play().catch(() => {
      // autoplay bloqueado — pula direto para a imagem
      setFading(true);
    });
  }, []);

  if (gone) return null;

  return (
    <div
      className="absolute inset-0 z-20"
      style={{
        opacity: fading ? 0 : 1,
        transition: 'opacity 2.5s ease-in-out',
      }}
      onTransitionEnd={() => setGone(true)}
    >
      <video
        ref={videoRef}
        muted
        autoPlay
        playsInline
        preload="auto"
        className="w-full h-full object-cover"
        onEnded={handleEnd}
        onError={handleEnd}
      >
        <source src="/videos/profe.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
