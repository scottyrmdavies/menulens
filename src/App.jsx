import React, { useState, useEffect } from 'react';
import { Shield, Leaf, Dumbbell, Globe, Camera, CheckCircle, X, MapPin, Clock, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [currentStep, setCurrentStep] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [showTravelModal, setShowTravelModal] = useState(false);

  const onboardingSteps = [
    {
      icon: Shield,
      title: "Welcome to MenuLens",
      description: "Your personal dietary assistant for safer dining out",
      color: "text-blue-600"
    },
    {
      icon: Leaf,
      title: "Scan Any Menu",
      description: "Use your camera to scan restaurant menus instantly",
      color: "text-green-600"
    },
    {
      icon: Dumbbell,
      title: "Get Instant Results",
      description: "Receive detailed analysis of allergens and dietary restrictions",
      color: "text-purple-600"
    }
  ];

  const handleNext = () => {
    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setShowCamera(true);
    }
  };

  const handleScan = () => {
    setAnalyzing(true);
    setTimeout(() => {
      setResults({
        safeItems: [
          "Grilled Chicken Salad (no dressing)",
          "Steamed Vegetables",
          "Fresh Fruit Plate",
          "Herb-Crusted Salmon"
        ],
        riskyItems: [
          "Caesar Salad (contains dairy)",
          "Cream of Mushroom Soup",
          "Chocolate Mousse"
        ],
        allergens: ["Dairy", "Nuts", "Gluten"]
      });
      setAnalyzing(false);
    }, 3000);
  };

  const handleTravelMode = () => {
    setShowTravelModal(true);
  };

  if (showCamera) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-md mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-800">MenuLens</h1>
            <button
              onClick={handleTravelMode}
              className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors"
            >
              <Globe className="w-4 h-4" />
              Travel
            </button>
          </div>

          {/* Camera Interface */}
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <div className="aspect-square bg-gray-100 rounded-xl mb-4 flex items-center justify-center">
              {analyzing ? (
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Analyzing menu...</p>
                </div>
              ) : results ? (
                <div className="text-center text-green-600">
                  <CheckCircle className="w-16 h-16 mx-auto mb-2" />
                  <p className="font-semibold">Analysis Complete!</p>
                </div>
              ) : (
                <div className="text-center text-gray-400">
                  <Camera className="w-16 h-16 mx-auto mb-2" />
                  <p>Point camera at menu</p>
                </div>
              )}
            </div>

            {!results && !analyzing && (
              <button
                onClick={handleScan}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
              >
                Scan Menu
              </button>
            )}
          </div>

          {/* Results */}
          {results && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Safe Items */}
              <div className="bg-white rounded-xl p-4 shadow-lg">
                <h3 className="font-semibold text-green-700 mb-3 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Safe Options
                </h3>
                <div className="space-y-2">
                  {results.safeItems.map((item, index) => (
                    <div key={index} className="flex items-center gap-3 p-2 bg-green-50 rounded-lg">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-sm">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Risky Items */}
              <div className="bg-white rounded-xl p-4 shadow-lg">
                <h3 className="font-semibold text-red-700 mb-3 flex items-center gap-2">
                  <X className="w-5 h-5" />
                  Contains Allergens
                </h3>
                <div className="space-y-2">
                  {results.riskyItems.map((item, index) => (
                    <div key={index} className="flex items-center gap-3 p-2 bg-red-50 rounded-lg">
                      <X className="w-4 h-4 text-red-600" />
                      <span className="text-sm">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Allergens Detected */}
              <div className="bg-white rounded-xl p-4 shadow-lg">
                <h3 className="font-semibold text-orange-700 mb-3">Allergens Detected</h3>
                <div className="flex flex-wrap gap-2">
                  {results.allergens.map((allergen, index) => (
                    <span key={index} className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm">
                      {allergen}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Travel Modal */}
        <AnimatePresence>
          {showTravelModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
              onClick={() => setShowTravelModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-center mb-6">
                  <Globe className="w-12 h-12 text-orange-500 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-gray-800 mb-2">Travel Mode</h3>
                  <p className="text-gray-600">Get personalized dining recommendations for your destination</p>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                    <MapPin className="w-5 h-5 text-blue-600" />
                    <div>
                      <p className="font-medium text-gray-800">Local Cuisine</p>
                      <p className="text-sm text-gray-600">Authentic recommendations</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                    <Clock className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="font-medium text-gray-800">Opening Hours</p>
                      <p className="text-sm text-gray-600">Real-time availability</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                    <Users className="w-5 h-5 text-purple-600" />
                    <div>
                      <p className="font-medium text-gray-800">Group Friendly</p>
                      <p className="text-sm text-gray-600">Perfect for families</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowTravelModal(false)}
                    className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-xl font-semibold hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button className="flex-1 bg-orange-500 text-white py-3 rounded-xl font-semibold hover:bg-orange-600 transition-colors">
                    Enable Travel Mode
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
      <div className="max-w-sm w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3 }}
            className="bg-white rounded-2xl shadow-lg p-8 text-center"
          >
            <div className={`w-16 h-16 ${onboardingSteps[currentStep].color} mx-auto mb-6 flex items-center justify-center`}>
              {React.createElement(onboardingSteps[currentStep].icon, { className: "w-8 h-8" })}
            </div>

            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              {onboardingSteps[currentStep].title}
            </h2>

            <p className="text-gray-600 mb-8">
              {onboardingSteps[currentStep].description}
            </p>

            <div className="flex justify-center gap-2 mb-8">
              {onboardingSteps.map((_, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    index === currentStep ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>

            <button
              onClick={handleNext}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
            >
              {currentStep === onboardingSteps.length - 1 ? 'Get Started' : 'Next'}
            </button>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default App;