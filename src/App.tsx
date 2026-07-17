import React from 'react';
import { BacktestProvider } from './context/BacktestContext';
import { Dashboard } from './Dashboard';
import { LicenseGate } from './components/LicenseGate';
import './index.css';

const App: React.FC = () => {
  return (
    <BacktestProvider>
      <LicenseGate>
        <div className="h-screen w-screen overflow-hidden bg-[#0A0B0D] text-[#E7E9ED] flex flex-col font-['Inter',sans-serif]">
          <Dashboard />
        </div>
      </LicenseGate>
    </BacktestProvider>
  );
};

export default App;