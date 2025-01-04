class SolanaWalletManager {
    constructor() {
        this.provider = null;
        this.publicKey = null;
        this.disconnectTimer = null;
        this.token = null;
        this.DISCONNECT_TIMEOUT = 10 * 60 * 1000; // 10 minutes
        this.MAX_RECONNECT_ATTEMPTS = 3;
        this.reconnectAttempts = 0;
        this.init();
    }

    async init() {
        try {
            if (typeof window.solana === 'undefined') {
                console.log('Phantom wallet not found');
                this.addPhantomInstallButton();
                return;
            }

            this.provider = window.solana;
            console.log('Phantom wallet found');
            
            await this.checkExistingSession();
            this.setupSecurityListeners();
            this.addWalletButton();
            this.setupActivityListeners();

        } catch (error) {
            console.error('Initialization error:', error);
            this.handleError('Failed to initialize wallet manager');
        }
    }

    async checkExistingSession() {
        try {
            const token = sessionStorage.getItem('user_token');
            if (!token) return;

            // Vérifier la validité du token
            const response = await fetch('https://mgctv2ve-backend.onrender.com/api/verify-token', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                this.clearSession();
                return;
            }

            this.token = token;
            const isPhantomConnected = this.provider.isConnected && this.provider.publicKey;
            const autoConnectAllowed = sessionStorage.getItem('wallet-autoconnect') === 'true';

            if (isPhantomConnected && autoConnectAllowed) {
                this.publicKey = this.provider.publicKey.toString();
                this.updateWalletButton();
                this.startDisconnectTimer();
                window.dispatchEvent(new Event('wallet-connected'));
            } else if (autoConnectAllowed) {
                try {
                    const resp = await this.provider.connect({ onlyIfTrusted: true });
                    this.publicKey = resp.publicKey.toString();
                    this.updateWalletButton();
                    this.startDisconnectTimer();
                    window.dispatchEvent(new Event('wallet-connected'));
                } catch (error) {
                    console.log('Auto-connection failed, user needs to connect manually');
                    sessionStorage.removeItem('wallet-autoconnect');
                }
            }
        } catch (error) {
            console.error('Session check error:', error);
            this.clearSession();
        }
    }

    setupSecurityListeners() {
        // Écouter les changements de réseau
        window.addEventListener('offline', () => this.handleNetworkChange(false));
        window.addEventListener('online', () => this.handleNetworkChange(true));

        // Écouter les changements de focus de la fenêtre
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseWalletSession();
            } else {
                this.resumeWalletSession();
            }
        });

        // Protection contre la manipulation du DOM
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    this.validateDOMIntegrity();
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    validateDOMIntegrity() {
        const walletButton = document.querySelector('.wallet-button');
        if (walletButton && this.publicKey) {
            const displayedAddress = walletButton.textContent.trim();
            const expectedDisplay = `Connected: ${this.publicKey.slice(0, 4)}...${this.publicKey.slice(-4)}`;
            
            if (displayedAddress !== expectedDisplay) {
                console.warn('DOM manipulation detected');
                this.updateWalletButton(); // Restaurer l'affichage correct
            }
        }
    }

    async handleNetworkChange(isOnline) {
        if (!isOnline) {
            this.pauseWalletSession();
            return;
        }

        if (this.publicKey) {
            try {
                await this.validateConnection();
            } catch (error) {
                console.error('Connection validation failed:', error);
                this.disconnectWallet();
            }
        }
    }

    async validateConnection() {
        if (!this.token || !this.publicKey) return false;

        try {
            const response = await fetch('https://mgctv2ve-backend.onrender.com/api/verify-token', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Invalid session');
            }

            return true;
        } catch (error) {
            console.error('Validation error:', error);
            return false;
        }
    }

    pauseWalletSession() {
        if (this.disconnectTimer) {
            clearTimeout(this.disconnectTimer);
        }
    }

    async resumeWalletSession() {
        if (this.publicKey) {
            const isValid = await this.validateConnection();
            if (isValid) {
                this.startDisconnectTimer();
            } else {
                await this.disconnectWallet();
            }
        }
    }

    setupActivityListeners() {
        const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
        
        events.forEach(event => {
            document.addEventListener(event, () => {
                if (this.publicKey) {
                    this.resetDisconnectTimer();
                }
            });
        });
    }

    startDisconnectTimer() {
        if (this.disconnectTimer) {
            clearTimeout(this.disconnectTimer);
        }
        
        this.disconnectTimer = setTimeout(() => {
            if (this.publicKey) {
                console.log('Auto-disconnecting due to inactivity');
                this.disconnectWallet();
            }
        }, this.DISCONNECT_TIMEOUT);
    }

    resetDisconnectTimer() {
        if (this.disconnectTimer) {
            clearTimeout(this.disconnectTimer);
            this.startDisconnectTimer();
        }
    }

    async connectWallet() {
        try {
            if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
                throw new Error('Too many connection attempts. Please try again later.');
            }

            const connectResponse = await fetch('https://mgctv2ve-backend.onrender.com/api/wallet-connect', {
                method: 'POST'
            });

            if (!connectResponse.ok) {
                throw new Error('Connection request denied by server');
            }

            const resp = await this.provider.connect();
            this.publicKey = resp.publicKey.toString();

            // Obtenir un nouveau token JWT
            const authResponse = await fetch('https://mgctv2ve-backend.onrender.com/api/auth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    solanaAddress: this.publicKey
                })
            });

            if (!authResponse.ok) {
                throw new Error('Authentication failed');
            }

            const { token } = await authResponse.json();
            this.token = token;
            sessionStorage.setItem('user_token', token);
            sessionStorage.setItem('wallet-autoconnect', 'true');
            
            this.updateWalletButton();
            this.startDisconnectTimer();
            this.reconnectAttempts = 0;
            
            window.dispatchEvent(new Event('wallet-connected'));
            await checkMovieStatus();
            
            return true;
        } catch (err) {
            console.error('Error connecting to wallet:', err);
            this.reconnectAttempts++;
            this.handleError(err.message);
            return false;
        }
    }

    async disconnectWallet() {
        try {
            if (this.provider) {
                await this.provider.disconnect();
            }
            this.clearSession();
            this.updateWalletButton();
            window.dispatchEvent(new Event('wallet-disconnected'));
        } catch (err) {
            console.error('Error disconnecting wallet:', err);
            this.handleError('Error disconnecting wallet');
        }
    }

    clearSession() {
        this.token = null;
        this.publicKey = null;
        sessionStorage.removeItem('user_token');
        sessionStorage.removeItem('wallet-autoconnect');
        
        if (this.disconnectTimer) {
            clearTimeout(this.disconnectTimer);
            this.disconnectTimer = null;
        }
    }

    addWalletButton() {
        const buttonContainer = document.querySelector('.wallet-button-container');
        if (!buttonContainer) return;
        
        const connectButton = document.createElement('button');
        connectButton.className = 'wallet-button';
        this.updateButtonText(connectButton);
        
        connectButton.onclick = async () => {
            if (!this.publicKey) {
                await this.connectWallet();
            } else {
                await this.disconnectWallet();
            }
        };
    
        buttonContainer.innerHTML = '';
        buttonContainer.appendChild(connectButton);
    
        this.provider.removeAllListeners('connect');
        this.provider.removeAllListeners('disconnect');
    
        this.provider.on('connect', (publicKey) => {
            if (publicKey) {
                this.publicKey = publicKey.toString();
                this.updateWalletButton();
                this.startDisconnectTimer();
                window.dispatchEvent(new Event('wallet-connected'));
            }
        });
    
        this.provider.on('disconnect', () => {
            this.clearSession();
            this.updateWalletButton();
            window.dispatchEvent(new Event('wallet-disconnected'));
        });
    }

    addPhantomInstallButton() {
        const buttonContainer = document.querySelector('.wallet-button-container');
        if (!buttonContainer) return;
        
        const installButton = document.createElement('button');
        installButton.className = 'wallet-button';
        installButton.textContent = 'Install Phantom Wallet';
        installButton.onclick = () => {
            window.open('https://phantom.app/', '_blank');
        };
    
        buttonContainer.innerHTML = '';
        buttonContainer.appendChild(installButton);
    }

    updateWalletButton() {
        const button = document.querySelector('.wallet-button');
        if (button) {
            this.updateButtonText(button);
        }
    }

    updateButtonText(button) {
        if (this.publicKey) {
            const address = `${this.publicKey.slice(0, 4)}...${this.publicKey.slice(-4)}`;
            button.textContent = `Connected: ${address}`;
        } else {
            button.textContent = 'Connect Wallet';
        }
    }

    handleError(message) {
        if (typeof displayError === 'function') {
            displayError(DOMPurify.sanitize(message));
        } else {
            console.error(message);
        }
    }
}

// Initialiser le gestionnaire de wallet au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    window.walletManager = new SolanaWalletManager();
});