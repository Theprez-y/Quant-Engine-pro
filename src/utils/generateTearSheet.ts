import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { PerformanceLedger } from '../types';

// Terminal Color Palette (RGB)
const COLORS = {
  bg: [10, 11, 13] as const,         // #0A0B0D
  panel: [20, 22, 26] as const,      // #14161A
  border: [38, 42, 49] as const,     // #262A31
  gold: [201, 161, 90] as const,     // #C9A15A
  green: [63, 184, 140] as const,    // #3FB88C
  red: [229, 72, 77] as const,       // #E5484D
  text: [231, 233, 237] as const,    // #E7E9ED
  muted: [139, 146, 160] as const,   // #8B92A0
};

export function generateTearSheet(ledger: PerformanceLedger, strategyName: string) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 20;

  // Helper to draw dark background for the whole page
  const drawBackground = () => {
    doc.setFillColor(...COLORS.bg);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
  };

  // ==========================================
  // PAGE 1: HEADER & SCORECARD
  // ==========================================
  drawBackground();

  // Header
  doc.setFont('courier', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.gold);
  doc.text('QUANTENGINE PRO', 20, y);
  
  doc.setFont('courier', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.muted);
  doc.text('INSTITUTIONAL TEAR SHEET', 20, y + 6);
  
  doc.setTextColor(...COLORS.text);
  doc.text(`Strategy: ${strategyName.toUpperCase()}`, pageWidth - 20, y, { align: 'right' });
  doc.setTextColor(...COLORS.muted);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - 20, y + 6, { align: 'right' });

  y += 20;

  // Divider
  doc.setDrawColor(...COLORS.border);
  doc.line(20, y, pageWidth - 20, y);
  y += 10;

  // Scorecard Metrics
  doc.setFont('courier', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.text);
  doc.text('PERFORMANCE MATRIX', 20, y);
  y += 8;

  const metrics = [
    { label: 'NET PROFIT', value: `$${ledger.netProfit.toFixed(2)}`, color: ledger.netProfit >= 0 ? COLORS.green : COLORS.red },
    { label: 'PROFIT FACTOR', value: ledger.profitFactor.toFixed(3), color: ledger.profitFactor >= 1.5 ? COLORS.green : COLORS.gold },
    { label: 'SHARPE RATIO', value: ledger.sharpeRatioAnnualized.toFixed(2), color: ledger.sharpeRatioAnnualized >= 1.0 ? COLORS.green : COLORS.text },
    { label: 'SORTINO RATIO', value: ledger.sortinoRatioAnnualized.toFixed(2), color: ledger.sortinoRatioAnnualized >= 1.0 ? COLORS.green : COLORS.text },
    { label: 'MAX DRAWDOWN', value: `${ledger.maxDrawdownPercent.toFixed(2)}%`, color: COLORS.red },
    { label: 'WIN RATE', value: `${(ledger.winRate * 100).toFixed(1)}%`, color: COLORS.text },
    { label: 'TOTAL TRADES', value: ledger.totalTrades.toString(), color: COLORS.text },
    { label: 'THARP EXPECTANCY', value: `${ledger.tharpExpectancy.toFixed(2)} R`, color: ledger.tharpExpectancy > 0 ? COLORS.green : COLORS.red },
  ];

  // Draw Metric Boxes
  const boxWidth = (pageWidth - 50) / 4;
  const boxHeight = 20;
  
  metrics.forEach((m, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 20 + (col * boxWidth);
    const currentY = y + (row * (boxHeight + 5));

    // Box Background
    doc.setFillColor(...COLORS.panel);
    doc.setDrawColor(...COLORS.border);
    doc.roundedRect(x, currentY, boxWidth - 2, boxHeight, 1, 1, 'FD');

    // Label
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.muted);
    doc.text(m.label, x + 3, currentY + 6);

    // Value
    doc.setFont('courier', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(m.color[0], m.color[1], m.color[2]);
    doc.text(m.value, x + 3, currentY + 14);
  });

  y += (boxHeight * 2) + 20;

  // ==========================================
  // PAGE 2+: TRADE JOURNAL
  // ==========================================
  if (ledger.trades.length > 0) {
    doc.addPage();
    drawBackground();

    doc.setFont('courier', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.text);
    doc.text('TRADE JOURNAL', 20, 20);
    
    doc.setFont('courier', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.muted);
    doc.text(`${ledger.trades.length} Records`, pageWidth - 20, 20, { align: 'right' });

    // Prepare Table Data
    const head = [['ID', 'SIDE', 'ENTRY', 'EXIT', 'QTY', 'GROSS', 'COMM', 'SLIPPAGE', 'NET PNL']];
    const body = ledger.trades.map(t => [
      t.id.toString(),
      t.side,
      t.entryPrice.toFixed(2),
      t.exitPrice.toFixed(2),
      t.quantity.toString(),
      t.grossPnL.toFixed(2),
      t.commission.toFixed(2),
      t.slippage.toFixed(2),
      t.netPnL.toFixed(2)
    ]);

    autoTable(doc, {
      head,
      body,
      startY: 28,
      theme: 'plain',
      styles: {
        font: 'courier',
        fontSize: 8,
        cellPadding: 2.5,
        textColor: [...COLORS.text],
        fillColor: [...COLORS.panel],
        lineColor: [...COLORS.border],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [...COLORS.bg],
        textColor: [...COLORS.muted],
        fontStyle: 'bold',
        fontSize: 7,
      },
      alternateRowStyles: {
        fillColor: [...COLORS.bg],
      },
      margin: { left: 20, right: 20 },
      didParseCell: function (data) {
        // Colorize PnL and Side
        if (data.section === 'body') {
          const colIndex = data.column.index;
          const value = data.cell.raw as string;
          
          if (colIndex === 1) { // Side
            data.cell.styles.textColor = value === 'BUY' ? [...COLORS.green] : [...COLORS.red];
            data.cell.styles.fontStyle = 'bold';
          }
          if (colIndex === 8) { // Net PnL
            const num = parseFloat(value);
            data.cell.styles.textColor = num >= 0 ? [...COLORS.green] : [...COLORS.red];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    });
  }

  // Save the PDF
  doc.save(`TearSheet_${strategyName.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}