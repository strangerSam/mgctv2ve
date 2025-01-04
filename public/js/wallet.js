class SolanaWalletManager {
    constructor() {
        this.provider = null;
        this.publicKey = null;
        this.disconnectTimer = null;
        this.DISCONNECT_TIMEOUT = 10 * 60 * 1000; // 10 minutes en millisecondes
        this.init();
    }

    async init() {
        if (typeof window.solana !== 'undefined') {
            this.provider = window.solana;
            console.log('Phantom wallet found!');
            
            try {
                // Vérifier si le wallet est déjà connecté à la page
                const isPhantomConnected = this.provider.isConnected && this.provider.publicKey;
                const autoConnectAllowed = localStorage.getItem('wallet-autoconnect') === 'true';
                
                if (isPhantomConnected && autoConnectAllowed) {
                    // Si le wallet est déjà connecté, récupérer directement la clé publique
                    this.publicKey = this.provider.publicKey.toString();
                    this.updateWalletButton();
                    this.startDisconnectTimer();
                    window.dispatchEvent(new Event('wallet-connected'));
                } else if (autoConnectAllowed) {
                    // Sinon, essayer de se connecter automatiquement
                    try {
                        const resp = await this.provider.connect({ onlyIfTrusted: true });
                        this.publicKey = resp.publicKey.toString();
                        this.updateWalletButton();
                        this.startDisconnectTimer();
                        window.dispatchEvent(new Event('wallet-connected'));
                    } catch (error) {
                        console.log('Auto-connection failed, user needs to connect manually');
                        localStorage.removeItem('wallet-autoconnect');
                    }
                }
    
                this.addWalletButton();
                this.setupActivityListeners();
                
            } catch (err) {
                console.log('Connection check failed:', err);
                localStorage.removeItem('wallet-autoconnect');
            }
        } else {
            console.log('Phantom wallet not found!');
            this.addPhantomInstallButton();
        }
    }

    setupActivityListeners() {
        // Liste des événements à surveiller pour réinitialiser le timer
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
            // Informer le serveur de la tentative de connexion
            const response = await fetch('https://mgctv2ve-backend.onrender.com/api/wallet-connect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
    
            if (response.status === 429) {
                // Code 429 = Too Many Requests
                throw new Error('Too many connection attempts. Please try again later.');
            }
    
            const resp = await this.provider.connect();
            this.publicKey = resp.publicKey.toString();
            localStorage.setItem('wallet-autoconnect', 'true');
            this.updateWalletButton();
            this.startDisconnectTimer();
            
            window.dispatchEvent(new Event('wallet-connected'));
            await checkMovieStatus();
            
            return true;
        } catch (err) {
            console.error('Error connecting to wallet:', err);
            
            // Afficher un message d'erreur à l'utilisateur
            const errorMessage = err.message === 'Too many connection attempts. Please try again later.' 
                ? err.message 
                : 'Error connecting to wallet';
                
            // Utilisez votre fonction displayError existante
            if (typeof displayError === 'function') {
                displayError(errorMessage);
            } else {
                alert(errorMessage);
            }
            
            return false;
        }
    }

    async disconnectWallet() {
        try {
            await this.provider.disconnect();
            this.publicKey = null;
            localStorage.removeItem('wallet-autoconnect');
            this.updateWalletButton();
            
            if (this.disconnectTimer) {
                clearTimeout(this.disconnectTimer);
                this.disconnectTimer = null;
            }
            
            window.dispatchEvent(new Event('wallet-disconnected'));
        } catch (err) {
            console.error('Error disconnecting wallet:', err);
        }
    }

    addWalletButton() {
        // Chercher le conteneur existant dans le hero-content
        const buttonContainer = document.querySelector('.wallet-button-container');
        if (!buttonContainer) return;
        
        const connectButton = document.createElement('button');
        connectButton.className = 'wallet-button';
        connectButton.innerHTML = this.publicKey 
            ? `Connected: ${this.publicKey.slice(0, 4)}...${this.publicKey.slice(-4)}`
            : 'Connect Wallet';
        
        connectButton.onclick = async () => {
            if (!this.publicKey) {
                await this.connectWallet();
            } else {
                await this.disconnectWallet();
            }
        };
    
        // Nettoyer et ajouter le bouton dans le conteneur existant
        buttonContainer.innerHTML = '';
        buttonContainer.appendChild(connectButton);
    
        // Supprimer les anciens écouteurs s'ils existent
        this.provider.removeAllListeners('connect');
        this.provider.removeAllListeners('disconnect');
    
        // Ajouter les nouveaux écouteurs
        this.provider.on('connect', (publicKey) => {
            if (publicKey) {
                this.publicKey = publicKey.toString();
                this.updateWalletButton();
                this.startDisconnectTimer();
                window.dispatchEvent(new Event('wallet-connected'));
            }
        });
    
        this.provider.on('disconnect', () => {
            this.publicKey = null;
            this.updateWalletButton();
            if (this.disconnectTimer) {
                clearTimeout(this.disconnectTimer);
                this.disconnectTimer = null;
            }
            window.dispatchEvent(new Event('wallet-disconnected'));
        });
    }

    addPhantomInstallButton() {
        // Chercher le conteneur existant au lieu d'en créer un nouveau
        const buttonContainer = document.querySelector('.wallet-button-container');
        if (!buttonContainer) return;
        
        const installButton = document.createElement('button');
        installButton.className = 'wallet-button';
        installButton.innerHTML = 'Install Phantom Wallet';
        installButton.onclick = () => {
            window.open('https://phantom.app/', '_blank');
        };
    
        // Nettoyer et ajouter le bouton dans le conteneur existant
        buttonContainer.innerHTML = '';
        buttonContainer.appendChild(installButton);
    }

    updateWalletButton() {
        const button = document.querySelector('.wallet-button');
        if (button) {
            button.innerHTML = this.publicKey 
                ? `Connected: ${this.publicKey.slice(0, 4)}...${this.publicKey.slice(-4)}`
                : 'Connect Wallet';
        }
    }
}

// Initialiser le gestionnaire de wallet au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    window.walletManager = new SolanaWalletManager();
});