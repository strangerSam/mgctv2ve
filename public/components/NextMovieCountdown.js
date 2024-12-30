import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

const NextMovieCountdown = () => {
  const [timeLeft, setTimeLeft] = useState({
    hours: 0,
    minutes: 0,
    seconds: 0
  });
  const [nextUpdateTime, setNextUpdateTime] = useState('');

  useEffect(() => {
    // Fonction pour récupérer les informations de temps depuis l'API
    const fetchTimeInfo = async () => {
      try {
        const response = await fetch('https://mgctv2ve-backend.onrender.com/api/daily-movie');
        const data = await response.json();
        
        if (data.timeInfo) {
          setNextUpdateTime(data.timeInfo.nextChange);
          updateCountdown(new Date(data.timeInfo.nextChange));
        }
      } catch (error) {
        console.error('Error fetching time info:', error);
      }
    };

    // Fonction pour mettre à jour le compte à rebours
    const updateCountdown = (nextUpdate) => {
      const now = new Date();
      const timeDiff = nextUpdate - now;

      if (timeDiff > 0) {
        const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);

        setTimeLeft({ hours, minutes, seconds });
      } else {
        // Si le temps est écoulé, actualiser les informations
        fetchTimeInfo();
      }
    };

    // Initialiser le compte à rebours
    fetchTimeInfo();

    // Mettre à jour le compte à rebours chaque seconde
    const timer = setInterval(() => {
      if (nextUpdateTime) {
        updateCountdown(new Date(nextUpdateTime));
      }
    }, 1000);

    // Nettoyer le timer lors du démontage du composant
    return () => clearInterval(timer);
  }, [nextUpdateTime]);

  return (
    <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-lg p-4 shadow-lg">
      <div className="flex items-center justify-center gap-2 mb-2">
        <Clock className="w-5 h-5 text-blue-400" />
        <h3 className="text-lg font-semibold text-white">Prochain film dans :</h3>
      </div>
      
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-gray-800/50 rounded p-2">
          <div className="text-2xl font-bold text-blue-400">
            {String(timeLeft.hours).padStart(2, '0')}
          </div>
          <div className="text-xs text-gray-400">Heures</div>
        </div>
        
        <div className="bg-gray-800/50 rounded p-2">
          <div className="text-2xl font-bold text-blue-400">
            {String(timeLeft.minutes).padStart(2, '0')}
          </div>
          <div className="text-xs text-gray-400">Minutes</div>
        </div>
        
        <div className="bg-gray-800/50 rounded p-2">
          <div className="text-2xl font-bold text-blue-400">
            {String(timeLeft.seconds).padStart(2, '0')}
          </div>
          <div className="text-xs text-gray-400">Secondes</div>
        </div>
      </div>
      
      <div className="text-center mt-2 text-sm text-gray-400">
        Prochain film à minuit
      </div>
    </div>
  );
};

export default NextMovieCountdown;