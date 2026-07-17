import { IngestionConfig, ColumnIndexMap, ColumnarDataFrame } from './types';

const COLUMN_ALIASES: Record<string, string[]> = {
  timestamp: [
    'timestamp', 'time', 'date', 'datetime', 't', 'epoch', 'ts', 'date/time', 'd/t', 'dt',
    'time_utc', 'timestamp_utc', 'date_gmt', 'bar_time', 'bartime', 'time_stamp',
    'index', 'trade_date', 'quotedate', 'quote_date', 'period', 'start_time',
    'open_time', 'opentime', 'close_time', 'closetime', 'e', 'event_time'
  ],
  open: [
    'open', 'o', 'op', 'openprice', 'price_open', 'open_price', 'first',
    'open_val', 'openval', 'po', 'prc_o', 'opening_price', 'px_open'
  ],
  high: [
    'high', 'h', 'hi', 'highprice', 'price_high', 'high_price', 'max',
    'high_val', 'highval', 'ph', 'prc_high', 'maximum_price', 'px_high', 'top'
  ],
  low: [
    'low', 'l', 'lo', 'lowprice', 'price_low', 'low_price', 'min',
    'low_val', 'lowval', 'pl', 'prc_low', 'minimum_price', 'px_low', 'bottom'
  ],
  close: [
    'close', 'c', 'cl', 'closeprice', 'settle', 'price_close', 'last', 'close_price',
    'adj_close', 'adjclose', 'adjusted_close', 'adjusted_price', 'settlement',
    'close_val', 'closeval', 'pc', 'prc_close', 'closing_price', 'px_last', 'px_close', 'close/last'
  ],
  volume: [
    'volume', 'v', 'vol', 'qty', 'quantity', 'total_volume', 'vol_usd', 'vol_base',
    'base_volume', 'quote_volume', 'quote_asset_volume', 'asset_volume',
    'number_of_trades', 'trades', 'count', 'size', 'shares', 'turnover',
    'vol_val', 'volval', 'pv', 'trade_volume', 'vol_curr'
  ]
};

export class StreamingParser {
  private config: IngestionConfig;
  private delimiterByte: number;

  constructor(config: IngestionConfig) {
    this.config = config;
    this.delimiterByte = config.delimiter.charCodeAt(0);
  }

  public static discoverSchema(rawData: ArrayBuffer, delimiter: string = ','): ColumnIndexMap {
    const bytes = new Uint8Array(rawData);

    let headerLength = 0;
    while (headerLength < bytes.length && bytes[headerLength] !== 10) {
      headerLength++;
    }

    const textDecoder = new TextDecoder('utf-8');
    const headerLine = textDecoder.decode(bytes.subarray(0, headerLength)).toLowerCase();
    const columns = headerLine.split(delimiter).map(col => col.trim().replace(/["']/g, ''));

    const schemaMap: ColumnIndexMap = {
      timestamp: -1,
      open: -1,
      high: -1,
      low: -1,
      close: -1,
      volume: -1
    };

    for (let i = 0; i < columns.length; i++) {
      const columnName = columns[i];
      for (const [targetKey, aliases] of Object.entries(COLUMN_ALIASES)) {
        if (aliases.includes(columnName)) {
          schemaMap[targetKey as keyof ColumnIndexMap] = i;
          break;
        }
      }
    }

    const requiredFields: (keyof ColumnIndexMap)[] = ['timestamp', 'open', 'high', 'low', 'close'];
    for (const field of requiredFields) {
      if (schemaMap[field] === -1) {
        throw new Error(
          `Ingestion Failed: Unable to map required structural column "${field}". ` +
          `The file headers [${columns.join(', ')}] did not match known engine aliases.`
        );
      }
    }

    if (schemaMap.volume === -1) {
      console.warn("Data Ingestion Warning: 'volume' column not found. Defaulting index mapping to safety threshold.");
      schemaMap.volume = 999;
    }

    return schemaMap;
  }

  public countRows(uint8Array: Uint8Array): number {
    let rowCount = 0;
    const len = uint8Array.length;

    for (let i = 0; i < len; i++) {
      if (uint8Array[i] === 10) {
        rowCount++;
      }
    }

    if (len > 0 && uint8Array[len - 1] !== 10) {
      rowCount++;
    }

    if (this.config.hasHeader && rowCount > 0) {
      rowCount--;
    }

    return rowCount;
  }

  public parse(rawData: ArrayBuffer, onProgress: (pct: number) => void): ColumnarDataFrame {
    const bytes = new Uint8Array(rawData);
    const totalRows = this.countRows(bytes);
    const dataFrame = new ColumnarDataFrame(totalRows);

    const len = bytes.length;
    const schema = this.config.schemaMap;

    let currentIdx = 0;
    let fieldIdx = 0;
    let lineStart = 0;
    let isHeaderLine = this.config.hasHeader;

    let currentFieldStart = 0;
    let currentFieldLen = 0;
    const textDecoder = new TextDecoder('utf-8');

    let rawTs = 0n;
    let rawO = 0;
    let rawH = 0;
    let rawL = 0;
    let rawC = 0;
    let rawV = 0;

    let lastValidTimestamp = -1n;
    let totalAnomaliesMitigated = 0;
    let priceBoundViolations = 0;
    let swingViolations = 0;
    let duplicateTimestamps = 0;
    let gapFilledBars = 0;
    let firstTimestamp = -1n;
    let lastTimestamp = -1n;

    for (let i = 0; i < len; i++) {
      const byte = bytes[i];
      const isDelimiter = byte === this.delimiterByte;
      const isNewline = byte === 10 || byte === 13;

      if (isDelimiter || isNewline) {
        currentFieldLen = i - currentFieldStart;

        if (!isHeaderLine && currentFieldLen > 0) {
          if (fieldIdx === schema.timestamp) {
            rawTs = this.parseTimestamp(bytes.subarray(currentFieldStart, currentFieldStart + currentFieldLen), textDecoder);
          } else if (fieldIdx === schema.open) {
            rawO = this.fastParseFloat(bytes, currentFieldStart, currentFieldLen);
          } else if (fieldIdx === schema.high) {
            rawH = this.fastParseFloat(bytes, currentFieldStart, currentFieldLen);
          } else if (fieldIdx === schema.low) {
            rawL = this.fastParseFloat(bytes, currentFieldStart, currentFieldLen);
          } else if (fieldIdx === schema.close) {
            rawC = this.fastParseFloat(bytes, currentFieldStart, currentFieldLen);
          } else if (fieldIdx === schema.volume) {
            if (schema.volume !== 999) {
              // PHASE 4 FIX: Safely parse volume. If it's empty, missing, or invalid, default to 0.
              const parsedVol = this.fastParseFloat(bytes, currentFieldStart, currentFieldLen);
              rawV = isNaN(parsedVol) ? 0 : parsedVol;
            } else {
              rawV = 0;
            }
          }
        }

        if (isDelimiter) {
          fieldIdx++;
          currentFieldStart = i + 1;
        }
      }

      if (isNewline) {
        if (isHeaderLine) {
          isHeaderLine = false;
        } else if (i > lineStart) {
          let dynamicValidationPassed = true;

          if (rawO <= 0 || rawH <= 0 || rawL <= 0 || rawC <= 0) {
            dynamicValidationPassed = false;
            priceBoundViolations++;
            totalAnomaliesMitigated++;
          }

          if (dynamicValidationPassed && currentIdx > 0) {
            const previousClose = dataFrame.close[currentIdx - 1];
            // Prevent division by zero on swing validation
            if (previousClose > 0) {
              const priceSwingRatio = Math.abs(rawC - previousClose) / previousClose;
              if (priceSwingRatio > 0.50) {
                dynamicValidationPassed = false;
                swingViolations++;
                totalAnomaliesMitigated++;
              }
            }
          }

          if (dynamicValidationPassed) {
            if (rawTs === lastValidTimestamp && currentIdx > 0) {
              dataFrame.setRow(currentIdx - 1, rawTs, rawO, rawH, rawL, rawC, rawV);
              duplicateTimestamps++;
              totalAnomaliesMitigated++;
            } else {
              if (lastValidTimestamp !== -1n && this.config.dateFormat.includes('MIN') && currentIdx > 0) {
                const stepDifference = rawTs - lastValidTimestamp;
                const expectedInterval = 60000n;

                if (stepDifference > expectedInterval && stepDifference < expectedInterval * 5n) {
                  let gapFillTime = lastValidTimestamp + expectedInterval;
                  const prevClose = dataFrame.close[currentIdx - 1];

                  while (gapFillTime < rawTs && currentIdx < totalRows) {
                    dataFrame.setRow(currentIdx, gapFillTime, prevClose, prevClose, prevClose, prevClose, 0);
                    currentIdx++;
                    gapFillTime += expectedInterval;
                    gapFilledBars++;
                    totalAnomaliesMitigated++;
                  }
                }
              }

              if (currentIdx < totalRows) {
                dataFrame.setRow(currentIdx, rawTs, rawO, rawH, rawL, rawC, rawV);
                lastValidTimestamp = rawTs;
                if (firstTimestamp === -1n) firstTimestamp = rawTs;
                lastTimestamp = rawTs;
                currentIdx++;
              }
            }
          }
        }

        fieldIdx = 0;
        currentFieldStart = i + 1;
        lineStart = i + 1;

        if (currentIdx % 25000 === 0 && currentIdx > 0) {
          onProgress(Math.min((i / len) * 100, 99.9));
        }
      }
    }

    if (currentIdx < totalRows && !isHeaderLine && currentFieldLen > 0 && rawO > 0) {
      dataFrame.setRow(currentIdx, rawTs, rawO, rawH, rawL, rawC, rawV);
      if (firstTimestamp === -1n) firstTimestamp = rawTs;
      lastTimestamp = rawTs;
      currentIdx++;
    }

    onProgress(100.0);

    (dataFrame as any).parseReport = {
      totalRows: totalRows,
      acceptedRows: currentIdx,
      anomaliesMitigated: totalAnomaliesMitigated,
      priceBoundViolations,
      swingViolations,
      duplicateTimestamps,
      gapFilledBars,
      firstTimestamp,
      lastTimestamp
    };

    console.log(`[Parser Ingestion Complete] Cleaned Rows: ${currentIdx}, Mitigated Anomalies: ${totalAnomaliesMitigated}`);
    return dataFrame;
  }

  // PHASE 4 FIX: Rewritten to safely handle currency symbols ($), commas (,), 
  // and other non-numeric characters without breaking decimal precision.
  private fastParseFloat(bytes: Uint8Array, start: number, length: number): number {
    if (length === 0) return 0;

    let result = 0;
    let isNegative = false;
    let isParsingDecimal = false;
    let decimalDigits = 0;

    for (let idx = 0; idx < length; idx++) {
      const charCode = bytes[start + idx];
      
      if (charCode === 45) { // '-'
        isNegative = true;
      } else if (charCode === 46) { // '.'
        isParsingDecimal = true;
      } else if (charCode >= 48 && charCode <= 57) { // '0'-'9'
        const digit = charCode - 48;
        if (isParsingDecimal) {
          decimalDigits++;
        }
        result = result * 10 + digit;
      }
      // Safely ignores '$', ',', ' ', etc.
    }

    if (decimalDigits > 0) {
      result /= Math.pow(10, decimalDigits);
    }

    return isNegative ? -result : result;
  }

  private parseTimestamp(fieldBytes: Uint8Array, decoder: TextDecoder): bigint {
    const rawString = decoder.decode(fieldBytes).trim();

    if (this.config.dateFormat === 'ISO8601') {
      return BigInt(Date.parse(rawString));
    }

    const numericVal = Number(rawString);
    if (!isNaN(numericVal)) {
      if (this.config.dateFormat === 'EPOCH_S') {
        return BigInt(numericVal) * 1000n;
      }
      if (this.config.dateFormat === 'EPOCH_MS') {
        return BigInt(numericVal);
      }
      if (this.config.dateFormat === 'EPOCH_US') {
        return BigInt(numericVal) / 1000n;
      }
    }

    return BigInt(Date.parse(rawString));
  }
}