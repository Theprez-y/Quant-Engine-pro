import React, { useState, useMemo } from 'react';
import { generateTearSheet } from './utils/generateTearSheet';
import { useBacktest } from './context/BacktestContext';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';

import { TradeRecord } from './types';

type SortKey = 'id' | 'side' | 'entryPrice' | 'exitPrice' | 'quantity' | 'grossPnL' | 'commission' | 'slippage' | 'netPnL';

const tooltipStyle = {
  background: '#1B1E23',
  border: '1px solid #262A31',
  borderRadius: '2px',
  color: '#E7E9ED',
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: '11px',
};

export const ResultsPanel: React.FC = () => {
  // Added 'wfoResults' to the destructured context
  const { ledger, equityCurve, monteCarloResult, strategy, wfoResults } = useBacktest();
  
  // Added 'wfo' to the union type
  const [activeChart, setActiveChart] = useState<'equity' | 'drawdown' | 'rolling' | 'distribution' | 'montecarlo' | 'wfo'>('equity');
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [sideFilter, setSideFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');

  // ALL useMemo calls MUST happen before any conditional return
  const equityData = useMemo(() => {
    if (!equityCurve) return [];
    return Array.from(equityCurve).map((value, i) => ({ bar: i, equity: value }));
  }, [equityCurve]);

  const drawdownData = useMemo(() => {
    if (!equityCurve) return [];
    let peak = equityCurve[0];
    return Array.from(equityCurve).map((value) => {
      if (value > peak) peak = value;
      const dd = ((peak - value) / peak) * 100;
      return { equity: value, drawdown: dd };
    });
  }, [equityCurve]);

  const rollingData = useMemo(() => {
    if (!equityCurve) return [];
    const window = 30;
    const data = [];
    for (let i = window; i < equityCurve.length; i++) {
      const returns = [];
      for (let j = i - window + 1; j <= i; j++) {
        returns.push((equityCurve[j] - equityCurve[j - 1]) / equityCurve[j - 1]);
      }
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const std = Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length);
      const sharpe = std > 0 ? mean / std * Math.sqrt(252) : 0;
      data.push({ bar: i, rollingSharpe: sharpe });
    }
    return data;
  }, [equityCurve]);

  const tradeDistribution = useMemo(() => {
    if (!ledger?.trades?.length) return [];
    const wins = ledger.trades.filter(t => t.netPnL > 0);
    const losses = ledger.trades.filter(t => t.netPnL <= 0);
    return [
      { name: 'Winning Trades', value: wins.length, color: '#3FB88C' },
      { name: 'Losing Trades', value: losses.length, color: '#E5484D' },
    ];
  }, [ledger]);

  const pnlHistogram = useMemo(() => {
    if (!ledger?.trades?.length) return [];
    const buckets = [-5000, -2000, -1000, -500, 0, 500, 1000, 2000, 5000];
    const counts = buckets.map((b, i) => ({
      range: i < buckets.length - 1 ? `$${b} to $${buckets[i + 1]}` : `>$${b}`,
      count: 0,
      color: b < 0 ? '#E5484D' : '#3FB88C',
    }));
    for (const trade of ledger.trades) {
      for (let i = 0; i < buckets.length - 1; i++) {
        if (trade.netPnL >= buckets[i] && trade.netPnL < buckets[i + 1]) {
          counts[i].count++;
          break;
        }
      }
    }
    return counts;
  }, [ledger]);

  const mcData = useMemo<Array<Record<string, number>>>(() => {
    if (!monteCarloResult?.equityCurves?.length) return [];
    const curves = monteCarloResult.equityCurves.slice(0, 10);
    if (curves.length === 0) return [];
    const barCount = curves[0].length;
    return Array.from({ length: barCount }, (_, barIdx) => {
      const point: Record<string, number> = { bar: barIdx };
      curves.forEach((curve, i) => {
        point[`sim${i}`] = curve[barIdx];
      });
      return point;
    });
  }, [monteCarloResult]);

  const sortedTrades = useMemo<TradeRecord[]>(() => {
    if (!ledger?.trades) return [];
    let rows = ledger.trades;
    if (sideFilter !== 'ALL') rows = rows.filter(t => t.side === sideFilter);
    const sorted = [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv);
      return (Number(av) - Number(bv));
    });
    return sortDir === 'asc' ? sorted : sorted.reverse();
  }, [ledger, sortKey, sortDir, sideFilter]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const handleExport = () => {
    if (!ledger?.trades) return;
    if (exportFormat === 'csv') {
      const headers = ['id', 'symbol', 'side', 'entryPrice', 'exitPrice', 'quantity', 'entryBar', 'exitBar', 'grossPnL', 'commission', 'slippage', 'netPnL'];
      const rows = ledger.trades.map(t => [t.id, t.symbol, t.side, t.entryPrice, t.exitPrice, t.quantity, t.entryBar, t.exitBar, t.grossPnL, t.commission, t.slippage, t.netPnL]);
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `trades_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    } else if (exportFormat === 'json') {
      const json = JSON.stringify(ledger.trades, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `trades_${new Date().toISOString().slice(0, 10)}.json`; a.click();
    }
  };

  // NOW the conditional return is safe
  if (!ledger || !equityCurve) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[500px] text-center border border-[#262A31] rounded-sm bg-[#14161A]">
        <div className="w-10 h-10 rounded-full border border-[#262A31] flex items-center justify-center mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[#5A6070]" />
        </div>
        <div className="text-[#E7E9ED] text-[13px] font-['Space_Grotesk'] font-medium mb-1.5">Awaiting first run</div>
        <div className="text-[#5A6070] text-[11px] font-['IBM_Plex_Mono']">Load data and run a backtest to populate this workspace.</div>
      </div>
    );
  }

  const chartTabs = [
    { id: 'equity' as const, label: 'Equity Curve' },
    { id: 'drawdown' as const, label: 'Drawdown' },
    { id: 'rolling' as const, label: 'Rolling Sharpe' },
    { id: 'distribution' as const, label: 'Distribution' },
    { id: 'montecarlo' as const, label: 'Monte Carlo' },
    { id: 'wfo' as const, label: 'WFO Matrix' }, // <-- ADDED WFO TAB
  ];

  const sortableCols: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
    { key: 'id', label: 'ID', align: 'left' },
    { key: 'side', label: 'Side', align: 'left' },
    { key: 'entryPrice', label: 'Entry', align: 'right' },
    { key: 'exitPrice', label: 'Exit', align: 'right' },
    { key: 'quantity', label: 'Qty', align: 'right' },
    { key: 'grossPnL', label: 'Gross', align: 'right' },
    { key: 'commission', label: 'Comm', align: 'right' },
    { key: 'slippage', label: 'Slippage', align: 'right' },
    { key: 'netPnL', label: 'Net PnL', align: 'right' },
  ];

  return (
    <div className="flex flex-col gap-4">

      {/* 1. SCORECARD — elevated cards, not seamless gridlines */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2.5">
        <MetricCell label="Net Profit" value={`$${ledger.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} color={ledger.netProfit >= 0 ? 'text-[#3FB88C]' : 'text-[#E5484D]'} />
        <MetricCell label="Profit Factor" value={ledger.profitFactor.toFixed(3)} color={ledger.profitFactor >= 1.5 ? 'text-[#3FB88C]' : 'text-[#C9A15A]'} />
        <MetricCell label="Sharpe Ratio" value={ledger.sharpeRatioAnnualized.toFixed(2)} color={ledger.sharpeRatioAnnualized >= 1.0 ? 'text-[#3FB88C]' : 'text-[#E7E9ED]'} />
        <MetricCell label="Sortino Ratio" value={ledger.sortinoRatioAnnualized.toFixed(2)} color={ledger.sortinoRatioAnnualized >= 1.0 ? 'text-[#3FB88C]' : 'text-[#E7E9ED]'} />
        <MetricCell label="Max Drawdown" value={`${ledger.maxDrawdownPercent.toFixed(2)}%`} color="text-[#E5484D]" />
        <MetricCell label="Win Rate" value={`${(ledger.winRate * 100).toFixed(1)}%`} color="text-[#8FB5D9]" />
        <MetricCell label="Total Trades" value={ledger.totalTrades.toString()} color="text-[#E7E9ED]" />
        <MetricCell label="Tharp Expectancy" value={`${ledger.tharpExpectancy.toFixed(2)} R`} color={ledger.tharpExpectancy > 0 ? 'text-[#3FB88C]' : 'text-[#E5484D]'} />
      </div>

      {/* 2. TOOLBAR (Tabs & Export) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border border-[#262A31] bg-[#14161A] rounded-sm px-1">
        <div className="flex flex-wrap">
          {chartTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveChart(tab.id)}
              className={`px-3.5 py-2.5 text-[11px] font-['Space_Grotesk'] font-medium uppercase tracking-wider transition-colors border-b-2 ${activeChart === tab.id
                  ? 'border-[#C9A15A] text-[#C9A15A]'
                  : 'border-transparent text-[#5A6070] hover:text-[#8B92A0]'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tear Sheet PDF Button alongside Export */}
        <div className="flex items-center gap-2 py-1.5">
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as 'csv' | 'json')}
            className="bg-[#1B1E23] border border-[#262A31] text-[#8B92A0] text-[10px] font-['IBM_Plex_Mono'] px-2 py-1.5 rounded-sm focus:outline-none focus:border-[#3A3F48]"
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
          <button
            onClick={handleExport}
            className="px-3 py-1.5 bg-[#3FB88C]/10 border border-[#3FB88C]/30 hover:bg-[#3FB88C]/20 text-[#3FB88C] text-[10px] font-['Space_Grotesk'] font-semibold uppercase tracking-wider rounded-sm transition-colors"
          >
            Export
          </button>
          <button
            onClick={() => generateTearSheet(ledger, strategy.name)}
            className="px-3 py-1.5 bg-[#C9A15A]/10 border border-[#C9A15A]/30 hover:bg-[#C9A15A]/20 text-[#C9A15A] text-[10px] font-['Space_Grotesk'] font-semibold uppercase tracking-wider rounded-sm transition-colors"
          >
            Tear Sheet PDF
          </button>
        </div>
      </div>

      {/* 3. CHART VIEWPORT */}
      <div className="bg-[#14161A] border border-[#262A31] rounded-sm p-4 min-h-[360px] h-[360px]">
        {activeChart === 'equity' && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={equityData}>
              <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3FB88C" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3FB88C" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1B1E23" />
              <XAxis dataKey="bar" tick={{ fill: '#5A6070', fontSize: 10, fontFamily: 'IBM Plex Mono' }} axisLine={{ stroke: '#262A31' }} />
              <YAxis tick={{ fill: '#5A6070', fontSize: 10, fontFamily: 'IBM Plex Mono' }} axisLine={{ stroke: '#262A31' }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`$${v.toLocaleString()}`, 'Equity']} />
              <Area type="monotone" dataKey="equity" stroke="#3FB88C" strokeWidth={1.5} fill="url(#equityGradient)" animationDuration={500} />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {activeChart === 'drawdown' && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={drawdownData}>
              <defs>
                <linearGradient id="ddGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#E5484D" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#E5484D" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1B1E23" />
              <XAxis dataKey="bar" tick={{ fill: '#5A6070', fontSize: 10, fontFamily: 'IBM Plex Mono' }} hide />
              <YAxis tick={{ fill: '#5A6070', fontSize: 10, fontFamily: 'IBM Plex Mono' }} tickFormatter={(v: number) => `${v.toFixed(1)}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(2)}%`, 'Drawdown']} />
              <Area type="monotone" dataKey="drawdown" stroke="#E5484D" strokeWidth={1.5} fill="url(#ddGradient)" animationDuration={500} />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {activeChart === 'rolling' && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rollingData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1B1E23" />
              <XAxis dataKey="bar" tick={{ fill: '#5A6070', fontSize: 10, fontFamily: 'IBM Plex Mono' }} hide />
              <YAxis tick={{ fill: '#5A6070', fontSize: 10, fontFamily: 'IBM Plex Mono' }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v.toFixed(2), 'Rolling Sharpe']} />
              <Line type="monotone" dataKey="rollingSharpe" stroke="#8FB5D9" strokeWidth={1.5} dot={false} animationDuration={500} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {activeChart === 'distribution' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={tradeDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value" label={({ name, percent }: { name: string; percent: number }) => `${name}: ${(percent * 100).toFixed(0)}%`}>
                  {tradeDistribution.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.color} />))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pnlHistogram}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1B1E23" />
                <XAxis dataKey="range" tick={{ fill: '#5A6070', fontSize: 9, fontFamily: 'IBM Plex Mono' }} angle={-45} textAnchor="end" />
                <YAxis tick={{ fill: '#5A6070', fontSize: 10, fontFamily: 'IBM Plex Mono' }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#C9A15A" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {activeChart === 'montecarlo' && monteCarloResult && (
          <div className="flex flex-col h-full">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
              <MetricCell label="Prob. of Profit" value={`${(monteCarloResult.probabilityOfProfit * 100).toFixed(1)}%`} color="text-[#3FB88C]" />
              <MetricCell label="Prob. of Ruin" value={`${(monteCarloResult.probabilityOfRuin * 100).toFixed(1)}%`} color="text-[#E5484D]" />
              <MetricCell label="Median Equity" value={`$${monteCarloResult.medianFinalEquity.toLocaleString()}`} color="text-[#E7E9ED]" />
              <MetricCell label="Sharpe CI" value={`[${monteCarloResult.sharpeCI[0].toFixed(2)}, ${monteCarloResult.sharpeCI[1].toFixed(2)}]`} color="text-[#8FB5D9]" />
            </div>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mcData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1B1E23" />
                  <XAxis dataKey="bar" tick={{ fill: '#5A6070', fontSize: 10, fontFamily: 'IBM Plex Mono' }} hide />
                  <YAxis tick={{ fill: '#5A6070', fontSize: 10, fontFamily: 'IBM Plex Mono' }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={tooltipStyle} />
                  {mcData.length > 0 && Object.keys(mcData[0]).filter(k => k.startsWith('sim')).slice(0, 5).map((key, i) => (
                    <Line key={key} type="monotone" dataKey={key} stroke={`hsl(${i * 40 + 30}, 55%, 55%)`} strokeWidth={1} dot={false} opacity={0.6} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* 5. WFO MATRIX */}
        {activeChart === 'wfo' && wfoResults && wfoResults.length > 0 && (
          <div className="flex flex-col h-full gap-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-['Space_Grotesk'] font-medium text-[#E7E9ED] uppercase tracking-wider">Walk-Forward Windows</div>
                <div className="text-[10px] font-['IBM_Plex_Mono'] text-[#5A6070] mt-0.5">{wfoResults.length} Out-of-Sample Tests Evaluated via Genetic Algorithm</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-[9px] font-['IBM_Plex_Mono'] text-[#3FB88C] uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-[#3FB88C]"></span> Robust
                </span>
                <span className="flex items-center gap-1.5 text-[9px] font-['IBM_Plex_Mono'] text-[#E5484D] uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-[#E5484D]"></span> Overfit
                </span>
              </div>
            </div>

            <div className="overflow-auto custom-scrollbar flex-1 border border-[#262A31] rounded-sm">
              <table className="w-full text-[11px] font-['IBM_Plex_Mono'] border-collapse">
                <thead className="sticky top-0 bg-[#0F1013] z-10">
                  <tr className="border-b border-[#262A31] text-[#5A6070] uppercase tracking-wider text-left">
                    <th className="px-3 py-2">Window</th>
                    <th className="px-3 py-2">Test Period (Bars)</th>
                    <th className="px-3 py-2 text-right">Train Sharpe</th>
                    <th className="px-3 py-2 text-right">Test Sharpe</th>
                    <th className="px-3 py-2 text-right">Test Net PnL</th>
                    <th className="px-3 py-2 text-right">Best Params</th>
                    <th className="px-3 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {wfoResults.map((w, idx) => (
                    <tr key={idx} className={`border-b border-[#262A31]/60 hover:bg-[#1B1E23] transition-colors ${idx % 2 === 1 ? 'bg-[#0F1013]/40' : ''}`}>
                      <td className="px-3 py-2 text-[#8B92A0]">#{w.windowIndex}</td>
                      <td className="px-3 py-2 text-[#E7E9ED]">{w.testStart} → {w.testEnd}</td>
                      <td className="px-3 py-2 text-right text-[#8B92A0]">{w.trainPerformance.sharpeRatioAnnualized.toFixed(2)}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${w.testPerformance.sharpeRatioAnnualized >= 0 ? 'text-[#3FB88C]' : 'text-[#E5484D]'}`}>
                        {w.testPerformance.sharpeRatioAnnualized.toFixed(2)}
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold ${w.testPerformance.netProfit >= 0 ? 'text-[#3FB88C]' : 'text-[#E5484D]'}`}>
                        ${w.testPerformance.netProfit.toFixed(0)}
                      </td>
                      <td className="px-3 py-2 text-right text-[#C9A15A]">
                        {Object.entries(w.bestParams).map(([k, v]) => `${k}:${v}`).join(', ')}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {w.isOverfit ? (
                          <span className="px-2 py-0.5 bg-[#E5484D]/10 border border-[#E5484D]/30 text-[#E5484D] text-[9px] uppercase tracking-wider rounded-sm">Overfit</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-[#3FB88C]/10 border border-[#3FB88C]/30 text-[#3FB88C] text-[9px] uppercase tracking-wider rounded-sm">Robust</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeChart === 'wfo' && (!wfoResults || wfoResults.length === 0) && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-[#5A6070] text-[11px] font-['IBM_Plex_Mono']">Enable WFO in the Strategy Panel and run an optimization to view the matrix.</div>
          </div>
        )}
      </div>

      {/* 4. TRADE JOURNAL */}
      {ledger.trades && ledger.trades.length > 0 && (
        <div className="bg-[#14161A] border border-[#262A31] rounded-sm overflow-hidden flex flex-col max-h-[420px]">
          <div className="px-4 py-2.5 border-b border-[#262A31] bg-[#0F1013] flex items-center justify-between shrink-0">
            <span className="text-[11px] font-['Space_Grotesk'] font-medium text-[#E7E9ED] uppercase tracking-wider">Trade Journal</span>
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                {(['ALL', 'BUY', 'SELL'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setSideFilter(f)}
                    className={`px-2 py-1 text-[9px] font-['IBM_Plex_Mono'] uppercase tracking-wider rounded-sm transition-colors ${sideFilter === f ? 'bg-[#C9A15A]/15 text-[#C9A15A] border border-[#C9A15A]/40' : 'text-[#5A6070] border border-[#262A31] hover:text-[#8B92A0]'
                      }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <span className="text-[10px] font-['IBM_Plex_Mono'] text-[#5A6070]">{sortedTrades.length} Records</span>
            </div>
          </div>
          <div className="overflow-auto custom-scrollbar flex-1">
            <table className="w-full text-[11px] font-['IBM_Plex_Mono'] border-collapse">
              <thead className="sticky top-0 bg-[#0F1013] z-10">
                <tr className="border-b border-[#262A31] text-[#5A6070] uppercase tracking-wider">
                  {sortableCols.map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`px-3 py-2 cursor-pointer select-none hover:text-[#8B92A0] transition-colors ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                    >
                      {col.label}{sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedTrades.map((trade, idx) => (
                  <tr key={trade.id} className={`border-b border-[#262A31]/60 hover:bg-[#1B1E23] transition-colors ${idx % 2 === 1 ? 'bg-[#0F1013]/40' : ''}`}>
                    <td className="px-3 py-1.5 text-[#8B92A0]">{trade.id}</td>
                    <td className={`px-3 py-1.5 font-semibold ${trade.side === 'BUY' ? 'text-[#3FB88C]' : 'text-[#E5484D]'}`}>{trade.side}</td>
                    <td className="px-3 py-1.5 text-right text-[#E7E9ED]">{trade.entryPrice.toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right text-[#E7E9ED]">{trade.exitPrice.toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right text-[#8B92A0]">
                      {trade.quantity % 1 === 0 ? trade.quantity : trade.quantity.toFixed(4)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-[#E7E9ED]">{trade.grossPnL.toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right text-[#5A6070]">{trade.commission.toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right text-[#5A6070]">{trade.slippage.toFixed(2)}</td>
                    <td className={`px-3 py-1.5 text-right font-semibold ${trade.netPnL >= 0 ? 'text-[#3FB88C]' : 'text-[#E5484D]'}`}>
                      {trade.netPnL.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// Elevated metric card — replaces the old seamless gridline scorecard
const MetricCell: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div className="bg-[#14161A] border border-[#262A31] rounded-sm p-3 flex flex-col gap-1">
    <span className="text-[9px] font-['Inter'] text-[#5A6070] uppercase tracking-wider">{label}</span>
    <span className={`text-[15px] font-['IBM_Plex_Mono'] font-semibold tabular-nums ${color}`}>{value}</span>
  </div>
);