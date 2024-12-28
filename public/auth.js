document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const loginModal = document.getElementById('loginModal');
    const registerModal = document.getElementById('registerModal');
    const closeBtns = document.getElementsByClassName('close');

    // Gestion des modales
    loginBtn.onclick = () => loginModal.style.display = 'block';
    registerBtn.onclick = () => registerModal.style.display = 'block';

    // Fermeture des modales
    Array.from(closeBtns).forEach(btn => {
        btn.onclick = function() {
            loginModal.style.display = 'none';
            registerModal.style.display = 'none';
        }
    });

    window.onclick = function(event) {
        if (event.target == loginModal) loginModal.style.display = 'none';
        if (event.target == registerModal) registerModal.style.display = 'none';
    }

    // Gestion du formulaire de connexion
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            email: e.target.email.value,
            password: e.target.password.value
        };

        try {
            const response = await fetch('https://mgctv2ve-backend.onrender.com/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('userId', data.userId);
                loginModal.style.display = 'none';
                updateAuthUI(true);
                // Recharger les données utilisateur si nécessaire
            } else {
                alert(data.message || 'Login failed');
            }
        } catch (error) {
            console.error('Login error:', error);
            alert('Error during login');
        }
    });

    // Gestion du formulaire d'inscription
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (e.target.password.value !== e.target.confirmPassword.value) {
            alert("Passwords don't match!");
            return;
        }

        const formData = {
            username: e.target.username.value,
            email: e.target.email.value,
            password: e.target.password.value,
            solanaAddress: e.target.solanaAddress.value
        };

        try {
            const response = await fetch('https://mgctv2ve-backend.onrender.com/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok) {
                alert('Registration successful! Please verify your email.');
                registerModal.style.display = 'none';
                e.target.reset();
            } else {
                alert(data.message || 'Registration failed');
            }
        } catch (error) {
            console.error('Registration error:', error);
            alert('Error during registration');
        }
    });
});

// Fonction pour mettre à jour l'interface utilisateur après connexion/déconnexion
function updateAuthUI(isLoggedIn) {
    const authContainer = document.querySelector('.auth-container');
    if (isLoggedIn) {
        authContainer.innerHTML = `
            <button id="profileBtn" class="auth-btn">Profile</button>
            <button id="logoutBtn" class="auth-btn">Logout</button>
        `;
        document.getElementById('logoutBtn').onclick = logout;
    } else {
        authContainer.innerHTML = `
            <button id="loginBtn" class="auth-btn">Login</button>
            <button id="registerBtn" class="auth-btn">Register</button>
        `;
    }
}

// Fonction de déconnexion
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    updateAuthUI(false);
}

// Vérifier si l'utilisateur est déjà connecté au chargement
if (localStorage.getItem('token')) {
    updateAuthUI(true);
}
