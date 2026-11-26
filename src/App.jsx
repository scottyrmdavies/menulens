import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle, X } from 'lucide-react';
import Admin from './Admin.jsx';
import { compressedJpegBase64, fileToBitmap } from './photo.js';
import { readScanResponse } from './scanClient.js';
import { DIET_CHIPS, preferencesFromProfile } from '../shared/profile.js';
import { offersFor } from '../shared/crossSell.js';
import { INSTALL_SNIPPET } from '../shared/install.js';
import { LOCALE_LABELS, normalizeLocale, t } from '../shared/i18n.js';

function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem('menulens-profile') || '');
    if (saved && Array.isArray(saved.diets)) {
      return {
        diets: saved.diets.filter((id) => typeof id === 'string'),
        other: typeof saved.other === 'string' ? saved.other : '',
        email: typeof saved.email === 'string' ? saved.email : '',
      };
    }
  } catch {
    // A bad saved profile just starts onboarding again.
  }
  return { diets: [], other: '', email: '' };
}

function userId() {
  const key = 'menulens-user';
  let current = localStorage.getItem(key);
  if (!current) {
    current = crypto.randomUUID();
    localStorage.setItem(key, current);
  }
  return current;
}

function LanguageSelect({ language, onChange }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-800">
      <span>{t(language, 'language')}</span>
      <select
        value={language}
        onChange={(event) => onChange(normalizeLocale(event.target.value))}
        className="bg-white border border-gray-300 rounded-lg px-2 py-1"
      >
        {Object.entries(LOCALE_LABELS).map(([code, label]) => (
          <option key={code} value={code}>{label}</option>
        ))}
      </select>
    </label>
  );
}

function Disclaimer({ language }) {
  return <p className="text-sm text-gray-800 bg-amber-50 border border-amber-200 rounded-lg p-3">{t(language, 'disclaimer')}</p>;
}

function OfferList({ diets, language }) {
  const offers = offersFor(diets, language);
  if (offers.length === 0) return null;
  return (
    <div className="space-y-3">
      {offers.map((offer) => (
        <div key={offer.id} className="bg-white rounded-xl p-4 shadow text-sm text-gray-800">
          <p>{offer.body}</p>
          {offer.href && (
            <a className="inline-block mt-2 text-blue-800 underline" href={offer.href} target="_blank" rel="noreferrer">
              {offer.href.replace('https://', '')}
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function InstallPanel({ language }) {
  const [copied, setCopied] = useState(false);
  const [installEvent, setInstallEvent] = useState(null);

  useEffect(() => {
    const onPrompt = (event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_SNIPPET);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="bg-white rounded-xl p-4 shadow text-sm text-gray-800 space-y-2">
      <h2 className="font-semibold">{t(language, 'installTitle')}</h2>
      <p>{t(language, 'installSnippet')}</p>
      <div className="flex gap-2">
        <button type="button" onClick={copy} className="bg-gray-200 text-gray-900 px-3 py-2 rounded-lg">
          {copied ? t(language, 'copied') : t(language, 'copy')}
        </button>
        {installEvent && (
          <button
            type="button"
            onClick={async () => {
              await installEvent.prompt();
              setInstallEvent(null);
            }}
            className="bg-blue-800 text-white px-3 py-2 rounded-lg"
          >
            {t(language, 'installButton')}
          </button>
        )}
      </div>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="h-10 rounded-lg bg-gray-200 animate-pulse" />
      ))}
    </div>
  );
}

function ResultList({ title, items, empty, tone }) {
  const toneClass = tone === 'safe' ? 'text-green-700' : 'text-red-700';
  const rowClass = tone === 'safe' ? 'bg-green-50' : 'bg-red-50';
  return (
    <div className="bg-white rounded-xl p-4 shadow">
      <h3 className={`font-semibold mb-3 ${toneClass}`}>{title}</h3>
      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-gray-600">{empty}</p>}
        {items.map((item, index) => (
          <div key={`${item}-${index}`} className={`p-2 rounded-lg text-sm ${rowClass}`}>{item}</div>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [language, setLanguage] = useState(() => normalizeLocale(localStorage.getItem('menulens-language') || navigator.language));
  const [profile, setProfile] = useState(loadProfile);
  const [step, setStep] = useState(() => (loadProfile().diets.length > 0 ? 'scan' : 'welcome'));
  const [consent, setConsent] = useState(false);
  const [emailNote, setEmailNote] = useState('');
  const [id] = useState(userId);
  const [access, setAccess] = useState({ allowed: true, mode: 'free' });
  const [billingNote, setBillingNote] = useState('');
  const [phase, setPhase] = useState('idle');
  const [results, setResults] = useState(null);
  const [scanError, setScanError] = useState('');
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraFailed, setCameraFailed] = useState(false);
  const videoRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('menulens-language', language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem('menulens-profile', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: id }),
    })
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled && payload && typeof payload.allowed === 'boolean') setAccess(payload);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (step !== 'scan' || !navigator.mediaDevices?.getUserMedia) return undefined;
    let active = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        setCameraStream(stream);
        setCameraFailed(false);
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {
        if (active) setCameraFailed(true);
      });
    return () => {
      active = false;
      setCameraStream((current) => {
        current?.getTracks().forEach((track) => track.stop());
        return null;
      });
    };
  }, [step]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && cameraStream && video.srcObject !== cameraStream) {
      video.srcObject = cameraStream;
    }
  }, [cameraStream, phase, results]);

  if (window.location.pathname === '/admin') return <Admin />;

  const cameraUnsupported = step === 'scan' && !navigator.mediaDevices?.getUserMedia;
  const showCameraError = cameraFailed || cameraUnsupported;

  const toggleDiet = (chipId) => {
    setProfile((current) => ({
      ...current,
      diets: current.diets.includes(chipId)
        ? current.diets.filter((id) => id !== chipId)
        : [...current.diets, chipId],
    }));
  };

  const runScan = async (source) => {
    if (access.allowed === false) return;
    setScanError('');
    setResults(null);
    setPhase('preparing');
    let imageBase64;
    try {
      imageBase64 = await compressedJpegBase64(source);
    } catch (error) {
      setPhase('idle');
      setScanError(error.message || t(language, 'scanFailed'));
      return;
    }
    setPhase('reading');
    setResults({ safeItems: [], riskyItems: [], allergens: [], partial: true });
    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          mimeType: 'image/jpeg',
          userId: id,
          preferences: preferencesFromProfile(profile, language),
        }),
      });
      const outcome = await readScanResponse(response, (event) => {
        if (event.type === 'dish' || event.type === 'done') {
          setResults({
            safeItems: event.safeItems || [],
            riskyItems: event.riskyItems || [],
            allergens: event.allergens || [],
            durationMs: event.durationMs,
            partial: event.type !== 'done',
          });
        }
        if (event.type === 'error') setScanError(event.error || t(language, 'scanFailed'));
      });
      if (!outcome.ok) {
        const message = typeof outcome.payload?.error === 'string' ? outcome.payload.error : '';
        if (outcome.status === 402) setAccess({ allowed: false, mode: 'expired' });
        setResults(null);
        setScanError(message || (outcome.status === 413 ? t(language, 'tooLarge') : t(language, 'scanFailed')));
        setPhase('idle');
        return;
      }
      if (outcome.payload?.type === 'error') {
        setResults(null);
        setScanError(outcome.payload.error || t(language, 'scanFailed'));
        setPhase('idle');
        return;
      }
      setPhase('done');
    } catch {
      setResults(null);
      setScanError(t(language, 'network'));
      setPhase('idle');
    }
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth) {
      setScanError(t(language, 'tryAgain'));
      return;
    }
    await runScan(video);
  };

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const bitmap = await fileToBitmap(file);
      await runScan(bitmap);
    } catch (error) {
      setScanError(error.message || t(language, 'scanFailed'));
    }
  };

  const saveEmail = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email.trim())) {
      setEmailNote(t(language, 'emailInvalid'));
      return;
    }
    if (!consent) {
      setEmailNote(t(language, 'consentRequired'));
      return;
    }
    setEmailNote('');
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: id,
          email: profile.email.trim(),
          diets: profile.diets,
          other: profile.other,
          consent: true,
        }),
      });
      const payload = await response.json().catch(() => null);
      setEmailNote(payload?.saved ? t(language, 'emailSaved') : t(language, 'emailNotStored'));
    } catch {
      setEmailNote(t(language, 'emailNotStored'));
    }
    setStep('scan');
  };

  const subscribe = async () => {
    setBillingNote('');
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id }),
      });
      const payload = await response.json().catch(() => null);
      if (payload?.url) {
        window.location.href = payload.url;
        return;
      }
      setBillingNote(payload?.configured === false ? t(language, 'billingOff') : (payload?.error || t(language, 'billingOff')));
    } catch {
      setBillingNote(t(language, 'billingOff'));
    }
  };

  const manage = async () => {
    setBillingNote('');
    try {
      const response = await fetch('/api/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id }),
      });
      const payload = await response.json().catch(() => null);
      if (payload?.url) {
        window.location.href = payload.url;
        return;
      }
      setBillingNote(payload?.configured === false ? t(language, 'billingOff') : (payload?.error || t(language, 'billingOff')));
    } catch {
      setBillingNote(t(language, 'billingOff'));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-indigo-200 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">MenuLens</h1>
          <LanguageSelect language={language} onChange={setLanguage} />
        </div>

        {step === 'welcome' && (
          <div className="bg-white rounded-2xl shadow p-6 space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">{t(language, 'welcomeTitle')}</h2>
            <p className="text-gray-700">{t(language, 'welcomeBody')}</p>
            <Disclaimer language={language} />
            <InstallPanel language={language} />
            <button type="button" onClick={() => setStep('diets')} className="w-full bg-blue-800 text-white py-3 rounded-xl font-semibold">
              {t(language, 'continue')}
            </button>
          </div>
        )}

        {step === 'diets' && (
          <div className="bg-white rounded-2xl shadow p-6 space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">{t(language, 'dietTitle')}</h2>
            <p className="text-sm text-gray-700">{t(language, 'dietHint')}</p>
            <div className="flex flex-wrap gap-2">
              {DIET_CHIPS.map((chip) => {
                const on = profile.diets.includes(chip.id);
                return (
                  <button
                    key={chip.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDiet(chip.id)}
                    className={`px-3 py-2 rounded-full border text-sm ${on ? 'bg-blue-800 text-white border-blue-800' : 'bg-gray-50 text-gray-900 border-gray-300'}`}
                  >
                    {t(language, `chip.${chip.id}`)}
                  </button>
                );
              })}
            </div>
            {profile.diets.includes('other') && (
              <input
                value={profile.other}
                onChange={(event) => setProfile((current) => ({ ...current, other: event.target.value }))}
                placeholder={t(language, 'otherPlaceholder')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            )}
            <Disclaimer language={language} />
            <button type="button" onClick={() => setStep('email')} className="w-full bg-blue-800 text-white py-3 rounded-xl font-semibold">
              {t(language, 'continue')}
            </button>
          </div>
        )}

        {step === 'email' && (
          <div className="bg-white rounded-2xl shadow p-6 space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">{t(language, 'emailTitle')}</h2>
            <p className="text-sm text-gray-700">{t(language, 'emailBody')}</p>
            <input
              type="email"
              value={profile.email}
              onChange={(event) => setProfile((current) => ({ ...current, email: event.target.value }))}
              placeholder={t(language, 'emailPlaceholder')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
            <label className="flex gap-2 text-sm text-gray-800">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span>{t(language, 'consent')}</span>
            </label>
            {emailNote && <p className="text-sm text-gray-700">{emailNote}</p>}
            <button type="button" onClick={saveEmail} className="w-full bg-blue-800 text-white py-3 rounded-xl font-semibold">
              {t(language, 'save')}
            </button>
            <button type="button" onClick={() => setStep('scan')} className="w-full bg-gray-200 text-gray-900 py-3 rounded-xl font-semibold">
              {t(language, 'skip')}
            </button>
          </div>
        )}

        {step === 'scan' && (
          <>
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setStep('diets')} className="text-gray-700">
                ← {t(language, 'back')}
              </button>
            </div>
            <Disclaimer language={language} />
            {emailNote && <p className="text-sm text-gray-800 bg-white rounded-xl p-4 shadow">{emailNote}</p>}
            <div className="bg-white rounded-xl p-4 shadow text-sm text-gray-800 space-y-2">
              <p>{t(language, 'trial')}</p>
              {access.mode === 'expired' && <p className="text-red-700">{t(language, 'trialEnded')}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={subscribe} className="bg-blue-800 text-white px-3 py-2 rounded-lg">
                  {t(language, 'subscribe')}
                </button>
                <button type="button" onClick={manage} className="bg-gray-200 text-gray-900 px-3 py-2 rounded-lg">
                  {t(language, 'manage')}
                </button>
              </div>
              {billingNote && <p>{billingNote}</p>}
            </div>
            <OfferList diets={profile.diets} language={language} />
            {phase !== 'done' && <div className="bg-white rounded-2xl shadow p-4 space-y-3">
              <div className="aspect-square bg-gray-100 rounded-xl overflow-hidden relative">
                <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${phase === 'idle' && !showCameraError ? '' : 'hidden'}`} />
                {(phase === 'preparing' || phase === 'reading') && (
                  <div className="absolute inset-0 bg-white p-4">
                    <p className="text-sm text-gray-800 mb-3">{phase === 'preparing' ? t(language, 'preparing') : t(language, 'reading')}</p>
                    {(phase === 'preparing' || !results || (results.safeItems.length === 0 && results.riskyItems.length === 0)) && <SkeletonRows />}
                  </div>
                )}
                {showCameraError && phase === 'idle' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                    <X className="w-10 h-10 text-red-600 mb-2" />
                    <p className="text-sm text-red-700">{t(language, 'cameraDenied')}</p>
                  </div>
                )}
                {!cameraStream && !showCameraError && phase === 'idle' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
                    <Camera className="w-10 h-10 mb-2" />
                    <p className="text-sm">{t(language, 'startCamera')}</p>
                  </div>
                )}
              </div>
              {scanError && <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{scanError}</p>}
              {phase === 'idle' && access.allowed !== false && (
                <div className="space-y-2">
                  {cameraStream && (
                    <button type="button" onClick={capturePhoto} className="w-full bg-blue-800 text-white py-3 rounded-xl font-semibold">
                      {t(language, 'capture')}
                    </button>
                  )}
                  <button type="button" onClick={() => fileRef.current?.click()} className="w-full bg-gray-200 text-gray-900 py-3 rounded-xl font-semibold">
                    {t(language, 'choosePhoto')}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
                </div>
              )}
            </div>}
            {results && (results.safeItems.length > 0 || results.riskyItems.length > 0 || phase === 'done') && (
              <div className="space-y-3">
                {results.partial && <p className="text-sm text-gray-700">{t(language, 'stillReading')}</p>}
                {Number.isFinite(results.durationMs) && (
                  <p className="text-sm text-gray-700">{t(language, 'readIn')} {(results.durationMs / 1000).toFixed(1)}s</p>
                )}
                <p className="text-sm text-gray-700">{t(language, 'estimate')}</p>
                <ResultList title={t(language, 'safe')} items={results.safeItems} empty={t(language, 'noSafe')} tone="safe" />
                <ResultList title={t(language, 'risky')} items={results.riskyItems} empty={t(language, 'noRisky')} tone="risky" />
                <div className="bg-white rounded-xl p-4 shadow">
                  <h3 className="font-semibold text-orange-700 mb-2">{t(language, 'allergens')}</h3>
                  {results.allergens.length === 0 && <p className="text-sm text-gray-600">{t(language, 'noAllergens')}</p>}
                  <div className="flex flex-wrap gap-2">
                    {results.allergens.map((allergen) => (
                      <span key={allergen} className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm">{allergen}</span>
                    ))}
                  </div>
                </div>
                <Disclaimer language={language} />
                {phase === 'done' && (
                  <button
                    type="button"
                    onClick={() => {
                      setResults(null);
                      setScanError('');
                      setPhase('idle');
                    }}
                    className="w-full bg-blue-800 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {t(language, 'scanAnother')}
                  </button>
                )}
              </div>
            )}
            <InstallPanel language={language} />
          </>
        )}
      </div>
    </div>
  );
}

export default App;
