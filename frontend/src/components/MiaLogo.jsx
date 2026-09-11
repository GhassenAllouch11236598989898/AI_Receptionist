export function MiaRibbonLogo({ className = "w-7 h-7" }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="ribbonGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#0284C7" />
        </linearGradient>
        <linearGradient id="ribbonGrad2" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2DD4BF" />
          <stop offset="100%" stopColor="#0D9488" />
        </linearGradient>
        <linearGradient id="ribbonGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#06B6D4" />
          <stop offset="100%" stopColor="#0369A1" />
        </linearGradient>
      </defs>
      {/* Left leg of M */}
      <path
        d="M20 78 C20 85 27 88 33 83 L42 74 C47 69 50 63 50 56 L50 35 C50 25 38 20 30 27 L20 36 C16 40 14 46 14 52 L14 70 C14 74 16 78 20 78 Z"
        fill="url(#ribbonGrad1)"
      />
      {/* Center diagonal crossing */}
      <path
        d="M48 32 C52 26 61 26 66 31 L80 46 C84 50 86 56 86 62 L86 72 C86 78 80 82 74 78 L60 67 C55 63 52 57 52 51 L52 36 C52 34 50 33 48 32 Z"
        fill="url(#ribbonGrad2)"
      />
      {/* 3D highlight overlay */}
      <path
        d="M32 28 L50 48 L68 28 C74 23 83 28 83 36 L83 60 C83 66 80 72 75 75 L68 80 C62 84 54 81 54 74 L54 52 L36 34 C30 28 24 35 24 42 L24 64 C24 70 21 75 16 73 C12 71 10 65 10 60 L10 44 C10 33 22 23 32 28 Z"
        fill="url(#ribbonGrad3)"
        opacity="0.85"
      />
    </svg>
  );
}

export function MiaAvatarIllustration({ className = "w-16 h-16" }) {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Outer subtle waves */}
      <div className="absolute -inset-2 rounded-full border border-teal-200/60 animate-pulse pointer-events-none" />
      <svg
        viewBox="0 0 120 120"
        className="w-full h-full drop-shadow-sm"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="avatarBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#CCFBF1" />
            <stop offset="100%" stopColor="#99F6E4" />
          </linearGradient>
        </defs>
        {/* Circular background */}
        <circle cx="60" cy="60" r="54" fill="url(#avatarBgGrad)" />
        <circle cx="60" cy="60" r="53" stroke="#5EEAD4" strokeWidth="2" />
        
        {/* Hair back */}
        <path d="M36 65 C32 40 40 24 60 24 C80 24 88 40 84 65 C82 72 80 82 78 88 L42 88 C40 82 38 72 36 65 Z" fill="#451A03" />
        
        {/* Shoulders / Shirt */}
        <path d="M30 110 C30 92 44 86 60 86 C76 86 90 92 90 110 Z" fill="#F97316" />
        <path d="M50 86 L60 98 L70 86 Z" fill="#FDBA74" />
        
        {/* Neck */}
        <rect x="53" y="74" width="14" height="15" rx="3" fill="#FDBA74" />
        
        {/* Face */}
        <ellipse cx="60" cy="56" rx="20" ry="22" fill="#FED7AA" />
        
        {/* Hair front / Bangs */}
        <path d="M40 48 C42 36 50 32 60 32 C70 32 78 36 80 48 C74 42 66 40 60 41 C54 40 46 42 40 48 Z" fill="#78350F" />
        <path d="M39 48 C37 56 38 66 40 70 C42 68 44 58 44 52 Z" fill="#78350F" />
        <path d="M81 48 C83 56 82 66 80 70 C78 68 76 58 76 52 Z" fill="#78350F" />
        
        {/* Eyes & Smile */}
        <circle cx="53" cy="55" r="2.5" fill="#292524" />
        <circle cx="67" cy="55" r="2.5" fill="#292524" />
        <path d="M55 64 Q60 69 65 64" stroke="#B45309" strokeWidth="2" strokeLinecap="round" />
        
        {/* Headset / phone wave accent */}
        <path d="M36 56 C33 56 31 59 31 63 C31 67 33 70 36 70" stroke="#0D9488" strokeWidth="3" strokeLinecap="round" />
        <path d="M34 68 C36 76 44 79 50 78" stroke="#0D9488" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function UserAvatarIcon({ className = "w-8 h-8" }) {
  return (
    <div className={`relative rounded-full overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center ${className}`}>
      <svg viewBox="0 0 40 40" className="w-full h-full" fill="none">
        <circle cx="20" cy="20" r="20" fill="#E2E8F0" />
        <circle cx="20" cy="15" r="7" fill="#64748B" />
        <path d="M8 35 C8 27 13 24 20 24 C27 24 32 27 32 35 Z" fill="#64748B" />
      </svg>
    </div>
  );
}
