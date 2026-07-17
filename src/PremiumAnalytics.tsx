import React, { useState } from 'react';

export const PremiumAnalytics: React.FC = () => {
  const [activeView, setActiveView] = useState<'wfo' | 'safety'>('wfo');

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-tabs for Premium Features */}
      <div className="flex gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveView('wfo')}
          className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded-t-sm transition-colors ${
            activeView === 'wfo' 
              ? 'bg-slate-800 text-blue-400 border-b-2 border-blue-500' 
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          WFO Parameter Heatmap
        </button>
        <button
          onClick={() => setActiveView('safety')}
          className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider rounded-t-sm transition-colors ${
            activeView === 'safety' 
              ? 'bg-slate-800 text-blue-400 border-b-2 border-blue-500' 
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          Portfolio Safety Map
        </button>
      </div>

      {activeView === 'wfo' && <WFOHeatmapShell />}
      {activeView === 'safety' && <SafetyMapShell />}
    </div>
  );
};

// ============================================================================
// WFO HEATMAP SHELL
// ============================================================================
const WFOHeatmapShell: React.FC = () => {
  const rows = 12;
  const cols = 12;

  // Generates a realistic-looking optimization landscape (peak in the middle)
  const getCellData = (row: number, col: number) => {
    const distFromCenter = Math.sqrt(Math.pow(row - 6, 2) + Math.pow(col - 6, 2));
    const val = 3.5 - distFromCenter + (Math.random() * 0.8 - 0.4);
    return val.toFixed(2);
  };

  const getColor = (val: string) => {
    const num = parseFloat(val);
    if (num >= 2.0) return 'bg-emerald-600 text-white';
    if (num >= 1.0) return 'bg-emerald-800 text-emerald-100';
    if (num >= 0.0) return 'bg-slate-700 text-slate-300';
    if (num >= -1.0) return 'bg-red-900 text-red-200';
    return 'bg-red-700 text-white';
  };

  return (
    <div className="bg-[#0a0a0f] border border-slate-800 rounded-sm p-4">
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-xs font-mono text-slate-400 uppercase tracking-widest">Walk-Forward Optimization Matrix</h4>
        <span className="text-[10px] font-mono text-slate-500">Metric: Sharpe Ratio | Params: SMA(10-120) x RSI(10-60)</span>
      </div>
      
      <div className="overflow-auto custom-scrollbar">
        <div 
          className="grid gap-px bg-slate-800 border border-slate-800 rounded-sm" 
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: rows }).map((_, row) =>
            Array.from({ length: cols }).map((_, col) => {
              const val = getCellData(row, col);
              return (
                <div 
                  key={`${row}-${col}`} 
                  className={`aspect-square flex items-center justify-center text-[9px] font-mono ${getColor(val)} hover:opacity-80 cursor-crosshair transition-opacity`}
                  title={`Sharpe: ${val}`}
                >
                  {val}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 text-[10px] font-mono text-slate-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-700 rounded-sm"></span> &lt; -1.0</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-900 rounded-sm"></span> -1.0 to 0.0</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-slate-700 rounded-sm"></span> 0.0 to 1.0</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-800 rounded-sm"></span> 1.0 to 2.0</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-600 rounded-sm"></span> &gt; 2.0</span>
      </div>
    </div>
  );
};

// ============================================================================
// PORTFOLIO SAFETY MAP SHELL
// ============================================================================
const SafetyMapShell: React.FC = () => {
  return (
    <div className="bg-[#0a0a0f] border border-slate-800 rounded-sm p-4">
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-xs font-mono text-slate-400 uppercase tracking-widest">Portfolio Safety & Correlation Map</h4>
        <span className="px-2 py-0.5 bg-amber-900/30 text-amber-500 border border-amber-800 text-[10px] font-mono uppercase rounded-sm">
          Premium Module
        </span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Correlation Matrix */}
        <div className="border border-slate-800 rounded-sm p-3">
          <h5 className="text-[10px] font-mono text-slate-500 uppercase mb-2">Asset Correlation Matrix</h5>
          <div className="grid grid-cols-4 gap-px bg-slate-800 rounded-sm overflow-hidden">
            {Array.from({ length: 16 }).map((_, i) => {
              const isDiagonal = i % 5 === 0;
              const val = isDiagonal ? '1.00' : (Math.random() * 2 - 1).toFixed(2);
              const color = isDiagonal ? 'bg-blue-600' : parseFloat(val) > 0 ? 'bg-emerald-900' : 'bg-red-900';
              return (
                <div key={i} className={`aspect-square flex items-center justify-center text-[9px] font-mono text-white/80 ${color}`}>
                  {val}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[9px] font-mono text-slate-600">
            <span>SPY</span><span>QQQ</span><span>IWM</span><span>TLT</span>
          </div>
        </div>

        {/* Risk Contribution (VaR) */}
        <div className="border border-slate-800 rounded-sm p-3">
          <h5 className="text-[10px] font-mono text-slate-500 uppercase mb-2">Risk Contribution (VaR Breakdown)</h5>
          <div className="space-y-3">
            {[
              { name: 'SPY', risk: 42.5, color: 'bg-blue-500' },
              { name: 'QQQ', risk: 31.2, color: 'bg-purple-500' },
              { name: 'IWM', risk: 18.8, color: 'bg-amber-500' },
              { name: 'TLT', risk: 7.5, color: 'bg-emerald-500' },
            ].map((asset) => (
              <div key={asset.name} className="flex items-center gap-3">
                <span className="text-[11px] font-mono text-slate-400 w-8">{asset.name}</span>
                <div className="flex-1 h-2 bg-slate-800 rounded-sm overflow-hidden">
                  <div className={`h-full ${asset.color}`} style={{ width: `${asset.risk}%` }}></div>
                </div>
                <span className="text-[11px] font-mono text-slate-300 w-12 text-right">{asset.risk}%</span>
              </div>
            ))}
          </div>
          
          <div className="mt-4 pt-3 border-t border-slate-800 flex justify-between items-center">
            <span className="text-[10px] font-mono text-slate-500 uppercase">Portfolio Beta:</span>
            <span className="text-sm font-mono text-emerald-500 font-semibold">1.14</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-mono text-slate-500 uppercase">Max Drawdown Sync:</span>
            <span className="text-sm font-mono text-red-500 font-semibold">78%</span>
          </div>
        </div>
      </div>
    </div>
  );
};