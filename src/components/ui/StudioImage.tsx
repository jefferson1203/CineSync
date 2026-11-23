import { Film } from 'lucide-react';
import { useState } from 'react';

interface StudioImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

export function StudioImage({ src, alt, className = '', fallbackLabel }: StudioImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-[#121419] text-[#6E7685] select-none ${className}`}
      >
        <Film className="w-6 h-6 opacity-40 mb-1.5" />
        <span className="text-xs px-3 text-center truncate max-w-full">
          {fallbackLabel || alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
