let currentMovie = null;
let adminCode = '';
let testMode = false;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Charger le film
        const movieResponse = await fetch('https://www.moviegoers-cats.com/api/daily-movie');
        currentMovie = await movieResponse.json();
        
        const imageElement = document.getElementById('daily-movie-image');
        imageElement.src = currentMovie.screenshot;
        imageElement.alt = `Screenshot from movie`;

        // Charger le nombre de tentatives actuel
        const attemptResponse = await fetch('https://www.moviegoers-cats.com/api/attempt');
        const attemptData = await attemptResponse.json();
        displayAttemptCount(attemptData.attempts);

        const guessInput = document.getElementById('movie-guess');
        guessInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                validateGuess(this.value);
                this.value = '';
            }
        });
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
            // Incrémenter le compteur seulement si la réponse est fausse
            const response = await fetch('https://www.moviegoers-cats.com/api/attempt', {
                method: 'POST'
            });
            const data = await response.json();
            displayAttemptCount(data.attempts);
        } else {
            // Réinitialiser le compteur si la réponse est correcte
            await fetch('https://www.moviegoers-cats.com/api/reset-attempts', {
                method: 'POST'
            });
            displayAttemptCount(0);
        }

        showResult(isCorrect);
    } catch (error) {
        console.error('Error updating attempts:', error);
    }
}

async function showResult(isCorrect) {
    let resultElement = document.getElementById('guess-result');
    
    if (!resultElement) {
        resultElement = document.createElement('div');
        resultElement.id = 'guess-result';
        document.querySelector('.guess-container').appendChild(resultElement);
    }

    resultElement.textContent = isCorrect ? 'Correct!' : 'Try again!';
    resultElement.className = isCorrect ? 'result-correct' : 'result-incorrect';

    if (isCorrect) {
        // Cacher le champ de saisie
        const inputField = document.querySelector('.guess-input');
        inputField.style.display = 'none';

        // Créer et afficher le titre du film
        const titleDisplay = document.createElement('div');
        titleDisplay.className = 'movie-title';
        titleDisplay.textContent = currentMovie.title;
        inputField.parentNode.insertBefore(titleDisplay, inputField);

        try {
            const response = await fetch(`https://www.moviegoers-cats.com/api/check-participation?adminCode=${adminCode}&testMode=${testMode}`);
            const data = await response.json();

            if (data.hasParticipated && data.userInfo) {
                // Incrémenter le score
                const scoreResponse = await fetch('https://www.moviegoers-cats.com/api/increment-score', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email: data.userInfo.email,
                        solanaAddress: data.userInfo.solanaAddress
                    })
                });

                if (scoreResponse.ok) {
                    const scoreData = await scoreResponse.json();
                    console.log(`Score updated: ${scoreData.newScore} correct answers`);
                }

                // Création du message de participation juste après "Correct!"
                const participationMessage = document.createElement('div');
                participationMessage.className = 'participation-message';
                participationMessage.textContent = 'You have already submitted your information today. Come back tomorrow for a new challenge!';
                resultElement.parentNode.insertBefore(participationMessage, resultElement.nextSibling);

                // Cacher le conteneur du formulaire
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
}

function displayAttemptCount(attempts) {
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
    
    attemptsElement.textContent = `Attempts: ${attempts}`;
}

document.getElementById('user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = {
        firstName: e.target.firstName.value,
        email: e.target.email.value,
        solanaAddress: e.target.solanaAddress.value
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

        const response = await fetch('https://www.moviegoers-cats.com/api/submit-user', {
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
            formContainer.innerHTML = `<div class="error-message">${data.message}</div>`;
        }
    } catch (error) {
        console.error('Error:', error);
        const formContainer = document.querySelector('.user-form-container');
        formContainer.innerHTML = '<div class="error-message">Error submitting information. Please try again later.</div>';
    }
});