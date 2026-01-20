import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Leaf, Dumbbell, Globe, Loader2 } from 'lucide-react';

function App() {
  const [currentScreen, setCurrentScreen] = useState('onboarding');
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [goal, setGoal] = useState('');
  const [filters, setFilters] = useState({
    Peanuts: false,
    Gluten: false,
    Dairy: false,
    Shellfish: false,
    Vegan: false,
    Keto: false,
  });
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [cameraStream, setCameraStream] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [showTravelModal, setShowTravelModal] = useState(false);
  const videoRef = useRef(null);

  // Camera setup
  useEffect(() => {
    if (currentScreen === 'camera' && !cameraStream) {
      navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      })
        .then(stream => {
          setCameraStream(stream);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(err => console.error('Camera access denied:', err));
    }

    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [currentScreen]);

  const handleGoalSelect = (selectedGoal) => {
    setGoal(selectedGoal);
    setOnboardingStep(2);
  };

  const handleFilterToggle = (filter) => {
    setFilters(prev => ({ ...prev, [filter]: !prev[filter] }));
  };

  const handleEmailSubmit = () => {
    if (!email.includes('@')) {
      setEmailError('Please enter a valid email address');
      return;
    }
    console.log('Email saved:', email);
    setCurrentScreen('camera');
  };

  const handleScan = () => {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
    }, 3000);
  };

  const activeFilters = Object.keys(filters).filter(key => filters[key]);

  const onboardingVariants = {
    enter: { x: 300, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: -300, opacity: 0 },
  };

  const goalOptions = [
    { 
      label: 'Severe Allergy Safety', 
      icon: Shield, 
      description: 'Critical allergen detection',
      value: 'Severe Allergy Safety'
    },
    { 
      label: 'Lifestyle Diet', 
      icon: Leaf, 
      description: 'Vegan, keto, or other preferences',
      value: 'Lifestyle Diet'
    },
    { 
      label: 'Fitness/Macros', 
      icon: Dumbbell, 
      description: 'Calorie and macro tracking',
      value: 'Fitness/Macros'
    },
  ];

  // ============================================
  // ONBOARDING SCREEN
  // ============================================
  if (currentScreen === 'onboarding') {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <AnimatePresence mode="wait">
          {/* Step 1: Goal Selection */}
          {onboardingStep === 1 && (
            <motion.div
              key="step1"
              variants={onboardingVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="flex-1 flex flex-col justify-center px-6 py-12"
            >
              <h1 className="text-4xl font-bold text-gray-900 mb-2 text-center">
                What is your main goal?
              </h1>
              <p className="text-gray-600 text-center mb-8">
                We'll customize MenuLens for your needs
              </p>

              <div className="space-y-4">
                {goalOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <motion.button
                      key={option.value}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleGoalSelect(option.value)}
                      className="w-full bg-white border-2 border-gray-200 rounded-2xl p-6 flex items-center space-x-4 hover:border-emerald-500 hover:shadow-lg transition-all"
                    >
                      <div className="flex-shrink-0 bg-emerald-100 p-4 rounded-full">
                        <Icon className="w-6 h-6 text-emerald-600" />
                      </div>
                      <div className="text-left flex-1">
                        <div className="font-semibold text-gray-900">
                          {option.label}
                        </div>
                        <div className="text-sm text-gray-600">
                          {option.description}
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Step 2: Filter Selection */}
          {onboardingStep === 2 && (
            <motion.div
              key="step2"
              variants={onboardingVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="flex-1 flex flex-col justify-center px-6 py-12"
            >
              <h1 className="text-4xl font-bold text-gray-900 mb-2 text-center">
                Select your filters
              </h1>
              <p className="text-gray-600 text-center mb-8">
                Check all that apply to you
              </p>

              <div className="space-y-3 mb-8">
                {Object.keys(filters).map((filter, idx) => (
                  <motion.div
                    key={filter}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border-2 border-gray-200 hover:border-emerald-200"
                  >
                    <span className="font-medium text-gray-900">{filter}</span>
                    <button
                      onClick={() => handleFilterToggle(filter)}
                      className={`relative w-14 h-8 rounded-full transition-colors ${
                        filters[filter] 
                          ? 'bg-emerald-500' 
                          : 'bg-gray-300'
                      }`}
                    >
                      <motion.div
                        animate={{
                          x: filters[filter] ? 28 : 4,
                        }}
                        className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-md"
                      />
                    </button>
                  </motion.div>
                ))}
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setOnboardingStep(3)}
                className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-semibold hover:bg-emerald-700 transition-colors"
              >
                Continue
              </motion.button>
            </motion.div>
          )}

          {/* Step 3: Email Capture */}
          {onboardingStep === 3 && (
            <motion.div
              key="step3"
              variants={onboardingVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="flex-1 flex flex-col justify-center px-6 py-12"
            >
              <h1 className="text-4xl font-bold text-gray-900 mb-2 text-center">
                Save your profile
              </h1>
              <p className="text-gray-600 text-center mb-8">
                Get personalized menu recommendations
              </p>

              <div className="space-y-4 mb-8">
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailError('');
                  }}
                  className="w-full px-6 py-4 border-2 border-gray-200 rounded-2xl focus:border-emerald-500 focus:outline-none bg-gray-50 transition-colors"
                />
                {emailError && (
                  <p className="text-red-500 text-sm font-medium">{emailError}</p>
                )}
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleEmailSubmit}
                className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-semibold hover:bg-emerald-700 transition-colors"
              >
                Save Profile & Continue
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ============================================
  // CAMERA SCREEN
  // ============================================
  if (currentScreen === 'camera') {
    return (
      <div className="relative min-h-screen bg-black overflow-hidden">
        {/* Video Feed */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Top Bar */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/60 to-transparent p-4 z-20">
          <div className="flex justify-between items-center">
            <div>
              {activeFilters.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="inline-block bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-semibold"
                >
                  {activeFilters.join(', ')} Mode Active
                </motion.div>
              )}
            </div>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowTravelModal(true)}
              className="text-white p-3 bg-white/20 backdrop-blur-sm rounded-full hover:bg-white/30 transition-all"
            >
              <Globe className="w-6 h-6" />
            </motion.button>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 z-20">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleScan}
            disabled={scanning}
            className="w-full bg-emerald-600 text-white py-5 rounded-2xl font-bold text-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
          >
            {scanning ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Scanning...</span>
              </>
            ) : (
              'Scan Menu'
            )}
          </motion.button>
        </div>

        {/* Scanning Overlay */}
        {scanning && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 flex items-center justify-center z-30"
          >
            <div className="text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="w-20 h-20 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4"
              />
              <p className="text-white text-lg font-semibold">Analyzing menu...</p>
            </div>
          </motion.div>
        )}

        {/* Results Overlay */}
        {!scanning && activeFilters.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center space-y-6 z-10"
          >
            {/* Blocked Item 1 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-red-500/95 text-white px-6 py-3 rounded-xl shadow-xl"
            >
              <div className="line-through text-lg font-semibold">Cheeseburger</div>
              <div className="text-sm opacity-90">Contains Dairy</div>
            </motion.div>

            {/* Blocked Item 2 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className="bg-red-500/95 text-white px-6 py-3 rounded-xl shadow-xl"
            >
              <div className="line-through text-lg font-semibold">Peanut Satay</div>
              <div className="text-sm opacity-90">Contains Nuts</div>
            </motion.div>

            {/* Safe Item */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="bg-emerald-500/95 text-white px-6 py-3 rounded-xl shadow-xl border-2 border-emerald-300"
            >
              <div className="text-lg font-semibold">✓ Grilled Salmon</div>
              <div className="text-sm opacity-90">Safe to eat</div>
            </motion.div>
          </motion.div>
        )}

        {/* Travel Mode Modal */}
        <AnimatePresence>
          {showTravelModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTravelModal(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-50"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl"
              >
                <h2 className="text-3xl font-bold text-gray-900 mb-2">
                  MenuLens Traveler
                </h2>
                <p className="text-gray-600 mb-8">
                  Translate and filter foreign menus instantly. Perfect for Japan, Italy, and France.
                </p>

                <div className="space-y-4 mb-8 bg-gray-50 p-6 rounded-2xl">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-gray-700">Per Trip</span>
                    <span className="text-2xl font-bold text-emerald-600">$4.99</span>
                  </div>
                  <div className="h-px bg-gray-200" />
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-gray-700">Annual</span>
                    <span className="text-2xl font-bold text-emerald-600">$29.99</span>
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-emerald-700 transition-colors mb-3"
                >
                  Unlock Travel Mode
                </motion.button>

                <button
                  onClick={() => setShowTravelModal(false)}
                  className="w-full text-gray-500 py-3 font-medium hover:text-gray-700 transition-colors"
                >
                  Maybe Later
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return null;
}

export default App;