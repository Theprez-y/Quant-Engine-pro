import React, { useState, useEffect } from 'react';
import { verifyLicense, LicenseStatus } from '../utils/licenseVerifier';

export const LicenseGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [keyInput, setKeyInput] = useState('');
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Check for saved license on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('quantengine_license_key');
    if (savedKey) {
      checkLicense(savedKey);
    } else {
      setIsChecking(false);
    }
  }, []);

  const checkLicense = async (key: string) => {
    setIsVerifying(true);
    const result = await verifyLicense(key);
    
    if (result.isValid) {
      localStorage.setItem('quantengine_license_key', key);
      setIsUnlocked(true);
    } else {
      localStorage.removeItem('quantengine_license_key');
      setStatus(result);
      setKeyInput(key); // Keep the bad key visible so the user knows what failed
    }
    setIsVerifying(false);
    setIsChecking(false);
  };

  const handleActivate = async () => {
    if (!keyInput.trim()) return;
    await checkLicense(keyInput.trim());
  };

  const handleDeactivate = () => {
    localStorage.removeItem('quantengine_license_key');
    setKeyInput('');
    setStatus(null);
    setIsUnlocked(false);
  };

  // 1. Loading State
  if (isChecking) {
    return (
      <div className="h-screen w-screen bg-[#0A0B0D] flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-[#C9A15A]/30 border-t-[#C9A15A] rounded-full animate-spin" />
        <div className="text-[#5A6070] font-['IBM_Plex_Mono'] text-[11px] tracking-wider animate-pulse">
          VERIFYING CRYPTOGRAPHIC SIGNATURE...
        </div>
      </div>
    );
  }

  // 2. Unlocked State: Render the actual app
  if (isUnlocked) {
    return <>{children}</>;
  }

  // 3. Locked State: Render the full-screen activation screen
  return (
    <div className="h-screen w-screen bg-[#0A0B0D] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Subtle background grid for premium feel */}
      <div className="absolute inset-0 opacity-[0.03]" 
           style={{ backgroundImage: 'linear-gradient(#C9A15A 1px, transparent 1px), linear-gradient(90deg, #C9A15A 1px, transparent 1px)', backgroundSize: '40px 40px' }} 
      />

      <div className="relative z-10 w-full max-w-md bg-[#14161A] border border-[#262A31] rounded-sm p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-sm bg-[#C9A15A]/10 border border-[#C9A15A]/30 flex items-center justify-center">
            <span className="text-[#C9A15A] text-lg">🔒</span>
          </div>
          <div>
            <h2 className="text-[15px] font-['Space_Grotesk'] font-semibold text-[#E7E9ED]">Software Locked</h2>
            <p className="text-[10px] font-['IBM_Plex_Mono'] text-[#5A6070]">Offline cryptographic verification required</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[9px] font-['Inter'] text-[#5A6070] uppercase tracking-wider mb-1.5">
              License Key
            </label>
            <textarea
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Paste your license key here..."
              className="w-full h-28 bg-[#0A0B0D] border border-[#262A31] rounded-sm p-3 text-[11px] font-['IBM_Plex_Mono'] text-[#E7E9ED] placeholder-[#5A6070] focus:outline-none focus:border-[#C9A15A]/60 transition-colors resize-none"
            />
          </div>

          <button
            onClick={handleActivate}
            disabled={isVerifying || !keyInput.trim()}
            className="w-full px-4 py-3 bg-[#C9A15A] hover:bg-[#D9B26D] disabled:bg-[#262A31] disabled:text-[#5A6070] disabled:cursor-not-allowed text-[#0A0B0D] text-[11px] font-['Space_Grotesk'] font-bold uppercase tracking-wider rounded-sm transition-colors"
          >
            {isVerifying ? 'Verifying...' : 'Activate License'}
          </button>

          {status?.error && (
            <div className="p-3 bg-[#E5484D]/10 border border-[#E5484D]/30 rounded-sm">
              <p className="text-[11px] font-['IBM_Plex_Mono'] text-[#E5484D] flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E5484D]" />
                {status.error}
              </p>
            </div>
          )}

          {/* Hidden deactivate button for testing purposes */}
          {isUnlocked && (
            <button
              onClick={handleDeactivate}
              className="w-full mt-2 px-4 py-2 bg-transparent text-[#5A6070] hover:text-[#E5484D] text-[10px] font-['IBM_Plex_Mono'] uppercase tracking-wider transition-colors"
            >
              Deactivate License
            </button>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-[#262A31] text-center">
          <p className="text-[9px] font-['IBM_Plex_Mono'] text-[#5A6070]">
            QuantEngine Pro © 2026<br/>
            All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};