import React, { useState } from 'react';
import { PersonalizationApiConfig } from '../lib/domain/types';

export function FuFireTestConsole({ personalization }: { personalization: PersonalizationApiConfig }) {
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthTime, setBirthTime] = useState('');
  const [birthTimeKnown, setBirthTimeKnown] = useState(true);
  const [birthPlaceRaw, setBirthPlaceRaw] = useState('');
  const [manualLat, setManualLat] = useState('');
  const [manualLon, setManualLon] = useState('');
  const [manualTz, setManualTz] = useState('');
  const [language, setLanguage] = useState('EN');

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    setLoading(true);
    setResults(null);
    setError(null);

    const testTime = birthTimeKnown ? birthTime : '12:00:00';
    const warnings = !birthTimeKnown ? ['BIRTH_TIME_UNKNOWN_DEFAULT_NOON'] : [];

    if (!manualLat || !manualLon || !manualTz) {
      // In this iteration, we don't have a geocoder configured.
      setError('NO_GEOCODER_CONFIGURED');
      setLoading(false);
      return;
    }

    try {
      const payload = {
        name,
        birthDate,
        birthTime: birthTimeKnown ? birthTime : '12:00:00',
        birthTimeKnown,
        birthPlaceRaw,
        manualLat: parseFloat(manualLat) || undefined,
        manualLon: parseFloat(manualLon) || undefined,
        manualTimezone: manualTz,
        language,
        requestedOperations: ['chronometry', 'bazi', 'baziTrace', 'wuxing']
      };

      const res = await fetch('/api/data-requests/fufire/test-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      
      if (!res.ok || data.gatewayIssues?.length > 0) {
        // Find if there is a blocking API-level error inside the response
        const majorIssue = data.gatewayIssues?.find((i: any) => i.severity === 'major');
        if (majorIssue) {
           throw new Error(majorIssue.errorCode || majorIssue.message || 'API Error');
        }
        if (!res.ok) {
           throw new Error(data.message || data.error_code || 'API Error');
        }
      }

      setResults({
        requests: data.requests,
        responses: data.responses,
        warnings: data.warnings,
        gatewayIssues: data.gatewayIssues
      });

    } catch (err: any) {
      setError(err.message || 'UNKNOWN_ERROR');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-b1 border border-nt p-6 rounded-sm space-y-5 text-da mt-6">
      <div className="border-b border-nt pb-3">
        <h3 className="text-xs font-bold uppercase tracking-widest font-mono text-da">Manual Test Console</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans text-da">
        <div>
          <label className="block text-[10px] font-bold text-nt font-mono uppercase tracking-wider">Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full border border-nt rounded-sm p-2 font-mono mt-1" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-nt font-mono uppercase tracking-wider">Language</label>
          <input type="text" value={language} onChange={e => setLanguage(e.target.value)} className="w-full border border-nt rounded-sm p-2 font-mono mt-1" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-nt font-mono uppercase tracking-wider">Birth Date (YYYY-MM-DD)</label>
          <input type="text" value={birthDate} onChange={e => setBirthDate(e.target.value)} className="w-full border border-nt rounded-sm p-2 font-mono mt-1" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-nt font-mono uppercase tracking-wider">Birth Time (HH:mm)</label>
          <div className="flex gap-2 items-center mt-1">
            <input type="text" disabled={!birthTimeKnown} placeholder={!birthTimeKnown ? '12:00' : ''} value={birthTime} onChange={e => setBirthTime(e.target.value)} className="flex-1 border border-nt rounded-sm p-2 font-mono" />
            <label className="flex items-center gap-1 text-[10px] uppercase font-mono">
              <input type="checkbox" checked={birthTimeKnown} onChange={e => setBirthTimeKnown(e.target.checked)} />
              Known
            </label>
          </div>
        </div>
        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold text-nt font-mono uppercase tracking-wider">Birth Place Raw</label>
          <input type="text" value={birthPlaceRaw} onChange={e => setBirthPlaceRaw(e.target.value)} className="w-full border border-nt rounded-sm p-2 font-mono mt-1" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-nt font-mono uppercase tracking-wider">Manual Lat</label>
          <input type="text" value={manualLat} onChange={e => setManualLat(e.target.value)} className="w-full border border-nt rounded-sm p-2 font-mono mt-1" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-nt font-mono uppercase tracking-wider">Manual Lon</label>
          <input type="text" value={manualLon} onChange={e => setManualLon(e.target.value)} className="w-full border border-nt rounded-sm p-2 font-mono mt-1" />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-nt font-mono uppercase tracking-wider">Manual Timezone</label>
          <input type="text" value={manualTz} onChange={e => setManualTz(e.target.value)} className="w-full border border-nt rounded-sm p-2 font-mono mt-1" placeholder="e.g. Europe/Berlin" />
        </div>
      </div>

      <div className="flex justify-end pt-3">
        <button onClick={handleTest} disabled={loading} className="bg-b2 hover:opacity-90 text-da font-bold font-mono p-2 px-6 rounded-sm text-xs uppercase tracking-wider border border-da disabled:opacity-50">
          {loading ? 'Running...' : 'Execute Manual Test'}
        </button>
      </div>

      {error && (
        <div className="p-4 border border-ac bg-b1 text-ac text-xs font-mono rounded-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {results && (
        <div className="space-y-4">
          {results.warnings?.length > 0 && (
            <div className="p-3 border border-nt bg-b2 text-da text-[10px] font-mono rounded-sm">
              <strong className="text-nt">Warnings:</strong>
              <ul className="list-disc pl-4 mt-1">
                {results.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
          
          {results.gatewayIssues?.length > 0 && (
            <div className="p-3 border border-red-500 bg-red-900/20 text-da text-[10px] font-mono rounded-sm">
              <strong className="text-red-400">Gateway Issues:</strong>
              <ul className="list-disc pl-4 mt-1">
                {results.gatewayIssues.map((w: any, i: number) => (
                  <li key={i} className="text-red-300">
                    [{w.errorCode}] {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {results.requests?.map((req: any, index: number) => {
            const res = results.responses.find((r: any) => r.operation === req.operation);
            return (
              <div key={index} className="p-4 border border-nt bg-b1 rounded-sm text-[10px] font-mono">
                <h4 className="font-bold text-nt uppercase mb-2 border-b border-nt pb-1">{req.operation}</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="font-bold mb-1">Request</p>
                    <pre className="bg-[#3C3C3C] text-[#EDE3DA] p-2 rounded overflow-x-auto whitespace-pre-wrap">{JSON.stringify(req.body, null, 2)}</pre>
                  </div>
                  <div>
                    <p className="font-bold mb-1">Response / Error</p>
                    <pre className="bg-[#3C3C3C] text-[#EDE3DA] p-2 rounded overflow-x-auto whitespace-pre-wrap">{JSON.stringify(res?.data || res?.error, null, 2)}</pre>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
