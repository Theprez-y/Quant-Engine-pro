import React, { useState } from 'react';
import { StrategyConfig, STRATEGY_TEMPLATES, WFOConfig, ExpressionNode, ConditionNode, IndicatorNode, ValueNode } from './types';
import { useBacktest } from './context/BacktestContext';

export const StrategyPanel: React.FC = () => {
  const { strategy, setStrategy, wfoConfig, setWFOConfig } = useBacktest();
  const [dslInput, setDslInput] = useState('');
  const [dslError, setDslError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  const handleTemplateSelect = (name: string) => {
    setSelectedTemplate(name);
    const template = STRATEGY_TEMPLATES[name];
    if (template) {
      setStrategy(template);
      setDslInput(formatDSL(template));
    }
  };

  const formatDSL = (s: StrategyConfig): string => {
    return `// ${s.name}\nentry: ${formatExpression(s.entryRules)}\nexit: ${formatExpression(s.exitRules)}\nsizing: ${s.positionSizing}\nrisk: ${(s.riskPercent || 0.01)}`;
  };

  const formatExpression = (expr: ExpressionNode): string => {
    if (!expr.conditions || expr.conditions.length === 0) return 'true';
    return expr.conditions.map((c: ConditionNode) => {
      const left = formatOperand(c.left);
      const right = formatOperand(c.right);
      return `${left} ${c.comparator} ${right}`;
    }).join(` ${expr.logicalOps[0] || 'and'} `);
  };

  const formatOperand = (op: IndicatorNode | ValueNode): string => {
    if (op.type === 'value') return op.value.toString();
    if (op.type === 'indicator') {
      return op.params.length > 0 ? `${op.name}(${op.params.join(',')})` : op.name;
    }
    return '';
  };

  const handleDSLParse = () => {
    try {
      setDslError(null);
      // TODO: Implement actual DSL parsing logic here when ready
    } catch (err: unknown) {
      setDslError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  return (
    <div className="space-y-4">

      {/* Template Selector */}
      <div>
        <label className="block text-[9px] font-['Inter'] text-[#5A6070] uppercase tracking-wider mb-1.5">
          Template
        </label>
        <div className="flex flex-wrap gap-1.5">
          {Object.keys(STRATEGY_TEMPLATES).map(name => (
            <button
              key={name}
              onClick={() => handleTemplateSelect(name)}
              className={`px-2.5 py-1 text-[10px] font-['IBM_Plex_Mono'] uppercase tracking-wider rounded-sm transition-colors ${selectedTemplate === name
                  ? 'bg-[#C9A15A]/15 text-[#C9A15A] border border-[#C9A15A]/40'
                  : 'text-[#8B92A0] border border-[#262A31] hover:border-[#3A3F48] hover:text-[#E7E9ED]'
                }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* PHASE 5 ADDITION: Direction Selector */}
      <div>
        <label className="block text-[9px] font-['Inter'] text-[#5A6070] uppercase tracking-wider mb-1.5">
          Direction
        </label>
        <div className="flex gap-1.5">
          {(['LONG', 'SHORT', 'BOTH'] as const).map(dir => (
            <button
              key={dir}
              onClick={() => setStrategy({ ...strategy, direction: dir })}
              className={`flex-1 px-2.5 py-1.5 text-[10px] font-['IBM_Plex_Mono'] uppercase tracking-wider rounded-sm transition-colors ${(strategy.direction || 'LONG') === dir
                  ? 'bg-[#C9A15A]/15 text-[#C9A15A] border border-[#C9A15A]/40'
                  : 'text-[#8B92A0] border border-[#262A31] hover:border-[#3A3F48] hover:text-[#E7E9ED]'
                }`}
            >
              {dir}
            </button>
          ))}
        </div>
      </div>

      {/* Active Strategy Preview */}
      <div>
        <label className="block text-[9px] font-['Inter'] text-[#5A6070] uppercase tracking-wider mb-1.5">
          Active Strategy
        </label>
        <div className="bg-[#1B1E23] border border-[#262A31] rounded-sm p-3">
          <div className="text-[13px] font-['Space_Grotesk'] font-medium text-[#E7E9ED] mb-2">{strategy.name}</div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-['IBM_Plex_Mono'] gap-2">
              <span className="text-[#5A6070] shrink-0">Entry</span>
              <span className="text-[#3FB88C] text-right truncate">{formatExpression(strategy.entryRules)}</span>
            </div>
            <div className="flex justify-between text-[10px] font-['IBM_Plex_Mono'] gap-2">
              <span className="text-[#5A6070] shrink-0">Exit</span>
              <span className="text-[#E5484D] text-right truncate">{formatExpression(strategy.exitRules)}</span>
            </div>
            <div className="flex justify-between text-[10px] font-['IBM_Plex_Mono'] gap-2">
              <span className="text-[#5A6070]">Sizing</span>
              <span className="text-[#8B92A0]">{strategy.positionSizing}</span>
            </div>
            <div className="flex justify-between text-[10px] font-['IBM_Plex_Mono'] gap-2">
              <span className="text-[#5A6070]">Risk</span>
              <span className="text-[#8B92A0]">{((strategy.riskPercent || 0.01) * 100).toFixed(2)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* DSL Editor */}
      <div>
        <label className="block text-[9px] font-['Inter'] text-[#5A6070] uppercase tracking-wider mb-1.5">
          DSL Editor
        </label>
        <textarea
          value={dslInput}
          onChange={(e) => setDslInput(e.target.value)}
          className="w-full h-24 bg-[#1B1E23] border border-[#262A31] rounded-sm p-2.5 text-[#E7E9ED] font-['IBM_Plex_Mono'] text-[11px] leading-relaxed resize-none focus:outline-none focus:border-[#C9A15A]/60 transition-colors placeholder-[#5A6070]"
          placeholder={'// Define your strategy rules...\nentry: close > sma(20)\nexit: close < sma(20)\nsizing: RISK_PERCENT\nrisk: 0.01'}
        />
        {dslError && (
          <div className="mt-1.5 p-2 bg-[#E5484D]/10 border border-[#E5484D]/30 text-[#E5484D] rounded-sm text-[10px] font-['IBM_Plex_Mono']">
            {dslError}
          </div>
        )}
        <button
          onClick={handleDSLParse}
          className="mt-2 w-full px-3 py-1.5 bg-[#1B1E23] border border-[#262A31] hover:border-[#C9A15A]/50 hover:text-[#C9A15A] text-[#8B92A0] text-[10px] font-['Space_Grotesk'] font-medium uppercase tracking-wider rounded-sm transition-colors"
        >
          Validate & Apply
        </button>
      </div>

      {/* WFO Configuration */}
      <div className="border-t border-[#262A31] pt-3">
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="text-[10px] font-['Inter'] text-[#5A6070] uppercase tracking-wider">
            Walk-Forward Optimization
          </h4>
          <label className="flex items-center gap-1.5 text-[10px] font-['IBM_Plex_Mono'] text-[#8B92A0] cursor-pointer">
            <input
              type="checkbox"
              checked={wfoConfig?.enabled || false}
              onChange={(e) => setWFOConfig({ ...wfoConfig, enabled: e.target.checked })}
              className="rounded-sm border-[#262A31] bg-[#1B1E23] text-[#C9A15A] focus:ring-[#C9A15A]/20"
            />
            Enable
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[9px] font-['Inter'] text-[#5A6070] uppercase mb-1">Train</label>
            <input
              type="number"
              value={wfoConfig?.trainSize || 252}
              onChange={(e) => setWFOConfig({ ...wfoConfig, trainSize: Number(e.target.value) })}
              className="w-full px-2 py-1.5 bg-[#1B1E23] border border-[#262A31] rounded-sm text-[#E7E9ED] text-[11px] font-['IBM_Plex_Mono'] focus:outline-none focus:border-[#C9A15A]/60"
            />
          </div>
          <div>
            <label className="block text-[9px] font-['Inter'] text-[#5A6070] uppercase mb-1">Test</label>
            <input
              type="number"
              value={wfoConfig?.testSize || 63}
              onChange={(e) => setWFOConfig({ ...wfoConfig, testSize: Number(e.target.value) })}
              className="w-full px-2 py-1.5 bg-[#1B1E23] border border-[#262A31] rounded-sm text-[#E7E9ED] text-[11px] font-['IBM_Plex_Mono'] focus:outline-none focus:border-[#C9A15A]/60"
            />
          </div>
          <div>
            <label className="block text-[9px] font-['Inter'] text-[#5A6070] uppercase mb-1">Step</label>
            <input
              type="number"
              value={wfoConfig?.stepSize || 21}
              onChange={(e) => setWFOConfig({ ...wfoConfig, stepSize: Number(e.target.value) })}
              className="w-full px-2 py-1.5 bg-[#1B1E23] border border-[#262A31] rounded-sm text-[#E7E9ED] text-[11px] font-['IBM_Plex_Mono'] focus:outline-none focus:border-[#C9A15A]/60"
            />
          </div>
          <div>
            <label className="block text-[9px] font-['Inter'] text-[#5A6070] uppercase mb-1">Metric</label>
            <select
              value={wfoConfig?.optimizationMetric || 'SHARPE'}
              onChange={(e) => setWFOConfig({ ...wfoConfig, optimizationMetric: e.target.value as WFOConfig['optimizationMetric'] })}
              className="w-full px-2 py-1.5 bg-[#1B1E23] border border-[#262A31] rounded-sm text-[#E7E9ED] text-[11px] font-['IBM_Plex_Mono'] focus:outline-none focus:border-[#C9A15A]/60"
            >
              <option value="SHARPE">Sharpe</option>
              <option value="SORTINO">Sortino</option>
              <option value="PROFIT_FACTOR">Profit Factor</option>
              <option value="NET_PROFIT">Net Profit</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
