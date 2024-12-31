let currentMovie = null;
let adminCode = '';
let testMode = false;

async function checkMovieStatus() {
    if (!window.walletManager?.publicKey) {
        return;
    }

    try {
        const response = await fetch(`https://mgctv2ve-backend.onrender.com/api/check-movie-solved?solanaAddress=${window.walletManager.publicKey}`);
        const data = await response.json();

        if (data.isSolved) {
            const guessInput = document.getElementById('movie-guess');
            guessInput.style.display = 'none';

            const titleDisplay = document.createElement('div');
            titleDisplay.className = 'movie-title';
            titleDisplay.textContent = data.movieTitle;
            guessInput.parentNode.insertBefore(titleDisplay, guessInput);
        }
    } catch (error) {
        console.error('Error checking movie status:', error);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Enregistrement du Service Worker
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('./sw.js');
            console.log('Service Worker registered successfully:', registration);
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }

    try {
        // Charger le film
        const movieResponse = await fetch('https://mgctv2ve-backend.onrender.com/api/daily-movie');
        currentMovie = await movieResponse.json();
        
        const imageElement = document.getElementById('daily-movie-image');
        imageElement.src = currentMovie.screenshot;
        imageElement.alt = `Screenshot from movie`;

        await checkMovieStatus();

        // Initialiser le compte à rebours
        const countdownContainer = document.getElementById('countdown-container');
        if (countdownContainer) {
            updateCountdown();
            setInterval(updateCountdown, 1000);
        }

        // Configurer l'input de réponse
        const guessInput = document.getElementById('movie-guess');
        guessInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                validateGuess(this.value);
                this.value = '';
            }
        });
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

    countdownContainer.innerHTML = `
        <div class="countdown-title">Next movie in</div>
        <div class="countdown-simple">
            ${String(hours).padStart(2, '0')} : ${String(minutes).padStart(2, '0')} : ${String(seconds).padStart(2, '0')}
        </div>
    `;
}

// Mode Admin et Test
document.getElementById('admin-toggle')?.addEventListener('click', () => {
    const code = prompt('Enter admin code:');
    if (code) {
        adminCode = code;
        alert('Admin code set');
    }
});

document.getElementById('test-toggle')?.addEventListener('click', () => {
    const code = prompt('Enter test mode code:');
    if (code === '070518') {
        testMode = !testMode;
        alert(testMode ? 'Test mode activated' : 'Test mode deactivated');
    }
});

async function validateGuess(guess) {
    if (!guess.trim()) return;
    
    try {
        const normalizedGuess = guess.trim().toLowerCase();
        const normalizedTitle = currentMovie.title.toLowerCase();
        const isCorrect = normalizedGuess === normalizedTitle;

        if (isCorrect) {
            // Vérifier d'abord si le wallet est connecté
            if (!window.walletManager?.publicKey) {
                showResult(isCorrect);
                return;
            }

            try {
                const scoreResponse = await fetch('https://mgctv2ve-backend.onrender.com/api/increment-score', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        solanaAddress: window.walletManager.publicKey,
                        movieTitle: currentMovie.title
                    })
                });

                if (scoreResponse.ok) {
                    const scoreData = await scoreResponse.json();
                    console.log(`Score updated: ${scoreData.newScore} correct answers`);
                    console.log(`Solved movies: ${scoreData.solvedMovies.join(', ')}`);
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
        document.querySelector('.guess-container').appendChild(resultElement);
    }

    resultElement.textContent = isCorrect ? 'Correct!' : 'Try again!';
    resultElement.className = isCorrect ? 'result-correct' : 'result-incorrect';

    if (isCorrect) {
        const inputField = document.querySelector('.guess-input');
        inputField.style.display = 'none';

        const titleDisplay = document.createElement('div');
        titleDisplay.className = 'movie-title';
        titleDisplay.textContent = currentMovie.title;
        inputField.parentNode.insertBefore(titleDisplay, inputField);

        handleCorrectGuess();
    }
}

async function handleCorrectGuess() {
    try {
        // Vérifier si le wallet est connecté
        if (!window.walletManager?.publicKey) {
            const message = document.createElement('div');
            message.className = 'wallet-message';
            message.textContent = 'Please connect your wallet to participate!';
            const resultElement = document.getElementById('guess-result');
            resultElement.parentNode.insertBefore(message, resultElement.nextSibling);
            return;
        }

        const response = await fetch(`https://mgctv2ve-backend.onrender.com/api/check-participation?adminCode=${adminCode}&testMode=${testMode}`);
        const data = await response.json();

        if (data.hasParticipated) {
            const participationMessage = document.createElement('div');
            participationMessage.className = 'participation-message';
            participationMessage.textContent = 'You have already submitted your information today. Come back tomorrow for a new challenge!';
            const resultElement = document.getElementById('guess-result');
            resultElement.parentNode.insertBefore(participationMessage, resultElement.nextSibling);

            const formContainer = document.querySelector('.user-form-container');
            formContainer.style.display = 'none';
        } else {
            // Afficher uniquement le champ email
            const formContainer = document.querySelector('.user-form-container');
            formContainer.style.display = 'block';
            formContainer.innerHTML = `
                <form id="user-form" class="user-form">
                    <input type="email" name="email" placeholder="Your email" required class="form-input">
                    <p class="wallet-info">Connected wallet: ${window.walletManager.publicKey.slice(0, 4)}...${window.walletManager.publicKey.slice(-4)}</p>
                    <button type="submit" class="form-submit">Submit</button>
                </form>
            `;

            // Mettre à jour le gestionnaire d'événements du formulaire
            document.getElementById('user-form').addEventListener('submit', handleFormSubmit);
        }
    } catch (error) {
        console.error('Error checking participation:', error);
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    // Vérifier si le wallet est connecté
    if (!window.walletManager?.publicKey) {
        console.error('No wallet connected');
        return;
    }
    
    const formData = {
        email: e.target.email.value.trim(),
        solanaAddress: window.walletManager.publicKey // Utilisez directement la publicKey du wallet
    };

    try {
        const headers = {
            'Content-Type': 'application/json'
        };

        if (adminCode) {
            headers['admin-code'] = adminCode;
        }
        if (testMode) {
            headers['test-mode'] = 'true';
        }

        const response = await fetch('https://mgctv2ve-backend.onrender.com/api/submit-user', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(formData)
        });

        const data = await response.json();
        const formContainer = document.querySelector('.user-form-container');
        
        if (response.ok) {
            formContainer.innerHTML = `<div class="success-message">
                ${data.requiresVerification 
                    ? data.message 
                    : 'Information submitted successfully! Thank you for participating.'}
            </div>`;
            console.log('Success:', data);
        } else {
            formContainer.innerHTML = `<div class="error-message">${data.message || 'An error occurred'}</div>`;
            console.error('Error data:', data);
        }
    } catch (error) {
        console.error('Error:', error);
        const formContainer = document.querySelector('.user-form-container');
        formContainer.innerHTML = '<div class="error-message">Error submitting information. Please try again later.</div>';
    }
}

function displayError(message) {
    let errorElement = document.getElementById('error-message');
    
    if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.id = 'error-message';
        errorElement.className = 'error-message';
        document.querySelector('.guess-container').appendChild(errorElement);
    }
    
    errorElement.textContent = message;
    
    setTimeout(() => {
        errorElement.textContent = '';
    }, 3000);
}