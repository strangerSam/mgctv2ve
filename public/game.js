let currentMovie = null;
let adminCode = '';
let testMode = false;

// Fonction utilitaire pour les appels API sécurisés
async function secureApiCall(url, options = {}) {
    const token = sessionStorage.getItem('user_token');
    const defaultHeaders = {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
    };

    if (token) {
        defaultHeaders['Authorization'] = `Bearer ${token}`;
    }

    const secureOptions = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers
        },
        credentials: 'same-origin'
    };

    try {
        const response = await fetch(url, secureOptions);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response;
    } catch (error) {
        console.error('API call error:', error);
        throw error;
    }
}

async function checkMovieStatus() {
    const walletConnected = window.walletManager?.publicKey;
    
    if (!walletConnected) {
        return;
    }

    try {
        const sanitizedPublicKey = DOMPurify.sanitize(window.walletManager.publicKey);
        const response = await secureApiCall(
            `https://mgctv2ve-backend.onrender.com/api/check-movie-solved?solanaAddress=${encodeURIComponent(sanitizedPublicKey)}`
        );
        const data = await response.json();

        if (data.isSolved) {
            const guessInput = document.getElementById('movie-guess');
            if (!guessInput) return;

            guessInput.style.display = 'none';
            guessInput.disabled = true;

            if (!document.querySelector('.movie-title')) {
                const titleDisplay = document.createElement('div');
                titleDisplay.className = 'movie-title';
                titleDisplay.textContent = DOMPurify.sanitize(data.movieTitle);
                guessInput.parentNode.insertBefore(titleDisplay, guessInput);
                
                let resultElement = document.getElementById('guess-result');
                if (!resultElement) {
                    resultElement = document.createElement('div');
                    resultElement.id = 'guess-result';
                    document.querySelector('.guess-container').appendChild(resultElement);
                }
                resultElement.textContent = "You've already solved this movie!";
                resultElement.className = 'result-correct';
            }
        }
    } catch (error) {
        console.error('Error checking movie status:', error);
        displayError('Failed to check movie status');
    }
}

function updateGuessInputState() {
    const guessInput = document.getElementById('movie-guess');
    const guessContainer = document.querySelector('.guess-container');

    if (!guessInput || !guessContainer) return;

    const isWalletConnected = window.walletManager?.publicKey;

    const existingWarning = document.querySelector('.wallet-warning');
    if (existingWarning) {
        existingWarning.remove();
    }

    if (!isWalletConnected) {
        guessInput.disabled = true;
        guessInput.style.backgroundColor = '#f5f5f5';
        guessInput.style.cursor = 'not-allowed';
        
        const warningMessage = document.createElement('div');
        warningMessage.className = 'wallet-warning';
        
        const icon = document.createElement('i');
        icon.className = 'fas fa-exclamation-circle';
        
        const textNode = document.createTextNode(' Connect your Solana wallet to participate');
        
        warningMessage.appendChild(icon);
        warningMessage.appendChild(textNode);
        
        guessContainer.insertBefore(warningMessage, guessContainer.firstChild);
    } else {
        guessInput.disabled = false;
        guessInput.style.backgroundColor = 'white';
        guessInput.style.cursor = 'text';
        
        checkMovieStatus();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('./sw.js');
            console.log('Service Worker registered successfully:', registration);
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }

    try {
        const movieResponse = await secureApiCall('https://mgctv2ve-backend.onrender.com/api/daily-movie');
        currentMovie = await movieResponse.json();
        
        const imageElement = document.getElementById('daily-movie-image');
        if (imageElement) {
            imageElement.src = DOMPurify.sanitize(currentMovie.screenshot);
            imageElement.alt = 'Movie Screenshot';
        }

        updateGuessInputState();

        const guessInput = document.getElementById('movie-guess');
        if (guessInput) {
            guessInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    const sanitizedValue = DOMPurify.sanitize(this.value);
                    validateGuess(sanitizedValue);
                    this.value = '';
                }
            });
        }

        const countdownContainer = document.getElementById('countdown-container');
        if (countdownContainer) {
            updateCountdown();
            setInterval(updateCountdown, 1000);
        }

        window.removeEventListener('wallet-connected', updateGuessInputState);
        window.removeEventListener('wallet-disconnected', updateGuessInputState);

        window.addEventListener('wallet-connected', updateGuessInputState);
        window.addEventListener('wallet-disconnected', updateGuessInputState);
        
    } catch (error) {
        console.error('Error loading game:', error);
        displayError('Error loading game. Please try again later.');
    }
});

function updateCountdown() {
    const countdownContainer = document.getElementById('countdown-container');
    if (!countdownContainer) return;

    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const timeLeft = midnight - now;

    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

    const countdownHTML = document.createElement('div');
    countdownHTML.className = 'countdown-title';
    countdownHTML.textContent = 'Next movie in';

    const timeHTML = document.createElement('div');
    timeHTML.className = 'countdown-simple';
    timeHTML.textContent = `${String(hours).padStart(2, '0')} : ${String(minutes).padStart(2, '0')} : ${String(seconds).padStart(2, '0')}`;

    countdownContainer.innerHTML = '';
    countdownContainer.appendChild(countdownHTML);
    countdownContainer.appendChild(timeHTML);
}

// Sécurisation des contrôles admin
const adminToggle = document.getElementById('admin-toggle');
const testToggle = document.getElementById('test-toggle');

if (adminToggle) {
    adminToggle.addEventListener('click', () => {
        const code = prompt('Enter admin code:');
        if (code) {
            adminCode = DOMPurify.sanitize(code);
            alert('Admin code set');
        }
    });
}

if (testToggle) {
    testToggle.addEventListener('click', () => {
        const code = prompt('Enter test mode code:');
        if (code === '070518') {
            testMode = !testMode;
            alert(testMode ? 'Test mode activated' : 'Test mode deactivated');
        }
    });
}

async function validateGuess(guess) {
    if (!guess || !guess.trim()) return;

    if (!window.walletManager?.publicKey) {
        displayError('Please connect your wallet first to make a guess.');
        return;
    }
    
    try {
        const normalizedGuess = DOMPurify.sanitize(guess.trim().toLowerCase());
        const normalizedTitle = currentMovie.title.toLowerCase();
        const isCorrect = normalizedGuess === normalizedTitle;

        if (isCorrect) {
            try {
                const sanitizedPublicKey = DOMPurify.sanitize(window.walletManager.publicKey);
                const sanitizedTitle = DOMPurify.sanitize(currentMovie.title);
                
                const scoreResponse = await secureApiCall('https://mgctv2ve-backend.onrender.com/api/increment-score', {
                    method: 'POST',
                    body: JSON.stringify({
                        solanaAddress: sanitizedPublicKey,
                        movieTitle: sanitizedTitle
                    })
                });

                if (scoreResponse.ok) {
                    const scoreData = await scoreResponse.json();
                    console.log('Score updated successfully');
                }
            } catch (error) {
                console.error('Error updating score:', error);
            }
        }

        showResult(isCorrect);
    } catch (error) {
        console.error('Error:', error);
        displayError('An error occurred. Please try again later.');
    }
}

function showResult(isCorrect) {
    let resultElement = document.getElementById('guess-result');
    
    if (!resultElement) {
        resultElement = document.createElement('div');
        resultElement.id = 'guess-result';
        document.querySelector('.guess-container')?.appendChild(resultElement);
    }

    resultElement.textContent = isCorrect ? 'Correct!' : 'Try again!';
    resultElement.className = isCorrect ? 'result-correct' : 'result-incorrect';

    if (isCorrect) {
        const inputField = document.querySelector('.guess-input');
        if (inputField) {
            inputField.style.display = 'none';

            const titleDisplay = document.createElement('div');
            titleDisplay.className = 'movie-title';
            titleDisplay.textContent = DOMPurify.sanitize(currentMovie.title);
            inputField.parentNode?.insertBefore(titleDisplay, inputField);

            handleCorrectGuess();
        }
    }
}

async function handleCorrectGuess() {
    try {
        if (!window.walletManager?.publicKey) {
            const message = document.createElement('div');
            message.className = 'wallet-message';
            message.textContent = 'Please connect your wallet to participate!';
            const resultElement = document.getElementById('guess-result');
            resultElement?.parentNode?.insertBefore(message, resultElement.nextSibling);
            return;
        }

        const response = await secureApiCall(
            `https://mgctv2ve-backend.onrender.com/api/check-participation?adminCode=${encodeURIComponent(DOMPurify.sanitize(adminCode))}&testMode=${testMode}`
        );
        const data = await response.json();

        const formContainer = document.querySelector('.user-form-container');
        if (!formContainer) return;

        if (data.hasParticipated) {
            const participationMessage = document.createElement('div');
            participationMessage.className = 'participation-message';
            participationMessage.textContent = 'You have already submitted your information today. Come back tomorrow for a new challenge!';
            const resultElement = document.getElementById('guess-result');
            resultElement?.parentNode?.insertBefore(participationMessage, resultElement.nextSibling);

            formContainer.style.display = 'none';
        } else {
            formContainer.style.display = 'block';
            
            const formHTML = document.createElement('form');
            formHTML.id = 'user-form';
            formHTML.className = 'user-form';
            
            const emailInput = document.createElement('input');
            emailInput.type = 'email';
            emailInput.name = 'email';
            emailInput.placeholder = 'Your email';
            emailInput.required = true;
            emailInput.className = 'form-input';
            
            const walletInfo = document.createElement('p');
            walletInfo.className = 'wallet-info';
            const walletAddress = window.walletManager.publicKey;
            walletInfo.textContent = `Connected wallet: ${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
            
            const submitButton = document.createElement('button');
            submitButton.type = 'submit';
            submitButton.className = 'form-submit';
            submitButton.textContent = 'Submit';
            
            formHTML.appendChild(emailInput);
            formHTML.appendChild(walletInfo);
            formHTML.appendChild(submitButton);
            
            formContainer.innerHTML = '';
            formContainer.appendChild(formHTML);

            document.getElementById('user-form')?.addEventListener('submit', handleFormSubmit);
        }
    } catch (error) {
        console.error('Error checking participation:', error);
        displayError('Error checking participation status');
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    if (!window.walletManager?.publicKey) {
        console.error('No wallet connected');
        return;
    }
    
    const formData = {
        email: DOMPurify.sanitize(e.target.email.value.trim()),
        solanaAddress: DOMPurify.sanitize(window.walletManager.publicKey)
    };

    try {
        const headers = {
            'Content-Type': 'application/json'
        };

        if (adminCode) {
            headers['admin-code'] = DOMPurify.sanitize(adminCode);
        }
        if (testMode) {
            headers['test-mode'] = 'true';
        }

        const response = await secureApiCall('https://mgctv2ve-backend.onrender.com/api/submit-user', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(formData)
        });

        const data = await response.json();
        const formContainer = document.querySelector('.user-form-container');
        
        if (!formContainer) return;

        if (response.ok) {
            const successDiv = document.createElement('div');
            successDiv.className = 'success-message';
            successDiv.textContent = data.requiresVerification 
                ? DOMPurify.sanitize(data.message)
                : 'Information submitted successfully! Thank you for participating.';
            formContainer.innerHTML = '';
            formContainer.appendChild(successDiv);
        } else {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.textContent = DOMPurify.sanitize(data.message || 'An error occurred');
            formContainer.innerHTML = '';
            formContainer.appendChild(errorDiv);
        }
    } catch (error) {
        console.error('Error:', error);
        const formContainer = document.querySelector('.user-form-container');
        if (formContainer) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.textContent = 'Error submitting information. Please try again later.';
            formContainer.innerHTML = '';
            formContainer.appendChild(errorDiv);
        }
    }
}

function displayError(message) {
    let errorElement = document.getElementById('error-message');
    
    if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.id = 'error-message';
        errorElement.className = 'error-message';
        document.querySelector('.guess-container')?.appendChild(errorElement);
    }
    
    errorElement.textContent = DOMPurify.sanitize(message);
    
    setTimeout(() => {
        if (errorElement.parentNode) {
            errorElement.textContent = '';
        }
    }, 3000);
}

// Protection contre les attaques XSS sur l'historique de navigation
window.addEventListener('popstate', (event) => {
    if (event.state && typeof event.state === 'string') {
        event.state = DOMPurify.sanitize(event.state);
    }
});

// Protection contre la manipulation des données locales
const originalSetItem = Storage.prototype.setItem;
Storage.prototype.setItem = function(key, value) {
    if (typeof value === 'string') {
        arguments[1] = DOMPurify.sanitize(value);
    }
    originalSetItem.apply(this, arguments);
};

// Observateur pour détecter les modifications malveillantes du DOM
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) { // Element node
                    const scripts = node.getElementsByTagName('script');
                    Array.from(scripts).forEach(script => {
                        script.remove(); // Supprime les scripts injectés
                    });
                }
            });
        }
    });
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});