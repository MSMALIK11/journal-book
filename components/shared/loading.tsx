import React from "react";

export default function GlassTradingCandlesLoader({ isLoading }:{isLoading:Boolean}) {
  if (!isLoading) return null;

  const candles = [
    { key: 1, height: 8, color: "bg-green-400/70", delay: "delay-0" },
    { key: 2, height: 12, color: "bg-red-400/70", delay: "delay-200" },
    { key: 3, height: 10, color: "bg-green-400/70", delay: "delay-400" },
    { key: 4, height: 14, color: "bg-red-400/70", delay: "delay-600" },
    { key: 5, height: 9, color: "bg-green-400/70", delay: "delay-800" },
  ];

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-600  bg-opacity-30  z-50  backdrop-blur-md">
      <div className="flex items-end gap-3 p-6 rounded-xl">
        {candles.map(({ key, height, color, delay }) => (
          <div
            key={key}
            className={`w-3 rounded-md ${color} relative animate-pulse-candle-glass ${delay}`}
            style={{ height: `${height * 6}px` }}
          >
            {/* wick top */}
            <div className="absolute left-1/2 -top-2 w-[2px] bg-current/70 transform -translate-x-1/2 h-2 rounded-sm"></div>
            {/* wick bottom */}
            <div className="absolute left-1/2 -bottom-2 w-[2px] bg-current/70 transform -translate-x-1/2 h-2 rounded-sm"></div>
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes pulseCandleGlass {
          0%, 100% {
            transform: scaleY(1);
            opacity: 0.8;
          }
          50% {
            transform: scaleY(1.4);
            opacity: 1;
          }
        }
        .animate-pulse-candle-glass {
          animation: pulseCandleGlass 1.2s ease-in-out infinite;
          transform-origin: center bottom;
          will-change: transform, opacity;
        }
        .delay-0 {
          animation-delay: 0s;
        }
        .delay-200 {
          animation-delay: 0.2s;
        }
        .delay-400 {
          animation-delay: 0.4s;
        }
        .delay-600 {
          animation-delay: 0.6s;
        }
        .delay-800 {
          animation-delay: 0.8s;
        }
      `}</style>
    </div>
  );
}
