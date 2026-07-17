# QuantEngine Pro

**Institutional-grade, offline-first backtesting engine for serious traders.**

![License](https://img.shields.io/badge/license-Proprietary-C9A15A)
![Tests](https://img.shields.io/badge/tests-13%20passing-3FB88C)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-8B92A0)

---

## Overview

QuantEngine Pro is a zero-allocation, Web Worker-powered backtesting engine built for traders who need institutional-grade analytics without cloud dependencies. Every computation runs locally on your machine — your strategies, data, and edge never leave your computer.

Designed with a professional terminal-grade UI, it seamlessly handles everything from high-frequency crypto scalping to long-term futures swing trading.

## Key Features

### 🧠 Core Execution Engine
- **Multi-Asset Support**: Native handling for Stocks, Crypto, Forex, and Futures with asset-specific friction models.
- **Fractional Shares**: Trade 0.0166 BTC or micro-forex lots without rounding errors.
- **Contract Multipliers**: Accurate notional value and PnL scaling for Gold (100x), E-Mini S&P (50x), and other derivatives.
- **Asset-Specific Slippage**: ATR-based for stocks, percentage-based for crypto, and fixed-tick for Forex.
- **Native Short Selling**: Full bidirectional trading support (Long/Short) with accurate borrow/cover mechanics.

### 📊 Advanced Analytics
- **Performance Ledger**: Comprehensive metrics including Sharpe, Sortino, Profit Factor, Tharp Expectancy, and Ulcer Index.
- **Monte Carlo Simulation**: Generate confidence intervals and probability of ruin for your strategy's edge.
- **Walk-Forward Optimization (WFO)**: Genetic Algorithm-based parameter search that finds robust edges without freezing your browser.
- **Institutional Tear Sheet PDF**: One-click, branded, multi-page PDF reports ready for prop firm submissions or investor review.

### ⚡ High-Performance Data Pipeline
- **Zero-Copy Streaming Parser**: Processes multi-gigabyte CSV files directly into typed `ArrayBuffer` memory without loading the entire file into RAM.
- **Intelligent Anomaly Mitigation**: Auto-detects and repairs bad ticks, price spikes (>50% swings), and duplicate timestamps.
- **Float64 Precision**: Preserves micro-fractions (e.g., `0.00001234` BTC volume) without truncation.

### 🔒 Privacy & Security
- **100% Offline**: No telemetry, no cloud processing, no account required to run backtests.
- **Cryptographic Licensing**: Ed25519-signed license keys verified locally. Your activation status is never phoned home.
- **Data Sovereignty**: Your CSV data is parsed in-memory and never transmitted over the network.

---

## Getting Started

### 1. Installation
1. Purchase a license at [Your Marketplace Link]
2. Download the native installer for your operating system (Windows, macOS, or Linux)
3. Install and launch QuantEngine Pro

### 2. Activation
1. Upon first launch, you will be prompted for your License Key.
2. Paste the key provided in your purchase confirmation email/dashboard.
3. Click **Activate**. The cryptographic signature is verified instantly, offline.

### 3. Running Your First Backtest
1. Navigate to the **Data** panel and upload your historical OHLCV CSV file.
2. Select a **Strategy** template (e.g., SMA Crossover, RSI Oversold) or write your own DSL rules.
3. Configure your **Execution** parameters (Capital, Risk %, Commission, Slippage Model).
4. Click **Run Backtest** and analyze the results in the interactive dashboard.

---

## Supported Data Format

QuantEngine Pro accepts standard OHLCV CSV files. Column headers are flexibly mapped (e.g., `Date`, `timestamp`, `t`, `opentime` are all recognized).

```csv
timestamp,open,high,low,close,volume
2023-01-01T00:00:00Z,100.00,101.50,99.50,100.80,150000
2023-01-02T00:00:00Z,100.80,102.00,100.10,101.20,175000

## Supported Timestamp Formats:

ISO 8601 (2023-01-01T00:00:00Z)
Epoch Seconds (1672531200)
Epoch Milliseconds (1672531200000)
Epoch Microseconds

## System Requirements
OS: Windows 10/11, macOS 11+, or Linux (glibc 2.31+)
Memory: 4GB RAM minimum, 8GB+ recommended for large datasets or Monte Carlo simulations
Storage: 200MB for application, plus space for your local CSV data files
Support & Licensing
License Type: Perpetual (PRO) or Subscription (ENTERPRISE), cryptographically bound to your purchase email.
Key Recovery: Lost your key? Visit [Your Website]/retrieve and enter your purchase email to instantly recover your license.

Technical Support: For bugs, feature requests, or licensing questions, contact: quantenginepro@gmail.com
© 2026 QuantEngine Pro. All rights reserved.
Built for traders, by traders.