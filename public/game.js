let currentMovie = null;
let adminCode = '';
let testMode = false;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Charger le film
        const movieResponse = await fetch('https://mgctv2ve-backend.onrender.com/api/daily-movie');
        currentMovie = await movieResponse.json();
        
        const imageElement = document.getElementById('daily-movie-image');
        imageElement.src = currentMovie.screenshot;
        imageElement.alt = `Screenshot from movie`;

        // Charger le nombre de tentatives actuel
        const attemptResponse = await fetch('https://mgctv2ve-backend.onrender.com/api/attempt');
        const attemptData = await attemptResponse.json();
        displayAttemptCount(attemptData.attempts);

        const guessInput = document.getElementById('movie-guess');
        guessInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                validateGuess(this.value);
                this.value = '';
            }
        });

        // Ajouter la validation en temps réel pour l'adresse Solana
        const solanaInput = document.querySelector('input[name="solanaAddress"]');
        if (solanaInput) {
            solanaInput.addEventListener('input', function() {
                validateSolanaAddressInput(this);
            });
        }
    } catch (error) {
        console.error('Error loading game:', error);
    }
});

// Mode Admin et Test
document.getElementById('admin-toggle').addEventListener('click', () => {
    const code = prompt('Enter admin code:');
    if (code) {
        adminCode = code;
        alert('Admin code set');
    }
});

document.getElementById('test-toggle').addEventListener('click', () => {
    const code = prompt('Enter test mode code:');
    if (code === '070518') {
        testMode = !testMode;
        alert(testMode ? 'Test mode activated' : 'Test mode deactivated');
    }
});

async function validateGuess(guess) {
    try {
        const normalizedGuess = guess.trim().toLowerCase();
        const normalizedTitle = currentMovie.title.toLowerCase();

        const isCorrect = normalizedGuess === normalizedTitle;

        if (!isCorrect) {
            const response = await fetch('https://mgctv2ve-backend.onrender.com/api/attempt', {
                method: 'POST'
            });
            
            if (response.status === 429) {
                const data = await response.json();
                displayError(data.error || 'Too many attempts. Please wait before trying again.');
                return;
            }
            
            const data = await response.json();
            displayAttemptCount(data.attempts, data.remainingAttempts);
        } else {
            await fetch('https://mgctv2ve-backend.onrender.com/api/reset-attempts', {
                method: 'POST'
            });
            displayAttemptCount(0);
            
            const response = await fetch(`https://mgctv2ve-backend.onrender.com/api/check-participation?adminCode=${adminCode}&testMode=${testMode}`);
            const data = await response.json();

            if (data.hasParticipated && data.userInfo) {
                const scoreResponse = await fetch('https://mgctv2ve-backend.onrender.com/api/increment-score', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email: data.userInfo.email,
                        solanaAddress: data.userInfo.solanaAddress,
                        movieTitle: currentMovie.title
                    })
                });

                if (scoreResponse.ok) {
                    const scoreData = await scoreResponse.json();
                    console.log(`Score updated: ${scoreData.newScore} correct answers`);
                }
            }
        }

        showResult(isCorrect);
    } catch (error) {
        console.error('Error updating attempts:', error);
        displayError('An error occurred. Please try again later.');
    }
}

function isValidSolanaAddress(address) {
    if (typeof address !== 'string' || address.length !== 44) {
        return false;
    }
    
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    return base58Regex.test(address);
}

function validateSolanaAddressInput(inputElement) {
    const container = inputElement.parentElement;
    const value = inputElement.value.trim();
    
    if (value === '') {
        container.classList.remove('valid', 'invalid');
        return;
    }
    
    if (isValidSolanaAddress(value)) {
        container.classList.add('valid');
        container.classList.remove('invalid');
        removeValidationError(inputElement);
    } else {
        container.classList.add('invalid');
        container.classList.remove('valid');
    }
}

function showValidationError(inputElement, message) {
    removeValidationError(inputElement);

    const errorDiv = document.createElement('div');
    errorDiv.className = 'validation-error';
    errorDiv.textContent = message;
    inputElement.parentElement.appendChild(errorDiv);

    inputElement.classList.add('error');

    setTimeout(() => {
        inputElement.classList.remove('error');
    }, 3000);
}

function removeValidationError(inputElement) {
    const existingError = inputElement.parentElement.querySelector('.validation-error');
    if (existingError) {
        existingError.remove();
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
        const response = await fetch(`https://mgctv2ve-backend.onrender.com/api/check-participation?adminCode=${adminCode}&testMode=${testMode}`);
        const data = await response.json();

        if (data.hasParticipated && data.userInfo) {
            const participationMessage = document.createElement('div');
            participationMessage.className = 'participation-message';
            participationMessage.textContent = 'You have already submitted your information today. Come back tomorrow for a new challenge!';
            const resultElement = document.getElementById('guess-result');
            resultElement.parentNode.insertBefore(participationMessage, resultElement.nextSibling);

            const formContainer = document.querySelector('.user-form-container');
            formContainer.style.display = 'none';
        } else {
            const formContainer = document.querySelector('.user-form-container');
            formContainer.style.display = 'block';
        }
    } catch (error) {
        console.error('Error checking participation:', error);
    }
}

function displayAttemptCount(attempts, remainingAttempts) {
    let attemptsElement = document.getElementById('attempt-count');
    
    if (!attemptsElement) {
        attemptsElement = document.createElement('div');
        attemptsElement.id = 'attempt-count';
        const resultElement = document.getElementById('guess-result');
        if (resultElement) {
            resultElement.parentNode.insertBefore(attemptsElement, resultElement);
        } else {
            document.querySelector('.guess-container').appendChild(attemptsElement);
        }
    }
    
    let message = `Attempts: ${attempts}`;
    if (typeof remainingAttempts !== 'undefined') {
        message += ` (${remainingAttempts} remaining this minute)`;
    }
    attemptsElement.textContent = message;
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

document.getElementById('user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = {
        firstName: e.target.firstName.value.trim(),
        email: e.target.email.value.trim(),
        solanaAddress: e.target.solanaAddress.value.trim()
    };

    // Validation de l'adresse Solana
    if (!isValidSolanaAddress(formData.solanaAddress)) {
        showValidationError(
            e.target.solanaAddress, 
            'Please enter a valid Solana address (44 characters in base58 format)'
        );
        return;
    }

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
        } else {
            if (data.error === 'INVALID_SOLANA_ADDRESS') {
                showValidationError(e.target.solanaAddress, data.message);
            } else {
                formContainer.innerHTML = `<div class="error-message">${data.message}</div>`;
            }
        }
    } catch (error) {
        console.error('Error:', error);
        const formContainer = document.querySelector('.user-form-container');
        formContainer.innerHTML = '<div class="error-message">Error submitting information. Please try again later.</div>';
    }
});