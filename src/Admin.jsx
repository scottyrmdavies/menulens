import { useState } from 'react';

function Stat({ label, value }) {
  return (
    <div className="bg-white rounded-xl p-4 shadow">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function Admin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);

  const unlock = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const response = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setStats(null);
        setError(payload?.error || 'Could not open usage.');
        return;
      }
      setStats(payload);
    } catch {
      setError('Could not reach the server.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4">
      <div className="max-w-lg mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">MenuLens usage</h1>
        <form onSubmit={unlock} className="bg-white rounded-2xl p-4 shadow space-y-3">
          <label className="block text-sm font-medium text-gray-800" htmlFor="admin-password">
            Password
          </label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
            autoComplete="current-password"
          />
          <button type="submit" className="bg-blue-800 text-white px-4 py-2 rounded-lg">
            View usage
          </button>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </form>
        {stats?.configured && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Scans" value={stats.scans} />
              <Stat label="Unique users today" value={stats.uniqueUsersToday} />
              <Stat label="Average time" value={`${stats.averageDurationMs} ms`} />
              <Stat label="Errors" value={stats.errors} />
              <Stat label="Saved emails" value={stats.profiles} />
            </div>
            <div className="bg-white rounded-xl p-4 shadow">
              <h2 className="font-semibold mb-2">Scans by day</h2>
              <ul className="text-sm space-y-1">
                {(stats.scansByDay || []).map((row) => (
                  <li key={row.day} className="flex justify-between">
                    <span>{row.day}</span>
                    <span>{row.scans}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white rounded-xl p-4 shadow">
              <h2 className="font-semibold mb-2">Diet mix on scans</h2>
              <ul className="text-sm space-y-1">
                {(stats.dietMix || []).map((row) => (
                  <li key={row.diet} className="flex justify-between">
                    <span>{row.diet}</span>
                    <span>{row.scans}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white rounded-xl p-4 shadow">
              <h2 className="font-semibold mb-2">Emails grouped by diet</h2>
              <ul className="text-sm space-y-1">
                {(stats.profilesByDiet || []).map((row) => (
                  <li key={row.diet} className="flex justify-between">
                    <span>{row.diet}</span>
                    <span>{row.profiles}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Admin;
