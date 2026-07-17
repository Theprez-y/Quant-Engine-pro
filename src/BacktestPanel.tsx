import React, { useState } from 'react';
import { useBacktest } from './context/BacktestContext';
import { FrictionConfig, CommissionType } from './types';

export const BacktestPanel: React.FC = () => {
  const {
    executeBacktest, runWFO, runMonteCarlo, isProcessing, progress,
    error, resetEngineState, wfoConfig, monteCarloConfig
  } = useBacktest();
  
  const [initialCapital, setInitialCapital] = useState(100000);
  const [commissionType, setCommissionType] = useState<CommissionType>('FLAT');
  const [commissionValue, setCommissionValue] = useState(4.95);
  const [riskPercent, setRiskPercent] = useState(0.01);
  const [contractMultiplier, setContractMultiplier] = useState(1.0); // Phase 2
  
  // PHASE 3 ADDITIONS
  const [slippageModel, setSlippageModel] = useState<'ATR' | 'PERCENTAGE' | 'FIXED_TICK' | 'NONE'>('ATR');
  const [slippageValue, setSlippageValue] = useState(0.2); // Default ATR multiplier

  const handleRunBacktest = () => {
    const friction: FrictionConfig = {
      commissionType, 
      commissionValue,
      slippageModel,
      atrLength: 14, 
      // Route the value to the correct friction property based on the model
      atrMultiplier: slippageModel === 'ATR' ? slippageValue : 0.2,
      slippageValue: slippageModel !== 'ATR' && slippageModel !== 'NONE' ? slippageValue : undefined,
      contractMultiplier
    };
    executeBacktest(initialCapital, friction, riskPercent);
  };

  const handleRunWFO = () => {
    const friction: FrictionConfig = {
      commissionType, 
      commissionValue,
      slippageModel,
      atrLength: 14, 
      atrMultiplier: slippageModel === 'ATR' ? slippageValue : 0.2,
      slippageValue: slippageModel !== 'ATR' && slippageModel !== 'NONE' ? slippageValue : undefined,
      contractMultiplier
    };
    runWFO(initialCapital, friction);
  };

  // Dynamic label for the slippage input
  const getSlippageLabel = () => {
    switch (slippageModel) {
      case 'ATR': return 'ATR Multiplier';
      case 'PERCENTAGE': return 'Slippage % (e.g. 0.05)';
      case 'FIXED_TICK': return 'Tick Size (e.g. 0.0001)';
      default: return 'Value';
    }
  };

  return (
    <div className="space-y-4">
      {/* Configuration Inputs */}
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="block text-[9px] font-['Inter'] text-[#5A6070] uppercase tracking-wider mb-1">Capital ($)</label>
          <input
            type="number"
            value={initialCapital}
            onChange={(e) => setInitialCapital(Number(e.target.value))}
            className="w-full px-2.5 py-1.5 bg-[#1B1E23] border border-[#262A31] rounded-sm text-[#E7E9ED] text-[11px] font-['IBM_Plex_Mono'] focus:outline-none focus:border-[#C9A15A]/60 transition-colors"
          />
        </div>
        <div>
          <label className="block text-[9px] font-['Inter'] text-[#5A6070] uppercase tracking-wider mb-1">Risk / Trade (%)</label>
          <input
            type="number"
            step="0.005"
            value={riskPercent}
            onChange={(e) => setRiskPercent(Number(e.target.value))}
            className="w-full px-2.5 py-1.5 bg-[#1B1E23] border border-[#262A31] rounded-sm text-[#E7E9ED] text-[11px] font-['IBM_Plex_Mono'] focus:outline-none focus:border-[#C9A15A]/60 transition-colors"
          />
        </div>
        <div>
          <label className="block text-[9px] font-['Inter'] text-[#5A6070] uppercase tracking-wider mb-1">Commission</label>
          <select
            value={commissionType}
            onChange={(e) => setCommissionType(e.target.value as CommissionType)}
            className="w-full px-2.5 py-1.5 bg-[#1B1E23] border border-[#262A31] rounded-sm text-[#E7E9ED] text-[11px] font-['IBM_Plex_Mono'] focus:outline-none focus:border-[#C9A15A]/60 transition-colors"
          >
            <option value="FLAT">Flat ($)</option>
            <option value="PER_UNIT">Per Share</option>
            <option value="PERCENTAGE">Bps</option>
          </select>
        </div>
        <div>
          <label className="block text-[9px] font-['Inter'] text-[#5A6070] uppercase tracking-wider mb-1">Comm. Value</label>
          <input
            type="number"
            step="0.01"
            value={commissionValue}
            onChange={(e) => setCommissionValue(Number(e.target.value))}
            className="w-full px-2.5 py-1.5 bg-[#1B1E23] border border-[#262A31] rounded-sm text-[#E7E9ED] text-[11px] font-['IBM_Plex_Mono'] focus:outline-none focus:border-[#C9A15A]/60 transition-colors"
          />
        </div>
        
        {/* PHASE 2 & 3 ADDITIONS */}
        <div>
          <label className="block text-[9px] font-['Inter'] text-[#5A6070] uppercase tracking-wider mb-1">Contract Mult.</label>
          <input
            type="number"
            step="0.01"
            value={contractMultiplier}
            onChange={(e) => setContractMultiplier(Number(e.target.value))}
            className="w-full px-2.5 py-1.5 bg-[#1B1E23] border border-[#262A31] rounded-sm text-[#E7E9ED] text-[11px] font-['IBM_Plex_Mono'] focus:outline-none focus:border-[#C9A15A]/60 transition-colors"
          />
        </div>
        <div>
          <label className="block text-[9px] font-['Inter'] text-[#5A6070] uppercase tracking-wider mb-1">Slippage Model</label>
          <select
            value={slippageModel}
            onChange={(e) => setSlippageModel(e.target.value as any)}
            className="w-full px-2.5 py-1.5 bg-[#1B1E23] border border-[#262A31] rounded-sm text-[#E7E9ED] text-[11px] font-['IBM_Plex_Mono'] focus:outline-none focus:border-[#C9A15A]/60 transition-colors"
          >
            <option value="ATR">ATR (Stocks)</option>
            <option value="PERCENTAGE">Percentage (Crypto)</option>
            <option value="FIXED_TICK">Fixed Tick (Forex)</option>
            <option value="NONE">None</option>
          </select>
        </div>
        {slippageModel !== 'NONE' && (
          <div className="col-span-2">
            <label className="block text-[9px] font-['Inter'] text-[#5A6070] uppercase tracking-wider mb-1">{getSlippageLabel()}</label>
            <input
              type="number"
              step="any"
              value={slippageValue}
              onChange={(e) => setSlippageValue(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 bg-[#1B1E23] border border-[#262A31] rounded-sm text-[#E7E9ED] text-[11px] font-['IBM_Plex_Mono'] focus:outline-none focus:border-[#C9A15A]/60 transition-colors"
            />
          </div>
        )}
      </div>

      {/* Primary Action */}
      <button
        onClick={handleRunBacktest}
        disabled={isProcessing}
        className="w-full px-4 py-3 bg-[#C9A15A] hover:bg-[#D9B26D] disabled:bg-[#262A31] disabled:text-[#5A6070] disabled:cursor-not-allowed text-[#0A0B0D] text-[12px] font-['Space_Grotesk'] font-bold uppercase tracking-wider rounded-sm transition-colors"
      >
        {isProcessing ? `Running ${progress.toFixed(0)}%` : 'Run Backtest'}
      </button>
      
      {isProcessing && (
        <div className="w-full h-1 bg-[#262A31] rounded-sm overflow-hidden -mt-2.5">
          <div
            className="h-full bg-[#C9A15A] transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Secondary Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleRunWFO}
          disabled={isProcessing || !wfoConfig.enabled}
          className="flex-1 px-3 py-2 bg-transparent text-[#8B92A0] border border-[#262A31] hover:border-[#3A3F48] hover:text-[#E7E9ED] disabled:opacity-40 disabled:cursor-not-allowed text-[10px] font-['IBM_Plex_Mono'] uppercase tracking-wider rounded-sm transition-colors"
        >
          Run WFO
        </button>
        <button
          onClick={runMonteCarlo}
          disabled={isProcessing || !monteCarloConfig.enabled}
          className="flex-1 px-3 py-2 bg-transparent text-[#8B92A0] border border-[#262A31] hover:border-[#3A3F48] hover:text-[#E7E9ED] disabled:opacity-40 disabled:cursor-not-allowed text-[10px] font-['IBM_Plex_Mono'] uppercase tracking-wider rounded-sm transition-colors"
        >
          Monte Carlo
        </button>
      </div>
      
      <button
        onClick={resetEngineState}
        className="w-full text-center text-[10px] font-['IBM_Plex_Mono'] text-[#5A6070] hover:text-[#8B92A0] uppercase tracking-wider transition-colors"
      >
        Reset Session
      </button>

      {/* Error */}
      {error && (
        <div className="p-2.5 bg-[#E5484D]/10 border border-[#E5484D]/30 text-[#E5484D] rounded-sm text-[10px] font-['IBM_Plex_Mono'] leading-relaxed">
          {error}
        </div>
      )}
    </div>
  );
};