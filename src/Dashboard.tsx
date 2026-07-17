import React, { useState, useMemo } from 'react';
import { DataIngestor } from './DataIngestor';
import { StrategyPanel } from './StrategyPanel';
import { BacktestPanel } from './BacktestPanel';
import { ResultsPanel } from './ResultsPanel';
import { useBacktest } from './context/BacktestContext';

// Signature element: a compact live sparkline of the equity curve,
// embedded directly in the command bar. Renders nothing until a
// backtest has produced data — the header comes alive with the results.
const HeaderSparkline: React.FC<{ data: Float64Array | null }> = ({ data }) => {
  const path = useMemo(() => {
    if (!data || data.length < 2) return null;
    const w = 120, h = 28;
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < data.length; i++) {
      if (data[i] < min) min = data[i];
      if (data[i] > max) max = data[i];
    }
    const range = max - min || 1;
    const step = w / (data.length - 1);
    let d = '';
    for (let i = 0; i < data.length; i++) {
      const x = i * step;
      const y = h - ((data[i] - min) / range) * h;
      d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
    }
    return d;
  }, [data]);

  const rising = data && data.length > 1 ? data[data.length - 1] >= data[0] : true;

  if (!path) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 rounded-sm border border-[#262A31] bg-[#14161A]">
        <span className="text-[10px] font-['IBM_Plex_Mono'] text-[#5A6070] tracking-wide">NO RUN YET</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1 rounded-sm border border-[#262A31] bg-[#14161A]">
      <svg width="120" height="28" viewBox="0 0 120 28" className="overflow-visible">
        <path d={path} fill="none" stroke={rising ? '#3FB88C' : '#E5484D'} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={`text-[10px] font-['IBM_Plex_Mono'] tracking-wide ${rising ? 'text-[#3FB88C]' : 'text-[#E5484D]'}`}>
        {rising ? 'UP' : 'DOWN'}
      </span>
    </div>
  );
};

// A numbered workflow section — the sequence (data -> strategy -> execute)
// is a real pipeline, so the numbering encodes actual order, not decoration.
const WorkflowSection: React.FC<{
  index: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ index, title, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[#262A31] rounded-sm bg-[#14161A] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#181B21] transition-colors"
      >
        <span className="text-[11px] font-['IBM_Plex_Mono'] text-[#C9A15A] tabular-nums">{index}</span>
        <span className="text-[11px] font-['Space_Grotesk'] font-medium text-[#E7E9ED] uppercase tracking-wider flex-1 text-left">
          {title}
        </span>
        <span className={`text-[#5A6070] text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-[#262A31]">
          {children}
        </div>
      )}
    </div>
  );
};

export const Dashboard: React.FC = () => {
  const { parseReport, strategy, isProcessing, equityCurve, ledger } = useBacktest();

  return (
    <>
      {/* ========================================== */}
      {/* COMMAND BAR                                */}
      {/* ========================================== */}
      <header className="h-14 min-h-[56px] border-b border-[#262A31] flex items-center justify-between px-5 bg-[#0F1013] shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-[15px] font-['Space_Grotesk'] font-semibold tracking-tight text-[#E7E9ED]">
            QuantEngine <span className="text-[#C9A15A]">Pro</span>
          </h1>
          <div className="h-4 w-px bg-[#262A31]" />
          <div className="flex items-center gap-1.5 text-[10px] text-[#8B92A0] font-['IBM_Plex_Mono'] tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3FB88C] animate-pulse" />
            <span>SYSTEM ONLINE</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <HeaderSparkline data={equityCurve} />

          <div className="hidden md:flex items-center gap-2 text-[10px] font-['IBM_Plex_Mono'] text-[#8B92A0]">
            {parseReport && (
              <span className="px-2.5 py-1 bg-[#14161A] rounded-sm border border-[#262A31]">
                DATA <span className="text-[#E7E9ED]">{parseReport.acceptedRows.toLocaleString()}</span>
              </span>
            )}
            {strategy && (
              <span className="px-2.5 py-1 bg-[#14161A] rounded-sm border border-[#262A31]">
                <span className="text-[#C9A15A]">{strategy.name.toUpperCase()}</span>
              </span>
            )}
            {ledger && (
              <span className={`px-2.5 py-1 rounded-sm border ${ledger.netProfit >= 0 ? 'border-[#3FB88C]/30 text-[#3FB88C]' : 'border-[#E5484D]/30 text-[#E5484D]'} bg-[#14161A]`}>
                {ledger.netProfit >= 0 ? '+' : ''}{ledger.netProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            )}
            {isProcessing && (
              <span className="px-2.5 py-1 bg-[#C9A15A]/10 text-[#C9A15A] rounded-sm border border-[#C9A15A]/30 animate-pulse">
                COMPUTING
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ========================================== */}
      {/* MAIN WORKSPACE                             */}
      {/* ========================================== */}
      <div className="flex-1 flex overflow-hidden">

        {/* WORKFLOW RAIL */}
        <aside className="w-[380px] min-w-[380px] border-r border-[#262A31] flex flex-col overflow-hidden bg-[#0C0D10]">
          <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
            <WorkflowSection index="01" title="Data">
              <DataIngestor />
            </WorkflowSection>
            <WorkflowSection index="02" title="Strategy">
              <StrategyPanel />
            </WorkflowSection>
            <WorkflowSection index="03" title="Execute">
              <BacktestPanel />
            </WorkflowSection>
          </div>
        </aside>

        {/* RESULTS WORKSPACE */}
        <main className="flex-1 overflow-y-auto custom-scrollbar bg-[#0A0B0D]">
          <div className="p-5">
            <ResultsPanel />
          </div>
        </main>
      </div>
    </>
  );
};
