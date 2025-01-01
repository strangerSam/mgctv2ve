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
            const resp = await this.provider.connect();
            this.publicKey = resp.publicKey.toString();
            localStorage.setItem('wallet-autoconnect', 'true');
            this.updateWalletButton();
            this.startDisconnectTimer();
            
            // S'assurer que l'événement est émis après que tout est configuré
            window.dispatchEvent(new Event('wallet-connected'));
            
            await checkMovieStatus();
            
            return true;
        } catch (err) {
            console.error('Error connecting to wallet:', err);
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
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'wallet-button-container';
        
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

        buttonContainer.appendChild(connectButton);
        document.querySelector('.nav-links').appendChild(buttonContainer);
    }

    addPhantomInstallButton() {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'wallet-button-container';
        
        const installButton = document.createElement('button');
        installButton.className = 'wallet-button';
        installButton.innerHTML = 'Install Phantom Wallet';
        installButton.onclick = () => {
            window.open('https://phantom.app/', '_blank');
        };

        buttonContainer.appendChild(installButton);
        document.querySelector('.nav-links').appendChild(buttonContainer);
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