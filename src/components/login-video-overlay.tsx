'use client';

import { useState, useRef, useEffect } from 'react';

export function LoginVideoOverlay() {
  const [fading, setFading] = useState(false);
  const [gone, setGone] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.playbackRate = 2;

    const playPromise = video.play();
    if (playPromise) {
      playPromise
        .then(() => {
          video.muted = false;
          video.volume = 1;
        })
        .catch(() => {
          // autoplay bloqueado pelo browser — mantém mudo e tenta de novo
          video.muted = true;
          video.play().catch(() => {});
        });
    }
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
        playsInline
        preload="auto"
        className="w-full h-full object-cover"
        onEnded={() => setFading(true)}
      >
        <source src="/videos/profe.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
