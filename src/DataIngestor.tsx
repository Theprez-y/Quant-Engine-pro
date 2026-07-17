import React, { useRef } from 'react';
import { useBacktest } from './context/BacktestContext';

export const DataIngestor: React.FC = () => {
  const { ingestDataStream, isParsing, progress, parseReport } = useBacktest();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    ingestDataStream(buffer);
  };

  return (
    <div>
      <input
        type="file"
        accept=".csv"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isParsing}
        className="w-full px-3 py-2 bg-[#C9A15A] hover:bg-[#D9B26D] disabled:bg-[#262A31] disabled:text-[#5A6070] disabled:cursor-not-allowed text-[#0A0B0D] text-[11px] font-['Space_Grotesk'] font-semibold uppercase tracking-wider rounded-sm transition-colors"
      >
        {isParsing ? `Parsing ${progress.toFixed(0)}%` : 'Upload CSV'}
      </button>

      {!parseReport && !isParsing && (
        <p className="mt-2 text-[10px] text-[#5A6070] font-['Inter'] leading-relaxed">
          Load historical OHLCV data to begin. CSV format, one row per bar.
        </p>
      )}

      {parseReport && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="bg-[#1B1E23] border border-[#262A31] rounded-sm p-2.5">
            <div className="text-[9px] font-['Inter'] text-[#5A6070] uppercase tracking-wider mb-0.5">Total Rows</div>
            <div className="text-[13px] font-['IBM_Plex_Mono'] text-[#E7E9ED] tabular-nums">{parseReport.totalRows.toLocaleString()}</div>
          </div>
          <div className="bg-[#1B1E23] border border-[#262A31] rounded-sm p-2.5">
            <div className="text-[9px] font-['Inter'] text-[#5A6070] uppercase tracking-wider mb-0.5">Accepted</div>
            <div className="text-[13px] font-['IBM_Plex_Mono'] text-[#3FB88C] tabular-nums">{parseReport.acceptedRows.toLocaleString()}</div>
          </div>
          <div className="bg-[#1B1E23] border border-[#262A31] rounded-sm p-2.5">
            <div className="text-[9px] font-['Inter'] text-[#5A6070] uppercase tracking-wider mb-0.5">Anomalies</div>
            <div className="text-[13px] font-['IBM_Plex_Mono'] text-[#C9A15A] tabular-nums">{parseReport.anomaliesMitigated.toLocaleString()}</div>
          </div>
          <div className="bg-[#1B1E23] border border-[#262A31] rounded-sm p-2.5">
            <div className="text-[9px] font-['Inter'] text-[#5A6070] uppercase tracking-wider mb-0.5">Gap Filled</div>
            <div className="text-[13px] font-['IBM_Plex_Mono'] text-[#8B92A0] tabular-nums">{parseReport.gapFilledBars.toLocaleString()}</div>
          </div>
        </div>
      )}
    </div>
  );
};
